// The lessons table, and the background job that builds one.
import { newId } from '../auth/accounts.ts';
import type { AI } from '../ai/types.ts';
import { speaks } from '../ai/voices.ts';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import type { Files } from '../files.ts';
import { TODAY, type Budget } from '../guard/guard.ts';
import { buildLesson, grounded } from './agent.ts';
import { makeVideo } from './video.ts';
import { drawPictures } from './pictures.ts';
import type { Item, Lesson, Setup } from './types.ts';

const J = (v: unknown) => JSON.stringify(v);

export class Lessons {
  constructor(private sql: Sql) {}

  async create(teacherId: string, setup: Setup, source: string, k: { areaId: string; request: string; refs: unknown[] }): Promise<string> {
    const id = newId(10);
    await this.sql.query(`insert into lessons (id, teacher_id, status, setup, source, steps, area_id, request, refs) values ($1, $2, 'working', $3::jsonb, $4, $5::jsonb, $6, $7, $8::jsonb)`,
      [id, teacherId, J(setup), source, J([{ at: new Date().toISOString(), vi: 'Trợ lý bắt đầu đọc phần bài trong sách…', en: 'The agent is reading the section of your book…' }]), k.areaId, k.request, J(k.refs)]);
    return id;
  }
  get(teacherId: string, id: string) { return this.sql.one<Lesson>('select * from lessons where id = $1 and teacher_id = $2', [id, teacherId]); }
  list(teacherId: string) {
    // with where it was given: "assigned" while any assignment is open, "done" once all are past due, else a draft
    return this.sql.query<Pick<Lesson, 'id' | 'status' | 'setup' | 'created_at'> & { slides: number; items: number; cards: number; video: boolean; example: string | null; classes: { id: string; name: string }[]; open: boolean; given: boolean }>(
      `select l.id, l.status, l.setup, l.created_at, l.video_status = 'ready' as video, jsonb_array_length(l.slides) as slides, jsonb_array_length(l.items) as items, jsonb_array_length(l.cards) as cards,
         (select x->>'example' from jsonb_array_elements(l.slides) x where coalesce(x->>'example', '') <> '' limit 1) as example,
         coalesce((select json_agg(distinct jsonb_build_object('id', k.id, 'name', k.name)) from assignments a join classes k on k.id = a.class_id where a.lesson_id = l.id and a.removed_at is null), '[]') as classes,
         exists (select 1 from assignments a where a.lesson_id = l.id and a.removed_at is null and (a.due is null or a.due >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)) as open,
         exists (select 1 from assignments a where a.lesson_id = l.id and a.removed_at is null) as given
       from lessons l where l.teacher_id = $1 order by l.created_at desc limit 100`, [teacherId]);
  }
  // lessons that could not be made do not use up the day's lessons
  async madeToday(teacherId: string) {
    return Number((await this.sql.one<{ n: string }>(`select count(*) as n from lessons where teacher_id = $1 and created_at >= ${TODAY} and status <> 'error'`, [teacherId]))?.n || 0);
  }
  async step(id: string, vi: string, en: string) {
    await this.sql.query(`update lessons set steps = steps || $2::jsonb, updated_at = now() where id = $1`, [id, J([{ at: new Date().toISOString(), vi, en }])]);
  }
  async finish(id: string, b: Pick<Lesson, 'skills' | 'slides' | 'items' | 'cards' | 'rejected' | 'agent'>) {
    await this.sql.query(`update lessons set status = 'ready', skills = $2::jsonb, slides = $3::jsonb, items = $4::jsonb, cards = $5::jsonb, rejected = $6::jsonb, agent = $7::jsonb, updated_at = now() where id = $1`,
      [id, J(b.skills), J(b.slides), J(b.items), J(b.cards), J(b.rejected), J(b.agent)]);
  }
  async picturesPending(id: string, on: boolean) {
    await this.sql.query('update lessons set pictures_pending = $2, updated_at = now() where id = $1', [id, on]);
  }
  // One slide's picture, set inside the database so a concurrent change to another slide is never lost.
  async setSlideImage(id: string, slideId: string, url: string) {
    await this.sql.query(`update lessons set slides = (select coalesce(jsonb_agg(case when s->>'id' = $2 then s || jsonb_build_object('image', $3::text) else s end order by o), '[]'::jsonb)
      from jsonb_array_elements(slides) with ordinality as t(s, o)), updated_at = now() where id = $1`, [id, slideId, url]);
  }
  async fail(id: string) {
    await this.sql.query(`update lessons set status = 'error', error = 'failed', updated_at = now() where id = $1`, [id]);
  }
}

// Builds the lesson in the background; the teacher's page polls and shows the agent's steps live.
// The page each slide comes from: the passage that contains (most of) its source quote.
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').match(/[a-z0-9]+/g) || [];
export function pageOf(quote: string, passages: { page: number; text: string }[]): number | undefined {
  const q = fold(quote);
  if (!q.length) return undefined;
  let best: [number | undefined, number] = [undefined, 0];
  for (const p of passages) { const w = new Set(fold(p.text)), hit = q.filter((x) => w.has(x)).length / q.length; if (hit > best[1]) best = [p.page, hit]; }
  return best[1] >= 0.8 ? best[0] : undefined;
}

// The page each item comes from (Chi: every item carries its source page): the passage that shares the
// most words and numbers with it, else the section's first page (the section is its only source).
export function itemPage(it: Item, passages: { page: number; text: string }[]): number | undefined {
  if (!passages.length) return undefined;
  const x = it as Item & { story?: string; sentence?: string; say?: string; words?: string[]; pairs?: { word: string }[] };
  const words = fold([x.prompt, x.story, x.sentence, x.say, (x.words || []).join(' '), (x.pairs || []).map((p) => p.word).join(' '), x.explain].filter(Boolean).join(' '));
  let best: [number, number] = [passages[0].page, 0];
  for (const p of passages) { const w = new Set(fold(p.text)), hit = words.filter((x) => w.has(x)).length; if (hit > best[1]) best = [p.page, hit]; }
  return best[0];
}

export async function runLesson(ai: AI, lessons: Lessons, id: string, setup: Setup, source: string, pics?: { files: Files; budget: Budget; teacherId: string; held?: boolean; passages?: { page: number; text: string }[]; sql?: Sql ; onReady?: () => void}) {
  try {
    const b = await buildLesson(ai, setup, source, (vi, en) => lessons.step(id, vi, en));
    if (pics?.passages) for (const s of b.slides) { const p = pageOf(s.source, pics.passages); if (p) s.page = p; }
    if (pics?.passages) for (const it of b.items) it.page = itemPage(it, pics.passages);
    // a teaching slide whose words are not in the book section is left out, while enough slides remain
    // (the opening slide on the child's own mistakes comes from her work, not the book: it stays, Chi #46)
    const loose = b.slides.filter((s) => !['title', 'summary'].includes(s.kind) && !s.fromWork && !grounded(s.source, source));
    if (loose.length && b.slides.length - loose.length >= 5) {
      b.slides = b.slides.filter((s) => !loose.includes(s));
      b.agent.changes.push(...loose.map((s) => `${s.id}: left out, its words are not in the book section`));
    }
    await lessons.step(id, 'Xong! Cô xem bài giảng và ghi chú của trợ lý nhé. Hình minh họa đang được vẽ thêm.', 'Done! Have a look at the lesson and the agent\'s note. Pictures are on their way.');
    if (setup.make && !setup.make.cards) b.cards = [];   // she asked for no flashcards
    await lessons.finish(id, b);
    pics?.onReady?.();   // the lesson is there: her next job may start while pictures and the video follow
    if (pics) await drawPictures(ai, lessons, pics.files, pics.budget, id, pics.teacherId, b.slides, pics.held);
    // the video, made after the pictures (local voices, free) unless she asked for none
    if (pics?.sql && config.autoVideo && setup.make?.video !== false && speaks(setup.lang)) {
      const l = await pics.sql.one<Lesson>('select * from lessons where id = $1', [id]);
      if (l && l.status === 'ready') { await pics.sql.query(`update lessons set video_status = 'working:0' where id = $1`, [id]); await makeVideo({ sql: pics.sql, ai, files: pics.files }, l, { subtitles: true, voice: 0 }); }
    }
  } catch (e) {
    // the teacher sees a plain message; details stay in the server log
    console.error(`[lesson] ${id} failed: ${String((e as Error)?.stack || e).slice(0, 1500)}`);
    await lessons.step(id, 'Chưa soạn được bài này. Cô thử lại sau ít phút nhé.', 'This lesson could not be made. Please try again in a few minutes.').catch(() => {});
    await lessons.fail(id);
  } finally { pics?.onReady?.(); }
}

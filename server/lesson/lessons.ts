// The lessons table, and the background job that builds one.
import { newId } from '../auth/accounts.ts';
import type { AI } from '../ai/types.ts';
import type { Sql } from '../db/sql.ts';
import type { Files } from '../files.ts';
import type { Budget } from '../guard/guard.ts';
import { buildLesson } from './agent.ts';
import { drawPictures } from './pictures.ts';
import type { Lesson, Setup } from './types.ts';

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
    return this.sql.query<Pick<Lesson, 'id' | 'status' | 'setup' | 'created_at'> & { slides: number; items: number }>(
      `select id, status, setup, created_at, jsonb_array_length(slides) as slides, jsonb_array_length(items) as items from lessons where teacher_id = $1 order by created_at desc limit 100`, [teacherId]);
  }
  async madeToday(teacherId: string) {
    return Number((await this.sql.one<{ n: string }>(`select count(*) as n from lessons where teacher_id = $1 and created_at >= date_trunc('day', now())`, [teacherId]))?.n || 0);
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

export async function runLesson(ai: AI, lessons: Lessons, id: string, setup: Setup, source: string, pics?: { files: Files; budget: Budget; teacherId: string; passages?: { page: number; text: string }[] }) {
  try {
    const b = await buildLesson(ai, setup, source, (vi, en) => lessons.step(id, vi, en));
    if (pics?.passages) for (const s of b.slides) { const p = pageOf(s.source, pics.passages); if (p) s.page = p; }
    await lessons.step(id, 'Xong! Cô xem bài giảng và ghi chú của trợ lý nhé. Hình minh họa đang được vẽ thêm.', 'Done! Have a look at the lesson and the agent\'s note. Pictures are on their way.');
    await lessons.finish(id, b);
    if (pics) await drawPictures(ai, lessons, pics.files, pics.budget, id, pics.teacherId, b.slides);
  } catch (e) {
    // the teacher sees a plain message; details stay in the server log
    console.error(`[lesson] ${id} failed: ${String((e as Error)?.stack || e).slice(0, 1500)}`);
    await lessons.step(id, 'Chưa soạn được bài này. Cô thử lại sau ít phút nhé.', 'This lesson could not be made. Please try again in a few minutes.').catch(() => {});
    await lessons.fail(id);
  }
}

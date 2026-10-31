// The assigner's changes after the agent (Chi's steps 3 and 5):
//   slides  Viết lại slide này (a fresh version from the book section), Đơn giản hơn, Thêm slide
//   items   Sửa (her own numbers or words, rebuilt and checked by code like every item),
//           Tạo câu tương tự (one more of the same kind), + Thêm mẫu (a kind of item the lesson lacks)
// Every AI change goes through the guard and her credits; every item, hers or the AI's, passes the
// code checks before it is kept. Lessons already assigned keep their own copy.
import type { Context, Hono } from 'hono';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import type { Sql } from '../db/sql.ts';
import { Blocked, type Budget, requireOnTask } from '../guard/guard.ts';
import { fail } from '../http.ts';
import { simplify } from './agent.ts';
import { buildEnglish, buildMath, checkItem, contextOf, type RawEnglish, type RawMath } from './items.ts';
import { markSlide } from './slide-check.ts';
import type { Item, Lesson, Slide } from './types.ts';
import type { Files } from '../files.ts';
import { makeVideo } from './video.ts';
import { writeItems, writeSlides } from './writer.ts';

const J = (x: unknown) => JSON.stringify(x);
// The worked steps for a two-digit sum or difference, by code (for an item whose numbers she changed).
export function explainMath(a: number, op: string, b: number, lang: 'vi' | 'en'): string {
  const vi = lang === 'vi', ua = a % 10, ub = b % 10, ta = Math.floor(a / 10), tb = Math.floor(b / 10);
  if (op === '+') {
    const u = ua + ub, c = u >= 10 ? 1 : 0, r = a + b;
    return vi ? `${ua} + ${ub} = ${u}${c ? `, viết ${u % 10} nhớ 1` : `, viết ${u}`}; ${ta} + ${tb}${c ? ' + 1' : ''} = ${ta + tb + c}. Vậy ${a} + ${b} = ${r}.`
      : `${ua} + ${ub} = ${u}${c ? `: write ${u % 10}, carry 1` : `: write ${u}`}; ${ta} + ${tb}${c ? ' + 1' : ''} = ${ta + tb + c}. So ${a} + ${b} = ${r}.`;
  }
  if (op === '-') {
    const borrow = ua < ub, r = a - b;
    return vi ? `${borrow ? `${ua} không trừ được ${ub}, mượn 1 chục: ${ua + 10} − ${ub} = ${ua + 10 - ub}` : `${ua} − ${ub} = ${ua - ub}`}; ${ta}${borrow ? ' − 1' : ''} − ${tb} = ${ta - (borrow ? 1 : 0) - tb}. Vậy ${a} − ${b} = ${r}.`
      : `${borrow ? `${ua} is smaller than ${ub}, take 1 ten: ${ua + 10} − ${ub} = ${ua + 10 - ub}` : `${ua} − ${ub} = ${ua - ub}`}; ${ta}${borrow ? ' − 1' : ''} − ${tb} = ${ta - (borrow ? 1 : 0) - tb}. So ${a} − ${b} = ${r}.`;
  }
  return `${a} ${op} ${b}`;
}
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const MATH_T = ['mcq', 'fill', 'truefalse', 'word'], ENG_T = ['match', 'fill', 'listen', 'order'];

export function editRoutes(app: Hono<Env>, d: { sql: Sql; ai: AI; budget: Budget; files: Files; as: <T>(teacherId: string, fn: () => T, lessonId?: string) => T }) {
  const { sql } = d;
  const mine = async (c: Context<Env>) => {
    const l = await sql.one<Lesson>('select * from lessons where id = $1 and teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
    return l && l.status === 'ready' ? l : null;
  };
  const gate = async (c: Context<Env>) => { const b = await d.budget.check(c.get('teacher').id); return b ? fail(c, b === 'total' ? 'credit' : b === 'credits' ? 'credits' : 'budget', 429) : null; };
  const aiFail = (c: Context<Env>, e: unknown) => (e instanceof Blocked ? (e.busy ? fail(c, 'aiBusy', 503) : fail(c, 'aiBlocked')) : fail(c, 'aiBusy', 503));
  const saveSlides = (id: string, slides: Slide[]) => sql.query('update lessons set slides = $2::jsonb, updated_at = now() where id = $1', [id, J(slides)]);
  const saveItems = (id: string, items: Item[]) => sql.query('update lessons set items = $2::jsonb, updated_at = now() where id = $1', [id, J(items)]);
  // what she changed by hand (#19: the pilot numbers in the admin view)
  const logEdit = (c: Context<Env>, lessonId: string, kind: 'item_edit' | 'item_add' | 'slide_rewrite' | 'slide_add') =>
    sql.query('insert into lesson_edits (teacher_id, lesson_id, kind) values ($1, $2, $3)', [c.get('teacher').id, lessonId, kind]).catch(() => {});
  const newSlideId = (slides: Slide[]) => { let n = slides.length + 1; while (slides.some((s) => s.id === `sl${String(n).padStart(2, '0')}`)) n++; return `sl${String(n).padStart(2, '0')}`; };
  const newItemId = (items: Item[]) => { let n = items.length + 1; return () => { while (items.some((i) => i.id === `ex${String(n).padStart(2, '0')}`)) n++; return `ex${String(n++).padStart(2, '0')}`; }; };

  // Viết lại / Đơn giản hơn: the slide keeps its id, kind, picture and page
  app.post('/api/t/lessons/:id/slides/:sid/rewrite', async (c) => {
    const l = await mine(c), s = l?.slides.find((x) => x.id === c.req.param('sid'));
    if (!l || !s) return fail(c, 'notFound', 404);
    const how = (await c.req.json<{ how?: string }>().catch(() => ({} as { how?: string }))).how === 'simpler' ? 'simpler' : 'rewrite';
    const g = await gate(c); if (g) return g;
    try {
      const fresh = await d.as(c.get('teacher').id, async () => how === 'simpler'
        ? simplify(d.ai, l.setup, s, 'the assigner asked for a simpler slide')
        : (await writeSlides(d.ai, l.setup, l.source, [{ kind: s.kind, heading: s.heading }]))[0], l.id);
      if (!fresh) return fail(c, 'aiBusy', 503);
      // her new version is checked like the agent's: a right one clears the old mark, a wrong one reads "Kiểm tra lại" (Chi, 31 Oct)
      const slide: Slide = markSlide({ ...s, heading: fresh.heading || s.heading, bullets: fresh.bullets?.length ? fresh.bullets : s.bullets, example: fresh.example ?? s.example, notes: fresh.notes || s.notes, narration: fresh.narration || s.narration, source: fresh.source || s.source });
      await saveSlides(l.id, l.slides.map((x) => (x.id === s.id ? slide : x)));
      await logEdit(c, l.id, 'slide_rewrite');
      return c.json({ slide });
    } catch (e) { return aiFail(c, e); }
  });

  // Thêm slide: one more slide from the same book section, after the one she is on (her topic optional)
  app.post('/api/t/lessons/:id/slides', async (c) => {
    const l = await mine(c);
    if (!l) return fail(c, 'notFound', 404);
    if (l.slides.length >= 20) return fail(c, 'tooMany', 429);
    const b = await c.req.json<{ after?: string; topic?: string }>().catch(() => ({} as { after?: string; topic?: string }));
    const topic = clip(b.topic, 120), at = Math.max(0, l.slides.findIndex((x) => x.id === b.after)) + 1;
    const g = await gate(c); if (g) return g;
    try {
      const s = await d.as(c.get('teacher').id, async () => {
        if (topic) await requireOnTask(d.ai, topic);
        return (await writeSlides(d.ai, l.setup, l.source, [{ kind: 'teach', heading: topic || (l.setup.lang === 'en' ? 'One more step, from the book section' : 'Thêm một ý, từ phần bài trong sách') }]))[0];
      }, l.id);
      if (!s) return fail(c, 'aiBusy', 503);
      const slide: Slide = markSlide({ ...s, id: newSlideId(l.slides), page: l.slides.find((x) => x.page)?.page });
      const slides = [...l.slides.slice(0, at), slide, ...l.slides.slice(at)];
      await saveSlides(l.id, slides);
      await logEdit(c, l.id, 'slide_add');
      return c.json({ slide, slides });
    } catch (e) { return aiFail(c, e); }
  });

  // Sửa: her own version of an item, rebuilt by code (maths answers are always worked out) and checked
  app.put('/api/t/lessons/:id/items/:item', async (c) => {
    const l = await mine(c), it = l?.items.find((x) => x.id === c.req.param('item'));
    if (!l || !it) return fail(c, 'notFound', 404);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    let next: Item;
    if (it.subject === 'math') {
      const n = (k: string, v: number) => (Number.isFinite(Number(b[k])) && String(b[k]).trim() !== '' ? Math.trunc(Number(b[k])) : v);
      const raw: RawMath = { template: it.template, skill: it.skill, level: it.level, a: n('a', it.a), op: it.op, b: n('b', it.b), blank: it.blank, shown: it.template === 'truefalse' ? n('shown', it.shown ?? 0) : undefined,
        distractors: Array.isArray(b.distractors) ? (b.distractors as unknown[]).map(Number).filter(Number.isFinite) : it.distractors, story: b.story !== undefined ? clip(b.story, 400) : it.story, unit: b.unit !== undefined ? clip(b.unit, 40) : it.unit, explain: b.explain !== undefined ? clip(b.explain, 300) : it.explain };
      // new numbers with the old explanation: the explanation is written again by code
      if ((raw.a !== it.a || raw.b !== it.b) && (raw.explain === it.explain || !raw.explain)) raw.explain = explainMath(raw.a, raw.op, raw.b, l.setup.lang);
      next = buildMath(raw, it.id, l.setup.lang);
    } else {
      const s = (k: string, v?: string) => (b[k] !== undefined ? clip(b[k], 300) : v);
      const list = (k: string, v?: string[]) => (Array.isArray(b[k]) ? (b[k] as unknown[]).map((x) => clip(x, 60)).filter(Boolean) : v);
      const raw: RawEnglish = { template: it.template, skill: it.skill, level: it.level, prompt: s('prompt', it.prompt)!, sentence: s('sentence', it.sentence), say: s('say', it.say), options: list('options', it.options), words: list('words', it.words), answer: s('answer', it.answer), explain: s('explain', it.explain), pairs: it.pairs };
      next = buildEnglish(raw, it.id);
    }
    next.page = it.page;
    const issues = checkItem(next, { ...contextOf(l.setup, l.skills, l.source), items: l.items });
    if (issues.length) return c.json({ code: 'itemCheck', error: issues.map((i) => i.msg).join('; '), errorEn: issues.map((i) => i.msg).join('; '), issues }, 400);
    await saveItems(l.id, l.items.map((x) => (x.id === it.id ? next : x)));
    await logEdit(c, l.id, 'item_edit');
    return c.json({ item: next });
  });

  // Bước 4 · Video: made in the background (local voices: no credits); "Tạo lại video" makes it again
  app.post('/api/t/lessons/:id/video', async (c) => {
    const l = await mine(c);
    if (!l) return fail(c, 'notFound', 404);
    if (String((l as Lesson & { video_status?: string }).video_status || '').startsWith('working')) return c.json({ ok: true });
    const b = await c.req.json<{ subtitles?: boolean; voice?: number; speed?: number }>().catch(() => ({} as { subtitles?: boolean; voice?: number; speed?: number }));
    await sql.query(`update lessons set video_status = 'working:0', updated_at = now() where id = $1`, [l.id]);
    void makeVideo({ sql, ai: d.ai, files: d.files }, l, { subtitles: b.subtitles !== false, voice: [0, 1, 2].includes(Number(b.voice)) ? Number(b.voice) : 0, speed: [0.85, 1, 1.15].includes(Number(b.speed)) ? Number(b.speed) : 1 });
    return c.json({ ok: true });
  });

  // Tạo câu tương tự / + Thêm mẫu: written by the AI, kept only if code passes it
  const more = async (c: Context<Env>, l: Lesson, req: { skill: string; template: string; level: Item['level']; count: number; after?: string }) => {
    const g = await gate(c); if (g) return g;
    try {
      const r = await d.as(c.get('teacher').id, () => writeItems(d.ai, l.setup, l.source, l.skills, req, newItemId(l.items), l.items), l.id);
      if (!r.kept.length) return c.json({ code: 'itemCheck', error: 'Chưa viết được câu đạt kiểm tra, cô thử lại nhé.', errorEn: 'No item passed the checks; please try again.' }, 400);
      const page = l.items.find((x) => x.skill === req.skill && x.page)?.page ?? (l.refs?.[0] as { pageFrom?: number } | undefined)?.pageFrom;
      for (const it of r.kept) it.page = page;
      const at = req.after ? l.items.findIndex((x) => x.id === req.after) + 1 : l.items.length;
      const items = [...l.items.slice(0, at), ...r.kept, ...l.items.slice(at)];
      await saveItems(l.id, items);
      await logEdit(c, l.id, 'item_add');
      return c.json({ items, added: r.kept, rejected: r.rejected.length });
    } catch (e) { return aiFail(c, e); }
  };
  app.post('/api/t/lessons/:id/items/:item/similar', async (c) => {
    const l = await mine(c), it = l?.items.find((x) => x.id === c.req.param('item'));
    if (!l || !it) return fail(c, 'notFound', 404);
    if (l.items.length >= 40) return fail(c, 'tooMany', 429);
    return more(c, l, { skill: it.skill, template: it.template, level: it.level, count: 1, after: it.id });
  });
  app.post('/api/t/lessons/:id/items', async (c) => {
    const l = await mine(c);
    if (!l) return fail(c, 'notFound', 404);
    if (l.items.length >= 40) return fail(c, 'tooMany', 429);
    const b = await c.req.json<{ skill?: string; template?: string; level?: string }>().catch(() => ({} as Record<string, never>));
    const template = String(b.template), level = (['basic', 'good', 'advanced'].includes(String(b.level)) ? b.level : 'good') as Item['level'];
    if (!(l.setup.subject === 'math' ? MATH_T : ENG_T).includes(template) || !l.skills.some((k) => k.tag === b.skill)) return fail(c, 'bad');
    return more(c, l, { skill: String(b.skill), template, level, count: 2 });
  });
}

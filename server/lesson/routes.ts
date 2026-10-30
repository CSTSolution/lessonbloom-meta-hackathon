// Making a lesson: notes by typing, photos or voice -> the setup (pre-filled) -> the agent builds it.
// Every AI step passes the guard's gate first: sign-in, input caps, the teacher's daily lesson
// limit, the money check (teacher cap, app budget, kill switch) and the pre-check of all her text.
import type { Context, Hono } from 'hono';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { holdCredits, settleHold, spare } from '../credits.ts';
import { Blocked, type Budget, credits, Limiter, requireOnTask } from '../guard/guard.ts';
import { fail } from '../http.ts';
import type { Files } from '../files.ts';
import { CutoutError, cutOut, cleanName, decodePhoto } from './cutout.ts';
import { Lessons, runLesson } from './lessons.ts';
import type { Jobs } from '../jobs.ts';
import { illustrate } from './pictures.ts';
import { spoken as spokenText } from './video.ts';
import { areaOf, sectionOf } from '../knowledge/routes.ts';
import { citation, sourceOf } from '../knowledge/search.ts';
import type { Setup } from './types.ts';
import { cleanSetup, intake, NotLesson, readPhotos, readWork } from './writer.ts';

const MAX_NOTES = 20000, MAX_PHOTOS = 5, MAX_PHOTO = 4e6, MAX_AUDIO = 10e6;
const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;.*)?$/;
const lessonsPerDay = (kind: string) => (kind === 'demo' ? config.guard.lessonsDemoDay : config.guard.lessonsDay);

export function lessonRoutes(app: Hono<Env>, d: { sql: Sql; ai: AI; budget: Budget; files: Files; as: <T>(teacherId: string, fn: () => T, lessonId?: string) => T; held: <T>(teacherId: string, hold: { used: number }, fn: () => T, bookId?: string, lessonId?: string) => T; jobs: Jobs }) {
  const lessons = new Lessons(d.sql);
  const perTeacher = new Limiter(10, 200);           // AI requests per teacher (per minute, per day)

  // Layer 1 in one place; the answer is a refusal to send back, or null to go on.
  const gate = async (c: Context<Env>) => {
    const t = c.get('teacher');
    if (!perTeacher.take(t.id)) return fail(c, 'aiBusy', 429);
    const b = await d.budget.check(t.id);
    return b ? fail(c, b === 'total' ? 'credit' : b === 'credits' ? 'credits' : 'budget', 429) : null;
  };
  const aiError = (c: Context<Env>, e: unknown) => {
    if (e instanceof NotLesson) return fail(c, 'notLesson');
    if (e instanceof Blocked) return e.busy ? fail(c, 'aiBusy', 503) : fail(c, 'aiBlocked');
    throw e;
  };

  app.post('/api/t/notes/photos', async (c) => {
    const b = await c.req.json<{ images?: { data?: string; type?: string }[] }>().catch(() => ({ images: undefined }));
    if (!Array.isArray(b.images) || !b.images.length || b.images.length > MAX_PHOTOS) return fail(c, 'photos');
    const images: { data: Buffer; mime: string }[] = [];
    for (const x of b.images) {
      const mime = String(x?.type || ''), data = Buffer.from(String(x?.data || ''), 'base64');
      if (!/^image\/(jpeg|png|webp)$/.test(mime) || data.length < 100 || data.length > MAX_PHOTO) return fail(c, 'photos');
      images.push({ data, mime });
    }
    const g = await gate(c); if (g) return g;
    try { return c.json({ text: await d.as(c.get('teacher').id, () => readPhotos(d.ai, images)) }); } catch (e) { return aiError(c, e); }
  });

  // A photo of the child's finished exercise: the kind of exercise and the mistakes (same photo limits).
  app.post('/api/t/notes/work', async (c) => {
    const b = await c.req.json<{ images?: { data?: string; type?: string }[] }>().catch(() => ({ images: undefined }));
    if (!Array.isArray(b.images) || !b.images.length || b.images.length > MAX_PHOTOS) return fail(c, 'photos');
    const images: { data: Buffer; mime: string }[] = [];
    for (const x of b.images) {
      const mime = String(x?.type || ''), data = Buffer.from(String(x?.data || ''), 'base64');
      if (!/^image\/(jpeg|png|webp)$/.test(mime) || data.length < 100 || data.length > MAX_PHOTO) return fail(c, 'photos');
      images.push({ data, mime });
    }
    const g = await gate(c); if (g) return g;
    try { return c.json(await d.as(c.get('teacher').id, () => readWork(d.ai, images))); } catch (e) { return aiError(c, e); }
  });

  // The recording comes as the raw request body (audio/webm from the browser's recorder).
  app.post('/api/t/notes/voice', async (c) => {
    const type = c.req.header('content-type') || '';
    if (!AUDIO.test(type) || Number(c.req.header('content-length') || 0) > MAX_AUDIO) return fail(c, 'voice', 413);
    const audio = Buffer.from(await c.req.arrayBuffer());
    if (audio.length < 1000 || audio.length > MAX_AUDIO) return fail(c, 'voice', 413);
    const g = await gate(c); if (g) return g;
    try { return c.json({ text: (await d.as(c.get('teacher').id, () => d.ai.transcribe({ audio, mime: type.split(';')[0], lang: c.get('teacher').lang }))).slice(0, MAX_NOTES) }); } catch (e) { return aiError(c, e); }
  });

  // The setup, pre-filled from the matched section of her book (subject and grade come from the area).
  app.post('/api/t/intake', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ areaId?: string; sectionId?: string }>().catch(() => ({} as { areaId?: string; sectionId?: string }));
    const a = await areaOf(d.sql, t.id, String(b.areaId || '')), m = a && await sectionOf(d.sql, t.id, a.id, String(b.sectionId || ''));
    if (!a || !m) return fail(c, 'notFound', 404);
    const g = await gate(c); if (g) return g;
    const source = sourceOf(m);
    try {
      const setup = await d.as(t.id, async () => { await requireOnTask(d.ai, source); return intake(d.ai, source, t.lang); });
      return c.json({ setup: { ...setup, subject: a.subject, grade: a.grade }, citation: citation(m, t.lang) });
    } catch (e) { return aiError(c, e); }
  });

  // A lesson always comes from one section of one knowledge area: that section is its only source.
  app.post('/api/t/lessons', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ areaId?: string; sectionId?: string; request?: string; setup?: unknown }>().catch(() => ({} as { areaId?: string; sectionId?: string; request?: string; setup?: unknown }));
    const a = await areaOf(d.sql, t.id, String(b.areaId || '')), m = a && await sectionOf(d.sql, t.id, a.id, String(b.sectionId || ''));
    if (!a || !m) return fail(c, 'notFound', 404);
    const setup0 = cleanSetup(b.setup), request = String(b.request ?? '').trim().slice(0, 2000);
    if (!setup0) return fail(c, 'setup');
    // her request steers the lesson inside the section (Chi: only what the material points to); the section stays the only source
    const ask = request && request.toLowerCase() !== m.section.title.toLowerCase() && request.length > m.section.title.length + 10 ? request.slice(0, 200) : '';
    const setup = { ...setup0, subject: a.subject, grade: a.grade as Setup['grade'], ...(ask && !(setup0.note || '').includes(ask) ? { note: [setup0.note, `${setup0.lang === 'en' ? 'Focus' : 'Tập trung'}: ${ask}`].filter(Boolean).join('; ').slice(0, 400) } : {}) };
    if (await lessons.madeToday(t.id) >= lessonsPerDay(t.kind)) return fail(c, 'lessonLimit', 429);
    const g = await gate(c); if (g) return g;
    const cr = await spare(d.sql, t.id);
    // short only because credit is held for work still running: say so (it comes back when that is done)
    if (cr.left < config.guard.lessonCredits) return fail(c, cr.promised && cr.left + cr.promised >= config.guard.lessonCredits ? 'creditsHeld' : 'credits', 429);
    const source = sourceOf(m);
    // everything that reaches a prompt is classified: the section, her request, title, objectives, wishes
    try { await d.as(t.id, () => requireOnTask(d.ai, [source, request, setup.title, ...setup.objectives, setup.note || ''].join('\n\n'))); } catch (e) { return aiError(c, e); }
    const refs = [{ areaId: a.id, sectionId: m.section.id, bookId: m.section.bookId, book: m.section.book, title: m.section.title, pageFrom: m.section.pageFrom, pageTo: m.section.pageTo, vi: citation(m, 'vi'), en: citation(m, 'en') }];
    const id = await lessons.create(t.id, setup, source, { areaId: a.id, request, refs });
    // a lesson holds its credits up front, pictures included (Son, 30 Oct); what it does not use comes back
    // when it is all done (pictures and video too). One job at a time per account: it waits in her line.
    const need = config.guard.lessonCredits, hold = { used: 0 };
    await holdCredits(d.sql, t.id, need, id);
    const settle = () => settleHold(d.sql, t.id, id, hold.used).catch((e) => console.error(`[lesson] ${id} settle: ${(e as Error).message}`));
    await d.jobs.add(t.id, 'lesson', id, setup.title,
      async () => {
        // when its turn comes the app must still have its budget, or it stops here
        const b = await d.budget.check(t.id);
        if (b && b !== 'credits') { await lessons.step(id, 'Ứng dụng đang tạm dừng soạn bài. Cô thử lại sau nhé; lượt đã giữ được trả lại.', 'Making lessons is paused for now. Please try again later; the held credits came back.'); await lessons.fail(id); await settle(); return; }
        await new Promise<void>((ready) => {
          void d.held(t.id, hold, () => runLesson(d.ai, lessons, id, setup, source, { files: d.files, budget: d.budget, teacherId: t.id, held: true, passages: m.passages, sql: d.sql, onReady: ready }), undefined, id).finally(settle);
        });
      },
      async () => { await d.sql.query(`delete from lessons where id = $1 and teacher_id = $2 and status = 'working'`, [id, t.id]); await settle(); }, need);
    return c.json({ id });
  });

  // One slide's picture: drawn again with Muse Image, or cut out of the assigner's own photo with SAM 3.1.
  const slideOf = async (c: Context<Env>) => {
    const l = await lessons.get(c.get('teacher').id, c.req.param('id') ?? '');
    const s = l?.status === 'ready' ? l.slides.find((x) => x.id === c.req.param('sid')) : undefined;
    return l && s ? { l, s } : null;
  };
  app.post('/api/t/lessons/:id/slides/:sid/picture', async (c) => {
    const f = await slideOf(c); if (!f) return fail(c, 'notFound', 404);
    const g = await gate(c); if (g) return g;
    try {
      const img = await d.as(c.get('teacher').id, () => illustrate(d.ai, f.s, '(a different composition)'), f.l.id);
      if (!img) return fail(c, 'pictureFailed', 503);
      const url = await d.files.put(f.l.id, img[0] === 0x89 ? 'png' : 'jpg', img);
      await lessons.setSlideImage(f.l.id, f.s.id, url);
      return c.json({ slide: { ...f.s, image: url } });
    } catch (e) { return aiError(c, e); }
  });
  app.post('/api/t/lessons/:id/slides/:sid/cutout', async (c) => {
    const f = await slideOf(c); if (!f) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ photo?: string; name?: string }>().catch(() => ({} as { photo?: string; name?: string }));
    const photo = Buffer.from(String(b.photo || '').slice(0, 6e6), 'base64');
    try { cleanName(b.name); decodePhoto(photo); } catch (e) { if (e instanceof CutoutError) return fail(c, e.code); throw e; }
    const g = await gate(c); if (g) return g;
    try {
      const cut = await d.as(c.get('teacher').id, () => cutOut(d.ai, photo, String(b.name)), f.l.id);
      const url = await d.files.put(f.l.id, 'png', cut.png);
      await lessons.setSlideImage(f.l.id, f.s.id, url);
      return c.json({ slide: { ...f.s, image: url }, matches: cut.matches });
    } catch (e) { if (e instanceof CutoutError) return fail(c, e.code); return aiError(c, e); }
  });

  app.get('/api/t/lessons', async (c) => c.json({ lessons: await lessons.list(c.get('teacher').id) }));
  // Step 5: the assigner removes an item she does not want (assignments keep their own copy).
  app.delete('/api/t/lessons/:id/items/:item', async (c) => {
    const l = await lessons.get(c.get('teacher').id, c.req.param('id'));
    if (!l) return fail(c, 'notFound', 404);
    await d.sql.query(`update lessons set items = coalesce((select jsonb_agg(x) from jsonb_array_elements(items) x where x->>'id' <> $2), '[]'::jsonb), updated_at = now() where id = $1`, [l.id, c.req.param('item')]);
    await d.sql.query(`insert into lesson_edits (teacher_id, lesson_id, kind) values ($1, $2, 'item_remove')`, [c.get('teacher').id, l.id]).catch(() => {});
    return c.json({ ok: true });
  });
  // Step 4: one slide's narration, read by the server's local voice (free, nothing goes to Meta).
  const spoken = new Map<string, Buffer>();
  app.get('/api/t/lessons/:id/say/:sid', async (c) => {
    const l = await lessons.get(c.get('teacher').id, c.req.param('id')), s = l?.slides.find((x) => x.id === c.req.param('sid'));
    const text = s && l ? spokenText(s, l.setup.lang) : '';
    if (!l || !text) return fail(c, 'notFound', 404);
    const key = `${l.setup.lang}:${text}`;
    let wav = spoken.get(key);
    if (!wav) { try { wav = await d.ai.speak({ text, lang: l.setup.lang }); } catch { return fail(c, 'aiBusy', 503); } if (spoken.size > 300) spoken.clear(); spoken.set(key, wav); }
    return c.body(new Uint8Array(wav), 200, { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=86400' });
  });
  app.get('/api/t/lessons/:id', async (c) => {
    const l = await lessons.get(c.get('teacher').id, c.req.param('id'));
    if (!l) return fail(c, 'notFound', 404);
    const { teacher_id: _t, ...rest } = l;
    const u = await d.sql.one<{ usd: string }>('select coalesce(sum(usd), 0) as usd from ai_usage where lesson_id = $1', [l.id]);
    // while it waits in her line: its place (1 = running now)
    const queue = l.status === 'working' ? await d.jobs.placeOf(c.get('teacher').id, l.id) : null;
    return c.json({ lesson: { ...rest, credits: credits(Number(u?.usd)), queue: queue && queue.status === 'queued' ? { place: queue.place } : null } });
  });
}

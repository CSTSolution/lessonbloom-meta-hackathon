// Making a lesson: notes by typing, photos or voice -> the setup (pre-filled) -> the agent builds it.
// Every AI step passes the guard's gate first: sign-in, input caps, the teacher's daily lesson
// limit, the money check (teacher cap, app budget, kill switch) and the pre-check of all her text.
import type { Context, Hono } from 'hono';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import { speaks } from '../ai/voices.ts';
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
import { citation, pagesLabel, printedRange, sourceOf, shownPages } from '../knowledge/search.ts';
import type { Setup } from './types.ts';
import { cleanSetup, intake, NotLesson, readPhotos, readWork, WorkUnread } from './writer.ts';
import { forPrompt, titled, typeWork, type Work } from './work.ts';

const MAX_NOTES = 20000, MAX_PHOTOS = 5, MAX_PHOTO = 4e6, MAX_AUDIO = 10e6;
const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;.*)?$/;
// Chi #46: a sheet that cannot be read is said so plainly, never made into an ordinary lesson
const UNREAD = { code: 'workUnread', error: 'Máy chưa đọc được bài của con: ảnh mờ, bị cắt, hoặc chưa có dấu chấm đúng/sai. Cô chụp lại thẳng, đủ sáng, cả trang, sau khi đã chấm bài nhé.', errorEn: "The work could not be read: the photo is blurry or cut off, or nothing is marked right or wrong yet. Take it again straight on, in good light, the whole page, after marking it." };
const lessonsPerDay = (kind: string) => (kind === 'demo' ? config.guard.lessonsDemoDay : config.guard.lessonsDay);

// a lesson from the child's work is narrow too (Chi #60): its focus is the kinds of mistake, not the whole part
const rawWorkOf = (setup: unknown) => { const w = setup && typeof setup === 'object' ? (setup as { work?: { questions?: unknown[] } }).work : undefined; return !!(w && Array.isArray(w.questions) && w.questions.length); };

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
    try { return c.json(await d.as(c.get('teacher').id, () => readWork(d.ai, images))); }
    catch (e) { if (e instanceof WorkUnread) return c.json(UNREAD, 422); return aiError(c, e); }
  });
  // The table as the assigner corrected it, typed again by code (no AI, nothing spent): the right answers,
  // right or wrong, the kinds of mistake (Chi #46: handwriting is misread now and then, she fixes it first).
  app.post('/api/t/notes/work/check', async (c) => {
    const b = await c.req.json<{ work?: unknown }>().catch(() => ({} as { work?: unknown }));
    const w = (b.work && typeof b.work === 'object' ? b.work : {}) as Partial<Work>;
    return c.json({ work: typeWork(b.work, { date: w.date, topic: w.topic, subject: w.subject }) });
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

  // "Only what you gave" (Chi #60): the part's passages on the pages her material was found on (places in the file),
  // and the part's range shown as those pages. A range outside the part, or with no text, keeps the whole part.
  type Part = NonNullable<Awaited<ReturnType<typeof sectionOf>>>;
  // pages: the ticked pages (Son, 2 Nov: always asked, the matched pages ticked, she unticks what she does not want), or a range
  const narrowed = async (m: Part, pages: unknown): Promise<Part & { narrow?: boolean }> => {
    const p = pages as { from?: unknown; to?: unknown } | undefined, from = Math.round(Number(p?.from)), to = Math.round(Number(p?.to));
    const want = Array.isArray(pages) ? new Set(pages.slice(0, 400).map((x) => Math.round(Number(x))).filter((x) => x >= 1)) : from >= 1 && to >= from ? new Set(Array.from({ length: Math.min(400, to - from + 1) }, (_, k) => from + k)) : null;
    if (!want?.size) return m;
    const file = new Map((await d.sql.query<{ id: string; page: number }>('select id, page from passages where section_id = $1', [m.section.id])).map((x) => [x.id, Number(x.page)]));
    const keep = m.passages.filter((x) => want.has(file.get(x.id) ?? 0));
    if (!keep.length || keep.length === m.passages.length) return m;
    const fs = keep.map((x) => file.get(x.id)!), lo = Math.min(...fs), hi = Math.max(...fs);
    return { ...m, passages: keep, section: { ...m.section, pageFrom: lo, pageTo: hi, ...printedRange(await shownPages(d.sql, m.section.bookId), lo, hi) }, narrow: true };
  };

  // The setup, pre-filled from the matched section of her book (subject and grade come from the area).
  app.post('/api/t/intake', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ areaId?: string; sectionId?: string; pages?: unknown }>().catch(() => ({} as { areaId?: string; sectionId?: string; pages?: unknown }));
    const a = await areaOf(d.sql, t.id, String(b.areaId || '')), m0 = a && await sectionOf(d.sql, t.id, a.id, String(b.sectionId || '')), m = m0 && await narrowed(m0, b.pages);
    if (!a || !m) return fail(c, 'notFound', 404);
    // too few credits for the lesson itself: this step spends nothing either (Chi #30)
    if ((await spare(d.sql, t.id)).left < config.guard.lessonCredits) return fail(c, 'credits', 429);
    const g = await gate(c); if (g) return g;
    const source = sourceOf(m);
    try {
      const setup = await d.as(t.id, async () => { await requireOnTask(d.ai, source); return intake(d.ai, source, t.lang); });
      return c.json({ setup: { ...setup, subject: a.subject, grade: a.grade }, citation: citation(m, t.lang) });
    } catch (e) { return aiError(c, e); }
  });

  // A lesson always comes from one section of one knowledge area: that section is its only source.
  app.post('/api/t/lessons', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ areaId?: string; sectionId?: string; request?: string; setup?: unknown; pages?: unknown }>().catch(() => ({} as { areaId?: string; sectionId?: string; request?: string; setup?: unknown; pages?: unknown }));
    const a = await areaOf(d.sql, t.id, String(b.areaId || '')), m0 = a && await sectionOf(d.sql, t.id, a.id, String(b.sectionId || ''));
    if (!a || !m0) return fail(c, 'notFound', 404);
    const m = await narrowed(m0, b.pages), narrow = !!m.narrow;
    const setup0 = cleanSetup(b.setup), request = String(b.request ?? '').trim().slice(0, 2000);
    if (!setup0) return fail(c, 'setup');
    // her request steers the lesson inside the section (Chi: only what the material points to); the section stays the only
    // source. "Only what you gave" (Chi #60): it is the lesson's required focus, whatever its length
    const ask = request && request.toLowerCase() !== m.section.title.toLowerCase() && (narrow || request.length > m.section.title.length + 10) ? request.slice(0, 200) : '';
    const focusWord = setup0.lang === 'en' ? (narrow ? 'Focus (the whole lesson is about this only)' : 'Focus') : (narrow ? 'Trọng tâm (cả bài chỉ về điều này)' : 'Tập trung');
    const setup1 = { ...setup0, subject: a.subject, grade: a.grade as Setup['grade'], scope: (narrow || rawWorkOf(b.setup) ? 'narrow' : 'part') as Setup['scope'], ...(t.role === 'parent' ? { forParent: true } : {}), ...(ask && !(setup0.note || '').includes(ask) ? { note: [setup0.note, `${focusWord}: ${ask}`].filter(Boolean).join('; ').slice(0, 400) } : {}) };
    // Chi #46: made from the child's work: typed again by code, her name taken from her own record (never the
    // browser's word), and the title says who it is for. Prompts get forPrompt(setup): no name, no "Made for".
    const rawWork = (b.setup && typeof b.setup === 'object' ? (b.setup as { work?: Partial<Work> }).work : undefined);
    let setup: Setup = setup1;
    if (rawWork && typeof rawWork === 'object') {
      const kid = rawWork.pupilId ? await d.sql.one<{ id: string; name: string }>('select p.id, p.name from pupils p join classes k on k.id = p.class_id where p.id = $1 and k.teacher_id = $2', [String(rawWork.pupilId), t.id]) : null;
      const rec = kid && rawWork.recordId ? await d.sql.one<{ id: string }>('select id from work_records where id = $1 and pupil_id = $2', [String(rawWork.recordId), kid.id]) : null;
      const w = typeWork(rawWork, { date: rawWork.date, topic: rawWork.topic, subject: rawWork.subject, ...(kid ? { pupilId: kid.id, child: kid.name } : {}), ...(rec ? { recordId: rec.id } : {}) });
      if (w.total) setup = { ...setup1, title: titled(setup1.title, w, setup1.lang, t.role === 'parent'), work: { ...w, base: setup1.title } };
    }
    if (await lessons.madeToday(t.id) >= lessonsPerDay(t.kind)) return fail(c, 'lessonLimit', 429);
    const g = await gate(c); if (g) return g;
    const cr = await spare(d.sql, t.id);
    // short only because credit is held for work still running: say so (it comes back when that is done)
    if (cr.left < config.guard.lessonCredits) return fail(c, cr.promised && cr.left + cr.promised >= config.guard.lessonCredits ? 'creditsHeld' : 'credits', 429);
    const source = sourceOf(m);
    // everything that reaches a prompt is classified: the section, her request, title, objectives, wishes
    const ai = forPrompt(setup);
    try { await d.as(t.id, () => requireOnTask(d.ai, [source, request, ai.title, ...ai.objectives, ai.note || '', ...(ai.work?.questions || []).map((q) => `${q.q} ${q.child}`)].join('\n\n'))); } catch (e) { return aiError(c, e); }
    const refs = [{ areaId: a.id, sectionId: m.section.id, bookId: m.section.bookId, book: m.section.book, title: m.section.title, pageFrom: m.section.pageFrom, pageTo: m.section.pageTo, vi: citation(m, 'vi'), en: citation(m, 'en') }];
    const id = await lessons.create(t.id, setup, source, { areaId: a.id, request, refs });
    // a lesson holds its credits up front, pictures included (Son, 30 Oct); what it does not use comes back
    // when it is all done (pictures and video too). One job at a time per account: it waits in her line.
    const need = config.guard.lessonCredits, hold = { used: 0 };
    await holdCredits(d.sql, t.id, need, id);
    // a lesson that could not be made charges nothing: all its hold comes back (Chi #55: 8 credits gone for "Chưa soạn được bài này")
    const settle = (failed = false) => settleHold(d.sql, t.id, id, failed ? 0 : hold.used).catch((e) => console.error(`[lesson] ${id} settle: ${(e as Error).message}`));
    // each slide's and item's page is stored as the place in the file (the lesson page shows it as printed): sectionOf
    // gives printed pages, shown once more there ("tr. 20" on a part of pages 10–14, Chi #55)
    const filePage = new Map((await d.sql.query<{ id: string; page: number }>('select id, page from passages where section_id = $1', [m.section.id])).map((p) => [p.id, Number(p.page)]));
    const passages = m.passages.map((p) => ({ ...p, page: filePage.get(p.id) ?? p.page }));
    await d.jobs.add(t.id, 'lesson', id, setup.title,
      async () => {
        // when its turn comes the app must still have its budget, or it stops here
        const b = await d.budget.check(t.id);
        if (b && b !== 'credits') { await lessons.step(id, 'Ứng dụng đang tạm dừng soạn bài. Cô thử lại sau nhé; lượt đã giữ được trả lại.', 'Making lessons is paused for now. Please try again later; the held credits came back.'); await lessons.fail(id); await settle(); return; }
        await new Promise<void>((ready) => {
          void d.held(t.id, hold, () => runLesson(d.ai, lessons, id, ai, source, { files: d.files, budget: d.budget, teacherId: t.id, held: true, passages, sql: d.sql, onReady: ready }), undefined, id).then((made) => settle(!made), () => settle());
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
    if (!wav && !speaks(l.setup.lang)) return fail(c, 'voiceOff', 503);   // the page reads it with the browser's own voice
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
    // each slide's and item's page as printed in the paper book, like Knowledge and the citation (Chi #53: "tr. 11"
    // on a slide for a part shown as pages 10–14); stored as the place in the file, which View source uses
    const bookId = (l.refs?.[0] as { bookId?: string } | undefined)?.bookId, shown = bookId ? await shownPages(d.sql, bookId) : null;
    if (shown) { rest.slides = l.slides.map((s) => (s.page ? { ...s, page: shown(s.page) ?? s.page } : s)); rest.items = l.items.map((it) => (it.page ? { ...it, page: shown(it.page) ?? it.page } : it));
      // the citation too, written when the lesson was made: "p. 3" stayed while slides showed 2 (live test, 1 Nov)
      rest.refs = (l.refs ?? []).map((r) => { const pr = printedRange(shown, r.pageFrom, r.pageTo); if (pr.printedFrom == null) return r; const pg = pagesLabel({ pageFrom: r.pageFrom, pageTo: r.pageTo, ...pr }); return { ...r, vi: r.vi.replace(/(tr\.|p\.)\s*[\d–-]+$/, `$1 ${pg}`), en: r.en.replace(/(tr\.|p\.)\s*[\d–-]+$/, `$1 ${pg}`) }; });
    }
    return c.json({ lesson: { ...rest, credits: credits(Number(u?.usd)), voiced: speaks(l.setup.lang), queue: queue && queue.status === 'queued' ? { place: queue.place } : null } });
  });
}

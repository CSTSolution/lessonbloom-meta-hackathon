// The knowledge area: an assigner's own books (PDF), private to her. Upload, see the contents, open a
// book at a page, and find the section a lesson should come from.
import type { Context, Hono } from 'hono';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import { newId } from '../auth/accounts.ts';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { Blocked, type Budget, guardedJson, requireOnTask } from '../guard/guard.ts';
import type { JobCtl, Jobs } from '../jobs.ts';
import { creditState } from '../credits.ts';
import { OCR_SCHEMA, SCAN_SYSTEM } from '../lesson/prompts.ts';
import { fail, MSG } from '../http.ts';
import { ingestBook, ingestPages, NotText } from './ingest.ts';
import type { PdfPage } from './pdf.ts';
import { citation, findSection, NoMatch, sourceOf } from './search.ts';

export const LIMITS = { areas: 10, booksPerArea: 6, pdfBytes: 30e6 };   // 30 MB a file (Chi, 29 Oct); the browser checks it before sending
export interface Area { id: string; teacher_id: string; name: string; subject: 'math' | 'english'; grade: number }

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const bookFile = (id: string) => join(config.dataDir, 'books', `${id}.pdf`);
// not enough credit: the message, and the numbers the page shows (what is short, how many pages fit)
const short = (c: Context, est: ReturnType<typeof scanEstimate>) => c.json({ code: 'scanCredits', error: MSG.scanCredits.vi, errorEn: MSG.scanCredits.en, estimate: est }, 402);
const scanDir = (id: string) => join(config.dataDir, 'scan', id);

// Reading a scanned book costs credits: the estimate she sees before anything runs, and what she must
// have (Son: 50% more than the estimate, since a page can cost more than expected).
export function scanEstimate(pages: number, have: number) {
  const per = config.scan.pageCredits, predicted = Math.ceil(pages * per), need = Math.ceil(predicted * config.scan.margin);
  const fits = Math.max(0, Math.min(pages, Math.floor(have / (per * config.scan.margin))));
  return { pages, perPage: per, predicted, need, have, enough: have >= need, fits, maxPages: config.scan.maxPages };
}

export async function areaOf(sql: Sql, teacherId: string, id: string) {
  return sql.one<Area>('select * from areas where id = $1 and teacher_id = $2', [id, teacherId]);
}
// A section of one of her ready books, with its passages in order (the lesson's only source).
export async function sectionOf(sql: Sql, teacherId: string, areaId: string, sectionId: string) {
  const s = await sql.one<{ id: string; title: string; book: string; book_id: string; page_from: number; page_to: number }>(
    `select s.id, s.title, b.title as book, b.id as book_id, s.page_from, s.page_to from sections s join books b on b.id = s.book_id join areas a on a.id = b.area_id
     where s.id = $1 and a.id = $2 and a.teacher_id = $3 and b.status = 'ready' and s.title <> '—'`, [sectionId, areaId, teacherId]);
  if (!s) return null;
  const passages = await sql.query<{ id: string; page: number; text: string }>('select id, page, text from passages where section_id = $1 order by ord', [s.id]);
  return { section: { id: s.id, title: s.title, book: s.book, bookId: s.book_id, pageFrom: s.page_from, pageTo: s.page_to }, passages };
}

export function knowledgeRoutes(app: Hono<Env>, d: { sql: Sql; ai: AI; budget: Budget; as: <T>(teacherId: string, fn: () => T, lessonId?: string) => T ; held: <T>(teacherId: string, hold: { used: number }, fn: () => T) => T; jobs: Jobs }) {
  const { sql } = d;

  app.get('/api/t/areas', async (c) => {
    const rows = await sql.query(`select a.id, a.name, a.subject, a.grade,
        coalesce(json_agg(json_build_object('id', b.id, 'title', b.title, 'status', b.status, 'pages', b.pages, 'error', b.error,
          'sections', (select count(*) from sections s where s.book_id = b.id and s.title <> '—')) order by b.created_at) filter (where b.id is not null), '[]') as books
      from areas a left join books b on b.area_id = a.id where a.teacher_id = $1 group by a.id order by a.created_at`, [c.get('teacher').id]);
    return c.json({ areas: rows });
  });

  app.post('/api/t/areas', async (c) => {
    const b = await c.req.json<{ name?: string; subject?: string; grade?: number }>().catch(() => ({} as { name?: string; subject?: string; grade?: number }));
    const name = clip(b.name, 80), grade = Math.round(Number(b.grade));
    if (!name || (b.subject !== 'math' && b.subject !== 'english') || !(grade >= 1 && grade <= 5)) return fail(c, 'bad');
    if (Number((await sql.one<{ n: string }>('select count(*) as n from areas where teacher_id = $1', [c.get('teacher').id]))?.n) >= LIMITS.areas) return fail(c, 'limitReached', 429);
    const id = newId(10);
    await sql.query('insert into areas (id, teacher_id, name, subject, grade) values ($1, $2, $3, $4, $5)', [id, c.get('teacher').id, name, b.subject, grade]);
    return c.json({ area: { id, name, subject: b.subject, grade, books: [] } });
  });

  app.get('/api/t/areas/:id', async (c) => {
    const a = await areaOf(sql, c.get('teacher').id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const sections = await sql.query(`select s.id, s.book_id, s.title, s.page_from, s.page_to,
        (select count(*) from lessons l where l.refs->0->>'sectionId' = s.id)::int as lessons
      from sections s join books b on b.id = s.book_id where b.area_id = $1 and s.title <> '—' order by b.created_at, s.ord`, [a.id]);
    const books = await sql.query('select id, title, status, pages, error from books where area_id = $1 order by created_at', [a.id]);
    return c.json({ area: { id: a.id, name: a.name, subject: a.subject, grade: a.grade }, books, sections });
  });

  // The PDF arrives as the raw body. It is kept privately (opened only by its owner) and read in the background.
  app.post('/api/t/areas/:id/books', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    if (!/^application\/pdf/.test(c.req.header('content-type') || '') || Number(c.req.header('content-length') || 0) > LIMITS.pdfBytes) return fail(c, 'pdf', 413);
    const pdf = Buffer.from(await c.req.arrayBuffer());
    if (pdf.length < 200 || pdf.length > LIMITS.pdfBytes || pdf.toString('latin1', 0, 5) !== '%PDF-') return fail(c, 'pdf', 413);
    if (Number((await sql.one<{ n: string }>('select count(*) as n from books where area_id = $1', [a.id]))?.n) >= LIMITS.booksPerArea) return fail(c, 'limitReached', 429);
    const id = newId(10), title = clip(c.req.query('title'), 120) || 'Sách';
    await mkdir(join(config.dataDir, 'books'), { recursive: true });
    await writeFile(bookFile(id), pdf);
    await sql.query(`insert into books (id, area_id, title, status) values ($1, $2, $3, 'processing')`, [id, a.id, title]);
    await d.jobs.add(t.id, 'book', id, title, () => d.as(t.id, () => readBook(id, () => ingestBook(sql, d.ai, a.id, id, pdf))), () => dropBook(id));
    return c.json({ book: { id, title, status: 'processing' } });
  });

  // A book's reading, with its failure written on the book (scanned / blocked / failed).
  const readBook = async (id: string, work: () => Promise<unknown>) => {
    try { await work(); } catch (e) {
      if (!(e instanceof NotText)) console.error(`[book] ${id}: ${String((e as Error)?.stack || e).slice(0, 800)}`);
      await sql.query(`update books set status = 'error', error = $2 where id = $1`, [id, e instanceof NotText ? 'scanned' : e instanceof Blocked ? 'blocked' : 'failed']);
    }
  };
  const dropBook = async (id: string) => { await sql.query('delete from books where id = $1', [id]); await rm(scanDir(id), { recursive: true, force: true }); };
  const bookMine = (c: Context<Env>) => sql.one<{ id: string; area_id: string; title: string; status: string; source: string; pages: number }>(
    'select b.id, b.area_id, b.title, b.status, b.source, b.pages from books b join areas a on a.id = b.area_id where b.id = $1 and a.teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
  const newBook = async (c: Context<Env>, a: Area, title: string, source: 'text' | 'scan', pages: number) => {
    if (Number((await sql.one<{ n: string }>('select count(*) as n from books where area_id = $1', [a.id]))?.n) >= LIMITS.booksPerArea) return null;
    const id = newId(10);
    await sql.query(`insert into books (id, area_id, title, status, source, pages) values ($1, $2, $3, 'processing', $4, $5)`, [id, a.id, clip(title, 120) || 'Sách', source, pages]);
    return id;
  };

  // A big PDF with text: the browser reads the text layer and sends only the text (the file stays with her).
  app.post('/api/t/areas/:id/books/text', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ title?: string; pages?: { page?: number; text?: string }[] }>().catch(() => ({} as { title?: string; pages?: undefined }));
    const pages: PdfPage[] = (Array.isArray(b.pages) ? b.pages : []).slice(0, 400).map((p, i) => ({ page: Math.max(1, Math.round(Number(p?.page)) || i + 1), text: String(p?.text ?? '').normalize('NFC').slice(0, 20000) }));
    if (!pages.some((p) => p.text.replace(/\s/g, '').length >= 20)) return fail(c, 'pdf', 400);
    const id = await newBook(c, a, String(b.title || ''), 'text', pages.length);
    if (!id) return fail(c, 'limitReached', 429);
    await d.jobs.add(t.id, 'book', id, clip(b.title, 120) || 'Sách', () => d.as(t.id, () => readBook(id, () => ingestPages(sql, d.ai, a.id, id, pages))), () => dropBook(id));
    return c.json({ book: { id, status: 'processing' } });
  });

  // ---- a scanned book: estimate, then the page pictures, then the reading (credit held first) ----
  app.post('/api/t/scan/estimate', async (c) => {
    const t = c.get('teacher');
    const b = await c.req.json<{ pages?: number }>().catch(() => ({} as { pages?: number }));
    const n = Math.min(config.scan.maxPages, Math.max(1, Math.round(Number(b.pages)) || 1));
    return c.json({ estimate: scanEstimate(n, (await creditState(sql, t.id)).left) });
  });
  app.post('/api/t/areas/:id/books/scan', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ title?: string; pages?: number[] }>().catch(() => ({} as { title?: string; pages?: undefined }));
    const pages = [...new Set((Array.isArray(b.pages) ? b.pages : []).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 2000))].sort((x, y) => x - y);
    if (!pages.length || pages.length > config.scan.maxPages) return fail(c, 'scanPages', 400);
    const est = scanEstimate(pages.length, (await creditState(sql, t.id)).left);
    if (!est.enough) return short(c, est);
    const id = await newBook(c, a, String(b.title || ''), 'scan', pages.length);
    if (!id) return fail(c, 'limitReached', 429);
    await mkdir(scanDir(id), { recursive: true });
    await writeFile(join(scanDir(id), 'pages.json'), JSON.stringify(pages));
    return c.json({ book: { id, status: 'processing' }, estimate: est });
  });
  // one page picture (JPEG, drawn by the browser from her PDF); kept only until it is read
  app.put('/api/t/books/:id/pages/:n', async (c) => {
    const bk = await bookMine(c);
    if (!bk || bk.source !== 'scan' || bk.status !== 'processing') return fail(c, 'notFound', 404);
    const n = Math.round(Number(c.req.param('n'))), want: number[] = JSON.parse(await readFile(join(scanDir(bk.id), 'pages.json'), 'utf8').catch(() => '[]'));
    if (!want.includes(n)) return fail(c, 'scanPages', 400);
    if (!/^image\/jpeg/.test(c.req.header('content-type') || '') || Number(c.req.header('content-length') || 0) > config.scan.maxImage) return fail(c, 'pageImage', 413);
    const img = Buffer.from(await c.req.arrayBuffer());
    if (img.length < 500 || img.length > config.scan.maxImage || img[0] !== 0xff || img[1] !== 0xd8) return fail(c, 'pageImage', 413);
    await writeFile(join(scanDir(bk.id), `${n}.jpg`), img);
    return c.json({ ok: true });
  });
  // every page is here: hold 1.5x the estimate, then read in her line of jobs; settle at the end
  app.post('/api/t/books/:id/scan/start', async (c) => {
    const t = c.get('teacher'), bk = await bookMine(c);
    if (!bk || bk.source !== 'scan' || bk.status !== 'processing') return fail(c, 'notFound', 404);
    if (await sql.one(`select 1 from jobs where ref = $1 and status in ('queued', 'running')`, [bk.id])) return c.json({ ok: true });
    const dir = scanDir(bk.id), want: number[] = JSON.parse(await readFile(join(dir, 'pages.json'), 'utf8').catch(() => '[]'));
    const have = new Set((await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.jpg')).map((f) => Number(f.slice(0, -4))));
    if (!want.length || want.some((n) => !have.has(n))) return fail(c, 'scanPages', 400);
    const g = await d.budget.check(t.id);
    if (g && g !== 'credits') return fail(c, 'budget', 503);
    const est = scanEstimate(want.length, (await creditState(sql, t.id)).left);
    if (!est.enough) return short(c, est);
    await holdCredits(t.id, est.need, bk.id);
    const hold = { used: 0 };
    await d.jobs.add(t.id, 'book', bk.id, bk.title,
      (job) => d.held(t.id, hold, () => readBook(bk.id, () => readScan(bk.area_id, bk.id, want, est.need, hold, job))).finally(() => settle(t.id, bk.id, est.need, hold)),
      async () => { await settle(t.id, bk.id, est.need, hold); await dropBook(bk.id); }, est.need);
    return c.json({ ok: true, estimate: est });
  });

  // Read the pages three at a time; stop if she asks, or before the cost would go past what is held.
  const readScan = async (areaId: string, bookId: string, want: number[], need: number, hold: { used: number }, job: JobCtl) => {
    const dir = scanDir(bookId), out: PdfPage[] = [], per = config.scan.pageCredits;
    for (let i = 0; i < want.length; i += config.scan.pagesAtOnce) {
      if (job.stopped || hold.used + per * config.scan.margin * config.scan.pagesAtOnce > need) break;
      const batch = want.slice(i, i + config.scan.pagesAtOnce);
      await job.progress(`${i}/${want.length}`);
      const read = await Promise.all(batch.map(async (n) => {
        const data = await readFile(join(dir, `${n}.jpg`));
        const r = await guardedJson<{ usable: boolean; text: string }>(d.ai, { endpoint: 'ocr', system: SCAN_SYSTEM, prompt: 'One page of the book.', images: [{ data, mime: 'image/jpeg' }], schema: OCR_SCHEMA, fixture: { page: n } }).catch(() => ({ usable: false, text: '' }));
        return { page: n, text: r.usable ? String(r.text || '').slice(0, 20000) : '' };
      }));
      out.push(...read);
    }
    await job.progress(`${out.length}/${want.length}`);
    if (!out.some((p) => p.text.trim())) throw new NotText();
    await ingestPages(sql, d.ai, areaId, bookId, out);
    await sql.query('update books set pages = $2 where id = $1', [bookId, out.length]);
  };
  const holdCredits = async (teacherId: string, n: number, ref: string) => {
    await sql.query('update teachers set credits = credits - $2 where id = $1', [teacherId, n]);
    await sql.query(`insert into credit_log (teacher_id, credits, reason, ref) values ($1, $2, 'hold', $3)`, [teacherId, -n, ref]);
  };
  // what was held, less what the reading really cost, goes back (once)
  const settle = async (teacherId: string, bookId: string, need: number, hold: { used: number }) => {
    if (!(await sql.one(`select 1 from credit_log where teacher_id = $1 and reason = 'hold' and ref = $2`, [teacherId, bookId]))) return;
    if (await sql.one(`select 1 from credit_log where teacher_id = $1 and reason = 'refund' and ref = $2`, [teacherId, bookId])) return;
    const back = Math.max(0, need - Math.ceil(hold.used));
    await sql.query('update teachers set credits = credits + $2 where id = $1', [teacherId, back]);
    await sql.query(`insert into credit_log (teacher_id, credits, reason, ref) values ($1, $2, 'refund', $3)`, [teacherId, back, bookId]);
    await rm(scanDir(bookId), { recursive: true, force: true });
  };

  // A sample book written by the LessonBloom team (no copyrighted textbook), so anyone can try it at once.
  const SAMPLES = { toan2: { name: 'Toán 2 (sách mẫu)', subject: 'math', grade: 2, title: 'Toán 2 – Sách mẫu LessonBloom' }, english3: { name: 'English 3 (sample)', subject: 'english', grade: 3, title: 'English 3 – LessonBloom sample book' }, maths2: { name: 'Maths 2 (sample)', subject: 'math', grade: 2, title: 'Maths 2 – LessonBloom sample book' } } as const;
  app.post('/api/t/areas/sample', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ book?: string }>().catch(() => ({} as { book?: string }));
    const key = b.book === 'english3' || b.book === 'maths2' ? b.book : 'toan2', s = SAMPLES[key];
    if (Number((await sql.one<{ n: string }>('select count(*) as n from areas where teacher_id = $1', [t.id]))?.n) >= LIMITS.areas) return fail(c, 'limitReached', 429);
    const pdf = await readFile(new URL(`../../samples/books/${key}.pdf`, import.meta.url));
    const areaId = newId(10), id = newId(10);
    await sql.query('insert into areas (id, teacher_id, name, subject, grade) values ($1, $2, $3, $4, $5)', [areaId, t.id, s.name, s.subject, s.grade]);
    await mkdir(join(config.dataDir, 'books'), { recursive: true });
    await writeFile(bookFile(id), pdf);
    await sql.query(`insert into books (id, area_id, title, status) values ($1, $2, $3, 'processing')`, [id, areaId, s.title]);
    try { await d.as(t.id, () => ingestBook(sql, d.ai, areaId, id, pdf)); } catch (e) {
      console.error(`[book] sample ${id}: ${String((e as Error)?.message).slice(0, 300)}`);
      await sql.query(`update books set status = 'error', error = 'failed' where id = $1`, [id]);
    }
    return c.json({ area: { id: areaId } });
  });

  app.get('/api/t/books/:id/file', async (c) => {
    const ok = await sql.one('select 1 from books b join areas a on a.id = b.area_id where b.id = $1 and a.teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
    if (!ok) return fail(c, 'notFound', 404);
    const data = await readFile(bookFile(c.req.param('id'))).catch(() => null);
    return data ? c.body(new Uint8Array(data), 200, { 'content-type': 'application/pdf', 'cache-control': 'private, max-age=3600' }) : fail(c, 'notFound', 404);
  });

  // ---- the contents: rename, split at a page, merge with the next part; remove a book ----
  const sectionMine = (c: Context<Env>) => sql.one<{ id: string; book_id: string; ord: number; title: string; page_from: number; page_to: number }>(
    `select s.* from sections s join books b on b.id = s.book_id join areas a on a.id = b.area_id where s.id = $1 and a.teacher_id = $2 and s.title <> '—'`, [c.req.param('id'), c.get('teacher').id]);
  app.put('/api/t/sections/:id', async (c) => {
    const s = await sectionMine(c), title = clip((await c.req.json<{ title?: string }>().catch(() => ({} as { title?: string }))).title, 120);
    if (!s) return fail(c, 'notFound', 404);
    if (!title || title === '—') return fail(c, 'bad');
    await sql.query('update sections set title = $2 where id = $1', [s.id, title]);
    return c.json({ ok: true });
  });
  app.post('/api/t/sections/:id/split', async (c) => {
    const s = await sectionMine(c), b = await c.req.json<{ page?: number; title?: string }>().catch(() => ({} as { page?: number; title?: string }));
    const page = Math.round(Number(b.page)), title = clip(b.title, 120);
    if (!s) return fail(c, 'notFound', 404);
    if (!(page > s.page_from && page <= s.page_to) || !title || title === '—') return fail(c, 'split');
    const id = `${s.book_id}-x${newId(6)}`;
    await sql.tx(async (q) => {
      await q.query('update sections set ord = ord + 1 where book_id = $1 and ord > $2', [s.book_id, s.ord]);
      await q.query('insert into sections (id, book_id, ord, title, page_from, page_to) values ($1, $2, $3, $4, $5, $6)', [id, s.book_id, s.ord + 1, title, page, s.page_to]);
      await q.query('update sections set page_to = $2 where id = $1', [s.id, page - 1]);
      await q.query('update passages set section_id = $2 where section_id = $1 and page >= $3', [s.id, id, page]);
    });
    return c.json({ id });
  });
  app.post('/api/t/sections/:id/merge', async (c) => {
    const s = await sectionMine(c);
    if (!s) return fail(c, 'notFound', 404);
    const next = await sql.one<{ id: string; page_to: number }>(`select id, page_to from sections where book_id = $1 and ord > $2 and title <> '—' order by ord limit 1`, [s.book_id, s.ord]);
    if (!next) return fail(c, 'merge');
    await sql.tx(async (q) => {
      await q.query('update passages set section_id = $1 where section_id = $2', [s.id, next.id]);
      await q.query('update sections set page_to = greatest(page_to, $2) where id = $1', [s.id, next.page_to]);
      await q.query('delete from sections where id = $1', [next.id]);
    });
    return c.json({ ok: true });
  });
  app.delete('/api/t/areas/:id', async (c) => {
    const a = await areaOf(sql, c.get('teacher').id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const books = await sql.query<{ id: string }>('select id from books where area_id = $1', [a.id]);
    await sql.query('delete from areas where id = $1', [a.id]);
    const { unlink } = await import('node:fs/promises');
    for (const b of books) await unlink(bookFile(b.id)).catch(() => {});
    return c.json({ ok: true });
  });
  app.delete('/api/t/books/:id', async (c) => {
    const ok = await sql.one('select 1 from books b join areas a on a.id = b.area_id where b.id = $1 and a.teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
    if (!ok) return fail(c, 'notFound', 404);
    await sql.query('delete from books where id = $1', [c.req.param('id')]);
    const { unlink } = await import('node:fs/promises');
    await unlink(bookFile(c.req.param('id'))).catch(() => {});
    return c.json({ ok: true });
  });

  // What should this lesson teach? Her request (typed, read from a photo, or spoken) is matched to one
  // section of her books: hybrid search, Muse Spark re-rank, verified citations.
  app.post('/api/t/areas/:id/match', async (c: Context<Env>) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id') ?? '');
    if (!a) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ request?: string }>().catch(() => ({} as { request?: string }));
    const request = String(b.request ?? '').trim().slice(0, 2000);
    if (request.length < 3) return fail(c, 'requestShort');
    const spent = await d.budget.check(t.id);
    if (spent) return fail(c, spent === 'total' ? 'credit' : spent === 'credits' ? 'credits' : 'budget', 429);
    try {
      const m = await d.as(t.id, async () => { await requireOnTask(d.ai, request); return findSection(sql, d.ai, a.id, request); });
      return c.json({ match: { sectionId: m.section.id, title: m.section.title, book: m.section.book, bookId: m.section.bookId, pageFrom: m.section.pageFrom, pageTo: m.section.pageTo, cited: m.cited,
        citation: citation(m, t.lang), preview: sourceOf(m, 1500) } });
    } catch (e) {
      if (e instanceof NoMatch) return fail(c, 'noMatch', 404);
      if (e instanceof Blocked) return e.busy ? fail(c, 'aiBusy', 503) : fail(c, 'aiBlocked');
      throw e;
    }
  });
}

// The knowledge area: an assigner's own books (PDF), private to her. Upload, see the contents, open a
// book at a page, and find the section a lesson should come from.
import type { Context, Hono } from 'hono';
import { mkdir, stat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import { newId } from '../auth/accounts.ts';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { Blocked, type Budget, guardedJson, requireOnTask } from '../guard/guard.ts';
import type { JobCtl, Jobs } from '../jobs.ts';
import { holdCredits as holdC, settleHold, spare } from '../credits.ts';
import type { Store } from '../storage.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SCAN_SCHEMA, SCAN_SYSTEM } from '../lesson/prompts.ts';
import { fail, MSG } from '../http.ts';
import { ingestBook, ingestPages, NotText } from './ingest.ts';
import { readPdf } from './pdf.ts';
import type { PdfPage } from './pdf.ts';
import { candidates, citation, findSection, NoMatch, printedRange, shownPages, sourceOf } from './search.ts';

// a file's SHA-256 in hex, for a scanned PDF with the pages read (":3-22")
const FINGERPRINT = /^[0-9a-f]{64}(:\d{1,4}-\d{1,4})?$/;
export const LIMITS = { areas: 10, booksPerArea: 6, pdfBytes: 30e6 };   // 30 MB a file (Chi, 29 Oct); the browser checks it before sending
export interface Area { id: string; teacher_id: string; name: string; subject: 'math' | 'english'; grade: number }

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const bookFile = (id: string) => join(config.dataDir, 'books', `${id}.pdf`);
// not enough credit: the message, and the numbers the page shows (what is short, how many pages fit)
const short = (c: Context, est: ReturnType<typeof scanEstimate>) => c.json({ code: 'scanCredits', error: MSG.scanCredits.vi, errorEn: MSG.scanCredits.en, estimate: est }, 402);
const scanDir = (id: string) => join(config.dataDir, 'scan', id);
// as web/src/pdf.ts hasText: five pages spread through the book, most of them with real text, is a text PDF
const textLike = (pages: PdfPage[]) => {
  const n = pages.length, probe = [...new Set([1, Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n])].filter((x) => x >= 1);
  return probe.filter((p) => (pages[p - 1]?.text ?? '').replace(/\s/g, '').length >= 20).length / probe.length > 0.5;
};

// Reading a scanned book costs credits: the estimate she sees before anything runs, and what she must
// have (Son: 50% more than the estimate, since a page can cost more than expected).
export function scanEstimate(pages: number, have: number) {
  const per = config.scan.pageCredits, fixed = config.scan.readCredits, predicted = Math.ceil(pages * per + fixed), need = Math.ceil(predicted * config.scan.margin);
  const fits = Math.max(0, Math.min(pages, Math.floor((have / config.scan.margin - fixed) / per)));
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
  // the lesson cites the page as printed in her book (Chi #45): its source and each slide's or item's page
  // carry the printed number when known; the section keeps its file pages (pageFrom/pageTo)
  const shown = await shownPages(sql, s.book_id);
  return { section: { id: s.id, title: s.title, book: s.book, bookId: s.book_id, pageFrom: s.page_from, pageTo: s.page_to, ...printedRange(shown, s.page_from, s.page_to) },
    passages: passages.map((p) => ({ ...p, page: shown(p.page) ?? p.page })) };
}

const pdftoppm = (args: string[]) => promisify(execFile)('pdftoppm', args, { timeout: 120e3 });
class Unread extends Error { constructor(public why: 'stopped' | 'credits') { super(why); } }

export function knowledgeRoutes(app: Hono<Env>, d: { sql: Sql; ai: AI; budget: Budget; as: <T>(teacherId: string, fn: () => T, lessonId?: string, bookId?: string) => T; held: <T>(teacherId: string, hold: { used: number }, fn: () => T, bookId?: string, lessonId?: string) => T; jobs: Jobs; store?: Store | null }) {
  const { sql } = d;

  app.get('/api/t/areas', async (c) => {
    const rows = await sql.query(`select a.id, a.name, a.subject, a.grade,
        coalesce(json_agg(json_build_object('id', b.id, 'title', b.title, 'status', b.status, 'pages', b.pages, 'error', b.error, 'source', b.source, 'page_one', b.page_one,
          -- printed page numbers read from the book itself; without them she can say where page 1 is (Chi #45)
          'printed', exists (select 1 from passages p where p.book_id = b.id and p.printed is not null),
          'sections', (select count(*) from sections s where s.book_id = b.id and s.title <> '—'),
          -- what its reading cost and gave back, once the hold is settled (Chi #29)
          'used', (select -sum(l.credits) from credit_log l where l.teacher_id = a.teacher_id and l.ref = b.id and l.reason in ('hold', 'refund') having count(*) filter (where l.reason = 'refund') > 0),
          'returned', (select sum(l.credits) from credit_log l where l.teacher_id = a.teacher_id and l.ref = b.id and l.reason = 'refund')) order by b.created_at) filter (where b.id is not null), '[]') as books
      from areas a left join books b on b.area_id = a.id where a.teacher_id = $1 group by a.id order by a.created_at`, [c.get('teacher').id]);
    return c.json({ areas: rows });
  });

  // the same file added before (Chi #44): her newest source with this fingerprint that was not a failed reading
  // Which of her sources fits a child's marked work (Chi #54: "Make a lesson from these mistakes" opened the
  // sample book, numbers to 100, for a sheet to 1000). By code, no AI: a source whose parts reach the sheet's
  // biggest number first ("phạm vi 1000", "within 1000"), then one whose passages match its mistakes.
  app.post('/api/t/areas/best', async (c) => {
    const b = await c.req.json<{ request?: string; sums?: string[]; subject?: string }>().catch(() => ({} as { request?: string; sums?: string[]; subject?: string }));
    const request = clip(b.request, 300), sums = (Array.isArray(b.sums) ? b.sums : []).slice(0, 40).map((x) => clip(x, 60));
    const top = Math.max(0, ...sums.flatMap((x) => (x.match(/\d{1,7}/g) ?? []).map(Number)));
    const areas = await sql.query<{ id: string; subject: string; titles: string[] }>(`select a.id, a.subject, coalesce(array_agg(s.title) filter (where s.title is not null), '{}') as titles from areas a
        join books bk on bk.area_id = a.id and bk.status = 'ready' left join sections s on s.book_id = bk.id where a.teacher_id = $1 group by a.id, a.created_at order by a.created_at desc`, [c.get('teacher').id]);
    const scored = await Promise.all(areas.filter((a) => !b.subject || a.subject === b.subject).map(async (a) => {
      const caps = a.titles.flatMap((t) => [...t.toLowerCase().matchAll(/(?:phạm vi|within|up to|to)\s+(\d{1,3}(?:[ .,]\d{3})+|\d{1,7})(?!\d)/g)].map((m) => Number(m[1].replace(/[ .,]/g, ''))));
      const reach = !top || !caps.length ? 0 : Math.max(...caps) >= top ? 1 : -1;
      const hit = request ? (await candidates(sql, a.id, request, 1))[0]?.score ?? 0 : 0;
      return { id: a.id, reach, hit };
    }));
    scored.sort((x, y) => y.reach - x.reach || y.hit - x.hit);
    return c.json({ areaId: scored[0]?.id ?? null });
  });

  app.post('/api/t/areas/same', async (c) => {
    const b = await c.req.json<{ fingerprint?: string }>().catch(() => ({} as { fingerprint?: string }));
    if (!FINGERPRINT.test(String(b.fingerprint))) return fail(c, 'bad');
    const same = await sql.one(`select a.id, a.name, a.created_at from areas a where a.teacher_id = $1 and a.fingerprint = $2
        and exists (select 1 from books b where b.area_id = a.id and b.status <> 'error') order by a.created_at desc limit 1`, [c.get('teacher').id, b.fingerprint]);
    return c.json({ same: same ?? null });
  });

  app.post('/api/t/areas', async (c) => {
    const b = await c.req.json<{ name?: string; subject?: string; grade?: number; fingerprint?: string }>().catch(() => ({} as { name?: string; subject?: string; grade?: number; fingerprint?: string }));
    const name = clip(b.name, 80), grade = Math.round(Number(b.grade)), fingerprint = FINGERPRINT.test(String(b.fingerprint)) ? b.fingerprint : null;
    if (!name || (b.subject !== 'math' && b.subject !== 'english') || !(grade >= 1 && grade <= 5)) return fail(c, 'bad');
    if (Number((await sql.one<{ n: string }>('select count(*) as n from areas where teacher_id = $1', [c.get('teacher').id]))?.n) >= LIMITS.areas) return fail(c, 'limitReached', 429);
    const id = newId(10);
    await sql.query('insert into areas (id, teacher_id, name, subject, grade, fingerprint) values ($1, $2, $3, $4, $5, $6)', [id, c.get('teacher').id, name, b.subject, grade, fingerprint]);
    return c.json({ area: { id, name, subject: b.subject, grade, books: [] } });
  });

  app.get('/api/t/areas/:id', async (c) => {
    const a = await areaOf(sql, c.get('teacher').id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const sections = await sql.query<{ id: string; book_id: string; page_from: number; page_to: number }>(`select s.id, s.book_id, s.title, s.page_from, s.page_to,
        (select count(*) from lessons l where l.refs->0->>'sectionId' = s.id)::int as lessons
      from sections s join books b on b.id = s.book_id where b.area_id = $1 and s.title <> '—' order by b.created_at, s.ord`, [a.id]);
    const books = await sql.query<{ id: string }>(`select id, title, status, pages, error, source, page_one,
        exists (select 1 from passages p where p.book_id = books.id and p.printed is not null) as printed from books where area_id = $1 order by created_at`, [a.id]);
    // each part's pages as printed in the book, and each page's printed number for "Split from page" (Chi #45)
    const shown = new Map(await Promise.all(books.map(async (b) => [b.id, await shownPages(sql, b.id)] as const)));
    return c.json({ area: { id: a.id, name: a.name, subject: a.subject, grade: a.grade }, books, sections: sections.map((s) => {
      const f = shown.get(s.book_id), r = f ? printedRange(f, s.page_from, s.page_to) : { printedFrom: null, printedTo: null };
      return { ...s, printed_from: r.printedFrom, printed_to: r.printedTo, printed: f ? Array.from({ length: Math.min(400, s.page_to - s.page_from + 1) }, (_, i) => f(s.page_from + i)) : [] };
    }) });
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
    await d.jobs.add(t.id, 'book', id, title, () => d.as(t.id, () => readBook(id, () => ingestBook(sql, d.ai, a.id, id, pdf)), undefined, id), () => dropBook(id));
    return c.json({ book: { id, title, status: 'processing' } });
  });

  // A book's reading, with its failure written on the book (scanned / blocked / failed).
  const readBook = async (id: string, work: () => Promise<unknown>) => {
    try { await work(); } catch (e) {
      if (!(e instanceof NotText) && !(e instanceof Unread)) console.error(`[book] ${id}: ${String((e as Error)?.stack || e).slice(0, 800)}`);
      await sql.query(`update books set status = 'error', error = $2 where id = $1`, [id, e instanceof Unread ? e.why : e instanceof NotText ? 'scanned' : e instanceof Blocked ? 'blocked' : 'failed']);
    }
  };
  // her kept files (R2): deleted with the book
  const dropFiles = async (bookId: string) => {
    if (!d.store) return;
    for (const f of await sql.query<{ key: string }>('select key from book_files where book_id = $1', [bookId])) await d.store.del(f.key).catch((e) => console.warn(`[files] ${f.key}: ${(e as Error).message}`));
    await sql.query('delete from book_files where book_id = $1', [bookId]);
  };
  const dropBook = async (id: string) => { await dropFiles(id); await sql.query('delete from books where id = $1', [id]); await rm(scanDir(id), { recursive: true, force: true }); };
  const usedBytes = async (teacherId: string) => Number((await sql.one<{ n: string }>('select coalesce(sum(bytes), 0) as n from book_files where teacher_id = $1', [teacherId]))?.n ?? 0);
  const fileKey = (teacherId: string, bookId: string, name: string) => `t/${teacherId}/${bookId}/${name}`;
  // the page pictures of a book just read, kept so she can see each original page (within her allowance)
  const keepPages = async (teacherId: string, bookId: string, want: number[]) => {
    if (!d.store) return;
    let room = config.storage.quotaBytes - await usedBytes(teacherId);
    for (const n of want) {
      const data = await readFile(join(scanDir(bookId), `${n}.jpg`)).catch(() => null);
      if (!data || data.length > room) continue;
      const key = fileKey(teacherId, bookId, `p/${n}.jpg`);
      try { await d.store.put(key, data, 'image/jpeg'); } catch (e) { console.warn(`[files] ${key}: ${(e as Error).message}`); continue; }
      await sql.query(`insert into book_files (key, book_id, teacher_id, kind, page, bytes, type) values ($1, $2, $3, 'page', $4, $5, 'image/jpeg') on conflict (key) do update set bytes = excluded.bytes`, [key, bookId, teacherId, n, data.length]);
      room -= data.length;
    }
  };
  const bookMine = (c: Context<Env>) => sql.one<{ id: string; area_id: string; title: string; status: string; source: string; pages: number }>(
    'select b.id, b.area_id, b.title, b.status, b.source, b.pages from books b join areas a on a.id = b.area_id where b.id = $1 and a.teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
  const newBook = async (c: Context<Env>, a: Area, title: string, source: 'text' | 'scan', pages: number) => {
    if (Number((await sql.one<{ n: string }>('select count(*) as n from books where area_id = $1', [a.id]))?.n) >= LIMITS.booksPerArea) return null;
    const id = newId(10);
    await sql.query(`insert into books (id, area_id, title, status, source, pages) values ($1, $2, $3, 'processing', $4, $5)`, [id, a.id, clip(title, 120) || 'Sách', source, pages]);
    return id;
  };

  // #17 (Chi): "Try again" for a book that failed. An uploaded PDF is still on the server, so it is read
  // again in her line of jobs; a book read in the browser kept no file, so she adds it again instead.
  app.post('/api/t/books/:id/retry', async (c) => {
    const t = c.get('teacher'), bk = await bookMine(c);
    if (!bk || bk.status !== 'error') return fail(c, 'notFound', 404);
    const pdf = (bk.source ?? 'pdf') === 'pdf' ? await readFile(bookFile(bk.id)).catch(() => null) : null;
    if (!pdf) return fail(c, 'retryAdd', 400);
    if (!(await sql.one(`select 1 from jobs where ref = $1 and status in ('queued', 'running')`, [bk.id]))) {
      await sql.query('delete from passages where book_id = $1', [bk.id]);
      await sql.query('delete from sections where book_id = $1', [bk.id]);
      await sql.query(`update books set status = 'processing', error = null where id = $1`, [bk.id]);
      await d.jobs.add(t.id, 'book', bk.id, bk.title, () => d.as(t.id, () => readBook(bk.id, () => ingestBook(sql, d.ai, bk.area_id, bk.id, pdf)), undefined, bk.id));
    }
    return c.json({ ok: true });
  });

  // "Đọc lại để tách bài" (Chi #54d, #48): a book read before the splitting knew unnumbered titles is one
  // part. From the text kept with it, free; from its uploaded PDF, free; else its kept page pictures are read
  // again like a scan (the estimate first, credits held). Its old parts go (lessons keep their own copy).
  app.post('/api/t/books/:id/resplit', async (c) => {
    const t = c.get('teacher'), bk = await bookMine(c);
    if (!bk || bk.status !== 'ready') return fail(c, 'notFound', 404);
    if (await sql.one(`select 1 from jobs where ref = $1 and status in ('queued', 'running')`, [bk.id])) return c.json({ ok: true });
    const kept = (await sql.one<{ page_text: PdfPage[] | null }>('select page_text from books where id = $1', [bk.id]))?.page_text;
    const pdf = !kept?.length && (bk.source ?? 'pdf') === 'pdf' ? await readFile(bookFile(bk.id)).catch(() => null) : null;
    const clear = async () => { await sql.query('delete from passages where book_id = $1', [bk.id]); await sql.query('delete from sections where book_id = $1', [bk.id]); await sql.query(`update books set status = 'processing', error = null where id = $1`, [bk.id]); };
    if (kept?.length || pdf) {
      await clear();
      await d.jobs.add(t.id, 'book', bk.id, bk.title, () => d.as(t.id, () => readBook(bk.id, () => (kept?.length ? ingestPages(sql, d.ai, bk.area_id, bk.id, kept) : ingestBook(sql, d.ai, bk.area_id, bk.id, pdf!))), undefined, bk.id));
      return c.json({ ok: true, free: true });
    }
    const pics = d.store ? await sql.query<{ key: string; page: number }>(`select key, page from book_files where book_id = $1 and kind = 'page' order by page`, [bk.id]) : [];
    if (!pics.length) return fail(c, 'retryAdd', 400);
    const est = scanEstimate(pics.length, (await spare(sql, t.id)).spare);
    if (!est.enough) return short(c, est);
    if (c.req.query('confirm') !== '1') return c.json({ ok: false, estimate: est });   // she sees the cost first
    const g = await d.budget.check(t.id);
    if (g && g !== 'credits') return fail(c, 'budget', 503);
    const dir = scanDir(bk.id), want = pics.map((p) => Number(p.page));
    await mkdir(dir, { recursive: true });
    for (const p of pics) { const data = await d.store!.get(p.key); if (!data) return fail(c, 'retryAdd', 400); await writeFile(join(dir, `${p.page}.jpg`), data); }
    await clear();
    // its own hold: the first reading's was settled under the book's id, and a hold is given back only once
    const ref = `${bk.id}~${Date.now().toString(36)}`, hold = { used: 0 };
    const done = async () => { await settleHold(sql, t.id, ref, hold.used); await rm(dir, { recursive: true, force: true }); };
    await holdCredits(t.id, est.need, ref);
    await d.jobs.add(t.id, 'book', bk.id, bk.title,
      (job) => d.held(t.id, hold, () => readBook(bk.id, () => readScan(bk.area_id, bk.id, want, est.need, hold, job)), bk.id).finally(done),
      async () => { await done(); await sql.query(`update books set status = 'error', error = 'stopped' where id = $1`, [bk.id]); }, est.need);
    return c.json({ ok: true, estimate: est });
  });

  // A big PDF with text: the browser reads the text layer and sends only the text (the file stays with her).
  app.post('/api/t/areas/:id/books/text', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ title?: string; pages?: { page?: number; text?: string }[] }>().catch(() => ({} as { title?: string; pages?: undefined }));
    const pages: PdfPage[] = (Array.isArray(b.pages) ? b.pages : []).slice(0, 400).map((p, i) => ({ page: Math.max(1, Math.round(Number(p?.page)) || i + 1), text: String(p?.text ?? '').normalize('NFC').slice(0, 20000) }));
    if (!pages.some((p) => p.text.replace(/\s/g, '').length >= 20)) return fail(c, 'pdf', 400);
    const id = await newBook(c, a, String(b.title || ''), 'text', pages.length);
    if (!id) return fail(c, 'limitReached', 429);
    await d.jobs.add(t.id, 'book', id, clip(b.title, 120) || 'Sách', () => d.as(t.id, () => readBook(id, () => ingestPages(sql, d.ai, a.id, id, pages)), undefined, id), () => dropBook(id));
    return c.json({ book: { id, status: 'processing' } });
  });

  // ---- her original file, kept privately in R2 (Son, 30 Oct) ----
  // A PDF the browser could not open (a big one in Safari, #20), or the original of a big text PDF so it
  // can be seen again: the browser sends it straight to R2 with a signed link; our server never relays it.
  app.post('/api/t/areas/:id/books/original', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    if (!d.store) return fail(c, 'storageOff', 503);
    const b = await c.req.json<{ title?: string; size?: number; bookId?: string }>().catch(() => ({} as { title?: string; size?: number; bookId?: string }));
    const size = Math.round(Number(b.size));
    if (!(size > 200) || size > config.storage.maxFile) return fail(c, 'pdf', 413);
    if (await usedBytes(t.id) + size > config.storage.quotaBytes) return fail(c, 'storageFull', 413);
    // the original of a book already read in the browser, or a new book the server is to read
    let id = String(b.bookId || '');
    if (id) { if (!(await sql.one('select 1 from books bk join areas a on a.id = bk.area_id where bk.id = $1 and a.teacher_id = $2', [id, t.id]))) return fail(c, 'notFound', 404); }
    else { const nid = await newBook(c, a, String(b.title || ''), 'text', 0); if (!nid) return fail(c, 'limitReached', 429); id = nid; await sql.query(`update books set source = 'pdf' where id = $1`, [id]); }
    const key = fileKey(t.id, id, 'original.pdf');
    await sql.query(`insert into book_files (key, book_id, teacher_id, kind, bytes, type) values ($1, $2, $3, 'original', 0, 'application/pdf') on conflict (key) do update set bytes = 0`, [key, id, t.id]);
    return c.json({ book: { id }, url: await d.store.putUrl(key, 'application/pdf') });
  });
  // sent: its size is checked in R2; with `read`, the server reads it (text now; a scanned one after the estimate)
  app.post('/api/t/books/:id/original/done', async (c) => {
    const t = c.get('teacher'), bk = await bookMine(c);
    if (!bk || !d.store) return fail(c, 'notFound', 404);
    const key = fileKey(t.id, bk.id, 'original.pdf'), size = await d.store.size(key).catch(() => null);
    if (!size) return fail(c, 'pdf', 400);
    await sql.query('update book_files set bytes = $2 where key = $1', [key, size]);
    const b = await c.req.json<{ read?: boolean }>().catch(() => ({} as { read?: boolean }));
    if (!b.read) return c.json({ ok: true });
    const pdf = await d.store.get(key);
    const r = pdf ? await readPdf(pdf).catch(() => null) : null;
    if (!pdf || !r || !r.pages.length) { await sql.query(`update books set status = 'error', error = 'failed' where id = $1`, [bk.id]); return fail(c, 'pdf', 400); }
    await sql.query('update books set pages = $2 where id = $1', [bk.id, r.pages.length]);
    // text or pictures, decided as the browser decides it (Chi #26: Safari's file read on our server went the
    // text way and skipped the estimate, the hold and the page count that Chrome showed for the same scan)
    if (textLike(r.pages)) {
      await d.jobs.add(t.id, 'book', bk.id, bk.title, () => d.as(t.id, () => readBook(bk.id, () => ingestPages(sql, d.ai, bk.area_id, bk.id, r.pages)), undefined, bk.id), () => dropBook(bk.id));
      return c.json({ ok: true, text: true, pages: r.pages.length });
    }
    // scanned: she sees the estimate and chooses the pages, as in the browser
    await sql.query(`update books set source = 'scan' where id = $1`, [bk.id]);
    return c.json({ ok: true, text: false, pages: r.pages.length, estimate: scanEstimate(Math.min(r.pages.length, config.scan.maxPages), (await spare(sql, t.id)).spare) });
  });
  // a scanned original in R2: the chosen pages are drawn on the server (poppler), then read like a scan
  app.post('/api/t/books/:id/original/scan', async (c) => {
    const t = c.get('teacher'), bk = await bookMine(c);
    if (!bk || bk.source !== 'scan' || bk.status !== 'processing' || !d.store) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ pages?: number[] }>().catch(() => ({} as { pages?: number[] }));
    const want = [...new Set((Array.isArray(b.pages) ? b.pages : []).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= bk.pages))].sort((x, y) => x - y);
    if (!want.length || want.length > config.scan.maxPages) return fail(c, 'scanPages', 400);
    if (await sql.one(`select 1 from jobs where ref = $1 and status in ('queued', 'running')`, [bk.id])) return c.json({ ok: true });
    // as the scan path (Chi #26): the AI budget, then enough credits, then the hold
    const g = await d.budget.check(t.id);
    if (g && g !== 'credits') return fail(c, 'budget', 503);
    const est = scanEstimate(want.length, (await spare(sql, t.id)).spare);
    if (!est.enough) return short(c, est);
    await holdCredits(t.id, est.need, bk.id);
    const hold = { used: 0 };
    await d.jobs.add(t.id, 'book', bk.id, bk.title, async (job) => {
      await d.held(t.id, hold, () => readBook(bk.id, async () => {
        await job.progress(`0/${want.length}`);   // "Reading page 0/N" from the start, while the pages are drawn
        const pdf = await d.store!.get(fileKey(t.id, bk.id, 'original.pdf'));
        if (!pdf) throw new Error('original missing');
        const dir = scanDir(bk.id), src = join(dir, 'original.pdf');
        await mkdir(dir, { recursive: true }); await writeFile(src, pdf);
        for (const n of want) {
          if (job.stopped) break;
          await pdftoppm(['-jpeg', '-jpegopt', 'quality=78', '-singlefile', '-scale-to', '1754', '-f', String(n), '-l', String(n), src, join(dir, String(n))]);
        }
        await rm(src, { force: true });
        await readScan(bk.area_id, bk.id, want, est.need, hold, job);
      }), bk.id).finally(() => settle(t.id, bk.id, est.need, hold));
    }, async () => { await settle(t.id, bk.id, est.need, hold); await dropBook(bk.id); }, est.need);
    return c.json({ ok: true, estimate: est });
  });

  // ---- a scanned book: estimate, then the page pictures, then the reading (credit held first) ----
  app.post('/api/t/scan/estimate', async (c) => {
    const t = c.get('teacher');
    const b = await c.req.json<{ pages?: number }>().catch(() => ({} as { pages?: number }));
    const n = Math.min(config.scan.maxPages, Math.max(1, Math.round(Number(b.pages)) || 1));
    return c.json({ estimate: scanEstimate(n, (await spare(sql, t.id)).spare) });
  });
  app.post('/api/t/areas/:id/books/scan', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ title?: string; pages?: number[] }>().catch(() => ({} as { title?: string; pages?: undefined }));
    const pages = [...new Set((Array.isArray(b.pages) ? b.pages : []).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 2000))].sort((x, y) => x - y);
    if (!pages.length || pages.length > config.scan.maxPages) return fail(c, 'scanPages', 400);
    const est = scanEstimate(pages.length, (await spare(sql, t.id)).spare);
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
    const est = scanEstimate(want.length, (await spare(sql, t.id)).spare);
    if (!est.enough) return short(c, est);
    await holdCredits(t.id, est.need, bk.id);
    const hold = { used: 0 };
    await d.jobs.add(t.id, 'book', bk.id, bk.title,
      (job) => d.held(t.id, hold, () => readBook(bk.id, () => readScan(bk.area_id, bk.id, want, est.need, hold, job)), bk.id).finally(() => settle(t.id, bk.id, est.need, hold)),
      async () => { await settle(t.id, bk.id, est.need, hold); await dropBook(bk.id); }, est.need);
    return c.json({ ok: true, estimate: est });
  });

  // Read the pages three at a time; stop if she asks, or before the cost would go past what is held.
  const readScan = async (areaId: string, bookId: string, want: number[], need: number, hold: { used: number }, job: JobCtl) => {
    const dir = scanDir(bookId), out: PdfPage[] = [], per = config.scan.pageCredits;
    for (let i = 0; i < want.length; i += config.scan.pagesAtOnce) {
      const batch = want.slice(i, i + config.scan.pagesAtOnce);
      // what these pages may cost (with the margin), for the pages really left: a short last batch,
      // or a book of one or two pages, is not stopped by room for pages it does not have
      if (job.stopped || hold.used + per * config.scan.margin * batch.length > need) break;
      await job.progress(`${i}/${want.length}`);
      const read = await Promise.all(batch.map(async (n) => {
        const data = await readFile(join(dir, `${n}.jpg`));
        const r = await guardedJson<{ usable: boolean; text: string; printed?: number }>(d.ai, { endpoint: 'ocr', system: SCAN_SYSTEM, prompt: 'One page of the book.', images: [{ data, mime: 'image/jpeg' }], schema: SCAN_SCHEMA, fixture: { page: n } }).catch((e) => { console.warn(`[scan] ${bookId} page ${n}: ${String((e as Error)?.message).slice(0, 200)}`); return { usable: false, text: '', printed: 0 }; });
        // the number printed on the page, kept beside its place in the file (Chi #45); checked in printedPages
        const printed = Math.trunc(Number(r.printed));
        return { page: n, text: r.usable ? String(r.text || '').slice(0, 20000) : '', printed: printed >= 1 && printed <= 2000 ? printed : null };
      }));
      out.push(...read);
    }
    await job.progress(`${out.length}/${want.length}`);
    // the whole book or none of it (Son, 30 Oct): stopped, or the held credit would not cover the rest
    if (out.length < want.length) throw new Unread(job.stopped ? 'stopped' : 'credits');
    if (!out.some((p) => p.text.trim())) throw new NotText();
    // the page pictures are kept before the book shows as ready, so View source has them from the start
    const owner = await sql.one<{ teacher_id: string }>('select a.teacher_id from books b join areas a on a.id = b.area_id where b.id = $1', [bookId]);
    if (owner) await keepPages(owner.teacher_id, bookId, want);
    try { await ingestPages(sql, d.ai, areaId, bookId, out); } catch (e) {
      if (d.store) for (const f of await sql.query<{ key: string }>(`select key from book_files where book_id = $1 and kind = 'page'`, [bookId])) await d.store.del(f.key).catch(() => {});
      await sql.query(`delete from book_files where book_id = $1 and kind = 'page'`, [bookId]);
      throw e;
    }
    await sql.query('update books set pages = $2 where id = $1', [bookId, out.length]);
  };
  const holdCredits = (teacherId: string, n: number, ref: string) => holdC(sql, teacherId, n, ref);
  // what was held, less what the reading really cost, goes back (once); the page pictures are gone
  const settle = async (teacherId: string, bookId: string, _need: number, hold: { used: number }) => {
    await settleHold(sql, teacherId, bookId, hold.used);
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
    try { await d.as(t.id, () => ingestBook(sql, d.ai, areaId, id, pdf), undefined, id); } catch (e) {
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
  // "Page 1 of the book is page … in the file" (Chi #45): for a book whose printed page numbers could not
  // be read, once per book; empty clears it. Only what is shown changes.
  app.put('/api/t/books/:id/page-one', async (c) => {
    const bk = await bookMine(c);
    if (!bk) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ pageOne?: number | null }>().catch(() => ({} as { pageOne?: number | null }));
    const n = b.pageOne == null || (b.pageOne as unknown) === '' ? null : Math.round(Number(b.pageOne));
    if (n !== null && !(n >= 1 && n <= 2000)) return fail(c, 'bad');
    await sql.query('update books set page_one = $2 where id = $1', [bk.id, n]);
    return c.json({ ok: true, pageOne: n });
  });
  // Removing a source (Chi #56: one with a part used in a lesson stayed, with no message). Its rows go first,
  // in one transaction that waits a few seconds at most for a row another request holds; lessons already
  // made stay (they keep their own copy of the text, assignments theirs; only the link area_id is cleared).
  // Her kept files in R2 go after, for a few seconds at most each: a slow storage call never keeps the
  // source, nor holds the page; what is left is finished in the background.
  const removeBooks = async (c: Context<Env>, bookIds: string[], rows: (q: Sql) => Promise<unknown>) => {
    const keys = bookIds.length ? await sql.query<{ key: string }>('select key from book_files where book_id = any($1::text[])', [bookIds]) : [];
    try {
      await sql.tx(async (q) => { await q.query(`set local lock_timeout = '8s'`); await rows(q); });
    } catch (e) {
      console.error(`[book] remove ${bookIds.join(',')}: ${String((e as Error)?.message).slice(0, 300)}`);
      return c.json({ code: 'removeBusy', error: 'Chưa xoá được nguồn này (máy chủ đang bận với nó, ví dụ một bài đang soạn từ nguồn). Cô thử lại sau ít phút nhé.', errorEn: 'This source could not be removed yet (the server is busy with it, for example a lesson being made from it). Please try again in a few minutes.' }, 409);
    }
    const files = (async () => {
      for (const f of keys) await Promise.race([d.store?.del(f.key), new Promise((r) => setTimeout(r, 5000))]).catch((e) => console.warn(`[files] ${f.key}: ${(e as Error).message}`));
      for (const id of bookIds) { await rm(bookFile(id), { force: true }).catch(() => {}); await rm(scanDir(id), { recursive: true, force: true }).catch(() => {}); }
    })();
    await Promise.race([files, new Promise((r) => setTimeout(r, 10_000))]);
    return c.json({ ok: true });
  };
  app.delete('/api/t/areas/:id', async (c) => {
    const a = await areaOf(sql, c.get('teacher').id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const books = await sql.query<{ id: string }>('select id from books where area_id = $1', [a.id]);
    return removeBooks(c, books.map((b) => b.id), (q) => q.query('delete from areas where id = $1', [a.id]));
  });
  app.delete('/api/t/books/:id', async (c) => {
    const ok = await sql.one('select 1 from books b join areas a on a.id = b.area_id where b.id = $1 and a.teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
    if (!ok) return fail(c, 'notFound', 404);
    return removeBooks(c, [c.req.param('id')], (q) => q.query('delete from books where id = $1', [c.req.param('id')]));
  });

  // "View source" (Son, 30 Oct): one part of her book as it was read, page by page, and where its original
  // can be seen (an uploaded PDF kept on the server; kept page pictures once they are stored)
  app.get('/api/t/sections/:id/source', async (c) => {
    const s = await sectionMine(c);
    if (!s) return fail(c, 'notFound', 404);
    const bk = await sql.one<{ id: string; title: string; source: string | null }>('select id, title, source from books where id = $1', [s.book_id]);
    const rows = await sql.query<{ page: number; text: string }>('select page, text from passages where section_id = $1 order by page, ord', [s.id]);
    const pages: { page: number; text: string; printed?: number | null }[] = [];
    for (const r of rows) { const last = pages.at(-1); if (last && last.page === r.page) last.text += `\n${r.text}`; else pages.push({ page: r.page, text: r.text }); }
    // each page's number as printed in the book, beside its place in the file (Chi #45)
    const shown = await shownPages(sql, s.book_id);
    for (const p of pages) p.printed = shown(p.page);
    const printed = Object.fromEntries(Array.from({ length: Math.min(400, s.page_to - s.page_from + 1) }, (_, i) => [s.page_from + i, shown(s.page_from + i)]).filter(([, n]) => n != null));
    // the original: a PDF kept on this server, or its original in R2, or the kept page pictures
    let original: { kind: 'pdf'; url: string } | { kind: 'pages'; pages: Record<number, string> } | null = null;
    if ((bk?.source ?? 'pdf') === 'pdf' && await stat(bookFile(s.book_id)).then(() => true, () => false)) original = { kind: 'pdf', url: `/api/t/books/${s.book_id}/file` };
    else if (d.store) {
      const files = await sql.query<{ key: string; kind: string; page: number | null }>(`select key, kind, page from book_files where book_id = $1 and bytes > 0 and (kind = 'original' or page between $2 and $3)`, [s.book_id, s.page_from, s.page_to]);
      const orig = files.find((f) => f.kind === 'original'), pics = files.filter((f) => f.kind === 'page');
      if (pics.length) original = { kind: 'pages', pages: Object.fromEntries(await Promise.all(pics.map(async (f) => [f.page, await d.store!.getUrl(f.key)]))) };
      else if (orig) original = { kind: 'pdf', url: await d.store.getUrl(orig.key) };
    }
    return c.json({ section: { id: s.id, title: s.title, pageFrom: s.page_from, pageTo: s.page_to, ...printedRange(shown, s.page_from, s.page_to) }, book: { id: bk?.id, title: bk?.title, source: bk?.source ?? 'pdf' }, pages, printed, original });
  });

  // The knowledge map (Son, 30 Oct): her book → its parts → the lessons made from each part → the skills
  // each lesson teaches (a skill taught in several lessons is one node), and where each lesson is assigned.
  app.get('/api/t/areas/:id/map', async (c) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id'));
    if (!a) return fail(c, 'notFound', 404);
    const sections = await sql.query<{ id: string; title: string; page_from: number; page_to: number; book_id: string }>(
      `select s.id, s.title, s.page_from, s.page_to, s.book_id from sections s join books b on b.id = s.book_id where b.area_id = $1 and s.title <> '—' order by b.created_at, s.ord`, [a.id]);
    const lessons = await sql.query<{ id: string; title: string; section: string; status: string; skills: { tag: string; name: string; kind: string }[]; classes: number }>(
      `select l.id, l.setup->>'title' as title, l.refs->0->>'sectionId' as section, l.status, l.skills,
          (select count(distinct x.class_id) from assignments x where x.lesson_id = l.id)::int as classes
        from lessons l where l.teacher_id = $1 and l.area_id = $2 and l.status <> 'error' order by l.created_at`, [t.id, a.id]);
    const books = await sql.query<{ id: string; title: string; pages: number }>('select id, title, pages from books where area_id = $1 order by created_at', [a.id]);
    const skills = new Map<string, { id: string; name: string; kind: string; lessons: string[] }>();
    for (const l of lessons) for (const k of l.skills ?? []) {
      const key = String(k.name || k.tag).trim().toLowerCase(), x = skills.get(key) ?? { id: `k${skills.size + 1}`, name: k.name || k.tag, kind: k.kind, lessons: [] };
      if (!x.lessons.includes(l.id)) x.lessons.push(l.id);
      skills.set(key, x);
    }
    const shown = new Map(await Promise.all(books.map(async (b) => [b.id, await shownPages(sql, b.id)] as const)));
    return c.json({ area: { id: a.id, name: a.name }, books, sections: sections.map((s) => { const f = shown.get(s.book_id); return { id: s.id, title: s.title, pageFrom: s.page_from, pageTo: s.page_to, bookId: s.book_id, ...(f ? printedRange(f, s.page_from, s.page_to) : {}) }; }),
      lessons: lessons.map((l) => ({ id: l.id, title: l.title, section: l.section, status: l.status, classes: l.classes, skills: (l.skills ?? []).map((k) => skills.get(String(k.name || k.tag).trim().toLowerCase())!.id) })),
      skills: [...skills.values()] });
  });

  // What should this lesson teach? Her request (typed, read from a photo, or spoken) is matched to one
  // section of her books: hybrid search, Muse Spark re-rank, verified citations.
  app.post('/api/t/areas/:id/match', async (c: Context<Env>) => {
    const t = c.get('teacher'), a = await areaOf(sql, t.id, c.req.param('id') ?? '');
    if (!a) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ request?: string }>().catch(() => ({} as { request?: string }));
    const request = String(b.request ?? '').trim().slice(0, 2000);
    if (request.length < 3) return fail(c, 'requestShort');
    // finding the part is the first step of a lesson: with too few credits for one, it spends nothing (Chi #30)
    if ((await spare(sql, t.id)).left < config.guard.lessonCredits) return fail(c, 'credits', 429);
    const spent = await d.budget.check(t.id);
    if (spent) return fail(c, spent === 'total' ? 'credit' : spent === 'credits' ? 'credits' : 'budget', 429);
    try {
      const m = await d.as(t.id, async () => { await requireOnTask(d.ai, request); return findSection(sql, d.ai, a.id, request); });
      // "Only what you gave" (Chi #60): the pages the cited passages are on, and the next one (an example often runs on),
      // when that is less than the whole part; null when it is the whole part anyway
      // from the best citation's page, the cited pages next to it (a stray citation further on does not stretch it)
      const pg = new Set(m.cited.map((x) => Number(x.page)).filter((x) => x >= m.section.pageFrom && x <= m.section.pageTo)), first = Number(m.cited[0]?.page) || 0;
      let lo = pg.has(first) ? first : 0, top = lo; while (lo && pg.has(lo - 1)) lo--; while (top && pg.has(top + 1)) top++;
      const hi = lo ? Math.min(m.section.pageTo, top + 1) : 0;
      const narrow = lo && (lo > m.section.pageFrom || hi < m.section.pageTo) ? { pageFrom: lo, pageTo: hi, ...printedRange(await shownPages(sql, m.section.bookId), lo, hi) } : null;
      return c.json({ match: { sectionId: m.section.id, title: m.section.title, book: m.section.book, bookId: m.section.bookId, pageFrom: m.section.pageFrom, pageTo: m.section.pageTo, printedFrom: m.section.printedFrom ?? null, printedTo: m.section.printedTo ?? null, cited: m.cited, narrow,
        citation: citation(m, t.lang), preview: sourceOf(m, 1500) } });
    } catch (e) {
      if (e instanceof NoMatch) return fail(c, 'noMatch', 404);
      if (e instanceof Blocked) return e.busy ? fail(c, 'aiBusy', 503) : fail(c, 'aiBlocked');
      throw e;
    }
  });
}

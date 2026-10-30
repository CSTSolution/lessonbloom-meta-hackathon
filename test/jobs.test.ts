// One job at a time per account (reading a book or making a lesson), a line she can see; scanned books
// read from the page pictures her browser sends, with the estimate first, 1.5x held and the rest back.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../server/config.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';
import { Jobs } from '../server/jobs.ts';
import { scanEstimate } from '../server/knowledge/routes.ts';
import { testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
async function until(f: () => Promise<boolean>, what: string) { for (let i = 0; i < 200; i++) { if (await f()) return; await wait(10); } assert.fail(`timed out: ${what}`); }

test('jobs: one at a time per account, in order; at most `max` in the whole app; her line shows each place', async () => {
  const sql = await pgliteSql(); await migrate(sql);
  for (const id of ['t1', 't2', 't3']) await sql.query(`insert into teachers (id, kind) values ($1, 'demo')`, [id]);
  const jobs = new Jobs(sql, 2), order: string[] = [], a = gate(), b = gate(), c = gate();
  await jobs.add('t1', 'book', 'b1', 'Book one', async () => { order.push('b1'); await a.p; });
  await jobs.add('t1', 'lesson', 'l1', 'Lesson one', async () => { order.push('l1'); });
  await jobs.add('t2', 'lesson', 'l2', 'Lesson two', async () => { order.push('l2'); await b.p; });
  await jobs.add('t3', 'lesson', 'l3', 'Lesson three', async () => { order.push('l3'); await c.p; });
  await until(async () => order.length === 2, 'two running');
  assert.deepEqual(order, ['b1', 'l2'], 't1 runs one job; at most 2 in the app');
  const line = await jobs.list('t1');
  assert.deepEqual(line.map((x) => [x.ref, x.status, x.place]), [['b1', 'running', 1], ['l1', 'queued', 2]]);
  a.open();
  await until(async () => order.includes('l1'), 't1 next job');
  assert.ok(order.indexOf('l1') > order.indexOf('b1'));
  b.open(); c.open();
  await until(async () => order.includes('l3'), 't3 gets its turn');
  await until(async () => jobs.idle(), 'all done');
  assert.ok((await jobs.list('t1')).every((x) => x.status === 'done'));
});

test('jobs: a waiting job can be cancelled (its cancel step runs); a running book can be asked to stop, a lesson cannot', async () => {
  const sql = await pgliteSql(); await migrate(sql);
  await sql.query(`insert into teachers (id, kind) values ('t1', 'demo')`);
  const jobs = new Jobs(sql, 3), hold = gate();
  let cancelled = false, sawStop = false;
  const book = await jobs.add('t1', 'book', 'b1', 'Book', async (j) => { while (!j.stopped) await wait(5); sawStop = true; });
  const lesson = await jobs.add('t1', 'lesson', 'l1', 'Lesson', async () => { await hold.p; }, async () => { cancelled = true; });
  await until(async () => (await jobs.list('t1')).some((x) => x.status === 'running'), 'book running');
  assert.equal(await jobs.cancel('t1', lesson), 'cancelled');
  assert.ok(cancelled, 'the waiting lesson is taken out and its cancel step ran');
  assert.equal(await jobs.cancel('t2', book), 'notFound', 'not hers');
  assert.equal(await jobs.cancel('t1', book), 'stopping');
  await until(async () => jobs.idle(), 'stopped');
  assert.ok(sawStop);
  assert.equal((await jobs.list('t1')).find((x) => x.ref === 'b1')?.status, 'cancelled');
  const l2 = gate();
  const running = await jobs.add('t1', 'lesson', 'l2', 'Lesson 2', async () => { await l2.p; });
  await until(async () => (await jobs.list('t1')).some((x) => x.ref === 'l2' && x.status === 'running'), 'lesson running');
  assert.equal(await jobs.cancel('t1', running), 'cannotStop', 'a lesson being written is not cut off halfway');
  l2.open();
});

test('the estimate: pages x credits a page plus the fixed part of a reading, and she must have 50% more; how many pages fit', () => {
  const per = config.scan.pageCredits, fixed = config.scan.readCredits, e = scanEstimate(100, 120);
  assert.equal(e.predicted, Math.ceil(100 * per + fixed));
  assert.equal(e.need, Math.ceil(e.predicted * 1.5));
  assert.equal(e.enough, 120 >= e.need);
  assert.equal(e.fits, Math.floor((120 / 1.5 - fixed) / per));
  assert.ok(scanEstimate(20, 120).enough);
  assert.equal(scanEstimate(1, 120).predicted, 2, 'one photo: about 2, what it really costs (Chi #29)');
});

test('a scanned book: estimate, pictures from the browser, credit held, read page by page, the rest given back', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Maths 2', subject: 'math', grade: 2 })).json;
  const start = (await call('GET', '/api/t/me')).json.credits.left;
  // too many pages for what she has: refused before anything is made, with what would fit
  const big = await call('POST', `/api/t/areas/${area.id}/books/scan`, { title: 'Big', pages: Array.from({ length: 150 }, (_, i) => i + 1) });
  assert.equal(big.status, 402);
  assert.equal(big.json.code, 'scanCredits');
  assert.ok(big.json.estimate.fits < 150 && big.json.estimate.need > start);
  // four pages: the estimate, then the pages, then the reading
  const est = (await call('POST', '/api/t/scan/estimate', { pages: 4 })).json.estimate;
  assert.ok(est.enough && est.need === Math.ceil(est.predicted * 1.5));
  const made = (await call('POST', `/api/t/areas/${area.id}/books/scan`, { title: 'Maths 2 scanned', pages: [3, 4, 5, 6] })).json;
  assert.ok(made.book.id);
  const jpeg = (n: number) => ({ type: 'image/jpeg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, n)]) });
  assert.equal((await call('POST', `/api/t/books/${made.book.id}/scan/start`)).json.code, 'scanPages', 'not before every page is here');
  assert.equal((await call('PUT', `/api/t/books/${made.book.id}/pages/9`, undefined, jpeg(9))).status, 400, 'only the pages she chose');
  assert.equal((await call('PUT', `/api/t/books/${made.book.id}/pages/3`, undefined, { type: 'image/png', data: Buffer.alloc(800) })).status, 413, 'JPEG only');
  for (const n of [3, 4, 5, 6]) assert.equal((await call('PUT', `/api/t/books/${made.book.id}/pages/${n}`, undefined, jpeg(n))).status, 200);
  const read: number[] = [];
  s.ai.answers.set('ocr', (r) => { const page = (r.fixture as { page: number }).page; read.push(page);
    return { usable: true, text: page === 3 ? 'Lesson 21: Adding with regrouping within 100\nMia has 36 apples. 36 + 27 = 63.' : page === 5 ? 'Lesson 22: Subtracting within 100\n52 - 28 = 24.' : `Practice on page ${page}: 45 + 38 = 83.` }; });
  assert.equal((await call('POST', `/api/t/books/${made.book.id}/scan/start`)).status, 200);
  let book: any;
  for (let i = 0; i < 300; i++) { book = (await call('GET', `/api/t/areas/${area.id}`)).json.books.find((b: any) => b.id === made.book.id); if (book.status !== 'processing') break; await wait(10); }
  assert.equal(book.status, 'ready');
  assert.deepEqual(read.sort(), [3, 4, 5, 6], 'every page read once, from its picture');
  const secs = (await call('GET', `/api/t/areas/${area.id}`)).json.sections;
  assert.deepEqual(secs.map((x: any) => [x.title, x.page_from ?? x.pageFrom]), [['Lesson 21: Adding with regrouping within 100', 3], ['Lesson 22: Subtracting within 100', 5]], 'lessons with their book pages');
  const log = await s.sql.query<{ reason: string; credits: number }>(`select reason, credits from credit_log where ref = $1 order by id`, [made.book.id]);
  assert.deepEqual(log.map((x) => x.reason), ['hold', 'refund']);
  assert.equal(log[0].credits, -est.need, 'held first: 1.5x the estimate');
  assert.equal((await call('GET', '/api/t/me')).json.credits.left, start - (est.need - log[1].credits), 'only what the reading cost is kept');
  // the pictures are gone once read; only the text stays
  assert.equal((await call('PUT', `/api/t/books/${made.book.id}/pages/3`, undefined, jpeg(3))).status, 404);
});

test('a big text PDF: the browser sends only the text; it becomes lessons in her line of jobs', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'English 3', subject: 'english', grade: 3 })).json;
  const pages = [{ page: 1, text: 'Unit 1: Hello\nHello! I am Mia. What is your name?' }, { page: 2, text: 'Unit 2: Colours\nRed, blue and green. The apple is red.' }];
  const r = (await call('POST', `/api/t/areas/${area.id}/books/text`, { title: 'English 3 big', pages })).json;
  let book: any;
  for (let i = 0; i < 200; i++) { book = (await call('GET', `/api/t/areas/${area.id}`)).json.books.find((b: any) => b.id === r.book.id); if (book.status !== 'processing') break; await wait(10); }
  assert.equal(book.status, 'ready');
  assert.deepEqual((await call('GET', `/api/t/areas/${area.id}`)).json.sections.map((x: any) => x.title), ['Unit 1: Hello', 'Unit 2: Colours']);
  assert.equal((await call('POST', `/api/t/areas/${area.id}/books/text`, { title: 'x', pages: [{ page: 1, text: ' ' }] })).status, 400, 'no text, no book');
});

test('a scanned book of one or two pages is read whole, and a short last batch is not skipped', async () => {
  for (const pages of [[7], [7, 8], [3, 4, 5, 6, 7]]) {
    const s = await testServer(), call = s.client();
    await call('POST', '/api/auth/demo', { lang: 'en' });
    const { area } = (await call('POST', '/api/t/areas', { name: 'Maths 2', subject: 'math', grade: 2 })).json;
    const made = (await call('POST', `/api/t/areas/${area.id}/books/scan`, { title: 'Short', pages })).json;
    const jpeg = (n: number) => ({ type: 'image/jpeg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, n)]) });
    for (const n of pages) await call('PUT', `/api/t/books/${made.book.id}/pages/${n}`, undefined, jpeg(n));
    const read: number[] = [];
    s.ai.answers.set('ocr', (r) => { const page = (r.fixture as { page: number }).page; read.push(page); return { usable: true, text: `Lesson ${page}: Adding within 100\n36 + 27 = 63.` }; });
    assert.equal((await call('POST', `/api/t/books/${made.book.id}/scan/start`)).status, 200);
    let book: any;
    for (let i = 0; i < 300; i++) { book = (await call('GET', `/api/t/areas/${area.id}`)).json.books.find((b: any) => b.id === made.book.id); if (book.status !== 'processing') break; await wait(10); }
    assert.equal(book.status, 'ready', `${pages.length} pages`);
    assert.deepEqual(read.sort((a, b) => a - b), pages, `every page read (${pages.length})`);
  }
});

test('a scanned book is read whole or not at all: stopped halfway, nothing is kept and the credit comes back', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Maths 2', subject: 'math', grade: 2 })).json;
  const pages = [1, 2, 3, 4, 5, 6];
  const made = (await call('POST', `/api/t/areas/${area.id}/books/scan`, { title: 'Half', pages })).json;
  const jpeg = (n: number) => ({ type: 'image/jpeg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, n)]) });
  for (const n of pages) await call('PUT', `/api/t/books/${made.book.id}/pages/${n}`, undefined, jpeg(n));
  let reads = 0;
  // each page takes a moment, so the stop lands halfway
  s.ai.answers.set('ocr', (r) => { reads++; return new Promise((ok) => setTimeout(() => ok({ usable: true, text: `Lesson ${(r.fixture as { page: number }).page}: Adding\n36 + 27 = 63.` }), 40)); });
  const start = (await call('GET', '/api/t/me')).json.credits.left;
  await call('POST', `/api/t/books/${made.book.id}/scan/start`);
  // stop it while it reads (the first batch of three may already be done)
  for (let i = 0; i < 200 && reads === 0; i++) await wait(2);
  const job = (await call('GET', '/api/t/jobs')).json.jobs.find((j: any) => j.ref === made.book.id);
  await call('POST', `/api/t/jobs/${job.id}/cancel`);
  let book: any;
  for (let i = 0; i < 300; i++) { book = (await call('GET', `/api/t/areas/${area.id}`)).json.books.find((b: any) => b.id === made.book.id); if (book.status !== 'processing') break; await wait(10); }
  assert.ok(reads < pages.length, `stopped halfway (${reads} read)`);
  {
    assert.equal(book.status, 'error');
    assert.equal(book.error, 'stopped');
    assert.equal((await call('GET', `/api/t/areas/${area.id}`)).json.sections.length, 0, 'no part of the book is kept');
  }
  const left = (await call('GET', '/api/t/me')).json.credits.left;
  assert.ok(left >= start - 1, 'what was held came back, less what was read');
});

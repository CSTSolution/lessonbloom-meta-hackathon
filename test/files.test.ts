// Her original files in R2 (Son, 30 Oct): page pictures of a scanned book kept and shown in "View source";
// a PDF the browser could not open sent to R2 and read on our server (text now, scanned after the
// estimate, pages drawn with poppler); her allowance; everything deleted with the book.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jpeg from 'jpeg-js';
import { MemoryStore } from '../server/storage.ts';
import { testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jpg = (n: number) => ({ type: 'image/jpeg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, n)]) });
async function ready(call: any, areaId: string, bookId: string) {
  let b: any;
  for (let i = 0; i < 400; i++) { b = (await call('GET', `/api/t/areas/${areaId}`)).json.books.find((x: any) => x.id === bookId); if (b && b.status !== 'processing') return b; await wait(15); }
  return b;
}
// a PDF of pages that are only pictures (a scanned book), built with a real JPEG so poppler can draw it;
// `text`: pages that also carry a line of real text (a scan with a few typed pages)
function scannedPdf(pages: number, text: Record<number, string> = {}) {
  const img = jpeg.encode({ data: Buffer.alloc(200 * 280 * 4, 255), width: 200, height: 280 }, 80).data;
  const parts: Buffer[] = [], offs: number[] = []; let len = 0;
  const push = (b: Buffer | string) => { const x = typeof b === 'string' ? Buffer.from(b, 'latin1') : b; parts.push(x); len += x.length; };
  const obj = (i: number, ...body: (Buffer | string)[]) => { offs[i] = len; push(`${i} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  const kids = Array.from({ length: pages }, (_, p) => 5 + p * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`);
  for (let p = 0; p < pages; p++) {
    const im = 3 + p * 3, ct = im + 1, pg = im + 2, cs = `q 595 0 0 842 0 0 cm /Im0 Do Q${text[p + 1] ? ` BT /F1 12 Tf 50 800 Td (${text[p + 1]}) Tj ET` : ''}`;
    obj(im, `<< /Type /XObject /Subtype /Image /Width 200 /Height 280 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream');
    obj(ct, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${ct} 0 R /Resources << /XObject << /Im0 ${im} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`);
  }
  const total = 3 + pages * 3, x = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n${Array.from({ length: total - 1 }, (_, i) => `${String(offs[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`);
  return Buffer.concat(parts);
}

test('files: a scanned book keeps its page pictures in R2; View source shows them; deleting the book deletes them', async () => {
  const store = new MemoryStore(), s = await testServer({ store }), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Maths 2', subject: 'math', grade: 2 })).json;
  const made = (await call('POST', `/api/t/areas/${area.id}/books/scan`, { title: 'Scan', pages: [4, 5] })).json;
  for (const n of [4, 5]) await call('PUT', `/api/t/books/${made.book.id}/pages/${n}`, undefined, jpg(n));
  s.ai.answers.set('ocr', (r) => ({ usable: true, text: `Lesson ${(r.fixture as { page: number }).page}: Adding\n36 + 27 = 63.` }));
  await call('POST', `/api/t/books/${made.book.id}/scan/start`);
  assert.equal((await ready(call, area.id, made.book.id)).status, 'ready');
  assert.equal(store.objects.size, 2, 'both page pictures kept');
  const sec = (await call('GET', `/api/t/areas/${area.id}`)).json.sections[0];
  const src = (await call('GET', `/api/t/sections/${sec.id}/source`)).json;
  assert.equal(src.original.kind, 'pages');
  assert.match(src.original.pages[sec.page_from], /^memory:\/\/t\/.+\/p\/\d+\.jpg$/, 'a signed link to her page picture');
  assert.ok((await call('GET', '/api/t/usage')).json.storage.used > 0, 'her space used shows on the usage page');
  await call('DELETE', `/api/t/areas/${area.id}`);
  assert.equal(store.objects.size, 0, 'deleted with the book');
});

test('files: a PDF the browser could not open goes to R2 and is read on our server: text at once; scanned after the estimate, drawn by poppler', async () => {
  const store = new MemoryStore(), s = await testServer({ store }), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Maths 2', subject: 'math', grade: 2 })).json;
  // a text PDF (the team's sample book)
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../samples/books/maths2.pdf', import.meta.url));
  const o = (await call('POST', `/api/t/areas/${area.id}/books/original`, { size: text.length, title: 'Big text' })).json;
  assert.match(o.url, /^memory:\/\//);
  await store.put(o.url.slice('memory://'.length), text, 'application/pdf');   // what the browser's PUT does
  const d1 = (await call('POST', `/api/t/books/${o.book.id}/original/done`, { read: true })).json;
  assert.equal(d1.text, true);
  assert.equal((await ready(call, area.id, o.book.id)).status, 'ready');
  const sec = (await call('GET', `/api/t/areas/${area.id}`)).json.sections.find((x: any) => x.book_id === o.book.id);
  assert.equal((await call('GET', `/api/t/sections/${sec.id}/source`)).json.original.kind, 'pdf', 'its original, from R2');
  // a scanned PDF: the estimate first, then the pages she chose are drawn and read
  const scan = scannedPdf(3);
  const o2 = (await call('POST', `/api/t/areas/${area.id}/books/original`, { size: scan.length, title: 'Big scan' })).json;
  await store.put(o2.url.slice('memory://'.length), scan, 'application/pdf');
  const d2 = (await call('POST', `/api/t/books/${o2.book.id}/original/done`, { read: true })).json;
  assert.equal(d2.text, false); assert.equal(d2.pages, 3); assert.ok(d2.estimate.enough);
  const read: number[] = [];
  s.ai.answers.set('ocr', (r) => { const p = (r.fixture as { page: number }).page; read.push(p); return { usable: true, text: `Lesson ${p}: Adding\n36 + 27 = 63.` }; });
  assert.equal((await call('POST', `/api/t/books/${o2.book.id}/original/scan`, { pages: [1, 2, 3] })).status, 200);
  assert.equal((await ready(call, area.id, o2.book.id)).status, 'ready');
  assert.deepEqual(read.sort(), [1, 2, 3], 'each page drawn on the server and read');
});

test('files: a scanned PDF read on our server (Safari, Chi #26) goes as in Chrome: the estimate, enough credits, the hold, page k/N, then settled', async () => {
  const store = new MemoryStore(), s = await testServer({ store }), call = s.client('198.51.100.171');
  await call('POST', '/api/auth/demo', { lang: 'vi' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Toán 2', subject: 'math', grade: 2 })).json;
  // 12 pages, half of them with a typed line but none of the five Chrome looks at (1, 3, 6, 9, 12): Chrome
  // says scanned, and our server, counting every page, used to say text and read it free, with no estimate
  const typed = Object.fromEntries([2, 4, 5, 7, 8, 10].map((n) => [n, `Trang ${n} co mot dong chu go san trong ban scan`]));
  const scan = scannedPdf(12, typed);
  const o = (await call('POST', `/api/t/areas/${area.id}/books/original`, { size: scan.length, title: 'Toán 2 scan' })).json;
  await store.put(o.url.slice('memory://'.length), scan, 'application/pdf');
  const d = (await call('POST', `/api/t/books/${o.book.id}/original/done`, { read: true })).json;
  assert.equal(d.text, false, 'scanned, as Chrome says'); assert.equal(d.pages, 12);
  assert.equal(d.estimate.pages, 12); assert.ok(d.estimate.need > d.estimate.predicted, 'what she must have: the estimate and 50% more');
  const credits = async () => (await call('GET', '/api/t/me')).json.credits.left;
  const before = await credits();
  // not enough credits: nothing is read, nothing held, and the numbers come back for the page
  await s.sql.query(`update teachers set credits = 1 where id = (select teacher_id from areas where id = $1)`, [area.id]);
  const no = await call('POST', `/api/t/books/${o.book.id}/original/scan`, { pages: Array.from({ length: 12 }, (_, k) => k + 1) });
  assert.equal(no.status, 402); assert.equal(no.json.code, 'scanCredits'); assert.equal(no.json.estimate.enough, false);
  assert.ok(!(await s.sql.one(`select 1 from credit_log where ref = $1`, [o.book.id])), 'nothing held');
  await s.sql.query(`update teachers set credits = $2 where id = (select teacher_id from areas where id = $1)`, [area.id, before]);
  // enough: held, read page by page with k/N for "Reading page k/N", then what was not used comes back
  const seen: string[] = [];
  s.ai.answers.set('ocr', (r) => {
    const p = (r.fixture as { page: number }).page;
    void s.sql.one<{ progress: string }>(`select progress from jobs where ref = $1 and status = 'running'`, [o.book.id]).then((j) => { if (j) seen.push(j.progress); });
    return { usable: true, text: `Bài ${Math.ceil(p / 2)}: Phép cộng\n${p} + 27 = ?`, printed: p };
  });
  const go = (await call('POST', `/api/t/books/${o.book.id}/original/scan`, { pages: Array.from({ length: 12 }, (_, k) => k + 1) })).json;
  assert.equal(go.ok, true);
  const hold = await s.sql.one<{ n: string }>(`select -credits as n from credit_log where reason = 'hold' and ref = $1`, [o.book.id]);
  assert.equal(Number(hold?.n), go.estimate.need, 'the estimate\'s need is held');
  assert.equal((await ready(call, area.id, o.book.id)).status, 'ready');
  for (let i = 0; i < 200 && !(await s.sql.one(`select 1 from credit_log where reason = 'refund' and ref = $1`, [o.book.id])); i++) await wait(15);
  assert.ok(seen.some((x) => /^\d+\/12$/.test(x)), `job progress k/12, saw ${JSON.stringify(seen)}`);
  assert.equal((await s.sql.one<{ progress: string }>(`select progress from jobs where ref = $1`, [o.book.id]))?.progress, '12/12');
  const spent = before - await credits(), book = (await call('GET', '/api/t/areas')).json.areas.find((x: any) => x.id === area.id).books[0];
  assert.ok(spent > 0 && spent <= go.estimate.need, `spent ${spent}`);
  assert.equal(Number(book.used), spent, 'used, as the book shows it, is what came off'); assert.equal(Number(book.returned), go.estimate.need - spent);
});

test('files: her allowance is checked before anything is sent', async () => {
  const store = new MemoryStore(), s = await testServer({ store }), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Maths 2', subject: 'math', grade: 2 })).json;
  const r = await call('POST', `/api/t/areas/${area.id}/books/original`, { size: 400e6, title: 'Too big' });
  assert.equal(r.json.code, 'storageFull');
  const off = await testServer(), c2 = off.client();
  await c2('POST', '/api/auth/demo', { lang: 'en' });
  const a2 = (await c2('POST', '/api/t/areas', { name: 'x', subject: 'math', grade: 2 })).json.area;
  assert.equal((await c2('POST', `/api/t/areas/${a2.id}/books/original`, { size: 1000 })).json.code, 'storageOff', 'no R2 set: the app says so (the browser then uploads as before)');
});

test('"Read again to split into lessons" (Chi #48, #54d): from the kept text, free; an older scan from its kept pictures, at the scan price', async () => {
  const store = new MemoryStore(), s = await testServer({ store }), call = s.client('198.51.100.170');
  await call('POST', '/api/auth/demo', { lang: 'vi' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Toán 2 tập 2', subject: 'math', grade: 2 })).json;
  const pages = [58, 59, 60, 61, 62];
  const made = (await call('POST', `/api/t/areas/${area.id}/books/scan`, { title: 'Cánh Diều 58-62', pages })).json;
  for (const n of pages) await call('PUT', `/api/t/books/${made.book.id}/pages/${n}`, undefined, jpg(n));
  // the pages as Cánh Diều prints them: a title in capitals at the top, no "Bài N"
  const TITLES: Record<number, string> = { 58: 'PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000', 60: 'PHÉP CỘNG (CÓ NHỚ) TRONG PHẠM VI 1000', 62: 'LUYỆN TẬP CHUNG' };
  s.ai.answers.set('ocr', (r) => { const p = (r.fixture as { page: number }).page; return { usable: true, text: `${TITLES[p] ? `# ${TITLES[p]}\n` : ''}Tính: ${p} + 125 = ?\nĐặt tính rồi tính.` }; });
  await call('POST', `/api/t/books/${made.book.id}/scan/start`);
  assert.equal((await ready(call, area.id, made.book.id)).status, 'ready');
  for (let i = 0; i < 200 && (await s.sql.one(`select 1 from jobs where ref = $1 and status in ('queued', 'running')`, [made.book.id])); i++) await wait(15);   // its job is over
  const parts = async () => (await call('GET', `/api/t/areas/${area.id}`)).json.sections.map((x: any) => x.title);
  assert.equal((await parts()).length, 3);
  // read before 1 Nov: one part and no kept text
  await s.sql.query(`update books set page_text = null where id = $1`, [made.book.id]);
  await s.sql.query(`delete from passages where book_id = $1`, [made.book.id]);
  await s.sql.query(`delete from sections where book_id = $1 and ord > 1`, [made.book.id]);
  const credits = async () => (await call('GET', '/api/t/me')).json.credits.left;
  const before = await credits();
  // first the cost, nothing done; then read again from the kept pictures, its own hold settled
  const ask = (await call('POST', `/api/t/books/${made.book.id}/resplit`)).json;
  assert.equal(ask.ok, false); assert.equal(ask.estimate.pages, 5);
  assert.equal(await credits(), before);
  assert.equal((await call('POST', `/api/t/books/${made.book.id}/resplit?confirm=1`)).json.ok, true);
  assert.equal((await ready(call, area.id, made.book.id)).status, 'ready');
  assert.deepEqual(await parts(), ['Phép cộng (không nhớ) trong phạm vi 1000', 'Phép cộng (có nhớ) trong phạm vi 1000', 'Luyện tập chung']);
  for (let i = 0; i < 200 && !(await s.sql.one(`select 1 from credit_log where reason = 'refund' and ref like $1`, [`${made.book.id}~%`])); i++) await wait(15);
  const spent = before - await credits();
  assert.ok(spent > 0 && spent <= ask.estimate.need, `spent ${spent}`);
  assert.equal(store.objects.size, 5, 'the page pictures are still kept');
  // now the text is kept: reading again is free
  const free = (await call('POST', `/api/t/books/${made.book.id}/resplit`)).json;
  assert.equal(free.free, true);
  assert.equal((await ready(call, area.id, made.book.id)).status, 'ready');
  assert.equal((await parts()).length, 3);
});

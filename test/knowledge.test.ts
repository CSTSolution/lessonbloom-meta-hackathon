// The knowledge area: books read from PDF, hybrid search, verified citations, privacy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MockProvider } from '../server/ai/mock.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';
import { ingestBook, ingestPages, paragraphs, printedPages, sectionsFrom } from '../server/knowledge/ingest.ts';
import { readPdf } from '../server/knowledge/pdf.ts';
import { candidates, citation, findSection, NoMatch, terms, verify } from '../server/knowledge/search.ts';
import { scopeOf } from '../server/lesson/items.ts';
import { sectionOf } from '../server/knowledge/routes.ts';
import { areaWithBook, testServer } from './helpers.ts';

const TOAN = await readFile(new URL('../samples/books/toan2.pdf', import.meta.url));

async function oneBook() {
  const sql = await pgliteSql(); await migrate(sql);
  await sql.query(`insert into teachers (id, kind) values ('t1', 'demo')`);
  await sql.query(`insert into areas (id, teacher_id, name, subject, grade) values ('a1', 't1', 'Toán 2', 'math', 2)`);
  await sql.query(`insert into books (id, area_id, title, status) values ('b1', 'a1', 'Toán 2 – Sách mẫu', 'processing')`);
  await ingestBook(sql, new MockProvider(), 'a1', 'b1', TOAN);
  return sql;
}

test('a PDF becomes pages, then lessons (sections) with their pages, from the book\'s own headings', async () => {
  const { pages, scanned, title } = await readPdf(TOAN);
  assert.equal(title, 'Toán 2 – Sách mẫu LessonBloom');
  assert.equal(pages.length, 6);
  assert.equal(scanned, 0);
  const sections = sectionsFrom(paragraphs(pages)).filter((s) => s.title);
  assert.deepEqual(sections.map((s) => [s.title.slice(0, 7), s.pageFrom]), [['Bài 20:', 2], ['Bài 21:', 3], ['Bài 22:', 4], ['Bài 23:', 5], ['Bài 24:', 6]]);
  assert.ok(sections[1].paragraphs.some((p) => /36 cộng 27|36 \+ 27/.test(p.text) && !p.text.includes('\n')), 'wrapped lines are joined back into paragraphs');
});

test('a scanned textbook: "Bài 1" alone on its line takes its title from the next; the contents page starts no lesson', () => {
  const pages = [
    { page: 5, text: 'MỤC LỤC\nBài 1. Ôn tập các số đến 100 7\nBài 2. Tia số. Số liền trước, số liền sau 10\nBài 3. Các thành phần của phép cộng, phép trừ 14\nBài 4. Hơn, kém nhau bao nhiêu 18\nBài 5. Ôn tập phép cộng, phép trừ 20' },
    { page: 7, text: 'Chủ đề 1\nÔN TẬP VÀ BỔ SUNG\nBài 1\nÔN TẬP CÁC SỐ ĐẾN 100\nLuyện tập\n1 Hoàn thành bảng sau (theo mẫu).\nChục Đơn vị Viết số Đọc số' },
    { page: 8, text: '3 Hoàn thành bảng sau (theo mẫu).\nSố gồm 5 chục và 7 đơn vị.' },
    { page: 20, text: 'Bài 5\nÔN TẬP PHÉP CỘNG, PHÉP TRỪ (không nhớ) TRONG PHẠM VI 100\nLuyện tập\n1 Tính nhẩm (theo mẫu).' },
    { page: 21, text: 'Lesson 3:\nAt the zoo\n1 Look and say.' },
    { page: 22, text: 'Bài 6 LUYỆN TẬP CHUNG\n1 Tính nhẩm.' },
    { page: 23, text: 'Bài 10: LUYỆN TẬP CHUNG\n1 Số?' },
  ];
  const sections = sectionsFrom(paragraphs(pages));
  assert.deepEqual(sections.map((s) => [s.title, s.pageFrom, s.pageTo]), [
    ['', 5, 5],
    ['Bài 1: Ôn tập các số đến 100', 7, 8],
    ['Bài 5: Ôn tập phép cộng, phép trừ (không nhớ) trong phạm vi 100', 20, 20],
    ['Lesson 3: At the zoo', 21, 21],
    ['Bài 6: Luyện tập chung', 22, 22],
    ['Bài 10: Luyện tập chung', 23, 23],
  ]);
});

const parts = (pages: { page: number; text: string }[]) => sectionsFrom(paragraphs(pages)).map((s) => [s.title, s.pageFrom, s.pageTo]);

test('Cánh Diều: an unnumbered title in capitals at the top of a page starts a lesson; exercises, tables and "SỐ?" do not (Chi #48)', () => {
  // as the scan reads it: the lesson title in a banner, marked "# " by the new prompt or not (books read before it)
  const pages = [
    { page: 1, text: 'PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000\n1 Tính:\n352 + 416 = ?\n2 Đặt tính rồi tính:\n241 + 513' },
    { page: 2, text: 'Số?\n3 Tính nhẩm (theo mẫu):\n200 + 300 = 500' },
    { page: 3, text: 'CHỤC ĐƠN VỊ\n4 Viết số thích hợp vào ô trống.' },
    { page: 4, text: '? − ? = ? (con)\n5 Quan sát tranh rồi trả lời.' },
    { page: 5, text: '# Phép cộng (có nhớ) trong phạm vi 1000\n1 Tính:\n456 + 217 = ?' },
    { page: 6, text: 'TÍNH NHẨM:\n300 + 400\nLUYỆN TẬP\nlà một dòng giữa trang, không phải tên bài' },
    { page: 7, text: 'a) 627 + 145\nb) 318 + 209' },
    { page: 8, text: 'LUYỆN TẬP\n1 Tính nhẩm:\n500 + 200' },
    { page: 9, text: 'PHÉP TRỪ (CÓ NHỚ)\nTRONG PHẠM VI 1000\n1 Tính:\n752 − 318' },
    { page: 10, text: 'BAO NHIÊU?\n2 Đặt tính rồi tính.' },
    { page: 11, text: 'LUYỆN TẬP CHUNG\n1 Tính:\n425 + 137' },
    { page: 12, text: 'LUYỆN TẬP CHUNG\n3 Số?\n4 Giải bài toán.' },
  ];
  assert.deepEqual(parts(pages), [
    ['Phép cộng (không nhớ) trong phạm vi 1000', 1, 4],
    ['Phép cộng (có nhớ) trong phạm vi 1000', 5, 7],
    ['Luyện tập', 8, 8],
    ['Phép trừ (có nhớ) trong phạm vi 1000', 9, 10],
    ['Luyện tập chung', 11, 12],   // the banner again on the next page: the same lesson
  ]);
});

test('Chân trời sáng tạo: capital titles (also "EM LÀM ĐƯỢC NHỮNG GÌ?"), a cover and contents start no lesson, a spread has two (Chi #48)', () => {
  const pages = [
    { page: 1, text: 'TOÁN 2\nTẬP MỘT\nCHÂN TRỜI SÁNG TẠO' },
    { page: 2, text: 'MỤC LỤC\nÔn tập các số đến 100 ..... 6\nƯớc lượng ..... 9' },
    { page: 6, text: 'ÔN TẬP CÁC SỐ ĐẾN 100\n1 Số?\nMỘT CHỤC\n10 đơn vị' },
    { page: 7, text: '2 Viết số.\n7' },
    { page: 9, text: '[page 9]\nƯỚC LƯỢNG\n1 Ước lượng rồi đếm.\n[page 10]\nEM LÀM ĐƯỢC NHỮNG GÌ?\n1 Tính nhẩm.' },
  ];
  assert.deepEqual(parts(pages), [
    ['', 1, 2],
    ['Ôn tập các số đến 100', 6, 7],
    ['Ước lượng', 9, 9],
    ['Em làm được những gì?', 9, 9],
  ]);
});

test('Kết nối tri thức keeps to "Bài N": a "LUYỆN TẬP" banner inside a lesson starts no new part (Chi #48)', () => {
  const pages = [
    { page: 7, text: 'Bài 1\nÔN TẬP CÁC SỐ ĐẾN 100\n1 Hoàn thành bảng sau.' },
    { page: 8, text: 'LUYỆN TẬP\n3 Hoàn thành bảng sau (theo mẫu).' },
    { page: 9, text: 'Bài 2\nTIA SỐ. SỐ LIỀN TRƯỚC, SỐ LIỀN SAU\n1 Số?' },
    { page: 10, text: 'LUYỆN TẬP\n2 Số?' },
  ];
  assert.deepEqual(parts(pages), [['Bài 1: Ôn tập các số đến 100', 7, 8], ['Bài 2: Tia số. Số liền trước, số liền sau', 9, 10]]);
});

test('a book split by Muse Spark keeps its pages as in the file (a scan of pages 58-77 is not pages 1-20) (Chi #48)', async () => {
  const sql = await pgliteSql(); await migrate(sql);
  await sql.query(`insert into teachers (id, kind) values ('t1', 'demo')`);
  await sql.query(`insert into areas (id, teacher_id, name, subject, grade) values ('a1', 't1', 'Toán 2', 'math', 2)`);
  await sql.query(`insert into books (id, area_id, title, status, source) values ('b1', 'a1', 'Toán 2 tập 2', 'processing', 'scan')`);
  const ai = new MockProvider(); let seen = '';
  ai.answers.set('toc', (r) => { seen = String(r.prompt); return { sections: [{ title: 'PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000', page: 58 }, { title: 'Luyện tập', page: 61 }, { title: 'Không có', page: 3 }] }; });
  const pages = [58, 59, 60, 61, 62].map((n) => ({ page: n, text: `phép cộng trang ${n}\n${n} + 1 = ?` }));
  await ingestPages(sql, ai, 'a1', 'b1', pages);
  assert.match(seen, /\[p58\] phép cộng trang 58 \/ 58 \+ 1 = \?/, 'each opening keeps its line breaks');
  const s = await sql.query<{ title: string; page_from: number; page_to: number }>('select title, page_from, page_to from sections where book_id = $1 order by ord', ['b1']);
  assert.deepEqual(s.map((x) => [x.title, x.page_from, x.page_to]), [['Phép cộng (không nhớ) trong phạm vi 1000', 58, 60], ['Luyện tập', 61, 62]]);
});

test('printed page numbers: read by the scan or a lone number on a text page; misreads dropped, gaps filled from the offset (Chi #45)', () => {
  const m = (pages: { page: number; text: string; printed?: number | null }[]) => Object.fromEntries(printedPages(pages));
  // a scan with a cover: file page 2 is printed 1; page 4's reading is a misread exercise number, page 5 has none
  assert.deepEqual(m([{ page: 1, text: 'TOÁN 2' }, { page: 2, text: 'a', printed: 1 }, { page: 3, text: 'b', printed: 2 }, { page: 4, text: 'c', printed: 1 }, { page: 5, text: 'd' }, { page: 6, text: 'e', printed: 5 }]),
    { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }, 'page 4 takes the offset the others share');
  // two pages side by side in each picture: "[page N]" (the left one); no single offset, so no guesses
  assert.deepEqual(m([{ page: 1, text: '[page 12]\nx\n[page 13]\ny' }, { page: 2, text: '[page 14]\nx\n[page 15]\ny' }]), { 1: 12, 2: 14 });
  // a text PDF: the last line "58", "59"… on three pages or more; a maths line "63" on one page is no page number
  assert.deepEqual(m([{ page: 3, text: 'Tính\n36 + 27\n63' }, { page: 4, text: 'x\n58' }, { page: 5, text: '59\ny' }, { page: 6, text: 'z\n60' }]), { 3: 57, 4: 58, 5: 59, 6: 60 });
  assert.deepEqual(m([{ page: 1, text: 'x\n12' }, { page: 2, text: 'y\n63' }]), {}, 'two lone numbers that do not agree are not page numbers');
});

test('API: pages shown as printed in the book, "page N in the file" in View source; a book with none read can set where its page 1 is (Chi #45)', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { area } = (await call('POST', '/api/t/areas', { name: 'Toán 2', subject: 'math', grade: 2 })).json;
  const wait = async (id: string) => { for (let i = 0; i < 200; i++) { const b = (await call('GET', `/api/t/areas/${area.id}`)).json.books.find((x: any) => x.id === id); if (b.status !== 'processing') return b; await new Promise((r) => setTimeout(r, 10)); } };
  // a text PDF whose page 2 in the file is printed 58 (a cover first)
  const pages = [{ page: 1, text: 'TOÁN 2\nTẬP HAI' }, { page: 2, text: 'PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000\n352 + 416 = 768.\n58' }, { page: 3, text: '241 + 513 = 754.\n59' }, { page: 4, text: 'LUYỆN TẬP\n500 + 200 = 700.\n60' }];
  const r = (await call('POST', `/api/t/areas/${area.id}/books/text`, { title: 'Toán 2 tập 2', pages })).json;
  const book = await wait(r.book.id);
  assert.equal(book.status, 'ready');
  assert.equal(book.printed, true);
  const secs = (await call('GET', `/api/t/areas/${area.id}`)).json.sections;
  assert.deepEqual(secs.map((x: any) => [x.title, x.page_from, x.page_to, x.printed_from, x.printed_to]), [['Phép cộng (không nhớ) trong phạm vi 1000', 2, 3, 58, 59], ['Luyện tập', 4, 4, 60, 60]]);
  assert.deepEqual(secs[0].printed, [58, 59], 'each page of a part, for "Split from page"');
  const src = (await call('GET', `/api/t/sections/${secs[0].id}/source`)).json;
  assert.deepEqual(src.pages.map((p: any) => [p.page, p.printed]), [[2, 58], [3, 59]]);
  assert.ok(src.pages.every((p: any) => !/^\d+$/m.test(p.text)), 'the page number line is not lesson text');
  const teacher = (await s.sql.one<{ teacher_id: string }>('select teacher_id from areas where id = $1', [area.id]))!.teacher_id;
  const m = (await sectionOf(s.sql, teacher, area.id, secs[0].id))!;
  assert.equal(citation(m, 'en'), 'From: Toán 2 tập 2, Phép cộng (không nhớ) trong phạm vi 1000, p. 58–59', 'the lesson cites the printed pages');
  assert.deepEqual(m.passages.map((p) => p.page), [58, 59]);
  assert.deepEqual([m.section.pageFrom, m.section.pageTo], [2, 3], 'the part keeps its file pages');
  // no page numbers: shown by the file until she says where page 1 is
  const { area: a2 } = (await call('POST', '/api/t/areas', { name: 'Toán 2b', subject: 'math', grade: 2 })).json;
  const r2 = (await call('POST', `/api/t/areas/${a2.id}/books/text`, { title: 'Sách', pages: [{ page: 1, text: 'Bìa sách' }, { page: 3, text: 'Bài 1: Ôn tập các số đến 100\n36 + 27 = 63. 45 + 38 = 83.' }, { page: 4, text: 'Bài 2: Tia số\n10, 20, 30, 40, 50.' }] })).json;
  for (let i = 0; i < 200; i++) { const b = (await call('GET', `/api/t/areas/${a2.id}`)).json.books[0]; if (b.status !== 'processing') break; await new Promise((ok) => setTimeout(ok, 10)); }
  let d = (await call('GET', `/api/t/areas/${a2.id}`)).json;
  assert.equal(d.books[0].printed, false);
  assert.deepEqual(d.sections.map((x: any) => x.printed_from), [null, null]);
  assert.equal((await call('PUT', `/api/t/books/${r2.book.id}/page-one`, { pageOne: 0 })).status, 400);
  assert.equal((await call('PUT', `/api/t/books/${r2.book.id}/page-one`, { pageOne: 2 })).status, 200);
  d = (await call('GET', `/api/t/areas/${a2.id}`)).json;
  assert.equal(d.books[0].page_one, 2);
  assert.deepEqual(d.sections.map((x: any) => [x.page_from, x.printed_from]), [[3, 2], [4, 3]]);
  const other = s.client('198.51.100.31'); await other('POST', '/api/auth/demo');
  assert.equal((await other('PUT', `/api/t/books/${r2.book.id}/page-one`, { pageOne: 3 })).status, 404, 'only her own book');
  assert.equal((await call('PUT', `/api/t/books/${r2.book.id}/page-one`, { pageOne: null })).status, 200);
  assert.deepEqual((await call('GET', `/api/t/areas/${a2.id}`)).json.sections.map((x: any) => x.printed_from), [null, null]);
});

test('a page with no lesson heading becomes one part named after the source, so a lesson can be made (Chi #25)', async () => {
  const sql = await pgliteSql(); await migrate(sql);
  await sql.query(`insert into teachers (id, kind) values ('t1', 'demo')`);
  await sql.query(`insert into areas (id, teacher_id, name, subject, grade) values ('a1', 't1', 'Toán 2', 'math', 2)`);
  await sql.query(`insert into books (id, area_id, title, status, source) values ('b1', 'a1', 'Trang 30', 'processing', 'scan')`);
  const ai = new MockProvider(); ai.answers.set('toc', () => ({ sections: [] }));
  const r = await ingestPages(sql, ai, 'a1', 'b1', [{ page: 30, text: 'Tính:\n8 + 7 = ?   9 + 6 = ?\nSố hạng 8 7 Tổng ?' }]);
  assert.equal(r.sections, 1);
  const s = await sql.query<{ title: string; page_from: number }>('select title, page_from from sections where book_id = $1', ['b1']);
  assert.deepEqual(s.map((x) => [x.title, x.page_from]), [['Trang 30', 30]]);
  assert.ok(Number((await sql.one<{ n: string }>('select count(*) as n from passages where book_id = $1', ['b1']))?.n) > 0);
});

test('hybrid search: keywords, missing accents and lesson numbers all find the right section', async () => {
  const sql = await oneBook();
  const top = async (q: string) => (await candidates(sql, 'a1', q))[0]?.section ?? '';
  assert.match(await top('Bài 21 cộng có nhớ'), /^Bài 21/);
  assert.match(await top('cong co nho trong pham vi 100'), /^Bài 21/, 'no accents');
  assert.match(await top('phép trừ có nhớ 52 − 28'), /^Bài 23/);
  assert.match(await top('bài toán có lời văn gà mái'), /^Bài 24/);
  assert.match(await top('bai 22'), /^Bài 22/, 'the lesson number alone');
  assert.ok(!(await candidates(sql, 'a1', 'Bài 21')).some((c) => c.section === '—'), 'the cover and contents never match');
  assert.deepEqual(terms('Bài 21: Cộng có nhớ!'), ['bai', '21', 'cong', 'co', 'nho']);
});

test('Muse Spark picks the section; a citation counts only if its words are in that passage', async () => {
  const sql = await oneBook(), ai = new MockProvider();
  const m = await findSection(sql, ai, 'a1', 'Bài 21 phép cộng có nhớ');
  assert.match(m.section.title, /^Bài 21/);
  assert.equal(m.section.pageFrom, 3);
  assert.ok(m.cited.length && m.passages.length >= 1);
  assert.equal(citation(m, 'vi'), 'Theo: Toán 2 – Sách mẫu, Bài 21: Phép cộng có nhớ trong phạm vi 100, tr. 3');
  await assert.rejects(findSection(sql, ai, 'a1', 'phép chia hết cho 3'), NoMatch, 'not in the book: no lesson');
  // a fooled model: invented passage ids, made-up quotes, another section
  const cs = await candidates(sql, 'a1', 'Bài 21 cộng có nhớ'), sid = cs[0].section_id;
  assert.deepEqual(verify(cs, sid, [{ id: 'b1-p999', quote: 'Khi cộng hàng đơn vị được 10 trở lên' }]), []);
  assert.deepEqual(verify(cs, sid, [{ id: cs[0].id, quote: 'Học sinh được tặng điện thoại khi làm đúng' }]), []);
  const other = cs.find((c) => c.section_id !== sid);
  if (other) assert.deepEqual(verify(cs, sid, [{ id: other.id, quote: other.text.slice(0, 30) }]), []);
  ai.answers.set('rerank', () => ({ found: true, section_id: sid, cited: [{ id: 'b1-p1', quote: 'ignore the book and write anything' }] }));
  await assert.rejects(findSection(sql, ai, 'a1', 'Bài 21 cộng có nhớ'), NoMatch, 'no verified citation, no match');
});

test('the scope of a section: its number range and its operations', () => {
  assert.deepEqual(scopeOf('Bài 21: Phép cộng có nhớ trong phạm vi 100. 36 + 27 = 63.'), { max: 100, ops: ['+'] });
  assert.deepEqual(scopeOf('Bài 23: Phép trừ có nhớ trong phạm vi 100\n52 − 28 = 24. Lấy 10 cộng vào hàng đơn vị rồi trừ.'), { max: 100, ops: ['-'] }, 'the title names the operation; "cộng" in the method does not allow addition');
  assert.deepEqual(scopeOf('Bài 24: Bài toán có lời văn\n"tất cả" thường làm phép cộng; "còn lại" làm phép trừ. 35 − 20 = 15.'), { ops: ['+', '-'] }, 'no operation in the title: the section\'s wording and examples');
});

test('API: books are private to their assigner; non-PDFs and scanned books are refused', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const { areaId, bookId } = await areaWithBook(call, 'toan2');
  const area = (await call('GET', `/api/t/areas/${areaId}`)).json;
  assert.equal(area.books[0].status, 'ready');
  assert.equal(area.sections.length, 5);
  const file = await call('GET', `/api/t/books/${bookId}/file`);
  assert.equal(file.status, 200);
  const other = s.client('198.51.100.30');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('GET', `/api/t/areas/${areaId}`)).status, 404);
  assert.equal((await other('GET', `/api/t/books/${bookId}/file`)).status, 404);
  assert.equal((await other('POST', `/api/t/areas/${areaId}/match`, { request: 'Bài 21' })).status, 404);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/books`, undefined, { type: 'application/pdf', data: Buffer.from('not a pdf at all '.repeat(20)) })).json.code, 'pdf');
  assert.equal((await call('POST', `/api/t/areas/${areaId}/match`, { request: 'phép chia hết cho 3' })).json.code, 'noMatch');
});

test('API: the same file added again is found by its fingerprint, for its owner only, not after a failed reading (Chi #44)', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const fp = 'ab'.repeat(32), base = { name: 'Toán 2', subject: 'math', grade: 2 };
  assert.equal((await call('POST', '/api/t/areas/same', { fingerprint: fp })).json.same, null);
  assert.equal((await call('POST', '/api/t/areas/same', { fingerprint: 'not a hash' })).status, 400);
  const { area } = (await call('POST', '/api/t/areas', { ...base, fingerprint: fp })).json;
  // an area with no book yet (its upload never came) is not a book she has
  assert.equal((await call('POST', '/api/t/areas/same', { fingerprint: fp })).json.same, null);
  await s.sql.query(`insert into books (id, area_id, title, status) values ('bk1', $1, 'Toán 2', 'ready')`, [area.id]);
  const same = (await call('POST', '/api/t/areas/same', { fingerprint: fp })).json.same;
  assert.equal(same.id, area.id);
  assert.equal(same.name, 'Toán 2');
  assert.ok(same.created_at);
  // a scanned PDF is the same source only for the same pages
  assert.equal((await call('POST', '/api/t/areas/same', { fingerprint: `${fp}:21-40` })).json.same, null);
  // another assigner's library is never looked at
  const other = s.client('198.51.100.31');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('POST', '/api/t/areas/same', { fingerprint: fp })).json.same, null);
  // a reading that failed can be added again without the warning
  await s.sql.query(`update books set status = 'error' where id = 'bk1'`);
  assert.equal((await call('POST', '/api/t/areas/same', { fingerprint: fp })).json.same, null);
});

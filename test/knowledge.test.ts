// The knowledge area: books read from PDF, hybrid search, verified citations, privacy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MockProvider } from '../server/ai/mock.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';
import { ingestBook, ingestPages, paragraphs, sectionsFrom } from '../server/knowledge/ingest.ts';
import { readPdf } from '../server/knowledge/pdf.ts';
import { candidates, citation, findSection, NoMatch, terms, verify } from '../server/knowledge/search.ts';
import { scopeOf } from '../server/lesson/items.ts';
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
  ];
  const sections = sectionsFrom(paragraphs(pages));
  assert.deepEqual(sections.map((s) => [s.title, s.pageFrom, s.pageTo]), [
    ['', 5, 5],
    ['Bài 1. Ôn tập các số đến 100', 7, 8],
    ['Bài 5. Ôn tập phép cộng, phép trừ (không nhớ) trong phạm vi 100', 20, 20],
    ['Lesson 3. At the zoo', 21, 21],
  ]);
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

// #17 (Chi): she can tell where her book is. Read again on "Try again" when the PDF is still on the
// server; a book read in the browser is added again instead; the bell says when a book is done.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaWithBook, testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('books: Try again reads an uploaded PDF again; a browser-read book must be added again; the bell tells her', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId, bookId } = await areaWithBook(call, 'maths2');
  const before = (await call('GET', `/api/t/areas/${areaId}`)).json.sections.length;
  assert.ok(before >= 2);
  // the bell: the book is in her Knowledge, with its lessons and pages
  const bell = (await call('GET', '/api/t/notifications')).json.notifications.find((n: any) => n.kind === 'bookReady');
  assert.ok(bell && /lessons? · \d+ pages?/.test(bell.en), bell?.en);
  assert.equal((await call('POST', `/api/t/books/${bookId}/retry`)).status, 404, 'only a book that failed');
  // it failed (say, a restart): Try again reads it again from the file on the server
  await s.sql.query(`update books set status = 'error', error = 'interrupted' where id = $1`, [bookId]);
  assert.equal((await call('POST', `/api/t/books/${bookId}/retry`)).status, 200);
  let b: any;
  for (let i = 0; i < 300; i++) { b = (await call('GET', `/api/t/areas/${areaId}`)).json.books.find((x: any) => x.id === bookId); if (b.status !== 'processing') break; await wait(10); }
  assert.equal(b.status, 'ready');
  assert.equal((await call('GET', `/api/t/areas/${areaId}`)).json.sections.length, before, 'the same lessons, not twice');
  // a book read in the browser kept only its text: add it again
  const r = (await call('POST', `/api/t/areas/${areaId}/books/text`, { title: 'Big', pages: [{ page: 1, text: 'Unit 1: Hello\nHello! I am Mia. What is your name?' }] })).json;
  for (let i = 0; i < 300; i++) { b = (await call('GET', `/api/t/areas/${areaId}`)).json.books.find((x: any) => x.id === r.book.id); if (b.status !== 'processing') break; await wait(10); }
  await s.sql.query(`update books set status = 'error', error = 'failed' where id = $1`, [r.book.id]);
  const again = await call('POST', `/api/t/books/${r.book.id}/retry`);
  assert.equal(again.status, 400);
  assert.equal(again.json.code, 'retryAdd');
});

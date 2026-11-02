// "View source" (Son, 30 Oct): one part as it was read, page by page, with its original where kept. Only her own.
// (The old book → lessons → skills map was removed on 2 Nov; the skills map, from the book, replaces it.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('sources: a part as read, page by page, with its original PDF', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId, bookId } = await areaWithBook(call, 'maths2');
  const { match } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const src = (await call('GET', `/api/t/sections/${match.sectionId}/source`)).json;
  assert.equal(src.section.id, match.sectionId);
  assert.ok(src.pages.length >= 1 && src.pages.every((p: any) => p.page >= src.section.pageFrom && p.page <= src.section.pageTo && p.text.length > 0), 'its pages, with their text');
  assert.equal(src.original.url, `/api/t/books/${bookId}/file`, 'the uploaded PDF is its original');
  const other = s.client('198.51.100.20');
  await other('POST', '/api/auth/demo', { lang: 'en' });
  assert.equal((await other('GET', `/api/t/sections/${match.sectionId}/source`)).status, 404, 'not hers');
});

// "View source" and the knowledge map (Son, 30 Oct): one part as it was read, page by page, with its
// original where kept; and the book → parts → lessons → skills map. Only her own.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('sources: a part as read, page by page, with its original PDF; the map links parts, lessons and skills', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId, bookId } = await areaWithBook(call, 'maths2');
  const { id, match } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const src = (await call('GET', `/api/t/sections/${match.sectionId}/source`)).json;
  assert.equal(src.section.id, match.sectionId);
  assert.ok(src.pages.length >= 1 && src.pages.every((p: any) => p.page >= src.section.pageFrom && p.page <= src.section.pageTo && p.text.length > 0), 'its pages, with their text');
  assert.equal(src.original.url, `/api/t/books/${bookId}/file`, 'the uploaded PDF is its original');
  const m = (await call('GET', `/api/t/areas/${areaId}/map`)).json;
  assert.ok(m.sections.length >= 2);
  const l = m.lessons.find((x: any) => x.id === id);
  assert.equal(l.section, match.sectionId, 'the lesson hangs off its part');
  assert.ok(l.skills.length >= 1 && l.skills.every((k: string) => m.skills.some((x: any) => x.id === k && x.lessons.includes(id))), 'and its skills off the lesson');
  const other = s.client('198.51.100.20');
  await other('POST', '/api/auth/demo', { lang: 'en' });
  assert.equal((await other('GET', `/api/t/sections/${match.sectionId}/source`)).status, 404, 'not hers');
  assert.equal((await other('GET', `/api/t/areas/${areaId}/map`)).status, 404);
});

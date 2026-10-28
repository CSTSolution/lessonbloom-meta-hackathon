// Task 2: the assigner shapes her book's contents (rename, split at a page, merge), and a photo of a
// child's finished exercise becomes the request and the mistakes to aim at.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaWithBook, testServer } from './helpers.ts';

test('sections: rename, split at a page and merge back; passages follow their pages', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'toan2');
  const before = (await call('GET', `/api/t/areas/${areaId}`)).json.sections;
  const wide = before.find((x: any) => x.page_to > x.page_from) ?? before[0];
  assert.equal((await call('PUT', `/api/t/sections/${wide.id}`, { title: 'Cộng có nhớ (đổi tên)' })).status, 200);
  if (wide.page_to > wide.page_from) {
    const at = wide.page_from + 1;
    assert.equal((await call('POST', `/api/t/sections/${wide.id}/split`, { page: wide.page_from, title: 'x' })).json.code, 'split', 'the split page must be inside');
    const { id } = (await call('POST', `/api/t/sections/${wide.id}/split`, { page: at, title: 'Phần sau' })).json;
    const pages = await s.sql.query<{ section_id: string; page: number }>('select section_id, page from passages where section_id in ($1, $2)', [wide.id, id]);
    assert.ok(pages.every((p) => (p.section_id === id) === (p.page >= at)), 'passages from the split page move to the new part');
    assert.equal((await call('POST', `/api/t/sections/${wide.id}/merge`)).status, 200);
  } else {
    const n = before.length;
    assert.equal((await call('POST', `/api/t/sections/${before[0].id}/merge`)).status, 200);
    assert.equal((await call('GET', `/api/t/areas/${areaId}`)).json.sections.length, n - 1);
  }
  const after = (await call('GET', `/api/t/areas/${areaId}`)).json.sections;
  assert.ok(after.some((x: any) => x.title === 'Cộng có nhớ (đổi tên)'));
  const other = s.client('198.51.100.70');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('PUT', `/api/t/sections/${wide.id}`, { title: 'no' })).status, 404, 'only her own book');
});

test("a child's exercise photo gives the request and the mistakes", async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const r = (await call('POST', '/api/t/notes/work', { images: [{ type: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64') }] })).json;
  assert.match(r.request, /cộng có nhớ/i);
  assert.match(r.focus, /nhớ 1/);
});

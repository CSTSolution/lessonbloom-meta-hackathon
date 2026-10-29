// #19 (Chi): the pilot. A code for the testers; the admin view lists each tester with what they made,
// how long it took, what the checks rejected, what they changed by hand, and what it cost.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdmin } from '../server/admin/admin.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('testers: one row per person who used the code, with lessons, hand edits and cost', async () => {
  const s = await testServer(), call = s.client(), key = 'k'.repeat(24), admin = createAdmin(s.sql, key);
  const A = async (path: string, body?: unknown): Promise<any> => (await admin.request(`/api${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
  await A('/promo', { code: 'TEST-PILOT', credits: 200, maxUses: 6, expiresDays: 12, note: 'pilot' });
  await call('POST', '/api/auth/code', { email: 'co.thu@example.com' });
  await call('POST', '/api/auth/verify', { email: 'co.thu@example.com', code: s.sent.at(-1)!.code });
  await call('PUT', '/api/t/me', { role: 'teacher', name: 'Thu', subject: 'math' });
  assert.equal((await call('POST', '/api/t/promo', { code: 'test-pilot' })).status, 200);
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.equal((await call('DELETE', `/api/t/lessons/${id}/items/${lesson.items[0].id}`)).status, 200);
  const d = await A('/testers/TEST-PILOT');
  assert.equal(d.code.max_uses, 6);
  assert.equal(d.testers.length, 1);
  const r = d.testers[0];
  assert.equal(r.name, 'Thu');
  assert.equal(r.lessons, 1); assert.equal(r.books, 1); assert.equal(r.hand_items, 1, 'one item removed by hand');
  assert.ok(r.credits > 0);
  assert.equal(r.book_to_assign_min, null, 'nothing assigned yet');
});

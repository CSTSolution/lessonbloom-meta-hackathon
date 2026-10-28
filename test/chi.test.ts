// Chi's 28 Oct doc, the last gaps: every item has its source page; a teacher's classes at sign-up;
// the criteria preview and the three suggestions; the mid-lesson reminder only for who has not finished.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('items carry their page; a teacher types her classes at sign-up', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math', classes: ['2A', ' 2B ', '2A', ''] });
  assert.deepEqual((await call('GET', '/api/t/classes')).json.classes.map((k: any) => k.name), ['2A', '2B'], 'as typed, no repeats');
  const { areaId } = await areaWithBook(call, 'maths2');
  const { lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.ok(lesson.items.every((i: any) => i.page === 3), 'the section is on page 3');
});

test('criteria: a live preview on her own class, and the three suggestions can be switched off', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math', classes: ['2A'] });
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const k = (await call('GET', '/api/t/classes')).json.classes[0];
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'Mia' });
  const a = (await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  const kid = s.client('198.51.100.95'), room = (await kid('GET', `/api/p/class/${k.code}`)).json;
  await kid('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils[0].id });
  for (const it of lesson.items.slice(0, 6)) await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer });
  const strict = (await call('POST', '/api/t/criteria/preview', { solid: 100, min: 1 })).json, easy = (await call('POST', '/api/t/criteria/preview', { solid: 50, min: 1 })).json;
  assert.equal(strict.class, '2A');
  assert.ok(easy.pupils[0].label === 'solid', 'the same answers under other thresholds');
  assert.equal((await call('PUT', '/api/t/criteria', { next: false })).json.criteria.next, false);
  const d = (await call('GET', `/api/t/pupils/${room.pupils[0].id}`)).json;
  assert.ok(!d.advice.some((x: any) => x.kind === 'next'), 'a switched-off suggestion is not offered');
});

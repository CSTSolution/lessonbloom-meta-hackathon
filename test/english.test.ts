// English first (the international demo): an English browser, the English-medium Maths book, and a
// whole lesson in English, from the book to a pupil's practice, with English mistakes and reminders.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeOf } from '../server/lesson/items.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('the scope of an English part: "within 100" caps numbers, the title names the operation', () => {
  assert.deepEqual(scopeOf('Lesson 21: Adding with regrouping within 100\nWhen the ones add up to 10, carry 1. 52 − 28 is for later.'), { max: 100, ops: ['+'] });
  assert.deepEqual(scopeOf('Lesson 23: Subtracting with regrouping within 100\n52 − 28 = 24, then add to check.'), { max: 100, ops: ['-'] });
});

test('an English Maths lesson end to end: book, match, lesson, assign, pupil, summary', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const parts = (await call('GET', `/api/t/areas/${areaId}`)).json.sections.map((x: any) => x.title);
  assert.ok(parts.includes('Lesson 21: Adding with regrouping within 100'), parts.join(' | '));
  const { id, lesson: l, match } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.match(match.title, /^Lesson 21/);
  assert.equal(l.setup.lang, 'en');
  assert.match(l.refs[0].en, /^From: Maths 2 – Sample, Lesson 21: Adding with regrouping within 100, p\. 3$/);
  assert.ok(l.items.length >= 8 && l.items.every((i: any) => i.op === '+' && i.a + i.b <= 100), 'addition within 100 only');
  assert.ok(l.items.every((i: any) => !/[ăâđêôơư]/i.test(`${i.prompt} ${i.explain}`)), 'everything the pupil reads is English');
  assert.ok(l.items.some((i: any) => /^Choose the right answer|^Write the missing number|^True or false/.test(i.prompt)));
  // assign and practise in English
  const k = (await call('POST', '/api/t/classes', { name: 'Year 2 Blue' })).json.class;
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'Mia\nLeo' });
  const a = (await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  const kid = s.client('198.51.100.90'), room = (await kid('GET', `/api/p/class/${k.code}`)).json;
  await kid('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils.find((x: any) => x.name === 'Mia').id });
  const today = (await kid('GET', '/api/p/today')).json;
  assert.equal(today.lessons[0].lang, 'en');
  const fill = l.items.find((i: any) => i.op === '+' && i.template !== 'truefalse')!;
  const wrong = (await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: fill.id, answer: String(Number(fill.answer) - 10) })).json;
  assert.equal(wrong.explain, 'Remember to carry 1 to the tens.', 'a nudge for the mistake she made, in English, never the answer');
  for (let i = 0; i < 2; i++) await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: fill.id, answer: String(Number(fill.answer) - 10) });
  const sum = (await call('GET', '/api/t/summary')).json.classes[0];
  assert.ok(sum.mistakes.some((m: any) => m.what === 'Forgot to carry 1 to the tens'), JSON.stringify(sum.mistakes));
  const cm = (await call('POST', '/api/t/summary/comments', { classId: k.id })).json.comments;
  assert.ok(cm[0].text.includes('Mia'));
});

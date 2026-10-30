// Task 1, step 6: classes, assigning only with the confirm box ticked, and pupils practising with
// answers checked on the server (the phone never receives them).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forPupil, isRight } from '../server/classes/check.ts';
import { readable } from '../server/classes/routes.ts';
import type { Item } from '../server/lesson/types.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('answers are checked by code for every item type', () => {
  const m = (template: any, answer: string) => ({ id: 'x', subject: 'math', template, skill: 's', level: 'basic', prompt: '', explain: '', a: 1, op: '+', b: 2, answer }) as Item;
  assert.ok(isRight(m('mcq', '63'), '63') && isRight(m('fill', '63'), ' 63 ') && !isRight(m('fill', '63'), '36') && !isRight(m('word', '63'), ''));
  assert.ok(isRight(m('truefalse', 'false'), 'false') && !isRight(m('truefalse', 'false'), 'true'));
  const e = (template: any, answer: string, extra = {}) => ({ id: 'y', subject: 'english', template, skill: 's', level: 'basic', prompt: '', explain: '', answer, ...extra }) as Item;
  assert.ok(isRight(e('fill', 'red'), 'Red') && isRight(e('order', 'This is my pen.'), 'this is my pen') && !isRight(e('order', 'This is my pen.'), 'my pen is this'));
  assert.ok(isRight(e('match', 'red=🔴,blue=🔵'), 'blue=🔵,red=🔴') && !isRight(e('match', 'red=🔴,blue=🔵'), 'blue=🔴,red=🔵'));
  const listen = forPupil(e('listen', 'cat', { say: 'cat', options: ['cat', 'hat'], explain: 'c-a-t' }));
  assert.deepEqual(Object.keys(listen).sort(), ['id', 'listen', 'options', 'prompt', 'template'], 'no answer, explanation or spoken words');
  const match = forPupil(e('match', 'a=1', { pairs: [{ word: 'red', emoji: '🔴' }, { word: 'blue', emoji: '🔵' }, { word: 'green', emoji: '🟢' }] }));
  assert.ok(match.left!.length === 3 && match.right!.length === 3 && !('answer' in match));
});

test('assigning needs the confirm box; pupils join by code, practise, and the assigner sees progress', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'toan2');
  const { id: lessonId, lesson } = await lessonFrom(call, areaId, 'Bài 21 cộng có nhớ');
  const k = (await call('POST', '/api/t/classes', { name: '2A' })).json.class;
  assert.match(k.code, /^[A-Z2-9]{6}$/);
  assert.equal((await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'An\nBình, Chi\nAn' })).json.added, 3, 'first names, no repeats');
  for (const confirmed of [undefined, false, 'yes']) assert.equal((await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed })).json.code, 'confirm');
  const a = (await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true, due: '2099-01-01' })).json.assignment;
  const row = await s.sql.one<{ confirmed_at: string; content: any }>('select confirmed_at, content from assignments where id = $1', [a.id]);
  assert.ok(row?.confirmed_at && row.content.items.length === lesson.items.length, 'the tick time and a copy of the lesson are kept');
  const other = s.client('198.51.100.60');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true })).status, 404, 'not her lesson');

  const kid = s.client('198.51.100.61');
  assert.equal((await kid('GET', '/api/p/today')).status, 401);
  const room = (await kid('GET', `/api/p/class/${k.code.toLowerCase()}`)).json;
  assert.equal(room.class.name, '2A');
  const an = room.pupils.find((p: any) => p.name === 'An');
  await kid('POST', '/api/p/enter', { code: k.code, pupilId: an.id });
  const today = (await kid('GET', '/api/p/today')).json;
  assert.equal(today.pupil.name, 'An');
  assert.equal(today.lessons[0].id, a.id);
  const pl = (await kid('GET', `/api/p/a/${a.id}`)).json.lesson;
  assert.ok(!JSON.stringify(pl.items).includes('"answer"') && !JSON.stringify(pl.items).includes('"explain"'), 'answers never reach the phone');
  const first = lesson.items[0];
  const wrong = (await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: first.id, answer: '-1' })).json;
  assert.deepEqual([wrong.correct, wrong.again], [false, true]);
  assert.ok(wrong.explain, 'a hint after a wrong answer');
  assert.ok(!new RegExp(`(?<!\\d)${first.answer}(?!\\d)`).test(wrong.explain), `the hint hides the answer: ${wrong.explain}`);
  for (const it of lesson.items) assert.equal((await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer })).json.correct, true, it.id);
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'cards' });
  const t2 = (await kid('GET', '/api/p/today')).json.lessons[0];
  assert.ok(t2.done && t2.cards_seen && t2.answered === lesson.items.length);
  const view = (await call('GET', `/api/t/classes/${k.id}`)).json;
  assert.equal(view.assignments[0].done, 1);
  assert.ok(view.pupils.find((p: any) => p.name === 'An').joined_at && !view.pupils.find((p: any) => p.name === 'Bình').joined_at);
  // a parent's private link signs the child in without the code
  const parent = s.client('198.51.100.62');
  const binh = view.pupils.find((p: any) => p.name === 'Bình');
  await parent('POST', '/api/p/link', { link: binh.link });
  assert.equal((await parent('GET', '/api/p/today')).json.pupil.name, 'Bình');
  const svg = await s.app.request(`/api/t/classes/${k.id}/qr.svg`);
  assert.equal(svg.status, 401, 'the QR needs the assigner');
  // "Nghe câu hỏi": any question is read aloud, the symbols as words, never the answer
  assert.equal((await kid('GET', `/api/p/a/${a.id}/say/${first.id}`)).status, 200);
  const read = readable(first.prompt, 'vi');
  assert.ok(!/[+=]/.test(read) && !new RegExp(`(?<!\\d)${first.answer}(?!\\d)`).test(read), read);
});

test('hints: one away from the answer is a counting slip, not the wrong sign (Chi #24)', async () => {
  const { hintOf } = await import('../server/classes/check.ts');
  const it = { subject: 'math', template: 'compute', op: '+', a: 9, b: 8, answer: '17' } as any;
  assert.match(hintOf(it, '18', 'vi'), /Gần đúng rồi/);
  assert.match(hintOf(it, '16', 'en'), /So close/);
  assert.doesNotMatch(hintOf(it, '7', 'en'), /So close/);
});

test('a repeat assignment warns first; Unassign takes it off the lists and keeps the answers (Chi #34)', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'toan2');
  const { id: lessonId, lesson } = await lessonFrom(call, areaId, 'Bài 21 cộng có nhớ');
  const k = (await call('POST', '/api/t/classes', { name: '2B' })).json.class;
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'An' });
  const a = (await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  // the same lesson to the same class again: a warning with the first date, nothing added
  const dup = await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, 'alreadyAssigned');
  assert.ok(dup.json.at && /2B/.test(dup.json.error) && /2B/.test(dup.json.errorEn));
  assert.equal((await call('GET', `/api/t/classes/${k.id}`)).json.assignments.length, 1, 'the warning adds nothing');
  // "Assign again" on purpose
  const b = (await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true, again: true })).json.assignment;
  assert.ok(b.id && b.id !== a.id);

  // what the row's status is worked out from (web statusOf): nothing yet → Just assigned, seen or
  // started → In progress, every learner done → Done
  const row = async (id: string) => (await call('GET', `/api/t/classes/${k.id}`)).json.assignments.find((x: any) => x.id === id);
  assert.deepEqual([(await row(a.id)).seen, (await row(a.id)).started, (await row(a.id)).done], [0, 0, 0]);
  const kid = s.client('198.51.100.71'), room = (await kid('GET', `/api/p/class/${k.code}`)).json;
  await kid('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils[0].id });
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'slides' });
  assert.equal((await row(a.id)).seen, 1);
  await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: lesson.items[0].id, answer: lesson.items[0].answer });
  assert.deepEqual([(await row(a.id)).started, (await row(a.id)).done], [1, 0]);
  for (const it of lesson.items) await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer });
  assert.equal((await row(a.id)).done, 1);
  // Unassign: only the assigner's own
  const other = s.client('198.51.100.72');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('DELETE', `/api/t/assignments/${a.id}`)).status, 404, 'not hers');
  assert.equal((await call('DELETE', `/api/t/assignments/${a.id}`)).json.ok, true);
  assert.equal((await call('DELETE', `/api/t/assignments/${a.id}`)).status, 404, 'already removed');
  // gone from the child's Today, the class view, the class count and the lesson's list
  const today = (await kid('GET', '/api/p/today')).json.lessons.map((x: any) => x.id);
  assert.ok(!today.includes(a.id) && today.includes(b.id));
  assert.equal((await kid('GET', `/api/p/a/${a.id}`)).status, 404, 'no more answers on it');
  assert.deepEqual((await call('GET', `/api/t/classes/${k.id}`)).json.assignments.map((x: any) => x.id), [b.id]);
  assert.equal((await call('GET', '/api/t/classes')).json.classes.find((x: any) => x.id === k.id).assignments, 1);
  assert.deepEqual((await call('GET', `/api/t/lessons/${lessonId}/assignments`)).json.assignments.map((x: any) => x.id), [b.id]);
  // the lesson and the answers stay; the summary still counts them
  assert.equal((await call('GET', `/api/t/lessons/${lessonId}`)).status, 200);
  assert.equal(Number((await s.sql.one<{ n: string }>('select count(*) as n from answers where assignment_id = $1', [a.id]))?.n), lesson.items.length + 1);
  const sum = (await call('GET', `/api/t/summary?classId=${k.id}`)).json.classes.find((x: any) => x.id === k.id);
  assert.ok(sum.skills.length > 0, 'the summary still counts what was done');
  // with b still on the list a repeat warns; once b is removed too, assigning is quiet again
  await call('DELETE', `/api/t/assignments/${b.id}`);
  assert.ok((await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true })).json.assignment.id);
});

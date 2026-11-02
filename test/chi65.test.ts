// Chi's review of 0935 (#65-#71): the pairs game kept as done, cards to go over, a lesson finished by everyone
// moves to Done, when each was given and from which pages, Hide for a finished one, and matching words that
// never carry their picture, in two columns never in the same order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forPupil, isRight } from '../server/classes/check.ts';
import type { Item } from '../server/lesson/types.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('matching (Chi #71): no picture on the word side, the columns never in one order, old answers still marked right', () => {
  const pairs = [{ word: 'down ⬇️', emoji: '⬇️' }, { word: 'up ⬆️', emoji: '⬆️' }, { word: 'right ➡️', emoji: '➡️' }];
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
    const it = { id, subject: 'english', template: 'match', skill: 's', level: 'basic', prompt: 'Match', explain: '', answer: 'down ⬇️=⬇️,up ⬆️=⬆️,right ➡️=➡️', pairs } as Item;
    const p = forPupil(it);
    assert.deepEqual([...p.left!].sort(), ['down', 'right', 'up'], 'words only');
    const at = new Map([['down', '⬇️'], ['up', '⬆️'], ['right', '➡️']]);
    assert.ok(!p.right!.every((e, k) => at.get(p.left![k]) === e), `${id}: the two columns are not side by side`);
    assert.ok(isRight(it, 'up=⬆️,down=⬇️,right=➡️'), 'the child answers with bare words');
    assert.ok(!isRight(it, 'up=⬇️,down=⬆️,right=➡️'));
  }
});

test('the child side keeps the pairs game and cards to go over; a lesson everyone finished is Done; given dates and Hide (Chi #65-#69)', async () => {
  const s = await testServer(), call = s.client('198.51.100.70');
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id: lessonId, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const k = (await call('POST', '/api/t/classes', { name: 'Nam' })).json.class;
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'Nam' });
  const a = (await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true, due: '2099-01-01' })).json.assignment;
  const kid = s.client('198.51.100.71');
  const room = (await kid('GET', `/api/p/class/${k.code}`)).json;
  await kid('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils[0].id });
  // the lessons list: given, nobody finished yet
  let row = (await call('GET', '/api/t/lessons')).json.lessons.find((l: any) => l.id === lessonId);
  assert.deepEqual([row.done_by, row.given_to, row.open], [0, 1, true]);
  // flashcards with 2 set aside, the pairs game, then every question
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'cards', review: 2 });
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'pairs' });
  assert.equal((await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'nonsense' })).status, 400);
  for (const it of lesson.items) await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer });
  const t = (await kid('GET', '/api/p/today')).json.lessons[0];
  assert.ok(t.done && t.cards_seen && t.pairs_seen, 'the pairs game shows as done');
  assert.equal(t.cards_review, 2, 'cards to go over again');
  assert.ok(t.given, 'when it was given, to tell two of the same apart');
  // finished by everyone it was given to: Done in the list (the page groups it so), though its due date is ahead
  row = (await call('GET', '/api/t/lessons')).json.lessons.find((l: any) => l.id === lessonId);
  assert.deepEqual([row.done_by, row.given_to], [1, 1]);
  // the class view: when it was given and from which pages; Hide keeps the results and takes it off the list
  let view = (await call('GET', `/api/t/classes/${k.id}`)).json;
  assert.ok(view.assignments[0].created_at && view.assignments[0].refs?.[0]?.en?.includes('p.'), 'given date and pages');
  assert.ok(view.assignments[0].answers >= lesson.items.length);
  assert.equal((await call('POST', `/api/t/assignments/${a.id}/hide`)).status, 200);
  view = (await call('GET', `/api/t/classes/${k.id}`)).json;
  assert.equal(view.assignments.length, 0, 'hidden from her list');
  assert.equal((await kid('GET', '/api/p/today')).json.lessons.length, 1, 'still on the child\'s screen');
  const other = s.client('198.51.100.72');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('POST', `/api/t/assignments/${a.id}/hide`)).status, 404, 'only hers');
});

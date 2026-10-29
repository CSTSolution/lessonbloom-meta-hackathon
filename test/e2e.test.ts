// End to end, in English, from creating to using: a teacher signs up, adds her book, makes a lesson
// (code checks, then the AI second review), edits it, assigns it with the box ticked; a pupil joins by
// code and does every part on the phone; the teacher then sees progress, labels, the learner, the
// path and her notifications. Then the same for a parent and one child through the private link.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkItem, contextOf } from '../server/lesson/items.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('a teacher, from sign-up to a pupil practising and the summary', async () => {
  const s = await testServer(), call = s.client();
  // sign-up: a demo account, the teacher role and her class
  assert.equal((await call('POST', '/api/auth/demo', { lang: 'en' })).status, 200);
  const me0 = (await call('GET', '/api/t/me')).json;
  assert.equal(me0.credits.balance, 120, '120 credits at sign-up');
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math', classes: ['Year 2 Blue'] });
  assert.equal((await call('GET', '/api/t/me')).json.teacher.role, 'teacher');

  // step 1: her book, split into lessons with pages
  const { areaId } = await areaWithBook(call, 'maths2');
  const area = (await call('GET', '/api/t/areas')).json.areas.find((x: any) => x.id === areaId);
  assert.equal(area.books[0].status, 'ready', 'the book is read');

  // steps 2–3: one sentence → the matching section → a checked lesson
  const { id, lesson, match } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.ok(match.sectionId && match.pageFrom && match.cited, 'the section is found and quoted');
  assert.equal(lesson.status, 'ready');
  assert.equal(lesson.setup.lang, 'en', 'an English book gives an English lesson');
  assert.ok(lesson.slides.length >= 5 && lesson.items.length >= 8 && lesson.cards.length >= 3, 'slides, practice and flashcards');
  const src = (await s.sql.one<{ text: string }>('select source as text from lessons where id = $1', [id]))?.text ?? '';
  const ctx = contextOf(lesson.setup, lesson.skills, src);
  assert.deepEqual(lesson.items.flatMap((i: any) => checkItem(i, ctx)), [], 'every item passes the code checks');
  assert.ok(s.ai.calls.some((c) => c.endpoint === 'check'), 'the AI second review ran');
  assert.ok(lesson.items.every((i: any) => i.page), 'every item has its source page');
  assert.ok(Number((await s.sql.one<{ n: string }>('select count(*) as n from ai_usage where lesson_id = $1', [id]))?.n) > 0, 'its AI calls are logged against it');

  // step 4–5: edits, every one checked again
  const sl = lesson.slides[2];
  assert.equal((await call('POST', `/api/t/lessons/${id}/slides/${sl.id}/rewrite`, { how: 'simpler' })).json.slide.id, sl.id);
  const mcq = lesson.items.find((i: any) => i.template === 'mcq');
  assert.equal((await call('PUT', `/api/t/lessons/${id}/items/${mcq.id}`, { a: 45, b: 38 })).json.item.answer, '83');
  const sim = (await call('POST', `/api/t/lessons/${id}/items/${mcq.id}/similar`)).json;
  assert.ok(sim.added.length);
  const L = (await call('GET', `/api/t/lessons/${id}`)).json.lesson;

  // step 6: assigning needs the box ticked
  const k = (await call('GET', '/api/t/classes')).json.classes[0];
  assert.equal(k.name, 'Year 2 Blue');
  assert.equal((await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'Mia\nLeo' })).json.added, 2);
  assert.equal((await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id })).json.code, 'confirm');
  const a = (await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id, confirmed: true, due: '2099-01-01' })).json.assignment;
  assert.ok(a.id);

  // the pupil's phone: join by code, today, every part
  const kid = s.client('198.51.100.101');
  const room = (await kid('GET', `/api/p/class/${k.code}`)).json, mia = room.pupils.find((p: any) => p.name === 'Mia');
  assert.equal((await kid('POST', '/api/p/enter', { code: k.code, pupilId: mia.id })).status, 200);
  const today = (await kid('GET', '/api/p/today')).json;
  assert.equal(today.pupil.name, 'Mia');
  assert.equal(today.lessons[0].id, a.id);
  const pl = (await kid('GET', `/api/p/a/${a.id}`)).json.lesson;
  assert.equal(pl.items.length, L.items.length);
  assert.ok(!/"answer"|"explain"/.test(JSON.stringify(pl.items)), 'answers never reach the phone');
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'slides' });
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'video' });
  const first = L.items[0], wrong = (await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: first.id, answer: '-1' })).json;
  assert.equal(wrong.correct, false);
  assert.ok(wrong.explain && !new RegExp(`(?<!\\d)${first.answer}(?!\\d)`).test(wrong.explain), `a hint, never the answer: ${wrong.explain}`);
  for (const it of L.items) assert.equal((await kid('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer })).json.correct, true, it.id);
  await kid('POST', `/api/p/a/${a.id}/seen`, { what: 'cards' });
  const done = (await kid('GET', '/api/p/today')).json.lessons[0];
  assert.ok(done.done && done.cards_seen && done.answered === L.items.length, 'the lesson shows as done');

  // the teacher's side: progress, labels, the learner, the path, notifications
  const view = (await call('GET', `/api/t/classes/${k.id}`)).json;
  assert.equal(view.assignments[0].done, 1, 'one of two pupils done');
  const sum = (await call('GET', '/api/t/summary')).json, cls = sum.classes.find((x: any) => x.id === k.id);
  assert.ok(cls && cls.skills.length && cls.pupils.length === 2, 'the summary has her class and both pupils');
  const d = (await call('GET', `/api/t/pupils/${mia.id}`)).json;
  assert.equal(d.pupil.name, 'Mia');
  assert.ok(d.skills.length, 'skills for the learner');
  const path = await call('GET', `/api/t/path?classId=${k.id}&areaId=${areaId}`);
  assert.equal(path.status, 200);
  assert.ok(path.json.steps.length, 'a learning path from her book');
  assert.equal((await call('GET', '/api/t/notifications')).status, 200);
  const me1 = (await call('GET', '/api/t/me')).json;
  assert.ok(me1.credits.left <= me0.credits.left, 'credits are charged, never added');
});

test('a parent, from sign-up to her child practising through the private link', async () => {
  const s = await testServer(), call = s.client('198.51.100.110');
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const t = (await call('POST', '/api/t/role', { role: 'parent', name: "Leo's mum", children: [{ name: 'Leo', grade: 2 }] })).json.teacher;
  assert.equal(t.role, 'parent');
  const child = (await call('GET', '/api/t/classes')).json.classes[0];
  assert.deepEqual([child.name, child.kind, child.grade], ['Leo', 'child', 2]);
  const sample = (await call('POST', '/api/t/areas/sample', { book: 'maths2' })).json.area;
  for (let i = 0; i < 200; i++) { const x = (await call('GET', '/api/t/areas')).json.areas.find((y: any) => y.id === sample.id); if (x.books[0]?.status !== 'processing') break; await wait(20); }
  const { id, lesson } = await lessonFrom(call, sample.id, 'Lesson 22 subtracting without regrouping');
  assert.equal(lesson.status, 'ready');
  assert.equal((await call('POST', `/api/t/lessons/${id}/assign`, { classId: child.id })).json.code, 'confirm', 'a parent ticks the box too');
  const a = (await call('POST', `/api/t/lessons/${id}/assign`, { classId: child.id, confirmed: true })).json.assignment;
  const leo = (await call('GET', `/api/t/classes/${child.id}`)).json.pupils[0];
  assert.ok(leo.link, 'a private link for the child');
  const phone = s.client('198.51.100.111');
  assert.equal((await phone('POST', '/api/p/link', { link: leo.link })).status, 200);
  const today = (await phone('GET', '/api/p/today')).json;
  assert.equal(today.pupil.name, 'Leo');
  assert.equal(today.lessons[0].id, a.id);
  for (const it of lesson.items) await phone('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer });
  assert.ok((await phone('GET', '/api/p/today')).json.lessons[0].done);
  const d = (await call('GET', `/api/t/pupils/${leo.id}`)).json;
  assert.equal(d.pupil.name, 'Leo');
  assert.ok(d.skills.length && d.skills.every((k: any) => k.label === 'solid' || k.label === 'practising'), 'all right: no repeated mistakes');
});

test('the AI second review drops what it flags, but never below the minimum', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  let flagged: string[] = [];
  s.ai.answers.set('check', (r) => { const items = (r.fixture as { items: { id: string }[] }).items; flagged = items.slice(0, 2).map((i) => i.id); return { flags: flagged.map((id) => ({ id, code: 'U', why: 'the unit does not fit the question' })) }; });
  const { lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.ok(flagged.length === 2 && !lesson.items.some((i: any) => flagged.includes(i.id)), 'flagged items are gone');
  assert.equal(lesson.rejected.filter((r: any) => r.codes.includes('ai:U')).length, 2, 'and logged with the reason');

  s.ai.answers.set('check', (r) => ({ flags: (r.fixture as { items: { id: string }[] }).items.map((i) => ({ id: i.id, code: 'unclear', why: 'x' })) }));
  const all = (await lessonFrom(call, areaId, 'Lesson 22 subtracting without regrouping')).lesson;
  assert.equal(all.items.length, 8, 'a lesson keeps at least 8 items');
});

// Chi's 28 Oct doc, the last gaps: every item has its source page; a teacher's classes at sign-up;
// the criteria preview and the three suggestions; the mid-lesson reminder only for who has not finished.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock } from '../server/path/labels.ts';
import { areaWithBook, lessonFrom, onDay, schoolToday, testServer } from './helpers.ts';

test('items carry their page; a teacher types her classes at sign-up', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math', classes: ['2A', ' 2B ', '2A', ''] });
  assert.deepEqual((await call('GET', '/api/t/classes')).json.classes.map((k: any) => k.name), ['2A', '2B'], 'as typed, no repeats');
  const { areaId } = await areaWithBook(call, 'maths2');
  const { lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.ok(lesson.items.every((i: any) => i.page === 3), 'the section is on page 3');
  assert.ok(lesson.items.some((i: any) => i.redone?.some((r: string) => r.startsWith('[Q]'))), 'the item written again says why');
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

test('the mid-lesson reminder goes only to a learner who has not finished the practice', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math', classes: ['2A'] });
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const k = (await call('GET', '/api/t/classes')).json.classes[0];
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'Mia\nLeo' });
  const a = (await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  const kid = async (ip: string, name: string) => {
    const c2 = s.client(ip), room = (await c2('GET', `/api/p/class/${k.code}`)).json;
    await c2('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils.find((x: any) => x.name === name).id });
    return c2;
  };
  const mia = await kid('198.51.100.120', 'Mia'), leo = await kid('198.51.100.121', 'Leo');
  for (const it of lesson.items) await leo('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer });
  const today = schoolToday();
  onDay(today, '18:30');   // 18:30 Vietnam time, on a school day
  try {
    const p = (await call('GET', `/api/t/path?classId=${k.id}&areaId=${areaId}`)).json, sec = lesson.refs[0].sectionId;
    const order = [sec, ...p.steps.map((x: any) => x.sectionId).filter((x: string) => x !== sec)];
    // a lesson of 2 weeks; move its start back until today is its middle day (weekends move the date)
    let found = false;
    for (let back = 1; back <= 12 && !found; back++) {
      const start = new Date(Date.parse(`${today}T00:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
      await call('PUT', `/api/t/path/${p.path.id}`, { start, steps: order.map((x: string, i: number) => ({ sectionId: x, weeks: i === 0 ? 2 : 1 })) });
      await s.sql.query('delete from pupil_reminders');
      const r = (await mia('GET', '/api/p/today')).json.reminder;
      found = !!r && /still practice/.test(r.en);
    }
    assert.ok(found, 'Mia, who has not practised, gets the mid-lesson reminder');
    const leoR = (await leo('GET', '/api/p/today')).json.reminder;
    assert.ok(!leoR || !/still practice/.test(leoR.en), `Leo has finished, so no mid-lesson reminder (${leoR?.en})`);
  } finally { clock.now = () => Date.now(); }
});

test('the learning path follows the lesson that was assigned; a path she saved stays hers', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Ms Hanh', subject: 'math', classes: ['2A', '2B'] });
  const { areaId } = await areaWithBook(call, 'maths2');
  const [k, k2] = (await call('GET', '/api/t/classes')).json.classes;
  const path = async (classId: string) => (await call('GET', `/api/t/path?classId=${classId}&areaId=${areaId}`)).json;
  // opened before anything is assigned: the book's first lesson, from this Monday
  const before = await path(k.id);
  assert.match(before.steps[0].title, /Lesson 20/);
  // Lesson 21 is assigned: it becomes the current lesson, from today (Chi saw Lesson 20 "current" and 21 "from 02/11")
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id, confirmed: true });
  const after = await path(k.id), cur = after.steps.find((x: any) => x.status === 'current');
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  assert.equal(cur.sectionId, lesson.refs[0].sectionId, 'the assigned lesson is the current one');
  // the lessons before it in the book come first, in the weeks before (Chi #35); the assigned one starts today
  assert.equal(cur.start, today, 'from today');
  assert.equal(after.steps.length, before.steps.length, 'no part is lost: the earlier ones come last');
  // a path the teacher saved herself is not re-planned by the next assignment
  const p2 = await path(k2.id);
  await call('PUT', `/api/t/path/${p2.path.id}`, { start: p2.path.start, steps: p2.steps.map((x: any) => ({ sectionId: x.sectionId, weeks: 2 })) });
  await call('POST', `/api/t/lessons/${id}/assign`, { classId: k2.id, confirmed: true });
  const kept = await path(k2.id);
  assert.equal(kept.path.id, p2.path.id);
  assert.ok(kept.steps.every((x: any) => x.weeks === 2), 'her weeks are kept');
});

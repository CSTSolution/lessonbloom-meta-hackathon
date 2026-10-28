// Tasks 3 and 4: the parent role, the learning path, labels by code, advice for one learner, reminders.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classLabel, DEFAULT_CRITERIA, labelOf, mistakeOf, schoolDay } from '../server/path/labels.ts';
import { layout } from '../server/path/routes.ts';
import type { Item } from '../server/lesson/types.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('labels by code: 80 / 50 / the same mistake 3 times in 2 sessions; a class at 30% / 70%', () => {
  const it = { id: 'i', subject: 'math', template: 'fill', skill: 'add', level: 'basic', prompt: '', explain: '', a: 36, op: '+', b: 27, answer: '63' } as Item;
  assert.equal(mistakeOf(it, '53'), 'Quên nhớ 1 sang hàng chục');
  const items = new Map([['i', it]]), A = (correct: boolean, day = '2026-10-28', answer = correct ? '63' : '53') => ({ item_id: 'i', skill: 'add', correct, answer, at: `${day}T08:00:00Z`, day });
  assert.equal(labelOf([...Array(8)].map(() => A(true)).concat([A(false), A(true)]).map((x, i) => (i === 8 ? { ...x, answer: '61' } : x)), items, DEFAULT_CRITERIA).label, 'solid');
  assert.equal(labelOf([A(false), A(false, '2026-10-29'), A(false, '2026-10-29')], items, DEFAULT_CRITERIA).label, 'repeat', 'the same mistake 3 times in 2 sessions');
  assert.equal(labelOf([A(true), A(true)], items, DEFAULT_CRITERIA).label, 'practising', 'not enough answers yet');
  assert.equal(classLabel(['repeat', 'solid', 'solid'], DEFAULT_CRITERIA), 'repeat');
  assert.equal(classLabel(['solid', 'solid', 'solid', 'practising'], DEFAULT_CRITERIA), 'solid');
  assert.equal(schoolDay('2026-11-01'), '2026-11-02', 'Sunday moves to Monday');
  assert.equal(schoolDay('2026-10-31'), '2026-10-30', 'Saturday moves to Friday');
  const steps = layout('2026-10-19', [{ section_id: 'a', title: 'A', page_from: 1, page_to: 2, topic: 'T', weeks: 1 }, { section_id: 'b', title: 'B', page_from: 3, page_to: 4, topic: 'T', weeks: 2 }, { section_id: 'c', title: 'C', page_from: 5, page_to: 6, topic: 'T', weeks: 1 }], '2026-10-28');
  assert.deepEqual(steps.map((s) => [s.status, s.start, s.end]), [['done', '2026-10-19', '2026-10-25'], ['current', '2026-10-26', '2026-11-08'], ['next', '2026-11-09', '2026-11-15']]);
});

test('a parent: children at sign-up become "Con của tôi", each with a private link', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  assert.equal((await call('POST', '/api/t/role', { role: 'parent', name: 'Mẹ An', children: [] })).json.code, 'children');
  const t = (await call('POST', '/api/t/role', { role: 'parent', name: 'Mẹ An', children: [{ name: 'An', grade: 2 }, { name: 'Na', grade: 3 }] })).json.teacher;
  assert.deepEqual([t.role, t.name], ['parent', 'Mẹ An']);
  const kids = (await call('GET', '/api/t/classes')).json.classes;
  assert.deepEqual(kids.map((k: any) => [k.name, k.kind, k.grade, k.pupils]), [['An', 'child', 2, 1], ['Na', 'child', 3, 1]]);
});

test('path, summary, advice for one learner, and her reminder', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Cô Hạnh', subject: 'math' });
  const { areaId } = await areaWithBook(call, 'toan2');
  const { id: lessonId, lesson } = await lessonFrom(call, areaId, 'Bài 21 cộng có nhớ');
  const k = (await call('POST', '/api/t/classes', { name: '2A' })).json.class;
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'An\nBình' });
  const a = (await call('POST', `/api/t/lessons/${lessonId}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  // the path: put the lesson's part first, now
  let p = (await call('GET', `/api/t/path?classId=${k.id}&areaId=${areaId}`)).json;
  assert.ok(p.steps.length > 1 && p.steps.every((x: any) => x.topic), 'every part has a chapter');
  const sec = lesson.refs[0].sectionId, order = [sec, ...p.steps.map((x: any) => x.sectionId).filter((x: string) => x !== sec)];
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  await call('PUT', `/api/t/path/${p.path.id}`, { start: today, steps: order.map((id: string, i: number) => ({ sectionId: id, weeks: i === 0 ? 2 : 1 })) });
  p = (await call('GET', `/api/t/path?classId=${k.id}&areaId=${areaId}`)).json;
  assert.equal(p.steps[0].status, 'current');
  assert.equal(p.steps[0].weeks, 2);
  assert.equal(p.steps[1].status, 'next');
  assert.ok(p.reminders.some((r: any) => r.who === 'assigner' && r.kind === 'end'));
  // An gets it wrong the same way three times, then everything right; Bình gets everything right
  const kid = async (ip: string, name: string) => {
    const c2 = s.client(ip), room = (await c2('GET', `/api/p/class/${k.code}`)).json;
    await c2('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils.find((x: any) => x.name === name).id });
    return c2;
  };
  const an = await kid('198.51.100.80', 'An'), binh = await kid('198.51.100.81', 'Bình');
  assert.match((await an('GET', '/api/p/today')).json.reminder.vi, /Bắt đầu bài/, 'her reminder for today, in the app');
  const add = lesson.items.find((i: any) => i.op === '+' && i.template === 'fill' && i.blank === 'result') ?? lesson.items.find((i: any) => i.op === '+' && i.template !== 'truefalse');
  for (let i = 0; i < 3; i++) await an('POST', `/api/p/a/${a.id}/answer`, { itemId: add.id, answer: String(Number(add.answer) - 10) });
  for (const it of lesson.items) { await an('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer }); await binh('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer }); }
  const sum = (await call('GET', '/api/t/summary')).json;
  const cls = sum.classes.find((x: any) => x.id === k.id);
  assert.ok(cls.skills.length && cls.pupils.length === 2);
  assert.equal(cls.pupils.find((x: any) => x.name === 'Bình').skills[add.skill], 'solid');
  assert.equal(cls.pupils.find((x: any) => x.name === 'An').skills[add.skill], 'repeat');
  assert.ok(cls.mistakes.some((m: any) => /nhớ 1/.test(m.what)), 'the repeated mistake is named');
  const cm = (await call('POST', '/api/t/summary/comments', { classId: k.id })).json.comments;
  assert.ok(cm.length === 2 && cm.every((x: any) => x.text.includes(x.name)), 'names are filled in on our server');
  assert.ok(!s.ai.calls.filter((x: any) => x.endpoint === 'comments').some((x: any) => /An|Bình/.test(JSON.stringify(x))), 'no names went to the model');
  // An's detail and the advice cards
  const anId = cls.pupils.find((x: any) => x.name === 'An').id;
  const d = (await call('GET', `/api/t/pupils/${anId}`)).json;
  assert.ok(d.current && d.current.week === 1 && d.skills.length);
  const practice = d.advice.find((x: any) => x.kind === 'practice');
  assert.ok(practice, 'a practice card for the skill she is stuck on');
  assert.ok(practice.text.startsWith('✎') && practice.text.includes('An'), `worded by the AI, her name put in by us: ${practice.text}`);
  assert.ok(!s.ai.calls.some((x: any) => x.endpoint === 'comments' && JSON.stringify(x).includes('"An"')), 'her name never went to the model');
  const r = (await call('POST', `/api/t/pupils/${anId}/advice`, { kind: 'practice', skill: practice.skill, action: 'apply' })).json;
  assert.ok(r.added > 0);
  const hers = (await an('GET', `/api/p/a/${a.id}`)).json.lesson.items.length, his = (await binh('GET', `/api/p/a/${a.id}`)).json.lesson.items.length;
  assert.equal(hers, his + r.added, 'the extra items are hers alone');
  await call('POST', `/api/t/pupils/${anId}/advice`, { action: 'undo', adviceId: r.adviceId });
  assert.equal((await an('GET', `/api/p/a/${a.id}`)).json.lesson.items.length, his, 'undone');
  // criteria
  assert.equal((await call('PUT', '/api/t/criteria', { solid: 70, repeat: 75 })).json.criteria.repeat, 60, 'repeat stays below solid');
  assert.equal((await call('PUT', '/api/t/reminders', { time: '21:30' })).json.reminders.time, '18:00', 'never after 20:00');
});

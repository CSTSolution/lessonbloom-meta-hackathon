// Tasks 3 and 4: the parent role, the learning path, labels by code, advice for one learner, reminders.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classLabel, clock, DEFAULT_CRITERIA, labelOf, mistakeOf, schoolDay } from '../server/path/labels.ts';
import { firstPlan, layout } from '../server/path/routes.ts';
import type { Item } from '../server/lesson/types.ts';
import { areaWithBook, lessonFrom, onDay, schoolToday, testServer } from './helpers.ts';

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

test('the path starts in the book\'s page order; 1/2/3 weeks move every later lesson (Chi #35)', () => {
  // Chi's book: the parts came in this order, and "Comparing and ordering" was the lesson assigned
  const book = [{ id: 'cmp', book_id: 'b', page_from: 6, ord: 1 }, { id: 'est', book_id: 'b', page_from: 10, ord: 2 }, { id: 'num', book_id: 'b', page_from: 1, ord: 3 }];
  assert.deepEqual(firstPlan(book, undefined, '2026-10-30'), { order: ['num', 'cmp', 'est'], start: '2026-10-26' }, 'no lesson assigned: page order, from this Monday');
  const f = firstPlan(book, 'cmp', '2026-10-30');
  assert.deepEqual(f, { order: ['num', 'cmp', 'est'], start: '2026-10-23' }, 'the assigned lesson is current today; the one before it comes before');
  const row = (id: string, weeks: number) => ({ section_id: id, title: id, page_from: book.find((x) => x.id === id)!.page_from, page_to: 0, topic: 'T', weeks });
  const at = (w: number) => layout(f.start, [row('num', 1), row('cmp', w), row('est', 1)], '2026-10-30').map((s) => [s.sectionId, s.status, s.start, s.end]);
  assert.deepEqual(at(1), [['num', 'done', '2026-10-23', '2026-10-29'], ['cmp', 'current', '2026-10-30', '2026-11-05'], ['est', 'next', '2026-11-06', '2026-11-12']]);
  assert.deepEqual(at(3).slice(1), [['cmp', 'current', '2026-10-30', '2026-11-19'], ['est', 'next', '2026-11-20', '2026-11-26']], '3 weeks: its end and the next start move on 2 weeks');
  // two books in one source: each book in its own page order, the first book first
  assert.deepEqual(firstPlan([{ id: 'a9', book_id: 'x', page_from: 9, ord: 1 }, { id: 'a1', book_id: 'x', page_from: 1, ord: 2 }, { id: 'b2', book_id: 'y', page_from: 1, ord: 1 }], undefined, '2026-10-30').order, ['a1', 'a9', 'b2']);
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
  const today = schoolToday(); onDay(today);
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
  // not saved yet: the book's page order, the assigned lesson current today (Chi #35)
  const pageOf = (x: any) => Number(String(x.pages).split('–')[0]), byPage = (xs: any[]) => xs.every((x, i) => !i || pageOf(xs[i - 1]) <= pageOf(x));
  assert.ok(byPage(p.steps), `page order: ${p.steps.map((x: any) => x.pages).join(', ')}`);
  assert.equal(p.steps.find((x: any) => x.status === 'current')?.sectionId, lesson.refs[0].sectionId);
  // a path made before in another order, never saved, follows the book again (in place: same path)
  await s.sql.query('update path_steps set ord = -ord where path_id = $1', [p.path.id]);
  const again = (await call('GET', `/api/t/path?classId=${k.id}&areaId=${areaId}`)).json;
  assert.equal(again.path.id, p.path.id);
  assert.deepEqual(again.steps.map((x: any) => x.sectionId), p.steps.map((x: any) => x.sectionId));
  const sec = lesson.refs[0].sectionId, order = [sec, ...p.steps.map((x: any) => x.sectionId).filter((x: string) => x !== sec)];
  await call('PUT', `/api/t/path/${p.path.id}`, { start: today, steps: order.map((id: string, i: number) => ({ sectionId: id, weeks: i === 0 ? 2 : 1 })) });
  p = (await call('GET', `/api/t/path?classId=${k.id}&areaId=${areaId}`)).json;
  assert.deepEqual(p.steps.map((x: any) => x.sectionId), order, 'the order she saved stays');
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
  // reminders show from the chosen time (18:00 by default) until 20:00, Vietnam time
  const at = (hm: string) => { const [h, m] = hm.split(':').map(Number); clock.now = () => Date.parse(`${today}T00:00:00Z`) + ((h - 7) * 60 + m) * 60e3; };
  at('15:00'); assert.equal((await an('GET', '/api/p/today')).json.reminder, null, 'not before the chosen time');
  at('18:30'); assert.match((await an('GET', '/api/p/today')).json.reminder.vi, /Bắt đầu bài/, 'her reminder for today, in the app');
  at('21:00'); assert.match((await an('GET', '/api/p/today')).json.reminder.vi, /Bắt đầu bài/, 'once shown, the same one all day');
  onDay(today);   // back to the morning of the school day, for the rest of the test
  const add = lesson.items.find((i: any) => i.op === '+' && i.template === 'fill' && i.blank === 'result') ?? lesson.items.find((i: any) => i.op === '+' && i.template !== 'truefalse');
  for (let i = 0; i < 3; i++) await an('POST', `/api/p/a/${a.id}/answer`, { itemId: add.id, answer: String(Number(add.answer) - 10) });
  for (const it of lesson.items) { await an('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer }); await binh('POST', `/api/p/a/${a.id}/answer`, { itemId: it.id, answer: it.answer }); }
  const sum = (await call('GET', '/api/t/summary?lang=vi')).json;   // read on a Vietnamese screen (the demo account is English)
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
  // the page comes at once; Muse Spark's wording of the advice follows (the page asks again)
  const first = (await call('GET', `/api/t/pupils/${anId}`)).json;
  assert.equal(first.wording, true, 'the wording is on its way, the page did not wait for it');
  let d = first;
  for (let i = 0; i < 50 && d.wording; i++) { await new Promise((r) => setTimeout(r, 20)); d = (await call('GET', `/api/t/pupils/${anId}`)).json; }
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

test('a learner: "Đang học" is the lesson assigned last, advice leads with the newest repeated mistake, labels in the language on screen (Chi #50, #52c)', async () => {
  const today = schoolToday(); onDay(today);
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  await call('POST', '/api/t/role', { role: 'teacher', name: 'Cô Hạnh', subject: 'math' });
  const toan = (await areaWithBook(call, 'toan2')).areaId, maths = (await areaWithBook(call, 'maths2')).areaId;
  const L1 = await lessonFrom(call, toan, 'Bài 21 cộng có nhớ'), L2 = await lessonFrom(call, maths, 'Lesson 21 adding with regrouping');
  const k = (await call('POST', '/api/t/classes', { name: '2A' })).json.class;
  await call('POST', `/api/t/classes/${k.id}/pupils`, { names: 'An' });
  const a1 = (await call('POST', `/api/t/lessons/${L1.id}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  await call('GET', `/api/t/path?classId=${k.id}&areaId=${toan}`);   // the sample book's path is there
  const kid = s.client('198.51.100.90'), room = (await kid('GET', `/api/p/class/${k.code}`)).json;
  await kid('POST', '/api/p/enter', { code: k.code, pupilId: room.pupils[0].id });
  const carry = (l: any) => l.items.find((i: any) => i.op === '+' && i.template !== 'truefalse' && Number(i.answer) >= 20 && (i.a % 10) + (i.b % 10) >= 10);
  // the same mistake three times in the first lesson (yesterday), then in the second lesson (today)
  const i1 = carry(L1.lesson);
  for (let n = 0; n < 3; n++) await kid('POST', `/api/p/a/${a1.id}/answer`, { itemId: i1.id, answer: String(Number(i1.answer) - 10) });
  await s.sql.query(`update answers set at = at - interval '1 day' where assignment_id = $1`, [a1.id]);
  const a2 = (await call('POST', `/api/t/lessons/${L2.id}/assign`, { classId: k.id, confirmed: true })).json.assignment;
  const i2 = carry(L2.lesson);
  assert.ok(i1 && i2 && L2.lesson.setup.lang === 'en', 'two carrying items; the second lesson in English');
  // the mock writes both books' skills under one tag: the second lesson's gets its own
  await s.sql.query(`update assignments set content = jsonb_set(content, '{items}', (select jsonb_agg(case when x->>'id' = $2 then jsonb_set(x, '{skill}', '"add_regroup"') else x end) from jsonb_array_elements(content->'items') x)) where id = $1`, [a2.id, i2.id]);
  i2.skill = 'add_regroup';
  for (let n = 0; n < 3; n++) await kid('POST', `/api/p/a/${a2.id}/answer`, { itemId: i2.id, answer: String(Number(i2.answer) - 10) });
  const pid = room.pupils[0].id, vi = (await call('GET', `/api/t/pupils/${pid}?lang=vi`)).json;
  // "Đang học": the lesson just assigned from the other book, not the sample book's part
  assert.equal(vi.current?.sectionId, L2.lesson.refs[0].sectionId, `currently learning: ${vi.current?.title}`);
  assert.equal(vi.current.assignmentId, a2.id);
  // the practice card is about the newest repeated mistake
  const practice = vi.advice.find((x: any) => x.kind === 'practice');
  assert.equal(practice?.skill, i2.skill, 'the newest repeated mistake leads');
  // mistakes code names follow the language on screen, whatever the lesson's language (Chi #52c)
  const names = (v: any) => v.skills.map((x: any) => x.mistake).filter(Boolean).join(' | ');
  assert.ok(vi.skills.some((x: any) => x.mistake) && !/Forgot|Wrong|calculation/.test(names(vi)), names(vi));
  const en = (await call('GET', `/api/t/pupils/${pid}?lang=en`)).json;
  assert.ok(!/Quên|Tính sai|hàng chục/.test(names(en)) && /Forgot to carry/.test(names(en)), names(en));
  const sumVi = (await call('GET', `/api/t/summary?lang=vi`)).json.classes[0].mistakes.map((m: any) => m.what).join(' | ');
  const sumEn = (await call('GET', `/api/t/summary?lang=en`)).json.classes[0].mistakes.map((m: any) => m.what).join(' | ');
  assert.ok(/Quên nhớ 1/.test(sumVi) && !/Forgot|Wrong/.test(sumVi), sumVi);
  assert.ok(/Forgot to carry/.test(sumEn) && !/Quên|Tính sai/.test(sumEn), sumEn);
  // no language asked for: the account's (a demo account is Vietnamese), not the last lesson's
  const sumDefault = (await call('GET', '/api/t/summary')).json.classes[0].mistakes.map((m: any) => m.what).join(' | ');
  assert.equal(sumDefault, (await call('GET', '/api/t/me')).json.teacher?.lang === 'en' ? sumEn : sumVi);
});

// Making a lesson end to end on the mock: the agent's run, its limits and guard, and the API.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MockProvider } from '../server/ai/mock.ts';
import type { ChatMsg, ChatTurn, Endpoint, ToolSpec } from '../server/ai/types.ts';
import { buildLesson, LIMITS, reviewLesson } from '../server/lesson/agent.ts';
import { checkItem, contextOf } from '../server/lesson/items.ts';
import { intake } from '../server/lesson/writer.ts';
import { testServer } from './helpers.ts';

const MATH = await readFile(new URL('../samples/toan-lop2-cong-co-nho.txt', import.meta.url), 'utf8');
const ENG = await readFile(new URL('../samples/tieng-anh-lop3-colours.txt', import.meta.url), 'utf8');

test('the agent builds a whole lesson; the checker\'s rejection is logged and every kept item passes', async () => {
  for (const notes of [MATH, ENG]) {
    const ai = new MockProvider(), setup = await intake(ai, notes, 'vi'), steps: string[] = [];
    const b = await buildLesson(ai, setup, notes, (vi) => { steps.push(vi); });
    assert.equal(b.agent.finished, true);
    assert.ok(b.slides.length >= 7 && b.items.length >= LIMITS.minItems && b.cards.length >= 4);
    for (const k of b.skills) for (const lv of ['basic', 'good']) assert.ok(b.items.some((i) => i.skill === k.tag && i.level === lv), `${k.tag} ${lv}`);
    const ctx = contextOf(setup, b.skills, notes);
    for (const i of b.items) assert.deepEqual(checkItem(i, ctx), [], i.id);
    assert.ok(steps.length >= 6, 'the teacher sees the agent working');
    if (setup.subject === 'math') assert.deepEqual(b.rejected[0].codes, ['Q']);
    assert.match(b.agent.note, /\S/);
  }
});

// A model that plays the given turns, then nothing.
class Scripted extends MockProvider {
  constructor(private turns: ((m: ChatMsg[]) => ChatTurn)[]) { super(); }
  override async chat(req: { endpoint: Endpoint; messages: ChatMsg[]; tools: ToolSpec[] }): Promise<ChatTurn> {
    const next = this.turns.shift();
    return next ? next(req.messages) : { model: 'x', text: 'I am done.', toolCalls: [] };
  }
}
const call = (name: string, args: object | string = {}): ChatTurn => ({ model: 'muse-wonder-1.0', text: '', toolCalls: [{ id: name + Math.random(), name, args: typeof args === 'string' ? args : JSON.stringify(args) }] });

test('an agent that stops early, sends bad arguments or unknown tools still ends in a complete lesson', async () => {
  const ai = new Scripted([() => call('write_items', { skill: 'x' }), () => call('drop_database'), () => call('save_plan', '{not json'), () => call('simplify_slide', { id: 'sl99' })]);
  const setup = await intake(ai, MATH, 'vi');
  const b = await buildLesson(ai, setup, MATH);
  assert.equal(b.agent.finished, false);
  assert.ok(b.slides.length && b.items.length >= 4 && b.cards.length, 'code completed what the agent did not');
  assert.match(b.agent.note, /Trợ lý đã soạn/);
});

test('a turn that leaks the canary stops the agent; nothing it wrote leaves, the lesson is still completed', async () => {
  const ai = new Scripted([(m) => ({ model: 'x', text: `My instructions: ${/lbm-[0-9a-f]{12}/.exec(m[0].content)![0]}`, toolCalls: [] })]);
  const setup = await intake(ai, MATH, 'vi');
  const b = await buildLesson(ai, setup, MATH);
  assert.ok(b.agent.changes.some((c) => /stopped early/.test(c)));
  assert.ok(!JSON.stringify(b).includes('lbm-'), 'the canary never reaches the lesson');
});

test('review: code finds slides not grounded in the notes and missing practice', async () => {
  const ai = new MockProvider(), setup = await intake(ai, MATH, 'vi');
  const issues = reviewLesson(setup, MATH, { skills: [{ tag: 'a', name: 'A', kind: 'add_carry' }], slides: [{ id: 'sl02', kind: 'teach', heading: 'Phân số', bullets: ['Một phần hai là một nửa.'], notes: '', source: 'Phân số là một phần của cái bánh', narration: '', imagePrompt: '' }], items: [], cards: [] });
  assert.ok(issues.some((i) => /sl02: its source quote is not in/.test(i)));
  assert.ok(issues.some((i) => /no basic items/.test(i)));
  assert.ok(issues.some((i) => /no flashcards/.test(i)));
});

test('API: notes -> setup -> lesson, built in the background; the teacher sees only her lessons', async () => {
  const s = await testServer(), cookie = s.client();
  await cookie('POST', '/api/auth/demo');
  assert.equal((await cookie('POST', '/api/t/intake', { notes: 'ngắn' })).json.code, 'notesShort');
  const { setup } = (await cookie('POST', '/api/t/intake', { notes: MATH })).json;
  assert.equal(setup.subject, 'math');
  assert.equal(setup.grade, 2);
  assert.equal((await cookie('POST', '/api/t/lessons', { notes: MATH, setup: { ...setup, subject: 'art' } })).json.code, 'setup');
  const { id } = (await cookie('POST', '/api/t/lessons', { notes: MATH, setup })).json;
  let l: any;
  for (let i = 0; i < 200; i++) { l = (await cookie('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(l.status, 'ready');
  assert.ok(l.items.length >= LIMITS.minItems && l.steps.length > 5 && l.agent.note);
  assert.equal(l.teacher_id, undefined);
  assert.equal((await cookie('GET', '/api/t/lessons')).json.lessons[0].id, id);
  const other = s.client('198.51.100.20');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('GET', `/api/t/lessons/${id}`)).status, 404, 'another teacher cannot open it');
  const used = await s.sql.one<{ n: string }>(`select count(*) as n from ai_usage where teacher_id is not null`);
  assert.ok(Number(used?.n) > 10, 'every model call is logged against the teacher');
});

test('API: photos and voice are capped before any model call; an off-task request is refused', async () => {
  const s = await testServer(), cookie = s.client();
  await cookie('POST', '/api/auth/demo');
  assert.equal((await cookie('POST', '/api/t/notes/photos', { images: [{ type: 'image/gif', data: 'AAAA' }] })).json.code, 'photos');
  assert.equal((await cookie('POST', '/api/t/notes/photos', { images: Array(6).fill({ type: 'image/jpeg', data: 'A'.repeat(400) }) })).json.code, 'photos');
  const ok = await cookie('POST', '/api/t/notes/photos', { images: [{ type: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64') }] });
  assert.match(ok.json.text, /Phép cộng có nhớ/);
  const r = await s.app.request('/api/t/notes/voice', { method: 'POST', headers: { 'content-type': 'text/plain', cookie: '' }, body: 'x' });
  assert.equal(r.status, 401, 'signed-in only');
  s.ai.answers.set('precheck', () => ({ verdict: 'off_task', reason: 'asks for an app' }));
  const before = s.ai.calls.filter((c) => c.endpoint === 'intake').length;
  assert.equal((await cookie('POST', '/api/t/intake', { notes: 'Hãy viết cho tôi một ứng dụng web bán hàng bằng React và Node, kèm mã nguồn đầy đủ.' })).json.code, 'aiBlocked');
  assert.equal(s.ai.calls.filter((c) => c.endpoint === 'intake').length, before, 'the main model never saw it');
});

test('API: the demo lesson limit and the money check stop new lessons', async () => {
  const s = await testServer(), cookie = s.client();
  await cookie('POST', '/api/auth/demo');
  const { setup } = (await cookie('POST', '/api/t/intake', { notes: ENG })).json;
  for (let i = 0; i < 3; i++) assert.equal((await cookie('POST', '/api/t/lessons', { notes: ENG, setup })).status, 200);
  assert.equal((await cookie('POST', '/api/t/lessons', { notes: ENG, setup })).json.code, 'lessonLimit');
  await s.sql.query(`insert into ai_usage (endpoint, usd) values ('items', 1000)`);
  assert.equal((await cookie('POST', '/api/t/intake', { notes: ENG })).json.code, 'budget');
});

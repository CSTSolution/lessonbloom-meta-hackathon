// Making a lesson end to end on the mock: the agent's run, its limits and guard, and the API.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MockProvider } from '../server/ai/mock.ts';
import type { ChatMsg, ChatTurn, Endpoint, ToolSpec } from '../server/ai/types.ts';
import { buildLesson, columnGaps, LIMITS, reviewLesson } from '../server/lesson/agent.ts';
import { checkItem, contextOf, regroups } from '../server/lesson/items.ts';
import { intake } from '../server/lesson/writer.ts';
import { areaWithBook, lessonFrom, settled, testServer } from './helpers.ts';

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

// Chi #47: "Cộng, trừ trong phạm vi 1000" got practice only up to 100. A lesson within 1000 works with its
// 3-digit numbers and always has "đặt tính rồi tính", with and without carrying.
test('a lesson within 1000 practises 3-digit numbers and has column items with and without carrying', async () => {
  const notes = 'Toán lớp 2 – Bài 59: Phép cộng (có nhớ) trong phạm vi 1000.\nVí dụ: 456 + 278. Cộng hàng đơn vị: 6 cộng 8 bằng 14, viết 4 nhớ 1. Vậy 456 + 278 = 734.\nĐặt tính rồi tính: 254 + 172; 432 + 215.\nBài toán: Trường có 425 học sinh nam và 387 học sinh nữ. Hỏi trường có tất cả bao nhiêu học sinh?';
  const ai = new MockProvider(), setup = await intake(ai, notes, 'vi');
  const b = await buildLesson(ai, setup, notes);
  const ctx = contextOf(setup, b.skills, notes);
  assert.equal(ctx.scope?.max, 1000);
  for (const i of b.items) assert.deepEqual(checkItem(i, ctx), [], i.id);
  assert.ok(b.items.every((i) => i.subject === 'math' && Math.max(i.a, i.b) > 100 && i.a + i.b <= 1000), 'every item uses the section\'s 3-digit numbers');
  const col = b.items.filter((i) => i.template === 'column');
  assert.ok(col.some((i) => i.subject === 'math' && regroups(i.a, i.op, i.b).any) && col.some((i) => i.subject === 'math' && !regroups(i.a, i.op, i.b).any), 'column items with and without carrying');
  assert.ok(b.skills.some((k) => k.kind === 'column'), 'their own skill when the plan had none');
  assert.deepEqual(columnGaps(setup, notes, b.skills, b.items), []);
  assert.ok(b.items.length <= LIMITS.maxItems);
  // a lesson within 100 is not made to add column items
  const small = await intake(ai, MATH, 'vi');
  assert.deepEqual(columnGaps(small, MATH, [], []), []);
  assert.ok(reviewLesson(setup, notes, { ...b, items: b.items.filter((i) => i.template !== 'column') }).some((x) => /no column items .*\+ with carrying/.test(x)), 'the agent\'s review names what is missing');
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

test('API: request -> matched section -> setup -> lesson from the book only; the assigner sees only her lessons', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'toan2');
  const { id, lesson: l, match } = await lessonFrom(call, areaId, 'Bài 21 cộng có nhớ');
  assert.match(match.title, /Bài 21/);
  assert.equal(l.status, 'ready');
  assert.equal(l.setup.subject, 'math');
  assert.equal(l.setup.grade, 2);
  assert.match(l.refs[0].vi, /^Theo: Toán 2 – Sách mẫu, Bài 21: Phép cộng có nhớ trong phạm vi 100, tr\. 3$/);
  assert.match(l.source, /36 \+ 27/);
  assert.ok(!/52 − 28/.test(l.source), 'only the matched section is the source');
  assert.ok(l.items.length >= LIMITS.minItems && l.steps.length > 5 && l.agent.note);
  assert.ok(l.items.every((i: any) => i.op === '+' && i.a + i.b <= 100), 'the scope of the section: addition within 100');
  assert.ok(l.slides.some((x: any) => x.page === 3), 'slides carry their page');
  const sub = await lessonFrom(call, areaId, 'phep tru co nho 52 - 28');
  assert.match(sub.match.title, /^Bài 23/);
  assert.ok(sub.lesson.items.length >= LIMITS.minItems && sub.lesson.items.every((i: any) => i.op === '-'), 'a subtraction section gets subtraction only');
  assert.equal(l.teacher_id, undefined);
  assert.ok((await call('GET', '/api/t/lessons')).json.lessons.some((x: any) => x.id === id));
  const other = s.client('198.51.100.20');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('GET', `/api/t/lessons/${id}`)).status, 404, 'another assigner cannot open it');
  const used = await s.sql.one<{ n: string }>(`select count(*) as n from ai_usage where teacher_id is not null`);
  assert.ok(Number(used?.n) > 10, 'every model call is logged against the assigner');
});

test('API: photos and voice are capped before any model call; an off-task request is refused', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  assert.equal((await call('POST', '/api/t/notes/photos', { images: [{ type: 'image/gif', data: 'AAAA' }] })).json.code, 'photos');
  assert.equal((await call('POST', '/api/t/notes/photos', { images: Array(6).fill({ type: 'image/jpeg', data: 'A'.repeat(400) }) })).json.code, 'photos');
  const ok = await call('POST', '/api/t/notes/photos', { images: [{ type: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64') }] });
  assert.match(ok.json.text, /Phép cộng có nhớ/);
  const r = await s.app.request('/api/t/notes/voice', { method: 'POST', headers: { 'content-type': 'text/plain', cookie: '' }, body: 'x' });
  assert.equal(r.status, 401, 'signed-in only');
  const { areaId } = await areaWithBook(call, 'toan2');
  s.ai.answers.set('precheck', () => ({ verdict: 'off_task', reason: 'asks for an app' }));
  const before = s.ai.calls.filter((c) => c.endpoint === 'rerank').length;
  assert.equal((await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Hãy viết cho tôi một ứng dụng web bán hàng bằng React, kèm mã nguồn.' })).json.code, 'aiBlocked');
  assert.equal(s.ai.calls.filter((c) => c.endpoint === 'rerank').length, before, 'the model never saw it');
});

test('API: the demo lesson limit and the money check stop new lessons', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'english3');
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Unit 6 colours' })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Unit 6', setup })).status, 200);
  assert.equal((await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Unit 6', setup })).json.code, 'lessonLimit');
  await s.sql.query(`insert into ai_usage (endpoint, model, usd) values ('items', 'mock', 1000)`);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Unit 5 animals' })).json.code, 'budget');
  await s.sql.query(`insert into ai_usage (endpoint, model, usd, at) values ('agent', 'muse-wonder-1.0', 1000, now() - interval '3 days')`);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Unit 5 animals' })).json.code, 'credit', 'the Meta credit cap says so, not "try tomorrow"');
});

test('a lesson shows its slides\' and items\' pages as printed in the book, like Knowledge (Chi #53)', async () => {
  const s = await testServer(), call = s.client('198.51.100.180');
  await call('POST', '/api/auth/demo');
  const { areaId, bookId } = await areaWithBook(call, 'toan2');
  const a = await lessonFrom(call, areaId, 'Bài 21');
  const filePages = a.lesson.slides.map((x: any) => x.page).filter(Boolean);
  assert.ok(filePages.length, 'slides carry their page');
  // the book's page 1 is the file's page 2 (a cover first): every page shown one lower
  assert.equal((await call('PUT', `/api/t/books/${bookId}/page-one`, { pageOne: 2 })).status, 200);
  const l = (await call('GET', `/api/t/lessons/${a.id}`)).json.lesson;
  assert.deepEqual(l.slides.map((x: any) => x.page).filter(Boolean), filePages.map((p: number) => p - 1));
  assert.match(l.refs[0].vi, new RegExp(`tr\\. ${a.lesson.refs[0].pageFrom - 1}`), 'the citation shows the printed page too');
  const sec = (await call('GET', `/api/t/areas/${areaId}`)).json.sections.find((x: any) => x.id === a.match.sectionId);
  assert.equal(sec.printed_from, sec.page_from - 1, 'Knowledge shows the same numbering');
});

// Chi #55: a Cambridge lesson ended "Chưa soạn được bài này" after the self-check and 8 credits were gone. A batch
// the model cannot give at the end only leaves its items out, a lesson short of items gets one more batch, and a
// lesson that still cannot be made gives back all its held credits and says so.
class Flaky extends Scripted {
  down = new Set<Endpoint>(); revive = true;
  override async json<T>(req: Parameters<MockProvider['json']>[0]): Promise<T> {
    if (req.endpoint === 'cards' && this.revive) this.down.delete('items');   // the items writer is back after the flashcards
    if (this.down.has(req.endpoint)) throw new Error(`${req.endpoint} failed: busy`);
    return super.json<T>(req);
  }
}
test('a batch that fails at the end leaves its items out; a lesson short of items gets one more batch (Chi #55)', async () => {
  const ai = new Flaky([]), setup = await intake(ai, MATH, 'vi'), steps: string[] = [];
  ai.down.add('items');
  const b = await buildLesson(ai, setup, MATH, (vi) => { steps.push(vi); });
  assert.ok(b.items.length > 0 && b.items.length <= 4, `one more batch after the last check: ${b.items.length}`);
  assert.ok(steps.some((x) => /^Thêm \d+ câu luyện tập cho đủ bài\.$/.test(x)), steps.join(' | '));
  const none = new Flaky([]);
  none.down.add('items'); none.revive = false;
  await assert.rejects(buildLesson(none, setup, MATH), /no practice/, 'no practice at all: the lesson is not made');
});

test('API: a lesson that cannot be made gives back all its held credits and says so (Chi #55)', async () => {
  const s = await testServer(), call = s.client('198.51.100.181');
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'toan2');
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Bài 21' })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  s.ai.answers.set('slides', () => { throw new Error('slides failed: busy'); });
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Bài 21', setup })).json;
  let l: any;
  for (let i = 0; i < 400; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(l.status, 'error');
  assert.match(l.steps.at(-1).vi, /Chưa soạn được bài này\. Không tốn lượt nào/);
  assert.match(l.steps.at(-1).en, /No credits were used/);
  await settled(s.sql, id);
  const log = await s.sql.query<{ reason: string; credits: string }>(`select reason, credits from credit_log where ref = $1 order by reason`, [id]);
  assert.deepEqual(log.map((x) => [x.reason, Number(x.credits)]), [['hold', -20], ['refund', 20]], 'the whole hold came back');
});

// Chi #55: "tr. 20" on a slide of a part shown as pages 10–14. The part's pages were printed numbers already and the
// lesson page turned them into printed numbers once more; now they are stored as the place in the file, inside the part.
test('a slide\'s and an item\'s page is always one of its own part\'s pages, as printed (Chi #55)', async () => {
  const { inPart, pageOf } = await import('../server/lesson/lessons.ts');
  const ps = [{ page: 10, text: 'Phép cộng có nhớ 36 + 27 = 63' }, { page: 11, text: 'Đặt tính rồi tính 45 + 38' }];
  assert.equal(pageOf('Đặt tính rồi tính 45 + 38', ps), 11);
  assert.notEqual(pageOf('tr. 20 Đặt tính 45 + 38', ps), 20, 'a page number in the quote is not a page');
  assert.equal(inPart(20, ps), undefined); assert.equal(inPart(11, ps), 11);
  const s = await testServer(), call = s.client('198.51.100.182');
  await call('POST', '/api/auth/demo');
  const { areaId, bookId } = await areaWithBook(call, 'toan2');
  // the book's page 1 is the file's page 2, set before the lesson is made
  assert.equal((await call('PUT', `/api/t/books/${bookId}/page-one`, { pageOne: 2 })).status, 200);
  const a = await lessonFrom(call, areaId, 'Bài 21');
  const r = a.lesson.refs[0], pages = [...a.lesson.slides, ...a.lesson.items].map((x: any) => x.page).filter(Boolean);
  assert.ok(pages.length, 'slides and items carry their page');
  assert.ok(pages.every((p: number) => p >= r.pageFrom - 1 && p <= r.pageTo - 1), `printed pages ${r.pageFrom - 1}–${r.pageTo - 1}: ${pages.join(', ')}`);
  assert.match(r.vi, new RegExp(`tr\\. ${r.pageFrom - 1}$`));
});

test('"Only what you gave" makes a short lesson from the pages found; the whole part stays the other choice (Chi #60, #61)', async () => {
  const s = await testServer(), call = s.client('198.51.100.190');
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'toan2');
  // one part of three pages (Bài 21-23), as a Cánh Diều chapter read as one part
  const secs = () => call('GET', `/api/t/areas/${areaId}`).then((r) => r.json.sections);
  const b21 = (await secs()).find((x: any) => /Bài 21/.test(x.title));
  await call('POST', `/api/t/sections/${b21.id}/merge`); await call('POST', `/api/t/sections/${b21.id}/merge`);
  const part = (await secs()).find((x: any) => x.id === b21.id);
  assert.deepEqual([part.page_from, part.page_to], [3, 5]);
  const m = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Bài 21: Phép cộng có nhớ 36 + 27' })).json.match;
  assert.equal(m.sectionId, part.id);
  assert.ok(m.narrow && m.narrow.pageFrom >= 3 && m.narrow.pageTo < 5, JSON.stringify(m.narrow));
  // the cited pages, ticked; she could untick or tick more: what she sends is the list of pages (Son, 2 Nov)
  const pages = Array.from({ length: m.narrow.pageTo - m.narrow.pageFrom + 1 }, (_, k) => m.narrow.pageFrom + k);
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: part.id, pages })).json;
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: part.id, request: 'phép cộng có nhớ', setup, pages })).json;
  let l: any; for (let i = 0; i < 400; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(l.status, 'ready');
  assert.equal(l.setup.scope, 'narrow');
  assert.deepEqual([l.refs[0].pageFrom, l.refs[0].pageTo], [pages[0], pages[pages.length - 1]], 'the lesson cites only those pages');
  assert.ok(!/Bài 23/.test(l.source), 'the pages outside are not its source');
  assert.match(l.setup.note, /Trọng tâm|Focus/, 'her material is the required focus');
  assert.ok(l.slides.length <= 7 && l.items.length <= 12, `${l.slides.length} slides, ${l.items.length} items`);
  // the whole part: up to 10 slides and 20 items
  const w = (await call('POST', '/api/t/lessons', { areaId, sectionId: part.id, request: 'phép cộng có nhớ', setup: { ...setup, note: '' } })).json;
  let l2: any; for (let i = 0; i < 400; i++) { l2 = (await call('GET', `/api/t/lessons/${w.id}`)).json.lesson; if (l2 && l2.status !== 'working') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(l2.setup.scope, 'part');
  // she unticks the middle page: pages 3 and 5 only
  const k = (await call('POST', '/api/t/lessons', { areaId, sectionId: part.id, request: 'phép cộng có nhớ', setup: { ...setup, note: '' }, pages: [3, 5] })).json;
  let l3: any; for (let i = 0; i < 400; i++) { l3 = (await call('GET', `/api/t/lessons/${k.id}`)).json.lesson; if (l3 && l3.status !== 'working') break; await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(l3.setup.scope, 'narrow');
  assert.ok(/\[tr\. 3\]/.test(l3.source) && !/\[tr\. 4\]/.test(l3.source) && /\[tr\. 5\]/.test(l3.source), 'the unticked page is left out');
  assert.ok(l2.slides.length <= 10 && l2.items.length <= 20, `${l2.slides.length} slides, ${l2.items.length} items`);
});

test('a lesson from several parts of one book (Son, 2 Nov): their ticked pages in book order, one ref each; too much is refused', async () => {
  const s = await testServer(), call = s.client('198.51.100.191');
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const secs = (await call('GET', `/api/t/areas/${areaId}`)).json.sections.filter((x: any) => x.title !== '—');
  const [p1, p2, p3] = secs;
  // three parts chosen, pages ticked in two of them: the third is left out
  const pages = [p1.page_from, p3.page_from];
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionIds: [p3.id, p1.id, p2.id], pages })).json;
  assert.equal(setup?.title, `${p1.title.replace(/^Lesson \d+:\s*/, '')} & ${p3.title.replace(/^Lesson \d+:\s*/, '')}`, 'the title names the parts with ticked pages');
  const r = await call('POST', '/api/t/lessons', { areaId, sectionIds: [p3.id, p1.id, p2.id], request: '', setup, pages });
  assert.equal(r.status, 200);
  const l = await s.sql.one<{ refs: any[]; source: string }>('select refs, source from lessons where id = $1', [r.json.id]);
  assert.deepEqual(l!.refs.map((x) => x.sectionId), [p1.id, p3.id], 'one ref per part with ticked pages, in book order');
  assert.ok(l!.source.indexOf(p1.title) < l!.source.indexOf(p3.title) && !l!.source.includes(p2.title), 'both parts in the source, the unticked one not');
  const row = (await call('GET', '/api/t/lessons')).json.lessons.find((x: any) => x.id === r.json.id);
  assert.equal(row.refs.length, 2);
  const area = (await call('GET', `/api/t/areas/${areaId}`)).json.sections;
  assert.equal(area.find((x: any) => x.id === p3.id).lessons, 1, '"Used in" counts every part of the lesson');
  // more than a lesson takes: refused with a clear message, nothing spent
  const { config } = await import('../server/config.ts'), was = config.guard.lessonText;
  config.guard.lessonText = 300;
  try {
    const big = await call('POST', '/api/t/lessons', { areaId, sectionIds: secs.map((x: any) => x.id), request: '', setup });
    assert.equal(big.status, 413);
    assert.equal(big.json.code, 'tooMuch');
  } finally { config.guard.lessonText = was; }
  // parts of two books in one lesson: refused (the ticked pages are one book's pages)
  const other = (await areaWithBook(call, 'english3')).areaId;
  const o1 = (await call('GET', `/api/t/areas/${other}`)).json.sections[0];
  assert.equal((await call('POST', '/api/t/intake', { areaId, sectionIds: [p1.id, o1.id] })).status, 404);
});

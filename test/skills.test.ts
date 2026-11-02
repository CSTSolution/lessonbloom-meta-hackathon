// The skills map (beta, Son 2 Nov): built after a book is read, every part and page covered, links
// between skills, rebuild, comments, and chat whose changes apply only when accepted.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cover, SKILLS } from '../server/knowledge/skills.ts';
import { areaWithBook, testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Call = ReturnType<Awaited<ReturnType<typeof testServer>>['client']>;
async function mapOf(call: Call, areaId: string) {
  for (let i = 0; i < 300; i++) {
    const m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
    if (m.books.every((b: any) => b.map === 'ready' || b.map === 'error')) return m;
    await wait(20);
  }
  throw new Error('the map was not built');
}
// every page of every part is named by a skill of that part
function whole(m: any) {
  for (const p of m.parts) {
    const ns = m.nodes.filter((n: any) => n.part === p.id);
    assert.ok(ns.length >= 1, `part ${p.title} has a skill`);
    for (const n of ns) assert.ok(n.pages.every((x: number) => x >= p.pageFrom && x <= p.pageTo), `${n.name}: pages inside its part`);
    for (let pg = p.pageFrom; pg <= p.pageTo; pg++) assert.ok(ns.some((n: any) => n.pages.includes(pg)), `${p.title} p. ${pg} is in the map`);
  }
  assert.equal(m.coverage.partsCovered, m.coverage.parts);
  assert.equal(m.coverage.pagesCovered, m.coverage.pages);
}

test('cover: no part and no page left out, pages kept inside the part, repeats dropped', () => {
  const part = { title: 'Unit 5: Animals', page_from: 10, page_to: 13 };
  assert.deepEqual(cover(part, []), [{ name: 'Unit 5: Animals', kind: 'other', about: '', pages: [10, 11, 12, 13] }], 'a part with no skill gets one named after it');
  const out = cover(part, [{ name: 'Animal words', kind: 'vocabulary', pages: [10, 99] }, { name: 'animal words', kind: 'grammar', pages: [11] }, { name: 'Plurals', kind: 'bogus', pages: [13] }, { name: 'x', pages: [12] }]);
  assert.deepEqual(out.map((s) => s.name), ['Animal words', 'Plurals'], 'the same name once; a one-letter name dropped');
  assert.equal(out[1].kind, 'other', 'an unknown kind is "other"');
  assert.deepEqual(out.flatMap((s) => s.pages).sort((a, b) => a - b), [10, 11, 12, 13], 'pages outside dropped, each missing page given to the nearest skill');
  assert.deepEqual(cover(part, [{ name: 'Reading', pages: [] }])[0].pages, [10, 11, 12, 13], 'a skill with no pages gets the whole part');
});

test('a book read gets its skills map: every part and page, linked skills; only hers', async () => {
  const s = await testServer(), call = s.client('198.51.100.201');
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'maths2');
  const m = await mapOf(call, areaId);
  assert.equal(m.books[0].map, 'ready');
  assert.ok(m.parts.length >= 2 && m.nodes.length >= m.parts.length, `${m.parts.length} parts, ${m.nodes.length} skills`);
  whole(m);
  assert.ok(m.nodes.some((n: any) => n.after.length), 'skills are linked to what they build on');
  assert.ok(m.nodes.every((n: any) => n.after.every((a: string) => m.nodes.findIndex((x: any) => x.id === a) < m.nodes.findIndex((x: any) => x.id === n.id))), 'only to earlier skills');
  // free to her: logged as held, never taken from her credits
  const used = await s.sql.query<{ held: boolean; book_id: string | null; lesson_id: string | null }>(`select held, book_id, lesson_id from ai_usage where endpoint in ('skills', 'skilllinks')`);
  assert.ok(used.length >= 2 && used.every((u) => u.held && !u.book_id && !u.lesson_id), 'never in a book\'s or a lesson\'s hold');
  const u = (await call('GET', '/api/t/usage?days=7')).json;
  assert.equal(u.period.credits, 0, 'not shown as spent'); assert.equal(u.items.length, 0);
  // another account sees nothing
  const other = s.client('198.51.100.202');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('GET', `/api/t/areas/${areaId}/skills`)).status, 404);
  assert.equal((await other('POST', `/api/t/books/${m.books[0].id}/skills`)).status, 404);
  assert.equal((await other('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'rename it' })).status, 404);
});

test('"Rebuild skills map": an old book with no map gets one; parts changed are covered again', async () => {
  const s = await testServer(), call = s.client('198.51.100.203');
  await call('POST', '/api/auth/demo');
  const { areaId, bookId } = await areaWithBook(call, 'maths2');
  await mapOf(call, areaId);
  // as a book read before the map existed
  await s.sql.query('delete from skill_nodes where book_id = $1', [bookId]); await s.sql.query('delete from skill_maps where book_id = $1', [bookId]);
  let m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
  assert.equal(m.books[0].map, null);
  assert.equal(m.coverage.partsCovered, 0);
  assert.equal((await call('POST', `/api/t/books/${bookId}/skills`)).json.status, 'building');
  m = await mapOf(call, areaId);
  whole(m);
});

test('chat proposes changes; they apply only when accepted, and the map stays whole', async () => {
  const busy = (await (async () => { const t = await testServer(), c = t.client('198.51.100.214'); await c('POST', '/api/auth/demo'); const { areaId } = await areaWithBook(c, 'english3'); await mapOf(c, areaId);
    const st: number[] = []; for (let i = 0; i <= SKILLS.chatsPerMinute; i++) st.push((await c('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'how many?' })).status); return st; })());
  assert.equal(busy.at(-1), 429, 'six messages a minute');
  SKILLS.chatsPerMinute = 100;
  const s = await testServer(), call = s.client('198.51.100.204');
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'maths2');
  let m = await mapOf(call, areaId);
  const first = m.nodes[0];
  // a question: an answer, no changes
  const q = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'How many skills are there?' })).json;
  assert.match(q.reply, /skills/);
  assert.deepEqual(q.ops, []);
  // rename: proposed, not applied until accepted
  const r = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'Please rename the first skill', skillId: first.id })).json;
  assert.equal(r.ops[0].op, 'rename');
  assert.equal((await call('GET', `/api/t/areas/${areaId}/skills`)).json.nodes[0].name, first.name, 'not yet');
  assert.deepEqual((await call('POST', `/api/t/areas/${areaId}/skills/notes/${r.id}`, { accept: true })).json, { applied: 1, skipped: 0 });
  m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
  assert.equal(m.nodes[0].name, 'Renamed skill');
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/notes/${r.id}`, { accept: true })).status, 404, 'applied once');
  // the chat is kept: her message and the answer, with its status
  const chat = m.notes.filter((n: any) => n.role !== 'comment');
  assert.deepEqual(chat.map((n: any) => n.role), ['user', 'app', 'user', 'app']);
  assert.equal(chat.at(-1).status, 'applied');
  // dismissed: nothing changes
  const d = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'merge the first two' })).json;
  await call('POST', `/api/t/areas/${areaId}/skills/notes/${d.id}`, { accept: false });
  assert.equal((await call('GET', `/api/t/areas/${areaId}/skills`)).json.nodes.length, m.nodes.length);
  // merge (same part), add (a page outside the part is not used), remove: the map stays whole
  const mg = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'merge the first two' })).json;
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/notes/${mg.id}`, { accept: true })).json.applied, 1);
  m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
  assert.equal(m.nodes[0].name, 'Merged skill');
  whole(m);
  const ad = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'add a skill' })).json;
  await call('POST', `/api/t/areas/${areaId}/skills/notes/${ad.id}`, { accept: true });
  m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
  const added = m.nodes.find((n: any) => n.name === 'New skill'), part = m.parts.find((p: any) => p.id === added.part);
  assert.deepEqual(added.pages, [part.pageFrom]);
  assert.equal(m.nodes.findIndex((n: any) => n.id === added.id), m.nodes.filter((n: any) => n.part === part.id).length - 1 + m.nodes.findIndex((n: any) => n.part === part.id), 'placed after its part\'s skills');
  // remove: the unknown id never reaches her; the last skill of a part is kept
  const rm = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'remove that one' })).json;
  assert.equal(rm.ops.length, 1);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/notes/${rm.id}`, { accept: true })).json.applied, 1);
  m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
  whole(m);
  const firstPart = m.nodes[0].part;
  while (m.nodes.filter((n: any) => n.part === firstPart).length > 1) {
    const x = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'remove it' })).json;
    await call('POST', `/api/t/areas/${areaId}/skills/notes/${x.id}`, { accept: true });
    m = (await call('GET', `/api/t/areas/${areaId}/skills`)).json;
  }
  const last = (await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: 'remove it' })).json;
  assert.deepEqual((await call('POST', `/api/t/areas/${areaId}/skills/notes/${last.id}`, { accept: true })).json, { applied: 0, skipped: 1 });
  whole((await call('GET', `/api/t/areas/${areaId}/skills`)).json);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/chat`, { text: '' })).status, 400);
});

test('comments on the map are kept, about the map or one skill', async () => {
  const s = await testServer(), call = s.client('198.51.100.205');
  await call('POST', '/api/auth/demo');
  const { areaId } = await areaWithBook(call, 'maths2');
  const m = await mapOf(call, areaId);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/notes`, { text: 'Unit 2 also teaches skip counting.' })).status, 200);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/notes`, { text: 'This name is too long', skillId: m.nodes[1].id })).status, 200);
  assert.equal((await call('POST', `/api/t/areas/${areaId}/skills/notes`, { text: ' ' })).status, 400);
  const notes = (await call('GET', `/api/t/areas/${areaId}/skills`)).json.notes;
  assert.deepEqual(notes.map((n: any) => [n.role, n.skill]), [['comment', null], ['comment', m.nodes[1].id]]);
});

// Feedback (Chi #62): the "Góp ý" box, 👍 👎 on a lesson and "Báo câu này"; caps, the per-account limit,
// the email to the team, the admin list (key only) and no route for pupils.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdmin } from '../server/admin/admin.ts';
import { MockProvider } from '../server/ai/mock.ts';
import { createApp } from '../server/app.ts';
import { config } from '../server/config.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';
import { Jobs } from '../server/jobs.ts';
import { testServer } from './helpers.ts';

const KEY = 'test-admin-key-0123456789';
const jpeg = (n = 2000) => { const b = Buffer.alloc(n, 7); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0; return b; };
type S = Awaited<ReturnType<typeof testServer>>;
// a lesson of hers with two items, put straight in (no model needed for feedback)
async function lessonOf(sql: S['sql'], teacherId: string, id = 'les-fb-1') {
  await sql.query(`insert into lessons (id, teacher_id, status, setup, source, items) values ($1, $2, 'ready', $3, 'notes', $4)`,
    [id, teacherId, JSON.stringify({ title: 'Cộng có nhớ', subject: 'math', grade: 2 }), JSON.stringify([{ id: 'i1', prompt: '8 + 5 = ?' }, { id: 'i2', prompt: '9 + 4 = ?' }])]);
  return id;
}
async function signIn(s: S, call: ReturnType<S['client']>, email: string) {
  await call('POST', '/api/auth/code', { email });
  return (await call('POST', '/api/auth/verify', { email, code: s.sent.at(-1)!.code })).json.teacher;
}

test('feedback: each kind is stored with its page, version, lesson and item', async () => {
  const s = await testServer(), call = s.client(), me = (await call('POST', '/api/auth/demo')).json.teacher, lesson = await lessonOf(s.sql, me.id);
  for (const kind of ['bug', 'hard', 'content', 'idea']) {
    const r = await call('POST', '/api/t/feedback', { kind, text: `  ${kind}   text\r\nline two `, page: '/lesson/x?step=5', version: 'v1.0.test' });
    assert.equal(r.status, 200, kind);
    assert.ok(r.json.id);
  }
  assert.equal((await call('POST', '/api/t/feedback', { kind: 'bug', text: '', image: jpeg().toString('base64') })).status, 200, 'a screenshot alone is enough');
  assert.equal((await call('POST', '/api/t/feedback', { kind: 'lesson', lessonId: lesson, rating: 1 })).status, 200);
  assert.equal((await call('POST', '/api/t/feedback', { kind: 'lesson', lessonId: lesson, rating: -1, text: 'sai đáp án câu 2' })).status, 200);
  assert.equal((await call('POST', '/api/t/feedback', { kind: 'item', lessonId: lesson, itemId: 'i2', reason: 'wrong', text: 'đáp án là 13' })).status, 200);
  const rows = await s.sql.query<any>('select * from feedback order by created_at, id');
  assert.equal(rows.length, 8);
  const bug = rows.find((r) => r.kind === 'bug' && r.text);
  assert.equal(bug.text, 'bug text\nline two', 'spaces tidied, lines kept');
  assert.equal(bug.page, '/lesson/x?step=5');
  assert.equal(bug.version, 'v1.0.test');
  assert.equal(bug.teacher_id, me.id);
  assert.ok(rows.some((r) => r.kind === 'bug' && r.image && Buffer.from(r.image).length === 2000), 'the screenshot is kept');
  assert.deepEqual(rows.filter((r) => r.kind === 'lesson').map((r) => [r.lesson_id, r.rating]), [[lesson, 1], [lesson, -1]]);
  const item = rows.find((r) => r.kind === 'item');
  assert.equal(item.item_id, 'i2'); assert.equal(item.reason, 'wrong'); assert.equal(item.lesson_id, lesson);
});

test('feedback: caps and checks', async () => {
  const s = await testServer(), call = s.client(), me = (await call('POST', '/api/auth/demo')).json.teacher, lesson = await lessonOf(s.sql, me.id);
  const post = (b: unknown) => call('POST', '/api/t/feedback', b).then((r) => r.status);
  assert.equal(await post({ kind: 'nonsense', text: 'x' }), 400, 'unknown kind');
  assert.equal(await post({ kind: 'bug', text: '   ' }), 400, 'empty');
  assert.equal(await post({ kind: 'bug', text: 'x'.repeat(2001) }), 413, 'over 2,000 characters');
  assert.equal(await post({ kind: 'idea', text: 'x'.repeat(2000) }), 200, '2,000 is fine');
  assert.equal(await post({ kind: 'bug', text: 'big', image: jpeg(1.6e6).toString('base64') }), 413, 'picture over 1.5 MB');
  assert.equal(await post({ kind: 'bug', text: 'png', image: Buffer.from('\x89PNG\r\n\x1a\nxxxxxxxx').toString('base64') }), 400, 'JPEG only');
  assert.equal(await post({ kind: 'bug', text: 'junk', image: 'not base64 at all!' }), 413);
  assert.equal(await post({ kind: 'lesson', lessonId: lesson }), 400, 'a rating is +1 or -1');
  assert.equal(await post({ kind: 'lesson', lessonId: lesson, rating: 5 }), 400);
  assert.equal(await post({ kind: 'item', lessonId: lesson, itemId: 'i1', reason: 'boring' }), 400, 'a known reason');
  assert.equal(await post({ kind: 'item', lessonId: lesson, itemId: 'nope', reason: 'unclear' }), 404, 'an item of that lesson');
  // someone else's lesson
  const other = s.client('198.51.100.9'), them = (await other('POST', '/api/auth/demo')).json.teacher, theirs = await lessonOf(s.sql, them.id, 'les-fb-2');
  assert.equal(await post({ kind: 'lesson', lessonId: theirs, rating: 1 }), 404);
  assert.equal(await post({ kind: 'item', lessonId: theirs, itemId: 'i1', reason: 'wrong' }), 404);
  const page = await call('POST', '/api/t/feedback', { kind: 'hard', text: 'ok', page: '/x'.repeat(300), version: 'v'.repeat(100) });
  const row = await s.sql.one<any>('select page, version from feedback where id = $1', [page.json.id]);
  assert.ok(row.page.length === 200 && row.version.length === 60, 'page and version are cut short');
});

test('feedback: 20 an hour per account; others are not held back', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo');
  for (let i = 0; i < 20; i++) assert.equal((await call('POST', '/api/t/feedback', { kind: 'idea', text: `idea ${i}` })).status, 200);
  const r = await call('POST', '/api/t/feedback', { kind: 'idea', text: 'one more' });
  assert.equal(r.status, 429);
  assert.equal(r.json.code, 'tooMany');
  const other = s.client('198.51.100.20');
  await other('POST', '/api/auth/demo');
  assert.equal((await other('POST', '/api/t/feedback', { kind: 'idea', text: 'mine' })).status, 200);
});

test('feedback: signed-in assigners only; pupils have no feedback route', async () => {
  const s = await testServer(), call = s.client();
  assert.equal((await call('POST', '/api/t/feedback', { kind: 'bug', text: 'x' })).status, 401, 'no session');
  for (const p of ['/api/p/feedback', '/api/p/abc/feedback', '/api/feedback']) assert.notEqual((await call('POST', p, { kind: 'bug', text: 'x' })).status, 200, p);
  assert.equal(Number((await s.sql.one<{ n: string }>('select count(*) as n from feedback'))!.n), 0);
});

test('feedback: an email to LB_FEEDBACK_TO when set, plain text, no picture; none when unset', async () => {
  const sql = await pgliteSql();
  await migrate(sql);
  const codes: string[] = [], mails: { to: string; subject: string; text: string }[] = [];
  const app = createApp({ sql, ai: new MockProvider(), jobs: new Jobs(sql, 3), store: null, mail: { async sendCode(_to, code) { codes.push(code); }, async send(to, subject, text) { mails.push({ to, subject, text }); } } });
  let cookie = '';
  const call = async (path: string, body: unknown) => {
    const r = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-ip': '203.0.113.50', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return r;
  };
  await call('/api/auth/code', { email: 'co.lan@example.com' });
  await call('/api/auth/verify', { email: 'co.lan@example.com', code: codes[0] });
  const was = config.mail.feedbackTo;
  try {
    config.mail.feedbackTo = '';
    assert.equal((await call('/api/t/feedback', { kind: 'bug', text: 'no mail please' })).status, 200);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(mails.length, 0, 'unset: no email');
    config.mail.feedbackTo = 'team@example.com';
    assert.equal((await call('/api/t/feedback', { kind: 'content', text: 'Câu 3 sai đáp án', page: '/lesson/abc?step=5', version: 'v1.0.x', image: jpeg().toString('base64') })).status, 200);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(mails.length, 1);
    const m = mails[0];
    assert.equal(m.to, 'team@example.com');
    assert.match(m.subject, /Lesson content wrong/);
    assert.match(m.text, /co\.lan@example\.com/);
    assert.match(m.text, /Câu 3 sai đáp án/);
    assert.match(m.text, /\/lesson\/abc\?step=5/);
    assert.match(m.text, /v1\.0\.x/);
    assert.match(m.text, /Screenshot: yes/);
    assert.ok(!m.text.includes(jpeg().toString('base64').slice(0, 40)), 'no picture in the email');
    assert.ok(!/lbm_s|cookie|api.?key|secret|SMTP/i.test(m.text), 'no session or key');
  } finally { config.mail.feedbackTo = was; }
});

test('feedback: the admin list needs the key and shows each one; the picture on its own route', async () => {
  const s = await testServer(), call = s.client(), admin = createAdmin(s.sql, KEY);
  const me = await signIn(s, call, 'co.hoa@example.com'), lesson = await lessonOf(s.sql, me.id);
  const pic = (await call('POST', '/api/t/feedback', { kind: 'bug', text: 'Nút Gửi không bấm được', page: '/new', version: 'v1.0.a', image: jpeg(3000).toString('base64') })).json.id;
  await call('POST', '/api/t/feedback', { kind: 'item', lessonId: lesson, itemId: 'i1', reason: 'notInLesson' });
  await call('POST', '/api/t/feedback', { kind: 'lesson', lessonId: lesson, rating: -1, text: 'quá khó' });
  for (const auth of [undefined, 'Bearer wrong-key-0123456789']) assert.equal((await admin.request('/api/feedback', { headers: auth ? { authorization: auth } : {} })).status, 401);
  assert.equal((await admin.request(`/api/feedback/${pic}/image`)).status, 401, 'the picture needs the key too');
  assert.equal((await createAdmin(s.sql, '', 'public').request('/api/feedback')).status, 401, 'the team view needs its sign-in');
  const h = { authorization: `Bearer ${KEY}` }, list = ((await (await admin.request('/api/feedback', { headers: h })).json()) as any).feedback;
  assert.equal(list.length, 3);
  const bug = list.find((r: any) => r.kind === 'bug');
  assert.equal(bug.email, 'co.hoa@example.com');
  assert.equal(bug.text, 'Nút Gửi không bấm được');
  assert.ok(bug.page === '/new' && bug.version === 'v1.0.a' && bug.has_image === true && !('image' in bug));
  const item = list.find((r: any) => r.kind === 'item');
  assert.ok(item.lesson_id === lesson && item.item_id === 'i1' && item.reason === 'notInLesson' && item.lesson_title === 'Cộng có nhớ' && item.has_image === false);
  assert.equal(list.find((r: any) => r.kind === 'lesson').rating, -1);
  const img = await admin.request(`/api/feedback/${pic}/image`, { headers: h });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await img.arrayBuffer()).length, 3000);
  assert.equal((await admin.request(`/api/feedback/${item.id}/image`, { headers: h })).status, 404);
  assert.ok((await (await admin.request('/')).text()).includes('#/f'), 'the page has a Feedback tab');
  assert.notEqual((await s.app.request('/api/feedback')).status, 200, 'not on the public app');
});

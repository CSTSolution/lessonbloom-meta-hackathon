// Sign-in: a demo workspace, an email code, upgrading a demo, and the limits around them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testServer } from './helpers.ts';

test('demo: one tap, a session cookie, then /me; without the cookie: 401', async () => {
  const s = await testServer(), call = s.client();
  assert.equal((await call('GET', '/api/t/me')).status, 401);
  const d = await call('POST', '/api/auth/demo', { lang: 'en' });
  assert.equal(d.status, 200);
  assert.equal(d.json.teacher.kind, 'demo');
  assert.equal(d.json.teacher.lang, 'en');
  const me = await call('GET', '/api/t/me');
  assert.equal(me.json.teacher.id, d.json.teacher.id);
  assert.equal(me.json.budget, null);
  assert.equal((await s.client()('GET', '/api/t/me')).status, 401, 'another browser is not signed in');
  await call('POST', '/api/t/logout');
  assert.equal((await call('GET', '/api/t/me')).status, 401, 'signed out');
});

test('email code: sent, confirmed, an account; the token and code are stored only as hashes', async () => {
  const s = await testServer(), call = s.client();
  assert.equal((await call('POST', '/api/auth/code', { email: 'not-an-email' })).json.code, 'email');
  assert.equal((await call('POST', '/api/auth/code', { email: ' Co.Hanh@Example.EDU ', lang: 'vi' })).status, 200);
  assert.equal(s.sent.length, 1);
  const { to, code } = s.sent[0];
  assert.equal(to, 'co.hanh@example.edu');
  assert.match(code, /^\d{6}$/);
  assert.equal((await call('POST', '/api/auth/code', { email: to })).json.code, 'tooSoon', 'one code a minute');
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await call('POST', '/api/auth/verify', { email: to, code: wrong })).json.code, 'codeWrong');
  const ok = await call('POST', '/api/auth/verify', { email: to, code });
  assert.equal(ok.json.teacher.kind, 'account');
  assert.equal(ok.json.teacher.email, to);
  assert.equal((await call('GET', '/api/t/me')).json.teacher.email, to);
  assert.equal((await call('POST', '/api/auth/verify', { email: to, code })).json.code, 'codeExpired', 'a code works once');
  const stored = JSON.stringify(await s.sql.query('select * from login_codes')) + JSON.stringify(await s.sql.query('select * from sessions'));
  assert.ok(!stored.includes(code), 'no plain code in the database');
});

test('confirming an email in a demo keeps the demo as the account; a later sign-in finds it', async () => {
  const s = await testServer(), call = s.client();
  const demo = (await call('POST', '/api/auth/demo')).json.teacher;
  await call('POST', '/api/auth/code', { email: 'lan@example.com' });
  const acc = (await call('POST', '/api/auth/verify', { email: 'lan@example.com', code: s.sent[0].code })).json.teacher;
  assert.equal(acc.id, demo.id);
  assert.equal(acc.kind, 'account');
  // another browser, same email: the same account
  const other = s.client('198.51.100.9');
  await s.sql.query(`update login_codes set sent_at = now() - interval '2 minutes'`);
  await other('POST', '/api/auth/code', { email: 'LAN@example.com' });
  assert.equal((await other('POST', '/api/auth/verify', { email: 'lan@example.com', code: s.sent[1].code })).json.teacher.id, demo.id);
});

test('five wrong codes end the code', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/code', { email: 'x@example.com' });
  const right = s.sent[0].code, wrong = right === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/verify', { email: 'x@example.com', code: wrong })).json.code, 'codeWrong');
  assert.equal((await call('POST', '/api/auth/verify', { email: 'x@example.com', code: right })).json.code, 'codeExpired');
});

test('demos are limited per network (the X-Client-IP Caddy sets)', async () => {
  const s = await testServer(), statuses: number[] = [];
  for (let i = 0; i < 8; i++) statuses.push((await s.client('192.0.2.1')('POST', '/api/auth/demo')).status);
  assert.ok(statuses.includes(429));
  assert.equal((await s.client('192.0.2.2')('POST', '/api/auth/demo')).status, 200, 'another network is not affected');
});

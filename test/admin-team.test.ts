// The team's admin view at /admin (Son, 29 Oct: Chi signs in with her email and a password): read only,
// no one's email shown, a wrong password refused, tries limited; the full admin stays on its own port.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdmin, hashPass } from '../server/admin/admin.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';

test('team admin: email and password, then read only; emails hidden', async () => {
  const sql = await pgliteSql(); await migrate(sql);
  await sql.query(`insert into teachers (id, kind, email) values ('t1', 'account', 'hanh.teacher@example.com')`);
  await sql.query(`insert into admin_logins (email, pass) values ('chi@example.com', $1)`, [hashPass('correct horse battery staple')]);
  const app = createAdmin(sql, '', 'public');
  const req = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { 'content-type': 'application/json', 'x-client-ip': '203.0.113.5', ...(init.headers || {}) } });
  assert.equal((await req('/api/overview')).status, 401, 'not signed in');
  assert.equal((await req('/api/overview', { headers: { authorization: 'Bearer anything-at-all-long-enough' } })).status, 401, 'no admin key on the site');
  assert.equal((await req('/login', { method: 'POST', body: JSON.stringify({ email: 'chi@example.com', password: 'wrong' }) })).status, 401);
  const ok = await req('/login', { method: 'POST', body: JSON.stringify({ email: 'Chi@Example.com', password: 'correct horse battery staple' }) });
  assert.equal(ok.status, 200);
  const { token } = await ok.json() as { token: string }, auth = { authorization: `Bearer ${token}` };
  const users = await req('/api/users', { headers: auth });
  assert.equal(users.status, 200);
  const text = await users.text();
  assert.ok(!text.includes('hanh.teacher@example.com') && text.includes('h…@…'), 'emails are hidden');
  assert.equal((await req('/api/overview', { headers: auth })).status, 200);
  assert.equal((await req('/api/promo', { method: 'POST', headers: auth, body: JSON.stringify({ credits: 100 }) })).status, 403, 'no promo codes');
  assert.equal((await req('/api/users/t1/grant', { method: 'POST', headers: auth, body: JSON.stringify({ credits: 100 }) })).status, 403, 'no grants');
  // tries are limited
  for (let i = 0; i < 5; i++) await req('/login', { method: 'POST', body: JSON.stringify({ email: 'chi@example.com', password: 'nope' }) });
  assert.equal((await req('/login', { method: 'POST', body: JSON.stringify({ email: 'chi@example.com', password: 'correct horse battery staple' }) })).status, 429);
});

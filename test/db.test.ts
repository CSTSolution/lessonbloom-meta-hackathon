import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';

test('migrations apply once, in order, and an edited one stops the server', async () => {
  const sql = await pgliteSql();
  assert.deepEqual(await migrate(sql), ['001_accounts.sql', '002_lessons.sql']);
  assert.deepEqual(await migrate(sql), [], 'nothing to do the second time');
  const tables = (await sql.query<{ t: string }>(`select table_name as t from information_schema.tables where table_schema = 'public' order by 1`)).map((r) => r.t);
  for (const t of ['ai_usage', 'lessons', 'login_codes', 'schema_migrations', 'sessions', 'teachers']) assert.ok(tables.includes(t), t);
  await sql.query(`update schema_migrations set checksum = 'x' where name = '001_accounts.sql'`);
  await assert.rejects(migrate(sql), /was edited after it was applied/);
});

test('a transaction rolls back as a whole', async () => {
  const sql = await pgliteSql();
  await migrate(sql);
  await assert.rejects(sql.tx(async (t) => {
    await t.query(`insert into teachers (id, kind) values ('a', 'demo')`);
    await t.query(`insert into teachers (id, kind) values ('a', 'demo')`);
  }));
  assert.equal((await sql.query('select * from teachers')).length, 0);
});

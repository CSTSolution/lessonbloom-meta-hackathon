// Migrations: server/db/migrations/NNN_name.sql, applied in order, each once, inside a
// transaction. A checksum is kept per file, and an applied file that was edited later stops the
// server: change the schema with a new file, never by editing an old one.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Sql } from './sql.ts';

const DIR = new URL('./migrations/', import.meta.url);

export async function migrate(sql: Sql, log: (m: string) => void = () => {}): Promise<string[]> {
  await sql.query(`create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
  const files = (await readdir(DIR)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
  const done = new Map((await sql.query<{ name: string; checksum: string }>('select name, checksum from schema_migrations')).map((r) => [r.name, r.checksum]));
  const applied: string[] = [];
  for (const f of files) {
    const text = await readFile(new URL(f, DIR), 'utf8');
    const sum = createHash('sha256').update(text).digest('hex');
    if (done.has(f)) {
      if (done.get(f) !== sum) throw new Error(`migration ${f} was edited after it was applied`);
      continue;
    }
    await sql.tx(async (t) => {
      for (const stmt of text.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await t.query(stmt);
      await t.query('insert into schema_migrations (name, checksum) values ($1, $2)', [f, sum]);
    });
    applied.push(f);
    log(`migration ${f} applied`);
  }
  return applied;
}

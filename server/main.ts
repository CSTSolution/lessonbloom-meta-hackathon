// Server entry: the database (migrated at start), the models, the API and the built web app.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pickProvider } from './ai/pick.ts';
import { createAdmin } from './admin/admin.ts';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { migrate } from './db/migrate.ts';
import { pgliteSql, pgSql } from './db/sql.ts';
import { smtpMailer } from './mail.ts';

const sql = config.databaseUrl ? pgSql(config.databaseUrl) : await (async () => {
  const dir = join(config.dataDir, 'pglite');
  await mkdir(dir, { recursive: true });
  console.log(`[db] no DATABASE_URL: local PGlite in ${dir}`);
  return pgliteSql(dir);
})();
await migrate(sql, console.log);
// background work does not survive a restart: anything left half-made is marked so it can be made again
const stuck = await sql.query<{ id: string }>(`update lessons set status = 'error', error = 'interrupted', updated_at = now() where status = 'working' returning id`);
await sql.query(`update lessons set video_status = 'error' where video_status like 'working%'`);
await sql.query(`update lessons set pictures_pending = false where pictures_pending`);
if (stuck.length) console.log(`[start] ${stuck.length} lesson(s) were interrupted by the restart`);
// jobs that were running or waiting end as interrupted; a scanned book's held credit comes back whole
// (what was already read is lost with the restart), and books still being read say so
const ended = await sql.query<{ teacher_id: string; ref: string; hold: number }>(`update jobs set status = 'error', progress = 'interrupted', ended_at = now() where status in ('queued', 'running') returning teacher_id, ref, hold`);
for (const j of ended.filter((x) => x.hold > 0)) {
  if (await sql.one(`select 1 from credit_log where reason = 'refund' and ref = $1`, [j.ref])) continue;
  await sql.query('update teachers set credits = credits + $2 where id = $1', [j.teacher_id, j.hold]);
  await sql.query(`insert into credit_log (teacher_id, credits, reason, ref) values ($1, $2, 'refund', $3)`, [j.teacher_id, j.hold, j.ref]);
}
await sql.query(`update books set status = 'error', error = 'interrupted' where status = 'processing'`);
if (ended.length) console.log(`[start] ${ended.length} job(s) were interrupted by the restart`);

const ai = pickProvider();
const app = createApp({ sql, ai, mail: smtpMailer() });

// built web app: hashed bundles cached for a year, the page itself always revalidated
app.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable'); }, serveStatic({ root: './web/dist' }));
app.use('/favicon.svg', serveStatic({ root: './web/dist' }));
app.get('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-cache'); }, serveStatic({ path: './web/dist/index.html' }));

serve({ fetch: app.fetch, port: config.port }, () => console.log(`LessonBloom Meta on :${config.port} (AI: ${ai.name}, db: ${config.databaseUrl ? 'postgres' : 'pglite'})`));

// the admin view, on its own port (never routed by Caddy); off when no admin key is set
if (config.adminKey) serve({ fetch: createAdmin(sql).fetch, port: config.adminPort }, () => console.log(`Admin view on :${config.adminPort}`));

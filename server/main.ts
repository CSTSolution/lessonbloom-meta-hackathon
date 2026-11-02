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
import { heldUsed, settleHold } from './credits.ts';
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
// jobs that were running or waiting end as interrupted, and every hold still open (a lesson, a scanned
// book) is settled from what its calls really used; books still being read say so
const ended = await sql.query(`update jobs set status = 'error', progress = 'interrupted', ended_at = now() where status in ('queued', 'running') returning id`);
for (const h of await sql.query<{ teacher_id: string; ref: string }>(`select distinct g.teacher_id, g.ref from credit_log g where g.reason = 'hold'
    and not exists (select 1 from credit_log x where x.teacher_id = g.teacher_id and x.reason = 'refund' and x.ref = g.ref)`)) await settleHold(sql, h.teacher_id, h.ref, await heldUsed(sql, h.ref));
await sql.query(`update books set status = 'error', error = 'interrupted' where status = 'processing'`);
await sql.query(`update skill_maps set status = 'error', error = 'interrupted' where status = 'building'`);   // its hold was settled above
if (ended.length) console.log(`[start] ${ended.length} job(s) were interrupted by the restart`);

const ai = pickProvider();
const app = createApp({ sql, ai, mail: smtpMailer() });

// built web app: hashed bundles cached for a year, the page itself always revalidated
// the team's read-only admin view on the site (email and password); the full one stays on its own port
app.route('/admin', createAdmin(sql, '', 'public'));
app.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable'); }, serveStatic({ root: './web/dist' }));
app.use('/favicon.svg', serveStatic({ root: './web/dist' }));
app.get('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-cache'); }, serveStatic({ path: './web/dist/index.html' }));

serve({ fetch: app.fetch, port: config.port }, () => console.log(`LessonBloom Meta on :${config.port} (AI: ${ai.name}, db: ${config.databaseUrl ? 'postgres' : 'pglite'})`));

// the admin view, on its own port (never routed by Caddy); off when no admin key is set
if (config.adminKey) serve({ fetch: createAdmin(sql).fetch, port: config.adminPort }, () => console.log(`Admin view on :${config.adminPort}`));

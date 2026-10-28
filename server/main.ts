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

const ai = pickProvider();
const app = createApp({ sql, ai, mail: smtpMailer() });

// built web app: hashed bundles cached for a year, the page itself always revalidated
app.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable'); }, serveStatic({ root: './web/dist' }));
app.use('/favicon.svg', serveStatic({ root: './web/dist' }));
app.get('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-cache'); }, serveStatic({ path: './web/dist/index.html' }));

serve({ fetch: app.fetch, port: config.port }, () => console.log(`LessonBloom Meta on :${config.port} (AI: ${ai.name}, db: ${config.databaseUrl ? 'postgres' : 'pglite'})`));

// the admin view, on its own port (never routed by Caddy); off when no admin key is set
if (config.adminKey) serve({ fetch: createAdmin(sql).fetch, port: config.adminPort }, () => console.log(`Admin view on :${config.adminPort}`));

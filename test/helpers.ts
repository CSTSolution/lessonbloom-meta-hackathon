// A whole server in the test process: PGlite (real Postgres, in memory), the mock models and a mailer
// that keeps the codes it would have sent. Requests go through Hono directly, with a cookie jar.
import { MockProvider } from '../server/ai/mock.ts';
import { createApp } from '../server/app.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';

export async function testServer() {
  const sql = await pgliteSql();
  await migrate(sql);
  const ai = new MockProvider(), sent: { to: string; code: string; lang: string }[] = [];
  const app = createApp({ sql, ai, mail: { async sendCode(to, code, lang) { sent.push({ to, code, lang }); } } });
  const client = (ip = '203.0.113.7') => {
    let cookie = '';
    return async (method: string, path: string, body?: unknown) => {
      const r = await app.request(path, { method, headers: { 'content-type': 'application/json', 'x-client-ip': ip, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const set = r.headers.get('set-cookie');
      if (set) cookie = /lbm_s=;|Max-Age=0/.test(set) ? '' : set.split(';')[0];
      return { status: r.status, json: (await r.json().catch(() => null)) as any };
    };
  };
  return { sql, ai, app, sent, client };
}

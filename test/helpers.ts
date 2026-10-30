// A whole server in the test process: PGlite (real Postgres, in memory), the mock models and a mailer
// that keeps the codes it would have sent. Requests go through Hono directly, with a cookie jar.
import { MockProvider } from '../server/ai/mock.ts';
import { createApp } from '../server/app.ts';
import { config } from '../server/config.ts';
import { migrate } from '../server/db/migrate.ts';
import { pgliteSql } from '../server/db/sql.ts';
import { Jobs } from '../server/jobs.ts';
import type { Store } from '../server/storage.ts';

// tests make their videos only when they ask for one
config.autoVideo = false;
// a lesson holds a smaller amount in tests, so a test can make several lessons on the sign-up credits
config.guard.lessonCredits = 20;

export async function testServer(opts: { store?: Store | null } = {}) {
  const sql = await pgliteSql();
  await migrate(sql);
  const ai = new MockProvider(), sent: { to: string; code: string; lang: string }[] = [], jobs = new Jobs(sql, 3);
  const store = opts.store ?? null;
  const app = createApp({ sql, ai, jobs, store, mail: { async sendCode(to, code, lang) { sent.push({ to, code, lang }); } } });
  const client = (ip = '203.0.113.7') => {
    let cookie = '';
    return async (method: string, path: string, body?: unknown, raw?: { type: string; data: Buffer }) => {
      const r = await app.request(path, { method, headers: { 'content-type': raw?.type ?? 'application/json', 'x-client-ip': ip, ...(cookie ? { cookie } : {}) }, body: raw ? new Uint8Array(raw.data) : body ? JSON.stringify(body) : undefined });
      const set = r.headers.get('set-cookie');
      if (set) cookie = /lbm_s=;|Max-Age=0/.test(set) ? '' : set.split(';')[0];
      return { status: r.status, json: (await r.json().catch(() => null)) as any };
    };
  };
  return { sql, ai, app, sent, client, jobs, store };
}

type Call = ReturnType<Awaited<ReturnType<typeof testServer>>['client']>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A knowledge area with one of the sample books, read and ready.
export async function areaWithBook(call: Call, book: 'toan2' | 'english3' | 'maths2') {
  const { readFile } = await import('node:fs/promises');
  const B = { toan2: ['Toán 2', 'math', 2, 'Toán 2 – Sách mẫu'], maths2: ['Maths 2', 'math', 2, 'Maths 2 – Sample'], english3: ['English 3', 'english', 3, 'English 3 – Sample'] } as const, [name, subject, grade, title] = B[book];
  const { area } = (await call('POST', '/api/t/areas', { name, subject, grade })).json;
  const pdf = await readFile(new URL(`../samples/books/${book}.pdf`, import.meta.url));
  const up = await call('POST', `/api/t/areas/${area.id}/books?title=${encodeURIComponent(title)}`, undefined, { type: 'application/pdf', data: pdf });
  for (let i = 0; i < 200; i++) {
    const a = (await call('GET', '/api/t/areas')).json.areas.find((x: any) => x.id === area.id);
    if (a.books[0]?.status !== 'processing') break;
    await wait(20);
  }
  return { areaId: area.id as string, bookId: up.json.book.id as string };
}

// From a request to a finished lesson: match the section, pre-fill the setup, make the lesson, wait.
export async function lessonFrom(call: Call, areaId: string, request: string, opts: { pictures?: boolean } = {}) {
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request, setup })).json;
  let l: any;
  for (let i = 0; i < 400; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working' && (!opts.pictures || !l.pictures_pending)) break; await wait(20); }
  return { id: id as string, lesson: l, match };
}


// A lesson (or scanned book) holds its credits until all its work is done, pictures included: wait for
// what it did not use to come back before looking at her balance.
export async function settled(sql: Awaited<ReturnType<typeof testServer>>['sql'], ref: string) {
  for (let i = 0; i < 400; i++) { if (await sql.one(`select 1 from credit_log where reason = 'refund' and ref = $1`, [ref])) return; await wait(20); }
  throw new Error(`hold for ${ref} never settled`);
}

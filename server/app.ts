// The HTTP API. Every error carries a Vietnamese and an English message; the browser shows the
// one matching the teacher's language.
import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Accounts, cleanEmail, EMAIL, publicTeacher, type Teacher } from './auth/accounts.ts';
import type { AI } from './ai/types.ts';
import { config } from './config.ts';
import type { Sql } from './db/sql.ts';
import { Budget, clientIp, Limiter } from './guard/guard.ts';
import { cleanCode, CODE, redeem } from './credits.ts';
import { Files } from './files.ts';
import { fail } from './http.ts';
import { addChild, classRoutes } from './classes/routes.ts';
import { knowledgeRoutes } from './knowledge/routes.ts';
import { editRoutes } from './lesson/edit.ts';
import { lessonRoutes } from './lesson/routes.ts';
import { pathRoutes } from './path/routes.ts';
import type { Mailer } from './mail.ts';

export type Env = { Variables: { teacher: Teacher; token: string } };
const COOKIE = 'lbm_s';
export function createApp(deps: { sql: Sql; ai: AI; mail: Mailer; files?: Files }) {
  const { sql, ai, mail } = deps, files = deps.files ?? new Files(join(config.dataDir, 'files'));
  const accounts = new Accounts(sql), budget = new Budget(sql);
  const demoPerIp = new Limiter(3, config.guard.demoPerIpDay), codePerIp = new Limiter(5, config.guard.codesPerIpDay), codePerEmail = new Limiter(2, config.guard.codesPerEmailDay);
  const verifyPerIp = new Limiter(10, 100);
  // every model call is logged against the teacher whose request (or background job) made it
  const who = new AsyncLocalStorage<{ teacher: string; lesson?: string }>();
  ai.onUsage = (u) => { const w = who.getStore(); void budget.record(u, w?.teacher ?? null, w?.lesson ?? null).catch((e) => console.error(`[usage] ${(e as Error).message}`)); };
  const as = <T>(teacher: string, fn: () => T, lesson?: string) => who.run({ teacher, lesson }, fn);

  const app = new Hono<Env>();
  app.onError((e, c) => { console.error(`[error] ${c.req.method} ${c.req.path}: ${(e as Error).stack || e}`); return fail(c, 'server', 500); });

  const startSession = async (c: Context, t: Teacher) => {
    const token = await accounts.startSession(t.id, t.kind === 'demo' ? config.session.demoDays : config.session.days);
    setCookie(c, COOKIE, token, { httpOnly: true, secure: c.req.url.startsWith('https:') || !!c.req.header('x-client-ip'), sameSite: 'Lax', path: '/', maxAge: (t.kind === 'demo' ? config.session.demoDays : config.session.days) * 86400 });
    return c.json({ teacher: publicTeacher(t) });
  };
  const lang = (x: unknown): 'vi' | 'en' => (x === 'en' ? 'en' : 'vi');

  app.get('/api/health', async (c) => {
    await sql.one('select 1');
    return c.json({ ok: true, provider: ai.name });
  });

  // ---- sign-in ----
  app.post('/api/auth/demo', async (c) => {
    const b = await c.req.json<{ lang?: string }>().catch(() => ({} as { lang?: string }));
    if (!demoPerIp.take(clientIp(c))) return fail(c, 'demoLimit', 429);
    return startSession(c, await accounts.createDemo(lang(b.lang)));
  });
  app.post('/api/auth/code', async (c) => {
    const b = await c.req.json<{ email?: string; lang?: string }>().catch(() => ({} as { email?: string; lang?: string }));
    const email = cleanEmail(b.email);
    if (!EMAIL.test(email)) return fail(c, 'email');
    if (!codePerIp.take(clientIp(c)) || !codePerEmail.take(email)) return fail(c, 'tooMany', 429);
    const code = await accounts.newCode(email);
    if (!code) return fail(c, 'tooSoon', 429);
    try { await mail.sendCode(email, code, lang(b.lang)); } catch (e) {
      console.error(`[mail] code to ${email.replace(/(.).*@/, '$1…@')} failed: ${(e as Error).message}`);
      return fail(c, 'mailFailed', 503);
    }
    return c.json({ sent: true });     // the same answer whether or not an account exists
  });
  app.post('/api/auth/verify', async (c) => {
    const b = await c.req.json<{ email?: string; code?: string }>().catch(() => ({} as { email?: string; code?: string }));
    const email = cleanEmail(b.email);
    if (!EMAIL.test(email) || !/^\d{6}$/.test(String(b.code ?? '').trim())) return fail(c, 'bad');
    if (!verifyPerIp.take(clientIp(c))) return fail(c, 'tooMany', 429);
    const r = await accounts.checkCode(email, String(b.code));
    if (r === 'wrong') return fail(c, 'codeWrong');
    if (r === 'expired') return fail(c, 'codeExpired');
    const current = await accounts.bySession(getCookie(c, COOKIE));
    const t = await accounts.accountFor(email, current);
    await accounts.endSession(getCookie(c, COOKIE));
    return startSession(c, t);
  });

  // ---- signed in from here ----
  app.use('/api/t/*', async (c, next) => {
    const token = getCookie(c, COOKIE), t = await accounts.bySession(token);
    if (!t || !token) return fail(c, 'signIn', 401);
    c.set('teacher', t); c.set('token', token);
    await next();
  });
  app.get('/api/t/me', async (c) => c.json({ teacher: publicTeacher(c.get('teacher')), budget: await budget.check(c.get('teacher').id), credits: await budget.credits(c.get('teacher').id) }));
  app.put('/api/t/me', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ name?: string; lang?: string; role?: string; subject?: string }>().catch(() => ({} as { name?: string; lang?: string; role?: string; subject?: string }));
    const name = b.name === undefined ? undefined : String(b.name).replace(/\s+/g, ' ').trim().slice(0, 60);
    // the profile: a role changes here only (never in the header); a parent needs at least one child
    if (b.role === 'teacher' || b.role === 'parent') {
      if (b.role === 'parent' && t.role !== 'parent' && !(await sql.one(`select 1 from classes where teacher_id = $1 and kind = 'child'`, [t.id]))) return fail(c, 'children');
      await sql.query('update teachers set role = $2 where id = $1', [t.id, b.role]);
    }
    if (b.subject !== undefined && ['math', 'english', 'both', ''].includes(String(b.subject))) await sql.query('update teachers set subject = $2 where id = $1', [t.id, b.subject]);
    return c.json({ teacher: publicTeacher(await accounts.update(t.id, { name, lang: b.lang === undefined ? undefined : lang(b.lang) })) });
  });
  // A promo code: credits or subscriber days, once per assigner; email accounts only (codes are for people).
  const promoTries = new Limiter(5, 20);
  app.post('/api/t/promo', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
    if (t.kind !== 'account') return fail(c, 'promoAccount', 403);
    if (!promoTries.take(t.id)) return fail(c, 'tooMany', 429);
    const code = cleanCode(b.code);
    const r = CODE.test(code) ? await redeem(sql, t.id, code) : 'bad';
    if (r === 'bad') return fail(c, 'promoBad');
    if (r === 'used') return fail(c, 'promoUsed');
    return c.json({ added: r, credits: await budget.credits(t.id) });
  });
  // Sign-up step 2: who she is. A teacher gives her subject; a parent her children (first names, up to 4,
  // each with a grade), who become her "Con của tôi". The role is set once (changed later in the profile).
  app.post('/api/t/role', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ role?: string; name?: string; subject?: string; children?: { name?: string; grade?: number }[] }>().catch(() => ({} as Record<string, never>));
    if (b.role !== 'teacher' && b.role !== 'parent') return fail(c, 'bad');
    const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const subject = ['math', 'english', 'both'].includes(String(b.subject)) ? String(b.subject) : '';
    const kids = (Array.isArray(b.children) ? b.children : []).map((k) => ({ name: String(k?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), grade: Math.min(5, Math.max(1, Math.round(Number(k?.grade)) || 1)) })).filter((k) => k.name).slice(0, 4);
    if (b.role === 'parent' && !kids.length) return fail(c, 'children');
    await sql.query('update teachers set role = $2, name = coalesce(nullif($3, \'\'), name), subject = $4 where id = $1', [t.id, b.role, name, subject]);
    if (b.role === 'parent') for (const k of kids) await addChild(sql, t.id, k.name, k.grade);
    return c.json({ teacher: publicTeacher((await sql.one<Teacher>('select * from teachers where id = $1', [t.id]))!) });
  });
  app.post('/api/t/logout', async (c) => {
    await accounts.endSession(c.get('token'));
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // pictures, cut-outs and videos: random names, so a file is reachable only through its lesson
  app.get('/media/:lesson/:name', async (c) => {
    const f = await files.get(c.req.param('lesson'), c.req.param('name'));
    if (!f) return c.notFound();
    const head = { 'content-type': f.type, 'cache-control': 'public, max-age=31536000, immutable', 'accept-ranges': 'bytes' };
    const r = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') || '');
    if (r && (r[1] || r[2])) {
      const size = f.data.length, from = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2])), to = r[1] && r[2] ? Math.min(size - 1, Number(r[2])) : size - 1;
      if (from >= size || from > to) return c.body(null, 416, { 'content-range': `bytes */${size}` });
      return c.body(new Uint8Array(f.data.subarray(from, to + 1)), 206, { ...head, 'content-range': `bytes ${from}-${to}/${size}` });
    }
    return c.body(new Uint8Array(f.data), 200, head);
  });
  knowledgeRoutes(app, { sql, ai, budget, as });
  lessonRoutes(app, { sql, ai, budget, files, as });
  editRoutes(app, { sql, ai, budget, files, as });
  const path = pathRoutes(app, { sql, ai, budget, as });
  classRoutes(app, { sql, ai, reminder: path.pupilReminder });
  return app;
}

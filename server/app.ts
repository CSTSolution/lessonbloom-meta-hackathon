// The HTTP API. Every error carries a Vietnamese and an English message; the browser shows the
// one matching the teacher's language.
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Accounts, cleanEmail, EMAIL, publicTeacher, type Teacher } from './auth/accounts.ts';
import type { AI } from './ai/types.ts';
import { config } from './config.ts';
import type { Sql } from './db/sql.ts';
import { Budget, clientIp, Limiter } from './guard/guard.ts';
import type { Mailer } from './mail.ts';

export type Env = { Variables: { teacher: Teacher; token: string } };
const COOKIE = 'lbm_s';

export const MSG = {
  signIn: { vi: 'Cô đăng nhập hoặc bấm "Dùng thử" nhé.', en: 'Please sign in or start the demo.' },
  email: { vi: 'Địa chỉ email chưa đúng.', en: 'That email address does not look right.' },
  tooSoon: { vi: 'Cô đợi một phút rồi xin mã mới nhé.', en: 'Please wait a minute before asking for a new code.' },
  tooMany: { vi: 'Hôm nay đã xin quá nhiều mã. Cô thử lại vào ngày mai nhé.', en: 'Too many codes today. Please try again tomorrow.' },
  mailFailed: { vi: 'Chưa gửi được email. Cô thử lại sau ít phút nhé.', en: 'The email could not be sent. Please try again in a few minutes.' },
  codeWrong: { vi: 'Mã chưa đúng. Cô kiểm tra lại email nhé.', en: 'That code is not right. Please check the email.' },
  codeExpired: { vi: 'Mã đã hết hạn. Cô xin mã mới nhé.', en: 'That code has expired. Please ask for a new one.' },
  demoLimit: { vi: 'Hôm nay mạng này đã tạo nhiều bản dùng thử. Cô đăng nhập bằng email nhé.', en: 'Too many demos from this network today. Please sign in with your email.' },
  bad: { vi: 'Yêu cầu chưa hợp lệ.', en: 'Invalid request.' },
  server: { vi: 'Có lỗi ở máy chủ. Cô thử lại sau nhé.', en: 'Something went wrong on the server. Please try again.' },
} as const;
export type MsgKey = keyof typeof MSG;
export const fail = (c: Context, key: MsgKey, status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 400) =>
  c.json({ code: key, error: MSG[key].vi, errorEn: MSG[key].en }, status);

export function createApp(deps: { sql: Sql; ai: AI; mail: Mailer }) {
  const { sql, ai, mail } = deps;
  const accounts = new Accounts(sql), budget = new Budget(sql);
  const demoPerIp = new Limiter(3, config.guard.demoPerIpDay), codePerIp = new Limiter(5, config.guard.codesPerIpDay), codePerEmail = new Limiter(2, config.guard.codesPerEmailDay);
  const verifyPerIp = new Limiter(10, 100);
  ai.onUsage = (u) => { void budget.record(u, null).catch((e) => console.error(`[usage] ${(e as Error).message}`)); };

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
  app.get('/api/t/me', async (c) => c.json({ teacher: publicTeacher(c.get('teacher')), budget: await budget.check(c.get('teacher').id) }));
  app.put('/api/t/me', async (c) => {
    const b = await c.req.json<{ name?: string; lang?: string }>().catch(() => ({} as { name?: string; lang?: string }));
    const name = b.name === undefined ? undefined : String(b.name).replace(/\s+/g, ' ').trim().slice(0, 60);
    return c.json({ teacher: publicTeacher(await accounts.update(c.get('teacher').id, { name, lang: b.lang === undefined ? undefined : lang(b.lang) })) });
  });
  app.post('/api/t/logout', async (c) => {
    await accounts.endSession(c.get('token'));
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return app;
}

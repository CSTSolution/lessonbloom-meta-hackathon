// The admin view: every assigner, what each one made and what each one cost. It is never on the public
// site: it listens on its own port, which the server publishes on 127.0.0.1 only (reached through an
// SSH tunnel, deploy/vps/admin.sh), and every API request needs LB_ADMIN_KEY. Besides reading, it makes
// promo codes and gives an assigner credits or subscriber days (every grant is logged).
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { cleanCode, CODE, creditState, grant, newCode } from '../credits.ts';
import { credits, TODAY } from '../guard/guard.ts';

const PAGE = await readFile(new URL('./page.html', import.meta.url), 'utf8');
const same = (a: string, b: string) => { const h = (x: string) => createHash('sha256').update(x).digest(); return timingSafeEqual(h(a), h(b)); };
const num = (x: unknown) => Number(x ?? 0);
const usdOut = (usd: unknown) => ({ usd: Math.round(num(usd) * 1e4) / 1e4, credits: credits(num(usd)) });

export function createAdmin(sql: Sql, key = config.adminKey) {
  const app = new Hono();
  app.get('/', (c) => c.html(PAGE, 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }));
  app.use('/api/*', async (c, next) => {
    const got = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!key || key.length < 16 || !got || !same(got, key)) return c.json({ error: 'The admin key is needed.' }, 401);
    await next();
    c.header('cache-control', 'no-store');
  });

  // The whole app: money against the caps, models, days, people and lessons.
  app.get('/api/overview', async (c) => {
    const m = await sql.one<Record<string, string>>(`select
        coalesce(sum(usd) filter (where model not in ('mock', 'guard')), 0) as total,
        coalesce(sum(usd) filter (where at >= ${TODAY}), 0) as today,
        count(*) filter (where model <> 'guard') as calls,
        count(*) filter (where verdict <> 'ok') as blocked from ai_usage`);
    const models = await sql.query(`select endpoint, model, count(*)::int as n, sum(in_tokens)::int as tin, sum(out_tokens)::int as tout,
        sum(images)::int as images, sum(usd) as usd, round(avg(ms))::int as ms from ai_usage where model <> 'guard' group by 1, 2 order by sum(usd) desc`);
    const days = await sql.query(`select to_char(at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as day, count(*)::int as n,
        count(distinct teacher_id)::int as people, sum(usd) as usd, count(*) filter (where verdict <> 'ok')::int as blocked
        from ai_usage group by 1 order by 1 desc limit 30`);
    const people = await sql.one<Record<string, string>>(`select count(*) filter (where kind = 'demo') as demo, count(*) filter (where kind = 'account') as accounts,
        count(*) filter (where seen_at >= ${TODAY}) as today, count(*) filter (where plan_until > now()) as subscribers from teachers`);
    const lessons = await sql.one<Record<string, string>>(`select count(*) as all, count(*) filter (where status = 'ready') as ready,
        count(*) filter (where status = 'error') as failed, count(*) filter (where created_at >= ${TODAY}) as today from lessons`);
    const blockedItems = await sql.query(`select to_char(l.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as day, r->>'template' as template, code, count(*)::int as n
        from lessons l, jsonb_array_elements(l.rejected) r, jsonb_array_elements_text(r->'codes') code group by 1, 2, 3 order by 1 desc, 4 desc limit 200`);
    return c.json({
      blockedItems,
      money: { total: usdOut(m?.total), today: usdOut(m?.today), totalCapUsd: config.guard.totalUsd, dayCapUsd: config.guard.dayUsd, creditUsd: 0.01, signupCredits: config.guard.signupCredits, subscriberDayCredits: config.guard.subscriberDayCredits, disabled: config.guard.disabled },
      calls: num(m?.calls), blocked: num(m?.blocked),
      people: { demo: num(people?.demo), accounts: num(people?.accounts), today: num(people?.today), subscribers: num(people?.subscribers) },
      lessons: { all: num(lessons?.all), ready: num(lessons?.ready), failed: num(lessons?.failed), today: num(lessons?.today) },
      models: models.map((r) => ({ ...r, ...usdOut(r.usd) })),
      days: days.map((r) => ({ ...r, ...usdOut(r.usd) })),
    });
  });

  // Every assigner, most recently active first.
  app.get('/api/users', async (c) => {
    const rows = await sql.query<Record<string, unknown>>(`select t.id, t.kind, t.name, t.email, t.lang, t.created_at, t.seen_at,
        greatest(0, floor(t.credits))::int as balance, case when t.plan_until > now() then t.plan_until end as plan_until,
        (select count(*) from lessons l where l.teacher_id = t.id)::int as lessons,
        (select count(*) from areas a where a.teacher_id = t.id)::int as areas,
        (select count(*) from books b join areas a on a.id = b.area_id where a.teacher_id = t.id)::int as books,
        coalesce(u.usd, 0) as usd, coalesce(u.today, 0) as today, coalesce(u.calls, 0)::int as calls, coalesce(u.blocked, 0)::int as blocked, u.last_call
      from teachers t left join (select teacher_id, sum(usd) as usd, sum(usd) filter (where at >= ${TODAY}) as today,
          count(*) filter (where model <> 'guard') as calls, count(*) filter (where verdict <> 'ok') as blocked, max(at) as last_call
        from ai_usage group by 1) u on u.teacher_id = t.id
      order by greatest(t.seen_at, coalesce(u.last_call, t.seen_at)) desc limit 1000`);
    return c.json({ users: rows.map(({ usd, today, ...r }) => ({ ...r, spent: usdOut(usd), todayCredits: credits(num(today)) })) });
  });

  // One assigner in full: her lessons with what each cost, her books, her calls and her refusals.
  app.get('/api/users/:id', async (c) => {
    const id = c.req.param('id');
    const t = await sql.one<Record<string, unknown>>('select id, kind, name, email, lang, created_at, seen_at, plan_until from teachers where id = $1', [id]);
    if (!t) return c.json({ error: 'No such user.' }, 404);
    const lessons = await sql.query<Record<string, unknown>>(`select l.id, l.status, l.created_at, l.request, l.error, l.setup->>'title' as title,
        (l.setup->>'grade')::int as grade, l.setup->>'subject' as subject, l.refs->0->>'vi' as citation,
        jsonb_array_length(l.slides)::int as slides, jsonb_array_length(l.items)::int as items, jsonb_array_length(l.cards)::int as cards,
        (select count(*) from jsonb_array_elements(l.slides) x where x ? 'image')::int as pictures,
        coalesce((select sum(usd) from ai_usage u where u.lesson_id = l.id), 0) as usd
      from lessons l where l.teacher_id = $1 order by l.created_at desc`, [id]);
    const books = await sql.query(`select a.name as area, a.subject, a.grade, b.id, b.title, b.status, b.pages, b.created_at,
        (select count(*) from sections s where s.book_id = b.id)::int as sections
      from areas a left join books b on b.area_id = a.id where a.teacher_id = $1 order by a.created_at, b.created_at`, [id]);
    const byEndpoint = await sql.query(`select endpoint, model, count(*)::int as n, sum(in_tokens)::int as tin, sum(out_tokens)::int as tout, sum(images)::int as images, sum(usd) as usd
      from ai_usage where teacher_id = $1 and model <> 'guard' group by 1, 2 order by sum(usd) desc`, [id]);
    const calls = await sql.query(`select at, endpoint, model, verdict, lesson_id, in_tokens as tin, out_tokens as tout, images, usd, ms
      from ai_usage where teacher_id = $1 order by at desc limit 300`, [id]);
    const grants = await sql.query('select at, credits, days, reason, ref from credit_log where teacher_id = $1 order by at desc limit 100', [id]);
    return c.json({
      user: t, credits: await creditState(sql, id), signupCredits: config.guard.signupCredits, grants,
      lessons: lessons.map(({ usd, ...r }) => ({ ...r, ...usdOut(usd) })), books,
      byEndpoint: byEndpoint.map((r) => ({ ...r, ...usdOut(r.usd) })),
      calls: calls.map((r) => ({ ...r, ...usdOut(r.usd) })),
    });
  });

  // One lesson as the assigner sees it, with its cost by step.
  app.get('/api/lessons/:id', async (c) => {
    const l = await sql.one<Record<string, unknown>>('select * from lessons where id = $1', [c.req.param('id')]);
    if (!l) return c.json({ error: 'No such lesson.' }, 404);
    const cost = await sql.query(`select endpoint, model, count(*)::int as n, sum(usd) as usd from ai_usage where lesson_id = $1 group by 1, 2 order by sum(usd) desc`, [l.id]);
    return c.json({ lesson: l, publicUrl: config.publicUrl, cost: cost.map((r) => ({ ...r, ...usdOut(r.usd) })) });
  });
  // ---- writes: promo codes and grants ----
  const body = async (c: { req: { json: <T>() => Promise<T> } }) => (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>;
  const int = (x: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(x) || 0)));

  app.get('/api/promo', async (c) => c.json({ codes: await sql.query(`select p.*, (select count(*) from promo_uses u where u.code = p.code)::int as people from promo_codes p order by created_at desc`) }));
  app.post('/api/promo', async (c) => {
    const b = await body(c), code = b.code ? cleanCode(b.code) : newCode();
    const credits = int(b.credits, 100000), days = int(b.days, 3660), maxUses = Math.max(1, int(b.maxUses, 100000)), expiresDays = int(b.expiresDays, 3660);
    if (!CODE.test(code)) return c.json({ error: 'A code is 4-32 letters, digits or dashes.' }, 400);
    if (!credits && !days) return c.json({ error: 'A code gives credits, subscriber days or both.' }, 400);
    const row = await sql.one(`insert into promo_codes (code, credits, days, max_uses, expires_at, note) values ($1, $2, $3, $4, case when $5 > 0 then now() + make_interval(days => $5) end, $6)
      on conflict (code) do nothing returning *`, [code, credits, days, maxUses, expiresDays, String(b.note ?? '').slice(0, 200)]);
    return row ? c.json({ code: row }) : c.json({ error: 'That code already exists.' }, 409);
  });
  app.post('/api/promo/:code/active', async (c) => {
    const row = await sql.one('update promo_codes set active = $2 where code = $1 returning *', [cleanCode(c.req.param('code')), !!(await body(c)).active]);
    return row ? c.json({ code: row }) : c.json({ error: 'No such code.' }, 404);
  });
  // credits and/or subscriber days for one assigner; "end": the subscription stops now
  app.post('/api/users/:id/grant', async (c) => {
    const id = c.req.param('id'), b = await body(c);
    if (!(await sql.one('select 1 from teachers where id = $1', [id]))) return c.json({ error: 'No such user.' }, 404);
    if (b.end) await sql.query('update teachers set plan_until = now() where id = $1 and plan_until > now()', [id]);
    else {
      const credits = int(b.credits, 100000), days = int(b.days, 3660);
      if (!credits && !days) return c.json({ error: 'Give credits, subscriber days or both.' }, 400);
      await grant(sql, id, { credits, days, reason: 'admin', ref: String(b.note ?? '') });
    }
    return c.json({ credits: await creditState(sql, id) });
  });
  return app;
}

// The admin view: every assigner, what each one made and what each one cost. It is never on the public
// site: it listens on its own port, which the server publishes on 127.0.0.1 only (reached through an
// SSH tunnel, deploy/vps/admin.sh), and every API request needs LB_ADMIN_KEY. It only reads.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
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
        count(*) filter (where seen_at >= ${TODAY}) as today from teachers`);
    const lessons = await sql.one<Record<string, string>>(`select count(*) as all, count(*) filter (where status = 'ready') as ready,
        count(*) filter (where status = 'error') as failed, count(*) filter (where created_at >= ${TODAY}) as today from lessons`);
    return c.json({
      money: { total: usdOut(m?.total), today: usdOut(m?.today), totalCapUsd: config.guard.totalUsd, dayCapUsd: config.guard.dayUsd, creditUsd: 0.01, teacherDayCredits: config.guard.teacherDayCredits, disabled: config.guard.disabled },
      calls: num(m?.calls), blocked: num(m?.blocked),
      people: { demo: num(people?.demo), accounts: num(people?.accounts), today: num(people?.today) },
      lessons: { all: num(lessons?.all), ready: num(lessons?.ready), failed: num(lessons?.failed), today: num(lessons?.today) },
      models: models.map((r) => ({ ...r, ...usdOut(r.usd) })),
      days: days.map((r) => ({ ...r, ...usdOut(r.usd) })),
    });
  });

  // Every assigner, most recently active first.
  app.get('/api/users', async (c) => {
    const rows = await sql.query<Record<string, unknown>>(`select t.id, t.kind, t.name, t.email, t.lang, t.created_at, t.seen_at,
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
    const t = await sql.one<Record<string, unknown>>('select id, kind, name, email, lang, created_at, seen_at from teachers where id = $1', [id]);
    if (!t) return c.json({ error: 'No such user.' }, 404);
    const today = await sql.one<{ usd: string }>(`select coalesce(sum(usd), 0) as usd from ai_usage where teacher_id = $1 and at >= ${TODAY}`, [id]);
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
    const used = credits(num(today?.usd));
    return c.json({
      user: t, credits: { perDay: config.guard.teacherDayCredits, used, left: Math.max(0, config.guard.teacherDayCredits - used) },
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
  return app;
}

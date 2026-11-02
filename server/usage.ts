// "Lượt dùng" (Son, 29 Oct): where her credits went. Every model call is already logged with its
// cost (ai_usage); here it is grouped by what she was doing, by day (Vietnam days), and by lesson or
// book, next to what was added (sign-up, promo codes, the admin) and what was held and given back.
// 1 credit = US$0.01. Only her own rows; nothing here calls a model.
import type { Hono } from 'hono';
import type { Env } from './app.ts';
import { config } from './config.ts';
import { creditState, spare } from './credits.ts';
import type { Sql } from './db/sql.ts';
import type { Store } from './storage.ts';

export const KINDS = ['lessons', 'pictures', 'books', 'photos', 'voice', 'advice', 'requests'] as const;
export type UsageKind = (typeof KINDS)[number];
// what each call was for: a book's reading, a lesson's pictures, the rest of a lesson, then the calls
// made outside a lesson (photos of a lesson or homework, voice, paths and advice, finding her section)
const KIND = `case when u.book_id is not null then 'books'
  when u.endpoint in ('image', 'critic', 'segment') then 'pictures'
  when u.lesson_id is not null then 'lessons'
  when u.endpoint in ('ocr', 'work') then 'photos'
  when u.endpoint = 'transcribe' then 'voice'
  when u.endpoint in ('comments', 'toc') then 'advice'
  else 'requests' end`;
const DAY = `(u.at at time zone 'Asia/Ho_Chi_Minh')::date`;
const r1 = (n: unknown) => Math.round(Number(n || 0) * 10) / 10;

export async function usageOf(sql: Sql, teacherId: string, days: number) {
  const mine = `from ai_usage u where u.teacher_id = $1 and u.model <> 'guard'`;
  const since = `${DAY} > (now() at time zone 'Asia/Ho_Chi_Minh')::date - $2::int`;
  const [all, kinds, daily, items, log, t, promised] = await Promise.all([
    sql.one<{ credits: string; calls: string }>(`select coalesce(sum(u.usd), 0) * 100 as credits, count(*) as calls ${mine}`, [teacherId]),
    sql.query<{ kind: UsageKind; credits: string; calls: string }>(`select ${KIND} as kind, sum(u.usd) * 100 as credits, count(*) as calls ${mine} and ${since} group by 1`, [teacherId, days]),
    sql.query<{ day: string; kind: UsageKind; credits: string }>(`select to_char(${DAY}, 'YYYY-MM-DD') as day, ${KIND} as kind, sum(u.usd) * 100 as credits ${mine} and ${since} group by 1, 2`, [teacherId, days]),
    // each lesson and book she spent on in the period, with what went to each part
    sql.query<{ kind: 'lesson' | 'book'; id: string; title: string | null; at: string; part: UsageKind; credits: string; calls: string }>(
      `select case when u.book_id is not null then 'book' else 'lesson' end as kind, coalesce(u.book_id, u.lesson_id) as id,
          coalesce(max(b.title), max(l.setup->>'title')) as title, min(u.at) as at, ${KIND} as part, sum(u.usd) * 100 as credits, count(*) as calls
        ${mine.replace('from ai_usage u', 'from ai_usage u left join books b on b.id = u.book_id left join lessons l on l.id = u.lesson_id')} and ${since} and (u.book_id is not null or u.lesson_id is not null)
        group by 1, 2, 5`, [teacherId, days]),
    sql.query<{ at: string; reason: string; credits: number; days: number; ref: string; title: string | null }>(
      `select g.at, g.reason, g.credits, g.days, case when g.reason in ('promo') then g.ref else '' end as ref, coalesce(b.title, l.setup->>'title') as title
        from credit_log g left join books b on b.id = g.ref left join lessons l on l.id = g.ref where g.teacher_id = $1 order by g.at desc, g.id desc limit 60`, [teacherId]),
    // what she started with: her balance now, plus what was taken off call by call, less what came in or
    // was held and given back (accounts from before 29 Oct joined with 100, newer ones with 120)
    sql.one<{ created_at: string; start: string }>(`select t.created_at, t.credits + coalesce((select sum(u.usd) * 100 from ai_usage u where u.teacher_id = t.id and not u.held), 0)
        - coalesce((select sum(g.credits) from credit_log g where g.teacher_id = t.id), 0) as start from teachers t where t.id = $1`, [teacherId]),
    spare(sql, teacherId),
  ]);

  const byKind = Object.fromEntries(KINDS.map((k) => [k, { credits: 0, calls: 0 }])) as Record<UsageKind, { credits: number; calls: number }>;
  for (const k of kinds) byKind[k.kind] = { credits: r1(k.credits), calls: Number(k.calls) };
  const used = kinds.reduce((s, k) => s + Number(k.credits), 0);
  // every day of the period, oldest first, so the chart has no gaps
  const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10), dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(new Date(Date.parse(today) - i * 864e5).toISOString().slice(0, 10));
  const perDay = new Map(dayList.map((d) => [d, Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<UsageKind, number>]));
  for (const r of daily) { const d = perDay.get(r.day); if (d) d[r.kind] = Math.round(Number(r.credits) * 100) / 100; }   // finer, so a day's parts add up to its total
  const things = new Map<string, { kind: 'lesson' | 'book'; id: string; title: string; at: string; credits: number; calls: number; parts: Partial<Record<UsageKind, number>> }>();
  for (const r of items) {
    const key = `${r.kind}:${r.id}`, x = things.get(key) ?? { kind: r.kind, id: r.id, title: r.title || '', at: r.at, credits: 0, calls: 0, parts: {} };
    x.credits += Number(r.credits); x.calls += Number(r.calls); x.parts[r.part] = r1((x.parts[r.part] ?? 0) + Number(r.credits));
    if (r.at < x.at) x.at = r.at;
    things.set(key, x);
  }
  return {
    credits: await creditState(sql, teacherId), promised: promised.promised, days,
    total: { credits: r1(all?.credits), calls: Number(all?.calls ?? 0) }, period: { credits: r1(used), calls: Object.values(byKind).reduce((s, k) => s + k.calls, 0) },
    kinds: byKind,
    daily: dayList.map((day) => ({ day, ...perDay.get(day)! })),
    items: [...things.values()].map((x) => ({ ...x, credits: r1(x.credits) })).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 100),
    // what came in and what was held and given back; she joined with the sign-up credits
    log: [...log.map((g) => ({ at: g.at, reason: g.reason, credits: g.credits, days: g.days, ref: g.ref, title: g.title ?? '' })),
      ...(t ? [{ at: t.created_at, reason: 'signup', credits: Math.max(0, Math.round(Number(t.start))), days: 0, ref: '', title: '' }] : [])],
  };
}

export function usageRoutes(app: Hono<Env>, d: { sql: Sql; store?: Store | null }) {
  app.get('/api/t/usage', async (c) => {
    const days = [7, 30, 90].includes(Number(c.req.query('days'))) ? Number(c.req.query('days')) : 30;
    const files = await d.sql.one<{ n: string }>('select coalesce(sum(bytes), 0) as n from book_files where teacher_id = $1', [c.get('teacher').id]);
    return c.json({ ...(await usageOf(d.sql, c.get('teacher').id, days)), storage: { on: !!d.store, used: Number(files?.n ?? 0), quota: config.storage.quotaBytes } });
  });
}

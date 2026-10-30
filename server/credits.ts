// Credits: 1 credit = US$0.01 of Meta's list price for the calls an assigner's work makes.
//   balance     100 when she joins (once), plus promo codes and grants from the admin view
//   allowance   subscribers only (plan_until in the future): a fresh daily amount, used first
// Every model call is taken off as it is logged (Budget.record); work starts only with credits left.
import { randomBytes } from 'node:crypto';
import { config } from './config.ts';
import type { Sql } from './db/sql.ts';

export const VN_DATE = `(now() at time zone 'Asia/Ho_Chi_Minh')::date`;
export interface CreditState { balance: number; subscriber: boolean; planUntil: string | null; daily: { perDay: number; used: number; left: number } | null; left: number }

export async function creditState(sql: Sql, teacherId: string): Promise<CreditState> {
  const t = await sql.one<{ credits: string; plan_until: string | null; sub: boolean; used: string }>(
    `select credits, plan_until, coalesce(plan_until > now(), false) as sub, case when day_date = ${VN_DATE} then day_used else 0 end as used from teachers where id = $1`, [teacherId]);
  const balance = Math.max(0, Math.floor(Number(t?.credits ?? 0) + 1e-9)), perDay = config.guard.subscriberDayCredits;
  const used = Math.ceil(Number(t?.used ?? 0) - 1e-9), daily = t?.sub ? { perDay, used, left: Math.max(0, perDay - used) } : null;
  return { balance, subscriber: !!t?.sub, planUntil: t?.plan_until ?? null, daily, left: balance + (daily?.left ?? 0) };
}

// Work that holds credit up front (a lesson, a scanned book): the hold comes off her balance at once,
// its calls are logged but not charged one by one, and at the end what was held, less what the work
// really cost, comes back (once). If it cost more than was held, the rest is taken off then.
export async function holdCredits(sql: Sql, teacherId: string, n: number, ref: string) {
  await sql.query('update teachers set credits = credits - $2 where id = $1', [teacherId, n]);
  await sql.query(`insert into credit_log (teacher_id, credits, reason, ref) values ($1, $2, 'hold', $3)`, [teacherId, -n, ref]);
}
export async function settleHold(sql: Sql, teacherId: string, ref: string, used: number) {
  const h = await sql.one<{ n: string }>(`select -sum(credits) as n from credit_log where teacher_id = $1 and reason = 'hold' and ref = $2`, [teacherId, ref]);
  if (!h?.n || await sql.one(`select 1 from credit_log where teacher_id = $1 and reason = 'refund' and ref = $2`, [teacherId, ref])) return;
  const back = Number(h.n) - Math.ceil(used - 1e-9);
  await sql.query('update teachers set credits = credits + $2 where id = $1', [teacherId, back]);
  await sql.query(`insert into credit_log (teacher_id, credits, reason, ref) values ($1, $2, 'refund', $3)`, [teacherId, back, ref]);
}
// what held work has really used so far (its calls are logged with `held`)
export async function heldUsed(sql: Sql, ref: string) {
  return Number((await sql.one<{ n: string }>(`select coalesce(sum(usd), 0) * 100 as n from ai_usage where held and (lesson_id = $1 or book_id = $1)`, [ref]))?.n ?? 0);
}

// What she can spend on new work, and what is held right now for work in progress (already taken off).
export async function spare(sql: Sql, teacherId: string) {
  const left = (await creditState(sql, teacherId)).left;
  const r = await sql.one<{ n: string }>(`select coalesce(-sum(g.credits), 0) as n from credit_log g where g.teacher_id = $1 and g.reason = 'hold'
    and not exists (select 1 from credit_log x where x.teacher_id = g.teacher_id and x.reason = 'refund' and x.ref = g.ref)`, [teacherId]);
  return { left, promised: Math.round(Number(r?.n ?? 0)), spare: left };
}

// Takes one call's cost off: the day's allowance first (subscribers), then the balance (it may dip
// just below zero when calls already running finish; nothing new starts then).
export async function charge(sql: Sql, teacherId: string, credits: number) {
  if (!(credits > 0)) return;
  await sql.query(`with t as (
      select id, case when plan_until > now() then $3::numeric else 0 end as allow, case when day_date = ${VN_DATE} then day_used else 0 end as used from teachers where id = $1),
    x as (select id, used, least($2::numeric, greatest(0, allow - used)) as from_day from t)
    update teachers s set day_date = ${VN_DATE}, day_used = x.used + x.from_day, credits = s.credits - ($2::numeric - x.from_day) from x where s.id = x.id`,
    [teacherId, credits, config.guard.subscriberDayCredits]);
}

// Credits and/or subscriber days onto one assigner (days extend from today or from the current end).
export async function grant(sql: Sql, teacherId: string, g: { credits?: number; days?: number; reason: 'promo' | 'admin'; ref?: string }) {
  const credits = Math.max(0, Math.round(g.credits || 0)), days = Math.max(0, Math.round(g.days || 0));
  await sql.query(`update teachers set credits = credits + $2, plan_until = case when $3 > 0 then greatest(coalesce(plan_until, now()), now()) + make_interval(days => $3) else plan_until end where id = $1`, [teacherId, credits, days]);
  await sql.query('insert into credit_log (teacher_id, credits, days, reason, ref) values ($1, $2, $3, $4, $5)', [teacherId, credits, days, g.reason, String(g.ref ?? '').slice(0, 200)]);
}

export const cleanCode = (c: unknown) => String(c ?? '').trim().toUpperCase().replace(/\s+/g, '');
export const CODE = /^[A-Z0-9-]{4,32}$/;
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => 'LB-' + Array.from(randomBytes(8), (b) => CODE_ALPHA[b % CODE_ALPHA.length]).join('');

// A promo code, once per assigner, while it is active, not expired and not used up.
export async function redeem(sql: Sql, teacherId: string, code: string): Promise<{ credits: number; days: number } | 'bad' | 'used'> {
  return sql.tx(async (q) => {
    const p = await q.one<{ credits: number; days: number }>(`update promo_codes set used = used + 1 where code = $1 and active and used < max_uses and (expires_at is null or expires_at > now()) returning credits, days`, [code]);
    if (!p) return 'bad';
    const fresh = await q.one('insert into promo_uses (code, teacher_id) values ($1, $2) on conflict do nothing returning code', [code, teacherId]);
    if (!fresh) throw new Used();
    await grant(q, teacherId, { credits: p.credits, days: p.days, reason: 'promo', ref: code });
    return { credits: p.credits, days: p.days };
  }).catch((e) => { if (e instanceof Used) return 'used' as const; throw e; });
}
class Used extends Error {}

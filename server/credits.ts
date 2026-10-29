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

// Credit already promised to her line of jobs: about one lesson for each lesson waiting, and what a
// running lesson has not used yet. New work counts only what is left after that, so a line of
// lessons cannot run her below zero.
export async function spare(sql: Sql, teacherId: string) {
  const left = (await creditState(sql, teacherId)).left;
  const r = await sql.one<{ n: string }>(`select coalesce(sum(greatest(0, $2::numeric - coalesce((select sum(u.usd) * 100 from ai_usage u where u.lesson_id = j.ref), 0))), 0) as n
    from jobs j where j.teacher_id = $1 and j.kind = 'lesson' and j.status in ('queued', 'running')`, [teacherId, config.guard.lessonCredits]);
  const promised = Math.ceil(Number(r?.n ?? 0) - 1e-9);
  return { left, promised, spare: Math.max(0, left - promised) };
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

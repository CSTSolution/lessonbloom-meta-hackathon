// Teachers, sessions and email codes. Two ways in:
//   demo     one tap, no email: a workspace for trying LessonBloom (kept 7 days)
//   account  an email address confirmed with a 6-digit code (CST's Brevo SMTP); no passwords
// Confirming an email while in a demo turns that demo into the account, so nothing made is lost.
// Session tokens and codes are stored only as SHA-256 hashes.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';

export interface Teacher { id: string; kind: 'demo' | 'account'; name: string; email: string | null; lang: 'vi' | 'en'; role: 'teacher' | 'parent' | null; subject: string; created_at: string }

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const ALPHA = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newId = (n = 12) => Array.from(randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join('');
export const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
export const cleanEmail = (e: unknown) => String(e ?? '').trim().toLowerCase().slice(0, 200);

export class Accounts {
  constructor(private sql: Sql) {}

  async createDemo(lang: 'vi' | 'en'): Promise<Teacher> {
    return (await this.sql.one<Teacher>(`insert into teachers (id, kind, lang, credits) values ($1, 'demo', $2, $3) returning *`, [newId(), lang, config.guard.signupCredits]))!;
  }

  async startSession(teacherId: string, days: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.sql.query(`insert into sessions (token_hash, teacher_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`, [hash(token), teacherId, days]);
    return token;
  }

  async bySession(token: string | undefined): Promise<Teacher | undefined> {
    if (!token || token.length > 100) return undefined;
    const t = await this.sql.one<Teacher>(`select t.* from sessions s join teachers t on t.id = s.teacher_id where s.token_hash = $1 and s.expires_at > now()`, [hash(token)]);
    if (t) await this.sql.query(`update teachers set seen_at = now() where id = $1 and seen_at < now() - interval '5 minutes'`, [t.id]);
    return t;
  }

  async endSession(token: string | undefined) {
    if (token) await this.sql.query('delete from sessions where token_hash = $1', [hash(token)]);
  }

  // A new code replaces any earlier one. Returns null when this address asked too recently.
  async newCode(email: string): Promise<string | null> {
    const prev = await this.sql.one<{ age: number }>(`select extract(epoch from now() - sent_at)::float as age from login_codes where email = $1`, [email]);
    if (prev && prev.age < config.guard.codeGapSeconds) return null;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.sql.query(
      `insert into login_codes (email, code_hash, expires_at) values ($1, $2, now() + interval '10 minutes')
       on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, sent_at = now()`,
      [email, hash(`${email}:${code}`)]);
    return code;
  }

  // 'ok', or why not. Five wrong tries end the code.
  async checkCode(email: string, code: string): Promise<'ok' | 'wrong' | 'expired'> {
    const row = await this.sql.one<{ code_hash: string; live: boolean; tries: number }>(`select code_hash, expires_at > now() as live, tries from login_codes where email = $1`, [email]);
    if (!row || !row.live || row.tries >= 5) return 'expired';
    const a = Buffer.from(row.code_hash, 'hex'), b = Buffer.from(hash(`${email}:${String(code).trim()}`), 'hex');
    if (!timingSafeEqual(a, b)) {
      await this.sql.query('update login_codes set tries = tries + 1 where email = $1', [email]);
      return 'wrong';
    }
    await this.sql.query('delete from login_codes where email = $1', [email]);
    return 'ok';
  }

  // After a confirmed code: the existing account, or the current demo becomes the account, or a new one.
  async accountFor(email: string, current?: Teacher): Promise<Teacher> {
    const found = await this.sql.one<Teacher>('select * from teachers where lower(email) = $1', [email]);
    if (found) return found;
    if (current?.kind === 'demo') return (await this.sql.one<Teacher>(`update teachers set kind = 'account', email = $2 where id = $1 returning *`, [current.id, email]))!;
    return (await this.sql.one<Teacher>(`insert into teachers (id, kind, email, lang, credits) values ($1, 'account', $2, $3, $4) returning *`, [newId(), email, current?.lang ?? 'en', config.guard.signupCredits]))!;
  }

  async update(id: string, f: { name?: string; lang?: 'vi' | 'en' }): Promise<Teacher> {
    return (await this.sql.one<Teacher>(`update teachers set name = coalesce($2, name), lang = coalesce($3, lang) where id = $1 returning *`, [id, f.name ?? null, f.lang ?? null]))!;
  }
}

// What the browser may see of a teacher.
export const publicTeacher = (t: Teacher) => ({ id: t.id, kind: t.kind, name: t.name, email: t.email, lang: t.lang, role: t.role, subject: t.subject });

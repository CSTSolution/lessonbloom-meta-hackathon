// Feedback from assigners (Chi #62): the "Góp ý" box (bug / hard to use / lesson content wrong / idea,
// with an optional screenshot), "is this lesson useful? 👍 👎" and "report this item" in Practice.
// Signed-in assigners only (/api/t/…; pupils have no route); no model is called. Each one is stored and,
// when LB_FEEDBACK_TO is set, emailed to the team as plain text (never the picture, never a secret).
import type { Hono } from 'hono';
import type { Env } from './app.ts';
import { newId } from './auth/accounts.ts';
import { config } from './config.ts';
import type { Sql } from './db/sql.ts';
import { fail } from './http.ts';
import type { Mailer } from './mail.ts';

export const KINDS = ['bug', 'hard', 'content', 'idea', 'lesson', 'item'] as const;
export const REASONS = ['wrong', 'unclear', 'notInLesson'] as const;
export const FEEDBACK = { text: 2000, page: 200, version: 60, image: 1.5e6, perHour: 20, perDay: 60 };
const NAMES: Record<string, string> = { bug: 'Bug', hard: 'Hard to use', content: 'Lesson content wrong', idea: 'Idea', lesson: 'Lesson rating', item: 'Item report' };
const clean = (x: unknown, max: number) => String(x ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim().slice(0, max);

export function feedbackRoutes(app: Hono<Env>, d: { sql: Sql; mail: Mailer }) {
  const { sql, mail } = d;
  app.post('/api/t/feedback', async (c) => {
    const t = c.get('teacher');
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const kind = String(b.kind ?? '') as (typeof KINDS)[number];
    if (!KINDS.includes(kind)) return fail(c, 'bad');
    const text = clean(b.text, FEEDBACK.text), page = clean(b.page, FEEDBACK.page), version = clean(b.version, FEEDBACK.version);
    if (String(b.text ?? '').trim().length > FEEDBACK.text) return fail(c, 'bad', 413);   // the box stops at 2,000 too
    const rating = kind === 'lesson' ? (b.rating === 1 || b.rating === -1 ? b.rating : null) : null;
    const reason = kind === 'item' && (REASONS as readonly string[]).includes(String(b.reason)) ? String(b.reason) : null;
    if (kind === 'lesson' && rating === null) return fail(c, 'bad');
    if (kind === 'item' && !reason) return fail(c, 'bad');
    if (['bug', 'hard', 'content', 'idea'].includes(kind) && !text && !b.image) return fail(c, 'bad');
    // a lesson (and an item in it) must be hers
    const lessonId = b.lessonId ? String(b.lessonId).slice(0, 40) : null, itemId = kind === 'item' ? String(b.itemId ?? '').slice(0, 40) : null;
    if ((kind === 'lesson' || kind === 'item') && !lessonId) return fail(c, 'bad');
    if (lessonId && !(await sql.one('select 1 from lessons where id = $1 and teacher_id = $2', [lessonId, t.id]))) return fail(c, 'notFound', 404);
    if (kind === 'item' && !(itemId && await sql.one(`select 1 from lessons l, jsonb_array_elements(l.items) x where l.id = $1 and x->>'id' = $2`, [lessonId, itemId]))) return fail(c, 'notFound', 404);
    // one screenshot: a JPEG of at most 1.5 MB, sent as base64 (shrunk in the browser first)
    let image: Buffer | null = null;
    if (b.image) {
      const s = String(b.image).replace(/^data:image\/jpeg;base64,/, '');
      if (s.length > Math.ceil(FEEDBACK.image / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+=*$/.test(s)) return fail(c, 'pageImage', 413);
      image = Buffer.from(s, 'base64');
      if (image.length > FEEDBACK.image || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) return fail(c, 'pageImage');
    }
    // per account, counted in the table (so a restart does not reset it): 20 an hour, 60 a day
    const n = await sql.one<{ hour: string; day: string }>(`select count(*) filter (where created_at > now() - interval '1 hour') as hour, count(*) as day
      from feedback where teacher_id = $1 and created_at > now() - interval '1 day'`, [t.id]);
    if (Number(n?.hour) >= FEEDBACK.perHour || Number(n?.day) >= FEEDBACK.perDay) return fail(c, 'tooMany', 429);
    const id = newId(12);
    await sql.query(`insert into feedback (id, teacher_id, kind, reason, text, page, version, lesson_id, item_id, rating, image) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, t.id, kind, reason, text, page, version, lessonId, itemId || null, rating, image]);
    const to = config.mail.feedbackTo;
    if (to && mail.send) {
      const lines = [`${NAMES[kind]} from ${t.email || t.name || 'a demo account'} (${t.kind}, ${t.role || 'no role'}, id ${t.id})`, '',
        text || '(no text)', '', `Page: ${page || '-'}`, `Version: ${version || '-'}`,
        ...(lessonId ? [`Lesson: ${lessonId}${itemId ? ` · item ${itemId}` : ''}`] : []), ...(reason ? [`Reason: ${reason}`] : []), ...(rating ? [`Rating: ${rating > 0 ? '👍' : '👎'}`] : []),
        `Screenshot: ${image ? 'yes (in the admin view, Feedback)' : 'no'}`, `Feedback id: ${id}`];
      void mail.send(to, `LessonBloom feedback: ${NAMES[kind]}${text ? ` · ${text.slice(0, 60).replace(/\s+/g, ' ')}` : ''}`, lines.join('\n'))
        .catch((e) => console.error(`[mail] feedback ${id} not sent: ${(e as Error).message}`));
    }
    return c.json({ ok: true, id });
  });
}

// The admin view's list (read only): newest first, the picture only as a flag (it has its own route)
export const feedbackList = (sql: Sql) => sql.query(`select f.id, f.created_at, f.kind, f.reason, f.text, f.page, f.version, f.lesson_id, f.item_id, f.rating, f.image is not null as has_image,
    t.id as teacher_id, t.email, t.name, t.kind as account, l.setup->>'title' as lesson_title
  from feedback f join teachers t on t.id = f.teacher_id left join lessons l on l.id = f.lesson_id order by f.created_at desc limit 500`);
export const feedbackImage = async (sql: Sql, id: string) => {
  const r = await sql.one<{ image: Uint8Array | null }>('select image from feedback where id = $1', [id]);
  return r?.image ? Buffer.from(r.image) : null;
};

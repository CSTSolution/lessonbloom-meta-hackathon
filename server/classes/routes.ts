// Classes, pupils and assigning (Chi's task 1, step 6 "Giao bài"), and the pupils' side.
//   assigner  /api/t/classes…, /api/t/lessons/:id/assign (only with the "read and checked" box ticked)
//   pupil     /api/p/…: the class code and her name, or her own link; no account, no model calls,
//             answers checked here (the answers never reach the phone)
// Pupils' names never go to a model: nothing on the pupils' side calls one (narration is local).
import { createHash, randomBytes } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import QRCode from 'qrcode';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import { newId } from '../auth/accounts.ts';
import { config } from '../config.ts';
import type { Sql } from '../db/sql.ts';
import { clientIp, Limiter } from '../guard/guard.ts';
import { fail } from '../http.ts';
import type { Card, Item, Lesson, Slide } from '../lesson/types.ts';
import type { Files } from '../files.ts';
import { makeVideo } from '../lesson/video.ts';
import { forPupil, hintOf, isRight } from './check.ts';

const PCOOKIE = 'lbm_p';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code6 = () => Array.from(randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join('');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const cleanName = (s: unknown, max = 40) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const J = (x: unknown) => JSON.stringify(x);
export const joinUrl = (code: string) => `${config.publicUrl}/hoc/${code}`;
export const pupilUrl = (link: string) => `${config.publicUrl}/p/${link}`;
const MAX_CLASSES = 30, MAX_PUPILS = 60;

// What an assignment keeps of the lesson: what pupils see, frozen at the moment it was assigned.
interface Content { title: string; subject: string; lang: 'vi' | 'en'; ref: string; slides: Slide[]; items: Item[]; cards: Card[] }
const snapshot = (l: Lesson): Content => ({
  title: l.setup.title, subject: l.setup.subject, lang: l.setup.lang, ref: (l.refs?.[0] as { vi?: string } | undefined)?.vi ?? '',
  slides: l.slides, items: l.items, cards: l.cards,
});

// A teacher's class, named as she typed it.
export async function addClass(sql: Sql, teacherId: string, name: string) {
  for (let i = 0; i < 5; i++) {
    const row = await sql.one<{ id: string }>('insert into classes (id, teacher_id, name, code) values ($1, $2, $3, $4) on conflict (code) do nothing returning id', [newId(10), teacherId, name, code6()]);
    if (row) return row.id;
  }
  throw new Error('no free class code');
}

// A parent's child: a class of one, named after the child, with the child as its only pupil.
export async function addChild(sql: Sql, teacherId: string, name: string, grade: number) {
  for (let i = 0; i < 5; i++) {
    const id = newId(10), row = await sql.one('insert into classes (id, teacher_id, name, code, kind, grade) values ($1, $2, $3, $4, \'child\', $5) on conflict (code) do nothing returning id', [id, teacherId, name, code6(), grade]);
    if (row) { await sql.query('insert into pupils (id, class_id, name, link) values ($1, $2, $3, $4)', [newId(10), id, name, randomBytes(12).toString('base64url')]); return id; }
  }
  throw new Error('no free class code');
}

export function classRoutes(app: Hono<Env>, d: { sql: Sql; ai: AI; files?: Files; reminder?: (classId: string, pupilId: string) => Promise<{ vi: string; en: string } | null> }) {
  const { sql } = d;
  const mine = (c: Context<Env>, id: string) => sql.one<{ id: string; name: string; code: string }>('select id, name, code from classes where id = $1 and teacher_id = $2', [id, c.get('teacher').id]);

  // ---- the assigner ----
  app.get('/api/t/classes', async (c) => c.json({ classes: await sql.query(`select c.id, c.name, c.code, c.kind, c.grade, c.created_at,
      (select count(*) from pupils p where p.class_id = c.id)::int as pupils,
      (select count(*) from pupils p where p.class_id = c.id and p.joined_at is not null)::int as joined,
      (select count(*) from assignments a where a.class_id = c.id and a.removed_at is null)::int as assignments
    from classes c where c.teacher_id = $1 order by c.created_at`, [c.get('teacher').id]) }));

  app.post('/api/t/classes', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ name?: string; grade?: number }>().catch(() => ({} as { name?: string; grade?: number }));
    const name = cleanName(b.name);
    if (!name) return fail(c, 'className');
    if (t.role === 'parent') {
      if (Number((await sql.one<{ n: string }>(`select count(*) as n from classes where teacher_id = $1 and kind = 'child'`, [t.id]))?.n) >= 4) return fail(c, 'tooMany', 429);
      const id = await addChild(sql, t.id, name, Math.min(5, Math.max(1, Math.round(Number(b.grade)) || 1)));
      const row = await sql.one<{ id: string; name: string; code: string; kind: string; grade: number }>('select id, name, code, kind, grade from classes where id = $1', [id]);
      return c.json({ class: row });
    }
    if (Number((await sql.one<{ n: string }>('select count(*) as n from classes where teacher_id = $1', [t.id]))?.n) >= MAX_CLASSES) return fail(c, 'tooMany', 429);
    let row;
    for (let i = 0; i < 5 && !row; i++) row = await sql.one('insert into classes (id, teacher_id, name, code) values ($1, $2, $3, $4) on conflict (code) do nothing returning id, name, code', [newId(10), t.id, name, code6()]);
    if (!row) return fail(c, 'server', 500);
    return c.json({ class: row });
  });

  app.put('/api/t/classes/:id', async (c) => {
    const k = await mine(c, c.req.param('id')), name = cleanName((await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }))).name);
    if (!k) return fail(c, 'notFound', 404);
    if (!name) return fail(c, 'className');
    await sql.query('update classes set name = $2 where id = $1', [k.id, name]);
    return c.json({ ok: true });
  });
  app.delete('/api/t/classes/:id', async (c) => {
    const k = await mine(c, c.req.param('id'));
    if (!k) return fail(c, 'notFound', 404);
    await sql.query('delete from classes where id = $1', [k.id]);
    return c.json({ ok: true });
  });

  // One class: its pupils (joined or not, each with her own link) and what it was given, with progress.
  // Unassigned lessons are left out (Chi #34); "seen" (slides, video or cards opened) lets the row say
  // "In progress" before the first answer.
  app.get('/api/t/classes/:id', async (c) => {
    const k = await mine(c, c.req.param('id'));
    if (!k) return fail(c, 'notFound', 404);
    const pupils = (await sql.query<{ id: string; name: string; link: string; joined_at: string | null; seen_at: string | null }>('select id, name, link, joined_at, seen_at from pupils where class_id = $1 order by created_at, name', [k.id]))
      .map((p) => ({ ...p, url: pupilUrl(p.link) }));
    const assignments = await sql.query(`select a.id, a.lesson_id, a.content->>'title' as title, a.due, a.created_at, a.confirmed_at,
        jsonb_array_length(a.content->'items')::int as items,
        (select count(*) from pupil_progress g where g.assignment_id = a.id and g.done_at is not null)::int as done,
        (select count(distinct pupil_id) from answers w where w.assignment_id = a.id)::int as started,
        (select count(*) from pupil_progress g where g.assignment_id = a.id and (g.slides_at is not null or g.video_at is not null or g.cards_at is not null))::int as seen
      from assignments a where a.class_id = $1 and a.removed_at is null order by a.created_at desc`, [k.id]);
    return c.json({ class: { ...k, url: joinUrl(k.code) }, pupils, assignments });
  });

  // First names only, one per line or comma.
  app.post('/api/t/classes/:id/pupils', async (c) => {
    const k = await mine(c, c.req.param('id'));
    if (!k) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ names?: string }>().catch(() => ({} as { names?: string }));
    const names = [...new Set(String(b.names ?? '').split(/[\n,;]+/).map((s) => cleanName(s)).filter(Boolean))];
    const have = Number((await sql.one<{ n: string }>('select count(*) as n from pupils where class_id = $1', [k.id]))?.n);
    if (!names.length) return fail(c, 'pupilNames');
    if (have + names.length > MAX_PUPILS) return fail(c, 'tooMany', 429);
    for (const name of names) await sql.query('insert into pupils (id, class_id, name, link) values ($1, $2, $3, $4)', [newId(10), k.id, name, randomBytes(12).toString('base64url')]);
    return c.json({ added: names.length });
  });
  app.delete('/api/t/classes/:id/pupils/:pid', async (c) => {
    const k = await mine(c, c.req.param('id'));
    if (!k) return fail(c, 'notFound', 404);
    await sql.query('delete from pupils where id = $1 and class_id = $2', [c.req.param('pid'), k.id]);
    return c.json({ ok: true });
  });

  app.get('/api/t/classes/:id/qr.svg', async (c) => {
    const k = await mine(c, c.req.param('id'));
    if (!k) return fail(c, 'notFound', 404);
    return c.body(await QRCode.toString(joinUrl(k.code), { type: 'svg', margin: 1, width: 240 }), 200, { 'content-type': 'image/svg+xml', 'cache-control': 'private, max-age=3600' });
  });

  // Assign: only with "I have read and checked" ticked this time; the tick's moment is kept with it.
  app.post('/api/t/lessons/:id/assign', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ classId?: string; confirmed?: unknown; due?: string; retry?: boolean; hints?: boolean; again?: unknown }>().catch(() => ({} as Record<string, never>));
    const l = await sql.one<Lesson>('select * from lessons where id = $1 and teacher_id = $2', [c.req.param('id'), t.id]);
    if (!l) return fail(c, 'notFound', 404);
    if (l.status !== 'ready' || !l.items.length) return fail(c, 'notReady');
    if (b.confirmed !== true) return fail(c, 'confirm');
    const k = await mine(c, String(b.classId || ''));
    if (!k) return fail(c, 'notFound', 404);
    // the same lesson already on this child's / class's list: say so first (Chi #34, it was given 3 times
    // by mistake); "Assign again" sends again: true
    if (b.again !== true) {
      const was = await sql.one<{ at: string }>('select created_at as at from assignments where lesson_id = $1 and class_id = $2 and removed_at is null order by created_at desc limit 1', [l.id, k.id]);
      if (was) {
        const on = (lang: string) => new Date(was.at).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
        return c.json({ code: 'alreadyAssigned', at: was.at, className: k.name, error: `Bài này đã giao cho ${k.name} ngày ${on('vi-VN')}.`, errorEn: `This lesson was already assigned to ${k.name} on ${on('en-GB')}.` }, 409);
      }
    }
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || '')) ? b.due : null;
    const id = newId(10);
    await sql.query(`insert into assignments (id, lesson_id, class_id, teacher_id, content, due, retry, hints, confirmed_at) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())`,
      [id, l.id, k.id, t.id, J(snapshot(l)), due, b.retry !== false, b.hints !== false]);
    // the learning path follows what was assigned (Chi, 29 Oct): a path the assigner never edited is
    // made again from this lesson on the next view; one she saved herself is left as it is
    await sql.query(`delete from paths p using lessons l where l.id = $3 and p.class_id = $1 and p.teacher_id = $2 and p.area_id = l.area_id and p.updated_at = p.created_at`, [k.id, t.id, l.id]);
    // a parent has no Video step (Chi): the child's video is made now, in the background (local voices, free)
    if (t.role === 'parent' && d.files && config.autoVideo && (l as Lesson & { video_status?: string }).video_status === 'none') {
      await sql.query(`update lessons set video_status = 'working:0' where id = $1`, [l.id]);
      void makeVideo({ sql, ai: d.ai, files: d.files }, l, { subtitles: true, voice: 0 });
    }
    return c.json({ assignment: { id, classId: k.id, className: k.name } });
  });
  app.get('/api/t/lessons/:id/assignments', async (c) => c.json({ assignments: await sql.query(`select a.id, a.class_id, k.name as class_name, a.due, a.created_at, a.confirmed_at,
      (select count(*) from pupil_progress g where g.assignment_id = a.id and g.done_at is not null)::int as done,
      (select count(*) from pupils p where p.class_id = a.class_id)::int as pupils
    from assignments a join classes k on k.id = a.class_id where a.lesson_id = $1 and a.teacher_id = $2 and a.removed_at is null order by a.created_at desc`, [c.req.param('id'), c.get('teacher').id]) }));

  // "Bỏ giao" (Chi #34): only the assigner's own. Soft: the lesson stays in Lessons and the answers
  // already given stay in the summary; the child no longer sees it under "Today".
  app.delete('/api/t/assignments/:id', async (c) => {
    const row = await sql.one('update assignments set removed_at = now() where id = $1 and teacher_id = $2 and removed_at is null returning id', [c.req.param('id'), c.get('teacher').id]);
    if (!row) return fail(c, 'notFound', 404);
    return c.json({ ok: true });
  });

  // ---- the pupil ----
  const perIp = new Limiter(40, 2000), answersPerPupil = new Limiter(60, 3000);
  const startPupil = async (c: Context, pupilId: string) => {
    const token = randomBytes(32).toString('base64url');
    await sql.query(`insert into pupil_sessions (token_hash, pupil_id, expires_at) values ($1, $2, now() + interval '120 days')`, [hash(token), pupilId]);
    await sql.query('update pupils set joined_at = coalesce(joined_at, now()), seen_at = now() where id = $1', [pupilId]);
    setCookie(c, PCOOKIE, token, { httpOnly: true, secure: c.req.url.startsWith('https:') || !!c.req.header('x-client-ip'), sameSite: 'Lax', path: '/', maxAge: 120 * 86400 });
  };
  const pupilOf = async (c: Context) => {
    const tok = getCookie(c, PCOOKIE);
    if (!tok || tok.length > 100) return undefined;
    return sql.one<{ id: string; name: string; class_id: string; class_name: string }>(`select p.id, p.name, p.class_id, k.name as class_name from pupil_sessions s join pupils p on p.id = s.pupil_id join classes k on k.id = p.class_id
      where s.token_hash = $1 and s.expires_at > now()`, [hash(tok)]);
  };
  app.use('/api/p/*', async (c, next) => { if (!perIp.take(clientIp(c))) return fail(c, 'tooMany', 429); await next(); });

  app.get('/api/p/class/:code', async (c) => {
    const k = await sql.one<{ id: string; name: string }>('select id, name from classes where code = $1', [String(c.req.param('code')).toUpperCase().slice(0, 12)]);
    if (!k) return fail(c, 'classCode', 404);
    return c.json({ class: { name: k.name }, pupils: await sql.query('select id, name from pupils where class_id = $1 order by created_at, name', [k.id]) });
  });
  app.post('/api/p/enter', async (c) => {
    const b = await c.req.json<{ code?: string; pupilId?: string }>().catch(() => ({} as { code?: string; pupilId?: string }));
    const p = await sql.one<{ id: string }>('select p.id from pupils p join classes k on k.id = p.class_id where k.code = $1 and p.id = $2', [String(b.code || '').toUpperCase(), String(b.pupilId || '')]);
    if (!p) return fail(c, 'classCode', 404);
    await startPupil(c, p.id);
    return c.json({ ok: true });
  });
  app.post('/api/p/link', async (c) => {
    const link = String((await c.req.json<{ link?: string }>().catch(() => ({} as { link?: string }))).link || '').slice(0, 40);
    const p = link && await sql.one<{ id: string }>('select id from pupils where link = $1', [link]);
    if (!p) return fail(c, 'classCode', 404);
    await startPupil(c, p.id);
    return c.json({ ok: true });
  });
  app.post('/api/p/leave', async (c) => {
    const tok = getCookie(c, PCOOKIE);
    if (tok) await sql.query('delete from pupil_sessions where token_hash = $1', [hash(tok)]);
    deleteCookie(c, PCOOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // "Hôm nay con học gì": what her class was given that is still open, newest first (unassigned ones left out, Chi #34).
  app.get('/api/p/today', async (c) => {
    const p = await pupilOf(c);
    if (!p) return fail(c, 'signIn', 401);
    await sql.query(`update pupils set seen_at = now() where id = $1 and (seen_at is null or seen_at < now() - interval '5 minutes')`, [p.id]);
    const rows = await sql.query(`select a.id, a.content->>'title' as title, a.content->>'subject' as subject, a.content->>'lang' as lang, a.due,
        jsonb_array_length(a.content->'slides')::int as slides, jsonb_array_length(a.content->'items')::int as items, jsonb_array_length(a.content->'cards')::int as cards,
        (select l.video_status = 'ready' from lessons l where l.id = a.lesson_id) as video,
        g.slides_at is not null as slides_seen, g.video_at is not null as video_seen, g.cards_at is not null as cards_seen, g.done_at is not null as done,
        (select count(distinct item_id) from answers w where w.assignment_id = a.id and w.pupil_id = $2)::int as answered
      from assignments a left join pupil_progress g on g.assignment_id = a.id and g.pupil_id = $2
      where a.class_id = $1 and a.removed_at is null and (a.due is null or a.due >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1) order by a.created_at desc limit 20`, [p.class_id, p.id]);
    return c.json({ pupil: { name: p.name }, class: { name: p.class_name }, lessons: rows, reminder: d.reminder ? await d.reminder(p.class_id, p.id).catch(() => null) : null });
  });

  // an unassigned lesson is gone for the child too (Chi #34): no more answers on it, the old ones stay
  const assignmentOf = async (c: Context) => {
    const p = await pupilOf(c);
    if (!p) return { error: fail(c, 'signIn', 401) };
    const a = await sql.one<{ id: string; content: Content; retry: boolean; hints: boolean }>('select id, content, retry, hints from assignments where id = $1 and class_id = $2 and removed_at is null', [c.req.param('id'), p.class_id]);
    if (!a) return { error: fail(c, 'notFound', 404) };
    // items the assigner added for her alone (advice "Luyện thêm" / "Bước tiếp") come after the lesson's
    const extra = await sql.query<{ items: Item[] }>('select items from pupil_extra where assignment_id = $1 and pupil_id = $2 order by id', [a.id, p.id]);
    a.content.items = [...a.content.items, ...extra.flatMap((e) => e.items)];
    return { p, a };
  };

  app.get('/api/p/a/:id', async (c) => {
    const r = await assignmentOf(c);
    if (r.error) return r.error;
    const { a, p } = r, x = a.content;
    const tried = await sql.query<{ item_id: string; correct: boolean }>('select item_id, bool_or(correct) as correct from answers where assignment_id = $1 and pupil_id = $2 group by 1', [a.id, p.id]);
    const v = await sql.one<{ video: { url: string } | null }>(`select case when l.video_status = 'ready' then l.video end as video from assignments s join lessons l on l.id = s.lesson_id where s.id = $1`, [a.id]);
    return c.json({
      lesson: {
        id: a.id, title: x.title, subject: x.subject, lang: x.lang, retry: a.retry, hints: a.hints, video: v?.video?.url ?? null,
        slides: x.slides.map((s) => ({ id: s.id, kind: s.kind, heading: s.heading, bullets: s.bullets, example: s.example, image: s.image })),
        items: x.items.map(forPupil),
        cards: x.cards.map((k) => ({ id: k.id, front: k.front, back: k.back, emoji: k.emoji })),
        tried: Object.fromEntries(tried.map((t) => [t.item_id, t.correct])),
      },
    });
  });

  app.post('/api/p/a/:id/answer', async (c) => {
    const r = await assignmentOf(c);
    if (r.error) return r.error;
    const { a, p } = r;
    if (!answersPerPupil.take(p.id)) return fail(c, 'tooMany', 429);
    const b = await c.req.json<{ itemId?: string; answer?: unknown }>().catch(() => ({} as { itemId?: string; answer?: unknown }));
    const it = a.content.items.find((i) => i.id === b.itemId);
    if (!it) return fail(c, 'notFound', 404);
    const before = await sql.one<{ n: string }>('select count(*) as n from answers where assignment_id = $1 and pupil_id = $2 and item_id = $3', [a.id, p.id, it.id]);
    if (!a.retry && Number(before?.n) > 0) return c.json({ correct: null, again: false, explain: a.hints ? hintOf(it, String(b.answer ?? ''), a.content.lang) : '' });
    const correct = isRight(it, b.answer);
    await sql.query('insert into answers (assignment_id, pupil_id, item_id, skill, level, answer, correct) values ($1, $2, $3, $4, $5, $6, $7)', [a.id, p.id, it.id, it.skill, it.level, String(b.answer ?? '').slice(0, 300), correct]);
    const left = await sql.one<{ n: string }>(`select count(*) as n from jsonb_array_elements(($3::jsonb)) x where not exists (select 1 from answers w where w.assignment_id = $1 and w.pupil_id = $2 and w.item_id = x->>'id')`, [a.id, p.id, J(a.content.items.map((i) => ({ id: i.id })))]);
    if (Number(left?.n) === 0) await sql.query(`insert into pupil_progress (assignment_id, pupil_id, done_at) values ($1, $2, now()) on conflict (assignment_id, pupil_id) do update set done_at = coalesce(pupil_progress.done_at, now())`, [a.id, p.id]);
    // a wrong answer: try again (when allowed), with the explanation as a hint when hints are on
    return c.json({ correct, again: !correct && a.retry, explain: correct ? it.explain : a.hints ? hintOf(it, String(b.answer ?? ''), a.content.lang) : '', done: Number(left?.n) === 0 });
  });

  app.post('/api/p/a/:id/seen', async (c) => {
    const r = await assignmentOf(c);
    if (r.error) return r.error;
    const what = (await c.req.json<{ what?: string }>().catch(() => ({} as { what?: string }))).what;
    if (what !== 'slides' && what !== 'cards' && what !== 'video') return fail(c, 'bad');
    await sql.query(`insert into pupil_progress (assignment_id, pupil_id, ${what}_at) values ($1, $2, now()) on conflict (assignment_id, pupil_id) do update set ${what}_at = coalesce(pupil_progress.${what}_at, now())`, [r.a.id, r.p.id]);
    return c.json({ ok: true });
  });

  // "Nghe và chọn": the words are spoken by the server's local voice, never written on the phone.
  const said = new Map<string, Buffer>();
  app.get('/api/p/a/:id/say/:item', async (c) => {
    const r = await assignmentOf(c);
    if (r.error) return r.error;
    const it = r.a.content.items.find((i) => i.id === c.req.param('item'));
    // a listening item: only the words to hear; any other item: its question, read aloud for young
    // readers (Chi's "Nghe câu hỏi"). The answer is never in the question, so nothing is given away.
    const lang = r.a.content.lang === 'en' || it?.subject === 'english' ? 'en' : 'vi';
    const x = it as (typeof it & { say?: string; sentence?: string; story?: string }) | undefined;
    const text = !x ? '' : x.template === 'listen' ? x.say || '' : readable(`${x.prompt}${x.sentence ? ` ${x.sentence}` : ''}`, lang);
    if (!text) return fail(c, 'notFound', 404);
    const key = hash(`${lang}:${text}`);
    let wav = said.get(key);
    if (!wav) {
      try { wav = await d.ai.speak({ text, lang }); } catch { return fail(c, 'aiBusy', 503); }
      if (said.size > 500) said.clear();
      said.set(key, wav);
    }
    return c.body(new Uint8Array(wav), 200, { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=86400' });
  });
}

// A question as it is said: "61 - 37 = ?" → "61 minus 37 equals what?", a gap → "blank".
const WORDS = { en: { '+': 'plus', '-': 'minus', '=': 'equals', '×': 'times', '?': 'what', gap: 'blank' }, vi: { '+': 'cộng', '-': 'trừ', '=': 'bằng', '×': 'nhân', '?': 'bao nhiêu', gap: 'chỗ trống' } } as const;
export function readable(q: string, lang: 'vi' | 'en'): string {
  const w = WORDS[lang];
  return q.replace(/_{2,}/g, ` ${w.gap} `).replace(/=\s*\?/g, `= ${w['?']}?`).replace(/\s*([+\-−=×])\s*(?=[\d\s\w])/g, (_, op: string) => ` ${w[(op === '−' ? '-' : op) as '+' | '-' | '=' | '×']} `).replace(/\s+/g, ' ').trim().slice(0, 400);
}

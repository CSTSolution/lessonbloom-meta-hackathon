// Task 4 (Chi's appendix 3): the learning path, the learning summary, each learner's detail with
// advice cards, the summary criteria and the in-app reminders.
//   path      each part of a book takes 1, 2 or 3 weeks; dates follow on by themselves; one path per
//             class (a parent: per child) and source
//   summary   labels per skill by code (labels.ts); suggested comments written by Muse Spark from the
//             labels only, with learners as "Em 1…" (names are filled in here, never sent)
//   advice    worked out by code; "Áp dụng" changes things for that learner only, and can be undone
//   reminders in the app only, at most one a day for a learner, worked out from the path each day
import type { Context, Hono } from 'hono';
import type { AI } from '../ai/types.ts';
import type { Env } from '../app.ts';
import type { Sql } from '../db/sql.ts';
import { guardedJson, type Budget, wrapUser } from '../guard/guard.ts';
import { fail } from '../http.ts';
import type { Item, Lesson, Skill } from '../lesson/types.ts';
import { writeItems } from '../lesson/writer.ts';
import { addDays, type Answer, classLabel, clock, cleanCriteria, type Criteria, daysBetween, labelOf, type Label, mondayOf, schoolDay, vnToday } from './labels.ts';

const J = (x: unknown) => JSON.stringify(x);
export interface ReminderSettings { pupilSession: boolean; pupilCards: boolean; time: string; assignerTwoDays: boolean; assignerEnd: boolean; assignerStart: boolean }
export const DEFAULT_REMINDERS: ReminderSettings = { pupilSession: true, pupilCards: true, time: '18:00', assignerTwoDays: true, assignerEnd: true, assignerStart: false };
export const cleanReminders = (x: unknown): ReminderSettings => {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>, r = { ...DEFAULT_REMINDERS };
  for (const k of ['pupilSession', 'pupilCards', 'assignerTwoDays', 'assignerEnd', 'assignerStart'] as const) if (typeof o[k] === 'boolean') r[k] = o[k] as boolean;
  // never after 20:00 (Chi)
  if (typeof o.time === 'string' && /^([01]\d|20):[0-5]\d$/.test(o.time) && o.time <= '20:00') r.time = o.time;
  return r;
};

const TOPIC_SYSTEM = `You group the parts of a primary-school book into its chapters ("chủ đề"), e.g. Toán 2: "Số và phép tính", "Hình học", "Đo lường"; English: the unit themes. Use the book's own chapter names when the titles show them. Give every part exactly one short chapter name, in the book's language. Keep the parts in their order.`;
const TOPIC_SCHEMA = { type: 'object', properties: { parts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, topic: { type: 'string' } }, required: ['id', 'topic'] } } }, required: ['parts'] };
const COMMENT_SYSTEM = `You write one short comment (1-2 sentences, in {{lang}}) for each learner, for the teacher's regular feedback under Vietnam's Circular 27/2020 (nhận xét thường xuyên): what the learner has mastered and what they are practising, by skill. Positive and specific; never "yếu", "chậm", "trễ", never marks, ranks or comparisons with others. Learners are called "Em 1", "Em 2"…; keep exactly those names.`;
const ADVICE_SYSTEM = `You word advice cards for a primary-school teacher or parent about ONE learner. The decision is already made by code; never change it, never add advice. For each card write one or two short, warm, specific sentences in {{lang}}: what was seen and what to do. Call the learner exactly {child}. No marks, no percentages unless given, no comparisons, never "yếu", "chậm", "trễ".`;
const ADVICE_SCHEMA = { type: 'object', properties: { cards: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, text: { type: 'string' } }, required: ['kind', 'text'] } } }, required: ['cards'] };
const COMMENT_SCHEMA = { type: 'object', properties: { comments: { type: 'array', items: { type: 'object', properties: { who: { type: 'string' }, text: { type: 'string' } }, required: ['who', 'text'] } } }, required: ['comments'] };

interface StepRow { section_id: string; title: string; page_from: number; page_to: number; topic: string | null; weeks: number; ord: number }
export interface PathStep { sectionId: string; title: string; pages: string; weeks: number; start: string; end: string; status: 'done' | 'current' | 'next' | 'later'; topic: string }

export function layout(start: string, steps: { section_id: string; title: string; page_from: number; page_to: number; topic: string | null; weeks: number }[], today = vnToday(), extra: Record<string, number> = {}): PathStep[] {
  let at = start, seenCurrent = false;
  const out = steps.map((s) => {
    const weeks = s.weeks + (extra[s.section_id] || 0), end = addDays(at, weeks * 7 - 1);
    const status: PathStep['status'] = end < today ? 'done' : at <= today ? 'current' : 'later';
    const row: PathStep = { sectionId: s.section_id, title: s.title, pages: s.page_from === s.page_to ? `${s.page_from}` : `${s.page_from}–${s.page_to}`, weeks, start: at, end, status, topic: s.topic || '' };
    at = addDays(end, 1);
    return row;
  });
  for (const r of out) { if (r.status === 'current') seenCurrent = true; else if (r.status === 'later' && (seenCurrent || !out.some((x) => x.status === 'current'))) { r.status = 'next'; break; } }
  return out;
}

export function pathRoutes(app: Hono<Env>, d: { sql: Sql; ai: AI; budget: Budget; as: <T>(teacherId: string, fn: () => T, lessonId?: string) => T }) {
  const { sql } = d;
  const criteriaOf = async (tid: string) => cleanCriteria((await sql.one<{ criteria: unknown }>('select criteria from teachers where id = $1', [tid]))?.criteria);
  const remindersOf = async (tid: string) => cleanReminders((await sql.one<{ reminders: unknown }>('select reminders from teachers where id = $1', [tid]))?.reminders);
  const classMine = (c: Context<Env>, id: string) => sql.one<{ id: string; name: string; kind: string }>('select id, name, kind from classes where id = $1 and teacher_id = $2', [id, c.get('teacher').id]);
  const gate = async (c: Context<Env>) => { const b = await d.budget.check(c.get('teacher').id); return b ? fail(c, b === 'total' ? 'credit' : b === 'credits' ? 'credits' : 'budget', 429) : null; };

  // Sections of an area get their chapter once (Muse Spark); if that fails, the book's title.
  const ensureTopics = async (tid: string, areaId: string) => {
    const rows = await sql.query<{ id: string; title: string; book: string }>(`select s.id, s.title, b.title as book from sections s join books b on b.id = s.book_id where b.area_id = $1 and s.title <> '—' and s.topic is null order by b.created_at, s.ord`, [areaId]);
    if (!rows.length) return;
    let topics = new Map<string, string>();
    try {
      if ((await d.budget.check(tid)) === null) {
        const r = await d.as(tid, () => guardedJson<{ parts: { id: string; topic: string }[] }>(d.ai, { endpoint: 'toc', system: TOPIC_SYSTEM, prompt: wrapUser(rows.map((x) => `${x.id}\t${x.title}`).join('\n')), schema: TOPIC_SCHEMA, fixture: { topics: rows.map((x) => x.id) } }));
        topics = new Map((r.parts || []).map((p) => [String(p.id), String(p.topic || '').trim().slice(0, 80)]));
      }
    } catch (e) { console.warn(`[path] topics: ${String((e as Error).message).slice(0, 120)}`); }
    for (const x of rows) await sql.query('update sections set topic = $2 where id = $1', [x.id, topics.get(x.id) || x.book]);
  };

  // The path for a class (or child) and a source, made the first time with 1 week per part. With a
  // lesson assigned from this source, the path starts today with that lesson (the latest one) and goes
  // on in book order; the parts before it come last. Without one, it starts this Monday at the first part.
  const pathFor = async (tid: string, classId: string, areaId: string) => {
    let p = await sql.one<{ id: string; start_date: string }>(`select id, to_char(start_date, 'YYYY-MM-DD') as start_date from paths where class_id = $1 and area_id = $2`, [classId, areaId]);
    if (!p) {
      const id = `p${classId.slice(0, 6)}${areaId.slice(0, 6)}${Date.now().toString(36)}`;
      const book = await sql.query<{ id: string }>(`select s.id from sections s join books b on b.id = s.book_id where b.area_id = $1 and s.title <> '—' order by b.created_at, s.ord`, [areaId]);
      const given = await sql.one<{ section: string }>(`select l.refs->0->>'sectionId' as section from assignments a join lessons l on l.id = a.lesson_id
        where a.class_id = $1 and l.area_id = $2 order by a.created_at desc limit 1`, [classId, areaId]);
      const at = given ? book.findIndex((x) => x.id === given.section) : -1;
      const secs = at > 0 ? [...book.slice(at), ...book.slice(0, at)] : book;
      await sql.query('insert into paths (id, teacher_id, class_id, area_id, start_date) values ($1, $2, $3, $4, $5) on conflict (class_id, area_id) do nothing', [id, tid, classId, areaId, at >= 0 ? vnToday() : mondayOf(vnToday())]);
      for (const [i, s] of secs.entries()) await sql.query('insert into path_steps (path_id, section_id, ord, weeks) values ($1, $2, $3, 1) on conflict do nothing', [id, s.id, i]);
      p = (await sql.one<{ id: string; start_date: string }>(`select id, to_char(start_date, 'YYYY-MM-DD') as start_date from paths where class_id = $1 and area_id = $2`, [classId, areaId]))!;
    }
    const steps = await sql.query<StepRow>(`select ps.section_id, s.title, s.page_from, s.page_to, s.topic, ps.weeks, ps.ord from path_steps ps join sections s on s.id = ps.section_id where ps.path_id = $1 order by ps.ord`, [p.id]);
    return { id: p.id, start: p.start_date, steps };
  };

  // How far a class is with a part: learners who finished an assignment made from that part.
  const progressOf = async (classId: string, sectionId: string) => {
    const r = await sql.one<{ done: string; pupils: string }>(`select
        (select count(distinct g.pupil_id) from pupil_progress g join assignments a on a.id = g.assignment_id join lessons l on l.id = a.lesson_id
          where a.class_id = $1 and l.refs->0->>'sectionId' = $2 and g.done_at is not null) as done,
        (select count(*) from pupils where class_id = $1) as pupils`, [classId, sectionId]);
    return { done: Number(r?.done), pupils: Number(r?.pupils) };
  };

  const remindersFor = (steps: PathStep[], s: ReminderSettings, prog?: { done: number; pupils: number }, today = vnToday()) => {
    const cur = steps.find((x) => x.status === 'current'), out: { date: string; who: 'pupils' | 'assigner'; kind: string; vi: string; en: string }[] = [];
    if (!cur) return out;
    const mid = schoolDay(addDays(cur.start, Math.floor(daysBetween(cur.start, cur.end) / 2)));
    if (s.pupilSession) out.push({ date: schoolDay(cur.start), who: 'pupils', kind: 'start', vi: `Bắt đầu bài “${cur.title}”. Con xem video rồi làm bài tập nhé!`, en: `“${cur.title}” starts today. Watch the lesson, then practise!` });
    if (s.pupilCards) out.push({ date: schoolDay(addDays(cur.start, 2)), who: 'pupils', kind: 'cards', vi: `Con ôn lại thẻ nhớ bài “${cur.title}” nhé.`, en: `Go over the flashcards for “${cur.title}”.` });
    if (s.pupilSession) out.push({ date: mid, who: 'pupils', kind: 'mid', vi: `Con còn bài tập “${cur.title}”, mình làm tiếp nhé!`, en: `There is still practice for “${cur.title}”. Let's carry on!` });
    if (s.assignerStart) out.push({ date: cur.start, who: 'assigner', kind: 'start', vi: `Hôm nay bắt đầu bài “${cur.title}”.`, en: `“${cur.title}” starts today.` });
    const left = prog ? prog.pupils - prog.done : 0;
    if (s.assignerTwoDays) out.push({ date: addDays(cur.end, -2), who: 'assigner', kind: 'twoDays', vi: `Còn 2 ngày bài “${cur.title}”${left > 0 ? `: ${left} em chưa làm xong, có thể kéo dài thêm 1 tuần` : ''}.`, en: `2 days left for “${cur.title}”${left > 0 ? `: ${left} not finished yet; you could add a week` : ''}.` });
    if (s.assignerEnd) out.push({ date: cur.end, who: 'assigner', kind: 'end', vi: `Hết thời gian bài “${cur.title}”: xem dạng đã vững, đang luyện và gợi ý bài tiếp.`, en: `Time is up for “${cur.title}”: see what is mastered, what is being practised, and what next.` });
    return out.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  };

  // "Thông báo": every in-app reminder of the last two weeks and the coming week, for all her classes
  // (a parent: her children), newest day first. Worked out from the paths, like the reminders themselves.
  app.get('/api/t/notifications', async (c) => {
    const t = c.get('teacher'), s = await remindersOf(t.id), today = vnToday(), from = addDays(today, -14), to = addDays(today, 7);
    const out: { date: string; who: 'pupils' | 'assigner'; kind: string; vi: string; en: string; className: string; classId: string }[] = [];
    for (const pa of await sql.query<{ id: string; start: string; class_id: string; class_name: string }>(`select p.id, to_char(p.start_date, 'YYYY-MM-DD') as start, p.class_id, k.name as class_name from paths p join classes k on k.id = p.class_id where p.teacher_id = $1`, [t.id])) {
      const steps = layout(pa.start, await sql.query<StepRow>(`select ps.section_id, s.title, s.page_from, s.page_to, s.topic, ps.weeks, ps.ord from path_steps ps join sections s on s.id = ps.section_id where ps.path_id = $1 order by ps.ord`, [pa.id]), today);
      for (const st of steps.filter((x) => x.end >= from && x.start <= to)) {
        const one = remindersFor([{ ...st, status: 'current' }], s, await progressOf(pa.class_id, st.sectionId), from);
        // "Hết thời gian" carries the summary (Chi): how many skills are mastered, practised, or repeating a mistake
        const end = one.find((r) => r.kind === 'end' && r.date >= from && r.date <= to);
        if (end) {
          const asg = await sql.one<{ id: string }>(`select a.id from assignments a join lessons l on l.id = a.lesson_id where a.class_id = $1 and l.refs->0->>'sectionId' = $2 order by a.created_at desc limit 1`, [pa.class_id, st.sectionId]);
          if (asg) {
            const data = await classData(pa.class_id, asg.id), ls = [...labelsFor(data, await criteriaOf(t.id)).values()].flatMap((m) => [...m.values()].map((x) => x.label));
            const n = (l: Label) => ls.filter((x) => x === l).length;
            if (ls.length) { end.vi += ` Đã vững ${n('solid')} · đang luyện ${n('practising')} · lặp lỗi ${n('repeat')} (lượt em × dạng bài).`; end.en += ` Mastered ${n('solid')} · practising ${n('practising')} · repeated mistake ${n('repeat')} (learner × skill).`; }
          }
        }
        out.push(...one.filter((r) => r.date >= from && r.date <= to).map((r) => ({ ...r, className: pa.class_name, classId: pa.class_id })));
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return c.json({ today, notifications: out });
  });

  // ---- the path ----
  app.get('/api/t/path', async (c) => {
    const t = c.get('teacher'), classId = c.req.query('classId') || '', areaId = c.req.query('areaId') || '';
    const k = await classMine(c, classId), a = await sql.one<{ id: string; name: string }>('select id, name from areas where id = $1 and teacher_id = $2', [areaId, t.id]);
    if (!k || !a) return fail(c, 'notFound', 404);
    await ensureTopics(t.id, a.id);
    const p = await pathFor(t.id, k.id, a.id), steps = layout(p.start, p.steps);
    const cur = steps.find((x) => x.status === 'current');
    const prog = cur ? await progressOf(k.id, cur.sectionId) : undefined;
    const lessons = await sql.query<{ id: string; title: string; section: string }>(`select id, setup->>'title' as title, refs->0->>'sectionId' as section from lessons where teacher_id = $1 and area_id = $2 and status = 'ready' order by created_at desc`, [t.id, a.id]);
    return c.json({ path: { id: p.id, start: p.start }, steps, progress: prog ? { sectionId: cur!.sectionId, ...prog } : null, lessons, reminders: remindersFor(steps, await remindersOf(t.id), prog) });
  });
  app.put('/api/t/path/:id', async (c) => {
    const p = await sql.one<{ id: string }>('select id from paths where id = $1 and teacher_id = $2', [c.req.param('id'), c.get('teacher').id]);
    if (!p) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ start?: string; steps?: { sectionId?: string; weeks?: number }[] }>().catch(() => ({} as Record<string, never>));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.start || ''))) await sql.query('update paths set start_date = $2, updated_at = now() where id = $1', [p.id, b.start]);
    for (const [i, s] of (Array.isArray(b.steps) ? b.steps : []).entries()) {
      const weeks = [1, 2, 3].includes(Number(s?.weeks)) ? Number(s!.weeks) : 1;
      await sql.query('update path_steps set weeks = $3, ord = $4 where path_id = $1 and section_id = $2', [p.id, String(s?.sectionId || ''), weeks, i]);
    }
    // saved by the assigner: from now on assigning a lesson never re-plans this path
    await sql.query('update paths set updated_at = now() where id = $1', [p.id]);
    return c.json({ ok: true });
  });

  // ---- the learning summary ----
  // Everything the summary needs about one class: answers by learner and skill, with the items.
  const classData = async (classId: string, assignmentId?: string) => {
    const assignments = await sql.query<{ id: string; content: { items: Item[]; lang?: 'vi' | 'en'; title: string }; skills: Skill[] }>(
      `select a.id, a.content, coalesce(l.skills, '[]') as skills from assignments a left join lessons l on l.id = a.lesson_id where a.class_id = $1 ${assignmentId ? 'and a.id = $2' : ''} order by a.created_at desc`, assignmentId ? [classId, assignmentId] : [classId]);
    const items = new Map<string, Item>(), skills = new Map<string, string>();
    for (const a of assignments) { for (const it of a.content.items) items.set(it.id, it); for (const s of a.skills) skills.set(s.tag, s.name); }
    const extra = await sql.query<{ items: Item[] }>(`select items from pupil_extra where assignment_id = any($1)`, [assignments.map((a) => a.id)]);
    for (const e of extra) for (const it of e.items) items.set(it.id, it);
    const pupils = await sql.query<{ id: string; name: string }>('select id, name from pupils where class_id = $1 order by created_at, name', [classId]);
    const answers = await sql.query<Answer & { pupil_id: string }>(`select w.pupil_id, w.item_id, w.skill, w.correct, w.answer, w.at, to_char(w.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as day
      from answers w where w.assignment_id = any($1) order by w.at`, [assignments.map((a) => a.id)]);
    return { assignments, items, skills, pupils, answers, lang: (assignments[0]?.content.lang || 'vi') as 'vi' | 'en' };
  };
  const labelsFor = (data: Awaited<ReturnType<typeof classData>>, cr: Criteria) => {
    const bySkill = new Map<string, Map<string, ReturnType<typeof labelOf>>>();
    for (const sk of new Set(data.answers.map((a) => a.skill))) {
      const m = new Map<string, ReturnType<typeof labelOf>>();
      for (const p of data.pupils) { const mine = data.answers.filter((a) => a.pupil_id === p.id && a.skill === sk); if (mine.length) m.set(p.id, labelOf(mine, data.items, cr, data.lang)); }
      bySkill.set(sk, m);
    }
    return bySkill;
  };

  app.get('/api/t/summary', async (c) => {
    const t = c.get('teacher'), cr = await criteriaOf(t.id);
    const classes = await sql.query<{ id: string; name: string; kind: string }>('select id, name, kind from classes where teacher_id = $1 order by created_at', [t.id]);
    const pick = c.req.query('classId'), lessonId = c.req.query('lessonId') || '';
    const out = [];
    for (const k of classes) {
      const asg = lessonId ? (await sql.one<{ id: string }>('select id from assignments where class_id = $1 and lesson_id = $2 order by created_at desc limit 1', [k.id, lessonId]))?.id : undefined;
      if (lessonId && !asg) { out.push({ id: k.id, name: k.name, kind: k.kind, skills: [], pupils: [], mistakes: [] }); continue; }
      const data = await classData(k.id, asg), labels = labelsFor(data, cr);
      const skills = [...labels.entries()].map(([sk, m]) => {
        const ls = [...m.values()].map((x) => x.label);
        return { skill: sk, name: data.skills.get(sk) || sk, label: classLabel(ls, cr), counts: { solid: ls.filter((l) => l === 'solid').length, practising: ls.filter((l) => l === 'practising').length, repeat: ls.filter((l) => l === 'repeat').length } };
      });
      const mistakes = new Map<string, { skill: string; what: string; pupils: Set<string>; count: number }>();
      for (const [sk, m] of labels) for (const [pid, l] of m) if (l.label === 'repeat' && l.mistake) {
        const key = `${sk}|${l.mistake}`, x = mistakes.get(key) ?? { skill: data.skills.get(sk) || sk, what: l.mistake, pupils: new Set(), count: 0 };
        x.pupils.add(pid); x.count++; mistakes.set(key, x);
      }
      const pupils = data.pupils.map((p) => ({ id: p.id, name: p.name, skills: Object.fromEntries([...labels.entries()].filter(([, m]) => m.has(p.id)).map(([sk, m]) => [sk, m.get(p.id)!.label])) }));
      if (!pick || pick === k.id) out.push({ id: k.id, name: k.name, kind: k.kind, skills, pupils, mistakes: [...mistakes.values()].map((x) => ({ skill: x.skill, what: x.what, pupils: x.pupils.size })) });
    }
    const all = out.flatMap((k) => k.skills.map((s) => s.label as Label));
    const advised = await sql.one<{ n: string }>(`select count(distinct p.id) as n from pupils p join classes k on k.id = p.class_id join answers w on w.pupil_id = p.id where k.teacher_id = $1`, [t.id]);
    return c.json({ criteria: cr, classes: out, total: { solid: all.filter((l) => l === 'solid').length, practising: all.filter((l) => l === 'practising').length, repeat: all.filter((l) => l === 'repeat').length }, learners: Number(advised?.n) });
  });

  // Suggested comments (Muse Spark, from the labels only; learners as "Em 1…", names filled in here).
  app.post('/api/t/summary/comments', async (c) => {
    const t = c.get('teacher'), b = await c.req.json<{ classId?: string }>().catch(() => ({} as { classId?: string }));
    const k = await classMine(c, String(b.classId || ''));
    if (!k) return fail(c, 'notFound', 404);
    const g = await gate(c); if (g) return g;
    const data = await classData(k.id), labels = labelsFor(data, await criteriaOf(t.id));
    const who = data.pupils.filter((p) => [...labels.values()].some((m) => m.has(p.id))).slice(0, 40);
    if (!who.length) return c.json({ comments: [] });
    const word = { solid: data.lang === 'vi' ? 'đã vững' : 'mastered', practising: data.lang === 'vi' ? 'đang luyện' : 'practising', repeat: data.lang === 'vi' ? 'cần luyện thêm' : 'needs more practice' };
    const lines = who.map((p, i) => `Em ${i + 1}: ${[...labels.entries()].filter(([, m]) => m.has(p.id)).map(([sk, m]) => `${data.skills.get(sk) || sk} – ${word[m.get(p.id)!.label]}${m.get(p.id)!.mistake ? ` (${m.get(p.id)!.mistake})` : ''}`).join('; ')}`);
    try {
      const r = await d.as(t.id, () => guardedJson<{ comments: { who: string; text: string }[] }>(d.ai, { endpoint: 'comments', system: COMMENT_SYSTEM.replace('{{lang}}', data.lang === 'vi' ? 'Vietnamese' : 'English'), prompt: wrapUser(lines.join('\n')), schema: COMMENT_SCHEMA, fixture: { who: who.length } }));
      const comments = (r.comments || []).map((x) => { const n = Number(/(\d+)/.exec(x.who)?.[1]); const p = who[n - 1]; return p ? { pupilId: p.id, name: p.name, text: String(x.text || '').replace(/Em\s+\d+/g, p.name).slice(0, 400) } : null; }).filter(Boolean);
      return c.json({ comments });
    } catch { return fail(c, 'aiBusy', 503); }
  });

  app.post('/api/t/criteria/preview', async (c) => {
    const t = c.get('teacher'), cr = cleanCriteria(await c.req.json().catch(() => ({})));
    for (const k of await sql.query<{ id: string; name: string }>('select id, name from classes where teacher_id = $1 order by created_at', [t.id])) {
      const data = await classData(k.id), labels = labelsFor(data, cr);
      const [sk, m] = [...labels.entries()].sort((a, b) => b[1].size - a[1].size)[0] ?? [];
      if (!sk || !m) continue;
      const pupils = [...m.entries()].slice(0, 4).map(([pid, l]) => ({ name: data.pupils.find((p) => p.id === pid)?.name ?? '', right: l.right, of: l.of, mistake: l.mistake, label: l.label }));
      return c.json({ class: k.name, skill: data.skills.get(sk) || sk, pupils, classLabel: classLabel([...m.values()].map((x) => x.label), cr), share: { repeat: [...m.values()].filter((x) => x.label === 'repeat').length, of: m.size } });
    }
    return c.json({ class: null });
  });
  app.get('/api/t/criteria', async (c) => c.json({ criteria: await criteriaOf(c.get('teacher').id) }));
  app.put('/api/t/criteria', async (c) => {
    const cr = cleanCriteria(await c.req.json().catch(() => ({})));
    await sql.query('update teachers set criteria = $2::jsonb where id = $1', [c.get('teacher').id, J(cr)]);
    return c.json({ criteria: cr });
  });
  app.get('/api/t/reminders', async (c) => c.json({ reminders: await remindersOf(c.get('teacher').id) }));
  app.put('/api/t/reminders', async (c) => {
    const r = cleanReminders(await c.req.json().catch(() => ({})));
    await sql.query('update teachers set reminders = $2::jsonb where id = $1', [c.get('teacher').id, J(r)]);
    return c.json({ reminders: r });
  });

  // Advice in the AI's words (Chi: code decides, the AI only words it). The learner is "{child}" to the
  // model; her name is put in here. Worded once per set of facts; on any problem the template stays.
  const worded = new Map<string, Record<string, string>>();
  // The page never waits for the wording: without a cached one it shows the code's own sentence,
  // starts Muse Spark in the background, and says `wording` so the page asks again shortly (Chi: ~10 s blank).
  const wording = new Map<string, Promise<void>>();
  const wordAdvice = async (tid: string, name: string, lang: 'vi' | 'en', cards: { kind: string; text: string; why: string }[]) => {
    if (!cards.length) return { cards, pending: false };
    const facts = cards.map((x) => ({ kind: x.kind, decision: x.text.split(name).join('{child}'), because: x.why.split(name).join('{child}') }));
    const key = JSON.stringify([lang, facts]), w = worded.get(key);
    if (!w && !wording.has(key) && (await d.budget.check(tid)) === null) {
      wording.set(key, (async () => {
        try {
          const r = await d.as(tid, () => guardedJson<{ cards: { kind: string; text: string }[] }>(d.ai, { endpoint: 'comments', system: ADVICE_SYSTEM.replace('{{lang}}', lang === 'vi' ? 'Vietnamese' : 'English'), prompt: wrapUser(JSON.stringify(facts)), schema: ADVICE_SCHEMA, fixture: { advice: facts } }));
          if (worded.size > 2000) worded.clear();
          worded.set(key, Object.fromEntries((r.cards || []).filter((x) => x.text?.includes('{child}')).map((x) => [x.kind, String(x.text).slice(0, 300)])));
        } catch { worded.set(key, {}); } finally { wording.delete(key); }
      })());
    }
    return { cards: cards.map((x) => (w?.[x.kind] ? { ...x, text: w[x.kind].split('{child}').join(name) } : x)), pending: !w && wording.has(key) };
  };

  // ---- one learner: labels by skill, recent sessions, reminders, and the three advice cards ----
  const pupilMine = (c: Context<Env>) => sql.one<{ id: string; name: string; class_id: string; class_name: string; kind: string }>(
    `select p.id, p.name, p.class_id, k.name as class_name, k.kind from pupils p join classes k on k.id = p.class_id where p.id = $1 and k.teacher_id = $2`, [c.req.param('id'), c.get('teacher').id]);

  // `ui`: the language the assigner reads the page in (Chi: advice in English on a Vietnamese screen was wrong)
  const learner = async (tid: string, p: { id: string; name: string; class_id: string }, ui?: 'vi' | 'en') => {
    const cr = await criteriaOf(tid), data = await classData(p.class_id), labels = labelsFor(data, cr), lang = ui ?? data.lang;
    const skills = [...labels.entries()].filter(([, m]) => m.has(p.id)).map(([sk, m]) => ({ skill: sk, name: data.skills.get(sk) || sk, ...m.get(p.id)! }));
    const mine = data.answers.filter((a) => a.pupil_id === p.id);
    const sessions = [...new Set(mine.map((a) => a.day))].reverse().slice(0, 6).map((day) => {
      const xs = mine.filter((a) => a.day === day), times = xs.map((a) => Date.parse(a.at));
      return { day, answers: xs.length, minutes: Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 60000)) };
    });
    // where she is on the path (the first path of her class with a current part)
    const paths = await sql.query<{ id: string; start: string; area_id: string }>(`select id, to_char(start_date, 'YYYY-MM-DD') as start, area_id from paths where class_id = $1`, [p.class_id]);
    let current: (ReturnType<typeof layout>[number] & { pathId: string; week: number; daysLeft: number; itemsLeft: number; slidesSeen: boolean; videoSeen: boolean; assignmentId: string | null }) | null = null;
    for (const pa of paths) {
      const steps = await sql.query<StepRow>(`select ps.section_id, s.title, s.page_from, s.page_to, s.topic, ps.weeks, ps.ord from path_steps ps join sections s on s.id = ps.section_id where ps.path_id = $1 order by ps.ord`, [pa.id]);
      const extra = Object.fromEntries((await sql.query<{ section_id: string; weeks: number }>('select section_id, weeks from pupil_weeks where path_id = $1 and pupil_id = $2', [pa.id, p.id])).map((x) => [x.section_id, x.weeks]));
      const cur = layout(pa.start, steps, vnToday(), extra).find((x) => x.status === 'current');
      if (!cur) continue;
      const asg = await sql.one<{ id: string; content: { items: Item[] } }>(`select a.id, a.content from assignments a join lessons l on l.id = a.lesson_id where a.class_id = $1 and l.refs->0->>'sectionId' = $2 order by a.created_at desc limit 1`, [p.class_id, cur.sectionId]);
      const tried = asg ? Number((await sql.one<{ n: string }>('select count(distinct item_id) as n from answers where assignment_id = $1 and pupil_id = $2', [asg.id, p.id]))?.n) : 0;
      const g = asg ? await sql.one<{ slides: boolean; video: boolean }>('select slides_at is not null as slides, video_at is not null as video from pupil_progress where assignment_id = $1 and pupil_id = $2', [asg.id, p.id]) : undefined;
      const extraItems = asg ? Number((await sql.one<{ n: string }>('select coalesce(sum(jsonb_array_length(items)), 0) as n from pupil_extra where assignment_id = $1 and pupil_id = $2', [asg.id, p.id]))?.n) : 0;
      current = { ...cur, pathId: pa.id, week: Math.min(cur.weeks, Math.floor(daysBetween(cur.start, vnToday()) / 7) + 1), daysLeft: daysBetween(vnToday(), cur.end), itemsLeft: asg ? Math.max(0, asg.content.items.length + extraItems - tried) : 0, slidesSeen: !!g?.slides, videoSeen: !!g?.video, assignmentId: asg?.id ?? null };
      break;
    }
    // advice, by code (the sentence is a template; Chi: "code works it out, the AI only words it")
    const done = await sql.query<{ kind: string; skill: string; status: string; id: string }>(`select id::text, kind, skill, status from advice where pupil_id = $1 and at > now() - interval '30 days'`, [p.id]);
    const isDone = (kind: string, skill = '') => done.find((a) => a.kind === kind && a.skill === skill && a.status !== 'undone');
    const vi = lang === 'vi', cards: { kind: 'practice' | 'next' | 'time'; skill: string; text: string; why: string; applied: string | null; kept: boolean }[] = [];
    const weak = skills.find((s) => s.label !== 'solid'), strong = skills.find((s) => s.label === 'solid');
    if (weak && cr.practice) { const a = isDone('practice', weak.skill); cards.push({ kind: 'practice', skill: weak.skill, applied: a?.status === 'applied' ? a.id : null, kept: a?.status === 'kept',
      text: vi ? `Dạng ${weak.name}${weak.mistake ? ` (${weak.mistake.toLowerCase()})` : ''} ${p.name} đang luyện. Nên thêm 5 câu cùng dạng vào bài đang học.` : `${p.name} is practising ${weak.name}${weak.mistake ? ` (${weak.mistake.toLowerCase()})` : ''}. Add 5 more items of this kind to the current lesson.`,
      why: vi ? `${weak.right}/${weak.of} câu gần nhất đúng. Đã vững khi từ ${cr.solid}%.` : `${weak.right}/${weak.of} recent answers right. Mastered from ${cr.solid}%.` }); }
    if (strong && cr.next) { const a = isDone('next', strong.skill); cards.push({ kind: 'next', skill: strong.skill, applied: a?.status === 'applied' ? a.id : null, kept: a?.status === 'kept',
      text: vi ? `${p.name} đã vững dạng ${strong.name}. Có thể làm thêm bài nâng cao.` : `${p.name} has mastered ${strong.name}. Ready for harder items.`,
      why: vi ? `${strong.right}/${strong.of} câu gần nhất đúng (từ ${cr.solid}% là đã vững).` : `${strong.right}/${strong.of} recent answers right (mastered from ${cr.solid}%).` }); }
    if (cr.time && current && current.daysLeft <= 2 && current.itemsLeft > 0) { const a = isDone('time', current.sectionId); cards.push({ kind: 'time', skill: current.sectionId, applied: a?.status === 'applied' ? a.id : null, kept: a?.status === 'kept',
      text: vi ? `Còn ${Math.max(0, current.daysLeft)} ngày, ${p.name} còn ${current.itemsLeft} câu bài tập. Nên kéo dài bài này thêm 1 tuần.` : `${Math.max(0, current.daysLeft)} days left and ${current.itemsLeft} items to go. Give this lesson one more week.`,
      why: vi ? `Bài “${current.title}” hết ngày ${current.end.slice(8, 10)}/${current.end.slice(5, 7)}.` : `“${current.title}” ends on ${current.end}.` }); }
    const adv = await wordAdvice(tid, p.name, lang, cards);
    return { skills, sessions, current, advice: adv.cards, wording: adv.pending, lang };
  };

  app.get('/api/t/pupils/:id', async (c) => {
    const p = await pupilMine(c);
    if (!p) return fail(c, 'notFound', 404);
    const q = c.req.query('lang'), L = await learner(c.get('teacher').id, p, q === 'vi' || q === 'en' ? q : undefined);
    const s = await remindersOf(c.get('teacher').id);
    const logged = await sql.query<{ day: string; kind: string; text: string }>(`select to_char(day, 'YYYY-MM-DD') as day, kind, text from pupil_reminders where pupil_id = $1 order by day desc limit 20`, [p.id]);
    const sent = logged.map((r) => ({ date: r.day, who: 'pupils' as const, kind: r.kind, vi: r.text.split('\n')[0], en: r.text.split('\n')[1] || r.text }));
    void (L.current ? remindersFor(layout(L.current.start, [{ section_id: L.current.sectionId, title: L.current.title, page_from: 0, page_to: 0, topic: '', weeks: L.current.weeks }], vnToday()).map((x) => ({ ...x, status: 'current' as const })), s, undefined, L.current.start).filter((r) => r.who === 'pupils' && r.date <= vnToday()) : []);
    // a parent moves between her children (each is a class of one); a teacher between the pupils of the class
    const mates = p.kind === 'child'
      ? await sql.query<{ id: string; name: string }>(`select p.id, p.name from pupils p join classes k on k.id = p.class_id where k.teacher_id = $1 and k.kind = 'child' order by k.created_at`, [c.get('teacher').id])
      : await sql.query<{ id: string; name: string }>('select id, name from pupils where class_id = $1 order by created_at, name', [p.class_id]);
    return c.json({ pupil: { id: p.id, name: p.name, classId: p.class_id, className: p.class_name, kind: p.kind }, ...L, reminders: sent, mates });
  });

  // Áp dụng / Giữ nguyên / Hoàn tác, for this learner only.
  app.post('/api/t/pupils/:id/advice', async (c) => {
    const t = c.get('teacher'), p = await pupilMine(c);
    if (!p) return fail(c, 'notFound', 404);
    const b = await c.req.json<{ kind?: string; skill?: string; action?: string; adviceId?: string }>().catch(() => ({} as Record<string, never>));
    if (b.action === 'undo') {
      const a = await sql.one<{ id: string; kind: string; data: { pathId?: string; sectionId?: string; assignmentId?: string } }>(`select id::text, kind, data from advice where id = $1 and pupil_id = $2`, [Number(b.adviceId), p.id]);
      if (!a) return fail(c, 'notFound', 404);
      if (a.kind === 'time' && a.data.pathId) await sql.query('update pupil_weeks set weeks = weeks - 1 where path_id = $1 and pupil_id = $2 and section_id = $3', [a.data.pathId, p.id, a.data.sectionId]);
      else await sql.query('delete from pupil_extra where advice_id = $1', [Number(a.id)]);
      await sql.query(`update advice set status = 'undone' where id = $1`, [Number(a.id)]);
      return c.json({ ok: true });
    }
    const kind = String(b.kind), skill = String(b.skill || '');
    if (!['practice', 'next', 'time'].includes(kind)) return fail(c, 'bad');
    if (b.action === 'keep') { await sql.query(`insert into advice (teacher_id, pupil_id, kind, skill, status) values ($1, $2, $3, $4, 'kept')`, [t.id, p.id, kind, skill]); return c.json({ ok: true }); }
    const L = await learner(t.id, p);
    if (kind === 'time') {
      if (!L.current) return fail(c, 'bad');
      await sql.query('insert into pupil_weeks (path_id, pupil_id, section_id, weeks) values ($1, $2, $3, 1) on conflict (path_id, pupil_id, section_id) do update set weeks = pupil_weeks.weeks + 1', [L.current.pathId, p.id, L.current.sectionId]);
      const a = await sql.one<{ id: string }>(`insert into advice (teacher_id, pupil_id, kind, skill, data) values ($1, $2, 'time', $3, $4::jsonb) returning id::text`, [t.id, p.id, skill, J({ pathId: L.current.pathId, sectionId: L.current.sectionId })]);
      return c.json({ ok: true, adviceId: a?.id });
    }
    // 5 more items of the skill (or harder ones), written and checked like the lesson's, for her only
    const asg = await sql.one<{ id: string; lesson_id: string; content: { items: Item[] } }>(`select a.id, a.lesson_id, a.content from assignments a where a.class_id = $1 and a.content->'items' @> $2::jsonb order by a.created_at desc limit 1`, [p.class_id, J([{ skill }])]);
    const l = asg && await sql.one<Lesson>('select * from lessons where id = $1', [asg.lesson_id]);
    if (!asg || !l) return fail(c, 'notFound', 404);
    const g = await gate(c); if (g) return g;
    const like = asg.content.items.find((i) => i.skill === skill)!;
    let n = 0;
    try {
      const r = await d.as(t.id, () => writeItems(d.ai, l.setup, l.source, l.skills, { skill, template: like.template, level: kind === 'next' ? 'advanced' : like.level === 'advanced' ? 'good' : like.level, count: 5 }, () => `${p.id.slice(0, 4)}x${Date.now().toString(36)}${n++}`), asg.lesson_id);
      if (!r.kept.length) return fail(c, 'aiBusy', 503);
      const a = await sql.one<{ id: string }>(`insert into advice (teacher_id, pupil_id, kind, skill, data) values ($1, $2, $3, $4, $5::jsonb) returning id::text`, [t.id, p.id, kind, skill, J({ assignmentId: asg.id })]);
      for (const it of r.kept) it.page = like.page;
      await sql.query('insert into pupil_extra (assignment_id, pupil_id, advice_id, items) values ($1, $2, $3, $4::jsonb)', [asg.id, p.id, Number(a!.id), J(r.kept.slice(0, 5))]);
      return c.json({ ok: true, adviceId: a!.id, added: r.kept.slice(0, 5).length });
    } catch { return fail(c, 'aiBusy', 503); }
  });

  // A learner's reminder for today (at most one, in the app only), for the pupils' home screen.
  return {
    pupilReminder: async (classId: string, pupilId: string): Promise<{ vi: string; en: string } | null> => {
      const k = await sql.one<{ teacher_id: string }>('select teacher_id from classes where id = $1', [classId]);
      if (!k) return null;
      const s = await remindersOf(k.teacher_id), today = vnToday();
      // already shown today: the same one again (at most one a day)
      const shown = await sql.one<{ text: string; kind: string }>('select text, kind from pupil_reminders where pupil_id = $1 and day = $2', [pupilId, today]);
      if (shown) { const [vi, en] = shown.text.split('\n'); return { vi, en: en || vi }; }
      // only from the time the assigner chose until 20:00 (Vietnam time)
      const hm = new Date(clock.now() + 7 * 3600e3).toISOString().slice(11, 16);
      if (hm < s.time || hm >= '20:00') return null;
      for (const pa of await sql.query<{ id: string; start: string }>(`select id, to_char(start_date, 'YYYY-MM-DD') as start from paths where class_id = $1`, [classId])) {
        const steps = await sql.query<StepRow>(`select ps.section_id, s.title, s.page_from, s.page_to, s.topic, ps.weeks, ps.ord from path_steps ps join sections s on s.id = ps.section_id where ps.path_id = $1 order by ps.ord`, [pa.id]);
        const extra = Object.fromEntries((await sql.query<{ section_id: string; weeks: number }>('select section_id, weeks from pupil_weeks where path_id = $1 and pupil_id = $2', [pa.id, pupilId])).map((x) => [x.section_id, x.weeks]));
        const laid = layout(pa.start, steps, today, extra), cur = laid.find((x) => x.status === 'current');
        const done = cur ? !!(await sql.one(`select 1 from pupil_progress g join assignments a on a.id = g.assignment_id join lessons l on l.id = a.lesson_id
          where g.pupil_id = $1 and l.refs->0->>'sectionId' = $2 and g.done_at is not null`, [pupilId, cur.sectionId])) : false;
        // Chi: the mid-lesson reminder only for a learner who has not done the practice yet
        const r = remindersFor(laid, s, undefined, today).find((x) => x.who === 'pupils' && x.date === today && !(x.kind === 'mid' && done));
        if (r) { await sql.query('insert into pupil_reminders (pupil_id, day, kind, text) values ($1, $2, $3, $4) on conflict do nothing', [pupilId, today, r.kind, `${r.vi}\n${r.en}`]); return { vi: r.vi, en: r.en }; }
      }
      return null;
    },
  };
}

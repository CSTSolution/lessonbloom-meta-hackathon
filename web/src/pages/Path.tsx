// "Lộ trình học" (Chi's appendix 3): pick a class (a parent: a child) and a source; its parts grouped
// by chapter, each 1, 2 or 3 weeks, the dates following on by themselves; where the class is now
// (week, days left, how many have done the practice) and the reminders that will be sent in the app.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AreaRow, type ClassRow, type PathStep, type PathView } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';
import { pagesOf } from './Sources.tsx';

const T = {
  vi: {
    title: 'Lộ trình học', lead: 'Mỗi bài học trong 1, 2 hoặc 3 tuần.', cls: 'Lớp', child: 'Con', src: 'Nguồn', save: 'Lưu lộ trình', saved: (at: string) => `Đã lưu lộ trình lúc ${at}`, unsaved: 'Chưa lưu', saving: 'Đang lưu…', start: 'Bắt đầu từ',
    n: (b: number, w: number) => `${b} bài · ${w} tuần`, wk: (n: number) => `${n} tuần`, st: { done: 'Đã học xong', current: 'Đang học', next: 'Tiếp theo', later: 'Sau' }, ended: (d: string) => `Xong ngày ${d}`, starts: (d: string) => `Bắt đầu ${d}`,
    week: (i: number, n: number) => `Tuần ${i} / ${n}`, left: (n: number, d: string) => `Còn ${n} ngày, hết ngày ${d}`, done: (d: number, n: number, p: boolean) => (p ? (d ? 'Con đã làm bài tập' : 'Con chưa làm bài tập') : `${d}/${n} em đã làm bài tập`), page: 'Tr.',
    reminders: 'Lời nhắc tình trạng', remLead: 'Tự gửi trên app.', toPupils: 'Nhắc học sinh', toChild: 'Nhắc con', toMe: 'Nhắc cô', seeAll: (n: number) => `Xem cả ${n} lời nhắc`, settings: 'Cài đặt lời nhắc',
    noClass: 'Cô tạo lớp trong mục Lớp học trước.', noChild: 'Thêm con trong mục Con của tôi trước.', noSrc: 'Cô thêm sách vào Kho kiến thức trước.', make: 'Tạo bài', lesson: 'Bài giảng',
  },
  en: {
    title: 'Learning path', lead: 'Each lesson takes 1, 2 or 3 weeks.', cls: 'Class', child: 'Child', src: 'Source', save: 'Save path', saved: (at: string) => `Path saved at ${at}`, unsaved: 'Not saved', saving: 'Saving…', start: 'Starts on',
    n: (b: number, w: number) => `${pl(b, 'lesson')} · ${pl(w, 'week')}`, wk: (n: number) => `${n} wk`, st: { done: 'Done', current: 'Now', next: 'Next', later: 'Later' }, ended: (d: string) => `Done ${d}`, starts: (d: string) => `Starts ${d}`,
    week: (i: number, n: number) => `Week ${i} / ${n}`, left: (n: number, d: string) => `${pl(n, 'day')} left, ends ${d}`, done: (d: number, n: number, p: boolean) => (p ? (d ? 'Practice done' : 'Practice not done yet') : `${d}/${n} have done the practice`), page: 'p.',
    reminders: 'Status reminders', remLead: 'Sent in the app.', toPupils: 'To pupils', toChild: 'To your child', toMe: 'To you', seeAll: (n: number) => `See all ${n}`, settings: 'Reminder settings',
    noClass: 'Create a class under Classes first.', noChild: 'Add a child under My children first.', noSrc: 'Add a book to Knowledge first.', make: 'Make lesson', lesson: 'Lesson',
  },
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// The dates worked out here the same way as layout() in server/path/routes.ts, so 1/2/3 wk on a lesson
// moves its end and every later start at once (Chi #35); the server's own dates come back after the save.
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
function relayout(start: string, steps: PathStep[], weeks: Record<string, number>, today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)): PathStep[] {
  let at = start, seen = false;
  const out = steps.map((s): PathStep => {
    const w = weeks[s.sectionId] || s.weeks, end = addDays(at, w * 7 - 1), r = { ...s, weeks: w, start: at, end, status: end < today ? 'done' : at <= today ? 'current' : 'later' } as PathStep;
    at = addDays(end, 1);
    return r;
  });
  for (const r of out) { if (r.status === 'current') seen = true; else if (r.status === 'later' && (seen || !out.some((x) => x.status === 'current'))) { r.status = 'next'; break; } }
  return out;
}
const dow = (d: string, lang: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'short', timeZone: 'UTC' }).replace('Th ', 'T');

export function Path({ parent }: { parent: boolean }) {
  const t = useT(T), lang = useLang();
  const [classes, setClasses] = useState<ClassRow[] | null>(null), [areas, setAreas] = useState<AreaRow[]>([]), [k, setK] = useState(''), [a, setA] = useState('');
  const [v, setV] = useState<PathView | null>(null), [weeks, setWeeks] = useState<Record<string, number>>({}), [start, setStart] = useState(''), [open, setOpen] = useState(''), [msg, setMsg] = useState(''), [allRem, setAllRem] = useState(false);
  // saved by itself shortly after each change (Chi #35); `gen` tells a late answer from the latest change
  const [at, setAt] = useState(''), [saving, setSaving] = useState<'' | 'dirty' | 'saving' | 'saved' | 'error'>(''), gen = useRef(0), timer = useRef(0), flush = useRef<(() => void) | null>(null);
  useEffect(() => () => { flush.current?.(); gen.current++; }, []);
  useEffect(() => {
    api.classes().then((r) => { setClasses(r.classes); setK(r.classes[0]?.id || ''); }).catch(() => setClasses([]));
    api.areas().then((r) => { const ready = r.areas.filter((x) => x.books.some((b) => b.status === 'ready')); setAreas(ready); setA(ready[0]?.id || ''); }).catch(() => {});
  }, []);
  const load = () => { const g = gen.current; if (k && a) api.path(k, a).then((p) => { if (g !== gen.current) return; setV(p); setWeeks(Object.fromEntries(p.steps.map((s) => [s.sectionId, s.weeks]))); setStart(p.path.start); setOpen((o) => o || p.steps.find((s) => s.status === 'current')?.topic || p.steps[0]?.topic || ''); }).catch(() => setV(null)); };
  useEffect(() => { flush.current?.(); gen.current++; setSaving(''); setMsg(''); setOpen(''); setV(null); load(); }, [k, a]);
  // each lesson's pages as printed in the paper book, when known (Chi #45); the path itself sends file pages
  const [printed, setPrinted] = useState<Record<string, string>>({});
  useEffect(() => { setPrinted({}); if (a) api.area(a).then((r) => setPrinted(Object.fromEntries(r.sections.filter((x) => x.printed_from != null && x.printed_to != null).map((x) => [x.id, pagesOf(x.page_from, x.page_to, x.printed_from, x.printed_to)])))).catch(() => {}); }, [a]);
  if (!classes) return null;
  if (!classes.length || !areas.length) return <div className="page narrow"><h1>{t.title}</h1><div className="card" style={{ marginTop: 12 }}><p className="muted">{!classes.length ? (parent ? t.noChild : t.noClass) : t.noSrc}</p></div></div>;
  const save = async (w = weeks, st = start, my = gen.current) => {
    if (!v || !isDay(st)) return;
    flush.current = null; setSaving('saving'); setMsg('');
    try {
      await api.savePath(v.path.id, { start: st, steps: v.steps.map((s) => ({ sectionId: s.sectionId, weeks: w[s.sectionId] || 1 })) });
      // a newer change saves (and reloads) itself; otherwise reload, so the reminders follow the new dates
      if (my === gen.current) { setSaving('saved'); setAt(new Date().toLocaleTimeString(lang === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit' })); load(); }
    } catch (e) { if (my === gen.current) { setSaving('error'); setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } }
  };
  const change = (w: Record<string, number>, st: string) => {
    setWeeks(w); setStart(st); setSaving('dirty'); setMsg('');
    const my = ++gen.current;
    window.clearTimeout(timer.current);
    if (!isDay(st)) { flush.current = null; return; }
    timer.current = window.setTimeout(() => void save(w, st, my), 800);
    flush.current = () => { window.clearTimeout(timer.current); void save(w, st, my); };
  };
  const steps = v ? relayout(isDay(start) ? start : v.path.start, v.steps, weeks) : [];
  const topics = [...new Set(steps.map((s) => s.topic))];
  const rem = v?.reminders ?? [];
  return (
    <div className="page">
      <h1>{t.title}</h1><p className="small muted">{t.lead}</p>
      <div className="row" style={{ margin: '10px 0 14px' }}>
        <label className="small">{parent ? t.child : t.cls} <select value={k} onChange={(e) => setK(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="small">{t.src} <select value={a} onChange={(e) => setA(e.target.value)}>{areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="small">{t.start} <input type="date" value={start} onChange={(e) => change(weeks, e.target.value)} /></label>
      </div>
      {!v && k && a && <p className="muted" role="status" style={{ marginTop: 16 }}>{lang === 'vi' ? 'Đang tải lộ trình… (lần đầu với một nguồn có thể mất vài giây)' : 'Loading the path… (the first time for a source can take a few seconds)'}</p>}
      {v && <div className="cols">
        <div className="stack">
          {topics.map((tp) => { const mine = steps.filter((s) => s.topic === tp), st = mine.some((s) => s.status === 'current') ? 'current' : mine.every((s) => s.status === 'done') ? 'done' : 'later'; return (
            <div key={tp} className={`group card ${open === tp ? 'on' : ''}`}>
              <button className="group-head" onClick={() => setOpen(open === tp ? '' : tp)}><span className="caret">{open === tp ? '▾' : '▸'}</span>
                <span className="grow"><b className="small">{tp}</b><span className="small muted" style={{ display: 'block' }}>{t.n(mine.length, mine.reduce((x, s) => x + s.weeks, 0))}</span></span><span className={`tag ${st}`}>{t.st[st as 'done' | 'current' | 'later']}</span></button>
              {open === tp && <div className="stack" style={{ paddingTop: 8, gap: 8 }}>{mine.map((s) => { const n = steps.indexOf(s) + 1, cur = s.status === 'current', lessons = v.lessons.filter((l) => l.section === s.sectionId); return (
                <div key={s.sectionId} className={`list-row ${cur ? 'sel' : ''}`} style={{ display: 'grid', gap: 6 }}>
                  <div className="row">
                    <span className={`num ${s.status === 'done' ? 'done' : cur ? 'cur' : ''}`}>{n}</span>
                    <span className="grow"><b className="small">{s.title}</b> <span className={`tag ${s.status}`}>{t.st[s.status]}</span>
                      <span className="small muted" style={{ display: 'block' }}>{t.page} {printed[s.sectionId] ?? s.pages} · {s.status === 'done' ? t.ended(dm(s.end)) : cur ? `${dm(s.start)} – ${dm(s.end)}` : t.starts(dm(s.start))}</span></span>
                    {s.status !== 'done' && <div className="weeks">{[1, 2, 3].map((w) => <button key={w} className={s.weeks === w ? 'on' : ''} onClick={() => { if (w !== s.weeks) change({ ...weeks, [s.sectionId]: w }, start); }}>{t.wk(w)}</button>)}</div>}
                  </div>
                  {cur && <div className="stack" style={{ gap: 4, background: 'var(--paper)', borderRadius: 8, padding: 8 }}>
                    <div className="row small"><b className="grow">{t.week(Math.min(s.weeks, Math.floor((Date.now() + 7 * 3600e3 - Date.parse(`${s.start}T00:00:00Z`)) / 6048e5) + 1), s.weeks)}</b><span className="muted">{t.left(Math.max(0, Math.round((Date.parse(`${s.end}T00:00:00Z`) - Date.parse(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5)), dm(s.end))}</span></div>
                    {v.progress?.sectionId === s.sectionId && <><span className="meter" style={{ width: '100%' }}><i style={{ width: `${v.progress.pupils ? (100 * v.progress.done) / v.progress.pupils : 0}%` }} /></span><span className="small muted">{t.done(v.progress.done, v.progress.pupils, parent)}</span></>}
                  </div>}
                  <div className="row small">{lessons.map((l) => <button key={l.id} className="link small" onClick={() => go(`/lesson/${l.id}`)}>{l.title}</button>)}
                    {!lessons.length && s.status !== 'done' && <button className="link small" onClick={() => go(`/new?area=${a}&section=${s.sectionId}`)}>+ {t.make}</button>}</div>
                </div>
              ); })}</div>}
            </div>
          ); })}
          <div className="row" role="status"><span className="small grow" style={{ fontWeight: 600, color: msg ? undefined : saving === 'saved' ? 'var(--ok)' : saving === 'dirty' ? 'var(--sun)' : 'var(--ink-2)' }}>{msg || (saving === 'dirty' ? t.unsaved : saving === 'saving' ? t.saving : saving === 'saved' ? `✓ ${t.saved(at)}` : '')}</span>
            {saving === 'error' && <button className="btn primary" onClick={() => void save()}>{t.save}</button>}</div>
        </div>
        {/* the reminders are worked out on the server from the saved dates: faded until the save is back */}
        <aside className="card stack" style={{ gap: 8, opacity: saving === 'dirty' || saving === 'saving' ? 0.55 : 1 }}>
          <b>{t.reminders}</b><span className="small muted">{t.remLead}</span>
          {(allRem ? rem : rem.slice(0, 2)).map((r, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <span className="tag ai" style={{ textAlign: 'center', minWidth: 46 }}>{dow(r.date, lang)}<br />{dm(r.date)}</span>
              <span className="small"><b style={{ color: 'var(--leaf)' }}>{r.who === 'pupils' ? (parent ? t.toChild : t.toPupils) : t.toMe}</b><br />{lang === 'en' ? r.en : r.vi}</span>
            </div>
          ))}
          {rem.length > 2 && !allRem && <button className="link small" style={{ alignSelf: 'start' }} onClick={() => setAllRem(true)}>{t.seeAll(rem.length)}</button>}
          <button className="link small" style={{ alignSelf: 'start' }} onClick={() => go('/reminders')}>{t.settings}</button>
        </aside>
      </div>}
    </div>
  );
}

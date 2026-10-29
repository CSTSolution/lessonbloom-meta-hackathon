// "Lộ trình học" (Chi's appendix 3): pick a class (a parent: a child) and a source; its parts grouped
// by chapter, each 1, 2 or 3 weeks, the dates following on by themselves; where the class is now
// (week, days left, how many have done the practice) and the reminders that will be sent in the app.
import { useEffect, useState } from 'react';
import { api, ApiError, type AreaRow, type ClassRow, type PathView } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Lộ trình học', lead: 'Mỗi bài học trong 1, 2 hoặc 3 tuần.', cls: 'Lớp', child: 'Con', src: 'Nguồn', save: 'Lưu lộ trình', saved: 'Đã lưu.', start: 'Bắt đầu từ',
    n: (b: number, w: number) => `${b} bài · ${w} tuần`, wk: (n: number) => `${n} tuần`, st: { done: 'Đã học xong', current: 'Đang học', next: 'Tiếp theo', later: 'Sau' }, ended: (d: string) => `Xong ngày ${d}`, starts: (d: string) => `Bắt đầu ${d}`,
    week: (i: number, n: number) => `Tuần ${i} / ${n}`, left: (n: number, d: string) => `Còn ${n} ngày, hết ngày ${d}`, done: (d: number, n: number, p: boolean) => (p ? (d ? 'Con đã làm bài tập' : 'Con chưa làm bài tập') : `${d}/${n} em đã làm bài tập`), page: 'Tr.',
    reminders: 'Lời nhắc tình trạng', remLead: 'Tự gửi trên app.', toPupils: 'Nhắc học sinh', toChild: 'Nhắc con', toMe: 'Nhắc cô', seeAll: (n: number) => `Xem cả ${n} lời nhắc`, settings: 'Cài đặt lời nhắc',
    noClass: 'Cô tạo lớp trong mục Lớp học trước.', noChild: 'Thêm con trong mục Con của tôi trước.', noSrc: 'Cô thêm sách vào Kho kiến thức trước.', make: 'Tạo bài', lesson: 'Bài giảng',
  },
  en: {
    title: 'Learning path', lead: 'Each lesson takes 1, 2 or 3 weeks.', cls: 'Class', child: 'Child', src: 'Source', save: 'Save path', saved: 'Saved.', start: 'Starts on',
    n: (b: number, w: number) => `${pl(b, 'lesson')} · ${pl(w, 'week')}`, wk: (n: number) => `${n} wk`, st: { done: 'Done', current: 'Now', next: 'Next', later: 'Later' }, ended: (d: string) => `Done ${d}`, starts: (d: string) => `Starts ${d}`,
    week: (i: number, n: number) => `Week ${i} / ${n}`, left: (n: number, d: string) => `${pl(n, 'day')} left, ends ${d}`, done: (d: number, n: number, p: boolean) => (p ? (d ? 'Practice done' : 'Practice not done yet') : `${d}/${n} have done the practice`), page: 'p.',
    reminders: 'Status reminders', remLead: 'Sent in the app.', toPupils: 'To pupils', toChild: 'To your child', toMe: 'To you', seeAll: (n: number) => `See all ${n}`, settings: 'Reminder settings',
    noClass: 'Create a class under Classes first.', noChild: 'Add a child under My children first.', noSrc: 'Add a book to Knowledge first.', make: 'Make lesson', lesson: 'Lesson',
  },
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dow = (d: string, lang: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'short', timeZone: 'UTC' }).replace('Th ', 'T');

export function Path({ parent }: { parent: boolean }) {
  const t = useT(T), lang = useLang();
  const [classes, setClasses] = useState<ClassRow[] | null>(null), [areas, setAreas] = useState<AreaRow[]>([]), [k, setK] = useState(''), [a, setA] = useState('');
  const [v, setV] = useState<PathView | null>(null), [weeks, setWeeks] = useState<Record<string, number>>({}), [start, setStart] = useState(''), [open, setOpen] = useState(''), [msg, setMsg] = useState(''), [allRem, setAllRem] = useState(false);
  useEffect(() => {
    api.classes().then((r) => { setClasses(r.classes); setK(r.classes[0]?.id || ''); }).catch(() => setClasses([]));
    api.areas().then((r) => { const ready = r.areas.filter((x) => x.books.some((b) => b.status === 'ready')); setAreas(ready); setA(ready[0]?.id || ''); }).catch(() => {});
  }, []);
  const load = () => { if (k && a) api.path(k, a).then((p) => { setV(p); setWeeks(Object.fromEntries(p.steps.map((s) => [s.sectionId, s.weeks]))); setStart(p.path.start); setOpen(p.steps.find((s) => s.status === 'current')?.topic || p.steps[0]?.topic || ''); }).catch(() => setV(null)); };
  useEffect(() => { setV(null); load(); }, [k, a]);
  if (!classes) return null;
  if (!classes.length || !areas.length) return <div className="page narrow"><h1>{t.title}</h1><div className="card" style={{ marginTop: 12 }}><p className="muted">{!classes.length ? (parent ? t.noChild : t.noClass) : t.noSrc}</p></div></div>;
  const changed = v && (start !== v.path.start || v.steps.some((s) => weeks[s.sectionId] !== s.weeks));
  const save = async () => { if (!v) return; try { await api.savePath(v.path.id, { start, steps: v.steps.map((s) => ({ sectionId: s.sectionId, weeks: weeks[s.sectionId] || 1 })) }); setMsg(t.saved); load(); } catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } };
  const topics = v ? [...new Set(v.steps.map((s) => s.topic))] : [];
  const rem = v?.reminders ?? [];
  return (
    <div className="page">
      <h1>{t.title}</h1><p className="small muted">{t.lead}</p>
      <div className="row" style={{ margin: '10px 0 14px' }}>
        <label className="small">{parent ? t.child : t.cls} <select value={k} onChange={(e) => setK(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="small">{t.src} <select value={a} onChange={(e) => setA(e.target.value)}>{areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="small">{t.start} <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      </div>
      {!v && k && a && <p className="muted" role="status" style={{ marginTop: 16 }}>{lang === 'vi' ? 'Đang tải lộ trình… (lần đầu với một nguồn có thể mất vài giây)' : 'Loading the path… (the first time for a source can take a few seconds)'}</p>}
      {v && <div className="cols">
        <div className="stack">
          {topics.map((tp) => { const steps = v.steps.filter((s) => s.topic === tp), st = steps.some((s) => s.status === 'current') ? 'current' : steps.every((s) => s.status === 'done') ? 'done' : 'later'; return (
            <div key={tp} className={`group card ${open === tp ? 'on' : ''}`}>
              <button className="group-head" onClick={() => setOpen(open === tp ? '' : tp)}><span className="caret">{open === tp ? '▾' : '▸'}</span>
                <span className="grow"><b className="small">{tp}</b><span className="small muted" style={{ display: 'block' }}>{t.n(steps.length, steps.reduce((x, s) => x + (weeks[s.sectionId] || s.weeks), 0))}</span></span><span className={`tag ${st}`}>{t.st[st as 'done' | 'current' | 'later']}</span></button>
              {open === tp && <div className="stack" style={{ paddingTop: 8, gap: 8 }}>{steps.map((s) => { const n = v.steps.indexOf(s) + 1, cur = s.status === 'current', lessons = v.lessons.filter((l) => l.section === s.sectionId); return (
                <div key={s.sectionId} className={`list-row ${cur ? 'sel' : ''}`} style={{ display: 'grid', gap: 6 }}>
                  <div className="row">
                    <span className={`num ${s.status === 'done' ? 'done' : cur ? 'cur' : ''}`}>{n}</span>
                    <span className="grow"><b className="small">{s.title}</b> <span className={`tag ${s.status}`}>{t.st[s.status]}</span>
                      <span className="small muted" style={{ display: 'block' }}>{t.page} {s.pages} · {s.status === 'done' ? t.ended(dm(s.end)) : cur ? `${dm(s.start)} – ${dm(s.end)}` : t.starts(dm(s.start))}</span></span>
                    {s.status !== 'done' && <div className="weeks">{[1, 2, 3].map((w) => <button key={w} className={(weeks[s.sectionId] || s.weeks) === w ? 'on' : ''} onClick={() => setWeeks({ ...weeks, [s.sectionId]: w })}>{t.wk(w)}</button>)}</div>}
                  </div>
                  {cur && <div className="stack" style={{ gap: 4, background: 'var(--paper)', borderRadius: 8, padding: 8 }}>
                    <div className="row small"><b className="grow">{t.week(Math.min(s.weeks, Math.floor((Date.now() + 7 * 3600e3 - Date.parse(`${s.start}T00:00:00Z`)) / 6048e5) + 1), s.weeks)}</b><span className="muted">{t.left(Math.max(0, Math.round((Date.parse(`${s.end}T00:00:00Z`) - Date.parse(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5)), dm(s.end))}</span></div>
                    {v.progress && <><span className="meter" style={{ width: '100%' }}><i style={{ width: `${v.progress.pupils ? (100 * v.progress.done) / v.progress.pupils : 0}%` }} /></span><span className="small muted">{t.done(v.progress.done, v.progress.pupils, parent)}</span></>}
                  </div>}
                  <div className="row small">{lessons.map((l) => <button key={l.id} className="link small" onClick={() => go(`/lesson/${l.id}`)}>📘 {l.title}</button>)}
                    {!lessons.length && s.status !== 'done' && <button className="link small" onClick={() => go(`/new?area=${a}&section=${s.sectionId}`)}>+ {t.make}</button>}</div>
                </div>
              ); })}</div>}
            </div>
          ); })}
          <div className="row"><span className="small muted grow">{msg}</span><button className="btn primary" disabled={!changed} onClick={save}>{t.save}</button></div>
        </div>
        <aside className="card stack" style={{ gap: 8 }}>
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

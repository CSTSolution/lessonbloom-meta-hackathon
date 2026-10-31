// One learner (Chi's "Chi tiết người học + Thẻ tư vấn"): where she is on the path, three advice cards
// (Luyện thêm · Bước tiếp · Thời gian bài) each with "Vì sao?", Áp dụng and Giữ nguyên (and Hoàn tác),
// then her skills, recent sessions and the reminders sent. Advice is worked out by code from her own
// results only; "Áp dụng" changes things for her alone.
import { useEffect, useState } from 'react';
import { api, ApiError, type Advice, type LearnerView } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';
import { NotFound } from './NotFound.tsx';

const T = {
  vi: {
    back: '‹ Tóm tắt học tập', path: 'Xem lộ trình', now: 'Đang học', weeks: (w: number, s: string, e: string, i: number) => `${w} tuần · ${s} – ${e} · đang ở tuần ${i}`, video: 'Đã xem video', slides: 'Đã xem slide', noVideo: 'Chưa xem bài', left: (n: number) => `còn ${n} câu bài tập`, ends: (d: string) => `Hết thời gian bài: ${d}`,
    advice: (n: string) => `Tư vấn cho ${n}`, adviceSub: 'Theo tiêu chí của cô · AI chỉ viết câu', kinds: { practice: 'Luyện thêm', next: 'Bước tiếp', time: 'Thời gian bài' }, why: '› Vì sao?', apply: 'Áp dụng', keep: 'Giữ nguyên', undo: 'Hoàn tác', applied: '✓ Đã áp dụng', kept: 'Đã giữ nguyên', lock: 'Lịch chỉ đổi khi cô bấm Áp dụng.', none: 'Chưa có tư vấn: cần thêm kết quả làm bài.',
    bySkill: 'Theo dạng bài', bySkillSub: (s: number, p: number, r: number) => `${s} đã vững · ${p} đang luyện · ${r} lỗi lặp lại`, sessions: 'Các buổi gần đây', sessionsSub: (n: number, d: string, m: number) => `${n} buổi${d ? ` · gần nhất ${d}, ${m} phút` : ''}`, sent: 'Lời nhắc đã gửi', sentSub: (n: number) => `${n} lời nhắc`,
    labels: { solid: 'Đã vững', practising: 'Đang luyện', repeat: 'Lỗi lặp lại' }, recent: (r: number, o: number) => `${r}/${o} câu gần nhất đúng`, answers: (n: number) => `${n} câu`, min: (n: number) => `${n} phút`, added: (n: number) => `Đã thêm ${n} câu cho riêng em.`,
  },
  en: {
    back: '‹ Learning summary', path: 'See the path', now: 'Learning', weeks: (w: number, s: string, e: string, i: number) => `${w} week${w === 1 ? '' : 's'} · ${s} – ${e} · in week ${i}`, video: 'Watched the video', slides: 'Saw the slides', noVideo: 'Not watched yet', left: (n: number) => `${pl(n, 'item')} to go`, ends: (d: string) => `Ends: ${d}`,
    advice: (n: string) => `Advice for ${n}`, adviceSub: 'From your criteria · the AI only words it', kinds: { practice: 'More practice', next: 'Next step', time: 'Lesson time' }, why: '› Why?', apply: 'Apply', keep: 'Keep as is', undo: 'Undo', applied: '✓ Applied', kept: 'Kept as is', lock: 'The plan only changes when you press Apply.', none: 'No advice yet: more answers are needed.',
    bySkill: 'By skill', bySkillSub: (s: number, p: number, r: number) => `${s} mastered · ${p} practising · ${r} repeated mistake`, sessions: 'Recent sessions', sessionsSub: (n: number, d: string, m: number) => `${pl(n, 'session')}${d ? ` · last ${d}, ${m} min` : ''}`, sent: 'Reminders sent', sentSub: (n: number) => `${pl(n, 'reminder')}`,
    labels: { solid: 'Mastered', practising: 'Practising', repeat: 'Repeated mistake' }, recent: (r: number, o: number) => `${r}/${o} recent answers right`, answers: (n: number) => `${pl(n, 'answer')}`, min: (n: number) => `${n} min`, added: (n: number) => `Added ${pl(n, 'item')} for this learner only.`,
  },
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function Learner({ id, parent }: { id: string; parent: boolean }) {
  const t = useT(T), lang = useLang();
  const [v, setV] = useState<LearnerView | null>(null), [why, setWhy] = useState(''), [open, setOpen] = useState(''), [busy, setBusy] = useState(''), [msg, setMsg] = useState('');
  const [gone, setGone] = useState(false);
  const load = () => api.learner(id, lang).then(setV).catch((e) => { setV(null); if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setGone(true); });
  useEffect(() => { setV(null); void load(); setMsg(''); }, [id, lang]);
  // the advice is worded by Muse Spark in the background; ask again until it is there (at most 5 times)
  const [tries, setTries] = useState(0);
  useEffect(() => { if (!v?.wording || tries >= 5) return; const h = setTimeout(() => { setTries((n) => n + 1); void load(); }, 3000); return () => clearTimeout(h); }, [v, tries]);
  if (gone) return <NotFound what="learner" />;
  if (!v) return <div className="page narrow"><p className="muted" role="status" style={{ marginTop: 24 }}>{lang === 'vi' ? 'Đang tải…' : 'Loading…'}</p></div>;
  const act = async (a: Advice, action: 'apply' | 'keep' | 'undo') => {
    setBusy(a.kind + action); setMsg('');
    try { const r = await api.advice(v.pupil.id, { kind: a.kind, skill: a.skill, action, adviceId: a.applied ?? undefined }); if (r.added) setMsg(t.added(r.added)); await load(); }
    catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); }
  };
  const i = v.mates.findIndex((m) => m.id === v.pupil.id), c = v.current;
  const count = (l: string) => v.skills.filter((s) => s.label === l).length;
  const fold = (key: string, title: string, sub: string, body: React.ReactNode) => (
    <div className={`group card ${open === key ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === key ? '' : key)}><span className="caret">{open === key ? '▾' : '▸'}</span><span className="grow"><b className="small">{title}</b><span className="small muted" style={{ display: 'block' }}>{sub}</span></span></button>{open === key && <div style={{ paddingTop: 8 }}>{body}</div>}</div>
  );
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="row" style={{ marginBottom: 10 }}><button className="link small grow" style={{ textAlign: 'left' }} onClick={() => go('/insight')}>{t.back}</button>
        {v.mates.length > 1 && <div className="row card" style={{ padding: 4, gap: 4 }}>
          <button className="btn ghost small" disabled={i <= 0} onClick={() => go(`/learner/${v.mates[i - 1].id}`)}>‹</button>
          {v.mates.slice(Math.max(0, i - 1), i + 2).map((m) => <button key={m.id} className={`btn small ${m.id === v.pupil.id ? 'primary' : 'ghost'}`} onClick={() => go(`/learner/${m.id}`)}>{m.name}</button>)}
          <button className="btn ghost small" disabled={i >= v.mates.length - 1} onClick={() => go(`/learner/${v.mates[i + 1].id}`)}>›</button></div>}
      </div>
      <div className="card row" style={{ alignItems: 'flex-start' }}>
        <span className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{v.pupil.name.slice(0, 1).toUpperCase()}</span>
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="row"><h2>{v.pupil.name}</h2>{!parent && <span className="tag ai">{v.pupil.className}</span>}</div>
          {c ? <><span className="small">{t.now}: <b>{c.title}</b> · {lang === 'en' ? 'p.' : 'tr.'} {c.pages}</span>
            <span className="small muted">{t.weeks(c.weeks, dm(c.start), dm(c.end), c.week)} · {c.videoSeen ? '✓ ' + t.video : c.slidesSeen ? '✓ ' + t.slides : t.noVideo} · {t.left(c.itemsLeft)} · ⚑ {t.ends(dm(c.end))}</span></> : null}
        </div>
        <button className="btn small" onClick={() => go('/path')}>{t.path}</button>
      </div>
      <div className="row" style={{ margin: '16px 0 8px' }}><b>{t.advice(v.pupil.name)}</b><span className="small muted">{t.adviceSub}</span></div>
      {v.advice.length ? <div className="adv-grid">{v.advice.map((a) => (
        <div key={a.kind} className={`card adv ${a.kind} stack`} style={{ gap: 6 }}>
          <span className={`tag ${a.kind === 'next' ? 'solid' : a.kind === 'time' ? 'ai' : 'repeat'}`} style={{ alignSelf: 'start' }}>{t.kinds[a.kind]}</span>
          <b className="small">{a.text}</b>
          {why === a.kind && <p className="small muted">{a.why}</p>}
          <div className="row"><button className="link small grow" style={{ textAlign: 'left' }} onClick={() => setWhy(why === a.kind ? '' : a.kind)}>{t.why}</button>
            {a.applied ? <><span className="small ok-text">{t.applied}</span><button className="btn small" disabled={!!busy} onClick={() => act(a, 'undo')}>{t.undo}</button></>
              : a.kept ? <span className="small muted">{t.kept}</span>
              : <><button className="btn primary small" disabled={!!busy} onClick={() => act(a, 'apply')}>{busy === a.kind + 'apply' ? '…' : t.apply}</button><button className="btn small" disabled={!!busy} onClick={() => act(a, 'keep')}>{t.keep}</button></>}
          </div>
        </div>
      ))}</div> : <p className="small muted">{t.none}</p>}
      <p className="small muted" style={{ margin: '6px 0 14px' }}>{t.lock}</p>
      {msg && <p className="banner small" style={{ marginBottom: 10 }}>{msg}</p>}
      <div className="stack">
        {fold('skills', t.bySkill, t.bySkillSub(count('solid'), count('practising'), count('repeat')), <div className="stack" style={{ gap: 6 }}>{v.skills.map((s) => <div key={s.skill} className="list-row small"><span className="grow"><b>{s.name}</b>{s.mistake && s.label !== 'solid' ? ` · ${s.mistake}` : ''}</span><span className="muted">{t.recent(s.right, s.of)}</span><span className={`tag ${s.label}`}>{t.labels[s.label]}</span></div>)}</div>)}
        {fold('sessions', t.sessions, t.sessionsSub(v.sessions.length, v.sessions[0] ? dm(v.sessions[0].day) : '', v.sessions[0]?.minutes ?? 0), <div className="stack" style={{ gap: 4 }}>{v.sessions.map((s) => <div key={s.day} className="list-row small"><span className="grow">{dm(s.day)}</span><span className="muted">{t.answers(s.answers)} · {t.min(s.minutes)}</span></div>)}</div>)}
        {fold('sent', t.sent, t.sentSub(v.reminders.length), <div className="stack" style={{ gap: 4 }}>{v.reminders.map((r, j) => <div key={j} className="list-row small"><span className="tag ai">{dm(r.date)}</span><span className="grow">{lang === 'en' ? r.en : r.vi}</span></div>)}</div>)}
      </div>
    </div>
  );
}

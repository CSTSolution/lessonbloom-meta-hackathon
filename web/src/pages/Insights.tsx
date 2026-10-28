// "Tóm tắt học tập" (Chi's design) and its criteria. A teacher: five folding parts (overview of the
// classes, one class in detail, repeated mistakes, mastered + next, suggested comments); a parent: the
// same per child. Labels are worked out by code from the criteria; only the comments are written by AI.
// Supports regular assessment under Circular 27/2020: no marks, no comparing pupils.
import { useEffect, useState } from 'react';
import { api, ApiError, type Criteria as Crit, type Label, type LessonRow, type Summary } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Tóm tắt học tập', advice: 'Tư vấn riêng cho từng em', adviceSub: (n: number) => `${n} em có kết quả để tư vấn.`, seeEach: 'Xem chi tiết từng em ›', lesson: 'Bài học', allLessons: 'Tất cả bài', cls: 'Lớp', child: 'Con',
    tt27: 'Hỗ trợ đánh giá thường xuyên theo Thông tư 27/2020/TT-BGDĐT: nhận xét, không chấm điểm, không so sánh học sinh. Mức Hoàn thành tốt / Hoàn thành / Chưa hoàn thành vẫn do cô quyết định; LessonBloom không dùng cho kiểm tra, đánh giá định kỳ.',
    grid: 'Xem bảng dạng bài × lớp', clsRepeat: (n: number) => `${n} dạng bài cả lớp lặp lỗi`, kidsRepeat: (n: number) => `${n} lượt em lặp lỗi`,
    overview: 'Tổng quan các lớp', overviewP: 'Tổng quan các con', ratio: 'Tỉ lệ dạng bài · tất cả các lớp', byClass: 'Theo từng lớp', byChild: 'Theo từng con', detail: 'Xem chi tiết ›', labels: { solid: 'Đã vững', practising: 'Đang luyện', repeat: 'Lỗi lặp lại' },
    legend: 'Lỗi lặp lại: cần luyện thêm cùng dạng · Đang luyện: chưa đủ lượt làm để kết luận · Đã vững: có thể chuyển bài nâng cao', edit: 'Chỉnh tiêu chí ›', count: (n: number) => `${n} lượt dạng bài`,
    one: (n: string) => `Chi tiết lớp · ${n}`, oneP: (n: string) => `Chi tiết · ${n}`, mist: (n: string) => `Dạng lỗi đang lặp lại · ${n}`, solid: (n: string) => `Đã vững và buổi sau · ${n}`, comments: (n: string) => `Gợi ý lời nhận xét · ${n}`,
    write: 'Viết gợi ý nhận xét', writing: 'Đang viết…', copy: 'Chép', none: 'Chưa có kết quả. Khi các em làm bài tập, tóm tắt hiện ở đây.', pupils: (n: number) => `${n} em`, next: 'Có thể làm thêm bài nâng cao hoặc sang bài tiếp trong lộ trình.', noMist: 'Không có dạng lỗi lặp lại.', aiNote: 'AI chỉ viết câu từ các nhãn; tên các em không gửi cho AI.',
  },
  en: {
    title: 'Learning summary', advice: 'Advice for each learner', adviceSub: (n: number) => `${n} learners have results to advise on.`, seeEach: 'See each learner ›', lesson: 'Lesson', allLessons: 'All lessons', cls: 'Class', child: 'Child',
    tt27: 'Supports regular assessment under Circular 27/2020: comments, no marks, no comparing pupils. Final levels stay the teacher\'s decision; LessonBloom is not used for tests or end-of-term assessment.',
    grid: 'Skills × classes table', clsRepeat: (n: number) => `${n} class skill${n === 1 ? '' : 's'} with a repeated mistake`, kidsRepeat: (n: number) => `${n} learner${n === 1 ? '' : 's'} repeating it`,
    overview: 'All classes', overviewP: 'All children', ratio: 'Skills · all classes', byClass: 'By class', byChild: 'By child', detail: 'Details ›', labels: { solid: 'Mastered', practising: 'Practising', repeat: 'Repeated mistake' },
    legend: 'Repeated mistake: practise more of the same · Practising: not enough answers yet · Mastered: ready for harder items', edit: 'Edit criteria ›', count: (n: number) => `${n} class skills`,
    one: (n: string) => `Class detail · ${n}`, oneP: (n: string) => `Detail · ${n}`, mist: (n: string) => `Repeated mistakes · ${n}`, solid: (n: string) => `Mastered and next · ${n}`, comments: (n: string) => `Suggested comments · ${n}`,
    write: 'Write suggested comments', writing: 'Writing…', copy: 'Copy', none: 'No results yet. When learners practise, the summary shows here.', pupils: (n: number) => `${n} learners`, next: 'Ready for harder items or the next lesson on the path.', noMist: 'No repeated mistakes.', aiNote: "The AI only words the labels; learners' names are never sent to it.",
  },
};
type Dict = (typeof T)['vi'];
const COLOR: Record<Label, string> = { solid: 'var(--ok)', practising: '#b8c1d1', repeat: 'var(--sun)' };

function Donut({ v }: { v: Record<Label, number> }) {
  const total = v.solid + v.practising + v.repeat || 1, r = 15.9, c = 2 * Math.PI * r;
  let at = 0;
  return (
    <svg viewBox="0 0 42 42" className="donut" aria-hidden><circle cx="21" cy="21" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      {(['solid', 'practising', 'repeat'] as Label[]).map((k) => { const len = (v[k] / total) * c, el = <circle key={k} cx="21" cy="21" r={r} fill="none" stroke={COLOR[k]} strokeWidth="6" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-at} transform="rotate(-90 21 21)" />; at += len; return el; })}
      <text x="21" y="22" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">{v.solid + v.practising + v.repeat}</text></svg>
  );
}

export function Insights({ parent }: { parent: boolean }) {
  const t = useT(T), lang = useLang();
  const q = new URLSearchParams(location.search);
  const [s, setS] = useState<Summary | null>(null), [lessons, setLessons] = useState<LessonRow[]>([]), [lessonId, setLessonId] = useState(q.get('lesson') || ''), [k, setK] = useState(q.get('class') || ''), [open, setOpen] = useState(q.get('class') ? 'one' : 'overview');
  const [comments, setComments] = useState<{ pupilId: string; name: string; text: string }[] | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => { api.lessons().then((r) => setLessons(r.lessons.filter((l) => l.given))).catch(() => {}); }, []);
  useEffect(() => { api.summary(lessonId ? { lessonId } : {}).then((x) => { setS(x); setK((p) => p || x.classes[0]?.id || ''); }).catch(() => setS(null)); setComments(null); }, [lessonId]);
  if (!s) return null;
  const cls = s.classes.find((x) => x.id === k), pct = (n: number) => `${Math.round((100 * n) / Math.max(1, s.total.solid + s.total.practising + s.total.repeat))}%`;
  const section = (id: string, title: string, sub: string, badge: React.ReactNode, body: React.ReactNode) => (
    <div className={`group card ${open === id ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === id ? '' : id)}><span className="caret">{open === id ? '▾' : '▸'}</span><span className="grow"><b className="small">{title}</b><span className="small muted" style={{ display: 'block' }}>{sub}</span></span>{badge}</button>{open === id && <div style={{ paddingTop: 10 }}>{body}</div>}</div>
  );
  const firstPupil = s.classes.flatMap((x) => x.pupils.filter((p) => Object.keys(p.skills).length))[0];
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <h1>{t.title}</h1>
      <div className="banner blue row" style={{ margin: '10px 0' }}><span className="grow"><b>{t.advice}</b><br /><span className="small">{t.adviceSub(s.learners)}</span></span>{firstPupil && <button className="btn primary small" onClick={() => go(`/learner/${firstPupil.id}`)}>{t.seeEach}</button>}</div>
      <div className="card row" style={{ marginBottom: 10 }}>
        <label className="small">{t.lesson} <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}><option value="">{t.allLessons}</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.setup.title}</option>)}</select></label>
        <span className="small">{parent ? t.child : t.cls}</span>{s.classes.map((x) => <button key={x.id} className={`pill ${k === x.id ? 'on' : ''}`} onClick={() => setK(x.id)}>{x.name}</button>)}
      </div>
      {!parent && <p className="banner blue small" style={{ marginBottom: 10 }}>ⓘ {t.tt27}</p>}
      {!s.classes.some((x) => x.skills.length) ? <div className="card"><p className="muted">{t.none}</p></div> : <div className="stack">
        {section('overview', parent ? t.overviewP : t.overview, t.count(s.total.solid + s.total.practising + s.total.repeat), s.total.repeat ? <span className="tag repeat">{t.clsRepeat(s.total.repeat)}</span> : null, <>
          <div className="grid2">
            <div className="card row"><Donut v={s.total} /><div className="stack" style={{ gap: 4 }}>{(['solid', 'practising', 'repeat'] as Label[]).map((l) => <span key={l} className="small"><b style={{ color: COLOR[l] }}>●</b> {t.labels[l]} · {s.total[l]} · {pct(s.total[l])}</span>)}</div></div>
            <div className="card stack" style={{ gap: 6 }}><b className="small">{parent ? t.byChild : t.byClass}</b>{s.classes.map((x) => { const c = x.skills.reduce((a, sk) => ({ solid: a.solid + (sk.label === 'solid' ? 1 : 0), practising: a.practising + (sk.label === 'practising' ? 1 : 0), repeat: a.repeat + (sk.label === 'repeat' ? 1 : 0) }), { solid: 0, practising: 0, repeat: 0 }); const n = c.solid + c.practising + c.repeat || 1; return (
              <div key={x.id} className="row small"><b style={{ width: 40 }}>{x.name}</b><div className="hbar">{c.solid > 0 && <i className="s" style={{ width: `${(100 * c.solid) / n}%` }}>{c.solid}</i>}{c.practising > 0 && <i className="p" style={{ width: `${(100 * c.practising) / n}%` }}>{c.practising}</i>}{c.repeat > 0 && <i className="r" style={{ width: `${(100 * c.repeat) / n}%` }}>{c.repeat}</i>}</div><button className="btn small" onClick={() => { setK(x.id); setOpen('one'); }}>{t.detail}</button></div>
            ); })}</div>
          </div>
          <div className="row small" style={{ marginTop: 8 }}><span className="muted grow">{t.legend}</span><button className="link small" onClick={() => setOpen('grid')}>{t.grid}</button>{!parent && <button className="link small" onClick={() => go('/insight/criteria')}>{t.edit}</button>}</div>
        </>)}
        {open === 'grid' && <div className="card"><b className="small">{t.grid}</b><table className="tbl" style={{ marginTop: 6 }}><thead><tr><th />{s.classes.map((x) => <th key={x.id}>{x.name}</th>)}</tr></thead><tbody>
          {[...new Set(s.classes.flatMap((x) => x.skills.map((k) => k.name)))].map((name) => <tr key={name}><td>{name}</td>{s.classes.map((x) => { const k = x.skills.find((y) => y.name === name); return <td key={x.id}>{k ? <span className={`tag ${k.label}`}>{t.labels[k.label]}</span> : '·'}</td>; })}</tr>)}
        </tbody></table></div>}
        {cls && section('one', parent ? t.oneP(cls.name) : t.one(cls.name), cls.skills.map((x) => `${x.name}: ${t.labels[x.label]}`).join(' · '), null, (
          <table className="tbl"><thead><tr><th>{parent ? '' : t.pupils(cls.pupils.length)}</th>{cls.skills.map((x) => <th key={x.skill}>{x.name}</th>)}</tr></thead><tbody>
            {cls.pupils.map((p) => <tr key={p.id}><td><button className="link" onClick={() => go(`/learner/${p.id}`)}>{p.name}</button></td>{cls.skills.map((x) => <td key={x.skill}>{p.skills[x.skill] ? <span className={`tag ${p.skills[x.skill]}`}>{t.labels[p.skills[x.skill]]}</span> : '·'}</td>)}</tr>)}
          </tbody></table>
        ))}
        {cls && section('mist', t.mist(cls.name), cls.mistakes.length ? cls.mistakes.map((m) => m.what).join(' · ') : t.noMist, cls.mistakes.length ? <span className="tag repeat">{t.kidsRepeat(cls.mistakes.reduce((a, m) => a + m.pupils, 0))}</span> : null, (
          cls.mistakes.length ? <div className="stack" style={{ gap: 6 }}>{cls.mistakes.map((m, i) => <div key={i} className="list-row small"><span className="grow"><b>{m.what}</b> · {m.skill}</span><span className="muted">{t.pupils(m.pupils)}</span></div>)}</div> : <p className="small muted">{t.noMist}</p>
        ))}
        {cls && section('solid', t.solid(cls.name), cls.skills.filter((x) => x.label === 'solid').map((x) => x.name).join(' · ') || '—', <span className="tag ai">AI</span>, (
          <div className="stack small" style={{ gap: 6 }}>{cls.skills.filter((x) => x.label === 'solid').map((x) => <div key={x.skill} className="list-row"><span className="grow"><b>{x.name}</b> · {x.counts.solid}/{x.counts.solid + x.counts.practising + x.counts.repeat}</span></div>)}<p className="muted">{t.next}</p></div>
        ))}
        {cls && section('comments', t.comments(cls.name), t.pupils(cls.pupils.length), <span className="tag ai">AI</span>, (
          <div className="stack" style={{ gap: 6 }}>
            <p className="small muted">{t.aiNote}</p>
            {!comments && <button className="btn small" style={{ alignSelf: 'start' }} disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { setComments((await api.comments(cls.id)).comments); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); } }}>{busy ? t.writing : t.write}</button>}
            {comments?.map((c) => <div key={c.pupilId} className="list-row small"><span className="grow"><b>{c.name}:</b> {c.text}</span><button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(c.text)}>{t.copy}</button></div>)}
            {err && <p className="note">{err}</p>}
          </div>
        ))}
      </div>}
    </div>
  );
}

const C = {
  vi: {
    title: 'Tiêu chí tóm tắt học tập', lead: 'Ngưỡng gắn nhãn cho từng dạng bài.', reset: 'Khôi phục mặc định', save: 'Lưu tiêu chí', saved: 'Đã lưu.', def: 'Mặc định',
    one: 'Từng em · một dạng bài', oneSub: (c: Crit) => `${c.recent} câu gần nhất · tối thiểu ${c.min} · Đã vững ≥ ${c.solid}% · Lỗi lặp lại < ${c.repeat}% hoặc ${c.same} lần/${c.sessions} buổi`,
    rule: 'Quy tắc', value: 'Giá trị', recent: 'Xét trên số câu gần nhất', min: 'Chỉ gắn nhãn khi em đã làm ít nhất', solid: 'khi em đúng từ', repeat: 'khi em đúng dưới', same: 'hoặc cùng một kiểu sai xuất hiện từ', times: 'lần, trong ít nhất', sessions: 'buổi', practising: 'khi không rơi vào hai mức trên, hoặc chưa đủ số câu', rest: 'Các trường hợp còn lại', q: 'câu',
    cls: 'Cả lớp · một dạng bài', clsSub: (c: Crit) => `Lỗi lặp lại ≥ ${c.classRepeat}% số em · Đã vững ≥ ${c.classSolid}% số em`, clsRepeat: 'Lớp có Lỗi lặp lại khi từ', clsSolid: 'Lớp Đã vững khi từ', ofPupils: '% số em',
    nextT: 'Gợi ý bài tiếp theo', nextSub: (n: number) => `3 nhãn → 3 gợi ý · ${n}/3 đang bật`, sPractice: 'Luyện thêm cùng dạng', sTime: 'Thêm thời gian cho bài', sNext: 'Bài nâng cao hoặc bài tiếp', lbl: { solid: 'Đã vững', practising: 'Đang luyện', repeat: 'Lỗi lặp lại' },
    preview: 'Xem thử với tiêu chí hiện tại', right: (r: number, o: number) => `${r}/${o} câu đúng`, clsLevel: 'Mức của lớp', share: (r: number, o: number) => `${r}/${o} em đang lặp lỗi`,
    note: 'Mặc định 80 / 50 / 3 lần·2 buổi / 30% / 70%. Áp dụng cho mọi lớp cô dạy.', tt27: 'Hỗ trợ đánh giá thường xuyên theo Thông tư 27/2020/TT-BGDĐT: không chấm điểm, không so sánh học sinh, học sinh không thấy nhãn.',
  },
  en: {
    title: 'Summary criteria', lead: 'Thresholds for the labels on each skill.', reset: 'Back to defaults', save: 'Save criteria', saved: 'Saved.', def: 'Default',
    one: 'One learner · one skill', oneSub: (c: Crit) => `last ${c.recent} answers · at least ${c.min} · Mastered ≥ ${c.solid}% · Repeated mistake < ${c.repeat}% or ${c.same} times in ${c.sessions} sessions`,
    rule: 'Rule', value: 'Value', recent: 'Look at the most recent answers', min: 'Label only after at least', solid: 'when at least this many are right', repeat: 'when fewer than this are right', same: 'or the same kind of mistake at least', times: 'times, within', sessions: 'sessions', practising: 'when neither of the above, or not enough answers', rest: 'Everything else', q: 'answers',
    cls: 'The class · one skill', clsSub: (c: Crit) => `Repeated mistake ≥ ${c.classRepeat}% of learners · Mastered ≥ ${c.classSolid}%`, clsRepeat: 'The class has a repeated mistake from', clsSolid: 'The class has mastered it from', ofPupils: '% of learners',
    nextT: 'Suggesting what next', nextSub: (n: number) => `3 labels → 3 suggestions · ${n}/3 on`, sPractice: 'More practice of the same kind', sTime: 'More time for the lesson', sNext: 'Harder items or the next lesson', lbl: { solid: 'Mastered', practising: 'Practising', repeat: 'Repeated mistake' },
    preview: 'Try it with these criteria', right: (r: number, o: number) => `${r}/${o} right`, clsLevel: 'Class level', share: (r: number, o: number) => `${r}/${o} learners with a repeated mistake`,
    note: 'Defaults 80 / 50 / 3 times in 2 sessions / 30% / 70%. Applies to all your classes.', tt27: 'Supports regular assessment under Circular 27/2020: no marks, no comparing learners; learners never see labels.',
  },
};
const DEF: Crit = { recent: 10, min: 5, solid: 80, repeat: 50, same: 3, sessions: 2, classRepeat: 30, classSolid: 70, practice: true, time: true, next: true };
type NumKey = 'recent' | 'min' | 'solid' | 'repeat' | 'same' | 'sessions' | 'classRepeat' | 'classSolid';

export function Criteria() {
  const t = useT(C), [c, setC] = useState<Crit | null>(null), [msg, setMsg] = useState(''), [open, setOpen] = useState('one');
  const [prev, setPrev] = useState<Awaited<ReturnType<typeof api.previewCriteria>> | null>(null);
  useEffect(() => { api.criteria().then((r) => setC(r.criteria)).catch(() => setC(DEF)); }, []);
  // try the thresholds on her own class, as she changes them (Chi: "Xem thử với tiêu chí hiện tại")
  useEffect(() => { if (!c) return; const id = setTimeout(() => api.previewCriteria(c).then(setPrev).catch(() => {}), 300); return () => clearTimeout(id); }, [c]);
  if (!c) return null;
  const num = (k: NumKey, unit: string) => <span className="row" style={{ gap: 4 }}><input type="number" value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} style={{ width: 64 }} /> <span className="small muted">{unit}</span></span>;
  const isDef = (keys: (keyof Crit)[]) => keys.every((k) => c[k] === DEF[k]);
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row"><div className="grow"><h1>{t.title}</h1><p className="small muted">{t.lead}</p></div><button className="btn" onClick={() => setC(DEF)}>{t.reset}</button><button className="btn primary" onClick={async () => { setC((await api.saveCriteria(c)).criteria); setMsg(t.saved); }}>{t.save}</button></div>
      {msg && <p className="banner small" style={{ marginTop: 8 }}>{msg}</p>}
      <div className="cols" style={{ marginTop: 12 }}>
        <div className="stack">
        <div className={`group card ${open === 'one' ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === 'one' ? '' : 'one')}><span className="caret">{open === 'one' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.one}</b><span className="small muted" style={{ display: 'block' }}>{t.oneSub(c)}</span></span>{isDef(['recent', 'min', 'solid', 'repeat', 'same', 'sessions']) && <span className="tag">{t.def}</span>}</button>
          {open === 'one' && <table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>{t.rule}</th><th>{t.value}</th></tr></thead><tbody>
            <tr><td>{t.recent}</td><td>{num('recent', t.q)}</td></tr><tr><td>{t.min}</td><td>{num('min', t.q)}</td></tr>
            <tr><td><span className="tag solid">{t.lbl.solid}</span> {t.solid}</td><td>{num('solid', '%')}</td></tr>
            <tr><td><span className="tag repeat">{t.lbl.repeat}</span> {t.repeat}</td><td>{num('repeat', '%')}</td></tr>
            <tr><td><span className="tag repeat">{t.lbl.repeat}</span> {t.same} {num('same', t.times)}</td><td>{num('sessions', t.sessions)}</td></tr>
            <tr><td><span className="tag practising">{t.lbl.practising}</span> {t.practising}</td><td className="small muted">{t.rest}</td></tr>
          </tbody></table>}</div>
        <div className={`group card ${open === 'cls' ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === 'cls' ? '' : 'cls')}><span className="caret">{open === 'cls' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.cls}</b><span className="small muted" style={{ display: 'block' }}>{t.clsSub(c)}</span></span>{isDef(['classRepeat', 'classSolid']) && <span className="tag">{t.def}</span>}</button>
          {open === 'cls' && <table className="tbl" style={{ marginTop: 8 }}><tbody><tr><td>{t.clsRepeat}</td><td>{num('classRepeat', t.ofPupils)}</td></tr><tr><td>{t.clsSolid}</td><td>{num('classSolid', t.ofPupils)}</td></tr></tbody></table>}</div>
        <div className={`group card ${open === 'next' ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === 'next' ? '' : 'next')}><span className="caret">{open === 'next' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.nextT}</b><span className="small muted" style={{ display: 'block' }}>{t.nextSub(+c.practice + +c.time + +c.next)}</span></span>{c.practice && c.time && c.next && <span className="tag">{t.def}</span>}</button>
          {open === 'next' && <table className="tbl" style={{ marginTop: 8 }}><tbody>{([['practice', 'repeat', t.sPractice], ['time', 'practising', t.sTime], ['next', 'solid', t.sNext]] as const).map(([k, l, txt]) => (
            <tr key={k}><td><span className={`tag ${l}`}>{t.lbl[l]}</span> → {txt}</td><td><button className={`switch ${c[k] ? 'on' : ''}`} aria-pressed={c[k]} onClick={() => setC({ ...c, [k]: !c[k] })} /></td></tr>
          ))}</tbody></table>}</div>
        </div>
        <aside className="stack">
        {prev?.class && <div className="card stack" style={{ gap: 6, background: 'var(--leaf-2)' }}>
          <b className="small">{t.preview}</b><span className="small muted">{prev.class} · {prev.skill}</span>
          {prev.pupils!.map((p) => <div key={p.name} className="row small"><span className="grow">{p.name} · {t.right(p.right, p.of)}{p.mistake ? ` · ${p.mistake}` : ''}</span><span className={`tag ${p.label}`}>{t.lbl[p.label]}</span></div>)}
          <div className="row small"><b className="grow">{t.clsLevel}</b><span className={`tag ${prev.classLabel}`}>{t.lbl[prev.classLabel!]}</span></div>
          <span className="small muted">{t.share(prev.share!.repeat, prev.share!.of)}</span>
        </div>}
        <p className="small muted">{t.note}</p><p className="banner blue small">ⓘ {t.tt27}</p>
        </aside>
      </div>
    </div>
  );
}

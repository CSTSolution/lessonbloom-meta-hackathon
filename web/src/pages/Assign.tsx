// Step 6 "Giao bài": pick a class, see its link, QR and pupils, set the options, and tick
// "I have read and checked…" right above the button. The box is never ticked for her and is not
// remembered: every assigning asks again (Chi's appendix 1b). The server refuses it unticked too.
import { useEffect, useState } from 'react';
import { api, ApiError, type ClassRow, type ClassView, type LessonAssignment } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { copyText } from './Classes.tsx';

// a parent assigns to one child: the child's own link instead of the class code and the pupils' list
const P = {
  vi: { pick: 'Chọn con để giao bài', forClass: (n: string) => `Giao bài cho ${n}`, noClass: 'Cô chưa thêm con nào.', newClass: 'Tên gọi của con', make: 'Thêm con', link: 'Link riêng của con', linkSub: (_c: string) => 'Mở trên điện thoại hoặc máy tính bảng của con, không cần đăng nhập', done: (n: string) => `Đã giao cho ${n}. Con thấy bài ngay ở “Hôm nay con học gì”.`, progress: (d: number, _n: number) => (d ? 'Con đã làm xong' : 'Con chưa làm xong') },
  en: { pick: 'Choose a child', forClass: (n: string) => `Assign to ${n}`, noClass: 'No children added yet.', newClass: "Child's first name", make: 'Add child', link: "Your child's link", linkSub: (_c: string) => "Open it on your child's phone or tablet, no sign-in", done: (n: string) => `Assigned to ${n}. They see it straight away under “Today”.`, progress: (d: number, _n: number) => (d ? 'Finished' : 'Not finished yet') },
};

const T = {
  vi: {
    pick: 'Chọn lớp để giao bài', forClass: (n: string) => `Giao bài cho lớp ${n}`, noClass: 'Cô chưa có lớp. Tạo lớp trong mục Lớp học trước nhé.', newClass: 'Tên lớp mới, ví dụ 2A', make: 'Tạo lớp',
    link: 'Đường dẫn cho học sinh', linkSub: (c: string) => `Link và mã QR · mã lớp ${c}`, copy: 'Chép link', copied: 'Đã chép',
    opts: 'Tuỳ chọn', due: 'Hạn làm bài', retry: 'Làm lại không giới hạn', hints: 'Gợi ý khi làm sai', optsSub: (d: string, r: boolean, h: boolean) => `${d || 'Không hạn'} · ${r ? 'làm lại không giới hạn' : 'mỗi câu một lần'} · ${h ? 'có gợi ý' : 'không gợi ý'}`,
    kids: (n: string) => `Học sinh lớp ${n}`, kidsSub: (j: number, n: number, c: string) => `${j}/${n} đã vào học · mã lớp ${c}`, none: 'Lớp chưa có học sinh: cô thêm tên gọi trong mục Lớp học.',
    parents: 'Gửi cho phụ huynh', parentsSub: 'Link riêng cho từng em, không cần đăng nhập', isNew: 'Mới',
    confirm: 'Tôi đã đọc và kiểm tra slide, bài tập AI soạn trước khi giao bài.', confirmSub: 'Tick lại mỗi lần giao bài.', go: 'Giao bài', tickFirst: 'Tick ô xác nhận ở trên để giao bài.',
    done: (n: string) => `Đã giao cho lớp ${n}. Học sinh thấy bài ngay ở “Hôm nay con học gì”.`, earlier: 'Đã giao', progress: (d: number, n: number) => `${d}/${n} em làm xong`,
  },
  en: {
    pick: 'Choose a class', forClass: (n: string) => `Assign to ${n}`, noClass: 'No classes yet. Create one under Classes first.', newClass: 'New class name, e.g. 2A', make: 'Create class',
    link: 'Link for pupils', linkSub: (c: string) => `Link and QR code · class code ${c}`, copy: 'Copy link', copied: 'Copied',
    opts: 'Options', due: 'Due date', retry: 'Unlimited retries', hints: 'Hints after a wrong answer', optsSub: (d: string, r: boolean, h: boolean) => `${d || 'No due date'} · ${r ? 'unlimited retries' : 'one try per item'} · ${h ? 'hints' : 'no hints'}`,
    kids: (n: string) => `Pupils of ${n}`, kidsSub: (j: number, n: number, c: string) => `${j}/${n} joined · class code ${c}`, none: 'No pupils yet: add their first names under Classes.',
    parents: 'Send to parents', parentsSub: 'A private link for each child, no sign-in', isNew: 'New',
    confirm: 'I have read and checked the AI-generated slides and exercises before assigning them.', confirmSub: 'Tick again every time you assign.', go: 'Assign', tickFirst: 'Tick the box above to assign.',
    done: (n: string) => `Assigned to ${n}. Pupils see it straight away under “Today”.`, earlier: 'Assigned', progress: (d: number, n: number) => `${d}/${n} pupils finished`,
  },
};

export function Assign({ lessonId, parent = false }: { lessonId: string; parent?: boolean }) {
  const t0 = useT(T), lang = useLang(), t = parent ? { ...t0, ...P[lang] } : t0;
  const [classes, setClasses] = useState<ClassRow[] | null>(null), [pick, setPick] = useState(''), [view, setView] = useState<ClassView | null>(null);
  const [due, setDue] = useState(''), [retry, setRetry] = useState(true), [hints, setHints] = useState(true), [ticked, setTicked] = useState(false);
  const [open, setOpen] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(''), [name, setName] = useState('');
  const [earlier, setEarlier] = useState<LessonAssignment[]>([]);
  const loadClasses = () => api.classes().then((r) => { setClasses(r.classes); setPick((p) => p || r.classes[0]?.id || ''); }).catch(() => setClasses([]));
  useEffect(() => { void loadClasses(); api.lessonAssignments(lessonId).then((r) => setEarlier(r.assignments)).catch(() => {}); }, [lessonId]);
  useEffect(() => { setView(null); setTicked(false); if (pick) api.classView(pick).then(setView).catch(() => {}); }, [pick]);
  if (!classes) return null;

  const err = (e: unknown) => setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e));
  if (!classes.length) return (
    <div className="card stack">
      <p>{t.noClass}</p>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); try { const r = await api.createClass(name); setName(''); await loadClasses(); setPick(r.class.id); } catch (x) { err(x); } }}>
        <input className="grow" maxLength={40} placeholder={t.newClass} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn primary" disabled={!name.trim()}>{t.make}</button>
      </form>
      {msg && <p className="note">{msg}</p>}
    </div>
  );
  const k = classes.find((c) => c.id === pick);
  const assign = async () => {
    if (!ticked || !k) return;
    setBusy(true); setMsg('');
    try {
      await api.assign(lessonId, { classId: k.id, confirmed: true, due: due || undefined, retry, hints });
      setMsg(t.done(k.name)); setTicked(false);
      setEarlier((await api.lessonAssignments(lessonId)).assignments);
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const copy = async (s: string, key: string) => { if (await copyText(s)) { setCopied(key); setTimeout(() => setCopied(''), 1500); } };
  return (
    <div className="stack assign" style={{ gap: 12, maxWidth: 640 }}>
      <div className="row"><span className="small muted">{t.pick}</span>{classes.map((c) => <button key={c.id} className={`pill ${c.id === pick ? 'on' : ''}`} onClick={() => setPick(c.id)}>{c.name}</button>)}</div>
      {k && view && <>
        <h2>{t.forClass(k.name)}</h2>
        {parent && view.pupils[0] ? <Group open={open} setOpen={setOpen} id="link" title={t.link} sub={t.linkSub('')}>
          <div className="row small"><span className="grow muted ellipsis">{view.pupils[0].url.replace(/^https?:\/\//, '')}</span><button className="btn ghost small" onClick={() => copy(view.pupils[0].url, 'url')}>{copied === 'url' ? t.copied : t.copy}</button></div>
        </Group> : <Group open={open} setOpen={setOpen} id="link" title={t.link} sub={t.linkSub(view.class.code)}>
          <div className="join-box"><img src={`/api/t/classes/${k.id}/qr.svg`} alt="QR" width={110} height={110} />
            <div className="stack" style={{ gap: 6 }}><b className="code">{view.class.code}</b><a className="small" href={view.class.url} target="_blank" rel="noreferrer">{view.class.url.replace(/^https?:\/\//, '')}</a>
              <button className="btn ghost small" onClick={() => copy(view.class.url, 'url')}>{copied === 'url' ? t.copied : t.copy}</button></div></div>
        </Group>}
        <Group open={open} setOpen={setOpen} id="opts" title={t.opts} sub={t.optsSub(due, retry, hints)}>
          <div className="stack" style={{ gap: 8 }}>
            <label className="field">{t.due}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={retry} onChange={(e) => setRetry(e.target.checked)} /> {t.retry}</label>
            <label className="check"><input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} /> {t.hints}</label>
          </div>
        </Group>
        {!parent && <><Group open={open} setOpen={setOpen} id="kids" title={t.kids(k.name)} sub={t.kidsSub(view.pupils.filter((p) => p.joined_at).length, view.pupils.length, view.class.code)}>
          {view.pupils.length ? <div className="kids">{view.pupils.map((p) => <div key={p.id} className="kid"><b>{p.name}</b><span className={`small ${p.joined_at ? 'ok-text' : 'muted'}`}>{p.joined_at ? '✓' : '·'}</span></div>)}</div> : <p className="small muted">{t.none}</p>}
        </Group>
        <Group open={open} setOpen={setOpen} id="parents" title={t.parents} sub={t.parentsSub} badge={t.isNew}>
          {view.pupils.length ? <div className="stack" style={{ gap: 6 }}>{view.pupils.map((p) => (
            <div key={p.id} className="row small"><b style={{ minWidth: 90 }}>{p.name}</b><span className="grow muted ellipsis">{p.url.replace(/^https?:\/\//, '')}</span><button className="btn ghost small" onClick={() => copy(p.url, p.id)}>{copied === p.id ? t.copied : t.copy}</button></div>
          ))}</div> : <p className="small muted">{t.none}</p>}
        </Group></>}
        <label className={`card confirm ${ticked ? 'on' : ''}`}>
          <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
          <span><b>{t.confirm}</b><span className="small muted" style={{ display: 'block' }}>{t.confirmSub}</span></span>
        </label>
        <button className="btn primary lg" disabled={!ticked || busy} onClick={assign}>{t.go}</button>
        {!ticked && <p className="small muted" style={{ textAlign: 'center' }}>{t.tickFirst}</p>}
      </>}
      {msg && <p className="note ok" role="status">{msg}</p>}
      {!!earlier.length && <div className="stack small" style={{ gap: 4 }}><b>{t.earlier}</b>{earlier.map((a) => <span key={a.id} className="muted">{a.class_name} · {new Date(a.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN')} · {t.progress(a.done, a.pupils)}</span>)}</div>}
    </div>
  );
}

// one collapsible part of the step (outside the component, so typing inside it keeps focus)
function Group({ id, title, sub, badge, children, open, setOpen }: { id: string; title: string; sub: string; badge?: string; children: React.ReactNode; open: string; setOpen: (s: string) => void }) {
  return (
    <div className={`group card ${open === id ? 'on' : ''}`}>
      <button className="group-head" onClick={() => setOpen(open === id ? '' : id)} aria-expanded={open === id}>
        <span className="caret">{open === id ? '▾' : '▸'}</span><span className="grow"><b>{title}</b><span className="small muted"> · {sub}</span></span>{badge && <span className="chip warn">{badge}</span>}
      </button>
      {open === id && <div style={{ paddingTop: 10 }}>{children}</div>}
    </div>
  );
}

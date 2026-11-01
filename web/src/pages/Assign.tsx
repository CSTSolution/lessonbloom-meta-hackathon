// Step 6 "Giao bài": pick a class, see its link, QR and pupils, set the options, and tick
// "I have read and checked…" right above the button. The box is never ticked for her and is not
// remembered: every assigning asks again (Chi's appendix 1b). The server refuses it unticked too.
import { useEffect, useState } from 'react';
import { api, ApiError, type ClassRow, type ClassView, type LessonAssignment } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';
import { copyText } from './Classes.tsx';

// a parent assigns to one child: the child's own link instead of the class code and the pupils' list
const P = {
  vi: { pick: 'Chọn con để giao bài', forClass: (n: string) => `Giao bài cho ${n}`, noClass: 'Cô chưa thêm con nào.', newClass: 'Tên gọi của con', make: 'Thêm con', link: 'Link riêng của con', linkSub: (_c: string) => 'Mở trên điện thoại hoặc máy tính bảng của con, không cần đăng nhập', done: (n: string) => `Đã giao cho ${n}`, doneSub: 'Con thấy bài ngay ở “Hôm nay con học gì”.', openLink: 'Mở link của con', copyLink: 'Chép link', progress: (d: number, _n: number) => (d ? 'Con đã làm xong' : 'Con chưa làm xong') },
  en: { pick: 'Choose a child', forClass: (n: string) => `Assign to ${n}`, noClass: 'No children added yet.', newClass: "Child's first name", make: 'Add child', link: "Your child's link", linkSub: (_c: string) => "Open it on your child's phone or tablet, no sign-in", done: (n: string) => `Assigned to ${n}`, doneSub: 'They see it straight away under “Today”.', openLink: "Open the child's link", copyLink: 'Copy link', progress: (d: number, _n: number) => (d ? 'Finished' : 'Not finished yet') },
};

const T = {
  vi: {
    pick: 'Chọn lớp để giao bài', forClass: (n: string) => `Giao bài cho lớp ${n}`, noClass: 'Cô chưa có lớp. Tạo lớp trong mục Lớp học trước nhé.', newClass: 'Tên lớp mới, ví dụ 2A', make: 'Tạo lớp',
    link: 'Đường dẫn cho học sinh', linkSub: (c: string) => `Link và mã QR · mã lớp ${c}`, copy: 'Chép link', copied: 'Đã chép',
    opts: 'Tuỳ chọn', due: 'Hạn làm bài', retry: 'Làm lại không giới hạn', hints: 'Gợi ý khi làm sai', optsSub: (d: string, r: boolean, h: boolean) => `${d || 'Không hạn'} · ${r ? 'làm lại không giới hạn' : 'mỗi câu một lần'} · ${h ? 'có gợi ý' : 'không gợi ý'}`,
    kids: (n: string) => `Học sinh lớp ${n}`, kidsSub: (j: number, n: number, c: string) => `${j}/${n} đã vào học · mã lớp ${c}`, none: 'Lớp chưa có học sinh: cô thêm tên gọi trong mục Lớp học.', noPupils: 'Lớp chưa có học sinh nên chưa ai thấy bài. Cô thêm tên gọi của các em ở Lớp học trước nhé.',
    parents: 'Gửi cho phụ huynh', parentsSub: 'Link riêng cho từng em, không cần đăng nhập', isNew: 'Mới',
    checkedN: (n: number, r: number, ai = 0) => `Đã kiểm tra ${n} câu bằng code · ${r} câu tạo lại${ai ? ` · AI rà soát bỏ ${ai} câu` : ''}`, confirm: 'Tôi đã đọc và kiểm tra slide, video và bài tập AI soạn trước khi giao bài.', confirmSub: 'Tick lại mỗi lần giao bài.', go: 'Giao bài', tickFirst: 'Tick ô xác nhận ở trên để giao bài.',
    done: (n: string) => `Đã giao cho lớp ${n}`, doneSub: 'Học sinh thấy bài ngay ở “Hôm nay con học gì”.', openLink: 'Mở link lớp', copyLink: 'Chép link lớp', codeIs: (c: string) => `Mã lớp ${c}`, path: 'Xem lộ trình học',
    already: (n: string, d: string) => `Bài này đã giao cho ${n} ngày ${d}.`, again: 'Vẫn giao lại', cancel: 'Huỷ',
    earlier: 'Đã giao', progress: (d: number, n: number) => `${d}/${n} em làm xong`,
  },
  en: {
    pick: 'Choose a class', forClass: (n: string) => `Assign to ${n}`, noClass: 'No classes yet. Create one under Classes first.', newClass: 'New class name, e.g. 2A', make: 'Create class',
    link: 'Link for pupils', linkSub: (c: string) => `Link and QR code · class code ${c}`, copy: 'Copy link', copied: 'Copied',
    opts: 'Options', due: 'Due date', retry: 'Unlimited retries', hints: 'Hints after a wrong answer', optsSub: (d: string, r: boolean, h: boolean) => `${d || 'No due date'} · ${r ? 'unlimited retries' : 'one try per item'} · ${h ? 'hints' : 'no hints'}`,
    kids: (n: string) => `Pupils of ${n}`, kidsSub: (j: number, n: number, c: string) => `${j}/${n} joined · class code ${c}`, none: 'No pupils yet: add their first names under Classes.', noPupils: 'This class has no pupils yet, so nobody will see the lesson. Add their first names under Classes first.',
    parents: 'Send to parents', parentsSub: 'A private link for each child, no sign-in', isNew: 'New',
    checkedN: (n: number, r: number, ai = 0) => `Code checked ${pl(n, 'item')} · ${r} written again${ai ? ` · ${ai} removed by the AI review` : ''}`, confirm: 'I have read and checked the AI-generated slides, video and exercises before assigning them.', confirmSub: 'Tick again every time you assign.', go: 'Assign', tickFirst: 'Tick the box above to assign.',
    done: (n: string) => `Assigned to ${n}`, doneSub: 'Pupils see it straight away under “Today”.', openLink: 'Open the class link', copyLink: 'Copy class link', codeIs: (c: string) => `Class code ${c}`, path: 'See the learning path',
    already: (n: string, d: string) => `This lesson was already assigned to ${n} on ${d}.`, again: 'Assign again', cancel: 'Cancel',
    earlier: 'Assigned', progress: (d: number, n: number) => `${d}/${pl(n, 'pupil')} finished`,
  },
};

// pupilId: the lesson was made from this child's work, so the child (or the pupil's class) is picked first
export function Assign({ lessonId, parent = false, checked, redone, removed, pupilId }: { lessonId: string; parent?: boolean; checked?: number; redone?: number; removed?: number; pupilId?: string }) {
  const t0 = useT(T), lang = useLang(), t = parent ? { ...t0, ...P[lang] } : t0;
  const [classes, setClasses] = useState<ClassRow[] | null>(null), [pick, setPick] = useState(''), [view, setView] = useState<ClassView | null>(null);
  const [due, setDue] = useState(''), [retry, setRetry] = useState(true), [hints, setHints] = useState(true), [ticked, setTicked] = useState(false);
  const [open, setOpen] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(''), [name, setName] = useState('');
  const [earlier, setEarlier] = useState<LessonAssignment[]>([]);
  // after Assign the button block becomes a success card (Chi #33); a repeat asks first (Chi #34)
  const [doneFor, setDoneFor] = useState(''), [dup, setDup] = useState<string | null>(null);
  const loadClasses = () => Promise.all([api.classes(), pupilId ? api.learners().catch(() => null) : null]).then(([r, ls]) => {
    const own = ls?.learners.find((x) => x.id === pupilId)?.class_id;   // Chi: the Assign step did not pick the child whose work it was
    setClasses(r.classes); setPick((p) => p || (own && r.classes.some((k) => k.id === own) ? own : r.classes[0]?.id) || '');
  }).catch(() => setClasses([]));
  useEffect(() => { void loadClasses(); api.lessonAssignments(lessonId).then((r) => setEarlier(r.assignments)).catch(() => {}); }, [lessonId]);
  useEffect(() => { setView(null); setTicked(false); setDoneFor(''); setDup(null); if (pick) api.classView(pick).then(setView).catch(() => {}); }, [pick]);
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
  const assign = async (again = false) => {
    if (!ticked || !k) return;
    setBusy(true); setMsg(''); setDup(null);
    try {
      await api.assign(lessonId, { classId: k.id, confirmed: true, due: due || undefined, retry, hints, again });
      setDoneFor(k.id); setTicked(false);
      setEarlier((await api.lessonAssignments(lessonId)).assignments);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'alreadyAssigned') setDup(String(e.body.at || ''));
      else err(e);
    } finally { setBusy(false); }
  };
  const date = (d: string) => new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
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
        {checked !== undefined && <div className="banner">✓ {t.checkedN(checked, redone ?? 0, removed ?? 0)}</div>}
        {doneFor === k.id ? <Done title={t.done(k.name)} sub={parent ? t.doneSub : `${t.doneSub} ${t.codeIs(view.class.code)}`}>
          {(() => { const url = parent ? view.pupils[0]?.url : view.class.url; return url && <>
            <a className="btn primary" href={url} target="_blank" rel="noreferrer">{t.openLink}</a>
            <button className="btn" onClick={() => copy(url, 'done')}>{copied === 'done' ? t.copied : t.copyLink}</button>
          </>; })()}
          <button className="btn" onClick={() => go('/path')}>{t.path}</button>
        </Done> : <>
          <label className={`card confirm ${ticked ? 'on' : ''}`}>
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            <span><b>{t.confirm}</b><span className="small muted" style={{ display: 'block' }}>{t.confirmSub}</span></span>
          </label>
          {!parent && view.pupils.length === 0 && <p className="banner warn small" role="alert">{t.noPupils}</p>}
          {dup !== null ? <div className="banner warn stack" role="alert" style={{ gap: 8, fontSize: 14 }}>
            <b>{t.already(k.name, dup ? date(dup) : '')}</b>
            <div className="row"><button className="btn primary" disabled={!ticked || busy} onClick={() => assign(true)}>{t.again}</button><button className="btn ghost" onClick={() => setDup(null)}>{t.cancel}</button></div>
          </div> : <button className="btn primary lg" disabled={!ticked || busy} onClick={() => assign()}>{t.go}</button>}
          {!ticked && <p className="small muted" style={{ textAlign: 'center' }}>{t.tickFirst}</p>}
        </>}
      </>}
      {msg && <p className="note" role="alert">{msg}</p>}
      {!!earlier.length && <div className="stack small" style={{ gap: 4 }}><b>{t.earlier}</b>{earlier.map((a) => <span key={a.id} className="muted">{a.class_name} · {new Date(a.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN')} · {t.progress(a.done, a.pupils)}</span>)}</div>}
    </div>
  );
}

// "Đã giao cho …": green, a large drawn check, what happens now and where to go next (Chi #33)
function Done({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card" role="status" style={{ background: 'var(--ok-2)', borderColor: 'var(--ok)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ flex: 'none', width: 52, height: 52, borderRadius: '50%', background: 'var(--ok)', display: 'grid', placeItems: 'center' }}>
        <span style={{ width: 14, height: 26, border: 'solid #fff', borderWidth: '0 5px 5px 0', transform: 'translateY(-3px) rotate(45deg)' }} />
      </span>
      <div className="stack grow" style={{ gap: 8 }}>
        <b style={{ fontSize: 20, color: 'var(--ok)' }}>{title}</b>
        <span>{sub}</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{children}</div>
      </div>
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

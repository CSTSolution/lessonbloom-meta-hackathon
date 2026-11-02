// "Lớp học": each class one row that opens: what it was given (with how many finished), its pupils
// (joined or not, each with a private link for parents), the class code and QR to print.
// Class names show exactly as typed (no "Lớp " in front).
import { useEffect, useState } from 'react';
import { api, ApiError, type ClassRow, type ClassView } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { ask } from '../ask.tsx';
import { go } from '../router.ts';
import { WorkPanel } from './WorkCard.tsx';

const T = {
  vi: {
    title: 'Lớp học của cô', lead: 'Học sinh vào học bằng mã lớp, chỉ lưu tên gọi.', add: '+ Thêm lớp', namePh: 'Tên lớp, ví dụ 2A', create: 'Tạo lớp', cancel: 'Huỷ',
    pupils: (n: number) => `${n} em`, given: (n: number) => `${n} bài đã giao`, notJoined: (n: number) => `${n} em chưa vào`, allIn: 'Cả lớp đã vào',
    assigned: 'Bài đã giao', none: 'Chưa giao bài nào. Mở một bài giảng và bấm “Giao bài”.', due: 'Hạn', doneOf: 'Đã làm', open: 'Mở bài',
    kids: 'Học sinh', joined: 'Đã vào học', waiting: 'Chưa vào', addKids: '+ Thêm học sinh', kidsPh: 'Mỗi dòng một tên gọi, ví dụ:\nAn\nBình', save: 'Thêm',
    code: 'Mã lớp', onlyNames: 'Chỉ lưu tên gọi.', link: 'Đường dẫn vào lớp', print: 'In mã lớp', copy: 'Chép', copied: 'Đã chép', parentLink: 'Link riêng cho phụ huynh', remove: 'Xoá', rename: 'Đổi tên', del: 'Xoá lớp', delAsk: 'Xoá lớp này cùng bài đã giao và kết quả của các em?',
    empty: 'Cô tạo lớp đầu tiên, rồi thêm tên gọi các em.', noDue: 'Không hạn',
    unassign: 'Bỏ giao', unassignAsk: (n: string) => `Bỏ bài này khỏi danh sách của lớp ${n}?\n\nBài giảng vẫn còn trong mục Bài giảng; kết quả các em đã làm vẫn có trong Tóm tắt.`, unassignStarted: (n: string, d: number, k: number) => `${n} đã bắt đầu làm bài này (${d}/${k} làm xong). Bỏ giao thì bài biến khỏi màn hình của các em và không làm tiếp được.\n\nNhững câu đã làm vẫn có trong Tóm tắt. Bỏ giao?`, hide: 'Ẩn khỏi danh sách', hideAsk: 'Ẩn bài đã xong này khỏi danh sách?\n\nKết quả vẫn có trong Tóm tắt; bài giảng vẫn ở mục Bài giảng.', givenOn: (d: string) => `Giao ngày ${d}`,
  },
  en: {
    title: 'Your classes', lead: 'Pupils join with the class code; only first names are kept.', add: '+ Add class', namePh: 'Class name, e.g. 2A', create: 'Create', cancel: 'Cancel',
    pupils: (n: number) => `${pl(n, 'pupil')}`, given: (n: number) => `${pl(n, 'lesson')} assigned`, notJoined: (n: number) => `${n} not joined yet`, allIn: 'Everyone has joined',
    assigned: 'Assigned lessons', none: 'Nothing assigned yet. Open a lesson and press “Assign”.', due: 'Due', doneOf: 'Done', open: 'Open lesson',
    kids: 'Pupils', joined: 'Joined', waiting: 'Not yet', addKids: '+ Add pupils', kidsPh: 'One first name per line, e.g.:\nAn\nBinh', save: 'Add',
    code: 'Class code', onlyNames: 'First names only.', link: 'Link to join', print: 'Print class code', copy: 'Copy', copied: 'Copied', parentLink: 'Private link for parents', remove: 'Remove', rename: 'Rename', del: 'Delete class', delAsk: 'Delete this class with its assigned lessons and the pupils\' results?',
    empty: 'Create your first class, then add the pupils\' first names.', noDue: 'No due date',
    unassign: 'Unassign', unassignAsk: (n: string) => `Remove this lesson from ${n}'s list?\n\nThe lesson stays in Lessons; what the pupils already did stays in the Summary.`, unassignStarted: (n: string, d: number, k: number) => `${n} already started this lesson (${d}/${k} finished). Unassigning takes it off their screen and they cannot carry on.\n\nWhat they already did stays in the Summary. Unassign?`, hide: 'Hide from the list', hideAsk: 'Hide this finished lesson from the list?\n\nThe results stay in the Summary; the lesson stays in Lessons.', givenOn: (d: string) => `Given ${d}`,
  },
};

const day = (d: string | null, lang: string) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '');
export const copyText = async (s: string) => { try { await navigator.clipboard.writeText(s); return true; } catch { return false; } };

// a parent's "Con của tôi": one row per child, with the lessons given and the child's own link
const P = {
  vi: { title: 'Con của tôi', lead: 'Mỗi con một dòng: bài đã giao, dạng lỗi lặp lại và link riêng của con.', add: '+ Thêm con', namePh: 'Tên gọi của con', create: 'Thêm', empty: 'Cô thêm tên gọi của con để bắt đầu.', link: 'Link riêng của con', none: 'Chưa giao bài nào cho con.', del: 'Bỏ khỏi danh sách', delAsk: 'Bỏ con khỏi danh sách cùng bài đã giao và kết quả?', rename: 'Đổi tên gọi', unassignAsk: (n: string) => `Bỏ bài này khỏi danh sách của ${n}?\n\nBài giảng vẫn còn trong mục Bài giảng; những gì con đã làm vẫn có trong Tóm tắt.` },
  en: { title: 'My children', lead: 'One row per child: lessons given, repeated mistakes and the child\'s own link.', add: '+ Add a child', namePh: "Child's first name", create: 'Add', empty: "Add your child's first name to start.", link: "Your child's link", none: 'Nothing assigned yet.', del: 'Remove', delAsk: 'Remove this child with the lessons given and the results?', rename: 'Rename', unassignAsk: (n: string) => `Remove this lesson from ${n}'s list?\n\nThe lesson stays in Lessons; what your child already did stays in the Summary.` },
};

export function Classes({ parent = false }: { parent?: boolean }) {
  const t0 = useT(T), lang0 = useLang(), t = parent ? { ...t0, ...P[lang0] } : t0;
  const [rows, setRows] = useState<ClassRow[] | null>(null), [open, setOpen] = useState<string | null>(null), [adding, setAdding] = useState(false), [name, setName] = useState(''), [err, setErr] = useState('');
  const lang = lang0;
  const [grade, setGrade] = useState(1);
  const load = () => api.classes().then((r) => { setRows(r.classes); if (!open && r.classes[0]) setOpen(r.classes[0].id); }).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    setErr('');
    try { const r = await (parent ? api.createChild(name, grade) : api.createClass(name)); setName(''); setAdding(false); setOpen(r.class.id); await load(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); }
  };
  if (!rows) return null;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row"><div className="grow"><h1>{t.title}</h1><p className="muted small">{t.lead}</p></div><button className="btn" onClick={() => setAdding(true)}>{t.add}</button></div>
      {adding && <form className="card row" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <input className="grow" autoFocus maxLength={40} placeholder={t.namePh} value={name} onChange={(e) => setName(e.target.value)} />
        {parent && <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{lang === 'en' ? 'Grade' : 'Lớp'} {g}</option>)}</select>}
        <button className="btn primary" disabled={!name.trim()}>{t.create}</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>{t.cancel}</button>
      </form>}
      {err && <p className="note">{err}</p>}
      {!rows.length && !adding && <div className="empty"><p className="muted">{t.empty}</p><button className="btn primary" onClick={() => setAdding(true)}>{t.add}</button></div>}
      {rows.map((k) => (
        <div key={k.id} className={`group card ${open === k.id ? 'on' : ''}`}>
          <button className="group-head" onClick={() => setOpen(open === k.id ? null : k.id)} aria-expanded={open === k.id}>
            <span className="caret">{open === k.id ? '▾' : '▸'}</span>
            <span className="grow"><b>{k.name}</b><span className="small muted"> · {parent ? `${lang === 'en' ? 'Grade' : 'Lớp'} ${k.grade ?? ''}` : t.pupils(k.pupils)} · {t.given(k.assignments)}</span></span>
            {!parent && k.pupils > 0 && <span className={`chip ${k.joined < k.pupils ? 'warn' : 'ok'}`}>{k.joined < k.pupils ? t.notJoined(k.pupils - k.joined) : t.allIn}</span>}
          </button>
          {open === k.id && <ClassBody id={k.id} t={t} onChange={load} parent={parent} />}
        </div>
      ))}
    </div>
  );
}

function ClassBody({ id, t, onChange, parent }: { id: string; t: (typeof T)['vi'] & Partial<(typeof P)['vi']>; onChange: () => void; parent: boolean }) {
  const lang = useLang();
  const [v, setV] = useState<ClassView | null>(null), [names, setNames] = useState<string | null>(null), [copied, setCopied] = useState(''), [showAll, setShowAll] = useState(false);
  const [mist, setMist] = useState<{ what: string; skill: string }[]>([]);
  const [workOf, setWorkOf] = useState<string | null>(null);   // a pupil whose marked work is open (Chi #46)
  const load = () => api.classView(id).then(setV).catch(() => {});
  useEffect(() => { api.summary({ classId: id, lang }).then((r) => setMist(r.classes.find((x) => x.id === id)?.mistakes ?? [])).catch(() => {}); }, [id]);
  useEffect(() => { void load(); }, [id]);
  if (!v) return null;
  const copy = async (s: string, k: string) => { if (await copyText(s)) { setCopied(k); setTimeout(() => setCopied(''), 1500); } };
  const kids = showAll ? v.pupils : v.pupils.slice(0, 12);
  const me = v.pupils[0];
  return (
    <div className="stack" style={{ gap: 14, paddingTop: 8 }}>
      {parent && me && <div className="row small"><b>{t.link}:</b><span className="grow muted ellipsis">{me.url.replace(/^https?:\/\//, '')}</span><button className="btn ghost small" onClick={() => copy(me.url, 'me')}>{copied === 'me' ? t.copied : t.copy}</button><button className="link small" onClick={() => go(`/learner/${me.id}`)}>{lang === 'en' ? 'See details' : 'Xem chi tiết'}</button></div>}
      {mist.length > 0 && <div className="banner warn row"><span className="grow"><b>{lang === 'en' ? 'Mistake that keeps coming back' : 'Dạng đang lặp lỗi'}:</b> {[...new Set(mist.map((m) => m.what))].join(' · ')}</span><button className="link small" onClick={() => go(`/insight?class=${id}`)}>{lang === 'en' ? 'See the summary ›' : 'Xem tóm tắt ›'}</button></div>}
      {/* the child's profile: her marked work, one dated record per upload (Chi #46), never Knowledge */}
      {parent && me && <div className="card"><WorkPanel pupilId={me.id} name={me.name} parent /></div>}
      <div className="row"><h3 className="grow">{t.assigned}</h3><AssignMore classId={id} /></div>
      {v.assignments.length ? (
        <table className="tbl stack-sm"><thead><tr><th>{lang === 'en' ? 'Lesson' : 'Bài giảng'}</th><th>{t.due}</th><th>{t.doneOf}</th><th>{lang === 'en' ? 'Status' : 'Trạng thái'}</th><th /></tr></thead><tbody>
          {v.assignments.map((a) => (
            <tr key={a.id}><td>{a.title}<span className="small muted" style={{ display: 'block' }}>{t.givenOn(new Date(a.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }))}{a.refs?.length ? ` · ${a.refs.map((r) => (lang === 'en' ? r.en : r.vi).replace(/^(From|Theo):\s*[^,]*,\s*/, '')).join('; ')}` : ''}</span></td><td>{a.due ? day(a.due, lang) : t.noDue}</td>
              <td><span className="meter"><i style={{ width: `${v.pupils.length ? (100 * a.done) / v.pupils.length : 0}%` }} /></span> {a.done}/{v.pupils.length}</td>
              <td>{(() => { const st = statusOf(a, v.pupils.length); return <span className={`tag ${st === 'expired' ? 'later' : st === 'done' ? 'done' : st === 'progress' ? 'current' : 'ai'}`}>{STATUS[lang][st]}</span>; })()}</td>
              <td><button className="link small" onClick={() => go(`/lesson/${a.lesson_id}`)}>{t.open}</button> · <button className="link small" onClick={() => go(`/insight?class=${id}&lesson=${a.lesson_id}`)}>{lang === 'en' ? 'Summary' : 'Xem tóm tắt'}</button>
                {' · '}{statusOf(a, v.pupils.length) === 'done'
                  ? <button className="link small muted" onClick={async () => { if (await ask(t.hideAsk, { ok: t.hide })) { await api.hideAssignment(a.id); await load(); onChange(); } }}>{t.hide}</button>
                  : <button className="link small muted" onClick={async () => { if (await ask(a.answers || a.done ? t.unassignStarted(v.class.name, a.done, v.pupils.length) : t.unassignAsk(v.class.name), { ok: t.unassign, danger: true })) { await api.unassign(a.id); await load(); onChange(); } }}>{t.unassign}</button>}</td></tr>
          ))}
        </tbody></table>
      ) : <p className="small muted">{t.none}</p>}
      {!parent && <><div className="row"><h3 className="grow">{t.kids}</h3><button className="btn small" onClick={() => setNames(names === null ? '' : null)}>{t.addKids}</button><button className="btn small" onClick={() => printCode(v.class.name, v.class.code, v.class.url, id)}>{t.print}</button></div>
      <p className="small muted">{t.code}: <b>{v.class.code}</b> · <a href={v.class.url} target="_blank" rel="noreferrer">{v.class.url.replace(/^https?:\/\//, '')}</a> · <button className="link small" onClick={() => copy(v.class.url, 'url')}>{copied === 'url' ? t.copied : t.copy}</button> · {t.onlyNames}</p>
      {names !== null && <form className="stack" onSubmit={async (e) => { e.preventDefault(); await api.addPupils(id, names); setNames(null); await load(); onChange(); }}>
        <textarea rows={4} placeholder={t.kidsPh} value={names} onChange={(e) => setNames(e.target.value)} />
        <div className="row"><button className="btn primary small" disabled={!names.trim()}>{t.save}</button><button type="button" className="btn ghost small" onClick={() => setNames(null)}>{t.cancel}</button></div>
      </form>}
      <div className="kids">{kids.map((p) => (
        <div key={p.id} className="kid">
          <button className="link" style={{ color: 'inherit', fontWeight: 700 }} onClick={() => go(`/learner/${p.id}`)}>{p.name}</button><span className={`small ${p.joined_at ? 'ok-text' : 'muted'}`}>{p.joined_at ? t.joined : t.waiting}</span>
          <div className="row small" style={{ gap: 6 }}>
            <button className="link small" title={t.parentLink} onClick={() => copy(p.url, p.id)}>{copied === p.id ? t.copied : t.parentLink}</button>
            <button className="link small" onClick={() => setWorkOf(workOf === p.id ? null : p.id)}>{lang === 'en' ? 'Work' : 'Bài làm'}</button>
            <button className="link small muted" onClick={async () => { await api.removePupil(id, p.id); await load(); onChange(); }}>{t.remove}</button>
          </div>
        </div>
      ))}</div>
      {workOf && v.pupils.some((p) => p.id === workOf) && <div className="card"><WorkPanel pupilId={workOf} name={v.pupils.find((p) => p.id === workOf)!.name} parent={false} /></div>}
      {v.pupils.length > 12 && !showAll && <button className="link small" onClick={() => setShowAll(true)}>{lang === 'en' ? `See all ${v.pupils.length}` : `Xem cả ${v.pupils.length} em`}</button>}</>}
      <div className="row small" style={{ justifyContent: 'flex-end' }}>
        <button className="link small" onClick={async () => { const n = prompt(t.rename, v.class.name); if (n?.trim()) { await api.renameClass(id, n); await load(); onChange(); } }}>{t.rename}</button>
        <button className="link small danger" onClick={async () => { if (await ask(t.delAsk, { ok: t.del, danger: true })) { await api.deleteClass(id); onChange(); } }}>{t.del}</button>
      </div>
    </div>
  );
}

// A printable sheet with the class name, code and QR, for the board or the parents' group.
function printCode(name: string, code: string, url: string, id: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><body style="font-family:system-ui;text-align:center;padding:40px">
    <h1 style="font-size:48px;margin:0">${esc(name)}</h1><img src="/api/t/classes/${id}/qr.svg" width="320" height="320" alt="">
    <p style="font-size:20px">LessonBloom · ${esc(url.replace(/^https?:\/\//, ''))}</p><p style="font-size:64px;letter-spacing:8px;font-weight:700;margin:0">${esc(code)}</p>
    <script>document.querySelector('img').onload=()=>setTimeout(()=>print(),200)</script></body>`);
  w.document.close();
}

// The status follows what the learners did (Chi #34: a lesson done 1/1 still said "Just assigned"):
// Mới giao (nobody has opened or answered it) · Đang làm (someone has) · Đã xong (every learner finished
// all the items) · Đã hết hạn (past its due date and not everyone finished)
const STATUS = { vi: { new: 'Mới giao', progress: 'Đang làm', done: 'Đã xong', expired: 'Đã hết hạn' }, en: { new: 'Just assigned', progress: 'In progress', done: 'Done', expired: 'Past due' } };
export function statusOf(a: { due: string | null; done: number; started: number; seen?: number }, pupils: number): 'new' | 'progress' | 'done' | 'expired' {
  if (pupils > 0 && a.done >= pupils) return 'done';
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (a.due && String(a.due).slice(0, 10) < today) return 'expired';
  return a.done || a.started || a.seen ? 'progress' : 'new';
}

// "+ Giao thêm bài": pick a ready lesson, then its Assign step opens
function AssignMore({ classId: _classId }: { classId: string }) {
  const lang = useLang(), [list, setList] = useState<{ id: string; title: string }[] | null>(null);
  if (!list) return <button className="btn primary small" onClick={() => api.lessons().then((r) => setList(r.lessons.filter((l) => l.status === 'ready').map((l) => ({ id: l.id, title: l.setup.title })))).catch(() => setList([]))}>{lang === 'en' ? '+ Assign another lesson' : '+ Giao thêm bài'}</button>;
  return <select autoFocus defaultValue="" onChange={(e) => e.target.value && go(`/lesson/${e.target.value}?step=6`)}><option value="" disabled>{lang === 'en' ? 'Choose a lesson…' : 'Chọn bài giảng…'}</option>{list.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select>;
}

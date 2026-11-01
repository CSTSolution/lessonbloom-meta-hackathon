// A child's marked work, read from photos (Chi #46). The card the assigner sees right after the photos
// are read: "Read from MAI's work: 16 questions · 12 right · 4 wrong", each wrong question with what the
// child wrote, the right answer and the kind of mistake (worked out by code on the server). Handwriting is
// misread now and then, so the whole table can be corrected before anything is made or saved.
// WorkPanel is the child's "Bài làm" in My children (and a pupil's in a class): upload, the dated records,
// and "Make a lesson from these mistakes".
import { useEffect, useState } from 'react';
import { api, ApiError, type Work, type WorkQ } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { ask } from '../ask.tsx';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    readFrom: (n: string) => (n ? `Máy đọc được từ bài của ${n}` : 'Máy đọc được từ bài em làm'), counts: (t: number, r: number, w: number, c = 0) => `${t} câu · đúng ${r} · sai ${w}${c ? ` · ${c} câu cần cô xem lại` : ''}`,
    q: 'Câu hỏi', child: 'Em viết', right: 'Đúng là', kind: 'Dạng lỗi', mark: 'Đúng / sai', ok: 'Đúng', bad: 'Sai', noWrong: 'Không thấy câu nào sai trong bài này.', unsure: 'Dấu chấm và phép tính chưa khớp: chưa tính là lỗi. Cô xem lại và chọn Đúng / Sai.',
    fix: 'Sửa nếu máy đọc nhầm', all: (n: number) => `Xem và sửa cả ${n} câu`, check: 'Kiểm tra lại', remove: 'Bỏ câu', addQ: '+ Thêm câu', done: 'Xong',
    hint: 'Chữ viết tay đôi khi bị đọc nhầm (nhất là chữ số bị gạch). Cô xem lại bảng trước khi soạn bài.',
    work: 'Bài làm', upload: 'Tải bài em đã làm', uploadLead: 'Chụp bài đã chấm (tối đa 5 ảnh). Máy đọc từng câu, dấu chấm đúng/sai, và tìm dạng lỗi. Bài làm được lưu vào hồ sơ của em, không vào Kho kiến thức.', reading: 'Máy đang đọc bài…',
    save: 'Lưu bài làm', saved: 'Đã lưu vào hồ sơ.', make: 'Soạn bài từ lỗi này', none: 'Chưa có bài làm nào.', del: 'Xoá', delAsk: 'Xoá bài làm này khỏi hồ sơ?', on: (d: string) => `Bài ngày ${d}`, cancel: 'Huỷ',
  },
  en: {
    readFrom: (n: string) => (n ? `Read from ${n}'s work` : "Read from the pupil's work"), counts: (t: number, r: number, w: number, c = 0) => `${pl(t, 'question')} · ${r} right · ${w} wrong${c ? ` · ${c} to check` : ''}`,
    q: 'Question', child: 'Wrote', right: 'Right answer', kind: 'Mistake type', mark: 'Right / wrong', ok: 'Right', bad: 'Wrong', noWrong: 'No wrong answers found on this sheet.', unsure: 'The mark and the sum do not agree: not counted as a mistake. Please check it and choose Right / Wrong.',
    fix: 'Correct it if it was misread', all: (n: number) => `See and correct all ${n}`, check: 'Check again', remove: 'Remove', addQ: '+ Add a question', done: 'Done',
    hint: 'Handwriting is sometimes misread (crossed-out digits most of all). Check the table before making the lesson.',
    work: 'Work', upload: "Upload the pupil's work", uploadLead: 'Photograph the marked sheet (up to 5 photos). Each question, the right/wrong marks and the kinds of mistake are read. The work is kept in the pupil\'s profile, not in Knowledge.', reading: 'Reading the work…',
    save: 'Save the work', saved: 'Saved to the profile.', make: 'Make a lesson from these mistakes', none: 'No work yet.', del: 'Delete', delAsk: 'Delete this work from the profile?', on: (d: string) => `Work of ${d}`, cancel: 'Cancel',
  },
};
const P = { vi: { readFrom: (n: string) => (n ? `Máy đọc được từ bài của ${n}` : 'Máy đọc được từ bài con làm'), upload: 'Tải bài con đã làm', child: 'Con viết', uploadLead: 'Chụp bài đã chấm (tối đa 5 ảnh). Máy đọc từng câu, dấu chấm đúng/sai, và tìm dạng lỗi. Bài làm được lưu vào hồ sơ của con, không vào Kho kiến thức.' }, en: { readFrom: (n: string) => (n ? `Read from ${n}'s work` : "Read from your child's work"), upload: "Upload your child's work", child: 'Wrote', uploadLead: "Photograph the marked sheet (up to 5 photos). Each question, the right/wrong marks and the kinds of mistake are read. The work is kept in your child's profile, not in Knowledge." } };
export const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const sign = (s: string) => s.replace(/ - /g, ' − ').replace(/\.\.\.|…/g, ' … ').replace(/\s+/g, ' ');

// The card: totals, the wrong questions and their kinds; "correct it" opens the whole table.
export function WorkTable({ work, parent, onChange, busy = false }: { work: Work; parent: boolean; onChange?: (w: Work) => void; busy?: boolean }) {
  const t0 = useT(T), lang = useLang(), t = parent ? { ...t0, ...P[lang] } : t0, L = lang === 'en' ? 'en' : 'vi';
  const [edit, setEdit] = useState<WorkQ[] | null>(null), [err, setErr] = useState(''), [checking, setChecking] = useState(false);
  const wrong = work.questions.filter((q) => !q.ok || q.unsure);
  const recheck = async (rows: WorkQ[]) => {
    setErr(''); setChecking(true);
    try { const r = await api.workCheck({ ...work, questions: rows }); onChange?.({ ...r.work, recordId: work.recordId, pupilId: work.pupilId, child: work.child }); setEdit(null); }
    catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setChecking(false); }
  };
  const set = (i: number, f: Partial<WorkQ>) => setEdit((xs) => xs && xs.map((x, j) => (j === i ? { ...x, ...f } : x)));
  return (
    <div className="card stack" style={{ gap: 8, borderColor: 'var(--sun)' }}>
      <b>{t.readFrom(work.child || '')}: {t.counts(work.total, work.right, work.wrong, work.check)}</b>
      {!!work.types.length && <div className="row small" style={{ gap: 6 }}>{work.types.map((x) => <span key={x.label.en} className="tag repeat">{x.label[L]} ×{x.count}</span>)}</div>}
      {!edit && (wrong.length ? <table className="tbl stack-sm"><thead><tr><th>{t.q}</th><th>{t.child}</th><th>{t.right}</th><th>{t.kind}</th></tr></thead><tbody>
        {wrong.map((q, i) => <tr key={i} style={q.unsure ? { background: 'var(--sun-2)' } : undefined}><td>{sign(q.q)}</td><td>{q.unsure ? q.child || '…' : <s>{q.child || '…'}</s>}</td><td><b>{q.right || '?'}</b></td><td>{q.label[L]}{q.slip && <span className="muted"> · {q.slip[L]}</span>}{q.unsure && <span className="muted"> · {t.unsure}</span>}</td></tr>)}
      </tbody></table> : <p className="small muted">{t.noWrong}</p>)}
      {edit && <div className="stack" style={{ gap: 6 }}>
        <p className="small muted">{t.hint}</p>
        <table className="tbl"><thead><tr><th>{t.q}</th><th>{t.child}</th><th>{t.mark}</th><th>{t.right}</th><th /></tr></thead><tbody>
          {edit.map((q, i) => <tr key={i} style={q.unsure ? { background: 'var(--sun-2)' } : undefined}>
            <td><input value={q.q} maxLength={60} aria-label={t.q} onChange={(e) => set(i, { q: e.target.value })} style={{ width: 150 }} /></td>
            <td><input value={q.child} maxLength={20} aria-label={t.child} onChange={(e) => set(i, { child: e.target.value })} style={{ width: 70 }} /></td>
            <td><select value={q.mark === 'none' ? (q.ok ? 'right' : 'wrong') : q.mark} aria-label={t.mark} onChange={(e) => set(i, { mark: e.target.value as WorkQ['mark'], sure: true })}><option value="right">{t.ok}</option><option value="wrong">{t.bad}</option></select></td>
            <td className="small">{q.right}</td>
            <td><button className="link small muted" onClick={() => setEdit(edit.filter((_, j) => j !== i))}>{t.remove}</button></td>
          </tr>)}
        </tbody></table>
        <div className="row"><button className="btn small" onClick={() => setEdit([...edit, { q: '', child: '', mark: 'wrong', right: '', ok: false, kind: 'other', label: { vi: '', en: '' } }])}>{t.addQ}</button><span className="grow" />
          <button className="btn ghost small" onClick={() => setEdit(null)}>{t.cancel}</button>
          <button className="btn primary small" disabled={checking || busy} onClick={() => void recheck(edit.filter((q) => q.q.trim()))}>{checking ? '…' : t.check}</button></div>
      </div>}
      {!edit && onChange && <div className="row small"><span className="muted grow">{t.fix}</span><button className="link small" onClick={() => setEdit(work.questions.map((q) => ({ ...q })))}>{t.all(work.total)}</button></div>}
      {err && <p className="note small">{err}</p>}
    </div>
  );
}

// "Bài làm" for one child / pupil: upload a marked sheet (saved after she checks the table), the dated
// records, and a lesson from one of them.
export function WorkPanel({ pupilId, name, parent }: { pupilId: string; name: string; parent: boolean }) {
  const t0 = useT(T), lang = useLang(), t = parent ? { ...t0, ...P[lang] } : t0;
  const [list, setList] = useState<Work[] | null>(null), [draft, setDraft] = useState<Work | null>(null), [busy, setBusy] = useState(''), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const load = () => api.pupilWork(pupilId).then((r) => setList(r.records)).catch(() => setList([]));
  useEffect(() => { void load(); }, [pupilId]);
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setErr(''); setMsg(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); } };
  const read = (fs: File[]) => run('read', async () => { const imgs = await Promise.all(fs.slice(0, 5).map((f) => shrink(f))); const r = await api.work(imgs); setDraft({ ...r.work, child: name, pupilId }); });
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row"><h3 className="grow">{t.work} · {name}</h3>
        <label className="btn small primary">{busy === 'read' ? t.reading : t.upload}<input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) void read(fs); }} /></label></div>
      <p className="small muted">{t.uploadLead}</p>
      {err && <p className="note small">{err}</p>}
      {msg && <p className="banner small">{msg}</p>}
      {draft && <><WorkTable work={draft} parent={parent} onChange={setDraft} busy={!!busy} />
        <div className="row"><span className="grow" /><button className="btn ghost small" onClick={() => setDraft(null)}>{t.cancel}</button>
          <button className="btn primary small" disabled={!!busy} onClick={() => run('save', async () => { await api.saveWork(pupilId, draft); setDraft(null); setMsg(t.saved); await load(); })}>{t.save}</button></div></>}
      {list && !list.length && !draft && <p className="small muted">{t.none}</p>}
      {list?.map((w) => (
        <details key={w.recordId} className="card small">
          <summary><b>{t.on(dm(w.date))}</b> · {t.counts(w.total, w.right, w.wrong, w.check)}{w.topic ? <span className="muted"> · {w.topic}</span> : null}</summary>
          <div className="stack" style={{ gap: 8, paddingTop: 8 }}>
            <WorkTable work={w} parent={parent} busy={!!busy} onChange={(nw) => void run('upd', async () => { await api.updateWork(w.recordId!, nw); await load(); })} />
            <div className="row"><button className="link small danger" onClick={async () => { if (await ask(t.delAsk, { danger: true })) { await api.deleteWork(w.recordId!); await load(); } }}>{t.del}</button><span className="grow" />
              <button className="btn primary small" disabled={!w.wrong} onClick={() => go(`/new?work=${w.recordId}`)}>{t.make}</button></div>
          </div>
        </details>
      ))}
    </div>
  );
}

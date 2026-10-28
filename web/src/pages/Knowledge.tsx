// "Kho kiến thức" (Chi's design): sources grouped by subject, filtered subject → grade; the chosen
// source on the right with its parts ("phạm vi kiến thức"), each with its pages and how many lessons
// use it, and Đổi tên / Tách / Tạo bài, plus Gộp phạm vi. The add form shows only when asked for.
// Private to the assigner (textbook copyright); the demo uses the team's own sample books.
import { useEffect, useState } from 'react';
import { api, ApiError, type AreaRow, type SectionRow } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Kho kiến thức', lead: 'Bài chỉ soạn từ các nguồn này, ghi rõ trang.', add: '+ Thêm nguồn kiến thức', private: '🔒 Chỉ bạn xem được, không chia sẻ.', all: 'Tất cả', math: 'Toán', english: 'Tiếng Anh',
    sources: (n: number) => `${n} nguồn`, reading: (n: number) => `${n} đang đọc`, ready: 'Sẵn sàng', grade: (g: number) => `Lớp ${g}`, pages: (n: number) => `${n} trang`,
    status: { processing: 'Đang đọc tài liệu…', ready: 'Sẵn sàng', error: 'Lỗi' }, errors: { scanned: 'Tài liệu là ảnh chụp, chưa có chữ. Hiện đọc được PDF có chữ.', failed: 'Chưa đọc được tệp này.', blocked: 'Nội dung không dùng được.' },
    view: 'Xem tài liệu', remove: 'Xoá khỏi kho', removeAsk: 'Xoá nguồn này khỏi kho? Bài đã soạn vẫn còn.', parts: (n: number) => `Phạm vi kiến thức (${n})`, partsLead: 'Mỗi bài chỉ chọn một phạm vi làm giới hạn kiến thức.',
    page: (p: string) => `Trang ${p}`, used: (n: number) => `Đang dùng trong ${n} bài`, rename: 'Đổi tên', split: 'Tách', make: 'Tạo bài', seeAll: (n: number) => `Xem cả ${n} phạm vi`, merge: 'Gộp phạm vi', mergeHint: 'Chọn một phạm vi để gộp với phạm vi ngay sau nó.',
    splitAt: 'Tách từ trang', newTitle: 'Tên phần mới', ok: 'Lưu', cancel: 'Huỷ', none: 'Chưa có nguồn nào. Thêm sách PDF hoặc dùng sách mẫu.',
    form: { title: 'Thêm nguồn kiến thức', name: 'Tên nguồn', namePh: 'Ví dụ: Toán 2 · Tập 1', subject: 'Môn', grade: 'Lớp', file: 'Tệp PDF (có chữ)', go: 'Tải lên', busy: 'Đang tải lên…', sample: 'Hoặc dùng sách mẫu (đội LessonBloom tự viết):', toan: 'Toán 2', maths: 'Maths 2 (tiếng Anh)', eng: 'Tiếng Anh 3' },
  },
  en: {
    title: 'Knowledge', lead: 'Lessons come only from these sources, with their pages.', add: '+ Add a source', private: '🔒 Only you can see these; nothing is shared.', all: 'All', math: 'Maths', english: 'English',
    sources: (n: number) => `${n} sources`, reading: (n: number) => `${n} reading`, ready: 'Ready', grade: (g: number) => `Grade ${g}`, pages: (n: number) => `${n} pages`,
    status: { processing: 'Reading…', ready: 'Ready', error: 'Error' }, errors: { scanned: 'The file is scanned images without text. Text PDFs only for now.', failed: 'This file could not be read.', blocked: 'This content cannot be used.' },
    view: 'Open', remove: 'Remove', removeAsk: 'Remove this source? Lessons already made stay.', parts: (n: number) => `Parts (${n})`, partsLead: 'Each lesson uses one part as the limit of what it teaches.',
    page: (p: string) => `Pages ${p}`, used: (n: number) => `Used in ${n} lessons`, rename: 'Rename', split: 'Split', make: 'Make lesson', seeAll: (n: number) => `See all ${n} parts`, merge: 'Merge parts', mergeHint: 'Pick a part to merge it with the next one.',
    splitAt: 'Split from page', newTitle: 'New part name', ok: 'Save', cancel: 'Cancel', none: 'No sources yet. Add a PDF book or use a sample book.',
    form: { title: 'Add a source', name: 'Name', namePh: 'e.g. Maths 2 · Book 1', subject: 'Subject', grade: 'Grade', file: 'PDF file (with text)', go: 'Upload', busy: 'Uploading…', sample: 'Or use a sample book (written by the LessonBloom team):', toan: 'Toán 2 (Vietnamese)', maths: 'Maths 2', eng: 'English 3' },
  },
};

export function Knowledge() {
  const t = useT(T), lang = useLang();
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [subject, setSubject] = useState<'' | 'math' | 'english'>(''), [grade, setGrade] = useState(0);
  const [sel, setSel] = useState(''), [sections, setSections] = useState<SectionRow[]>([]), [all, setAll] = useState(false), [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<{ id: string; mode: 'rename' | 'split'; title: string; page: number } | null>(null), [pickMerge, setPickMerge] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const load = () => api.areas().then((r) => { setAreas(r.areas); setSel((s) => s || r.areas[0]?.id || ''); }).catch(() => setAreas([]));
  const loadSections = () => sel ? api.area(sel).then((r) => setSections(r.sections)).catch(() => setSections([])) : Promise.resolve();
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!areas?.some((a) => a.books.some((b) => b.status === 'processing'))) return; const id = setTimeout(load, 2000); return () => clearTimeout(id); }, [areas]);
  useEffect(() => { void loadSections(); setAll(false); setEdit(null); setPickMerge(''); }, [sel, areas]);
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); } };
  if (!areas) return null;
  const shown = areas.filter((a) => (!subject || a.subject === subject) && (!grade || a.grade === grade));
  const grades = [...new Set(areas.filter((a) => !subject || a.subject === subject).map((a) => a.grade))].sort();
  const a = areas.find((x) => x.id === sel), book = a?.books[0];
  const parts = all ? sections : sections.slice(0, 6);
  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}><div className="grow"><h1>{t.title}</h1><p className="small muted">{t.lead}</p></div><button className="btn primary" onClick={() => setAdding(!adding)}>{t.add}</button></div>
      <div className="banner" style={{ marginBottom: 12 }}>{t.private}</div>
      {adding && <AddSource t={t} onDone={async (id) => { setAdding(false); await load(); if (id) setSel(id); }} />}
      <div className="row" style={{ marginBottom: 12 }}>
        {(['', 'math', 'english'] as const).map((s) => <button key={s} className={`pill ${subject === s ? 'on' : ''}`} onClick={() => { setSubject(s); setGrade(0); }}>{s ? t[s] : t.all}</button>)}
        {subject && grades.length > 1 && grades.map((g) => <button key={g} className={`pill ${grade === g ? 'on' : ''}`} onClick={() => setGrade(grade === g ? 0 : g)}>{t.grade(g)}</button>)}
      </div>
      {!areas.length && !adding && <div className="card"><p className="muted">{t.none}</p></div>}
      {areas.length > 0 && <div className="cols left">
        <div className="stack">
          {(['math', 'english'] as const).filter((s) => shown.some((x) => x.subject === s)).map((s) => { const list = shown.filter((x) => x.subject === s), reading = list.filter((x) => x.books.some((b) => b.status === 'processing')).length; return (
            <div key={s} className="card stack" style={{ gap: 8 }}>
              <div className="row"><span className="grow"><b>{t[s]}</b><span className="small muted" style={{ display: 'block' }}>{t.sources(list.length)}</span></span>{reading ? <span className="tag next">{t.reading(reading)}</span> : <span className="tag done">{t.ready}</span>}</div>
              {list.map((x) => { const b = x.books[0]; return (
                <button key={x.id} className={`list-row ${sel === x.id ? 'sel' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(x.id)}>
                  <span>📄</span><span className="grow"><b className="small">{x.name}</b><span className="small muted" style={{ display: 'block' }}>{t.grade(x.grade)}{b?.pages ? ` · ${t.pages(b.pages)}` : ''}</span>
                    <span className={`small ${b?.status === 'ready' ? 'ok-text' : b?.status === 'error' ? 'danger' : ''}`} style={{ display: 'block', color: b?.status === 'processing' ? 'var(--sun)' : undefined }}>● {b ? t.status[b.status] : '—'}</span></span>
                </button>
              ); })}
            </div>
          ); })}
        </div>
        {a && <div className="card stack" style={{ gap: 10 }}>
          <div className="row"><div className="grow"><h2>{a.name}</h2><span className="small muted">{t[a.subject]} · {t.grade(a.grade)} · PDF{book?.pages ? ` · ${t.pages(book.pages)}` : ''}</span></div>
            {book && <a className="btn small" href={`/api/t/books/${book.id}/file`} target="_blank" rel="noreferrer">{t.view}</a>}
            <button className="btn small danger" onClick={() => { if (confirm(t.removeAsk)) void run('del', async () => { await api.deleteArea(a.id); setSel(''); await load(); }); }}>{t.remove}</button></div>
          {book?.error && <p className="note">{t.errors[book.error as keyof typeof t.errors] ?? book.error}</p>}
          <div><b>{t.parts(sections.length)}</b><p className="small muted">{t.partsLead}</p></div>
          {pickMerge === 'pick' && <p className="banner blue">{t.mergeHint}</p>}
          {parts.map((s, i) => (
            <div key={s.id} className={`list-row ${s.lessons ? 'hl' : ''} ${pickMerge === 'pick' ? 'sel' : ''}`} style={pickMerge === 'pick' ? { cursor: 'pointer' } : undefined} onClick={() => { if (pickMerge === 'pick' && i < sections.length - 1) void run('merge', async () => { await api.mergeSection(s.id); setPickMerge(''); await loadSections(); }); }}>
              <span className="num">{i + 1}</span>
              {edit?.id === s.id ? (
                <form className="row grow" onSubmit={(e) => { e.preventDefault(); void run('edit', async () => { if (edit.mode === 'rename') await api.renameSection(s.id, edit.title); else await api.splitSection(s.id, edit.page, edit.title); setEdit(null); await loadSections(); }); }}>
                  {edit.mode === 'split' && <label className="small">{t.splitAt} <input type="number" min={s.page_from + 1} max={s.page_to} value={edit.page} style={{ width: 70 }} onChange={(e) => setEdit({ ...edit, page: Number(e.target.value) })} /></label>}
                  <input className="grow" autoFocus maxLength={120} placeholder={t.newTitle} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                  <button className="btn primary small" disabled={!edit.title.trim()}>{t.ok}</button><button type="button" className="btn ghost small" onClick={() => setEdit(null)}>{t.cancel}</button>
                </form>
              ) : <>
                <span className="grow"><b className="small">{s.title}</b><span className="small muted" style={{ display: 'block' }}>{t.page(s.page_from === s.page_to ? `${s.page_from}` : `${s.page_from}–${s.page_to}`)}{s.lessons ? <> · <b className="ok-text">{t.used(s.lessons)}</b></> : ''}</span></span>
                <button className="btn small" onClick={(e) => { e.stopPropagation(); setEdit({ id: s.id, mode: 'rename', title: s.title, page: 0 }); }}>{t.rename}</button>
                <button className="btn small" disabled={s.page_to <= s.page_from} onClick={(e) => { e.stopPropagation(); setEdit({ id: s.id, mode: 'split', title: '', page: s.page_from + 1 }); }}>{t.split}</button>
                <button className="btn primary small" onClick={(e) => { e.stopPropagation(); go(`/new?area=${a.id}&section=${s.id}`); }}>{t.make}</button>
              </>}
            </div>
          ))}
          <div className="row">{sections.length > 6 && !all && <button className="link small" onClick={() => setAll(true)}>{t.seeAll(sections.length)}</button>}<span className="grow" />
            {sections.length > 1 && <button className="btn small" onClick={() => setPickMerge(pickMerge ? '' : 'pick')}>{pickMerge ? t.cancel : t.merge}</button>}</div>
          {err && <p className="note">{err}</p>}
        </div>}
      </div>}
    </div>
  );
}

function AddSource({ t, onDone }: { t: (typeof T)['vi']; onDone: (areaId?: string) => void }) {
  const lang = useLang();
  const [f, setF] = useState({ name: '', subject: 'math', grade: 2 }), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const run = async (fn: () => Promise<string | undefined>) => { setBusy(true); setErr(''); try { onDone(await fn()); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); } };
  return (
    <form className="card stack" style={{ marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); if (file) void run(async () => { const { area } = await api.createArea({ ...f, name: f.name.trim() || file.name.replace(/\.pdf$/i, '') }); await api.uploadBook(area.id, file, f.name.trim() || file.name.replace(/\.pdf$/i, '')); return area.id; }); }}>
      <b>{t.form.title}</b>
      <div className="grid2">
        <label className="field">{t.form.name}<input value={f.name} maxLength={80} placeholder={t.form.namePh} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">{t.form.file}<input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        <label className="field">{t.form.subject}<select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="math">{t.math}</option><option value="english">{t.english}</option></select></label>
        <label className="field">{t.form.grade}<select value={f.grade} onChange={(e) => setF({ ...f, grade: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{t.grade(g)}</option>)}</select></label>
      </div>
      <div className="row"><button className="btn primary" disabled={busy || !file}>{busy ? t.form.busy : t.form.go}</button><span className="grow" />
        <span className="small muted">{t.form.sample}</span>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('maths2')).area.id)}>📘 {t.form.maths}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('toan2')).area.id)}>📘 {t.form.toan}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('english3')).area.id)}>📗 {t.form.eng}</button></div>
      {err && <p className="note">{err}</p>}
    </form>
  );
}

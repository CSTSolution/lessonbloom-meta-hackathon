// "Kho kiến thức" (Chi's design): sources grouped by subject, filtered subject → grade; the chosen
// source on the right with its parts ("phạm vi kiến thức"), each with its pages and how many lessons
// use it, and Đổi tên / Tách / Tạo bài, plus Gộp phạm vi. The add form shows only when asked for.
// Private to the assigner (textbook copyright); the demo uses the team's own sample books.
import { useEffect, useRef, useState } from 'react';
import { api, MAX_PDF, ApiError, putSigned, type AreaRow, type BookRow, type Job, type ScanEstimate, type SectionRow } from '../api.ts';
import { hasText, looksLikePdf, openPdf, pageJpeg, pageText } from '../pdf.ts';
import { photoJpeg } from '../photo.ts';
import { KnowledgeMapView, SourceView } from './Sources.tsx';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const config = { maxPages: 200 };   // pages a scanned book reads at a time (the server's limit too)
import { pl, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Kho kiến thức', lead: 'Bài chỉ soạn từ các nguồn này, ghi rõ trang.', add: '+ Thêm nguồn kiến thức', private: '🔒 Chỉ bạn xem được, không chia sẻ.', all: 'Tất cả', math: 'Toán', english: 'Tiếng Anh',
    sources: (n: number) => `${n} nguồn`, reading: (n: number) => `${n} đang đọc`, ready: 'Sẵn sàng', grade: (g: number) => `Lớp ${g}`, pages: (n: number) => `${n} trang`,
    status: { processing: 'Đang đọc tài liệu…', ready: 'Sẵn sàng', error: 'Lỗi' }, errors: { interrupted: 'Việc đọc sách bị ngắt khi máy chủ khởi động lại; lượt đã giữ được trả lại. Cô xoá nguồn này rồi thêm lại nhé.', scanned: 'Tài liệu là ảnh chụp. Cô xoá nguồn này rồi thêm lại tệp: app sẽ đọc từng trang ảnh (có dự kiến lượt trước).', failed: 'Chưa đọc được tệp này.', stopped: 'Cô đã dừng việc đọc, nên sách không được thêm; lượt chưa dùng đã được trả lại.', credits: 'Lượt đã giữ không đủ để đọc hết sách, nên sách không được thêm (app không giữ một phần sách); lượt chưa dùng đã được trả lại.', unreadable: 'Không đọc được chữ trên các trang này. Cô xem ảnh có rõ, đúng chiều không, rồi xoá và thêm lại nhé.', blocked: 'Nội dung không dùng được.' },
    view: 'Xem tài liệu', remove: 'Xoá khỏi kho', removeAsk: 'Xoá nguồn này khỏi kho? Bài đã soạn vẫn còn.', parts: (n: number) => `Phạm vi kiến thức (${n})`, partsLead: 'Mỗi bài chỉ chọn một phạm vi làm giới hạn kiến thức.',
    page: (p: string) => `Trang ${p}`, used: (n: number) => `Đang dùng trong ${n} bài`, rename: 'Đổi tên', source: 'Xem nguồn', mapTab: 'Bản đồ kiến thức', split: 'Tách', make: 'Tạo bài', seeAll: (n: number) => `Xem cả ${n} phạm vi`, merge: 'Gộp phạm vi', mergeHint: 'Chọn một phạm vi để gộp với phạm vi ngay sau nó.',
    splitAt: 'Tách từ trang', newTitle: 'Tên phần mới', ok: 'Lưu', cancel: 'Huỷ', none: 'Chưa có nguồn nào. Thêm sách PDF hoặc dùng sách mẫu.',
    st: { waiting: (n: number) => `Đang chờ (thứ ${n} trong hàng): sẽ đọc khi xong việc đang làm.`, reading: 'Đang đọc sách: tách bài, đọc chữ từng trang…', readingPage: (p: string) => `Đang đọc sách · trang ${p}`, leave: 'Cô có thể rời trang; đọc xong sẽ có thông báo ở chuông.',
      done: (title: string, n: number, p: number) => `Đã thêm: ${title} · ${n} bài · ${p} trang.`, retry: 'Thử lại', again: 'Xoá và thêm lại' },
    form: { title: 'Thêm nguồn kiến thức', name: 'Tên nguồn', namePh: 'Ví dụ: Toán 2 · Tập 1', subject: 'Môn', grade: 'Lớp', file: 'Tệp PDF có chữ (tối đa 30 MB)', tooBig: (mb: number) => `Tệp này ${mb} MB, quá 30 MB. Cô tách sách ra từng chương rồi tải từng phần nhé.`, sent: (p: number) => `Đang tải lên… ${p}%`, go: 'Tải lên', busy: 'Đang tải lên…', sample: 'Hoặc dùng sách mẫu (đội LessonBloom tự viết):', toan: 'Toán 2', maths: 'Maths 2 (tiếng Anh)', eng: 'Tiếng Anh 3' },
  },
  en: {
    title: 'Knowledge', lead: 'Lessons come only from these sources, with their pages.', add: '+ Add a source', private: '🔒 Only you can see these; nothing is shared.', all: 'All', math: 'Maths', english: 'English',
    sources: (n: number) => `${pl(n, 'source')}`, reading: (n: number) => `${n} reading`, ready: 'Ready', grade: (g: number) => `Grade ${g}`, pages: (n: number) => `${pl(n, 'page')}`,
    status: { processing: 'Reading…', ready: 'Ready', error: 'Error' }, errors: { interrupted: 'Reading was interrupted by a server restart; the held credits were given back. Remove this source and add it again.', scanned: 'The file is scanned pictures. Remove this source and add the file again: the app will read each page picture (with a credit estimate first).', failed: 'This file could not be read.', stopped: 'You stopped the reading, so the book was not added; the unused credits came back.', credits: 'The held credits were not enough to read the whole book, so it was not added (LessonBloom keeps no part of a book); the unused credits came back.', unreadable: 'No text could be read on these pages. Check the pictures are clear and the right way up, then remove and add them again.', blocked: 'This content cannot be used.' },
    view: 'Open', remove: 'Remove', removeAsk: 'Remove this source? Lessons already made stay.', parts: (n: number) => `Parts (${n})`, partsLead: 'Each lesson uses one part as the limit of what it teaches.',
    page: (p: string) => `Pages ${p}`, used: (n: number) => `Used in ${pl(n, 'lesson')}`, rename: 'Rename', source: 'View source', mapTab: 'Knowledge map', split: 'Split', make: 'Make lesson', seeAll: (n: number) => `See all ${pl(n, 'part')}`, merge: 'Merge parts', mergeHint: 'Pick a part to merge it with the next one.',
    splitAt: 'Split from page', newTitle: 'New part name', ok: 'Save', cancel: 'Cancel', none: 'No sources yet. Add a PDF book or use a sample book.',
    st: { waiting: (n: number) => `Waiting (number ${n} in your line): it is read when the job before is done.`, reading: 'Reading the book: finding the lessons, reading each page…', readingPage: (p: string) => `Reading the book · page ${p}`, leave: 'You can leave this page; the bell tells you when it is done.',
      done: (title: string, n: number, p: number) => `Added: ${title} · ${pl(n, 'lesson')} · ${pl(p, 'page')}.`, retry: 'Try again', again: 'Remove and add again' },
    form: { title: 'Add a source', name: 'Name', namePh: 'e.g. Maths 2 · Book 1', subject: 'Subject', grade: 'Grade', file: 'PDF file with text (up to 30 MB)', tooBig: (mb: number) => `This file is ${mb} MB, over 30 MB. Split the book into chapters and upload them one by one.`, sent: (p: number) => `Uploading… ${p}%`, go: 'Upload', busy: 'Uploading…', sample: 'Or use a sample book (written by the LessonBloom team):', toan: 'Toán 2 (Vietnamese)', maths: 'Maths 2', eng: 'English 3' },
  },
};

export function Knowledge() {
  const t = useT(T), lang = useLang();
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [subject, setSubject] = useState<'' | 'math' | 'english'>(''), [grade, setGrade] = useState(0);
  const [fold, setFold] = useState<Record<string, boolean>>({}), [sel, setSel] = useState(''), [sections, setSections] = useState<SectionRow[]>([]), [all, setAll] = useState(false), [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'parts' | 'map'>('parts'), [source, setSource] = useState('');
  const [edit, setEdit] = useState<{ id: string; mode: 'rename' | 'split'; title: string; page: number } | null>(null), [pickMerge, setPickMerge] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const load = () => api.areas().then((r) => { setAreas(r.areas); setSel((s) => s || r.areas[0]?.id || ''); }).catch(() => setAreas([]));
  const loadSections = () => sel ? api.area(sel).then((r) => setSections(r.sections)).catch(() => setSections([])) : Promise.resolve();
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!areas?.some((a) => a.books.some((b) => b.status === 'processing'))) return; const id = setTimeout(load, 2000); return () => clearTimeout(id); }, [areas]);
  useEffect(() => { void loadSections(); setAll(false); setEdit(null); setPickMerge(''); }, [sel, areas]);
  useEffect(() => { setSource(''); }, [sel]);
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
      {!areas.length && !adding && <div className="card stack" style={{ gap: 8 }}><p className="muted">{t.none}</p>
        {/* the sample books right here, not only inside "Add a source" (Chi, 29 Oct) */}
        <div className="row">{(['maths2', 'english3', 'toan2'] as const).map((b) => <button key={b} className="btn small" disabled={!!busy} onClick={() => run('sample', async () => { const id = (await api.sampleArea(b)).area.id; await load(); setSel(id); })}>{b === 'maths2' ? t.form.maths : b === 'english3' ? t.form.eng : t.form.toan}</button>)}
          <button className="btn small primary" onClick={() => setAdding(true)}>{t.form.title}</button></div></div>}
      {areas.length > 0 && <div className="cols left">
        <div className="stack">
          {(['math', 'english'] as const).filter((s) => shown.some((x) => x.subject === s)).map((s) => { const list = shown.filter((x) => x.subject === s), reading = list.filter((x) => x.books.some((b) => b.status === 'processing')).length; return (
            <div key={s} className="card stack" style={{ gap: 8 }}>
              <button className="group-head" onClick={() => setFold({ ...fold, [s]: !(fold[s] ?? !list.some((x) => x.id === sel)) })}><span className="caret">{(fold[s] ?? !list.some((x) => x.id === sel)) ? '▸' : '▾'}</span><span className="grow"><b>{t[s]}</b><span className="small muted" style={{ display: 'block' }}>{t.sources(list.length)}</span></span>{reading ? <span className="tag next">{t.reading(reading)}</span> : <span className="tag done">{t.ready}</span>}</button>
              {!(fold[s] ?? !list.some((x) => x.id === sel)) && list.map((x) => { const b = x.books[0]; return (
                <button key={x.id} className={`list-row ${sel === x.id ? 'sel' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(x.id)}>
                  <span>📄</span><span className="grow"><b className="small">{x.name}</b><span className="small muted" style={{ display: 'block' }}>{t.grade(x.grade)}{b?.pages ? ` · ${t.pages(b.pages)}` : ''}</span>
                    <span className={`small ${b?.status === 'ready' ? 'ok-text' : b?.status === 'error' ? 'danger' : ''}`} style={{ display: 'block', color: b?.status === 'processing' ? 'var(--sun)' : undefined }}>● {b ? t.status[b.status] : '—'}</span></span>
                </button>
              ); })}
            </div>
          ); })}
        </div>
        {a && <div className="card stack" style={{ gap: 10 }}>
          <div className="row"><div className="grow"><h2>{a.name}</h2><span className="small muted">{t[a.subject]} · {t.grade(a.grade)} · {book?.source === 'scan' ? 'Scan' : book?.source === 'text' ? (lang === 'en' ? 'Text' : 'Chữ') : 'PDF'}{book?.pages ? ` · ${t.pages(book.pages)}` : ''}</span></div>
            {/* only an uploaded PDF is kept on the server; a book read in the browser left only its text */}
            {book && (book.source ?? 'pdf') === 'pdf' && <a className="btn small" href={`/api/t/books/${book.id}/file`} target="_blank" rel="noreferrer">{t.view}</a>}
            <button className="btn small danger" onClick={() => { if (confirm(t.removeAsk)) void run('del', async () => { await api.deleteArea(a.id); setSel(''); await load(); }); }}>{t.remove}</button></div>
          {book && <BookStatus t={t} book={book} sections={sections.length} onChange={load} onAgain={async () => { await api.deleteArea(a.id).catch(() => {}); setSel(''); await load(); setAdding(true); }} />}
          <div className="row" role="tablist">{(['parts', 'map'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`pill ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{k === 'parts' ? t.parts(sections.length) : t.mapTab}</button>)}</div>
          {source && <SourceView sectionId={source} onClose={() => setSource('')} />}
          {tab === 'map' && <KnowledgeMapView areaId={a.id} onSource={(id) => setSource(id)} />}
          {tab === 'parts' && <>
          <p className="small muted">{t.partsLead}</p>
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
                <button className="btn small" onClick={(e) => { e.stopPropagation(); setSource(s.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t.source}</button>
                <button className="btn small" onClick={(e) => { e.stopPropagation(); setEdit({ id: s.id, mode: 'rename', title: s.title, page: 0 }); }}>{t.rename}</button>
                <button className="btn small" disabled={s.page_to <= s.page_from} onClick={(e) => { e.stopPropagation(); setEdit({ id: s.id, mode: 'split', title: '', page: s.page_from + 1 }); }}>{t.split}</button>
                <button className="btn primary small" onClick={(e) => { e.stopPropagation(); go(`/new?area=${a.id}&section=${s.id}`); }}>{t.make}</button>
              </>}
            </div>
          ))}
          <div className="row">{sections.length > 6 && !all && <button className="link small" onClick={() => setAll(true)}>{t.seeAll(sections.length)}</button>}<span className="grow" />
            {sections.length > 1 && <button className="btn small" onClick={() => setPickMerge(pickMerge ? '' : 'pick')}>{pickMerge ? t.cancel : t.merge}</button>}</div>
          </>}
          {err && <p className="note">{err}</p>}
        </div>}
      </div>}
    </div>
  );
}

// #17 (Chi): where her book is: waiting in her line, being read (page k/N), added (lessons, pages), or
// the reason it failed with Try again. Kept on the server, so it is the same after a reload.
function BookStatus({ t, book, sections, onChange, onAgain }: { t: (typeof T)['vi']; book: BookRow; sections: number; onChange: () => void; onAgain: () => void }) {
  const lang = useLang(), [job, setJob] = useState<Job | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (book.status !== 'processing') { setJob(null); return; }
    let alive = true, h = 0;
    const tick = async () => { const r = await api.jobs().catch(() => null); if (!alive) return; setJob(r?.jobs.find((j) => j.ref === book.id && (j.status === 'queued' || j.status === 'running')) ?? null); h = window.setTimeout(tick, 2500); };
    void tick();
    return () => { alive = false; clearTimeout(h); };
  }, [book.id, book.status]);
  if (book.status === 'ready') return <p className="banner small">✓ {t.st.done(book.title, book.sections ?? sections, book.pages)}</p>;
  if (book.status === 'processing') {
    const pg = job?.status === 'running' && /^(\d+)\/(\d+)$/.exec(job.progress);
    return (
      <div className="banner blue small stack" style={{ gap: 6 }} role="status">
        <span>{job?.status === 'queued' ? t.st.waiting(job.place) : pg ? t.st.readingPage(job!.progress) : t.st.reading}</span>
        {pg && <span className="meter" style={{ width: '100%' }}><i style={{ width: `${(Number(pg[1]) / Math.max(1, Number(pg[2]))) * 100}%` }} /></span>}
        <span className="muted">{t.st.leave}</span>
      </div>
    );
  }
  const canRetry = (book.source ?? 'pdf') === 'pdf' && book.error !== 'scanned';
  return (
    <div className="note stack" style={{ gap: 6 }}>
      <span>{book.source === 'scan' && book.error === 'scanned' ? t.errors.unreadable : t.errors[book.error as keyof typeof t.errors] ?? t.errors.failed}</span>
      <div className="row">
        {canRetry && <button className="btn small primary" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api.retryBook(book.id); window.dispatchEvent(new Event('lbm-jobs')); onChange(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); } }}>{t.st.retry}</button>}
        <button className="btn small" disabled={busy} onClick={onAgain}>{t.st.again}</button>
      </div>
      {err && <span className="small">{err}</span>}
    </div>
  );
}

// "Thêm nguồn": the PDF is opened right here in the browser (it never leaves her computer). A text PDF
// up to 30 MB is uploaded as before (so it can be opened later); a bigger one sends only its text. A
// scanned book: she picks the pages, sees the estimate and what she must have (50% more), then each
// page is drawn as a picture and sent; the reading runs in her line of jobs (one at a time).
const R = {
  vi: { file: 'Tệp PDF (bao nhiêu MB cũng được) hoặc ảnh chụp các trang sách (JPG, PNG, WEBP, HEIC)', wrong: 'Kho kiến thức nhận một tệp PDF, hoặc ảnh chụp các trang sách (JPG, PNG, WEBP, HEIC).', mixed: 'Cô chọn một tệp PDF, hoặc chỉ chọn ảnh, đừng chọn lẫn cả hai nhé.',
    photos: (n: number) => `${n} ảnh trang sách · mỗi ảnh là một trang`, first: 'Ảnh đầu tiên là trang số', photoBad: (name: string) => `Không mở được ảnh "${name}" trên trình duyệt này. Ảnh HEIC từ iPhone: cô mở bằng Safari, hoặc gửi ảnh dạng JPG nhé.`, tooMany: (n: number) => `Tối đa ${n} ảnh mỗi lần.`, retry: 'Thử lại', opening: 'Đang mở tệp trên máy của cô…', info: (n: number, text: boolean) => `${n} trang · ${text ? 'sách có chữ' : 'sách dạng ảnh (scan)'}`, notPdf: 'Tệp này không phải PDF. Cô chọn tệp PDF hoặc ảnh trang sách nhé.', raw: 'Trình duyệt này không mở được PDF ngay tại đây, nên tệp được gửi vào nơi lưu riêng của cô và đọc trên máy chủ. Sách scan sẽ hiện dự kiến lượt trước khi đọc.', browserBig: 'Trình duyệt này không mở được PDF này, và tệp lớn hơn 30 MB nên không tải lên nguyên tệp được. Cô thử Chrome hoặc Edge, hoặc gửi ảnh các trang nhé.',
    from: 'Từ trang', to: 'đến trang', max: (n: number) => `tối đa ${n} trang mỗi lần`,
    est: (e: ScanEstimate) => `${e.pages} trang · dự kiến khoảng ${e.predicted} lượt · cần có ít nhất ${e.need} lượt (dư 50%) · cô còn ${e.have} lượt`,
    read: (n: number, need: number) => `Đọc ${n} trang (giữ ${need} lượt, trả lại phần thừa)`, short: (n: number) => `Còn thiếu ${n} lượt, nên chưa đọc được sách này. App không đọc một phần sách.`, fit: (n: number) => `Chỉ đọc ${n} trang đầu`, promo: 'Có mã khuyến mãi thì nhập ở trang Lượt dùng (menu tên, góc phải) để có thêm lượt, rồi đọc lại.',
    textOut: (k: number, n: number) => `Đang lấy chữ trang ${k}/${n}…`, sending: (k: number, n: number) => `Đang gửi trang ${k}/${n}…`, queued: 'Đã đưa vào hàng đợi. Xem tiến độ ở ô "Đang làm" trên thanh trên.', add: 'Thêm vào kho' },
  en: { file: 'A PDF (any size) or photos of the book pages (JPG, PNG, WEBP, HEIC)', wrong: 'Knowledge takes one PDF, or photos of book pages (JPG, PNG, WEBP, HEIC).', mixed: 'Choose one PDF, or only photos, not both.',
    photos: (n: number) => `${pl(n, 'photo')} of book pages · each photo is one page`, first: 'The first photo is page', photoBad: (name: string) => `The photo "${name}" could not be opened in this browser. For HEIC photos from an iPhone, use Safari or send them as JPG.`, tooMany: (n: number) => `Up to ${n} photos at a time.`, retry: 'Try again', opening: 'Opening the file on your computer…', info: (n: number, text: boolean) => `${pl(n, 'page')} · ${text ? 'a book with text' : 'a scanned book (pictures)'}`, notPdf: 'This file is not a PDF. Please choose a PDF or photos of the book pages.', raw: 'This browser cannot open the PDF here, so the file goes to your private storage and is read on our server. A scanned book shows the credit estimate before it is read.', browserBig: 'This browser cannot open this PDF, and it is over 30 MB, so it cannot be uploaded whole. Try Chrome or Edge, or send photos of the pages.',
    from: 'From page', to: 'to page', max: (n: number) => `up to ${n} pages at a time`,
    est: (e: ScanEstimate) => `${pl(e.pages, 'page')} · about ${pl(e.predicted, 'credit')} · you need at least ${e.need} (50% more) · you have ${e.have}`,
    read: (n: number, need: number) => `Read ${pl(n, 'page')} (holds ${pl(need, 'credit')}, the rest comes back)`, short: (n: number) => `${pl(n, 'credit')} short, so this book cannot be read yet. LessonBloom does not read part of a book.`, fit: (n: number) => `Read only the first ${pl(n, 'page')}`, promo: 'If you have a promo code, enter it on the Usage page (the menu under your name, top right) for more credits, then read it again.',
    textOut: (k: number, n: number) => `Reading the text of page ${k}/${n}…`, sending: (k: number, n: number) => `Sending page ${k}/${n}…`, queued: 'Added to your line of jobs. See it under "Working on" in the top bar.', add: 'Add to the library' },
};

function AddSource({ t, onDone }: { t: (typeof T)['vi']; onDone: (areaId?: string) => void }) {
  const lang = useLang(), r = R[lang];
  const [f, setF] = useState({ name: '', subject: 'math', grade: 2 }), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [sent, setSent] = useState<number | null>(null);
  const [info, setInfo] = useState<{ pages: number; text: boolean; raw?: boolean } | null>(null), [opening, setOpening] = useState(false), [range, setRange] = useState({ from: 1, to: 1 }), [est, setEst] = useState<ScanEstimate | null>(null), [step, setStep] = useState('');
  const doc = useRef<PDFDocumentProxy | null>(null), [photos, setPhotos] = useState<File[] | null>(null), [server, setServer] = useState<{ areaId: string; bookId: string } | null>(null);
  const msg = (e: unknown) => (e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error)?.message || e));
  const run = async (fn: () => Promise<string | undefined>) => { setBusy(true); setErr(''); try { onDone(await fn()); } catch (e) { setErr(msg(e)); } finally { setBusy(false); setStep(''); setSent(null); } };
  const title = () => f.name.trim() || (file?.name || photos?.[0]?.name || '').replace(/\.(pdf|jpe?g|png|webp|heic|heif)$/i, '');
  const isImage = (x: File) => /^image\//.test(x.type) || /\.(heic|heif)$/i.test(x.name);
  // one PDF, or photos of the pages (#18, Chi): each photo is one page, read like a scanned book
  const pick = (list: File[]) => {
    setPhotos(null);
    if (list.length && list.every(isImage)) {
      setFile(null); setEst(null); doc.current = null;
      if (list.length > config.maxPages) { setInfo(null); setErr(r.tooMany(config.maxPages)); return; }
      setErr(''); setPhotos(list); setInfo({ pages: list.length, text: false }); setRange({ from: 1, to: list.length });
      return;
    }
    if (list.length > 1) { setFile(null); setInfo(null); setErr(list.some((x) => x.type === 'application/pdf') && list.some(isImage) ? r.mixed : r.wrong); return; }
    if (list[0] && list[0].type !== 'application/pdf' && !/\.pdf$/i.test(list[0].name)) { setFile(null); setInfo(null); setErr(r.wrong); return; }
    void choose(list[0] || null);
  };
  const choose = async (x: File | null) => {
    setFile(x); setInfo(null); setEst(null); setErr(''); setServer(null); doc.current = null;
    if (!x) return;
    setOpening(true);
    try { const d = await openPdf(x); doc.current = d; const text = await hasText(d); setInfo({ pages: d.numPages, text }); setRange({ from: 1, to: Math.min(d.numPages, config.maxPages) }); }
    catch (e) {
      console.warn('[pdf] could not open in this browser:', e);
      // not a PDF at all; or a real PDF this browser could not open here: then upload it as it is (up to
      // 30 MB) and the server reads it, as before 29 Oct; bigger, it says what to do instead
      if (!(await looksLikePdf(x).catch(() => false))) setErr(r.notPdf);
      else setInfo({ pages: 0, text: true, raw: true });
    } finally { setOpening(false); }
  };
  const count = Math.max(0, range.to - range.from + 1);
  useEffect(() => { if (!info || info.text || count < 1) { setEst(null); return; } const h = setTimeout(() => { api.scanEstimate(count).then((x) => setEst(x.estimate)).catch(() => setEst(null)); }, 250); return () => clearTimeout(h); }, [info, range.from, range.to]);
  const withArea = async (fn: (areaId: string) => Promise<void>) => {
    const { area } = await api.createArea({ ...f, name: title() });
    try { await fn(area.id); } catch (e) { await api.deleteArea(area.id).catch(() => {}); throw e; }
    window.dispatchEvent(new Event('lbm-jobs'));
    return area.id;
  };
  const submit = () => {
    if (photos && info) return run(() => withArea(async (id) => {
      const want = photos.map((_, k) => range.from + k);
      const { book } = await api.scanCreate(id, title(), want).catch((e) => { if (e instanceof ApiError && e.body.estimate) setEst(e.body.estimate as ScanEstimate); throw e; });
      for (const [k, n] of want.entries()) {
        setStep(r.sending(k + 1, want.length));
        const jpeg = await photoJpeg(photos[k]).catch(() => { throw new Error(r.photoBad(photos[k].name)); });
        await api.scanPage(book.id, n, jpeg);
      }
      await api.scanStart(book.id);
    }));
    if (!file || !info) return;
    // read on our server from her original in R2 (#20: a PDF this browser cannot open, of any size)
    if (info.raw && server) return run(async () => { await api.originalScan(server.bookId, Array.from({ length: count }, (_, k) => range.from + k)); window.dispatchEvent(new Event('lbm-jobs')); return server.areaId; });
    if (info.raw) return (async () => {
      setBusy(true); setErr('');
      const { area } = await api.createArea({ ...f, name: title() }).catch((e) => { setErr(msg(e)); setBusy(false); throw e; });
      try {
        const o = await api.originalStart(area.id, file.size, title());
        setSent(0); await putSigned(o.url, file, 'application/pdf', (x) => setSent(Math.round(x * 100))); setSent(null);
        const d = await api.originalDone(o.book.id, true);
        if (d.text) { window.dispatchEvent(new Event('lbm-jobs')); onDone(area.id); return; }
        setServer({ areaId: area.id, bookId: o.book.id }); setInfo({ pages: d.pages ?? 0, text: false, raw: true }); setRange({ from: 1, to: Math.min(d.pages ?? 1, config.maxPages) });
      } catch (e) {
        // no R2 yet: a file up to 30 MB is uploaded as before; bigger, she is told what to do
        if (e instanceof ApiError && e.code === 'storageOff' && file.size <= MAX_PDF) {
          try { setSent(0); await api.uploadBook(area.id, file, title(), (x) => setSent(Math.round(x * 100))); window.dispatchEvent(new Event('lbm-jobs')); onDone(area.id); return; } catch (e2) { e = e2; }
        }
        await api.deleteArea(area.id).catch(() => {});
        setErr(e instanceof ApiError && e.code === 'storageOff' ? r.browserBig : msg(e));
      } finally { setBusy(false); setSent(null); }
    })().catch(() => {});
    if (info.text && file.size <= MAX_PDF) return run(() => withArea(async (id) => { setSent(0); await api.uploadBook(id, file, title(), (x) => setSent(Math.round(x * 100))); }));
    if (info.text) return run(() => withArea(async (id) => {
      const pages: { page: number; text: string }[] = [];
      for (let n = 1; n <= Math.min(info.pages, 400); n++) { setStep(r.textOut(n, info.pages)); pages.push({ page: n, text: await pageText(doc.current!, n) }); }
      const { book } = await api.bookText(id, title(), pages);
      // its original kept privately so it can be seen again (skipped quietly if storage is off or full)
      try { const o = await api.originalStart(id, file.size, undefined, book.id); setStep(''); setSent(0); await putSigned(o.url, file, 'application/pdf', (x) => setSent(Math.round(x * 100))); await api.originalDone(book.id, false); } catch { /* the text is in; only the original is not kept */ }
    }));
    return run(() => withArea(async (id) => {
      const want = Array.from({ length: count }, (_, k) => range.from + k);
      const { book } = await api.scanCreate(id, title(), want).catch((e) => { if (e instanceof ApiError && e.body.estimate) setEst(e.body.estimate as ScanEstimate); throw e; });
      for (const [k, n] of want.entries()) { setStep(r.sending(k + 1, want.length)); await api.scanPage(book.id, n, await pageJpeg(doc.current!, n)); }
      await api.scanStart(book.id);
    }));
  };
  return (
    <form className="card stack" style={{ marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <b>{t.form.title}</b>
      <div className="grid2">
        <label className="field">{t.form.name}<input value={f.name} maxLength={80} placeholder={t.form.namePh} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">{r.file}<input type="file" multiple accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={busy} onChange={(e) => pick([...(e.target.files || [])])} /></label>
        <label className="field">{t.form.subject}<select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="math">{t.math}</option><option value="english">{t.english}</option></select></label>
        <label className="field">{t.form.grade}<select value={f.grade} onChange={(e) => setF({ ...f, grade: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{t.grade(g)}</option>)}</select></label>
      </div>
      {opening && <p className="small muted" role="status">{r.opening}</p>}
      {info && (photos ? <p className="small"><b>{r.photos(photos.length)}</b></p> : info.raw && !server ? <p className="banner blue small"><b>{file?.name}</b> · {r.raw}</p> : <p className="small"><b>{file?.name}</b> · {r.info(info.pages, info.text)}</p>)}
      {info && !info.text && <div className="card stack" style={{ gap: 8, background: 'var(--leaf-2)' }}>
        {photos ? <div className="row small"><label>{r.first} <input type="number" min={1} max={2000} value={range.from} style={{ width: 80 }} onChange={(e) => { const v = Math.max(1, Math.min(2000, Number(e.target.value) || 1)); setRange({ from: v, to: v + photos.length - 1 }); }} /></label></div>
        : <div className="row small">
          <label>{r.from} <input type="number" min={1} max={info.pages} value={range.from} style={{ width: 80 }} onChange={(e) => { const v = Math.max(1, Math.min(info.pages, Number(e.target.value) || 1)); setRange({ from: v, to: Math.max(v, Math.min(range.to, v + config.maxPages - 1)) }); }} /></label>
          <label>{r.to} <input type="number" min={range.from} max={info.pages} value={range.to} style={{ width: 80 }} onChange={(e) => { const v = Math.max(range.from, Math.min(info.pages, Number(e.target.value) || range.from)); setRange({ ...range, to: Math.min(v, range.from + config.maxPages - 1) }); }} /></label>
          <span className="muted">{r.max(config.maxPages)}</span>
        </div>}
        {est && <p className="small" role="status">{r.est(est)}</p>}
        {est && !est.enough && <div className="stack" style={{ gap: 6 }}><b className="small danger">{r.short(est.need - est.have)}</b>
          
          <span className="small muted">{r.promo}</span></div>}
      </div>}
      {sent !== null && <div className="stack" style={{ gap: 4 }} role="status"><span className="small muted">{t.form.sent(sent)}</span><span className="meter" style={{ width: '100%' }}><i style={{ width: `${sent}%` }} /></span></div>}
      {step && <p className="small muted" role="status">{step}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy || !info || (!info.text && !est?.enough)}>{busy ? t.form.busy : info && !info.text && est ? r.read(count, est.need) : err && info ? r.retry : r.add}</button><span className="grow" />
        <span className="small muted">{t.form.sample}</span>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('maths2')).area.id)}>{t.form.maths}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('english3')).area.id)}>{t.form.eng}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('toan2')).area.id)}>{t.form.toan}</button></div>
      {err && <p className="note">{err}</p>}
    </form>
  );
}

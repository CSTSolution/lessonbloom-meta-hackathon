// "Kho kiến thức" (Chi's design): sources grouped by subject, filtered subject → grade; the chosen
// source on the right with its parts ("phạm vi kiến thức"), each with its pages and how many lessons
// use it, and Đổi tên / Tách / Tạo bài, plus Gộp phạm vi. The add form shows only when asked for.
// Private to the assigner (textbook copyright); the demo uses the team's own sample books.
import { useEffect, useRef, useState } from 'react';
import { api, MAX_PDF, ApiError, putSigned, type AreaRow, type BookRow, type Job, type ScanEstimate, type SectionRow } from '../api.ts';
import { hasText, looksLikePdf, openPdf, pageJpeg, pageText } from '../pdf.ts';
import { photoJpeg } from '../photo.ts';
import { guessSubject, type Guess } from '../guess.ts';
import { KnowledgeMapView, pagesOf, SourceView } from './Sources.tsx';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const config = { maxPages: 200 };   // pages a scanned book reads at a time (the server's limit too)
import { pl, useLang, useT } from '../i18n.ts';
import { ask, choose as twoWays } from '../ask.tsx';
import { ChromeLine } from './ChromeNote.tsx';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Kho kiến thức', lead: 'Bài chỉ soạn từ các nguồn này, ghi rõ trang.', add: '+ Thêm nguồn kiến thức', private: 'Chỉ bạn xem được, không chia sẻ.', all: 'Tất cả', math: 'Toán', english: 'Tiếng Anh',
    sources: (n: number) => `${n} nguồn`, reading: (n: number) => `${n} đang đọc`, ready: 'Sẵn sàng', grade: (g: number) => `Lớp ${g}`, pages: (n: number) => `${n} trang`,
    status: { processing: 'Đang đọc tài liệu…', ready: 'Sẵn sàng', error: 'Lỗi' }, errors: { interrupted: 'Việc đọc sách bị ngắt khi máy chủ khởi động lại; lượt đã giữ được trả lại. Cô xoá nguồn này rồi thêm lại nhé.', scanned: 'Tài liệu là ảnh chụp. Cô xoá nguồn này rồi thêm lại tệp: app sẽ đọc từng trang ảnh (có dự kiến lượt trước).', failed: 'Chưa đọc được tệp này.', stopped: 'Cô đã dừng việc đọc, nên sách không được thêm; lượt chưa dùng đã được trả lại.', credits: 'Lượt đã giữ không đủ để đọc hết sách, nên sách không được thêm (app không giữ một phần sách); lượt chưa dùng đã được trả lại.', unreadable: 'Không đọc được chữ trên các trang này. Cô xem ảnh có rõ, đúng chiều không, rồi xoá và thêm lại nhé.', blocked: 'Nội dung không dùng được.' },
    view: 'Xem tài liệu', remove: 'Xoá khỏi kho', removeAsk: 'Xoá nguồn này khỏi kho? Bài đã soạn vẫn còn.', parts: (n: number) => `Phạm vi kiến thức (${n})`, partsLead: 'Mỗi bài chỉ chọn một phạm vi làm giới hạn kiến thức.',
    page: (p: string) => `Trang ${p}`, used: (n: number) => `Đang dùng trong ${n} bài`, rename: 'Đổi tên', source: 'Xem nguồn', mapTab: 'Bản đồ kiến thức', split: 'Tách', make: 'Tạo bài', seeAll: (n: number) => `Xem cả ${n} phạm vi`, merge: 'Gộp phạm vi', mergeHint: 'Chọn một phạm vi để gộp với phạm vi ngay sau nó.',
    splitAt: 'Tách từ trang', newTitle: 'Tên phần mới', inFile: (n: number) => `trang ${n} trong file`,
    oneLesson: 'Sách này chưa chia được bài, bạn tách tay theo trang: bấm "Tách" và chọn trang bắt đầu bài tiếp theo.',
    pageOneAsk: 'Số trang khác sách giấy?', pageOne: 'Trang 1 của sách là trang', pageOneEnd: 'trong file', pageOneHint: 'App chưa đọc được số trang in trong sách, nên đang ghi theo vị trí trong file. Cho biết trang 1 của sách nằm ở đâu để số trang khớp sách giấy.', pageOneSaved: 'Đã lưu: số trang theo sách giấy.', ok: 'Lưu', cancel: 'Huỷ', none: 'Chưa có nguồn nào. Tải sách của bạn: PDF hoặc ảnh trang sách.', orSample: 'Hoặc thử nhanh với sách mẫu do LessonBloom soạn:', noneHere: (s: string) => `Chưa có nguồn ${s} nào. Bấm "+ Thêm nguồn kiến thức" hoặc chọn "Tất cả".`,
    st: { waiting: (n: number) => `Đang chờ (thứ ${n} trong hàng): sẽ đọc khi xong việc đang làm.`, reading: 'Đang đọc sách: tách bài, đọc chữ từng trang…', readingPage: (p: string) => `Đang đọc sách · trang ${p}`, leave: 'Cô có thể rời trang; đọc xong sẽ có thông báo ở chuông.',
      done: (title: string, n: number, p: number) => `Đã thêm: ${title} · ${n} bài · ${p} trang.`, cost: (u: number, r: number) => ` Đã dùng ${u} lượt · trả lại ${r} lượt.`, retry: 'Thử lại', again: 'Xoá và thêm lại',
      resplit: 'Đọc lại để tách bài', resplitLead: 'Sách này chưa chia được bài (đọc trước khi app nhận tiêu đề không đánh số). Đọc lại để tách thành từng bài.', resplitAsk: (n: number, p: number, h: number) => `Đọc lại ${n} trang từ ảnh đã lưu: dự kiến khoảng ${p} lượt (giữ ${h} lượt, trả lại phần thừa). Các phần cũ của sách sẽ được thay; bài giảng đã soạn vẫn giữ nguyên.`, resplitGo: 'Đọc lại' },
    form: { title: 'Thêm nguồn kiến thức', name: 'Tên nguồn', namePh: 'Ví dụ: Toán 2 · Tập 1', subject: 'Môn', grade: 'Lớp', file: 'Tệp PDF có chữ (tối đa 30 MB)', tooBig: (mb: number) => `Tệp này ${mb} MB, quá 30 MB. Cô tách sách ra từng chương rồi tải từng phần nhé.`, sent: (p: number) => `Đang tải lên… ${p}%`, go: 'Tải lên', busy: 'Đang tải lên…', chooseSubject: 'Chọn môn', supported: 'Hiện hỗ trợ Toán và Tiếng Anh lớp 1–5', guessed: (s: string) => `Máy đoán: ${s} – sửa nếu sai`, needSubject: 'Chọn môn trước khi thêm vào kho.', sample: 'Hoặc dùng sách mẫu (đội LessonBloom tự viết):', toan: 'Toán 2', maths: 'Maths 2 (tiếng Anh)', eng: 'Tiếng Anh 3' },
  },
  en: {
    title: 'Knowledge', lead: 'Lessons come only from these sources, with their pages.', add: '+ Add a source', private: 'Only you can see these; nothing is shared.', all: 'All', math: 'Maths', english: 'English',
    sources: (n: number) => `${pl(n, 'source')}`, reading: (n: number) => `${n} reading`, ready: 'Ready', grade: (g: number) => `Grade ${g}`, pages: (n: number) => `${pl(n, 'page')}`,
    status: { processing: 'Reading…', ready: 'Ready', error: 'Error' }, errors: { interrupted: 'Reading was interrupted by a server restart; the held credits were given back. Remove this source and add it again.', scanned: 'The file is scanned pictures. Remove this source and add the file again: the app will read each page picture (with a credit estimate first).', failed: 'This file could not be read.', stopped: 'You stopped the reading, so the book was not added; the unused credits came back.', credits: 'The held credits were not enough to read the whole book, so it was not added (LessonBloom keeps no part of a book); the unused credits came back.', unreadable: 'No text could be read on these pages. Check the pictures are clear and the right way up, then remove and add them again.', blocked: 'This content cannot be used.' },
    view: 'Open', remove: 'Remove', removeAsk: 'Remove this source? Lessons already made stay.', parts: (n: number) => `Parts (${n})`, partsLead: 'Each lesson uses one part as the limit of what it teaches.',
    page: (p: string) => `Pages ${p}`, used: (n: number) => `Used in ${pl(n, 'lesson')}`, rename: 'Rename', source: 'View source', mapTab: 'Knowledge map', split: 'Split', make: 'Make lesson', seeAll: (n: number) => `See all ${pl(n, 'part')}`, merge: 'Merge parts', mergeHint: 'Pick a part to merge it with the next one.',
    splitAt: 'Split from page', newTitle: 'New part name', inFile: (n: number) => `page ${n} in the file`,
    oneLesson: 'This book could not be split into lessons; split it by page: press "Split" and choose the page where the next lesson starts.',
    pageOneAsk: 'Page numbers differ from the paper book?', pageOne: 'Page 1 of the book is page', pageOneEnd: 'in the file', pageOneHint: 'The printed page numbers could not be read, so pages are counted as in the file. Say where the book\'s page 1 is so the numbers match the paper book.', pageOneSaved: 'Saved: pages follow the paper book.', ok: 'Save', cancel: 'Cancel', none: 'No sources yet. Upload your book: a PDF or photos of its pages.', orSample: 'Or try it quickly with a sample book written by LessonBloom:', noneHere: (s: string) => `No ${s} sources yet. Press "+ Add a source" or choose "All".`,
    st: { waiting: (n: number) => `Waiting (number ${n} in your line): it is read when the job before is done.`, reading: 'Reading the book: finding the lessons, reading each page…', readingPage: (p: string) => `Reading the book · page ${p}`, leave: 'You can leave this page; the bell tells you when it is done.',
      done: (title: string, n: number, p: number) => `Added: ${title} · ${pl(n, 'lesson')} · ${pl(p, 'page')}.`, cost: (u: number, r: number) => ` Used ${pl(u, 'credit')} · ${r} given back.`, retry: 'Try again', again: 'Remove and add again',
      resplit: 'Read again to split into lessons', resplitLead: 'This book is not split into lessons yet (it was read before the app knew titles with no number). Read it again to split it.', resplitAsk: (n: number, p: number, h: number) => `Read the ${n} pages again from the kept pictures: about ${p} credits (holds ${h}, the rest comes back). The book\'s old parts are replaced; lessons already made stay as they are.`, resplitGo: 'Read again' },
    form: { title: 'Add a source', name: 'Name', namePh: 'e.g. Maths 2 · Book 1', subject: 'Subject', grade: 'Grade', file: 'PDF file with text (up to 30 MB)', tooBig: (mb: number) => `This file is ${mb} MB, over 30 MB. Split the book into chapters and upload them one by one.`, sent: (p: number) => `Uploading… ${p}%`, go: 'Upload', busy: 'Uploading…', chooseSubject: 'Choose a subject', supported: 'Maths and English, grades 1–5, for now', guessed: (s: string) => `Guessed: ${s} – change it if wrong`, needSubject: 'Choose the subject before adding it.', sample: 'Or use a sample book (written by the LessonBloom team):', toan: 'Toán 2 (Vietnamese)', maths: 'Maths 2', eng: 'English 3' },
  },
};

export function Knowledge() {
  const t = useT(T), lang = useLang();
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [subject, setSubject] = useState<'' | 'math' | 'english'>(''), [grade, setGrade] = useState(0);
  const [fold, setFold] = useState<Record<string, boolean>>({}), [sel, setSel] = useState(''), [sections, setSections] = useState<SectionRow[]>([]), [all, setAll] = useState(false);
  // "/knowledge?add=1" opens the add form at once: the way in from an empty "+ New lesson" (Chi #39)
  const [adding, setAdding] = useState(() => new URLSearchParams(location.search).has('add'));
  const [tab, setTab] = useState<'parts' | 'map'>('parts'), [source, setSource] = useState('');
  const [edit, setEdit] = useState<{ id: string; mode: 'rename' | 'split'; title: string; page: number } | null>(null), [pickMerge, setPickMerge] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState('');
  // only the newest answer is shown: a poll sent before a delete and answered after it put the source back (Chi #51c)
  const seq = useRef(0);
  const load = () => { const n = ++seq.current; return api.areas().then((r) => { if (n !== seq.current) return; setAreas(r.areas); setSel((s) => s || r.areas[0]?.id || ''); }).catch(() => { if (n === seq.current) setAreas([]); }); };
  const gone = async (id: string) => { setAreas((xs) => xs && xs.filter((x) => x.id !== id)); setSel(''); await load(); };
  const loadSections = () => sel ? api.area(sel).then((r) => setSections(r.sections)).catch(() => setSections([])) : Promise.resolve();
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!areas?.some((a) => a.books.some((b) => b.status === 'processing'))) return; const id = setTimeout(load, 2000); return () => clearTimeout(id); }, [areas]);
  useEffect(() => { void loadSections(); setAll(false); setEdit(null); setPickMerge(''); }, [sel, areas]);
  useEffect(() => { setSource(''); }, [sel]);
  useEffect(() => { if (!areas) return; const sh = areas.filter((x) => (!subject || x.subject === subject) && (!grade || x.grade === grade)); if (!sh.some((x) => x.id === sel)) setSel(sh[0]?.id || ''); }, [subject, grade, areas]);
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); } };
  if (!areas) return null;
  const shown = areas.filter((a) => (!subject || a.subject === subject) && (!grade || a.grade === grade));
  const grades = [...new Set(areas.filter((a) => !subject || a.subject === subject).map((a) => a.grade))].sort();
  // the panel on the right always belongs to the filter (Chi #22): a book outside it is not shown
  const a = shown.find((x) => x.id === sel), book = a?.books[0];
  const parts = all ? sections : sections.slice(0, 6);
  // a book of many pages read as one part: the lessons were not found, so Split is what she needs (Chi #48)
  const unsplit = book?.status === 'ready' && sections.length === 1 && sections[0].page_to - sections[0].page_from >= 4;
  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}><div className="grow"><h1>{t.title}</h1><p className="small muted">{t.lead}</p></div><button className="btn primary" onClick={() => setAdding(!adding)}>{t.add}</button></div>
      <div className="banner" style={{ marginBottom: 12 }}>{t.private}</div>
      {adding && <AddSource t={t} onDone={async (id) => { setAdding(false); await load(); if (id) setSel(id); }} />}
      <div className="row" style={{ marginBottom: 12 }}>
        {(['', 'math', 'english'] as const).map((s) => <button key={s} className={`pill ${subject === s ? 'on' : ''}`} onClick={() => { setSubject(s); setGrade(0); }}>{s ? t[s] : t.all}</button>)}
        {subject && grades.length > 1 && grades.map((g) => <button key={g} className={`pill ${grade === g ? 'on' : ''}`} onClick={() => setGrade(grade === g ? 0 : g)}>{t.grade(g)}</button>)}
      </div>
      {/* empty: her own book first, one big button alone; the sample books below, smaller, so they do not
          look like books she already has (Chi #27) */}
      {!areas.length && !adding && <div className="card stack" style={{ gap: 12 }}><p>{t.none}</p>
        <div><button className="btn primary lg" onClick={() => setAdding(true)}>{t.add}</button></div>
        <p className="small muted" style={{ marginTop: 8 }}>{t.orSample}</p>
        <div className="row">{(['maths2', 'english3', 'toan2'] as const).map((b) => <button key={b} className="btn small ghost" style={{ borderColor: 'var(--line)' }} disabled={!!busy} onClick={() => run('sample', async () => { const id = (await api.sampleArea(b)).area.id; await load(); setSel(id); })}>{b === 'maths2' ? t.form.maths : b === 'english3' ? t.form.eng : t.form.toan}</button>)}</div></div>}
      {areas.length > 0 && !shown.length && <div className="card"><p className="muted">{t.noneHere(subject ? t[subject] : '')}</p></div>}
      {shown.length > 0 && <div className="cols left">
        <div className="stack">
          {(['math', 'english'] as const).filter((s) => shown.some((x) => x.subject === s)).map((s) => { const list = shown.filter((x) => x.subject === s), reading = list.filter((x) => x.books.some((b) => b.status === 'processing')).length; return (
            <div key={s} className="card stack" style={{ gap: 8 }}>
              <button className="group-head" onClick={() => setFold({ ...fold, [s]: !(fold[s] ?? !list.some((x) => x.id === sel)) })}><span className="caret">{(fold[s] ?? !list.some((x) => x.id === sel)) ? '▸' : '▾'}</span><span className="grow"><b>{t[s]}</b><span className="small muted" style={{ display: 'block' }}>{t.sources(list.length)}</span></span>{reading ? <span className="tag next">{t.reading(reading)}</span> : <span className="tag done">{t.ready}</span>}</button>
              {!(fold[s] ?? !list.some((x) => x.id === sel)) && list.map((x) => { const b = x.books[0]; return (
                <button key={x.id} className={`list-row ${sel === x.id ? 'sel' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(x.id)}>
                  <span className="grow"><b className="small">{x.name}</b><span className="small muted" style={{ display: 'block' }}>{t.grade(x.grade)}{b?.pages ? ` · ${t.pages(b.pages)}` : ''}</span>
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
            <button className="btn small danger" onClick={async () => { if (await ask(t.removeAsk, { ok: t.remove, danger: true })) void run('del', async () => { await api.deleteArea(a.id); await gone(a.id); }); }}>{t.remove}</button></div>
          {book && <BookStatus t={t} book={book} sections={sections.length} onChange={load} onAgain={async () => { await api.deleteArea(a.id).catch(() => {}); await gone(a.id); setAdding(true); }} />}
          {book?.status === 'ready' && !book.printed && <PageOne key={book.id} t={t} book={book} onSaved={async () => { await load(); }} />}
          <div className="row" role="tablist">{(['parts', 'map'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`pill ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setSource(''); }}>{k === 'parts' ? t.parts(sections.length) : t.mapTab}</button>)}</div>
          {source && <SourceView sectionId={source} onClose={() => setSource('')} />}
          {/* drawn again when the book's parts change (a book still being read when the map opened) */}
          {tab === 'map' && <KnowledgeMapView key={`${a.id}:${book?.status}:${sections.length}`} areaId={a.id} onSource={(id) => setSource(id)} />}
          {tab === 'parts' && <>
          <p className="small muted">{t.partsLead}</p>
          {unsplit && <p className="banner blue small">{t.oneLesson}</p>}
          {pickMerge === 'pick' && <p className="banner blue">{t.mergeHint}</p>}
          {parts.map((s, i) => (
            <div key={s.id} className={`list-row ${s.lessons ? 'hl' : ''} ${pickMerge === 'pick' ? 'sel' : ''}`} style={pickMerge === 'pick' ? { cursor: 'pointer' } : undefined} onClick={() => { if (pickMerge === 'pick' && i < sections.length - 1) void run('merge', async () => { await api.mergeSection(s.id); setPickMerge(''); await loadSections(); }); }}>
              <span className="num">{i + 1}</span>
              {edit?.id === s.id ? (
                <form className="row grow" onSubmit={(e) => { e.preventDefault(); void run('edit', async () => { if (edit.mode === 'rename') await api.renameSection(s.id, edit.title); else await api.splitSection(s.id, edit.page, edit.title); setEdit(null); await loadSections(); }); }}>
                  {/* pages by the number printed in the book (Chi #45); the split itself is by the page in the file */}
                  {edit.mode === 'split' && <label className="small">{t.splitAt} <select value={edit.page} onChange={(e) => setEdit({ ...edit, page: Number(e.target.value) })}>
                    {Array.from({ length: s.page_to - s.page_from }, (_, k) => s.page_from + 1 + k).map((n) => { const p = s.printed?.[n - s.page_from]; return <option key={n} value={n}>{p != null && p !== n ? `${p} (${t.inFile(n)})` : n}</option>; })}</select></label>}
                  <input className="grow" autoFocus maxLength={120} placeholder={t.newTitle} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                  <button className="btn primary small" disabled={!edit.title.trim()}>{t.ok}</button><button type="button" className="btn ghost small" onClick={() => setEdit(null)}>{t.cancel}</button>
                </form>
              ) : <>
                <span className="grow"><b className="small">{s.title}</b><span className="small muted" style={{ display: 'block' }}>{t.page(pagesOf(s.page_from, s.page_to, s.printed_from, s.printed_to))}{s.lessons ? <> · <b className="ok-text">{t.used(s.lessons)}</b></> : ''}</span></span>
                <button className="btn small" onClick={(e) => { e.stopPropagation(); setSource(s.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t.source}</button>
                <button className="btn small" onClick={(e) => { e.stopPropagation(); setEdit({ id: s.id, mode: 'rename', title: s.title, page: 0 }); }}>{t.rename}</button>
                <button className={`btn small ${unsplit ? 'primary' : ''}`} disabled={s.page_to <= s.page_from} onClick={(e) => { e.stopPropagation(); setEdit({ id: s.id, mode: 'split', title: '', page: s.page_from + 1 }); }}>{t.split}</button>
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
  // one part for a book of several pages: read before unnumbered titles were known (Chi #48, #54d)
  const resplit = async () => {
    setBusy(true); setErr('');
    try {
      let r = await api.resplit(book.id);
      if (!r.ok && r.estimate) { if (!(await ask(t.st.resplitAsk(r.estimate.pages, r.estimate.predicted, r.estimate.need), { ok: t.st.resplitGo }))) return; r = await api.resplit(book.id, true); }
      window.dispatchEvent(new Event('lbm-jobs')); onChange();
    } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); }
  };
  if (book.status === 'ready') return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="banner small">✓ {t.st.done(book.title, book.sections ?? sections, book.pages)}{book.used != null ? t.st.cost(Number(book.used), Number(book.returned ?? 0)) : ''}</p>
      {(book.sections ?? sections) <= 1 && book.pages >= 4 && <div className="banner warn small row"><span className="grow">{t.st.resplitLead}</span><button className="btn small" disabled={busy} onClick={() => void resplit()}>{t.st.resplit}</button></div>}
      {err && <span className="small note">{err}</span>}
    </div>
  );
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

// No printed page numbers could be read from the book (Chi #45): she says once where its page 1 is in the
// file, and every page is then shown as in the paper book. Empty clears it.
function PageOne({ t, book, onSaved }: { t: (typeof T)['vi']; book: BookRow; onSaved: () => Promise<void> }) {
  const lang = useLang(), [v, setV] = useState(book.page_one ? String(book.page_one) : ''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setMsg('');
    try { await api.setPageOne(book.id, v.trim() ? Math.round(Number(v)) : null); setMsg(t.pageOneSaved); await onSaved(); } catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); }
  };
  return (
    // folded away (most books need nothing); open once she has set it
    <details className="small" open={!!book.page_one}><summary className="link">{t.pageOneAsk}</summary>
    <form className="stack" style={{ gap: 4, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <span className="muted">{t.pageOneHint}</span>
      <span className="row">{t.pageOne} <input type="number" min={1} max={2000} value={v} style={{ width: 70 }} onChange={(e) => setV(e.target.value)} /> {t.pageOneEnd}
        <button className="btn small" disabled={busy || (v.trim() !== '' && !(Number(v) >= 1)) || v === (book.page_one ? String(book.page_one) : '')}>{t.ok}</button>{msg && <span className="muted">{msg}</span>}</span>
    </form></details>
  );
}

// "Thêm nguồn": the PDF is opened right here in the browser (it never leaves her computer). A text PDF
// up to 30 MB is uploaded as before (so it can be opened later); a bigger one sends only its text. A
// scanned book: she picks the pages, sees the estimate and what she must have (50% more), then each
// page is drawn as a picture and sent; the reading runs in her line of jobs (one at a time).
const R = {
  vi: { file: 'Tệp PDF (bao nhiêu MB cũng được) hoặc ảnh chụp các trang sách (JPG, PNG, WEBP, HEIC)', wrong: 'Kho kiến thức nhận một tệp PDF, hoặc ảnh chụp các trang sách (JPG, PNG, WEBP, HEIC).', mixed: 'Cô chọn một tệp PDF, hoặc chỉ chọn ảnh, đừng chọn lẫn cả hai nhé.',
    photos: (n: number) => `${n} ảnh trang sách · mỗi ảnh là một trang`, first: 'Ảnh đầu tiên là trang số', photoBad: (name: string) => `Không mở được ảnh "${name}" trên trình duyệt này. Ảnh HEIC từ iPhone: cô mở bằng Safari, hoặc gửi ảnh dạng JPG nhé.`, tooMany: (n: number) => `Tối đa ${n} ảnh mỗi lần.`, retry: 'Thử lại', opening: 'Đang mở tệp trên máy của cô…', info: (n: number, text: boolean) => `${n} trang · ${text ? 'sách có chữ' : 'sách dạng ảnh (scan)'}`, notPdf: 'Tệp này không phải PDF. Cô chọn tệp PDF hoặc ảnh trang sách nhé.', raw: 'Trình duyệt này không đọc được PDF tại chỗ; sách sẽ được đọc trên máy chủ (lâu hơn một chút). Dùng Chrome sẽ nhanh hơn.', browserBig: 'Trình duyệt này không mở được PDF này, và tệp lớn hơn 30 MB nên không tải lên nguyên tệp được. Cô thử Chrome hoặc Edge, hoặc gửi ảnh các trang nhé.',
    from: 'Từ trang', to: 'đến trang', max: (n: number) => `tối đa ${n} trang mỗi lần`,
    est: (e: ScanEstimate) => `${e.pages} trang · dự kiến khoảng ${e.predicted} lượt · cần có ít nhất ${e.need} lượt (dư 50%) · cô còn ${e.have} lượt`,
    read: (n: number, need: number) => `Đọc ${n} trang (giữ ${need} lượt, trả lại phần thừa)`, short: (n: number) => `Còn thiếu ${n} lượt, nên chưa đọc được sách này. App không đọc một phần sách.`, fit: (n: number) => `Chỉ đọc ${n} trang đầu`, promo: 'Có mã khuyến mãi thì nhập ở trang Lượt dùng (menu tên, góc phải) để có thêm lượt, rồi đọc lại.',
    textOut: (k: number, n: number) => `Đang lấy chữ trang ${k}/${n}…`, sending: (k: number, n: number) => `Đang gửi trang ${k}/${n}…`, queued: 'Đã đưa vào hàng đợi. Xem tiến độ ở ô "Đang làm" trên thanh trên.', add: 'Thêm vào kho',
    checking: 'Đang xem sách này đã có trong kho chưa…', same: (name: string, day: string) => `Sách này đã có trong kho: "${name}" (thêm ngày ${day}).\nMở sách đã có thì không trừ lượt.`, openOld: 'Mở sách đã có', addNew: 'Vẫn thêm bản mới' },
  en: { file: 'A PDF (any size) or photos of the book pages (JPG, PNG, WEBP, HEIC)', wrong: 'Knowledge takes one PDF, or photos of book pages (JPG, PNG, WEBP, HEIC).', mixed: 'Choose one PDF, or only photos, not both.',
    photos: (n: number) => `${pl(n, 'photo')} of book pages · each photo is one page`, first: 'The first photo is page', photoBad: (name: string) => `The photo "${name}" could not be opened in this browser. For HEIC photos from an iPhone, use Safari or send them as JPG.`, tooMany: (n: number) => `Up to ${n} photos at a time.`, retry: 'Try again', opening: 'Opening the file on your computer…', info: (n: number, text: boolean) => `${pl(n, 'page')} · ${text ? 'a book with text' : 'a scanned book (pictures)'}`, notPdf: 'This file is not a PDF. Please choose a PDF or photos of the book pages.', raw: 'This browser can\'t open the PDF here, so the book is read on our server (a little slower). Chrome is faster.', browserBig: 'This browser cannot open this PDF, and it is over 30 MB, so it cannot be uploaded whole. Try Chrome or Edge, or send photos of the pages.',
    from: 'From page', to: 'to page', max: (n: number) => `up to ${n} pages at a time`,
    est: (e: ScanEstimate) => `${pl(e.pages, 'page')} · about ${pl(e.predicted, 'credit')} · you need at least ${e.need} (50% more) · you have ${e.have}`,
    read: (n: number, need: number) => `Read ${pl(n, 'page')} (holds ${pl(need, 'credit')}, the rest comes back)`, short: (n: number) => `${pl(n, 'credit')} short, so this book cannot be read yet. LessonBloom does not read part of a book.`, fit: (n: number) => `Read only the first ${pl(n, 'page')}`, promo: 'If you have a promo code, enter it on the Usage page (the menu under your name, top right) for more credits, then read it again.',
    textOut: (k: number, n: number) => `Reading the text of page ${k}/${n}…`, sending: (k: number, n: number) => `Sending page ${k}/${n}…`, queued: 'Added to your line of jobs. See it under "Working on" in the top bar.', add: 'Add to the library',
    checking: 'Checking whether this book is already in your library…', same: (name: string, day: string) => `This book is already in your library: "${name}" (added ${day}).\nOpening it uses no credits.`, openOld: 'Open the existing book', addNew: 'Add a new copy anyway' },
};

function AddSource({ t, onDone }: { t: (typeof T)['vi']; onDone: (areaId?: string) => void }) {
  const lang = useLang(), r = R[lang];
  // no subject preset (Chi #41): it is guessed from each file chosen, or she chooses it; what she changed by hand stays
  const [f, setF] = useState<{ name: string; subject: '' | 'math' | 'english'; grade: number }>({ name: '', subject: '', grade: 2 }), [guess, setGuess] = useState<Guess>({}), touched = useRef({ subject: false, grade: false });
  const applyGuess = (g: Guess) => { const k = touched.current; setGuess({ ...(!k.subject && g.subject && { subject: g.subject }), ...(!k.grade && g.grade && { grade: g.grade }) }); setF((x) => ({ ...x, subject: k.subject ? x.subject : g.subject ?? '', ...(!k.grade && g.grade && { grade: g.grade }) })); };
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [sent, setSent] = useState<number | null>(null);
  const [info, setInfo] = useState<{ pages: number; text: boolean; raw?: boolean } | null>(null), [opening, setOpening] = useState(false), [range, setRange] = useState({ from: 1, to: 1 }), [est, setEst] = useState<ScanEstimate | null>(null), [step, setStep] = useState('');
  const doc = useRef<PDFDocumentProxy | null>(null), [photos, setPhotos] = useState<File[] | null>(null), [server, setServer] = useState<{ areaId: string; bookId: string } | null>(null);
  const msg = (e: unknown) => (e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error)?.message || e));
  const run = async (fn: () => Promise<string | undefined>) => { setBusy(true); setErr(''); try { onDone(await fn()); } catch (e) { setErr(msg(e)); } finally { setBusy(false); setStep(''); setSent(null); } };
  const title = () => f.name.trim() || (file?.name || photos?.[0]?.name || '').replace(/\.(pdf|jpe?g|png|webp|heic|heif)$/i, '');
  // by type, or by name: Safari can give a photo an empty type (#26)
  const isImage = (x: File) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(x.name);
  // one PDF, or photos of the pages (#18, Chi): each photo is one page, read like a scanned book
  const pick = (list: File[]) => {
    setPhotos(null);
    if (list.length && list.every(isImage)) {
      setFile(null); setEst(null); doc.current = null;
      if (list.length > config.maxPages) { setInfo(null); setErr(r.tooMany(config.maxPages)); return; }
      setErr(''); setPhotos(list); setInfo({ pages: list.length, text: false }); setRange({ from: 1, to: list.length }); applyGuess(guessSubject(f.name, list[0].name));
      return;
    }
    if (list.length > 1) { setFile(null); setInfo(null); setErr(list.some((x) => x.type === 'application/pdf') && list.some(isImage) ? r.mixed : r.wrong); return; }
    if (list[0] && list[0].type !== 'application/pdf' && !/\.pdf$/i.test(list[0].name)) { setFile(null); setInfo(null); setErr(r.wrong); return; }
    void choose(list[0] || null);
  };
  const choose = async (x: File | null) => {
    setFile(x); setInfo(null); setEst(null); setErr(''); setServer(null); doc.current = null;
    if (!x) return;
    const g = guessSubject(f.name, x.name); applyGuess(g);
    setOpening(true);
    try {
      const d = await openPdf(x); doc.current = d; const text = await hasText(d); setInfo({ pages: d.numPages, text }); setRange({ from: 1, to: Math.min(d.numPages, config.maxPages) });
      // the name said too little: the cover's text often has "TOÁN" and "Lớp 2" (a scanned cover has none)
      if (text && !(g.subject && g.grade)) applyGuess(guessSubject(f.name, x.name, await pageText(d, 1).catch(() => '')));
    }
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
  // what she chose, as a SHA-256 made here (Chi #44); a scanned PDF also by the pages read, since
  // reading pages 21-40 of a book after 1-20 is not the same source. Null when this browser cannot.
  const fp = useRef<string | null>(null);
  const fingerprint = async () => {
    try {
      const sha = async (x: Blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await x.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (photos) return photos.length === 1 ? await sha(photos[0]) : await sha(new Blob([(await Promise.all(photos.map(sha))).join('\n')]));
      if (!file || !info) return null;
      const h = await sha(file);
      return !info.text && !info.raw ? `${h}:${range.from}-${range.to}` : h;
    } catch { return null; }
  };
  const newArea = () => api.createArea({ ...f, name: title(), ...(fp.current && { fingerprint: fp.current }) });
  const withArea = async (fn: (areaId: string) => Promise<void>) => {
    const { area } = await newArea();
    try { await fn(area.id); } catch (e) { await api.deleteArea(area.id).catch(() => {}); throw e; }
    window.dispatchEvent(new Event('lbm-jobs'));
    return area.id;
  };
  // added before (Chi #44)? she opens that one (no credits) or adds a new copy; closing the box adds nothing.
  // The second step of a file read on our server is the same source, so it is not asked again.
  const submit = async () => {
    if (!(info?.raw && server)) {
      setBusy(true); setErr(''); setStep(r.checking);
      fp.current = await fingerprint();
      const same = fp.current ? (await api.sameArea(fp.current).catch(() => null))?.same : null;
      setBusy(false); setStep('');
      if (same) {
        const way = await twoWays(r.same(same.name, new Date(same.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN')), r.openOld, r.addNew);
        if (way === 'a') { onDone(same.id); return; }
        if (way !== 'b') return;
      }
    }
    return add();
  };
  const add = () => {
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
    // short of credits: the numbers come back and show under the range, as in Chrome (Chi #26)
    if (info.raw && server) return run(async () => { await api.originalScan(server.bookId, Array.from({ length: count }, (_, k) => range.from + k)).catch((e) => { if (e instanceof ApiError && e.body.estimate) setEst(e.body.estimate as ScanEstimate); throw e; }); window.dispatchEvent(new Event('lbm-jobs')); return server.areaId; });
    if (info.raw) return (async () => {
      setBusy(true); setErr('');
      const { area } = await newArea().catch((e) => { setErr(msg(e)); setBusy(false); throw e; });
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
        <ChromeLine />
        <label className="field">{t.form.subject}<select value={f.subject} onChange={(e) => { touched.current.subject = true; setGuess(({ subject: _, ...g }) => g); setF({ ...f, subject: e.target.value as 'math' | 'english' }); }}><option value="" disabled>{t.form.chooseSubject}</option><option value="math">{t.math}</option><option value="english">{t.english}</option></select>
          <span className="small muted">{t.form.supported}</span></label>
        <label className="field">{t.form.grade}<select value={f.grade} onChange={(e) => { touched.current.grade = true; setGuess(({ grade: _, ...g }) => g); setF({ ...f, grade: Number(e.target.value) }); }}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{t.grade(g)}</option>)}</select></label>
      </div>
      {(guess.subject || guess.grade) && <p className="small muted" role="status">{t.form.guessed([guess.subject && t[guess.subject], guess.grade && t.grade(guess.grade)].filter(Boolean).join(' · '))}</p>}
      {info && !f.subject && <p className="small danger">{t.form.needSubject}</p>}
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
        <button className="btn primary" disabled={busy || !info || !f.subject || (!info.text && !est?.enough)}>{busy ? t.form.busy : info && !info.text && est ? r.read(count, est.need) : err && info ? r.retry : r.add}</button><span className="grow" />
        <span className="small muted">{t.form.sample}</span>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('maths2')).area.id)}>{t.form.maths}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('english3')).area.id)}>{t.form.eng}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => run(async () => (await api.sampleArea('toan2')).area.id)}>{t.form.toan}</button></div>
      {err && <p className="note">{err}</p>}
    </form>
  );
}

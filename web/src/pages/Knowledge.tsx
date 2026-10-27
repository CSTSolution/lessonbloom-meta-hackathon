// The knowledge area: the assigner's own books (PDF) per subject and grade. Lessons are written only
// from these books. Books are private to her; nobody else can open them.
import { useEffect, useState } from 'react';
import { api, ApiError, type AreaRow, type SectionRow } from '../api.ts';
import { useLang, useT } from '../i18n.ts';

const T = {
  vi: {
    title: 'Kho kiến thức', lead: 'Tải sách (PDF) lên theo môn và lớp. Bài giảng và bài luyện tập chỉ lấy nội dung từ sách trong kho, và ghi rõ trang.',
    private: 'Sách trong kho là của riêng cô, không chia sẻ cho ai.', newArea: 'Tạo kho mới', name: 'Tên kho', namePh: 'Ví dụ: Toán 2', subject: 'Môn', math: 'Toán', english: 'Tiếng Anh', grade: 'Lớp',
    create: 'Tạo', upload: 'Tải sách PDF lên', bookTitle: 'Tên sách', uploading: 'Đang tải lên…', none: 'Chưa có kho nào. Cô tạo kho đầu tiên rồi tải sách lên nhé.',
    status: { processing: 'Đang đọc sách…', ready: 'Sẵn sàng', error: 'Lỗi' }, errors: { scanned: 'Sách là ảnh chụp, chưa có chữ. Hiện LessonBloom đọc được PDF có chữ.', failed: 'Chưa đọc được tệp này.', blocked: 'Nội dung không dùng được.' },
    sections: (n: number) => `${n} bài`, contents: 'Mục lục', open: 'Mở', page: 'tr.', sample: 'Thử với sách mẫu', sampleNote: 'Sách mẫu do đội LessonBloom tự viết.', sampleMath: 'Toán 2', sampleEng: 'Tiếng Anh 3',
  },
  en: {
    title: 'Knowledge', lead: 'Upload your books (PDF) by subject and grade. Lessons and practice come only from the books here, with their pages.',
    private: 'Your books are private to you; nobody else can open them.', newArea: 'New area', name: 'Name', namePh: 'e.g. Maths 2', subject: 'Subject', math: 'Maths', english: 'English', grade: 'Grade',
    create: 'Create', upload: 'Upload a PDF book', bookTitle: 'Book title', uploading: 'Uploading…', none: 'No knowledge areas yet. Create one, then upload a book.',
    status: { processing: 'Reading the book…', ready: 'Ready', error: 'Error' }, errors: { scanned: 'The book is scanned images without text. LessonBloom reads text PDFs for now.', failed: 'This file could not be read.', blocked: 'This content cannot be used.' },
    sections: (n: number) => `${n} lessons`, contents: 'Contents', open: 'Open', page: 'p.', sample: 'Try with a sample book', sampleNote: 'Sample books written by the LessonBloom team.', sampleMath: 'Maths 2', sampleEng: 'English 3',
  },
};

export function Knowledge() {
  const t = useT(T), lang = useLang();
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [form, setForm] = useState({ name: '', subject: 'math', grade: 2 });
  const [open, setOpen] = useState<string | null>(null), [sections, setSections] = useState<SectionRow[]>([]);
  const [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const load = () => api.areas().then((r) => setAreas(r.areas)).catch(() => setAreas([]));
  useEffect(() => { void load(); }, []);
  // while a book is being read, look again every 2 s
  useEffect(() => { if (!areas?.some((a) => a.books.some((b) => b.status === 'processing'))) return; const id = setTimeout(load, 2000); return () => clearTimeout(id); }, [areas]);
  useEffect(() => { if (open) api.area(open).then((r) => setSections(r.sections)).catch(() => setSections([])); }, [open, areas]);
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); } };

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 860 }}>
      <h1>{t.title}</h1>
      <p className="muted">{t.lead}</p>
      <p className="small chip" style={{ alignSelf: 'start' }}>🔒 {t.private}</p>
      {areas && !areas.length && <p className="muted">{t.none}</p>}
      <div className="row small"><span className="muted">{t.sample}:</span>
        <button className="btn small" disabled={!!busy} onClick={() => run('sample', async () => { await api.sampleArea('toan2'); await load(); })}>📘 {t.sampleMath}</button>
        <button className="btn small" disabled={!!busy} onClick={() => run('sample', async () => { await api.sampleArea('english3'); await load(); })}>📗 {t.sampleEng}</button>
        <span className="muted">{t.sampleNote}</span></div>
      {areas?.map((a) => (
        <div key={a.id} className="card stack">
          <div className="row"><h2 className="grow">{a.name}</h2><span className="chip">{a.subject === 'math' ? t.math : t.english} · {t.grade} {a.grade}</span></div>
          {a.books.map((b) => (
            <div key={b.id} className="row book">
              <span className="grow">📘 <b>{b.title}</b> <span className="muted small">{b.pages ? `· ${b.pages} ${t.page}` : ''} {b.sections ? `· ${t.sections(b.sections)}` : ''}</span></span>
              <span className={`chip st-${b.status === 'processing' ? 'working' : b.status}`}>{t.status[b.status]}</span>
              {b.status === 'ready' && <a className="btn ghost small" href={`/api/t/books/${b.id}/file`} target="_blank" rel="noreferrer">{t.open}</a>}
              {b.error && <span className="small note">{t.errors[b.error as keyof typeof t.errors] ?? b.error}</span>}
            </div>
          ))}
          <label className="btn small" style={{ alignSelf: 'start' }}>📄 {busy === a.id ? t.uploading : t.upload}
            <input type="file" accept="application/pdf" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(a.id, async () => { await api.uploadBook(a.id, f, f.name.replace(/\.pdf$/i, '')); await load(); }); }} /></label>
          {a.books.some((b) => b.status === 'ready') && <button className="btn ghost small" style={{ alignSelf: 'start' }} onClick={() => setOpen(open === a.id ? null : a.id)}>{t.contents} {open === a.id ? '▲' : '▼'}</button>}
          {open === a.id && <ol className="toc">{sections.map((s) => <li key={s.id}>{s.title} <span className="muted small">· {t.page} {s.page_from}{s.page_to > s.page_from ? `–${s.page_to}` : ''}</span></li>)}</ol>}
        </div>
      ))}
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void run('area', async () => { await api.createArea(form); setForm({ ...form, name: '' }); await load(); }); }}>
        <h3>{t.newArea}</h3>
        <div className="grid2">
          <label className="field">{t.name}<input value={form.name} maxLength={80} placeholder={t.namePh} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">{t.subject}<select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}><option value="math">{t.math}</option><option value="english">{t.english}</option></select></label>
          <label className="field">{t.grade}<select value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        </div>
        <button className="btn primary" style={{ alignSelf: 'start' }} disabled={!!busy || !form.name.trim()}>{t.create}</button>
      </form>
      {err && <p className="note" role="alert">{err}</p>}
    </div>
  );
}

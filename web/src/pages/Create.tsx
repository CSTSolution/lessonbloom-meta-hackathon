// Make a lesson from the assigner's own books, in three steps:
//   1 which knowledge area, and which part to teach: typed, read from a photo (Muse Spark) or spoken
//     (Muse Voice Transcribe). The request only points to the part; the content comes from the book.
//   2 the matched section, with its citation and the passages the AI used, to confirm (or search again)
//   3 the setup, pre-filled from the section; then the agent builds the lesson
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AreaRow, type Match, type Setup } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Soạn bài mới', step1: '1. Dạy phần nào?', step2: '2. Phần tìm thấy trong sách', step3: '3. Thông tin bài', area: 'Kho kiến thức', noArea: 'Cô cần một kho kiến thức có sách trước. Bài giảng chỉ lấy nội dung từ sách của cô.', toKnowledge: 'Mở Kho kiến thức',
    tabs: { type: 'Gõ', photo: 'Chụp ảnh', voice: 'Đọc to' }, ask: 'Ví dụ: Bài 21, phép cộng có nhớ', photoHint: 'Chụp trang sách, giáo án hoặc bài con đã làm (tối đa 5 ảnh). Không chụp mặt người, tên hay thông tin cá nhân.', pick: 'Chọn ảnh', reading: 'AI đang đọc ảnh…',
    rec: 'Ghi âm', stop: 'Dừng', hearing: 'AI đang nghe…', recording: 'Đang ghi âm…', find: 'Tìm trong sách', finding: 'Đang tìm trong sách…',
    used: 'Các đoạn AI đã dùng', openBook: 'Mở sách', use: 'Dùng phần này', again: 'Tìm lại', thinking: 'Đang đọc phần bài…',
    sample: 'Dùng sách mẫu', lessonTitle: 'Tên bài', objectives: 'Mục tiêu (tối đa 3)', minutes: 'Thời lượng', min: (n: number) => `${n} phút`, lang: 'Ngôn ngữ của bài', vi: 'Tiếng Việt', en: 'Tiếng Anh', note: 'Mong muốn của cô (không bắt buộc)', notePh: 'Ví dụ: dùng tình huống ở chợ', make: 'Soạn bài', page: 'tr.',
  },
  en: {
    title: 'New lesson', step1: '1. Which part to teach?', step2: '2. Found in your book', step3: '3. About the lesson', area: 'Knowledge area', noArea: 'You need a knowledge area with a book first. Lessons come only from your books.', toKnowledge: 'Open Knowledge',
    tabs: { type: 'Type', photo: 'Photo', voice: 'Speak' }, ask: 'e.g. Unit 6, colours', photoHint: 'Photograph the book page, your plan or your child\'s finished exercise (up to 5 photos). No faces, names or personal details.', pick: 'Choose photos', reading: 'The AI is reading the photos…',
    rec: 'Record', stop: 'Stop', hearing: 'The AI is listening…', recording: 'Recording…', find: 'Find in my books', finding: 'Searching your books…',
    used: 'Passages the AI used', openBook: 'Open the book', use: 'Use this part', again: 'Search again', thinking: 'Reading the section…',
    sample: 'Use a sample book', lessonTitle: 'Title', objectives: 'Objectives (up to 3)', minutes: 'Length', min: (n: number) => `${n} min`, lang: 'Lesson language', vi: 'Vietnamese', en: 'English', note: 'Your wishes (optional)', notePh: 'e.g. use market examples', make: 'Make the lesson', page: 'p.',
  },
};

export function Create({ onKnowledge }: { onKnowledge: () => void }) {
  const t = useT(T), lang = useLang();
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [areaId, setAreaId] = useState('');
  const [tab, setTab] = useState<'type' | 'photo' | 'voice'>('type'), [request, setRequest] = useState('');
  const [match, setMatch] = useState<Match | null>(null), [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => { api.areas().then((r) => { const ready = r.areas.filter((a) => a.books.some((b) => b.status === 'ready')); setAreas(ready); if (ready[0]) setAreaId(ready[0].id); }).catch(() => setAreas([])); }, []);
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error).message || e)); } finally { setBusy(''); } };
  const record = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => { stream.getTracks().forEach((x) => x.stop()); void run('voice', async () => { const { text } = await api.voice(new Blob(chunks.current, { type: r.mimeType.split(';')[0] || 'audio/webm' })); setRequest(text.slice(0, 2000)); setTab('type'); }); };
    r.start(); setRec(r);
    setTimeout(() => { if (r.state === 'recording') r.stop(); }, 2 * 60e3);
  };
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => (s ? { ...s, [k]: v } : s));
  if (!areas) return null;

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 780 }}>
      <h1>{t.title}</h1>
      {!areas.length ? (
        <div className="card stack"><p>{t.noArea}</p><div className="row">
          <button className="btn primary" onClick={onKnowledge}>{t.toKnowledge}</button>
          <button className="btn" disabled={!!busy} onClick={() => run('sample', async () => { const { area } = await api.sampleArea(lang === 'en' ? 'english3' : 'toan2'); const r = await api.areas(); setAreas(r.areas.filter((a) => a.books.some((b) => b.status === 'ready'))); setAreaId(area.id); })}>📘 {t.sample}</button></div></div>
      ) : !match ? (
        <div className="card stack">
          <h2>{t.step1}</h2>
          <label className="field">{t.area}<select value={areaId} onChange={(e) => setAreaId(e.target.value)}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.books.filter((b) => b.status === 'ready').map((b) => b.title).join(', ')}</option>)}</select></label>
          <div className="seg" role="tablist">{(['type', 'photo', 'voice'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t.tabs[k]}</button>)}</div>
          {tab === 'type' && <textarea rows={3} value={request} maxLength={2000} placeholder={t.ask} onChange={(e) => setRequest(e.target.value)} />}
          {tab === 'photo' && <><p className="muted small">{t.photoHint}</p>
            <label className="btn" style={{ alignSelf: 'start' }}>📷 {busy === 'photo' ? t.reading : t.pick}
              <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files || [])].slice(0, 5); e.target.value = ''; if (fs.length) void run('photo', async () => { const { text } = await api.photos(await Promise.all(fs.map((f) => shrink(f)))); setRequest(text.slice(0, 2000)); setTab('type'); }); }} /></label></>}
          {tab === 'voice' && (rec ? <button className="btn coral" style={{ alignSelf: 'start' }} onClick={() => { rec.stop(); setRec(null); }}>■ {t.stop} · {t.recording}</button>
            : <button className="btn" style={{ alignSelf: 'start' }} disabled={!!busy} onClick={() => void record().catch((e) => setErr(String(e.message || e)))}>● {busy === 'voice' ? t.hearing : t.rec}</button>)}
          <div className="row"><div className="grow" /><button className="btn primary lg" disabled={!!busy || request.trim().length < 3} onClick={() => run('find', async () => setMatch((await api.match(areaId, request)).match))}>{busy === 'find' ? t.finding : t.find}</button></div>
        </div>
      ) : !setup ? (
        <div className="card stack">
          <h2>{t.step2}</h2>
          <p className="cite">📘 {match.citation}</p>
          <h3>{match.title}</h3>
          <div className="stack small" style={{ gap: 6 }}><b>{t.used}:</b>{match.cited.map((c) => <blockquote key={c.id}>“{c.quote}” <span className="muted">· {t.page} {c.page}</span></blockquote>)}</div>
          <a className="small" href={`/api/t/books/${match.bookId}/file#page=${match.pageFrom}`} target="_blank" rel="noreferrer">{t.openBook} ({t.page} {match.pageFrom}) ↗</a>
          <div className="row"><button className="btn ghost" onClick={() => setMatch(null)}>{t.again}</button><div className="grow" />
            <button className="btn primary lg" disabled={!!busy} onClick={() => run('intake', async () => setSetup((await api.intake(areaId, match.sectionId)).setup))}>{busy === 'intake' ? t.thinking : t.use}</button></div>
        </div>
      ) : (
        <div className="card stack">
          <h2>{t.step3}</h2>
          <p className="cite">📘 {match.citation}</p>
          <div className="grid2">
            <label className="field">{t.minutes}<select value={setup.minutes} onChange={(e) => set('minutes', Number(e.target.value))}>{[15, 25, 35].map((m) => <option key={m} value={m}>{t.min(m)}</option>)}</select></label>
            <label className="field">{t.lang}<select value={setup.lang} onChange={(e) => set('lang', e.target.value as Setup['lang'])}><option value="vi">{t.vi}</option><option value="en">{t.en}</option></select></label>
          </div>
          <label className="field">{t.lessonTitle}<input value={setup.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></label>
          <div className="field">{t.objectives}{[0, 1, 2].map((i) => <input key={i} value={setup.objectives[i] || ''} maxLength={200} onChange={(e) => { const o = [...setup.objectives]; o[i] = e.target.value; set('objectives', o.filter((x, j) => x || j < i)); }} />)}</div>
          <label className="field">{t.note}<input value={setup.note || ''} maxLength={300} placeholder={t.notePh} onChange={(e) => set('note', e.target.value)} /></label>
          <div className="row"><button className="btn ghost" onClick={() => setSetup(null)}>←</button><div className="grow" />
            <button className="btn coral lg" disabled={!!busy || !setup.title.trim()} onClick={() => run('make', async () => go(`/lesson/${(await api.create({ areaId, sectionId: match.sectionId, request, setup: { ...setup, objectives: setup.objectives.filter(Boolean) } })).id}`))}>{t.make}</button></div>
        </div>
      )}
      {err && <p className="note" role="alert">{err}</p>}
    </div>
  );
}

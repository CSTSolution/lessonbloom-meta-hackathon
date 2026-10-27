// Make a lesson, in two steps: 1) the notes, typed, photographed (Muse Spark reads them) or spoken
// (Muse Voice Transcribe); 2) the setup the AI pre-filled, which the teacher checks; then the agent builds it.
import { useRef, useState } from 'react';
import { api, ApiError, type Setup } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    title: 'Soạn bài mới', step1: '1. Ghi chú bài học', step2: '2. Thông tin bài', tabs: { type: 'Gõ', photo: 'Chụp ảnh', voice: 'Đọc to' },
    typeHint: 'Dán giáo án hoặc ghi chú: tên bài, mục tiêu, kiến thức, ví dụ, bài tập.', sample: 'Dùng bài mẫu', sampleMath: 'Toán 2: cộng có nhớ', sampleEng: 'Tiếng Anh 3: màu sắc',
    photoHint: 'Chụp trang sách hoặc giáo án (tối đa 5 ảnh). AI chép lại chữ để cô xem.', pick: 'Chọn ảnh', reading: 'AI đang đọc ảnh…',
    voiceHint: 'Bấm ghi âm và đọc ghi chú bài học (tối đa 5 phút). AI chép lại thành chữ.', rec: 'Ghi âm', stop: 'Dừng', hearing: 'AI đang nghe…', recording: 'Đang ghi âm…',
    next: 'Tiếp tục', thinking: 'AI đang đọc ghi chú…', subject: 'Môn', math: 'Toán', english: 'Tiếng Anh', grade: 'Lớp', lessonTitle: 'Tên bài', objectives: 'Mục tiêu (tối đa 3)',
    minutes: 'Thời lượng', min: (n: number) => `${n} phút`, lang: 'Ngôn ngữ của bài', vi: 'Tiếng Việt', en: 'Tiếng Anh', note: 'Mong muốn của cô (không bắt buộc)', notePh: 'Ví dụ: dùng tình huống ở chợ',
    make: 'Soạn bài', back: 'Sửa ghi chú', notes: 'Ghi chú',
  },
  en: {
    title: 'New lesson', step1: '1. Lesson notes', step2: '2. About the lesson', tabs: { type: 'Type', photo: 'Photo', voice: 'Speak' },
    typeHint: 'Paste your lesson plan or notes: title, objectives, what pupils learn, examples, exercises.', sample: 'Use a sample', sampleMath: 'Maths 2: carrying', sampleEng: 'English 3: colours',
    photoHint: 'Photograph the textbook page or your plan (up to 5 photos). The AI copies out the text for you to check.', pick: 'Choose photos', reading: 'The AI is reading the photos…',
    voiceHint: 'Press record and read your lesson notes (up to 5 minutes). The AI writes them down.', rec: 'Record', stop: 'Stop', hearing: 'The AI is listening…', recording: 'Recording…',
    next: 'Continue', thinking: 'The AI is reading your notes…', subject: 'Subject', math: 'Maths', english: 'English', grade: 'Grade', lessonTitle: 'Title', objectives: 'Objectives (up to 3)',
    minutes: 'Length', min: (n: number) => `${n} min`, lang: 'Lesson language', vi: 'Vietnamese', en: 'English', note: 'Your wishes (optional)', notePh: 'e.g. use market examples',
    make: 'Make the lesson', back: 'Edit notes', notes: 'Notes',
  },
};

const SAMPLES = {
  math: `Toán lớp 2 – Bài 24: Phép cộng có nhớ trong phạm vi 100.
Mục tiêu: Học sinh biết đặt tính và cộng có nhớ hai số có hai chữ số. Học sinh giải được bài toán có lời văn một bước.
Kiến thức: Khi cộng hàng đơn vị được 10 trở lên, ta viết chữ số hàng đơn vị và nhớ 1 sang hàng chục.
Ví dụ: 36 + 27. Cộng hàng đơn vị: 6 cộng 7 bằng 13, viết 3 nhớ 1. Cộng hàng chục: 3 cộng 2 bằng 5, thêm 1 là 6. Vậy 36 + 27 = 63.
Luyện tập: 19 + 36; 57 + 28; 44 + 39.
Bài toán: Lan có 36 quả xoài, mẹ cho thêm 27 quả xoài. Hỏi Lan có tất cả bao nhiêu quả xoài?`,
  english: `English, grade 3 – Unit 6: Colours.
Objectives: Pupils can name six colours: red, blue, green, yellow, pink and orange. Pupils can ask and answer "What colour is it?".
New words: red, blue, green, yellow, pink, orange.
Pattern: What colour is it? It is red. It is blue.
Dialogue: Nam: What colour is it? Mai: It is yellow. My favourite colour is yellow.`,
};

export function Create() {
  const t = useT(T), lang = useLang();
  const [tab, setTab] = useState<'type' | 'photo' | 'voice'>('type');
  const [notes, setNotes] = useState(''), [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error).message || e)); } finally { setBusy(''); }
  };
  const record = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => { stream.getTracks().forEach((x) => x.stop()); void run('voice', async () => { const { text } = await api.voice(new Blob(chunks.current, { type: r.mimeType.split(';')[0] || 'audio/webm' })); setNotes((n) => (n ? `${n}\n${text}` : text)); setTab('type'); }); };
    r.start(); setRec(r);
    setTimeout(() => { if (r.state === 'recording') r.stop(); }, 5 * 60e3);
  };
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => (s ? { ...s, [k]: v } : s));

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 760 }}>
      <h1>{t.title}</h1>
      {!setup ? (
        <div className="card stack">
          <h2>{t.step1}</h2>
          <div className="seg" role="tablist">{(['type', 'photo', 'voice'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t.tabs[k]}</button>)}</div>
          {tab === 'type' && <>
            <p className="muted small">{t.typeHint}</p>
            <textarea rows={12} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={20000} aria-label={t.notes} />
            <div className="row small"><span className="muted">{t.sample}:</span><button className="btn ghost small" onClick={() => setNotes(SAMPLES.math)}>{t.sampleMath}</button><button className="btn ghost small" onClick={() => setNotes(SAMPLES.english)}>{t.sampleEng}</button></div>
          </>}
          {tab === 'photo' && <>
            <p className="muted small">{t.photoHint}</p>
            <label className="btn" style={{ alignSelf: 'start' }}>📷 {busy === 'photo' ? t.reading : t.pick}
              <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files || [])].slice(0, 5); e.target.value = ''; if (fs.length) void run('photo', async () => { const { text } = await api.photos(await Promise.all(fs.map((f) => shrink(f)))); setNotes((n) => (n ? `${n}\n${text}` : text)); setTab('type'); }); }} /></label>
          </>}
          {tab === 'voice' && <>
            <p className="muted small">{t.voiceHint}</p>
            {rec ? <button className="btn coral" onClick={() => { rec.stop(); setRec(null); }}>■ {t.stop} · {t.recording}</button>
              : <button className="btn" disabled={!!busy} onClick={() => void record().catch((e) => setErr(String(e.message || e)))}>● {busy === 'voice' ? t.hearing : t.rec}</button>}
          </>}
          <div className="row"><div className="grow" /><button className="btn primary lg" disabled={!!busy || notes.trim().length < 30} onClick={() => run('intake', async () => setSetup((await api.intake(notes)).setup))}>{busy === 'intake' ? t.thinking : t.next}</button></div>
        </div>
      ) : (
        <div className="card stack">
          <h2>{t.step2}</h2>
          <div className="grid2">
            <label className="field">{t.subject}<select value={setup.subject} onChange={(e) => set('subject', e.target.value as Setup['subject'])}><option value="math">{t.math}</option><option value="english">{t.english}</option></select></label>
            <label className="field">{t.grade}<select value={setup.grade} onChange={(e) => set('grade', Number(e.target.value))}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
            <label className="field">{t.minutes}<select value={setup.minutes} onChange={(e) => set('minutes', Number(e.target.value))}>{[15, 25, 35].map((m) => <option key={m} value={m}>{t.min(m)}</option>)}</select></label>
            <label className="field">{t.lang}<select value={setup.lang} onChange={(e) => set('lang', e.target.value as Setup['lang'])}><option value="vi">{t.vi}</option><option value="en">{t.en}</option></select></label>
          </div>
          <label className="field">{t.lessonTitle}<input value={setup.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></label>
          <div className="field">{t.objectives}{[0, 1, 2].map((i) => <input key={i} value={setup.objectives[i] || ''} maxLength={200} onChange={(e) => { const o = [...setup.objectives]; o[i] = e.target.value; set('objectives', o.filter((x, j) => x || j < i)); }} />)}</div>
          <label className="field">{t.note}<input value={setup.note || ''} maxLength={300} placeholder={t.notePh} onChange={(e) => set('note', e.target.value)} /></label>
          <div className="row"><button className="btn ghost" onClick={() => setSetup(null)}>{t.back}</button><div className="grow" />
            <button className="btn coral lg" disabled={!!busy || !setup.title.trim()} onClick={() => run('make', async () => go(`/lesson/${(await api.create(notes, { ...setup, objectives: setup.objectives.filter(Boolean) })).id}`))}>{t.make}</button></div>
        </div>
      )}
      {err && <p className="note" role="alert">{err}</p>}
    </div>
  );
}

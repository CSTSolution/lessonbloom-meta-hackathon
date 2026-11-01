// Feedback from assigners (Chi #62): a "Góp ý" button in the corner of every assigner page (never on the
// pupils' pages, /hoc and /p/), "Bài này dùng được không? 👍 👎" once per lesson, and "Báo câu này" on each
// practice item. The page and the app version go along by themselves; a screenshot is shrunk here first.
import { useEffect, useState } from 'react';
import { api, ApiError, type FeedbackIn } from './api.ts';
import { useLang, useT } from './i18n.ts';
import { shrink } from './photo.ts';
import { VERSION } from './version.ts';

const T = {
  vi: {
    button: 'Góp ý', title: 'Góp ý cho LessonBloom', kinds: { bug: 'Lỗi', hard: 'Khó dùng', content: 'Nội dung bài chưa đúng', idea: 'Ý tưởng' }, textPh: 'Cô kể ngắn gọn: đang làm gì, thấy gì, mong muốn gì…',
    shot: 'Đính kèm ảnh chụp màn hình (không bắt buộc)', remove: 'Bỏ ảnh', send: 'Gửi', sending: 'Đang gửi…', cancel: 'Huỷ', thanks: 'Cảm ơn! Góp ý đã được gửi.', needText: 'Cô viết vài chữ hoặc đính kèm ảnh nhé.',
    badImage: 'Ảnh này chưa dùng được. Cô chọn ảnh JPG hoặc PNG khác nhé.', auto: (p: string) => `Kèm theo: trang ${p} · phiên bản ${VERSION}`,
    useful: 'Bài này dùng được không?', more: 'Góp ý', whatWrong: 'Chưa ổn ở chỗ nào?', whatPh: 'Ví dụ: sai đáp án, chưa đúng sách, quá khó…', skip: 'Bỏ qua',
    report: 'Báo câu này', reported: 'Đã báo', reasons: { wrong: 'Sai đáp án', unclear: 'Khó hiểu', notInLesson: 'Không có trong bài' }, notePh: 'Ghi chú thêm (không bắt buộc)',
  },
  en: {
    button: 'Feedback', title: 'Feedback for LessonBloom', kinds: { bug: 'Bug', hard: 'Hard to use', content: 'Lesson content wrong', idea: 'Idea' }, textPh: 'Briefly: what you were doing, what you saw, what you would like…',
    shot: 'Attach a screenshot (optional)', remove: 'Remove picture', send: 'Send', sending: 'Sending…', cancel: 'Cancel', thanks: 'Thanks! Your feedback was sent.', needText: 'Write a few words or attach a picture.',
    badImage: 'This picture cannot be used. Please choose another JPG or PNG.', auto: (p: string) => `Sent with it: page ${p} · version ${VERSION}`,
    useful: 'Is this lesson useful?', more: 'Feedback', whatWrong: 'What was wrong?', whatPh: 'For example: a wrong answer, not as in the book, too hard…', skip: 'Skip',
    report: 'Report', reported: 'Reported', reasons: { wrong: 'Wrong answer', unclear: 'Hard to understand', notInLesson: 'Not in the lesson' }, notePh: 'A note (optional)',
  },
};
type Box = 'bug' | 'hard' | 'content' | 'idea';
const MAX = 2000, IMAGE = 1.5e6;
const here = () => (location.pathname + location.search).slice(0, 200);
const toast = (text: string) => window.dispatchEvent(new CustomEvent('lbm-toast', { detail: text }));
const send = (f: FeedbackIn) => api.feedback({ page: here(), version: VERSION, ...f });
const errText = (e: unknown, lang: 'vi' | 'en') => (e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error)?.message || e));
// open the box from anywhere (the "Góp ý" link under a lesson), with the lesson attached
export const openFeedback = (o: { kind?: Box; lessonId?: string } = {}) => window.dispatchEvent(new CustomEvent('lbm-feedback', { detail: o }));

// A screenshot as a JPEG of at most 1.5 MB: smaller and smaller until it fits
async function screenshot(f: File): Promise<string> {
  for (const max of [1600, 1200, 900]) { const { data } = await shrink(f, max); if (data.length * 0.75 <= IMAGE) return data; }
  throw new Error('image');
}

export function FeedbackButton() {
  const t = useT(T), lang = useLang();
  const [open, setOpen] = useState(false), [kind, setKind] = useState<Box>('bug'), [text, setText] = useState(''), [file, setFile] = useState<File | null>(null);
  const [lessonId, setLessonId] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => {
    const f = (e: Event) => { const d = ((e as CustomEvent).detail || {}) as { kind?: Box; lessonId?: string }; if (d.kind) setKind(d.kind); setLessonId(d.lessonId || ''); setMsg(''); setOpen(true); };
    window.addEventListener('lbm-feedback', f);
    return () => window.removeEventListener('lbm-feedback', f);
  }, []);
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [open]);
  const submit = async () => {
    if (!text.trim() && !file) return setMsg(t.needText);
    setBusy(true); setMsg('');
    try {
      let image: string | undefined;
      if (file) { try { image = await screenshot(file); } catch { setMsg(t.badImage); return; } }
      await send({ kind, text: text.trim(), image, lessonId: lessonId || undefined });
      setOpen(false); setText(''); setFile(null); setLessonId(''); toast(t.thanks);
    } catch (e) { setMsg(errText(e, lang)); } finally { setBusy(false); }
  };
  return (
    <>
      {!open && <button className="fb-btn noprint" onClick={() => { setLessonId(''); setMsg(''); setOpen(true); }} aria-haspopup="dialog">💬 {t.button}</button>}
      {open && <div className="fb-box card stack noprint" role="dialog" aria-label={t.title} style={{ gap: 10 }}>
        <div className="row"><b className="grow">{t.title}</b><button className="btn ghost small" onClick={() => setOpen(false)} aria-label={t.cancel}>✕</button></div>
        <div className="row" style={{ gap: 6 }}>{(Object.keys(t.kinds) as Box[]).map((k) => <button key={k} className={`pill ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}>{t.kinds[k]}</button>)}</div>
        <textarea rows={4} value={text} maxLength={MAX} placeholder={t.textPh} onChange={(e) => setText(e.target.value)} autoFocus />
        <span className="small muted" style={{ textAlign: 'right', marginTop: -6 }}>{text.length}/{MAX}</span>
        {file ? <div className="row small"><span className="grow">📎 {file.name}</span><button className="link small" onClick={() => setFile(null)}>{t.remove}</button></div>
          : <label className="small link" style={{ cursor: 'pointer' }}>📎 {t.shot}<input type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} /></label>}
        <span className="small muted">{t.auto(location.pathname)}</span>
        {msg && <p className="note small" role="alert">{msg}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn small" onClick={() => setOpen(false)}>{t.cancel}</button><button className="btn small primary" disabled={busy} onClick={() => void submit()}>{busy ? t.sending : t.send}</button></div>
      </div>}
    </>
  );
}

// Under a lesson once it is ready, once per lesson (remembered in this browser): 👍, or 👎 and one
// short question.
const RATED = (id: string) => `lbm.rated.${id}`;
const rated = (id: string) => { try { return !!localStorage.getItem(RATED(id)); } catch { return false; } };
export function LessonRating({ lessonId }: { lessonId: string }) {
  const t = useT(T), lang = useLang();
  const [state, setState] = useState<'ask' | 'why' | 'done'>(() => (rated(lessonId) ? 'done' : 'ask')), [text, setText] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => { setState(rated(lessonId) ? 'done' : 'ask'); setText(''); }, [lessonId]);
  if (state === 'done') return null;
  const rate = async (rating: 1 | -1, why = '') => {
    setBusy(true); setMsg('');
    try { await send({ kind: 'lesson', lessonId, rating, text: why.trim() }); try { localStorage.setItem(RATED(lessonId), String(rating)); } catch { /* private mode */ } setState('done'); toast(t.thanks); }
    catch (e) { setMsg(errText(e, lang)); } finally { setBusy(false); }
  };
  return (
    <div className="fb-rate small noprint">
      {state === 'ask' ? <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <span className="muted">{t.useful}</span>
        <button className="btn ghost small" disabled={busy} onClick={() => void rate(1)} aria-label="👍">👍</button>
        <button className="btn ghost small" disabled={busy} onClick={() => setState('why')} aria-label="👎">👎</button>
        <span className="muted">·</span><button className="link small" onClick={() => openFeedback({ kind: 'content', lessonId })}>{t.more}</button>
      </div> : <form className="row" style={{ gap: 8, justifyContent: 'center' }} onSubmit={(e) => { e.preventDefault(); void rate(-1, text); }}>
        <span>👎 {t.whatWrong}</span>
        <input className="grow" value={text} maxLength={500} placeholder={t.whatPh} onChange={(e) => setText(e.target.value)} autoFocus style={{ minWidth: 180, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
        <button className="btn small primary" disabled={busy}>{t.send}</button><button type="button" className="btn ghost small" disabled={busy} onClick={() => void rate(-1)}>{t.skip}</button>
      </form>}
      {msg && <p className="note small" role="alert" style={{ marginTop: 6 }}>{msg}</p>}
    </div>
  );
}

// "Báo câu này" on one practice item: why, and a note if she likes
type Reason = keyof (typeof T)['vi']['reasons'];
export function ReportItem({ lessonId, itemId }: { lessonId: string; itemId: string }) {
  const t = useT(T), lang = useLang();
  const [open, setOpen] = useState(false), [reason, setReason] = useState<Reason>('wrong'), [note, setNote] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  if (done) return <span className="small muted noprint">✓ {t.reported}</span>;
  if (!open) return <button className="link small noprint fb-report" onClick={() => setOpen(true)}>⚑ {t.report}</button>;
  const submit = async () => {
    setBusy(true); setMsg('');
    try { await send({ kind: 'item', lessonId, itemId, reason, text: note.trim() }); setDone(true); toast(t.thanks); }
    catch (e) { setMsg(errText(e, lang)); } finally { setBusy(false); }
  };
  return (
    <div className="fb-item card stack noprint" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>{(Object.keys(t.reasons) as Reason[]).map((r) => <button key={r} className={`pill ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)} aria-pressed={reason === r}>{t.reasons[r]}</button>)}</div>
      <input value={note} maxLength={500} placeholder={t.notePh} onChange={(e) => setNote(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
      {msg && <p className="note small" role="alert">{msg}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn small" onClick={() => setOpen(false)}>{t.cancel}</button><button className="btn small primary" disabled={busy} onClick={() => void submit()}>{busy ? t.sending : t.send}</button></div>
    </div>
  );
}

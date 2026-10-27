// The welcome page: what LessonBloom does in three steps, and the way in (try it now, or an email code).
import { useState } from 'react';
import { api, ApiError, type Teacher } from '../api.ts';
import { getLang, useLang, useT } from '../i18n.ts';
import { LangToggle } from './LangToggle.tsx';

const T = {
  vi: {
    title: 'Ghi chú của cô thành bài giảng, bài luyện tập và bức tranh học tập của cả lớp.',
    lead: 'Cho lớp 1–5, Toán và Tiếng Anh. Cô gõ, chụp ảnh hoặc nói ghi chú bài học; trợ lý AI soạn và tự kiểm tra từng câu trước khi cô xem.',
    steps: [['1', 'Ghi chú', 'Gõ, chụp ảnh hoặc đọc to'], ['2', 'Bài giảng', 'Slide, video, bài luyện tập'], ['3', 'Lớp học', 'Học sinh luyện, cô thấy lớp vướng ở đâu']],
    built: 'Chạy trên các mô hình của Meta: Muse Spark, Muse Wonder, Muse Image, SAM 3.1',
    door: 'Bắt đầu', demo: 'Dùng thử ngay', demoNote: 'Không cần đăng ký. Bản dùng thử được giữ 7 ngày.',
    or: 'hoặc đăng nhập bằng email', email: 'Email của cô', send: 'Gửi mã', code: 'Mã 6 số trong email', verify: 'Đăng nhập',
    sent: (e: string) => `Đã gửi mã tới ${e}. Mã dùng được trong 10 phút.`, other: 'Dùng email khác',
  },
  en: {
    title: 'Your lesson notes become slides, practice and a clear picture of your class.',
    lead: 'For grades 1–5, Maths and English. Type, photograph or say your notes; an AI agent writes the lesson and checks every item before you see it.',
    steps: [['1', 'Notes', 'Type, photograph or speak'], ['2', 'Lesson', 'Slides, video, practice'], ['3', 'Class', 'Pupils practise; you see where they are stuck']],
    built: "Built on Meta's models: Muse Spark, Muse Wonder, Muse Image, SAM 3.1",
    door: 'Get started', demo: 'Try it now', demoNote: 'No sign-up. A demo is kept for 7 days.',
    or: 'or sign in with email', email: 'Your email', send: 'Send code', code: '6-digit code from the email', verify: 'Sign in',
    sent: (e: string) => `Code sent to ${e}. It works for 10 minutes.`, other: 'Use another email',
  },
};

export function Welcome({ onSignedIn }: { onSignedIn: (t: Teacher) => void }) {
  const t = useT(T), lang = useLang();
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); }
  };

  return (
    <div className="welcome">
      <section className="story">
        <div className="row"><div className="brand grow"><img src="/favicon.svg" alt="" />LessonBloom</div><LangToggle /></div>
        <h1>{t.title}</h1>
        <p className="muted" style={{ fontSize: 18 }}>{t.lead}</p>
        <div className="flow">{t.steps.map(([n, h, d]) => <div key={n}><b>{n}</b><strong>{h}</strong><p className="muted small">{d}</p></div>)}</div>
        <span className="meta-tag">◆ {t.built}</span>
      </section>
      <section className="door">
        <div className="card stack" style={{ gap: 16 }}>
          <h2>{t.door}</h2>
          <button className="btn primary lg" disabled={!!busy} onClick={() => run('demo', async () => onSignedIn((await api.demo(getLang())).teacher))}>{t.demo}</button>
          <p className="muted small">{t.demoNote}</p>
          <p className="muted small" style={{ textAlign: 'center' }}>— {t.or} —</p>
          {!sent ? (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('send', async () => { await api.sendCode(email.trim(), getLang()); setSent(true); }); }}>
              <label className="field">{t.email}<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <button className="btn" disabled={!!busy || !email.trim()}>{t.send}</button>
            </form>
          ) : (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('verify', async () => onSignedIn((await api.verify(email.trim(), code.trim())).teacher)); }}>
              <p className="note ok">{t.sent(email.trim())}</p>
              <label className="field">{t.code}<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
              <div className="row"><button className="btn primary grow" disabled={!!busy || code.length !== 6}>{t.verify}</button><button type="button" className="btn ghost" onClick={() => { setSent(false); setCode(''); }}>{t.other}</button></div>
            </form>
          )}
          {err && <p className="note" role="alert">{err}</p>}
        </div>
      </section>
    </div>
  );
}

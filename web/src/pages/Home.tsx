// Signed in: Chi's layout. One top bar: the five tabs on one line (Bài giảng · Kho kiến thức · Lộ trình
// học · Lớp học, for a parent "Con của tôi" · Tóm tắt học tập), the language, credits and the profile.
// No role switch in the header: the role is chosen once at sign-up (SignupRole).
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Credits, type Job, type LessonRow, type Teacher } from '../api.ts';
import { pl, setRole, useLang, useT } from '../i18n.ts';
import { go, usePath } from '../router.ts';
import { Classes } from './Classes.tsx';
import { ChromeBanner } from './ChromeNote.tsx';
import { Create, readDraft, readLast, setOwner, STEPS } from './Create.tsx';
import { setGuideOwner } from '../guide.tsx';
import { Criteria, Insights } from './Insights.tsx';
import { Knowledge } from './Knowledge.tsx';
import { LangToggle } from './LangToggle.tsx';
import { Learner } from './Learner.tsx';
import { LessonPage } from './LessonPage.tsx';
import { Notice } from './Notice.tsx';
import { Notifications } from './Notifications.tsx';
import { Path } from './Path.tsx';
import { Profile } from './Profile.tsx';
import { Reminders } from './Reminders.tsx';
import { SignupRole } from './SignupRole.tsx';
import { Usage } from './Usage.tsx';
import { VERSION } from '../version.ts';

const T = {
  vi: {
    nav: { '/': 'Bài giảng', '/knowledge': 'Kho kiến thức', '/path': 'Lộ trình học', '/classes': 'Lớp học', '/insight': 'Tóm tắt học tập' }, kids: 'Con của tôi',
    helloT: (n: string) => `Chào ${n || 'cô'}!`, helloP: (n: string) => `Chào ${n || 'bạn'}!`, lead: 'Tải tài liệu, có ngay slide, video và bài tập.', leadP: 'Tải tài liệu, có ngay bài học cho con.',
    teaches: 'Cô dạy', kidsOf: 'Con học', change: 'Đổi trong Hồ sơ', grade: (g: number) => `Lớp ${g}`, make: '+ Tạo bài giảng mới', draft: (what: string, step: string) => `Tiếp tục: ${what} · ${step}`, draftGo: 'Tiếp tục', allClasses: 'Tất cả các lớp', all: 'Tất cả',
    groups: { open: 'Đang giao', draft: 'Bản nháp · chưa giao', done: 'Đã xong' }, n: (n: number) => `${n} bài`, parts: (s: number, i: number, c: number, v: boolean) => [s && 'Slide', v && 'Video', i && `${i} bài tập`, c && 'Thẻ nhớ'].filter(Boolean).join(' · '),
    status: { working: 'Đang soạn…', error: 'Chưa soạn được' }, example: 'Ví dụ', carryOn: 'Soạn tiếp', empty: 'Bài giảng đầu tiên: chọn sách trong Kho kiến thức, gõ một câu bài cần học, trợ lý soạn slide và bài tập rồi tự kiểm tra từng câu.',
    week: 'Tóm tắt tuần này', repeat: 'Dạng lỗi đang lặp lại', noRepeat: 'Chưa có dạng lỗi lặp lại.', seeSummary: 'Xem tóm tắt học tập',
    demo: 'Bản dùng thử', credits: (c: Credits) => `Lượt dùng: ${c.left}`, daily: (c: Credits) => `Hôm nay còn ${c.daily!.left}/${c.daily!.perDay} · số dư ${c.balance}`, until: (d: string) => `Thuê bao đến ${d}`,
    creditsHint: 'Một bài giữ trước 90 lượt (kèm hình), thường dùng khoảng 65; phần không dùng được trả lại.', usage: 'Xem lượt dùng chi tiết', promo: 'Nhập mã khuyến mãi', promoPh: 'Mã khuyến mãi', apply: 'Dùng', promoOk: (c: number, d: number) => `Đã thêm${c ? ` ${c} lượt dùng` : ''}${c && d ? ' và' : ''}${d ? ` ${d} ngày thuê bao` : ''}.`, promoDemo: 'Đăng nhập bằng email để dùng mã khuyến mãi.',
    notifications: 'Thông báo', profile: 'Hồ sơ', reminders: 'Cài đặt lời nhắc', criteria: 'Tiêu chí tóm tắt', signOut: 'Đăng xuất', role: { teacher: 'Giáo viên', parent: 'Phụ huynh' },
  },
  en: {
    nav: { '/': 'Lessons', '/knowledge': 'Knowledge', '/path': 'Learning path', '/classes': 'Classes', '/insight': 'Learning summary' }, kids: 'My children',
    helloT: (n: string) => `Hello, ${n || 'teacher'}!`, helloP: (n: string) => `Hello, ${n || 'there'}!`, lead: 'Upload material; get slides, video and practice.', leadP: 'Upload material; get lessons for your children.',
    teaches: 'You teach', kidsOf: 'Your children', change: 'Change in Profile', grade: (g: number) => `Grade ${g}`, make: '+ New lesson', draft: (what: string, step: string) => `Continue: ${what} · ${step}`, draftGo: 'Continue', allClasses: 'All classes', all: 'All',
    groups: { open: 'Assigned', draft: 'Drafts · not assigned yet', done: 'Done' }, n: (n: number) => `${pl(n, 'lesson')}`, parts: (s: number, i: number, c: number, v: boolean) => [s && 'Slides', v && 'Video', i && `${pl(i, 'item')}`, c && 'Flashcards'].filter(Boolean).join(' · '),
    status: { working: 'Making…', error: 'Could not be made' }, example: 'Example', carryOn: 'Carry on', empty: 'Your first lesson: pick a book in Knowledge, type one sentence about what to learn; the agent writes slides and practice and checks every item.',
    week: 'This week', repeat: 'Mistakes that keep coming back', noRepeat: 'No repeated mistakes yet.', seeSummary: 'See the learning summary',
    demo: 'Demo', credits: (c: Credits) => `Credits: ${c.left}`, daily: (c: Credits) => `Today ${c.daily!.left}/${c.daily!.perDay} left · balance ${c.balance}`, until: (d: string) => `Subscribed until ${d}`,
    creditsHint: 'A lesson holds 90 credits (pictures included) and usually uses about 65; the rest comes back.', usage: 'See usage in detail', promo: 'Enter a promo code', promoPh: 'Promo code', apply: 'Apply', promoOk: (c: number, d: number) => `Added${c ? ` ${pl(c, 'credit')}` : ''}${c && d ? ' and' : ''}${d ? ` ${d} subscriber days` : ''}.`, promoDemo: 'Sign in with your email to use a promo code.',
    notifications: 'Notifications', profile: 'Profile', reminders: 'Reminder settings', criteria: 'Summary criteria', signOut: 'Sign out', role: { teacher: 'Teacher', parent: 'Parent' },
  },
};
type Dict = (typeof T)['vi'];
type Tab = keyof Dict['nav'];
const SUBJ: Record<string, { vi: string; en: string }> = { math: { vi: 'Toán', en: 'Maths' }, english: { vi: 'Tiếng Anh', en: 'English' }, both: { vi: 'Toán, Tiếng Anh', en: 'Maths, English' } };

export function Home({ teacher, onChange, onSignOut }: { teacher: Teacher; onChange: (t: Teacher) => void; onSignOut: () => void }) {
  setRole(teacher.role);
  const t = useT(T), path = usePath();
  setOwner(teacher.id); setGuideOwner(teacher.id);
  if (!teacher.role) return <SignupRole teacher={teacher} onDone={onChange} />;
  const parent = teacher.role === 'parent';
  const tabs = Object.keys(t.nav) as Tab[];
  const tab = tabs.find((k) => (k === '/' ? path === '/' || path.startsWith('/lesson') || path === '/new' : path.startsWith(k) || (k === '/insight' && path.startsWith('/learner')) || (k === '/path' && path.startsWith('/reminders')))) ?? '/';
  const lessonId = /^\/lesson\/([\w-]+)$/.exec(path)?.[1], learnerId = /^\/learner\/([\w-]+)$/.exec(path)?.[1];
  return (
    <div>
      <header className="top">
        <button className="brand link" style={{ color: 'inherit' }} onClick={() => go('/')} aria-label="LessonBloom"><img src="/favicon.svg" alt="" /><span className="brand-name">LessonBloom</span></button><span className="version" title={VERSION}>{VERSION}</span>
        <nav className="tabs">{tabs.map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{k === '/classes' && parent ? t.kids : t.nav[k]}</button>)}</nav>
        <Me teacher={teacher} t={t} onSignOut={onSignOut} />
      </header>
      <ChromeBanner />
      <Toast />
      {path === '/new' ? <Create parent={parent} />
        : lessonId ? <LessonPage id={lessonId} parent={parent} />
        : path.startsWith('/knowledge') ? <Knowledge />
        : path.startsWith('/path') ? <Path parent={parent} />
        : path.startsWith('/classes') ? <div className="page"><Classes parent={parent} /></div>
        : path === '/insight/criteria' ? <Criteria />
        : path.startsWith('/insight') ? <Insights parent={parent} />
        : learnerId ? <Learner id={learnerId} parent={parent} />
        : path === '/reminders' ? <Reminders parent={parent} />
        : path === '/notifications' ? <Notifications parent={parent} />
        : path === '/profile' ? <Profile teacher={teacher} onChange={onChange} />
        : path === '/usage' ? <Usage account={teacher.kind === 'account'} />
        : <Main teacher={teacher} t={t} />}
    </div>
  );
}

// A short note in the corner that goes by itself after about 4 s, sent as window event 'lbm-toast' with
// the text (Chi #37: "Bài đã lưu ở Bài giảng → Bản nháp" on leaving a lesson not assigned yet).
function Toast() {
  const [text, setText] = useState('');
  useEffect(() => {
    let h = 0;
    const f = (e: Event) => { setText(String((e as CustomEvent).detail || '')); clearTimeout(h); h = window.setTimeout(() => setText(''), 4000); };
    window.addEventListener('lbm-toast', f);
    return () => { clearTimeout(h); window.removeEventListener('lbm-toast', f); };
  }, []);
  return text ? <div className="toast" role="status">{text}</div> : null;
}

function Me({ teacher, t, onSignOut }: { teacher: Teacher; t: Dict; onSignOut: () => void }) {
  const [open, setOpen] = useState(false), [credits, setCredits] = useState<Credits | null>(null), path = usePath(), lang = useLang();
  useEffect(() => { api.me().then((r) => setCredits(r.credits)).catch(() => {}); }, [path]);
  // a job that ends (a lesson made, a book read) changes her credits: ask again
  useEffect(() => { const f = () => { api.me().then((r) => setCredits(r.credits)).catch(() => {}); }; window.addEventListener('lbm-credits', f); return () => window.removeEventListener('lbm-credits', f); }, []);
  const name = teacher.name || teacher.email || t.demo, box = useRef<HTMLDivElement>(null);
  // the menu closes by itself: a click outside it, Esc, or another page (Chi #30: it kept people stuck)
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="me" ref={box}>
      <LangToggle />
      <JobsBox lang={lang} />
      <button className="btn ghost small" aria-label={lang === 'vi' ? 'Thông báo' : 'Notifications'} onClick={() => go('/notifications')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg></button>
      {credits && <button className="btn ghost small" title={t.creditsHint} onClick={() => setOpen(!open)}>{t.credits(credits)}</button>}
      <button className="row link" style={{ gap: 6, color: 'inherit' }} onClick={() => setOpen(!open)}><span className="avatar">{name.trim().slice(0, 1).toUpperCase()}</span><span className="small me-name">{name}</span></button>
      {open && <div className="menu">
        <span className="small muted">{teacher.role ? t.role[teacher.role] : ''}{teacher.kind === 'demo' ? ` · ${t.demo}` : teacher.email ? ` · ${teacher.email}` : ''}</span>
        {credits && <CreditBox credits={credits} account={teacher.kind === 'account'} onChange={setCredits} t={t} />}
        <button className="link small" onClick={() => { setOpen(false); go('/usage'); }}>{t.usage}</button>
        <button className="link small" onClick={() => { setOpen(false); go('/notifications'); }}>{t.notifications}</button>
        <button className="link small" onClick={() => { setOpen(false); go('/profile'); }}>{t.profile}</button>
        <button className="link small" onClick={() => { setOpen(false); go('/reminders'); }}>{t.reminders}</button>
        {teacher.role === 'teacher' && <button className="link small" onClick={() => { setOpen(false); go('/insight/criteria'); }}>{t.criteria}</button>}
        <Notice compact />
        <div className="row"><button className="btn small" onClick={async () => { await api.logout().catch(() => {}); onSignOut(); go('/'); }}>{t.signOut}</button><button className="btn ghost small" onClick={() => setOpen(false)}>✕</button></div>
      </div>}
    </div>
  );
}

// "Bài giảng": lessons grouped by Đang giao / Bản nháp / Đã xong, only one group open; a filter by
// class (a parent: by child); this week's repeated mistakes on the right.
function Main({ teacher, t }: { teacher: Teacher; t: Dict }) {
  const lang = useLang(), parent = teacher.role === 'parent';
  const [rows, setRows] = useState<LessonRow[] | null>(null), [classes, setClasses] = useState<{ id: string; name: string; grade?: number | null }[]>([]), [pick, setPick] = useState('');
  const [open, setOpen] = useState<'open' | 'draft' | 'done'>('open'), [week, setWeek] = useState<{ what: string; where: string }[]>([]), draft = readDraft();
  useEffect(() => {
    api.lessons().then((r) => { setRows(r.lessons); if (r.lessons.some((l) => !l.given) || !r.lessons.some((l) => l.open)) setOpen('draft'); }).catch(() => setRows([]));
    api.classes().then((r) => setClasses(r.classes)).catch(() => {});
    api.summary({ lang }).then((s) => setWeek(s.classes.flatMap((k) => [...new Set(k.mistakes.map((m) => m.what))].map((what) => ({ what, where: k.name }))))).catch(() => {});
  }, []);
  useEffect(() => { if (!rows?.some((r) => r.status === 'working')) return; const id = setTimeout(() => api.lessons().then((r) => setRows(r.lessons)).catch(() => {}), 2500); return () => clearTimeout(id); }, [rows]);
  if (!rows) return null;
  // the most recent unfinished work: a lesson request half-written (step Material), or a lesson made but
  // not assigned yet (at the step she left it on); a lesson since assigned or removed is not offered
  const last = readLast(), lastRow = last && rows.find((r) => r.id === last.id && !r.given);
  const next = draft && (draft.text || draft.match || draft.part) && (!lastRow || draft.at > last!.at)
    ? { what: draft.text || draft.match?.title || draft.part || '', step: STEPS[lang][0], to: '/new' }
    : lastRow ? { what: lastRow.setup.title, step: STEPS[lang][last!.step - 1], to: `/lesson/${lastRow.id}` } : null;
  const shown = rows.filter((r) => !pick || r.classes.some((k) => k.id === pick));
  const groups = { open: shown.filter((r) => r.open), draft: shown.filter((r) => !r.given), done: shown.filter((r) => r.given && !r.open) };
  const subject = SUBJ[teacher.subject]?.[lang];
  return (
    <div className="page">
      <div className="cols">
        <div className="stack" style={{ gap: 14 }}>
          <div className="row"><div className="grow">
            <h1>{parent ? t.helloP(teacher.name) : t.helloT(teacher.name)}</h1>
            <p className="small muted">{parent ? t.leadP : t.lead}</p>
            <p className="small muted">{parent ? t.kidsOf : t.teaches}: <b>{[!parent && subject, ...classes.map((k) => (parent && k.grade ? `${k.name} · ${t.grade(k.grade)}` : k.name))].filter(Boolean).join(', ') || '—'}</b> · <button className="link small" onClick={() => go('/profile')}>{t.change}</button></p>
          </div><button className="btn primary" onClick={() => go('/new')}>{t.make}</button></div>
          {classes.length > 0 && <div className="row">{[{ id: '', name: parent ? t.all : t.allClasses }, ...classes].map((k) => <button key={k.id} className={`pill ${pick === k.id ? 'on' : ''}`} onClick={() => setPick(k.id)}>{k.name}</button>)}</div>}
          {/* step 1 left half-done (to enter a code, say) is here to carry on with (Chi #30) */}
          {next && <div className="banner row"><span className="grow small">{t.draft(next.what.slice(0, 80), next.step)}</span><button className="btn small primary" onClick={() => go(next.to)}>{t.draftGo}</button></div>}
          {!rows.length && <div className="card"><p className="muted">{t.empty}</p></div>}
          {/* drafts first, open when there are any: a lesson just made is found there, not thought lost (Chi, 30 Oct) */}
          {rows.length > 0 && (['draft', 'open', 'done'] as const).map((g) => (
            <div key={g} className={`group card ${open === g ? 'on' : ''}`}>
              <button className="group-head" onClick={() => setOpen(g)} aria-expanded={open === g}>
                <span className="caret">{open === g ? '▾' : '▸'}</span><span className="grow"><b>{t.groups[g]}</b><span className="small muted" style={{ display: 'block' }}>{t.n(groups[g].length)}</span></span>
                <span className={`count ${g === 'draft' ? 'grey' : g === 'done' ? 'green' : ''}`}>{groups[g].length}</span>
              </button>
              {open === g && groups[g].length > 0 && <div className="lessons" style={{ paddingTop: 10 }}>{groups[g].map((r, i) => (
                <button key={r.id} className="lesson-card" onClick={() => go(`/lesson/${r.id}`)}>
                  <div className={`thumb ${i % 2 ? 'alt' : ''}`}>{r.example ? <><span className="thumb-tag">{t.example}</span><span>{r.example}</span></> : r.setup.title.trim().charAt(0).toUpperCase()}</div>
                  {r.classes.length > 0 && <span className="small muted">{r.classes.map((k) => k.name).join(', ')}</span>}
                  <b className="small">{r.setup.title}</b>
                  <span className="small muted">{r.status === 'ready' ? t.parts(r.slides, r.items, r.cards, r.video) : t.status[r.status as 'working' | 'error']}</span>
                  {g === 'draft' && r.status === 'ready' && <span className="btn small primary" style={{ alignSelf: 'start' }}>{t.carryOn}</span>}
                </button>
              ))}</div>}
            </div>
          ))}
        </div>
        <aside className="card stack" style={{ gap: 8 }}>
          <b>{t.week}</b>
          {week.length ? <div className="banner warn"><b className="small" style={{ display: 'block' }}>{t.repeat}</b>{week.slice(0, 2).map((w, i) => <span key={i} className="small" style={{ display: 'block' }}>{w.what} – {w.where}</span>)}</div> : <p className="small muted">{t.noRepeat}</p>}
          <button className="link small" onClick={() => go('/insight')}>{t.seeSummary}</button>
        </aside>
      </div>
    </div>
  );
}

// The assigner's credits, and a promo code box (email accounts only).
function CreditBox({ credits, account, onChange, t }: { credits: Credits; account: boolean; onChange: (c: Credits) => void; t: Dict }) {
  const lang = useLang(), [code, setCode] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const day = (d: string) => new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const apply = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.promo(code); onChange(r.credits); setCode(''); setMsg(t.promoOk(r.added.credits, r.added.days)); }
    catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ gap: 4 }} title={t.creditsHint}>
      <b>{t.credits(credits)}</b>
      {credits.daily && <span className="small muted">{t.daily(credits)}</span>}
      {credits.subscriber && credits.planUntil && <span className="small muted">{t.until(day(credits.planUntil))}</span>}
      {account ? (
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void apply(); }}>
          <input className="grow" value={code} maxLength={32} placeholder={t.promoPh} aria-label={t.promo} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ minWidth: 0, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
          <button className="btn small" disabled={busy || code.trim().length < 4}>{t.apply}</button>
        </form>
      ) : <span className="small muted">{t.promoDemo}</span>}
      {msg && <span className="small" role="status">{msg}</span>}
    </div>
  );
}

// "Đang làm": her line of jobs (Son, 29 Oct: one job at a time per account, and show the line). It asks
// every few seconds while something runs or waits, and at once when a page starts a job.
const J = {
  vi: { badge: (r: number, q: number) => `Đang làm: ${r}${q ? ` · Chờ: ${q}` : ''}`, book: 'Đọc sách', lesson: 'Soạn bài', page: (p: string) => `trang ${p}`, waiting: (n: number) => `Chờ (thứ ${n})`, running: 'Đang chạy', stop: 'Dừng', cancel: 'Huỷ', done: 'Xong', error: 'Lỗi', cancelled: 'Đã dừng', none: 'Không có việc nào.', one: 'Mỗi tài khoản làm một việc một lúc; việc sau tự chạy khi việc trước xong.' },
  en: { badge: (r: number, q: number) => `Working on: ${r}${q ? ` · Waiting: ${q}` : ''}`, book: 'Reading a book', lesson: 'Making a lesson', page: (p: string) => `page ${p}`, waiting: (n: number) => `Waiting (number ${n})`, running: 'Running', stop: 'Stop', cancel: 'Cancel', done: 'Done', error: 'Error', cancelled: 'Stopped', none: 'No jobs.', one: 'Each account runs one job at a time; the next one starts when the one before is done.' },
};
function JobsBox({ lang }: { lang: 'vi' | 'en' }) {
  const t = J[lang], [jobs, setJobs] = useState<Job[]>([]), [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true, h = 0, last = 0;
    const tick = async () => {
      const r = await api.jobs().catch(() => null);
      if (!alive) return;
      const list = r?.jobs ?? [], active = list.filter((j) => j.status === 'running' || j.status === 'queued').length;
      if (active < last) window.dispatchEvent(new Event('lbm-credits'));
      last = active;
      setJobs(list);
      h = window.setTimeout(tick, list.some((j) => j.status === 'running' || j.status === 'queued') ? 3000 : 20000);
    };
    const now = () => { clearTimeout(h); void tick(); };
    void tick();
    window.addEventListener('lbm-jobs', now);
    return () => { alive = false; clearTimeout(h); window.removeEventListener('lbm-jobs', now); };
  }, []);
  const running = jobs.filter((j) => j.status === 'running').length, waiting = jobs.filter((j) => j.status === 'queued').length;
  if (!running && !waiting && !open) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost small jobs-badge" onClick={() => setOpen(!open)} aria-expanded={open}>{t.badge(running, waiting)}</button>
      {open && <div className="menu" style={{ minWidth: 280 }}>
        <span className="small muted">{t.one}</span>
        {!jobs.length && <span className="small">{t.none}</span>}
        {jobs.map((j) => (
          <div key={j.id} className="row small" style={{ gap: 8 }}>
            <span className="grow"><b>{j.kind === 'book' ? t.book : t.lesson}</b>: {j.kind === 'lesson' ? <button className="link small" onClick={() => { setOpen(false); go(`/lesson/${j.ref}`); }}>{j.title}</button> : j.title}<br />
              <span className="muted">{j.status === 'queued' ? t.waiting(j.place) : j.status === 'running' ? `${t.running}${j.kind === 'book' && /^\d+\/\d+$/.test(j.progress) ? ` · ${t.page(j.progress)}` : ''}` : t[j.status]}</span></span>
            {(j.status === 'queued' || (j.status === 'running' && j.kind === 'book')) && <button className="btn small" onClick={async () => { await api.cancelJob(j.id).catch(() => {}); window.dispatchEvent(new Event('lbm-jobs')); }}>{j.status === 'queued' ? t.cancel : t.stop}</button>}
          </div>
        ))}
      </div>}
    </div>
  );
}

// The pupils' side, made for a phone (Chi's design, StudentJoin … StudentNext): few words, one
// instruction per screen, big buttons, no scores, no labels, no comparisons, no emoji in the chrome.
// They enter with the class code and tap their name (or open their own link); then "Hôm nay con học
// gì" as four tiles, the video or slides, practice in rounds of 5 (answers checked on the server),
// flashcards and the pairs game. A VI/EN switch on every screen; kind words only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api.ts';
import { browserSay, readable, stopSay } from '../speak.ts';
import { langChosen, setLang, useLang } from '../i18n.ts';
import { LangToggle } from '../pages/LangToggle.tsx';
import { go, usePath } from '../router.ts';

type L = 'vi' | 'en';
const ROUND = 5;   // questions in one go (Chi, 29 Oct: 22 in one run was too many)
const PAIRS = 4;  // pairs in the game (Chi's design: "Tìm 4 cặp", 8 cards fit one phone screen)
const S = {
  vi: {
    hiKid: 'Chào con!', joinSub: 'Nhập mã lớp cô đưa, rồi chọn tên con nhé.', codeLabel: 'Mã lớp', next: 'Tiếp', who: 'Con là ai?', notMe: 'Đổi lớp', noName: 'Không thấy tên con? Hỏi cô giáo nhé.',
    hello: (n: string, k: string) => (k && k !== n ? `Chào ${n} · ${k}` : `Chào ${n}`), todayIs: (t: string) => `Bài hôm nay: ${t}`, other: (t: string) => `Bài khác: ${t}`, fromWork: 'Luyện lại từ bài con làm', nothing: 'Hôm nay chưa có bài. Con quay lại sau nhé!', leave: 'Thoát', remind: 'Nhớ nhé!',
    video: 'Xem video', slides: 'Xem bài', seen: 'đã xem', cards: 'Thẻ nhớ', nCards: (n: number) => `${n} thẻ`, doneMark: 'đã xong', practise: 'Làm bài tập', nItems: (n: number) => `${n} câu`, pairs: 'Lật thẻ', nPairs: (n: number) => `Tìm ${n} cặp`,
    gotSoFar: 'Con đã đi được', back: 'Quay lại', done: 'Xong', subject: { math: 'Toán', english: 'Tiếng Anh' } as Record<string, string>,
    qOf: (k: number, n: number) => `Câu ${k}/${n}`, pick: 'Con chọn câu trả lời đúng nhé', listenQ: 'Nghe câu hỏi', almost: 'Gần đúng rồi! Thử lại nhé', notThis: 'Chưa đúng rồi. Mình sang câu khác nhé', right: 'Đúng rồi, giỏi quá!',
    retry: 'Thử lại', nextQ: 'Câu tiếp theo', check: 'Kiểm tra', clear: 'Xoá', type: 'Đáp số', tr: 'Đúng', fa: 'Sai',
    roundDone: (n: number) => `Con làm xong ${n} câu rồi!`, roundSub: 'Con nghỉ một chút, hoặc làm tiếp nhé.', more: (n: number) => `Làm tiếp ${n} câu`, toLesson: 'Về trang bài học',
    finish: 'Con làm xong rồi!', finishSub: 'Con đã cố gắng rất nhiều. Đây là gợi ý cho con:',
    sCardsTag: 'Ôn lại', sCards: 'Ôn thẻ nhớ', sCardsSub: 'Ôn lại một chút là con nhớ lâu hơn.', sPairsTag: 'Trò chơi', sPairs: 'Lật thẻ tìm cặp', sPairsSub: 'Ghép phép tính với kết quả.', sWatchTag: 'Xem lại', sWatch: 'Xem lại bài', sWatchSub: 'Xem lại cách làm trong bài.', go: 'Làm ngay',
    cardsOf: (t: string) => `Thẻ nhớ · ${t}`, cardN: (i: number, n: number) => `đã xong ${i}/${n} thẻ`, flip: 'Chạm để lật thẻ', again: 'Ôn lại', known: 'Đã nhớ', cardsDone: 'Con ôn xong thẻ nhớ rồi!', comeBack: 'Thẻ này sẽ quay lại sau nhé.', setAside: 'Mình để thẻ này sang "cần ôn", đi tiếp nhé.', toReview: (n: number) => `${n} thẻ cần ôn`, reviewList: 'Thẻ cần ôn lại:',
    givenOn: (d: string) => `giao ngày ${d}`, videoSoon: 'Video sắp có', givenList: (n: number) => `Bài đã giao (${n})`, doneList: (n: number) => `Bài đã xong (${n})`, allDone: 'Con làm xong hết các bài rồi! Giỏi quá.', steps: (d: number, n: number) => `${d}/${n} bước`, readSlide: 'Đọc', slideOf: (i: number, n: number) => `Trang ${i}/${n}`, pickOrder: 'Con xếp các chữ thành câu nhé', pickMatch: 'Con ghép cho đúng nhé', pickTF: 'Đúng hay sai?', pickType: 'Con điền đáp số nhé', missing: (w: string) => `Còn chữ chưa dùng: ${w}`, tapBack: 'Chạm vào chữ ở trên để bỏ xuống.',
    pairsTitle: 'Lật thẻ tìm cặp', pairsSub: 'Ghép thẻ với nghĩa hoặc kết quả', pairsN: (f: number, n: number) => `${f}/${n} cặp`, pairsHint: 'Chạm vào 2 thẻ để lật. Tìm hết các cặp nhé!', pairsDone: 'Con tìm đủ các cặp rồi!', playAgain: 'Chơi lại',
  },
  en: {
    hiKid: 'Hi there!', joinSub: 'Type the class code from your teacher, then tap your name.', codeLabel: 'Class code', next: 'Next', who: 'Who are you?', notMe: 'Change class', noName: "Can't see your name? Ask your teacher.",
    hello: (n: string, k: string) => (k && k !== n ? `Hi ${n} · ${k}` : `Hi ${n}`), todayIs: (t: string) => `Today: ${t}`, other: (t: string) => `Another lesson: ${t}`, fromWork: 'Practice again from your work', nothing: 'Nothing for today yet. Come back later!', leave: 'Leave', remind: 'Remember!',
    video: 'Watch the video', slides: 'Look at the lesson', seen: 'watched', cards: 'Flashcards', nCards: (n: number) => `${n} cards`, doneMark: 'done', practise: 'Practise', nItems: (n: number) => `${n} questions`, pairs: 'Find the pairs', nPairs: (n: number) => `Find ${n} pairs`,
    gotSoFar: "How far you've got", back: 'Back', done: 'Done', subject: { math: 'Maths', english: 'English' } as Record<string, string>,
    qOf: (k: number, n: number) => `Question ${k}/${n}`, pick: 'Pick the right answer', listenQ: 'Listen to the question', almost: 'Almost! Try again', notThis: "Not this time. Let's go on", right: "That's right, well done!",
    retry: 'Try again', nextQ: 'Next question', check: 'Check', clear: 'Clear', type: 'Your answer', tr: 'True', fa: 'False',
    roundDone: (n: number) => `You did ${n} questions!`, roundSub: 'Take a little break, or carry on.', more: (n: number) => `Do ${n} more`, toLesson: 'Back to the lesson',
    finish: 'All done!', finishSub: 'You worked really hard. Here is what to do next:',
    sCardsTag: 'Go over', sCards: 'Go over the flashcards', sCardsSub: 'A quick look helps you remember.', sPairsTag: 'Game', sPairs: 'Find the pairs', sPairsSub: 'Match each card with its partner.', sWatchTag: 'Look again', sWatch: 'Look at the lesson again', sWatchSub: 'See how it is done once more.', go: 'Go',
    cardsOf: (t: string) => `Flashcards · ${t}`, cardN: (i: number, n: number) => `${i}/${n} cards done`, flip: 'Tap to turn the card over', again: 'Again', known: 'I know it', cardsDone: 'You went over all the cards!', comeBack: 'This card will come back later.', setAside: 'This card goes to "go over again". On you go!', toReview: (n: number) => `${n} to go over`, reviewList: 'Cards to go over again:',
    givenOn: (d: string) => `given ${d}`, videoSoon: 'Video coming soon', givenList: (n: number) => `Lessons given (${n})`, doneList: (n: number) => `Lessons done (${n})`, allDone: 'You did all your lessons! Well done.', steps: (d: number, n: number) => `${d}/${n} steps`, readSlide: 'Read it', slideOf: (i: number, n: number) => `Page ${i}/${n}`, pickOrder: 'Put the words in order', pickMatch: 'Match the pairs', pickTF: 'True or false?', pickType: 'Type the answer', missing: (w: string) => `Not used yet: ${w}`, tapBack: 'Tap a word above to take it back.',
    pairsTitle: 'Find the pairs', pairsSub: 'Match each card with its partner', pairsN: (f: number, n: number) => `${f}/${n} pairs`, pairsHint: 'Tap 2 cards to turn them over. Find all the pairs!', pairsDone: 'You found all the pairs!', playAgain: 'Play again',
  },
};
type T = (typeof S)['vi'];

// A server that does not answer (Chi #49: the page stood still while it was down): each request gives up
// after 15 s, and a bar says the connection was lost, with Try again; it goes once a request gets through.
const net = (up: boolean) => window.dispatchEvent(new Event(up ? 'lbm-online' : 'lbm-offline'));
async function p<R>(method: string, path: string, body?: unknown): Promise<R> {
  let r: Response;
  try { r = await fetch(`/api/p${path}`, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15e3) }); }
  catch { net(false); throw new ApiError('network', 'Mất kết nối', 'Connection lost', 0); }
  net(r.status < 500);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.code || 'server', j.error || 'Lỗi', j.errorEn || 'Error', r.status);
  return j as R;
}
interface TodayRow { id: string; title: string; subject: string; lang: L; slides: number; items: number; cards: number; video: boolean; video_seen: boolean; slides_seen: boolean; cards_seen: boolean; pairs_seen?: boolean; cards_review?: number; given?: string; video_making?: boolean; done: boolean; answered: number; greet?: { vi: string; en: string } | null }
interface Today { pupil: { name: string }; class: { name: string }; lessons: TodayRow[]; reminder?: { vi: string; en: string } | null }
interface PItem { id: string; template: string; prompt: string; options?: string[]; sentence?: string; words?: string[]; left?: string[]; right?: string[]; unit?: string; listen?: boolean; fromWork?: boolean; stack?: { a: number; op: string; b: number } }
interface PLesson { id: string; title: string; lang: L; retry: boolean; hints: boolean; video: string | null; slides: { id: string; heading: string; bullets: string[]; example?: string; image?: string }[]; items: PItem[]; cards: { id: string; front: string; back: string; emoji?: string }[]; tried: Record<string, boolean> }

// Small line icons instead of emoji (the design's tiles).
const ICON: Record<string, ReactNode> = {
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  cards: <><rect x="4" y="6" width="12" height="14" rx="2" /><path d="M8 4h10a2 2 0 0 1 2 2v12" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  pairs: <><rect x="3" y="4" width="8" height="8" rx="2" /><rect x="13" y="12" width="8" height="8" rx="2" /><path d="M15 6h4v4M9 18H5v-4" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
  sound: <><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 9a4 4 0 0 1 0 6" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  star: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor" />,
};
const Icon = ({ name, size = 20 }: { name: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>;

// Every screen: a tint, an optional back button and title, and the VI/EN switch at the top right.
function Frame({ tone = '', title, sub, onBack, t, children }: { tone?: string; title?: ReactNode; sub?: ReactNode; onBack?: () => void; t: T; children: ReactNode }) {
  return (
    <div className={`pupil ${tone}`}>
      <div className="p-stack">
        <div className="p-top">
          {onBack && <button className="p-icon" onClick={onBack} aria-label={t.back}><Icon name="back" /></button>}
          <div className="grow p-ell">{title && <b className="p-ell" style={{ display: 'block' }}>{title}</b>}{sub && <span className="p-soft small">{sub}</span>}</div>
          <LangToggle />
        </div>
        {children}
      </div>
    </div>
  );
}

function Offline() {
  const lang = useLang() as L, [off, setOff] = useState(false);
  useEffect(() => {
    const down = () => setOff(true), up = () => setOff(false);
    window.addEventListener('lbm-offline', down); window.addEventListener('lbm-online', up);
    return () => { window.removeEventListener('lbm-offline', down); window.removeEventListener('lbm-online', up); };
  }, []);
  if (!off) return null;
  return <div className="p-offline" role="alert"><span>{lang === 'en' ? 'Connection lost. Your answers so far are saved.' : 'Mất kết nối. Các câu con đã làm vẫn được lưu.'}</span>
    <button onClick={() => location.reload()}>{lang === 'en' ? 'Try again' : 'Thử lại'}</button></div>;
}

export function Pupil() { return <><PupilPage /><Offline /></>; }
function PupilPage() {
  const path = usePath(), lang = useLang() as L, t = S[lang];
  const [today, setToday] = useState<Today | null | undefined>(undefined), [show, setShow] = useState(''), [fold, setFold] = useState({ open: false, done: false });
  // a child's phone opens in the language of the lessons given (Chi #24), unless it was switched by hand
  const load = () => p<Today>('GET', '/today').then((d) => { const l = d?.lessons?.[0]?.lang; if (l && !langChosen() && l !== lang) setLang(l); setToday(d); }).catch((e) => { if (e instanceof ApiError && e.status >= 400 && e.status < 500) setToday(null); else setToday((x) => x ?? null); });
  useEffect(() => {
    const link = /^\/p\/([\w-]+)$/.exec(path)?.[1];
    if (link) { p('POST', '/link', { link }).then(() => { go('/hoc'); void load(); }).catch(() => { go('/hoc'); setToday(null); }); return; }
    void load();
  }, []);
  const m = /^\/hoc\/a\/(\w+)\/(slides|video|practice|cards|match)$/.exec(path);
  if (today === undefined) return <div className="pupil" />;
  if (!today) return <Join code={/^\/hoc\/(\w{4,12})$/.exec(path)?.[1] || ''} onIn={load} t={t} />;
  if (m) return <LessonPart id={m[1]} part={m[2] as Part} t={t} onBack={() => { go('/hoc'); void load(); }} />;
  return (
    <Frame t={t} title={<span className="p-soft">{t.hello(today.pupil.name, today.class.name)}</span>}>
      {today.reminder && <div className="p-note" role="note"><span className="p-bang">!</span><span><b>{t.remind}</b> {lang === 'en' ? today.reminder.en : today.reminder.vi}</span></div>}
      {!today.lessons.length && <p className="p-soft">{t.nothing}</p>}
      {/* one lesson for today, the rest in two folded lists (Chi #76: four "Another lesson" blocks, done ones too) */}
      {(() => {
        const open = today.lessons.filter((l) => !l.done), fin = today.lessons.filter((l) => l.done), first = open[0];
        const day = (d?: string) => (d ? new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }) : '');
        const partsOf = (l: TodayRow) => [l.slides > 0 ? l.slides_seen : null, l.video ? l.video_seen : null, l.cards > 0 ? l.cards_seen : null, l.items > 0 ? l.done : null, l.cards >= 3 ? !!l.pairs_seen : null].filter((x) => x !== null) as boolean[];
        const block = (l: TodayRow) => {
          const parts = partsOf(l);
          return (
            <>
              {l.greet && <p className="p-soft">{lang === 'en' ? l.greet.en : l.greet.vi}</p>}
              <div className="p-acts">
                {/* "Xem bài" for every lesson (Chi #79); the video beside it once made, "coming soon" while it is (Chi #78) */}
                {l.slides > 0 && <Act tone="blue" icon="book" title={t.slides} sub={l.slides_seen ? t.seen : ''} onClick={() => go(`/hoc/a/${l.id}/slides`)} />}
                {l.video ? <Act tone="blue" icon="play" title={t.video} sub={l.video_seen ? t.seen : ''} onClick={() => go(`/hoc/a/${l.id}/video`)} />
                  : l.video_making && <Act tone="blue" icon="play" title={t.video} sub={t.videoSoon} disabled onClick={() => {}} />}
                {l.cards > 0 && <Act tone="green" icon="cards" title={t.cards} sub={`${t.nCards(l.cards)}${l.cards_seen ? ` · ${t.doneMark}` : ''}${l.cards_seen && l.cards_review ? ` · ${t.toReview(l.cards_review)}` : ''}`} onClick={() => go(`/hoc/a/${l.id}/cards`)} />}
                {l.items > 0 && <Act tone="orange" icon="pencil" title={t.practise} sub={`${t.nItems(l.items)}${l.done ? ` · ${t.doneMark}` : ''}`} onClick={() => go(`/hoc/a/${l.id}/practice`)} />}
                {l.cards >= 3 && <Act tone="purple" icon="pairs" title={t.pairs} sub={`${t.nPairs(Math.min(PAIRS, l.cards))}${l.pairs_seen ? ` · ${t.doneMark}` : ''}`} onClick={() => go(`/hoc/a/${l.id}/match`)} />}
              </div>
              {parts.length > 0 && <div className="p-progress"><span className="small"><b>{t.gotSoFar}</b></span><div className="p-seg">{parts.map((x, i) => <i key={i} className={x ? 'on' : ''} />)}</div></div>}
            </>
          );
        };
        const row = (l: TodayRow) => { const ps = partsOf(l); return (
          <div key={l.id}>
            <button className="p-row" aria-expanded={show === l.id} onClick={() => setShow(show === l.id ? '' : l.id)}><b>{l.title}</b><span className="small p-soft">{t.steps(ps.filter(Boolean).length, ps.length)} · {t.givenOn(day(l.given))}</span></button>
            {show === l.id && <div className="p-lesson">{block(l)}</div>}
          </div>); };
        const folded = (k: 'open' | 'done', title: string, list: TodayRow[]) => list.length > 0 && (
          <section className="p-fold-box">
            <button className="p-fold" aria-expanded={fold[k]} onClick={() => setFold((f) => ({ ...f, [k]: !f[k] }))}><span>{title}</span><span aria-hidden="true">{fold[k] ? '▾' : '▸'}</span></button>
            {fold[k] && list.map(row)}
          </section>);
        return <>
          {first && <section className="p-lesson"><span className="p-chip">{t.subject[first.subject] || first.subject}</span><h1>{t.todayIs(first.title)}</h1>{block(first)}</section>}
          {!first && fin.length > 0 && <p className="p-soft">{t.allDone}</p>}
          {folded('open', t.givenList(open.length - 1), open.slice(1))}
          {folded('done', t.doneList(fin.length), fin)}
        </>;
      })()}
      <button className="p-link" onClick={async () => { await p('POST', '/leave').catch(() => {}); setToday(null); go('/hoc'); }}>{t.leave}</button>
    </Frame>
  );
}

function Act({ tone, icon, title, sub, onClick, disabled }: { tone: string; icon: string; title: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return <button className={`p-act ${tone}`} disabled={disabled} onClick={onClick}><span className="p-ico"><Icon name={icon} /></span><b>{title}</b>{sub && <span className="small">{sub}</span>}</button>;
}

function Join({ code: start, onIn, t }: { code: string; onIn: () => void; t: T }) {
  const [code, setCode] = useState(start.toUpperCase()), [room, setRoom] = useState<{ class: { name: string }; pupils: { id: string; name: string }[] } | null>(null), [err, setErr] = useState('');
  const lang = useLang();
  const look = async (c = code) => { setErr(''); try { setRoom(await p('GET', `/class/${encodeURIComponent(c.trim())}`)); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } };
  useEffect(() => { if (start) void look(start); }, []);
  if (room) return (
    <Frame t={t} title={room.class.name}>
      <h1>{t.who}</h1>
      <div className="p-names">{room.pupils.map((x) => <button key={x.id} className="p-name" onClick={async () => { await p('POST', '/enter', { code, pupilId: x.id }); go('/hoc'); onIn(); }}>{x.name}</button>)}</div>
      <button className="p-link" onClick={() => { setRoom(null); go('/hoc'); }}>{t.notMe}</button>
      <p className="p-soft small center">{t.noName}</p>
    </Frame>
  );
  return (
    <Frame t={t}>
      <form className="p-stack center" style={{ padding: 0 }} onSubmit={(e) => { e.preventDefault(); void look(); }}>
        <img className="p-logo" src="/favicon.svg" alt="LessonBloom" />
        <h1>{t.hiKid}</h1>
        <p className="p-soft">{t.joinSub}</p>
        <label className="p-label">{t.codeLabel}<input className="p-input code" autoCapitalize="characters" autoComplete="off" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <button className="p-btn main" disabled={code.trim().length < 4}>{t.next}</button>
        {err && <p className="p-soft">{err}</p>}
      </form>
    </Frame>
  );
}

type Part = 'slides' | 'video' | 'practice' | 'cards' | 'match';
function LessonPart({ id, part, t, onBack }: { id: string; part: Part; t: T; onBack: () => void }) {
  const [l, setL] = useState<PLesson | null>(null);
  useEffect(() => { p<{ lesson: PLesson }>('GET', `/a/${id}`).then((r) => setL(r.lesson)).catch(onBack); }, [id]);
  if (!l) return <div className="pupil" />;
  const seen = (what: string, review?: number) => { void p('POST', `/a/${id}/seen`, { what, ...(review != null ? { review } : {}) }); };
  if (part === 'cards') return <Cards l={l} t={t} onBack={onBack} onEnd={(review) => { seen('cards', review); onBack(); }} />;
  if (part === 'match') return <Match l={l} t={t} onBack={onBack} onAll={() => seen('pairs')} />;
  return (
    <Frame t={t} title={l.title} onBack={onBack}>
      {part === 'slides' && <Slides l={l} t={t} onEnd={() => { seen('slides'); onBack(); }} />}
      {part === 'video' && <Video l={l} t={t} onEnd={() => seen('video')} onBack={onBack} />}
      {part === 'practice' && <Practice l={l} t={t} onHome={onBack} to={(x) => go(`/hoc/a/${id}/${x}`)} />}
    </Frame>
  );
}

function Slides({ l, t, onEnd }: { l: PLesson; t: T; onEnd: () => void }) {
  const [i, setI] = useState(0), s = l.slides[i], audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); stopSay(); }, [i]);
  // read in the voice the video uses; the phone's own voice while that one is off
  const say = () => {
    audio.current?.pause(); stopSay();
    const a = new Audio(`/api/p/a/${l.id}/slide/${s.id}/say`); audio.current = a;
    void a.play().catch(() => browserSay(readable([s.heading, ...s.bullets, s.example || ''].join('. '), l.lang), l.lang));
  };
  return (
    <>
      <div className="p-card">
        {s.image && <img className="p-pic" src={s.image} alt="" />}
        <h2>{s.heading}</h2>
        {s.bullets.length > 0 && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
        {s.example && <div className="p-ex">{s.example}</div>}
        <button className="p-pill" onClick={say}><Icon name="sound" size={16} /> {t.readSlide}</button>
      </div>
      <p className="p-soft small center">{t.slideOf(i + 1, l.slides.length)}</p>
      <div className="p-seg blue">{l.slides.map((x, j) => <i key={x.id} className={j <= i ? 'on' : ''} />)}</div>
      <div className="p-actions row2">
        <button className="p-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label={t.back}><Icon name="back" /></button>
        {i < l.slides.length - 1 ? <button className="p-btn main" onClick={() => setI(i + 1)}>{t.next}</button> : <button className="p-btn main" onClick={onEnd}>{t.done}</button>}
      </div>
    </>
  );
}

// "Lật thẻ" flashcards: tap to turn over; "Đã nhớ" takes the card out. "Ôn lại" puts it at the back and says it will
// come back (Chi #65: the count stood still and the pile never seemed to end); a card sent back twice is set aside
// as "to go over" so the pile always ends, and the end screen names those cards.
function Cards({ l, t, onBack, onEnd }: { l: PLesson; t: T; onBack: () => void; onEnd: (review: number) => void }) {
  const [pile, setPile] = useState(() => l.cards.map((_, i) => i)), [flip, setFlip] = useState(false), [again, setAgain] = useState<Record<number, number>>({}), [aside, setAside] = useState<number[]>([]), [note, setNote] = useState('');
  const known = l.cards.length - pile.length, c = l.cards[pile[0]];
  const step = (keep: boolean) => {
    setFlip(false);
    const k = pile[0];
    if (!keep) { setNote(''); setPile(pile.slice(1)); return; }
    const n = (again[k] ?? 0) + 1;
    setAgain({ ...again, [k]: n });
    if (n >= 2) { setAside([...aside, k]); setPile(pile.slice(1)); setNote(t.setAside); }
    else { setPile([...pile.slice(1), k]); setNote(t.comeBack); }
  };
  return (
    <Frame tone="tone-cards" t={t} title={t.cardsOf(l.title)} sub={c ? t.cardN(known, l.cards.length) : ''} onBack={onBack}>
      {c ? <>
        <button className={`p-flash ${flip ? 'back' : ''}`} onClick={() => setFlip(!flip)}>
          {!flip ? <>{c.emoji && <span className="p-emo">{c.emoji}</span>}<b className="p-big-word">{c.front}</b><span className="p-soft small">{t.flip}</span></> : <b className="p-big-word ok">{c.back}</b>}
        </button>
        <div className="p-actions two"><button className="p-btn soft-orange" onClick={() => step(true)}>{t.again}</button><button className="p-btn ok" onClick={() => step(false)}>{t.known}</button></div>
        {note && <p className="p-soft small center" role="status">{note}</p>}
      </> : <div className="p-stack center" style={{ padding: 0 }}><span className="p-badge"><Icon name="star" size={40} /></span><h2>{t.cardsDone}</h2>
        {aside.length > 0 && <p className="p-soft">{t.reviewList} <b>{aside.map((k) => l.cards[k].front).join(', ')}</b></p>}
        <button className="p-btn main" onClick={() => onEnd(aside.length)}>{t.done}</button></div>}
    </Frame>
  );
}

// Practice in rounds of 5, one item per screen. A wrong answer: "Thử lại nhé" (and the hint, when hints are on).
function Practice({ l, t, onHome, to }: { l: PLesson; t: T; onHome: () => void; to: (part: 'cards' | 'match' | 'slides' | 'video') => void }) {
  const firstOpen = Math.max(0, l.items.findIndex((it) => !(it.id in l.tried)));
  const startAt = Object.keys(l.tried).length >= l.items.length ? l.items.length : firstOpen;
  const [i, setI] = useState(startAt), [roundStart, setRoundStart] = useState(startAt), [pause, setPause] = useState(false);
  const [given, setGiven] = useState(''), [res, setRes] = useState<{ correct: boolean | null; again: boolean; explain: string } | null>(null), [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<number[]>([]), [pairs, setPairs] = useState<Record<string, string>>({}), [pickL, setPickL] = useState(''), [miss, setMiss] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const it = l.items[i], roundEnd = Math.min(l.items.length, roundStart + ROUND), inRound = roundEnd - roundStart;
  useEffect(() => { setGiven(''); setRes(null); setOrder([]); setPairs({}); setPickL(''); setMiss(''); }, [i]);

  if (!it) return (
    <div className="p-stack center" style={{ padding: 0 }}>
      <span className="p-badge"><Icon name="star" size={44} /></span>
      <h1>{t.finish}</h1><p className="p-soft">{t.finishSub}</p>
      {l.cards.length > 0 && <Suggest tone="orange" tag={t.sCardsTag} title={t.sCards} sub={t.sCardsSub} go={t.go} onClick={() => to('cards')} />}
      {l.cards.length >= 3 && <Suggest tone="purple" tag={t.sPairsTag} title={t.sPairs} sub={t.sPairsSub} go={t.go} onClick={() => to('match')} />}
      {(l.video || l.slides.length > 0) && <Suggest tone="blue" tag={t.sWatchTag} title={t.sWatch} sub={t.sWatchSub} go={t.go} onClick={() => to(l.video ? 'video' : 'slides')} />}
      <button className="p-btn" onClick={onHome}>{t.toLesson}</button>
    </div>
  );
  if (pause) return (
    <div className="p-stack center" style={{ padding: 0 }}>
      <span className="p-badge"><Icon name="star" size={44} /></span>
      <h1>{t.roundDone(i - roundStart)}</h1><p className="p-soft">{t.roundSub}</p>
      <button className="p-btn main" onClick={() => { setRoundStart(i); setPause(false); }}>{t.more(Math.min(ROUND, l.items.length - i))}</button>
      <button className="p-btn" onClick={onHome}>{t.toLesson}</button>
    </div>
  );
  const send = async (answer: string) => {
    if (busy) return;
    setBusy(true);
    try { setRes(await p<{ correct: boolean | null; again: boolean; explain: string }>('POST', `/a/${l.id}/answer`, { itemId: it.id, answer })); }
    catch { setGiven(''); }   // not sent: she can answer again once the connection is back (the bar says so)
    finally { setBusy(false); }
  };
  const nextQ = () => { const n = i + 1; setI(n); if (n >= roundEnd && n < l.items.length) setPause(true); };
  const answered = res && (res.correct || !res.again);
  const choose = (o: string) => { if (!answered) { setGiven(o); void send(o); } };
  const optClass = (o: string) => `p-opt ${given === o && res ? (res.correct ? 'right' : 'wrong') : ''}`;
  // the server's voice; a Vietnamese question is read by the phone itself while that voice is off (Chi #49)
  const say = () => {
    audio.current?.pause(); stopSay();
    const lg = l.lang === 'en' || it.listen ? 'en' : 'vi', a = new Audio(`/api/p/a/${l.id}/say/${it.id}`);
    audio.current = a; void a.play().catch(() => { if (!it.listen) browserSay(readable(`${it.prompt}${it.sentence ? ` ${it.sentence}` : ''}`, lg), lg); });
  };
  // "Choose the right answer: 61 - 37 = ?" → the instruction small, the sum big (the design)
  const split = /^(.{3,80}?):\s*(.*\d.*)$/.exec(it.prompt);

  return (
    <>
      <div className="p-seg blue" aria-label={t.qOf(i - roundStart + 1, inRound)}>{Array.from({ length: inRound }, (_, k) => <i key={k} className={roundStart + k < i || (roundStart + k === i && answered) ? 'on' : roundStart + k === i ? 'now' : ''} />)}</div>
      <div className="p-card q center">
        {it.fromWork && <span className="p-chip">{t.fromWork}</span>}
        <span className="p-soft small">{split ? split[1] : it.template === 'order' ? t.pickOrder : it.template === 'match' ? t.pickMatch : it.template === 'truefalse' ? t.pickTF : !it.options && (it.template === 'fill' || it.template === 'word' || it.template === 'column') ? t.pickType : t.pick} · {t.qOf(i - roundStart + 1, inRound)}</span>
        {/* "đặt tính rồi tính": the numbers one above the other, ones under ones (Chi #47) */}
        {it.stack ? <div className="p-col" role="img" aria-label={split ? split[2] : it.prompt}><span /><span>{it.stack.a}</span><span>{it.stack.op}</span><span>{it.stack.b}</span><i /></div>
          : <p className={split ? 'p-sum' : 'p-q'}>{split ? split[2] : it.prompt}</p>}
        {it.sentence && <p className="p-q">{it.sentence}</p>}
        <button className="p-pill" onClick={say}><Icon name="sound" size={16} /> {t.listenQ}</button>
      </div>
      {it.options && <div className="p-opts">{it.options.map((o) => <button key={o} className={optClass(o)} disabled={!!answered} onClick={() => choose(o)}>{o}</button>)}</div>}
      {it.template === 'truefalse' && <div className="p-opts">{(['true', 'false'] as const).map((o) => <button key={o} className={optClass(o)} disabled={!!answered} onClick={() => choose(o)}>{o === 'true' ? t.tr : t.fa}</button>)}</div>}
      {(it.template === 'fill' || it.template === 'word' || it.template === 'column') && !it.options && (
        <form className="p-stack" style={{ padding: 0 }} onSubmit={(e) => { e.preventDefault(); if (given.trim()) void send(given.trim()); }}>
          <div className="row center"><input className="p-input p-num" inputMode="numeric" autoFocus placeholder={t.type} value={given} disabled={!!answered} onChange={(e) => setGiven(e.target.value.replace(/[^\d]/g, '').slice(0, 7))} />{it.unit && <span className="p-q">{it.unit}</span>}</div>
          {!answered && <button className="p-btn main" disabled={!given.trim() || busy}>{t.check}</button>}
        </form>
      )}
      {it.template === 'order' && it.words && (
        <>
          <div className="p-built">{order.map((k, j) => <button key={j} className="p-word on" disabled={!!answered} onClick={() => { setOrder(order.filter((_, x) => x !== j)); setMiss(''); }}>{it.words![k]}</button>)}&nbsp;</div>
          <div className="p-opts words">{it.words.map((w, k) => <button key={k} className={`p-word ${order.includes(k) ? 'used' : ''}`} disabled={order.includes(k) || !!answered} aria-hidden={order.includes(k)} onClick={() => { setOrder([...order, k]); setMiss(''); }}>{w}</button>)}</div>
          {!answered && order.length > 0 && <p className="p-soft small center">{t.tapBack}</p>}
          {miss && <p className="p-feedback" role="status"><b>{miss}</b></p>}
          {!answered && <div className="p-actions row2"><button className="p-btn" onClick={() => { setOrder([]); setMiss(''); }}>{t.clear}</button><button className="p-btn main" disabled={!order.length || busy} onClick={() => { const left = it.words!.filter((_, k) => !order.includes(k)); if (left.length) setMiss(t.missing(left.join(', '))); else void send(order.map((k) => it.words![k]).join(' ')); }}>{t.check}</button></div>}
        </>
      )}
      {it.template === 'match' && it.left && it.right && (
        <>
          <div className="p-match">
            <div>{it.left.map((w) => <button key={w} className={`p-word ${pickL === w ? 'sel' : ''} ${pairs[w] ? 'on' : ''}`} disabled={!!answered} onClick={() => setPickL(w)}>{w}{pairs[w] ? ` ${pairs[w]}` : ''}</button>)}</div>
            <div>{it.right.map((e) => <button key={e} className={`p-word emo ${Object.values(pairs).includes(e) ? 'on' : ''}`} disabled={!pickL || !!answered} onClick={() => { const np = { ...pairs }; for (const k of Object.keys(np)) if (np[k] === e) delete np[k]; np[pickL] = e; setPairs(np); setPickL(''); }}>{e}</button>)}</div>
          </div>
          {!answered && <div className="p-actions row2"><button className="p-btn" onClick={() => setPairs({})}>{t.clear}</button><button className="p-btn main" disabled={Object.keys(pairs).length !== it.left.length || busy} onClick={() => send(Object.entries(pairs).map(([w, e]) => `${w}=${e}`).join(','))}>{t.check}</button></div>}
        </>
      )}
      {res && (
        <div className={`p-feedback ${res.correct ? 'good' : ''}`} role="status">
          <b>{res.correct ? t.right : res.again ? t.almost : t.notThis}</b>
          {res.explain && <p>{res.explain}</p>}
        </div>
      )}
      {res && !res.correct && res.again && <button className="p-btn" onClick={() => { setRes(null); setGiven(''); setOrder([]); setPairs({}); }}>{t.retry}</button>}
      {answered && <button className="p-btn main" onClick={nextQ}>{t.nextQ}</button>}
    </>
  );
}

function Suggest({ tone, tag, title, sub, go: goLabel, onClick }: { tone: string; tag: string; title: string; sub: string; go: string; onClick: () => void }) {
  return <div className={`p-suggest ${tone}`}><span className="p-chip">{tag}</span><b>{title}</b><span className="p-soft small">{sub}</span><button className="p-btn main" onClick={onClick}>{goLabel}</button></div>;
}

// The lesson video (made by the teacher, or for a parent's child when assigned).
function Video({ l, t, onEnd, onBack }: { l: PLesson; t: T; onEnd: () => void; onBack: () => void }) {
  if (!l.video) return <p className="p-soft">…</p>;
  return (
    <>
      <video src={l.video} controls playsInline autoPlay style={{ width: '100%', borderRadius: 16, background: '#000' }} onEnded={onEnd} />
      <button className="p-btn main" onClick={() => { onEnd(); onBack(); }}>{t.done}</button>
    </>
  );
}

// "Lật thẻ tìm cặp": each flashcard becomes two face-down cards (its front and its back); turn two over,
// a pair stays open. No timer, no score.
function Match({ l, t, onBack, onAll }: { l: PLesson; t: T; onBack: () => void; onAll: () => void }) {
  const make = () => {
    const tiles = l.cards.slice(0, PAIRS).flatMap((c) => [{ k: c.id, text: c.front, emo: c.emoji }, { k: c.id, text: c.back, emo: '' }]);
    for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
    return tiles;
  };
  const [tiles, setTiles] = useState(make), [open, setOpen] = useState<number[]>([]), [found, setFound] = useState<string[]>([]);
  const turn = (i: number) => {
    if (open.includes(i) || found.includes(tiles[i].k) || open.length === 2) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length === 2) setTimeout(() => { if (tiles[next[0]].k === tiles[next[1]].k) setFound((f) => [...f, tiles[next[0]].k]); setOpen([]); }, 800);
  };
  const n = tiles.length / 2, all = found.length === n, told = useRef(false);
  // all pairs found: kept as done, like the flashcards (Chi #66), once
  useEffect(() => { if (all && !told.current) { told.current = true; onAll(); } }, [all]);
  return (
    <Frame tone="tone-pairs" t={t} title={t.pairsTitle} sub={t.pairsSub} onBack={onBack}>
      <span className="p-chip">{t.pairsN(found.length, n)}</span>
      <div className="p-memory">{tiles.map((x, i) => { const up = open.includes(i) || found.includes(x.k); return (
        <button key={i} className={`p-tile ${up ? 'up' : ''} ${found.includes(x.k) ? 'got' : ''}`} onClick={() => turn(i)} aria-label={up ? x.text : '?'}>{up ? <>{x.emo && <span className="p-emo small">{x.emo}</span>}{x.text}</> : '?'}</button>
      ); })}</div>
      <p className="p-soft small center">{all ? t.pairsDone : t.pairsHint}</p>
      {all && <div className="p-actions two"><button className="p-btn" onClick={() => { setTiles(make()); setFound([]); }}>{t.playAgain}</button><button className="p-btn main" onClick={onBack}>{t.done}</button></div>}
    </Frame>
  );
}

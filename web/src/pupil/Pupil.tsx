// The pupils' side, made for a phone (Chi's design, StudentJoin … StudentNext): few words, one
// instruction per screen, big buttons, no scores, no labels, no comparisons, no emoji in the chrome.
// They enter with the class code and tap their name (or open their own link); then "Hôm nay con học
// gì" as four tiles, the video or slides, practice in rounds of 5 (answers checked on the server),
// flashcards and the pairs game. A VI/EN switch on every screen; kind words only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api.ts';
import { langChosen, setLang, useLang } from '../i18n.ts';
import { LangToggle } from '../pages/LangToggle.tsx';
import { go, usePath } from '../router.ts';

type L = 'vi' | 'en';
const ROUND = 5;   // questions in one go (Chi, 29 Oct: 22 in one run was too many)
const PAIRS = 4;  // pairs in the game (Chi's design: "Tìm 4 cặp", 8 cards fit one phone screen)
const S = {
  vi: {
    hiKid: 'Chào con!', joinSub: 'Nhập mã lớp cô đưa, rồi chọn tên con nhé.', codeLabel: 'Mã lớp', next: 'Tiếp', who: 'Con là ai?', notMe: 'Đổi lớp', noName: 'Không thấy tên con? Hỏi cô giáo nhé.',
    hello: (n: string, k: string) => (k && k !== n ? `Chào ${n} · ${k}` : `Chào ${n}`), todayIs: (t: string) => `Bài hôm nay: ${t}`, fromWork: 'Luyện lại từ bài con làm', nothing: 'Hôm nay chưa có bài. Con quay lại sau nhé!', leave: 'Thoát', remind: 'Nhớ nhé!',
    video: 'Xem video', slides: 'Xem bài', seen: 'đã xem', cards: 'Thẻ nhớ', nCards: (n: number) => `${n} thẻ`, doneMark: 'đã xong', practise: 'Làm bài tập', nItems: (n: number) => `${n} câu`, pairs: 'Lật thẻ', nPairs: (n: number) => `Tìm ${n} cặp`,
    gotSoFar: 'Con đã đi được', back: 'Quay lại', done: 'Xong', subject: { math: 'Toán', english: 'Tiếng Anh' } as Record<string, string>,
    qOf: (k: number, n: number) => `Câu ${k}/${n}`, pick: 'Con chọn câu trả lời đúng nhé', listenQ: 'Nghe câu hỏi', almost: 'Gần đúng rồi! Thử lại nhé', notThis: 'Chưa đúng rồi. Mình sang câu khác nhé', right: 'Đúng rồi, giỏi quá!',
    retry: 'Thử lại', nextQ: 'Câu tiếp theo', check: 'Kiểm tra', clear: 'Xoá', type: 'Đáp số', tr: 'Đúng', fa: 'Sai',
    roundDone: (n: number) => `Con làm xong ${n} câu rồi!`, roundSub: 'Con nghỉ một chút, hoặc làm tiếp nhé.', more: (n: number) => `Làm tiếp ${n} câu`, toLesson: 'Về trang bài học',
    finish: 'Con làm xong rồi!', finishSub: 'Con đã cố gắng rất nhiều. Đây là gợi ý cho con:',
    sCardsTag: 'Ôn lại', sCards: 'Ôn thẻ nhớ', sCardsSub: 'Ôn lại một chút là con nhớ lâu hơn.', sPairsTag: 'Trò chơi', sPairs: 'Lật thẻ tìm cặp', sPairsSub: 'Ghép phép tính với kết quả.', sWatchTag: 'Xem lại', sWatch: 'Xem lại bài', sWatchSub: 'Xem lại cách làm trong bài.', go: 'Làm ngay',
    cardsOf: (t: string) => `Thẻ nhớ · ${t}`, cardN: (i: number, n: number) => `thẻ ${i}/${n}`, flip: 'Chạm để lật thẻ', again: 'Ôn lại', known: 'Đã nhớ', cardsDone: 'Con ôn xong thẻ nhớ rồi!',
    pairsTitle: 'Lật thẻ tìm cặp', pairsSub: 'Ghép thẻ với nghĩa hoặc kết quả', pairsN: (f: number, n: number) => `${f}/${n} cặp`, pairsHint: 'Chạm vào 2 thẻ để lật. Tìm hết các cặp nhé!', pairsDone: 'Con tìm đủ các cặp rồi!', playAgain: 'Chơi lại',
  },
  en: {
    hiKid: 'Hi there!', joinSub: 'Type the class code from your teacher, then tap your name.', codeLabel: 'Class code', next: 'Next', who: 'Who are you?', notMe: 'Change class', noName: "Can't see your name? Ask your teacher.",
    hello: (n: string, k: string) => (k && k !== n ? `Hi ${n} · ${k}` : `Hi ${n}`), todayIs: (t: string) => `Today: ${t}`, fromWork: 'Practice again from your work', nothing: 'Nothing for today yet. Come back later!', leave: 'Leave', remind: 'Remember!',
    video: 'Watch the video', slides: 'Look at the lesson', seen: 'watched', cards: 'Flashcards', nCards: (n: number) => `${n} cards`, doneMark: 'done', practise: 'Practise', nItems: (n: number) => `${n} questions`, pairs: 'Find the pairs', nPairs: (n: number) => `Find ${n} pairs`,
    gotSoFar: "How far you've got", back: 'Back', done: 'Done', subject: { math: 'Maths', english: 'English' } as Record<string, string>,
    qOf: (k: number, n: number) => `Question ${k}/${n}`, pick: 'Pick the right answer', listenQ: 'Listen to the question', almost: 'Almost! Try again', notThis: "Not this time. Let's go on", right: "That's right, well done!",
    retry: 'Try again', nextQ: 'Next question', check: 'Check', clear: 'Clear', type: 'Your answer', tr: 'True', fa: 'False',
    roundDone: (n: number) => `You did ${n} questions!`, roundSub: 'Take a little break, or carry on.', more: (n: number) => `Do ${n} more`, toLesson: 'Back to the lesson',
    finish: 'All done!', finishSub: 'You worked really hard. Here is what to do next:',
    sCardsTag: 'Go over', sCards: 'Go over the flashcards', sCardsSub: 'A quick look helps you remember.', sPairsTag: 'Game', sPairs: 'Find the pairs', sPairsSub: 'Match each card with its partner.', sWatchTag: 'Look again', sWatch: 'Look at the lesson again', sWatchSub: 'See how it is done once more.', go: 'Go',
    cardsOf: (t: string) => `Flashcards · ${t}`, cardN: (i: number, n: number) => `card ${i}/${n}`, flip: 'Tap to turn the card over', again: 'Again', known: 'I know it', cardsDone: 'You went over all the cards!',
    pairsTitle: 'Find the pairs', pairsSub: 'Match each card with its partner', pairsN: (f: number, n: number) => `${f}/${n} pairs`, pairsHint: 'Tap 2 cards to turn them over. Find all the pairs!', pairsDone: 'You found all the pairs!', playAgain: 'Play again',
  },
};
type T = (typeof S)['vi'];

async function p<R>(method: string, path: string, body?: unknown): Promise<R> {
  const r = await fetch(`/api/p${path}`, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.code || 'server', j.error || 'Lỗi', j.errorEn || 'Error', r.status);
  return j as R;
}
interface TodayRow { id: string; title: string; subject: string; lang: L; slides: number; items: number; cards: number; video: boolean; video_seen: boolean; slides_seen: boolean; cards_seen: boolean; done: boolean; answered: number; greet?: { vi: string; en: string } | null }
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

export function Pupil() {
  const path = usePath(), lang = useLang() as L, t = S[lang];
  const [today, setToday] = useState<Today | null | undefined>(undefined);
  // a child's phone opens in the language of the lessons given (Chi #24), unless it was switched by hand
  const load = () => p<Today>('GET', '/today').then((d) => { const l = d?.lessons?.[0]?.lang; if (l && !langChosen() && l !== lang) setLang(l); setToday(d); }).catch(() => setToday(null));
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
      {today.lessons.map((l) => {
        const parts = [l.video ? l.video_seen : l.slides > 0 ? l.slides_seen : null, l.cards > 0 ? l.cards_seen : null, l.items > 0 ? l.done : null].filter((x) => x !== null) as boolean[];
        return (
          <section key={l.id} className="p-lesson">
            <span className="p-chip">{t.subject[l.subject] || l.subject}</span>
            <h1>{t.todayIs(l.title)}</h1>
            {/* made from her own marked work (Chi #46): what she found tricky last time */}
            {l.greet && <p className="p-soft">{lang === 'en' ? l.greet.en : l.greet.vi}</p>}
            <div className="p-acts">
              {l.video ? <Act tone="blue" icon="play" title={t.video} sub={l.video_seen ? t.seen : ''} onClick={() => go(`/hoc/a/${l.id}/video`)} />
                : l.slides > 0 && <Act tone="blue" icon="book" title={t.slides} sub={l.slides_seen ? t.seen : ''} onClick={() => go(`/hoc/a/${l.id}/slides`)} />}
              {l.cards > 0 && <Act tone="green" icon="cards" title={t.cards} sub={`${t.nCards(l.cards)}${l.cards_seen ? ` · ${t.doneMark}` : ''}`} onClick={() => go(`/hoc/a/${l.id}/cards`)} />}
              {l.items > 0 && <Act tone="orange" icon="pencil" title={t.practise} sub={`${t.nItems(l.items)}${l.done ? ` · ${t.doneMark}` : ''}`} onClick={() => go(`/hoc/a/${l.id}/practice`)} />}
              {l.cards >= 3 && <Act tone="purple" icon="pairs" title={t.pairs} sub={t.nPairs(Math.min(PAIRS, l.cards))} onClick={() => go(`/hoc/a/${l.id}/match`)} />}
            </div>
            {parts.length > 0 && <div className="p-progress"><span className="small"><b>{t.gotSoFar}</b></span><div className="p-seg">{parts.map((x, i) => <i key={i} className={x ? 'on' : ''} />)}</div></div>}
          </section>
        );
      })}
      <button className="p-link" onClick={async () => { await p('POST', '/leave').catch(() => {}); setToday(null); go('/hoc'); }}>{t.leave}</button>
    </Frame>
  );
}

function Act({ tone, icon, title, sub, onClick }: { tone: string; icon: string; title: string; sub: string; onClick: () => void }) {
  return <button className={`p-act ${tone}`} onClick={onClick}><span className="p-ico"><Icon name={icon} /></span><b>{title}</b>{sub && <span className="small">{sub}</span>}</button>;
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
  const seen = (what: string) => { void p('POST', `/a/${id}/seen`, { what }); };
  if (part === 'cards') return <Cards l={l} t={t} onBack={onBack} onEnd={() => { seen('cards'); onBack(); }} />;
  if (part === 'match') return <Match l={l} t={t} onBack={onBack} />;
  return (
    <Frame t={t} title={l.title} onBack={onBack}>
      {part === 'slides' && <Slides l={l} t={t} onEnd={() => { seen('slides'); onBack(); }} />}
      {part === 'video' && <Video l={l} t={t} onEnd={() => seen('video')} onBack={onBack} />}
      {part === 'practice' && <Practice l={l} t={t} onHome={onBack} to={(x) => go(`/hoc/a/${id}/${x}`)} />}
    </Frame>
  );
}

function Slides({ l, t, onEnd }: { l: PLesson; t: T; onEnd: () => void }) {
  const [i, setI] = useState(0), s = l.slides[i];
  return (
    <>
      <div className="p-card">
        {s.image && <img className="p-pic" src={s.image} alt="" />}
        <h2>{s.heading}</h2>
        {s.bullets.length > 0 && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
        {s.example && <div className="p-ex">{s.example}</div>}
      </div>
      <div className="p-seg blue">{l.slides.map((x, j) => <i key={x.id} className={j <= i ? 'on' : ''} />)}</div>
      <div className="p-actions row2">
        <button className="p-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label={t.back}><Icon name="back" /></button>
        {i < l.slides.length - 1 ? <button className="p-btn main" onClick={() => setI(i + 1)}>{t.next}</button> : <button className="p-btn main" onClick={onEnd}>{t.done}</button>}
      </div>
    </>
  );
}

// "Lật thẻ" flashcards: tap to turn over; "Ôn lại" puts the card at the back of the pile, "Đã nhớ" takes it out.
function Cards({ l, t, onBack, onEnd }: { l: PLesson; t: T; onBack: () => void; onEnd: () => void }) {
  const [pile, setPile] = useState(() => l.cards.map((_, i) => i)), [flip, setFlip] = useState(false);
  const known = l.cards.length - pile.length, c = l.cards[pile[0]];
  const step = (keep: boolean) => { setFlip(false); setPile(keep ? [...pile.slice(1), pile[0]] : pile.slice(1)); };
  return (
    <Frame tone="tone-cards" t={t} title={t.cardsOf(l.title)} sub={c ? t.cardN(known + 1, l.cards.length) : ''} onBack={onBack}>
      {c ? <>
        <button className={`p-flash ${flip ? 'back' : ''}`} onClick={() => setFlip(!flip)}>
          {!flip ? <>{c.emoji && <span className="p-emo">{c.emoji}</span>}<b className="p-big-word">{c.front}</b><span className="p-soft small">{t.flip}</span></> : <b className="p-big-word ok">{c.back}</b>}
        </button>
        <div className="p-actions two"><button className="p-btn soft-orange" onClick={() => step(true)}>{t.again}</button><button className="p-btn ok" onClick={() => step(false)}>{t.known}</button></div>
      </> : <div className="p-stack center" style={{ padding: 0 }}><span className="p-badge"><Icon name="star" size={40} /></span><h2>{t.cardsDone}</h2><button className="p-btn main" onClick={onEnd}>{t.done}</button></div>}
    </Frame>
  );
}

// Practice in rounds of 5, one item per screen. A wrong answer: "Thử lại nhé" (and the hint, when hints are on).
function Practice({ l, t, onHome, to }: { l: PLesson; t: T; onHome: () => void; to: (part: 'cards' | 'match' | 'slides' | 'video') => void }) {
  const firstOpen = Math.max(0, l.items.findIndex((it) => !(it.id in l.tried)));
  const startAt = Object.keys(l.tried).length >= l.items.length ? l.items.length : firstOpen;
  const [i, setI] = useState(startAt), [roundStart, setRoundStart] = useState(startAt), [pause, setPause] = useState(false);
  const [given, setGiven] = useState(''), [res, setRes] = useState<{ correct: boolean | null; again: boolean; explain: string } | null>(null), [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<number[]>([]), [pairs, setPairs] = useState<Record<string, string>>({}), [pickL, setPickL] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const it = l.items[i], roundEnd = Math.min(l.items.length, roundStart + ROUND), inRound = roundEnd - roundStart;
  useEffect(() => { setGiven(''); setRes(null); setOrder([]); setPairs({}); setPickL(''); }, [i]);

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
    finally { setBusy(false); }
  };
  const nextQ = () => { const n = i + 1; setI(n); if (n >= roundEnd && n < l.items.length) setPause(true); };
  const answered = res && (res.correct || !res.again);
  const choose = (o: string) => { if (!answered) { setGiven(o); void send(o); } };
  const optClass = (o: string) => `p-opt ${given === o && res ? (res.correct ? 'right' : 'wrong') : ''}`;
  const say = () => { audio.current?.pause(); audio.current = new Audio(`/api/p/a/${l.id}/say/${it.id}`); void audio.current.play().catch(() => {}); };
  // "Choose the right answer: 61 - 37 = ?" → the instruction small, the sum big (the design)
  const split = /^(.{3,80}?):\s*(.*\d.*)$/.exec(it.prompt);

  return (
    <>
      <div className="p-seg blue" aria-label={t.qOf(i - roundStart + 1, inRound)}>{Array.from({ length: inRound }, (_, k) => <i key={k} className={roundStart + k < i || (roundStart + k === i && answered) ? 'on' : roundStart + k === i ? 'now' : ''} />)}</div>
      <div className="p-card q center">
        {it.fromWork && <span className="p-chip">{t.fromWork}</span>}
        <span className="p-soft small">{split ? split[1] : t.pick} · {t.qOf(i - roundStart + 1, inRound)}</span>
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
          <div className="p-built">{order.map((k, j) => <span key={j} className="p-word on">{it.words![k]}</span>)}&nbsp;</div>
          <div className="p-opts words">{it.words.map((w, k) => <button key={k} className="p-word" disabled={order.includes(k) || !!answered} onClick={() => setOrder([...order, k])}>{w}</button>)}</div>
          {!answered && <div className="p-actions row2"><button className="p-btn" onClick={() => setOrder([])}>{t.clear}</button><button className="p-btn main" disabled={order.length !== it.words.length || busy} onClick={() => send(order.map((k) => it.words![k]).join(' '))}>{t.check}</button></div>}
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
function Match({ l, t, onBack }: { l: PLesson; t: T; onBack: () => void }) {
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
  const n = tiles.length / 2, all = found.length === n;
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

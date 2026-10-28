// The pupils' side, made for a phone: few words, one instruction per screen, big buttons, no scores,
// no labels, no comparisons. They enter with the class code and tap their name (or open their own
// link); then "Hôm nay con học gì", the slides, the practice (answers checked on the server) and the
// flashcards. Kind words only.
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api.ts';
import { getLang } from '../i18n.ts';
import { go, usePath } from '../router.ts';

type L = 'vi' | 'en';
const S = {
  vi: {
    enter: 'Vào học', codePh: 'Mã lớp', next: 'Tiếp', who: 'Con là ai?', notMe: 'Đổi lớp', hello: (n: string) => `Chào ${n}!`, today: 'Hôm nay con học gì', nothing: 'Hôm nay chưa có bài. Con quay lại sau nhé!',
    watch: 'Xem bài', practise: 'Làm bài', cards: 'Thẻ nhớ', back: '←', done: 'Xong', finish: 'Con làm xong rồi! Giỏi lắm 🌟', again: 'Chưa đúng, con thử lại nhé', retry: 'Thử lại', right: 'Đúng rồi! 🎉', tip: 'Gợi ý',
    check: 'Kiểm tra', home: 'Về trang chính', nextCard: 'Thẻ tiếp', flip: 'Chạm để lật thẻ', listen: '🔊 Nghe', tr: 'Đúng', fa: 'Sai', clear: 'Xoá', type: 'Con viết số vào đây', suggest: 'Gợi ý tiếp theo',
    sCards: 'Con ôn lại thẻ nhớ nhé', sWatch: 'Con xem lại bài giảng nhé', sHome: 'Con nghỉ một chút rồi học bài khác nhé', left: (n: number) => `Còn ${n} câu`, leave: 'Thoát',
  },
  en: {
    enter: 'Join your class', codePh: 'Class code', next: 'Next', who: 'Who are you?', notMe: 'Change class', hello: (n: string) => `Hi ${n}!`, today: 'Today', nothing: 'Nothing for today yet. Come back later!',
    watch: 'Watch', practise: 'Practise', cards: 'Cards', back: '←', done: 'Done', finish: 'All done! Well done 🌟', again: 'Not quite, try again', retry: 'Try again', right: 'That\'s right! 🎉', tip: 'Hint',
    check: 'Check', home: 'Home', nextCard: 'Next card', flip: 'Tap to flip', listen: '🔊 Listen', tr: 'True', fa: 'False', clear: 'Clear', type: 'Write the number here', suggest: 'What next',
    sCards: 'Go over the flashcards', sWatch: 'Watch the lesson again', sHome: 'Take a break, then try another lesson', left: (n: number) => `${n} to go`, leave: 'Leave',
  },
};

async function p<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/p${path}`, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.code || 'server', j.error || 'Lỗi', j.errorEn || 'Error', r.status);
  return j as T;
}
interface TodayRow { id: string; title: string; subject: string; lang: L; slides: number; items: number; cards: number; slides_seen: boolean; cards_seen: boolean; done: boolean; answered: number }
interface PItem { id: string; template: string; prompt: string; options?: string[]; sentence?: string; words?: string[]; left?: string[]; right?: string[]; unit?: string; listen?: boolean }
interface PLesson { id: string; title: string; lang: L; retry: boolean; hints: boolean; slides: { id: string; heading: string; bullets: string[]; example?: string; image?: string }[]; items: PItem[]; cards: { id: string; front: string; back: string; emoji?: string }[]; tried: Record<string, boolean> }

export function Pupil() {
  const path = usePath();
  const [today, setToday] = useState<{ pupil: { name: string }; class: { name: string }; lessons: TodayRow[]; reminder?: { vi: string; en: string } | null } | null | undefined>(undefined);
  const lang: L = (today?.lessons[0]?.lang as L) || (getLang() as L) || 'vi', t = S[lang];
  const load = () => p<{ pupil: { name: string }; class: { name: string }; lessons: TodayRow[]; reminder?: { vi: string; en: string } | null }>('GET', '/today').then(setToday).catch(() => setToday(null));
  useEffect(() => {
    const link = /^\/p\/([\w-]+)$/.exec(path)?.[1];
    if (link) { p('POST', '/link', { link }).then(() => { go('/hoc'); void load(); }).catch(() => { go('/hoc'); setToday(null); }); return; }
    void load();
  }, []);
  const m = /^\/hoc\/a\/(\w+)\/(slides|practice|cards)$/.exec(path);
  if (today === undefined) return <div className="pupil" />;
  if (!today) return <div className="pupil"><Join code={/^\/hoc\/(\w{4,12})$/.exec(path)?.[1] || ''} onIn={load} /></div>;
  return (
    <div className="pupil">
      {m ? <LessonPart id={m[1]} part={m[2] as 'slides' | 'practice' | 'cards'} onBack={() => { go('/hoc'); void load(); }} /> : (
        <div className="p-stack">
          <div className="p-top"><b className="grow">{t.hello(today.pupil.name)}</b><button className="p-link" onClick={async () => { await p('POST', '/leave').catch(() => {}); setToday(null); go('/hoc'); }}>{t.leave}</button></div>
          <h1>{t.today}</h1>
          {today.reminder && <div className="p-feedback" role="note">🔔 {lang === 'en' ? today.reminder.en : today.reminder.vi}</div>}
          {!today.lessons.length && <p className="p-soft">{t.nothing}</p>}
          {today.lessons.map((l) => { const s = S[l.lang] || t; return (
            <div key={l.id} className="p-lesson">
              <b className="p-title">{l.title}</b>
              <div className="p-actions">
                {l.slides > 0 && <button className="p-btn" onClick={() => go(`/hoc/a/${l.id}/slides`)}>📖 {s.watch}{l.slides_seen ? ' ✓' : ''}</button>}
                {l.items > 0 && <button className="p-btn main" onClick={() => go(`/hoc/a/${l.id}/practice`)}>✏️ {s.practise}{l.done ? ' ✓' : ''}</button>}
                {l.cards > 0 && <button className="p-btn" onClick={() => go(`/hoc/a/${l.id}/cards`)}>🃏 {s.cards}{l.cards_seen ? ' ✓' : ''}</button>}
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

function Join({ code: start, onIn }: { code: string; onIn: () => void }) {
  const t = S[(getLang() as L) || 'vi'];
  const [code, setCode] = useState(start.toUpperCase()), [room, setRoom] = useState<{ class: { name: string }; pupils: { id: string; name: string }[] } | null>(null), [err, setErr] = useState('');
  const look = async (c = code) => { setErr(''); try { setRoom(await p('GET', `/class/${encodeURIComponent(c.trim())}`)); } catch (e) { setErr(e instanceof ApiError ? (getLang() === 'en' ? e.en : e.vi) : String(e)); } };
  useEffect(() => { if (start) void look(start); }, []);
  if (room) return (
    <div className="p-stack">
      <div className="p-top"><b className="grow">{room.class.name}</b><button className="p-link" onClick={() => { setRoom(null); go('/hoc'); }}>{t.notMe}</button></div>
      <h1>{t.who}</h1>
      <div className="p-names">{room.pupils.map((x) => <button key={x.id} className="p-btn" onClick={async () => { await p('POST', '/enter', { code, pupilId: x.id }); go('/hoc'); onIn(); }}>{x.name}</button>)}</div>
    </div>
  );
  return (
    <form className="p-stack" onSubmit={(e) => { e.preventDefault(); void look(); }}>
      <div className="p-brand"><img src="/favicon.svg" alt="" />LessonBloom</div>
      <h1>{t.enter}</h1>
      <input className="p-input code" autoCapitalize="characters" autoComplete="off" maxLength={12} placeholder={t.codePh} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <button className="p-btn main" disabled={code.trim().length < 4}>{t.next}</button>
      {err && <p className="p-soft">{err}</p>}
    </form>
  );
}

function LessonPart({ id, part, onBack }: { id: string; part: 'slides' | 'practice' | 'cards'; onBack: () => void }) {
  const [l, setL] = useState<PLesson | null>(null);
  useEffect(() => { p<{ lesson: PLesson }>('GET', `/a/${id}`).then((r) => setL(r.lesson)).catch(onBack); }, [id]);
  if (!l) return null;
  const t = S[l.lang] || S.vi;
  return (
    <div className="p-stack">
      <div className="p-top"><button className="p-link big" onClick={onBack} aria-label={t.home}>{t.back}</button><b className="grow p-ell">{l.title}</b></div>
      {part === 'slides' && <Slides l={l} t={t} onEnd={() => { void p('POST', `/a/${id}/seen`, { what: 'slides' }); onBack(); }} />}
      {part === 'cards' && <Cards l={l} t={t} onEnd={() => { void p('POST', `/a/${id}/seen`, { what: 'cards' }); onBack(); }} />}
      {part === 'practice' && <Practice l={l} t={t} onHome={onBack} onCards={() => go(`/hoc/a/${id}/cards`)} onSlides={() => go(`/hoc/a/${id}/slides`)} />}
    </div>
  );
}

function Slides({ l, t, onEnd }: { l: PLesson; t: (typeof S)['vi']; onEnd: () => void }) {
  const [i, setI] = useState(0), s = l.slides[i];
  return (
    <>
      <div className="p-card">
        {s.image && <img className="p-pic" src={s.image} alt="" />}
        <h2>{s.heading}</h2>
        {s.bullets.length > 0 && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
        {s.example && <div className="p-ex">{s.example}</div>}
      </div>
      <div className="p-dots">{l.slides.map((x, j) => <i key={x.id} className={j === i ? 'on' : ''} />)}</div>
      <div className="p-actions row2">
        <button className="p-btn" disabled={i === 0} onClick={() => setI(i - 1)}>←</button>
        {i < l.slides.length - 1 ? <button className="p-btn main" onClick={() => setI(i + 1)}>{t.next} →</button> : <button className="p-btn main" onClick={onEnd}>{t.done} ✓</button>}
      </div>
    </>
  );
}

function Cards({ l, t, onEnd }: { l: PLesson; t: (typeof S)['vi']; onEnd: () => void }) {
  const [i, setI] = useState(0), [flip, setFlip] = useState(false), c = l.cards[i];
  return (
    <>
      <button className={`p-flash ${flip ? 'back' : ''}`} onClick={() => setFlip(!flip)}>
        {!flip ? <><span className="p-emo">{c.emoji}</span><b>{c.front}</b><span className="p-soft small">{t.flip}</span></> : <b>{c.back}</b>}
      </button>
      <div className="p-dots">{l.cards.map((x, j) => <i key={x.id} className={j === i ? 'on' : ''} />)}</div>
      {i < l.cards.length - 1 ? <button className="p-btn main" onClick={() => { setI(i + 1); setFlip(false); }}>{t.nextCard} →</button> : <button className="p-btn main" onClick={onEnd}>{t.done} ✓</button>}
    </>
  );
}

// One item per screen. A wrong answer: "Thử lại nhé" (and the hint, when the teacher turned hints on).
function Practice({ l, t, onHome, onCards, onSlides }: { l: PLesson; t: (typeof S)['vi']; onHome: () => void; onCards: () => void; onSlides: () => void }) {
  const firstOpen = Math.max(0, l.items.findIndex((it) => !(it.id in l.tried)));
  const [i, setI] = useState(Object.keys(l.tried).length >= l.items.length ? l.items.length : firstOpen);
  const [given, setGiven] = useState(''), [res, setRes] = useState<{ correct: boolean | null; again: boolean; explain: string } | null>(null), [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<number[]>([]), [pairs, setPairs] = useState<Record<string, string>>({}), [pickL, setPickL] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const it = l.items[i];
  useEffect(() => { setGiven(''); setRes(null); setOrder([]); setPairs({}); setPickL(''); }, [i]);
  if (!it) return (
    <div className="p-stack center">
      <div className="p-big">🌟</div><h2>{t.finish}</h2>
      <b className="p-soft">{t.suggest}</b>
      {l.cards.length > 0 && <button className="p-btn main" onClick={onCards}>🃏 {t.sCards}</button>}
      {l.slides.length > 0 && <button className="p-btn" onClick={onSlides}>📖 {t.sWatch}</button>}
      <button className="p-btn" onClick={onHome}>🏠 {t.sHome}</button>
    </div>
  );
  const send = async (answer: string) => {
    if (busy) return;
    setBusy(true);
    try { const r = await p<{ correct: boolean | null; again: boolean; explain: string }>('POST', `/a/${l.id}/answer`, { itemId: it.id, answer }); setRes(r); }
    finally { setBusy(false); }
  };
  const go2 = () => setI(i + 1);
  const answered = res && (res.correct || !res.again);
  const choose = (o: string) => { if (!answered) { setGiven(o); void send(o); } };
  const optClass = (o: string) => `p-opt ${given === o && res ? (res.correct ? 'right' : 'wrong') : ''}`;

  return (
    <>
      <span className="p-soft small">{t.left(l.items.length - i)}</span>
      <div className="p-card q">
        <p className="p-q">{it.prompt}</p>
        {it.sentence && <p className="p-q">{it.sentence}</p>}
        {it.listen && <button className="p-btn" onClick={() => { audio.current?.pause(); audio.current = new Audio(`/api/p/a/${l.id}/say/${it.id}`); void audio.current.play(); }}>{t.listen}</button>}
      </div>
      {it.options && <div className="p-opts">{it.options.map((o) => <button key={o} className={optClass(o)} disabled={!!answered} onClick={() => choose(o)}>{o}</button>)}</div>}
      {it.template === 'truefalse' && <div className="p-opts two">{(['true', 'false'] as const).map((o) => <button key={o} className={optClass(o)} disabled={!!answered} onClick={() => choose(o)}>{o === 'true' ? t.tr : t.fa}</button>)}</div>}
      {(it.template === 'fill' || it.template === 'word') && !it.options && (
        <form className="p-stack" onSubmit={(e) => { e.preventDefault(); if (given.trim()) void send(given.trim()); }}>
          <div className="row center"><input className="p-input num" inputMode="numeric" autoFocus placeholder={t.type} value={given} disabled={!!answered} onChange={(e) => setGiven(e.target.value.replace(/[^\d]/g, '').slice(0, 7))} />{it.unit && <span className="p-q">{it.unit}</span>}</div>
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
          <b>{res.correct ? t.right : res.again ? t.again : '🙂'}</b>
          {res.explain && !res.correct && <p>💡 {t.tip}: {res.explain}</p>}
          {res.explain && res.correct && <p className="small">{res.explain}</p>}
        </div>
      )}
      {res && !res.correct && res.again && <button className="p-btn" onClick={() => { setRes(null); setGiven(''); setOrder([]); setPairs({}); }}>{t.retry}</button>}
      {answered && <button className="p-btn main" onClick={go2}>{t.next} →</button>}
    </>
  );
}

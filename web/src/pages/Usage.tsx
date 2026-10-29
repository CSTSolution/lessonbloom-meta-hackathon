// "Lượt dùng" (Son, 29 Oct: a detailed breakdown and a chart of her usage): what she has, where her
// credits went by day and by kind of work, each lesson and book with its parts, and what came in or
// was held and given back. 1 credit = US$0.01 of Meta's price. The breakdown below the chart is also
// its table view (three of the chart colours are light on white).
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Usage as U, type UsageKind } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const KINDS: UsageKind[] = ['lessons', 'pictures', 'books', 'photos', 'voice', 'advice', 'requests'];
// the reference categorical palette, in its fixed order (validated: CVD and normal-vision pass on white)
const COLOR: Record<UsageKind, string> = { lessons: '#2a78d6', pictures: '#eb6834', books: '#1baf7a', photos: '#eda100', voice: '#e87ba4', advice: '#008300', requests: '#6250d6' };

const T = {
  vi: {
    title: 'Lượt dùng', lead: 'Một lượt bằng 0,01 USD giá Meta. Mỗi lần trợ lý làm việc đều được ghi lại ở đây.',
    left: 'Còn lại', promised: (n: number) => `${n} lượt đang dành cho bài chờ trong hàng`, period: (d: number) => `Đã dùng ${d} ngày qua`, total: 'Đã dùng từ đầu', calls: (n: number) => `${n} lần gọi trợ lý`,
    days: (d: number) => `${d} ngày`, chart: 'Lượt dùng mỗi ngày', none: 'Chưa dùng lượt nào trong khoảng này.', sum: 'Tổng',
    kinds: { lessons: 'Soạn bài (slide, bài tập, thẻ nhớ, kiểm tra)', pictures: 'Hình minh hoạ', books: 'Đọc sách', photos: 'Đọc ảnh bài học, bài làm', voice: 'Nói yêu cầu', advice: 'Lộ trình, nhận xét, gợi ý', requests: 'Tìm bài trong sách, kiểm tra yêu cầu' },
    short: { lessons: 'Soạn bài', pictures: 'Hình', books: 'Đọc sách', photos: 'Ảnh', voice: 'Giọng nói', advice: 'Nhận xét', requests: 'Tìm bài' },
    byKind: 'Theo loại việc', share: 'Phần', each: 'Từng bài và từng sách', lesson: 'Bài', book: 'Sách', untitled: '(đã xoá)', open: 'Mở',
    log: 'Lượt vào và giữ chỗ', reason: { signup: 'Khi đăng ký', promo: 'Mã khuyến mãi', admin: 'LessonBloom tặng', hold: 'Giữ chỗ để đọc sách', refund: 'Trả lại phần chưa dùng' },
    promo: 'Mã khuyến mãi', promoPh: 'Nhập mã', apply: 'Dùng mã', promoOk: (c: number) => `Đã thêm ${c} lượt.`, promoDemo: 'Đăng nhập bằng email để dùng mã khuyến mãi.',
    hint: 'Một bài khoảng 35 lượt (kèm hình). Đọc sách dạng ảnh khoảng 1 lượt một trang; sách có chữ gần như không tốn lượt.', back: '← Bài giảng',
  },
  en: {
    title: 'Credits and usage', lead: 'One credit is US$0.01 of Meta\'s price. Every time the assistant works, it is recorded here.',
    left: 'Left', promised: (n: number) => `${n} kept for lessons waiting in your line`, period: (d: number) => `Used in the last ${d} days`, total: 'Used in all', calls: (n: number) => pl(n, 'assistant call'),
    days: (d: number) => `${d} days`, chart: 'Credits used each day', none: 'No credits used in this period.', sum: 'Total',
    kinds: { lessons: 'Making lessons (slides, practice, flashcards, checks)', pictures: 'Pictures', books: 'Reading books', photos: 'Reading photos of lessons and homework', voice: 'Spoken requests', advice: 'Paths, comments and advice', requests: 'Finding the lesson in your book, checking requests' },
    short: { lessons: 'Lessons', pictures: 'Pictures', books: 'Books', photos: 'Photos', voice: 'Voice', advice: 'Advice', requests: 'Finding' },
    byKind: 'By kind of work', share: 'Share', each: 'Each lesson and book', lesson: 'Lesson', book: 'Book', untitled: '(deleted)', open: 'Open',
    log: 'Credits in, held and given back', reason: { signup: 'When you joined', promo: 'Promo code', admin: 'From LessonBloom', hold: 'Held to read a book', refund: 'Given back (not used)' },
    promo: 'Promo code', promoPh: 'Enter a code', apply: 'Apply', promoOk: (c: number) => `Added ${pl(c, 'credit')}.`, promoDemo: 'Sign in with your email to use a promo code.',
    hint: 'A lesson uses about 35 credits, pictures included. A scanned book about 1 credit a page; a book with text costs almost nothing.', back: '← Lessons',
  },
};
type Dict = (typeof T)['en'];

// credits: whole numbers from 10 up, one decimal below
const num = (n: number, lang: 'vi' | 'en') => (n >= 10 || n === 0 ? Math.round(n) : n).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { maximumFractionDigits: 1 });

export function Usage({ account }: { account: boolean }) {
  const t = useT(T), lang = useLang(), [days, setDays] = useState(30), [u, setU] = useState<U | null>(null), [n, setN] = useState(0);
  useEffect(() => { api.usage(days).then(setU).catch(() => setU(null)); }, [days, n]);
  const date = (d: string) => new Date(d).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'short' });
  if (!u) return <div className="page narrow" />;
  const kinds = KINDS.filter((k) => u.kinds[k].credits > 0), max = Math.max(...kinds.map((k) => u.kinds[k].credits), 0.1);
  return (
    <div className="page narrow stack" style={{ gap: 16 }}>
      <div><button className="link small" onClick={() => go('/')}>{t.back}</button><h1>{t.title}</h1><p className="small muted">{t.lead}</p></div>
      <div className="usage-tiles">
        <div className="card"><span className="small muted">{t.left}</span><b className="big">{num(u.credits.left, lang)}</b>{u.promised > 0 && <span className="small muted">{t.promised(u.promised)}</span>}</div>
        <div className="card"><span className="small muted">{t.period(days)}</span><b className="big">{num(u.period.credits, lang)}</b><span className="small muted">{t.calls(u.period.calls)}</span></div>
        <div className="card"><span className="small muted">{t.total}</span><b className="big">{num(u.total.credits, lang)}</b><span className="small muted">{t.calls(u.total.calls)}</span></div>
      </div>
      <Promo t={t} account={account} onAdded={() => { setN(n + 1); window.dispatchEvent(new Event('lbm-credits')); }} />
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row"><b className="grow">{t.chart}</b>{[7, 30, 90].map((d) => <button key={d} className={`pill ${d === days ? 'on' : ''}`} onClick={() => setDays(d)}>{t.days(d)}</button>)}</div>
        {u.period.credits > 0 ? <Chart u={u} t={t} lang={lang} /> : <p className="small muted">{t.none}</p>}
        {kinds.length > 0 && <div className="legend">{kinds.map((k) => <span key={k} className="small"><i style={{ background: COLOR[k] }} />{t.short[k]}</span>)}</div>}
      </div>
      {kinds.length > 0 && <div className="card stack" style={{ gap: 8 }}>
        <b>{t.byKind}</b>
        <table className="usage-tbl"><tbody>{kinds.map((k) => (
          <tr key={k}>
            <td><i className="dot" style={{ background: COLOR[k] }} />{t.kinds[k]}<span className="small muted" style={{ display: 'block' }}>{t.calls(u.kinds[k].calls)}</span></td>
            <td style={{ width: '32%' }}><div className="usage-meter"><div style={{ width: `${(u.kinds[k].credits / max) * 100}%`, background: COLOR[k] }} /></div></td>
            <td className="amt"><b>{num(u.kinds[k].credits, lang)}</b><span className="small muted" style={{ display: 'block' }}>{Math.round((u.kinds[k].credits / u.period.credits) * 100)}%</span></td>
          </tr>))}
          <tr><td><b>{t.sum}</b></td><td /><td className="amt"><b>{num(u.period.credits, lang)}</b></td></tr>
        </tbody></table>
      </div>}
      {u.items.length > 0 && <div className="card stack" style={{ gap: 8 }}>
        <b>{t.each}</b>
        <table className="usage-tbl"><tbody>{u.items.map((x) => (
          <tr key={`${x.kind}:${x.id}`}>
            <td><span className="small muted">{x.kind === 'book' ? t.book : t.lesson} · {date(x.at)}</span><br />
              {x.kind === 'lesson' && x.title ? <button className="link" style={{ textAlign: 'left' }} onClick={() => go(`/lesson/${x.id}`)}>{x.title}</button> : <span>{x.title || t.untitled}</span>}
              <span className="small muted" style={{ display: 'block' }}>{KINDS.filter((k) => x.parts[k]).map((k) => `${t.short[k]} ${num(x.parts[k]!, lang)}`).join(' · ')}</span></td>
            <td className="amt"><b>{num(x.credits, lang)}</b></td>
          </tr>))}</tbody></table>
      </div>}
      <div className="card stack" style={{ gap: 8 }}>
        <b>{t.log}</b>
        <table className="usage-tbl"><tbody>{u.log.map((g, i) => (
          <tr key={i}>
            <td><span className="small muted">{date(g.at)}</span><br />{t.reason[g.reason]}{g.ref ? ` · ${g.ref}` : g.title ? ` · ${g.title}` : ''}</td>
            <td className="amt"><b style={{ color: g.credits < 0 ? 'var(--coral)' : 'var(--ok)' }}>{g.credits > 0 ? '+' : ''}{num(g.credits, lang)}</b></td>
          </tr>))}</tbody></table>
        <p className="small muted">{t.hint}</p>
      </div>
    </div>
  );
}

// The promo code box here too (#19: Chi's testers enter their code on this page); email accounts only.
function Promo({ t, account, onAdded }: { t: Dict; account: boolean; onAdded: () => void }) {
  const lang = useLang(), [code, setCode] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  if (!account) return <p className="small muted">{t.promoDemo}</p>;
  const apply = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.promo(code); setCode(''); setMsg(t.promoOk(r.added.credits)); onAdded(); }
    catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); }
  };
  return (
    <form className="card row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void apply(); }}>
      <b className="small">{t.promo}</b>
      <input className="grow" value={code} maxLength={32} placeholder={t.promoPh} aria-label={t.promo} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ minWidth: 0, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
      <button className="btn small" disabled={busy || code.trim().length < 4}>{t.apply}</button>
      {msg && <span className="small" role="status" style={{ flexBasis: '100%' }}>{msg}</span>}
    </form>
  );
}

// Stacked bars, one a day; hover (or tap) a day for its parts.
function Chart({ u, t, lang }: { u: U; t: Dict; lang: 'vi' | 'en' }) {
  const [at, setAt] = useState<number | null>(null), box = useRef<HTMLDivElement>(null), [W, setW] = useState(720);
  // drawn at its real width, so the labels stay readable on a phone
  useEffect(() => { const el = box.current; if (!el) return; const o = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth)))); o.observe(el); return () => o.disconnect(); }, []);
  const H = 200, L = 34, B = 22, P = 12, n = u.daily.length, step = (W - L) / n, bw = Math.max(2, Math.min(28, step - 2));
  const totals = u.daily.map((d) => KINDS.reduce((s, k) => s + d[k], 0)), top = nice(Math.max(...totals, 1)), y = (v: number) => P + (H - B - P) * (1 - v / top);
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short' });
  const every = Math.ceil(n / Math.max(3, Math.floor(W / 110)));
  return (
    <div ref={box} style={{ position: 'relative' }} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t.chart} style={{ display: 'block' }}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" /><text x={L - 6} y={y(top * f) + 4} textAnchor="end" fontSize="11" fill="var(--ink-2)">{num(top * f, lang)}</text></g>)}
        {u.daily.map((d, i) => {
          const x = L + i * step + (step - bw) / 2;
          let acc = 0;
          const parts = KINDS.filter((k) => d[k] > 0);
          return (
            <g key={d.day}>
              {parts.map((k, j) => {
                const y0 = y(acc), y1 = y(acc + d[k]); acc += d[k];
                const h = Math.max(0, y0 - y1 - (j < parts.length - 1 ? 2 : 0)), last = j === parts.length - 1, r = last ? Math.min(4, bw / 2, h) : 0;
                return <path key={k} d={`M${x},${y0}V${y0 - h + r}${r ? `Q${x},${y0 - h} ${x + r},${y0 - h}H${x + bw - r}Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r}` : `H${x + bw}`}V${y0}Z`} fill={COLOR[k]} opacity={at === null || at === i ? 1 : 0.45} />;
              })}
              {(i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2)) && <text x={i === n - 1 ? x + bw : x + bw / 2} y={H - 6} textAnchor={i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--ink-2)">{label(d.day)}</text>}
              <rect x={L + i * step} y={0} width={step} height={H - B} fill="transparent" onMouseEnter={() => setAt(i)} onClick={() => setAt(i)} />
            </g>
          );
        })}
        <line x1={L} x2={W} y1={H - B} y2={H - B} stroke="var(--ink-2)" strokeOpacity=".4" />
      </svg>
      {at !== null && totals[at] > 0 && (
        <div className="chart-tip" style={{ left: `${Math.min(70, Math.max(0, ((L + at * step) / W) * 100 - 10))}%` }}>
          <b className="small">{label(u.daily[at].day)} · {num(totals[at], lang)}</b>
          {KINDS.filter((k) => u.daily[at][k] > 0).map((k) => <span key={k} className="small"><i className="dot" style={{ background: COLOR[k] }} />{t.short[k]}: {num(u.daily[at][k], lang)}</span>)}
        </div>
      )}
    </div>
  );
}
const nice = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

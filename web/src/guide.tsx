// A short guide for a button people mix up (Chi #58: "Lesson photo" or "Finished exercise"; she picked the wrong
// one and lost 88 credits). Cards like slides, two side by side when it is a choice, a small picture each.
// It opens the first time the button is used and from the "?" beside it; "Don't show again" is kept in
// this browser for this account (Son: save to browser), and the "?" always opens it again.
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { getLang } from './i18n.ts';

export interface GuideCol { art: ReactNode; title: string; body: string }
export interface GuideCard { title: string; body?: string; art?: ReactNode; cols?: GuideCol[] }

let owner = '';
export const setGuideOwner = (id: string) => { owner = id; };
const KEY = (id: string) => `lbm-guide:${owner}:${id}`;
export const guideOff = (id: string) => { try { return localStorage.getItem(KEY(id)) === '1'; } catch { return false; } };
const setOff = (id: string, off: boolean) => { try { if (off) localStorage.setItem(KEY(id), '1'); else localStorage.removeItem(KEY(id)); } catch { /* private window: shown again next time */ } };

const W = { vi: { back: 'Trước', next: 'Tiếp', ok: 'Đã hiểu', never: 'Không hiện lần sau', of: (i: number, n: number) => `${i}/${n}`, close: 'Đóng' }, en: { back: 'Back', next: 'Next', ok: 'Got it', never: "Don't show this again", of: (i: number, n: number) => `${i}/${n}`, close: 'Close' } };

function GuideView({ id, cards, done }: { id: string; cards: GuideCard[]; done: () => void }) {
  const w = W[getLang()], [i, setI] = useState(0), [never, setNever] = useState(guideOff(id)), c = cards[i], last = i === cards.length - 1;
  const end = () => { setOff(id, never); done(); };
  return (
    <div className="ask-back" onMouseDown={(e) => { if (e.target === e.currentTarget) end(); }} onKeyDown={(e) => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight' && !last) setI(i + 1); if (e.key === 'ArrowLeft' && i) setI(i - 1); }}>
      <div className="guide card stack" role="dialog" aria-modal="true" aria-label={c.title}>
        <div className="row"><b className="grow">{c.title}</b>{cards.length > 1 && <span className="small muted">{w.of(i + 1, cards.length)}</span>}<button className="link small muted" aria-label={w.close} onClick={end}>✕</button></div>
        {c.cols ? <div className="guide-cols">{c.cols.map((x) => <div key={x.title} className="guide-col stack"><div className="guide-art">{x.art}</div><b className="small">{x.title}</b><span className="small">{x.body}</span></div>)}</div>
          : <>{c.art && <div className="guide-art">{c.art}</div>}</>}
        {c.body && <p className="small" style={{ whiteSpace: 'pre-line' }}>{c.body}</p>}
        {cards.length > 1 && <div className="guide-dots" aria-hidden="true">{cards.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}</div>}
        <div className="row" style={{ gap: 8 }}>
          <label className="check small grow"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> {w.never}</label>
          {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}>{w.back}</button>}
          {last ? <button className="btn primary small" autoFocus onClick={end}>{w.ok}</button> : <button className="btn primary small" autoFocus onClick={() => setI(i + 1)}>{w.next}</button>}
        </div>
      </div>
    </div>
  );
}

// Opens the guide; resolves when it is closed.
export function showGuide(id: string, cards: GuideCard[]): Promise<void> {
  const host = document.createElement('div'), root = createRoot(host);
  document.body.appendChild(host);
  return new Promise((resolve) => { root.render(<GuideView id={id} cards={cards} done={() => { root.unmount(); host.remove(); resolve(); }} />); });
}
// The first time the button is used (until "Don't show again"); nothing after that.
export const firstGuide = (id: string, cards: GuideCard[]) => (guideOff(id) ? Promise.resolve() : showGuide(id, cards));

// The "?" beside a button.
export function HelpDot({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" className="help-dot" aria-label={label} title={label} onClick={onClick}>?</button>;
}

// Small pictures for the cards, drawn here (no image files): a printed book page, a marked sheet, the table.
export const BookArt = () => (
  <svg viewBox="0 0 160 110" role="img" aria-label="book page"><rect x="20" y="6" width="120" height="98" rx="6" fill="#fff" stroke="var(--line)" /><rect x="32" y="16" width="70" height="9" rx="3" fill="var(--blue, #3b6fd8)" opacity=".8" />
    {[34, 44, 54].map((y) => <rect key={y} x="32" y={y} width="96" height="5" rx="2" fill="#c9cfd8" />)}<rect x="32" y="66" width="40" height="28" rx="4" fill="#fde7b0" /><rect x="78" y="68" width="50" height="5" rx="2" fill="#c9cfd8" /><rect x="78" y="78" width="44" height="5" rx="2" fill="#c9cfd8" /></svg>
);
export const WorkArt = () => (
  <svg viewBox="0 0 160 110" role="img" aria-label="marked work"><rect x="20" y="6" width="120" height="98" rx="6" fill="#fbfaf3" stroke="var(--line)" />{[24, 46, 68, 90].map((y) => <line key={y} x1="26" x2="134" y1={y} y2={y} stroke="#d6e0ef" />)}
    <text x="32" y="38" fontSize="13" fill="#1d2f6f" fontFamily="Comic Sans MS, cursive">36 + 27 = 53</text><path d="M116 28 l10 10 M126 28 l-10 10" stroke="#d0021b" strokeWidth="3" />
    <text x="32" y="60" fontSize="13" fill="#1d2f6f" fontFamily="Comic Sans MS, cursive">52 + 14 = 66</text><path d="M114 54 l5 6 l10 -12" stroke="#d0021b" strokeWidth="3" fill="none" />
    <text x="32" y="82" fontSize="13" fill="#1d2f6f" fontFamily="Comic Sans MS, cursive">45 + 38 = 73</text><path d="M116 72 l10 10 M126 72 l-10 10" stroke="#d0021b" strokeWidth="3" /></svg>
);
export const TableArt = () => (
  <svg viewBox="0 0 160 110" role="img" aria-label="table of answers"><rect x="10" y="10" width="140" height="90" rx="6" fill="#fff" stroke="var(--sun, #f3c27a)" strokeWidth="2" /><rect x="10" y="10" width="140" height="18" rx="6" fill="#fff4e5" />
    {[44, 64, 84].map((y, k) => <g key={y}><text x="18" y={y} fontSize="11" fill="#333">{['36 + 27', '45 + 38', '64 + 29'][k]}</text><text x="70" y={y} fontSize="11" fill="#999" textDecoration="line-through">{['53', '73', '83'][k]}</text><text x="100" y={y} fontSize="11" fontWeight="bold" fill="#1d7a46">{['63', '83', '93'][k]}</text></g>)}</svg>
);
export const FindArt = () => (
  <svg viewBox="0 0 160 110" role="img" aria-label="find in the book"><rect x="10" y="20" width="108" height="22" rx="11" fill="#fff" stroke="var(--line)" /><text x="20" y="35" fontSize="10" fill="#555">carrying in sums</text><circle cx="132" cy="31" r="9" fill="none" stroke="#3b6fd8" strokeWidth="3" /><line x1="138" y1="37" x2="147" y2="46" stroke="#3b6fd8" strokeWidth="3" />
    <rect x="24" y="58" width="112" height="40" rx="6" fill="#e7f3eb" stroke="#9cc9ad" /><text x="34" y="76" fontSize="11" fill="#1d7a46">✓ Lesson 21</text><text x="34" y="90" fontSize="10" fill="#555">pages 3–4</text></svg>
);
export const PartArt = () => (
  <svg viewBox="0 0 160 110" role="img" aria-label="choose a part"><rect x="20" y="10" width="120" height="90" rx="6" fill="#fff" stroke="var(--line)" />{['Lesson 20', 'Lesson 21', 'Lesson 22', 'Lesson 23'].map((t, k) => <g key={t}><rect x="28" y={18 + k * 20} width="104" height="16" rx="4" fill={k === 1 ? '#dbe7fb' : '#f4f5f7'} /><text x="36" y={30 + k * 20} fontSize="10" fill="#333">{t}</text></g>)}</svg>
);

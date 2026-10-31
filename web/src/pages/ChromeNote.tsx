// "Works best in Chrome" (Chi #42, 31 Oct): Safari and some other browsers cannot open a PDF on the page,
// and there is no time to fix them before the contest, so anyone not on Chrome is told so. Not on the
// child's practice pages: those must keep working in Safari on an iPhone.
import { useState } from 'react';
import { useT } from '../i18n.ts';

const T = {
  vi: { note: 'LessonBloom chạy tốt nhất trên Google Chrome. Trên trình duyệt khác, một số tính năng (tải sách, ảnh) có thể lỗi.', get: 'Tải Chrome', close: 'Đóng' },
  en: { note: 'LessonBloom works best in Google Chrome. In other browsers some features (uploading books and photos) may fail.', get: 'Get Chrome', close: 'Close' },
};

// Chrome on a computer or Android; not Edge, Opera, Samsung, in-app browsers (Zalo, Facebook) or iOS,
// where every browser is Safari underneath
export function isChrome(): boolean {
  const ua = navigator.userAgent, brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.map((b) => b.brand) ?? [];
  if (/CriOS|FxiOS|EdgiOS/.test(ua)) return false;
  if (brands.includes('Google Chrome')) return true;
  return /Chrome\/\d/.test(ua) && !/Edg\/|OPR\/|SamsungBrowser|YaBrowser|Zalo|FBAN|FBAV|Instagram|Line\//.test(ua);
}

const KEY = 'lbm-chrome-note';
const closed = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

// the band on top of the page, closed for the rest of the visit
export function ChromeBanner() {
  const t = useT(T), [hide, setHide] = useState(() => isChrome() || closed());
  if (hide) return null;
  return (
    <div className="banner warn row noprint" role="note" style={{ borderRadius: 0, margin: 0, gap: 10 }}>
      <span className="grow small">{t.note}</span>
      <a className="btn small" href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">{t.get}</a>
      <button className="btn ghost small" aria-label={t.close} onClick={() => { try { sessionStorage.setItem(KEY, '1'); } catch { /* private window */ } setHide(true); }}>✕</button>
    </div>
  );
}

// the same words as a line, where the trouble would show (the upload box, the welcome page)
export function ChromeLine() {
  const t = useT(T);
  return isChrome() ? null : <p className="small muted">{t.note}</p>;
}

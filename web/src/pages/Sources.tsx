// Seeing her own book (Son, 30 Oct): "View source" shows one part as it was read, page by page, next to
// the original page where it is kept. (The lessons-based knowledge map was removed on 2 Nov: the skills
// map, built from the book, replaces it.)
import { useEffect, useState } from 'react';
import { api, type SectionSource } from '../api.ts';
import { useT } from '../i18n.ts';
import { openPdf, pageJpeg } from '../pdf.ts';

const T = {
  vi: {
    original: 'Trang gốc', text: 'Chữ đã đọc', page: (n: number) => `Trang ${n}`, inFile: (n: number) => `(trang ${n} trong file)`, close: 'Đóng', loading: 'Đang mở…',
    noOriginal: 'Sách này được đọc trên trình duyệt nên máy chủ chỉ giữ chữ. Sắp tới tệp gốc sẽ được lưu riêng tư để xem lại tại đây.', noText: 'Trang này không có chữ.',
    lead: 'Bài giảng chỉ dùng đúng phần chữ này, kèm số trang.',
  },
  en: {
    original: 'Original page', text: 'Text read', page: (n: number) => `Page ${n}`, inFile: (n: number) => `(page ${n} in the file)`, close: 'Close', loading: 'Opening…',
    noOriginal: 'This book was read in your browser, so the server kept only its text. Soon the original file will be kept privately so you can see it here.', noText: 'No text on this page.',
    lead: 'Lessons use exactly this text, with its page numbers.',
  },
};

// A part's pages as printed in the book when both ends are known (Chi #45), else as in the file.
export const pagesOf = (from: number, to: number, pf?: number | null, pt?: number | null) => { const [a, b] = pf != null && pt != null ? [pf, pt] : [from, to]; return b > a ? `${a}–${b}` : `${a}`; };

// One part: the original page (drawn from her PDF in the browser) beside the text read from it.
export function SourceView({ sectionId, onClose }: { sectionId: string; onClose: () => void }) {
  const t = useT(T), [src, setSrc] = useState<SectionSource | null>(null), [imgs, setImgs] = useState<Record<number, string>>({}), [err, setErr] = useState('');
  useEffect(() => { api.sectionSource(sectionId).then(setSrc).catch((e) => setErr(String(e?.message || e))); }, [sectionId]);
  useEffect(() => {
    if (!src?.original) return;
    if (src.original.kind === 'pages') { setImgs(src.original.pages); return; }
    let alive = true;
    (async () => {
      const blob = await fetch((src.original as { url: string }).url).then((r) => r.blob());
      const doc = await openPdf(new File([blob], 'book.pdf', { type: 'application/pdf' }));
      for (let n = src.section.pageFrom; n <= Math.min(src.section.pageTo, doc.numPages, src.section.pageFrom + 11) && alive; n++) {
        const url = URL.createObjectURL(await pageJpeg(doc, n, 1100));
        setImgs((m) => ({ ...m, [n]: url }));
      }
    })().catch(() => {});
    return () => { alive = false; };
  }, [src]);
  const pages = src ? Array.from({ length: src.section.pageTo - src.section.pageFrom + 1 }, (_, k) => src.section.pageFrom + k).slice(0, 12) : [];
  // the page as printed in her paper book, and where it is in the file when that differs (Chi #45)
  const label = (n: number) => { const p = src?.printed?.[n] ?? src?.pages.find((x) => x.page === n)?.printed; return p != null && p !== n ? `${t.page(p)} ${t.inFile(n)}` : t.page(n); };
  return (
    <div className="card stack source-view" style={{ gap: 10 }}>
      <div className="row"><div className="grow"><b>{src?.section.title || t.loading}</b>{src && <span className="small muted" style={{ display: 'block' }}>{src.book.title} · {t.lead}</span>}</div><button className="btn small" onClick={onClose}>{t.close}</button></div>
      {err && <p className="note">{err}</p>}
      {src && !src.original && <p className="banner blue small">{t.noOriginal}</p>}
      {src && pages.map((n) => {
        const text = src.pages.find((p) => p.page === n)?.text;
        return (
          <div key={n} className={`source-page ${src.original ? 'two' : ''}`}>
            {src.original && <figure><figcaption className="small muted">{t.original} · {label(n)}</figcaption>{imgs[n] ? <img src={imgs[n]} alt={label(n)} /> : <div className="small muted">{t.loading}</div>}</figure>}
            <div><span className="small muted">{t.text} · {label(n)}</span><pre className="source-text">{text || t.noText}</pre></div>
          </div>
        );
      })}
    </div>
  );
}

// The map: three columns joined by lines. Parts with no lesson yet are pale.

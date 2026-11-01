// Seeing her own book (Son, 30 Oct): "View source" shows one part as it was read, page by page, next to
// the original page where it is kept; the knowledge map shows the book's parts, the lessons made from
// each part, and the skills each lesson teaches (one skill taught in several lessons is one node).
import { useEffect, useRef, useState } from 'react';
import { api, type KnowledgeMap, type SectionSource } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { openPdf, pageJpeg } from '../pdf.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    original: 'Trang gốc', text: 'Chữ đã đọc', page: (n: number) => `Trang ${n}`, inFile: (n: number) => `(trang ${n} trong file)`, close: 'Đóng', loading: 'Đang mở…',
    noOriginal: 'Sách này được đọc trên trình duyệt nên máy chủ chỉ giữ chữ. Sắp tới tệp gốc sẽ được lưu riêng tư để xem lại tại đây.', noText: 'Trang này không có chữ.',
    lead: 'Bài giảng chỉ dùng đúng phần chữ này, kèm số trang.',
    map: 'Bản đồ kiến thức', mapLead: 'Sách → phạm vi kiến thức → bài đã soạn → kỹ năng. Bấm vào một ô để mở.', parts: 'Phạm vi', lessons: 'Bài giảng', skills: 'Kỹ năng',
    assigned: (n: number) => `đã giao ${n} lớp`, notAssigned: 'chưa giao', working: 'đang soạn', noLessons: 'Chưa có bài nào từ sách này. Bấm "Tạo bài" ở một phạm vi.', inLessons: (n: number) => `trong ${n} bài`,
  },
  en: {
    original: 'Original page', text: 'Text read', page: (n: number) => `Page ${n}`, inFile: (n: number) => `(page ${n} in the file)`, close: 'Close', loading: 'Opening…',
    noOriginal: 'This book was read in your browser, so the server kept only its text. Soon the original file will be kept privately so you can see it here.', noText: 'No text on this page.',
    lead: 'Lessons use exactly this text, with its page numbers.',
    map: 'Knowledge map', mapLead: 'Book → parts → lessons made → skills. Click a box to open it.', parts: 'Parts', lessons: 'Lessons', skills: 'Skills',
    assigned: (n: number) => `assigned to ${pl(n, 'class', 'classes')}`, notAssigned: 'not assigned', working: 'being made', noLessons: 'No lessons from this book yet. Press "Make lesson" on a part.', inLessons: (n: number) => `in ${pl(n, 'lesson')}`,
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
export function KnowledgeMapView({ areaId, onSource }: { areaId: string; onSource: (sectionId: string) => void }) {
  const t = useT(T), lang = useLang(), [m, setM] = useState<KnowledgeMap | null>(null), [hover, setHover] = useState('');
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(720);
  useEffect(() => { api.knowledgeMap(areaId).then(setM).catch(() => setM(null)); }, [areaId]);
  // drawn at the panel's own width (at least 420 px; narrower, it scrolls sideways inside its box)
  useEffect(() => { const el = box.current; if (!el) return; const o = new ResizeObserver(() => setWidth(Math.max(420, el.clientWidth - 22))); o.observe(el); return () => o.disconnect(); }, [m]);
  if (!m) return null;
  const ROW = 46, W = width, gap = Math.round(W * 0.06), cw = Math.floor((W - 2 * gap) / 3), colX = [0, cw + gap, 2 * (cw + gap)], colW = [cw, cw, cw], chars = Math.floor((cw - 20) / 6.6);
  // lessons in the order of their parts; skills in the order they are first taught
  const lessons = m.sections.flatMap((s) => m.lessons.filter((l) => l.section === s.id));
  const skills = m.skills.slice().sort((a, b) => lessons.findIndex((l) => a.lessons.includes(l.id)) - lessons.findIndex((l) => b.lessons.includes(l.id)));
  const rows = Math.max(m.sections.length, lessons.length, skills.length, 1), H = rows * ROW + 40;
  const y = (i: number, n: number) => 30 + (rows * ROW - n * ROW) / 2 + i * ROW + ROW / 2;
  const ys = (id: string) => y(m.sections.findIndex((s) => s.id === id), m.sections.length), yl = (id: string) => y(lessons.findIndex((l) => l.id === id), lessons.length), yk = (id: string) => y(skills.findIndex((k) => k.id === id), skills.length);
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const lit = (ids: string[]) => !hover || ids.includes(hover);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div><b>{t.map}</b><p className="small muted">{t.mapLead}</p></div>
      {!lessons.length && <p className="banner blue small">{t.noLessons}</p>}
      <div className="map-wrap" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t.map}>
          {[t.parts, t.lessons, t.skills].map((h, i) => <text key={h} x={colX[i]} y={16} fontSize="12" fontWeight="700" fill="var(--ink-2)">{h}</text>)}
          {lessons.map((l) => <path key={`s${l.id}`} d={curve(colX[0] + colW[0], ys(l.section), colX[1], yl(l.id))} fill="none" stroke="var(--leaf)" strokeOpacity={lit([l.id, l.section]) ? 0.5 : 0.08} strokeWidth="2" />)}
          {lessons.flatMap((l) => l.skills.map((k) => <path key={`k${l.id}${k}`} d={curve(colX[1] + colW[1], yl(l.id), colX[2], yk(k))} fill="none" stroke="var(--sun)" strokeOpacity={lit([l.id, k]) ? 0.6 : 0.08} strokeWidth="2" />))}
          {m.sections.map((s, i) => { const used = lessons.some((l) => l.section === s.id), cy = y(i, m.sections.length); return (
            <g key={s.id} className="map-node" onClick={() => onSource(s.id)} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover('')} opacity={used ? 1 : 0.55}>
              <title>{s.title}</title>
              <rect x={colX[0]} y={cy - 18} width={colW[0]} height={36} rx={8} fill="var(--leaf-2)" stroke="var(--leaf)" strokeWidth={hover === s.id ? 2 : 1} />
              <text x={colX[0] + 10} y={cy - 2} fontSize="12" fontWeight="600" fill="var(--ink)">{clip(s.title, chars)}</text>
              <text x={colX[0] + 10} y={cy + 12} fontSize="11" fill="var(--ink-2)">{lang === 'vi' ? 'Trang' : s.pageFrom === s.pageTo ? 'Page' : 'Pages'} {pagesOf(s.pageFrom, s.pageTo, s.printedFrom, s.printedTo)}</text>
            </g>); })}
          {lessons.map((l) => { const cy = yl(l.id); return (
            <g key={l.id} className="map-node" onClick={() => go(`/lesson/${l.id}`)} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover('')}>
              <title>{l.title}</title>
              <rect x={colX[1]} y={cy - 18} width={colW[1]} height={36} rx={8} fill={l.classes ? 'var(--ok-2)' : 'var(--card)'} stroke={l.classes ? 'var(--ok)' : 'var(--line)'} strokeWidth={hover === l.id ? 2 : 1} />
              <text x={colX[1] + 10} y={cy - 2} fontSize="12" fontWeight="600" fill="var(--ink)">{clip(l.title, chars)}</text>
              <text x={colX[1] + 10} y={cy + 12} fontSize="11" fill="var(--ink-2)">{l.status === 'working' ? t.working : l.classes ? t.assigned(l.classes) : t.notAssigned}</text>
            </g>); })}
          {skills.map((k) => { const cy = yk(k.id); return (
            <g key={k.id} className="map-node" onMouseEnter={() => setHover(k.id)} onMouseLeave={() => setHover('')}>
              <title>{k.name}</title>
              <rect x={colX[2]} y={cy - 18} width={colW[2]} height={36} rx={18} fill="var(--sun-2)" stroke="var(--sun)" strokeWidth={hover === k.id ? 2 : 1} />
              <text x={colX[2] + 12} y={cy - 2} fontSize="12" fontWeight="600" fill="var(--ink)">{clip(k.name, chars - 1)}</text>
              <text x={colX[2] + 12} y={cy + 12} fontSize="11" fill="var(--ink-2)">{t.inLessons(k.lessons.length)}</text>
            </g>); })}
        </svg>
      </div>
    </div>
  );
}

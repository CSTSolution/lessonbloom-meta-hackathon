// The skills map (beta, Son 2 Nov): the skills each part of her book teaches, drawn as linked nodes
// around their part (a neuron-like map), or as a list. Every node shows its part and pages, and the
// map says whether anything in the book is missing. She can rebuild a book's map, ask the app to fix
// it (its changes are shown first and applied only when she accepts), or leave a comment for the team.
// SkillPicker is the same map as ticks, on the lesson page: a lesson from the skills she picks.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type SkillMap, type SkillOp } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const KIND = {
  vi: { vocabulary: 'Từ vựng', grammar: 'Ngữ pháp', sounds: 'Phát âm', reading: 'Đọc', writing: 'Viết', speaking: 'Nói', listening: 'Nghe', numbers: 'Số', calculation: 'Tính toán', measurement: 'Đo lường', shapes: 'Hình học', data: 'Dữ liệu', problems: 'Giải toán', other: 'Khác' },
  en: { vocabulary: 'Vocabulary', grammar: 'Grammar', sounds: 'Sounds', reading: 'Reading', writing: 'Writing', speaking: 'Speaking', listening: 'Listening', numbers: 'Numbers', calculation: 'Calculation', measurement: 'Measurement', shapes: 'Shapes', data: 'Data', problems: 'Problem solving', other: 'Other' },
} as Record<'vi' | 'en', Record<string, string>>;

const T = {
  vi: {
    title: 'Bản đồ kỹ năng', beta: 'Beta', lead: 'AI đọc sách của bạn và chia mỗi phần thành các kỹ năng. Mỗi kỹ năng gắn với phần và trang sách của nó. Bạn kiểm tra, nhờ app sửa, hoặc góp ý cho đội ngũ.',
    whole: (p: number, g: number, n: number) => `✓ Không thiếu gì: cả ${p} phần và ${g} trang đều có trong bản đồ (${n} kỹ năng).`,
    gap: (p: number, g: number) => `Còn ${p} phần (${g} trang) chưa có trong bản đồ, thường do phần sách vừa được tách hoặc gộp. Bấm "Làm lại bản đồ kỹ năng".`,
    building: 'Đang lập bản đồ…', ready: (d: string) => `Đã lập ${d}`, none: 'Chưa có bản đồ', failed: 'Chưa lập được', rebuild: 'Làm lại bản đồ kỹ năng', build: 'Lập bản đồ kỹ năng',
    asMap: 'Bản đồ', asList: 'Danh sách', part: 'Phần', pages: (p: string) => `tr. ${p}`, buildsOn: 'Dựa trên', usedBy: 'Là nền cho', open: 'Xem trang sách', make: 'Soạn bài từ kỹ năng này', ask: 'Hỏi về kỹ năng này', close: 'Đóng',
    chat: 'Hỏi app hoặc góp ý', chatLead: 'Ví dụ: "Unit 5 còn thiếu kỹ năng số nhiều", "Gộp hai kỹ năng đầu của Unit 2", "Trang 12 nói về màu sắc". App đề xuất thay đổi; chỉ áp dụng khi bạn đồng ý. Góp ý được gửi cho đội ngũ LessonBloom.',
    about: (n: string) => `Về: ${n}`, place: 'Gõ câu hỏi, yêu cầu sửa hoặc góp ý…', send: 'Hỏi app', comment: 'Gửi góp ý', sent: 'Đã gửi góp ý cho đội ngũ. Cảm ơn bạn!', you: 'Bạn', app: 'App', yourComment: 'Góp ý của bạn',
    apply: 'Áp dụng', dismiss: 'Bỏ qua', applied: 'Đã áp dụng', dismissed: 'Đã bỏ qua', appliedN: (a: number, s: number) => `Đã áp dụng ${a} thay đổi${s ? `, ${s} thay đổi không còn hợp nên bỏ qua` : ''}.`,
    op: { rename: (a: string, b: string) => `Đổi tên “${a}” → “${b}”`, add: (n: string, p: string) => `Thêm “${n}” vào ${p}`, remove: (n: string) => `Bỏ “${n}” (trang của nó chuyển sang kỹ năng gần nhất)`, merge: (xs: string, n: string) => `Gộp ${xs} thành “${n}”`, pages: (n: string, p: string) => `Trang của “${n}”: ${p}`, kind: (n: string, k: string) => `“${n}” là ${k}` },
    empty: 'Sách này chưa có bản đồ kỹ năng.', thinking: 'App đang trả lời…',
    pick: 'Chọn theo kỹ năng', pickLead: 'Tick các kỹ năng muốn dạy. Một bài soạn từ một phần sách, nên các kỹ năng tick cùng một phần; trang của chúng được tick ở dưới.', search: 'Tìm kỹ năng…', otherPart: 'Bạn đã chọn kỹ năng ở phần khác: chỉ giữ phần mới.', noMap: 'Sách này chưa có bản đồ kỹ năng. Mở Kiến thức → Bản đồ kỹ năng để lập.', openMap: 'Mở bản đồ kỹ năng',
  },
  en: {
    title: 'Skills map', beta: 'Beta', lead: 'The AI read your book and broke each part into the skills it teaches. Every skill is tied to its part and pages. Check it, ask the app to fix it, or leave a comment for our team.',
    whole: (p: number, g: number, n: number) => `✓ Nothing missing: all ${p} parts and ${g} pages are in the map (${n} skills).`,
    gap: (p: number, g: number) => `${p} ${p === 1 ? 'part' : 'parts'} (${g} ${g === 1 ? 'page' : 'pages'}) not in the map yet, usually because parts were split or merged. Press "Rebuild skills map".`,
    building: 'Building the map…', ready: (d: string) => `Built ${d}`, none: 'No map yet', failed: 'Could not be built', rebuild: 'Rebuild skills map', build: 'Build skills map',
    asMap: 'Map', asList: 'List', part: 'Part', pages: (p: string) => `p. ${p}`, buildsOn: 'Builds on', usedBy: 'Leads to', open: 'See the book pages', make: 'Make a lesson from this skill', ask: 'Ask about this skill', close: 'Close',
    chat: 'Ask the app or comment', chatLead: 'For example: "Unit 5 is missing plurals", "Merge the first two skills of Unit 2", "Page 12 is about colours". The app proposes changes; they apply only when you accept. Comments go to the LessonBloom team.',
    about: (n: string) => `About: ${n}`, place: 'Type a question, a fix or a comment…', send: 'Ask the app', comment: 'Send as comment', sent: 'Your comment was sent to the team. Thank you!', you: 'You', app: 'App', yourComment: 'Your comment',
    apply: 'Apply', dismiss: 'Dismiss', applied: 'Applied', dismissed: 'Dismissed', appliedN: (a: number, s: number) => `${a} ${a === 1 ? 'change' : 'changes'} applied${s ? `; ${s} no longer fit and were skipped` : ''}.`,
    op: { rename: (a: string, b: string) => `Rename “${a}” → “${b}”`, add: (n: string, p: string) => `Add “${n}” to ${p}`, remove: (n: string) => `Remove “${n}” (its pages go to the nearest skill)`, merge: (xs: string, n: string) => `Merge ${xs} into “${n}”`, pages: (n: string, p: string) => `Pages of “${n}”: ${p}`, kind: (n: string, k: string) => `“${n}” is ${k}` },
    empty: 'This book has no skills map yet.', thinking: 'The app is answering…',
    pick: 'Choose by skill', pickLead: 'Tick the skills to teach. A lesson comes from one part of the book, so the skills you tick are from one part; their pages are ticked below.', search: 'Find a skill…', otherPart: 'You picked a skill in another part: only the new part is kept.', noMap: 'This book has no skills map yet. Open Knowledge → Skills map to build it.', openMap: 'Open the skills map',
  },
};

// "12–14, 17": printed page numbers when known, as ranges
export const pageRanges = (pages: number[], printed?: (number | null)[]) => {
  const ns = pages.map((p, i) => printed?.[i] ?? p).sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; out.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`); i = j; }
  return out.join(', ');
};
const LANG = new Set(['vocabulary', 'grammar', 'sounds', 'reading', 'writing', 'speaking', 'listening']);
const tint = (k: string) => (LANG.has(k) ? ['var(--leaf)', 'var(--leaf-2)'] : k === 'other' ? ['var(--ink-2)', 'var(--line)'] : ['var(--sun)', 'var(--sun-2)']);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const errText = (e: unknown, lang: 'vi' | 'en') => (e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error)?.message || e));

export function SkillMapView({ areaId, onSource }: { areaId: string; onSource: (sectionId: string) => void }) {
  const t = useT(T), lang = useLang(), [m, setM] = useState<SkillMap | null>(null), [view, setView] = useState<'map' | 'list'>('map'), [sel, setSel] = useState(''), [hover, setHover] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [info, setInfo] = useState(''), [err, setErr] = useState('');
  const load = () => api.skillMap(areaId).then(setM).catch(() => setM(null));
  useEffect(() => { setSel(''); void load(); }, [areaId]);
  // while a book's map is being built, look again every few seconds
  const building = !!m?.books.some((b) => b.map === 'building');
  useEffect(() => { if (!building) return; const h = setInterval(() => void load(), 2500); return () => clearInterval(h); }, [building, areaId]);
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(720), thread = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = box.current; if (!el) return; const o = new ResizeObserver(() => setWidth(Math.max(300, el.clientWidth - 22))); o.observe(el); return () => o.disconnect(); }, [m, view]);
  useEffect(() => { thread.current?.scrollTo(0, thread.current.scrollHeight); }, [m?.notes.length]);
  if (!m) return null;
  const node = new Map(m.nodes.map((n) => [n.id, n])), part = new Map(m.parts.map((p) => [p.id, p])), s = sel ? node.get(sel) : undefined;
  const run = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); setErr(''); setInfo(''); try { await fn(); } catch (e) { setErr(errText(e, lang)); } finally { setBusy(''); } };
  const opText = (o: SkillOp) => {
    const nm = (id?: string, k = 0) => o.was?.[k] || node.get(id || '')?.name || '?', pt = part.get(o.part || '');
    if (o.op === 'rename') return t.op.rename(nm(o.id), o.name || '');
    if (o.op === 'add') return t.op.add(o.name || '', pt ? `${pt.title}${o.pages?.length ? ` (${t.pages(pageRanges(o.pages))})` : ''}` : '?');
    if (o.op === 'remove') return t.op.remove(nm(o.id));
    if (o.op === 'merge') return t.op.merge((o.ids ?? []).map((x, k) => `“${nm(x, k)}”`).join(', '), o.name || '');
    if (o.op === 'pages') return t.op.pages(nm(o.id), t.pages(pageRanges(o.pages ?? [])));
    return t.op.kind(nm(o.id), KIND[lang][o.kind || 'other'] ?? o.kind ?? '');
  };
  const cov = m.coverage, missingPages = cov.pages - cov.pagesCovered;

  // the map: each part a hub in reading order (a snake, so the next part is always beside it), its skills
  // hanging under it like dendrites, a curve from each skill to the earlier skills it builds on
  const CW = 260, ROW = 26, cols = Math.max(1, Math.floor(width / CW)), W = cols * CW;
  const count = new Map(m.parts.map((p) => [p.id, m.nodes.filter((n) => n.part === p.id).length]));
  const rowH: number[] = [];
  m.parts.forEach((p, i) => { const r = Math.floor(i / cols); rowH[r] = Math.max(rowH[r] ?? 0, 62 + (count.get(p.id) ?? 0) * ROW); });
  const rowTop = rowH.map((_, r) => rowH.slice(0, r).reduce((x, y) => x + y, 0)), H = rowH.reduce((x, y) => x + y, 0) + 10;
  const hub = new Map(m.parts.map((p, i) => { const r = Math.floor(i / cols), c = r % 2 ? cols - 1 - (i % cols) : i % cols; return [p.id, { x: c * CW + 26, y: rowTop[r] + 24, n: i + 1 }]; }));
  const at = new Map<string, { x: number; y: number }>();
  for (const p of m.parts) { const h = hub.get(p.id)!; m.nodes.filter((n) => n.part === p.id).forEach((n, k) => at.set(n.id, { x: h.x + 30, y: h.y + 40 + k * ROW })); }
  const focus = hover || sel, near = new Set(focus ? [focus, ...(node.get(focus)?.after ?? []), ...m.nodes.filter((n) => n.after.includes(focus)).map((n) => n.id), node.get(focus)?.part ?? ''] : []);
  const lit = (id: string) => !focus || near.has(id) || id === focus;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div><b>{t.title}</b> <span className="tag ai">{t.beta}</span><p className="small muted">{t.lead}</p></div>
      {m.books.map((b) => <div key={b.id} className="row small" style={{ gap: 8 }}>
        <span className="grow ellipsis"><b>{b.title}</b> · <span className="muted">{b.map === 'building' ? t.building : b.map === 'ready' ? t.ready(new Date(b.builtAt || '').toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN')) : b.map === 'error' ? t.failed : t.none}</span></span>
        {b.status === 'ready' && <button className="btn small" disabled={!!busy || b.map === 'building'} onClick={() => run(`b${b.id}`, async () => { await api.rebuildSkills(b.id); await load(); })}>{b.map ? t.rebuild : t.build}</button>}
      </div>)}
      {m.nodes.length > 0 && <p className={`banner ${cov.partsCovered === cov.parts && !missingPages ? '' : 'warn'} small`}>{cov.partsCovered === cov.parts && !missingPages ? t.whole(cov.parts, cov.pages, m.nodes.length) : t.gap(cov.parts - cov.partsCovered, missingPages)}</p>}
      {err && <p className="banner warn small">{err}</p>}
      {!m.nodes.length ? <p className="banner blue small">{building ? t.building : t.empty}</p> : <>
        <div className="row" role="tablist">{(['map', 'list'] as const).map((k) => <button key={k} role="tab" aria-selected={view === k} className={`pill ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{k === 'map' ? t.asMap : t.asList}</button>)}</div>
        {s && <div className="card stack" style={{ gap: 6, borderColor: tint(s.kind)[0] }}>
          <div className="row"><b className="grow">{s.name}</b><span className="tag">{KIND[lang][s.kind] ?? s.kind}</span><button className="link small muted" aria-label={t.close} onClick={() => setSel('')}>✕</button></div>
          {s.about && <span className="small">{s.about}</span>}
          <span className="small"><b>{t.part}:</b> {part.get(s.part)?.title} · {t.pages(pageRanges(s.pages, s.printed))}</span>
          {s.after.length > 0 && <span className="small"><b>{t.buildsOn}:</b> {s.after.map((x) => node.get(x)?.name).filter(Boolean).join(' · ')}</span>}
          {m.nodes.some((n) => n.after.includes(s.id)) && <span className="small"><b>{t.usedBy}:</b> {m.nodes.filter((n) => n.after.includes(s.id)).map((n) => n.name).join(' · ')}</span>}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => onSource(s.part)}>{t.open}</button>
            <button className="btn small primary" onClick={() => go(`/new?area=${areaId}&section=${s.part}&skills=${s.id}`)}>{t.make}</button>
          </div>
        </div>}
        {view === 'map' ? <div className="map-wrap" ref={box} style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t.title}>
            {/* the book's order: one part to the next */}
            {m.parts.slice(1).map((p, i) => { const a = hub.get(m.parts[i].id)!, b = hub.get(p.id)!; return <path key={`h${p.id}`} d={a.y === b.y ? `M${a.x},${a.y} H${b.x}` : `M${a.x},${a.y} C${a.x - 22},${(a.y + b.y) / 2} ${b.x - 22},${(a.y + b.y) / 2} ${b.x},${b.y}`} fill="none" stroke="var(--leaf)" strokeOpacity={focus ? 0.06 : 0.14} strokeWidth="5" strokeLinecap="round" />; })}
            {m.nodes.map((n) => { const h = hub.get(n.part), p = at.get(n.id); return h && p ? <path key={`p${n.id}`} d={`M${h.x},${h.y + 18} Q${h.x},${p.y} ${p.x - 9},${p.y}`} fill="none" stroke="var(--leaf)" strokeOpacity={lit(n.id) ? 0.35 : 0.1} strokeWidth="1.5" /> : null; })}
            {m.nodes.flatMap((n) => n.after.map((a) => { const p = at.get(n.id), q = at.get(a); if (!p || !q) return null; const on = focus && (focus === n.id || focus === a);
              const bend = Math.max(30, Math.abs(p.y - q.y) * 0.3 + Math.abs(p.x - q.x) * 0.1);
              return <path key={`a${n.id}${a}`} d={`M${q.x - 9},${q.y} C${q.x - 9 - bend},${q.y} ${p.x - 9 - bend},${p.y} ${p.x - 9},${p.y}`} fill="none" stroke="var(--sun)" strokeWidth={on ? 2.5 : 1.5} strokeOpacity={on ? 0.9 : focus ? 0.05 : 0.3} />; }))}
            {m.parts.map((p) => { const h = hub.get(p.id)!; return (
              <g key={p.id} className="map-node" onClick={() => onSource(p.id)} opacity={!focus || near.has(p.id) ? 1 : 0.35}>
                <title>{`${p.title} · ${t.pages(pageRanges(Array.from({ length: p.pageTo - p.pageFrom + 1 }, (_, k) => p.pageFrom + k)))}`}</title>
                <circle cx={h.x} cy={h.y} r="17" fill="var(--leaf)" />
                <text x={h.x} y={h.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{h.n}</text>
                <text x={h.x + 24} y={h.y + 4} fontSize="12" fontWeight="700" fill="var(--ink)">{clip(p.title, 30)}</text>
              </g>); })}
            {m.nodes.map((n) => { const p = at.get(n.id); if (!p) return null; const [c, bg] = tint(n.kind);
              return (
                <g key={n.id} className="map-node" onClick={() => setSel(n.id === sel ? '' : n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover('')} opacity={lit(n.id) ? 1 : 0.3}>
                  <title>{`${n.name} · ${t.pages(pageRanges(n.pages, n.printed))}`}</title>
                  <circle cx={p.x} cy={p.y} r={sel === n.id ? 10 : 8} fill={bg} stroke={c} strokeWidth={sel === n.id ? 3 : 2} />
                  <text x={p.x + 14} y={p.y + 4} fontSize="11" fontWeight={sel === n.id ? 700 : 400} fill="var(--ink)">{clip(n.name, 30)}</text>
                </g>); })}
          </svg>
        </div>
        : <div className="stack" style={{ gap: 8 }}>{m.parts.map((p, i) => <div key={p.id} className="card stack" style={{ gap: 4 }}>
            <div className="row"><b className="small grow">{i + 1}. {p.title}</b><button className="link small" onClick={() => onSource(p.id)}>{t.pages(pageRanges(Array.from({ length: p.pageTo - p.pageFrom + 1 }, (_, k) => p.pageFrom + k)))}</button></div>
            {m.nodes.filter((n) => n.part === p.id).map((n) => <button key={n.id} className="link small" style={{ textAlign: 'left', fontWeight: sel === n.id ? 700 : 400 }} onClick={() => setSel(n.id)}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9, background: tint(n.kind)[0], marginRight: 6 }} />{n.name} <span className="muted">· {KIND[lang][n.kind] ?? n.kind} · {t.pages(pageRanges(n.pages, n.printed))}</span></button>)}
          </div>)}</div>}
      </>}
      {m.nodes.length > 0 && <div className="card stack" style={{ gap: 8 }}>
        <b className="small">{t.chat}</b><span className="small muted">{t.chatLead}</span>
        {m.notes.length > 0 && <div ref={thread} className="stack" style={{ gap: 6, maxHeight: 320, overflow: 'auto' }}>
          {m.notes.map((n) => <div key={n.id} className="small" style={{ alignSelf: n.role === 'app' ? 'start' : 'end', maxWidth: '88%', background: n.role === 'app' ? 'var(--leaf-2)' : n.role === 'comment' ? 'var(--sun-2)' : 'var(--paper)', borderRadius: 10, padding: '6px 10px' }}>
            <b>{n.role === 'app' ? t.app : n.role === 'comment' ? t.yourComment : t.you}</b>{n.skill && node.get(n.skill) && <span className="muted"> · {clip(node.get(n.skill)!.name, 30)}</span>}
            <div style={{ whiteSpace: 'pre-line' }}>{n.text}</div>
            {n.ops && <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{n.ops.map((o, k) => <li key={k}>{opText(o)}</li>)}</ul>}
            {n.ops && n.status === 'proposed' && <div className="row" style={{ gap: 6 }}>
              <button className="btn small primary" disabled={!!busy} onClick={() => run(`a${n.id}`, async () => { const r = await api.skillAnswer(areaId, n.id, true); setInfo(t.appliedN(r.applied, r.skipped)); await load(); })}>{t.apply}</button>
              <button className="btn small" disabled={!!busy} onClick={() => run(`d${n.id}`, async () => { await api.skillAnswer(areaId, n.id, false); await load(); })}>{t.dismiss}</button></div>}
            {n.ops && n.status !== 'proposed' && <span className="tag">{n.status === 'applied' ? t.applied : t.dismissed}</span>}
          </div>)}
          {busy === 'chat' && <span className="small muted">{t.thinking}</span>}
        </div>}
        {info && <p className="banner small">{info}</p>}
        {s && <span className="chip" style={{ alignSelf: 'start' }}>{t.about(clip(s.name, 40))}<button className="link small" aria-label={t.close} onClick={() => setSel('')}>✕</button></span>}
        <textarea rows={2} maxLength={1000} value={msg} placeholder={t.place} onChange={(e) => setMsg(e.target.value)} />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small primary" disabled={!!busy || msg.trim().length < 2} onClick={() => run('chat', async () => { await api.skillChat(areaId, msg.trim(), sel || undefined); setMsg(''); await load(); })}>{busy === 'chat' ? t.thinking : t.send}</button>
          <button className="btn small" disabled={!!busy || msg.trim().length < 2} onClick={() => run('note', async () => { await api.skillComment(areaId, msg.trim(), sel || undefined); setMsg(''); setInfo(t.sent); await load(); })}>{t.comment}</button>
        </div>
      </div>}
    </div>
  );
}

// On the lesson page: the skills of one book as ticks. Ticking a skill in another part starts again in
// that part (a lesson comes from one part); the parent is told which part and pages that gives.
export function SkillPicker({ map, picked, onPick }: { map: SkillMap; picked: string[]; onPick: (ids: string[]) => void }) {
  const t = useT(T), lang = useLang(), [find, setFind] = useState(''), [moved, setMoved] = useState(false);
  const node = new Map(map.nodes.map((n) => [n.id, n])), partOf = picked.length ? node.get(picked[0])?.part : '';
  const f = find.trim().toLowerCase();
  const tick = (id: string, on: boolean) => {
    const n = node.get(id)!;
    if (!on) { onPick(picked.filter((x) => x !== id)); return; }
    if (partOf && n.part !== partOf) { setMoved(true); onPick([id]); return; }
    setMoved(false); onPick([...picked, id]);
  };
  if (!map.nodes.length) return <p className="small muted">{t.noMap}</p>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small muted">{t.pickLead}</span>
      <input type="search" value={find} placeholder={t.search} onChange={(e) => setFind(e.target.value)} />
      {moved && <span className="small banner warn">{t.otherPart}</span>}
      <div className="stack" style={{ gap: 6, maxHeight: 320, overflow: 'auto' }}>
        {map.parts.map((p) => { const ns = map.nodes.filter((n) => n.part === p.id && (!f || n.name.toLowerCase().includes(f) || p.title.toLowerCase().includes(f))); return ns.length ? (
          <div key={p.id} className="stack" style={{ gap: 2 }}>
            <b className="small" style={{ color: partOf === p.id ? 'var(--leaf)' : undefined }}>{p.title}</b>
            {ns.map((n) => <label key={n.id} className="check small"><input type="checkbox" checked={picked.includes(n.id)} onChange={(e) => tick(n.id, e.target.checked)} /> <span>{n.name} <span className="muted">· {KIND[lang][n.kind] ?? n.kind} · {t.pages(pageRanges(n.pages, n.printed))}</span></span></label>)}
          </div>) : null; })}
      </div>
    </div>
  );
}
export const SKILL_T = T;

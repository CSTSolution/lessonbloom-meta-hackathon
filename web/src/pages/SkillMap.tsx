// The skills map (beta, Son 2 Nov): the skills each part of her book teaches, drawn as linked nodes
// around their part (a neuron-like map), or as a list. Every node shows its part and pages, and the
// map says whether anything in the book is missing. She can rebuild a book's map, ask the app to fix
// it (its changes are shown first and applied only when she accepts), or leave a comment for the team.
// SkillPicker is the same map as ticks, on the lesson page: a lesson from the skills she picks.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type SkillMap, type SkillOp } from '../api.ts';
import { ask } from '../ask.tsx';
import { openFeedback } from '../feedback.tsx';
import { firstGuide, HelpDot, showGuide, type GuideCard } from '../guide.tsx';
import { useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';
import { SourceView } from './Sources.tsx';

const KIND = {
  vi: { vocabulary: 'Từ vựng', grammar: 'Ngữ pháp', sounds: 'Phát âm', reading: 'Đọc', writing: 'Viết', speaking: 'Nói', listening: 'Nghe', numbers: 'Số', calculation: 'Tính toán', measurement: 'Đo lường', shapes: 'Hình học', data: 'Dữ liệu', problems: 'Giải toán', other: 'Khác' },
  en: { vocabulary: 'Vocabulary', grammar: 'Grammar', sounds: 'Sounds', reading: 'Reading', writing: 'Writing', speaking: 'Speaking', listening: 'Listening', numbers: 'Numbers', calculation: 'Calculation', measurement: 'Measurement', shapes: 'Shapes', data: 'Data', problems: 'Problem solving', other: 'Other' },
} as Record<'vi' | 'en', Record<string, string>>;

const T = {
  vi: {
    title: 'Bản đồ kỹ năng', beta: 'Beta', lead: 'Tuỳ chọn: AI đọc sách của bạn và chia mỗi phần thành các kỹ năng, mỗi kỹ năng gắn với phần và trang sách của nó. Bạn kiểm tra, nhờ app sửa, hoặc góp ý cho đội ngũ. Lập bản đồ và hỏi app dùng lượt của bạn; góp ý thì miễn phí.',
    whole: (p: number, g: number, n: number) => `✓ Không thiếu gì: cả ${p} phần và ${g} trang đều có trong bản đồ (${n} kỹ năng).`,
    gap: (p: number, g: number) => `Còn ${p} phần (${g} trang) chưa có trong bản đồ, thường do phần sách vừa được tách hoặc gộp. Bấm "Làm lại bản đồ kỹ năng".`,
    building: 'Đang lập bản đồ…', ready: (d: string) => `Đã lập ${d}`, none: 'Chưa có bản đồ', failed: 'Chưa lập được', rebuild: 'Làm lại bản đồ kỹ năng', build: 'Lập bản đồ kỹ năng', cost: (n: number) => `khoảng ${n} lượt`, confirm: (n: number, left: number) => `Lập bản đồ kỹ năng cho sách này: ước tính ${n} lượt (bạn có ${left}). ${n} lượt được giữ trước khi việc vào hàng chờ; xong thì chỉ trừ số đã dùng, tối đa ${n}, phần còn lại được trả lại. Huỷ khi đang chờ thì trả lại đủ. Lập ngay?`, go: 'Lập bản đồ',
    asMap: 'Bản đồ', asList: 'Danh sách', part: 'Phần', pages: (p: string) => `tr. ${p}`, buildsOn: 'Dựa trên', usedBy: 'Là nền cho', open: 'Xem trang sách', make: 'Soạn bài từ kỹ năng này', ask: 'Hỏi về kỹ năng này', close: 'Đóng',
    chat: 'Hỏi app hoặc góp ý', chatLead: 'Ví dụ: "Unit 5 còn thiếu kỹ năng số nhiều", "Gộp hai kỹ năng đầu của Unit 2", "Trang 12 nói về màu sắc". App đề xuất thay đổi; chỉ áp dụng khi bạn đồng ý. Mỗi câu hỏi app dùng khoảng 1–2 lượt. Góp ý miễn phí và được gửi cho đội ngũ LessonBloom.',
    about: (n: string) => `Về: ${n}`, place: 'Gõ câu hỏi, yêu cầu sửa hoặc góp ý…', send: 'Hỏi app', comment: 'Gửi góp ý', sent: 'Đã gửi góp ý cho đội ngũ. Cảm ơn bạn!', you: 'Bạn', app: 'App', yourComment: 'Góp ý của bạn',
    apply: 'Áp dụng', dismiss: 'Bỏ qua', applied: 'Đã áp dụng', dismissed: 'Đã bỏ qua', appliedN: (a: number, s: number) => `Đã áp dụng ${a} thay đổi${s ? `, ${s} thay đổi không còn hợp nên bỏ qua` : ''}.`,
    op: { rename: (a: string, b: string) => `Đổi tên “${a}” → “${b}”`, add: (n: string, p: string) => `Thêm “${n}” vào ${p}`, remove: (n: string) => `Bỏ “${n}” (trang của nó chuyển sang kỹ năng gần nhất)`, merge: (xs: string, n: string) => `Gộp ${xs} thành “${n}”`, pages: (n: string, p: string) => `Trang của “${n}”: ${p}`, kind: (n: string, k: string) => `“${n}” là ${k}` },
    leadsTo: 'cần trước', legendLabel: 'Chú giải', legendLang: 'kỹ năng tiếng Anh', legendMaths: 'kỹ năng toán', legendBuilds: 'cần học trước (rê chuột để xem)',
    help: 'Bản đồ kỹ năng là gì?', noWarranty: 'Bản thử nghiệm (Beta), không bảo đảm: bản đồ do AI lập nên có thể thiếu hoặc gọi sai kỹ năng. Bạn kiểm tra trước khi dùng; bài giảng vẫn chỉ soạn từ trang sách của bạn.', feedback: 'Góp ý',
    g1: 'Bản đồ kỹ năng (Beta)', g1b: 'AI đọc từng phần của sách và liệt kê các kỹ năng phần đó dạy. Mỗi kỹ năng là một nút gắn với phần và trang sách; đường nối cho biết kỹ năng nào dựa trên kỹ năng nào. Khi soạn bài, bạn có thể chọn theo kỹ năng thay vì theo trang.',
    g2: 'Tốn bao nhiêu lượt?', g2b: 'Lập bản đồ là tuỳ chọn. Trước khi lập, app cho biết số lượt ước tính và giữ trước số đó; xong thì chỉ trừ số đã dùng (không quá ước tính), phần còn lại được trả lại. Mỗi câu hỏi app về bản đồ dùng khoảng 1–2 lượt. Góp ý thì miễn phí.',
    g3: 'Beta: không bảo đảm', g3b: 'Đây là tính năng thử nghiệm, không có bảo đảm. Bản đồ do AI lập có thể thiếu, gộp hoặc gọi sai kỹ năng. Hãy kiểm tra trước khi dựa vào nó, nhờ app sửa, và góp ý cho chúng tôi để làm tốt hơn.',
    picker: 'Chọn trên bản đồ hoặc danh sách', tickHint: 'Bấm vào nút kỹ năng để tick hoặc bỏ tick.',
    pageLead: 'Chọn một nguồn trong Kho kiến thức để xem hoặc lập bản đồ kỹ năng của nó.', noBooks: 'Bạn chưa có sách nào. Thêm sách ở Kho kiến thức trước.', toKnowledge: 'Mở Kho kiến thức',
    empty: 'Sách này chưa có bản đồ kỹ năng. Lập bản đồ là tuỳ chọn: bấm "Lập bản đồ kỹ năng" ở trên.', thinking: 'App đang trả lời…',
    pick: 'Chọn theo kỹ năng', pickLead: 'Tick các kỹ năng muốn dạy, ở một hay nhiều phần của sách; trang của chúng được tick ở dưới.', search: 'Tìm kỹ năng…', otherPart: 'Bạn đã chọn kỹ năng ở sách khác: chỉ giữ sách mới (một bài soạn từ một sách).', noMap: 'Sách này chưa có bản đồ kỹ năng. Lập bản đồ là tuỳ chọn, ở Kho kiến thức → Bản đồ kỹ năng.', openMap: 'Mở bản đồ kỹ năng',
  },
  en: {
    title: 'Skills map', beta: 'Beta', lead: 'Optional: the AI reads your book and breaks each part into the skills it teaches, each tied to its part and pages. Check it, ask the app to fix it, or leave a comment for our team. Building the map and asking the app use your credits; comments are free.',
    whole: (p: number, g: number, n: number) => `✓ Nothing missing: all ${p} parts and ${g} pages are in the map (${n} skills).`,
    gap: (p: number, g: number) => `${p} ${p === 1 ? 'part' : 'parts'} (${g} ${g === 1 ? 'page' : 'pages'}) not in the map yet, usually because parts were split or merged. Press "Rebuild skills map".`,
    building: 'Building the map…', ready: (d: string) => `Built ${d}`, none: 'No map yet', failed: 'Could not be built', rebuild: 'Rebuild skills map', build: 'Build skills map', cost: (n: number) => `about ${n} ${n === 1 ? 'credit' : 'credits'}`, confirm: (n: number, left: number) => `Build the skills map for this book: estimated ${n} ${n === 1 ? 'credit' : 'credits'} (you have ${left}). ${n} are held as the job joins your queue; when it is done you pay only what it used, never more than ${n}, and the rest comes back. Cancel it while it waits and all of it comes back. Build it now?`, go: 'Build the map',
    asMap: 'Map', asList: 'List', part: 'Part', pages: (p: string) => `p. ${p}`, buildsOn: 'Builds on', usedBy: 'Leads to', open: 'See the book pages', make: 'Make a lesson from this skill', ask: 'Ask about this skill', close: 'Close',
    chat: 'Ask the app or comment', chatLead: 'For example: "Unit 5 is missing plurals", "Merge the first two skills of Unit 2", "Page 12 is about colours". The app proposes changes; they apply only when you accept. Each question to the app uses about 1–2 credits. Comments are free and go to the LessonBloom team.',
    about: (n: string) => `About: ${n}`, place: 'Type a question, a fix or a comment…', send: 'Ask the app', comment: 'Send as comment', sent: 'Your comment was sent to the team. Thank you!', you: 'You', app: 'App', yourComment: 'Your comment',
    apply: 'Apply', dismiss: 'Dismiss', applied: 'Applied', dismissed: 'Dismissed', appliedN: (a: number, s: number) => `${a} ${a === 1 ? 'change' : 'changes'} applied${s ? `; ${s} no longer fit and were skipped` : ''}.`,
    op: { rename: (a: string, b: string) => `Rename “${a}” → “${b}”`, add: (n: string, p: string) => `Add “${n}” to ${p}`, remove: (n: string) => `Remove “${n}” (its pages go to the nearest skill)`, merge: (xs: string, n: string) => `Merge ${xs} into “${n}”`, pages: (n: string, p: string) => `Pages of “${n}”: ${p}`, kind: (n: string, k: string) => `“${n}” is ${k}` },
    leadsTo: 'comes before', legendLabel: 'Legend', legendLang: 'language skill', legendMaths: 'maths skill', legendBuilds: 'learn first (hover to see)',
    help: 'What is the skills map?', noWarranty: 'Beta, no warranty: the map is made by AI and may miss or misname skills. Check it before you rely on it; lessons are still made only from your book\'s pages.', feedback: 'Feedback',
    g1: 'Skills map (Beta)', g1b: 'The AI reads each part of your book and lists the skills it teaches. Each skill is a node tied to its part and pages; the lines show which skill builds on which. When you make a lesson, you can choose by skill instead of by page.',
    g2: 'What does it cost?', g2b: 'Building the map is optional. Before it starts, the app shows the estimated credits and holds them; when it is done you pay only what it used (never more than the estimate) and the rest comes back. Each question to the app about the map uses about 1–2 credits. Comments are free.',
    g3: 'Beta: no warranty', g3b: 'This is a beta feature with no warranty. A map made by AI can miss, merge or misname skills. Check it before you rely on it, ask the app to fix it, and send us feedback so we can make it better.',
    picker: 'Choose on the map or in a list', tickHint: 'Click a skill node to tick or untick it.',
    pageLead: 'Pick a source from Knowledge to see or build its skills map.', noBooks: 'You have no books yet. Add one in Knowledge first.', toKnowledge: 'Open Knowledge',
    empty: 'This book has no skills map yet. It is optional: press "Build skills map" above.', thinking: 'The app is answering…',
    pick: 'Choose by skill', pickLead: 'Tick the skills to teach, from one or more parts of the book; their pages are ticked below.', search: 'Find a skill…', otherPart: 'You picked a skill in another book: only that book is kept (a lesson comes from one book).', noMap: 'This book has no skills map yet. Building one is optional, in Knowledge → Skills map.', openMap: 'Open the skills map',
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
  const t = useT(T), lang = useLang(), [m, setM] = useState<SkillMap | null>(null), [view, setView] = useState<'map' | 'list'>('map'), [sel, setSel] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [info, setInfo] = useState(''), [err, setErr] = useState('');
  const load = () => api.skillMap(areaId).then(setM).catch(() => setM(null));
  useEffect(() => { setSel(''); void load(); }, [areaId]);
  // while a book's map is being built, look again every few seconds
  const building = !!m?.books.some((b) => b.map === 'building');
  useEffect(() => { if (!building) return; const h = setInterval(() => void load(), 2500); return () => clearInterval(h); }, [building, areaId]);
  const thread = useRef<HTMLDivElement>(null);
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


  return (
    <div className="stack" style={{ gap: 10 }}>
      <BetaHead />
      <p className="small muted">{t.lead}</p>
      {m.books.map((b) => <div key={b.id} className="row small" style={{ gap: 8 }}>
        <span className="grow ellipsis"><b>{b.title}</b> · <span className="muted">{b.map === 'building' ? t.building : b.map === 'ready' ? t.ready(new Date(b.builtAt || '').toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN')) : b.map === 'error' ? t.failed : t.none}</span></span>
        {b.status === 'ready' && <button className={`btn small ${b.map ? '' : 'primary'}`} disabled={!!busy || b.map === 'building'} title={t.cost(b.estimate)}
          onClick={() => run(`b${b.id}`, async () => { await firstGuide('skillmap', guideCards(t)); if (!(await ask(t.confirm(b.estimate, m.credits), { ok: t.go }))) return; await api.rebuildSkills(b.id); window.dispatchEvent(new Event('lbm-credits')); window.dispatchEvent(new Event('lbm-jobs')); await load(); })}>{b.map ? t.rebuild : t.build} · {t.cost(b.estimate)}</button>}
      </div>)}
      {m.nodes.length > 0 && <p className={`banner ${cov.partsCovered === cov.parts && !missingPages ? '' : 'warn'} small`}>{cov.partsCovered === cov.parts && !missingPages ? t.whole(cov.parts, cov.pages, m.nodes.length) : t.gap(cov.parts - cov.partsCovered, missingPages)}</p>}
      {err && <p className="banner warn small">{err}</p>}
      {!m.nodes.length ? <p className="banner blue small">{building ? t.building : t.empty}</p> : <>
        <div className="row" role="tablist">{(['map', 'list'] as const).map((k) => <button key={k} role="tab" aria-selected={view === k} className={`pill ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{k === 'map' ? t.asMap : t.asList}</button>)}</div>
        {s && <div className="card stack" style={{ gap: 6, borderColor: tint(s.kind)[0] }}>
          <div className="row"><b className="grow">{s.name}</b><span className="tag">{KIND[lang][s.kind] ?? s.kind}</span><button className="link small muted" aria-label={t.close} onClick={() => setSel('')}>✕</button></div>
          {s.about && <span className="small">{s.about}</span>}
          <span className="small"><b>{t.part}:</b> {part.get(s.part)?.title} · {t.pages(pageRanges(s.pages, s.printed))}</span>
          {s.after.length > 0 && <span className="small"><b>{t.buildsOn}:</b> {s.after.filter((x) => node.get(x)).map((x, k) => <span key={x}>{k ? ' · ' : ''}<button className="link small" onClick={() => setSel(x)}>{node.get(x)!.name}</button></span>)}</span>}
          {m.nodes.some((n) => n.after.includes(s.id)) && <span className="small"><b>{t.usedBy}:</b> {m.nodes.filter((n) => n.after.includes(s.id)).map((n, k) => <span key={n.id}>{k ? ' · ' : ''}<button className="link small" onClick={() => setSel(n.id)}>{n.name}</button></span>)}</span>}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => onSource(s.part)}>{t.open}</button>
            <button className="btn small primary" onClick={() => go(`/new?area=${areaId}&section=${s.part}&skills=${s.id}`)}>{t.make}</button>
          </div>
        </div>}
        {view === 'map' && <div className="map-legend small muted" aria-label={t.legendLabel}><span><i className="dot lang" /> {t.legendLang}</span><span><i className="dot maths" /> {t.legendMaths}</span><span><svg width="22" height="10" aria-hidden="true"><path d="M1,9 C8,9 14,1 21,1" fill="none" stroke="var(--sun)" strokeWidth="2" /></svg> {t.legendBuilds}</span></div>}
        {view === 'map' ? <NeuronMap map={m} sel={sel} onNode={(id) => setSel(id === sel ? '' : id)} onPart={onSource} />
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

export const NeuronArt = () => (
  <svg viewBox="0 0 160 110" role="img" aria-label="skills map"><path d="M30 30 H120" stroke="var(--leaf)" strokeOpacity=".2" strokeWidth="5" />
    {[30, 120].map((x) => <g key={x}><circle cx={x} cy="30" r="12" fill="var(--leaf)" />{[56, 76, 96].map((y) => <g key={y}><path d={`M${x},42 Q${x},${y} ${x + 14},${y}`} fill="none" stroke="var(--leaf)" strokeOpacity=".4" /><circle cx={x + 20} cy={y} r="6" fill="var(--leaf-2)" stroke="var(--leaf)" strokeWidth="2" /></g>)}</g>)}
    <path d="M134,96 C110,96 60,56 44,56" fill="none" stroke="var(--sun)" strokeWidth="2" /></svg>
);
const guideCards = (t: (typeof T)['en']): GuideCard[] => [{ title: t.g1, body: t.g1b, art: <NeuronArt /> }, { title: t.g2, body: t.g2b }, { title: t.g3, body: t.g3b }];

// "Skills map  Beta  ?  …  Feedback", and the no-warranty line under it
export function BetaHead({ small }: { small?: boolean }) {
  const t = useT(T);
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="row" style={{ gap: 6 }}><b className={small ? 'small' : ''}>{t.title}</b><span className="tag ai">{t.beta}</span><HelpDot label={t.help} onClick={() => void showGuide('skillmap', guideCards(t))} /><span className="grow" />
        <button type="button" className="link small" onClick={() => openFeedback({ kind: 'idea' })}>💬 {t.feedback}</button></div>
      <span className="small muted">{t.noWarranty}</span>
    </div>
  );
}

// The neuron map: each part a hub in reading order (a snake, so the next part is always beside it), its
// skills hanging under it like dendrites, a curve from each skill to the earlier skills it builds on.
// With `picked` (the lesson page) those skills are drawn ticked; clicking a skill calls onNode.
export function NeuronMap({ map: m, sel = '', picked, onNode, onPart }: { map: SkillMap; sel?: string; picked?: string[]; onNode: (id: string) => void; onPart?: (id: string) => void }) {
  const t = useT(T), [hover, setHover] = useState(''), box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(720);
  useEffect(() => { const el = box.current; if (!el) return; const o = new ResizeObserver(() => setWidth(Math.max(300, el.clientWidth - 22))); o.observe(el); return () => o.disconnect(); }, []);
  const node = new Map(m.nodes.map((n) => [n.id, n]));
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
    <div className="map-wrap" ref={box} style={{ maxHeight: '70vh', overflow: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t.title}>
        {/* the book's order: one part to the next */}
        {m.parts.slice(1).map((p, i) => { const a = hub.get(m.parts[i].id)!, b = hub.get(p.id)!; return <path key={`h${p.id}`} d={a.y === b.y ? `M${a.x},${a.y} H${b.x}` : `M${a.x},${a.y} C${a.x - 22},${(a.y + b.y) / 2} ${b.x - 22},${(a.y + b.y) / 2} ${b.x},${b.y}`} fill="none" stroke="var(--leaf)" strokeOpacity={focus ? 0.06 : 0.14} strokeWidth="5" strokeLinecap="round" />; })}
        {m.nodes.map((n) => { const h = hub.get(n.part), p = at.get(n.id); return h && p ? <path key={`p${n.id}`} d={`M${h.x},${h.y + 18} Q${h.x},${p.y} ${p.x - 9},${p.y}`} fill="none" stroke="var(--leaf)" strokeOpacity={lit(n.id) ? 0.35 : 0.1} strokeWidth="1.5" /> : null; })}
        {m.nodes.flatMap((n) => n.after.map((a) => { const p = at.get(n.id), q = at.get(a); if (!p || !q) return null; const on = focus && (focus === n.id || focus === a);
          const bend = Math.max(30, Math.abs(p.y - q.y) * 0.3 + Math.abs(p.x - q.x) * 0.1);
          return <g key={`a${n.id}${a}`}><path d={`M${q.x - 9},${q.y} C${q.x - 9 - bend},${q.y} ${p.x - 9 - bend},${p.y} ${p.x - 9},${p.y}`} fill="none" stroke="var(--sun)" strokeWidth={on ? 2.5 : 1.5} strokeOpacity={on ? 0.9 : focus ? 0.05 : 0.3} /><path d={`M${q.x - 9},${q.y} C${q.x - 9 - bend},${q.y} ${p.x - 9 - bend},${p.y} ${p.x - 9},${p.y}`} fill="none" stroke="transparent" strokeWidth="10"><title>{`${node.get(a)?.name} → ${t.leadsTo} → ${n.name}`}</title></path></g>; }))}
        {m.parts.map((p) => { const h = hub.get(p.id)!; return (
          <g key={p.id} className={onPart ? 'map-node' : undefined} onClick={() => onPart?.(p.id)} opacity={!focus || near.has(p.id) ? 1 : 0.35}>
            <title>{`${p.title} · ${t.pages(pageRanges(Array.from({ length: p.pageTo - p.pageFrom + 1 }, (_, k) => p.pageFrom + k)))}`}</title>
            <circle cx={h.x} cy={h.y} r="17" fill="var(--leaf)" />
            <text x={h.x} y={h.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{h.n}</text>
            <text x={h.x + 24} y={h.y + 4} fontSize="12" fontWeight="700" fill="var(--ink)">{clip(p.title, 30)}</text>
          </g>); })}
        {m.nodes.map((n) => { const p = at.get(n.id); if (!p) return null; const [c, bg] = tint(n.kind), on = !!picked?.includes(n.id), big = sel === n.id || on;
          return (
            <g key={n.id} className="map-node" role={picked ? 'checkbox' : 'button'} aria-checked={picked ? on : undefined} aria-label={n.name} onClick={() => onNode(n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover('')} opacity={lit(n.id) || on ? 1 : 0.3}>
              <title>{`${n.name} · ${t.pages(pageRanges(n.pages, n.printed))}`}</title>
              <circle cx={p.x} cy={p.y} r={big ? 10 : 8} fill={on ? c : bg} stroke={c} strokeWidth={big ? 3 : 2} />
              {on && <path d={`M${p.x - 4},${p.y} l3,3 l5,-6`} fill="none" stroke="#fff" strokeWidth="2" />}
              <text x={p.x + 14} y={p.y + 4} fontSize="11" fontWeight={big ? 700 : 400} fill="var(--ink)">{clip(n.name, 30)}</text>
            </g>); })}
      </svg>
    </div>
  );
}

// On the lesson page: the skills of one book as ticks, from any of its parts. Ticking a skill in another book
// starts again there (a lesson comes from one book); the parent is told which parts and pages that gives.
export function SkillPicker({ map, picked, onPick }: { map: SkillMap; picked: string[]; onPick: (ids: string[]) => void }) {
  const t = useT(T), lang = useLang(), [find, setFind] = useState(''), [moved, setMoved] = useState(false), [view, setView] = useState<'map' | 'list'>('map');
  const node = new Map(map.nodes.map((n) => [n.id, n])), partOf = picked.length ? node.get(picked[0])?.part : '';
  const f = find.trim().toLowerCase();
  const tick = (id: string, on: boolean) => {
    const n = node.get(id)!;
    if (!on) { onPick(picked.filter((x) => x !== id)); return; }
    const bookOf = (pid?: string) => map.parts.find((p) => p.id === pid)?.bookId;
    if (partOf && bookOf(n.part) !== bookOf(partOf)) { setMoved(true); onPick([id]); return; }
    setMoved(false); onPick([...picked, id]);
  };
  if (!map.nodes.length) return <div className="stack" style={{ gap: 6 }}><BetaHead small /><p className="small muted">{t.noMap}</p><button className="btn small" style={{ alignSelf: 'start' }} onClick={() => go('/knowledge')}>{t.openMap}</button></div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <BetaHead small />
      <span className="small muted">{t.pickLead}</span>
      <div className="row" role="tablist" aria-label={t.picker}>{(['map', 'list'] as const).map((k) => <button key={k} role="tab" aria-selected={view === k} className={`pill ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{k === 'map' ? t.asMap : t.asList}</button>)}</div>
      {moved && <span className="small banner warn">{t.otherPart}</span>}
      {view === 'map' ? <><span className="small muted">{t.tickHint}</span><div className="map-legend small muted" aria-label={t.legendLabel}><span><i className="dot lang" /> {t.legendLang}</span><span><i className="dot maths" /> {t.legendMaths}</span><span><svg width="22" height="10" aria-hidden="true"><path d="M1,9 C8,9 14,1 21,1" fill="none" stroke="var(--sun)" strokeWidth="2" /></svg> {t.legendBuilds}</span></div><NeuronMap map={map} picked={picked} onNode={(id) => tick(id, !picked.includes(id))} /></> : <>
      <input type="search" value={find} placeholder={t.search} onChange={(e) => setFind(e.target.value)} />
      <div className="stack" style={{ gap: 6, maxHeight: 320, overflow: 'auto' }}>
        {map.parts.map((p) => { const ns = map.nodes.filter((n) => n.part === p.id && (!f || n.name.toLowerCase().includes(f) || p.title.toLowerCase().includes(f))); return ns.length ? (
          <div key={p.id} className="stack" style={{ gap: 2 }}>
            <b className="small" style={{ color: partOf === p.id ? 'var(--leaf)' : undefined }}>{p.title}</b>
            {ns.map((n) => <label key={n.id} className="check small"><input type="checkbox" checked={picked.includes(n.id)} onChange={(e) => tick(n.id, e.target.checked)} /> <span>{n.name} <span className="muted">· {KIND[lang][n.kind] ?? n.kind} · {t.pages(pageRanges(n.pages, n.printed))}</span></span></label>)}
          </div>) : null; })}
      </div></>}
    </div>
  );
}
export const SKILL_T = T;

// The "Skills map · Beta" menu (Son, 2 Nov): her sources as choices, the chosen one's map, a part's pages on click
export function SkillsPage() {
  const t = useT(T), [areas, setAreas] = useState<{ id: string; name: string }[] | null>(null), [areaId, setAreaId] = useState(new URLSearchParams(location.search).get('area') || ''), [source, setSource] = useState('');
  useEffect(() => { api.areas().then((r) => { const ready = r.areas.filter((a) => a.books.some((b) => b.status === 'ready')); setAreas(ready); setAreaId((x) => (x && ready.some((a) => a.id === x) ? x : ready[0]?.id || '')); }).catch(() => setAreas([])); }, []);
  if (!areas) return null;
  return (
    <div className="page stack" style={{ gap: 12 }}>
      <div><h1>{t.title} <span className="tag ai">{t.beta}</span></h1><p className="small muted">{t.pageLead}</p></div>
      {!areas.length ? <div className="card stack"><p className="small">{t.noBooks}</p><button className="btn small" style={{ alignSelf: 'start' }} onClick={() => go('/knowledge')}>{t.toKnowledge}</button></div> : <>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{areas.map((a) => <button key={a.id} className={`pill ${a.id === areaId ? 'on' : ''}`} onClick={() => { setAreaId(a.id); setSource(''); }}>{a.name}</button>)}</div>
        {source && <SourceView sectionId={source} onClose={() => setSource('')} />}
        {areaId && <div className="card"><SkillMapView key={areaId} areaId={areaId} onSource={setSource} /></div>}
      </>}
    </div>
  );
}

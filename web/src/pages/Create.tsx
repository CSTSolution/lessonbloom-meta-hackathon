// Making a lesson, steps 1-2 of Chi's six (Tài liệu · Câu hỏi · Slide · Video · Bài tập · Giao bài).
//   1 Tài liệu: the source (a book in the knowledge area) and its part ("Tự tìm" lets the AI find it),
//     and the lesson material in one of four forms: a sentence (typed or said), a photo of the lesson,
//     a photo of the child's finished exercise (its kind and mistakes), or pasted text. The material
//     only points to the part; what is taught comes from the book, and the found pages are shown.
//   2 Câu hỏi: the setup the AI pre-filled, each question folded, only the open one shows.
// Steps 3-6 are the lesson page.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AreaRow, type Learner, type Match, type SectionRow, type Setup, type Work } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';
import { WorkTable } from './WorkCard.tsx';

export const STEPS = { vi: ['Tài liệu', 'Câu hỏi', 'Slide', 'Video', 'Bài tập', 'Giao bài'], en: ['Material', 'Questions', 'Slides', 'Video', 'Practice', 'Assign'] };
// Chi's role table: Questions (2) is the teacher's step; a parent's run 1, 3, 4, 5, 6, shown as 1-5. The
// video is a step for parents too, so they see it before their child does (Chi #32).
export const PARENT_STEPS = [1, 3, 4, 5, 6];
// open: steps seen but not finished, with what they wait for (Chi #53: Video had a ✓ while no video was made)
export function Stepper({ at, onStep, done = at - 1, parent = false, open = {} }: { at: number; onStep?: (i: number) => void; done?: number; parent?: boolean; open?: Record<number, string> }) {
  const lang = useLang();
  const steps = STEPS[lang].map((s, i) => ({ s, n: i + 1 })).filter((x) => !parent || PARENT_STEPS.includes(x.n));
  return <div className="stepper noprint">{steps.map(({ s, n }, i) => { const ok = n <= done && !open[n], cls = n === at ? 'on' : ok ? 'done' : ''; const body = <span className={cls}><i>{ok && n !== at ? '✓' : i + 1}</i>{s}{open[n] && <small className="muted"> · {open[n]}</small>}</span>; return onStep && n >= 3 ? <button key={s} onClick={() => onStep(n)}>{body}</button> : <span key={s} style={{ display: 'contents' }}>{body}</span>; })}</div>;
}

const T = {
  vi: {
    save: 'Lưu nháp và thoát', short: (left: number, need: number) => `Bạn có ${left} lượt, một bài cần ${need}. Nhập mã để có thêm lượt, rồi soạn tiếp ngay tại đây.`, shortDemo: 'Đăng nhập bằng email để nhập mã khuyến mãi.', promoPh: 'Mã khuyến mãi', apply: 'Dùng mã', promoOk: (n: number) => `Đã cộng ${n} lượt. Cô soạn tiếp nhé.`, usage: 'Xem lượt dùng', restored: 'Đã mở lại bài đang soạn dở.', discard: 'Bỏ nháp', h1: 'Chọn nguồn và tài liệu tạo bài', lead: 'Bài chỉ soạn trong nguồn cô chọn.', src: 'Nguồn kiến thức', srcLead: 'Để “Tự tìm”, LessonBloom tìm đúng trang.', source: 'Nguồn', part: 'Phạm vi kiến thức', auto: 'Tự tìm theo tài liệu tạo bài', openKnowledge: 'Mở Kho kiến thức',
    mat: 'Tài liệu tạo bài', matLead: 'Một câu, ảnh bài giảng hoặc ảnh bài tập đã làm.', kinds: { one: 'Một câu mô tả', lesson: 'Ảnh bài giảng', work: 'Ảnh bài tập đã làm', paste: 'Dán văn bản' },
    what: 'Bài này cần học gì?', whatPh: 'Ví dụ: Phép cộng có nhớ trong phạm vi 100, tập trung vào nhớ 1 sang hàng chục.', pastePh: 'Dán đoạn văn bản (giáo án, đề bài…) vào đây.', say: '● Nói', stop: '■ Dừng', hearing: 'Đang nghe…',
    lessonPhoto: 'Chụp trang sách hoặc giáo án (tối đa 5 ảnh). Không chụp mặt người, tên hay thông tin cá nhân.', workPhoto: 'Chụp bài con đã làm (tối đa 5 ảnh). AI nhận ra dạng bài và chỗ sai, rồi tạo bài luyện cùng dạng trong phạm vi đã chọn. Không chụp tên hay mặt.', pick: '+ Chọn ảnh', reading: 'AI đang đọc ảnh…',
    find: 'Tìm trong nguồn', finding: 'Đang tìm…', found: (c: string) => `Đã tìm thấy: ${c}. Bài chỉ dùng các trang này.`, quotes: 'Các đoạn AI đã dùng', mistakes: 'Chỗ con hay sai', notFound: 'Chưa có trong Kho kiến thức. Cô thêm tài liệu hoặc chọn phạm vi khác.',
    scope: (s: string) => `Phạm vi: ${s}`, next: 'Tiếp tục', noArea: 'Bạn chưa có sách nào. Bài giảng chỉ được soạn từ sách của bạn.', booksReading: 'Sách của bạn đang được đọc; đọc xong là soạn bài được. Trong lúc chờ, bạn có thể dùng sách mẫu.', sample: 'Dùng sách mẫu',
    upPdf: 'Tải sách (PDF)', upPhotos: 'Chụp / tải ảnh trang sách', sampleOf: 'Sách mẫu do đội LessonBloom tự viết:', samples: { maths2: 'Maths 2 (tiếng Anh)', english3: 'Tiếng Anh 3', toan2: 'Toán 2' }, noSource: 'Chưa có sách', addingSample: 'Đang thêm sách mẫu…',
    matOpt: 'Tuỳ chọn', fromPart: (p: string) => `Bài sẽ soạn từ cả phần “${p}”. Muốn thu hẹp hoặc nhấn mạnh điểm nào, thêm một câu hoặc ảnh.`, addMat: 'Thêm tài liệu', nextPart: 'Soạn bài từ phần này',
    h2: 'Một vài câu hỏi về bài học', lead2: 'AI đã điền sẵn. Cô xem và sửa nếu cần.', fromAi: 'Gợi ý từ AI', optional: 'Không bắt buộc',
    q: { goal: 'Mục tiêu', title: 'Tên bài', minutes: 'Thời lượng', level: 'Mức của lớp', make: 'Cần tạo', lang: 'Ngôn ngữ', note: 'Ghi chú cho AI' },
    min: (n: number) => `${n} phút`, lv: { mixed: 'Nhiều mức (3 mức bài tập)', basic: 'Phần lớn cơ bản', advanced: 'Phần lớn nâng cao' }, mk: { slides: 'Slide bài giảng', items: 'Bài tập theo mẫu', video: 'Video có giọng đọc', cards: 'Thẻ nhớ' }, always: 'luôn có', vi: 'Tiếng Việt', en: 'Tiếng Anh', none: 'Chưa có', notePh: 'Ví dụ: dùng tình huống ở chợ',
    back: 'Quay lại', create: 'Tạo bài giảng', thinking: 'Đang đọc phạm vi…', page: 'tr.',
    whose: 'Bài này của em nào?', whoseP: 'Bài này của con nào?', whoseLeadP: 'Bài làm được lưu vào hồ sơ của con (không vào Kho kiến thức), và bài giảng được soạn riêng cho con.', noOne: 'Không chọn', whoseLead: 'Bài làm được lưu vào hồ sơ của em (không vào Kho kiến thức), và bài giảng được soạn riêng cho em.', fromRec: (d: string) => `Từ bài làm ngày ${d} trong hồ sơ.`, saving: 'Đang lưu bài làm…',
  },
  en: {
    save: 'Save draft and leave', short: (left: number, need: number) => `You have ${left} credits; a lesson needs ${need}. Enter a code for more, then carry on right here.`, shortDemo: 'Sign in with your email to use a promo code.', promoPh: 'Promo code', apply: 'Apply', promoOk: (n: number) => `${n} credits added. Carry on.`, usage: 'See usage', restored: 'Your unfinished lesson was opened again.', discard: 'Discard draft', h1: 'Choose the source and the material', lead: 'The lesson is made only from the source you choose.', src: 'Source', srcLead: 'With “Find it for me”, LessonBloom finds the right pages.', source: 'Source', part: 'Part', auto: 'Find it from the material', openKnowledge: 'Open Knowledge',
    mat: 'Lesson material', matLead: 'A sentence, a photo of the lesson or of a finished exercise.', kinds: { one: 'One sentence', lesson: 'Lesson photo', work: 'Finished exercise', paste: 'Paste text' },
    what: 'What should this lesson teach?', whatPh: 'e.g. Unit 6: colours, the words red, blue and green.', pastePh: 'Paste text (a plan, an exercise…) here.', say: '● Speak', stop: '■ Stop', hearing: 'Listening…',
    lessonPhoto: 'Photograph the book page or your plan (up to 5 photos). No faces, names or personal details.', workPhoto: "Photograph the child's finished exercise (up to 5 photos). The AI finds its kind and the mistakes, then makes practice of the same kind in the chosen part. No names or faces.", pick: '+ Choose photos', reading: 'Reading the photos…',
    find: 'Find in the source', finding: 'Searching…', found: (c: string) => `Found: ${c}. The lesson uses only these pages.`, quotes: 'Passages the AI used', mistakes: 'Mistakes seen', notFound: 'Not in your knowledge area yet. Add material or choose another part.',
    scope: (s: string) => `Part: ${s}`, next: 'Continue', noArea: 'You have no books yet. Lessons are made only from your own books.', booksReading: 'Your book is being read; once it is done you can make a lesson. Meanwhile you can use a sample book.', sample: 'Use a sample book',
    upPdf: 'Upload a book (PDF)', upPhotos: 'Take or upload photos of pages', sampleOf: 'Sample books written by the LessonBloom team:', samples: { maths2: 'Maths 2', english3: 'English 3', toan2: 'Toán 2 (Vietnamese)' }, noSource: 'No book yet', addingSample: 'Adding the sample book…',
    matOpt: 'Optional', fromPart: (p: string) => `The lesson is made from the whole part “${p}”. To narrow it or stress a point, add a sentence or a photo.`, addMat: 'Add material', nextPart: 'Make the lesson from this part',
    h2: 'A few questions about the lesson', lead2: 'The AI filled these in. Check and change them if needed.', fromAi: 'Suggested by AI', optional: 'Optional',
    q: { goal: 'Objectives', title: 'Title', minutes: 'Length', level: 'Class level', make: 'To make', lang: 'Language', note: 'Note for the AI' },
    min: (n: number) => `${n} min`, lv: { mixed: 'Mixed (3 practice levels)', basic: 'Mostly basic', advanced: 'Mostly advanced' }, mk: { slides: 'Slides', items: 'Practice from templates', video: 'Narrated video', cards: 'Flashcards' }, always: 'always made', vi: 'Vietnamese', en: 'English', none: 'None', notePh: 'e.g. use market examples',
    back: 'Back', create: 'Make the lesson', thinking: 'Reading the part…', page: 'p.',
    whose: 'Whose work is this?', whoseP: 'Which child did this work?', whoseLeadP: "The work is kept in your child's profile (never in Knowledge), and the lesson is made for them.", noOne: 'Nobody chosen', whoseLead: "The work is kept in the pupil's profile (never in Knowledge), and the lesson is made for them.", fromRec: (d: string) => `From the work of ${d} in the profile.`, saving: 'Saving the work…',
  },
};
type Kind = 'one' | 'lesson' | 'work' | 'paste';

// Step 1 is kept in this browser as she works (Chi #30): leaving to enter a code and coming back finds
// it, and a part already found is not looked for (and paid for) again. Gone once the lesson is made.
// Kept per account (live test, 1 Nov: a new account in the same browser was offered another's draft).
let owner = '';
export const setOwner = (id: string) => { owner = id; };
const DRAFT = () => `lbm-draft:${owner}`;
export interface Draft { areaId: string; sectionId: string; part?: string; kind: Kind; text: string; focus: string; match: Match | null; at: number; work?: Work | null; pupilId?: string }
export const readDraft = (): Draft | null => {
  try { const d = JSON.parse(localStorage.getItem(DRAFT()) || 'null') as Draft | null; return d && Date.now() - d.at < 7 * 864e5 ? d : null; } catch { return null; }
};
// The step she was on in each lesson, and which lesson she worked on last (Chi #43: Carry on opens that
// step; the Lessons page offers the most recent unfinished work, a draft or a lesson not assigned yet).
export interface LastLesson { id: string; title: string; step: number; at: number }
const LAST = () => `lbm-last-lesson:${owner}`;
export const lessonStep = (id: string): number | null => { try { const n = Number(localStorage.getItem(`lbm-step-${id}`)); return n >= 3 && n <= 6 ? n : null; } catch { return null; } };
export const keepStep = (id: string, title: string, step: number) => { try { localStorage.setItem(`lbm-step-${id}`, String(step)); localStorage.setItem(LAST(), JSON.stringify({ id, title, step, at: Date.now() })); } catch { /* private window */ } };
export const readLast = (): LastLesson | null => { try { const d = JSON.parse(localStorage.getItem(LAST()) || 'null') as LastLesson | null; return d && Date.now() - d.at < 7 * 864e5 ? d : null; } catch { return null; } };
const writeDraft = (d: Draft | null) => { try { if (d) localStorage.setItem(DRAFT(), JSON.stringify(d)); else localStorage.removeItem(DRAFT()); } catch { /* private window: no draft */ } };

export function Create({ parent }: { parent: boolean }) {
  const t = useT(T), lang = useLang();
  const q = new URLSearchParams(location.search), d0 = useRef(q.get('area') ? null : readDraft()).current;
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [areaId, setAreaId] = useState(q.get('area') || d0?.areaId || ''), [sections, setSections] = useState<SectionRow[]>([]), [sectionId, setSectionId] = useState(q.get('section') || d0?.sectionId || '');
  const [kind, setKind] = useState<Kind>(d0?.kind || 'one'), [text, setText] = useState(d0?.text || ''), [focus, setFocus] = useState(d0?.focus || '');
  // the child's marked work (Chi #46): the table read from the photos, and whose it is
  const [work, setWork] = useState<Work | null>(d0?.work || null), [pupilId, setPupilId] = useState(d0?.pupilId || ''), [learners, setLearners] = useState<Learner[]>([]);
  const [match, setMatch] = useState<Match | null>(d0?.match || null), [missing, setMissing] = useState(false), [setup, setSetup] = useState<Setup | null>(null), [open, setOpen] = useState('goal');
  // her credits, checked before any step that costs some (Chi #30): too few, and a code is entered here
  const [cr, setCr] = useState<{ left: number; need: number; account: boolean } | null>(null), [code, setCode] = useState(''), [pmsg, setPmsg] = useState('');
  const loadCr = () => { api.me().then((r) => setCr({ left: r.credits.left, need: r.lessonCredits ?? 60, account: r.teacher.kind === 'account' })).catch(() => {}); };
  useEffect(() => { loadCr(); window.addEventListener('lbm-credits', loadCr); return () => window.removeEventListener('lbm-credits', loadCr); }, []);
  const short = !!cr && cr.left < cr.need, firstArea = useRef(true);
  // a draft with nothing in it yet (no part chosen, no sentence) is not kept (Chi #43)
  useEffect(() => { if (text.trim() || match || sectionId) writeDraft({ areaId, sectionId, part: sections.find((s) => s.id === sectionId)?.title, kind, text, focus, match, at: Date.now(), work, pupilId }); }, [areaId, sectionId, kind, text, focus, match, sections, work, pupilId]);
  useEffect(() => { api.learners().then((r) => { const ls = r.learners.filter((x) => !parent || x.kind === 'child'); setLearners(ls); if (parent && ls.length === 1) setPupilId((p) => p || ls[0].id); }).catch(() => {}); }, []);
  // "Make a lesson from these mistakes" on the child's page: /create?work=<record>
  useEffect(() => { const rid = q.get('work'); if (rid) api.workRecord(rid).then((r) => { setKind('work'); setMoreMat(true); setWork(r.record); setPupilId(r.record.pupilId || ''); const req = r.request || r.record.topic || r.record.questions[0]?.q || ''; setText(req); setFocus(focusOf(r.record, lang)); bestFor(r.record, req); }).catch(() => {}); }, []);
  // the source that fits the sheet: its numbers' range, then its mistakes (Chi #54; code only, no credits)
  const bestFor = (w: Work, req: string) => { if (q.get('area')) return; void api.bestArea(req, w.questions.map((x) => x.q), w.subject).then((r) => { if (r.areaId) { setAreaId(r.areaId); setSectionId(''); setMatch(null); } }).catch(() => {}); };
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [rec, setRec] = useState<MediaRecorder | null>(null);
  // no book yet (Chi #39): the sample books are offered here; a book still being read is said so
  const [reading, setReading] = useState(false), [pickSample, setPickSample] = useState(false);
  // a part chosen makes the material optional (Chi #40): folded until she asks for it, open if she wrote some
  const [moreMat, setMoreMat] = useState(!!d0?.text);
  const chunks = useRef<Blob[]>([]);
  const loadAreas = () => api.areas().then((r) => { setReading(r.areas.some((a) => a.books.some((b) => b.status === 'processing'))); const ready = r.areas.filter((a) => a.books.some((b) => b.status === 'ready')); setAreas(ready); setAreaId((x) => (x && ready.some((a) => a.id === x) ? x : ready[0]?.id || '')); }).catch(() => setAreas([]));
  useEffect(() => { void loadAreas(); }, []);
  useEffect(() => { if (firstArea.current) firstArea.current = false; else { setMatch(null); setMissing(false); } if (areaId) api.area(areaId).then((r) => setSections(r.sections)).catch(() => setSections([])); }, [areaId]);
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error).message || e)); } finally { setBusy(''); } };
  const record = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => { stream.getTracks().forEach((x) => x.stop()); void run('voice', async () => setText((await api.voice(new Blob(chunks.current, { type: r.mimeType.split(';')[0] || 'audio/webm' }))).text.slice(0, 2000))); };
    r.start(); setRec(r); setTimeout(() => { if (r.state === 'recording') r.stop(); }, 2 * 60e3);
  };
  const photos = (fs: File[], what: 'lesson' | 'work') => run('photo', async () => {
    const imgs = await Promise.all(fs.slice(0, 5).map((f) => shrink(f)));
    if (what === 'work') { const r = await api.work(imgs); setText(r.request); setWork(r.work); setFocus(focusOf(r.work, lang)); if (!sectionId) bestFor(r.work, r.request); } else setText((await api.photos(imgs)).text.slice(0, 2000));
  });
  const find = () => run('find', async () => {
    setMissing(false);
    try { setMatch((await api.match(areaId, text)).match); } catch (e) { if (e instanceof ApiError && e.code === 'noMatch') setMissing(true); else throw e; }
  });
  const chosen = sections.find((s) => s.id === sectionId), a = areas?.find((x) => x.id === areaId);
  const scopeText = chosen ? `${a?.name} · ${t.page} ${chosen.page_from}${chosen.page_to > chosen.page_from ? `–${chosen.page_to}` : ''}` : match ? `${match.book} · ${t.page} ${match.pageFrom}${match.pageTo > match.pageFrom ? `–${match.pageTo}` : ''}` : '';
  const toStep2 = () => run('intake', async () => {
    // the work is saved to the child's profile first (Chi #46), as she corrected it; the lesson carries a copy
    let w = kind === 'work' ? work : null;
    if (w && pupilId) w = { ...(w.recordId && w.pupilId === pupilId ? (await api.updateWork(w.recordId, w)).record : (await api.saveWork(pupilId, w)).record) };
    if (w) setWork(w);
    const s0 = (await api.intake(areaId, chosen?.id || match!.sectionId)).setup, s = { ...s0, note: focus ? `${lang === 'en' ? 'Aim at these mistakes' : 'Tập trung vào lỗi'}: ${focus}` : s0.note, ...(w ? { work: w } : {}) };
    // a parent has no Questions step: the lesson is made straight from the setup the book gave
    if (parent) { const { id } = await api.create({ areaId, sectionId: chosen?.id || match!.sectionId, request: text || chosen?.title || '', setup: s }); writeDraft(null); go(`/lesson/${id}`); return; }
    setSetup(s);
  });
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => (s ? { ...s, [k]: v } : s));
  const redeem = () => run('promo', async () => {
    setPmsg('');
    try { const r = await api.promo(code); setCode(''); setPmsg(t.promoOk(r.added.credits)); window.dispatchEvent(new Event('lbm-credits')); }
    catch (e) { setPmsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error).message || e)); }
  });
  const shortBox = short && cr && (
    <div className="banner warn stack" style={{ gap: 6 }}>
      <b className="small">{t.short(cr.left, cr.need)}</b>
      {cr.account ? <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void redeem(); }}>
        <input value={code} maxLength={32} placeholder={t.promoPh} aria-label={t.promoPh} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ minWidth: 0, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8 }} />
        <button className="btn small primary" disabled={!!busy || code.trim().length < 4}>{t.apply}</button>
        <button type="button" className="link small" onClick={() => window.open('/usage', '_blank')}>{t.usage}</button></form>
        : <span className="small">{t.shortDemo}</span>}
      {pmsg && <span className="small">{pmsg}</span>}
    </div>);
  const okBox = !short && pmsg && <div className="banner small">✓ {pmsg}</div>;
  if (!areas) return null;

  const top = <div className="row noprint" style={{ justifyContent: 'flex-end' }}><button className="link small" onClick={() => go('/')}>{t.save}</button></div>;
  // lessons still come only from her books (Chi #39): with none, the Material step says so and offers
  // the three ways to get one; a sample book is added here and comes back chosen, on this same step
  const addSample = (b: 'maths2' | 'english3' | 'toan2') => run('sample', async () => { const id = (await api.sampleArea(b)).area.id; await loadAreas(); setAreaId(id); setSectionId(''); setPickSample(false); });
  const noBook = !areas.length && <div className="banner warn stack" style={{ gap: 8 }}>
    <b className="small">{reading ? t.booksReading : t.noArea}</b>
    <div className="row">
      <button className="btn small primary" onClick={() => go('/knowledge?add=1')}>{t.upPdf}</button>
      <button className="btn small primary" onClick={() => go('/knowledge?add=1')}>{t.upPhotos}</button>
      <button className="btn small" disabled={!!busy} onClick={() => setPickSample(!pickSample)}>{t.sample}</button>
    </div>
    {pickSample && <div className="row small"><span className="muted">{t.sampleOf}</span>{(['maths2', 'english3', 'toan2'] as const).map((b) => <button key={b} className="btn small" disabled={!!busy} onClick={() => void addSample(b)}>{t.samples[b]}</button>)}{busy === 'sample' && <span className="muted" role="status">{t.addingSample}</span>}</div>}
  </div>;
  // the material: needed to find the part when "Find it" is chosen; with a part chosen, only to narrow it
  const matOpen = !chosen || moreMat || !!text.trim();

  if (!setup) return (
    <div className="page narrow">{top}<Stepper at={1} parent={parent} />
      <div className="stack" style={{ gap: 14 }}>
        <div><h1>{t.h1}</h1><p className="small muted">{t.lead}</p></div>
        {shortBox}{okBox}
        {d0 && (d0.text || d0.match) && <div className="row small muted"><span className="grow">{t.restored}</span><button className="link small" onClick={() => { writeDraft(null); location.reload(); }}>{t.discard}</button></div>}
        <div className="card stack">
          <b><span className="num cur">1</span> {t.src}</b><span className="small muted">{t.srcLead}</span>
          {noBook}
          <div className="grid2">
            <label className="field">{t.source}<select value={areaId} disabled={!areas.length} onChange={(e) => { setAreaId(e.target.value); setSectionId(''); }}>{areas.length ? areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>) : <option value="">{t.noSource}</option>}</select></label>
            <label className="field">{t.part}<select value={sectionId} disabled={!areaId} onChange={(e) => { setSectionId(e.target.value); setMatch(null); }}><option value="">{t.auto}</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.title} · {t.page} {s.page_from}</option>)}</select></label>
          </div>
          {areas.length > 0 && <button className="link small" style={{ alignSelf: 'start' }} onClick={() => go('/knowledge')}>{t.openKnowledge}</button>}
        </div>
        {!matOpen && chosen && <div className="card stack">
          <b><span className="num">2</span> {t.mat}</b>
          <span className="small muted"><b>{t.matOpt}</b> · {t.fromPart(chosen.title)}</span>
          <button className="btn small" style={{ alignSelf: 'start' }} onClick={() => setMoreMat(true)}>{t.addMat}</button>
        </div>}
        {matOpen && <div className="card stack">
          <b><span className={`num ${chosen ? '' : 'cur'}`}>2</span> {t.mat}{chosen && <> <span className="tag">{t.matOpt}</span></>}</b><span className="small muted">{t.matLead}</span>
          <div className="row">{(Object.keys(t.kinds) as Kind[]).map((k) => <button key={k} className={`btn small ${kind === k ? 'primary' : ''}`} onClick={() => setKind(k)}>{t.kinds[k]}</button>)}</div>
          {(kind === 'lesson' || kind === 'work') && <><p className="small muted">{kind === 'work' ? t.workPhoto : t.lessonPhoto}</p>
            <label className="btn" style={{ alignSelf: 'start' }}>{busy === 'photo' ? t.reading : t.pick}<input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) void photos(fs, kind); }} /></label></>}
          <label className="field">{t.what}<textarea rows={kind === 'paste' ? 7 : 3} maxLength={kind === 'paste' ? 6000 : 2000} value={text} placeholder={kind === 'paste' ? t.pastePh : t.whatPh} onChange={(e) => { setText(e.target.value); setMatch(null); setMissing(false); }} /></label>
          {kind === 'one' && (rec ? <button className="btn coral small" style={{ alignSelf: 'start' }} onClick={() => { rec.stop(); setRec(null); }}>{t.stop}</button>
            : <button className="btn small" style={{ alignSelf: 'start' }} disabled={!!busy} onClick={() => void record().catch((e) => setErr(String(e.message || e)))}>{busy === 'voice' ? t.hearing : t.say}</button>)}
          {kind === 'work' && <label className="field">{parent ? t.whoseP : t.whose}<select value={pupilId} onChange={(e) => setPupilId(e.target.value)}><option value="">{t.noOne}</option>{learners.map((x) => <option key={x.id} value={x.id}>{parent ? x.name : `${x.name} · ${x.class_name}`}</option>)}</select><span className="small muted">{parent ? t.whoseLeadP : t.whoseLead}</span></label>}
          {kind === 'work' && work && <>{work.recordId && <span className="small muted">{t.fromRec(`${work.date.slice(8, 10)}/${work.date.slice(5, 7)}`)}</span>}
            <WorkTable work={{ ...work, child: learners.find((x) => x.id === pupilId)?.name }} parent={parent} busy={!!busy} onChange={(nw) => { setWork(nw); setFocus(focusOf(nw, lang)); }} /></>}
          {focus && !(kind === 'work' && work) && <p className="banner warn small"><b>{t.mistakes}:</b> {focus}</p>}
          {!chosen && <div className="row"><span className="grow" /><button className="btn" disabled={!!busy || short || !areaId || text.trim().length < 3} onClick={find}>{busy === 'find' ? t.finding : t.find}</button></div>}
        </div>}
        {match && !chosen && <div className="banner"><b>✓ {t.found(scopeText)}</b><details className="small"><summary>{match.title} · {t.quotes}</summary>{match.cited.map((c) => <blockquote key={c.id}>“{c.quote}” <span className="muted">· {t.page} {c.page}</span></blockquote>)}</details></div>}
        {chosen && <div className="banner">✓ {t.found(`${chosen.title} · ${scopeText}`)}</div>}
        {/* a part chosen by hand answers it (live test, 1 Nov: the warning stayed under "Found") */}
        {missing && !sectionId && <div className="banner warn">{t.notFound}</div>}
        {err && <p className="note">{err}</p>}
        <div className="row"><span className="small muted grow">{scopeText && t.scope(scopeText)}</span>
          <button className="btn primary" disabled={!!busy || short || !(chosen || match)} onClick={toStep2}>{busy === 'intake' ? t.thinking : chosen ? t.nextPart : t.next}</button></div>
      </div>
    </div>
  );

  const row = (id: string, title: string, sub: string, body: React.ReactNode, badge?: string) => (
    <div key={id} className={`group card ${open === id ? 'on' : ''}`}>
      <button className="group-head" onClick={() => setOpen(open === id ? '' : id)} aria-expanded={open === id}>
        <span className="caret">{open === id ? '▾' : '▸'}</span><span className="grow"><b className="small">{title}</b> <span className="small muted">{sub}</span></span>{badge && <span className="tag ai">{badge}</span>}
      </button>
      {open === id && <div style={{ paddingTop: 8 }}>{body}</div>}
    </div>
  );
  return (
    <div className="page narrow">{top}<Stepper at={2} />
      <div className="stack" style={{ gap: 10 }}>
        <div><h1>{t.h2}</h1><p className="small muted">{t.lead2}</p></div>
        {row('goal', t.q.goal, setup.objectives[0] || '', <div className="stack" style={{ gap: 6 }}>
          <label className="field">{t.q.title}<input value={setup.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></label>
          {[0, 1, 2].map((i) => <input key={i} value={setup.objectives[i] || ''} maxLength={200} onChange={(e) => { const o = [...setup.objectives]; o[i] = e.target.value; set('objectives', o.filter((x, j) => x || j < i)); }} />)}
        </div>, t.fromAi)}
        {row('min', t.q.minutes, t.min(setup.minutes), <div className="row">{([15, 25, 35] as const).map((m) => <button key={m} className={`pill ${setup.minutes === m ? 'on' : ''}`} onClick={() => set('minutes', m)}>{t.min(m)}</button>)}</div>)}
        {row('level', t.q.level, t.lv[setup.level || 'mixed'], <div className="row">{(['mixed', 'basic', 'advanced'] as const).map((v) => <button key={v} className={`pill ${(setup.level || 'mixed') === v ? 'on' : ''}`} onClick={() => set('level', v)}>{t.lv[v]}</button>)}</div>)}
        {row('make', t.q.make, [t.mk.slides, t.mk.items, setup.make?.video !== false && t.mk.video, setup.make?.cards !== false && t.mk.cards].filter(Boolean).join(', '), <div className="stack" style={{ gap: 6 }}>
          <span className="small">✓ {t.mk.slides} · ✓ {t.mk.items} <span className="muted">({t.always})</span></span>
          {(['video', 'cards'] as const).map((k) => <label key={k} className="check"><input type="checkbox" checked={setup.make?.[k] !== false} onChange={(e) => set('make', { video: setup.make?.video !== false, cards: setup.make?.cards !== false, [k]: e.target.checked })} /> {t.mk[k]}</label>)}
        </div>)}
        {row('lang', t.q.lang, setup.lang === 'en' ? t.en : t.vi, <div className="row">{(['vi', 'en'] as const).map((l) => <button key={l} className={`pill ${setup.lang === l ? 'on' : ''}`} onClick={() => set('lang', l)}>{l === 'vi' ? t.vi : t.en}</button>)}</div>)}
        {row('note', t.q.note, setup.note || t.none, <input value={setup.note || ''} maxLength={300} placeholder={t.notePh} onChange={(e) => set('note', e.target.value)} style={{ width: '100%' }} />, t.optional)}
        {shortBox}{err && <p className="note">{err}</p>}
        <div className="row"><button className="btn" onClick={() => setSetup(null)}>{t.back}</button><span className="grow" />
          <button className="btn primary" disabled={!!busy || short || !setup.title.trim()} onClick={() => run('make', async () => { const { id } = await api.create({ areaId, sectionId: chosen?.id || match!.sectionId, request: text || chosen?.title || '', setup: { ...setup, objectives: setup.objectives.filter(Boolean) } }); writeDraft(null); go(`/lesson/${id}`); })}>{t.create}</button></div>
      </div>
    </div>
  );
}

// the mistakes, for the agent's note (no name): "Phép trừ có nhớ: 655 - 367 (viết 322, đúng là 288)"
function focusOf(w: Work, lang: 'vi' | 'en'): string {
  return w.types.slice(0, 4).map((t) => { const q = w.questions.find((x) => !x.ok && x.label.en === t.label.en); return q ? (lang === 'en' ? `${t.label.en}: ${q.q} (wrote ${q.child || '…'}, right ${q.right || '?'})` : `${t.label.vi}: ${q.q} (viết ${q.child || '…'}, đúng là ${q.right || '?'})`) : t.label[lang]; }).join('; ').slice(0, 260);
}

// Making a lesson, steps 1-2 of Chi's six (Tài liệu · Câu hỏi · Slide · Video · Bài tập · Giao bài).
//   1 Tài liệu: the source (a book in the knowledge area) and its part ("Tự tìm" lets the AI find it),
//     and the lesson material in one of four forms: a sentence (typed or said), a photo of the lesson,
//     a photo of the child's finished exercise (its kind and mistakes), or pasted text. The material
//     only points to the part; what is taught comes from the book, and the found pages are shown.
//   2 Câu hỏi: the setup the AI pre-filled, each question folded, only the open one shows.
// Steps 3-6 are the lesson page.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AreaRow, type Learner, type Match, type SectionRow, type Setup, type SkillMap, type Work } from '../api.ts';
import { SkillPicker } from './SkillMap.tsx';
import { useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';
import { WorkTable } from './WorkCard.tsx';
import { pagesOf } from './Sources.tsx';
import { BookArt, FindArt, firstGuide, HelpDot, PartArt, showGuide, TableArt, WorkArt, type GuideCard } from '../guide.tsx';

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
    save: 'Lưu nháp và thoát', short: (left: number, need: number) => `Bạn có ${left} lượt, một bài cần ${need}. Nhập mã để có thêm lượt, rồi soạn tiếp ngay tại đây.`, shortDemo: 'Đăng nhập bằng email để nhập mã khuyến mãi.', promoPh: 'Mã khuyến mãi', apply: 'Dùng mã', promoOk: (n: number) => `Đã cộng ${n} lượt. Cô soạn tiếp nhé.`, usage: 'Xem lượt dùng', restored: 'Đã mở lại bài đang soạn dở.', discard: 'Bỏ nháp', h1: 'Chọn nguồn và tài liệu tạo bài', lead: 'Bài chỉ soạn trong nguồn cô chọn.', src: 'Nguồn kiến thức', srcLead: 'Để “Tự tìm”, LessonBloom tìm đúng trang.', source: 'Nguồn', part: 'Phạm vi kiến thức', auto: 'Tự tìm theo tài liệu tạo bài', openKnowledge: 'Mở Kho kiến thức', by: 'Chọn theo', byPart: 'Phần và trang sách', bySkills: 'Bản đồ kỹ năng', skillsWord: 'Kỹ năng', fromSkills: (n: string) => `Bài tập trung vào kỹ năng bạn tick: ${n}. Thêm một câu hoặc ảnh nếu muốn nhấn mạnh điều gì.`,
    mat: 'Tài liệu tạo bài', matLead: 'Một câu, ảnh bài giảng hoặc ảnh bài tập đã làm.', kinds: { one: 'Một câu mô tả', photo: 'Chụp / tải ảnh', paste: 'Dán văn bản' },
    photoLead: 'Chụp trang sách, giáo án, hoặc bài đã làm và đã chấm (tối đa 5 ảnh). App tự nhận ra rồi hỏi lại một câu. Không chụp mặt hay tên.', whatIs: 'Đây là gì?', asBook: 'Trang sách hoặc giáo án để dạy', asWorkP: 'Bài con đã làm, đã chấm', asWork: 'Bài em đã làm, đã chấm', guessed: 'máy đoán', notWork: 'App không đọc được ảnh này như bài đã chấm (không thấy dấu đúng/sai rõ). Chụp lại thẳng, đủ sáng sau khi chấm, hoặc giữ là trang sách.', rereading: 'Đang đọc lại ảnh…',
    help: 'Ảnh trang sách hay bài đã làm?', helpPart: 'Tự tìm hay chọn phần?', pickFirst: 'Chọn bài này của con nào, để lưu vào hồ sơ và soạn bài riêng cho con.', noChild: 'Chưa gắn với con nào: bài sẽ soạn chung và bài làm không được lưu vào hồ sơ.', noPupil: 'Chưa gắn với em nào: bài sẽ soạn chung và bài làm không được lưu vào hồ sơ.',
    what: 'Bài này cần học gì?', whatPh: 'Ví dụ: Phép cộng có nhớ trong phạm vi 100, tập trung vào nhớ 1 sang hàng chục.', pastePh: 'Dán đoạn văn bản (giáo án, đề bài…) vào đây.', say: '● Nói', stop: '■ Dừng', hearing: 'Đang nghe…',
    lessonPhoto: 'Chụp trang sách hoặc giáo án (tối đa 5 ảnh). Không chụp mặt người, tên hay thông tin cá nhân.', workPhoto: 'Chụp bài con đã làm (tối đa 5 ảnh). AI nhận ra dạng bài và chỗ sai, rồi tạo bài luyện cùng dạng trong phạm vi đã chọn. Không chụp tên hay mặt.', pick: '+ Chọn ảnh', reading: 'AI đang đọc ảnh…',
    scopeQ: 'Soạn bài theo phạm vi nào?', scopeLead: 'App đã tick các trang khớp với tài liệu. Bỏ tick trang không cần, hoặc tick thêm.', scopeLeadAll: 'Mọi trang của phần này đã được tick. Bỏ tick trang không cần.', scopeAll: 'Chọn cả phần', scopeSome: (n: number, m: number) => `${n}/${m} trang · bài ngắn (tối đa 7 slide, 12 câu)`, scopeWhole: (m: number) => `Cả phần · ${m} trang (tối đa 10 slide, 20 câu)`, scopeNone: 'Tick ít nhất một trang.', pageOf: (p: string) => `tr. ${p}`,
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
    save: 'Save draft and leave', short: (left: number, need: number) => `You have ${left} credits; a lesson needs ${need}. Enter a code for more, then carry on right here.`, shortDemo: 'Sign in with your email to use a promo code.', promoPh: 'Promo code', apply: 'Apply', promoOk: (n: number) => `${n} credits added. Carry on.`, usage: 'See usage', restored: 'Your unfinished lesson was opened again.', discard: 'Discard draft', h1: 'Choose the source and the material', lead: 'The lesson is made only from the source you choose.', src: 'Source', srcLead: 'With “Find it for me”, LessonBloom finds the right pages.', source: 'Source', part: 'Part', auto: 'Find it from the material', openKnowledge: 'Open Knowledge', by: 'Choose by', byPart: 'Part and pages', bySkills: 'Skills map', skillsWord: 'Skills', fromSkills: (n: string) => `The lesson is about the skills you ticked: ${n}. Add a sentence or a photo to stress a point.`,
    mat: 'Lesson material', matLead: 'A sentence, a photo of the lesson or of a finished exercise.', kinds: { one: 'One sentence', photo: 'Take / add photos', paste: 'Paste text' },
    photoLead: 'A book page, a lesson plan, or work that was done and marked (up to 5 photos). The app tells which it is, then asks you once. No faces or names.', whatIs: 'What is this?', asBook: 'A book page or lesson plan to teach from', asWorkP: "Your child's marked work", asWork: "A pupil's marked work", guessed: 'the app\'s guess', notWork: 'This photo could not be read as marked work (no clear right/wrong marks). Take it again straight on, in good light, after marking, or keep it as a book page.', rereading: 'Reading the photos again…',
    help: 'A book page or marked work?', helpPart: 'Find it or choose a part?', pickFirst: 'Choose which child did this work, so it is kept in their profile and the lesson is made for them.', noChild: 'Not linked to a child: the lesson will be general and the work is not kept in a profile.', noPupil: 'Not linked to a pupil: the lesson will be general and the work is not kept in a profile.',
    what: 'What should this lesson teach?', whatPh: 'e.g. Unit 6: colours, the words red, blue and green.', pastePh: 'Paste text (a plan, an exercise…) here.', say: '● Speak', stop: '■ Stop', hearing: 'Listening…',
    lessonPhoto: 'Photograph the book page or your plan (up to 5 photos). No faces, names or personal details.', workPhoto: "Photograph the child's finished exercise (up to 5 photos). The AI finds its kind and the mistakes, then makes practice of the same kind in the chosen part. No names or faces.", pick: '+ Choose photos', reading: 'Reading the photos…',
    scopeQ: 'Which pages should the lesson cover?', scopeLead: 'The app ticked the pages that match your material. Untick the ones you do not want, or tick more.', scopeLeadAll: 'Every page of this part is ticked. Untick the ones you do not want.', scopeAll: 'Tick the whole part', scopeSome: (n: number, m: number) => `${n} of ${m} pages · a short lesson (up to 7 slides, 12 questions)`, scopeWhole: (m: number) => `The whole part · ${m === 1 ? '1 page' : `${m} pages`} (up to 10 slides, 20 questions)`, scopeNone: 'Tick at least one page.', pageOf: (p: string) => `p. ${p}`,
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
// photo: the one photo button before the photos are read; lesson / work: what the photos turned out to be (Chi #57)
type Kind = 'one' | 'photo' | 'lesson' | 'work' | 'paste';

// Step 1 is kept in this browser as she works (Chi #30): leaving to enter a code and coming back finds
// it, and a part already found is not looked for (and paid for) again. Gone once the lesson is made.
// Kept per account (live test, 1 Nov: a new account in the same browser was offered another's draft).
let owner = '';
export const setOwner = (id: string) => { owner = id; };
const DRAFT = () => `lbm-draft:${owner}`;
// The guides beside the buttons people mix up (Chi #58): the two photo buttons side by side, and finding a part.
export function guideCards(lang: string, parent: boolean): { photos: GuideCard[]; part: GuideCard[] } {
  const en = lang === 'en', kid = parent ? (en ? 'your child' : 'con') : (en ? 'the pupil' : 'em');
  return {
    photos: [
      { title: en ? 'One photo button, two kinds of photo' : 'Một nút ảnh, hai loại ảnh', body: en ? 'After the photos are added, the app tells which kind they are and asks "What is this?" with its guess chosen. Change it if it is wrong.' : 'Tải ảnh xong, app tự nhận ra là loại nào rồi hỏi "Đây là gì?" với đáp án máy đoán được chọn sẵn. Sai thì cô chọn lại.', cols: [
        { art: <BookArt />, title: en ? 'A book page' : 'Trang sách', body: en ? 'A page of the book or a lesson plan. The app teaches from what is on it: slides, a video and practice.' : 'Trang sách hoặc giáo án. App soạn bài từ nội dung trên trang: slide, video và bài tập.' },
        { art: <WorkArt />, title: en ? 'Marked work' : 'Bài đã làm, đã chấm', body: en ? `A sheet ${kid} already did and an adult marked. The app reads each question, finds the mistakes and makes a lesson just for ${kid}.` : `Bài ${kid} đã làm và người lớn đã chấm. App đọc từng câu, tìm chỗ ${kid} sai và soạn bài riêng cho ${kid}.` },
      ] },
      { title: en ? 'When it is marked work' : 'Khi là bài đã làm', art: <TableArt />,
        body: en ? `A table shows each question, what ${kid} wrote and the right answer. Correct it if the handwriting was misread, choose whose work it is, then find the part in your book.
The work is kept in ${kid}'s profile, never in Knowledge. No names or faces in the photo.`
          : `Bảng hiện từng câu, ${kid} viết gì và đáp án đúng. Sửa nếu máy đọc nhầm chữ viết tay, chọn bài của ${parent ? 'con' : 'em'} nào, rồi tìm phần trong sách.
Bài làm được lưu vào hồ sơ của ${kid}, không vào Kho kiến thức. Ảnh không cần tên hay mặt.` },
    ],
    part: [
      { title: en ? 'Find it, or choose a part' : 'Tự tìm, hay chọn một phần', cols: [
        { art: <FindArt />, title: en ? 'Find it from the material' : 'Tự tìm theo tài liệu', body: en ? 'Type a sentence or add a photo below; the app finds the right pages in your book.' : 'Gõ một câu hoặc thêm ảnh ở dưới; app tìm đúng trang trong sách của bạn.' },
        { art: <PartArt />, title: en ? 'Choose a part' : 'Chọn một phần', body: en ? 'The lesson is made from that whole part. The material below becomes optional: add it only to narrow or stress something.' : 'Bài được soạn từ cả phần đó. Tài liệu ở dưới thành tuỳ chọn: chỉ thêm khi muốn thu hẹp hoặc nhấn mạnh.' },
      ] },
    ],
  };
}

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
  // One photo button (Chi #57, option B, Son 1 Nov): the photos are read as marked work first; if they are not, as a book
  // page; then "What is this?" with the app's guess chosen. Choosing the other answer reads them again that way.
  const lastImgs = useRef<{ data: string; type: string }[]>([]), [guess, setGuess] = useState<'lesson' | 'work' | null>(null), [noWork, setNoWork] = useState(false);
  const asWork = async (imgs: { data: string; type: string }[]) => { const r = await api.work(imgs); setText(r.request); setWork(r.work); setFocus(focusOf(r.work, lang)); setKind('work'); if (!sectionId) bestFor(r.work, r.request); };
  const asBook = async (imgs: { data: string; type: string }[]) => { setText((await api.photos(imgs)).text.slice(0, 2000)); setWork(null); setFocus(''); setKind('lesson'); };
  const photos = (fs: File[]) => run('photo', async () => {
    const imgs = await Promise.all(fs.slice(0, 5).map((f) => shrink(f)));
    lastImgs.current = imgs; setNoWork(false); setGuess(null);
    try { await asWork(imgs); setGuess('work'); }
    catch (e) { if (!(e instanceof ApiError && e.code === 'workUnread')) throw e; setNoWork(true); await asBook(imgs); setGuess('lesson'); }
  });
  const answer = (k: 'lesson' | 'work') => { if (k === kind) return; if (k === 'work' && noWork) { setErr(t.notWork); return; } void run('photo', () => (k === 'work' ? asWork(lastImgs.current) : asBook(lastImgs.current))); };
  const guides = guideCards(lang, parent);
  const isPhoto = kind === 'photo' || kind === 'lesson' || kind === 'work';
  // another kind of material drops what the photos gave (Chi #63c: "Mistakes seen" of a photo stayed under One sentence)
  const pickKind = (k: Kind) => { if (k === 'photo' && isPhoto) return; setKind(k); setGuess(null); if (k !== 'photo') { setWork(null); setFocus(''); setNoWork(false); lastImgs.current = []; } if (k === 'photo') void firstGuide('photos', guides.photos); };
  const find = () => run('find', async () => {
    setMissing(false);
    try { setMatch((await api.match(areaId, text)).match); } catch (e) { if (e instanceof ApiError && e.code === 'noMatch') setMissing(true); else throw e; }
  });
  const chosen = sections.find((s) => s.id === sectionId), a = areas?.find((x) => x.id === areaId);
  // pages as printed in the book when known, as Knowledge shows them (Chi #53: "tr. 1–5" here, "Trang 10–14" there)
  // The scope, always asked (Son, 2 Nov): the part's pages, the ones her material matched ticked, she unticks what she does
  // not want. All ticked = the whole part; fewer = a short lesson on those pages only, her material its focus (Chi #60).
  const partId = chosen?.id || match?.sectionId || '';
  // or by the skills map (beta, Son 2 Nov): the skills she ticks give the part and the pages, and their names the focus
  const [by, setBy] = useState<'part' | 'skills'>(q.get('skills') ? 'skills' : 'part'), [smap, setSmap] = useState<SkillMap | null>(null), [picked, setPicked] = useState<string[]>(q.get('skills')?.split(',').filter(Boolean) ?? []);
  useEffect(() => { setSmap(null); if (areaId) api.skillMap(areaId).then(setSmap).catch(() => {}); }, [areaId]);
  const pickedNodes = (smap?.nodes ?? []).filter((n) => picked.includes(n.id) && n.part === partId), skillPages = [...new Set(pickedNodes.flatMap((n) => n.pages))].sort((x, y) => x - y);
  const skillReq = pickedNodes.length ? `${t.skillsWord}: ${pickedNodes.map((n) => n.name).join('; ')}` : '';
  const pick = (ids: string[]) => { setPicked(ids); const n = smap?.nodes.find((x) => x.id === ids[0]); if (n && n.part !== sectionId) { setSectionId(n.part); setMatch(null); } setSetup(null); };
  const [partPages, setPartPages] = useState<{ page: number; label: string; head: string }[]>([]), [ticked, setTicked] = useState<number[]>([]);
  useEffect(() => {
    if (!partId) { setPartPages([]); setTicked([]); return; }
    let alive = true;
    api.sectionSource(partId).then((src) => {
      if (!alive) return;
      const ps = src.pages.map((p) => ({ page: p.page, label: String(p.printed ?? src.printed?.[p.page] ?? p.page), head: p.text.split('\n').map((x) => x.trim()).find((x) => x.length > 3)?.slice(0, 70) ?? '' }));
      const n = match && !chosen ? match.narrow : null;
      setPartPages(ps); setTicked(ps.map((p) => p.page).filter((p) => (skillPages.length ? skillPages.includes(p) : !n || (p >= n.pageFrom && p <= n.pageTo))));
    }).catch(() => { setPartPages([]); setTicked([]); });
    return () => { alive = false; };
  }, [partId, match, skillPages.join(',')]);
  const tick = (p: number, on: boolean) => { setTicked((xs) => (on ? [...new Set([...xs, p])].sort((x, y) => x - y) : xs.filter((x) => x !== p))); setSetup(null); };
  const pagesFor = ticked.length && ticked.length < partPages.length ? ticked : undefined;
  const shownPages = (ps: number[]) => { const ls = partPages.filter((p) => ps.includes(p.page)).map((p) => p.label); return ls.length > 2 ? `${ls[0]}–${ls[ls.length - 1]}` : ls.join(', '); };
  const scopeText = !partId ? '' : `${chosen ? a?.name : match?.book} · ${t.page} ${pagesFor ? shownPages(pagesFor) : chosen ? pagesOf(chosen.page_from, chosen.page_to, chosen.printed_from, chosen.printed_to) : pagesOf(match!.pageFrom, match!.pageTo, match!.printedFrom, match!.printedTo)}`;
  const toStep2 = () => run('intake', async () => {
    // the work is saved to the child's profile first (Chi #46), as she corrected it; the lesson carries a copy
    let w = kind === 'work' ? work : null;
    if (w && pupilId) w = { ...(w.recordId && w.pupilId === pupilId ? (await api.updateWork(w.recordId, w)).record : (await api.saveWork(pupilId, w)).record) };
    if (w) setWork(w);
    const s0 = (await api.intake(areaId, chosen?.id || match!.sectionId, pagesFor)).setup, s = { ...s0, note: focus ? `${lang === 'en' ? 'Aim at these mistakes' : 'Tập trung vào lỗi'}: ${focus}` : s0.note, ...(w ? { work: w } : {}) };
    // a parent has no Questions step: the lesson is made straight from the setup the book gave
    if (parent) { const { id } = await api.create({ areaId, sectionId: chosen?.id || match!.sectionId, request: text || skillReq || chosen?.title || '', setup: s, pages: pagesFor }); writeDraft(null); go(`/lesson/${id}`); return; }
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
            <label className="field">{t.source}<select value={areaId} disabled={!areas.length} onChange={(e) => { setAreaId(e.target.value); setSectionId(''); setPicked([]); }}>{areas.length ? areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>) : <option value="">{t.noSource}</option>}</select></label>
            {by === 'part' && <label className="field"><span className="row" style={{ gap: 6 }}>{t.part}<HelpDot label={t.helpPart} onClick={() => void showGuide('part', guides.part)} /></span><select value={sectionId} disabled={!areaId} onChange={(e) => { setSectionId(e.target.value); setMatch(null); setPicked([]); }}><option value="">{t.auto}</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.title} · {t.page} {pagesOf(s.page_from, s.page_to, s.printed_from, s.printed_to)}</option>)}</select></label>}
          </div>
          {areaId && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label={t.by}><span className="small muted">{t.by}:</span>
            <button role="tab" aria-selected={by === 'part'} className={`pill ${by === 'part' ? 'on' : ''}`} onClick={() => setBy('part')}>{t.byPart}</button>
            <button role="tab" aria-selected={by === 'skills'} className={`pill ${by === 'skills' ? 'on' : ''}`} onClick={() => setBy('skills')}>{t.bySkills} <span className="tag ai">Beta</span></button></div>}
          {by === 'skills' && smap && <SkillPicker map={smap} picked={picked} onPick={pick} />}
          {areas.length > 0 && <button className="link small" style={{ alignSelf: 'start' }} onClick={() => go('/knowledge')}>{t.openKnowledge}</button>}
        </div>
        {!matOpen && chosen && <div className="card stack">
          <b><span className="num">2</span> {t.mat}</b>
          <span className="small muted"><b>{t.matOpt}</b> · {pickedNodes.length ? t.fromSkills(pickedNodes.map((n) => n.name).join('; ')) : t.fromPart(chosen.title)}</span>
          <button className="btn small" style={{ alignSelf: 'start' }} onClick={() => setMoreMat(true)}>{t.addMat}</button>
        </div>}
        {matOpen && <div className="card stack">
          <b><span className={`num ${chosen ? '' : 'cur'}`}>2</span> {t.mat}{chosen && <> <span className="tag">{t.matOpt}</span></>}</b><span className="small muted">{t.matLead}</span>
          <div className="row">{(Object.keys(t.kinds) as Kind[]).map((k) => <span key={k} className="row" style={{ gap: 4 }}><button className={`btn small ${(k === 'photo' ? isPhoto : kind === k) ? 'primary' : ''}`} onClick={() => pickKind(k)}>{t.kinds[k as keyof typeof t.kinds]}</button>
            {k === 'photo' && <HelpDot label={t.help} onClick={() => void showGuide('photos', guides.photos)} />}</span>)}</div>
          {isPhoto && <><p className="small muted">{t.photoLead}</p>
            <label className="btn" style={{ alignSelf: 'start' }}>{busy === 'photo' ? t.reading : t.pick}<input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) void photos(fs); }} /></label>
            {guess && <div className="card stack" style={{ gap: 6 }} role="group" aria-label={t.whatIs}><b className="small">{t.whatIs}</b>
              {(['lesson', 'work'] as const).map((k) => <label key={k} className="check small"><input type="radio" name="what-photo" checked={kind === k} disabled={!!busy} onChange={() => answer(k)} /> {k === 'lesson' ? t.asBook : parent ? t.asWorkP : t.asWork}{guess === k && <span className="tag">{t.guessed}</span>}</label>)}
              {busy === 'photo' && <span className="small muted">{t.rereading}</span>}</div>}
            {/* whose work, right under the answer (Chi #57): one child is chosen already; otherwise a warning */}
            {kind === 'work' && <label className="field">{parent ? t.whoseP : t.whose}<select value={pupilId} onChange={(e) => setPupilId(e.target.value)}><option value="">{t.noOne}</option>{learners.map((x) => <option key={x.id} value={x.id}>{parent ? x.name : `${x.name} · ${x.class_name}`}</option>)}</select><span className="small muted">{parent ? t.whoseLeadP : t.whoseLead}</span></label>}
            {kind === 'work' && !pupilId && learners.length > 0 && <p className="banner warn small">{parent && learners.length > 1 ? t.pickFirst : parent ? t.noChild : t.noPupil}</p>}</>}
          <label className="field">{t.what}<textarea rows={kind === 'paste' ? 7 : 3} maxLength={kind === 'paste' ? 6000 : 2000} value={text} placeholder={kind === 'paste' ? t.pastePh : t.whatPh} onChange={(e) => { setText(e.target.value); setMatch(null); setMissing(false); }} /></label>
          {kind === 'one' && (rec ? <button className="btn coral small" style={{ alignSelf: 'start' }} onClick={() => { rec.stop(); setRec(null); }}>{t.stop}</button>
            : <button className="btn small" style={{ alignSelf: 'start' }} disabled={!!busy} onClick={() => void record().catch((e) => setErr(String(e.message || e)))}>{busy === 'voice' ? t.hearing : t.say}</button>)}
          {kind === 'work' && work && <>{work.recordId && <span className="small muted">{t.fromRec(`${work.date.slice(8, 10)}/${work.date.slice(5, 7)}`)}</span>}
            <WorkTable work={{ ...work, child: learners.find((x) => x.id === pupilId)?.name }} parent={parent} busy={!!busy} onChange={(nw) => { setWork(nw); setFocus(focusOf(nw, lang)); }} /></>}
          {focus && !(kind === 'work' && work) && <p className="banner warn small"><b>{t.mistakes}:</b> {focus}</p>}
          {!chosen && <div className="row"><span className="grow" /><button className="btn" disabled={!!busy || short || !areaId || text.trim().length < 3} onClick={find}>{busy === 'find' ? t.finding : t.find}</button></div>}
        </div>}
        {match && !chosen && <div className="banner"><b>✓ {t.found(scopeText)}</b><details className="small"><summary>{match.title} · {t.quotes}</summary>{match.cited.map((c) => <blockquote key={c.id}>“{c.quote}” <span className="muted">· {t.page} {c.page}</span></blockquote>)}</details></div>}
        {/* how much the lesson covers, for every kind of material (Chi #60): only what she gave, chosen first */}
        {partId && partPages.length > 0 && (match || chosen) && <div className="card stack" style={{ gap: 6 }} role="group" aria-label={t.scopeQ}>
          <div className="row"><b className="small grow">{t.scopeQ}</b>{ticked.length < partPages.length && <button className="link small" onClick={() => { setTicked(partPages.map((p) => p.page)); setSetup(null); }}>{t.scopeAll}</button>}</div>
          <span className="small muted">{match?.narrow && !chosen ? t.scopeLead : t.scopeLeadAll}</span>
          {partPages.map((p) => <label key={p.page} className="check small"><input type="checkbox" checked={ticked.includes(p.page)} disabled={!!busy} onChange={(e) => tick(p.page, e.target.checked)} /> <span><b>{t.pageOf(p.label)}</b>{p.head && <span className="muted"> · {p.head}</span>}</span></label>)}
          <span className="small">{!ticked.length ? <b className="danger">{t.scopeNone}</b> : pagesFor ? t.scopeSome(ticked.length, partPages.length) : t.scopeWhole(partPages.length)}</span></div>}
        {chosen && <div className="banner">✓ {t.found(`${chosen.title} · ${scopeText}`)}</div>}
        {/* a part chosen by hand answers it (live test, 1 Nov: the warning stayed under "Found") */}
        {missing && !sectionId && <div className="banner warn">{t.notFound}</div>}
        {err && <p className="note">{err}</p>}
        <div className="row"><span className="small muted grow">{scopeText && t.scope(scopeText)}</span>
          <button className="btn primary" disabled={!!busy || short || !(chosen || match) || (partPages.length > 0 && !ticked.length)} onClick={toStep2}>{busy === 'intake' ? t.thinking : chosen ? t.nextPart : t.next}</button></div>
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
          <button className="btn primary" disabled={!!busy || short || !setup.title.trim()} onClick={() => run('make', async () => { const { id } = await api.create({ areaId, sectionId: chosen?.id || match!.sectionId, request: text || skillReq || chosen?.title || '', setup: { ...setup, objectives: setup.objectives.filter(Boolean) }, pages: pagesFor }); writeDraft(null); go(`/lesson/${id}`); })}>{t.create}</button></div>
      </div>
    </div>
  );
}

// the mistakes, for the agent's note (no name): "Phép trừ có nhớ: 655 - 367 (viết 322, đúng là 288)"
function focusOf(w: Work, lang: 'vi' | 'en'): string {
  return w.types.slice(0, 4).map((t) => { const q = w.questions.find((x) => !x.ok && x.label.en === t.label.en); return q ? (lang === 'en' ? `${t.label.en}: ${q.q} (wrote ${q.child || '…'}, right ${q.right || '?'})` : `${t.label.vi}: ${q.q} (viết ${q.child || '…'}, đúng là ${q.right || '?'})`) : t.label[lang]; }).join('; ').slice(0, 260);
}

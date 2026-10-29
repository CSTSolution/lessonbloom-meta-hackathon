// The browser talks only to our API (cookie session). Errors carry both languages.
export interface Teacher { id: string; kind: 'demo' | 'account'; name: string; email: string | null; lang: 'vi' | 'en'; role: 'teacher' | 'parent' | null; subject: string }
// 1 credit = US$0.01 of Meta's price: 100 when she joins, promo codes add more; subscribers also get a
// daily allowance (Vietnam days), used first.
export interface Credits { balance: number; subscriber: boolean; planUntil: string | null; daily: { perDay: number; used: number; left: number } | null; left: number }
export type Level = 'basic' | 'good' | 'advanced';
export interface Setup { subject: 'math' | 'english'; grade: number; title: string; objectives: string[]; minutes: number; lang: 'vi' | 'en'; note?: string; level?: 'mixed' | 'basic' | 'advanced'; make?: { video: boolean; cards: boolean } }
export interface Skill { tag: string; name: string; kind: string }
export interface Slide { id: string; kind: string; heading: string; bullets: string[]; example?: string; notes: string; source: string; narration: string; image?: string; page?: number }
export interface Item { id: string; subject: 'math' | 'english'; template: string; skill: string; level: Level; prompt: string; explain: string; answer: string; options?: string[]; pairs?: { word: string; emoji: string }[]; sentence?: string; say?: string; words?: string[]; story?: string; unit?: string; page?: number; redone?: string[]; a?: number; b?: number; op?: string; shown?: number; blank?: string; distractors?: number[] }
export interface Card { id: string; front: string; back: string; emoji?: string }
export interface Step { at: string; vi: string; en: string }
export interface Lesson { queue?: { place: number } | null; id: string; status: 'working' | 'ready' | 'error'; pictures_pending: boolean; refs: { bookId: string; vi: string; en: string; pageFrom: number }[]; setup: Setup; source: string; skills: Skill[]; slides: Slide[]; items: Item[]; cards: Card[]; steps: Step[]; agent: { note: string; changes: string[]; turns: number; finished: boolean } | null; rejected: { issues: string[]; codes?: string[] }[]; created_at: string; credits?: number; video?: { url: string; seconds: number; chapters: { heading: string; start: number }[]; subtitles: boolean } | null; video_status?: string }
export interface LessonRow { id: string; status: Lesson['status']; setup: Setup; created_at: string; slides: number; items: number; cards: number; video: boolean; example: string | null; classes: { id: string; name: string }[]; open: boolean; given: boolean }
export interface BookRow { id: string; title: string; status: 'processing' | 'ready' | 'error'; pages: number; error: string | null; sections?: number; source?: 'pdf' | 'text' | 'scan' }
export interface AreaRow { id: string; name: string; subject: 'math' | 'english'; grade: number; books: BookRow[] }
export interface SectionRow { id: string; book_id: string; title: string; page_from: number; page_to: number; lessons?: number }
export interface Match { sectionId: string; title: string; book: string; bookId: string; pageFrom: number; pageTo: number; cited: { id: string; page: number; quote: string }[]; citation: string; preview: string }
export interface ClassRow { id: string; name: string; code: string; kind?: 'class' | 'child'; grade?: number | null; pupils: number; joined: number; assignments: number }
export interface PupilRow { id: string; name: string; link: string; url: string; joined_at: string | null; seen_at: string | null }
export interface AssignedRow { id: string; lesson_id: string; title: string; due: string | null; created_at: string; items: number; done: number; started: number }
export interface ClassView { class: { id: string; name: string; code: string; url: string }; pupils: PupilRow[]; assignments: AssignedRow[] }
export interface LessonAssignment { id: string; class_id: string; class_name: string; due: string | null; created_at: string; done: number; pupils: number }
export type Label = 'solid' | 'practising' | 'repeat';
export interface PathStep { sectionId: string; title: string; pages: string; weeks: number; start: string; end: string; status: 'done' | 'current' | 'next' | 'later'; topic: string }
export interface Reminder { date: string; who: 'pupils' | 'assigner'; kind: string; vi: string; en: string }
export interface PathView { path: { id: string; start: string }; steps: PathStep[]; progress: { sectionId: string; done: number; pupils: number } | null; lessons: { id: string; title: string; section: string }[]; reminders: Reminder[] }
export interface Criteria { recent: number; min: number; solid: number; repeat: number; same: number; sessions: number; classRepeat: number; classSolid: number; practice: boolean; time: boolean; next: boolean }
export interface SummaryClass { id: string; name: string; kind: string; skills: { skill: string; name: string; label: Label; counts: Record<Label, number> }[]; pupils: { id: string; name: string; skills: Record<string, Label> }[]; mistakes: { skill: string; what: string; pupils: number }[] }
export interface Summary { criteria: Criteria; classes: SummaryClass[]; total: Record<Label, number>; learners: number }
export interface Advice { kind: 'practice' | 'next' | 'time'; skill: string; text: string; why: string; applied: string | null; kept: boolean }
export interface LearnerView { wording?: boolean; pupil: { id: string; name: string; classId: string; className: string; kind: string }; skills: { skill: string; name: string; label: Label; right: number; of: number; mistake: string | null }[]; sessions: { day: string; answers: number; minutes: number }[];
  current: (PathStep & { week: number; daysLeft: number; itemsLeft: number; slidesSeen: boolean; videoSeen: boolean }) | null; advice: Advice[]; reminders: Reminder[]; mates: { id: string; name: string }[] }
export interface ReminderSettings { pupilSession: boolean; pupilCards: boolean; time: string; assignerTwoDays: boolean; assignerEnd: boolean; assignerStart: boolean }
export class ApiError extends Error { constructor(public code: string, public vi: string, public en: string, public status: number, public body: Record<string, unknown> = {}) { super(en); } }

async function call<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const r = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {}, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.code || 'server', j.error || 'Lỗi máy chủ', j.errorEn || 'Server error', r.status, j);
  return j as T;
}

// A file upload that reports how much has been sent (fetch cannot), with the same errors as call()
export const MAX_PDF = 30e6;
function upload<T>(path: string, file: Blob, onProgress?: (share: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api${path}`);
    x.setRequestHeader('content-type', file.type || 'application/pdf');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      let j: Record<string, string> = {};
      try { j = JSON.parse(x.responseText); } catch { /* not JSON */ }
      if (x.status >= 200 && x.status < 300) resolve(j as T);
      else reject(new ApiError(j.code || 'server', j.error || 'Lỗi máy chủ', j.errorEn || 'Server error', x.status));
    };
    x.onerror = () => reject(new ApiError('network', 'Mất kết nối khi tải lên. Cô thử lại nhé.', 'The connection dropped while uploading. Please try again.', 0));
    x.send(file);
  });
}

export interface ScanEstimate { pages: number; perPage: number; predicted: number; need: number; have: number; enough: boolean; fits: number; maxPages: number }
export interface Job { id: string; kind: 'lesson' | 'book'; ref: string; title: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'; progress: string; place: number }

export const api = {
  demo: (lang: string) => call<{ teacher: Teacher }>('POST', '/auth/demo', { lang }),
  sendCode: (email: string, lang: string) => call<{ sent: boolean }>('POST', '/auth/code', { email, lang }),
  verify: (email: string, code: string) => call<{ teacher: Teacher }>('POST', '/auth/verify', { email, code }),
  me: () => call<{ teacher: Teacher; budget: string | null; credits: Credits }>('GET', '/t/me'),
  update: (f: { name?: string; lang?: string; role?: string; subject?: string }) => call<{ teacher: Teacher }>('PUT', '/t/me', f),
  classes: () => call<{ classes: ClassRow[] }>('GET', '/t/classes'),
  createClass: (name: string) => call<{ class: ClassRow }>('POST', '/t/classes', { name }),
  createChild: (name: string, grade: number) => call<{ class: ClassRow }>('POST', '/t/classes', { name, grade }),
  renameClass: (id: string, name: string) => call<{ ok: boolean }>('PUT', `/t/classes/${id}`, { name }),
  deleteClass: (id: string) => call<{ ok: boolean }>('DELETE', `/t/classes/${id}`),
  classView: (id: string) => call<ClassView>('GET', `/t/classes/${id}`),
  addPupils: (id: string, names: string) => call<{ added: number }>('POST', `/t/classes/${id}/pupils`, { names }),
  removePupil: (id: string, pid: string) => call<{ ok: boolean }>('DELETE', `/t/classes/${id}/pupils/${pid}`),
  assign: (lessonId: string, a: { classId: string; confirmed: boolean; due?: string; retry: boolean; hints: boolean }) => call<{ assignment: { id: string; className: string } }>('POST', `/t/lessons/${lessonId}/assign`, a),
  lessonAssignments: (lessonId: string) => call<{ assignments: LessonAssignment[] }>('GET', `/t/lessons/${lessonId}/assignments`),
  setRole: (r: { role: 'teacher' | 'parent'; name: string; subject?: string; classes?: string[]; children?: { name: string; grade: number }[] }) => call<{ teacher: Teacher }>('POST', '/t/role', r),
  work: (images: { data: string; type: string }[]) => call<{ request: string; focus: string }>('POST', '/t/notes/work', { images }),
  renameSection: (id: string, title: string) => call<{ ok: boolean }>('PUT', `/t/sections/${id}`, { title }),
  splitSection: (id: string, page: number, title: string) => call<{ id: string }>('POST', `/t/sections/${id}/split`, { page, title }),
  mergeSection: (id: string) => call<{ ok: boolean }>('POST', `/t/sections/${id}/merge`),
  rewriteSlide: (id: string, sid: string, how: 'rewrite' | 'simpler') => call<{ slide: Slide }>('POST', `/t/lessons/${id}/slides/${sid}/rewrite`, { how }),
  addSlide: (id: string, after: string, topic: string) => call<{ slide: Slide; slides: Slide[] }>('POST', `/t/lessons/${id}/slides`, { after, topic }),
  editItem: (id: string, itemId: string, f: Record<string, unknown>) => call<{ item: Item }>('PUT', `/t/lessons/${id}/items/${itemId}`, f),
  similarItem: (id: string, itemId: string) => call<{ items: Item[]; added: Item[] }>('POST', `/t/lessons/${id}/items/${itemId}/similar`),
  addItems: (id: string, f: { skill: string; template: string; level: string }) => call<{ items: Item[]; added: Item[] }>('POST', `/t/lessons/${id}/items`, f),
  makeVideo: (id: string, o: { subtitles: boolean; voice: number; speed: number }) => call<{ ok: boolean }>('POST', `/t/lessons/${id}/video`, o),
  deleteItem: (lessonId: string, itemId: string) => call<{ ok: boolean }>('DELETE', `/t/lessons/${lessonId}/items/${itemId}`),
  deleteArea: (id: string) => call<{ ok: boolean }>('DELETE', `/t/areas/${id}`),
  deleteBook: (id: string) => call<{ ok: boolean }>('DELETE', `/t/books/${id}`),
  path: (classId: string, areaId: string) => call<PathView>('GET', `/t/path?classId=${classId}&areaId=${areaId}`),
  savePath: (id: string, p: { start?: string; steps: { sectionId: string; weeks: number }[] }) => call<{ ok: boolean }>('PUT', `/t/path/${id}`, p),
  summary: (q: { classId?: string; lessonId?: string } = {}) => call<Summary>('GET', `/t/summary?${new URLSearchParams(q as Record<string, string>)}`),
  comments: (classId: string) => call<{ comments: { pupilId: string; name: string; text: string }[] }>('POST', '/t/summary/comments', { classId }),
  criteria: () => call<{ criteria: Criteria }>('GET', '/t/criteria'),
  previewCriteria: (c: Criteria) => call<{ class: string | null; skill?: string; pupils?: { name: string; right: number; of: number; mistake: string | null; label: Label }[]; classLabel?: Label; share?: { repeat: number; of: number } }>('POST', '/t/criteria/preview', c),
  saveCriteria: (c: Criteria) => call<{ criteria: Criteria }>('PUT', '/t/criteria', c),
  reminders: () => call<{ reminders: ReminderSettings }>('GET', '/t/reminders'),
  saveReminders: (r: ReminderSettings) => call<{ reminders: ReminderSettings }>('PUT', '/t/reminders', r),
  notifications: () => call<{ today: string; notifications: (Reminder & { className: string; classId: string })[] }>('GET', '/t/notifications'),
  learner: (id: string, lang?: 'vi' | 'en') => call<LearnerView>('GET', `/t/pupils/${id}${lang ? `?lang=${lang}` : ''}`),
  advice: (id: string, a: { kind?: string; skill?: string; action: 'apply' | 'keep' | 'undo'; adviceId?: string }) => call<{ ok: boolean; adviceId?: string; added?: number }>('POST', `/t/pupils/${id}/advice`, a),
  promo: (code: string) => call<{ added: { credits: number; days: number }; credits: Credits }>('POST', '/t/promo', { code }),
  logout: () => call<{ ok: boolean }>('POST', '/t/logout'),
  photos: (images: { data: string; type: string }[]) => call<{ text: string }>('POST', '/t/notes/photos', { images }),
  voice: (audio: Blob) => call<{ text: string }>('POST', '/t/notes/voice', undefined, audio),
  areas: () => call<{ areas: AreaRow[] }>('GET', '/t/areas'),
  createArea: (a: { name: string; subject: string; grade: number }) => call<{ area: AreaRow }>('POST', '/t/areas', a),
  sampleArea: (book: 'toan2' | 'english3' | 'maths2') => call<{ area: { id: string } }>('POST', '/t/areas/sample', { book }),
  area: (id: string) => call<{ area: AreaRow; books: BookRow[]; sections: SectionRow[] }>('GET', `/t/areas/${id}`),
  bookText: (areaId: string, title: string, pages: { page: number; text: string }[]) => call<{ book: { id: string } }>('POST', `/t/areas/${areaId}/books/text`, { title, pages }),
  scanEstimate: (pages: number) => call<{ estimate: ScanEstimate }>('POST', '/t/scan/estimate', { pages }),
  scanCreate: (areaId: string, title: string, pages: number[]) => call<{ book: { id: string }; estimate: ScanEstimate }>('POST', `/t/areas/${areaId}/books/scan`, { title, pages }),
  scanPage: (bookId: string, n: number, jpeg: Blob) => call<{ ok: boolean }>('PUT', `/t/books/${bookId}/pages/${n}`, undefined, jpeg),
  scanStart: (bookId: string) => call<{ ok: boolean; estimate: ScanEstimate }>('POST', `/t/books/${bookId}/scan/start`),
  jobs: () => call<{ jobs: Job[] }>('GET', '/t/jobs'),
  cancelJob: (id: string) => call<{ ok: boolean; result: string }>('POST', `/t/jobs/${id}/cancel`),
  uploadBook: (areaId: string, file: File, title: string, onProgress?: (share: number) => void) => upload<{ book: BookRow }>(`/t/areas/${areaId}/books?title=${encodeURIComponent(title)}`, file, onProgress),
  match: (areaId: string, request: string) => call<{ match: Match }>('POST', `/t/areas/${areaId}/match`, { request }),
  intake: (areaId: string, sectionId: string) => call<{ setup: Setup; citation: string }>('POST', '/t/intake', { areaId, sectionId }),
  create: (b: { areaId: string; sectionId: string; request: string; setup: Setup }) => call<{ id: string }>('POST', '/t/lessons', b).then((r) => { window.dispatchEvent(new Event('lbm-jobs')); return r; }),
  lessons: () => call<{ lessons: LessonRow[] }>('GET', '/t/lessons'),
  newPicture: (id: string, sid: string) => call<{ slide: Slide }>('POST', `/t/lessons/${id}/slides/${sid}/picture`),
  cutout: (id: string, sid: string, photo: string, name: string) => call<{ slide: Slide; matches: number }>('POST', `/t/lessons/${id}/slides/${sid}/cutout`, { photo, name }),
  lesson: (id: string) => call<{ lesson: Lesson }>('GET', `/t/lessons/${encodeURIComponent(id)}`),
};

// The browser talks only to our API (cookie session). Errors carry both languages.
export interface Teacher { id: string; kind: 'demo' | 'account'; name: string; email: string | null; lang: 'vi' | 'en' }
// 1 credit = US$0.01 of Meta's price; each assigner has a daily allowance (Vietnam days).
export interface Credits { perDay: number; used: number; left: number }
export type Level = 'basic' | 'good' | 'advanced';
export interface Setup { subject: 'math' | 'english'; grade: number; title: string; objectives: string[]; minutes: number; lang: 'vi' | 'en'; note?: string }
export interface Skill { tag: string; name: string; kind: string }
export interface Slide { id: string; kind: string; heading: string; bullets: string[]; example?: string; notes: string; source: string; narration: string; image?: string; page?: number }
export interface Item { id: string; subject: 'math' | 'english'; template: string; skill: string; level: Level; prompt: string; explain: string; answer: string; options?: string[]; pairs?: { word: string; emoji: string }[]; sentence?: string; say?: string; words?: string[]; story?: string; unit?: string }
export interface Card { id: string; front: string; back: string; emoji?: string }
export interface Step { at: string; vi: string; en: string }
export interface Lesson { id: string; status: 'working' | 'ready' | 'error'; pictures_pending: boolean; refs: { bookId: string; vi: string; en: string; pageFrom: number }[]; setup: Setup; source: string; skills: Skill[]; slides: Slide[]; items: Item[]; cards: Card[]; steps: Step[]; agent: { note: string; changes: string[]; turns: number; finished: boolean } | null; rejected: { issues: string[] }[]; created_at: string; credits?: number }
export interface LessonRow { id: string; status: Lesson['status']; setup: Setup; created_at: string; slides: number; items: number }
export interface BookRow { id: string; title: string; status: 'processing' | 'ready' | 'error'; pages: number; error: string | null; sections?: number }
export interface AreaRow { id: string; name: string; subject: 'math' | 'english'; grade: number; books: BookRow[] }
export interface SectionRow { id: string; book_id: string; title: string; page_from: number; page_to: number }
export interface Match { sectionId: string; title: string; book: string; bookId: string; pageFrom: number; pageTo: number; cited: { id: string; page: number; quote: string }[]; citation: string; preview: string }
export class ApiError extends Error { constructor(public code: string, public vi: string, public en: string, public status: number) { super(en); } }

async function call<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const r = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {}, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.code || 'server', j.error || 'Lỗi máy chủ', j.errorEn || 'Server error', r.status);
  return j as T;
}

export const api = {
  demo: (lang: string) => call<{ teacher: Teacher }>('POST', '/auth/demo', { lang }),
  sendCode: (email: string, lang: string) => call<{ sent: boolean }>('POST', '/auth/code', { email, lang }),
  verify: (email: string, code: string) => call<{ teacher: Teacher }>('POST', '/auth/verify', { email, code }),
  me: () => call<{ teacher: Teacher; budget: string | null; credits: Credits }>('GET', '/t/me'),
  update: (f: { name?: string; lang?: string }) => call<{ teacher: Teacher }>('PUT', '/t/me', f),
  logout: () => call<{ ok: boolean }>('POST', '/t/logout'),
  photos: (images: { data: string; type: string }[]) => call<{ text: string }>('POST', '/t/notes/photos', { images }),
  voice: (audio: Blob) => call<{ text: string }>('POST', '/t/notes/voice', undefined, audio),
  areas: () => call<{ areas: AreaRow[] }>('GET', '/t/areas'),
  createArea: (a: { name: string; subject: string; grade: number }) => call<{ area: AreaRow }>('POST', '/t/areas', a),
  sampleArea: (book: 'toan2' | 'english3') => call<{ area: { id: string } }>('POST', '/t/areas/sample', { book }),
  area: (id: string) => call<{ area: AreaRow; books: BookRow[]; sections: SectionRow[] }>('GET', `/t/areas/${id}`),
  uploadBook: (areaId: string, file: File, title: string) => call<{ book: BookRow }>('POST', `/t/areas/${areaId}/books?title=${encodeURIComponent(title)}`, undefined, file),
  match: (areaId: string, request: string) => call<{ match: Match }>('POST', `/t/areas/${areaId}/match`, { request }),
  intake: (areaId: string, sectionId: string) => call<{ setup: Setup; citation: string }>('POST', '/t/intake', { areaId, sectionId }),
  create: (b: { areaId: string; sectionId: string; request: string; setup: Setup }) => call<{ id: string }>('POST', '/t/lessons', b),
  lessons: () => call<{ lessons: LessonRow[] }>('GET', '/t/lessons'),
  newPicture: (id: string, sid: string) => call<{ slide: Slide }>('POST', `/t/lessons/${id}/slides/${sid}/picture`),
  cutout: (id: string, sid: string, photo: string, name: string) => call<{ slide: Slide; matches: number }>('POST', `/t/lessons/${id}/slides/${sid}/cutout`, { photo, name }),
  lesson: (id: string) => call<{ lesson: Lesson }>('GET', `/t/lessons/${encodeURIComponent(id)}`),
};

// The browser talks only to our API (cookie session). Errors carry both languages.
export interface Teacher { id: string; kind: 'demo' | 'account'; name: string; email: string | null; lang: 'vi' | 'en' }
export type Level = 'basic' | 'good' | 'advanced';
export interface Setup { subject: 'math' | 'english'; grade: number; title: string; objectives: string[]; minutes: number; lang: 'vi' | 'en'; note?: string }
export interface Skill { tag: string; name: string; kind: string }
export interface Slide { id: string; kind: string; heading: string; bullets: string[]; example?: string; notes: string; source: string; narration: string; image?: string }
export interface Item { id: string; subject: 'math' | 'english'; template: string; skill: string; level: Level; prompt: string; explain: string; answer: string; options?: string[]; pairs?: { word: string; emoji: string }[]; sentence?: string; say?: string; words?: string[]; story?: string; unit?: string }
export interface Card { id: string; front: string; back: string; emoji?: string }
export interface Step { at: string; vi: string; en: string }
export interface Lesson { id: string; status: 'working' | 'ready' | 'error'; setup: Setup; source: string; skills: Skill[]; slides: Slide[]; items: Item[]; cards: Card[]; steps: Step[]; agent: { note: string; changes: string[]; turns: number; finished: boolean } | null; rejected: { issues: string[] }[]; created_at: string }
export interface LessonRow { id: string; status: Lesson['status']; setup: Setup; created_at: string; slides: number; items: number }
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
  me: () => call<{ teacher: Teacher; budget: string | null }>('GET', '/t/me'),
  update: (f: { name?: string; lang?: string }) => call<{ teacher: Teacher }>('PUT', '/t/me', f),
  logout: () => call<{ ok: boolean }>('POST', '/t/logout'),
  photos: (images: { data: string; type: string }[]) => call<{ text: string }>('POST', '/t/notes/photos', { images }),
  voice: (audio: Blob) => call<{ text: string }>('POST', '/t/notes/voice', undefined, audio),
  intake: (notes: string) => call<{ setup: Setup }>('POST', '/t/intake', { notes }),
  create: (notes: string, setup: Setup) => call<{ id: string }>('POST', '/t/lessons', { notes, setup }),
  lessons: () => call<{ lessons: LessonRow[] }>('GET', '/t/lessons'),
  lesson: (id: string) => call<{ lesson: Lesson }>('GET', `/t/lessons/${encodeURIComponent(id)}`),
};

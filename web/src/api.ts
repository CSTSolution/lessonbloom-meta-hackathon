// The browser talks only to our API (cookie session). Errors carry both languages.
export interface Teacher { id: string; kind: 'demo' | 'account'; name: string; email: string | null; lang: 'vi' | 'en' }
export class ApiError extends Error { constructor(public code: string, public vi: string, public en: string, public status: number) { super(en); } }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
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
};

// Read aloud with the browser's own voice (Chi #49): the server's Vietnamese voice is off for now, so a
// Vietnamese slide or question is read by the phone or computer itself. Calls done when it finishes.
export function browserSay(text: string, lang: 'vi' | 'en', done?: () => void): boolean {
  const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!s || !text.trim()) { done?.(); return false; }
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
  const v = s.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = () => done?.(); u.onerror = () => done?.();
  s.speak(u);
  return true;
}
export const stopSay = () => { try { window.speechSynthesis?.cancel(); } catch { /* none */ } };
// A sum as it is said ("36 + 27 = ?" → "36 cộng 27 bằng bao nhiêu?"), as the server does for its own voice
const WORDS = { en: { '+': 'plus', '-': 'minus', '=': 'equals', '×': 'times', '?': 'what', gap: 'blank' }, vi: { '+': 'cộng', '-': 'trừ', '=': 'bằng', '×': 'nhân', '?': 'bao nhiêu', gap: 'chỗ trống' } } as const;
export function readable(q: string, lang: 'vi' | 'en'): string {
  const w = WORDS[lang];
  return q.replace(/_{2,}/g, ` ${w.gap} `).replace(/=\s*\?/g, `= ${w['?']}?`).replace(/\s*([+\-−=×])\s*(?=[\d\s\w])/g, (_, op: string) => ` ${w[(op === '−' ? '-' : op) as '+' | '-' | '=' | '×']} `).replace(/\s+/g, ' ').trim().slice(0, 400);
}

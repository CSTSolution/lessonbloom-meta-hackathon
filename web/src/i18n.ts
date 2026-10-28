// Vietnamese first, English second; the choice is remembered in this browser only.
import { useEffect, useState } from 'react';

export type Lang = 'vi' | 'en';
const KEY = 'lbm.lang';
// first visit: English unless the browser is set to Vietnamese (Chi: an English browser opens EN)
const fromBrowser = (): Lang => (/^vi\b/i.test(navigator.language || '') ? 'vi' : 'en');
let current: Lang = (() => { try { const v = localStorage.getItem(KEY); return v === 'en' || v === 'vi' ? v : fromBrowser(); } catch { return fromBrowser(); } })();
const subs = new Set<(l: Lang) => void>();
export const getLang = () => current;
export function setLang(l: Lang) { current = l; try { localStorage.setItem(KEY, l); } catch { /* private mode */ } document.documentElement.lang = l; subs.forEach((f) => f(l)); }
export function useLang(): Lang { const [l, set] = useState(current); useEffect(() => { subs.add(set); return () => { subs.delete(set); }; }, []); return l; }
// A parent reads the same screens in a parent's words (Chi: the text follows the role): in Vietnamese
// "cô" (the teacher) becomes "bạn", and "em" / "các em" / "học sinh" (pupils) become "con".
let role: 'teacher' | 'parent' | null = null;
export const setRole = (r: typeof role) => { role = r; };
const PARENT: [RegExp, string][] = [
  [/(?<!\p{L})học sinh(?!\p{L})/gu, 'con'], [/(?<!\p{L})Học sinh(?!\p{L})/gu, 'Con'], [/(?<!\p{L})các em(?!\p{L})/gu, 'các con'], [/(?<!\p{L})Các em(?!\p{L})/gu, 'Các con'],
  [/(?<!\p{L})(\d+|mỗi|từng|số) em(?!\p{L})/gu, '$1 con'], [/(?<!\p{L})cô(?!\p{L})/gu, 'bạn'], [/(?<!\p{L})Cô(?!\p{L})/gu, 'Bạn'],
];
const reword = (s: string) => PARENT.reduce((x, [re, to]) => x.replace(re, to), s);
const cache = new WeakMap<object, unknown>();
function forParent<T>(v: T): T {
  if (typeof v === 'string') return reword(v) as T;
  if (typeof v === 'function') return ((...a: unknown[]) => forParent((v as (...x: unknown[]) => unknown)(...a))) as T;
  if (!v || typeof v !== 'object') return v;
  if (cache.has(v as object)) return cache.get(v as object) as T;
  const out = Array.isArray(v) ? v.map(forParent) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forParent(x)]));
  cache.set(v as object, out);
  return out as T;
}
export function useT<D extends { vi: object; en: object }>(dict: D): D['vi'] { const l = useLang(); return (l === 'vi' && role === 'parent' ? forParent(dict.vi) : dict[l]) as D['vi']; }

if (typeof document !== 'undefined') document.documentElement.lang = current;

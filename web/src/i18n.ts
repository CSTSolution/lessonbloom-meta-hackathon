// Vietnamese first, English second; the choice is remembered in this browser only.
import { useEffect, useState } from 'react';

export type Lang = 'vi' | 'en';
const KEY = 'lbm.lang';
let current: Lang = (() => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'vi'; } catch { return 'vi'; } })();
const subs = new Set<(l: Lang) => void>();
export const getLang = () => current;
export function setLang(l: Lang) { current = l; try { localStorage.setItem(KEY, l); } catch { /* private mode */ } document.documentElement.lang = l; subs.forEach((f) => f(l)); }
export function useLang(): Lang { const [l, set] = useState(current); useEffect(() => { subs.add(set); return () => { subs.delete(set); }; }, []); return l; }
export function useT<D extends { vi: object; en: object }>(dict: D): D['vi'] { return dict[useLang()] as D['vi']; }

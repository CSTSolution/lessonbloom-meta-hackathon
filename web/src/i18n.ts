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
export function useT<D extends { vi: object; en: object }>(dict: D): D['vi'] { return dict[useLang()] as D['vi']; }

if (typeof document !== 'undefined') document.documentElement.lang = current;

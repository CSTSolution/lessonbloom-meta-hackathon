// Three places: "/" (lessons), "/new" (make a lesson), "/lesson/:id". History API, no library.
import { useEffect, useState } from 'react';

const subs = new Set<() => void>();
export function go(path: string) { if (path !== location.pathname) history.pushState(null, '', path); subs.forEach((f) => f()); window.scrollTo(0, 0); }
export function usePath(): string {
  const [p, set] = useState(location.pathname);
  useEffect(() => { const f = () => set(location.pathname); subs.add(f); window.addEventListener('popstate', f); return () => { subs.delete(f); window.removeEventListener('popstate', f); }; }, []);
  return p;
}

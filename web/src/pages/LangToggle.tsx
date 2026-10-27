import { setLang, useLang } from '../i18n.ts';

export function LangToggle() {
  const l = useLang();
  return <div className="lang" role="group" aria-label="Language">{(['vi', 'en'] as const).map((x) => <button key={x} className={l === x ? 'on' : ''} onClick={() => setLang(x)}>{x.toUpperCase()}</button>)}</div>;
}

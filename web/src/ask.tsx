// "Are you sure?" inside the app (Chi #34): the browser's own confirm box is not in the app's look, not
// in her language, and blocks the whole page. `ask` shows a small dialog and answers true or false.
import { createRoot } from 'react-dom/client';
import { getLang } from './i18n.ts';

const WORDS = { vi: { ok: 'Đồng ý', cancel: 'Huỷ' }, en: { ok: 'OK', cancel: 'Cancel' } };

// The dialog: the buttons in order, the last one first in focus; the button's place, or -1 when closed
// (Escape, a click outside).
function dialog(message: string, buttons: { label: string; className: string }[]): Promise<number> {
  const host = document.createElement('div'), root = createRoot(host);
  document.body.appendChild(host);
  return new Promise((done) => {
    const end = (i: number) => { document.removeEventListener('keydown', key); root.unmount(); host.remove(); done(i); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') end(-1); };
    document.addEventListener('keydown', key);
    root.render(
      <div className="ask-back" onMouseDown={(e) => { if (e.target === e.currentTarget) end(-1); }}>
        <div className="ask card stack" role="alertdialog" aria-modal="true" aria-label={message} style={{ gap: 14 }}>
          <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {buttons.map((b, i) => <button key={i} className={b.className} autoFocus={i === buttons.length - 1} onClick={() => end(i)}>{b.label}</button>)}
          </div>
        </div>
      </div>,
    );
  });
}

export async function ask(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  const w = WORDS[getLang()];
  return (await dialog(message, [{ label: w.cancel, className: 'btn' }, { label: opts.ok || w.ok, className: `btn ${opts.danger ? 'danger' : 'primary'}` }])) === 1;
}

// One of two ways on (Chi #44: open the book she has, or add a new copy): 'a', 'b', or null when she
// closed it without choosing. `a` is the one in focus.
export async function choose(message: string, a: string, b: string): Promise<'a' | 'b' | null> {
  const i = await dialog(message, [{ label: b, className: 'btn' }, { label: a, className: 'btn primary' }]);
  return i === 1 ? 'a' : i === 0 ? 'b' : null;
}

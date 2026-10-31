// "Are you sure?" inside the app (Chi #34): the browser's own confirm box is not in the app's look, not
// in her language, and blocks the whole page. `ask` shows a small dialog and answers true or false.
import { createRoot } from 'react-dom/client';
import { getLang } from './i18n.ts';

const WORDS = { vi: { ok: 'Đồng ý', cancel: 'Huỷ' }, en: { ok: 'OK', cancel: 'Cancel' } };

export function ask(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  const w = WORDS[getLang()], host = document.createElement('div'), root = createRoot(host);
  document.body.appendChild(host);
  return new Promise((done) => {
    const end = (yes: boolean) => { document.removeEventListener('keydown', key); root.unmount(); host.remove(); done(yes); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') end(false); };
    document.addEventListener('keydown', key);
    root.render(
      <div className="ask-back" onMouseDown={(e) => { if (e.target === e.currentTarget) end(false); }}>
        <div className="ask card stack" role="alertdialog" aria-modal="true" aria-label={message} style={{ gap: 14 }}>
          <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={() => end(false)}>{w.cancel}</button>
            <button className={`btn ${opts.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => end(true)}>{opts.ok || w.ok}</button>
          </div>
        </div>
      </div>,
    );
  });
}

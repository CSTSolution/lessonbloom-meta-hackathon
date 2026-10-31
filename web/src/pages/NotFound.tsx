// A link to something that is not there, or is another account's (Chi #38): say so, with the way back,
// instead of an empty page.
import { useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: { lesson: 'Không tìm thấy bài này, hoặc bài thuộc tài khoản khác.', learner: 'Không tìm thấy học sinh này, hoặc em thuộc tài khoản khác.', page: 'Không tìm thấy trang này, hoặc trang thuộc tài khoản khác.', back: 'Về Bài giảng' },
  en: { lesson: 'This lesson was not found, or it belongs to another account.', learner: 'This learner was not found, or belongs to another account.', page: 'This page was not found, or it belongs to another account.', back: 'Back to Lessons' },
};

export function NotFound({ what = 'page' }: { what?: 'lesson' | 'learner' | 'page' }) {
  const t = useT(T);
  return (
    <div className="page narrow">
      <div className="card stack" style={{ gap: 12, marginTop: 24 }} role="alert">
        <p>{t[what]}</p>
        <div><button className="btn primary" onClick={() => go('/')}>{t.back}</button></div>
      </div>
    </div>
  );
}

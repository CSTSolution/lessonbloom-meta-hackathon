// Signed in: the sidebar (bottom bar on phones) and the teacher's lessons. Lessons, classes and the
// learning summary arrive in the next steps of the rebuild; this is their frame.
import { useState } from 'react';
import { api, type Teacher } from '../api.ts';
import { useT } from '../i18n.ts';
import { LangToggle } from './LangToggle.tsx';

const T = {
  vi: {
    nav: { lessons: 'Bài giảng', classes: 'Lớp học', insight: 'Tóm tắt học tập' },
    hello: (n: string) => (n ? `Chào cô ${n}!` : 'Chào cô!'), demo: 'Bản dùng thử', signOut: 'Đăng xuất',
    emptyTitle: 'Bài giảng đầu tiên của cô', emptyText: 'Gõ, chụp ảnh hoặc đọc to ghi chú bài học. Trợ lý sẽ soạn slide, bài luyện tập và tự kiểm tra từng câu.',
    make: 'Soạn bài mới', soon: 'Sắp có', classesText: 'Lớp học và mã lớp cho học sinh sẽ ở đây.', insightText: 'Lớp vướng ở dạng bài nào, em nào cần luyện thêm: sẽ ở đây.',
  },
  en: {
    nav: { lessons: 'Lessons', classes: 'Classes', insight: 'Learning summary' },
    hello: (n: string) => (n ? `Hello, ${n}!` : 'Hello!'), demo: 'Demo', signOut: 'Sign out',
    emptyTitle: 'Your first lesson', emptyText: 'Type, photograph or say your lesson notes. The agent writes slides and practice and checks every item.',
    make: 'New lesson', soon: 'Coming next', classesText: 'Your classes and their join codes will be here.', insightText: 'Which skills a class is stuck on and who needs more practice: here.',
  },
};
type Tab = 'lessons' | 'classes' | 'insight';

export function Home({ teacher, onChange, onSignOut }: { teacher: Teacher; onChange: (t: Teacher) => void; onSignOut: () => void }) {
  const t = useT(T);
  const [tab, setTab] = useState<Tab>('lessons');
  void onChange;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/favicon.svg" alt="" />LessonBloom</div>
        <nav>{(Object.keys(t.nav) as Tab[]).map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t.nav[k]}</button>)}</nav>
        <div className="grow" />
        <div className="who stack small" style={{ gap: 8 }}>
          <span className="muted">{teacher.kind === 'demo' ? <span className="chip">{t.demo}</span> : teacher.email}</span>
          <div className="row"><LangToggle /><button className="btn ghost small" onClick={async () => { await api.logout().catch(() => {}); onSignOut(); }}>{t.signOut}</button></div>
        </div>
      </aside>
      <main className="main stack" style={{ gap: 24 }}>
        <h1>{t.hello(teacher.name)}</h1>
        {tab === 'lessons' && (
          <div className="empty">
            <h2>{t.emptyTitle}</h2>
            <p className="muted" style={{ maxWidth: 520 }}>{t.emptyText}</p>
            <button className="btn coral lg" disabled>{t.make}</button>
            <span className="chip">{t.soon}</span>
          </div>
        )}
        {tab === 'classes' && <div className="empty"><p className="muted">{t.classesText}</p><span className="chip">{t.soon}</span></div>}
        {tab === 'insight' && <div className="empty"><p className="muted">{t.insightText}</p><span className="chip">{t.soon}</span></div>}
      </main>
    </div>
  );
}

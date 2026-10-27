// Signed in: the sidebar (bottom bar on phones) and the teacher's lessons, a new lesson, or one lesson.
// Classes and the learning summary arrive in the next steps of the rebuild.
import { useEffect, useState } from 'react';
import { api, type LessonRow, type Teacher } from '../api.ts';
import { useT } from '../i18n.ts';
import { go, usePath } from '../router.ts';
import { Create } from './Create.tsx';
import { LangToggle } from './LangToggle.tsx';
import { LessonPage } from './LessonPage.tsx';

const T = {
  vi: {
    nav: { lessons: 'Bài giảng', classes: 'Lớp học', insight: 'Tóm tắt học tập' },
    hello: (n: string) => (n ? `Chào cô ${n}!` : 'Chào cô!'), demo: 'Bản dùng thử', signOut: 'Đăng xuất',
    emptyTitle: 'Bài giảng đầu tiên của cô', emptyText: 'Gõ, chụp ảnh hoặc đọc to ghi chú bài học. Trợ lý sẽ soạn slide, bài luyện tập và tự kiểm tra từng câu.',
    make: 'Soạn bài mới', soon: 'Sắp có', status: { working: 'Đang soạn', ready: 'Xong', error: 'Lỗi' }, counts: (s: number, i: number) => `${s} slide · ${i} câu luyện tập`, gradeN: (g: number) => `Lớp ${g}`, classesText: 'Lớp học và mã lớp cho học sinh sẽ ở đây.', insightText: 'Lớp vướng ở dạng bài nào, em nào cần luyện thêm: sẽ ở đây.',
  },
  en: {
    nav: { lessons: 'Lessons', classes: 'Classes', insight: 'Learning summary' },
    hello: (n: string) => (n ? `Hello, ${n}!` : 'Hello!'), demo: 'Demo', signOut: 'Sign out',
    emptyTitle: 'Your first lesson', emptyText: 'Type, photograph or say your lesson notes. The agent writes slides and practice and checks every item.',
    make: 'New lesson', soon: 'Coming next', status: { working: 'Making', ready: 'Ready', error: 'Failed' }, counts: (s: number, i: number) => `${s} slides · ${i} practice items`, gradeN: (g: number) => `Grade ${g}`, classesText: 'Your classes and their join codes will be here.', insightText: 'Which skills a class is stuck on and who needs more practice: here.',
  },
};
type Tab = 'lessons' | 'classes' | 'insight';

export function Home({ teacher, onChange, onSignOut }: { teacher: Teacher; onChange: (t: Teacher) => void; onSignOut: () => void }) {
  const t = useT(T);
  const [tab, setTab] = useState<Tab>('lessons');
  const path = usePath(), [rows, setRows] = useState<LessonRow[] | null>(null);
  useEffect(() => { if (path === '/') api.lessons().then((r) => setRows(r.lessons)).catch(() => setRows([])); }, [path]);
  void onChange;
  const lessonId = /^\/lesson\/([\w-]+)$/.exec(path)?.[1];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/favicon.svg" alt="" />LessonBloom</div>
        <nav>{(Object.keys(t.nav) as Tab[]).map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); go('/'); }}>{t.nav[k]}</button>)}</nav>
        <div className="grow" />
        <div className="who stack small" style={{ gap: 8 }}>
          <span className="muted">{teacher.kind === 'demo' ? <span className="chip">{t.demo}</span> : teacher.email}</span>
          <div className="row"><LangToggle /><button className="btn ghost small" onClick={async () => { await api.logout().catch(() => {}); onSignOut(); }}>{t.signOut}</button></div>
        </div>
      </aside>
      <main className="main stack" style={{ gap: 24 }}>
        {path === '/new' ? <Create /> : lessonId ? <LessonPage id={lessonId} /> : <>
          <div className="row"><h1 className="grow">{t.hello(teacher.name)}</h1>{tab === 'lessons' && !!rows?.length && <button className="btn coral" onClick={() => go('/new')}>+ {t.make}</button>}</div>
          {tab === 'lessons' && rows && (rows.length ? (
            <div className="lessons">{rows.map((r) => (
              <button key={r.id} className="lesson-card" onClick={() => go(`/lesson/${r.id}`)}>
                <span className="row small"><span className={`chip st-${r.status}`}>{t.status[r.status]}</span><span className="muted">{t.gradeN(r.setup.grade)}</span></span>
                <b>{r.setup.title}</b><span className="small muted">{t.counts(r.slides, r.items)}</span>
              </button>))}</div>
          ) : (
            <div className="empty">
              <h2>{t.emptyTitle}</h2>
              <p className="muted" style={{ maxWidth: 520 }}>{t.emptyText}</p>
              <button className="btn coral lg" onClick={() => go('/new')}>{t.make}</button>
            </div>
          ))}
          {tab === 'classes' && <div className="empty"><p className="muted">{t.classesText}</p><span className="chip">{t.soon}</span></div>}
          {tab === 'insight' && <div className="empty"><p className="muted">{t.insightText}</p><span className="chip">{t.soon}</span></div>}
        </>}
      </main>
    </div>
  );
}

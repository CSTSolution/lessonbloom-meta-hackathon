// Signed out: the welcome page. Signed in: the shell with the teacher's lessons.
import { useEffect, useState } from 'react';
import { go } from './router.ts';
import { api, type Teacher } from './api.ts';
import { setLang } from './i18n.ts';
import { Home } from './pages/Home.tsx';
import { Pupil } from './pupil/Pupil.tsx';
import { Welcome } from './pages/Welcome.tsx';

// Pupils (/hoc, /p/<their link>) have their own small app and no teacher session.
const PUPIL = /^\/(hoc(\/|$)|p\/)/;
export function App() {
  if (PUPIL.test(location.pathname)) return <Pupil />;
  return <TeacherApp />;
}

function TeacherApp() {
  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  useEffect(() => { api.me().then((r) => setTeacher(r.teacher)).catch(() => setTeacher(null)); }, []);
  // signed in or just signed up: always the Lessons page, never a lesson link left from before (Chi #38)
  const signedIn = (t: Teacher) => { setLang(t.lang); setTeacher(t); go('/'); };
  if (teacher === undefined) return null;
  return teacher ? <Home teacher={teacher} onChange={setTeacher} onSignOut={() => setTeacher(null)} /> : <Welcome onSignedIn={signedIn} />;
}

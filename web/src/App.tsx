// Signed out: the welcome page. Signed in: the shell with the teacher's lessons.
import { useEffect, useState } from 'react';
import { api, type Teacher } from './api.ts';
import { setLang } from './i18n.ts';
import { Home } from './pages/Home.tsx';
import { Welcome } from './pages/Welcome.tsx';

export function App() {
  const [teacher, setTeacher] = useState<Teacher | null | undefined>(undefined);
  useEffect(() => { api.me().then((r) => setTeacher(r.teacher)).catch(() => setTeacher(null)); }, []);
  const signedIn = (t: Teacher) => { setLang(t.lang); setTeacher(t); };
  if (teacher === undefined) return null;
  return teacher ? <Home teacher={teacher} onChange={setTeacher} onSignOut={() => setTeacher(null)} /> : <Welcome onSignedIn={signedIn} />;
}

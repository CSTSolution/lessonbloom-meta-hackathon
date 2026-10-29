// Sign-up step 2 · "Bạn là ai?": teacher or parent, chosen once. A teacher gives her name and subject;
// a parent her name and her children's first names (only first names, up to 4) with their grade.
import { useState } from 'react';
import { api, ApiError, type Teacher } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { LangToggle } from './LangToggle.tsx';

const T = {
  vi: {
    step: 'Bước 2/2 · Tạo tài khoản', who: 'Bạn là ai?', pick: 'Chọn vai để bắt đầu.', teacher: 'Tôi là giáo viên', teacherSub: 'Giao bài cho lớp, học sinh vào bằng mã lớp.', parent: 'Tôi là phụ huynh', parentSub: 'Giao bài cho con, mỗi con một lộ trình.',
    name: 'Tên gọi của bạn', classes: 'Lớp dạy (cách nhau bằng dấu phẩy)', classesPh: 'Ví dụ: 2A, 2B, 2C', namePhT: 'Ví dụ: Cô Hạnh', namePhP: 'Ví dụ: Mẹ An', subject: 'Môn dạy', math: 'Toán', english: 'Tiếng Anh', both: 'Cả hai',
    kids: 'Các con', onlyNames: '🔒 Chỉ lưu tên gọi.', kidName: 'Tên gọi của con', grade: 'Lớp', addKid: '+ Thêm con', remove: 'Bỏ',
    same: 'Cùng bộ công cụ: kho kiến thức, tạo bài, lộ trình học.', later: 'Đổi vai sau trong Hồ sơ.', go: 'Tiếp tục',
  },
  en: {
    step: 'Step 2/2 · Create your account', who: 'Who are you?', pick: 'Choose a role to start.', teacher: "I'm a teacher", teacherSub: 'Assign to a class; pupils join with the class code.', parent: "I'm a parent", parentSub: 'Assign to your children, one path each.',
    name: 'Your name', classes: 'Your classes (comma-separated)', classesPh: 'e.g. 2A, 2B, Year 2 Blue', namePhT: 'e.g. Ms Hanh', namePhP: "e.g. An's mum", subject: 'Subject', math: 'Maths', english: 'English', both: 'Both',
    kids: 'Your children', onlyNames: '🔒 Only first names are kept.', kidName: "Child's first name", grade: 'Grade', addKid: '+ Add a child', remove: 'Remove',
    same: 'The same tools: knowledge, lessons, learning path.', later: 'You can change the role later in Profile.', go: 'Continue',
  },
};

export function SignupRole({ teacher, onDone }: { teacher: Teacher; onDone: (t: Teacher) => void }) {
  const t = useT(T), lang = useLang();
  const [role, setRole] = useState<'teacher' | 'parent'>('teacher'), [name, setName] = useState(teacher.name || ''), [subject, setSubject] = useState('math'), [classes, setClasses] = useState('');
  const [kids, setKids] = useState([{ name: '', grade: 1 }]), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const ok = name.trim() && (role === 'teacher' || kids.some((k) => k.name.trim()));
  const go2 = async () => {
    setBusy(true); setErr('');
    try { onDone((await api.setRole({ role, name: name.trim(), subject: role === 'teacher' ? subject : '', classes: role === 'teacher' ? classes.split(',').map((x) => x.trim()).filter(Boolean) : [], children: role === 'parent' ? kids.filter((k) => k.name.trim()) : [] })).teacher); }
    catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <header className="top"><span className="brand"><img src="/favicon.svg" alt="" />LessonBloom</span><span className="grow" /><LangToggle /></header>
      <div className="page" style={{ maxWidth: 520 }}>
        <form className="card stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (ok) void go2(); }}>
          <span className="small muted">{t.step}</span>
          <div><h1>{t.who}</h1><p className="small muted">{t.pick}</p></div>
          <div className="grid2">
            {(['teacher', 'parent'] as const).map((r) => (
              <button type="button" key={r} className={`list-row ${role === r ? 'sel' : ''}`} style={{ display: 'grid', textAlign: 'left', gap: 4, cursor: 'pointer' }} onClick={() => setRole(r)} aria-pressed={role === r}>
                <b className="small">{r === 'teacher' ? t.teacher : t.parent}</b><span className="small muted">{r === 'teacher' ? t.teacherSub : t.parentSub}</span>
              </button>
            ))}
          </div>
          <label className="field">{t.name}<input value={name} maxLength={60} placeholder={role === 'teacher' ? t.namePhT : t.namePhP} onChange={(e) => setName(e.target.value)} /></label>
          {role === 'teacher' ? (
            <label className="field">{t.subject}<select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="math">{t.math}</option><option value="english">{t.english}</option><option value="both">{t.both}</option></select></label>
          ) : null}
          {role === 'teacher' && <label className="field">{t.classes}<input value={classes} maxLength={200} placeholder={t.classesPh} onChange={(e) => setClasses(e.target.value)} /></label>}
          {role === 'teacher' ? null : (
            <div className="stack" style={{ gap: 8 }}>
              <b className="small">{t.kids}</b><span className="small ok-text">{t.onlyNames}</span>
              {kids.map((k, i) => (
                <div key={i} className="row" style={{ background: 'var(--paper)', padding: 8, borderRadius: 8 }}>
                  <label className="field grow">{t.kidName}<input value={k.name} maxLength={40} onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></label>
                  <label className="field">{t.grade}<select value={k.grade} onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, grade: Number(e.target.value) } : x)))}>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{t.grade} {g}</option>)}</select></label>
                  {kids.length > 1 && <button type="button" className="link small" onClick={() => setKids(kids.filter((_, j) => j !== i))}>{t.remove}</button>}
                </div>
              ))}
              {kids.length < 4 && <button type="button" className="btn ghost small" style={{ alignSelf: 'start', border: '1px dashed var(--line)' }} onClick={() => setKids([...kids, { name: '', grade: 1 }])}>{t.addKid}</button>}
            </div>
          )}
          <div className="banner blue">ⓘ {t.same}</div>
          <div className="row"><span className="small muted grow">{t.later}</span><button className="btn primary" disabled={!ok || busy}>{t.go}</button></div>
          {err && <p className="note">{err}</p>}
        </form>
      </div>
    </div>
  );
}

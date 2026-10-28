// "Hồ sơ": name, language, subject, and the role (changed here only, never from the header).
// A parent's children are managed under "Con của tôi".
import { useState } from 'react';
import { api, ApiError, type Teacher } from '../api.ts';
import { setLang, useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: { title: 'Hồ sơ', name: 'Tên gọi', lang: 'Ngôn ngữ', vi: 'Tiếng Việt', en: 'Tiếng Anh', role: 'Vai', teacher: 'Giáo viên', parent: 'Phụ huynh', roleNote: 'Đổi vai thì menu và lời lẽ đổi theo; bài giảng, kho kiến thức và lớp vẫn giữ nguyên.', subject: 'Môn dạy', math: 'Toán', english: 'Tiếng Anh', both: 'Cả hai', kids: 'Các con: quản lý trong mục Con của tôi', save: 'Lưu', saved: 'Đã lưu.', needKid: 'Thêm ít nhất một con trong mục Con của tôi trước khi đổi sang vai phụ huynh.' },
  en: { title: 'Profile', name: 'Name', lang: 'Language', vi: 'Vietnamese', en: 'English', role: 'Role', teacher: 'Teacher', parent: 'Parent', roleNote: 'Changing the role changes the menu and wording; your lessons, knowledge and classes stay.', subject: 'Subject', math: 'Maths', english: 'English', both: 'Both', kids: 'Children: managed under My children', save: 'Save', saved: 'Saved.', needKid: 'Add at least one child under My children before switching to parent.' },
};

export function Profile({ teacher, onChange }: { teacher: Teacher; onChange: (t: Teacher) => void }) {
  const t = useT(T), lang = useLang();
  const [f, setF] = useState({ name: teacher.name, role: teacher.role || 'teacher', subject: teacher.subject || 'math', lang: teacher.lang }), [msg, setMsg] = useState('');
  const save = async () => {
    setMsg('');
    try { const r = await api.update(f); setLang(r.teacher.lang); onChange(r.teacher); setMsg(t.saved); }
    catch (e) { setMsg(e instanceof ApiError && e.code === 'children' ? t.needKid : e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); }
  };
  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h1>{t.title}</h1>
        <label className="field">{t.name}<input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field">{t.lang}<select value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value as 'vi' | 'en' })}><option value="en">{t.en}</option><option value="vi">{t.vi}</option></select></label>
        <div className="field">{t.role}<div className="row">{(['teacher', 'parent'] as const).map((r) => <button type="button" key={r} className={`pill ${f.role === r ? 'on' : ''}`} onClick={() => setF({ ...f, role: r })}>{t[r]}</button>)}</div><span className="small muted" style={{ fontWeight: 400 }}>{t.roleNote}</span></div>
        {f.role === 'teacher' ? <label className="field">{t.subject}<select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="math">{t.math}</option><option value="english">{t.english}</option><option value="both">{t.both}</option></select></label>
          : <button type="button" className="link small" style={{ alignSelf: 'start' }} onClick={() => go('/classes')}>{t.kids}</button>}
        <div className="row"><span className="small muted grow">{msg}</span><button className="btn primary">{t.save}</button></div>
      </form>
    </div>
  );
}

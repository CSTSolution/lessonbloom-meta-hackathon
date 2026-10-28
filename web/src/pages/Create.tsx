// Making a lesson, steps 1-2 of Chi's six (Tài liệu · Câu hỏi · Slide · Video · Bài tập · Giao bài).
//   1 Tài liệu: the source (a book in the knowledge area) and its part ("Tự tìm" lets the AI find it),
//     and the lesson material in one of four forms: a sentence (typed or said), a photo of the lesson,
//     a photo of the child's finished exercise (its kind and mistakes), or pasted text. The material
//     only points to the part; what is taught comes from the book, and the found pages are shown.
//   2 Câu hỏi: the setup the AI pre-filled, each question folded, only the open one shows.
// Steps 3-6 are the lesson page.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AreaRow, type Match, type SectionRow, type Setup } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';

export const STEPS = { vi: ['Tài liệu', 'Câu hỏi', 'Slide', 'Video', 'Bài tập', 'Giao bài'], en: ['Material', 'Questions', 'Slides', 'Video', 'Practice', 'Assign'] };
export function Stepper({ at, onStep, done = at - 1 }: { at: number; onStep?: (i: number) => void; done?: number }) {
  const lang = useLang();
  return <div className="stepper noprint">{STEPS[lang].map((s, i) => { const n = i + 1, cls = n === at ? 'on' : n <= done ? 'done' : ''; const body = <span className={cls}><i>{n <= done && n !== at ? '✓' : n}</i>{s}</span>; return onStep && n >= 3 ? <button key={s} onClick={() => onStep(n)}>{body}</button> : <span key={s} style={{ display: 'contents' }}>{body}</span>; })}</div>;
}

const T = {
  vi: {
    save: 'Lưu nháp và thoát', h1: 'Chọn nguồn và tài liệu tạo bài', lead: 'Bài chỉ soạn trong nguồn cô chọn.', src: 'Nguồn kiến thức', srcLead: 'Để “Tự tìm”, LessonBloom tìm đúng trang.', source: 'Nguồn', part: 'Phạm vi kiến thức', auto: 'Tự tìm theo tài liệu tạo bài', openKnowledge: 'Mở Kho kiến thức',
    mat: 'Tài liệu tạo bài', matLead: 'Một câu, ảnh bài giảng hoặc ảnh bài tập đã làm.', kinds: { one: 'Một câu mô tả', lesson: 'Ảnh bài giảng', work: 'Ảnh bài tập đã làm', paste: 'Dán văn bản' },
    what: 'Bài này cần học gì?', whatPh: 'Ví dụ: Phép cộng có nhớ trong phạm vi 100, tập trung vào nhớ 1 sang hàng chục.', pastePh: 'Dán đoạn văn bản (giáo án, đề bài…) vào đây.', say: '🎤 Nói', stop: '■ Dừng', hearing: 'Đang nghe…',
    lessonPhoto: 'Chụp trang sách hoặc giáo án (tối đa 5 ảnh). Không chụp mặt người, tên hay thông tin cá nhân.', workPhoto: 'Chụp bài con đã làm (tối đa 5 ảnh). AI nhận ra dạng bài và chỗ sai, rồi tạo bài luyện cùng dạng trong phạm vi đã chọn. Không chụp tên hay mặt.', pick: '📷 Chọn ảnh', reading: 'AI đang đọc ảnh…',
    find: 'Tìm trong nguồn', finding: 'Đang tìm…', found: (c: string) => `Đã tìm thấy: ${c}. Bài chỉ dùng các trang này.`, quotes: 'Các đoạn AI đã dùng', mistakes: 'Chỗ con hay sai', notFound: 'Chưa có trong Kho kiến thức. Cô thêm tài liệu hoặc chọn phạm vi khác.',
    scope: (s: string) => `Phạm vi: ${s}`, next: 'Tiếp tục', noArea: 'Cô cần một nguồn có sách trước. Bài giảng chỉ lấy nội dung từ sách của cô.', sample: '📘 Dùng sách mẫu',
    h2: 'Một vài câu hỏi về bài học', lead2: 'AI đã điền sẵn. Cô xem và sửa nếu cần.', fromAi: 'Gợi ý từ AI', optional: 'Không bắt buộc',
    q: { goal: 'Mục tiêu', title: 'Tên bài', minutes: 'Thời lượng', level: 'Mức của lớp', make: 'Cần tạo', lang: 'Ngôn ngữ', note: 'Ghi chú cho AI' },
    min: (n: number) => `${n} phút`, levels: 'Nhiều mức (3 mức bài tập)', makes: 'Slide bài giảng, Video có giọng đọc, Bài tập theo mẫu, Thẻ nhớ', vi: 'Tiếng Việt', en: 'Tiếng Anh', none: 'Chưa có', notePh: 'Ví dụ: dùng tình huống ở chợ',
    back: 'Quay lại', create: 'Tạo bài giảng', thinking: 'Đang đọc phạm vi…', page: 'tr.',
  },
  en: {
    save: 'Save draft and leave', h1: 'Choose the source and the material', lead: 'The lesson is made only from the source you choose.', src: 'Source', srcLead: 'With “Find it for me”, LessonBloom finds the right pages.', source: 'Source', part: 'Part', auto: 'Find it from the material', openKnowledge: 'Open Knowledge',
    mat: 'Lesson material', matLead: 'A sentence, a photo of the lesson or of a finished exercise.', kinds: { one: 'One sentence', lesson: 'Lesson photo', work: 'Finished exercise', paste: 'Paste text' },
    what: 'What should this lesson teach?', whatPh: 'e.g. Unit 6: colours, the words red, blue and green.', pastePh: 'Paste text (a plan, an exercise…) here.', say: '🎤 Speak', stop: '■ Stop', hearing: 'Listening…',
    lessonPhoto: 'Photograph the book page or your plan (up to 5 photos). No faces, names or personal details.', workPhoto: "Photograph the child's finished exercise (up to 5 photos). The AI finds its kind and the mistakes, then makes practice of the same kind in the chosen part. No names or faces.", pick: '📷 Choose photos', reading: 'Reading the photos…',
    find: 'Find in the source', finding: 'Searching…', found: (c: string) => `Found: ${c}. The lesson uses only these pages.`, quotes: 'Passages the AI used', mistakes: 'Mistakes seen', notFound: 'Not in your knowledge area yet. Add material or choose another part.',
    scope: (s: string) => `Part: ${s}`, next: 'Continue', noArea: 'You need a source with a book first. Lessons come only from your books.', sample: '📘 Use a sample book',
    h2: 'A few questions about the lesson', lead2: 'The AI filled these in. Check and change them if needed.', fromAi: 'Suggested by AI', optional: 'Optional',
    q: { goal: 'Objectives', title: 'Title', minutes: 'Length', level: 'Class level', make: 'To make', lang: 'Language', note: 'Note for the AI' },
    min: (n: number) => `${n} min`, levels: 'Mixed (3 practice levels)', makes: 'Slides, narrated video, practice from templates, flashcards', vi: 'Vietnamese', en: 'English', none: 'None', notePh: 'e.g. use market examples',
    back: 'Back', create: 'Make the lesson', thinking: 'Reading the part…', page: 'p.',
  },
};
type Kind = 'one' | 'lesson' | 'work' | 'paste';

export function Create({ parent: _parent }: { parent: boolean }) {
  const t = useT(T), lang = useLang();
  const q = new URLSearchParams(location.search);
  const [areas, setAreas] = useState<AreaRow[] | null>(null), [areaId, setAreaId] = useState(q.get('area') || ''), [sections, setSections] = useState<SectionRow[]>([]), [sectionId, setSectionId] = useState(q.get('section') || '');
  const [kind, setKind] = useState<Kind>('one'), [text, setText] = useState(''), [focus, setFocus] = useState('');
  const [match, setMatch] = useState<Match | null>(null), [missing, setMissing] = useState(false), [setup, setSetup] = useState<Setup | null>(null), [open, setOpen] = useState('goal');
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const loadAreas = () => api.areas().then((r) => { const ready = r.areas.filter((a) => a.books.some((b) => b.status === 'ready')); setAreas(ready); setAreaId((x) => (x && ready.some((a) => a.id === x) ? x : ready[0]?.id || '')); }).catch(() => setAreas([]));
  useEffect(() => { void loadAreas(); }, []);
  useEffect(() => { setMatch(null); setMissing(false); if (areaId) api.area(areaId).then((r) => setSections(r.sections)).catch(() => setSections([])); }, [areaId]);
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String((e as Error).message || e)); } finally { setBusy(''); } };
  const record = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => { stream.getTracks().forEach((x) => x.stop()); void run('voice', async () => setText((await api.voice(new Blob(chunks.current, { type: r.mimeType.split(';')[0] || 'audio/webm' }))).text.slice(0, 2000))); };
    r.start(); setRec(r); setTimeout(() => { if (r.state === 'recording') r.stop(); }, 2 * 60e3);
  };
  const photos = (fs: File[], what: 'lesson' | 'work') => run('photo', async () => {
    const imgs = await Promise.all(fs.slice(0, 5).map((f) => shrink(f)));
    if (what === 'work') { const r = await api.work(imgs); setText(r.request); setFocus(r.focus); } else setText((await api.photos(imgs)).text.slice(0, 2000));
  });
  const find = () => run('find', async () => {
    setMissing(false);
    try { setMatch((await api.match(areaId, text)).match); } catch (e) { if (e instanceof ApiError && e.code === 'noMatch') setMissing(true); else throw e; }
  });
  const chosen = sections.find((s) => s.id === sectionId), a = areas?.find((x) => x.id === areaId);
  const scopeText = chosen ? `${a?.name} · ${t.page} ${chosen.page_from}${chosen.page_to > chosen.page_from ? `–${chosen.page_to}` : ''}` : match ? `${match.book} · ${t.page} ${match.pageFrom}${match.pageTo > match.pageFrom ? `–${match.pageTo}` : ''}` : '';
  const toStep2 = () => run('intake', async () => { const s = (await api.intake(areaId, chosen?.id || match!.sectionId)).setup; setSetup({ ...s, note: focus ? `${lang === 'en' ? 'Aim at these mistakes' : 'Tập trung vào lỗi'}: ${focus}` : s.note }); });
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => (s ? { ...s, [k]: v } : s));
  if (!areas) return null;

  const top = <div className="row noprint" style={{ justifyContent: 'flex-end' }}><button className="link small" onClick={() => go('/')}>{t.save}</button></div>;
  if (!areas.length) return (
    <div className="page narrow">{top}<Stepper at={1} />
      <div className="card stack"><p>{t.noArea}</p><div className="row"><button className="btn primary" onClick={() => go('/knowledge')}>{t.openKnowledge}</button>
        <button className="btn" disabled={!!busy} onClick={() => run('sample', async () => { await api.sampleArea(lang === 'en' ? 'english3' : 'toan2'); await loadAreas(); })}>{t.sample}</button></div>{err && <p className="note">{err}</p>}</div></div>
  );

  if (!setup) return (
    <div className="page narrow">{top}<Stepper at={1} />
      <div className="stack" style={{ gap: 14 }}>
        <div><h1>{t.h1}</h1><p className="small muted">{t.lead}</p></div>
        <div className="card stack">
          <b><span className="num cur">1</span> {t.src}</b><span className="small muted">{t.srcLead}</span>
          <div className="grid2">
            <label className="field">{t.source}<select value={areaId} onChange={(e) => { setAreaId(e.target.value); setSectionId(''); }}>{areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="field">{t.part}<select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setMatch(null); }}><option value="">{t.auto}</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.title} · {t.page} {s.page_from}</option>)}</select></label>
          </div>
          <button className="link small" style={{ alignSelf: 'start' }} onClick={() => go('/knowledge')}>{t.openKnowledge}</button>
        </div>
        <div className="card stack">
          <b><span className="num cur">2</span> {t.mat}</b><span className="small muted">{t.matLead}</span>
          <div className="row">{(Object.keys(t.kinds) as Kind[]).map((k) => <button key={k} className={`btn small ${kind === k ? 'primary' : ''}`} onClick={() => setKind(k)}>{t.kinds[k]}</button>)}</div>
          {(kind === 'lesson' || kind === 'work') && <><p className="small muted">{kind === 'work' ? t.workPhoto : t.lessonPhoto}</p>
            <label className="btn" style={{ alignSelf: 'start' }}>{busy === 'photo' ? t.reading : t.pick}<input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) void photos(fs, kind); }} /></label></>}
          <label className="field">{t.what}<textarea rows={kind === 'paste' ? 7 : 3} maxLength={kind === 'paste' ? 6000 : 2000} value={text} placeholder={kind === 'paste' ? t.pastePh : t.whatPh} onChange={(e) => { setText(e.target.value); setMatch(null); setMissing(false); }} /></label>
          {kind === 'one' && (rec ? <button className="btn coral small" style={{ alignSelf: 'start' }} onClick={() => { rec.stop(); setRec(null); }}>{t.stop}</button>
            : <button className="btn small" style={{ alignSelf: 'start' }} disabled={!!busy} onClick={() => void record().catch((e) => setErr(String(e.message || e)))}>{busy === 'voice' ? t.hearing : t.say}</button>)}
          {focus && <p className="banner warn small"><b>{t.mistakes}:</b> {focus}</p>}
          {!chosen && <div className="row"><span className="grow" /><button className="btn" disabled={!!busy || text.trim().length < 3} onClick={find}>{busy === 'find' ? t.finding : t.find}</button></div>}
        </div>
        {match && !chosen && <div className="banner"><b>✓ {t.found(scopeText)}</b><details className="small"><summary>{match.title} · {t.quotes}</summary>{match.cited.map((c) => <blockquote key={c.id}>“{c.quote}” <span className="muted">· {t.page} {c.page}</span></blockquote>)}</details></div>}
        {chosen && <div className="banner">✓ {t.found(`${chosen.title} · ${scopeText}`)}</div>}
        {missing && <div className="banner warn">{t.notFound}</div>}
        {err && <p className="note">{err}</p>}
        <div className="row"><span className="small muted grow">{scopeText && t.scope(scopeText)}</span>
          <button className="btn primary" disabled={!!busy || !(chosen || match)} onClick={toStep2}>{busy === 'intake' ? t.thinking : t.next}</button></div>
      </div>
    </div>
  );

  const row = (id: string, title: string, sub: string, body: React.ReactNode, badge?: string) => (
    <div key={id} className={`group card ${open === id ? 'on' : ''}`}>
      <button className="group-head" onClick={() => setOpen(open === id ? '' : id)} aria-expanded={open === id}>
        <span className="caret">{open === id ? '▾' : '▸'}</span><span className="grow"><b className="small">{title}</b> <span className="small muted">{sub}</span></span>{badge && <span className="tag ai">{badge}</span>}
      </button>
      {open === id && <div style={{ paddingTop: 8 }}>{body}</div>}
    </div>
  );
  return (
    <div className="page narrow">{top}<Stepper at={2} />
      <div className="stack" style={{ gap: 10 }}>
        <div><h1>{t.h2}</h1><p className="small muted">{t.lead2}</p></div>
        {row('goal', t.q.goal, setup.objectives[0] || '', <div className="stack" style={{ gap: 6 }}>
          <label className="field">{t.q.title}<input value={setup.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></label>
          {[0, 1, 2].map((i) => <input key={i} value={setup.objectives[i] || ''} maxLength={200} onChange={(e) => { const o = [...setup.objectives]; o[i] = e.target.value; set('objectives', o.filter((x, j) => x || j < i)); }} />)}
        </div>, t.fromAi)}
        {row('min', t.q.minutes, t.min(setup.minutes), <div className="row">{([15, 25, 35] as const).map((m) => <button key={m} className={`pill ${setup.minutes === m ? 'on' : ''}`} onClick={() => set('minutes', m)}>{t.min(m)}</button>)}</div>)}
        {row('level', t.q.level, t.levels, <p className="small muted">{t.levels}</p>)}
        {row('make', t.q.make, t.makes, <p className="small muted">{t.makes}</p>)}
        {row('lang', t.q.lang, setup.lang === 'en' ? t.en : t.vi, <div className="row">{(['vi', 'en'] as const).map((l) => <button key={l} className={`pill ${setup.lang === l ? 'on' : ''}`} onClick={() => set('lang', l)}>{l === 'vi' ? t.vi : t.en}</button>)}</div>)}
        {row('note', t.q.note, setup.note || t.none, <input value={setup.note || ''} maxLength={300} placeholder={t.notePh} onChange={(e) => set('note', e.target.value)} style={{ width: '100%' }} />, t.optional)}
        {err && <p className="note">{err}</p>}
        <div className="row"><button className="btn" onClick={() => setSetup(null)}>{t.back}</button><span className="grow" />
          <button className="btn primary" disabled={!!busy || !setup.title.trim()} onClick={() => run('make', async () => go(`/lesson/${(await api.create({ areaId, sectionId: chosen?.id || match!.sectionId, request: text || chosen?.title || '', setup: { ...setup, objectives: setup.objectives.filter(Boolean) } })).id}`))}>{t.create}</button></div>
      </div>
    </div>
  );
}

// A lesson, steps 3-6 of Chi's six: Slide · Video · Bài tập · Giao bài. While the agent works, its
// steps show live. Slides: the list, one slide large, the words for the assigner and the source page.
// Video: each part read by the server's local voice, with its subtitles. Practice: grouped by kind,
// "Đã kiểm tra N câu · M câu tạo lại", each item with its details. Then assigning (the confirm box).
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Item, type Lesson, type Slide } from '../api.ts';
import { pl, useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { ask } from '../ask.tsx';
import { go } from '../router.ts';
import { Assign } from './Assign.tsx';
import { keepStep, lessonStep, Stepper } from './Create.tsx';
import { NotFound } from './NotFound.tsx';
import { browserSay, stopSay } from '../speak.ts';
// items the AI second review dropped (the rest of `rejected` failed a code check and were written again)
const aiOut = (l: Lesson) => l.rejected.filter((r) => r.codes?.some((c) => c.startsWith('ai:'))).length;

const T = {
  vi: {
    working: 'Trợ lý đang soạn bài…', queued: (n: number) => `Đang chờ (thứ ${n}): bài sẽ được soạn khi xong việc đang làm. Mỗi tài khoản làm một việc một lúc.`, left: (m: number) => (m > 1 ? `Còn khoảng ${m} phút` : 'Sắp xong'), failed: 'Chưa soạn được bài này.', note: 'Ghi chú của trợ lý', changes: 'Đã sửa', cost: (n: number) => `Bài này dùng ${n} lượt dùng.`, pdf: 'Xuất PDF', printItems: 'In phiếu bài tập',
    slideN: (i: number, n: number) => `Slide ${i} / ${n}`, says: 'Lời giảng cho cô', saysP: 'Gợi ý học cùng con', src: 'Nguồn', toVideo: 'Tiếp: tạo video', drawing: 'Đang vẽ hình minh hoạ…',
    rewrite: 'Viết lại slide này', simpler: 'Đơn giản hơn', addSlide: 'Thêm slide', topicPh: 'Slide mới nói về… (không bắt buộc)', add: 'Thêm',
    makeVideo: 'Tạo video (~3 phút)', remake: 'Tạo lại video', making: (n: string) => `Đang tạo video… ${n}`, download: 'Tải video (MP4)', subsOn: 'Phụ đề bật', speed: 'Tốc độ', slow: 'Chậm (lớp 1, 2)', normal: 'Vừa', fast: 'Nhanh', voices: ['Nữ · miền Bắc'], voicesEn: ['Female (US)', 'Female (UK)', 'Male (US)'], videoErr: 'Chưa tạo được video. Cô thử lại nhé.', enOnly: 'Hiện chỉ làm video cho bài tiếng Anh. Bài tiếng Việt: bấm ▶ để nghe thử bằng giọng của trình duyệt; bài tập và link của con vẫn đọc câu hỏi.', preview: 'Nghe thử từng đoạn',
    redoneWhy: 'Tạo lại vì', edit: 'Sửa', qText: 'Câu hỏi', save: 'Lưu', cancel: 'Huỷ', similar: 'Tạo câu tương tự', addTpl: '+ Thêm mẫu', tplKind: 'Dạng câu', skill: 'Dạng bài', level: 'Mức', create: 'Tạo 2 câu', working2: 'Đang viết…', story: 'Đề bài', unit: 'Đơn vị', wrongs: 'Đáp án sai (cách nhau bằng dấu phẩy)', shown: 'Kết quả ghi trong câu', opts: 'Lựa chọn (cách nhau bằng dấu phẩy)', ans: 'Đáp án', sentence: 'Câu có chỗ trống ___', sayIt: 'Từ được đọc to', words: 'Các từ (cách nhau bằng dấu phẩy)', codeAns: 'Đáp án do code tính.',
    newPic: 'Đổi hình minh họa', cut: 'Cắt từ ảnh của cô', cutHint: 'Chọn ảnh đồ vật (không có người) và gõ tên đồ vật cần cắt.', cutName: 'Ví dụ: quả táo', cutGo: 'Cắt bằng SAM 3.1', cutDone: (n: number) => `Đã cắt ${n} vật.`, busy: 'Đang làm…',
    video: 'Video bài giảng', videoLead: 'Slide + giọng đọc', voice: 'Giọng đọc', parts: 'Các đoạn', subs: 'Phụ đề', toItems: 'Tiếp: bài tập',
    items: 'Bài tập', itemsLead: 'Đọc kỹ từng câu trước khi giao bài.', checked: (n: number, r: number, ai = 0) => `Đã kiểm tra ${n + r} câu · ${r - ai} câu tạo lại${ai ? ` · AI rà soát bỏ ${ai} câu` : ''}`, details: 'Chi tiết', why: 'Lý do tạo lại hoặc bỏ',
    levels: { basic: 'Cơ bản', good: 'Khá', advanced: 'Nâng cao' }, allLevels: 'Tất cả', kind: 'Dạng', explain: 'Lời giải', page: 'Nguồn', remove: 'Xóa', removeAsk: 'Xoá câu này khỏi bài?', seeAll: (n: number) => `Xem cả ${n} câu`, n: (n: number) => `${n} câu`, q: (i: number) => `Câu ${i}.`, tf: { true: 'Đúng', false: 'Sai' }, answer: 'Đáp án',
    groups: { mcq: 'Trắc nghiệm', fill: 'Điền vào ô trống', truefalse: 'Đúng / Sai', word: 'Toán có lời văn', column: 'Đặt tính rồi tính', match: 'Nối từ với hình', listen: 'Nghe và chọn', order: 'Sắp xếp câu', cards: 'Thẻ nhớ', pairs: 'Lật thẻ tìm cặp' }, pairsLead: 'Trò chơi cho em, làm từ thẻ nhớ (4 cặp).', toAssign: 'Duyệt xong, sang giao bài',
  },
  en: {
    working: 'The agent is making your lesson…', queued: (n: number) => `Waiting (number ${n} in your line): the lesson is made once the job before it is done. Each account runs one job at a time.`, left: (m: number) => (m > 1 ? `About ${pl(m, 'minute')} left` : 'Nearly done'), failed: 'This lesson could not be made.', note: "The agent's note", changes: 'Changes', cost: (n: number) => `This lesson used ${pl(n, 'credit')}.`, pdf: 'Export PDF', printItems: 'Print worksheet',
    slideN: (i: number, n: number) => `Slide ${i} / ${n}`, says: 'What you say', saysP: 'Tips for learning together', src: 'Source', toVideo: 'Next: video', drawing: 'Drawing the picture…',
    rewrite: 'Rewrite this slide', simpler: 'Make it simpler', addSlide: 'Add a slide', topicPh: 'The new slide is about… (optional)', add: 'Add',
    makeVideo: 'Make the video (~3 min)', remake: 'Make it again', making: (n: string) => `Making the video… ${n}`, download: 'Download video (MP4)', subsOn: 'Subtitles on', speed: 'Speed', slow: 'Slow (grades 1–2)', normal: 'Normal', fast: 'Fast', voices: ['Female · Northern Vietnamese'], voicesEn: ['Female (US)', 'Female (UK)', 'Male (US)'], videoErr: 'The video could not be made. Please try again.', enOnly: 'Videos are made for English lessons only for now. Vietnamese lessons: press ▶ to hear each part in the browser\'s own voice; practice and the child\'s link still read the questions aloud.', preview: 'Listen to each part',
    redoneWhy: 'Written again because', edit: 'Edit', qText: 'Question', save: 'Save', cancel: 'Cancel', similar: 'Make a similar item', addTpl: '+ Add a template', tplKind: 'Item type', skill: 'Skill', level: 'Level', create: 'Make 2 items', working2: 'Writing…', story: 'Problem', unit: 'Unit', wrongs: 'Wrong options (comma-separated)', shown: 'Result written in the statement', opts: 'Options (comma-separated)', ans: 'Answer', sentence: 'Sentence with a gap ___', sayIt: 'Word read aloud', words: 'Words (comma-separated)', codeAns: 'The answer is worked out by code.',
    newPic: 'New picture', cut: 'Cut out from your photo', cutHint: 'Choose a photo of objects (no people) and type what to cut out.', cutName: 'e.g. apples', cutGo: 'Cut out with SAM 3.1', cutDone: (n: number) => `Cut out ${n}.`, busy: 'Working…',
    video: 'Lesson video', videoLead: 'Slides + narration', voice: 'Voice', parts: 'Parts', subs: 'Subtitles', toItems: 'Next: practice',
    items: 'Practice', itemsLead: 'Read each item before assigning.', checked: (n: number, r: number, ai = 0) => `Checked ${pl(n + r, 'item')} · ${r - ai} written again${ai ? ` · ${ai} removed by the AI review` : ''}`, details: 'Details', why: 'Why they were written again or removed',
    levels: { basic: 'Basic', good: 'Good', advanced: 'Advanced' }, allLevels: 'All', kind: 'Skill', explain: 'Explanation', page: 'Source', remove: 'Delete', removeAsk: 'Remove this item from the lesson?', seeAll: (n: number) => `See all ${n}`, n: (n: number) => `${pl(n, 'item')}`, q: (i: number) => `${i}.`, tf: { true: 'True', false: 'False' }, answer: 'Answer',
    groups: { mcq: 'Multiple choice', fill: 'Fill in the blank', truefalse: 'True / false', word: 'Word problems', column: 'Column calculation', match: 'Match words and pictures', listen: 'Listen and choose', order: 'Put the words in order', cards: 'Flashcards', pairs: 'Find the pairs' }, pairsLead: 'A game for the child, made from the flashcards (4 pairs).', toAssign: 'Reviewed: go to assigning',
  },
};
type Dict = (typeof T)['vi'];

export function LessonPage({ id, parent }: { id: string; parent: boolean }) {
  const t = useT(T), lang = useLang();
  // the step asked for in the link, else the one she left this lesson on (Chi #43), else the slides
  const first = Math.min(6, Math.max(3, Number(new URLSearchParams(location.search).get('step')) || lessonStep(id) || 3));
  const [tick, setTick] = useState(0), [l, setL] = useState<Lesson | null>(null), [step, setStep0] = useState(first), [seen, setSeen] = useState(first), [gone, setGone] = useState(false);
  const setStep = (n: number) => { setStep0(n); setSeen((s) => Math.max(s, n)); };
  useEffect(() => { if (l?.status === 'ready') keepStep(id, l.setup.title, step); }, [id, step, l?.status]);
  // leaving a lesson not assigned yet: a short note says where it is kept (Chi #37)
  const saved = lang === 'en' ? 'The lesson is kept in Lessons → Drafts.' : 'Bài đã lưu ở Bài giảng → Bản nháp.';
  useEffect(() => () => { api.lessons().then((r) => { const row = r.lessons.find((x) => x.id === id); if (row && !row.given) window.dispatchEvent(new CustomEvent('lbm-toast', { detail: saved })); }).catch(() => {}); }, [id]);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try { const { lesson } = await api.lesson(id); if (!alive) return; setL(lesson); if (lesson.status === 'working' || lesson.pictures_pending || String(lesson.video_status).startsWith('working')) timer = setTimeout(load, 1500); }
      catch (e) { if (!alive) return; if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setGone(true); else timer = setTimeout(load, 4000); }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, tick]);
  if (gone) return <NotFound what="lesson" />;
  if (!l) return null;
  const ref = l.refs?.[0], refText = ref ? (lang === 'en' ? ref.en : ref.vi) : '';
  return (
    <div className="page">
      <Stepper parent={parent} at={l.status === 'ready' ? step : 3} done={l.status === 'ready' ? seen : 2} onStep={l.status === 'ready' ? setStep : undefined} open={l.status === 'ready' ? videoOpen(l, lang) : {}} />
      {l.setup.work && <MadeFor l={l} parent={parent} />}
      {l.status !== 'ready' && (
        <div className="card stack" style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2>{l.setup.title}</h2><b>{l.status === 'working' ? t.working : t.failed}</b>
          {l.status === 'working' && (l.queue ? <p className="banner small" role="status">{t.queued(l.queue.place)}</p> : <Progress steps={l.steps} t={t} />)}
          <ol className="steps">{l.steps.map((s, i) => <li key={i} className={i === l.steps.length - 1 && l.status === 'working' ? 'now' : ''}>{lang === 'en' ? s.en : s.vi}</li>)}</ol>
        </div>
      )}
      {l.status === 'ready' && step === 3 && <Slides l={l} t={t} parent={parent} refText={refText} onSlide={(ns) => setL({ ...l, slides: l.slides.map((x) => (x.id === ns.id ? ns : x)) })} onSlides={(slides) => setL({ ...l, slides })} onNext={() => setStep(4)} />}
      {l.status === 'ready' && step === 4 && <Video l={l} t={t} onNext={() => setStep(5)} onStarted={() => setTick((x) => x + 1)} />}
      {l.status === 'ready' && step === 5 && <Practice l={l} t={t} parent={parent} refText={refText} onChange={(items) => setL({ ...l, items })} onNext={() => setStep(6)} />}
      {l.status === 'ready' && step === 6 && <div style={{ maxWidth: 640, margin: '0 auto' }}><Assign lessonId={l.id} parent={parent} checked={l.items.length + l.rejected.length} redone={l.rejected.length - aiOut(l)} removed={aiOut(l)} /></div>}
    </div>
  );
}

function Slides({ l, t, parent, refText, onSlide, onSlides, onNext }: { l: Lesson; t: Dict; parent: boolean; refText: string; onSlide: (s: Slide) => void; onSlides: (s: Slide[]) => void; onNext: () => void }) {
  const lang = useLang(), [i, setI] = useState(0), s = l.slides[i];
  const [busy, setBusy] = useState(false), [cut, setCut] = useState<{ file: File | null; name: string } | null>(null), [msg, setMsg] = useState(''), [adding, setAdding] = useState<string | null>(null), [what, setWhat] = useState('');
  const run = async (fn: () => Promise<void>, label = 'x') => { setWhat(label); setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); } };
  useEffect(() => { setCut(null); setMsg(''); }, [i]);
  if (!s) return null;
  // the code check's mark (Chi, 31 Oct): a slide written again automatically, or one still to check
  const flagOf = (x: Slide) => (x as Slide & { flag?: { fixed: boolean; vi: string; en: string } }).flag;
  const flagWords = (f: { fixed: boolean; vi: string; en: string }) => lang === 'en' ? `${f.fixed ? 'Fixed automatically' : 'Please check'}: ${f.en}` : `${f.fixed ? 'Đã sửa tự động' : 'Kiểm tra lại'}: ${f.vi}`;
  const flag = flagOf(s);
  return (
    <>
      <div className="row noprint" style={{ justifyContent: 'flex-end', marginBottom: 8 }}><button className="btn small" onClick={() => window.print()}>{t.pdf}</button></div>
      <div className="noprint slide-grid">
        <div className="slide-list">{l.slides.map((x, j) => <button key={x.id} className={j === i ? 'on' : ''} onClick={() => setI(j)}>{j + 1}&nbsp; {x.heading}{flagOf(x) && <span title={flagWords(flagOf(x)!)} aria-label={flagWords(flagOf(x)!)} style={{ color: '#8a5200' }}>&nbsp;●</span>}</button>)}</div>
        <div className="stack">
          <div className="slide-big">
            <div className="row"><h2 className="grow">{s.heading}</h2><span className="tag next">{t.slideN(i + 1, l.slides.length)}</span></div>
            {flag && <p className="banner warn small" role="note" style={{ marginTop: 8 }}><b>{flagWords(flag)}.</b> {lang === 'en' ? 'Read this slide before you assign the lesson.' : 'Xem lại slide này trước khi giao bài.'}</p>}
            <div className="row" style={{ alignItems: 'flex-start', marginTop: 12, gap: 18 }}>
              {s.example && <div className="ex" style={{ background: 'var(--leaf-2)', borderRadius: 10, padding: '10px 16px' }}>{s.example}</div>}
              <ul className="grow" style={{ margin: 0 }}>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
              {s.image ? <img src={s.image} alt="" style={{ width: 200, borderRadius: 10 }} /> : l.pictures_pending && <span className="small muted">{t.drawing}</span>}
            </div>
          </div>
          <div className="row">
            <button className="btn small" disabled={busy} onClick={() => run(async () => onSlide((await api.rewriteSlide(l.id, s.id, 'rewrite')).slide), 'rw')}>{busy && what === 'rw' ? t.busy : t.rewrite}</button>
            <button className="btn small" disabled={busy} onClick={() => run(async () => onSlide((await api.rewriteSlide(l.id, s.id, 'simpler')).slide), 'si')}>{busy && what === 'si' ? t.busy : t.simpler}</button>
            <button className="btn small" disabled={busy} onClick={() => run(async () => onSlide((await api.newPicture(l.id, s.id)).slide), 'pic')}>{busy && what === 'pic' ? t.busy : t.newPic}</button>
            <button className="btn small" disabled={busy} onClick={() => setCut(cut ? null : { file: null, name: '' })}>{t.cut}</button>
            <button className="btn small" disabled={busy} onClick={() => setAdding(adding === null ? '' : null)}>{t.addSlide}</button>
          </div>
          {adding !== null && <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api.addSlide(l.id, s.id, adding); onSlides(r.slides); setAdding(null); setI(i + 1); }, 'add'); }}>
            <input className="grow" maxLength={120} placeholder={t.topicPh} value={adding} onChange={(e) => setAdding(e.target.value)} /><button className="btn primary small" disabled={busy}>{busy && what === 'add' ? t.busy : t.add}</button></form>}
          {cut && <div className="card stack small" style={{ gap: 6 }}>
            <p className="muted">{t.cutHint}</p>
            <input type="file" accept="image/*" onChange={(e) => setCut({ ...cut, file: e.target.files?.[0] || null })} />
            <input placeholder={t.cutName} maxLength={40} value={cut.name} onChange={(e) => setCut({ ...cut, name: e.target.value })} />
            <button className="btn primary small" disabled={busy || !cut.file || !cut.name.trim()} onClick={() => run(async () => { const r = await api.cutout(l.id, s.id, (await shrink(cut.file!, 1280)).data, cut.name.trim()); onSlide(r.slide); setCut(null); setMsg(t.cutDone(r.matches)); })}>{busy ? t.busy : t.cutGo}</button>
          </div>}
          {msg && <p className="small note">{msg}</p>}
        </div>
        <div className="stack">
          <div className="card stack" style={{ gap: 4 }}><b className="small">{parent ? t.saysP : t.says}</b><p className="small">“{s.notes}”</p></div>
          {(s.page || refText) && <div className="card small">› <b>{t.src}:</b> {ref(refText, s.page)}</div>}
          {l.agent?.note && <details className="card small"><summary><b>◆ {t.note}</b></summary><p>{l.agent.note}</p>{!!l.agent.changes.length && <p className="muted">{t.changes}: {l.agent.changes.join(' · ')}</p>}{!l.pictures_pending && !!l.credits && <p className="muted">{t.cost(l.credits)}</p>}</details>}
          <button className="btn primary" onClick={onNext}>{t.toVideo}</button>
        </div>
      </div>
      {/* the PDF export prints every slide */}
      <div className="print-only">{l.slides.map((x) => <div key={x.id} className="slide-big"><h2>{x.heading}</h2>{x.example && <div className="ex">{x.example}</div>}<ul>{x.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul></div>)}</div>
    </>
  );
}
// the Video step until the video is there (Chi #53): being made, not made yet, or none (Vietnamese, Chi #49)
const videoOpen = (l: Lesson, lang: string): Record<number, string> => {
  const st = String(l.video_status || 'none'), en = lang === 'en';
  return st === 'ready' ? {} : { 4: l.voiced === false ? (en ? 'English only' : 'chỉ bài tiếng Anh') : st.startsWith('working') ? (en ? 'being made' : 'đang tạo') : (en ? 'not made yet' : 'chưa có') };
};
const ref = (refText: string, page?: number) => (page ? refText.replace(/(tr\.|p\.)\s*[\d–-]+$/, `$1 ${page}`) : refText).replace(/^(Theo|From):\s*/, '');

function Video({ l, t, onNext, onStarted }: { l: Lesson; t: Dict; onNext: () => void; onStarted: () => void }) {
  const [i, setI] = useState(0), [playing, setPlaying] = useState(false), audio = useRef<HTMLAudioElement | null>(null), video = useRef<HTMLVideoElement | null>(null), s = l.slides[i];
  const [subs, setSubs] = useState(l.video?.subtitles ?? true), [voice, setVoice] = useState(0), [speed, setSpeed] = useState(1), [err, setErr] = useState('');
  const status = String(l.video_status || 'none'), working = status.startsWith('working'), v = status === 'ready' ? l.video : null;
  const voices = l.setup.lang === 'en' ? t.voicesEn : t.voices;
  const lang = useLang(), off = l.voiced === false;   // Vietnamese: no video for now, the browser reads aloud (Chi #49)
  const run = useRef(0);   // each play or pause starts a new run: a voice that ends after a pause goes no further
  const stop = () => { run.current++; audio.current?.pause(); stopSay(); setPlaying(false); };
  const play = (j: number) => {
    audio.current?.pause(); stopSay();
    setI(j); setPlaying(true);
    const mine = ++run.current, next = () => { if (mine !== run.current) return; if (j + 1 < l.slides.length) play(j + 1); else setPlaying(false); };
    if (off) { const x = l.slides[j]; browserSay(x.narration || [x.heading, ...x.bullets].join('. '), l.setup.lang, next); return; }
    const a = new Audio(`/api/t/lessons/${l.id}/say/${l.slides[j].id}`);
    a.onended = next;
    a.onerror = () => setPlaying(false);
    audio.current = a; void a.play().catch(() => setPlaying(false));
  };
  useEffect(() => () => { run.current++; audio.current?.pause(); stopSay(); }, []);
  const make = async () => { setErr(''); try { await api.makeVideo(l.id, { subtitles: subs, voice, speed }); onStarted(); } catch (e) { setErr(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } };
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return (
    <div className="cols">
      <div className="stack">
        <div className="row"><div className="grow"><h1>{t.video}</h1><p className="small muted">{t.videoLead}{v ? ` · ${mmss(v.seconds)}` : ''}</p></div>{v && <a className="btn small" href={v.url} download={`${l.setup.title}.mp4`}>{t.download}</a>}</div>
        {v ? <video ref={video} src={v.url} controls style={{ width: '100%', borderRadius: 14, background: '#000' }} /> : (
          <div className="slide-big" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', minHeight: 300 }}>
            {s.image && <img src={s.image} alt="" style={{ maxHeight: 140, borderRadius: 10 }} />}
            <h2>{s.heading}</h2>{s.example && <div className="ex">{s.example}</div>}
            {working ? <b className="small">{t.making(status.split(':')[1] || '')}</b> : <button className="btn primary" style={{ borderRadius: 99, width: 56, height: 56 }} onClick={() => (playing ? stop() : play(i))} aria-label={t.preview}>{playing ? '❚❚' : '▶'}</button>}
          </div>
        )}
        {status === 'error' && <p className="note">{t.videoErr}</p>}{err && <p className="note">{err}</p>}
        <details className="card small"><summary><b>{t.subs}</b></summary><p>{s.narration || s.notes}</p></details>
      </div>
      <div className="stack">
        <div className="card stack small" style={{ gap: 6 }}>
          {!off && <><b>{t.voice}</b>
          <div className="row" style={{ gap: 6 }}><select value={voice} onChange={(e) => setVoice(Number(e.target.value))}>{voices.map((x, j) => <option key={x} value={j}>{x}</option>)}</select>
          <select value={speed} aria-label={t.speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[[0.85, t.slow], [1, t.normal], [1.15, t.fast]].map(([v, n]) => <option key={v} value={v}>{t.speed}: {n}</option>)}</select>
          <label className="check"><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> {t.subsOn}</label></div></>}
          {off ? <p className="small muted">{t.enOnly}</p>
            : <button className="btn small" disabled={working} onClick={make}>{working ? t.making(status.split(':')[1] || '') : v ? t.remake : t.makeVideo}</button>}
        </div>
        <div className="card stack" style={{ gap: 4 }}><b className="small">{v ? t.parts : t.preview}</b>{(v ? v.chapters : l.slides.map((x) => ({ heading: x.heading, start: -1 }))).map((x, j) => (
          <button key={j} className={`list-row small ${j === i ? 'sel' : ''}`} style={{ cursor: 'pointer', padding: '4px 8px' }} onClick={() => { setI(j); if (v && video.current) { video.current.currentTime = x.start; void video.current.play(); } else play(j); }}>
            <span className="grow" style={{ textAlign: 'left' }}>{x.heading}</span><span className="muted">{x.start >= 0 ? mmss(x.start) : '▶'}</span></button>
        ))}</div>
        <button className="btn primary" onClick={onNext}>{t.toItems}</button>
      </div>
    </div>
  );
}

// a column item as the pupil sees it: the sign left of the lower number, ones under ones (Chi #47)
const colOf = (it: Item) => { const a = String(it.a ?? ''), b = `${it.op === '-' ? '−' : it.op ?? ''} ${it.b ?? ''}`, w = Math.max(a.length, b.length); return `${a.padStart(w)}\n${b.padStart(w)}\n${'─'.repeat(w)}`; };

function Practice({ l, t, refText, onChange, onNext, parent = false }: { l: Lesson; t: Dict; refText: string; onChange: (items: Item[]) => void; onNext: () => void; parent?: boolean }) {
  const lang = useLang(), [level, setLevel] = useState<'' | Item['level']>(''), [open, setOpen] = useState(''), [all, setAll] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(''), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [tpl, setTpl] = useState<{ skill: string; template: string; level: string } | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setMsg(''); try { await fn(); } catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(''); } };
  const templates = l.setup.subject === 'math' ? ['mcq', 'fill', 'truefalse', 'word', 'column'] : ['match', 'fill', 'listen', 'order'];
  const items = l.items.filter((i) => !level || i.level === level), skillName = (tag: string) => l.skills.find((k) => k.tag === tag)?.name || tag;
  const kinds = [...new Set(l.items.map((i) => i.template))] as (keyof Dict['groups'])[];
  const first = open || kinds[0];
  const right = (it: Item, o: string) => o.toLowerCase() === it.answer.toLowerCase();
  return (
    <div className="stack" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="row"><div className="grow"><h1>{t.items}</h1><p className="small muted">{t.itemsLead}</p></div>
        <div className="weeks">{(['', 'basic', 'good', 'advanced'] as const).map((v) => <button key={v} className={level === v ? 'on' : ''} onClick={() => setLevel(v)}>{v ? t.levels[v] : t.allLevels}</button>)}</div>
        <button className="btn small noprint" onClick={() => setTpl(tpl ? null : { skill: l.skills[0]?.tag || '', template: templates[0], level: 'good' })}>{t.addTpl}</button>
        <button className="btn small noprint" onClick={() => window.print()}>{t.printItems}</button></div>
      {tpl && <div className="card row noprint">
        <label className="small">{t.tplKind} <select value={tpl.template} onChange={(e) => setTpl({ ...tpl, template: e.target.value })}>{templates.map((k) => <option key={k} value={k}>{t.groups[k as keyof Dict['groups']]}</option>)}</select></label>
        <label className="small">{t.skill} <select value={tpl.skill} onChange={(e) => setTpl({ ...tpl, skill: e.target.value })}>{l.skills.map((k) => <option key={k.tag} value={k.tag}>{k.name}</option>)}</select></label>
        <label className="small">{t.level} <select value={tpl.level} onChange={(e) => setTpl({ ...tpl, level: e.target.value })}>{(['basic', 'good', 'advanced'] as const).map((v) => <option key={v} value={v}>{t.levels[v]}</option>)}</select></label>
        <button className="btn primary small" disabled={!!busy} onClick={() => run('tpl', async () => { const r = await api.addItems(l.id, tpl); onChange(r.items); setOpen(tpl.template); setTpl(null); })}>{busy === 'tpl' ? t.working2 : t.create}</button>
        <button className="btn ghost small" onClick={() => setTpl(null)}>{t.cancel}</button></div>}
      {msg && <p className="note noprint">{msg}</p>}
      <div className="banner row"><b className="grow">✓ {t.checked(l.items.length, l.rejected.length, aiOut(l))}</b>{!!l.rejected.length && <details className="small"><summary>{t.details}</summary><b>{t.why}</b><ul>{l.rejected.map((r, i) => <li key={i}>{r.issues.join('; ')}</li>)}</ul></details>}</div>
      {kinds.map((k) => { const list = items.filter((i) => i.template === k), shown = all[k] ? list : list.slice(0, 3); if (!list.length) return null; return (
        <div key={k} className={`group card ${first === k ? 'on' : ''}`}>
          <button className="group-head" onClick={() => setOpen(first === k ? '-' : k)}><span className="caret">{first === k ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.groups[k] ?? k}</b><span className="small muted" style={{ display: 'block' }}>{t.n(list.length)}</span></span></button>
          {first === k && <div className="stack" style={{ paddingTop: 8 }}>
            {shown.map((it, j) => (
              <div key={it.id} className="list-row" style={{ display: 'grid', gap: 6 }}>
                <div className="row"><b className="small grow">{t.q(j + 1)} {it.prompt}</b>{it.fromWork && <span className="tag repeat">{parent ? (lang === 'en' ? "Practice again from your child's work" : 'Luyện lại từ bài con làm') : (lang === 'en' ? "Practice again from the pupil's work" : 'Luyện lại từ bài em làm')}</span>}<span className="tag next">{t.kind}: {skillName(it.skill)}</span><span className="tag">{t.levels[it.level]}</span></div>
                {it.sentence && <p className="small">{it.sentence}</p>}
                {it.say && <p className="small muted">“{it.say}”</p>}
                {it.options && <div className="opts">{it.options.map((o) => <span key={o} className={right(it, o) ? 'opt right' : 'opt'}>{o}</span>)}</div>}
                {it.template === 'truefalse' && <div className="opts">{(['true', 'false'] as const).map((o) => <span key={o} className={right(it, o) ? 'opt right' : 'opt'}>{t.tf[o]}</span>)}</div>}
                {it.pairs && <div className="opts">{it.pairs.map((p) => <span key={p.word} className="opt right">{p.word} {p.emoji}</span>)}</div>}
                {it.words && <div className="opts">{it.words.map((w, x) => <span key={x} className="opt">{w}</span>)}</div>}
                {it.template === 'column' && <pre className="small" style={{ margin: 0 }}>{colOf(it)}</pre>}
                {(it.template === 'word' || it.template === 'fill' || it.template === 'order' || it.template === 'column') && <p className="small"><b>{t.answer}:</b> {it.answer}{it.unit ? ` ${it.unit}` : ''}</p>}
                <div className="row small"><details className="grow"><summary className="link">{t.details}</summary><p><b>{t.explain}:</b> {it.explain}</p>{!!it.redone?.length && <p className="muted">↻ <b>{t.redoneWhy}:</b> {it.redone.join('; ')}</p>}{refText && <p className="muted">{t.page}: {ref(refText, it.page)}</p>}</details>
                  <button className="btn small noprint" onClick={() => setEditing(editing === it.id ? '' : it.id)}>{t.edit}</button>
                  <button className="btn small noprint" disabled={!!busy} onClick={() => run(it.id, async () => onChange((await api.similarItem(l.id, it.id)).items))}>{busy === it.id ? t.working2 : t.similar}</button>
                  <button className="btn small danger noprint" onClick={async () => { if (await ask(t.removeAsk, { danger: true })) { await api.deleteItem(l.id, it.id); onChange(l.items.filter((x) => x.id !== it.id)); } }}>{t.remove}</button></div>
                {editing === it.id && <ItemEdit it={it} t={t} onSave={async (f) => run('edit', async () => { const r = await api.editItem(l.id, it.id, f); onChange(l.items.map((x) => (x.id === it.id ? r.item : x))); setEditing(''); })} onCancel={() => setEditing('')} />}
              </div>
            ))}
            {list.length > 3 && !all[k] && <button className="link small" style={{ alignSelf: 'start' }} onClick={() => setAll({ ...all, [k]: true })}>{t.seeAll(list.length)}</button>}
          </div>}
        </div>
      ); })}
      {l.cards.length > 0 && <div className={`group card ${first === 'cards' ? 'on' : ''}`}>
        <button className="group-head" onClick={() => setOpen(first === 'cards' ? '-' : 'cards')}><span className="caret">{first === 'cards' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.groups.cards}</b><span className="small muted" style={{ display: 'block' }}>{t.n(l.cards.length)}</span></span></button>
        {first === 'cards' && <div className="cards" style={{ paddingTop: 8 }}>{l.cards.map((c) => <div key={c.id} className="fc"><span className="emo">{c.emoji}</span><b>{c.front}</b><span className="muted">{c.back}</span></div>)}</div>}
      </div>}
      {l.cards.length >= 3 && <div className={`group card ${first === 'pairs' ? 'on' : ''}`}>
        <button className="group-head" onClick={() => setOpen(first === 'pairs' ? '-' : 'pairs')}><span className="caret">{first === 'pairs' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.groups.pairs}</b><span className="small muted" style={{ display: 'block' }}>{t.n(Math.min(4, l.cards.length))}</span></span></button>
        {first === 'pairs' && <div className="stack" style={{ paddingTop: 8 }}><p className="small muted">{t.pairsLead}</p><div className="opts">{l.cards.slice(0, 4).map((c) => <span key={c.id} className="opt right">{c.emoji} {c.front} ↔ {c.back}</span>)}</div></div>}
      </div>}
      <div className="row noprint"><span className="grow" /><button className="btn primary" onClick={onNext}>{t.toAssign}</button></div>
    </div>
  );
}

// Sửa: maths items take her numbers (the answer is always worked out by code); English items take
// her words. The server rebuilds and checks the item before keeping it.
function ItemEdit({ it, t, onSave, onCancel }: { it: Item; t: Dict; onSave: (f: Record<string, unknown>) => void; onCancel: () => void }) {
  const [f, setF] = useState<Record<string, string>>((): Record<string, string> => it.subject === 'math'
    ? { a: String(it.a ?? ''), b: String(it.b ?? ''), shown: String(it.shown ?? ''), wrongs: (it.distractors || []).join(', '), story: it.story || '', unit: it.unit || '', explain: it.explain }
    : { prompt: it.prompt, sentence: it.sentence || '', say: it.say || '', opts: (it.options || []).join(', '), answer: it.answer, words: (it.words || []).join(', '), explain: it.explain });
  const field = (k: string, label: string, wide = false) => <label className="field small" style={wide ? { gridColumn: '1 / -1' } : undefined}>{label}<input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const save = () => onSave(it.subject === 'math'
    ? { a: f.a, b: f.b, ...(it.template === 'truefalse' ? { shown: f.shown } : {}), ...(it.template === 'mcq' ? { distractors: list(f.wrongs).map(Number) } : {}), ...(it.template === 'word' ? { story: f.story, unit: f.unit } : {}), explain: f.explain }
    : { prompt: f.prompt, ...(it.template === 'fill' ? { sentence: f.sentence, options: list(f.opts), answer: f.answer } : {}), ...(it.template === 'listen' ? { say: f.say, options: list(f.opts), answer: f.say } : {}), ...(it.template === 'order' ? { words: list(f.words), answer: f.answer } : {}), explain: f.explain });
  return (
    <form className="card noprint" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
      {it.subject === 'math' ? <>{field('a', 'a')}{field('b', 'b')}{it.template === 'truefalse' && field('shown', t.shown)}{it.template === 'mcq' && field('wrongs', t.wrongs, true)}{it.template === 'word' && <>{field('story', t.story, true)}{field('unit', t.unit)}</>}<span className="small muted" style={{ gridColumn: '1 / -1' }}>{t.codeAns}</span></>
        : <>{field('prompt', t.qText, true)}{it.template === 'fill' && <>{field('sentence', t.sentence, true)}{field('opts', t.opts, true)}{field('answer', t.ans)}</>}{it.template === 'listen' && <>{field('say', t.sayIt)}{field('opts', t.opts, true)}</>}{it.template === 'order' && <>{field('words', t.words, true)}{field('answer', t.ans, true)}</>}</>}
      {field('explain', t.explain, true)}
      <div className="row" style={{ gridColumn: '1 / -1' }}><button className="btn primary small">{t.save}</button><button type="button" className="btn ghost small" onClick={onCancel}>{t.cancel}</button></div>
    </form>
  );
}

// How far the agent is: its steps so far against a typical lesson (about 12 steps, 3-4 minutes).
function Progress({ steps, t }: { steps: { at: string }[]; t: Dict }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(id); }, []);
  const pct = Math.min(95, Math.round((steps.length / 12) * 100)), since = steps[0] ? (Date.now() - Date.parse(steps[0].at)) / 60000 : 0;
  const left = Math.max(1, Math.round(4 * (1 - pct / 100) + Math.max(0, 3 - since) * 0.2));
  return <div className="stack" style={{ gap: 4 }}><span className="meter" style={{ width: '100%', height: 10 }}><i style={{ width: `${pct}%` }} /></span><span className="small muted">{pct}% · {t.left(left)}</span></div>;
}

// Chi #46: a lesson made from the child's marked work says so on every step: who it is for, from which
// work, and the mistakes it opens with (the opening slide and the first practice items are made from them).
function MadeFor({ l, parent }: { l: Lesson; parent: boolean }) {
  const lang = useLang(), w = l.setup.work!, d = `${w.date.slice(8, 10)}/${w.date.slice(5, 7)}`, L = lang === 'en' ? 'en' : 'vi';
  const who = w.child ? (L === 'en' ? `Made for ${w.child} · from the work of ${d}` : `Soạn riêng cho ${w.child} · từ bài làm ngày ${d}`)
    : L === 'en' ? `Made from ${parent ? "your child's" : "a pupil's"} work of ${d}` : `Soạn riêng từ bài ${parent ? 'con' : 'em'} làm ngày ${d}`;
  const counts = L === 'en' ? `${w.total} questions · ${w.right} right · ${w.wrong} wrong` : `${w.total} câu · đúng ${w.right} · sai ${w.wrong}`;
  return <div className="banner warn row" style={{ maxWidth: 980, margin: '0 auto 10px' }}><b className="grow">{who}</b><span className="small">{counts}{w.types.length ? ` · ${w.types.map((x) => `${x.label[L]} ×${x.count}`).join(' · ')}` : ''}</span></div>;
}

// A lesson, steps 3-6 of Chi's six: Slide · Video · Bài tập · Giao bài. While the agent works, its
// steps show live. Slides: the list, one slide large, the words for the assigner and the source page.
// Video: each part read by the server's local voice, with its subtitles. Practice: grouped by kind,
// "Đã kiểm tra N câu · M câu tạo lại", each item with its details. Then assigning (the confirm box).
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Item, type Lesson, type Slide } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { shrink } from '../photo.ts';
import { go } from '../router.ts';
import { Assign } from './Assign.tsx';
import { Stepper } from './Create.tsx';

const T = {
  vi: {
    working: 'Trợ lý đang soạn bài…', failed: 'Chưa soạn được bài này.', note: 'Ghi chú của trợ lý', changes: 'Đã sửa', cost: (n: number) => `Bài này dùng ${n} tín dụng.`, pdf: 'Xuất PDF', printItems: 'In phiếu bài tập',
    slideN: (i: number, n: number) => `Slide ${i} / ${n}`, says: 'Lời giảng cho cô', saysP: 'Gợi ý học cùng con', src: 'Nguồn', toVideo: 'Tiếp: tạo video', drawing: 'Đang vẽ hình minh hoạ…',
    newPic: 'Đổi hình minh họa', cut: 'Cắt từ ảnh của cô', cutHint: 'Chọn ảnh đồ vật (không có người) và gõ tên đồ vật cần cắt.', cutName: 'Ví dụ: quả táo', cutGo: 'Cắt bằng SAM 3.1', cutDone: (n: number) => `Đã cắt ${n} vật.`, busy: 'Đang làm…',
    video: 'Video bài giảng', videoLead: 'Slide + giọng đọc', voice: 'Giọng đọc', voiceVi: 'Nữ · miền Bắc', voiceEn: 'Female · English', parts: 'Các đoạn', subs: 'Phụ đề', play: '▶', toItems: 'Tiếp: bài tập', mp4: 'Tải video MP4: sắp có',
    items: 'Bài tập', itemsLead: 'Đọc kỹ từng câu trước khi giao bài.', checked: (n: number, r: number) => `Đã kiểm tra ${n + r} câu · ${r} câu tạo lại`, details: 'Chi tiết', why: 'Lý do tạo lại',
    levels: { basic: 'Cơ bản', good: 'Khá', advanced: 'Nâng cao' }, allLevels: 'Tất cả', kind: 'Dạng', explain: 'Lời giải', page: 'Nguồn', remove: 'Xóa', removeAsk: 'Xoá câu này khỏi bài?', seeAll: (n: number) => `Xem cả ${n} câu`, n: (n: number) => `${n} câu`, q: (i: number) => `Câu ${i}.`, tf: { true: 'Đúng', false: 'Sai' }, answer: 'Đáp án',
    groups: { mcq: 'Trắc nghiệm', fill: 'Điền vào ô trống', truefalse: 'Đúng / Sai', word: 'Toán có lời văn', match: 'Nối từ với hình', listen: 'Nghe và chọn', order: 'Sắp xếp câu', cards: 'Thẻ nhớ' }, toAssign: 'Duyệt xong, sang giao bài',
  },
  en: {
    working: 'The agent is making your lesson…', failed: 'This lesson could not be made.', note: "The agent's note", changes: 'Changes', cost: (n: number) => `This lesson used ${n} credits.`, pdf: 'Export PDF', printItems: 'Print worksheet',
    slideN: (i: number, n: number) => `Slide ${i} / ${n}`, says: 'What you say', saysP: 'Tips for learning together', src: 'Source', toVideo: 'Next: video', drawing: 'Drawing the picture…',
    newPic: 'New picture', cut: 'Cut out from your photo', cutHint: 'Choose a photo of objects (no people) and type what to cut out.', cutName: 'e.g. apples', cutGo: 'Cut out with SAM 3.1', cutDone: (n: number) => `Cut out ${n}.`, busy: 'Working…',
    video: 'Lesson video', videoLead: 'Slides + narration', voice: 'Voice', voiceVi: 'Female · Northern Vietnamese', voiceEn: 'Female · English', parts: 'Parts', subs: 'Subtitles', play: '▶', toItems: 'Next: practice', mp4: 'MP4 download: coming soon',
    items: 'Practice', itemsLead: 'Read each item before assigning.', checked: (n: number, r: number) => `Checked ${n + r} items · ${r} written again`, details: 'Details', why: 'Why they were written again',
    levels: { basic: 'Basic', good: 'Good', advanced: 'Advanced' }, allLevels: 'All', kind: 'Skill', explain: 'Explanation', page: 'Source', remove: 'Delete', removeAsk: 'Remove this item from the lesson?', seeAll: (n: number) => `See all ${n}`, n: (n: number) => `${n} items`, q: (i: number) => `${i}.`, tf: { true: 'True', false: 'False' }, answer: 'Answer',
    groups: { mcq: 'Multiple choice', fill: 'Fill in the blank', truefalse: 'True / false', word: 'Word problems', match: 'Match words and pictures', listen: 'Listen and choose', order: 'Put the words in order', cards: 'Flashcards' }, toAssign: 'Reviewed: go to assigning',
  },
};
type Dict = (typeof T)['vi'];

export function LessonPage({ id, parent }: { id: string; parent: boolean }) {
  const t = useT(T), lang = useLang();
  const [l, setL] = useState<Lesson | null>(null), [step, setStep0] = useState(3), [seen, setSeen] = useState(3);
  const setStep = (n: number) => { setStep0(n); setSeen((s) => Math.max(s, n)); };
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try { const { lesson } = await api.lesson(id); if (!alive) return; setL(lesson); if (lesson.status === 'working' || lesson.pictures_pending) timer = setTimeout(load, 1500); }
      catch { if (alive) timer = setTimeout(load, 4000); }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);
  if (!l) return null;
  const ref = l.refs?.[0], refText = ref ? (lang === 'en' ? ref.en : ref.vi) : '';
  return (
    <div className="page">
      <Stepper at={l.status === 'ready' ? step : 3} done={l.status === 'ready' ? seen : 2} onStep={l.status === 'ready' ? setStep : undefined} />
      {l.status !== 'ready' && (
        <div className="card stack" style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2>{l.setup.title}</h2><b>{l.status === 'working' ? t.working : t.failed}</b>
          <ol className="steps">{l.steps.map((s, i) => <li key={i} className={i === l.steps.length - 1 && l.status === 'working' ? 'now' : ''}>{lang === 'en' ? s.en : s.vi}</li>)}</ol>
        </div>
      )}
      {l.status === 'ready' && step === 3 && <Slides l={l} t={t} parent={parent} refText={refText} onSlide={(ns) => setL({ ...l, slides: l.slides.map((x) => (x.id === ns.id ? ns : x)) })} onNext={() => setStep(4)} />}
      {l.status === 'ready' && step === 4 && <Video l={l} t={t} onNext={() => setStep(5)} />}
      {l.status === 'ready' && step === 5 && <Practice l={l} t={t} refText={refText} onChange={(items) => setL({ ...l, items })} onNext={() => setStep(6)} />}
      {l.status === 'ready' && step === 6 && <div style={{ maxWidth: 640, margin: '0 auto' }}><Assign lessonId={l.id} parent={parent} /></div>}
    </div>
  );
}

function Slides({ l, t, parent, refText, onSlide, onNext }: { l: Lesson; t: Dict; parent: boolean; refText: string; onSlide: (s: Slide) => void; onNext: () => void }) {
  const lang = useLang(), [i, setI] = useState(0), s = l.slides[i];
  const [busy, setBusy] = useState(false), [cut, setCut] = useState<{ file: File | null; name: string } | null>(null), [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg(e instanceof ApiError ? (lang === 'en' ? e.en : e.vi) : String(e)); } finally { setBusy(false); } };
  useEffect(() => { setCut(null); setMsg(''); }, [i]);
  if (!s) return null;
  return (
    <>
      <div className="row noprint" style={{ justifyContent: 'flex-end', marginBottom: 8 }}><button className="btn small" onClick={() => window.print()}>{t.pdf}</button></div>
      <div className="noprint" style={{ display: 'grid', gridTemplateColumns: '170px minmax(0, 1fr) 240px', gap: 14, alignItems: 'start' }}>
        <div className="slide-list">{l.slides.map((x, j) => <button key={x.id} className={j === i ? 'on' : ''} onClick={() => setI(j)}>{j + 1}&nbsp; {x.heading}</button>)}</div>
        <div className="stack">
          <div className="slide-big">
            <div className="row"><h2 className="grow">{s.heading}</h2><span className="tag next">{t.slideN(i + 1, l.slides.length)}</span></div>
            <div className="row" style={{ alignItems: 'flex-start', marginTop: 12, gap: 18 }}>
              {s.example && <div className="ex" style={{ background: 'var(--leaf-2)', borderRadius: 10, padding: '10px 16px' }}>{s.example}</div>}
              <ul className="grow" style={{ margin: 0 }}>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
              {s.image ? <img src={s.image} alt="" style={{ width: 200, borderRadius: 10 }} /> : l.pictures_pending && <span className="small muted">{t.drawing}</span>}
            </div>
          </div>
          <div className="row">
            <button className="btn small" disabled={busy} onClick={() => run(async () => onSlide((await api.newPicture(l.id, s.id)).slide))}>{busy && !cut ? t.busy : t.newPic}</button>
            <button className="btn small" disabled={busy} onClick={() => setCut(cut ? null : { file: null, name: '' })}>{t.cut}</button>
          </div>
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
const ref = (refText: string, page?: number) => (page ? refText.replace(/(tr\.|p\.)\s*[\d–-]+$/, `$1 ${page}`) : refText).replace(/^(Theo|From):\s*/, '');

function Video({ l, t, onNext }: { l: Lesson; t: Dict; onNext: () => void }) {
  const [i, setI] = useState(0), [playing, setPlaying] = useState(false), audio = useRef<HTMLAudioElement | null>(null), s = l.slides[i];
  const play = (j: number) => {
    audio.current?.pause();
    setI(j); setPlaying(true);
    const a = new Audio(`/api/t/lessons/${l.id}/say/${l.slides[j].id}`);
    a.onended = () => { if (j + 1 < l.slides.length) play(j + 1); else setPlaying(false); };
    a.onerror = () => setPlaying(false);
    audio.current = a; void a.play().catch(() => setPlaying(false));
  };
  useEffect(() => () => audio.current?.pause(), []);
  return (
    <div className="cols">
      <div className="stack">
        <div><h1>{t.video}</h1><p className="small muted">{t.videoLead}</p></div>
        <div className="slide-big" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', minHeight: 300, position: 'relative' }}>
          {s.image && <img src={s.image} alt="" style={{ maxHeight: 140, borderRadius: 10 }} />}
          <h2>{s.heading}</h2>{s.example && <div className="ex">{s.example}</div>}
          <button className="btn primary" style={{ borderRadius: 99, width: 56, height: 56 }} onClick={() => (playing ? (audio.current?.pause(), setPlaying(false)) : play(i))} aria-label="play">{playing ? '❚❚' : '▶'}</button>
        </div>
        <details className="card small"><summary><b>{t.subs}</b></summary><p>{s.narration || s.notes}</p></details>
      </div>
      <div className="stack">
        <div className="card small"><b>{t.voice}</b><p className="muted">{l.setup.lang === 'en' ? t.voiceEn : t.voiceVi}</p><p className="muted">{t.mp4}</p></div>
        <div className="card stack" style={{ gap: 4 }}><b className="small">{t.parts}</b>{l.slides.map((x, j) => <button key={x.id} className={`list-row small ${j === i ? 'sel' : ''}`} style={{ cursor: 'pointer', padding: '4px 8px' }} onClick={() => play(j)}><span className="grow" style={{ textAlign: 'left' }}>{x.heading}</span>▶</button>)}</div>
        <button className="btn primary" onClick={onNext}>{t.toItems}</button>
      </div>
    </div>
  );
}

function Practice({ l, t, refText, onChange, onNext }: { l: Lesson; t: Dict; refText: string; onChange: (items: Item[]) => void; onNext: () => void }) {
  const [level, setLevel] = useState<'' | Item['level']>(''), [open, setOpen] = useState(''), [all, setAll] = useState<Record<string, boolean>>({});
  const items = l.items.filter((i) => !level || i.level === level), skillName = (tag: string) => l.skills.find((k) => k.tag === tag)?.name || tag;
  const kinds = [...new Set(l.items.map((i) => i.template))] as (keyof Dict['groups'])[];
  const first = open || kinds[0];
  const right = (it: Item, o: string) => o.toLowerCase() === it.answer.toLowerCase();
  return (
    <div className="stack" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="row"><div className="grow"><h1>{t.items}</h1><p className="small muted">{t.itemsLead}</p></div>
        <div className="weeks">{(['', 'basic', 'good', 'advanced'] as const).map((v) => <button key={v} className={level === v ? 'on' : ''} onClick={() => setLevel(v)}>{v ? t.levels[v] : t.allLevels}</button>)}</div>
        <button className="btn small noprint" onClick={() => window.print()}>{t.printItems}</button></div>
      <div className="banner row"><b className="grow">✓ {t.checked(l.items.length, l.rejected.length)}</b>{!!l.rejected.length && <details className="small"><summary>{t.details}</summary><b>{t.why}</b><ul>{l.rejected.map((r, i) => <li key={i}>{r.issues.join('; ')}</li>)}</ul></details>}</div>
      {kinds.map((k) => { const list = items.filter((i) => i.template === k), shown = all[k] ? list : list.slice(0, 3); if (!list.length) return null; return (
        <div key={k} className={`group card ${first === k ? 'on' : ''}`}>
          <button className="group-head" onClick={() => setOpen(first === k ? '-' : k)}><span className="caret">{first === k ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.groups[k] ?? k}</b><span className="small muted" style={{ display: 'block' }}>{t.n(list.length)}</span></span></button>
          {first === k && <div className="stack" style={{ paddingTop: 8 }}>
            {shown.map((it, j) => (
              <div key={it.id} className="list-row" style={{ display: 'grid', gap: 6 }}>
                <div className="row"><b className="small grow">{t.q(j + 1)} {it.prompt}</b><span className="tag next">{t.kind}: {skillName(it.skill)}</span><span className="tag">{t.levels[it.level]}</span></div>
                {it.sentence && <p className="small">{it.sentence}</p>}
                {it.say && <p className="small muted">🔊 “{it.say}”</p>}
                {it.options && <div className="opts">{it.options.map((o) => <span key={o} className={right(it, o) ? 'opt right' : 'opt'}>{o}</span>)}</div>}
                {it.template === 'truefalse' && <div className="opts">{(['true', 'false'] as const).map((o) => <span key={o} className={right(it, o) ? 'opt right' : 'opt'}>{t.tf[o]}</span>)}</div>}
                {it.pairs && <div className="opts">{it.pairs.map((p) => <span key={p.word} className="opt right">{p.word} {p.emoji}</span>)}</div>}
                {it.words && <div className="opts">{it.words.map((w, x) => <span key={x} className="opt">{w}</span>)}</div>}
                {(it.template === 'word' || it.template === 'fill' || it.template === 'order') && <p className="small"><b>{t.answer}:</b> {it.answer}{it.unit ? ` ${it.unit}` : ''}</p>}
                <div className="row small"><details className="grow"><summary className="link">{t.details}</summary><p>💡 <b>{t.explain}:</b> {it.explain}</p>{refText && <p className="muted">{t.page}: {refText.replace(/^(Theo|From):\s*/, '')}</p>}</details>
                  <button className="btn small danger noprint" onClick={async () => { if (confirm(t.removeAsk)) { await api.deleteItem(l.id, it.id); onChange(l.items.filter((x) => x.id !== it.id)); } }}>{t.remove}</button></div>
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
      <div className="row noprint"><span className="grow" /><button className="btn primary" onClick={onNext}>{t.toAssign}</button></div>
    </div>
  );
}

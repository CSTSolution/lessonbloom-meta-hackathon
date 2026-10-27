// One lesson. While the agent works: its steps, live. Then: its note, the slides, the practice
// (each item with its answer, as the teacher reviews it) and the flashcards.
import { useEffect, useState } from 'react';
import { api, type Item, type Lesson } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: {
    back: '← Bài giảng', working: 'Trợ lý đang soạn bài…', failed: 'Chưa soạn được bài này.', note: 'Ghi chú của trợ lý', changes: 'Đã sửa',
    tabs: { slides: 'Slide', practice: 'Bài luyện tập', cards: 'Thẻ nhớ' }, teacherSays: 'Lời giảng', source: 'Từ ghi chú của cô',
    levels: { basic: 'Cơ bản', good: 'Khá', advanced: 'Nâng cao' }, answer: 'Đáp án', checked: (n: number, r: number) => `${n} câu, tất cả đã qua bộ kiểm tra bằng code${r ? ` (đã loại ${r} câu chưa đạt)` : ''}.`,
    tf: { true: 'Đúng', false: 'Sai' }, unit: 'Đơn vị',
  },
  en: {
    back: '← Lessons', working: 'The agent is making your lesson…', failed: 'This lesson could not be made.', note: "The agent's note", changes: 'Changes',
    tabs: { slides: 'Slides', practice: 'Practice', cards: 'Flashcards' }, teacherSays: 'You say', source: 'From your notes',
    levels: { basic: 'Basic', good: 'Good', advanced: 'Advanced' }, answer: 'Answer', checked: (n: number, r: number) => `${n} items, every one passed the code checks${r ? ` (${r} rejected items left out)` : ''}.`,
    tf: { true: 'True', false: 'False' }, unit: 'Unit',
  },
};

function ItemView({ it, t }: { it: Item; t: (typeof T)['vi'] }) {
  const right = (o: string) => o.toLowerCase() === it.answer.toLowerCase();
  return (
    <div className="item">
      <div className="row small"><span className={`chip lv-${it.level}`}>{t.levels[it.level]}</span><span className="muted">{it.id}</span></div>
      <p className="q">{it.prompt}</p>
      {it.sentence && <p className="q">{it.sentence}</p>}
      {it.say && <p className="small muted">🔊 “{it.say}”</p>}
      {it.options && <div className="opts">{it.options.map((o) => <span key={o} className={right(o) ? 'opt right' : 'opt'}>{o}</span>)}</div>}
      {it.template === 'truefalse' && <div className="opts">{(['true', 'false'] as const).map((o) => <span key={o} className={right(o) ? 'opt right' : 'opt'}>{t.tf[o]}</span>)}</div>}
      {it.pairs && <div className="opts">{it.pairs.map((p) => <span key={p.word} className="opt right">{p.word} {p.emoji}</span>)}</div>}
      {it.words && <div className="opts">{it.words.map((w, i) => <span key={i} className="opt">{w}</span>)}</div>}
      {(it.template === 'word' || it.template === 'fill' || it.template === 'order') && <p className="small"><b>{t.answer}:</b> {it.answer}{it.unit ? ` ${it.unit}` : ''}</p>}
      <p className="small muted">💡 {it.explain}</p>
    </div>
  );
}

export function LessonPage({ id }: { id: string }) {
  const t = useT(T), lang = useLang();
  const [l, setL] = useState<Lesson | null>(null), [tab, setTab] = useState<'slides' | 'practice' | 'cards'>('slides');
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try { const { lesson } = await api.lesson(id); if (!alive) return; setL(lesson); if (lesson.status === 'working') timer = setTimeout(load, 1500); }
      catch { if (alive) timer = setTimeout(load, 4000); }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);
  if (!l) return null;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <button className="btn ghost" style={{ alignSelf: 'start' }} onClick={() => go('/')}>{t.back}</button>
      <h1>{l.setup.title}</h1>
      {l.status !== 'ready' && (
        <div className="card stack">
          <h2>{l.status === 'working' ? t.working : t.failed}</h2>
          <ol className="steps">{l.steps.map((s, i) => <li key={i} className={i === l.steps.length - 1 && l.status === 'working' ? 'now' : ''}>{lang === 'en' ? s.en : s.vi}</li>)}</ol>
        </div>
      )}
      {l.status === 'ready' && <>
        {l.agent?.note && <div className="card agent"><strong>◆ {t.note}</strong><p>{l.agent.note}</p>{!!l.agent.changes.length && <p className="small muted">{t.changes}: {l.agent.changes.join(' · ')}</p>}</div>}
        <div className="seg" role="tablist">{(['slides', 'practice', 'cards'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t.tabs[k]} <span className="muted">{k === 'slides' ? l.slides.length : k === 'practice' ? l.items.length : l.cards.length}</span></button>)}</div>
        {tab === 'slides' && <div className="slides">{l.slides.map((s, i) => (
          <article key={s.id} className={`slide k-${s.kind}`}>
            <span className="small muted">{i + 1} / {l.slides.length}</span>
            <h3>{s.heading}</h3>
            {s.bullets.length > 0 && <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
            {s.example && <div className="ex">{s.example}</div>}
            <p className="small"><b>{t.teacherSays}:</b> {s.notes}</p>
            {s.source && <p className="small muted">“{s.source}” · {t.source}</p>}
          </article>
        ))}</div>}
        {tab === 'practice' && <div className="stack">
          <p className="small muted">{t.checked(l.items.length, l.rejected.length)}</p>
          {l.skills.map((k) => <section key={k.tag} className="stack"><h3>{k.name}</h3><div className="items">{l.items.filter((i) => i.skill === k.tag).map((it) => <ItemView key={it.id} it={it} t={t} />)}</div></section>)}
        </div>}
        {tab === 'cards' && <div className="cards">{l.cards.map((c) => <div key={c.id} className="fc"><span className="emo">{c.emoji}</span><b>{c.front}</b><span className="muted">{c.back}</span></div>)}</div>}
      </>}
    </div>
  );
}

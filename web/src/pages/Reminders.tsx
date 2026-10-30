// "Cài đặt lời nhắc": two groups (for learners, for the assigner), the time and an on/off for each.
// In the app only (no Zalo, no email); at most one a day for a learner; never after 20:00.
import { useEffect, useState } from 'react';
import { api, type ReminderSettings } from '../api.ts';
import { useT } from '../i18n.ts';

const T = {
  vi: {
    title: 'Cài đặt lời nhắc', lead: 'Chọn lời nhắc gửi cho người học và cho bạn.', save: 'Lưu', saved: 'Đã lưu.', pupils: 'Cho người học', me: 'Cho người giao bài', on: (n: number, k: number) => `${n}/${k} đang bật`,
    session: 'Nhắc buổi học', sessionSub: 'Ngày có buổi học (bắt đầu và giữa bài).', at: 'Lúc', cards: 'Nhắc ôn thẻ nhớ', cardsSub: 'Sau 2–3 ngày.', start: 'Ngày bắt đầu bài', twoDays: 'Còn 2 ngày', twoDaysSub: 'Kèm gợi ý kéo dài 1 tuần nếu chưa kịp.', end: 'Hết thời gian bài', endSub: 'Tóm tắt dạng đã vững, đang luyện, gợi ý bài tiếp.',
    preview: 'Xem trước lời nhắc', kind: 'Nhắc buổi học', sample: (n: string) => `Hôm nay là buổi học của ${n}! Con ôn phép cộng có nhớ và 8 thẻ nhớ nhé.`, open: 'Bắt đầu buổi học', merge: 'Trùng ngày học và ngày ôn: gộp làm một.', rules: 'Chỉ trên app · tối đa 1 lần/ngày · không sau 20:00.', child: 'An',
  },
  en: {
    title: 'Reminder settings', lead: 'Choose the reminders for learners and for you.', save: 'Save', saved: 'Saved.', pupils: 'For learners', me: 'For you', on: (n: number, k: number) => `${n}/${k} on`,
    session: 'Session reminder', sessionSub: 'On lesson days (the start and the middle).', at: 'At', cards: 'Flashcard review', cardsSub: 'After 2–3 days.', start: 'A lesson starts', twoDays: '2 days left', twoDaysSub: 'With a suggestion to add a week if needed.', end: 'Time is up', endSub: 'What is mastered, what is practised, what next.',
    preview: 'Preview', kind: 'Session reminder', sample: (n: string) => `Today is ${n}'s lesson! Practise adding with carrying and 8 flashcards.`, open: 'Start the session', merge: 'A lesson day and a review day together become one reminder.', rules: 'In the app only · at most once a day · never after 20:00.', child: 'An',
  },
};

export function Reminders({ parent: _parent }: { parent: boolean }) {
  const t = useT(T), [r, setR] = useState<ReminderSettings | null>(null), [open, setOpen] = useState('pupils'), [msg, setMsg] = useState('');
  useEffect(() => { api.reminders().then((x) => setR(x.reminders)).catch(() => {}); }, []);
  if (!r) return null;
  const sw = (k: keyof ReminderSettings) => <button className={`switch ${r[k] ? 'on' : ''}`} aria-pressed={!!r[k]} onClick={() => setR({ ...r, [k]: !r[k] })} />;
  const item = (title: string, sub: string, k: keyof ReminderSettings, extra?: React.ReactNode) => <div className="row" style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}><span className="grow"><b className="small">{title}</b><span className="small muted" style={{ display: 'block' }}>{sub}</span></span>{extra}{sw(k)}</div>;
  const times = ['16:00', '17:00', '18:00', '19:00', '20:00'];
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row"><div className="grow"><h1>{t.title}</h1><p className="small muted">{t.lead}</p></div><button className="btn primary" onClick={async () => { setR((await api.saveReminders(r)).reminders); setMsg(t.saved); }}>{t.save}</button></div>
      {msg && <p className="banner small" style={{ marginTop: 8 }}>{msg}</p>}
      <div className="cols" style={{ marginTop: 12 }}>
        <div className="stack">
          <div className={`group card ${open === 'pupils' ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === 'pupils' ? '' : 'pupils')}><span className="caret">{open === 'pupils' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.pupils}</b><span className="small muted" style={{ display: 'block' }}>{t.on(+r.pupilSession + +r.pupilCards, 2)} · {r.time}</span></span></button>
            {open === 'pupils' && <div style={{ paddingTop: 6 }}>
              {item(t.session, t.sessionSub, 'pupilSession', <label className="small">{t.at} <select value={r.time} onChange={(e) => setR({ ...r, time: e.target.value })}>{times.map((x) => <option key={x}>{x}</option>)}</select></label>)}
              {item(t.cards, t.cardsSub, 'pupilCards')}
            </div>}</div>
          <div className={`group card ${open === 'me' ? 'on' : ''}`}><button className="group-head" onClick={() => setOpen(open === 'me' ? '' : 'me')}><span className="caret">{open === 'me' ? '▾' : '▸'}</span><span className="grow"><b className="small">{t.me}</b><span className="small muted" style={{ display: 'block' }}>{t.on(+r.assignerStart + +r.assignerTwoDays + +r.assignerEnd, 3)}</span></span></button>
            {open === 'me' && <div style={{ paddingTop: 6 }}>{item(t.start, '', 'assignerStart')}{item(t.twoDays, t.twoDaysSub, 'assignerTwoDays')}{item(t.end, t.endSub, 'assignerEnd')}</div>}</div>
        </div>
        <aside className="stack">
          <div className="card stack" style={{ gap: 6 }}><b className="small">{t.preview}</b>
            <div className="banner warn stack" style={{ gap: 4 }}><span className="tag next" style={{ alignSelf: 'start' }}>{t.kind}</span><span className="small muted">LessonBloom · {r.time}</span><b className="small">{t.sample(t.child)}</b><span className="btn primary small" style={{ alignSelf: 'start' }}>{t.open}</span></div>
            <span className="small muted">{t.merge}</span></div>
          <div className="banner small">{t.rules}</div>
        </aside>
      </div>
    </div>
  );
}

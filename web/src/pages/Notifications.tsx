// "Thông báo" (Chi's phone screen for parents, on every screen size): the in-app reminders of the last
// two weeks and the coming week, grouped by day, for each class or child.
import { useEffect, useState } from 'react';
import { api, type Reminder } from '../api.ts';
import { useLang, useT } from '../i18n.ts';
import { go } from '../router.ts';

const T = {
  vi: { title: 'Thông báo', lead: 'Chỉ trên app · tối đa 1 lần/ngày cho người học · không sau 20:00.', today: 'Hôm nay', soon: 'Sắp tới', none: 'Chưa có thông báo. Lập lộ trình học để LessonBloom tự nhắc.', toPupils: 'Nhắc học sinh', toChild: 'Nhắc con', toMe: 'Cho bạn', path: 'Mở lộ trình học', settings: 'Cài đặt lời nhắc' },
  en: { title: 'Notifications', lead: 'In the app only · at most once a day for a learner · never after 20:00.', today: 'Today', soon: 'Coming up', none: 'No notifications yet. Set up a learning path and LessonBloom reminds for you.', toPupils: 'To pupils', toChild: 'To your child', toMe: 'For you', path: 'Open the learning path', settings: 'Reminder settings' },
};
const label = (d: string, today: string, lang: string, t: (typeof T)['vi']) => (d === today ? t.today : new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' }));

export function Notifications({ parent }: { parent: boolean }) {
  const t = useT(T), lang = useLang();
  const [v, setV] = useState<{ today: string; notifications: (Reminder & { className: string })[] } | null>(null);
  useEffect(() => { api.notifications().then(setV).catch(() => setV({ today: '', notifications: [] })); }, []);
  if (!v) return null;
  // today and the days before first (newest first), then what is coming (soonest first)
  const all = [...new Set(v.notifications.map((n) => n.date))], days = [...all.filter((d) => d <= v.today).sort().reverse(), ...all.filter((d) => d > v.today).sort()];
  return (
    <div className="page narrow">
      <div className="row"><div className="grow"><h1>{t.title}</h1><p className="small muted">{t.lead}</p></div><button className="btn small" onClick={() => go('/reminders')}>{t.settings}</button></div>
      {!days.length && <div className="card" style={{ marginTop: 12 }}><p className="muted">{t.none}</p><button className="link small" onClick={() => go('/path')}>{t.path}</button></div>}
      <div className="stack" style={{ marginTop: 12 }}>{days.map((d) => (
        <div key={d} className="card stack" style={{ gap: 6, opacity: d > v.today ? 0.75 : 1 }}>
          <b className="small">{d > v.today ? `${t.soon} · ` : ''}{label(d, v.today, lang, t)}</b>
          {v.notifications.filter((n) => n.date === d).map((n, i) => (
            <div key={i} className="list-row small" style={{ alignItems: 'flex-start' }}><span className={`tag ${n.who === 'assigner' ? 'ai' : 'next'}`}>{n.who === 'assigner' ? t.toMe : parent ? t.toChild : t.toPupils}</span>
              <span className="grow"><b>{n.className}</b> · {lang === 'en' ? n.en : n.vi}</span></div>
          ))}
        </div>
      ))}</div>
    </div>
  );
}

// Labels by code (Chi's appendix 3): for each learner and skill, from her own recent answers only.
//   Đã vững (solid)       at least `solid`% right in the last `recent` answers (with at least `min` answers)
//   Lỗi lặp lại (repeat)  under `repeat`% right, or the same kind of mistake `same` times within `sessions` sessions
//   Đang luyện (practising) anything else, or not enough answers yet
// A class: "repeat" when at least classRepeat% of its learners are, "solid" when classSolid% are.
// Learners never see a label, a score or a percentage; the assigner sees labels per skill only.
import type { Item } from '../lesson/types.ts';
import { compute } from '../lesson/items.ts';

export interface Criteria { recent: number; min: number; solid: number; repeat: number; same: number; sessions: number; classRepeat: number; classSolid: number }
export const DEFAULT_CRITERIA: Criteria = { recent: 10, min: 5, solid: 80, repeat: 50, same: 3, sessions: 2, classRepeat: 30, classSolid: 70 };
export type Label = 'solid' | 'practising' | 'repeat';

export function cleanCriteria(x: unknown): Criteria {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>, c = { ...DEFAULT_CRITERIA };
  const n = (k: keyof Criteria, lo: number, hi: number) => { const v = Math.round(Number(o[k])); if (Number.isFinite(v) && v >= lo && v <= hi) c[k] = v; };
  n('recent', 3, 50); n('min', 1, 50); n('solid', 50, 100); n('repeat', 0, 90); n('same', 2, 10); n('sessions', 1, 10); n('classRepeat', 5, 100); n('classSolid', 10, 100);
  if (c.repeat >= c.solid) c.repeat = Math.max(0, c.solid - 10);
  return c;
}

// The kind of mistake in a wrong maths answer, worked out by code (the common ones children make).
export function mistakeOf(it: Item | undefined, given: string, lang: 'vi' | 'en' = 'vi'): string | null {
  if (!it || it.subject !== 'math' || it.template === 'truefalse') return null;
  const g = Number(String(given).trim()), right = Number(it.answer);
  if (!Number.isFinite(g) || g === right) return null;
  const vi = lang === 'vi';
  if (it.op === '+' && g === right - 10) return vi ? 'Quên nhớ 1 sang hàng chục' : 'Forgot to carry 1 to the tens';
  if (it.op === '-' && g === right + 10) return vi ? 'Quên trừ 1 ở hàng chục (mượn)' : 'Forgot to take 1 from the tens (borrowing)';
  if (it.op === '-' && it.template !== 'fill') {
    const ua = it.a % 10, ub = it.b % 10;
    if (ua < ub && g % 10 === ub - ua) return vi ? 'Lấy số nhỏ trừ số lớn ở hàng đơn vị' : 'Took the smaller from the larger in the ones';
  }
  if (it.op === '+' && g === compute(it.a, '-', it.b)) return vi ? 'Làm phép trừ thay vì phép cộng' : 'Subtracted instead of adding';
  if (it.op === '-' && g === compute(it.a, '+', it.b)) return vi ? 'Làm phép cộng thay vì phép trừ' : 'Added instead of subtracting';
  return vi ? 'Tính sai' : 'Wrong calculation';
}

export interface Answer { item_id: string; skill: string; correct: boolean; answer: string; at: string; day: string }
export function labelOf(answers: Answer[], items: Map<string, Item>, c: Criteria, lang: 'vi' | 'en' = 'vi'): { label: Label; right: number; of: number; mistake: string | null } {
  const recent = answers.slice(-c.recent), right = recent.filter((a) => a.correct).length, of = recent.length;
  const days = [...new Set(answers.map((a) => a.day))].slice(-c.sessions);
  const counts = new Map<string, number>();
  for (const a of answers) if (!a.correct && days.includes(a.day)) { const m = mistakeOf(items.get(a.item_id), a.answer, lang); if (m) counts.set(m, (counts.get(m) || 0) + 1); }
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
  const repeatedMistake = top && top[1] >= c.same ? top[0] : null;
  if (repeatedMistake) return { label: 'repeat', right, of, mistake: repeatedMistake };
  if (of < c.min) return { label: 'practising', right, of, mistake: top?.[0] ?? null };
  const pct = (100 * right) / of;
  return { label: pct >= c.solid ? 'solid' : pct < c.repeat ? 'repeat' : 'practising', right, of, mistake: top?.[0] ?? null };
}

export function classLabel(labels: Label[], c: Criteria): Label {
  if (!labels.length) return 'practising';
  const share = (l: Label) => (100 * labels.filter((x) => x === l).length) / labels.length;
  return share('repeat') >= c.classRepeat ? 'repeat' : share('solid') >= c.classSolid ? 'solid' : 'practising';
}

// Dates in Vietnam days, as YYYY-MM-DD strings.
export const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();   // 0 Sunday … 6 Saturday
export const mondayOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7));
// a reminder that falls on Saturday moves to Friday, on Sunday to Monday (Chi)
export const schoolDay = (d: string) => (weekday(d) === 6 ? addDays(d, -1) : weekday(d) === 0 ? addDays(d, 1) : d);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

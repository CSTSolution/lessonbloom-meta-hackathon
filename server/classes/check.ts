// A pupil's answer, checked on the server against the answer code worked out (pupils never receive it),
// and the item as a pupil may see it: no answer, no explanation, no words that are read aloud.
import type { Item } from '../lesson/types.ts';

const norm = (s: unknown) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[“”"'’.!?,;:]/g, ' ').replace(/\s+/g, ' ').trim();
const pairsOf = (s: string) => new Set(String(s).split(',').map((p) => p.split('=').map(norm).join('=')).filter((p) => p.includes('=')));

export function isRight(it: Item, given: unknown): boolean {
  const g = String(given ?? '').slice(0, 500);
  if (it.subject === 'math') {
    if (it.template === 'truefalse') return norm(g) === it.answer;
    const n = Number(g.trim().replace(',', '.'));
    return g.trim() !== '' && Number.isFinite(n) && n === Number(it.answer);
  }
  if (it.template === 'match') { const a = pairsOf(it.answer), b = pairsOf(g); return a.size > 0 && a.size === b.size && [...a].every((p) => b.has(p)); }
  return norm(g) !== '' && norm(g) === norm(it.answer);
}

// The hint after a wrong answer: the explanation with the answer itself hidden, so it helps her think
// rather than giving it away (the whole explanation comes once she has it right).
// Maths: a nudge chosen by code from the kind of mistake (the model's explanations spell the answer out
// digit by digit, so they are kept for after a right answer).
const NUDGE: Record<string, { vi: string; en: string }> = {
  carry: { vi: 'Con nhớ thêm 1 sang hàng chục nhé.', en: 'Remember to carry 1 to the tens.' },
  borrow: { vi: 'Hàng đơn vị chưa đủ để trừ: con mượn 1 chục nhé.', en: 'The ones are too small: take 1 ten first.' },
  flip: { vi: 'Ở hàng đơn vị, con lấy số trên trừ số dưới nhé.', en: 'In the ones, take the bottom digit from the top one.' },
  op: { vi: 'Con xem lại dấu của phép tính nhé.', en: 'Look again at the sign.' },
  close: { vi: 'Gần đúng rồi! Con tính lại thật cẩn thận nhé.', en: 'So close! Work it out again carefully.' },
  plus: { vi: 'Con cộng hàng đơn vị trước, rồi đến hàng chục.', en: 'Add the ones first, then the tens.' },
  minus: { vi: 'Con trừ hàng đơn vị trước, rồi đến hàng chục.', en: 'Subtract the ones first, then the tens.' },
  times: { vi: 'Con đọc lại bảng nhân nhé.', en: 'Say the times table again.' },
  share: { vi: 'Con nghĩ: số nào nhân với số chia thì ra số bị chia?', en: 'Think: what times the divisor gives the number?' },
};
function mathNudge(it: Item & { subject: 'math' }, given: string, lang: 'vi' | 'en'): string {
  const g = Number(String(given).trim()), right = Number(it.answer);
  let k = it.op === '+' ? 'plus' : it.op === '-' ? 'minus' : it.op === '×' ? 'times' : 'share';
  if (it.template !== 'truefalse' && Number.isFinite(g)) {
    // one away from the answer is a slip in counting, not the wrong sign (Chi #24: 18 for 17)
    if (Math.abs(g - right) === 1) k = 'close';
    else if (it.op === '+' && g === right - 10) k = 'carry';
    else if (it.op === '-' && g === right + 10) k = 'borrow';
    else if (it.op === '-' && it.a % 10 < it.b % 10 && g % 10 === (it.b % 10) - (it.a % 10)) k = 'flip';
    else if ((it.op === '+' && g === it.a - it.b) || (it.op === '-' && g === it.a + it.b)) k = 'op';
  }
  return NUDGE[k][lang];
}

export function hintOf(it: Item, given = '', lang: 'vi' | 'en' = 'vi'): string {
  if (it.subject === 'math') return mathNudge(it, given, lang);
  const x = String(it.explain || '');
  // English: these explanations are the answer itself (the sentence, the pairs): no hint; others hide the word
  if (!x || it.template === 'match' || it.template === 'order') return '';
  const esc = it.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return x.replace(new RegExp(`(?<!\\p{L})${esc}(?!\\p{L})`, 'giu'), '___');
}

// Deterministic shuffle, so a pupil sees the same order every time she opens the item.
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = [...seed].reduce((s, c) => (s * 33 + c.charCodeAt(0)) >>> 0, 11);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { h = (h * 1664525 + 1013904223) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export interface PupilItem { id: string; template: string; prompt: string; options?: string[]; sentence?: string; words?: string[]; left?: string[]; right?: string[]; unit?: string; listen?: boolean }
export function forPupil(it: Item): PupilItem {
  const out: PupilItem = { id: it.id, template: it.template, prompt: it.prompt };
  if (it.options?.length) out.options = it.options;
  if (it.subject === 'math') { if (it.template === 'word' && it.unit) out.unit = it.unit; return out; }
  if (it.sentence) out.sentence = it.sentence;
  if (it.template === 'order' && it.words) out.words = it.words;
  if (it.template === 'match' && it.pairs) { out.left = shuffle(it.pairs.map((p) => p.word), it.id + 'l'); out.right = shuffle(it.pairs.map((p) => p.emoji), it.id + 'r'); }
  if (it.template === 'listen') out.listen = true;
  return out;
}

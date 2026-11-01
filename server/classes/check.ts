// A pupil's answer, checked on the server against the answer code worked out (pupils never receive it),
// and the item as a pupil may see it: no answer, no explanation, no words that are read aloud.
import { numberWords } from '../lesson/items.ts';
import type { Item } from '../lesson/types.ts';

const norm = (s: unknown) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[“”"'’.!?,;:]/g, ' ').replace(/\s+/g, ' ').trim();
// a number in words, as text: case, spaces and hyphens do not count ("Three hundred and twenty-one")
const say = (s: unknown) => norm(s).replace(/[-‐–]/g, ' ').replace(/\s+/g, ' ').trim();
const pairsOf = (s: string) => new Set(String(s).split(',').map((p) => p.split('=').map(norm).join('=')).filter((p) => p.includes('=')));

export function isRight(it: Item, given: unknown): boolean {
  const g = String(given ?? '').slice(0, 500);
  if (it.subject === 'math') {
    if (it.template === 'truefalse') return norm(g) === it.answer;
    // "Which is 321 in words?" (Chi #52): the answer is words, not a number
    if (!/^\d+$/.test(it.answer)) return say(g) !== '' && say(g) === say(it.answer);
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
  // a number in words (a + 0, Chi #52): place value, not adding
  words: { vi: 'Con đọc từng hàng: hàng trăm, rồi hàng chục, rồi hàng đơn vị nhé.', en: 'Read it by place: the hundreds, then the tens, then the ones.' },
};
type MathIt = Item & { subject: 'math' };
function kindOf(it: MathIt, given: string): string {
  const g = Number(String(given).trim()), right = Number(it.answer);
  let k = it.op === '+' ? 'plus' : it.op === '-' ? 'minus' : it.op === '×' ? 'times' : 'share';
  if (it.template !== 'truefalse' && String(given).trim() !== '' && Number.isFinite(g)) {
    // one away from the answer is a slip in counting, not the wrong sign (Chi #24: 18 for 17)
    if (Math.abs(g - right) === 1) k = 'close';
    else if (it.op === '+' && g === right - 10) k = 'carry';
    else if (it.op === '-' && g === right + 10) k = 'borrow';
    else if (it.op === '-' && it.a % 10 < it.b % 10 && g % 10 === (it.b % 10) - (it.a % 10)) k = 'flip';
    else if ((it.op === '+' && g === it.a - it.b) || (it.op === '-' && g === it.a + it.b)) k = 'op';
  }
  return k;
}

// The method from the lesson, worked out by code from the numbers (Chi #50: "Gần đúng rồi!" three times for
// 9 + 6 taught her nothing). From the second wrong try the way to do it, its last number left for her
// ("10 + 5 = ?"); from the third, all of it.
const COL = { vi: ['hàng đơn vị', 'hàng chục', 'hàng trăm', 'hàng nghìn', 'hàng chục nghìn', 'hàng trăm nghìn'], en: ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'] };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const digitsOf = (n: number) => String(n).split('').reverse().map(Number);
// "đặt tính rồi tính": column by column from the ones. The 1 that moves on: vi adds it to the next bottom digit
// (as the Vietnamese book does, "2 thêm 1 nhớ được 3"); en takes it from the next top digit.
function columns(a: number, op: '+' | '-', b: number, lang: 'vi' | 'en', full: boolean): string {
  const da = digitsOf(a), db = digitsOf(b), vi = lang === 'vi', C = COL[lang], n = op === '+' ? Math.max(da.length, db.length) : da.length, out: string[] = [];
  let c = 0;
  for (let i = 0; i < n; i++) {
    const x = da[i], y = db[i], last = i === n - 1, head = i === 0 ? (vi ? `${op === '+' ? 'Cộng' : 'Trừ'} ${C[0]} trước: ` : `${op === '+' ? 'Add' : 'Take away'} the ones first: `) : `${cap(C[i])}: `;
    const write = (v: number) => (last && v === 0 && i > 0 ? (vi ? 'không viết số 0 ở đầu' : 'no 0 at the front') : vi ? `viết ${v}` : `write ${v}`);
    if (op === '+') {
      const p = x ?? y, q = x !== undefined ? y : undefined, s = p + (q ?? 0), t = s + c, carry = t >= 10 && !last ? 1 : 0;
      const sum = q !== undefined ? (vi ? `${p} + ${q} được ${s}${c ? `, thêm 1 nhớ được ${t}` : ''}` : `${p} + ${q} makes ${s}${c ? `, plus the 1 carried makes ${t}` : ''}`) : c ? (vi ? `${p} thêm 1 nhớ được ${t}` : `${p} plus the 1 carried makes ${t}`) : '';
      out.push(`${head}${sum ? `${sum}, ` : ''}${carry ? (vi ? `viết ${t % 10}, nhớ 1 sang ${C[i + 1]}` : `write ${t % 10}, carry 1 to the ${C[i + 1]}`) : vi ? `viết ${t}` : `write ${t}`}.`); c = carry;
    } else if (vi) {
      const yy = (y ?? 0) + c, plus = c && y !== undefined ? `${y} thêm 1 nhớ được ${yy}, ` : '';
      if (y === undefined && !c) out.push(`${head}viết ${x}.`);
      else if (x >= yy) { out.push(`${head}${plus}${x} − ${y === undefined ? '1 nhớ' : yy} được ${x - yy}, ${write(x - yy)}.`); c = 0; }
      else { out.push(`${head}${plus}${x} không trừ được ${yy}, lấy ${x + 10} − ${yy} được ${x + 10 - yy}, viết ${x + 10 - yy}, nhớ 1 sang ${C[i + 1]}.`); c = 1; }
    } else {
      const xx = x - c, yv = y ?? 0, took = c ? `${x} − 1 = ${xx} (one went to the ${C[i - 1]}), ` : '';
      if (y === undefined && !c) out.push(`${head}write ${x}.`);
      // a 0 that has to give a ten: it takes one from the next column first (305 − 128)
      else if (xx < 0) { out.push(`${head}0 is less than 1, so take 1 from the ${C[i + 1]}: 10 − 1 = 9 (one went to the ${C[i - 1]}), ${y !== undefined ? `9 − ${y} makes ${9 - yv}, ` : ''}write ${9 - yv}.`); c = 1; }
      else if (xx >= yv) { out.push(`${head}${took}${y !== undefined ? `${xx} − ${y} makes ${xx - yv}, ` : ''}${write(xx - yv)}.`); c = 0; }
      else { out.push(`${head}${took}${xx} is less than ${yv}, so take 1 from the ${C[i + 1]}: ${xx + 10} − ${yv} makes ${xx + 10 - yv}, write ${xx + 10 - yv}.`); c = 1; }
    }
    if (!full) return `${out[0]} ${vi ? `Rồi ${op === '+' ? 'cộng' : 'trừ'} tiếp ${C[1]}${c ? ', nhớ 1' : ''}.` : `Then the tens${c ? (op === '+' ? ', with the 1 carried' : ', with one ten taken') : ''}.`}`;
  }
  return out.join(' ');
}
function mathMethod(it: MathIt, k: string, lang: 'vi' | 'en', full: boolean): string {
  const { a, op, b } = it, vi = lang === 'vi', tf = it.template === 'truefalse', v = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
  if (![a, b].every(Number.isInteger) || a < 0 || b < 0) return '';
  // the last number: hers to find on the second try; a true/false item shows the sum (the verdict is hers)
  const fin = (x: number) => (full || tf ? `${x}` : '?'), then = tf ? (vi ? ` Rồi so với ${it.shown}.` : ` Then compare it with ${it.shown}.`) : '';
  const sign = k === 'op' ? (op === '+' ? (vi ? 'Đây là phép cộng (+) nhé. ' : 'This one is an addition (+). ') : op === '-' ? (vi ? 'Đây là phép trừ (−) nhé. ' : 'This one is a subtraction (−). ') : '') : '';
  // a missing number: the rule from the book, then the sum that finds it
  if (it.template === 'fill' && (it.blank === 'a' || it.blank === 'b')) {
    const r = Number(it.answer), known = it.blank === 'a' ? b : a;
    if (op === '+') return vi ? `Muốn tìm số hạng chưa biết, con lấy tổng trừ số hạng đã biết: ${v} − ${known} = ${fin(r)}.` : `To find the missing number, take the other number from the total: ${v} − ${known} = ${fin(r)}.`;
    if (op === '-') return it.blank === 'a' ? (vi ? `Muốn tìm số bị trừ, con lấy hiệu cộng với số trừ: ${v} + ${b} = ${fin(r)}.` : `To find the first number, add the two you know: ${v} + ${b} = ${fin(r)}.`) : vi ? `Muốn tìm số trừ, con lấy số bị trừ trừ đi hiệu: ${a} − ${v} = ${fin(r)}.` : `To find the missing number, take the answer from the first number: ${a} − ${v} = ${fin(r)}.`;
    if (op === '×') return vi ? `Muốn tìm thừa số chưa biết, con lấy tích chia cho thừa số đã biết: ${v} : ${known} = ${fin(r)}.` : `To find the missing number, divide: ${v} : ${known} = ${fin(r)}.`;
    return it.blank === 'a' ? (vi ? `Muốn tìm số bị chia, con lấy thương nhân với số chia: ${v} × ${b} = ${fin(r)}.` : `To find the first number, multiply: ${v} × ${b} = ${fin(r)}.`) : vi ? `Muốn tìm số chia, con lấy số bị chia chia cho thương: ${a} : ${v} = ${fin(r)}.` : `To find the missing number, divide: ${a} : ${v} = ${fin(r)}.`;
  }
  if (op === '+') {
    const [big, small] = a >= 10 && b < 10 ? [a, b] : b >= 10 && a < 10 ? [b, a] : a < 10 && b < 10 ? [Math.max(a, b), Math.min(a, b)] : [-1, -1];
    // making ten (Chi: "Tách 6 = 1 + 5, 9 + 1 = 10, 10 + 5 = 15"); two big numbers, or a column item, go by columns
    if (big > 0 && big % 10 > 0 && big % 10 + small > 10 && (it.template !== 'column' || big < 10)) { const need = 10 - (big % 10), top = big + need; return sign + (vi ? `Cộng qua 10: tách ${small} = ${need} + ${small - need}, ${big} + ${need} = ${top}, ${top} + ${small - need} = ${fin(v)}.` : `Make a ten: split ${small} = ${need} + ${small - need}, ${big} + ${need} = ${top}, ${top} + ${small - need} = ${fin(v)}.`) + then; }
    if (a < 10 && b < 10) { if (!small) return ''; const st = [...Array(small)].map((_, i) => big + i + 1); return sign + (vi ? `Đếm thêm ${small} từ ${big}: ` : `Count on ${small} from ${big}: `) + [...st.slice(0, -1), fin(v)].join(', ') + '.' + then; }
    return sign + columns(a, '+', b, lang, full || tf) + then;
  }
  if (op === '-') {
    const u = a % 10;
    if (a < b || !b) return '';
    if (b < 10 && a >= 10 && u > 0 && u < b && (a < 20 || it.template !== 'column')) return sign + (vi ? `Trừ qua 10: tách ${b} = ${u} + ${b - u}, ${a} − ${u} = ${a - u}, ${a - u} − ${b - u} = ${fin(v)}.` : `Go through ten: split ${b} = ${u} + ${b - u}, ${a} − ${u} = ${a - u}, ${a - u} − ${b - u} = ${fin(v)}.`) + then;
    if (a <= 10) { const st = [...Array(b)].map((_, i) => a - i - 1); return sign + (vi ? `Đếm lùi ${b} từ ${a}: ` : `Count back ${b} from ${a}: `) + [...st.slice(0, -1), fin(v)].join(', ') + '.' + then; }
    return sign + columns(a, '-', b, lang, full || tf) + then;
  }
  if (op === '×') return b >= 2 && b <= 10 ? (vi ? `${a} × ${b} là ${a} được lấy ${b} lần: ${Array(b).fill(a).join(' + ')} = ${fin(v)}.` : `${a} × ${b} is ${b} lots of ${a}: ${Array(b).fill(a).join(' + ')} = ${fin(v)}.`) + then : '';
  if (b < 1 || !Number.isInteger(v) || v < 1 || v > 10) return '';
  const steps = [...Array(v)].map((_, i) => b * (i + 1)).join(', ');
  return (vi ? `Đếm theo bước ${b}: ${steps}. ${full || tf ? `Đếm được ${v} bước, nên ${a} : ${b} = ${v}.` : 'Đếm được mấy bước thì đó là kết quả.'}` : `Count in ${b}s: ${steps}. ${full || tf ? `That is ${v} steps, so ${a} : ${b} = ${v}.` : 'The number of steps is the answer.'}`) + then;
}

// wrongBefore: her wrong tries at this item before this one (Chi #50: the first gets a nudge, then the method)
export function mathHint(it: MathIt, given: string, lang: 'vi' | 'en', wrongBefore = 0): string {
  if (it.op === '+' && it.b === 0) return readHint(it, given, lang);
  const k = kindOf(it, given);
  return (wrongBefore >= 1 && mathMethod(it, k, lang, wrongBefore >= 2).replace(/\?\./g, '?')) || NUDGE[k][lang];
}

// A number in words (Chi #52): the number she picked, said back to her ("312 is “three hundred and twelve”"), then how to
// read it by place. It never says the words or the digits of the answer, only what the question already shows.
function readHint(it: MathIt, given: string, lang: 'vi' | 'en'): string {
  const g = String(given).trim(), vi = lang === 'vi', tail = NUDGE.words[lang];
  if (it.template === 'truefalse' || !g) return tail;
  if (!/^\d+$/.test(it.answer)) {
    const n = (it.distractors || []).find((d) => say(numberWords(d, lang)) === say(g));
    return n === undefined ? tail : vi ? `“${numberWords(n, lang)}” là số ${n}, không phải ${it.a}. ${tail}` : `“${numberWords(n, lang)}” is ${n}, not ${it.a}. ${tail}`;
  }
  const n = Number(g), w = /^\d+$/.test(g) && n !== Number(it.answer) ? numberWords(n, lang) : '';
  return w ? (vi ? `Số ${n} đọc là “${w}”. ${tail}` : `${n} in words is “${w}”. ${tail}`) : tail;
}

export function hintOf(it: Item, given = '', lang: 'vi' | 'en' = 'vi', wrongBefore = 0): string {
  if (it.subject === 'math') return mathHint(it, given, lang, wrongBefore);
  const x = String(it.explain || '');
  // English: these explanations are the answer itself (the sentence, the pairs): no hint; others hide the word
  if (it.template === 'match' || it.template === 'order') return '';
  const esc = it.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), hide = (s: string) => (esc ? s.replace(new RegExp(`(?<!\\p{L})${esc}(?!\\p{L})`, 'giu'), '___') : s);
  // Chi #52: the reason for the very option she picked ("floor": the floor is lava), else the explanation, the answer hidden
  const why = Object.entries(it.why || {}).find(([o]) => norm(o) === norm(given))?.[1];
  return why ? hide(why) : x ? hide(x) : '';
}

// Deterministic shuffle, so a pupil sees the same order every time she opens the item.
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = [...seed].reduce((s, c) => (s * 33 + c.charCodeAt(0)) >>> 0, 11);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { h = (h * 1664525 + 1013904223) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// stack: a column item's two numbers, set out one above the other ("đặt tính rồi tính", Chi #47)
export interface PupilItem { id: string; template: string; prompt: string; options?: string[]; sentence?: string; words?: string[]; left?: string[]; right?: string[]; unit?: string; listen?: boolean; fromWork?: boolean; stack?: { a: number; op: string; b: number } }
export function forPupil(it: Item): PupilItem {
  const out: PupilItem = { id: it.id, template: it.template, prompt: it.prompt };
  if (it.options?.length) out.options = it.options;
  if (it.fromWork) out.fromWork = true;   // "Luyện lại từ bài con làm" (Chi #46)
  if (it.subject === 'math') {
    if (it.template === 'word' && it.unit) out.unit = it.unit;
    if (it.template === 'column') out.stack = { a: it.a, op: it.op === '-' ? '−' : it.op, b: it.b };
    return out;
  }
  if (it.sentence) out.sentence = it.sentence;
  if (it.template === 'order' && it.words) out.words = it.words;
  if (it.template === 'match' && it.pairs) { out.left = shuffle(it.pairs.map((p) => p.word), it.id + 'l'); out.right = shuffle(it.pairs.map((p) => p.emoji), it.id + 'r'); }
  if (it.template === 'listen') out.listen = true;
  return out;
}

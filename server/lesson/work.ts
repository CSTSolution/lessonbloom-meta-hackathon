// A child's finished work, read from photos (Chi #46). Chi's three layers: the book is what to teach
// (Knowledge), this is where the child is (her profile: one dated record per upload, work_records), and a
// lesson made from it is both: the book gives the content, the child's work gives the focus.
// The model only reads the page (each question, what the child wrote, the adult's mark); code works out
// the right answer and the kind of mistake (carrying, borrowing, comparing), builds the practice from the
// child's own sums and the opening slide, so a parent SEES the lesson was made from her child's work.
import { buildEnglish, buildMath, checkItem, compute, contextOf, SIGN } from './items.ts';
import type { EnglishItem, Item, Lang, MathItem, Op, Setup, Skill, Slide } from './types.ts';

export type WorkKind = 'add_carry' | 'add_no_carry' | 'sub_borrow' | 'sub_no_borrow' | 'compare' | 'find_missing' | 'multiply' | 'divide' | 'other';
export const WORK_KINDS: WorkKind[] = ['add_carry', 'add_no_carry', 'sub_borrow', 'sub_no_borrow', 'compare', 'find_missing', 'multiply', 'divide', 'other'];
export type Mark = 'right' | 'wrong' | 'none';
export interface Words { vi: string; en: string }
// calc: the question as numbers, when code can read it ("655 − 367", "245 + 615 … 791", "? + 25 = 60")
export interface Calc { a: number; op?: Op; b?: number; c?: number; blank?: 'a' | 'b' | 'result'; cmp?: boolean; unit?: string }
// unsure: the adult's mark and the sum disagree; it is not counted as a mistake until she sets the mark herself (sure)
export interface WorkQ { q: string; child: string; mark: Mark; right: string; ok: boolean; kind: WorkKind; label: Words; slip?: Words; unsure?: boolean; sure?: boolean; typeName?: string; sum?: string; calc?: Calc }
export interface Work {
  recordId?: string; pupilId?: string; child?: string; date: string; subject: 'math' | 'english'; topic: string;
  questions: WorkQ[]; total: number; right: number; wrong: number; check?: number; types: { kind: WorkKind; label: Words; count: number }[];
  base?: string;   // the lesson's title before "Made for …" was added (prompts use it: no child's name goes to a model)
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const vnDay = (t = Date.now()) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);

// --- reading a question ---
const tidy = (s: string) => s.normalize('NFC').replace(/[−–—]/g, '-').replace(/÷/g, ':')
  .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 × ').replace(/…|\.{2,}|_{2,}|□|○|◯|\[\s*\]|\(\s*\)/g, ' ? ').replace(/\s+/g, ' ').trim();
const N = '(\\d{1,7}|\\?)';
const CALC = new RegExp(`^${N} ?([+\\-×:]) ?${N}(?: ?= ?${N}?)?$`);
const CMP = /^(\d{1,7})(?: ?([+-]) ?(\d{1,7}))? ?\? ?(\d{1,7})$/;
const num = (s: string) => (s === '?' ? undefined : Number(s));
// "329 cm + 183 cm" is a sum too (Chi #54): one unit after the numbers is set aside and given back with the answer
const UNIT = /(\d)\s*(cm|dm|mm|km|m|kg|g|ml|l|đồng|giờ|phút|ngày|tuổi|quyển|cái|con|bạn|quả)(?!\p{L})/giu;
// the number in what she wrote ("486 quyển", "3,5") or in a right answer with its unit; in her working
// ("64 - 28 = 46 (quả)", live test 1 Nov) the one after the last "="
export const numIn = (s: string) => { const m = /\d+(?:[.,]\d+)?/.exec(s.includes('=') ? s.slice(s.lastIndexOf('=') + 1) : s); return m ? Number(m[0].replace(',', '.')) : NaN; };

// "find x" (Chi #55: "273 + x = 321" was "Other", right answer "?"): a lone letter is the blank, like "?" or "…";
// after the units are set aside, so "m" or "g" after a number stays a unit. "Tìm x:" before the sum is dropped.
const LETTER = /(?<![\p{L}\d])[a-z](?![\p{L}\d])/gu, FIND_X = /^(?:tìm|find)\s+[a-z]\s*[:,.]?\s*/iu;
export function readCalc(q: string): Calc | null {
  const units = new Set<string>(), t0 = tidy(q).replace(FIND_X, '').replace(UNIT, (_, d: string, u: string) => { units.add(u.toLowerCase()); return d; }).replace(LETTER, '?');
  const x = calcOf(t0);
  return x && units.size === 1 ? { ...x, unit: [...units][0] } : units.size > 1 ? null : x;
}
function calcOf(t: string): Calc | null {
  const m = CALC.exec(t);
  if (m) {
    const [a, b, c] = [num(m[1]), num(m[3]), m[4] === undefined ? undefined : num(m[4])], op = m[2] as Op;
    const blanks = [a, b, c].filter((x) => x === undefined).length;
    if (a === undefined && b !== undefined && c !== undefined && blanks === 1) return { a: 0, op, b, c, blank: 'a' };
    if (b === undefined && a !== undefined && c !== undefined && blanks === 1) return { a, op, b: 0, c, blank: 'b' };
    if (a !== undefined && b !== undefined) return { a, op, b, ...(c !== undefined ? { c } : {}), blank: 'result' };
    return null;
  }
  const k = CMP.exec(t);
  if (k) return { a: Number(k[1]), ...(k[2] ? { op: k[2] as Op, b: Number(k[3]) } : {}), c: Number(k[4]), cmp: true };
  return null;
}
const lhs = (x: Calc) => (x.op && x.b !== undefined ? compute(x.a, x.op, x.b) : x.a);
const signOf = (l: number, r: number) => (l > r ? '>' : l < r ? '<' : '=');

// the right answer, by code
export function rightOf(x: Calc): string | null {
  if (x.cmp) return Number.isFinite(lhs(x)) ? signOf(lhs(x), x.c!) : null;
  const { a, op, b = 0, c = 0 } = x;
  const r = x.blank === 'a' ? (op === '+' ? c - b : op === '-' ? c + b : op === '×' ? c / b : c * b)
    : x.blank === 'b' ? (op === '+' ? c - a : op === '-' ? a - c : op === '×' ? c / a : a / c) : compute(a, op!, b);
  return Number.isInteger(r) && r >= 0 ? `${r}${x.unit ? ` ${x.unit}` : ''}` : null;
}

// which columns carry (+) or borrow (−): "011" = the tens and hundreds do, not the ones
export function columns(a: number, op: Op, b: number): string {
  let c = 0, x = a, y = b, m = '';
  while (x > 0 || y > 0) { const d = op === '+' ? (x % 10) + (y % 10) + c : (x % 10) - (y % 10) - c; c = op === '+' ? (d >= 10 ? 1 : 0) : (d < 0 ? 1 : 0); m += c; x = Math.floor(x / 10); y = Math.floor(y / 10); }
  return m;
}
const regroups = (a: number, op: Op, b: number) => (op === '+' || op === '-') && columns(a, op, b).includes('1');

export function kindOf(x: Calc): WorkKind {
  if (x.cmp) return 'compare';
  if (x.blank !== 'result') return 'find_missing';
  if (x.op === '+') return regroups(x.a, '+', x.b!) ? 'add_carry' : 'add_no_carry';
  if (x.op === '-') return regroups(x.a, '-', x.b!) ? 'sub_borrow' : 'sub_no_borrow';
  return x.op === '×' ? 'multiply' : 'divide';
}

const LABEL: Record<WorkKind, Words> = {
  add_carry: { vi: 'Phép cộng có nhớ', en: 'Addition with carrying' }, add_no_carry: { vi: 'Phép cộng không nhớ', en: 'Addition without carrying' },
  sub_borrow: { vi: 'Phép trừ có nhớ', en: 'Subtraction with borrowing' }, sub_no_borrow: { vi: 'Phép trừ không nhớ', en: 'Subtraction without borrowing' },
  compare: { vi: 'So sánh hai số', en: 'Comparing numbers' }, find_missing: { vi: 'Tìm số còn thiếu', en: 'Finding the missing number' },
  multiply: { vi: 'Phép nhân', en: 'Multiplication' }, divide: { vi: 'Phép chia', en: 'Division' }, other: { vi: 'Dạng khác', en: 'Other' },
};
export function labelOf(kind: WorkKind, x?: Calc, typeName?: string): Words {
  if (kind === 'compare' && x?.op) return x.op === '+' ? { vi: 'So sánh sau khi cộng', en: 'Comparing after adding' } : { vi: 'So sánh sau khi trừ', en: 'Comparing after subtracting' };
  if (kind === 'other' && typeName) return { vi: typeName, en: typeName };
  return LABEL[kind];
}
// How books name each kind, in both languages, so the work finds its part of the book: a sheet headed
// "Đặt tính rồi tính" says nothing a search can use, its mistakes do (live test, 1 Nov: no part found)
const FIND: Partial<Record<WorkKind, string>> = {
  add_carry: 'phép cộng có nhớ, adding with regrouping (carrying)', add_no_carry: 'phép cộng không nhớ, adding without regrouping',
  sub_borrow: 'phép trừ có nhớ, subtracting with regrouping (borrowing)', sub_no_borrow: 'phép trừ không nhớ, subtracting without regrouping',
  compare: 'so sánh các số, comparing numbers', find_missing: 'tìm số còn thiếu, missing number', multiply: 'phép nhân, multiplication', divide: 'phép chia, division',
};
// What to look for in the book: the sheet's heading and its most frequent mistake
// an exercise's instruction, not what it teaches
const INSTRUCTION = /\b(fill in|fill the|choose|circle|match|write|complete|tick|underline|read and|look and|listen and)\b/i;
export const findOf = (w: Pick<Work, 'topic' | 'types'> & { subject?: Work['subject']; questions?: WorkQ[] }) => {
  // an English sheet: its unit and what its mistakes are about, never its instruction (live test 1 Nov: "Unit 6: Colours -
  // Fill in the missing word" found nothing, as no part teaches "filling in"; "Unit 6: Colours" found it)
  if (w.subject === 'english') {
    // what the wrong questions say, with the right answer in the gap ("What colour is it?"): the model names the kind of an
    // English mistake after the exercise ("Fill in the missing word", live test 1 Nov), which no part of a book teaches
    const unit = /(?:unit|lesson|bài)\s*\d+\s*[:.]?\s*[^-–—\n]*/iu.exec(w.topic)?.[0].trim();
    const said = [...new Set((w.questions ?? []).filter((q) => !q.ok && q.right).map((q) => q.q.replace(/_{2,}|…|\.{3,}/, q.right).replace(/\s+/g, ' ').trim()))].slice(0, 3);
    const kinds = [...new Set(w.types.map((t) => t.label.en))].filter((k) => !INSTRUCTION.test(k)).slice(0, 2);
    return [unit, ...said, ...kinds].filter(Boolean).join(' – ').slice(0, 300) || w.topic;
  }
  const k = w.types[0]?.kind, words = k && k !== 'other' ? FIND[k] : w.types[0]?.label.vi;
  return [w.topic, words].filter(Boolean).join(' – ').slice(0, 300);
};
const PLACE: Record<number, Words> = { 10: { vi: 'chục', en: 'tens' }, 100: { vi: 'trăm', en: 'hundreds' }, 1000: { vi: 'nghìn', en: 'thousands' } };

// The usual slip, when the child's answer shows it (Chi: "forgetting to carry 1")
export function slipOf(x: Calc, child: string): Words | undefined {
  if (x.cmp || x.blank !== 'result' || !x.op || x.b === undefined) return undefined;
  const g = Number(child), r = compute(x.a, x.op, x.b);
  if (!Number.isFinite(g) || g === r) return undefined;
  const m = columns(x.a, x.op, x.b);
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== '1') continue;
    const place = 10 ** (i + 1), p = PLACE[place] ?? { vi: 'bên trái', en: 'next column' };
    if (x.op === '+' && g === r - place) return { vi: `Quên nhớ 1 sang hàng ${p.vi}`, en: `Forgot to carry 1 to the ${p.en}` };
    if (x.op === '-' && g === r + place) return { vi: `Quên trả 1 ở hàng ${p.vi} sau khi mượn`, en: `Forgot the borrowed 1 in the ${p.en}` };
  }
  if (x.op === '-') {
    const da = String(x.a).split('').reverse(), db = String(x.b).split('').reverse();
    const flip = Number(da.map((d, i) => Math.abs(Number(d) - Number(db[i] ?? 0))).reverse().join(''));
    if (m.includes('1') && g === flip) return { vi: 'Lấy số bé trừ số lớn ở một hàng', en: 'Took the smaller digit from the larger in a column' };
  }
  if ((x.op === '+' && g === x.a - x.b) || (x.op === '-' && g === x.a + x.b)) return { vi: 'Nhầm dấu phép tính', en: 'Used the other sign' };
  return undefined;
}

// --- the whole sheet ---
// raw: what the model read, or the table as the assigner corrected it. Only q, child, mark (and, for what
// code cannot read, the model's right answer and type name) are taken; everything else is worked out here.
// The adult's mark comes first (Chi: rely on the marks, not on re-solving); code still works out the right
// answer, and a row where the mark and the sum disagree is flagged for her to look at.
export function typeWork(raw: unknown, base: Partial<Pick<Work, 'recordId' | 'pupilId' | 'child' | 'date' | 'subject' | 'topic'>> = {}): Work {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rows = (Array.isArray(o.questions) ? o.questions : []).slice(0, 40) as Record<string, unknown>[];
  const questions: WorkQ[] = [];
  for (const r of rows) {
    const q = clip(r?.q, 60), child = clip(r?.child, 20), mark: Mark = r?.mark === 'right' || r?.mark === 'wrong' ? r.mark : 'none', typeName = clip(r?.typeName, 60) || undefined;
    if (!q) continue;
    // a word problem: the one sum the model said it needs ("964 - 478"), checked by code like any other (Chi #54)
    const sum = clip(r?.sum, 40), x = readCalc(q) ?? (sum ? readCalc(sum) : null), right = x ? rightOf(x) : null, sure = r?.sure === true;
    if (x && right !== null) {
      const given = x.cmp ? (child.match(/[<>=]/)?.[0] ?? '') : String(numIn(child)), byCode = x.cmp ? given === right : given !== 'NaN' && Number(given) === numIn(right);
      // the mark first (Chi); one that disagrees with the sum is not a mistake until she sets it herself (Chi #54:
      // a sheet marked wrong by mistake put a right answer on the "still tricky" slide)
      const differ = mark !== 'none' && byCode !== (mark === 'right'), ok = mark === 'none' ? byCode : differ && !sure ? true : mark === 'right', kind = kindOf(x);
      const slip = !ok ? slipOf(x, given) : undefined;
      questions.push({ q, child, mark, right, ok, kind, label: labelOf(kind, x), ...(slip ? { slip } : {}), ...(differ && !sure ? { unsure: true } : {}), ...(sure ? { sure } : {}), ...(sum && !readCalc(q) ? { sum } : {}), calc: x });
    } else {
      // not a sum code can read (English, a word problem): the model's reading and its mark
      const kind = (WORK_KINDS as string[]).includes(String(r?.kind)) ? (r.kind as WorkKind) : 'other';
      questions.push({ q, child, mark, right: clip(r?.right, 40), ok: mark !== 'wrong', kind, label: labelOf(kind, undefined, typeName), ...(typeName ? { typeName } : {}), ...(mark === 'none' ? { unsure: true } : {}) });
    }
  }
  const types: Work['types'] = [];
  for (const w of questions.filter((x) => !x.ok)) {
    const t = types.find((y) => y.kind === w.kind && y.label.en === w.label.en);
    if (t) t.count++; else types.push({ kind: w.kind, label: w.label, count: 1 });
  }
  types.sort((a, b) => b.count - a.count);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(base.date ?? o.date ?? '')) ? String(base.date ?? o.date) : vnDay();
  const subject = (base.subject ?? o.subject) === 'english' ? 'english' : 'math';
  const right = questions.filter((x) => x.ok && !x.unsure).length, check = questions.filter((x) => x.unsure).length;
  return { ...(base.recordId ? { recordId: base.recordId } : {}), ...(base.pupilId ? { pupilId: base.pupilId } : {}), ...(base.child ? { child: clip(base.child, 40) } : {}),
    date, subject, topic: clip(base.topic ?? o.topic, 200), questions, total: questions.length, right, wrong: questions.length - right - check, ...(check ? { check } : {}), types };
}

// What a model may see of the work: no name, no record or pupil id, the title without "Made for …".
export function forPrompt(setup: Setup): Setup {
  if (!setup.work) return setup;
  const w = setup.work;
  return { ...setup, title: w.base || setup.title, work: { date: w.date, subject: w.subject, topic: w.topic, total: w.total, right: w.right, wrong: w.wrong, types: w.types,
    questions: w.questions.filter((q) => !q.ok).map((q) => ({ q: q.q, child: q.child, right: q.right, kind: q.kind, label: q.label, mark: q.mark, ok: q.ok, ...(q.slip ? { slip: q.slip } : {}), ...(q.calc ? { calc: q.calc } : {}) })) } };
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// "Soạn riêng cho MAI · từ bài làm ngày 31/10" (Chi #46), or neutral when no child was chosen
export function madeFor(w: Pick<Work, 'child' | 'date'>, lang: Lang, parent: boolean): string {
  if (w.child) return lang === 'en' ? `Made for ${w.child} · from the work of ${dm(w.date)}` : `Soạn riêng cho ${w.child} · từ bài làm ngày ${dm(w.date)}`;
  if (lang === 'en') return parent ? `Made from your child's work of ${dm(w.date)}` : `Made from a pupil's work of ${dm(w.date)}`;
  return parent ? `Soạn riêng từ bài con làm ngày ${dm(w.date)}` : `Soạn từ bài làm của học sinh ngày ${dm(w.date)}`;
}
export function titled(title: string, w: Pick<Work, 'child' | 'date'>, lang: Lang, parent: boolean): string {
  const s = madeFor(w, lang, parent);
  return title.includes(s) ? title.slice(0, 160) : `${title.slice(0, Math.max(20, 157 - s.length))} · ${s}`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinW = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);
// The child's page (Chi #46): "Hôm trước con còn vướng phép trừ có nhớ, hôm nay mình luyện lại nhé"
export function greetOf(w: Pick<Work, 'types'>): Words | null {
  const t = w.types.slice(0, 2);
  if (!t.length) return null;
  return { vi: `Hôm trước con còn vướng ${joinW(t.map((x) => lower(x.label.vi)), 'và')}, hôm nay mình luyện lại nhé.`,
    en: `Last time you still found ${joinW(t.map((x) => lower(x.label.en)), 'and')} tricky; today we practise it again.` };
}

// --- the lesson: the opening slide and the practice from the child's own sums ---
const TIP: Partial<Record<WorkKind, Words>> = {
  add_carry: { vi: 'Được 10 trở lên thì viết hàng đơn vị. Nhớ 1 sang hàng bên trái.', en: '10 or more? Write the ones. Carry 1 to the next column.' },
  sub_borrow: { vi: 'Số trên bé hơn số dưới thì mượn 1. Nhớ trả 1 ở hàng bên trái.', en: 'Top digit too small? Borrow 1. Then pay it back in the next column.' },
  compare: { vi: 'Tính phép tính trước. Rồi mới so sánh hai số.', en: 'Work out the sum first. Then compare the two numbers.' },
  find_missing: { vi: 'Thử lại bằng phép tính ngược để kiểm tra.', en: 'Check with the opposite sum.' },
};
const TIP_ANY: Words = { vi: 'Làm từ hàng đơn vị, cẩn thận từng hàng.', en: 'Start from the ones, one column at a time.' };
const TIP_EN: Words = { vi: 'Đọc cả câu trước khi chọn. Tìm từ gợi ý.', en: 'Read the whole sentence first. Find the word that gives the clue.' };
// the sum as printed, without a trailing "=" or "= ?" (live test 1 Nov: "329 cm + 183 cm =, con viết…")
const show = (q: string) => tidy(q).replace(/\s*=\s*\??\s*$/, '').replace(/ - /g, ' − ').replace(/ \? /g, ' … ');

export function workSlide(w: Work, kinds: WorkKind[], lang: Lang, parent: boolean): Slide {
  const L = lang === 'en' ? 'en' : 'vi', you = parent ? 'con' : 'em';
  const types = w.types.filter((t) => kinds.includes(t.kind)).slice(0, 3);
  // the child's own wrong sums, kind by kind: one of each kind first, then a second of the same kind (3 at most)
  const own = types.flatMap((t) => w.questions.filter((q) => !q.ok && q.kind === t.kind && q.label.en === t.label.en).map((q, k) => ({ q, t, k })));
  const en = w.subject === 'english', bullets = [...own.filter((x) => x.k === 0), ...own.filter((x) => x.k > 0)].slice(0, 3).map(({ q: x, t }) => {
    // English (Chi #54): the sentence in quotes with its gap; a right answer the reading did not give is left out, never "The answer is ."
    if (en) { const s = `“${clip(x.q.replace(GAP, '___'), 60)}”`, said = L === 'en' ? `${t.label.en}: ${s}, you wrote ${x.child || '…'}.` : `${t.label.vi}: ${s}, ${you} viết ${x.child || '…'}.`; return x.right ? `${said} ${L === 'en' ? `The answer is ${x.right}.` : `Đúng là ${x.right}.`}` : said; }
    if (t.kind === 'compare') return L === 'en' ? `${t.label.en}: ${show(x.q)}, you put ${x.child || '…'}. The right sign is ${x.right}.` : `${t.label.vi}: ${show(x.q)}, ${you} điền dấu ${x.child || '…'}. Đúng là dấu ${x.right}.`;
    return L === 'en' ? `${t.label.en}: ${show(x.q)}, you wrote ${x.child || '…'}. The answer is ${x.right}.` : `${t.label.vi}: ${show(x.q)}, ${you} viết ${x.child || '…'}. Đúng là ${x.right}.`;
  });
  const top = types[0], tip = en ? TIP_EN : (top && TIP[top.kind]) || TIP_ANY;
  bullets.push(tip[L]);
  const first = top && w.questions.find((q) => !q.ok && q.kind === top.kind && q.calc && !q.calc.cmp && q.calc.blank === 'result');
  // with the unit on every number when the sheet had one ("329 cm + 183 cm = 512 cm")
  const u = first?.calc?.unit ? ` ${first.calc.unit}` : '';
  const example = first?.calc ? `${first.calc.a}${u} ${SIGN[first.calc.op!]} ${first.calc.b}${u} = ${first.right}` : undefined;
  const names = joinW(types.map((t) => lower(t.label[L])), L === 'en' ? 'and' : 'và');
  const slip = types.map((t) => w.questions.find((q) => !q.ok && q.kind === t.kind && q.slip)?.slip?.[L]).find(Boolean);
  return {
    id: 'sl00', kind: 'warmup', fromWork: true,
    heading: L === 'en' ? 'Today we go over what you still find tricky' : `Hôm nay ôn lại điều ${you} còn vướng`,
    bullets: bullets.slice(0, 4), ...(example ? { example } : {}),
    notes: en ? (L === 'en'
      ? `These are ${parent ? "your child's" : "the pupil's"} own answers from the work of ${dm(w.date)}. Ask ${parent ? 'your child' : 'them'} to read each sentence aloud again and find the word that gives the clue before looking at the answer.`
      : `Đây là các câu ${you} làm sai trong bài ngày ${dm(w.date)}. Cho ${you} đọc to lại từng câu, tự tìm từ gợi ý rồi mới xem đáp án.`) : L === 'en'
      ? `These are ${parent ? "your child's" : "the pupil's"} own sums from the work of ${dm(w.date)}. Ask ${parent ? 'your child' : 'them'} to do each one again on paper, column by column, and find the slip before looking at the answer.${slip ? ` The usual slip: ${lower(slip)}.` : ''}`
      : `Đây là các phép tính ${you} làm sai trong bài ngày ${dm(w.date)}. Cho ${you} làm lại từng phép tính trên giấy, đọc to từng hàng, tự tìm chỗ sai rồi mới xem đáp án.${slip ? ` Lỗi hay gặp: ${lower(slip)}.` : ''}`,
    source: '', imagePrompt: en ? 'a child reading an English picture book at a desk, warm light, no text' : 'a child doing sums with a pencil at a desk, an open exercise book, warm light, no text',
    narration: L === 'en' ? `Last time you still found ${names} tricky. Today we practise it again. ${tip.en}` : `Hôm trước ${you} còn vướng ${names}. Hôm nay mình luyện lại nhé. ${tip.vi}`,
  };
}

// A deterministic stand-in for random numbers (the same work always gives the same practice).
function rng(seed: string) { let h = [...seed].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7); return () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h / 4294967296; }; }   // Math.imul: exact (see shuffle in items.ts)
const digits = (n: number) => String(n).length;
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

// New sums like the child's: the same number of digits and the same columns carrying or borrowing.
export function twins(a: number, op: Op, b: number, n: number): [number, number][] {
  const r = rng(`${a}${op}${b}`), out: [number, number][] = [], want = op === '+' || op === '-' ? columns(a, op, b) : '';
  const lo = (d: number) => (d === 1 ? 1 : 10 ** (d - 1)), hi = (d: number) => 10 ** d - 1, top = 10 ** Math.max(digits(a), digits(b), digits(Math.max(0, compute(a, op, b))));
  for (let i = 0; i < 4000 && out.length < n; i++) {
    let x = between(r, lo(digits(a)), hi(digits(a))), y = between(r, lo(digits(b)), hi(digits(b)));
    if (op === ':') { y = Math.max(2, y); x = y * between(r, 2, 9); }
    if ((x === a && y === b) || out.some(([p, q]) => p === x && q === y)) continue;
    const res = compute(x, op, y);
    if (!Number.isInteger(res) || res < 0 || res >= top) continue;
    if ((op === '+' || op === '-') && columns(x, op, y) !== want) continue;
    out.push([x, y]);
  }
  return out;
}

const tf = (lang: Lang) => (lang === 'en' ? 'True or false?' : 'Đúng hay sai?');
function explainOf(a: number, op: Op, b: number, lang: Lang): string {
  const r = compute(a, op, b), calc = `${a} ${SIGN[op]} ${b} = ${r}.`;
  if (op === '+' && regroups(a, op, b)) return lang === 'en' ? `${calc} Add from the ones and carry 1 to the next column.` : `${calc} Cộng từ hàng đơn vị, nhớ 1 sang hàng bên trái.`;
  if (op === '-' && regroups(a, op, b)) return lang === 'en' ? `${calc} Borrow 1 when the top digit is too small, then pay it back.` : `${calc} Số trên bé hơn thì mượn 1, rồi trả 1 ở hàng bên trái.`;
  return calc;
}
function compareItem(id: string, skill: string, a: number, op: Op | undefined, b: number | undefined, c: number, claim: string, lang: Lang, level: Item['level']): MathItem {
  const l = op && b !== undefined ? compute(a, op, b) : a, left = op && b !== undefined ? `${a} ${SIGN[op]} ${b}` : String(a), truth = signOf(l, c);
  const explain = op && b !== undefined ? (lang === 'en' ? `${left} = ${l}, and ${l} ${truth} ${c}.` : `${left} = ${l}, mà ${l} ${truth} ${c}.`) : `${a} ${truth} ${c}.`;
  return { id, subject: 'math', template: 'truefalse', skill, level, a, op: op ?? '+', b: op ? b! : 0, prompt: `${tf(lang)} ${left} ${claim} ${c}`, explain, answer: claim === truth ? 'true' : 'false', fromWork: true };
}

// The practice for one kind of mistake: the child's own wrong sums again (set out in columns, as on her
// sheet), then new ones made like them. Every item still passes the same code checks as any other.
export function workItems(qs: WorkQ[], kind: WorkKind, skill: string, lang: Lang, id: () => string, extra: number): MathItem[] {
  const out: MathItem[] = [], own = qs.filter((q) => q.calc).slice(0, 2);
  for (const q of own) {
    const x = q.calc!;
    if (x.cmp) out.push(compareItem(id(), skill, x.a, x.op, x.b, x.c!, (q.child.match(/[<>=]/)?.[0]) ?? '=', lang, 'basic'));
    else if (x.blank !== 'result') out.push({ ...buildMath({ template: 'fill', skill, level: 'basic', a: x.blank === 'a' ? numIn(q.right) : x.a, op: x.op!, b: x.blank === 'b' ? numIn(q.right) : x.b!, blank: x.blank, explain: '' }, id(), lang), fromWork: true });
    else out.push({ ...buildMath({ template: x.op === '+' || x.op === '-' ? 'column' : 'fill', skill, level: 'basic', a: x.a, op: x.op!, b: x.b!, blank: 'result', explain: explainOf(x.a, x.op!, x.b!, lang) }, id(), lang), fromWork: true });
  }
  const x = own[0]?.calc;
  if (!x) return out;
  if (x.cmp) {
    const pairs = x.op && x.b !== undefined ? twins(x.a, x.op, x.b, extra) : [[x.a + 3, 0], [x.a + 7, 0]] as [number, number][];
    pairs.forEach(([p, q], i) => {
      const l = x.op ? compute(p, x.op, q) : p, c = i % 2 ? l + 1 + (p % 9) : Math.max(0, l - 10 * (1 + (q % 5)));
      const truth = signOf(l, c), claim = i % 2 ? (truth === '<' ? '>' : '<') : truth;   // one true, one false
      out.push(compareItem(id(), skill, p, x.op, x.op ? q : undefined, c, claim, lang, 'good'));
    });
    return out;
  }
  if (x.blank !== 'result') return out;
  twins(x.a, x.op!, x.b!, extra).forEach(([p, q], i) => {
    const r = compute(p, x.op!, q);
    out.push({ ...buildMath(i % 2 === 0
      ? { template: 'mcq', skill, level: 'good', a: p, op: x.op!, b: q, distractors: [r + 1, Math.abs(r - 1)].filter((d) => d !== r), explain: explainOf(p, x.op!, q, lang) }
      : { template: x.op === '+' || x.op === '-' ? 'column' : 'fill', skill, level: 'good', a: p, op: x.op!, b: q, blank: 'result', explain: explainOf(p, x.op!, q, lang) }, id(), lang), fromWork: true });
  });
  return out;
}

// English (Chi #54): her own wrong items again, built by code where the reading gives the right answer. A sentence with one
// gap becomes a fill-in and a question a choice, the right answer against hers (an adult marked it wrong), with a hint
// for hers; a right answer of 3-10 words becomes putting its words in order. A row with no right answer, or too free
// for this (an essay, a drawing), is left to the model as before. Every item still passes the same code checks.
const GAP = /_{2,}|…|\.{2,}|\(\s*\)|\[\s*\]|□/g;
export function englishWorkItems(qs: WorkQ[], skill: string, lang: Lang, parent: boolean, id: () => string): EnglishItem[] {
  const out: EnglishItem[] = [], vi = lang !== 'en', you = parent ? 'con' : 'em';
  for (const q of qs) {
    const right = clip(q.right, 40), child = clip(q.child, 40), n = right.split(' ').length, gaps = (q.q.match(GAP) || []).length;
    if (!right || gaps > 1) continue;
    if (!gaps && n >= 3 && n <= 10) {
      const answer = `${right[0].toUpperCase()}${right.slice(1)}${/[.!?]$/.test(right) ? '' : '.'}`, cards = answer.split(' '), r = rng(answer);
      let words = cards.map((w) => [r(), w] as const).sort((x, y) => x[0] - y[0]).map(([, w]) => w);
      if (words.join(' ') === answer) words = [...words.slice(1), words[0]];
      out.push({ ...buildEnglish({ template: 'order', skill, level: 'basic', prompt: vi ? 'Sắp xếp các từ thành câu đúng.' : 'Put the words in order.', words, answer, explain: vi ? `Câu đúng: ${answer}` : `The right sentence: ${answer}` }, id(), lang), fromWork: true });
      continue;
    }
    if (n > 3 || !child || child.toLowerCase() === right.toLowerCase()) continue;
    const sentence = gaps ? q.q.replace(GAP, '___') : `${q.q} ___`, options = rng(q.q)() < 0.5 ? [right, child] : [child, right];
    const why = { [child]: vi ? `Trong bài làm, ${you} viết “${child}”, chưa hợp ở đây. ${you === 'con' ? 'Con' : 'Em'} đọc lại cả câu nhé.` : `On your sheet you wrote “${child}”, which does not fit here. Read the whole sentence again.` };
    const prompt = gaps ? (vi ? 'Chọn từ đúng điền vào chỗ trống.' : 'Choose the right word for the gap.') : vi ? 'Chọn câu trả lời đúng.' : 'Choose the right answer.';
    const explain = gaps ? (vi ? `Đúng là “${right}”: ${q.q.replace(GAP, right)}` : `The right answer is “${right}”: ${q.q.replace(GAP, right)}`) : vi ? `Đúng là “${right}”.` : `The right answer is “${right}”.`;
    out.push({ ...buildEnglish({ template: 'fill', skill, level: 'basic', prompt, sentence, options, answer: right, explain, why }, id(), lang), fromWork: true });
  }
  return out;
}

export interface WorkApplied { skills: Skill[]; slides: Slide[]; items: Item[]; made: number; inPart: Words[]; outPart: Words[] }

// After the agent: the opening slide on the child's mistakes (right after the title slide), the practice
// from her own sums first and weighted to them (about 70%), and only 1-2 items for each skill she
// already got right. A kind of mistake the chosen part of the book does not teach (a sum outside its
// range or operations) is left out and said so: the book still decides what is taught.
export function applyWork(setup: Setup, source: string, b: { skills: Skill[]; slides: Slide[]; items: Item[] }): WorkApplied {
  const w = setup.work, none = { ...b, made: 0, inPart: [], outPart: [] };
  if (!w || !w.wrong) return none;
  const lang = setup.lang, parent = !!setup.forParent;
  let skills = [...b.skills], n = 0;
  const id = () => `wk${String(++n).padStart(2, '0')}`, made: Item[] = [], inKinds: WorkKind[] = [], inPart: Words[] = [], outPart: Words[] = [];
  const wrongTypes = w.types.filter((t) => w.questions.some((q) => !q.ok && q.kind === t.kind && q.label.en === t.label.en));
  const skillFor = (t: Work['types'][number]) => skills.find((k) => k.kind === t.kind) ?? { tag: `bai_lam_${t.kind}`, name: t.label[lang === 'en' ? 'en' : 'vi'], kind: t.kind as Skill['kind'] };
  const build = (t: Work['types'][number], qs: WorkQ[], extra: number, mk: () => string) => {
    const skill = skillFor(t), all = skills.some((k) => k.tag === skill.tag) ? skills : [...skills, skill], ctx = contextOf(setup, all, source);
    return { skill, kept: workItems(qs, t.kind, skill.tag, lang, mk, extra).filter((it) => !checkItem(it, { ...ctx, items: [...b.items, ...made] }).length) };
  };
  const qsOf = (t: Work['types'][number]) => w.questions.filter((q) => !q.ok && q.kind === t.kind && q.label.en === t.label.en);
  // first which kinds the chosen part teaches (her own sums pass its checks); one kind alone gets more new sums
  const coded = wrongTypes.filter((t) => setup.subject === 'math' && qsOf(t).some((q) => q.calc));
  let probe = 0;
  const taught = coded.filter((t) => build(t, qsOf(t), 0, () => `probe${++probe}`).kept.length);
  let en = 0;
  for (const t of wrongTypes) {
    if (!coded.includes(t)) {
      // English (Chi #54): her own wrong items again where the reading is enough; the rest of the practice is the model's
      if (setup.subject === 'english') {
        const skill: Skill = { tag: `bai_lam_en${++en}`, name: t.label[lang === 'en' ? 'en' : 'vi'], kind: 'other' }, ctx = contextOf(setup, [...skills, skill], source);
        const kept = englishWorkItems(qsOf(t).filter((q) => !q.calc), skill.tag, lang, parent, id).filter((it) => !checkItem(it, { ...ctx, items: [...b.items, ...made] }).length);
        if (kept.length) { skills = [...skills, skill]; made.push(...kept); }
      }
      inKinds.push(t.kind); inPart.push(t.label); continue;   // read, not built by code: the slide still shows it
    }
    if (!taught.includes(t)) { outPart.push(t.label); continue; }
    const { skill, kept } = build(t, qsOf(t), taught.length === 1 ? 4 : 2, id);
    if (!kept.length) { outPart.push(t.label); continue; }
    if (!skills.some((k) => k.tag === skill.tag)) skills = [...skills, skill];
    made.push(...kept); inKinds.push(t.kind); inPart.push(t.label);
  }
  if (!inKinds.length) return { ...none, outPart };
  // the rest of the practice: 1-2 items per skill, a little more where the skill is one of the child's mistakes
  const budget = Math.max(2, Math.round((made.length * 3) / 7), 8 - made.length), rest: Item[] = [], per = new Map<string, number>();
  const order = (['basic', 'good', 'advanced'] as const).flatMap((lv) => b.items.filter((i) => i.level === lv));
  for (const it of order) {
    const kind = skills.find((k) => k.tag === it.skill)?.kind as WorkKind | undefined, cap = kind && inKinds.includes(kind) ? 3 : 2;
    if ((per.get(it.skill) || 0) >= cap || rest.length >= budget) continue;
    per.set(it.skill, (per.get(it.skill) || 0) + 1); rest.push(it);
  }
  const slide = workSlide(w, inKinds, lang, parent), at = b.slides[0]?.kind === 'title' ? 1 : 0;
  return { skills, slides: [...b.slides.slice(0, at), slide, ...b.slides.slice(at)], items: [...made, ...b.items.filter((i) => rest.includes(i))], made: made.length, inPart, outPart };
}

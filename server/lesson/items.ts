// Practice items: built and checked by code (Chi's spec "Kiểm tra câu hỏi bằng code", 27 Oct).
// The principle: the AI supplies data, code writes the question and works out the answer. A maths
// item arrives as numbers (a, op, b, distractors, a story) and code writes what pupils see, so an
// item can never miss its calculation (S) or carry a wrong answer.
// Every rule returns issues tagged with the error class of the test reports:
//   S calculation missing   K listening word on screen   Q wrong skill   U wrong unit / number not in the story
// plus range, dup, offlesson, punct, lang, empty, long, clue (no single right answer), picture (a
// colour matched to a thing, not a swatch). An item with any issue never reaches anyone.
import type { EnglishItem, Item, Lang, Level, MathItem, Op, Setup, Skill, Subject } from './types.ts';

export type Code = 'S' | 'K' | 'Q' | 'U' | 'scope' | 'range' | 'dup' | 'offlesson' | 'punct' | 'lang' | 'empty' | 'long' | 'shape' | 'clue' | 'picture';
export interface Issue { code: Code; msg: string }
export interface Scope { max?: number; ops?: Op[] }
// items: the lesson's other items, so a good or advanced item cannot repeat a basic one (Chi #31)
export interface CheckContext { subject: Subject; grade: number; lang: Lang; skills: Skill[]; source: string; scope?: Scope; items?: Item[] }

// Chi's scope rule: the lesson stays inside its section of the book. "phạm vi 100" caps every number;
// only the operations the section teaches are allowed (a section on addition gets no subtraction).
// hint: the lesson's title and the assigner's note (which carries the child's work when the lesson
// comes from a photo of it), read for the number range only when the section itself does not give one.
export function scopeOf(source: string, hint = ''): Scope {
  const t = source.toLowerCase(), title = t.split('\n')[0], [hintTitle = '', ...note] = hint.toLowerCase().split('\n');
  // Chi #47: the range follows "phạm vi 1000" / "within 1000" (the part's title, then the lesson's, then the
  // part's text), then the numbers its calculations use, then the child's work in the note. A grade-2 book
  // reaches 1000 in its second volume, so the grade alone is not the range.
  const max = rangeIn(title) ?? rangeIn(hintTitle) ?? rangeIn(t) ?? calcRange(t) ?? rangeIn(note.join('\n')) ?? calcRange(note.join('\n'));
  // whole words, Unicode-aware (\b does not know "ừ" is a letter)
  const word = (w: string) => new RegExp(`(?<!\\p{L})(${w})(?!\\p{L})`, 'u');
  const named = (x: string) => [word('cộng|addition|adding|add').test(x) && '+', word('trừ|subtraction|subtracting|subtract|take away').test(x) && '-', word('nhân|multiplication|multiplying|multiply|times tables?').test(x) && '×', word('chia|division|dividing|divide').test(x) && ':'].filter(Boolean) as Op[];
  // the section's title names its operation ("Phép trừ có nhớ…"): only that one. Otherwise its examples and wording.
  let ops = named(title);
  if (!ops.length) {
    const seen = new Set<Op>(named(t));
    if (/\d\s*\+\s*\d/.test(t)) seen.add('+');
    if (/\d\s*[−–-]\s*\d/.test(t)) seen.add('-');
    if (/\d\s*[×x*]\s*\d/.test(t)) seen.add('×');
    if (/\d\s*[:÷]\s*\d/.test(t)) seen.add(':');
    ops = [...seen];
  }
  return { ...(max !== undefined ? { max } : {}), ...(ops.length ? { ops } : {}) };
}

// "phạm vi 1000", "phạm vi 10 000", "within 1,000": the largest range named in the text
function rangeIn(t: string): number | undefined {
  const caps = [...t.matchAll(/(?:phạm vi|within|up to)\s+(\d{1,3}(?:[ .,]\d{3})+|\d{1,7})(?!\d)/g)].map((m) => Number(m[1].replace(/[ .,]/g, '')));
  return caps.length ? Math.max(...caps) : undefined;
}
// No range named: the numbers the text calculates with ("456 + 278 = 734"), page references left out.
// Only numbers above 100 set a range this way (1000, 10 000…); smaller ones leave the grade's own range.
const RANGES = [1000, 10000, 100000, 1000000];
function calcRange(t: string): number | undefined {
  const x = t.replace(/\[?\b(?:tr|trang|pp?|pages?)\.?\s*\d+(?:\s*[–-]\s*\d+)?\]?/gi, ' ');
  const ns = [...x.matchAll(/(\d+)\s*[+−–×x*:÷=-]\s*(\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
  const top = Math.max(0, ...ns);
  return top > 100 ? RANGES.find((r) => top <= r) : undefined;
}

// The numbers a lesson works with: the section's range when it gives one, else the grade's. In a section
// within 1000 (100, 10 000…) a sum or difference using only numbers up to a tenth of it belongs to an earlier
// chapter: "within 1000" practises 3-digit numbers, so 48 + 37 or 100 − 28 is too small (Chi #47). The
// grade's own range sets no floor (a grade-3 lesson on 2-digit numbers is fine).
const TENS = [100, 1000, 10000, 100000, 1000000];
export function rangeOf(ctx: Pick<CheckContext, 'grade' | 'scope'>): { max: number; floor?: number } {
  const own = ctx.scope?.max, max = own ?? GRADE_MAX[ctx.grade] ?? Infinity;
  return { max, ...(own !== undefined && TENS.includes(own) ? { floor: own / 10 } : {}) };
}

// Carrying (+) or borrowing (−) in any column, not only the ones: 254 + 172 carries in the tens (Chi #47).
// first: the place value of the lowest column that regroups (1 = ones, 10 = tens…), 0 when none does.
export function regroups(a: number, op: Op, b: number): { any: boolean; first: number } {
  if ((op !== '+' && op !== '-') || a < 0 || b < 0) return { any: false, first: 0 };
  let c = 0, place = 1, x = a, y = b;
  while (x > 0 || y > 0) {
    const d = op === '+' ? (x % 10) + (y % 10) + c : (x % 10) - (y % 10) - c;
    c = op === '+' ? (d >= 10 ? 1 : 0) : (d < 0 ? 1 : 0);
    if (c) return { any: true, first: place };
    x = Math.floor(x / 10); y = Math.floor(y / 10); place *= 10;
  }
  return { any: false, first: 0 };
}

// Numbers a grade works with (Chi: grade 1 to 20, grade 2 to 100, grade 3 to 1000); grades 4-5: never negative only.
export const GRADE_MAX: Record<number, number> = { 1: 20, 2: 100, 3: 1000 };

const INSTRUCTION = {
  vi: { mcq: 'Chọn kết quả đúng', fill: 'Điền số thích hợp vào ô trống', truefalse: 'Đúng hay sai?', column: 'Đặt tính rồi tính' },
  en: { mcq: 'Choose the right answer', fill: 'Write the missing number', truefalse: 'True or false?', column: 'Write in columns, then work it out' },
};
export const SIGN: Record<Op, string> = { '+': '+', '-': '−', '×': '×', ':': ':' };

export function compute(a: number, op: Op, b: number): number {
  return op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b;
}

// Deterministic shuffle (the same item always shows its options in the same order).
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = [...seed].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// --- numbers in words (Chi #52: "Say, read and write numbers to 1000" got only sums) ---
// Code writes the words, so they are always right: 321 -> "three hundred and twenty-one", "ba trăm hai mươi mốt".
const EN1 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const VI1 = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const en99 = (n: number) => (n < 20 ? EN1[n] : EN10[Math.floor(n / 10)] + (n % 10 ? `-${EN1[n % 10]}` : ''));
const en999 = (n: number) => { const h = Math.floor(n / 100), r = n % 100; return h ? `${EN1[h]} hundred${r ? ` and ${en99(r)}` : ''}` : en99(r); };
// mười lăm, hai mươi mốt (but mười một), hai mươi lăm
const vi99 = (n: number) => { const t = Math.floor(n / 10), o = n % 10; return !t ? VI1[o] : (t === 1 ? 'mười' : `${VI1[t]} mươi`) + (!o ? '' : o === 5 ? ' lăm' : o === 1 && t > 1 ? ' mốt' : ` ${VI1[o]}`); };
// after a thousand every hundred is said, "không trăm" too: 2005 = hai nghìn không trăm linh năm
const vi999 = (n: number, lead: boolean) => { const h = Math.floor(n / 100), r = n % 100; return lead && !h ? vi99(r) : `${VI1[h]} trăm${!r ? '' : r < 10 ? ` linh ${VI1[r]}` : ` ${vi99(r)}`}`; };
export function numberWords(n: number, lang: Lang): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e6) return '';
  const th = Math.floor(n / 1000), r = n % 1000;
  if (lang === 'vi') return th ? `${vi999(th, true)} nghìn${r ? ` ${vi999(r, false)}` : ''}` : vi999(r, true);
  return th ? `${en999(th)} thousand${!r ? '' : r < 100 ? ` and ${en99(r)}` : ` ${en999(r)}`}` : en999(r);
}
// the numbers children write for one read aloud: 321 -> 312, 30021 (written as heard: 300, 21), 231; 305 -> 350, 3005
export function readSlips(n: number): number[] {
  const s = String(n), out: number[] = [], add = (x: string) => { if (x[0] !== '0' && Number(x) !== n && !out.includes(Number(x))) out.push(Number(x)); };
  if (s.length >= 2) add(s.slice(0, -2) + s.at(-1) + s.at(-2));
  const big = n >= 100 ? n - (n % 100) : n - (n % 10);
  if (n >= 20 && n < 1000 && n !== big) add(`${big}${n - big}`);
  if (s.length === 3 && s[1] === '0' && s[2] !== '0') add(s[0] + s[2] + '0');
  if (s.length === 3 && s[2] === '0' && s[1] !== '0') add(s[0] + '0' + s[1]);
  if (s.length >= 3) add(s[1] + s[0] + s.slice(2));
  for (const d of [10, 100, 1]) if (out.length < 3) add(String(n + d));
  return out.slice(0, 3);
}
const READ = {
  vi: { mcq: (w: string) => `Số nào đọc là “${w}”?`, fill: (w: string) => `Viết số: ${w}`, truefalse: (n: number, w: string) => `Đúng hay sai? Số ${n} đọc là “${w}”.`, words: (n: number) => `Số ${n} đọc là gì?` },
  en: { mcq: (w: string) => `Which number is “${w}”?`, fill: (w: string) => `Write this number in digits: ${w}`, truefalse: (n: number, w: string) => `True or false? ${n} in words is “${w}”.`, words: (n: number) => `Which is ${n} in words?` },
};
const READ_PROMPT = /^(?:Which number is “|Write this number in digits: |True or false\? \d+ in words is “|Which is \d+ in words\?|Số nào đọc là “|Viết số: |Đúng hay sai\? Số \d+ đọc là “|Số \d+ đọc là gì\?)/;
// a number-in-words item is sent as a + 0 (b = 0), so a teacher's edit, rebuilt from a, op and b, stays one
export const isReading = (e: MathItem) => e.op === '+' && e.b === 0 && READ_PROMPT.test(e.prompt);
// a skill about saying, reading or writing numbers ("Say, read and write numbers to 1000", "Đọc, viết số")
const READ_SKILL = /(?<!\p{L})(?:say|read|write|name)s?(?!\p{L}).*(?<!\p{L})numbers?(?!\p{L})|(?<!\p{L})in words(?!\p{L})|number names?|(?<!\p{L})đọc(?!\p{L}).*(?<!\p{L})số(?!\p{L})|viết số/iu;
export const readsNumbers = (s: Skill | undefined) => !!s && s.kind === 'other' && READ_SKILL.test(`${s.name} ${s.tag.replace(/_/g, ' ')}`) && !/missing|còn thiếu|thích hợp/iu.test(s.name);
function readExplain(n: number, w: string, lang: Lang): string {
  if (n < 10 || n >= 1000) return lang === 'vi' ? `${n} đọc là “${w}”.` : `${n} in words is “${w}”.`;
  const [h, t, o] = String(n).padStart(3, '0').split('').map(Number), pl = (k: number, x: string) => `${k} ${x}${k === 1 ? '' : 's'}`;
  if (lang === 'vi') return `${n} gồm ${h ? `${h} trăm, ` : ''}${t} chục và ${o} đơn vị, đọc là “${w}”.`;
  return `${n} has ${h ? `${pl(h, 'hundred')}, ` : ''}${pl(t, 'ten')} and ${pl(o, 'one')}: “${w}”.`;
}

// --- maths: from data to the item pupils see ---

export interface RawMath { template: MathItem['template']; skill: string; level: Level; a: number; op: Op; b: number; blank?: MathItem['blank']; shown?: number; distractors?: number[]; story?: string; unit?: string; explain?: string }

export function buildMath(r: RawMath, id: string, lang: Lang): MathItem {
  const a = Math.trunc(Number(r.a)), b = Math.trunc(Number(r.b)), op = (['+', '-', '×', ':'] as Op[]).includes(r.op) ? r.op : '+';
  const result = compute(a, op, b), calc = `${a} ${SIGN[op]} ${b}`;
  const base = { id, subject: 'math' as const, template: r.template, skill: String(r.skill || ''), level: r.level, a, op, b, explain: String(r.explain || '').trim() };
  // Chi #52: a number in words (a + 0): words -> number as a choice or written in digits, number -> words as a choice of
  // words or true or false
  if (op === '+' && b === 0 && numberWords(a, lang)) {
    const w = numberWords(a, lang), explain = readExplain(a, w, lang);
    // "Which is 321 in words?": the right words and the words of the slips children make (312, 231, 30021), checked as
    // text (isRight). Kept as an mcq with blank 'a' (the number shown, its words chosen), so a teacher's edit stays one
    if (r.template === 'word' || (r.template === 'mcq' && r.blank === 'a')) {
      const distractors = readSlips(a).filter((d) => numberWords(d, lang));
      return { ...base, template: 'mcq', blank: 'a', explain, distractors, prompt: READ[lang].words(a), options: shuffle([a, ...distractors].map((n) => numberWords(n, lang)), id + a), answer: w };
    }
    if (r.template === 'mcq') { const distractors = readSlips(a); return { ...base, explain, distractors, prompt: READ[lang].mcq(w), options: shuffle([a, ...distractors].map(String), id + a), answer: String(a) }; }
    if (r.template === 'truefalse') {
      const s = Math.trunc(Number(r.shown)), shown = r.shown != null && numberWords(s, lang) ? s : a;
      return { ...base, template: 'truefalse', explain, shown, prompt: READ[lang].truefalse(a, numberWords(shown, lang)), answer: shown === a ? 'true' : 'false' };
    }
    return { ...base, template: 'fill', blank: 'result', explain, prompt: READ[lang].fill(w), answer: String(a) };
  }
  switch (r.template) {
    case 'mcq': {
      let distractors = (r.distractors || []).map((d) => Math.trunc(Number(d))).filter(Number.isFinite).slice(0, 3);
      // Chi: wrong options are mistakes children really make. With carrying or borrowing, the forgotten 1 is always one of them
      // (in the lowest column that regroups: 254 + 172 forgets the 1 in the tens, 326)
      const g = regroups(a, op, b), slip = !g.any ? null : op === '+' ? result - g.first * 10 : result + g.first * 10;
      if (slip !== null && slip >= 0 && slip !== result && !distractors.includes(slip)) distractors = [slip, ...distractors.filter((d) => d !== result)].slice(0, 3);
      return { ...base, distractors, prompt: `${INSTRUCTION[lang].mcq}: ${calc} = ?`, options: shuffle([result, ...distractors].map(String), id + calc), answer: String(result) };
    }
    case 'fill': {
      const blank = r.blank === 'a' || r.blank === 'b' ? r.blank : 'result';
      const eq = blank === 'a' ? `? ${SIGN[op]} ${b} = ${result}` : blank === 'b' ? `${a} ${SIGN[op]} ? = ${result}` : `${calc} = ?`;
      return { ...base, blank, prompt: `${INSTRUCTION[lang].fill}: ${eq}`, answer: String(blank === 'a' ? a : blank === 'b' ? b : result) };
    }
    case 'truefalse': {
      const shown = Number.isFinite(Number(r.shown)) ? Math.trunc(Number(r.shown)) : result;
      return { ...base, shown, prompt: `${INSTRUCTION[lang].truefalse} ${calc} = ${shown}`, answer: shown === result ? 'true' : 'false' };
    }
    // Chi #47: "đặt tính rồi tính", the two numbers set out in columns; the pupil writes the result
    case 'column':
      return { ...base, template: 'column', prompt: `${INSTRUCTION[lang].column}: ${calc}`, answer: String(result) };
    case 'word':
    default:
      return { ...base, template: 'word', story: String(r.story || '').trim(), unit: String(r.unit || '').trim(), prompt: String(r.story || '').trim(), answer: String(result) };
  }
}

// --- English: kept as written, checked by code ---

// why: from the model a list of {option, why}; from code or an edit already a map
export interface RawEnglish { template: EnglishItem['template']; skill: string; level: Level; prompt: string; pairs?: { word: string; emoji: string }[]; sentence?: string; say?: string; words?: string[]; options?: string[]; answer?: string; explain?: string; why?: Record<string, string> | { option: string; why: string }[] }

// Chi #52: the model copied the book's own instruction ("Read and play the game.") onto matching, and a child did not
// know to match. Code writes that instruction, like the maths ones; lang: the lesson's (else the model's prompt says it).
const MATCH_PROMPT = { vi: 'Nối mỗi từ với hình đúng.', en: 'Match each word to its picture.' };

export function buildEnglish(r: RawEnglish, id: string, lang?: Lang): EnglishItem {
  const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const it: EnglishItem = { id, subject: 'english', template: r.template, skill: clean(r.skill), level: r.level, prompt: clean(r.prompt), explain: clean(r.explain), answer: clean(r.answer) };
  if (r.template === 'match') it.prompt = MATCH_PROMPT[lang ?? (VI.test(it.prompt) ? 'vi' : 'en')];
  if (r.template === 'match') { it.pairs = (r.pairs || []).map((p) => ({ word: clean(p.word), emoji: clean(p.emoji) })).slice(0, 5); it.answer = it.pairs.map((p) => `${p.word}=${p.emoji}`).join(','); }
  if (r.template === 'fill') { it.sentence = clean(r.sentence); it.options = (r.options || []).map(clean).slice(0, 4); }
  if (r.template === 'listen') { it.say = clean(r.say); it.options = (r.options || []).map(clean).slice(0, 4); }
  if (r.template === 'order') it.words = (r.words || []).map(clean).filter(Boolean).slice(0, 12);
  const why = it.template === 'fill' || it.template === 'listen' ? whyOf(r.why, it.options || [], it.answer) : undefined;
  if (why) it.why = why;
  return it;
}

// Chi #52: one reason for each wrong option ("floor": the floor is lava, you must not step on it), the hint when she
// picks that one. A reason is kept only when its key is a wrong option and it is short and never names the answer.
function whyOf(raw: RawEnglish['why'], options: string[], answer: string): Record<string, string> | undefined {
  const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const list = Array.isArray(raw) ? raw.map((x) => [x?.option, x?.why]) : raw && typeof raw === 'object' ? Object.entries(raw) : [];
  const aw = words(answer), phrase = ` ${aw.join(' ')} `, content = aw.filter((w) => !FUNCTION_WORDS.has(w)), out: [string, string][] = [];
  for (const [k, v] of list) {
    const o = options.find((x) => x.toLowerCase() === clean(k).toLowerCase()), why = clean(v), ww: string[] = [...words(why)];
    if (!o || o.toLowerCase() === answer.toLowerCase() || out.some(([x]) => x === o) || !why || why.length > 140) continue;
    if (!aw.length || ` ${ww.join(' ')} `.includes(phrase) || content.some((w) => ww.includes(w))) continue;
    // never calls the wrong option right (live test 1 Nov: "'Blue' is the answer, not the question word.")
    if (/\b(is|are) (the|a) (right |correct )?answer\b|\bis (right|correct)\b|là đáp án|là (câu|từ) đúng|\bđúng rồi\b/iu.test(why)) continue;
    out.push([o, why]);
  }
  return out.length ? Object.fromEntries(out) : undefined;
}

// --- the rules ---

const words = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
const nums = (s: unknown) => (String(s ?? '').match(/\d+/g) || []).map(Number);
const has = (text: string, n: number) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(text);
const VI = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const TAIL = new Set(['có', 'còn', 'lại', 'được', 'tất', 'cả', 'là', 'đã', 'thì', 'nữa', 'vậy', 'em', 'bạn', 'của']);

// "Hỏi đàn có bao nhiêu con gà mái?" -> ["con", "gà", "mái"]; "How many apples are there?" -> ["apples"]
export function askedThing(story: string): string[] | null {
  const vi = /bao nhiêu\s+([^?.,!]+?)\s*\?/iu.exec(story);
  if (vi) { const w = words(vi[1]); while (w.length && TAIL.has(w[w.length - 1])) w.pop(); return w.length ? w.slice(0, 3) : null; }
  const en = /how many\s+(\p{L}+)/iu.exec(story);
  return en ? [en[1].toLowerCase()] : null;
}

function mathRules(e: MathItem, ctx: CheckContext, out: Issue[]) {
  // the section's range when it names one (a grade-2 book goes to 1000 in its second volume), else the grade's
  const { max, floor } = rangeOf(ctx), result = compute(e.a, e.op, e.b);
  const skill = ctx.skills.find((s) => s.tag === e.skill), kind = skill?.kind, reading = isReading(e);
  // Chi #52: a skill on reading and writing numbers gets numbers in words, never sums; other skills never get them
  if (reading && !readsNumbers(skill)) out.push({ code: 'Q', msg: `a number-in-words item, but the skill "${e.skill}" is not about reading or writing numbers` });
  if (!reading && readsNumbers(skill)) out.push({ code: 'Q', msg: `the skill "${skill!.name}" is about reading and writing numbers: give a = the number and b = 0 (a number in words), not a sum` });
  if (reading && floor && e.a <= floor) out.push({ code: 'scope', msg: `${e.a} is too small for this section, which works within ${max}` });
  if (!Number.isFinite(result) || !Number.isInteger(result)) out.push({ code: 'range', msg: 'the result is not a whole number' });
  if (ctx.scope?.max !== undefined && [e.a, e.b, result].some((n) => n > ctx.scope!.max!)) out.push({ code: 'scope', msg: `numbers above ${ctx.scope.max}, outside this section of the book` });
  // Chi #47: too small is outside the section too: "within 1000" means 3-digit numbers, not 48 + 37 or 100 − 28
  if (!reading && floor && (e.op === '+' || e.op === '-') && [e.a, e.b, result].every((n) => n <= floor)) out.push({ code: 'scope', msg: `${e.a} ${SIGN[e.op]} ${e.b} only uses numbers up to ${floor}; this section works within ${max}, so use its bigger numbers` });
  if (!reading && ctx.scope?.ops && !ctx.scope.ops.includes(e.op)) out.push({ code: 'scope', msg: `"${SIGN[e.op]}" is not taught in this section of the book` });
  if ([e.a, e.b, result].some((n) => n < 0 || n > max)) out.push({ code: 'range', msg: ctx.scope?.max !== undefined ? `numbers outside 0–${max} or negative` : `numbers outside grade ${ctx.grade} (0–${max}) or negative` });
  if (e.template === 'mcq') {
    if ((e.distractors || []).length < 2) out.push({ code: 'shape', msg: 'needs at least 2 wrong options' });
    if (new Set(e.options).size !== (e.options || []).length) out.push({ code: 'dup', msg: 'repeated options' });
    if ((e.distractors || []).some((d) => d < 0)) out.push({ code: 'range', msg: 'a negative option' });
  }
  if (e.template === 'truefalse' && e.shown !== undefined && (e.shown < 0 || e.shown > max * 2)) out.push({ code: 'range', msg: 'the claimed result is out of range' });
  // Q: the skill fits the calculation
  const carries = regroups(e.a, e.op, e.b).any;
  if ((kind === 'add_carry' || kind === 'add_no_carry') && e.op !== '+') out.push({ code: 'Q', msg: `an addition skill on ${e.op}` });
  if ((kind === 'sub_borrow' || kind === 'sub_no_borrow') && e.op !== '-') out.push({ code: 'Q', msg: `a subtraction skill on ${e.op}` });
  if ((kind === 'add_carry' || kind === 'sub_borrow') && !carries) out.push({ code: 'Q', msg: `${e.a} ${SIGN[e.op]} ${e.b} has no ${e.op === '+' ? 'carrying' : 'borrowing'}, but the skill is "${e.skill}"` });
  if ((kind === 'add_no_carry' || kind === 'sub_no_borrow') && carries) out.push({ code: 'Q', msg: `${e.a} ${SIGN[e.op]} ${e.b} needs ${e.op === '+' ? 'carrying' : 'borrowing'}, but the skill is "${e.skill}"` });
  if (kind === 'column' && e.template === 'fill' && e.blank !== 'result') out.push({ code: 'Q', msg: 'finding a missing number is not column calculation' });
  if (e.template === 'column') {
    if (e.op === ':') out.push({ code: 'shape', msg: 'division is not set out in columns here; use +, − or ×' });
    else if (e.op === '×' && e.b >= 10) out.push({ code: 'shape', msg: 'column multiplication is by a one-digit number' });
    if (Math.max(e.a, e.b) < 10) out.push({ code: 'shape', msg: 'one-digit numbers need no columns' });
  }
  if (kind === 'find_missing' && !(e.template === 'fill' && e.blank !== 'result')) out.push({ code: 'Q', msg: 'a find-the-missing-number skill needs the blank on a number' });
  if (kind === 'multiply' && e.op !== '×') out.push({ code: 'Q', msg: 'a multiplication skill without ×' });
  if (kind === 'divide' && e.op !== ':') out.push({ code: 'Q', msg: 'a division skill without :' });
  // S / U for word problems
  if (e.template === 'word') {
    if (!e.story) out.push({ code: 'S', msg: 'the word problem has no story' });
    else {
      if (![e.a, e.b].every((n) => has(e.story!, n))) out.push({ code: 'U', msg: 'the calculation uses a number that is not in the story' });
      const asked = askedThing(e.story);
      if (!asked) out.push({ code: 'S', msg: 'the story does not end with a question' });
      else if (!asked.every((w) => words(e.unit).some((u) => u === w || u.replace(/s$/, '') === w.replace(/s$/, '')))) out.push({ code: 'U', msg: `the question asks for "${asked.join(' ')}" but the unit is "${e.unit || ''}"` });
    }
  }
}

// words any sentence may use although the section does not print them
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'am', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'with', 'what', 'do', 'does', 'have', 'has', 'can', 'not', 'yes', 'no', 's']);

// Chi #31: an English fill item needs exactly one right option. These words make a sentence about
// likes or opinions ("My favourite colour is ___."): the child's own choice cannot be marked wrong.
const OPINION = new Set(['favourite', 'favourites', 'favorite', 'favorites', 'like', 'likes', 'love', 'loves', 'want', 'wants', 'prefer', 'prefers', 'think', 'thinks', 'best', 'enjoy', 'enjoys', 'hate', 'hates', 'wish']);
// words that never tell which option is right ("Look! It is ___." says nothing)
const NO_CLUE = new Set([...FUNCTION_WORDS, 'here', 'there', 'was', 'were', 'be', 'look', 'very', 'so', 'too', 'please', 'oh', 'wow', 'now', 'colour', 'color']);
// Colour words, the plain swatch emoji for each (pink and grey have none), and things whose colour a
// child knows, so "The sky is ___." settles blue. A thing with two colours (apple) settles neither.
const SWATCH: Record<string, string[]> = { red: ['🟥', '🔴'], orange: ['🟧', '🟠'], yellow: ['🟨', '🟡'], green: ['🟩', '🟢'], blue: ['🟦', '🔵'], purple: ['🟪', '🟣'], brown: ['🟫', '🟤'], black: ['⬛', '⚫'], white: ['⬜', '⚪'], pink: [], grey: [], gray: [] };
const COLOUR_OF: Record<string, string[]> = {
  sky: ['blue'], sea: ['blue'], grass: ['green'], leaf: ['green'], leaves: ['green'], frog: ['green'], sun: ['yellow'], banana: ['yellow'], lemon: ['yellow'], chick: ['yellow'],
  apple: ['red', 'green'], tomato: ['red'], tomatoes: ['red'], strawberry: ['red'], strawberries: ['red'], cherry: ['red'], cherries: ['red'], carrot: ['orange'], pumpkin: ['orange'],
  snow: ['white'], milk: ['white'], cloud: ['white'], coal: ['black'], crow: ['black'], chocolate: ['brown'], pig: ['pink'], flamingo: ['pink'], grape: ['purple', 'green'],
};
// Chi #52: "elbows" was shown as 💪, which reads as "strong" or "arm". An emoji that stands for something else fits
// only its own words; a body part with no emoji of its own stays out of matching.
const READS_AS: Record<string, string[]> = {
  '💪': ['arm', 'strong', 'muscle'], '👋': ['hello', 'hi', 'bye', 'goodbye', 'wave'], '👍': ['good', 'ok', 'okay', 'yes', 'thumb'], '✋': ['hand', 'stop'], '🖐': ['hand', 'five'], '🤚': ['hand'],
  '👆': ['finger', 'up'], '☝': ['finger', 'one'], '👏': ['clap', 'hand'], '👀': ['eye', 'look', 'see'], '👁': ['eye'], '👂': ['ear', 'listen', 'hear'], '👃': ['nose', 'smell'],
  '👄': ['mouth', 'lip'], '👅': ['tongue', 'taste'], '🦷': ['tooth'], '🦵': ['leg'], '🦶': ['foot'], '🧠': ['brain'], '❤': ['heart', 'love'],
};
const NO_PICTURE = new Set(['elbow', 'knee', 'shoulder', 'neck', 'toe', 'chin', 'cheek', 'wrist', 'ankle', 'hip', 'back', 'tummy', 'stomach', 'chest', 'head', 'body']);
const one = (w: string) => ({ teeth: 'tooth', feet: 'foot' } as Record<string, string>)[w] ?? (w.length > 3 ? w.replace(/s$/, '') : w);
// the book's own game and activity lines, which do not tell a child what to do with the item
const BOOK_LINE = /(?<!\p{L})(?:play the game|and play|let'?s play|look and say|let'?s (?:sing|chant|talk)|chơi trò chơi)(?!\p{L})/iu;
const own = <T>(o: Record<string, T>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
const colourHints = (w: string) => own(COLOUR_OF, w) ?? own(COLOUR_OF, w.replace(/s$/, ''));

// What the pupil is asked, without the instruction line: two items with the same one are the same item.
export function questionOf(e: Item): string {
  if (e.subject === 'math') return e.prompt;
  if (e.template === 'match') return (e.pairs || []).map((p) => p.word.toLowerCase()).sort().join(', ');
  if (e.template === 'order') return e.answer;
  return `${e.template === 'fill' ? e.sentence : e.say} (${e.answer})`;
}
const sameQuestion = (a: Item, b: Item) => a.template === b.template && words(questionOf(a)).join(' ') === words(questionOf(b)).join(' ');

// Chi #31: a fill item's sentence must make its answer the only right option.
function fillClue(e: EnglishItem, out: Issue[]) {
  const answer = e.answer.toLowerCase();
  if (!answer || FUNCTION_WORDS.has(answer)) return;   // a grammar gap ("What colour ___ it?" -> is): the sentence's grammar decides
  // the sentence without its gap and without a speaker label ("Mai: It is ___.")
  const rest = words(String(e.sentence ?? '').replace(/^\s*\p{Lu}\p{L}*\s*:/u, '').replace(/_{2,}/g, ' '));
  if (rest.some((w) => OPINION.has(w))) out.push({ code: 'clue', msg: 'a sentence about likes or opinions has no single right answer; write a sentence about a fact' });
  if (!rest.some((w) => !NO_CLUE.has(w) && !/^\d+$/.test(w))) out.push({ code: 'clue', msg: `nothing in "${e.sentence}" tells which option is right; name the thing it is about ("The sky is ___.")` });
  else if (own(SWATCH, answer) && (e.options || []).filter((o) => own(SWATCH, o.toLowerCase())).length >= 2) {
    const fits = new Set(rest.flatMap((w) => colourHints(w) ?? []).filter((c) => (e.options || []).some((o) => o.toLowerCase() === c)));
    if (fits.size !== 1 || !fits.has(answer)) out.push({ code: 'clue', msg: fits.size > 1 ? `more than one colour option fits "${e.sentence}"` : `nothing in "${e.sentence}" makes "${e.answer}" the only right colour; name a thing with one known colour ("The sky is ___." -> blue)` });
  }
}

function englishRules(e: EnglishItem, ctx: CheckContext, out: Issue[]) {
  const kind = ctx.skills.find((s) => s.tag === e.skill)?.kind, lesson = new Set(words(ctx.source));
  const inOptions = (o: string[] | undefined) => (o || []).filter((x) => x.toLowerCase() === e.answer.toLowerCase()).length === 1;
  const shown = ` ${words(e.prompt).join(' ')} `;
  const notInLesson = (s: string) => words(s).filter((w) => !lesson.has(w) && !FUNCTION_WORDS.has(w) && !/^\d+$/.test(w));
  if (e.template === 'listen') {
    if (!e.say) out.push({ code: 'empty', msg: 'nothing to read aloud' });
    else if (notInLesson(e.say).length) out.push({ code: 'offlesson', msg: `"${notInLesson(e.say).join(', ')}" is not from the lesson` });
    else if (shown.includes(` ${words(e.say).join(' ')} `)) out.push({ code: 'K', msg: 'the question shows the words that are read aloud' });
    if (!inOptions(e.options)) out.push({ code: 'shape', msg: 'the answer must be exactly one of the options' });
  }
  if (e.template === 'fill') {
    if ((String(e.sentence).match(/_{2,}/g) || []).length !== 1) out.push({ code: 'S', msg: 'the sentence needs exactly one ___ gap' });
    if (!inOptions(e.options)) out.push({ code: 'shape', msg: 'the answer must be exactly one of the options' });
    if (words(e.answer).some((w) => !lesson.has(w))) out.push({ code: 'offlesson', msg: `"${e.answer}" is not a word from the lesson` });
    fillClue(e, out);
    // Chi #52: "You must only step on the ___." picked "floor", hint "We say must for a game rule.". The explanation
    // is the hint after a wrong try (with the answer hidden), so it must be about the word in the gap
    const aw = words(e.answer).filter((w) => !FUNCTION_WORDS.has(w)), ew: string[] = [...words(e.explain)];
    if (e.explain && aw.length && !aw.every((w) => ew.includes(w))) out.push({ code: 'shape', msg: `the explanation must be about the answer "${e.answer}" (why it fits and the other options do not), not another word of the sentence` });
  }
  if (e.template === 'order') {
    const want = e.answer.replace(/[.!?]$/, '').split(/\s+/).map((x) => x.toLowerCase()).sort().join(' ');
    const got = (e.words || []).map((x) => x.toLowerCase().replace(/[.!?]$/, '')).sort().join(' ');
    if (want !== got) out.push({ code: 'Q', msg: 'the word cards do not make the answer sentence exactly (punctuation included)' });
    if (notInLesson(e.answer).length) out.push({ code: 'offlesson', msg: `"${notInLesson(e.answer).join(', ')}" is not from the lesson` });
    if ((e.words || []).join(' ').toLowerCase().replace(/[.!?]$/, '') === e.answer.toLowerCase().replace(/[.!?]$/, '')) out.push({ code: 'shape', msg: 'the word cards are not shuffled' });
  }
  if (e.template === 'match') {
    const p = e.pairs || [];
    if (p.length < 3 || new Set(p.map((x) => x.word.toLowerCase())).size !== p.length || new Set(p.map((x) => x.emoji)).size !== p.length) out.push({ code: 'shape', msg: 'needs 3-5 different word-picture pairs' });
    if (p.some((x) => e.prompt.includes(x.emoji)) || p.filter((x) => shown.includes(` ${x.word.toLowerCase()} `)).length >= 2) out.push({ code: 'K', msg: 'the question gives the pairs away' });
    for (const x of p) if (words(x.word).some((w) => !lesson.has(w))) out.push({ code: 'offlesson', msg: `"${x.word}" is not a word from the lesson` });
    // a colour word takes its own swatch, never a thing of that colour: 🌸 reads as a flower, not pink (Chi #31)
    for (const x of p) {
      const sw = own(SWATCH, x.word.toLowerCase());
      if (sw && !sw.includes(x.emoji.replace(/\uFE0F/g, ''))) out.push({ code: 'picture', msg: sw.length ? `"${x.word}" needs its plain colour swatch (${sw.join(' ')}), not ${x.emoji}` : `"${x.word}" has no plain colour swatch emoji; leave it out of matching` });
      const w = one(x.word.toLowerCase()), means = own(READS_AS, x.emoji.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, ''));
      if (NO_PICTURE.has(w)) out.push({ code: 'picture', msg: `"${x.word}" has no clear emoji of its own; leave it out of matching` });
      else if (means && !means.includes(w)) out.push({ code: 'picture', msg: `${x.emoji} reads as "${means.join('", "')}", not "${x.word}"` });
    }
  }
  if (BOOK_LINE.test(e.prompt)) out.push({ code: 'shape', msg: `"${e.prompt}" is the book's own instruction; say what the child does here ("Choose the missing word.")` });
  for (const o of e.options || []) if (!o) out.push({ code: 'empty', msg: 'an empty option' });
  if (new Set((e.options || []).map((o) => o.toLowerCase())).size !== (e.options || []).length) out.push({ code: 'dup', msg: 'repeated options' });
  if (kind === 'comma_clause') {
    const s = e.template === 'order' ? e.answer : e.template === 'fill' ? e.sentence : e.say;
    if (s && !s.includes(',')) out.push({ code: 'Q', msg: `"${s}" has no comma, but the skill is "${e.skill}"` });
  }
}

export function checkItem(e: Item, ctx: CheckContext): Issue[] {
  const out: Issue[] = [];
  if (!ctx.skills.some((s) => s.tag === e.skill)) out.push({ code: 'Q', msg: `"${e.skill}" is not one of the lesson's skills` });
  if (!e.prompt.trim()) out.push({ code: 'empty', msg: 'the question is empty' });
  if (!e.explain.trim()) out.push({ code: 'empty', msg: 'the explanation is empty' });
  if (e.prompt.length > 300 || e.explain.length > 320) out.push({ code: 'long', msg: 'the question or explanation is too long' });
  for (const t of [e.prompt, e.explain, e.subject === 'english' ? e.sentence : e.story]) if (/([.:;,!?])(?!\1)[.:;,!?]/.test(String(t ?? ''))) { out.push({ code: 'punct', msg: 'two different punctuation marks in a row (".:")' }); break; }
  const instr = e.subject === 'math' && e.template === 'word' ? e.story || '' : e.prompt;
  if (words(instr).length >= 4) {
    if (ctx.lang === 'vi' && !VI.test(instr) && (e.subject === 'math' || e.template !== 'order')) out.push({ code: 'lang', msg: 'the question should be in Vietnamese' });
    if (ctx.lang === 'en' && VI.test(instr)) out.push({ code: 'lang', msg: 'the question should be in English' });
  }
  if (e.subject === 'math') mathRules(e, ctx, out); else englishRules(e, ctx, out);
  // Chi #31: the good and advanced levels were copies of the basic one; a harder level of a skill asks something new
  // (English for now: the maths mock still writes the same word problem at every level)
  if (e.subject === 'english' && e.level !== 'basic' && (ctx.items || []).some((o) => o.id !== e.id && o.level === 'basic' && o.skill === e.skill && sameQuestion(o, e))) out.push({ code: 'dup', msg: `the same question as a basic item; a ${e.level} item must be different and a step harder` });
  return out.filter((x, i) => out.findIndex((y) => y.code === x.code && y.msg === x.msg) === i);
}

// the title and note help with the range only (Chi #47), and so do the sums on the child's work (Chi #46)
export const contextOf = (setup: Setup, skills: Skill[], source: string): CheckContext => ({ subject: setup.subject, grade: setup.grade, lang: setup.lang, skills, source, scope: setup.subject === 'math' ? scopeOf(source, `${setup.work?.base || setup.title}\n${setup.note || ''}\n${(setup.work?.questions || []).map((q) => q.q).join('\n')}`) : undefined });

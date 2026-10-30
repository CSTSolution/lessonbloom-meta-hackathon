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
export function scopeOf(source: string): Scope {
  const t = source.toLowerCase(), title = t.split('\n')[0], caps = [...t.matchAll(/(?:phạm vi|within|up to)\s+(\d{1,5})/g)].map((m) => Number(m[1]));
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
  return { ...(caps.length ? { max: Math.max(...caps) } : {}), ...(ops.length ? { ops } : {}) };
}

// Numbers a grade works with (Chi: grade 1 to 20, grade 2 to 100, grade 3 to 1000); grades 4-5: never negative only.
export const GRADE_MAX: Record<number, number> = { 1: 20, 2: 100, 3: 1000 };

const INSTRUCTION = {
  vi: { mcq: 'Chọn kết quả đúng', fill: 'Điền số thích hợp vào ô trống', truefalse: 'Đúng hay sai?' },
  en: { mcq: 'Choose the right answer', fill: 'Write the missing number', truefalse: 'True or false?' },
};
const SIGN: Record<Op, string> = { '+': '+', '-': '−', '×': '×', ':': ':' };

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

// --- maths: from data to the item pupils see ---

export interface RawMath { template: MathItem['template']; skill: string; level: Level; a: number; op: Op; b: number; blank?: MathItem['blank']; shown?: number; distractors?: number[]; story?: string; unit?: string; explain?: string }

export function buildMath(r: RawMath, id: string, lang: Lang): MathItem {
  const a = Math.trunc(Number(r.a)), b = Math.trunc(Number(r.b)), op = (['+', '-', '×', ':'] as Op[]).includes(r.op) ? r.op : '+';
  const result = compute(a, op, b), calc = `${a} ${SIGN[op]} ${b}`;
  const base = { id, subject: 'math' as const, template: r.template, skill: String(r.skill || ''), level: r.level, a, op, b, explain: String(r.explain || '').trim() };
  switch (r.template) {
    case 'mcq': {
      let distractors = (r.distractors || []).map((d) => Math.trunc(Number(d))).filter(Number.isFinite).slice(0, 3);
      // Chi: wrong options are mistakes children really make. With carrying or borrowing, the forgotten 1 is always one of them
      const slip = op === '+' && (a % 10) + (b % 10) >= 10 ? result - 10 : op === '-' && a % 10 < b % 10 ? result + 10 : null;
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
    case 'word':
    default:
      return { ...base, template: 'word', story: String(r.story || '').trim(), unit: String(r.unit || '').trim(), prompt: String(r.story || '').trim(), answer: String(result) };
  }
}

// --- English: kept as written, checked by code ---

export interface RawEnglish { template: EnglishItem['template']; skill: string; level: Level; prompt: string; pairs?: { word: string; emoji: string }[]; sentence?: string; say?: string; words?: string[]; options?: string[]; answer?: string; explain?: string }

export function buildEnglish(r: RawEnglish, id: string): EnglishItem {
  const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const it: EnglishItem = { id, subject: 'english', template: r.template, skill: clean(r.skill), level: r.level, prompt: clean(r.prompt), explain: clean(r.explain), answer: clean(r.answer) };
  if (r.template === 'match') { it.pairs = (r.pairs || []).map((p) => ({ word: clean(p.word), emoji: clean(p.emoji) })).slice(0, 5); it.answer = it.pairs.map((p) => `${p.word}=${p.emoji}`).join(','); }
  if (r.template === 'fill') { it.sentence = clean(r.sentence); it.options = (r.options || []).map(clean).slice(0, 4); }
  if (r.template === 'listen') { it.say = clean(r.say); it.options = (r.options || []).map(clean).slice(0, 4); }
  if (r.template === 'order') it.words = (r.words || []).map(clean).filter(Boolean).slice(0, 12);
  return it;
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
  const max = GRADE_MAX[ctx.grade] ?? Infinity, result = compute(e.a, e.op, e.b);
  const kind = ctx.skills.find((s) => s.tag === e.skill)?.kind;
  if (!Number.isFinite(result) || !Number.isInteger(result)) out.push({ code: 'range', msg: 'the result is not a whole number' });
  if (ctx.scope?.max !== undefined && [e.a, e.b, result].some((n) => n > ctx.scope!.max!)) out.push({ code: 'scope', msg: `numbers above ${ctx.scope.max}, outside this section of the book` });
  if (ctx.scope?.ops && !ctx.scope.ops.includes(e.op)) out.push({ code: 'scope', msg: `"${SIGN[e.op]}" is not taught in this section of the book` });
  if ([e.a, e.b, result].some((n) => n < 0 || n > max)) out.push({ code: 'range', msg: `numbers outside grade ${ctx.grade} (0–${max}) or negative` });
  if (e.template === 'mcq') {
    if ((e.distractors || []).length < 2) out.push({ code: 'shape', msg: 'needs at least 2 wrong options' });
    if (new Set(e.options).size !== (e.options || []).length) out.push({ code: 'dup', msg: 'repeated options' });
    if ((e.distractors || []).some((d) => d < 0)) out.push({ code: 'range', msg: 'a negative option' });
  }
  if (e.template === 'truefalse' && e.shown !== undefined && (e.shown < 0 || e.shown > max * 2)) out.push({ code: 'range', msg: 'the claimed result is out of range' });
  // Q: the skill fits the calculation
  const units = (x: number) => x % 10;
  const carries = e.op === '+' ? units(e.a) + units(e.b) >= 10 : e.op === '-' ? units(e.a) < units(e.b) : false;
  if ((kind === 'add_carry' || kind === 'add_no_carry') && e.op !== '+') out.push({ code: 'Q', msg: `an addition skill on ${e.op}` });
  if ((kind === 'sub_borrow' || kind === 'sub_no_borrow') && e.op !== '-') out.push({ code: 'Q', msg: `a subtraction skill on ${e.op}` });
  if ((kind === 'add_carry' || kind === 'sub_borrow') && !carries) out.push({ code: 'Q', msg: `${e.a} ${SIGN[e.op]} ${e.b} has no ${e.op === '+' ? 'carrying' : 'borrowing'}, but the skill is "${e.skill}"` });
  if ((kind === 'add_no_carry' || kind === 'sub_no_borrow') && carries) out.push({ code: 'Q', msg: `${e.a} ${SIGN[e.op]} ${e.b} needs ${e.op === '+' ? 'carrying' : 'borrowing'}, but the skill is "${e.skill}"` });
  if (kind === 'column' && e.template === 'fill' && e.blank !== 'result') out.push({ code: 'Q', msg: 'finding a missing number is not column calculation' });
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
    }
  }
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

export const contextOf = (setup: Setup, skills: Skill[], source: string): CheckContext => ({ subject: setup.subject, grade: setup.grade, lang: setup.lang, skills, source, scope: setup.subject === 'math' ? scopeOf(source) : undefined });

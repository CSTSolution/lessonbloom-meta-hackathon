// The code check for one slide (Chi, 31 Oct). A generated slide said "Số lớn hơn 60, bé hơn 50" in its
// title (no such number) while its content said "greater than 50 and smaller than 60", and another
// read "57 và 87 = 80 + 7". Like the practice items, a slide's numbers are checked by code:
//   heading  comparisons in the title ("lớn hơn 60", "< 50", "greater than") must be possible and match
//            the bounds the bullets and the example state
//   math     every "a + b = c", "a − b = c", "a × b = c", "a : b = c" (symbols or words: "6 cộng 7 bằng 13"),
//            every "57 > 50" and every "87 gồm 8 chục 7 đơn vị" is recomputed and must be true
//   unit     kg / g, l / ml, m / cm …, con / quả / cái must agree between the title, content and example
// Pure and deterministic. It is careful on purpose: missing a rare case is better than rewriting a
// good slide, so anything it cannot read for sure (decimals, thousands, fractions, blanks, a sum shown
// as a mistake, a unit conversion) is left alone.
import type { Slide } from './types.ts';

export type SlideIssueKind = 'heading' | 'math' | 'unit';
export interface SlideIssue { kind: SlideIssueKind; where: 'heading' | 'bullets' | 'example'; detail: string }
// What the assigner reads on the slide and in the progress line, per kind (Chi's words, 31 Oct).
export const ISSUE_WORDS: Record<SlideIssueKind, { vi: string; en: string }> = {
  heading: { vi: 'tiêu đề không khớp nội dung', en: 'the title did not match the content' },
  math: { vi: 'phép tính chưa đúng hoặc chưa rõ', en: 'a calculation was wrong or unclear' },
  unit: { vi: 'đơn vị không khớp', en: 'the units did not match' },
};
export function issueWords(issues: SlideIssue[]): { vi: string; en: string } {
  const kinds = (['heading', 'math', 'unit'] as SlideIssueKind[]).filter((k) => issues.some((i) => i.kind === k));
  return { vi: kinds.map((k) => ISSUE_WORDS[k].vi).join('; '), en: kinds.map((k) => ISSUE_WORDS[k].en).join('; ') };
}

type Kind = 'mass' | 'volume' | 'length' | 'count';
type Rel = '=' | '>' | '<' | '≥' | '≤' | '≠';
type Op = '+' | '-' | '×' | ':';
type Tok = { s: number; e: number } & (
  | { t: 'num'; v: number; ok: boolean }          // ok false: a decimal, a thousands group, a fraction, a blank, "8 chục"
  | { t: 'unit'; u: string; k: Kind }
  | { t: 'op'; o: Op }
  | { t: 'rel'; r: Rel; word: boolean; bound: boolean }   // word: "bằng", "là", "is" (needs a sum on one side); bound: "more than" (never a statement)
  | { t: 'stop'; q: boolean }                     // . ; ! ? and a label colon; q: a question mark
  | { t: 'comma' } | { t: 'word'; w: string } | { t: 'other' });

const L = '\\p{L}';
const W = (src: string) => new RegExp(`(?:${src})(?!${L})`, 'iuy');
// units right after a number; the canonical name keeps "5 ki-lô-gam" and "5 kg" the same unit
const UNITS: [RegExp, string, Kind][] = ([
  ['ki-?lô-?gam|ki lô gam|kilôgam|kilogams?|kilograms?|kg', 'kg', 'mass'], ['héc-?tô-?gam|hg', 'hg', 'mass'], ['đề-?ca-?gam|dag', 'dag', 'mass'],
  ['gam|grams?|g', 'g', 'mass'], ['tấn|tonnes?|tons?', 'tấn', 'mass'], ['tạ', 'tạ', 'mass'], ['yến', 'yến', 'mass'],
  ['mi-?li-?lít|millilit(?:re|er)s?|ml', 'ml', 'volume'], ['lít|lit(?:re|er)s?|l', 'l', 'volume'],
  ['ki-?lô-?mét|kilomet(?:re|er)s?|km', 'km', 'length'], ['đề-?xi-?mét|decimet(?:re|er)s?|dm', 'dm', 'length'], ['(?:xăng|xen)-?ti-?mét|centimet(?:re|er)s?|cm', 'cm', 'length'],
  ['mi-?li-?mét|millimet(?:re|er)s?|mm', 'mm', 'length'], ['mét|met(?:re|er)s?|m', 'm', 'length'],
  ...['con', 'quả', 'cái', 'chiếc', 'bông', 'cây', 'quyển', 'cuốn', 'viên', 'hộp', 'túi', 'gói', 'bạn', 'người', 'lá', 'tờ', 'que', 'hòn', 'củ', 'bó', 'đôi'].map((w) => [w, w, 'count']),
] as [string, string, Kind][]).map(([src, u, k]) => [W(src), u, k]);
// "8 chục", "3 trăm", "5 nghìn": a place, not a plain number
const PLACE_AFTER = W('nghìn|ngàn|trăm|chục|đơn vị|thousands?|hundreds?|tens?|ones?');
const RELS: [RegExp, Rel, boolean, boolean][] = ([
  ['lớn hơn hoặc bằng', '≥'], ['(?:bé|nhỏ) hơn hoặc bằng', '≤'], ['lớn hơn', '>'], ['(?:bé|nhỏ) hơn', '<'],
  ['(?:is |are )?(?:greater|larger|bigger) than or equal to', '≥'], ['(?:is |are )?(?:less|smaller) than or equal to', '≤'],
  ['(?:is |are )?(?:greater|larger|bigger) than', '>'], ['(?:is |are )?(?:less|smaller) than', '<'],
  ['more than', '>', false, true], ['fewer than', '<', false, true],
  ['is equal to|equals?|bằng|là|được|is|are|makes?|gives?', '=', true],
] as [string, Rel, boolean?, boolean?][]).map(([src, r, word = false, bound = false]) => [W(src), r, word, bound]);
const OPS: [RegExp, Op][] = ([['cộng với|cộng|plus', '+'], ['trừ đi|trừ|minus|take away', '-'], ['nhân với|nhân|times|multiplied by', '×'], ['chia cho|chia|divided by', ':'], ['x', '×']] as [string, Op][]).map(([src, o]) => [W(src), o]);
const SYM: Record<string, ['op', Op] | ['rel', Rel]> = { '+': ['op', '+'], '-': ['op', '-'], '−': ['op', '-'], '–': ['op', '-'], '×': ['op', '×'], '*': ['op', '×'], '÷': ['op', ':'], '=': ['rel', '='], '>': ['rel', '>'], '<': ['rel', '<'], '≥': ['rel', '≥'], '≤': ['rel', '≤'], '≠': ['rel', '≠'] };
const isL = (c: string | undefined) => !!c && /\p{L}/u.test(c);

function lex(text: string): { s: string; toks: Tok[] } {
  const s = text.normalize('NFC').replace(/\s+/g, ' '), toks: Tok[] = [];
  let i = 0;
  const at = (re: RegExp) => { re.lastIndex = i; return re.exec(s)?.[0] ?? null; };
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/\d/.test(c)) {
      const m = at(/\d+(?:[.,]\d+)*/y)!, before = s[i - 1], after = s[i + m.length];
      // "1.000", "2,5", "1/2", "2_", "3?" and "sl09" are not numbers code can be sure of
      const ok = !/[.,]/.test(m) && !/[_?…/□]/u.test(before ?? '') && !/[_?…/□%]/u.test(after ?? '') && !(isL(before) && toks[toks.length - 1]?.t !== 'op');
      const num: Tok = { t: 'num', v: Number(m), ok, s: i, e: i + m.length };
      toks.push(num); i += m.length;
      const j = s[i] === ' ' ? i + 1 : i;
      PLACE_AFTER.lastIndex = j; if (PLACE_AFTER.test(s)) num.ok = false;
      for (const [re, u, k] of UNITS) { re.lastIndex = j; const u0 = re.exec(s)?.[0]; if (u0) { toks.push({ t: 'unit', u, k, s: j, e: j + u0.length }); i = j + u0.length; break; } }
      continue;
    }
    if (isL(c)) {
      let hit = false;
      if (!isL(s[i - 1])) {
        for (const [re, r, word, bound] of RELS) { const m = at(re); if (m) { toks.push({ t: 'rel', r, word, bound, s: i, e: i + m.length }); i += m.length; hit = true; break; } }
        // "phép cộng 36 + 27": the name of the operation, not a plus
        const last = toks[toks.length - 1], named = last?.t === 'word' && ['phép', 'tính'].includes(last.w);
        if (!hit && !named) for (const [re, o] of OPS) { const m = at(re); if (m) { toks.push({ t: 'op', o, s: i, e: i + m.length }); i += m.length; hit = true; break; } }
      }
      if (hit) continue;
      const m = at(/\p{L}+/uy)!;
      toks.push({ t: 'word', w: m.toLowerCase(), s: i, e: i + m.length }); i += m.length;
      continue;
    }
    // "12 : 3" divides; "Ví dụ 2: 48 + 25" is a label
    if (c === ':') toks.push(s[i - 1] === ' ' && s[i + 1] === ' ' ? { t: 'op', o: ':', s: i, e: i + 1 } : { t: 'stop', q: false, s: i, e: i + 1 });
    else if (SYM[c]) { const [t, x] = SYM[c]; toks.push(t === 'op' ? { t, o: x as Op, s: i, e: i + 1 } : { t, r: x as Rel, word: false, bound: false, s: i, e: i + 1 }); }
    else if ('.;!?'.includes(c)) toks.push({ t: 'stop', q: c === '?', s: i, e: i + 1 });
    else if (c === ',') toks.push({ t: 'comma', s: i, e: i + 1 });
    else toks.push({ t: 'other', s: i, e: i + 1 });
    i++;
  }
  return { s, toks };
}

interface Expr { nums: number[]; ops: Op[]; units: (string | undefined)[] }
interface Chain { exprs: Expr[]; rels: Extract<Tok, { t: 'rel' }>[]; start: number; end: number; ok: boolean }

// Every run "number (op number)* (rel number (op number)*)+" in the text.
function chains(toks: Tok[]): Chain[] {
  const out: Chain[] = [];
  let i = 0;
  while (i < toks.length) {
    if (toks[i].t !== 'num') { i++; continue; }
    let j = i, ok = true, start = i;
    const expr = (): Expr => {
      const e: Expr = { nums: [], ops: [], units: [] };
      for (;;) {
        const n = toks[j] as Extract<Tok, { t: 'num' }>;
        e.nums.push(n.v); if (!n.ok) ok = false; j++;
        const u = toks[j];
        if (u?.t === 'unit') { e.units.push(u.u); j++; } else e.units.push(undefined);
        if (toks[j]?.t === 'num') ok = false;               // "1 000": a thousands group, not two numbers
        const o = toks[j];
        if (o?.t === 'op' && toks[j + 1]?.t === 'num') { e.ops.push(o.o); j++; continue; }
        if (o?.t === 'op') ok = false;                      // "36 + ? = 63", "36 + … ": not a whole sum
        return e;
      }
    };
    const exprs = [expr()], rels: Chain['rels'] = [];
    while (toks[j]?.t === 'rel' && toks[j + 1]?.t === 'num') { rels.push(toks[j] as Chain['rels'][number]); j++; exprs.push(expr()); }
    // "Ví dụ 2 : 48 + 25 = 73": the first number is the example's label
    if (exprs[0].ops[0] === ':' && toks[i - 1]?.t === 'word') { exprs[0].nums.shift(); exprs[0].ops.shift(); exprs[0].units.shift(); start = i + 2 + (toks[i + 1]?.t === 'unit' ? 1 : 0); }
    const prev = toks[start - 1];
    if (prev && (prev.t === 'op' || prev.t === 'rel' || prev.t === 'num' || prev.t === 'unit')) ok = false;   // the start of the sum is missing ("? + 27 = 63")
    if (rels.length) out.push({ exprs, rels, start, end: j, ok });
    i = Math.max(j, i + 1);
  }
  return out;
}

function value(e: Expr): number {
  const vals = [e.nums[0]], ops: Op[] = [];
  e.ops.forEach((o, k) => {
    const b = e.nums[k + 1];
    if (o === '×') vals[vals.length - 1] *= b;
    else if (o === ':') vals[vals.length - 1] = b === 0 ? NaN : vals[vals.length - 1] / b;
    else { vals.push(b); ops.push(o); }
  });
  return ops.reduce((acc, o, k) => (o === '+' ? acc + vals[k + 1] : acc - vals[k + 1]), vals[0]);
}
const holds = (a: number, r: Rel, b: number) => {
  const eq = Math.abs(a - b) < 1e-9;
  return r === '=' ? eq : r === '≠' ? !eq : r === '>' ? a > b && !eq : r === '<' ? a < b && !eq : r === '≥' ? a > b || eq : a < b || eq;
};
// a sum shown as a mistake or asked about ("Sai: 36 + 27 = 53", "Đúng hay sai?", "Children often … write
// 52 − 28 = 36") is not the slide's claim
const SHOWN_WRONG = /(?<!\p{L})(sai|nhầm|quên|lỗi|chưa đúng|không đúng|đúng hay sai|đ\/s|thay vì|wrong|mistakes?|errors?|incorrect|forg[eo]t|often|instead of|true or false|not right)(?!\p{L})/iu;
const JOIN = new Set(['và', 'and', 'với', 'with']);

function mathIssues(text: string): string[] {
  const { s, toks } = lex(text), out: string[] = [];
  const shownWrong = SHOWN_WRONG.test(s);
  for (const ch of chains(toks)) {
    if (!ch.ok) continue;
    const said = s.slice(toks[ch.start].s, toks[ch.end - 1].e);
    // "57 và 87 = 80 + 7": a number joined to the sum with "và"/"and" leaves it unclear what equals what
    const k = ch.start - 1;
    if (ch.rels[0].r === '=' && !ch.rels[0].word && toks[k]?.t === 'word' && JOIN.has((toks[k] as { w: string }).w)) {
      let m = k - 1; if (toks[m]?.t === 'unit') m--;
      const before = toks[m - 1];
      if (toks[m]?.t === 'num' && !(before && (before.t === 'op' || before.t === 'rel'))) { out.push(`"${s.slice(toks[m].s, toks[ch.end - 1].e)}" is unclear: a number is joined to the calculation with "${(toks[k] as { w: string }).w}"`); continue; }
    }
    if (shownWrong || (toks[ch.end]?.t === 'stop' && (toks[ch.end] as { q: boolean }).q)) continue;
    for (let p = 0; p < ch.rels.length; p++) {
      const rel = ch.rels[p], a = ch.exprs[p], b = ch.exprs[p + 1];
      if (rel.bound) continue;
      if (rel.word && !a.ops.length && !b.ops.length) continue;            // "Số liền sau của 36 là 37"
      if (new Set([...a.units, ...b.units].filter(Boolean)).size > 1) continue;   // "1 kg = 1000 g": a conversion
      let A = value(a), B = value(b);
      if (!Number.isFinite(A) || !Number.isFinite(B)) continue;
      // "17 : 5 = 3 (dư 2)"
      if (rel.r === '=' && p === ch.rels.length - 1 && a.ops.length === 1 && a.ops[0] === ':' && !b.ops.length) {
        const rem = /^ ?[(,]? ?(?:dư|remainder|r) ?(\d+)/iu.exec(s.slice(toks[ch.end - 1].e));
        if (rem) { const [x, y] = a.nums, r = Number(rem[1]); if (x === y * B + r && r < y) continue; A = NaN; }
      }
      if (!holds(A, rel.r, B)) out.push(`"${said}" is not right${!Number.isFinite(A) ? ' (the division and its remainder do not fit)' : a.ops.length ? ` (${+A.toFixed(6)} on the left)` : ''}`);
    }
  }
  // "87 gồm 8 chục và 7 đơn vị", "8 tens and 7 ones make 87"
  const PLACES: Record<string, number> = { nghìn: 1000, ngàn: 1000, trăm: 100, chục: 10, 'đơn vị': 1, thousand: 1000, thousands: 1000, hundred: 100, hundreds: 100, ten: 10, tens: 10, one: 1, ones: 1 };
  const P = '(?:nghìn|ngàn|trăm|chục|đơn vị|thousands?|hundreds?|tens?|ones?)';
  const PV = `(?:\\d+ ?${P}(?!${L})(?: ?(?:,|và|and) ?| )?)+`;
  const parts = (pv: string) => [...pv.matchAll(new RegExp(`(\\d+) ?(${P})(?!${L})`, 'giu'))].map((m) => [Number(m[1]), PLACES[m[2].toLowerCase()]] as const);
  const check = (n: number, pv: string) => {
    const ps = parts(pv), sum = ps.reduce((t, [c, p]) => t + c * p, 0);
    // "87 có 8 chục" names one digit of 87, which is true; only a sum and digits that both disagree are wrong
    if (sum !== n && !ps.every(([c, p]) => c < 10 && Math.floor(n / p) % 10 === c)) out.push(`"${n}" is not ${pv.trim()}`);
  };
  for (const m of s.matchAll(new RegExp(`(?<![\\d.,])(\\d+) ?(?:gồm|=|là|bằng|có|is|has|equals|makes) (${PV})`, 'giu'))) check(Number(m[1]), m[2]);
  for (const m of s.matchAll(new RegExp(`(?<![\\d.,])(${PV}) ?(?:=|là|bằng|được|gồm|is|are|make|makes|equals?) ?(\\d+)(?![\\d.,])(?! ?${P}(?!${L}))`, 'giu'))) check(Number(m[2]), m[1]);
  return out;
}

interface Bounds { lo?: number; loStrict?: boolean; hi?: number; hiStrict?: boolean; said: string }
// "Số lớn hơn 60, bé hơn 50", "a number greater than 50 and smaller than 60": the bounds put on one
// unknown number. "57 lớn hơn 50" (a number before the words) is a statement, checked as maths.
function bounds(text: string): Bounds[] {
  const { s, toks } = lex(text), out: Bounds[] = [];
  let cur: Bounds = { said: '' }, from = -1;
  const has = (b: Bounds) => b.lo !== undefined || b.hi !== undefined;
  const close = () => { if (has(cur)) out.push(cur); cur = { said: '' }; from = -1; };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'stop') { close(); continue; }
    if (t.t === 'word' && ['số', 'number', 'numbers'].includes(t.w) && has(cur)) { close(); continue; }   // "số lớn hơn 60 và số bé hơn 50": two numbers
    if (t.t === 'num') { if (has(cur)) close(); continue; }
    if (t.t !== 'rel' || t.r === '=' || t.r === '≠') continue;
    const n = toks[k + 1], prev = toks[k - 1];
    if (n?.t !== 'num' || !n.ok || (prev && (prev.t === 'num' || prev.t === 'unit'))) continue;
    const lo = t.r === '>' || t.r === '≥', strict = t.r === '>' || t.r === '<';
    if (lo ? cur.lo !== undefined : cur.hi !== undefined) close();
    if (lo) { cur.lo = n.v; cur.loStrict = strict; } else { cur.hi = n.v; cur.hiStrict = strict; }
    if (from < 0) from = t.s;
    cur.said = s.slice(from, n.e);
    k++;
    if (toks[k + 1]?.t === 'unit') k++;
  }
  close();
  return out;
}
const impossible = (b: Bounds) => b.lo !== undefined && b.hi !== undefined && (b.lo > b.hi || (b.lo === b.hi && !!(b.loStrict || b.hiStrict)));

function unitsOf(text: string) {
  const { toks } = lex(text), out: { n: number; u: string; k: Kind }[] = [];
  toks.forEach((t, k) => { const p = toks[k - 1]; if (t.t === 'unit' && p?.t === 'num' && p.ok) out.push({ n: p.v, u: t.u, k: t.k }); });
  return out;
}

export function checkSlide(slide: Pick<Slide, 'heading' | 'bullets'> & { example?: string }): SlideIssue[] {
  const issues: SlideIssue[] = [];
  const parts: { where: SlideIssue['where']; text: string }[] = [
    { where: 'heading', text: slide.heading || '' }, ...(slide.bullets || []).map((text) => ({ where: 'bullets' as const, text })), { where: 'example', text: slide.example || '' }];
  const add = (kind: SlideIssueKind, where: SlideIssue['where'], detail: string) => { if (!issues.some((i) => i.detail === detail)) issues.push({ kind, where, detail }); };

  // (b) every calculation is right
  for (const p of parts) for (const d of mathIssues(p.text)) add('math', p.where, d);

  // (a) comparison words: possible, and the same bounds in the title and the content
  const hb = bounds(slide.heading || ''), cb = parts.filter((p) => p.where !== 'heading').flatMap((p) => bounds(p.text));
  for (const b of hb) if (impossible(b)) add('heading', 'heading', `the title asks for a number ${b.said}, and no number is like that`);
  for (const b of cb) if (impossible(b)) add('math', 'bullets', `"${b.said}": no number is like that`);
  for (const b of hb) for (const side of ['lo', 'hi'] as const) {
    const v = b[side], said = [...new Set(cb.map((x) => x[side]).filter((x): x is number => x !== undefined))];
    if (v !== undefined && said.length && !said.includes(v)) add('heading', 'heading', `the title says ${side === 'lo' ? 'greater' : 'smaller'} than ${v}, the content says ${side === 'lo' ? 'greater' : 'smaller'} than ${said.join(' / ')}`);
  }

  // (c) units: only clear mismatches
  const hu = unitsOf(slide.heading || ''), eu = unitsOf(slide.example || ''), bu = (slide.bullets || []).flatMap(unitsOf);
  for (const k of ['mass', 'volume', 'length'] as Kind[]) {
    const h = new Set(hu.filter((x) => x.k === k).map((x) => x.u)), c = new Set([...eu, ...bu].filter((x) => x.k === k).map((x) => x.u));
    if (h.size && c.size && ![...h].some((u) => c.has(u))) add('unit', 'heading', `the title uses ${[...h].join(', ')}, the content only ${[...c].join(', ')}`);
  }
  // the same number with another unit of the same kind ("36 quả" in the title, "36 con" in the example)
  const same = (a: typeof hu, b: typeof hu, where: SlideIssue['where'], what: string) => {
    for (const x of a) {
      if (x.k === 'count' && x.n < 2) continue;
      const other = b.filter((y) => y.n === x.n && y.k === x.k);
      if (other.length && !other.some((y) => y.u === x.u)) add('unit', where, `${what} says ${x.n} ${x.u}, the content says ${x.n} ${other[0].u}`);
    }
  };
  same(hu, [...eu, ...bu], 'heading', 'the title');
  same(eu, bu, 'example', 'the example');
  return issues;
}

// The mark a slide carries after a change the assigner asked for: still wrong reads "Kiểm tra lại",
// right clears an old mark (she has seen this slide now).
export function markSlide(slide: Slide): Slide {
  const issues = checkSlide(slide), { flag: _old, ...rest } = slide;
  return issues.length ? { ...rest, flag: { fixed: false, ...issueWords(issues) } } : rest;
}

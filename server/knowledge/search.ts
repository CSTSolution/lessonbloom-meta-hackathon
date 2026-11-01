// Hybrid search in a knowledge area, then a verified match.
//   1 keywords   Postgres full-text on an accent-free copy of each passage (any of the request's words)
//   2 fuzzy      pg_trgm word similarity: misspellings, missing accents, words read from a photo
//   3 structure  how well the section title (lesson, unit) matches the request
// The three ranked lists are fused (reciprocal rank fusion); the best candidates go to Muse Spark, which
// picks the section that really matches and quotes the passages it used. Code verifies every citation:
// the passage must be one of the candidates and the quoted words must be in it. No verified citation:
// no match, and the assigner is told; a lesson is never written from outside her books.
import type { AI } from '../ai/types.ts';
import type { Sql } from '../db/sql.ts';
import { guardedJson, wrapUser } from '../guard/guard.ts';

export interface Candidate { id: string; book_id: string; book: string; section_id: string; section: string; page: number; text: string; score: number }
export interface Match {
  areaId: string;
  // pageFrom/pageTo: places in the file (what lessons and search use); printedFrom/To: as printed in the book (Chi #45)
  section: { id: string; title: string; book: string; bookId: string; pageFrom: number; pageTo: number; printedFrom?: number | null; printedTo?: number | null };
  cited: { id: string; page: number; quote: string }[];        // the passages Muse Spark used, verified
  passages: { id: string; page: number; text: string }[];       // the whole matched section, in order: the lesson's source
}
export class NoMatch extends Error {}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const STOP = new Set(['bai', 'cua', 'va', 'cac', 'nhung', 'cho', 'the', 'and', 'of', 'a', 'to', 'in', 'is', 'la', 'trong', 'mot', 'co', 'hoc', 'sinh', 'lesson', 'unit']);
// Keep numbers ("21", "100") and words; the stop list only applies to the full-text query.
export const terms = (q: string) => [...new Set((fold(q).match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 || /\d/.test(w)))].slice(0, 24);

export async function candidates(sql: Sql, areaId: string, request: string, limit = 12): Promise<Candidate[]> {
  const words = terms(request), ftsWords = words.filter((w) => !STOP.has(w) || /\d/.test(w));
  if (!words.length) return [];
  const tsq = (ftsWords.length ? ftsWords : words).map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean).join(' | ');
  const rows = await sql.query<Candidate & { fts: number; trg: number; sec: number }>(
    `with q as (select lower(unaccent($2)) as q, to_tsquery('simple', $3) as tq)
     select p.id, p.book_id, b.title as book, p.section_id, s.title as section, p.page, p.text,
            ts_rank(p.tsv, q.tq)::float as fts, word_similarity(q.q, p.norm)::float as trg, similarity(lower(unaccent(s.title)), q.q)::float as sec
     from passages p join sections s on s.id = p.section_id join books b on b.id = p.book_id, q
     where p.area_id = $1 and b.status = 'ready' and s.title <> '—'          -- front matter (cover, contents) never matches a lesson
       and (p.tsv @@ q.tq or word_similarity(q.q, p.norm) > 0.3 or similarity(lower(unaccent(s.title)), q.q) > 0.2)
     limit 400`, [areaId, request.slice(0, 500), tsq]);
  if (!rows.length) return [];
  // reciprocal rank fusion of the three lists, plus a bonus when the request names the lesson number
  const rank = (key: 'fts' | 'trg' | 'sec') => new Map([...rows].sort((a, b) => b[key] - a[key]).map((r, i) => [r.id, i + 1]));
  const rf = rank('fts'), rt = rank('trg'), rs = rank('sec'), nums = words.filter((w) => /^\d+$/.test(w));
  for (const r of rows) {
    const named = nums.some((n) => new RegExp(`^\\S+\\s+${n}\\b`).test(fold(r.section)));
    r.score = 1 / (60 + rf.get(r.id)!) + 1 / (60 + rt.get(r.id)!) + 1 / (60 + rs.get(r.id)!) + (named ? 0.05 : 0) + (r.fts > 0 ? 0.002 : 0);
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, limit).map(({ fts: _f, trg: _t, sec: _s, ...c }) => c);
}

const RERANK_SYSTEM = `An assigner (a teacher or a parent) asks for a lesson from her own books. From the numbered passages, choose the ONE section that really matches what she asked for, and quote the passages you used.
- found: false if no passage matches her request (do not choose a section that is only similar).
- section_id: the section of the passages you chose.
- cited: 1-6 passages from that section, each with a short quote (8-20 words) copied exactly from the passage.
- reason: one short sentence.`;
const RERANK_SCHEMA = { type: 'object', properties: { found: { type: 'boolean' }, section_id: { type: 'string' }, cited: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, quote: { type: 'string' } }, required: ['id', 'quote'] } }, reason: { type: 'string' } }, required: ['found', 'cited'] };

// A citation counts only if its passage is a candidate of that section and its words are really in it.
export function verify(cs: Candidate[], sectionId: string, cited: { id: string; quote: string }[]) {
  const byId = new Map(cs.map((c) => [c.id, c]));
  return (cited || []).filter((x) => {
    const c = byId.get(String(x.id)), q = fold(String(x.quote || ''));
    return c && c.section_id === sectionId && q.length >= 12 && fold(c.text).includes(q);
  }).map((x) => ({ id: String(x.id), page: byId.get(String(x.id))!.page, quote: String(x.quote).trim().slice(0, 300) }));
}

export async function findSection(sql: Sql, ai: AI, areaId: string, request: string): Promise<Match> {
  const cs = await candidates(sql, areaId, request);
  if (!cs.length) throw new NoMatch();
  const shown = cs.map((c) => `[${c.id}] (section ${c.section_id}: ${c.section}; p.${c.page})\n${c.text}`).join('\n\n');
  const r = await guardedJson<{ found: boolean; section_id?: string; cited: { id: string; quote: string }[]; reason?: string }>(ai, {
    endpoint: 'rerank', system: RERANK_SYSTEM, prompt: `REQUEST:\n${wrapUser(request)}\n\nPASSAGES:\n${wrapUser(shown)}`, schema: RERANK_SCHEMA, fixture: { request, candidates: cs } });
  const sectionId = String(r.section_id || cs.find((c) => c.id === r.cited?.[0]?.id)?.section_id || '');
  const cited = r.found ? verify(cs, sectionId, r.cited) : [];
  if (!cited.length) throw new NoMatch();
  const s = await sql.one<{ id: string; title: string; book: string; book_id: string; page_from: number; page_to: number }>(
    `select s.id, s.title, b.title as book, b.id as book_id, s.page_from, s.page_to from sections s join books b on b.id = s.book_id where s.id = $1 and b.area_id = $2`, [sectionId, areaId]);
  if (!s) throw new NoMatch();
  const passages = await sql.query<{ id: string; page: number; text: string }>('select id, page, text from passages where section_id = $1 order by ord', [s.id]);
  const printed = printedRange(await shownPages(sql, s.book_id), s.page_from, s.page_to);
  return { areaId, section: { id: s.id, title: s.title, book: s.book, bookId: s.book_id, pageFrom: s.page_from, pageTo: s.page_to, ...printed }, cited, passages };
}

// The lesson's source: the matched section, each passage marked with its page, within a size budget.
export function sourceOf(m: Pick<Match, 'section' | 'passages'>, max = 12000) {
  let out = `${m.section.title}\n`;
  for (const p of m.passages) { const add = `[tr. ${p.page}] ${p.text}\n`; if (out.length + add.length > max) break; out += add; }
  return out.trim();
}
// The page she finds in the paper book (Chi #45): the number printed on it when it was read, else from
// where she said the book's page 1 is in the file; null when neither is known (the file's page is shown).
export type Shown = (page: number) => number | null;
export async function shownPages(sql: Sql, bookId: string): Promise<Shown> {
  const rows = await sql.query<{ page: number; printed: number }>('select page, min(printed) as printed from passages where book_id = $1 and printed is not null group by page', [bookId]);
  const one = Number((await sql.one<{ page_one: number | null }>('select page_one from books where id = $1', [bookId]))?.page_one) || 0;
  const m = new Map(rows.map((r) => [Number(r.page), Number(r.printed)]));
  return (page) => m.get(page) ?? (one && page - one + 1 >= 1 ? page - one + 1 : null);
}
// a range is shown as printed only when both ends are known, so it never mixes the two numberings; and only
// when it fits the part's own pages (Chi #55b: "6–15" must never stand for a part of fewer file pages). A
// spread ("[page N]") holds two printed pages on one file page, so up to twice as many is allowed.
export const printedRange = (shown: Shown, from: number, to: number) => {
  const a = shown(from), b = shown(to);
  return a != null && b != null && b >= a && b - a <= 2 * (to - from) + 1 ? { printedFrom: a, printedTo: b } : { printedFrom: null, printedTo: null };
};
export const pagesLabel = (s: { pageFrom: number; pageTo: number; printedFrom?: number | null; printedTo?: number | null }) => {
  const [a, b] = s.printedFrom != null && s.printedTo != null ? [s.printedFrom, s.printedTo] : [s.pageFrom, s.pageTo];
  return b > a ? `${a}–${b}` : `${a}`;
};
export const citation = (m: Pick<Match, 'section'>, lang: 'vi' | 'en') =>
  `${lang === 'en' ? 'From' : 'Theo'}: ${m.section.book}, ${m.section.title}, ${lang === 'en' ? 'p.' : 'tr.'} ${pagesLabel(m.section)}`;

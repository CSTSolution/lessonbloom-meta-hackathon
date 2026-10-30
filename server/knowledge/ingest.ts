// A book into the knowledge area: PDF -> pages -> paragraphs -> sections (lessons, units) -> passages.
// Structure comes from the book itself: a line that starts a lesson ("Bài 21: …", "Unit 6: …",
// "Chủ đề 3", "Lesson 4") opens a section. A book with no such headings gets its contents from Muse
// Spark, which reads only the first lines of each page. Each passage keeps its page, so every lesson
// can cite "book, page". Passages also get an accent-free copy for search.
import type { AI } from '../ai/types.ts';
import { newId } from '../auth/accounts.ts';
import type { Sql } from '../db/sql.ts';
import { guardedJson, requireOnTask, wrapUser } from '../guard/guard.ts';
import { readPdf, type PdfPage } from './pdf.ts';

export const HEADING = /^(bài|tiết|chủ đề|chương|unit|lesson|chapter|module|topic)\s+(\d{1,3}|[ivxlc]{1,6})\b[\s:.\-–]*[^\s:.\-–]/iu;
// "Bài 1" alone on its line, its title on the next (a printed textbook's lesson badge, as read from a scan)
const BARE = /^(bài|tiết|chủ đề|chương|unit|lesson|chapter|module|topic)\s+(\d{1,3}|[ivxlc]{1,6})[\s:.\-–]*$/iu;
// a page that lists this many lessons is the contents, not where they start (Son's SGK Toán 2, 30 Oct)
const CONTENTS = 4;
export const MAX_PASSAGE = 700;
export interface Section { title: string; pageFrom: number; pageTo: number; paragraphs: { page: number; text: string }[] }

// A title printed in capitals reads as a sentence: "ÔN TẬP CÁC SỐ ĐẾN 100" -> "Ôn tập các số đến 100".
const sentence = (s: string) => {
  const upper = (s.match(/\p{Lu}/gu) ?? []).length, lower = (s.match(/\p{Ll}/gu) ?? []).length;
  return upper > 2 * lower ? s.charAt(0) + s.slice(1).toLocaleLowerCase('vi') : s;
};

// The page's lines, with each heading found (a bare "Bài 1" takes the next line as its title).
function linesOf(text: string): { text: string; heading: boolean }[] {
  const lines = text.split('\n').map((l) => l.trim()), out: { text: string; heading: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], next = lines[i + 1] ?? '';
    if (line.length <= 120 && HEADING.test(line)) { out.push({ text: line, heading: true }); continue; }
    if (BARE.test(line)) {
      const titled = next && next.length <= 100 && !HEADING.test(next) && !BARE.test(next) && /^\p{L}/u.test(next);
      out.push({ text: titled ? `${line.replace(/[\s:.\-–]+$/, '')}. ${sentence(next)}` : line.replace(/[\s:.\-–]+$/, ''), heading: true });
      if (titled) i++;
      continue;
    }
    out.push({ text: line, heading: false });
  }
  // the contents page: its lesson lines are text, not lesson starts
  return out.filter((l) => l.heading).length >= CONTENTS ? out.map((l) => ({ ...l, heading: false })) : out;
}

// Lines wrapped by the page width are joined back into paragraphs: a line that does not end a sentence
// continues on the next one, unless the next line is a heading.
export function paragraphs(pages: PdfPage[]): { page: number; text: string; heading: boolean }[] {
  const out: { page: number; text: string; heading: boolean }[] = [];
  for (const p of pages) {
    let cur: string | null = null;
    const flush = () => { if (cur?.trim()) out.push({ page: p.page, text: cur.trim(), heading: false }); cur = null; };
    for (const { text: line, heading } of linesOf(p.text)) {
      if (!line) { flush(); continue; }
      if (heading) { flush(); out.push({ page: p.page, text: line, heading: true }); continue; }
      cur = cur && !/[.!?:;]["”)]?$/.test(cur) ? `${cur} ${line}` : (flush(), line);
    }
    flush();
  }
  return out;
}

export function sectionsFrom(pars: { page: number; text: string; heading: boolean }[]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const p of pars) {
    if (p.heading) { cur = { title: p.text.slice(0, 120), pageFrom: p.page, pageTo: p.page, paragraphs: [] }; out.push(cur); continue; }
    if (!cur) { cur = { title: '', pageFrom: p.page, pageTo: p.page, paragraphs: [] }; out.push(cur); }   // front matter
    cur.paragraphs.push({ page: p.page, text: p.text });
    cur.pageTo = p.page;
  }
  return out.filter((s) => s.paragraphs.length);
}

// Paragraphs into passages of at most MAX_PASSAGE characters, never across a page.
export function passagesOf(s: Section): { page: number; text: string }[] {
  const out: { page: number; text: string }[] = [];
  for (const p of s.paragraphs) {
    const last = out[out.length - 1];
    if (last && last.page === p.page && last.text.length + p.text.length + 1 <= MAX_PASSAGE) last.text += `\n${p.text}`;
    else for (let i = 0; i < p.text.length; i += MAX_PASSAGE) out.push({ page: p.page, text: p.text.slice(i, i + MAX_PASSAGE) });
  }
  return out;
}

const TOC_SYSTEM = `You build the table of contents of a primary-school book from the first lines of each page. Return the lessons or units in order: title (as printed, short) and the page where it starts. Only what the lines show.`;
const TOC_SCHEMA = { type: 'object', properties: { sections: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, page: { type: 'integer' } }, required: ['title', 'page'] } } }, required: ['sections'] };

// A book with no recognisable headings: Muse Spark reads page openings and lists where lessons start.
async function sectionsByModel(ai: AI, pages: PdfPage[]): Promise<Section[]> {
  const openings = pages.filter((p) => p.text.trim()).map((p) => `[p${p.page}] ${p.text.slice(0, 160).replace(/\s+/g, ' ')}`).join('\n').slice(0, 30000);
  await requireOnTask(ai, openings, 'build the table of contents of a primary-school textbook from page openings.', 'Normal material: textbook pages in Vietnamese or English.');
  const r = await guardedJson<{ sections: { title: string; page: number }[] }>(ai, { endpoint: 'toc', system: TOC_SYSTEM, prompt: wrapUser(openings), schema: TOC_SCHEMA, fixture: { pages: pages.length } });
  const starts = (r.sections || []).map((s) => ({ title: String(s.title || '').trim().slice(0, 120), page: Math.trunc(Number(s.page)) }))
    .filter((s) => s.title && s.page >= 1 && s.page <= pages.length).sort((a, b) => a.page - b.page).filter((s, i, a) => i === 0 || s.page > a[i - 1].page);
  if (!starts.length) return sectionsFrom(paragraphs(pages));
  const pars = paragraphs(pages);
  return starts.map((s, i) => {
    const to = (starts[i + 1]?.page ?? pages.length + 1) - 1;
    return { title: s.title, pageFrom: s.page, pageTo: Math.max(s.page, to), paragraphs: pars.filter((p) => p.page >= s.page && p.page <= to).map(({ page, text }) => ({ page, text })) };
  }).filter((s) => s.paragraphs.length);
}

export class NotText extends Error {}

export async function ingestBook(sql: Sql, ai: AI, areaId: string, bookId: string, pdf: Buffer) {
  const { pages, scanned } = await readPdf(pdf);
  if (!pages.length || scanned / pages.length > 0.5) throw new NotText();
  return ingestPages(sql, ai, areaId, bookId, pages);
}

// The same from pages already read: a PDF's text layer sent by the browser, or pages read from their
// pictures (a scanned book). Pages keep their book page numbers, so every lesson can cite them.
export async function ingestPages(sql: Sql, ai: AI, areaId: string, bookId: string, pages: PdfPage[]) {
  pages = pages.filter((p) => p.text.trim());
  if (!pages.length) throw new NotText();
  let sections = sectionsFrom(paragraphs(pages));
  if (sections.filter((s) => s.title).length < 2) sections = await sectionsByModel(ai, pages);
  // no lesson heading at all (a photo of a page in the middle of a lesson): the whole source is one part,
  // named after the source, so a lesson can always be made from it; she can rename it (Chi #25)
  if (!sections.some((s) => s.title)) {
    const book = await sql.one<{ title: string }>('select title from books where id = $1', [bookId]);
    const pars = paragraphs(pages);
    sections = [{ title: (book?.title || pars[0]?.text || 'Part 1').slice(0, 120), pageFrom: pages[0].page, pageTo: pages[pages.length - 1].page, paragraphs: pars.map(({ page, text }) => ({ page, text })) }];
  }
  await sql.tx(async (t) => {
    let ord = 0;
    for (const [i, s] of sections.entries()) {
      const sid = `${bookId}-s${i + 1}`;
      await t.query('insert into sections (id, book_id, ord, title, page_from, page_to) values ($1, $2, $3, $4, $5, $6)', [sid, bookId, i + 1, s.title || '—', s.pageFrom, s.pageTo]);
      for (const p of passagesOf(s)) {
        ord++;
        await t.query(`insert into passages (id, book_id, area_id, section_id, page, ord, text, norm, tsv)
          values ($1, $2, $3, $4, $5, $6, $7, lower(unaccent($8)), to_tsvector('simple', lower(unaccent($8))))`,
          [`${bookId}-p${ord}`, bookId, areaId, sid, p.page, ord, p.text, `${s.title}\n${p.text}`]);
      }
    }
    await t.query(`update books set status = 'ready', pages = greatest(pages, $2) where id = $1`, [bookId, pages.length]);
  });
  return { pages: pages.length, sections: sections.length };
}

export const newBookId = () => newId(10);

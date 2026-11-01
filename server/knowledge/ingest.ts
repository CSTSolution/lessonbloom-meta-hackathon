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
  // a new sentence inside the title keeps its capital: "TIA SỐ. SỐ LIỀN TRƯỚC" -> "Tia số. Số liền trước"
  return upper > 2 * lower ? (s.charAt(0) + s.slice(1).toLocaleLowerCase('vi')).replace(/([.!?]\s+)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('vi')) : s;
};

// One way to write a heading: "Bài 6 LUYỆN TẬP CHUNG" and "Bài 10: LUYỆN TẬP CHUNG" both read
// "Bài 6: Luyện tập chung" (Chi, 30 Oct: the same book gave both).
const titled = (head: string, title: string) => (title ? `${head}: ${sentence(title.trim())}` : head);
const tidy = (line: string) => { const m = /^(\p{L}+(?:\s\p{L}+)?\s+(?:\d{1,3}|[ivxlc]{1,6}))\b[\s:.\-–]*(.*)$/iu.exec(line); return m ? titled(m[1], m[2]) : line; };

// Cánh Diều and Chân trời sáng tạo print a lesson's title with no number, in capitals in a coloured
// banner at the top of its first page ("PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000", "LUYỆN TẬP CHUNG",
// "EM ÔN LẠI NHỮNG GÌ ĐÃ HỌC"); only "Bài N" was seen before, so such a book was one part (Chi #48).
// The scan marks a page's lesson title "# …" (SCAN_SYSTEM); an unmarked line counts only when it is
// one of the page's first two lines and in capitals. Neither counts in a book with "Bài N" lessons.
const MARK = /^#{1,3}\s+/u;
const PAGE_NO = /^(\d{1,3}|\[(?:page|trang)\s*\d{1,4}\])$/iu;      // a printed page number, or a spread's "[page N]"
// the book's own pages and labels, never a lesson: the cover, contents, preface, credits
const NOT_TITLE = /^(mục lục|lời nói đầu|lời mở đầu|contents|tập (một|hai|ba|1|2|3)\b|nhà xuất bản|bộ giáo dục|hướng dẫn sử dụng|kí hiệu|ký hiệu|bảng tra cứu|giải thích thuật ngữ|ban biên soạn|chủ biên|tổng chủ biên|cánh diều|chân trời sáng tạo|kết nối tri thức)/iu;
// a place-value table's header row ("CHỤC ĐƠN VỊ", "SỐ HẠNG SỐ HẠNG TỔNG")
const TABLE = /^((nghìn|trăm|chục|đơn vị|số hạng|số bị trừ|số trừ|số bị chia|số chia|thừa số|tổng|hiệu|tích|thương|số|viết số|đọc số)[\s,]*)+$/iu;
// Looks like a lesson title: short, starts with a letter, at least two words, not an instruction
// ("Tính:"), not a numbered exercise ("A. …"), not a short question ("Số?", "BAO NHIÊU?").
function titleLike(line: string) {
  const words = line.match(/\p{L}{2,}/gu) ?? [];
  if (line.length < 5 || line.length > 100 || !/^\p{L}/u.test(line) || /^\p{L}[).]/u.test(line) || words.length < 2) return false;
  if (/[:;,.]$/.test(line) || (/\?$/.test(line) && words.length < 4) || NOT_TITLE.test(line) || TABLE.test(line)) return false;
  // mostly letters: "PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000" is, "TÍNH 36 + 27 = ?" is not
  return line.replace(/[\p{L}\s]/gu, '').length * 2 <= (line.match(/\p{L}/gu) ?? []).length;
}
// in capitals; a part in brackets may be printed small: "ÔN TẬP PHÉP CỘNG (không nhớ) TRONG PHẠM VI 100"
const capitals = (line: string) => {
  const bare = line.replace(/\([^)]*\)/g, ' '), up = (bare.match(/\p{Lu}/gu) ?? []).length, low = (bare.match(/\p{Ll}/gu) ?? []).length;
  return up >= 6 && low * 10 <= up;
};
// a numbered heading of one lesson (not of a chapter or topic): such a book keeps to its numbers
const LESSON_NO = /^(bài|tiết|unit|lesson)\s/iu;
// An English book's numbered sub-unit, "1.4 Let's put on a play!", "3.2 Fractions": each is its own lesson
// (Chi #55b: with no word before the number it was not seen, so 1.4 ran on into 1.5 "Mammals and birds").
// The title starts with a capital and reads as a title, so "1.5 m + 2.3 m" or "2.5 kg of rice." is not one.
const SUB = /^(\d{1,2}\.\d{1,2})\.?(?:\s*[:\-–]\s*|\s+)(.+)$/u, SUB_BARE = /^(\d{1,2}\.\d{1,2})\.?$/u;
const subTitle = (t: string) => t.length <= 90 && /^[\p{Lu}"“'‘]/u.test(t) && !/[.:;,]$/.test(t) && (t.match(/\p{L}{2,}/gu) ?? []).length >= 2
  && t.replace(/[\p{L}\s'’"“”‘!?,-]/gu, '').length * 2 <= (t.match(/\p{L}/gu) ?? []).length;
const subHead = (no: string, t: string) => `${no} ${sentence(t.trim())}`;

type Kind = 'number' | 'title';
// The page's lines, with each heading found (a bare "Bài 1" takes the next line as its title).
function linesOf(text: string): { text: string; heading: boolean; kind?: Kind }[] {
  const raw = text.split('\n').map((l) => l.trim()), marked = raw.map((l) => MARK.test(l)), lines = raw.map((l) => l.replace(MARK, ''));
  const out: { text: string; heading: boolean; kind?: Kind }[] = [];
  let top = 0;   // lines read since the page (or a spread's half) began, page numbers aside
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], next = lines[i + 1] ?? '';
    if (!line) { out.push({ text: line, heading: false }); continue; }
    if (PAGE_NO.test(line)) { if (line.startsWith('[')) top = 0; out.push({ text: line, heading: false }); continue; }
    top++;
    if (line.length <= 120 && HEADING.test(line)) { out.push({ text: tidy(line), heading: true, kind: 'number' }); continue; }
    const sub = SUB.exec(line);
    if (sub && subTitle(sub[2])) { out.push({ text: subHead(sub[1], sub[2]), heading: true, kind: 'number' }); continue; }
    // "1.4" in a badge, its title on the next line, at the top of the page
    if (top <= 3 && SUB_BARE.test(line) && next && subTitle(next) && !HEADING.test(next)) { out.push({ text: subHead(line.replace(/\.$/, ''), next), heading: true, kind: 'number' }); i++; top++; continue; }
    if (BARE.test(line)) {
      const hasTitle = next && next.length <= 100 && !HEADING.test(next) && !BARE.test(next) && /^\p{L}/u.test(next);
      out.push({ text: hasTitle ? titled(line.replace(/[\s:.\-–]+$/, ''), next) : line.replace(/[\s:.\-–]+$/, ''), heading: true, kind: 'number' });
      if (hasTitle) { i++; top++; }
      continue;
    }
    if (titleLike(line) && (marked[i] || (top <= 2 && capitals(line)))) {
      // a banner title wrapped onto a second line: "PHÉP CỘNG (KHÔNG NHỚ)" / "TRONG PHẠM VI 1000"
      let title = line;
      if (!marked[i] && next && !marked[i + 1] && capitals(next) && !HEADING.test(next) && !BARE.test(next) && line.length + next.length < 110 && titleLike(`${line} ${next}`)) { title = `${line} ${next}`; i++; top++; }
      out.push({ text: sentence(title), heading: true, kind: 'title' });
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
  const read = pages.map((p) => ({ page: p.page, lines: linesOf(p.text) }));
  // a book whose lessons are numbered ("Bài 21", "Unit 3") keeps to them: a title in capitals there is a
  // part inside a lesson ("LUYỆN TẬP"), as before (Chi #48)
  const numbered = read.reduce((n, p) => n + p.lines.filter((l) => l.heading && l.kind === 'number' && (LESSON_NO.test(l.text) || SUB.test(l.text))).length, 0) >= 2;
  const out: { page: number; text: string; heading: boolean }[] = [];
  for (const p of read) {
    let cur: string | null = null;
    const flush = () => { if (cur?.trim()) out.push({ page: p.page, text: cur.trim(), heading: false }); cur = null; };
    for (const { text: line, heading: h, kind } of p.lines) {
      const heading = h && !(numbered && kind === 'title');
      if (!line) { flush(); continue; }
      if (/^\[(?:page|trang)\s*\d{1,4}\]$/iu.test(line)) { flush(); continue; }   // a spread's "[page N]" marks where a page starts, it is not text
      if (heading) { flush(); out.push({ page: p.page, text: line, heading: true }); continue; }
      cur = cur && !/[.!?:;]["”)]?$/.test(cur) ? `${cur} ${line}` : (flush(), line);
    }
    flush();
  }
  return out;
}

// A part's pages do not hang on what one reading of a scan happened to see (Chi #51d: the same file read
// twice gave "Bài 6" pages 4-7, then 4-6). `pages`: every page of the book, with text or not.
//  - a scrap before a lesson's heading on its page (a header or label the scan copied one time and not the
//    next, under FURNITURE letters and digits) goes with that lesson: the one before ends on the page before;
//  - a page with no text between two lessons (a picture page, a page the scan could not read this time)
//    belongs to the lesson before it: a lesson ends where the next starts. The last ends on its last text.
const FURNITURE = 20;
const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').length;
export function sectionsFrom(pars: { page: number; text: string; heading: boolean }[], pages?: number[]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const p of pars) {
    // the same title again on the next page (a banner printed on each page of a lesson) goes on the same lesson
    if (p.heading && cur?.title && cur.title.toLowerCase() === p.text.slice(0, 120).toLowerCase() && p.page <= cur.pageTo + 1) continue;
    if (p.heading) {
      const next: Section = { title: p.text.slice(0, 120), pageFrom: p.page, pageTo: p.page, paragraphs: [] };
      const k = cur ? cur.paragraphs.findIndex((x) => x.page === p.page) : -1;
      if (cur && k > 0 && alnum(cur.paragraphs.slice(k).map((x) => x.text).join('')) < FURNITURE) { next.paragraphs = cur.paragraphs.splice(k); cur.pageTo = cur.paragraphs[cur.paragraphs.length - 1].page; }
      cur = next; out.push(cur); continue;
    }
    if (!cur) { cur = { title: '', pageFrom: p.page, pageTo: p.page, paragraphs: [] }; out.push(cur); }   // front matter
    cur.paragraphs.push({ page: p.page, text: p.text });
    cur.pageTo = p.page;
  }
  const kept = out.filter((s) => s.paragraphs.length);
  for (const [i, s] of kept.entries()) { const nx = kept[i + 1]; if (nx && pages) s.pageTo = Math.max(s.pageTo, ...pages.filter((n) => n > s.pageTo && n < nx.pageFrom)); }
  return kept;
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

const TOC_SYSTEM = `You build the table of contents of a primary-school book from the first lines of each page. Return the lessons or units in order: title (as printed, short) and the page where it starts. A lesson title may have no number: some books print it in capitals at the top of the page where the lesson starts (for example "PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000", "LUYỆN TẬP", "LUYỆN TẬP CHUNG"); each such title starts its own lesson, and a lesson is usually 1-4 pages. A numbered sub-unit ("1.4 Let's put on a play!", "1.5 Mammals and birds") starts its own lesson too, so a lesson ends where the next one starts. Never an exercise or an instruction. Only what the lines show; the page is the number in [p…].`;
const TOC_SCHEMA = { type: 'object', properties: { sections: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, page: { type: 'integer' } }, required: ['title', 'page'] } } }, required: ['sections'] };

// A book with no recognisable headings: Muse Spark reads page openings and lists where lessons start.
// Its pages keep their numbers in the file (a scan of pages 58-77 is not pages 1-20), and each opening
// keeps its line breaks, so a title alone on the first line can be seen as one (Chi #48).
async function sectionsByModel(ai: AI, pages: PdfPage[]): Promise<Section[]> {
  const openings = pages.filter((p) => p.text.trim()).map((p) => `[p${p.page}] ${p.text.split('\n').map((l) => l.replace(MARK, '').trim()).filter((l) => l && !PAGE_NO.test(l)).slice(0, 4).join(' / ').slice(0, 200)}`).join('\n').slice(0, 30000);
  await requireOnTask(ai, openings, 'build the table of contents of a primary-school textbook from page openings.', 'Normal material: textbook pages in Vietnamese or English.');
  const r = await guardedJson<{ sections: { title: string; page: number }[] }>(ai, { endpoint: 'toc', system: TOC_SYSTEM, prompt: wrapUser(openings), schema: TOC_SCHEMA, fixture: { pages: pages.length } });
  const have = new Set(pages.map((p) => p.page)), last = Math.max(...pages.map((p) => p.page));
  const starts = (r.sections || []).map((s) => ({ title: sentence(String(s.title || '').trim()).slice(0, 120), page: Math.trunc(Number(s.page)) }))
    .filter((s) => s.title && have.has(s.page)).sort((a, b) => a.page - b.page).filter((s, i, a) => i === 0 || s.page > a[i - 1].page);
  if (!starts.length) return sectionsFrom(paragraphs(pages));
  const pars = paragraphs(pages);
  // pages before the first lesson (a cover, the contents) stay front matter, as with headings
  const front = pars.filter((p) => p.page < starts[0].page);
  const out: Section[] = front.length ? [{ title: '', pageFrom: front[0].page, pageTo: front[front.length - 1].page, paragraphs: front.map(({ page, text }) => ({ page, text })) }] : [];
  return out.concat(starts.map((s, i) => {
    const to = (starts[i + 1]?.page ?? last + 1) - 1;
    return { title: s.title, pageFrom: s.page, pageTo: Math.max(s.page, to), paragraphs: pars.filter((p) => p.page >= s.page && p.page <= to).map(({ page, text }) => ({ page, text })) };
  })).filter((s) => s.paragraphs.length);
}

// The page number printed on each page (Chi #45): a scan's file often has a cover, so its page 17 is
// printed 16. Read by the scan (`printed`), or from a text page whose first or last line is a lone
// number. A reading out of step with the others is dropped (the longest run that goes up with the
// file); a guess from the text counts only when 3 pages or more agree on one offset. Pages with no
// reading take the offset most readings share. Lessons and search keep the file's page; this is shown.
export function printedPages(pages: PdfPage[]): Map<number, number> {
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 2000;
  const lone = (text: string) => { const l = text.split('\n').map((x) => x.trim()).filter(Boolean); const m = [l[0], l[l.length - 1]].map((x) => /^\d{1,3}$/.test(x ?? '') ? Number(x) : 0).find((n) => n >= 1); return m ?? 0; };
  const spread = (text: string) => Number(/^\s*\[(?:page|trang)\s*(\d{1,4})\]/iu.exec(text)?.[1] ?? 0);
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const sure = sorted.map((p) => ({ page: p.page, n: ok(p.printed) ? p.printed! : spread(p.text) })).filter((r) => ok(r.n));
  let guess = sorted.filter((p) => !sure.some((r) => r.page === p.page)).map((p) => ({ page: p.page, n: lone(p.text) })).filter((r) => ok(r.n));
  const mode = (rs: { page: number; n: number }[]) => { const c = new Map<number, number>(); for (const r of rs) c.set(r.page - r.n, (c.get(r.page - r.n) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]; };
  const [gd, gc] = mode(guess);
  guess = gc >= 3 && gc * 2 >= guess.length ? guess.filter((r) => r.page - r.n === gd) : [];
  // the longest run of readings that goes up with the file page
  const rs = [...sure, ...guess].sort((a, b) => a.page - b.page), best: number[] = [], prev: number[] = [];
  for (let i = 0; i < rs.length; i++) {
    best[i] = 1; prev[i] = -1;
    for (let j = 0; j < i; j++) if (rs[j].n < rs[i].n && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; }
  }
  const kept: { page: number; n: number }[] = [];
  for (let i = best.length ? best.indexOf(Math.max(...best)) : -1; i >= 0; i = prev[i]) kept.unshift(rs[i]);
  const out = new Map(kept.map((r) => [r.page, r.n]));
  const [d, c] = mode(kept);
  if (c >= 2 && c * 2 >= kept.length) for (const p of sorted) if (!out.has(p.page) && p.page - d >= 1) out.set(p.page, p.page - d);
  return out;
}

export class NotText extends Error {}

export async function ingestBook(sql: Sql, ai: AI, areaId: string, bookId: string, pdf: Buffer) {
  const { pages, scanned } = await readPdf(pdf);
  if (!pages.length || scanned / pages.length > 0.5) throw new NotText();
  return ingestPages(sql, ai, areaId, bookId, pages);
}

// The same from pages already read: a PDF's text layer sent by the browser, or pages read from their
// pictures (a scanned book). Pages keep their place in the file, and the number printed on them when it
// can be read, so every lesson can cite the page as the paper book shows it.
export async function ingestPages(sql: Sql, ai: AI, areaId: string, bookId: string, pages: PdfPage[]) {
  const every = pages.map((p) => p.page);   // with the pages that have no text, so a lesson ends where the next starts (Chi #51d)
  pages = pages.filter((p) => p.text.trim());
  const asRead = pages.slice(0, 400);   // kept with the book, so it can be split again later for free (Chi #54d)
  if (!pages.length) throw new NotText();
  // the printed page numbers; a lone number line that is the page's own number is not lesson text (Chi #45)
  const printed = printedPages(pages);
  pages = pages.map((p) => {
    const n = printed.get(p.page), l = p.text.split('\n');
    if (!n) return p;
    const at = [l.findIndex((x) => x.trim()), l.findLastIndex((x) => x.trim())].find((i) => i >= 0 && l[i].trim() === String(n));
    return at === undefined ? p : { ...p, text: l.filter((_, i) => i !== at).join('\n') };
  }).filter((p) => p.text.trim());
  if (!pages.length) throw new NotText();
  let sections = sectionsFrom(paragraphs(pages), every);
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
        await t.query(`insert into passages (id, book_id, area_id, section_id, page, ord, text, norm, tsv, printed)
          values ($1, $2, $3, $4, $5, $6, $7, lower(unaccent($8)), to_tsvector('simple', lower(unaccent($8))), $9)`,
          [`${bookId}-p${ord}`, bookId, areaId, sid, p.page, ord, p.text, `${s.title}\n${p.text}`, printed.get(p.page) ?? null]);
      }
    }
    await t.query(`update books set status = 'ready', pages = greatest(pages, $2), page_text = $3::jsonb where id = $1`, [bookId, pages.length, JSON.stringify(asRead)]);
  });
  return { pages: pages.length, sections: sections.length };
}

export const newBookId = () => newId(10);

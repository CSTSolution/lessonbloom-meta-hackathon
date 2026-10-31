// The lesson agent (Muse Wonder). It builds the lesson through tools, in the order a good teacher
// would: plan the skills and slides, write the slides, write practice for every skill and level
// (every item built and checked by code, Chi's rules), make flashcards, review the whole lesson, fix
// what the review finds, and leave the teacher a short note.
// The agent decides the plan and the order; code owns every check and every limit:
//   - at most config.maxTurns model turns and per-tool call caps; tool arguments are validated
//   - each turn's text and tool arguments are checked for the canary, keys and code (guard layer 4)
//   - tool results go back inside <user_input>
//   - when the agent stops early or fails, code completes whatever is missing, so a lesson always ends
import type { AI, ChatMsg, ToolCall, ToolSpec } from '../ai/types.ts';
import { Blocked, checkOutput, guardedJson, newCanary, scopedSystem, wrapUser } from '../guard/guard.ts';
import { checkItem, contextOf } from './items.ts';
import { checkSlide, issueWords, type SlideIssue } from './slide-check.ts';
import { fill, langName, maxWords, slideCount, SLIDES_SCHEMA } from './prompts.ts';
import { ENG_KINDS, MATH_KINDS, type AgentNote, type Card, type Item, type Level, type Rejected, type Setup, type Skill, type Slide } from './types.ts';
import { cleanSkills, planLesson, reviewItems, writeCards, writeItems, writeSlides } from './writer.ts';

const LEVEL_WORDS: Record<Level, { vi: string; en: string }> = { basic: { vi: 'cơ bản', en: 'basic' }, good: { vi: 'khá', en: 'good' }, advanced: { vi: 'nâng cao', en: 'advanced' } };
// why the checker turned items down, in words a teacher reads (Chi #36): the issue codes of items.ts, grouped
const WHY: { codes: string[]; vi: string; en: string }[] = [
  { codes: ['S', 'K', 'Q', 'U'], vi: 'đáp án sai', en: 'wrong answer' },
  { codes: ['dup'], vi: 'trùng', en: 'duplicate' },
  { codes: ['scope', 'range', 'offlesson'], vi: 'ngoài phạm vi bài', en: 'outside the lesson' },
  { codes: ['clue'], vi: 'không có một đáp án đúng', en: 'no single right answer' },
  { codes: ['picture'], vi: 'hình không khớp', en: 'picture does not match' },
  { codes: ['punct', 'lang', 'empty', 'long', 'shape'], vi: 'câu chữ chưa đạt', en: 'wording' },
];
const whyOf = (rej: { codes: string[] }[], lang: 'vi' | 'en') => {
  const codes = new Set(rej.flatMap((x) => x.codes));
  return WHY.filter((w) => w.codes.some((c) => codes.has(c))).map((w) => w[lang]).join(', ');
};
// maxSlideFixes: slides the code check has written again, at most, per lesson (each is one more model call)
export const LIMITS = { maxTurns: 18, maxItemCalls: 14, maxItems: 30, minItems: 8, maxFixes: 6, maxSlideFixes: 4 };
export type Say = (vi: string, en: string) => void | Promise<void>;
export interface Built { skills: Skill[]; slides: Slide[]; items: Item[]; cards: Card[]; rejected: Rejected[]; agent: AgentNote }

const AGENT_SYSTEM = `You are LessonBloom's lesson agent. You turn ONE section of the assigner's own book (she is a teacher or a parent) into a complete lesson by calling tools, then leave her a short note. Grade {{grade}}, {{subject}}, language {{lang}}.
Work in this order:
1. save_plan: 2-4 skills the notes really teach (each with the closest kind) and an outline of {{count}} slides (title, warmup, teach/example, practice, summary), each slide serving one of her objectives.
2. write_slides.
3. write_items for every skill: basic and good levels for each skill, advanced for at least one; 2-4 items per call. Templates — maths: mcq, fill, truefalse, word; English: match, fill, listen, order. Code builds and checks every item; read what it rejected and ask again differently if a skill is still short.
4. write_cards.
5. review, then fix only real problems: simplify_slide for text too hard for the grade, drop_item for an item that should not be there.
6. finish: a note to the teacher in {{lang}} (2-3 sentences: what you made, what you checked and changed, anything she should look at herself), and one line per change.
If SETUP has "level": "basic", give most practice at basic level (still some good); if "advanced", lean to good and advanced. If SETUP.note has a focus, aim the practice at it. Never add content that is not in the book section; harder items extend only within it. Practice is "bài luyện tập", never a test; no scores. You have at most {{turns}} turns.`;

const MATHT = ['mcq', 'fill', 'truefalse', 'word'], ENGT = ['match', 'fill', 'listen', 'order'];
const TOOLS = (subject: Setup['subject']): ToolSpec[] => [
  { name: 'save_plan', description: 'Save the lesson plan: the skills and the slide outline.', parameters: { type: 'object', properties: {
    skills: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string', enum: subject === 'math' ? [...MATH_KINDS] : [...ENG_KINDS] } }, required: ['tag', 'name', 'kind'] } },
    outline: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: ['title', 'warmup', 'teach', 'example', 'practice', 'summary'] }, heading: { type: 'string' }, objective: { type: 'string' } }, required: ['kind', 'heading'] } } }, required: ['skills', 'outline'] } },
  { name: 'write_slides', description: 'Write every slide from the saved outline and the teacher\'s notes.', parameters: { type: 'object', properties: {} } },
  { name: 'write_items', description: 'Write practice items for one skill, template and level. Code builds and checks each; returns what was kept and what was rejected and why.', parameters: { type: 'object', properties: {
    skill: { type: 'string' }, template: { type: 'string', enum: subject === 'math' ? MATHT : ENGT }, level: { type: 'string', enum: ['basic', 'good', 'advanced'] }, count: { type: 'integer', minimum: 1, maximum: 4 } }, required: ['skill', 'template', 'level', 'count'] } },
  { name: 'write_cards', description: 'Make the flashcards from the lesson.', parameters: { type: 'object', properties: {} } },
  { name: 'review', description: 'Check the whole lesson in code: objectives covered, slides grounded in the notes, sentence length for the grade, enough practice per skill and level.', parameters: { type: 'object', properties: {} } },
  { name: 'simplify_slide', description: 'Rewrite one slide simpler for the grade (shorter sentences, same facts).', parameters: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } },
  { name: 'drop_item', description: 'Remove one practice item.', parameters: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } },
  { name: 'finish', description: 'End with the note for the teacher and the list of changes.', parameters: { type: 'object', properties: { note: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } } }, required: ['note', 'changes'] } },
];

const words = (s: string): string[] => s.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
export function grounded(quote: string, notes: string): boolean {
  const q = words(quote);
  if (!q.length) return false;
  const all = new Set(words(notes));
  return q.filter((w) => all.has(w)).length / q.length >= 0.8;
}

// The lesson as code sees it: what is missing or too hard. Used by the review tool and the fallback.
export function reviewLesson(setup: Setup, source: string, b: { skills: Skill[]; slides: Slide[]; items: Item[]; cards: Card[] }) {
  const issues: string[] = [];
  if (!b.slides.length) issues.push('no slides yet');
  for (const s of b.slides) {
    if (s.kind !== 'title' && !grounded(s.source, source)) issues.push(`${s.id}: its source quote is not in the book section`);
    for (const t of [s.heading, ...s.bullets]) if (Math.max(0, ...t.split(/[.!?;\n]+/).map((x) => words(x).length)) > maxWords(setup.grade)) { issues.push(`${s.id}: a sentence longer than ${maxWords(setup.grade)} words`); break; }
  }
  // a slide still failing the code check of its numbers (Chi, 31 Oct)
  for (const s of b.slides) { const ci = checkSlide(s); if (ci.length) issues.push(`${s.id}: ${ci.map((i) => i.detail).join('; ')}`); }
  for (const k of b.skills) for (const lv of ['basic', 'good'] as Level[]) if (!b.items.some((i) => i.skill === k.tag && i.level === lv)) issues.push(`skill ${k.tag}: no ${lv} items`);
  if (!b.items.some((i) => i.level === 'advanced')) issues.push('no advanced items');
  if (b.items.length < LIMITS.minItems) issues.push(`only ${b.items.length} items (at least ${LIMITS.minItems})`);
  if (!b.cards.length) issues.push('no flashcards yet');
  const said = words([...b.slides.map((s) => `${s.heading} ${s.bullets.join(' ')}`)].join(' '));
  for (const o of setup.objectives) { const ow = words(o).filter((w) => w.length > 2); if (ow.length && ow.filter((w) => said.includes(w)).length / ow.length < 0.4) issues.push(`objective "${o}" is not clearly taught on a slide`); }
  return issues;
}

export async function simplify(ai: AI, setup: Setup, slide: Slide, reason: string): Promise<Slide> {
  const r = await guardedJson<{ slides: Omit<Slide, 'id'>[] }>(ai, { endpoint: 'slides', creative: true,
    system: `Rewrite ONE slide for grade ${setup.grade} pupils: shorter sentences (at most ${maxWords(setup.grade)} words), easier words, the same facts and the same slide kind, in ${langName(setup.lang)}. Keep its source quote.`,
    prompt: wrapUser(JSON.stringify({ slide, reason })), schema: SLIDES_SCHEMA, fixture: { simplify: slide } });
  const s = r.slides?.[0];
  return s ? { ...slide, heading: String(s.heading || slide.heading).slice(0, 90), bullets: (s.bullets || slide.bullets).map((x) => String(x).slice(0, 160)).slice(0, 4), notes: String(s.notes || slide.notes).slice(0, 500), narration: String(s.narration || slide.narration).slice(0, 600) } : slide;
}

// A slide the code check turned down (Chi, 31 Oct), written again once: the title, the content and the
// example must say the same thing and every calculation must be right. Same kind, picture and page.
export async function fixSlide(ai: AI, setup: Setup, source: string, slide: Slide, problems: SlideIssue[]): Promise<Slide> {
  const { id: _id, image: _img, flag: _flag, ...shown } = slide;
  const r = await guardedJson<{ slides: Omit<Slide, 'id'>[] }>(ai, { endpoint: 'slides', creative: true,
    system: `Rewrite ONE slide of a lesson for grade ${setup.grade} pupils, in ${langName(setup.lang)}, so that it is right. Code found the PROBLEMS listed: fix them. The heading, the bullets and the example must say the same thing (the same numbers, the same comparison, the same unit), and every calculation must be correct. Keep the slide kind, its facts from the book section and its source quote; sentences of at most ${maxWords(setup.grade)} words.`,
    prompt: wrapUser(JSON.stringify({ slide: shown, problems: problems.map((p) => p.detail), book_section: source.slice(0, 6000) })), schema: SLIDES_SCHEMA, fixture: { simplify: slide, fix: problems } });
  const s = r.slides?.[0];
  if (!s) return slide;
  return { ...slide, heading: String(s.heading || slide.heading).slice(0, 90), bullets: (Array.isArray(s.bullets) && s.bullets.length ? s.bullets : slide.bullets).map((x) => String(x).slice(0, 160)).slice(0, 4),
    example: s.example !== undefined ? String(s.example).slice(0, 80) || undefined : slide.example, notes: String(s.notes || slide.notes).slice(0, 500), narration: String(s.narration || slide.narration).slice(0, 600), source: String(s.source || slide.source).slice(0, 400) };
}

const clip = (s: unknown, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const args = (c: ToolCall): Record<string, any> => { try { const a = JSON.parse(c.args || '{}'); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };

export async function buildLesson(ai: AI, setup: Setup, source: string, say: Say = () => {}): Promise<Built> {
  const canary = newCanary(), changes: string[] = [];
  let skills: Skill[] = [], outline: { kind: string; heading: string; objective?: string }[] = [], slides: Slide[] = [], items: Item[] = [], cards: Card[] = [];
  const rejected: Rejected[] = [];
  let n = 0, itemCalls = 0, fixes = 0, slideFixes = 0, turns = 0, finished = false, note = '', model = '';
  const nextId = () => `ex${String(++n).padStart(2, '0')}`;
  const ctx = () => contextOf(setup, skills, source);
  // Every slide the agent writes passes the code check of its title, numbers and units (Chi, 31 Oct). One
  // that fails is written again once and checked again; it keeps a mark either way, so the assigner reads
  // it before ticking "I have read and checked": "Đã sửa tự động: …", or "Kiểm tra lại: …" when the
  // rewrite was still wrong (the better of the two versions is kept).
  const checkSlides = async (list: Slide[]): Promise<Slide[]> => {
    const out: Slide[] = [];
    for (const s of list) {
      const issues = checkSlide(s);
      if (!issues.length) { out.push(s); continue; }
      const num = Number(s.id.slice(2)) || s.id;
      let best = s, left = issues;
      if (slideFixes < LIMITS.maxSlideFixes) {
        slideFixes++;
        try { const f = await fixSlide(ai, setup, source, s, issues), again = checkSlide(f); if (again.length < issues.length) { best = f; left = again; } }
        catch (e) { console.warn(`[agent] slide fix failed, the first version is kept: ${String((e as Error)?.message).slice(0, 200)}`); }   // blocked or busy
      }
      const w = issueWords(left.length ? left : issues);
      if (!left.length) {
        out.push({ ...best, flag: { fixed: true, ...w } });
        await say(`Slide ${num}: ${w.vi}, viết lại.`, `Slide ${num}: ${w.en}, written again.`);
        changes.push(setup.lang === 'en' ? `Slide ${num}: ${w.en}; written again` : `Slide ${num}: ${w.vi}, đã viết lại`);
      } else {
        out.push({ ...best, flag: { fixed: false, ...w } });
        await say(`Slide ${num}: ${w.vi}, cần xem lại.`, `Slide ${num}: ${w.en}, please check it.`);
        changes.push(setup.lang === 'en' ? `Slide ${num}: ${w.en}; please check it` : `Slide ${num}: ${w.vi}, cần xem lại`);
      }
    }
    return out;
  };

  const tool = async (c: ToolCall): Promise<unknown> => {
    const a = args(c);
    switch (c.name) {
      case 'save_plan': {
        const sk = cleanSkills(a.skills, setup.subject), ol = (Array.isArray(a.outline) ? a.outline : []).slice(0, 14).map((o: any) => ({ kind: clip(o?.kind, 20), heading: clip(o?.heading, 80), objective: clip(o?.objective) }));
        if (sk.length < 1 || ol.length < 4) return { error: 'a plan needs 1-4 skills and at least 4 slides' };
        skills = sk; outline = ol;
        await say(`Đã lập kế hoạch: ${skills.length} dạng bài, ${outline.length} slide.`, `Plan saved: ${skills.length} skills, ${outline.length} slides.`);
        return { saved: true, skills };
      }
      case 'write_slides': {
        if (!outline.length) return { error: 'save_plan first' };
        slides = await writeSlides(ai, setup, source, outline);
        await say(`Đã viết ${slides.length} slide.`, `Wrote ${slides.length} slides.`);
        slides = await checkSlides(slides);
        return { slides: slides.map(({ id, kind, heading, flag }) => ({ id, kind, heading, ...(flag ? { checked: flag.fixed ? `written again by code: ${flag.en}` : `still to check: ${flag.en}` } : {}) })) };
      }
      case 'write_items': {
        if (!skills.length) return { error: 'save_plan first' };
        if (itemCalls >= LIMITS.maxItemCalls || items.length >= LIMITS.maxItems) return { error: 'item limit reached; move on' };
        itemCalls++;
        const r = await writeItems(ai, setup, source, skills, { skill: clip(a.skill, 40), template: clip(a.template, 20), level: (['basic', 'good', 'advanced'].includes(a.level) ? a.level : 'basic') as Level, count: Math.min(4, Number(a.count) || 3) }, nextId, items);
        const room = LIMITS.maxItems - items.length;
        items.push(...r.kept.slice(0, room)); rejected.push(...r.rejected);
        // the teacher sees the skill's name and the level in words, never the internal tag (Chi, 29 Oct)
        const skillName = skills.find((k) => k.tag === a.skill)?.name || 'practice', lv = LEVEL_WORDS[a.level as Level] ?? LEVEL_WORDS.basic;
        const n = r.rejected.length, wv = whyOf(r.rejected, 'vi'), we = whyOf(r.rejected, 'en');
        await say(`Bài luyện tập "${clip(skillName, 60)}" (${lv.vi}): giữ ${r.kept.length} câu${n ? ` · loại ${n} câu chưa đạt${wv ? ` (${wv})` : ''}, viết lại` : ''}.`,
          `Practice "${clip(skillName, 60)}" (${lv.en}): kept ${r.kept.length}${n ? ` · ${n} rejected by the checker${we ? ` (${we})` : ''}, written again` : ''}.`);
        return { kept: r.kept.map((i) => ({ id: i.id, prompt: i.prompt })), rejected: r.rejected.map((x) => x.issues) };
      }
      case 'write_cards': {
        cards = await writeCards(ai, setup, source);
        await say(`Đã làm ${cards.length} thẻ nhớ.`, `Made ${cards.length} flashcards.`);
        return { cards: cards.length };
      }
      case 'review': {
        const issues = reviewLesson(setup, source, { skills, slides, items, cards });
        await say(issues.length ? `Tự kiểm tra cả bài: ${issues.length} điểm cần xem.` : 'Tự kiểm tra cả bài: ổn.', issues.length ? `Whole-lesson check: ${issues.length} points to look at.` : 'Whole-lesson check: all good.');
        return { issues };
      }
      case 'simplify_slide': {
        const s = slides.find((x) => x.id === a.id);
        if (!s) return { error: `no slide ${clip(a.id, 20)}` };
        if (fixes >= LIMITS.maxFixes) return { error: 'fix limit reached; call finish' };
        fixes++;
        // simpler words must not break its numbers: checked again (a mark it had stays)
        slides[slides.indexOf(s)] = (await checkSlides([await simplify(ai, setup, s, clip(a.reason))]))[0];
        changes.push(`Slide ${Number(s.id.slice(2))}: ${clip(a.reason)}`);
        await say(`Đã viết lại slide ${s.id.slice(2)} cho dễ đọc hơn.`, `Made slide ${s.id.slice(2)} easier to read.`);
        return { ok: true };
      }
      case 'drop_item': {
        const i = items.find((x) => x.id === a.id);
        if (!i) return { error: `no item ${clip(a.id, 20)}` };
        if (items.length <= LIMITS.minItems) return { error: `a lesson keeps at least ${LIMITS.minItems} items` };
        items = items.filter((x) => x !== i);
        changes.push(`Item removed: ${clip(a.reason)}`);
        return { ok: true };
      }
      case 'finish':
        finished = true; note = clip(a.note, 800);
        return { ok: true };
      default: return { error: `unknown tool ${clip(c.name, 40)}` };
    }
  };

  try {
    const messages: ChatMsg[] = [
      { role: 'system', content: scopedSystem(fill(AGENT_SYSTEM, { grade: setup.grade, subject: setup.subject === 'math' ? 'Maths' : 'English', lang: langName(setup.lang), count: slideCount(setup.minutes), turns: LIMITS.maxTurns }), canary) },
      { role: 'user', content: wrapUser(JSON.stringify({ SETUP: setup, BOOK_SECTION: source })) },
    ];
    const tools = TOOLS(setup.subject);
    let nudged = false;
    while (!finished && turns < LIMITS.maxTurns) {
      turns++;
      const t = await ai.chat({ endpoint: 'agent', messages, tools });
      model = t.model;
      const [ok, why] = checkOutput(`${t.text}\n${t.toolCalls.map((c) => c.args).join('\n')}`, canary, { maxChars: 40000 });
      if (!ok) throw new Blocked(why);
      messages.push({ role: 'assistant', content: t.text, toolCalls: t.toolCalls });
      if (!t.toolCalls.length) {
        if (nudged) break;
        nudged = true;
        messages.push({ role: 'user', content: 'Continue with the tools and end by calling finish.' });
        continue;
      }
      for (const c of t.toolCalls) {
        messages.push({ role: 'tool', toolCallId: c.id, content: wrapUser(JSON.stringify(await tool(c))) });
        if (finished) break;
      }
    }
  } catch (e) {
    // a blocked turn or a failed call: the agent stops, code finishes the lesson below
    console.warn(`[agent] stopped: ${String((e as Error)?.message).slice(0, 200)}`);
    changes.push('The agent stopped early; the app completed the lesson.');
  }

  // Code completes anything the agent did not do.
  if (!skills.length || !outline.length) {
    const p = await planLesson(ai, setup, source);
    skills = skills.length ? skills : p.skills; outline = outline.length ? outline : p.outline;
  }
  if (!slides.length) { slides = await writeSlides(ai, setup, source, outline); await say(`Đã viết ${slides.length} slide.`, `Wrote ${slides.length} slides.`); slides = await checkSlides(slides); }
  for (const k of skills) for (const level of ['basic', 'good'] as Level[]) {
    if (items.length >= LIMITS.maxItems || items.some((i) => i.skill === k.tag && i.level === level)) continue;
    const r = await writeItems(ai, setup, source, skills, { skill: k.tag, template: setup.subject === 'math' ? (level === 'basic' ? 'mcq' : 'word') : (level === 'basic' ? 'match' : 'fill'), level, count: 3 }, nextId, items);
    items.push(...r.kept); rejected.push(...r.rejected);
  }
  if (!cards.length) cards = await writeCards(ai, setup, source);
  // Last line of defence: every item passes the checks once more against the final skills.
  items = items.filter((i) => !checkItem(i, { ...ctx(), items }).length).slice(0, LIMITS.maxItems);
  // Then the AI second review (Chi's doc 2): Muse Spark reads them once more; it can only drop.
  const rv = await reviewItems(ai, setup, source, skills, items, LIMITS.minItems);
  if (rv.rejected.length) { items = rv.kept; rejected.push(...rv.rejected); changes.push(setup.lang === 'en' ? `The AI review removed ${rv.rejected.length} item${rv.rejected.length === 1 ? '' : 's'}.` : `Bước AI rà soát bỏ ${rv.rejected.length} câu.`); }
  await say(`AI rà soát lần hai: giữ ${items.length} câu.`, `AI second review: kept ${items.length} items.`);

  if (!note) note = setup.lang === 'en'
    ? `I made ${slides.length} slides, ${items.length} practice items and ${cards.length} flashcards from the section of your book. Every item passed the code checks.`
    : `Trợ lý đã soạn ${slides.length} slide, ${items.length} câu luyện tập và ${cards.length} thẻ nhớ từ phần bài trong sách của cô. Mọi câu đều đã qua bộ kiểm tra.`;
  // what the teacher reads names each skill, never its internal tag ("add_carry_100")
  const named = (x: string) => skills.reduce((t, k) => t.split(k.tag).join(`"${k.name}"`), x);
  note = named(note); changes.splice(0, changes.length, ...changes.map(named));
  const [ok] = checkOutput(note + changes.join('\n'), canary, { maxChars: 4000 });
  if (!ok) { note = ''; changes.length = 0; }
  return { skills, slides, items, cards, rejected, agent: { model, turns, finished, note, changes: changes.slice(0, 12) } };
}

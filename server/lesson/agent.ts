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
import { fill, langName, maxWords, slideCount, SLIDES_SCHEMA } from './prompts.ts';
import { ENG_KINDS, MATH_KINDS, type AgentNote, type Card, type Item, type Level, type Rejected, type Setup, type Skill, type Slide } from './types.ts';
import { cleanSkills, planLesson, writeCards, writeItems, writeSlides } from './writer.ts';

export const LIMITS = { maxTurns: 18, maxItemCalls: 14, maxItems: 30, minItems: 8, maxFixes: 6 };
export type Say = (vi: string, en: string) => void | Promise<void>;
export interface Built { skills: Skill[]; slides: Slide[]; items: Item[]; cards: Card[]; rejected: Rejected[]; agent: AgentNote }

const AGENT_SYSTEM = `You are LessonBloom's lesson agent. You turn a Vietnamese primary-school teacher's own notes into a complete lesson by calling tools, then leave her a short note. Grade {{grade}}, {{subject}}, language {{lang}}.
Work in this order:
1. save_plan: 2-4 skills the notes really teach (each with the closest kind) and an outline of {{count}} slides (title, warmup, teach/example, practice, summary), each slide serving one of the teacher's objectives.
2. write_slides.
3. write_items for every skill: basic and good levels for each skill, advanced for at least one; 2-4 items per call. Templates — maths: mcq, fill, truefalse, word; English: match, fill, listen, order. Code builds and checks every item; read what it rejected and ask again differently if a skill is still short.
4. write_cards.
5. review, then fix only real problems: simplify_slide for text too hard for the grade, drop_item for an item that should not be there.
6. finish: a note to the teacher in {{lang}} (2-3 sentences: what you made, what you checked and changed, anything she should look at herself), and one line per change.
Never add content that is not in her notes. Practice is "bài luyện tập", never a test; no scores. You have at most {{turns}} turns.`;

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
    if (s.kind !== 'title' && !grounded(s.source, source)) issues.push(`${s.id}: its source quote is not in the teacher's notes`);
    for (const t of [s.heading, ...s.bullets]) if (Math.max(0, ...t.split(/[.!?;\n]+/).map((x) => words(x).length)) > maxWords(setup.grade)) { issues.push(`${s.id}: a sentence longer than ${maxWords(setup.grade)} words`); break; }
  }
  for (const k of b.skills) for (const lv of ['basic', 'good'] as Level[]) if (!b.items.some((i) => i.skill === k.tag && i.level === lv)) issues.push(`skill ${k.tag}: no ${lv} items`);
  if (!b.items.some((i) => i.level === 'advanced')) issues.push('no advanced items');
  if (b.items.length < LIMITS.minItems) issues.push(`only ${b.items.length} items (at least ${LIMITS.minItems})`);
  if (!b.cards.length) issues.push('no flashcards yet');
  const said = words([...b.slides.map((s) => `${s.heading} ${s.bullets.join(' ')}`)].join(' '));
  for (const o of setup.objectives) { const ow = words(o).filter((w) => w.length > 2); if (ow.length && ow.filter((w) => said.includes(w)).length / ow.length < 0.4) issues.push(`objective "${o}" is not clearly taught on a slide`); }
  return issues;
}

async function simplify(ai: AI, setup: Setup, slide: Slide, reason: string): Promise<Slide> {
  const r = await guardedJson<{ slides: Omit<Slide, 'id'>[] }>(ai, { endpoint: 'slides', creative: true,
    system: `Rewrite ONE slide for grade ${setup.grade} pupils: shorter sentences (at most ${maxWords(setup.grade)} words), easier words, the same facts and the same slide kind, in ${langName(setup.lang)}. Keep its source quote.`,
    prompt: wrapUser(JSON.stringify({ slide, reason })), schema: SLIDES_SCHEMA, fixture: { simplify: slide } });
  const s = r.slides?.[0];
  return s ? { ...slide, heading: String(s.heading || slide.heading).slice(0, 90), bullets: (s.bullets || slide.bullets).map((x) => String(x).slice(0, 160)).slice(0, 4), notes: String(s.notes || slide.notes).slice(0, 500), narration: String(s.narration || slide.narration).slice(0, 600) } : slide;
}

const clip = (s: unknown, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const args = (c: ToolCall): Record<string, any> => { try { const a = JSON.parse(c.args || '{}'); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };

export async function buildLesson(ai: AI, setup: Setup, source: string, say: Say = () => {}): Promise<Built> {
  const canary = newCanary(), changes: string[] = [];
  let skills: Skill[] = [], outline: { kind: string; heading: string; objective?: string }[] = [], slides: Slide[] = [], items: Item[] = [], cards: Card[] = [];
  const rejected: Rejected[] = [];
  let n = 0, itemCalls = 0, fixes = 0, turns = 0, finished = false, note = '', model = '';
  const nextId = () => `ex${String(++n).padStart(2, '0')}`;
  const ctx = () => contextOf(setup, skills, source);

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
        return { slides: slides.map(({ id, kind, heading }) => ({ id, kind, heading })) };
      }
      case 'write_items': {
        if (!skills.length) return { error: 'save_plan first' };
        if (itemCalls >= LIMITS.maxItemCalls || items.length >= LIMITS.maxItems) return { error: 'item limit reached; move on' };
        itemCalls++;
        const r = await writeItems(ai, setup, source, skills, { skill: clip(a.skill, 40), template: clip(a.template, 20), level: (['basic', 'good', 'advanced'].includes(a.level) ? a.level : 'basic') as Level, count: Math.min(4, Number(a.count) || 3) }, nextId);
        const room = LIMITS.maxItems - items.length;
        items.push(...r.kept.slice(0, room)); rejected.push(...r.rejected);
        await say(`Bài luyện tập "${clip(a.skill, 40)}" (${a.level}): giữ ${r.kept.length} câu${r.rejected.length ? `, bộ kiểm tra loại ${r.rejected.length} câu` : ''}.`,
          `Practice "${clip(a.skill, 40)}" (${a.level}): kept ${r.kept.length}${r.rejected.length ? `, the checker rejected ${r.rejected.length}` : ''}.`);
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
        slides[slides.indexOf(s)] = await simplify(ai, setup, s, clip(a.reason));
        changes.push(`${s.id}: ${clip(a.reason)}`);
        await say(`Đã viết lại slide ${s.id.slice(2)} cho dễ đọc hơn.`, `Made slide ${s.id.slice(2)} easier to read.`);
        return { ok: true };
      }
      case 'drop_item': {
        const i = items.find((x) => x.id === a.id);
        if (!i) return { error: `no item ${clip(a.id, 20)}` };
        if (items.length <= LIMITS.minItems) return { error: `a lesson keeps at least ${LIMITS.minItems} items` };
        items = items.filter((x) => x !== i);
        changes.push(`${i.id} removed: ${clip(a.reason)}`);
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
      { role: 'user', content: wrapUser(JSON.stringify({ SETUP: setup, NOTES: source })) },
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
  if (!slides.length) { slides = await writeSlides(ai, setup, source, outline); await say(`Đã viết ${slides.length} slide.`, `Wrote ${slides.length} slides.`); }
  for (const k of skills) for (const level of ['basic', 'good'] as Level[]) {
    if (items.length >= LIMITS.maxItems || items.some((i) => i.skill === k.tag && i.level === level)) continue;
    const r = await writeItems(ai, setup, source, skills, { skill: k.tag, template: setup.subject === 'math' ? (level === 'basic' ? 'mcq' : 'word') : (level === 'basic' ? 'match' : 'fill'), level, count: 3 }, nextId);
    items.push(...r.kept); rejected.push(...r.rejected);
  }
  if (!cards.length) cards = await writeCards(ai, setup, source);
  // Last line of defence: every item passes the checks once more against the final skills.
  items = items.filter((i) => !checkItem(i, ctx()).length).slice(0, LIMITS.maxItems);

  if (!note) note = setup.lang === 'en'
    ? `I made ${slides.length} slides, ${items.length} practice items and ${cards.length} flashcards from your notes. Every item passed the code checks.`
    : `Trợ lý đã soạn ${slides.length} slide, ${items.length} câu luyện tập và ${cards.length} thẻ nhớ từ ghi chú của cô. Mọi câu đều đã qua bộ kiểm tra.`;
  const [ok] = checkOutput(note + changes.join('\n'), canary, { maxChars: 4000 });
  if (!ok) { note = ''; changes.length = 0; }
  return { skills, slides, items, cards, rejected, agent: { model, turns, finished, note, changes: changes.slice(0, 12) } };
}

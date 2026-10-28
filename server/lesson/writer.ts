// The writing steps on Muse Spark, each one guarded (fixed prompt with a canary, the teacher's notes
// in <user_input>, the answer checked before use). The agent (agent.ts) calls these as tools; the
// create endpoints call intake and readPhotos directly.
import type { AI } from '../ai/types.ts';
import { guardedJson, wrapUser } from '../guard/guard.ts';
import { buildEnglish, buildMath, checkItem, contextOf, type RawEnglish, type RawMath } from './items.ts';
import {
  CARDS_SCHEMA, CARDS_SYSTEM, ENG_ITEMS_SCHEMA, ENG_ITEMS_SYSTEM, fill, INTAKE_SCHEMA, INTAKE_SYSTEM, langName, MATH_ITEMS_SCHEMA, MATH_ITEMS_SYSTEM,
  maxWords, OCR_SCHEMA, OCR_SYSTEM, WORK_SCHEMA, WORK_SYSTEM, PLAN_SCHEMA, PLAN_SYSTEM, slideCount, SLIDES_SCHEMA, SLIDES_SYSTEM,
} from './prompts.ts';
import { ENG_KINDS, MATH_KINDS, type Card, type Item, type Level, type Rejected, type Setup, type Skill, type Slide } from './types.ts';

export class NotLesson extends Error {}
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const pad = (n: number) => String(n).padStart(2, '0');

// The setup the browser sends back is checked and capped field by field before it reaches a prompt.
export function cleanSetup(x: unknown): Setup | null {
  const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  if (s.subject !== 'math' && s.subject !== 'english') return null;
  const title = clip(s.title, 120);
  if (!title) return null;
  const minutes = [15, 25, 35].reduce((b, m) => (Math.abs(m - (Number(s.minutes) || 25)) < Math.abs(b - (Number(s.minutes) || 25)) ? m : b), 25) as Setup['minutes'];
  const objectives = (Array.isArray(s.objectives) ? s.objectives : []).map((o) => clip(o, 200)).filter(Boolean).slice(0, 3);
  const note = clip(s.note, 300);
  const level = (['mixed', 'basic', 'advanced'] as const).find((x) => x === s.level), mk = (s.make && typeof s.make === 'object' ? s.make : {}) as Record<string, unknown>;
  const make = { video: mk.video !== false, cards: mk.cards !== false };
  return { subject: s.subject, grade: Math.min(5, Math.max(1, Math.round(Number(s.grade)) || 2)) as Setup['grade'], title, objectives, minutes, lang: s.lang === 'en' ? 'en' : 'vi', ...(note ? { note } : {}), ...(level && level !== 'mixed' ? { level } : {}), make };
}

const material = (setup: Setup, source: string) => wrapUser(`SETUP: ${JSON.stringify(setup)}\n\nBOOK SECTION (the only source):\n${source}`);

// The language a section is written in, by code: Vietnamese letters, or not.
const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi;
export const sourceLang = (text: string): 'vi' | 'en' => ((text.match(VI_LETTERS) || []).length > text.length / 200 ? 'vi' : 'en');

export async function intake(ai: AI, notes: string, uiLang: 'vi' | 'en'): Promise<Setup> {
  // a Maths lesson is in its book's language; an English lesson's instructions may be either
  const own = sourceLang(notes);
  const r = await guardedJson<Setup & { usable: boolean }>(ai, { endpoint: 'intake', system: fill(INTAKE_SYSTEM, { lang: langName(own === 'en' ? 'en' : uiLang) }), prompt: wrapUser(notes), schema: INTAKE_SCHEMA, fixture: { notes } });
  if (!r.usable) throw new NotLesson();
  return cleanSetup({ ...r, lang: r.subject === 'math' || own === 'en' ? own : r.lang, objectives: (r.objectives || []).slice(0, 3) })!;
}

export async function readPhotos(ai: AI, images: { data: Buffer; mime: string }[]): Promise<string> {
  const r = await guardedJson<{ usable: boolean; text: string }>(ai, { endpoint: 'ocr', system: OCR_SYSTEM, prompt: `Copy out the lesson text from these ${images.length} photo(s), in order.`, images, schema: OCR_SCHEMA, fixture: { photos: images.length } });
  if (!r.usable || !r.text?.trim()) throw new NotLesson();
  return r.text.trim().slice(0, 20000);
}

// A child's finished exercise: the request to find the section with, and the mistakes to aim at.
export async function readWork(ai: AI, images: { data: Buffer; mime: string }[]): Promise<{ request: string; focus: string }> {
  const r = await guardedJson<{ usable: boolean; topic: string; mistakes: string[] }>(ai, { endpoint: 'work', system: WORK_SYSTEM, prompt: `Look at the ${images.length} photo(s) of the child's exercise.`, images, schema: WORK_SCHEMA, fixture: { photos: images.length } });
  const topic = clip(r.topic, 200), mistakes = (Array.isArray(r.mistakes) ? r.mistakes : []).map((m) => clip(m, 160)).filter(Boolean).slice(0, 4);
  if (!r.usable || !topic) throw new NotLesson();
  return { request: topic, focus: mistakes.join('; ') };
}

// Skills keep only a known kind, a unique snake_case tag and a short name.
export function cleanSkills(raw: unknown, subject: Setup['subject']): Skill[] {
  const kinds: readonly string[] = subject === 'math' ? MATH_KINDS : ENG_KINDS;
  const out: Skill[] = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    const tag = clip((s as Skill)?.tag, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!tag || out.some((x) => x.tag === tag)) continue;
    out.push({ tag, name: clip((s as Skill).name, 60) || tag, kind: (kinds.includes((s as Skill).kind) ? (s as Skill).kind : 'other') as Skill['kind'] });
  }
  return out.slice(0, 4);
}

export async function planLesson(ai: AI, setup: Setup, source: string) {
  const count = slideCount(setup.minutes);
  const r = await guardedJson<{ skills: Skill[]; outline: { kind: Slide['kind']; heading: string; objective?: string }[] }>(ai, {
    endpoint: 'plan', system: fill(PLAN_SYSTEM, { grade: setup.grade, lang: langName(setup.lang), count }), prompt: material(setup, source), schema: PLAN_SCHEMA, fixture: { setup, source, count } });
  return { skills: cleanSkills(r.skills, setup.subject), outline: (r.outline || []).slice(0, 14).map((o) => ({ kind: o.kind, heading: clip(o.heading, 80), objective: clip(o.objective, 200) })) };
}

export async function writeSlides(ai: AI, setup: Setup, source: string, outline: { kind: string; heading: string }[]): Promise<Slide[]> {
  const r = await guardedJson<{ slides: Omit<Slide, 'id'>[] }>(ai, {
    endpoint: 'slides', creative: true, system: fill(SLIDES_SYSTEM, { grade: setup.grade, lang: langName(setup.lang), maxWords: maxWords(setup.grade) }),
    prompt: `${material(setup, source)}\n\nOUTLINE:\n${wrapUser(JSON.stringify(outline))}`, schema: SLIDES_SCHEMA, fixture: { setup, source, outline } }, { maxChars: 40000 });
  return (r.slides || []).slice(0, 14).map((s, i) => ({
    id: `sl${pad(i + 1)}`, kind: s.kind, heading: clip(s.heading, 90), bullets: (s.bullets || []).map((b) => clip(b, 160)).filter(Boolean).slice(0, 4),
    ...(s.example ? { example: clip(s.example, 80) } : {}), notes: clip(s.notes, 500), source: clip(s.source, 400), narration: clip(s.narration, 600), imagePrompt: clip(s.imagePrompt, 300),
  }));
}

export interface ItemRequest { skill: string; template: string; level: Level; count: number }
export interface ItemResult { kept: Item[]; rejected: Rejected[] }
const MATH_T = ['mcq', 'fill', 'truefalse', 'word'], ENG_T = ['match', 'fill', 'listen', 'order'];

// One batch of items for one skill, template and level. Every item is built and checked by code;
// a failing item is asked for again (up to 2 more times, told what was wrong), then dropped and logged.
export async function writeItems(ai: AI, setup: Setup, source: string, skills: Skill[], req: ItemRequest, nextId: () => string): Promise<ItemResult> {
  const skill = skills.find((s) => s.tag === req.skill);
  const math = setup.subject === 'math', template = (math ? MATH_T : ENG_T).includes(req.template) ? req.template : null;
  if (!skill || !template) return { kept: [], rejected: [{ skill: req.skill, template: req.template, level: req.level, codes: ['shape'], issues: ['unknown skill or template'] }] };
  const ctx = contextOf(setup, skills, source), kept: Item[] = [], rejected: Rejected[] = [];
  let want = Math.min(6, Math.max(1, Math.round(req.count) || 3)), avoid: string[] = [];
  for (let round = 0; round < 3 && want > 0; round++) {
    const sys = fill(math ? MATH_ITEMS_SYSTEM : ENG_ITEMS_SYSTEM, { grade: setup.grade, lang: langName(setup.lang), skill: `${skill.tag} "${skill.name}"`, kind: skill.kind, template, level: req.level, count: want,
      avoid: avoid.length ? `\nThe last ones were refused by the checker; avoid: ${avoid.slice(0, 6).join('; ')}` : '' });
    const r = await guardedJson<{ items: (RawMath | RawEnglish)[] }>(ai, { endpoint: 'items', creative: true, system: sys, prompt: material(setup, source), schema: math ? MATH_ITEMS_SCHEMA : ENG_ITEMS_SCHEMA, fixture: { setup, source, skill, template, level: req.level, count: want, round } });
    avoid = [];
    for (const raw of (r.items || []).slice(0, want)) {
      const id = nextId(), base = { ...raw, template, skill: skill.tag, level: req.level } as never;
      const item = math ? buildMath(base as RawMath, id, setup.lang) : buildEnglish(base as RawEnglish, id);
      const issues = checkItem(item, ctx);
      if (!issues.length) { kept.push(item); want--; continue; }
      avoid.push(...issues.map((i) => `[${i.code}] ${i.msg}`));
      rejected.push({ skill: skill.tag, template, level: req.level, codes: [...new Set(issues.map((i) => i.code))], issues: issues.map((i) => `[${i.code}] ${i.msg}`) });
    }
  }
  return { kept, rejected };
}

export async function writeCards(ai: AI, setup: Setup, source: string): Promise<Card[]> {
  const r = await guardedJson<{ cards: Omit<Card, 'id'>[] }>(ai, { endpoint: 'cards', system: fill(CARDS_SYSTEM, { count: 8, grade: setup.grade, lang: langName(setup.lang) }), prompt: material(setup, source), schema: CARDS_SCHEMA, fixture: { setup, source } });
  const seen = new Set<string>();
  return (r.cards || []).filter((c) => c.front && c.back && !seen.has(c.front.toLowerCase()) && !!seen.add(c.front.toLowerCase())).slice(0, 12)
    .map((c, i) => ({ id: `fc${pad(i + 1)}`, front: clip(c.front, 60), back: clip(c.back, 120), ...(c.emoji ? { emoji: clip(c.emoji, 8) } : {}), ...(c.say ? { say: clip(c.say, 60) } : {}) }));
}

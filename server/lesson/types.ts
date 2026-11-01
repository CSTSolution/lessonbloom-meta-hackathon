// The lesson's shapes. The models return data; code turns maths data into the questions pupils see.
import type { Work } from './work.ts';

export type Subject = 'math' | 'english';
export type Lang = 'vi' | 'en';
export type Level = 'basic' | 'good' | 'advanced';

// What the teacher confirms before the lesson is made (the model pre-fills it from her notes).
export interface Setup {
  subject: Subject;
  grade: 1 | 2 | 3 | 4 | 5;
  title: string;
  objectives: string[];
  minutes: 15 | 25 | 35;
  lang: Lang;                     // language of the slides, narration and pupils' instructions
  note?: string;                  // her wishes for this lesson ("use market examples")
  level?: 'mixed' | 'basic' | 'advanced';   // the class's level (Chi's step 2): how the practice leans
  make?: { video: boolean; cards: boolean }; // what to make besides slides and practice (Chi's step 2)
  forParent?: boolean;            // made by a parent for their own child at home (Chi #24): no "class", no "teacher"
  work?: Work;                    // made from a photo of the child's finished work (Chi #46): the focus, never the content
}

// A skill ("dạng bài") with a kind from a fixed list, so code can check items against it (Chi's rule Q).
export const MATH_KINDS = ['add_carry', 'add_no_carry', 'sub_borrow', 'sub_no_borrow', 'column', 'find_missing', 'word_problem', 'multiply', 'divide', 'compare', 'other'] as const;
export const ENG_KINDS = ['vocabulary', 'sentence_pattern', 'comma_clause', 'listening', 'other'] as const;
export type SkillKind = (typeof MATH_KINDS)[number] | (typeof ENG_KINDS)[number];
export interface Skill { tag: string; name: string; kind: SkillKind }

export interface Slide {
  id: string;
  kind: 'title' | 'warmup' | 'teach' | 'example' | 'practice' | 'summary';
  heading: string;
  bullets: string[];
  example?: string;
  notes: string;                  // what the teacher says
  source: string;                 // the words in her notes this slide comes from
  narration: string;              // the video's voice for this slide
  imagePrompt: string;
  image?: string;
  page?: number;                  // the page of the book it comes from
  // the code check of its numbers, units and title (Chi, 31 Oct): written again automatically (fixed),
  // or still wrong after one rewrite (fixed false). Shown on the slide until the assigner changes it.
  flag?: { fixed: boolean; vi: string; en: string };
  fromWork?: boolean;             // the opening slide on the child's own mistakes (Chi #46), made by code
}

export type Op = '+' | '-' | '×' | ':';
interface ItemBase { id: string; skill: string; level: Level; prompt: string; explain: string; page?: number; redone?: string[]; fromWork?: boolean }   // fromWork: "Luyện lại từ bài con làm" (Chi #46)   // redone: why the checker had it written again   // page: the book page it comes from

// Maths: the model gives a, op, b (and distractors, a story); code writes prompt, options and answer.
export interface MathItem extends ItemBase {
  subject: 'math';
  template: 'mcq' | 'fill' | 'truefalse' | 'word' | 'column';   // column: "đặt tính rồi tính" (Chi #47)
  a: number; op: Op; b: number;
  blank?: 'a' | 'b' | 'result';   // fill: which number is hidden
  shown?: number;                 // truefalse: the result the statement claims
  distractors?: number[];         // mcq: wrong options, the mistakes children really make
  story?: string;                 // word: the problem, in the lesson's language, ending with the question
  unit?: string;                  // word: exactly the thing the question asks for ("con gà mái")
  options?: string[];             // built by code
  answer: string;                 // built by code
}

export interface EnglishItem extends ItemBase {
  subject: 'english';
  template: 'match' | 'fill' | 'listen' | 'order';
  pairs?: { word: string; emoji: string }[];    // match
  sentence?: string;                            // fill: one "___" gap
  say?: string;                                 // listen: read aloud, never shown
  words?: string[];                             // order: shuffled word cards
  options?: string[];
  answer: string;
}
export type Item = MathItem | EnglishItem;

export interface Card { id: string; front: string; back: string; emoji?: string; say?: string }

// One step the teacher sees while the lesson is made (the agent's work, live).
export interface Step { at: string; vi: string; en: string }

export interface AgentNote { model: string; turns: number; finished: boolean; note: string; changes: string[] }

// A rejected item: why, per Chi's error codes, for the admin view and for the agent.
export interface Rejected { skill: string; template: string; level: Level; codes: string[]; issues: string[] }

export interface Lesson {
  id: string;
  teacher_id: string;
  status: 'working' | 'ready' | 'error';
  setup: Setup;
  source: string;
  skills: Skill[];
  slides: Slide[];
  items: Item[];
  cards: Card[];
  steps: Step[];
  agent: AgentNote | null;
  rejected: Rejected[];
  error: string | null;
  area_id: string | null;
  request: string;
  refs: { book: string; title: string; pageFrom: number; pageTo: number; vi: string; en: string }[];
  created_at: string;
  updated_at: string;
}

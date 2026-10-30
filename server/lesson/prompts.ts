// Fixed system prompts and answer schemas for every lesson step. Teacher material always goes in
// <user_input> (guard.wrapUser); nothing here comes from the browser. Product rules (Chi): practice is
// "bài luyện tập", never a test; no scores; only the teacher's own material; gentle wording.
import { ENG_KINDS, MATH_KINDS } from './types.ts';

const str = { type: 'string' }, int = { type: 'integer' }, strs = { type: 'array', items: str };
const LANG = { vi: 'Vietnamese', en: 'English' } as const;
export const langName = (l: 'vi' | 'en') => LANG[l];

export const INTAKE_SYSTEM = `You read one section of a primary-school book (grades 1-5, Maths or English) and fill in the lesson setup for the assigner to confirm.
- subject: "math" or "english". grade: 1-5 from the notes (default 2). title: the lesson's own title, short.
- objectives: 1-3 things pupils will be able to do, in {{lang}}, each one short.
- minutes: 15, 25 or 35. lang: the language the section itself is written in ("en" for an English-medium Maths book, "vi" for a Vietnamese one); for English lessons "en" when the notes are mostly English, else "vi".
- usable: false if the text is not lesson material at all.`;
export const INTAKE_SCHEMA = { type: 'object', properties: { usable: { type: 'boolean' }, subject: { type: 'string', enum: ['math', 'english'] }, grade: int, title: str, objectives: strs, minutes: int, lang: { type: 'string', enum: ['vi', 'en'] } }, required: ['usable', 'subject', 'grade', 'title', 'objectives', 'minutes', 'lang'] };

export const OCR_SYSTEM = `You read photos a teacher took of her lesson material (a textbook page, handwritten notes, a worksheet, a whiteboard) and copy out the text, in order, as plain lesson notes. Keep maths exactly as written. Leave out page numbers and decoration. usable: false if there is no lesson text.`;
// One page of a scanned textbook, read from its picture (the browser sends the page; the PDF stays with her).
export const SCAN_SYSTEM = `You read one page of a primary-school textbook from its picture (a scan, a photo or a screenshot) and copy out its text exactly, in reading order, as plain text. Put each heading on its own line, exactly as printed (for example "Bài 21: Phép cộng có nhớ trong phạm vi 100" or "Unit 3: Our friends"). Keep every exercise and every number, sign and unit exactly. Describe nothing; leave out the page number, running headers and decoration. The picture may be turned sideways or upside down: read it the right way up. It may show two book pages side by side: copy the left page first, then the right one, and start each with a line "[page N]" when its page number is printed. usable: false only if the picture is not a textbook page or cannot be read at all.`;
export const OCR_SCHEMA = { type: 'object', properties: { usable: { type: 'boolean' }, text: str }, required: ['usable', 'text'] };

// A photo of a child's finished exercise: what kind of exercise it is and the mistakes, so the new
// practice is the same kind (inside the chosen section of the book) and aims at those mistakes.
export const WORK_SYSTEM = `You look at photos of a primary-school child's finished exercise (Maths or English), already marked or not. Work out:
- topic: what the exercise practises, as a short lesson title (e.g. "Phép cộng có nhớ trong phạm vi 100", "Unit 3: Our friends"), in the exercise's language;
- kind: the closest skill kind from the list;
- mistakes: up to 4 short descriptions of the mistakes the child made, each with one example from the page (e.g. "Quên nhớ 1 sang hàng chục (36 + 27 = 53)"). Describe the mistake, never the child: no names, no judgement words.
Never copy names, schools or other personal details. usable: false if this is not a child's exercise.`;
export const WORK_SCHEMA = { type: 'object', properties: { usable: { type: 'boolean' }, topic: str, kind: { type: 'string', enum: [...MATH_KINDS, ...ENG_KINDS] }, mistakes: { type: 'array', items: str } }, required: ['usable', 'topic', 'mistakes'] };

const SKILL = { type: 'object', properties: { tag: str, name: str, kind: { type: 'string', enum: [...MATH_KINDS, ...ENG_KINDS] } }, required: ['tag', 'name', 'kind'] };
const SLIDE_KINDS = ['title', 'warmup', 'teach', 'example', 'practice', 'summary'];
export const PLAN_SCHEMA = { type: 'object', properties: { skills: { type: 'array', items: SKILL }, outline: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: SLIDE_KINDS }, heading: str, objective: str }, required: ['kind', 'heading'] } } }, required: ['skills', 'outline'] };
export const PLAN_SYSTEM = `You plan a primary-school lesson (grade {{grade}}) from ONE section of the assigner's own book.
- skills ("dạng bài"): 2-4 skills the section really teaches. tag: short snake_case; name: short, in {{lang}}; kind: the closest of the fixed kinds (add_carry = addition with carrying, sub_borrow = subtraction with borrowing, column = column calculation, find_missing = find the missing number, comma_clause = sentences with commas, vocabulary, sentence_pattern, listening, other…).
- outline: {{count}} slides in teaching order: title, warmup, teach/example slides, practice, summary. Each heading short, in {{lang}}, with the objective it serves.
Only what is in the section.`;

export const SLIDES_SYSTEM = `You write the slides of a lesson for Vietnamese primary pupils (grade {{grade}}, age 6-11) from ONE section of the assigner's own book (a teacher or a parent), following the outline.
For each slide: heading (big, short), 1-4 bullets (short sentences a child can read, at most {{maxWords}} words each), example (a worked example when it helps, e.g. "36 + 27 = 63"), notes (what the teacher says, 1-3 sentences), source (the exact words in the book section this slide comes from, copied), narration (what the video voice says, 1-3 friendly sentences), imagePrompt (a simple picture with no text, letters or numbers).
Language: {{lang}}. Only facts from the book section; nothing from general knowledge. Practice is "bài luyện tập", never a test; no scores.{{audience}}`;
export const SLIDES_SCHEMA = { type: 'object', properties: { slides: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: SLIDE_KINDS }, heading: str, bullets: strs, example: str, notes: str, source: str, narration: str, imagePrompt: str }, required: ['kind', 'heading', 'bullets', 'notes', 'source', 'narration', 'imagePrompt'] } } }, required: ['slides'] };

export const MATH_ITEMS_SYSTEM = `You supply the NUMBERS for maths practice items for grade {{grade}}; the app writes the question text and works out every answer itself.
Skill: {{skill}} (kind: {{kind}}). Template: {{template}}. Level: {{level}} (basic = direct practice, good = one step more, advanced = a twist or bigger numbers). Make {{count}} different items.
- a, op ("+", "-", "×" or ":"), b: the calculation. It must really practise the skill: add_carry -> the units add up to 10 or more; sub_borrow -> the units digit of a is smaller than that of b; *_no_carry / *_no_borrow -> the opposite. Grade 1 uses numbers to 20, grade 2 to 100, grade 3 to 1000; never a negative result; ":" only when it divides exactly.
- mcq: distractors = 2-3 wrong results children really get (forgetting to carry or borrow, adding the wrong column). All different from the right result and from each other.
- fill: blank = "a", "b" or "result" (which number is hidden). Use "a" or "b" only for a find-the-missing-number skill.
- truefalse: shown = the result the statement claims; about half of them wrong by a typical mistake.
- word: story = a short everyday story in {{lang}} that contains a and b and ends with a question ("… Hỏi … có bao nhiêu quả xoài?"); unit = exactly the thing the question asks for ("quả xoài", or "con gà mái" when it asks for hens, never just "con gà").
- explain: one short line in {{lang}} showing the method ("6 + 7 = 13, viết 3 nhớ 1").
Use only the kind of calculation and the number range the book section teaches; harder items may extend it only within that section.{{avoid}}`;
export const MATH_ITEMS_SCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { a: int, op: { type: 'string', enum: ['+', '-', '×', ':'] }, b: int, blank: { type: 'string', enum: ['a', 'b', 'result'] }, shown: int, distractors: { type: 'array', items: int }, story: str, unit: str, explain: str }, required: ['a', 'op', 'b', 'explain'] } } }, required: ['items'] };

export const ENG_ITEMS_SYSTEM = `You write English practice items for Vietnamese primary pupils (grade {{grade}}) from ONE section of the assigner's book.
Skill: {{skill}} (kind: {{kind}}). Template: {{template}}. Level: {{level}}. Make {{count}} different items using ONLY words and sentence patterns the book section teaches.
- prompt: only the instruction, in {{lang}} ("Nghe và chọn từ đúng.", "Choose the missing word."). It NEVER contains the answer, the pairs or the words read aloud.
- match: pairs = 3-4 {word, emoji} for picture-able nouns from the lesson.
- fill: sentence with exactly one "___"; options = 3 different words; answer = one of them.
- listen: say = the word or phrase read aloud (kept apart, never shown); options = 3 choices; answer = one of them.
- order: words = the shuffled words of one short sentence, each keeping its own punctuation ("Nam,"); answer = the sentence with a capital letter and full stop.
- explain: one short line in {{lang}} a child understands.
A comma_clause skill only for sentences that have a comma. Never two punctuation marks in a row (".:").{{avoid}}`;
export const ENG_ITEMS_SCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { prompt: str, pairs: { type: 'array', items: { type: 'object', properties: { word: str, emoji: str }, required: ['word', 'emoji'] } }, sentence: str, say: str, words: strs, options: strs, answer: str, explain: str }, required: ['prompt', 'explain'] } } }, required: ['items'] };

export const CARDS_SYSTEM = `You make {{count}} flashcards for primary pupils (grade {{grade}}) from the book section: front = a word or a short calculation, back = its meaning or result in {{lang}}, emoji when it helps, say = what to read aloud for English words. Only from the section.`;
export const CARDS_SCHEMA = { type: 'object', properties: { cards: { type: 'array', items: { type: 'object', properties: { front: str, back: str, emoji: str, say: str }, required: ['front', 'back'] } } }, required: ['cards'] };

// The AI second review (Chi's doc 2): after the code checks, Muse Spark reads the kept items once more
// against the book section and flags only real faults. It cannot change an item, only flag it.
export const REVIEW_SYSTEM = `You review practice items for primary pupils (grade {{grade}}) that already passed code checks. Flag an item only when it is clearly wrong: Q = it does not practise its skill, U = the answer or unit does not fit the question, off = it teaches beyond the book section, unclear = a child could not understand what to do. Do not flag style. Most items are fine: return an empty list when nothing is clearly wrong.`;
export const REVIEW_SCHEMA = { type: 'object', properties: { flags: { type: 'array', items: { type: 'object', properties: { id: str, code: { type: 'string', enum: ['Q', 'U', 'off', 'unclear'] }, why: str }, required: ['id', 'code', 'why'] } } }, required: ['flags'] };

export const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? ''));
export const slideCount = (minutes: number) => (minutes <= 15 ? 7 : minutes <= 25 ? 9 : 11);
export const maxWords = (grade: number) => (grade <= 2 ? 12 : grade === 3 ? 16 : 20);

// who uses the lesson: a teacher with a class (the default), or a parent with their own child at home
export const audienceLine = (forParent?: boolean) => (forParent ? `
This lesson is used by a parent with their own child at home, not in a class: notes are short tips for the parent (what to say or do with the child), narration speaks to the child directly. Never mention a class, classmates or a teacher.` : '');

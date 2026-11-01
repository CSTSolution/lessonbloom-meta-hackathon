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
export const SCAN_SYSTEM = `You read one page of a primary-school textbook from its picture (a scan, a photo or a screenshot) and copy out its text exactly, in reading order, as plain text. Put each heading on its own line, exactly as printed (for example "Bài 21: Phép cộng có nhớ trong phạm vi 100" or "Unit 3: Our friends"); when the lesson or unit number is printed apart from its title (in a badge or box), still write the number and the title together on that one line. Start the line of a lesson's own title with "# ": the big title where a lesson or unit begins, numbered or not (some books print it with no number, in capitals in a coloured banner at the top of the page, such as "# PHÉP CỘNG (KHÔNG NHỚ) TRONG PHẠM VI 1000" or "# LUYỆN TẬP CHUNG"); never an exercise, an instruction, a table heading or a small label. Keep every exercise and every number, sign and unit exactly. Describe nothing; leave out running headers and decoration, and leave the page number out of the text: give it in printed instead, as printed in the page's corner or foot (0 when none is printed). The picture may be turned sideways or upside down: read it the right way up. It may show two book pages side by side: copy the left page first, then the right one, and start each with a line "[page N]" when its page number is printed; printed is then the left page's number. usable: false only if the picture is not a textbook page or cannot be read at all.`;
export const OCR_SCHEMA = { type: 'object', properties: { usable: { type: 'boolean' }, text: str }, required: ['usable', 'text'] };
// a scanned page also gives the page number printed on it, shown beside the file's own (Chi #45)
export const SCAN_SCHEMA = { type: 'object', properties: { usable: { type: 'boolean' }, text: str, printed: int }, required: ['usable', 'text'] };

// A photo of a child's finished exercise (Chi #46): every question with what the child wrote and the
// adult's mark, so code can work out the right answers, the kinds of mistake and the practice from them.
// The marks come first: handwritten digits are misread now and then, so the model does not re-solve to judge.
export const WORK_SYSTEM = `You read photos of a primary-school child's finished exercise sheet (Maths or English), usually marked by a parent or teacher. Copy out EVERY question, in order:
- q: the question exactly as printed, e.g. "655 - 367", "245 + 615 ... 791" (a comparison: the two sides with "..." where the child writes the sign), "? + 25 = 60", or the English item's words. Copy the numbers digit by digit as printed.
- child: what the child wrote as the answer, exactly ("322", ">", "blue"); for a word problem only the final answer ("46 quả"), not the working; "" if left empty. When the child crossed out a digit and wrote another, take the last one written.
- mark: the adult's mark next to it: "wrong" for a cross, an "S", a red line or a circle around the answer; "right" for a tick or "Đ"; "none" when there is no mark. Judge by the mark, never by working the sum out yourself.
- right: only for a question that is not a sum (English, a word problem): the right answer if the adult wrote it, else "".
- sum: only for a word problem: the one calculation it needs, numbers only, e.g. "964 - 478" ("" if it needs more than one step or none).
- typeName: only for a question that is not a sum: a short name of what it practises, in the sheet's language.
Also topic: what the exercise practises, as a short lesson title in the sheet's language (e.g. "Phép cộng, phép trừ có nhớ trong phạm vi 1000"); kind: the closest skill kind; mistakes: up to 4 short descriptions of the mistakes, each with one example from the page (e.g. "Quên nhớ 1 sang hàng chục (36 + 27 = 53)").
Describe mistakes, never the child: no names, no judgement words. Never copy names, schools or other personal details. usable: false if this is not a child's exercise or it cannot be read (too blurry, cut off).`;
const WORK_Q = { type: 'object', properties: { q: str, child: str, mark: { type: 'string', enum: ['right', 'wrong', 'none'] }, right: str, typeName: str, sum: str }, required: ['q', 'child', 'mark'] };
export const WORK_SCHEMA = { type: 'object', properties: { usable: { type: 'boolean' }, topic: str, kind: { type: 'string', enum: [...MATH_KINDS, ...ENG_KINDS] }, questions: { type: 'array', items: WORK_Q }, mistakes: { type: 'array', items: str } }, required: ['usable', 'topic', 'questions', 'mistakes'] };

const SKILL = { type: 'object', properties: { tag: str, name: str, kind: { type: 'string', enum: [...MATH_KINDS, ...ENG_KINDS] } }, required: ['tag', 'name', 'kind'] };
const SLIDE_KINDS = ['title', 'warmup', 'teach', 'example', 'practice', 'summary'];
export const PLAN_SCHEMA = { type: 'object', properties: { skills: { type: 'array', items: SKILL }, outline: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: SLIDE_KINDS }, heading: str, objective: str }, required: ['kind', 'heading'] } } }, required: ['skills', 'outline'] };
export const PLAN_SYSTEM = `You plan a primary-school lesson (grade {{grade}}) from ONE section of the assigner's own book.
- skills ("dạng bài"): 2-4 skills the section really teaches. tag: short snake_case; name: short, in {{lang}}; kind: the closest of the fixed kinds (add_carry = addition with carrying, sub_borrow = subtraction with borrowing, column = column calculation, find_missing = find the missing number, comma_clause = sentences with commas, vocabulary, sentence_pattern, listening, other…; reading, writing or saying numbers in words is other).
- outline: {{count}} slides in teaching order: title, warmup, teach/example slides, practice, summary. Each heading short, in {{lang}}, with the objective it serves.
Only what is in the section.`;

export const SLIDES_SYSTEM = `You write the slides of a lesson for Vietnamese primary pupils (grade {{grade}}, age 6-11) from ONE section of the assigner's own book (a teacher or a parent), following the outline.
For each slide: heading (big, short), 1-4 bullets (short sentences a child can read, at most {{maxWords}} words each), example (a worked example when it helps, e.g. "36 + 27 = 63"), notes (what the teacher says, 1-3 sentences), source (the exact words in the book section this slide comes from, copied), narration (what the video voice says, 1-3 friendly sentences), imagePrompt (a simple picture with no text, letters or numbers).
Language: {{lang}}. Only facts from the book section; nothing from general knowledge. An exercise that depends on a picture ("? − ? = ? (con)" for counting birds in a picture) has no numbers in the text: never invent numbers for it (Chi #45). Practice is practice ("bài luyện tập" in Vietnamese), never a test; no scores. Write every note in the lesson's language.{{audience}}`;
export const SLIDES_SCHEMA = { type: 'object', properties: { slides: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: SLIDE_KINDS }, heading: str, bullets: strs, example: str, notes: str, source: str, narration: str, imagePrompt: str }, required: ['kind', 'heading', 'bullets', 'notes', 'source', 'narration', 'imagePrompt'] } } }, required: ['slides'] };

export const MATH_ITEMS_SYSTEM = `You supply the NUMBERS for maths practice items for grade {{grade}}; the app writes the question text and works out every answer itself.
Skill: {{skill}} (kind: {{kind}}). Template: {{template}}. Level: {{level}} (basic = direct practice, good = one step more, advanced = a twist or bigger numbers). Make {{count}} different items.
- a, op ("+", "-", "×" or ":"), b: the calculation. It must really practise the skill: add_carry -> some column (ones or tens) adds up to 10 or more; sub_borrow -> some column needs borrowing (a digit of a smaller than the one under it); *_no_carry / *_no_borrow -> no column does. ":" only when it divides exactly.
- Numbers: {{range}}
- mcq: distractors = 2-3 wrong results children really get (forgetting to carry or borrow, adding the wrong column). All different from the right result and from each other.
- fill: blank = "a", "b" or "result" (which number is hidden). Use "a" or "b" only for a find-the-missing-number skill.
- truefalse: shown = the result the statement claims; about half of them wrong by a typical mistake.
- column ("đặt tính rồi tính"): a and b are set out one above the other and the pupil works out the result; op "+", "-" or "×" (× by a one-digit number). For a column skill mix them: some with carrying or borrowing, some without.
- A skill about saying, reading or writing numbers (number names, "đọc, viết số"): no sums. Give a = the number (inside the range, a different one each time: some with a 0 digit like 305 or 640), op "+", b = 0; the app writes the number in words, the question, the wrong options and the explanation. For truefalse, shown = the number whose words the statement gives (about half of them a typical slip: 321 shown as 312 or 231).
- word: story = a short everyday story in {{lang}} where the two numbers really belong together (children and chairs in a hall, not 600 storybooks + 84 comic books), contains a and b and ends with a question ("… Hỏi … có bao nhiêu quả xoài?"); unit = exactly the thing the question asks for ("quả xoài", or "con gà mái" when it asks for hens, never just "con gà").
- explain: one short line in {{lang}} showing the method ("6 + 7 = 13, viết 3 nhớ 1").
Use only the kind of calculation and the number range the book section teaches; harder items may extend it only within that section.{{avoid}}`;
export const MATH_ITEMS_SCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { a: int, op: { type: 'string', enum: ['+', '-', '×', ':'] }, b: int, blank: { type: 'string', enum: ['a', 'b', 'result'] }, shown: int, distractors: { type: 'array', items: int }, story: str, unit: str, explain: str }, required: ['a', 'op', 'b', 'explain'] } } }, required: ['items'] };

export const ENG_ITEMS_SYSTEM = `You write English practice items for Vietnamese primary pupils (grade {{grade}}) from ONE section of the assigner's book.
Skill: {{skill}} (kind: {{kind}}). Template: {{template}}. Level: {{level}} (basic = the lesson's words in their simplest use; good = new sentences or a new context with the same words; advanced = a longer sentence or a twist). Make {{count}} different items using ONLY words and sentence patterns the book section teaches. Never repeat an item listed as already in the lesson: each level asks something new.
- prompt: only the instruction for this item, in {{lang}}, saying what the child does ("Nghe và chọn từ đúng.", "Choose the missing word."); never the book's own activity line ("Read and play the game.", "Look and say."). It NEVER contains the answer, the pairs or the words read aloud.
- match: the app writes the instruction ("Match each word to its picture."). pairs = 3-4 {word, emoji} for nouns from the lesson whose emoji a child names at once (🐶 dog, 📕 book). Never an emoji that reads as another word (💪 is "strong" or "arm", never elbows; 👋 is "hello"); leave out a word with no clear emoji of its own (elbow, knee, shoulder, neck). A colour word takes its own plain swatch (🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ or 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪), never a thing of that colour (🌸 is a flower, not pink); leave out a colour with no swatch (pink, grey).
- fill: sentence with exactly one "___"; options = 3 different words; answer = one of them. The sentence alone must make exactly ONE option right: it names the thing it is about ("The sky is ___." -> blue, "The banana is ___." -> yellow), never "It is ___." or "This is ___." with nothing to go on. Never a sentence about likes or opinions (favourite, like, love, want, best…): a child's own choice is never wrong.
- listen: say = the word or phrase read aloud (kept apart, never shown); options = 3 choices; answer = one of them.
- order: words = the shuffled words of one short sentence, each keeping its own punctuation ("Nam,"); answer = the sentence with a capital letter and full stop.
- explain: one short line in {{lang}} a child understands, in plain, natural words a teacher would say (never an odd phrase like "You make a direction to play."). For fill and listen it is shown after a wrong try with the answer hidden, so it is about the answer itself: say what it means here and why the other options do not fit, naming them ("The floor is lava, so you step only on the stones, not on the floor or the grass."), never about another word of the sentence ("We say must for a game rule." helps no one who picked "floor").
- why (fill and listen): for EACH wrong option, {option, why}: one short line in {{lang}} (at most 15 words) on why THAT option does not fit here, shown when a child picks it ({option: "floor", why: "The floor is lava, so you must not step on the floor."}). It never names the right answer, and never calls the wrong option "the answer" or "right".
A comma_clause skill only for sentences that have a comma. Never two punctuation marks in a row (".:").{{avoid}}`;
export const ENG_ITEMS_SCHEMA = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { prompt: str, pairs: { type: 'array', items: { type: 'object', properties: { word: str, emoji: str }, required: ['word', 'emoji'] } }, sentence: str, say: str, words: strs, options: strs, answer: str, explain: str, why: { type: 'array', items: { type: 'object', properties: { option: str, why: str }, required: ['option', 'why'] } } }, required: ['prompt', 'explain'] } } }, required: ['items'] };

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

// Chi's question checks. The first test is her table "Kiểm thử từ lỗi đã gặp": every real faulty
// item from the 17 and 21 Oct test reports, expressed as the data a model could send, must be caught
// (or, for S, made impossible because code writes the question). Add a row for each new one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askedThing, buildEnglish, buildMath, checkItem, contextOf, numberWords, rangeOf, readSlips, regroups, scopeOf, type CheckContext, type RawEnglish, type RawMath } from '../server/lesson/items.ts';
import { rangeLine } from '../server/lesson/writer.ts';
import { forPupil, hintOf, isRight } from '../server/classes/check.ts';
import type { Item } from '../server/lesson/types.ts';

const vi2: CheckContext = { subject: 'math', grade: 2, lang: 'vi', source: '', skills: [
  { tag: 'tru_co_nho', name: 'Trừ có nhớ', kind: 'sub_borrow' }, { tag: 'cong_co_nho', name: 'Cộng có nhớ', kind: 'add_carry' },
  { tag: 'dat_tinh', name: 'Đặt tính thẳng cột', kind: 'column' }, { tag: 'loi_van', name: 'Bài toán có lời văn', kind: 'word_problem' }, { tag: 'khong_nho', name: 'Cộng không nhớ', kind: 'add_no_carry' }] };
const en: CheckContext = { subject: 'english', grade: 4, lang: 'en', source: 'girl boy book hat rabbit Nam who lives next door is my friend the girl reads a book is Lan', skills: [
  { tag: 'nouns', name: 'Nouns', kind: 'vocabulary' }, { tag: 'comma', name: 'Cấu trúc mệnh đề có dấu phẩy', kind: 'comma_clause' }, { tag: 'listen', name: 'Listening', kind: 'listening' }] };
const math = (r: Partial<RawMath>, ctx = vi2) => checkItem(buildMath({ template: 'mcq', skill: 'cong_co_nho', level: 'basic', a: 36, op: '+', b: 27, distractors: [53, 64], explain: 'Nhớ 1.', ...r } as RawMath, 'ex01', 'vi'), ctx).map((i) => i.code);
const eng = (r: Partial<RawEnglish>) => checkItem(buildEnglish({ template: 'fill', skill: 'nouns', level: 'basic', prompt: 'Choose the missing word.', explain: r.answer ? `"${r.answer}" fits here.` : 'A noun.', ...r } as RawEnglish, 'ex01'), en).map((i) => i.code);

test("Chi's table: every real faulty item is caught", () => {
  // S: "Chọn kết quả đúng của phép tính sau:" with no calculation. Code writes the question now, so it always shows it:
  const s = buildMath({ template: 'mcq', skill: 'tru_co_nho', level: 'basic', a: 52, op: '-', b: 28, distractors: [34, 26], explain: 'Mượn 1.' }, 'ex01', 'vi');
  assert.equal(s.prompt, 'Chọn kết quả đúng: 52 − 28 = ?');
  assert.deepEqual(checkItem(s, vi2), []);
  assert.ok(math({ template: 'word', skill: 'loi_van', story: 'Lan có vài quả xoài.' }).includes('S'), 'a word problem without a question');
  // K: the listening word on screen
  assert.ok(eng({ template: 'listen', skill: 'listen', prompt: 'Listen and choose the correct word. 🔊 “rabbit”', say: 'rabbit', options: ['rabbit', 'robot', 'ribbon'], answer: 'rabbit' }).includes('K'));
  // U: asks for hens, answers chickens
  assert.ok(math({ template: 'word', skill: 'loi_van', a: 35, op: '-', b: 20, story: 'Đàn gà có 35 con, trong đó có 20 con gà trống. Hỏi có bao nhiêu con gà mái?', unit: 'con gà' }).includes('U'));
  // Q: a missing addend tagged "column calculation"
  assert.ok(math({ template: 'fill', skill: 'dat_tinh', a: 27, b: 18, blank: 'a' }).includes('Q'));
  // Q: no comma, comma-clause skill; the sentence with its commas passes
  assert.ok(eng({ template: 'order', skill: 'comma', prompt: 'Put the words in order.', words: ['Lan', 'the', 'girl', 'who', 'reads', 'a', 'book', 'is'], answer: 'The girl who reads a book is Lan.' }).includes('Q'));
  assert.deepEqual(eng({ template: 'order', skill: 'comma', prompt: 'Put the words in order.', words: ['is', 'door,', 'Nam,', 'friend', 'who', 'my', 'lives', 'next'], answer: 'Nam, who lives next door, is my friend.' }), []);
  // match: the pairs and ".:" in the prompt. Code writes the matching instruction now (Chi #52), so it cannot happen:
  const pairs = [{ word: 'girl', emoji: '👧' }, { word: 'boy', emoji: '👦' }, { word: 'book', emoji: '📕' }, { word: 'hat', emoji: '🎩' }];
  assert.equal(buildEnglish({ template: 'match', skill: 'nouns', level: 'basic', prompt: 'Match each word with its picture.: girl ↔ 👧, boy ↔ 👦', pairs, explain: 'x' }, 'ex01').prompt, 'Match each word to its picture.');
  assert.deepEqual(eng({ template: 'match', prompt: 'Match each word with its picture.: girl ↔ 👧, boy ↔ 👦', pairs }), []);
  // 52 – 28 with options 24 / 24 / 34
  assert.ok(math({ skill: 'tru_co_nho', a: 52, op: '-', b: 28, distractors: [24, 34] }).includes('dup'));
  // 45 + 67 in a grade 2 lesson
  assert.ok(math({ a: 45, b: 67, distractors: [102, 113] }).includes('range'));
});

test('code works out every maths answer and writes the question', () => {
  const tf = buildMath({ template: 'truefalse', skill: 'cong_co_nho', level: 'good', a: 36, op: '+', b: 27, shown: 53, explain: 'x' }, 'ex02', 'vi');
  assert.equal(tf.prompt, 'Đúng hay sai? 36 + 27 = 53');
  assert.equal(tf.answer, 'false');
  const fill = buildMath({ template: 'fill', skill: 'cong_co_nho', level: 'basic', a: 36, op: '+', b: 27, blank: 'b', explain: 'x' }, 'ex03', 'en');
  assert.equal(fill.prompt, 'Write the missing number: 36 + ? = 63');
  assert.equal(fill.answer, '27');
  const mcq = buildMath({ template: 'mcq', skill: 'cong_co_nho', level: 'basic', a: 36, op: '+', b: 27, distractors: [53, 64], explain: 'x' }, 'ex04', 'vi');
  assert.deepEqual([...mcq.options!].sort(), ['53', '63', '64']);
  assert.equal(mcq.answer, '63');
  assert.deepEqual(buildMath({ ...mcq, template: 'mcq', distractors: [53, 64] } as RawMath, 'ex04', 'vi').options, mcq.options, 'the same item always shows the same order');
});

test('Q: carrying, borrowing and their opposites are checked against the numbers', () => {
  assert.ok(math({ a: 31, b: 22, distractors: [43, 63] }).includes('Q'), '31 + 22 does not carry');
  assert.deepEqual(math({}), []);
  assert.ok(math({ skill: 'khong_nho' }).includes('Q'), '36 + 27 carries');
  assert.ok(math({ skill: 'tru_co_nho', a: 58, op: '-', b: 23, distractors: [25, 45] }).includes('Q'), '58 - 23 does not borrow');
  assert.ok(math({ skill: 'tru_co_nho', a: 58, op: '+', b: 23 }).includes('Q'), 'a subtraction skill on +');
  assert.ok(math({ skill: 'not_a_skill' }).includes('Q'), 'unknown skill');
});

test('U: the numbers come from the story and the unit names what was asked', () => {
  assert.deepEqual(askedThing('Lan có tất cả bao nhiêu quả xoài?'), ['quả', 'xoài']);
  assert.deepEqual(askedThing('Hỏi còn lại bao nhiêu cái kẹo?'), ['cái', 'kẹo']);
  assert.deepEqual(askedThing('How many apples are there?'), ['apples']);
  const story = 'Lan có 36 quả xoài, mẹ cho thêm 27 quả xoài. Hỏi Lan có tất cả bao nhiêu quả xoài?';
  assert.deepEqual(math({ template: 'word', skill: 'loi_van', story, unit: 'quả xoài' }), []);
  assert.ok(math({ template: 'word', skill: 'loi_van', story: story.replace('27', 'vài'), unit: 'quả xoài' }).includes('U'), '27 is not in the story');
});

test('English: words from outside the lesson, gaps, options and language', () => {
  assert.ok(eng({ sentence: 'I have a ___.', options: ['book', 'hat', 'giraffe'], answer: 'giraffe' }).includes('offlesson'));
  // "I have a ___." with book / hat / girl: any of them fits (Chi #31); the sentence names what decides it
  assert.deepEqual(eng({ sentence: 'The girl reads a ___.', options: ['book', 'hat', 'girl'], answer: 'book' }), []);
  assert.ok(eng({ sentence: 'I have a book.', options: ['book', 'hat', 'girl'], answer: 'book' }).includes('S'), 'no gap');
  assert.ok(eng({ sentence: 'I have a ___.', options: ['book', 'book', 'hat'], answer: 'book' }).includes('shape'), 'answer twice among the options');
  assert.ok(eng({ prompt: 'Chọn từ còn thiếu trong câu này nhé', sentence: 'I have a ___.', options: ['book', 'hat', 'girl'], answer: 'book' }).includes('lang'));
  assert.ok(eng({ prompt: '', sentence: 'I have a ___.', options: ['book', 'hat', 'girl'], answer: 'book' }).includes('empty'));
});

// Chi #31, English 3 Unit 6 Colours: 23 items, "0 written again", all 9 fill items had no single right answer.
const unit6: CheckContext = { subject: 'english', grade: 3, lang: 'en', source: 'Unit 6: Colours. New words: red, blue, green, yellow, pink, orange. What colour is it? It is red. My favourite colour is yellow.', skills: [
  { tag: 'colour_words', name: 'Colour words', kind: 'vocabulary' }, { tag: 'what_colour', name: "Asking 'What colour is it?'", kind: 'sentence_pattern' }] };
const colour = (r: Partial<RawEnglish>, ctx: CheckContext = unit6, id = 'ex01') => checkItem(buildEnglish({ template: 'fill', skill: 'colour_words', level: 'basic', prompt: 'Choose the missing word.', explain: r.answer ? `"${r.answer}" fits here.` : 'A colour.', ...r } as RawEnglish, id), ctx).map((i) => i.code);

test('English fill (Chi #31): the sentence makes exactly one option right', () => {
  assert.ok(colour({ sentence: 'It is ___.', options: ['red', 'blue', 'green'], answer: 'red' }).includes('clue'), 'no picture, no thing: any colour fits');
  assert.ok(colour({ sentence: 'This is ___.', options: ['red', 'blue', 'green'], answer: 'blue' }).includes('clue'));
  assert.ok(colour({ sentence: 'Mai: It is ___.', options: ['red', 'blue', 'green'], answer: 'red' }).includes('clue'), 'a speaker name is not a clue');
  assert.ok(colour({ sentence: 'My favourite colour is ___.', options: ['yellow', 'red', 'blue'], answer: 'yellow' }).includes('clue'), 'an opinion: a child picking red is not wrong');
  assert.ok(colour({ sentence: 'I like ___.', options: ['yellow', 'red', 'blue'], answer: 'red' }).includes('clue'));
  assert.deepEqual(colour({ sentence: 'The sky is ___.', options: ['blue', 'red', 'green'], answer: 'blue' }), []);
  assert.deepEqual(colour({ sentence: 'The banana is ___.', options: ['red', 'yellow', 'blue'], answer: 'yellow' }), []);
  assert.deepEqual(colour({ sentence: 'The apple is ___.', options: ['red', 'blue', 'yellow'], answer: 'red' }), [], 'only red of these fits an apple');
  assert.ok(colour({ sentence: 'The apple is ___.', options: ['red', 'green', 'blue'], answer: 'red' }).includes('clue'), 'apples are red or green: two options fit');
  assert.ok(colour({ sentence: 'The sky is ___.', options: ['blue', 'red', 'green'], answer: 'red' }).includes('clue'), 'the sentence says blue, the answer says red');
  assert.ok(colour({ sentence: 'My pencil is ___.', options: ['red', 'blue', 'green'], answer: 'green' }).includes('clue'), 'a pencil can be any colour');
  // a grammar gap: the grammar decides, so the sample's own pattern still passes
  assert.deepEqual(colour({ skill: 'what_colour', sentence: 'What colour ___ it?', options: ['is', 'are', 'am'], answer: 'is' }), []);
});

test('English match (Chi #31): a colour word takes its own swatch, never a thing of that colour', () => {
  const match = (pairs: { word: string; emoji: string }[]) => colour({ template: 'match', prompt: 'Match each word to its picture.', pairs });
  assert.deepEqual(match([{ word: 'red', emoji: '🔴' }, { word: 'blue', emoji: '🟦' }, { word: 'green', emoji: '🟢' }]), []);
  assert.ok(match([{ word: 'red', emoji: '🔴' }, { word: 'blue', emoji: '🔵' }, { word: 'pink', emoji: '🌸' }]).includes('picture'), '🌸 is a flower; pink has no swatch');
  assert.ok(match([{ word: 'red', emoji: '🍎' }, { word: 'blue', emoji: '🔵' }, { word: 'green', emoji: '🟢' }]).includes('picture'), 'an apple is not the colour red');
  assert.ok(match([{ word: 'red', emoji: '🔵' }, { word: 'blue', emoji: '🔴' }, { word: 'green', emoji: '🟢' }]).includes('picture'), 'the swatch must be that colour');
  assert.deepEqual(match([{ word: 'white', emoji: '⬜️' }, { word: 'black', emoji: '⚫' }, { word: 'red', emoji: '🟥' }]).filter((c) => c === 'picture'), [], 'with or without the emoji variation mark');
});

test('levels (Chi #31): a good or advanced item never repeats a basic one', () => {
  const basic = buildEnglish({ template: 'fill', skill: 'colour_words', level: 'basic', prompt: 'Choose the missing word.', sentence: 'The sky is ___.', options: ['blue', 'red', 'green'], answer: 'blue', explain: 'The sky is blue.' }, 'ex01');
  const withLesson: CheckContext = { ...unit6, items: [basic] as Item[] };
  assert.ok(colour({ level: 'good', prompt: 'Fill in the gap.', sentence: 'The sky is ___ .', options: ['green', 'blue', 'yellow'], answer: 'blue' }, withLesson, 'ex05').includes('dup'), 'a new instruction and option order is still the same question');
  assert.deepEqual(colour({ level: 'good', sentence: 'The banana is ___.', options: ['red', 'yellow', 'blue'], answer: 'yellow' }, withLesson, 'ex05'), []);
  assert.deepEqual(colour({ level: 'basic', sentence: 'The sky is ___.', options: ['blue', 'red', 'green'], answer: 'blue' }, withLesson, 'ex01'), [], 'the basic item itself passes');
  assert.ok(!colour({ level: 'advanced', template: 'listen', say: 'blue', options: ['blue', 'red', 'green'], answer: 'blue' }, withLesson, 'ex06').includes('dup'), 'another template is another question');
  assert.ok(!colour({ level: 'good', skill: 'what_colour', sentence: 'The sky is ___.', options: ['blue', 'red', 'green'], answer: 'blue' }, withLesson, 'ex07').includes('dup'), 'levels belong to one skill');
});

// Chi #47 (31 Oct): "Cộng, trừ trong phạm vi 1000" (Toán 2 tập 2, pp. 58-77) got 100 − 28, 48 + 37, 83 − 36, 59 + 24…
const SGK1000 = 'Cộng, trừ trong phạm vi 1000\nĐặt tính rồi tính: 456 + 278; 352 − 127. Bài toán: Trường có 425 học sinh nam và 387 học sinh nữ.';
const vi1000: CheckContext = { ...vi2, source: SGK1000, scope: scopeOf(SGK1000) };

test('the range of a part (Chi #47): "phạm vi 1000" in its title, the numbers in its text, the child\'s work', () => {
  assert.deepEqual(scopeOf('Phép cộng (có nhớ) trong phạm vi 1000\n456 + 278 = 734.'), { max: 1000, ops: ['+'] });
  assert.equal(scopeOf(SGK1000).max, 1000);
  assert.deepEqual(scopeOf(SGK1000).ops, ['+', '-'], '"Cộng, trừ": both operations');
  assert.equal(scopeOf('Bài 60: Phép cộng có nhớ\nVí dụ: 456 + 278 = 734. Luyện tập: 254 + 172.').max, 1000, 'no range named: 3-digit calculations mean within 1000');
  assert.equal(scopeOf('Bài 61: Luyện tập [tr. 58]\n36 + 27 = 63.').max, undefined, '2-digit calculations and page numbers set no range: the grade decides');
  assert.equal(scopeOf('Các số trong phạm vi 10 000\n4 325 = 4000 + 300 + 20 + 5').max, 10000, '"10 000" is one number');
  assert.equal(scopeOf('Phép cộng trong phạm vi 100\nÔn tập. Tiết sau: phạm vi 1000.').max, 100, 'the part\'s own title wins over a mention further on');
  assert.equal(scopeOf('Luyện tập chung\n36 + 27', 'Cộng có nhớ trong phạm vi 1000').max, 1000, 'the lesson\'s title when the part says nothing');
  const work = contextOf({ subject: 'math', grade: 2, title: 'Luyện tập', objectives: [], minutes: 25, lang: 'vi', note: 'Tập trung vào lỗi: Quên nhớ 1 sang hàng trăm (356 + 172 = 428)' }, [], 'Luyện tập\nTính nhẩm.');
  assert.equal(work.scope?.max, 1000, 'a lesson from a photo of the child\'s work: the numbers of her exercise');
  assert.deepEqual(rangeOf(vi1000), { max: 1000, floor: 100 });
  assert.deepEqual(rangeOf(vi2), { max: 100 }, 'the grade\'s own range sets no floor');
  assert.match(rangeLine(vi1000), /within 1000.*above 100.*3-digit/);
  assert.match(rangeLine(vi2), /Grade 2 uses numbers up to 100/);
});

test('Chi #47: in a "within 1000" lesson, numbers too small are refused like numbers too big', () => {
  // her table: every item that stayed was under 100
  assert.ok(math({ skill: 'tru_co_nho', a: 100, op: '-', b: 28, distractors: [82, 62] }, vi1000).includes('scope'), '100 − 28');
  assert.ok(math({ a: 48, b: 37, distractors: [75, 86] }, vi1000).includes('scope'), '48 + 37');
  assert.ok(math({ skill: 'tru_co_nho', a: 83, op: '-', b: 36, distractors: [57, 46] }, vi1000).includes('scope'), '83 − 36');
  assert.ok(math({ template: 'word', skill: 'loi_van', a: 59, b: 24, story: 'Lan có 59 quả xoài, mẹ cho thêm 24 quả xoài. Hỏi Lan có tất cả bao nhiêu quả xoài?', unit: 'quả xoài' }, vi1000).includes('scope'), '59 + 24 in a story');
  // the chapter's own numbers pass in a grade-2 book, although grade 2 alone stops at 100
  assert.deepEqual(math({ a: 456, b: 278, distractors: [724, 634] }, vi1000), []);
  assert.deepEqual(math({ skill: 'tru_co_nho', a: 352, op: '-', b: 287, distractors: [75, 135] }, vi1000), [], 'a small result is fine: the calculation is 3-digit');
  assert.ok(math({ a: 456, b: 678, distractors: [1034, 1124] }, vi1000).includes('scope'), 'above 1000');
  assert.ok(math({ a: 456, b: 278, distractors: [724, 634] }).includes('range'), 'without the section, grade 2 still stops at 100');
  // "within 100": only sums of numbers up to 10 are too small
  const vi100: CheckContext = { ...vi2, scope: scopeOf('Phép cộng có nhớ trong phạm vi 100') };
  assert.ok(math({ skill: 'khong_nho', a: 4, b: 5, distractors: [8, 10] }, vi100).includes('scope'));
  assert.ok(!math({ a: 8, b: 7, distractors: [5, 16] }, vi100).includes('scope'), '8 + 7 = 15 is not under the floor');
});

test('carrying in any column (Chi #47): 254 + 172 carries in the tens; its forgotten 1 is 326', () => {
  assert.deepEqual(regroups(254, '+', 172), { any: true, first: 10 });
  assert.deepEqual(regroups(432, '+', 215), { any: false, first: 0 });
  assert.deepEqual(regroups(352, '-', 127), { any: true, first: 1 });
  assert.deepEqual(regroups(528, '-', 172), { any: true, first: 10 }, '2 tens take 7 tens: borrow from the hundreds');
  assert.deepEqual(math({ a: 254, b: 172, distractors: [436, 416] }, vi1000), [], 'an add_carry skill: the tens carry');
  assert.ok(math({ skill: 'khong_nho', a: 254, b: 172, distractors: [436, 416] }, vi1000).includes('Q'), 'not "without carrying"');
  const m = buildMath({ template: 'mcq', skill: 'cong_co_nho', level: 'basic', a: 254, op: '+', b: 172, distractors: [436], explain: 'x' }, 'ex09', 'vi');
  assert.ok(m.options!.includes('326'), 'the forgotten carry in the tens is one of the wrong options');
});

test('column items (Chi #47): "đặt tính rồi tính" with 3-digit numbers, checked by code', () => {
  const c = buildMath({ template: 'column', skill: 'dat_tinh', level: 'basic', a: 456, op: '+', b: 278, explain: '6 + 8 = 14, viết 4 nhớ 1.' }, 'ex10', 'vi');
  assert.equal(c.prompt, 'Đặt tính rồi tính: 456 + 278');
  assert.equal(c.answer, '734');
  assert.equal(buildMath({ template: 'column', skill: 'dat_tinh', level: 'basic', a: 658, op: '-', b: 234, explain: 'x' }, 'ex11', 'en').prompt, 'Write in columns, then work it out: 658 − 234');
  const col = (r: Partial<RawMath>, ctx = vi1000) => math({ template: 'column', skill: 'dat_tinh', ...r }, ctx);
  assert.deepEqual(col({ a: 456, b: 278 }), [], 'with carrying');
  assert.deepEqual(col({ a: 432, b: 215 }), [], 'without carrying: a column skill takes both');
  assert.deepEqual(col({ a: 658, op: '-', b: 234 }), []);
  assert.ok(col({ a: 48, b: 37 }).includes('scope'), '2-digit columns in a "within 1000" lesson');
  assert.ok(col({ a: 456, b: 278, skill: 'khong_nho' }).includes('Q'), 'carrying under a "without carrying" skill');
  assert.ok(col({ a: 4, b: 5 }, vi2).includes('shape'), 'one-digit numbers need no columns');
  assert.ok(col({ a: 84, op: ':', b: 4 }, vi2).includes('shape'), 'no column division here');
  assert.deepEqual(forPupil(c), { id: 'ex10', template: 'column', prompt: 'Đặt tính rồi tính: 456 + 278', stack: { a: 456, op: '+', b: 278 } }, 'the pupil gets the numbers to stack, never the answer');
});

// Chi #52 (1 Nov), English: matching copied the book's "Read and play the game.", and "elbows" was shown as 💪
const body: CheckContext = { subject: 'english', grade: 3, lang: 'en', source: 'Unit 4: My body. Read and play the game. arm arms elbow elbows ear ears feet knee nose leg hand You must only step on the stones. The floor is lava. stones floor grass', skills: [
  { tag: 'body', name: 'Body parts', kind: 'vocabulary' }] };
const bodyItem = (r: Partial<RawEnglish>) => checkItem(buildEnglish({ template: 'match', skill: 'body', level: 'basic', prompt: 'Read and play the game.', explain: 'Say each word.', ...r } as RawEnglish, 'ex01', 'en'), body).map((i) => i.code);

test('Chi #52 (a): matching says "match" and every picture reads as its own word', () => {
  const p = (prompt: string, lang?: 'vi' | 'en') => buildEnglish({ template: 'match', skill: 'body', level: 'basic', prompt, pairs: [{ word: 'ear', emoji: '👂' }, { word: 'nose', emoji: '👃' }, { word: 'leg', emoji: '🦵' }], explain: 'x' }, 'ex01', lang).prompt;
  assert.equal(p('Read and play the game.'), 'Match each word to its picture.', "the book's game line is replaced");
  assert.equal(p('Look at the game and play.', 'vi'), 'Nối mỗi từ với hình đúng.', "the lesson's language");
  assert.equal(p('Đọc và chơi trò chơi.'), 'Nối mỗi từ với hình đúng.', 'no language given: the model\'s prompt tells it');
  assert.deepEqual(bodyItem({ pairs: [{ word: 'ears', emoji: '👂' }, { word: 'nose', emoji: '👃' }, { word: 'feet', emoji: '🦶' }] }), [], 'plurals of a body part with its own emoji');
  assert.ok(bodyItem({ pairs: [{ word: 'elbows', emoji: '💪' }, { word: 'nose', emoji: '👃' }, { word: 'ear', emoji: '👂' }] }).includes('picture'), '💪 reads as strong or arm');
  assert.ok(bodyItem({ pairs: [{ word: 'elbow', emoji: '🦾' }, { word: 'nose', emoji: '👃' }, { word: 'ear', emoji: '👂' }] }).includes('picture'), 'an elbow has no emoji of its own');
  assert.ok(bodyItem({ pairs: [{ word: 'knee', emoji: '🦵' }, { word: 'nose', emoji: '👃' }, { word: 'ear', emoji: '👂' }] }).includes('picture'), '🦵 is a leg');
  assert.ok(bodyItem({ pairs: [{ word: 'hand', emoji: '👋🏽' }, { word: 'nose', emoji: '👃' }, { word: 'ear', emoji: '👂' }] }).includes('picture'), '👋 says hello, whatever the skin tone');
  assert.deepEqual(bodyItem({ pairs: [{ word: 'arm', emoji: '💪' }, { word: 'hand', emoji: '✋' }, { word: 'ear', emoji: '👂' }] }), []);
  // the other templates keep the model's instruction, but never the book's game line
  const fill = { template: 'fill' as const, sentence: 'You must only step on the ___.', options: ['stones', 'floor', 'grass'], answer: 'stones', explain: 'The floor is lava, so you step only on the stones, not on the floor.' };
  assert.ok(bodyItem({ ...fill, prompt: 'Read and play the game.' }).includes('shape'));
  assert.deepEqual(bodyItem({ ...fill, prompt: 'Choose the missing word.' }), []);
});

test('Chi #52 (b): a fill item\'s explanation, the hint after a wrong try, is about the word in the gap', () => {
  const fill = { template: 'fill' as const, prompt: 'Choose the missing word.', sentence: 'You must only step on the ___.', options: ['stones', 'floor', 'grass'], answer: 'stones' };
  assert.ok(bodyItem({ ...fill, explain: 'We say must for a game rule.' }).includes('shape'), 'about "must", not the gap: no help to a child who picked "floor"');
  const good = { ...fill, explain: 'The floor is lava, so you step only on the stones, not on the floor or the grass.' };
  assert.deepEqual(bodyItem(good), []);
  const hint = hintOf(buildEnglish({ skill: 'body', level: 'basic', ...good }, 'ex01', 'en'), 'floor', 'en');
  assert.ok(hint.includes('not on the floor') && !hint.includes('stones'), `the hint follows the mistake without giving the answer: ${hint}`);
  assert.deepEqual(bodyItem({ ...fill, sentence: 'You ___ step on the stones.', options: ['must', 'is', 'am'], answer: 'must', explain: 'A rule of the game: we use must.' }), [], 'a grammar word in the gap: the explanation names it');
});

// Chi #52 (d): Cambridge Maths 3, "Say, read and write numbers to 1000", got only 300 + 45 and 428 + 10
const NUM1000 = 'Numbers to 1000\nSay, read and write numbers to 1000. 300 + 45 = 345. 428 + 10 = 438.';
const cam: CheckContext = { subject: 'math', grade: 3, lang: 'en', source: NUM1000, scope: scopeOf(NUM1000), skills: [
  { tag: 'read_write_numbers', name: 'Say, read and write numbers to 1000', kind: 'other' }, { tag: 'add_tens', name: 'Adding 10 or 100', kind: 'add_no_carry' }, { tag: 'missing', name: 'Write the missing number', kind: 'other' }] };
const num = (r: Partial<RawMath>, lang: 'vi' | 'en' = 'en', id = 'ex01') => buildMath({ template: 'mcq', skill: 'read_write_numbers', level: 'basic', a: 321, op: '+', b: 0, explain: '', ...r } as RawMath, id, lang);

test('Chi #52 (d): numbers in words are written by code', () => {
  const en = (n: number) => numberWords(n, 'en'), vi = (n: number) => numberWords(n, 'vi');
  assert.equal(en(321), 'three hundred and twenty-one');
  assert.equal(en(305), 'three hundred and five');
  assert.equal(en(640), 'six hundred and forty');
  assert.equal(en(700), 'seven hundred');
  assert.equal(en(15), 'fifteen');
  assert.equal(en(1000), 'one thousand');
  assert.equal(en(2005), 'two thousand and five');
  assert.equal(en(4321), 'four thousand three hundred and twenty-one');
  assert.equal(en(0), 'zero');
  assert.equal(vi(321), 'ba trăm hai mươi mốt');
  assert.equal(vi(305), 'ba trăm linh năm');
  assert.equal(vi(115), 'một trăm mười lăm');
  assert.equal(vi(211), 'hai trăm mười một', 'mười một, never mười mốt');
  assert.equal(vi(425), 'bốn trăm hai mươi lăm');
  assert.equal(vi(2005), 'hai nghìn không trăm linh năm');
  assert.equal(vi(1050), 'một nghìn không trăm năm mươi');
  assert.equal(numberWords(-1, 'en'), '');
  assert.deepEqual(readSlips(321), [312, 30021, 231], 'digits swapped, written as heard');
  assert.deepEqual(readSlips(305).slice(0, 2), [350, 3005]);
});

test('Chi #52 (d): a reading-and-writing-numbers skill gets numbers in words, never sums', () => {
  const m = num({});
  assert.equal(m.prompt, 'Which number is “three hundred and twenty-one”?');
  assert.deepEqual([...m.options!].sort(), ['231', '30021', '312', '321']);
  assert.ok(isRight(m, '321') && !isRight(m, '312'));
  assert.equal(m.explain, '321 has 3 hundreds, 2 tens and 1 one: “three hundred and twenty-one”.');
  assert.deepEqual(checkItem(m, cam), []);
  const f = num({ template: 'fill', a: 305 });
  assert.equal(f.prompt, 'Write this number in digits: three hundred and five');
  assert.ok(isRight(f, '305') && !isRight(f, '3005'));
  assert.deepEqual(checkItem(f, cam), []);
  const tf = num({ template: 'truefalse', shown: 312 });
  assert.equal(tf.prompt, 'True or false? 321 in words is “three hundred and twelve”.');
  assert.ok(isRight(tf, 'false'));
  assert.equal(num({ template: 'truefalse' }).answer, 'true');
  assert.equal(num({ template: 'word', story: 'x' }).prompt, 'Which is 321 in words?', 'a word-problem request on this skill becomes choosing the words');
  assert.deepEqual(checkItem(num({ template: 'column', a: 640 }), cam), [], 'a column request becomes writing the number');
  assert.equal(num({}, 'vi').prompt, 'Số nào đọc là “ba trăm hai mươi mốt”?');
  assert.equal(num({ template: 'truefalse', shown: 231 }, 'vi').prompt, 'Đúng hay sai? Số 321 đọc là “hai trăm ba mươi mốt”.');
  // the checks: sums on this skill, numbers in words on another, numbers too small for the section
  assert.ok(checkItem(buildMath({ template: 'mcq', skill: 'read_write_numbers', level: 'basic', a: 300, op: '+', b: 45, distractors: [355, 335], explain: 'x' }, 'ex02', 'en'), cam).some((i) => i.code === 'Q'), '300 + 45 does not practise reading numbers');
  assert.ok(checkItem(num({ skill: 'add_tens' }), cam).some((i) => i.code === 'Q'), 'numbers in words under an adding skill');
  assert.ok(checkItem(num({ skill: 'missing' }), cam).some((i) => i.code === 'Q'), '"Write the missing number" is not about reading numbers');
  assert.ok(checkItem(num({ a: 45 }), cam).some((i) => i.code === 'scope'), '45 belongs to an earlier chapter');
  assert.ok(checkItem(num({ a: 4321 }), cam).some((i) => i.code === 'scope'), 'above 1000');
  assert.ok(!checkItem(num({}), { ...cam, scope: scopeOf('Subtraction\n652 − 287') }).some((i) => i.code === 'scope'), 'a number in words is no addition, whatever the section\'s signs');
});

test('Chi #52: a hint for the very option she picked, never the answer', () => {
  const fill = { template: 'fill' as const, skill: 'body', level: 'basic' as const, prompt: 'Choose the missing word.', sentence: 'You must only step on the ___.', options: ['stones', 'floor', 'grass'], answer: 'stones', explain: 'The floor is lava, so you step only on the stones, not on the floor or the grass.' };
  const it = buildEnglish({ ...fill, why: [{ option: 'Floor', why: 'The floor is lava, so you must not step on the floor.' }, { option: 'grass', why: 'Step on the stones, not the grass.' }, { option: 'stones', why: 'Right!' }, { option: 'sand', why: 'No sand here.' }] }, 'ex01', 'en');
  assert.deepEqual(it.why, { floor: 'The floor is lava, so you must not step on the floor.' }, 'a reason naming the answer, for the answer, or for no option is dropped');
  assert.equal(hintOf(it, 'floor', 'en'), 'The floor is lava, so you must not step on the floor.');
  const other = hintOf(it, 'grass', 'en');
  assert.ok(other.includes('___') && !other.includes('stones'), `no reason for "grass": the explanation with the answer hidden: ${other}`);
  assert.equal(forPupil(it).hasOwnProperty('why'), false, 'pupils never receive the reasons');
  assert.equal(buildEnglish({ ...fill, why: { grass: 'x'.repeat(141) } }, 'ex02', 'en').why, undefined, 'a long reason is dropped');
  assert.deepEqual(buildEnglish({ ...fill, why: { grass: 'Grass is soft, but the rule says no.' } }, 'ex03', 'en').why, { grass: 'Grass is soft, but the rule says no.' }, 'a map (from code or an edit) is kept too');
  assert.equal(buildEnglish({ ...fill, sentence: 'What colour ___ it?', options: ['is', 'are', 'am'], answer: 'is', why: { are: 'This is for many things.', am: '"am" goes only with "I".' } }, 'ex04', 'en').why?.are, undefined, 'a grammar word: a reason saying "is" gives it away');
});

test('Chi #52 (d): "Which is 321 in words?" with word options, checked as text', () => {
  const m = num({ template: 'word' });
  assert.equal(m.template, 'mcq'); assert.equal(m.blank, 'a'); assert.equal(m.answer, 'three hundred and twenty-one');
  assert.deepEqual([...m.options!].sort(), ['thirty thousand and twenty-one', 'three hundred and twelve', 'three hundred and twenty-one', 'two hundred and thirty-one'], 'the right words and the words of the slips');
  assert.ok(isRight(m, 'three hundred and twenty-one') && isRight(m, ' Three Hundred and twenty one ') && !isRight(m, 'three hundred and twelve') && !isRight(m, '321'));
  assert.deepEqual(checkItem(m, cam), []);
  assert.deepEqual(forPupil(m).options, m.options);
  const h = hintOf(m, 'three hundred and twelve', 'en');
  assert.ok(h.startsWith('“three hundred and twelve” is 312, not 321.') && !h.includes('twenty-one'), h);
  assert.equal(hintOf(num({}), '312', 'en'), '312 in words is “three hundred and twelve”. Read it by place: the hundreds, then the tens, then the ones.', 'picking a number: its words said back');
  // a teacher's edit is rebuilt from a, op, b (and the template and blank it keeps): still choosing the words
  const e = buildMath({ template: m.template, blank: m.blank, skill: m.skill, level: m.level, a: 640, op: '+', b: 0, distractors: m.distractors, explain: m.explain }, m.id, 'en');
  assert.equal(e.prompt, 'Which is 640 in words?'); assert.equal(e.answer, 'six hundred and forty'); assert.deepEqual(checkItem(e, cam), []);
  const v = num({ template: 'word' }, 'vi');
  assert.equal(v.prompt, 'Số 321 đọc là gì?'); assert.ok(v.options!.includes('ba trăm mười hai') && isRight(v, 'Ba trăm hai mươi mốt'));
  assert.deepEqual(checkItem(v, { ...cam, lang: 'vi' }), []);
  assert.ok(hintOf(v, 'ba trăm mười hai', 'vi').startsWith('“ba trăm mười hai” là số 312, không phải 321.'));
});

test('a reason that calls the wrong option "the answer" is dropped (live test, 1 Nov)', async () => {
  const { buildEnglish } = await import('../server/lesson/items.ts');
  const it = buildEnglish({ template: 'fill', skill: 'q', level: 'basic', prompt: 'Choose the missing word.', sentence: 'What colour is ___?', options: ['it', 'red', 'blue'], answer: 'it', explain: 'We ask about the thing with it.', why: [{ option: 'blue', why: "'Blue' is the answer, not the question word." }, { option: 'red', why: 'Red is a colour, not the thing we ask about.' }] }, 'x1', 'en') as any;
  assert.deepEqual(it.why, { red: 'Red is a colour, not the thing we ask about.' });
});

test('the right option is not always in the same place (live test, 1 Nov: four options, the answer always last)', async () => {
  const { buildMath } = await import('../server/lesson/items.ts');
  const places = new Set<number>();
  for (const a of [321, 405, 760, 305, 640, 518, 907, 254, 613, 432]) {
    const it = buildMath({ template: 'mcq', skill: 'read', level: 'basic', a, op: '+', b: 0, explain: '' }, `ex${a}`, 'en') as any;
    places.add(it.options.indexOf(it.answer));
  }
  assert.ok(places.size >= 3, `the answer sat at ${[...places]}`);
});

// Chi's question checks. The first test is her table "Kiểm thử từ lỗi đã gặp": every real faulty
// item from the 17 and 21 Oct test reports, expressed as the data a model could send, must be caught
// (or, for S, made impossible because code writes the question). Add a row for each new one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askedThing, buildEnglish, buildMath, checkItem, type CheckContext, type RawEnglish, type RawMath } from '../server/lesson/items.ts';

const vi2: CheckContext = { subject: 'math', grade: 2, lang: 'vi', source: '', skills: [
  { tag: 'tru_co_nho', name: 'Trừ có nhớ', kind: 'sub_borrow' }, { tag: 'cong_co_nho', name: 'Cộng có nhớ', kind: 'add_carry' },
  { tag: 'dat_tinh', name: 'Đặt tính thẳng cột', kind: 'column' }, { tag: 'loi_van', name: 'Bài toán có lời văn', kind: 'word_problem' }, { tag: 'khong_nho', name: 'Cộng không nhớ', kind: 'add_no_carry' }] };
const en: CheckContext = { subject: 'english', grade: 4, lang: 'en', source: 'girl boy book hat rabbit Nam who lives next door is my friend the girl reads a book is Lan', skills: [
  { tag: 'nouns', name: 'Nouns', kind: 'vocabulary' }, { tag: 'comma', name: 'Cấu trúc mệnh đề có dấu phẩy', kind: 'comma_clause' }, { tag: 'listen', name: 'Listening', kind: 'listening' }] };
const math = (r: Partial<RawMath>, ctx = vi2) => checkItem(buildMath({ template: 'mcq', skill: 'cong_co_nho', level: 'basic', a: 36, op: '+', b: 27, distractors: [53, 64], explain: 'Nhớ 1.', ...r } as RawMath, 'ex01', 'vi'), ctx).map((i) => i.code);
const eng = (r: Partial<RawEnglish>) => checkItem(buildEnglish({ template: 'fill', skill: 'nouns', level: 'basic', prompt: 'Choose the missing word.', explain: 'A noun.', ...r } as RawEnglish, 'ex01'), en).map((i) => i.code);

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
  // match: the pairs and ".:" in the prompt
  const m = eng({ template: 'match', prompt: 'Match each word with its picture.: girl ↔ 👧, boy ↔ 👦', pairs: [{ word: 'girl', emoji: '👧' }, { word: 'boy', emoji: '👦' }, { word: 'book', emoji: '📕' }, { word: 'hat', emoji: '🎩' }] });
  assert.ok(m.includes('K') && m.includes('punct'));
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
  assert.deepEqual(eng({ sentence: 'I have a ___.', options: ['book', 'hat', 'girl'], answer: 'book' }), []);
  assert.ok(eng({ sentence: 'I have a book.', options: ['book', 'hat', 'girl'], answer: 'book' }).includes('S'), 'no gap');
  assert.ok(eng({ sentence: 'I have a ___.', options: ['book', 'book', 'hat'], answer: 'book' }).includes('shape'), 'answer twice among the options');
  assert.ok(eng({ prompt: 'Chọn từ còn thiếu trong câu này nhé', sentence: 'I have a ___.', options: ['book', 'hat', 'girl'], answer: 'book' }).includes('lang'));
  assert.ok(eng({ prompt: '', sentence: 'I have a ___.', options: ['book', 'hat', 'girl'], answer: 'book' }).includes('empty'));
});

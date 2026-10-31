// Chi #41: the subject and grade of a new source are guessed from its file name (then the first page);
// nothing is preset, and what cannot be guessed is left for her to choose.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guessSubject } from '../web/src/guess.ts';

test('subject and grade from a file name', () => {
  const cases: [string, ReturnType<typeof guessSubject>][] = [
    ['Toán 2.pdf', { subject: 'math', grade: 2 }],
    ['toan-2-tap-1.pdf', { subject: 'math', grade: 2 }],
    ['Maths 2.pdf', { subject: 'math', grade: 2 }],
    ['Math Grade 3.pdf', { subject: 'math', grade: 3 }],
    ['maths2_book1.pdf', { subject: 'math', grade: 2 }],
    ['Tiếng Anh 3.pdf', { subject: 'english', grade: 3 }],
    ['English 3.pdf', { subject: 'english', grade: 3 }],
    ['Tieng Anh lop 4.pdf', { subject: 'english', grade: 4 }],
    ['SGK Toán lớp 5 - Tập 2.pdf', { subject: 'math', grade: 5 }],
    ['Toán tiếng Anh 1.pdf', { subject: 'math', grade: 1 }],
    ['english_G2.pdf', { subject: 'english', grade: 2 }],
    ['Anh văn lớp 1.pdf', { subject: 'english', grade: 1 }],
  ];
  for (const [name, want] of cases) assert.deepEqual(guessSubject(name), want, name);
});

test('grade alone, or nothing; out of range grades and "toàn" are not guesses', () => {
  assert.deepEqual(guessSubject('lớp 2 - bài tập.pdf'), { grade: 2 });
  assert.deepEqual(guessSubject('grade 2.pdf'), { grade: 2 });
  assert.deepEqual(guessSubject('IMG_2041.jpg'), {});
  assert.deepEqual(guessSubject('Tiếng Việt 2.pdf'), {}, 'not supported: no subject, and the 2 is not taken without one');
  assert.deepEqual(guessSubject('Toán 7.pdf'), { subject: 'math' }, 'grades 1-5 only');
  assert.deepEqual(guessSubject('Toàn tập Tiếng Anh 3.pdf'), { subject: 'english', grade: 3 }, '"toàn" (whole) is not Maths');
  assert.deepEqual(guessSubject('scan 2024.pdf'), {});
});

test('the name first, then the file name, then the first page fills what is left', () => {
  assert.deepEqual(guessSubject('', 'scan.pdf', 'BỘ SÁCH KẾT NỐI TRI THỨC\nTOÁN\nLớp 2 · Tập một'), { subject: 'math', grade: 2 });
  assert.deepEqual(guessSubject('English', 'book.pdf', 'Grade 4 Student Book'), { subject: 'english', grade: 4 });
  assert.deepEqual(guessSubject('Maths 3', 'English 1.pdf'), { subject: 'math', grade: 3 }, 'the name she typed wins');
  assert.deepEqual(guessSubject(undefined, null, ''), {});
});

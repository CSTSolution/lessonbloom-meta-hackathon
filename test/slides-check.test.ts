// The code check of a slide's title, numbers and units (Chi, 30-31 Oct): her two slides are caught,
// good slides are left alone, and while a lesson is made a contradicting slide is written again and
// keeps a mark for the assigner.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MockProvider } from '../server/ai/mock.ts';
import type { JsonRequest } from '../server/ai/types.ts';
import { buildLesson } from '../server/lesson/agent.ts';
import { checkSlide, markSlide } from '../server/lesson/slide-check.ts';
import type { Slide } from '../server/lesson/types.ts';
import { intake } from '../server/lesson/writer.ts';

const MATH = await readFile(new URL('../samples/toan-lop2-cong-co-nho.txt', import.meta.url), 'utf8');
const ENG = await readFile(new URL('../samples/tieng-anh-lop3-colours.txt', import.meta.url), 'utf8');
const kinds = (heading: string, bullets: string[], example?: string) => checkSlide({ heading, bullets, example }).map((i) => i.kind);

test("slide check: Chi's two slides are flagged", () => {
  // slide 9: no number is greater than 60 and smaller than 50, and the content says 50 to 60
  const s9 = checkSlide({ heading: 'Ví dụ: Số lớn hơn 60, bé hơn 50', bullets: ['Tìm một số lớn hơn 50 và bé hơn 60.'], example: 'a number greater than 50 and smaller than 60' });
  assert.ok(s9.length && s9.every((i) => i.kind === 'heading'), JSON.stringify(s9));
  assert.ok(s9.some((i) => /no number/.test(i.detail)));
  assert.deepEqual(kinds('Ví dụ: Số lớn hơn 60, bé hơn 70', ['Tìm số lớn hơn 50 và bé hơn 60.']), ['heading', 'heading'], 'bounds that differ from the content');
  // slide 6: "57 và 87 = 80 + 7" leaves it unclear what equals what
  assert.deepEqual(kinds('Ví dụ: 57 và 87 = 80 + 7', ['87 gồm 8 chục và 7 đơn vị.'], '87 = 80 + 7'), ['math']);
});

test('slide check: correct slides are not flagged', () => {
  const good: [string, string[], string?][] = [
    ['Ví dụ', ['Cộng hàng đơn vị: 6 cộng 7 bằng 13, viết 3 nhớ 1.', 'Cộng hàng chục: 3 cộng 2 bằng 5, thêm 1 là 6.', 'Vậy 36 + 27 = 63.'], '36 + 27 = 63'],
    ['Ví dụ 2', ['Ví dụ 2: 48 + 25 = 73.', 'Luyện tập: 19 + 36; 57 + 28; 44 + 39.'], '57 + 28 = 85'],
    ['Phép trừ 52 − 28', ['52 − 28 = 24', '12 : 3 = 4', '17 : 5 = 3 (dư 2)', '3 x 4 = 12', '36 + 27 = 63 và 48 + 25 = 73', '52 trừ 28 bằng 24']],
    ['Số lớn hơn 50, bé hơn 60', ['Các số lớn hơn 50 và bé hơn 60 là 51, 52, 59.', '57 lớn hơn 50', '45 bé hơn 50'], 'a number greater than 50 and smaller than 60'],
    ['Numbers greater than 50 and less than 60', ['57 is greater than 50.', '6 plus 7 is 13', '3 more than 5 is 8', 'The number after 36 is 37'], '50 < 57 < 60'],
    ['Số lớn hơn 60 và số bé hơn 50', ['Số lớn hơn 60: 63, 70.', 'Số bé hơn 50: 45.']],
    // shown as a mistake, asked about, or not a plain sum: left alone
    ['Lỗi thường gặp', ['Quên nhớ 1: 36 + 27 = 53', 'Đúng hay sai: 36 + 27 = 53?', '36 + ? = 63', '1/2 + 1/2 = 1', '2,5 + 1 = 3,5', '1 000 + 2 000 = 3 000', 'x + 5 = 12', 'Children often take the smaller digit from the bigger one, for example writing 52 − 28 = 36.']],
    ['Chục và đơn vị', ['1 trăm = 10 chục', '1 chục = 10 đơn vị', '87 có 8 chục', 'Số 36 gồm 3 chục và 6 đơn vị'], '87 = 80 + 7'],
    ['Ki-lô-gam', ['Túi gạo nặng 5 kg.', '1 kg = 1000 g', '1 giờ = 60 phút'], '2 kg + 3 kg = 5 kg'],
    ['Đo độ dài', ['1 m = 10 dm', 'Thước dài 30 cm'], '2 m 5 cm'],
    ['Bài toán: 36 quả xoài', ['Lan có 36 quả xoài, mẹ cho thêm 27 quả.'], '36 + 27 = 63 (quả)'],
  ];
  for (const [h, b, e] of good) assert.deepEqual(checkSlide({ heading: h, bullets: b, example: e }), [], h);
});

test('slide check: a wrong sum, a wrong comparison and a wrong place value are flagged', () => {
  assert.deepEqual(kinds('Ví dụ 2', ['Ví dụ 2: 48 + 25 = 73.'], '57 + 28 = 75'), ['math']);
  assert.deepEqual(kinds('Phép cộng 36 + 27 = 53', ['Lan có 36 quả.']), ['math'], 'a wrong sum in the title');
  assert.deepEqual(kinds('Phép trừ', ['52 − 28 = 34']), ['math'], 'a Unicode minus');
  assert.deepEqual(kinds('Bảng nhân 3', ['3 × 6 = 21']), ['math']);
  assert.deepEqual(kinds('Phép chia', ['12 : 5 = 2']), ['math'], 'a division that does not come out without a remainder');
  assert.deepEqual(kinds('Phép cộng', ['6 cộng 7 bằng 12']), ['math'], 'in words');
  assert.deepEqual(kinds('So sánh', ['57 > 75']), ['math']);
  assert.deepEqual(kinds('Chục và đơn vị', ['87 gồm 7 chục và 8 đơn vị']), ['math']);
});

test('slide check: a unit mismatch is flagged', () => {
  assert.ok(kinds('Bài toán: 5 kg đường', ['Mẹ mua 5 g đường.'], '5 g + 2 g = 7 g').every((k) => k === 'unit'));
  assert.deepEqual([...new Set(kinds('Lít: 5 l', ['Can có 5 ml nước.']))], ['unit']);
  assert.deepEqual(kinds('Bài toán: 36 quả xoài', ['Lan có 36 con xoài.']), ['unit']);
  assert.deepEqual(kinds('Đo độ dài', ['Bút chì dài 15 cm.'], 'Bút chì dài 15 m'), ['unit'], 'the example against the bullets');
});

test('slide check: the assigner\'s own new version clears the mark, or keeps "please check"', () => {
  const s: Slide = { id: 'sl09', kind: 'example', heading: 'Số lớn hơn 50, bé hơn 60', bullets: ['Tìm một số lớn hơn 50 và bé hơn 60.'], notes: '', source: '', narration: '', imagePrompt: '', flag: { fixed: true, vi: 'x', en: 'x' } };
  assert.equal(markSlide(s).flag, undefined);
  assert.equal(markSlide({ ...s, heading: 'Số lớn hơn 60, bé hơn 50' }).flag?.fixed, false);
});

test('lessons made from the samples have no marked slides (the check does not touch good slides)', async () => {
  for (const notes of [MATH, ENG]) {
    const ai = new MockProvider(), setup = await intake(ai, notes, 'vi');
    const b = await buildLesson(ai, setup, notes);
    assert.deepEqual(b.slides.filter((s) => s.flag).map((s) => [s.heading, s.bullets, s.example]), []);
  }
});

// The mock writes slide 3 with Chi's contradicting title; the rewrite (fixture.fix) is right, or not.
function contradicting(fixOk: boolean) {
  const ai = new MockProvider(), base = ai.answers.get('slides')!;
  const bad = { heading: 'Ví dụ: Số lớn hơn 60, bé hơn 50', bullets: ['Tìm một số lớn hơn 50 và bé hơn 60.'], example: '57' };
  ai.answers.set('slides', (r: JsonRequest) => {
    const f = r.fixture as { fix?: unknown; simplify?: Slide };
    if (f.fix) return { slides: [{ ...f.simplify, heading: fixOk ? 'Ví dụ: Số lớn hơn 50, bé hơn 60' : 'Ví dụ: Số lớn hơn 70, bé hơn 50' }] };
    const out = base(r) as { slides: Record<string, unknown>[] };
    if (out.slides.length > 3) out.slides[2] = { ...out.slides[2], ...bad };
    return out;
  });
  return ai;
}

test('while a lesson is made, a contradicting slide is written again and marked "fixed automatically"', async () => {
  const ai = contradicting(true), setup = await intake(ai, MATH, 'vi'), steps: { vi: string; en: string }[] = [];
  const b = await buildLesson(ai, setup, MATH, (vi, en) => { steps.push({ vi, en }); });
  const s = b.slides[2];
  assert.equal(s.heading, 'Ví dụ: Số lớn hơn 50, bé hơn 60');
  assert.deepEqual(checkSlide(s), []);
  assert.deepEqual(s.flag, { fixed: true, vi: 'tiêu đề không khớp nội dung', en: 'the title did not match the content' });
  assert.ok(steps.some((x) => x.vi === 'Slide 3: tiêu đề không khớp nội dung, viết lại.' && x.en === 'Slide 3: the title did not match the content, written again.'), JSON.stringify(steps));
  assert.ok(b.agent.changes.some((c) => /Slide 3: tiêu đề không khớp nội dung, đã viết lại/.test(c)));
  assert.equal(b.slides.filter((x) => x.flag).length, 1, 'only that slide');
});

test('a rewrite that is still wrong keeps the better version and reads "please check"', async () => {
  const ai = contradicting(false), setup = await intake(ai, MATH, 'vi'), steps: string[] = [];
  const b = await buildLesson(ai, setup, MATH, (vi) => { steps.push(vi); });
  const s = b.slides[2];
  assert.equal(s.flag?.fixed, false);
  assert.equal(s.flag?.vi, 'tiêu đề không khớp nội dung');
  assert.ok(checkSlide(s).length, 'still wrong');
  assert.ok(steps.some((x) => x === 'Slide 3: tiêu đề không khớp nội dung, cần xem lại.'), JSON.stringify(steps));
});

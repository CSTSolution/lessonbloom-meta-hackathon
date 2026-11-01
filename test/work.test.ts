// Chi #46: a lesson from a photo of the child's marked work is visibly hers. The sheet is read into a
// table (every question, what the child wrote, the right answer by code, the kind of mistake), kept in the
// child's profile (never Knowledge), counted in the summary, and a lesson made from it opens with her own
// mistakes and practises them first, labelled "Luyện lại từ bài con làm".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkItem, contextOf } from '../server/lesson/items.ts';
import { checkSlide } from '../server/lesson/slide-check.ts';
import type { Setup } from '../server/lesson/types.ts';
import { applyWork, forPrompt, greetOf, slipOf, readCalc, titled, typeWork } from '../server/lesson/work.ts';
import { areaWithBook, testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Chi's sheet of 31 Oct: add and subtract within 1000, 16 questions, 4 crossed wrong
const CHI = [
  { q: '655 - 367', child: '322', mark: 'wrong' }, { q: '245 + 615 ... 791', child: '=', mark: 'wrong' }, { q: '329 + 183', child: '999', mark: 'wrong' }, { q: '964 - 478', child: '499', mark: 'wrong' },
  ...['456 + 278=734', '512 - 245=267', '308 + 425=733', '700 - 356=344', '127 + 365=492', '843 - 518=325', '264 + 319=583', '935 - 647=288', '418 + 276=694', '621 - 384=237', '333 + 444=777'].map((s) => ({ q: s.split('=')[0], child: s.split('=')[1], mark: 'right' })),
  { q: '356 + 172 ... 530', child: '<', mark: 'right' },
];

test("Chi's sheet: totals, right answers by code and the kinds of mistake", () => {
  const w = typeWork({ questions: CHI }, { child: 'MAI', date: '2026-10-31' });
  assert.deepEqual([w.total, w.right, w.wrong], [16, 12, 4]);
  assert.deepEqual(w.questions.filter((q) => !q.ok).map((q) => [q.right, q.kind]), [['288', 'sub_borrow'], ['>', 'compare'], ['512', 'add_carry'], ['486', 'sub_borrow']]);
  assert.deepEqual(w.types.map((t) => [t.label.en, t.count]), [['Subtraction with borrowing', 2], ['Comparing after adding', 1], ['Addition with carrying', 1]]);
  assert.deepEqual(w.types.map((t) => t.label.vi), ['Phép trừ có nhớ', 'So sánh sau khi cộng', 'Phép cộng có nhớ']);
  // the adult's mark comes first; a mark the sum does not agree with is flagged, not overruled
  const odd = typeWork({ questions: [{ q: '36 + 27', child: '63', mark: 'wrong' }] });
  assert.equal(odd.questions[0].ok, false); assert.equal(odd.questions[0].unsure, true);
  // no mark: code decides
  assert.equal(typeWork({ questions: [{ q: '36 + 27', child: '53', mark: 'none' }] }).wrong, 1);
  assert.equal(slipOf(readCalc('36 + 27')!, '53')?.vi, 'Quên nhớ 1 sang hàng chục');
  assert.equal(slipOf(readCalc('52 − 28')!, '34')?.en, 'Forgot the borrowed 1 in the tens');
  assert.deepEqual(readCalc('? + 25 = 60'), { a: 0, op: '+', b: 25, c: 60, blank: 'a' });
  assert.equal(titled('Luyện tập chung', w, 'vi', true), 'Luyện tập chung · Soạn riêng cho MAI · từ bài làm ngày 31/10');
  assert.equal(titled('Review', { date: '2026-10-31' }, 'en', true), "Review · Made from your child's work of 31/10");
  assert.equal(greetOf(w)?.vi, 'Hôm trước con còn vướng phép trừ có nhớ và so sánh sau khi cộng, hôm nay mình luyện lại nhé.');
});

test('the lesson opens with her own wrong sums and practises them first', () => {
  const w = typeWork({ questions: CHI }, { child: 'MAI', date: '2026-10-31' });
  const source = 'Luyện tập chung: phép cộng, phép trừ trong phạm vi 1000\nĐặt tính rồi tính: 456 + 278; 512 − 245. Điền dấu >, <, =: 245 + 615 ... 791.';
  const setup = { subject: 'math', grade: 2, title: 'Luyện tập chung', objectives: [], minutes: 25, lang: 'vi', forParent: true, work: { ...w, base: 'Luyện tập chung' } } as Setup;
  const skills = [{ tag: 'tru_co_nho', name: 'Trừ có nhớ', kind: 'sub_borrow' as const }, { tag: 'dat_tinh', name: 'Đặt tính', kind: 'column' as const }];
  const book = Array.from({ length: 8 }, (_, i) => ({ id: `ex${i + 1}`, subject: 'math' as const, template: 'column' as const, skill: 'dat_tinh', level: 'basic' as const, a: 412 + i, op: '+' as const, b: 135, prompt: `Đặt tính rồi tính: ${412 + i} + 135`, explain: 'x', answer: String(547 + i) }));
  const r = applyWork(setup, source, { skills, slides: [{ id: 'sl01', kind: 'title', heading: 'Luyện tập chung', bullets: [], notes: '', source: '', narration: '', imagePrompt: '' }], items: book });
  const open = r.slides[1];
  assert.equal(open.heading, 'Hôm nay ôn lại điều con còn vướng');
  assert.ok(open.fromWork && open.bullets[0].includes('655 − 367') && open.bullets.some((b) => b.includes('329 + 183')), open.bullets.join(' | '));
  assert.deepEqual(checkSlide(open), [], 'the slide passes the code check of its sums');
  assert.equal(r.outPart.length, 0);
  const fromWork = r.items.filter((i) => i.fromWork);
  assert.ok(fromWork.length >= 8 && r.items.slice(0, fromWork.length).every((i) => i.fromWork), 'her items come first');
  assert.ok(fromWork.length / r.items.length >= 0.65, `weighted to her mistakes: ${fromWork.length}/${r.items.length}`);
  assert.ok(r.items.filter((i) => !i.fromWork).length <= 4, 'the skill she got right keeps only a few');
  assert.ok(fromWork.some((i) => i.prompt.includes('655 − 367')) && fromWork.some((i) => i.prompt === 'Đúng hay sai? 245 + 615 = 791' && i.answer === 'false'));
  for (const it of r.items) assert.deepEqual(checkItem(it, { ...contextOf(setup, r.skills, source), items: r.items }).filter((x) => x.code !== 'dup'), [], it.prompt);
  // no name and no "Made for" in what a model sees
  const seen = JSON.stringify(forPrompt({ ...setup, title: titled('Luyện tập chung', w, 'vi', true) }));
  assert.ok(!seen.includes('MAI') && !seen.includes('Soạn riêng'), seen.slice(0, 200));
});

test('from the photo to her profile, her lesson, her page and the summary', async () => {
  const s = await testServer(), call = s.client('198.51.100.140');
  await call('POST', '/api/auth/demo');
  await call('POST', '/api/t/role', { role: 'parent', name: 'Mẹ Na', children: [{ name: 'Na', grade: 2 }] });
  const { areaId } = await areaWithBook(call, 'toan2');
  const photo = { images: [{ type: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64') }] };
  // a sheet that cannot be read is said so, never an ordinary lesson
  const keep = s.ai.answers.get('work')!;
  s.ai.answers.set('work', () => ({ usable: false, topic: '', questions: [], mistakes: [] }));
  const bad = await call('POST', '/api/t/notes/work', photo);
  assert.equal(bad.status, 422); assert.equal(bad.json.code, 'workUnread'); assert.match(bad.json.error, /chưa đọc được/);
  s.ai.answers.set('work', keep);
  const r = (await call('POST', '/api/t/notes/work', photo)).json;
  assert.deepEqual([r.work.total, r.work.right, r.work.wrong], [16, 12, 4]);
  assert.match(r.focus, /nhớ 1/);
  // she corrects one misread answer, code types the table again
  const fixed = (await call('POST', '/api/t/notes/work/check', { work: { ...r.work, questions: r.work.questions.map((q: any, i: number) => (i === 4 ? { ...q, child: '72', mark: 'wrong' } : q)) } })).json.work;
  assert.equal(fixed.wrong, 5);
  const na = (await call('GET', '/api/t/learners')).json.learners[0];
  const rec = (await call('POST', `/api/t/pupils/${na.id}/work`, { work: r.work })).json.record;
  assert.equal(rec.child, 'Na'); assert.equal(rec.wrong, 4);
  assert.equal((await call('GET', `/api/t/pupils/${na.id}/work`)).json.records.length, 1);
  // the summary counts it like practice in the app
  const d = (await call('GET', `/api/t/pupils/${na.id}`)).json;
  assert.ok(d.skills.some((k: any) => k.name === 'Phép trừ có nhớ' && k.of > 0 && k.mistake), JSON.stringify(d.skills));
  // a lesson from it, on the part about subtraction with borrowing
  const sec = (await call('GET', `/api/t/areas/${areaId}`)).json.sections.find((x: any) => /trừ có nhớ/i.test(x.title));
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: sec.id })).json;
  const prompts: string[] = [], json = s.ai.json.bind(s.ai), chat = s.ai.chat.bind(s.ai);
  s.ai.json = async (q: any) => { prompts.push(q.system + q.prompt); return json(q); };
  s.ai.chat = async (q: any) => { prompts.push(JSON.stringify(q.messages)); return chat(q); };
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: sec.id, request: r.request, setup: { ...setup, work: { ...rec, child: 'Someone else' } } })).json;
  let l: any;
  for (let i = 0; i < 400; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working') break; await wait(20); }
  assert.equal(l.status, 'ready');
  assert.match(l.setup.title, /Soạn riêng cho Na · từ bài làm ngày \d\d\/\d\d$/, 'her name from her own record, not the browser');
  assert.ok(prompts.length && prompts.every((p) => !p.includes('Na ·') && !p.includes('Soạn riêng')), 'no name reaches a model');
  const open = l.slides.find((x: any) => x.fromWork);
  assert.ok(open && l.slides.indexOf(open) <= 1 && open.bullets[0].includes('52 − 28'), JSON.stringify(open));
  const mine = l.items.filter((i: any) => i.fromWork);
  assert.ok(mine.length >= 6 && l.items[0].fromWork && mine.length / l.items.length >= 0.6, l.items.map((i: any) => i.prompt).join(' | '));
  assert.match(l.agent.note, /chưa luyện|không dạy/, 'the kinds this part does not teach are said so');
  // her page: the greeting and the label
  const k = (await call('GET', '/api/t/classes')).json.classes[0];
  await call('POST', `/api/t/lessons/${id}/assign`, { classId: k.id, confirmed: true });
  const kid = (await call('GET', `/api/t/classes/${k.id}`)).json.pupils[0], phone = s.client('198.51.100.141');
  await phone('POST', '/api/p/link', { link: kid.link });
  const today = (await phone('GET', '/api/p/today')).json.lessons[0];
  assert.match(today.greet.vi, /^Hôm trước con còn vướng phép trừ có nhớ/);
  const pl = (await phone('GET', `/api/p/a/${today.id}`)).json.lesson;
  assert.ok(pl.items[0].fromWork);
});

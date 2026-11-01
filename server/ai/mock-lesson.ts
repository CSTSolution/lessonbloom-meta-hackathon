// The mock's answers for making a lesson: what Muse Spark and Muse Wonder would return, built from the
// teacher's notes so the app runs end to end offline. One planted mistake (a sum that does not carry,
// tagged as a carrying skill) shows the code checks rejecting an item and the agent asking again.
import type { ChatMsg, ChatTurn, JsonRequest } from './types.ts';

type F = Record<string, any>;
const sentences = (t: string) => (t.replace(/\[tr\. \d+\]/g, ' ').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);
const COLOURS: Record<string, string> = { red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', orange: '🟠', purple: '🟣', black: '⚫', white: '⚪', brown: '🟤', pink: '🌸' };

export function isEnglish(notes: string) { const head = notes.slice(0, 300); return !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(head) && /\b(the|and|is|lesson|unit|english|colou?r|add|subtract)\b/i.test(head); }

function plan(setup: F, count: number) {
  const sub = /trừ|subtract/i.test(String(setup.title)), plain = /không nhớ|without regrouping/i.test(String(setup.title)), en = setup.lang === 'en', n = /1[ .,]?000(?!\d)/.test(String(setup.title)) ? 1000 : 100;
  const skills = setup.subject === 'english'
    ? [{ tag: 'colour_words', name: 'Colour words', kind: 'vocabulary' }, { tag: 'what_colour', name: "Asking 'What colour is it?'", kind: 'sentence_pattern' }]
    : sub ? [{ tag: plain ? 'tru_khong_nho' : 'tru_co_nho', name: en ? (plain ? 'Subtracting without regrouping' : `Subtracting with regrouping within ${n}`) : plain ? 'Trừ không nhớ' : `Trừ có nhớ trong phạm vi ${n}`, kind: plain ? 'sub_no_borrow' : 'sub_borrow' }, { tag: 'dat_tinh', name: en ? 'Column subtraction' : 'Đặt tính rồi tính', kind: 'column' }]
      : [{ tag: 'cong_co_nho', name: en ? `Adding with regrouping within ${n}` : `Cộng có nhớ trong phạm vi ${n}`, kind: 'add_carry' }, { tag: 'toan_loi_van', name: en ? 'Word problems' : 'Bài toán có lời văn', kind: 'word_problem' }];
  const kinds = ['title', 'warmup', ...Array(Math.max(0, count - 4)).fill(0).map((_, i) => (i % 2 ? 'example' : 'teach')), 'practice', 'summary'];
  return { skills, outline: kinds.map((kind, i) => ({ kind, heading: `${kind === 'title' ? setup.title : `${en ? 'Part' : 'Phần'} ${i}`}`, objective: setup.objectives?.[i % Math.max(1, setup.objectives?.length || 1)] || '' })) };
}

function mathItems(f: F) {
  const { skill, template, level, count, round } = f, k = skill.kind as string, out: F[] = [], en = f.setup.lang === 'en';
  // a section within 1000 gets its 3-digit numbers (Chi #47); a column skill mixes with and without regrouping
  const big = /(?:phạm vi|within)\s+1[ .,]?000(?!\d)/i.test(`${f.source}\n${f.setup.title}`), plainCol = (i: number) => big && k === 'column' && i % 2 === 1;
  if (/^sub_|column/.test(k) && /trừ|subtract/i.test(String(f.setup.title))) {        // subtraction sections: 52 − 28 and friends
    return { items: Array.from({ length: count }, (_, i) => {
      const plain = k === 'sub_no_borrow' || plainCol(i);
      const a = big ? (plain ? 658 : 652) + i * 10 + (level === 'advanced' ? 200 : 0) : 52 + i * 10 + (level === 'advanced' ? 20 : 0) - (plain ? -6 : 0), b = big ? (plain ? 234 : 287) : plain ? 23 : 28, r = a - b;
      return template === 'fill' || template === 'column' ? { a, op: '-', b, blank: 'result', explain: `${a} − ${b} = ${r}.` }
        : template === 'truefalse' ? { a, op: '-', b, shown: i % 2 ? r : r + 10, explain: `${a} − ${b} = ${r}.` }
        : { a, op: '-', b, distractors: [r + 10, r - 1], explain: en ? `Take 1 ten: ${a} − ${b} = ${r}.` : `Mượn 1 chục: ${a} − ${b} = ${r}.` };
    }) };
  }
  for (let i = 0; i < count; i++) {
    const a = big ? (plainCol(i) ? 432 : 436) + i * 10 + (level === 'advanced' ? 100 : 0) : 36 + i + (level === 'advanced' ? 10 : 0), b = big ? (plainCol(i) ? 215 : 278) : 27, r = a + b;
    if (k === 'add_carry' && template === 'mcq' && level === 'basic' && round === 0 && i === 0) { out.push(big ? { a: 312, op: '+', b: 221, distractors: [433, 633], explain: '2 + 1 = 3; 1 + 2 = 3; 3 + 2 = 5.' } : { a: 31, op: '+', b: 22, distractors: [43, 63], explain: '1 + 2 = 3; 3 + 2 = 5.' }); continue; }   // no carrying: rejected (Q)
    if ((template === 'word' || k === 'word_problem') && en) out.push({ a, op: '+', b, story: `Mia has ${a} apples. Her mum gives her ${b} more apples. How many apples does Mia have in all?`, unit: 'apples', explain: `${a} + ${b} = ${r} (apples).` });
    else if (template === 'word' || k === 'word_problem') out.push({ a, op: '+', b, story: `Lan có ${a} quả xoài, mẹ cho thêm ${b} quả xoài. Hỏi Lan có tất cả bao nhiêu quả xoài?`, unit: 'quả xoài', explain: `${a} + ${b} = ${r} (quả xoài).` });
    else if (template === 'fill' || template === 'column') out.push({ a, op: '+', b, blank: 'result', explain: en ? `${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}: write ${((a % 10) + (b % 10)) % 10}, carry 1.` : `${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}, viết ${((a % 10) + (b % 10)) % 10} nhớ 1.` });
    else if (template === 'truefalse') out.push({ a, op: '+', b, shown: i % 2 ? r : r - 10, explain: `${a} + ${b} = ${r}.` });
    else out.push({ a, op: '+', b, distractors: [r - 10, r + 1], explain: en ? `Add the ones, carry 1 to the tens: ${a} + ${b} = ${r}.` : `Cộng hàng đơn vị, nhớ 1 sang hàng chục: ${a} + ${b} = ${r}.` });
  }
  return { items: out };
}

function englishItems(f: F) {
  const { template, count, setup, source } = f, en = setup.lang === 'en';
  const colours = Object.keys(COLOURS).filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(source));
  const pick = (i: number) => colours[i % Math.max(1, colours.length)] || 'red';
  const out: F[] = [];
  for (let i = 0; i < count; i++) {
    if (template === 'match') out.push({ prompt: en ? 'Match each word to its picture.' : 'Nối mỗi từ với hình đúng.', pairs: [0, 1, 2].map((j) => ({ word: pick(i + j), emoji: COLOURS[pick(i + j)] })), explain: en ? 'Say each colour aloud.' : 'Đọc to tên từng màu.' });
    else if (template === 'fill') out.push({ prompt: en ? 'Choose the missing word.' : 'Chọn từ còn thiếu.', sentence: 'What colour ___ it?', options: ['is', 'are', 'am'], answer: 'is', explain: en ? '"it" goes with "is".' : '"it" đi với "is".' });
    else if (template === 'listen') out.push({ prompt: en ? 'Listen and choose the right word.' : 'Nghe và chọn từ đúng.', say: pick(i), options: [pick(i), pick(i + 1), pick(i + 2)], answer: pick(i), explain: en ? 'Listen to the first sound.' : 'Nghe âm đầu của từ.' });
    else out.push({ prompt: en ? 'Put the words in order.' : 'Sắp xếp các từ thành câu.', words: ['colour', 'is', 'favourite', 'My', pick(i)], answer: `My favourite colour is ${pick(i)}.`, explain: en ? 'A sentence about your favourite colour.' : 'Câu nói về màu em thích.' });
  }
  return { items: out };
}

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const STOPW = new Set(['bai', 'cua', 'va', 'cac', 'cho', 'the', 'and', 'trong', 'mot', 'hoc', 'lesson', 'unit', 'tim', 'day', 'con', 'em', 'phep', 'tinh', 'pham', 'vi']);

export const lessonAnswers: [string, (r: JsonRequest) => unknown][] = [
  // the re-rank: the section most of whose words the request uses; "found" only when most request words are there
  ['rerank', (r) => {
    const f = r.fixture as F, want = [...new Set((fold(f.request).match(/[a-z0-9]+/g) || []).filter((w: string) => (w.length > 2 || /\d/.test(w)) && !STOPW.has(w)))];
    const bySection = new Map<string, F[]>();
    for (const c of f.candidates) bySection.set(c.section_id, [...(bySection.get(c.section_id) || []), c]);
    let best: [string, number] = ['', 0];
    for (const [sid, cs] of bySection) { const all = fold(cs.map((c: F) => `${c.section} ${c.text}`).join(' ')); const cov = want.filter((w) => new RegExp(`\\b${w}\\b`).test(all)).length / Math.max(1, want.length); if (cov > best[1]) best = [sid, cov]; }
    if (best[1] < 0.6) return { found: false, cited: [], reason: 'not in these books' };
    const cited = bySection.get(best[0])!.slice(0, 3).map((c: F) => ({ id: c.id, quote: c.text.split(/\s+/).slice(0, 12).join(' ') }));
    return { found: true, section_id: best[0], cited, reason: 'the section teaches this' };
  }],
  ['comments', (r) => (r.fixture as F).advice ? { cards: ((r.fixture as F).advice as F[]).map((x) => ({ kind: x.kind, text: `✎ ${x.decision}` })) } : ({ comments: Array.from({ length: (r.fixture as F).who }, (_, i) => ({ who: `Em ${i + 1}`, text: `Em ${i + 1} đã vững cách đặt tính, đang luyện nhớ 1 sang hàng chục.` })) })],
  ['toc', (r) => (r.fixture as F).topics ? { parts: ((r.fixture as F).topics as string[]).map((id) => ({ id, topic: 'Số và phép tính' })) } : ({ sections: Array.from({ length: (r.fixture as F).pages }, (_, i) => ({ title: `Trang ${i + 1}`, page: i + 1 })) })],
  ['intake', (r) => {
    const notes = String((r.fixture as F).notes), english = isEnglish(notes);
    const grade = Number(/lớp\s*(\d)|grade\s*(\d)/i.exec(notes)?.slice(1).find(Boolean) || 2);
    return { usable: notes.replace(/[^\p{L}]/gu, '').length > 20, subject: english ? 'english' : 'math', grade, title: (notes.split('\n')[0] || 'Bài học').split(/[–:]/).pop()!.replace(/[.]$/, '').trim().slice(0, 60),
      objectives: english ? (/\d\s*[+−-]\s*\d/.test(notes) ? ['Add two-digit numbers, carrying 1 to the tens.', 'Solve a one-step word problem.'] : ['Name six colours.', 'Ask and answer "What colour is it?".']) : ['Cộng có nhớ hai số có hai chữ số.', 'Giải bài toán có lời văn một bước.'], minutes: 25, lang: english ? 'en' : 'vi' };
  }],
  // a marked review sheet like Chi's (#46), within 100 like the sample book: 16 questions, 4 crossed wrong
  ['work', () => ({ usable: true, topic: 'Ôn tập phép cộng có nhớ, phép trừ có nhớ trong phạm vi 100', kind: 'sub_borrow', mistakes: ['Quên nhớ 1 sang hàng chục (36 + 27 = 53)'],
    questions: [['52 - 28', '34', 'wrong'], ['45 + 37 ... 81', '<', 'wrong'], ['36 + 27', '53', 'wrong'], ['71 - 46', '35', 'wrong'], ['48 + 25', '73'], ['19 + 36', '55'], ['57 + 28', '85'], ['64 + 18', '82'],
      ['43 - 17', '26'], ['60 - 24', '36'], ['35 + 42', '77'], ['86 - 53', '33'], ['27 + 15', '42'], ['90 - 45', '45'], ['38 + 44 ... 80', '>'], ['73 - 38', '35']].map(([q, child, mark = 'right']) => ({ q, child, mark })) })],
  // one page of a scanned book or a photo of a page (fixture.page), or the photos of a lesson (fixture.photos)
  ['ocr', (r) => (r.fixture as { page?: number }).page ? { usable: true, text: `Lesson ${(r.fixture as { page: number }).page}: Adding within 100\nMia has 36 apples and gets 27 more. 36 + 27 = 63.\nPractice: 48 + 25; 19 + 36.` } : ({ usable: true, text: Array.from({ length: (r.fixture as F).photos }, (_, i) => `Trang ${i + 1}: Phép cộng có nhớ trong phạm vi 100. Ví dụ: 36 + 27 = 63. Luyện tập: 48 + 25; 19 + 36.`).join('\n') })],
  ['plan', (r) => plan((r.fixture as F).setup, (r.fixture as F).count)],
  ['slides', (r) => {
    const f = r.fixture as F;
    if (f.simplify) return { slides: [{ ...f.simplify, bullets: f.simplify.bullets.map((b: string) => b.split(' ').slice(0, 8).join(' ')) }] };
    const s = sentences(f.source);
    return { slides: f.outline.map((o: F, i: number) => ({ kind: o.kind, heading: o.kind === 'title' ? f.setup.title : (s[i % s.length] || '').split(/[,:]/)[0].slice(0, 50), bullets: [(s[(i + 1) % s.length] || '').slice(0, 70)],
      example: o.kind === 'example' && f.setup.subject === 'math' ? '36 + 27 = 63' : undefined, notes: f.setup.lang === 'en' ? 'Ask the class first, then explain.' : 'Cô hỏi cả lớp trước rồi mới giải thích.', source: s[i % s.length] || '', narration: s[i % s.length] || '', imagePrompt: 'children counting fruit in a school yard, no text' })) };
  }],
  // the picture check: the first picture of slide 2 has "text" in it, so the redraw path runs
  ['critic', (r) => ((r.fixture as F).slide === 'sl02' && (r.fixture as F).attempt === 1
    ? { hasText: true, unsafe: false, offTopic: false, broken: false, score: 3, revisedPrompt: 'the same scene with no writing anywhere' }
    : { hasText: false, unsafe: false, offTopic: false, broken: false, score: 8 })],
  // the AI second review: nothing wrong (a test sets its own answer to see items dropped)
  ['check', () => ({ flags: [] })],
  ['items', (r) => ((r.fixture as F).setup.subject === 'math' ? mathItems(r.fixture as F) : englishItems(r.fixture as F))],
  ['cards', (r) => ((r.fixture as F).setup.subject === 'math'
    ? { cards: [['36 + 27', '63'], ['48 + 25', '73'], ['19 + 36', '55'], ['57 + 28', '85']].map(([front, back]) => ({ front, back })) }
    : { cards: Object.keys(COLOURS).filter((c) => (r.fixture as F).source.toLowerCase().includes(c)).slice(0, 6).map((c) => ({ front: c, back: c, emoji: COLOURS[c], say: c })) })],
];

// The agent's script: plan, slides, practice for every skill and level, cards, review, finish.
export function lessonAgentTurn(messages: ChatMsg[]): ChatTurn {
  const first = messages.find((m) => m.role === 'user')?.content || '';
  const { SETUP: setup, BOOK_SECTION: notes } = JSON.parse(first.replace(/^<user_input>\n|\n<\/user_input>$/g, ''));
  const done = messages.flatMap((m) => (m.role === 'assistant' ? m.toolCalls || [] : [])).map((c) => c.name);
  const p = plan(setup, setup.minutes <= 15 ? 7 : setup.minutes <= 25 ? 9 : 11);
  const t = setup.subject === 'math' ? ['mcq', 'word', 'fill'] : ['match', 'fill', 'order'];
  const work: [string, object][] = [
    ['save_plan', p], ['write_slides', {}],
    ...p.skills.flatMap((s, i) => [['write_items', { skill: s.tag, template: s.kind === 'word_problem' ? 'word' : t[0], level: 'basic', count: 3 }], ['write_items', { skill: s.tag, template: s.kind === 'word_problem' ? 'word' : t[1], level: 'good', count: 3 }],
      ...(i === 0 ? [['write_items', { skill: s.tag, template: t[2], level: 'advanced', count: 2 }]] : [])] as [string, object][]),
    ['write_cards', {}], ['review', {}],
    ['finish', { note: setup.lang === 'en' ? `I planned ${p.skills.length} skills, wrote the slides and practice from the section of your book, and checked every item. One item was rejected by the checker and written again.` : `Trợ lý đã lập ${p.skills.length} dạng bài, soạn slide và bài luyện tập từ phần bài trong sách của cô, và kiểm tra từng câu. Một câu bị bộ kiểm tra loại và đã được soạn lại.`, changes: [] }],
  ];
  void notes;
  const next = work[done.length];
  return next ? { model: 'mock', text: '', toolCalls: [{ id: `t${done.length}`, name: next[0], args: JSON.stringify(next[1]) }] } : { model: 'mock', text: 'Done.', toolCalls: [] };
}

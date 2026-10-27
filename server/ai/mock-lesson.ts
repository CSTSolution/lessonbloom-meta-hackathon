// The mock's answers for making a lesson: what Muse Spark and Muse Wonder would return, built from the
// teacher's notes so the app runs end to end offline. One planted mistake (a sum that does not carry,
// tagged as a carrying skill) shows the code checks rejecting an item and the agent asking again.
import type { ChatMsg, ChatTurn, JsonRequest } from './types.ts';

type F = Record<string, any>;
const sentences = (t: string) => (t.replace(/\[tr\. \d+\]/g, ' ').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);
const COLOURS: Record<string, string> = { red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', orange: '🟠', purple: '🟣', black: '⚫', white: '⚪', brown: '🟤', pink: '🌸' };

export function isEnglish(notes: string) { return /\b(english|colou?r|grade \d|unit \d)\b/i.test(notes.slice(0, 200)) && !/[ăâđêôơư]/i.test(notes.slice(0, 120)); }

function plan(setup: F, count: number) {
  const sub = /trừ/i.test(String(setup.title)), plain = /không nhớ/i.test(String(setup.title));
  const skills = setup.subject === 'english'
    ? [{ tag: 'colour_words', name: 'Colour words', kind: 'vocabulary' }, { tag: 'what_colour', name: "Asking 'What colour is it?'", kind: 'sentence_pattern' }]
    : sub ? [{ tag: plain ? 'tru_khong_nho' : 'tru_co_nho', name: plain ? 'Trừ không nhớ' : 'Trừ có nhớ trong phạm vi 100', kind: plain ? 'sub_no_borrow' : 'sub_borrow' }, { tag: 'dat_tinh', name: 'Đặt tính rồi tính', kind: 'column' }]
      : [{ tag: 'cong_co_nho', name: 'Cộng có nhớ trong phạm vi 100', kind: 'add_carry' }, { tag: 'toan_loi_van', name: 'Bài toán có lời văn', kind: 'word_problem' }];
  const kinds = ['title', 'warmup', ...Array(Math.max(0, count - 4)).fill(0).map((_, i) => (i % 2 ? 'example' : 'teach')), 'practice', 'summary'];
  return { skills, outline: kinds.map((kind, i) => ({ kind, heading: `${kind === 'title' ? setup.title : `Phần ${i}`}`, objective: setup.objectives?.[i % Math.max(1, setup.objectives?.length || 1)] || '' })) };
}

function mathItems(f: F) {
  const { skill, template, level, count, round } = f, k = skill.kind as string, out: F[] = [];
  if (/^sub_|column/.test(k) && /trừ/i.test(String(f.setup.title))) {        // subtraction sections: 52 − 28 and friends
    return { items: Array.from({ length: count }, (_, i) => {
      const a = 52 + i * 10 + (level === 'advanced' ? 20 : 0) - (k === 'sub_no_borrow' ? -6 : 0), b = k === 'sub_no_borrow' ? 23 : 28, r = a - b;
      return template === 'fill' ? { a, op: '-', b, blank: 'result', explain: `${a} − ${b} = ${r}.` }
        : template === 'truefalse' ? { a, op: '-', b, shown: i % 2 ? r : r + 10, explain: `${a} − ${b} = ${r}.` }
        : { a, op: '-', b, distractors: [r + 10, r - 1], explain: `Mượn 1 chục: ${a} − ${b} = ${r}.` };
    }) };
  }
  for (let i = 0; i < count; i++) {
    const a = 36 + i + (level === 'advanced' ? 10 : 0), b = 27, r = a + b;
    if (k === 'add_carry' && template === 'mcq' && level === 'basic' && round === 0 && i === 0) { out.push({ a: 31, op: '+', b: 22, distractors: [43, 63], explain: '1 + 2 = 3; 3 + 2 = 5.' }); continue; }   // no carrying: rejected (Q)
    if (template === 'word' || k === 'word_problem') out.push({ a, op: '+', b, story: `Lan có ${a} quả xoài, mẹ cho thêm ${b} quả xoài. Hỏi Lan có tất cả bao nhiêu quả xoài?`, unit: 'quả xoài', explain: `${a} + ${b} = ${r} (quả xoài).` });
    else if (template === 'fill') out.push({ a, op: '+', b, blank: 'result', explain: `${a % 10} + 7 = ${(a % 10) + 7}, viết ${((a % 10) + 7) % 10} nhớ 1.` });
    else if (template === 'truefalse') out.push({ a, op: '+', b, shown: i % 2 ? r : r - 10, explain: `${a} + ${b} = ${r}.` });
    else out.push({ a, op: '+', b, distractors: [r - 10, r + 1], explain: `Cộng hàng đơn vị, nhớ 1 sang hàng chục: ${a} + ${b} = ${r}.` });
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
  ['toc', (r) => ({ sections: Array.from({ length: (r.fixture as F).pages }, (_, i) => ({ title: `Trang ${i + 1}`, page: i + 1 })) })],
  ['intake', (r) => {
    const notes = String((r.fixture as F).notes), english = isEnglish(notes);
    const grade = Number(/lớp\s*(\d)|grade\s*(\d)/i.exec(notes)?.slice(1).find(Boolean) || 2);
    return { usable: notes.replace(/[^\p{L}]/gu, '').length > 20, subject: english ? 'english' : 'math', grade, title: (notes.split('\n')[0] || 'Bài học').split(/[–:]/).pop()!.replace(/[.]$/, '').trim().slice(0, 60),
      objectives: english ? ['Name six colours.', 'Ask and answer "What colour is it?".'] : ['Cộng có nhớ hai số có hai chữ số.', 'Giải bài toán có lời văn một bước.'], minutes: 25, lang: english ? 'en' : 'vi' };
  }],
  ['ocr', (r) => ({ usable: true, text: Array.from({ length: (r.fixture as F).photos }, (_, i) => `Trang ${i + 1}: Phép cộng có nhớ trong phạm vi 100. Ví dụ: 36 + 27 = 63. Luyện tập: 48 + 25; 19 + 36.`).join('\n') })],
  ['plan', (r) => plan((r.fixture as F).setup, (r.fixture as F).count)],
  ['slides', (r) => {
    const f = r.fixture as F;
    if (f.simplify) return { slides: [{ ...f.simplify, bullets: f.simplify.bullets.map((b: string) => b.split(' ').slice(0, 8).join(' ')) }] };
    const s = sentences(f.source);
    return { slides: f.outline.map((o: F, i: number) => ({ kind: o.kind, heading: o.kind === 'title' ? f.setup.title : (s[i % s.length] || '').split(/[,:]/)[0].slice(0, 50), bullets: [(s[(i + 1) % s.length] || '').slice(0, 70)],
      example: o.kind === 'example' && f.setup.subject === 'math' ? '36 + 27 = 63' : undefined, notes: 'Cô hỏi cả lớp trước rồi mới giải thích.', source: s[i % s.length] || '', narration: s[i % s.length] || '', imagePrompt: 'children counting mangoes in a school yard, no text' })) };
  }],
  // the picture check: the first picture of slide 2 has "text" in it, so the redraw path runs
  ['critic', (r) => ((r.fixture as F).slide === 'sl02' && (r.fixture as F).attempt === 1
    ? { hasText: true, unsafe: false, offTopic: false, broken: false, score: 3, revisedPrompt: 'the same scene with no writing anywhere' }
    : { hasText: false, unsafe: false, offTopic: false, broken: false, score: 8 })],
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

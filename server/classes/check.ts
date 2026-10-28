// A pupil's answer, checked on the server against the answer code worked out (pupils never receive it),
// and the item as a pupil may see it: no answer, no explanation, no words that are read aloud.
import type { Item } from '../lesson/types.ts';

const norm = (s: unknown) => String(s ?? '').normalize('NFC').toLowerCase().replace(/[“”"'’.!?,;:]/g, ' ').replace(/\s+/g, ' ').trim();
const pairsOf = (s: string) => new Set(String(s).split(',').map((p) => p.split('=').map(norm).join('=')).filter((p) => p.includes('=')));

export function isRight(it: Item, given: unknown): boolean {
  const g = String(given ?? '').slice(0, 500);
  if (it.subject === 'math') {
    if (it.template === 'truefalse') return norm(g) === it.answer;
    const n = Number(g.trim().replace(',', '.'));
    return g.trim() !== '' && Number.isFinite(n) && n === Number(it.answer);
  }
  if (it.template === 'match') { const a = pairsOf(it.answer), b = pairsOf(g); return a.size > 0 && a.size === b.size && [...a].every((p) => b.has(p)); }
  return norm(g) !== '' && norm(g) === norm(it.answer);
}

// The hint after a wrong answer: the explanation with the answer itself hidden, so it helps her think
// rather than giving it away (the whole explanation comes once she has it right).
export function hintOf(it: Item): string {
  const x = String(it.explain || '');
  // these explanations are the answer itself (the sentence, the pairs, the true result): no hint
  if (!x || it.template === 'match' || it.template === 'order' || it.template === 'truefalse') return '';
  const esc = it.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return x.replace(it.subject === 'math' ? new RegExp(`(?<!\\d)${esc}(?!\\d)`, 'g') : new RegExp(`(?<!\\p{L})${esc}(?!\\p{L})`, 'giu'), it.subject === 'math' ? '?' : '___');
}

// Deterministic shuffle, so a pupil sees the same order every time she opens the item.
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = [...seed].reduce((s, c) => (s * 33 + c.charCodeAt(0)) >>> 0, 11);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { h = (h * 1664525 + 1013904223) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export interface PupilItem { id: string; template: string; prompt: string; options?: string[]; sentence?: string; words?: string[]; left?: string[]; right?: string[]; unit?: string; listen?: boolean }
export function forPupil(it: Item): PupilItem {
  const out: PupilItem = { id: it.id, template: it.template, prompt: it.prompt };
  if (it.options?.length) out.options = it.options;
  if (it.subject === 'math') { if (it.template === 'word' && it.unit) out.unit = it.unit; return out; }
  if (it.sentence) out.sentence = it.sentence;
  if (it.template === 'order' && it.words) out.words = it.words;
  if (it.template === 'match' && it.pairs) { out.left = shuffle(it.pairs.map((p) => p.word), it.id + 'l'); out.right = shuffle(it.pairs.map((p) => p.emoji), it.id + 'r'); }
  if (it.template === 'listen') out.listen = true;
  return out;
}

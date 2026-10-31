// Add a source (Chi #41): the subject and grade are guessed from the file name (and the first page of a
// PDF read in the browser), not preset to Maths. Only Maths and English, grades 1-5, are supported, so
// anything else is left for her to choose. Pure, so a node test can import it.
export interface Guess { subject?: 'math' | 'english'; grade?: number }

// lower case, split on anything that is not a letter or a digit; "toán" keeps its accent so "toàn"
// (whole) is not taken for Maths, while a plain "toan" in a file name still is
const words = (s: string) => s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const plain = (w: string) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const MATH = new Set(['toán', 'toan', 'math', 'maths', 'mathematics']);
const GRADE_WORD = new Set(['lop', 'grade', 'class', 'year', 'khoi']), LANG_WORD = new Set(['tieng', 'anh', 'english', 'in', 'van', 'bang']);
const grade = (n: string) => { const g = Number(n); return /^\d{1,2}$/.test(n) && g >= 1 && g <= 5 ? g : undefined; };

function one(text: string): Guess {
  const w = words(text), p = w.map(plain), out: Guess = {};
  let math = -1, eng = -1;
  for (let i = 0; i < w.length; i++) {
    // "maths2", "toan2", "english3": the subject and the grade in one word
    const glued = /^(toán|toan|maths?|english)(\d{1,2})$/.exec(w[i]);
    if (glued) { if (/^(toán|toan|math)/.test(glued[1])) math = math < 0 ? i : math; else eng = eng < 0 ? i : eng; out.grade ??= grade(glued[2]); continue; }
    if (MATH.has(w[i]) && math < 0) math = i;
    if (eng < 0 && (w[i] === 'english' || (p[i] === 'tieng' && p[i + 1] === 'anh') || (p[i] === 'anh' && p[i + 1] === 'van'))) eng = i;
  }
  // a Maths book in English ("Toán tiếng Anh", "Maths in English") is still Maths
  if (math >= 0) out.subject = 'math'; else if (eng >= 0) out.subject = 'english';
  // the grade: said outright ("lớp 2", "grade 3", "lop2", "G2") ...
  for (let i = 0; i < w.length && out.grade === undefined; i++) {
    const g1 = /^(lop|grade|class|year|khoi)(\d{1,2})$/.exec(p[i]) || /^g(\d)$/.exec(p[i]);
    if (g1) out.grade = grade(g1[g1.length - 1]);
    else if (GRADE_WORD.has(p[i]) && w[i + 1]) out.grade = grade(w[i + 1]);
  }
  // ... or the number just after the subject ("Toán 2", "toan-2", "English 3", "Tiếng Anh 3"), past the
  // words that only say the language ("Toán tiếng Anh 1", "Maths in English 2")
  let at = out.subject === 'math' ? math : out.subject === 'english' ? (w[eng] === 'english' ? eng : eng + 1) : -1;
  if (at >= 0) while (LANG_WORD.has(p[at + 1] ?? '')) at++;
  if (out.grade === undefined && at >= 0 && w[at + 1]) out.grade = grade(w[at + 1]);
  return { ...(out.subject && { subject: out.subject }), ...(out.grade && { grade: out.grade }) };
}

// the name she typed and the file name first; the first page's text only fills what they left out
export function guessSubject(...texts: (string | undefined | null)[]): Guess {
  const out: Guess = {};
  for (const t of texts) {
    if (!t) continue;
    const g = one(t.replace(/\.(pdf|jpe?g|png|webp|heic|heif)$/i, '').slice(0, 1500));
    out.subject ??= g.subject; out.grade ??= g.grade;
    if (out.subject && out.grade) break;
  }
  return { ...(out.subject && { subject: out.subject }), ...(out.grade && { grade: out.grade }) };
}

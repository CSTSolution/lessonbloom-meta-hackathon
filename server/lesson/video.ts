// The lesson video (Chi's step 4): every slide drawn at 1280×720 by headless Chromium, read aloud by
// the server's local voice (VieNeu for Vietnamese, Kokoro for English: free, nothing goes to Meta),
// with the narration as a one-line subtitle when she wants it, then joined by ffmpeg into one MP4.
// One video at a time on the server (memory), in the background; the lesson shows its progress.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AI } from '../ai/types.ts';
import type { Files } from '../files.ts';
import type { Sql } from '../db/sql.ts';
import type { Lesson, Slide } from './types.ts';

const run = promisify(execFile);
export const CHROMIUM = process.env.CHROMIUM_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');
export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// Seconds of sound in a WAV file (from its header), so each slide stays up exactly as long as it is read.
export function wavSeconds(wav: Buffer): number {
  if (wav.toString('latin1', 0, 4) !== 'RIFF') return 0;
  const byteRate = wav.readUInt32LE(28);
  let at = 12;
  while (at + 8 <= wav.length) { const id = wav.toString('latin1', at, at + 4), size = wav.readUInt32LE(at + 4); if (id === 'data') return byteRate ? Math.min(size, wav.length - at - 8) / byteRate : 0; at += 8 + size + (size % 2); }
  return 0;
}

// What the voice reads for a slide: its narration, then each point on the slide, then the worked
// example said in words. One sentence a slide made 11 slides last 47 s (Chi, 29 Oct; she designed 2–4 min).
const SAY = { en: { '+': 'plus', '-': 'minus', '=': 'equals', '×': 'times' }, vi: { '+': 'cộng', '-': 'trừ', '=': 'bằng', '×': 'nhân' } } as const;
export function spoken(s: Slide, lang: 'vi' | 'en'): string {
  const end = (x: string) => (/[.!?…]$/.test(x.trim()) ? x.trim() : `${x.trim()}.`);
  const first = (s.narration || s.notes || s.heading || '').trim(), seen = first.toLowerCase();
  const parts = [first, ...s.bullets.filter((b) => b.trim() && !seen.includes(b.trim().toLowerCase().replace(/[.!?]$/, '')))];
  if (s.example && !seen.includes(s.example.toLowerCase())) parts.push(s.example.replace(/\s*([+\-−=×])\s*/g, (_, op: string) => ` ${SAY[lang][(op === '−' ? '-' : op) as keyof (typeof SAY)['en']]} `));
  return parts.filter(Boolean).map(end).join(' ').slice(0, 1500);
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
// One slide as a page to photograph (the same look as the app: calm blue, large type for children).
export function slideHtml(s: Slide, n: number, total: number, title: string, picture: string | null, subtitle: string | null): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:1280px;height:720px;font-family:"Be Vietnam Pro","Noto Sans",Arial,sans-serif;background:#F3F5F9;color:#172033}
    .card{position:absolute;inset:36px 48px ${subtitle ? 120 : 48}px;background:#fff;border-radius:28px;padding:44px 56px;display:flex;gap:40px;align-items:center}
    .txt{flex:1;min-width:0} h1{margin:0 0 18px;font-size:${s.heading.length > 40 ? 44 : 54}px;line-height:1.15;color:#1F5FAD}
    ul{margin:0;padding-left:34px;font-size:34px;line-height:1.45} .ex{display:inline-block;margin-top:18px;font-size:60px;font-weight:800;background:#E8F0FB;border-radius:18px;padding:8px 26px}
    img{width:430px;height:430px;object-fit:cover;border-radius:22px} .foot{position:absolute;left:60px;right:60px;top:${subtitle ? 610 : 672}px;font-size:18px;color:#5B6475;display:flex;justify-content:space-between}
    .sub{position:absolute;left:80px;right:80px;bottom:28px;text-align:center;font-size:28px;color:#fff;background:rgba(23,32,51,.86);border-radius:14px;padding:10px 18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style></head><body><div class="card"><div class="txt"><h1>${esc(s.heading)}</h1>${s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${s.example ? `<div class="ex">${esc(s.example)}</div>` : ''}</div>${picture ? `<img src="${picture}">` : ''}</div>
  <div class="foot"><span>LessonBloom · ${esc(title)}</span><span>${n} / ${total}</span></div>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}</body></html>`;
}

let busy: Promise<unknown> = Promise.resolve();
export async function makeVideo(d: { sql: Sql; ai: AI; files: Files }, lesson: Lesson, opts: { subtitles: boolean; voice: number; speed?: number }) {
  const job = busy.then(() => render(d, lesson, opts)).catch(async (e) => {
    console.warn(`[video] ${lesson.id}: ${String((e as Error).message).slice(0, 300)}`);
    await d.sql.query(`update lessons set video_status = 'error', updated_at = now() where id = $1`, [lesson.id]);
  });
  busy = job;
  return job;
}

async function render(d: { sql: Sql; ai: AI; files: Files }, l: Lesson, opts: { subtitles: boolean; voice: number; speed?: number }) {
  const dir = await mkdtemp(join(tmpdir(), 'lbm-video-'));
  try {
    const parts: { file: string; seconds: number; heading: string; start: number }[] = [];
    let start = 0;
    for (const [i, s] of l.slides.entries()) {
      const text = spoken(s, l.setup.lang);
      const wav = await d.ai.speak({ text, lang: l.setup.lang, voice: opts.voice, speed: opts.speed });
      const seconds = Math.max(2, wavSeconds(wav) + 0.6);
      let picture: string | null = null;
      const m = s.image && /^\/media\/([\w-]+)\/([\w.-]+)$/.exec(s.image);
      if (m) { const f = await d.files.get(m[1], m[2]); if (f) picture = `data:${f.type};base64,${f.data.toString('base64')}`; }
      const sub = opts.subtitles ? (text.length > 90 ? `${text.slice(0, 88)}…` : text) : null;
      await writeFile(join(dir, `s${i}.html`), slideHtml(s, i + 1, l.slides.length, l.setup.title, picture, sub));
      await writeFile(join(dir, `s${i}.wav`), wav);
      await run(CHROMIUM, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,720', `--screenshot=${join(dir, `s${i}.png`)}`, `file://${join(dir, `s${i}.html`)}`], { timeout: 60e3 });
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-loop', '1', '-i', join(dir, `s${i}.png`), '-i', join(dir, `s${i}.wav`), '-af', 'apad', '-t', seconds.toFixed(2),
        '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-ar', '44100', '-ac', '1', join(dir, `s${i}.mp4`)], { timeout: 120e3 });
      parts.push({ file: `s${i}.mp4`, seconds, heading: s.heading, start });
      start += seconds;
      await d.sql.query(`update lessons set video_status = $2, updated_at = now() where id = $1`, [l.id, `working:${i + 1}/${l.slides.length}`]);
    }
    await writeFile(join(dir, 'list.txt'), parts.map((p) => `file '${p.file}'`).join('\n'));
    await run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', join(dir, 'lesson.mp4')], { timeout: 180e3 });
    const url = await d.files.put(l.id, 'mp4', await readFile(join(dir, 'lesson.mp4')));
    const chapters = parts.map((p) => ({ heading: p.heading, start: Math.round(p.start) }));
    await d.sql.query(`update lessons set video = $2::jsonb, video_status = 'ready', updated_at = now() where id = $1`, [l.id, JSON.stringify({ url, seconds: Math.round(start), chapters, subtitles: opts.subtitles, voice: opts.voice, speed: opts.speed ?? 1 })]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

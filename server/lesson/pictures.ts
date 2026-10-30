// Slide pictures with Muse Image, in one style for the whole lesson: every prompt carries the same
// house style and the same two pupils, so the slides look like one book. Each picture is looked at by
// Muse Spark (vision) before it is used: no text or numbers drawn in, child-safe, about the slide. A
// picture that fails is drawn once more with the critic's revised prompt, then left out.
// Pictures are drawn in the background after the lesson is ready (two at a time) and appear on the
// slides as they arrive. The money check runs before each one.
import type { AI } from '../ai/types.ts';
import type { Files } from '../files.ts';
import { guardedJson, wrapUser, type Budget } from '../guard/guard.ts';
import type { Lessons } from './lessons.ts';
import type { Slide } from './types.ts';

export const STYLE = 'Warm flat illustration for a primary-school lesson slide: soft rounded shapes, gentle paper texture, a calm palette of leaf green, warm cream, coral and sunny yellow, friendly and simple, plain light background. No text, no letters, no numbers, no writing of any kind, no watermark.';
export const CAST = 'When people appear: two Vietnamese primary pupils, Mai (a girl with a short black bob, white shirt, red scarf) and Nam (a boy with short black hair, light blue shirt), always drawn the same way.';
export const MAX_PICTURES = 6;
const ORDER: Slide['kind'][] = ['title', 'teach', 'example', 'warmup', 'practice', 'summary'];

const CRITIC_SYSTEM = `You check one illustration for a slide of a primary-school lesson. Answer honestly:
hasText: any letters, numbers or writing drawn in the picture; unsafe: anything not fit for young children; offTopic: it does not show what the slide is about; broken: garbled or deformed;
score: 0-10 for how well it would help a 7-year-old understand the slide; revisedPrompt: a better picture description if it fails (no text).`;
const CRITIC_SCHEMA = { type: 'object', properties: { hasText: { type: 'boolean' }, unsafe: { type: 'boolean' }, offTopic: { type: 'boolean' }, broken: { type: 'boolean' }, score: { type: 'number' }, revisedPrompt: { type: 'string' } }, required: ['hasText', 'unsafe', 'offTopic', 'broken', 'score'] };

export const picturePrompt = (subject: string) => `${STYLE} ${CAST} The picture: ${String(subject).replace(/\s+/g, ' ').trim().slice(0, 400)}`;

// One picture for one slide, or null when two tries both fail the check.
export async function illustrate(ai: AI, slide: Pick<Slide, 'id' | 'heading' | 'bullets' | 'imagePrompt'>, attemptHint = ''): Promise<Buffer | null> {
  let subject = `${slide.imagePrompt || slide.heading}${attemptHint ? ` ${attemptHint}` : ''}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const png = await ai.image({ prompt: picturePrompt(subject), aspect: '4:3' });
    const v = await guardedJson<{ hasText: boolean; unsafe: boolean; offTopic: boolean; broken: boolean; score: number; revisedPrompt?: string }>(ai, {
      endpoint: 'critic', system: CRITIC_SYSTEM, prompt: `The slide: ${wrapUser(JSON.stringify({ heading: slide.heading, bullets: slide.bullets, picture: subject }))}`,
      images: [{ data: png, mime: png[0] === 0x89 ? 'image/png' : 'image/jpeg' }], schema: CRITIC_SCHEMA, fixture: { slide: slide.id, attempt } });
    if (!v.hasText && !v.unsafe && !v.offTopic && !v.broken && Number(v.score) >= 6) return png;
    if (v.unsafe) return null;
    subject = String(v.revisedPrompt || subject).slice(0, 400);
  }
  return null;
}

const ext = (b: Buffer) => (b[0] === 0x89 ? 'png' : 'jpg') as 'png' | 'jpg';

// The background job: up to MAX_PICTURES slides, the teaching slides first, two at a time.
export async function drawPictures(ai: AI, lessons: Lessons, files: Files, budget: Budget, lessonId: string, teacherId: string, slides: Slide[], held = false) {
  const pick = [...slides].filter((s) => !s.image).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).slice(0, MAX_PICTURES);
  await lessons.picturesPending(lessonId, true);
  let drawn = 0, skipped = 0;
  const queue = [...pick];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      // paid from the lesson's held credit: her balance being low does not stop it, the app's caps do
      const b = await budget.check(teacherId);
      if (b && !(held && b === 'credits')) { skipped++; continue; }
      try {
        const png = await illustrate(ai, s);
        if (!png) { skipped++; continue; }
        await lessons.setSlideImage(lessonId, s.id, await files.put(lessonId, ext(png), png));
        drawn++;
      } catch (e) {
        skipped++;
        console.warn(`[picture] ${lessonId}/${s.id}: ${String((e as Error).message).slice(0, 200)}`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  await lessons.picturesPending(lessonId, false);
  await lessons.step(lessonId, `Đã vẽ ${drawn} hình minh họa${skipped ? ` (bỏ qua ${skipped})` : ''}.`, `Drew ${drawn} pictures${skipped ? ` (${skipped} left out)` : ''}.`);
}

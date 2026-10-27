// Photo cut-outs (SAM 3.1). The assigner photographs something real (the class garden, coins, a
// market stall) and names it; SAM finds every match and the matches become one transparent PNG for
// the slide. Only that PNG is stored, never the photo. The browser always sends a downscaled JPEG.
// SAM returns only masks, so there is no model text to check; what reaches it is the photo and a
// short object name, which code validates. People and faces are refused: pupils' photos never go
// into lessons.
import jpeg from 'jpeg-js';
import type { AI, SegmentMatch } from '../ai/types.ts';
import { png } from '../media.ts';

export const CUTOUT = { maxPhotoBytes: 4e6, maxSide: 1024, pad: 6, maxMatches: 12, minConfidence: 0.3 } as const;
export class CutoutError extends Error { constructor(public code: 'cutoutName' | 'cutoutPeople' | 'photos' | 'cutoutNone') { super(code); } }

// Whole words only: "con mèo" and "mặt trời" are fine; people words are not.
const PEOPLE = /(?<!\p{L})(người|em bé|bé|học sinh|hs|bạn nhỏ|cô giáo|thầy giáo|giáo viên|khuôn mặt|mặt người|trẻ|trẻ em|cậu bé|cô bé|con tôi|person|people|man|woman|men|women|boy|girl|child|children|kid|kids|student|students|pupil|pupils|face|faces|baby|teacher|me|myself)(?!\p{L})/iu;

export function cleanName(raw: unknown): string {
  const p = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!p || p.length > 40 || !/^[\p{L}\p{N} '-]+$/u.test(p) || (p.match(/\p{L}/gu) || []).length < 2) throw new CutoutError('cutoutName');
  if (PEOPLE.test(p)) throw new CutoutError('cutoutPeople');
  return p;
}

export function decodePhoto(data: Buffer) {
  if (data.length < 100 || data.length > CUTOUT.maxPhotoBytes || data[0] !== 0xff || data[1] !== 0xd8) throw new CutoutError('photos');
  try { return jpeg.decode(data, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 256 }); } catch { throw new CutoutError('photos'); }
}

// Every confident match painted into one transparent image, cropped to the matches plus a small
// margin and scaled to fit maxSide. Each photo pixel looks up the (lower-resolution) mask cell under it.
export function compose(photo: { width: number; height: number; data: Uint8Array }, matches: SegmentMatch[]) {
  const W = photo.width, H = photo.height;
  const keep = matches.filter((m) => (m.confidence ?? 1) >= CUTOUT.minConfidence && m.box.right > m.box.left && m.box.bottom > m.box.top)
    .sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1)).slice(0, CUTOUT.maxMatches);
  if (!keep.length) throw new CutoutError('cutoutNone');
  const x0 = Math.max(0, Math.min(...keep.map((m) => m.box.left)) - CUTOUT.pad), y0 = Math.max(0, Math.min(...keep.map((m) => m.box.top)) - CUTOUT.pad);
  const x1 = Math.min(W, Math.max(...keep.map((m) => m.box.right)) + CUTOUT.pad), y1 = Math.min(H, Math.max(...keep.map((m) => m.box.bottom)) + CUTOUT.pad);
  if (x1 <= x0 || y1 <= y0) throw new CutoutError('cutoutNone');
  const k = Math.min(1, CUTOUT.maxSide / Math.max(x1 - x0, y1 - y0)), w = Math.max(1, Math.round((x1 - x0) * k)), h = Math.max(1, Math.round((y1 - y0) * k));
  const out = new Uint8Array(w * h * 4);
  let on = 0;
  for (let j = 0; j < h; j++) {
    const y = Math.min(H - 1, Math.floor(y0 + (j + 0.5) / k));
    for (let i = 0; i < w; i++) {
      const x = Math.min(W - 1, Math.floor(x0 + (i + 0.5) / k));
      const hit = keep.some((m) => {
        const b = m.box;
        if (x < b.left || x >= b.right || y < b.top || y >= b.bottom) return false;
        const mx = Math.min(m.maskWidth - 1, Math.floor(((x - b.left) * m.maskWidth) / (b.right - b.left)));
        const my = Math.min(m.maskHeight - 1, Math.floor(((y - b.top) * m.maskHeight) / (b.bottom - b.top)));
        return m.mask[my * m.maskWidth + mx] === 1;
      });
      if (!hit) continue;
      const s = (y * W + x) * 4, d = (j * w + i) * 4;
      out[d] = photo.data[s]; out[d + 1] = photo.data[s + 1]; out[d + 2] = photo.data[s + 2]; out[d + 3] = 255;
      on++;
    }
  }
  if (!on) throw new CutoutError('cutoutNone');
  return { png: png(w, h, out), width: w, height: h, matches: keep.length };
}

export async function cutOut(ai: AI, jpegData: Buffer, name: string) {
  const n = cleanName(name), photo = decodePhoto(jpegData);
  return compose(photo, await ai.segment({ image: jpegData, mime: 'image/jpeg', prompt: n }));
}

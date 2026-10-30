// The lesson video, rendered for real (Chromium and ffmpeg). It runs alone, after the main suite
// (npm run test:render): beside other test files it takes minutes and slows them past their limit.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { CHROMIUM, FFMPEG } from '../../server/lesson/video.ts';
import { areaWithBook, lessonFrom, testServer } from '../helpers.ts';

const canRender = existsSync(CHROMIUM) || (() => { try { execFileSync('which', ['chromium']); return true; } catch { return false; } })();
const hasFfmpeg = (() => { try { execFileSync(FFMPEG, ['-version']); return true; } catch { return false; } })();
test('the lesson video: one MP4 with a chapter per slide', { skip: !(canRender && hasFfmpeg) && 'no Chromium or ffmpeg here' }, async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  assert.equal((await call('POST', `/api/t/lessons/${id}/video`, { subtitles: true })).status, 200);
  let l: any;
  for (let i = 0; i < 240; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (!String(l.video_status).startsWith('working')) break; await new Promise((r) => setTimeout(r, 500)); }
  assert.equal(l.video_status, 'ready');
  assert.equal(l.video.chapters.length, l.slides.length);
  const r = await s.app.request(l.video.url, { headers: { range: 'bytes=0-99' } });
  assert.equal(r.status, 206, 'seekable');
  assert.equal((await r.arrayBuffer()).byteLength, 100);
});

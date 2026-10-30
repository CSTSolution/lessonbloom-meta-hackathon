// Steps 3-5 after the agent: the assigner rewrites, simplifies and adds slides; edits items (rebuilt
// and checked by code); asks for a similar item or a new kind. The video's render runs alone: test/render.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spoken, wavSeconds } from '../server/lesson/video.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

test('slides: rewrite and simpler keep the slide; a new slide comes after the one she is on', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const sl = lesson.slides[2];
  const r = (await call('POST', `/api/t/lessons/${id}/slides/${sl.id}/rewrite`, { how: 'simpler' })).json.slide;
  assert.equal(r.id, sl.id);
  assert.ok(r.bullets.every((b: string) => b.split(' ').length <= 8), 'simpler');
  assert.equal((await call('POST', `/api/t/lessons/${id}/slides/${sl.id}/rewrite`, { how: 'rewrite' })).json.slide.id, sl.id);
  const added = (await call('POST', `/api/t/lessons/${id}/slides`, { after: sl.id, topic: 'Checking an addition' })).json;
  assert.equal(added.slides[3].id, added.slide.id);
  assert.equal(added.slides.length, lesson.slides.length + 1);
  s.ai.answers.set('precheck', () => ({ verdict: 'off_task', reason: 'asks for a website' }));
  assert.equal((await call('POST', `/api/t/lessons/${id}/slides`, { after: sl.id, topic: 'Write me a website in React' })).json.code, 'aiBlocked', 'her topic is checked before any model sees it');
});

test('items: her edit is rebuilt and checked by code; similar and new kinds pass the checks too', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping');
  const it = lesson.items.find((i: any) => i.template === 'mcq');
  const ok = (await call('PUT', `/api/t/lessons/${id}/items/${it.id}`, { a: 45, b: 38 })).json.item;
  assert.equal(ok.answer, '83', 'the answer is worked out by code, never typed');
  assert.equal(ok.explain, '5 + 8 = 13: write 3, carry 1; 4 + 3 + 1 = 8. So 45 + 38 = 83.', 'new numbers, a new explanation');
  const bad = await call('PUT', `/api/t/lessons/${id}/items/${it.id}`, { a: 70, b: 50 });
  assert.equal(bad.json.code, 'itemCheck', 'outside "within 100": refused');
  assert.ok(bad.json.issues.some((x: any) => x.code === 'scope'));
  const sim = (await call('POST', `/api/t/lessons/${id}/items/${it.id}/similar`)).json;
  assert.equal(sim.items[sim.items.findIndex((x: any) => x.id === it.id) + 1].id, sim.added[0].id, 'the similar item comes right after');
  const tf = (await call('POST', `/api/t/lessons/${id}/items`, { skill: lesson.skills[0].tag, template: 'truefalse', level: 'good' })).json;
  assert.ok(tf.added.length && tf.added.every((x: any) => x.template === 'truefalse'));
  assert.equal(new Set(tf.items.map((x: any) => x.id)).size, tf.items.length, 'ids stay unique');
});

test('WAV length from its header', () => {
  const wav = Buffer.alloc(44 + 32000); wav.write('RIFF', 0, 'latin1'); wav.write('WAVE', 8, 'latin1'); wav.write('fmt ', 12, 'latin1'); wav.writeUInt32LE(16, 16); wav.writeUInt32LE(32000, 28); wav.write('data', 36, 'latin1'); wav.writeUInt32LE(32000, 40);
  assert.equal(wavSeconds(wav), 1);
});

test('the video reads the narration, each point on the slide and the worked example in words', () => {
  const s = { id: 'sl03', kind: 'example', heading: 'Example', bullets: ['Add the ones first.', 'Then add the tens'], example: '36 + 27 = 63', narration: "Let's add 36 and 27 together!", notes: '', source: '' } as any;
  assert.equal(spoken(s, 'en'), "Let's add 36 and 27 together! Add the ones first. Then add the tens. 36 plus 27 equals 63.");
  assert.equal(spoken({ ...s, bullets: [], example: '52 − 28 = 24', narration: 'Mình cùng trừ nhé' }, 'vi'), 'Mình cùng trừ nhé. 52 trừ 28 bằng 24.');
  assert.equal(spoken({ ...s, bullets: ['Add the ones first.'], narration: 'Add the ones first, then the tens.', example: '' }, 'en'), 'Add the ones first, then the tens.', 'no point read twice');
});

// Narration from the CST server's voice engines (VieNeu, Kokoro), against a fake engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickProvider } from '../server/ai/pick.ts';
import { speaker } from '../server/ai/voices.ts';
import { wav } from '../server/media.ts';

const WAV = wav(Buffer.alloc(480));
const engine = (reply = () => new Response(new Uint8Array(WAV))) => {
  const calls: { url: string; body: any }[] = [];
  return { calls, fetch: (async (url: string, init?: RequestInit) => { calls.push({ url, body: JSON.parse(String(init?.body)) }); return reply(); }) as typeof fetch };
};

test('Vietnamese to VieNeu (Kim Thanh), English to Kokoro with the chosen voice', async () => {
  const e = engine(), say = speaker({ vieneu: 'http://vieneu:8086/', kokoro: 'http://kokoro:8083', fetch: e.fetch })!;
  assert.deepEqual(await say({ text: 'Các con cùng đếm nhé.', lang: 'vi', voice: 2 }), WAV);
  await say({ text: 'Let us count.', lang: 'en', voice: 2 });
  assert.deepEqual(e.calls.map((c) => [c.url, c.body.voice]), [['http://vieneu:8086/tts', 'Kim Thanh'], ['http://kokoro:8083/tts', 'am_michael']]);
});

test('errors and non-WAV answers fail the line; no URLs means no speaker', async () => {
  await assert.rejects(speaker({ vieneu: 'http://v', fetch: engine(() => new Response('busy', { status: 500 })).fetch })!({ text: 'Xin chào', lang: 'vi' }), /voice engine 500/);
  await assert.rejects(speaker({ vieneu: 'http://v', fetch: engine(() => new Response('<html>')).fetch })!({ text: 'Xin chào', lang: 'vi' }), /not return a WAV/);
  await assert.rejects(speaker({ vieneu: 'http://v' })!({ text: 'Hello', lang: 'en' }), /no voice engine for en/);
  assert.equal(speaker({}), undefined);
});

test('pickProvider: Meta with a key, the mock without; voices replace the mock tone', () => {
  assert.equal(pickProvider({ MODEL_API_KEY: 'k' }).name, 'meta');
  assert.equal(pickProvider({ MODEL_API_KEY: 'k', LB_MOCK: '1' }).name, 'mock');
  assert.equal(pickProvider({ KOKORO_URL: 'http://k' }).name, 'mock+voices');
  assert.equal(pickProvider({}).name, 'mock');
});

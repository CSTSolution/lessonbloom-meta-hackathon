// MetaProvider against a fake Meta Model API: request shapes, fallbacks, decoding, all offline.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MetaProvider, parseJson, readSegmentation } from '../server/ai/meta.ts';
import type { JsonRequest, Usage } from '../server/ai/types.ts';

const KEY = 'test-key-not-real-123';
type Reply = { status?: number; json?: unknown; text?: string; bytes?: Buffer };
function fake(replies: Reply[]) {
  const calls: { url: string; auth?: string; body: any; form?: FormData }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const h = (init?.headers || {}) as Record<string, string>, form = init?.body instanceof FormData ? init.body : undefined;
    calls.push({ url, auth: h.authorization, body: init?.body && !form ? JSON.parse(String(init.body)) : undefined, form });
    const r = replies.shift();
    if (!r) throw new Error(`unexpected request ${url}`);
    return r.bytes ? new Response(new Uint8Array(r.bytes)) : new Response(r.text ?? JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof globalThis.fetch;
  const usage: Usage[] = [];
  const ai = new MetaProvider({ key: KEY, base: 'https://meta.test/v1/', fetch, sleep: async () => {} });
  ai.onUsage = (u) => usage.push(u);
  return { ai, calls, usage };
}
const chat = (content: string | null, tool_calls?: unknown) => ({ json: { choices: [{ message: { content, tool_calls }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5 } } });
const req: JsonRequest = { endpoint: 'intake', system: 'You read lesson notes.', prompt: 'Phép cộng có nhớ', schema: { type: 'object', properties: { title: { type: 'string' } } } };

test('json: Muse Spark with the key, the system prompt and a json_schema; usage reported', async () => {
  const { ai, calls, usage } = fake([chat('```json\n{"title":"Cộng có nhớ"}\n```')]);
  assert.deepEqual(await ai.json(req), { title: 'Cộng có nhớ' });
  const b = calls[0].body;
  assert.equal(calls[0].url, 'https://meta.test/v1/chat/completions');
  assert.equal(calls[0].auth, `Bearer ${KEY}`);
  assert.equal(b.model, 'muse-spark-1.3');
  assert.deepEqual(b.messages[0], { role: 'system', content: req.system });
  assert.equal(b.response_format.type, 'json_schema');
  assert.equal(usage[0].inTokens, 12);
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
});

test('json: a busy model hands over to the fallback; json_schema refused -> json_object, remembered', async () => {
  const f = fake([{ status: 429, text: 'busy' }, chat('{"title":"ok"}')]);
  assert.deepEqual(await f.ai.json(req), { title: 'ok' });
  assert.deepEqual(f.calls.map((c) => c.body.model), ['muse-spark-1.3', 'muse-spark-1.2']);
  const g = fake([{ status: 400, text: 'response_format json_schema not supported' }, chat('{"title":"a"}'), chat('{"title":"b"}')]);
  await g.ai.json(req); await g.ai.json(req);
  assert.deepEqual(g.calls.map((c) => c.body.response_format.type), ['json_schema', 'json_object', 'json_object']);
  assert.match(g.calls[1].body.messages[0].content, /matching this JSON schema/);
});

test('errors fail at once and never carry the key; photos travel as data URLs', async () => {
  const f = fake([{ status: 401, text: `bad key ${KEY}` }]);
  await assert.rejects(f.ai.json(req), (e: Error) => /401/.test(e.message) && !e.message.includes(KEY));
  const v = fake([chat('{"title":"ocr"}')]);
  await v.ai.json({ ...req, endpoint: 'ocr', images: [{ data: Buffer.from('jpeg'), mime: 'image/jpeg' }] });
  assert.deepEqual(v.calls[0].body.messages[1].content[0], { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}` } });
});

test('chat: Muse Wonder with function tools, tool calls both ways; busy Wonder hands over to Spark', async () => {
  const f = fake([chat(null, [{ id: 'c1', function: { name: 'check_items', arguments: '{}' } }])]);
  const turn = await f.ai.chat({ endpoint: 'agent', tools: [{ name: 'check_items', description: 'd', parameters: { type: 'object' } }], messages: [
    { role: 'user', content: 'x' }, { role: 'assistant', content: '', toolCalls: [{ id: 'c0', name: 'plan', args: '{}' }] }, { role: 'tool', toolCallId: 'c0', content: '{}' }] });
  assert.deepEqual(turn.toolCalls, [{ id: 'c1', name: 'check_items', args: '{}' }]);
  assert.equal(f.calls[0].body.model, 'muse-wonder-1.0');
  assert.deepEqual(f.calls[0].body.messages[1].tool_calls[0], { id: 'c0', type: 'function', function: { name: 'plan', arguments: '{}' } });
  assert.deepEqual(f.calls[0].body.messages[2], { role: 'tool', tool_call_id: 'c0', content: '{}' });
  const g = fake([{ status: 503, text: 'busy' }, chat('Done.')]);
  assert.equal((await g.ai.chat({ endpoint: 'agent', tools: [], messages: [] })).model, 'muse-spark-1.3');
});

test('image: Muse Image, base64 or a signed URL fetched without our key', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const f = fake([{ json: { data: [{ b64_json: png.toString('base64') }] } }]);
  assert.deepEqual(await f.ai.image({ prompt: 'apples', aspect: '1:1' }), png);
  assert.equal(f.calls[0].body.model, 'muse-image-1.0');
  assert.equal(f.calls[0].body.size, '1024x1024');
  const g = fake([{ json: { data: [{ url: 'https://cdn.test/a.jpg' }] } }, { bytes: png }]);
  assert.deepEqual(await g.ai.image({ prompt: 'x' }), png);
  assert.equal(g.calls[1].auth, undefined);
});

// Two buttons in a 320x334 frame: the sample output from @meta-sam/parser's README.
const SAM = '<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>'
  + "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>"
  + ',1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>'
  + '<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n';

test('segment: SAM 3.1 on the Responses API; masks decoded with Meta\'s parser', async () => {
  const f = fake([{ json: { output: [{ content: [{ type: 'output_text', text: SAM }] }] } }]);
  const m = await f.ai.segment({ image: Buffer.from('jpg'), mime: 'image/jpeg', prompt: 'buttons' });
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].box, { left: 211, top: 228, right: 271, bottom: 255 });
  assert.equal(m[0].mask.length, 60 * 27);
  assert.equal(f.calls[0].body.model, 'sam-3.1');
  assert.deepEqual(f.calls[0].body.input[0].content[0], { type: 'input_text', text: 'buttons' });
  assert.deepEqual(await readSegmentation(''), []);
});

test('transcribe: Muse Voice Transcribe gets the audio as a file; turns are joined', async () => {
  const f = fake([{ json: { turns: [{ text: 'Bài 12.' }, { text: 'Phép cộng có nhớ.' }] } }]);
  assert.equal(await f.ai.transcribe({ audio: Buffer.from('webm'), mime: 'audio/webm', lang: 'vi' }), 'Bài 12. Phép cộng có nhớ.');
  assert.equal(f.calls[0].url, 'https://meta.test/v1/asr/transcribe');
  assert.equal(f.calls[0].form?.get('model'), 'muse-voice-transcribe-1.0');
  assert.equal(f.calls[0].form?.get('language'), 'vi');
  await assert.rejects(f.ai.speak({ text: 'x', lang: 'vi' }), /no voice engine/);
});

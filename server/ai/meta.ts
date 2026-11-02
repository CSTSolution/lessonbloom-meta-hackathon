// Meta Model API (https://api.meta.ai/v1), OpenAI-compatible. Plain fetch, no SDK; the key
// (MODEL_API_KEY) is read on the server only and is scrubbed from any error text.
//   text, vision     Muse Spark, falling back to an older Spark on 429/503
//   agent turns      Muse Wonder with function tools, falling back to Muse Spark
//   pictures         Muse Image
//   photo cut-outs   SAM 3.1 on the Responses API, masks decoded with Meta's @meta-sam/parser
//   dictation        Muse Voice Transcribe
//   narration        Meta has no text-to-speech: handed to the speaker passed in (voices.ts)
import { decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from '@meta-sam/parser';
import { config } from '../config.ts';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { FFMPEG } from '../lesson/video.ts';
import type { AI, ChatMsg, ChatTurn, Endpoint, ImageRequest, JsonRequest, SegmentMatch, SpeechRequest, ToolSpec, Usage } from './types.ts';

type Fetch = typeof fetch;
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
interface ApiToolCall { id: string; function: { name: string; arguments?: string } }
interface ChatAnswer { choices?: { message?: { content?: string | null; tool_calls?: ApiToolCall[] }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
interface ImageAnswer { data?: { b64_json?: string; url?: string }[] }
interface ResponsesAnswer { output_text?: string; output?: { content?: { type?: string; text?: string }[] }[] }

export interface MetaOptions { key: string; base?: string; fetch?: Fetch; sleep?: (ms: number) => Promise<void>; speak?: (r: SpeechRequest) => Promise<Buffer>; toWav?: (audio: Buffer) => Promise<Buffer>; timeoutMs?: number }

// Worth trying again: busy or failing servers, and a connection that dropped or ran out of time.
const BUSY = /\b(429|500|502|503|504)\b|fetch failed|timed? ?out|aborted|ECONNRESET|socket hang up|truncated/i;
const SIZES = { '4:3': '1024x768', '1:1': '1024x1024', '16:9': '1344x768' } as const;

export class ApiError extends Error {
  constructor(public status: number, body: string) { super(`Meta API ${status}: ${body.slice(0, 300)}`); }
}

// A model sometimes fences JSON in ```json even when asked for JSON only.
export function parseJson<T>(text: string): T {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as T;
}

// Muse Spark always reasons, and reasoning is billed as output. Left unset, the model chooses how
// much: a picture check that answers four yes/no fields used ~1,600 output tokens. Each job gets the
// lowest level that does it well (Meta: "low" for direct-answer tasks); only the second review of
// the items, which must judge correctness, keeps "medium".
export const EFFORT: Partial<Record<Endpoint, 'minimal' | 'low' | 'medium'>> = {
  precheck: 'minimal', errortag: 'minimal',
  critic: 'low', toc: 'low', rerank: 'low', intake: 'low', plan: 'low', slides: 'low', items: 'low', cards: 'low', write: 'low', ocr: 'low', work: 'low', comments: 'low', skills: 'low', skilllinks: 'low', skillchat: 'low',
  check: 'medium',
};

// A ceiling on each answer (reasoning included), well above the largest seen live, so a runaway answer
// ends instead of running until the connection is cut. An answer cut at the ceiling is tried again.
const MAX_OUT: Partial<Record<Endpoint, number>> = { precheck: 2000, errortag: 2000, critic: 4000, intake: 4000, toc: 6000, rerank: 6000, cards: 6000, items: 8000, comments: 8000, check: 10000, ocr: 12000, slides: 16000, skills: 12000, skilllinks: 8000, skillchat: 6000 };   // ocr: a page may hold two dense book pages

export class MetaProvider implements AI {
  name = 'meta';
  onUsage?: (u: Usage) => void;
  private base: string;
  private fetch: Fetch;
  private sleep: (ms: number) => Promise<void>;
  private speaker?: (r: SpeechRequest) => Promise<Buffer>;
  private schemaOk = true;      // false once json_schema is refused: json_object + the schema in the system prompt
  private effortOk = true;      // false once a model refuses reasoning_effort: sent without it from then on
  private sizeOk = true;        // false once our image size is refused: the aspect goes into the prompt

  constructor(private o: MetaOptions) {
    if (!o.key) throw new Error('MetaProvider needs MODEL_API_KEY (server environment only)');
    this.base = (o.base ?? config.meta.base).replace(/\/+$/, '');
    this.fetch = o.fetch ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.speaker = o.speak;
  }

  private async send(path: string, body: BodyInit, json: boolean) {
    // a request that hangs is cut off and tried again (one hung for 5 minutes on 29 Oct and stopped the agent)
    const r = await this.fetch(`${this.base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.o.key}`, ...(json ? { 'content-type': 'application/json' } : {}) }, body, signal: AbortSignal.timeout(this.o.timeoutMs ?? 90e3) });
    const text = await r.text();
    if (!r.ok) throw new ApiError(r.status, text.split(this.o.key).join('[key]'));
    return text;
  }
  private async post<T>(path: string, body: unknown): Promise<T> { return JSON.parse(await this.send(path, JSON.stringify(body), true)) as T; }

  // Transient errors (429, 5xx, a dropped or timed-out connection) back off and try again, up to 5 times; anything else fails at once.
  private async retry<T>(what: string, fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < 5; i++) {
      try { return await fn(); } catch (e) {
        last = e;
        const msg = String((e as Error)?.message);
        if (!BUSY.test(msg)) break;
        console.warn(`[retry] ${what} ${i + 1}: ${msg.slice(0, 120)}`);
        await this.sleep((/429/.test(msg) ? 6000 : 2000) * 2 ** i);
      }
    }
    throw new Error(`${what} failed: ${(last as Error)?.message || last}`);
  }

  // Try each model of a chain; a busy one (429/503) hands over to the next at once.
  private async chain<T>(endpoint: Endpoint, models: string[], fn: (model: string) => Promise<T>): Promise<T> {
    return this.retry(`${endpoint} (${models[0]})`, async () => {
      let last: unknown;
      for (const m of models) {
        try { return await fn(m); } catch (e) {
          last = e;
          if (!/\b(429|503)\b/.test(String((e as Error)?.message))) throw e;
          console.warn(`[fallback] ${endpoint}: ${m} busy`);
        }
      }
      throw last;
    });
  }

  private usage(endpoint: Endpoint, model: string, r: ChatAnswer, t0: number) {
    this.onUsage?.({ endpoint, model, inTokens: r.usage?.prompt_tokens || 0, outTokens: r.usage?.completion_tokens || 0, ms: Date.now() - t0 });
  }

  async json<T>(req: JsonRequest): Promise<T> {
    const content: string | Part[] = req.images?.length
      ? [...req.images.map((p): Part => ({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data.toString('base64')}` } })), { type: 'text', text: req.prompt }]
      : req.prompt;
    const models = [config.meta.text, ...config.meta.textFallbacks.filter((m) => m !== config.meta.text)];
    return this.chain(req.endpoint, models, async (model) => {
      const body = () => ({
        model, temperature: req.creative ? 0.7 : 0.2,
        ...(this.effortOk && EFFORT[req.endpoint] ? { reasoning_effort: EFFORT[req.endpoint] } : {}),
        max_tokens: MAX_OUT[req.endpoint] ?? 8000,
        messages: [{ role: 'system', content: this.schemaOk ? req.system : `${req.system}\n\nAnswer with one JSON object only, matching this JSON schema:\n${JSON.stringify(req.schema)}` }, { role: 'user', content }],
        response_format: this.schemaOk ? { type: 'json_schema', json_schema: { name: req.endpoint, schema: req.schema } } : { type: 'json_object' },
      });
      const t0 = Date.now();
      const r = await this.post<ChatAnswer>('/chat/completions', body()).catch((e) => {
        if (this.schemaOk && e instanceof ApiError && e.status === 400 && /response_format|json_schema/i.test(e.message)) { this.schemaOk = false; return this.post<ChatAnswer>('/chat/completions', body()); }
        if (this.effortOk && e instanceof ApiError && e.status === 400 && /reasoning/i.test(e.message)) { this.effortOk = false; return this.post<ChatAnswer>('/chat/completions', body()); }
        throw e;
      });
      this.usage(req.endpoint, model, r, t0);
      const text = r.choices?.[0]?.message?.content;
      if (r.choices?.[0]?.finish_reason === 'length') throw new Error('truncated: the answer reached max_tokens');
      if (!text) throw new Error(`empty answer (${r.choices?.[0]?.finish_reason})`);
      return parseJson<T>(text);
    });
  }

  async chat(req: { endpoint: Endpoint; messages: ChatMsg[]; tools: ToolSpec[] }): Promise<ChatTurn> {
    const messages = req.messages.map(toApi), tools = req.tools.map((t) => ({ type: 'function', function: t }));
    return this.chain(req.endpoint, [config.meta.agent, config.meta.text], async (model) => {
      const t0 = Date.now();
      const r = await this.post<ChatAnswer>('/chat/completions', { model, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 8000 });
      this.usage(req.endpoint, model, r, t0);
      const m = r.choices?.[0]?.message;
      return { model, text: m?.content || '', toolCalls: (m?.tool_calls || []).map((c) => ({ id: c.id, name: c.function.name, args: c.function.arguments || '{}' })) };
    });
  }

  async image(req: ImageRequest): Promise<Buffer> {
    const aspect = req.aspect || '4:3';
    const ask = () => this.post<ImageAnswer>('/images/generations', {
      model: config.meta.image, n: 1, response_format: 'b64_json',
      prompt: this.sizeOk ? req.prompt : `${req.prompt}\n\nAspect ratio ${aspect}.`, ...(this.sizeOk ? { size: SIZES[aspect] } : {}),
    });
    return this.retry('image', async () => {
      const t0 = Date.now();
      const r = await ask().catch((e) => {
        if (this.sizeOk && e instanceof ApiError && e.status === 400 && /size/i.test(e.message)) { this.sizeOk = false; return ask(); }
        throw e;
      });
      const img = r.data?.[0];
      this.onUsage?.({ endpoint: 'image', model: config.meta.image, images: img ? 1 : 0, ms: Date.now() - t0 });
      if (img?.b64_json) return Buffer.from(img.b64_json, 'base64');
      if (img?.url) {
        const f = await this.fetch(img.url);              // a signed URL: fetched without our key
        if (!f.ok) throw new ApiError(f.status, 'image download failed');
        return Buffer.from(await f.arrayBuffer());
      }
      throw new Error('no image returned');
    });
  }

  async segment(req: { image: Buffer; mime: string; prompt: string }): Promise<SegmentMatch[]> {
    const t0 = Date.now();
    const r = await this.retry('segment', () => this.post<ResponsesAnswer>('/responses', {
      model: config.meta.sam, stream: false, metadata: { include_confidence: 'true' },
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: req.prompt }, { type: 'input_image', image_url: `data:${req.mime};base64,${req.image.toString('base64')}` }] }],
    }));
    this.onUsage?.({ endpoint: 'segment', model: config.meta.sam, images: 1, ms: Date.now() - t0 });
    return readSegmentation(r.output_text ?? (r.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text || '').join(''));
  }

  // Muse Voice Transcribe takes a `request` JSON part and an `audio` part, and only mono 16-bit PCM
  // WAV at 16 or 24 kHz, so every recording (the browser sends webm/opus) is converted first.
  async transcribe(req: { audio: Buffer; mime: string; lang: 'vi' | 'en' }): Promise<string> {
    const t0 = Date.now(), wav = await (this.o.toWav ?? toWav16k)(req.audio);
    const settings = { mode: 'PUSH_TO_TALK', model: config.meta.transcribe, audioEncoding: 'WAV', languageBias: [req.lang === 'vi' ? 'Vietnamese' : 'English'] };
    const r = JSON.parse(await this.retry('transcribe', () => {
      const form = new FormData();
      form.append('request', new Blob([JSON.stringify(settings)], { type: 'application/json' }));
      form.append('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'notes.wav');
      return this.send('/asr/transcribe', form, false);
    })) as { transcript?: string; turns?: { transcript?: string }[] };
    this.onUsage?.({ endpoint: 'transcribe', model: config.meta.transcribe, ms: Date.now() - t0 });
    return (r.transcript || (r.turns || []).map((t) => t.transcript || '').join(' ')).trim();
  }

  async speak(req: SpeechRequest): Promise<Buffer> {
    if (!this.speaker) throw new Error('no voice engine configured (Meta has no text-to-speech)');
    return this.speaker(req);
  }
}

function toApi(m: ChatMsg) {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) return { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) };
  return { role: m.role, content: m.content };
}

// SAM's output line -> matches with decoded masks. The official parser reads Responses stream events,
// so the finished text is fed to it as one delta. No match is an empty line, i.e. [].
export async function readSegmentation(text: string): Promise<SegmentMatch[]> {
  if (!text.trim()) return [];
  const lane = { item_id: 'seg', output_index: 0, content_index: 0 };
  async function* events(): AsyncIterable<ResponsesEvent> {
    yield { type: 'response.output_text.delta', delta: text, ...lane };
    yield { type: 'response.output_text.done', text, ...lane };
    yield { type: 'response.completed' };
  }
  const res = await parseImageStream(events()).finalResult;
  return recordsOfKind(res.records, 'mask').map((m) => ({ box: { ...m.bounds }, confidence: m.confidence, mask: decodeMaskToRaster(m.mask), maskWidth: m.mask.width, maskHeight: m.mask.height }));
}

const run = promisify(execFile);
async function toWav16k(audio: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'lbm-asr-'));
  try {
    await writeFile(join(dir, 'in'), audio);
    await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', join(dir, 'in'), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', join(dir, 'out.wav')], { timeout: 60e3 });
    return await readFile(join(dir, 'out.wav'));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

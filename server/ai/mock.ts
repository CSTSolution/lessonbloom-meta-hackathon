// The offline stand-in for the Meta models: deterministic, so the app runs and the tests pass with
// no key. Each feature adds its fixtures here as it is built; an endpoint without one fails loudly.
import { tone, wash } from '../media.ts';
import { lessonAgentTurn, lessonAnswers } from './mock-lesson.ts';
import type { AI, ChatMsg, ChatTurn, Endpoint, ImageRequest, JsonRequest, SegmentMatch, SpeechRequest, ToolSpec, Usage } from './types.ts';

export class MockProvider implements AI {
  name = 'mock';
  onUsage?: (u: Usage) => void;
  calls: { endpoint: Endpoint; note?: string }[] = [];
  answers = new Map<Endpoint, (req: JsonRequest) => unknown>([
    ['precheck', () => ({ verdict: 'on_task', reason: 'mock' })],
    ...(lessonAnswers as [Endpoint, (r: JsonRequest) => unknown][]),
    // the skills map: two skills a part, both on its first page only (code fills the rest); each links to the one before
    ['skills', (r) => ({ parts: (r.fixture as { parts: { title: string; page_from: number }[] }).parts.map((p, k) => ({ part: k + 1, skills: [
      { name: `Words: ${p.title}`, kind: 'vocabulary', about: 'The words of this part.', pages: [p.page_from] }, { name: `Using ${p.title}`, kind: 'speaking', about: 'Saying them in a sentence.', pages: [p.page_from] }] })) })],
    ['skilllinks', (r) => { const ids = (r.fixture as { ids: string[] }).ids; return { links: ids.slice(1).map((id, k) => ({ id, after: [ids[k]] })) }; }],
    ['skillchat', (r) => {
      const f = r.fixture as { text: string; ids: string[]; parts: string[] };
      if (/rename/i.test(f.text)) return { reply: 'Renamed.', ops: [{ op: 'rename', id: f.ids[0], name: 'Renamed skill' }] };
      if (/merge/i.test(f.text)) return { reply: 'Merged.', ops: [{ op: 'merge', ids: [f.ids[0], f.ids[1]], name: 'Merged skill' }] };
      if (/remove/i.test(f.text)) return { reply: 'Removed.', ops: [{ op: 'remove', id: f.ids[0] }, { op: 'remove', id: 'not-a-skill' }] };
      if (/add/i.test(f.text)) return { reply: 'Added.', ops: [{ op: 'add', part: f.parts[0], name: 'New skill', kind: 'grammar', pages: [999] }] };
      return { reply: `The map has ${f.ids.length} skills.`, ops: [] };
    }],
  ]);

  async json<T>(req: JsonRequest): Promise<T> {
    this.calls.push({ endpoint: req.endpoint });
    const a = this.answers.get(req.endpoint);
    if (!a) throw new Error(`mock has no answer for ${req.endpoint}`);
    this.onUsage?.({ endpoint: req.endpoint, model: 'mock', inTokens: req.prompt.length / 4, outTokens: 50 });
    return a(req) as T;
  }
  async chat(req: { endpoint: Endpoint; messages: ChatMsg[]; tools: ToolSpec[] }): Promise<ChatTurn> {
    this.calls.push({ endpoint: req.endpoint });
    return req.endpoint === 'agent' ? lessonAgentTurn(req.messages) : { model: 'mock', text: 'Done.', toolCalls: [] };
  }
  async image(req: ImageRequest): Promise<Buffer> {
    this.calls.push({ endpoint: 'image', note: req.prompt.slice(0, 40) });
    return wash(320, 240, [...req.prompt].reduce((s, c) => s + c.charCodeAt(0), 0));
  }
  async segment(req: { image: Buffer; mime: string; prompt: string }): Promise<SegmentMatch[]> {
    this.calls.push({ endpoint: 'segment', note: req.prompt });
    const n = 16, mask = new Uint8Array(n * n).map((_, k) => ((k % n) + 0.5 - n / 2) ** 2 + (Math.floor(k / n) + 0.5 - n / 2) ** 2 <= (n / 2) ** 2 ? 1 : 0);
    return /unicorn/i.test(req.prompt) ? [] : [{ box: { left: 10, top: 10, right: 60, bottom: 60 }, confidence: 0.9, mask, maskWidth: n, maskHeight: n }];
  }
  async transcribe(): Promise<string> {
    this.calls.push({ endpoint: 'transcribe' });
    return 'Bài 12: Phép cộng có nhớ trong phạm vi 100. Ví dụ 36 cộng 27 bằng 63.';
  }
  async speak(req: SpeechRequest): Promise<Buffer> {
    this.calls.push({ endpoint: 'tts' });
    return tone(Math.max(0.8, req.text.split(/\s+/).length / 2.5));
  }
}

// The one seam between LessonBloom and the models. MetaProvider (meta.ts) talks to the Meta Model
// API; MockProvider (mock.ts) answers offline. Every caller goes through the guard (guard/), which
// fixes the system prompt, wraps user material and checks what comes back.

export type Endpoint = 'precheck' | 'intake' | 'plan' | 'slides' | 'items' | 'cards' | 'write' | 'check' | 'image' | 'critic' | 'ocr' | 'segment' | 'transcribe' | 'errortag' | 'comments' | 'agent' | 'tts';

export interface JsonRequest {
  endpoint: Endpoint;
  system: string;
  prompt: string;
  schema: object;                                  // the answer must follow this JSON schema
  images?: { data: Buffer; mime: string }[];       // photos, in order (vision)
  creative?: boolean;                              // writing (warmer) vs classifying (exact)
  fixture?: unknown;                               // what the request is about, for the mock
}

export interface ImageRequest { prompt: string; aspect?: '4:3' | '1:1' | '16:9'; editOf?: Buffer }
export interface SpeechRequest { text: string; lang: 'vi' | 'en'; voice?: number }

// Tool calling (the lesson agent). Tool arguments arrive as a JSON string.
export interface ToolSpec { name: string; description: string; parameters: object }
export interface ToolCall { id: string; name: string; args: string }
export type ChatMsg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };
export interface ChatTurn { model: string; text: string; toolCalls: ToolCall[] }

// SAM 3.1: every match of a short noun phrase. The mask is row-major 0/1 over `box` (source pixels, half-open).
export interface SegmentMatch { box: { left: number; top: number; right: number; bottom: number }; confidence?: number; mask: Uint8Array; maskWidth: number; maskHeight: number }

export interface Usage { endpoint: Endpoint; model: string; inTokens?: number; outTokens?: number; images?: number; ms?: number }

export interface AI {
  name: string;
  onUsage?: (u: Usage) => void;
  json<T>(req: JsonRequest): Promise<T>;
  image(req: ImageRequest): Promise<Buffer>;
  chat(req: { endpoint: Endpoint; messages: ChatMsg[]; tools: ToolSpec[] }): Promise<ChatTurn>;
  segment(req: { image: Buffer; mime: string; prompt: string }): Promise<SegmentMatch[]>;
  transcribe(req: { audio: Buffer; mime: string; lang: 'vi' | 'en' }): Promise<string>;
  speak(req: SpeechRequest): Promise<Buffer>;        // WAV
}

// Narration from the voice engines already running on the CST server (Meta has no text-to-speech).
// Both answer POST /tts {text, voice, speed} with WAV bytes:
//   Vietnamese  VieNeu (vieneu), voice "Kim Thanh"; loads on first use, one job at a time
//   English     Kokoro (kokoro), voice by the teacher's choice
// Free and local: no key, nothing leaves the server.
import type { SpeechRequest } from './types.ts';

type Fetch = typeof fetch;
export interface Voices { vieneu?: string; kokoro?: string; fetch?: Fetch; timeoutMs?: number }

// The teacher's choice: 0 female, 1 second female, 2 male. VieNeu has one Vietnamese voice here.
const VOICE = { vi: (_: number) => process.env.LB_VIENEU_VOICE || 'Kim Thanh', en: (v: number) => ['af_heart', 'bf_emma', 'am_michael'][v] ?? 'af_heart' };

export function speaker(o: Voices): ((r: SpeechRequest) => Promise<Buffer>) | undefined {
  if (!o.vieneu && !o.kokoro) return undefined;
  const f = o.fetch ?? fetch;
  return async (req) => {
    const base = req.lang === 'vi' ? o.vieneu : o.kokoro;
    if (!base) throw new Error(`no voice engine for ${req.lang}`);
    const text = String(req.text ?? '').trim().slice(0, 2000);
    if (!text) throw new Error('nothing to say');
    const r = await f(`${base.replace(/\/+$/, '')}/tts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: VOICE[req.lang](req.voice ?? 0), speed: Math.min(1.3, Math.max(0.7, req.speed ?? 1)) }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 5 * 60e3),
    });
    if (!r.ok) throw new Error(`voice engine ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const wav = Buffer.from(await r.arrayBuffer());
    if (wav.toString('latin1', 0, 4) !== 'RIFF' || wav.toString('latin1', 8, 12) !== 'WAVE') throw new Error('voice engine did not return a WAV file');
    return wav;
  };
}

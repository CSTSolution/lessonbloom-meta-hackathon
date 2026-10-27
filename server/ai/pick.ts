// The models: Meta when MODEL_API_KEY is set, else the offline mock (LB_MOCK=1 forces it).
// Narration goes to the CST server's voice engines when their URLs are set.
import { config } from '../config.ts';
import { MetaProvider } from './meta.ts';
import { MockProvider } from './mock.ts';
import type { AI } from './types.ts';
import { speaker } from './voices.ts';

export function pickProvider(env: NodeJS.ProcessEnv = process.env): AI {
  const speak = speaker({ vieneu: env.VIENEU_URL, kokoro: env.KOKORO_URL });
  if (env.LB_MOCK !== '1' && env.MODEL_API_KEY) return new MetaProvider({ key: env.MODEL_API_KEY, base: config.meta.base, speak });
  const mock = new MockProvider();
  if (speak) { mock.speak = speak; mock.name = 'mock+voices'; }
  return mock;
}

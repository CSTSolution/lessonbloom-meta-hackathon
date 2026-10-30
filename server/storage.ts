// Her original files, kept privately in Cloudflare R2 (Son, 30 Oct): a big PDF, and the page pictures of a
// scanned book or of photos, so she can see the original page next to the text read from it. The bucket
// is private; the browser gets a short-lived signed link for one object (to send it, or to look at it),
// and the R2 key stays on the server. Off (and the app works as before) until R2_* is set in the .env.
import { AwsClient } from 'aws4fetch';
import { config } from './config.ts';

export interface Store {
  // a signed link the browser uses to send one object (PUT) or to see it (GET), valid `secs` seconds
  putUrl(key: string, type: string, secs?: number): Promise<string>;
  getUrl(key: string, secs?: number): Promise<string>;
  put(key: string, body: Uint8Array, type: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  size(key: string): Promise<number | null>;
  del(key: string): Promise<void>;
}

export function r2Store(c = config.r2): Store | null {
  if (!c.endpoint || !c.keyId || !c.secret || !c.bucket) return null;
  const aws = new AwsClient({ accessKeyId: c.keyId, secretAccessKey: c.secret, service: 's3', region: 'auto' });
  const url = (key: string) => `${c.endpoint}/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const signed = async (key: string, method: 'GET' | 'PUT', secs: number, type?: string) => {
    const u = new URL(url(key));
    u.searchParams.set('X-Amz-Expires', String(secs));
    const r = await aws.sign(u.toString(), { method, headers: type ? { 'content-type': type } : {}, aws: { signQuery: true } });
    return r.url;
  };
  const call = async (key: string, init: RequestInit) => aws.fetch(url(key), init);
  return {
    putUrl: (key, type, secs = 900) => signed(key, 'PUT', secs, type),
    getUrl: (key, secs = 600) => signed(key, 'GET', secs),
    async put(key, body, type) { const r = await call(key, { method: 'PUT', body: new Uint8Array(body), headers: { 'content-type': type } }); if (!r.ok) throw new Error(`R2 put ${r.status}`); },
    async get(key) { const r = await call(key, { method: 'GET' }); if (r.status === 404) return null; if (!r.ok) throw new Error(`R2 get ${r.status}`); return Buffer.from(await r.arrayBuffer()); },
    async size(key) { const r = await call(key, { method: 'HEAD' }); if (r.status === 404) return null; if (!r.ok) throw new Error(`R2 head ${r.status}`); return Number(r.headers.get('content-length') ?? 0); },
    async del(key) { const r = await call(key, { method: 'DELETE' }); if (!r.ok && r.status !== 404) throw new Error(`R2 delete ${r.status}`); },
  };
}

// For tests: the same calls, kept in memory; a "signed link" is memory://<key>.
export class MemoryStore implements Store {
  objects = new Map<string, { body: Buffer; type: string }>();
  async putUrl(key: string) { return `memory://${key}`; }
  async getUrl(key: string) { return `memory://${key}`; }
  async put(key: string, body: Uint8Array, type: string) { this.objects.set(key, { body: Buffer.from(body), type }); }
  async get(key: string) { return this.objects.get(key)?.body ?? null; }
  async size(key: string) { return this.objects.get(key)?.body.length ?? null; }
  async del(key: string) { this.objects.delete(key); }
}

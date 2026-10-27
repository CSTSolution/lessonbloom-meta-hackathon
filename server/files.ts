// Pictures, cut-outs and videos on the server's disk (LB_DATA_DIR/files/<lesson>/<name>), served at
// /media/<lesson>/<name>. Names are random, so a file is reachable only through its lesson.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SAFE = /^[A-Za-z0-9_-]{4,40}$/, NAME = /^[A-Za-z0-9_-]{6,40}\.(png|jpg|mp4|wav)$/;
export const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', mp4: 'video/mp4', wav: 'audio/wav' };

export class Files {
  constructor(private root: string) {}
  async put(lessonId: string, ext: 'png' | 'jpg' | 'mp4' | 'wav', data: Buffer): Promise<string> {
    if (!SAFE.test(lessonId)) throw new Error('bad lesson id');
    const name = `${randomBytes(9).toString('base64url')}.${ext}`, dir = join(this.root, lessonId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), data);
    return `/media/${lessonId}/${name}`;
  }
  async get(lessonId: string, name: string): Promise<{ data: Buffer; type: string } | null> {
    if (!SAFE.test(lessonId) || !NAME.test(name)) return null;
    try { return { data: await readFile(join(this.root, lessonId, name)), type: TYPES[name.split('.').pop()!] }; } catch { return null; }
  }
}

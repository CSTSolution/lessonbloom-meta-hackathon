// One job at a time per account (Son, 29 Oct): reading a book or making a lesson. The others wait in
// order, and the page shows the line. The whole app runs at most `max` jobs at once so Meta is not
// flooded. The steps to run live in memory and the line in the `jobs` table; a restart ends what was
// running or waiting as interrupted, and gives back any credit it held (main.ts).
import { newId } from './auth/accounts.ts';
import type { Sql } from './db/sql.ts';

export type JobKind = 'lesson' | 'book';
export interface JobRow { id: string; teacher_id: string; kind: JobKind; ref: string; title: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'; progress: string; hold: number; created_at: string; started_at: string | null; ended_at: string | null }
export interface JobCtl { id: string; stopped: boolean; progress: (text: string) => Promise<void> }
interface Steps { run: (j: JobCtl) => Promise<void>; cancel?: () => Promise<void> }

export class Jobs {
  private steps = new Map<string, Steps>();
  private running = new Map<string, { ctl: JobCtl; teacher: string }>();
  private line: Promise<void> = Promise.resolve();
  constructor(private sql: Sql, private max = 3) {}

  async add(teacherId: string, kind: JobKind, ref: string, title: string, run: Steps['run'], cancel?: Steps['cancel'], hold = 0): Promise<string> {
    const id = newId(10);
    await this.sql.query('insert into jobs (id, teacher_id, kind, ref, title, hold) values ($1, $2, $3, $4, $5, $6)', [id, teacherId, kind, ref, title.slice(0, 120), hold]);
    this.steps.set(id, { run, cancel });
    void this.pump();
    return id;
  }

  // Start whatever may start now: one per account, `max` in all, oldest first. Runs one at a time.
  pump(): Promise<void> {
    this.line = this.line.then(async () => {
      const busy = new Set([...this.running.values()].map((r) => r.teacher));
      for (const j of await this.sql.query<JobRow>(`select * from jobs where status = 'queued' order by created_at, id`)) {
        if (this.running.size >= this.max) break;
        if (busy.has(j.teacher_id)) continue;
        const s = this.steps.get(j.id);
        if (!s) { await this.end(j.id, 'error', 'interrupted'); continue; }
        busy.add(j.teacher_id);
        this.start(j, s);
      }
    }).catch((e) => console.error(`[jobs] ${(e as Error).message}`));
    return this.line;
  }

  private start(j: JobRow, s: Steps) {
    const ctl: JobCtl = { id: j.id, stopped: false, progress: async (text) => { await this.sql.query('update jobs set progress = $2 where id = $1', [j.id, text.slice(0, 200)]); } };
    this.running.set(j.id, { ctl, teacher: j.teacher_id });
    void (async () => {
      await this.sql.query(`update jobs set status = 'running', started_at = now() where id = $1`, [j.id]);
      let status: JobRow['status'] = 'done', note: string | undefined;
      try { await s.run(ctl); if (ctl.stopped) status = 'cancelled'; } catch (e) { status = 'error'; note = String((e as Error)?.message || e).slice(0, 200); console.error(`[jobs] ${j.kind} ${j.ref}: ${note}`); }
      await this.end(j.id, status, note).catch(() => {});
      this.running.delete(j.id); this.steps.delete(j.id);
      void this.pump();
    })();
  }

  private end(id: string, status: JobRow['status'], note?: string) {
    return this.sql.query(`update jobs set status = $2, ended_at = now()${note !== undefined ? ', progress = $3' : ''} where id = $1`, note !== undefined ? [id, status, note] : [id, status]);
  }

  // Waiting: taken out of the line (its cancel step runs). Running: asked to stop where it can (reading a book).
  async cancel(teacherId: string, id: string): Promise<'cancelled' | 'stopping' | 'notFound' | 'cannotStop'> {
    const j = await this.sql.one<JobRow>('select * from jobs where id = $1 and teacher_id = $2', [id, teacherId]);
    if (!j) return 'notFound';
    if (j.status === 'queued') {
      const s = this.steps.get(id);
      await this.end(id, 'cancelled');
      this.steps.delete(id);
      await s?.cancel?.().catch((e) => console.error(`[jobs] cancel ${id}: ${(e as Error).message}`));
      return 'cancelled';
    }
    const r = this.running.get(id);
    if (j.status === 'running' && r) { if (j.kind !== 'book') return 'cannotStop'; r.ctl.stopped = true; return 'stopping'; }
    return 'notFound';
  }

  // Her line: what runs, then what waits (with its place), and what ended in the last two minutes.
  async list(teacherId: string) {
    const rows = await this.sql.query<JobRow>(`select * from jobs where teacher_id = $1 and (status in ('queued', 'running') or ended_at > now() - interval '2 minutes') order by created_at, id`, [teacherId]);
    const active = rows.filter((r) => r.status === 'running' || r.status === 'queued').sort((a, b) => (a.status === 'running' ? -1 : b.status === 'running' ? 1 : 0));
    return rows.map((r) => ({ id: r.id, kind: r.kind, ref: r.ref, title: r.title, status: r.status, progress: r.progress, place: r.status === 'queued' ? active.indexOf(r) + 1 : r.status === 'running' ? 1 : 0 }));
  }
  async placeOf(teacherId: string, ref: string) {
    return (await this.list(teacherId)).find((x) => x.ref === ref && (x.status === 'queued' || x.status === 'running')) ?? null;
  }
  idle() { return this.running.size === 0; }
}

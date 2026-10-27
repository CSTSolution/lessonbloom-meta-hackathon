// The lessons table, and the background job that builds one.
import { newId } from '../auth/accounts.ts';
import type { AI } from '../ai/types.ts';
import type { Sql } from '../db/sql.ts';
import { buildLesson } from './agent.ts';
import type { Lesson, Setup } from './types.ts';

const J = (v: unknown) => JSON.stringify(v);

export class Lessons {
  constructor(private sql: Sql) {}

  async create(teacherId: string, setup: Setup, source: string): Promise<string> {
    const id = newId(10);
    await this.sql.query(`insert into lessons (id, teacher_id, status, setup, source, steps) values ($1, $2, 'working', $3::jsonb, $4, $5::jsonb)`,
      [id, teacherId, J(setup), source, J([{ at: new Date().toISOString(), vi: 'Trợ lý bắt đầu đọc ghi chú của cô…', en: 'The agent is reading your notes…' }])]);
    return id;
  }
  get(teacherId: string, id: string) { return this.sql.one<Lesson>('select * from lessons where id = $1 and teacher_id = $2', [id, teacherId]); }
  list(teacherId: string) {
    return this.sql.query<Pick<Lesson, 'id' | 'status' | 'setup' | 'created_at'> & { slides: number; items: number }>(
      `select id, status, setup, created_at, jsonb_array_length(slides) as slides, jsonb_array_length(items) as items from lessons where teacher_id = $1 order by created_at desc limit 100`, [teacherId]);
  }
  async madeToday(teacherId: string) {
    return Number((await this.sql.one<{ n: string }>(`select count(*) as n from lessons where teacher_id = $1 and created_at >= date_trunc('day', now())`, [teacherId]))?.n || 0);
  }
  async step(id: string, vi: string, en: string) {
    await this.sql.query(`update lessons set steps = steps || $2::jsonb, updated_at = now() where id = $1`, [id, J([{ at: new Date().toISOString(), vi, en }])]);
  }
  async finish(id: string, b: Pick<Lesson, 'skills' | 'slides' | 'items' | 'cards' | 'rejected' | 'agent'>) {
    await this.sql.query(`update lessons set status = 'ready', skills = $2::jsonb, slides = $3::jsonb, items = $4::jsonb, cards = $5::jsonb, rejected = $6::jsonb, agent = $7::jsonb, updated_at = now() where id = $1`,
      [id, J(b.skills), J(b.slides), J(b.items), J(b.cards), J(b.rejected), J(b.agent)]);
  }
  async fail(id: string) {
    await this.sql.query(`update lessons set status = 'error', error = 'failed', updated_at = now() where id = $1`, [id]);
  }
}

// Builds the lesson in the background; the teacher's page polls and shows the agent's steps live.
export async function runLesson(ai: AI, lessons: Lessons, id: string, setup: Setup, source: string) {
  try {
    const b = await buildLesson(ai, setup, source, (vi, en) => lessons.step(id, vi, en));
    await lessons.step(id, 'Xong! Cô xem bài giảng và ghi chú của trợ lý nhé.', 'Done! Have a look at the lesson and the agent\'s note.');
    await lessons.finish(id, b);
  } catch (e) {
    // the teacher sees a plain message; details stay in the server log
    console.error(`[lesson] ${id} failed: ${String((e as Error)?.stack || e).slice(0, 1500)}`);
    await lessons.step(id, 'Chưa soạn được bài này. Cô thử lại sau ít phút nhé.', 'This lesson could not be made. Please try again in a few minutes.').catch(() => {});
    await lessons.fail(id);
  }
}

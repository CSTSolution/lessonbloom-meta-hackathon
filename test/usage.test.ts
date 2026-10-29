// Credits as she sees them (Son, 29 Oct): every call taken off her balance and shown on the usage page
// by kind, by day and by lesson or book; a line of lessons cannot spend credit she does not have; the
// two ways in still work (her own book uploaded to Knowledge, then a typed or photographed request).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../server/config.ts';
import { areaWithBook, lessonFrom, testServer } from './helpers.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('usage: her uploaded book and a photographed request make a lesson; what it cost comes off her credits and shows by kind, day and lesson', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const start = (await call('GET', '/api/t/me')).json.credits.left;
  assert.equal(start, config.guard.signupCredits);
  // her own book, uploaded to Knowledge and read into lessons
  const { areaId, bookId } = await areaWithBook(call, 'maths2');
  const area = (await call('GET', `/api/t/areas/${areaId}`)).json;
  assert.equal(area.books.find((b: any) => b.id === bookId).status, 'ready');
  assert.ok(area.sections.length >= 2, 'the uploaded book is split into lessons');
  // the instruction from a photo of the lesson, then the lesson from it
  const photo = await call('POST', '/api/t/notes/photos', { images: [{ type: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64') }] });
  assert.equal(photo.status, 200);
  assert.ok(String(photo.json.text).length > 0, 'the photo is read into a request');
  const { id, lesson } = await lessonFrom(call, areaId, 'Lesson 21 adding with regrouping', { pictures: true });
  assert.equal(lesson.status, 'ready');
  await wait(100);
  const rows = await s.sql.query<{ usd: string; held: boolean }>(`select usd, held from ai_usage u join teachers t on t.id = u.teacher_id where t.kind = 'demo'`);
  const spent = rows.reduce((n, r) => n + Number(r.usd) * 100, 0);
  assert.ok(spent > 0 && rows.every((r) => !r.held));
  const left = (await call('GET', '/api/t/me')).json.credits.left;
  assert.equal(left, Math.max(0, Math.floor(start - spent + 1e-9)), 'every call came off her balance');

  const u = (await call('GET', '/api/t/usage?days=7')).json;
  assert.equal(u.daily.length, 7);
  assert.ok(u.kinds.lessons.credits > 0 && u.kinds.photos.credits > 0, 'lesson writing and the photo are counted');
  assert.ok(Math.abs(u.period.credits - spent) < 0.6, 'the kinds add up to what she spent');
  const day = u.daily.at(-1), dayTotal = Object.entries(day).filter(([k]) => k !== 'day').reduce((n, [, v]) => n + Number(v), 0);
  assert.ok(Math.abs(dayTotal - u.period.credits) < 0.6, 'today carries it all');
  const item = u.items.find((x: any) => x.kind === 'lesson' && x.id === id);
  assert.ok(item && item.credits > 0 && item.parts.lessons > 0, 'the lesson, with its parts');
  assert.equal(item.title, lesson.setup.title);
  const book = u.items.find((x: any) => x.kind === 'book' && x.id === bookId);
  if (book) assert.ok(book.parts.books > 0, 'reading the book is its own line');
  assert.deepEqual(u.log.map((g: any) => [g.reason, g.credits]), [['signup', start]], 'she started with the sign-up credits');
  // only her own
  const other = s.client('198.51.100.9');
  await other('POST', '/api/auth/demo', { lang: 'en' });
  const o = (await other('GET', '/api/t/usage')).json;
  assert.equal(o.period.credits, 0);
  assert.equal(o.items.length, 0);
});

test('credits: a lesson waiting in her line keeps its credits; a new one is refused when the rest is not enough', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const me = (await s.sql.one<{ id: string }>(`select id from teachers where kind = 'demo'`))!;
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Lesson 21' })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  // one lesson already waiting, and credit for one lesson but not two
  await s.sql.query(`update teachers set credits = $2 where id = $1`, [me.id, config.guard.lessonCredits + 10]);
  await s.sql.query(`insert into jobs (id, teacher_id, kind, ref, title, status) values ('waiting1', $1, 'lesson', 'none', 'Waiting', 'queued')`, [me.id]);
  const r = await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Lesson 21', setup });
  assert.equal(r.status, 429);
  assert.equal(r.json.code, 'creditsLine', 'her credits are kept for the lesson already waiting');
  const have = (await call('POST', '/api/t/scan/estimate', { pages: 20 })).json.estimate.have;
  assert.ok(have >= 9 && have <= 10, `a scan counts only what is not promised (${have})`);
  assert.equal((await call('GET', '/api/t/usage')).json.promised, config.guard.lessonCredits);
  // once it has gone, the new lesson is made
  await s.sql.query(`update jobs set status = 'done' where id = 'waiting1'`);
  const ok = await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Lesson 21', setup });
  assert.equal(ok.status, 200);
});

test('credits: a lesson whose turn comes after her credit ran out stops with a plain message, and spends nothing', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const me = (await s.sql.one<{ id: string }>(`select id from teachers where kind = 'demo'`))!;
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Lesson 21' })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  // her line is busy with a book; the lesson waits; meanwhile her credit runs out
  await s.sql.query(`insert into jobs (id, teacher_id, kind, ref, title, status) values ('busy1', $1, 'book', 'b', 'Book', 'running')`, [me.id]);
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Lesson 21', setup })).json;
  assert.ok(id);
  const before = Number((await s.sql.one<{ n: string }>(`select count(*) as n from ai_usage where lesson_id = $1`, [id]))?.n);
  assert.equal(before, 0);
  await s.sql.query(`update teachers set credits = 0 where id = $1`, [me.id]);
  await s.sql.query(`update jobs set status = 'done' where id = 'busy1'`);
  // the queue looks again when something ends; here a fresh job nudges it
  await call('POST', `/api/t/areas/${areaId}/books/text`, { title: 'Nudge', pages: [{ page: 1, text: 'Unit 1: Hello\nHello! I am Mia. What is your name?' }] });
  let l: any;
  for (let i = 0; i < 300; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working') break; await wait(10); }
  assert.equal(l.status, 'error');
  assert.match(l.steps.at(-1).en, /ran out of credits/);
  assert.equal(Number((await s.sql.one<{ n: string }>(`select count(*) as n from ai_usage where lesson_id = $1`, [id]))?.n), 0, 'nothing was spent on it');
});

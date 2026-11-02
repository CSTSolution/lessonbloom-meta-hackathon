// Credits as she sees them (Son, 29 Oct): every call taken off her balance and shown on the usage page
// by kind, by day and by lesson or book; a line of lessons cannot spend credit she does not have; the
// two ways in still work (her own book uploaded to Knowledge, then a typed or photographed request).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../server/config.ts';
import { areaWithBook, lessonFrom, settled, testServer } from './helpers.ts';

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
  await settled(s.sql, id);
  const rows = await s.sql.query<{ usd: string; held: boolean; lesson_id: string | null }>(`select usd, held, lesson_id from ai_usage u join teachers t on t.id = u.teacher_id where t.kind = 'demo' and u.endpoint not in ('skills', 'skilllinks')`);   // the skills map is free
  const spent = rows.reduce((n, r) => n + Number(r.usd) * 100, 0), heldCost = rows.filter((r) => r.held).reduce((n, r) => n + Number(r.usd) * 100, 0);
  assert.ok(spent > 0 && heldCost > 0 && rows.filter((r) => r.held).every((r) => r.lesson_id === id), 'the lesson was paid from its hold');
  const left = (await call('GET', '/api/t/me')).json.credits.left;
  assert.equal(left, Math.max(0, Math.floor(start - (spent - heldCost) - Math.ceil(heldCost - 1e-9) + 1e-9)), 'what it cost came off her balance, the rest of the hold came back');
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
  assert.deepEqual(u.log.map((g: any) => g.reason), ['refund', 'hold', 'signup'], 'held for the lesson, the rest back, and the sign-up credits');
  assert.equal(u.log.at(-1).credits, start, 'she started with the sign-up credits');
  assert.equal(u.log[1].credits, -config.guard.lessonCredits);
  assert.equal(u.log[1].title, lesson.setup.title, 'the hold names the lesson');
  // only her own
  const other = s.client('198.51.100.9');
  await other('POST', '/api/auth/demo', { lang: 'en' });
  const o = (await other('GET', '/api/t/usage')).json;
  assert.equal(o.period.credits, 0);
  assert.equal(o.items.length, 0);
});

test('credits: a lesson holds its credits while it waits; a new one is refused while too much is held, and the rest comes back', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const me = (await s.sql.one<{ id: string }>(`select id from teachers where kind = 'demo'`))!;
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Lesson 21' })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  await wait(50);
  const need = config.guard.lessonCredits;
  await s.sql.query(`update teachers set credits = $2 where id = $1`, [me.id, need + 10]);
  // her line is busy with a book, so the lesson waits, holding its credits
  let free!: () => void;
  await s.jobs.add(me.id, 'book', 'b', 'Book', () => new Promise<void>((r) => { free = r; }));
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Lesson 21', setup })).json;
  assert.ok(id);
  const after = (await call('GET', '/api/t/me')).json.credits.left;
  assert.ok(after <= 10 && after >= 8, `held at once (${after} left; the request check costs a little)`);
  assert.equal((await call('GET', '/api/t/usage')).json.promised, need);
  const r = await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Lesson 21', setup });
  assert.equal(r.status, 429);
  assert.equal(r.json.code, 'creditsHeld', 'she is told the credit is held for work in progress');
  // a waiting lesson cancelled: every held credit comes back
  const job = (await call('GET', '/api/t/jobs')).json.jobs.find((j: any) => j.ref === id);
  assert.equal((await call('POST', `/api/t/jobs/${job.id}/cancel`)).status, 200);
  assert.equal((await call('GET', '/api/t/me')).json.credits.left, after + need, 'all of the hold came back');
  assert.equal((await call('GET', `/api/t/lessons/${id}`)).status, 404, 'the waiting lesson is gone');
  free();
});

test('credits: a held lesson runs even if her balance hits zero meanwhile; what it did not use comes back', async () => {
  const s = await testServer(), call = s.client();
  await call('POST', '/api/auth/demo', { lang: 'en' });
  const { areaId } = await areaWithBook(call, 'maths2');
  const me = (await s.sql.one<{ id: string }>(`select id from teachers where kind = 'demo'`))!;
  const match = (await call('POST', `/api/t/areas/${areaId}/match`, { request: 'Lesson 21' })).json.match;
  const { setup } = (await call('POST', '/api/t/intake', { areaId, sectionId: match.sectionId })).json;
  await wait(50);
  await s.sql.query(`update teachers set credits = $2 where id = $1`, [me.id, config.guard.lessonCredits]);
  const { id } = (await call('POST', '/api/t/lessons', { areaId, sectionId: match.sectionId, request: 'Lesson 21', setup })).json;
  let l: any;
  for (let i = 0; i < 400; i++) { l = (await call('GET', `/api/t/lessons/${id}`)).json.lesson; if (l.status !== 'working') break; await wait(10); }
  assert.equal(l.status, 'ready', 'paid from its hold: a balance of 0 meanwhile does not stop it');
  await settled(s.sql, id);
  const used = Number((await s.sql.one<{ n: string }>(`select sum(usd) * 100 as n from ai_usage where lesson_id = $1 and held`, [id]))?.n);
  assert.equal((await call('GET', '/api/t/me')).json.credits.left, config.guard.lessonCredits - Math.ceil(used - 1e-9));
});

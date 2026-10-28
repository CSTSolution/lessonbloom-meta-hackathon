// Guard layer 1, the money: spending logged at Meta's prices, and every cap that stops new work.
// (Its own file: in the same run as the CPU-heavy layer 3 tests, PGlite's start sometimes stalled.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../server/config.ts';
import { Budget, costOf } from '../server/guard/guard.ts';
import { testServer } from './helpers.ts';

test('layer 1: spending is logged at Meta\'s prices, and the teacher cap, app budget, total cap and kill switch stop new work', async () => {
  const s = await testServer();
  await s.sql.query(`insert into teachers (id, kind, credits) values ('t1', 'demo', 100), ('t2', 'demo', 100)`);
  const b = new Budget(s.sql);
  assert.equal(await b.check('t1'), null);
  await b.record({ endpoint: 'image', model: 'muse-image-1.0', images: 100 }, 't1');
  assert.equal(await b.check('t1'), 'credits', '100 pictures at $0.01 use up the 100 credits');
  assert.equal(await b.check('t2'), null);
  await b.record({ endpoint: 'write', model: 'muse-spark-1.3', outTokens: (config.guard.dayUsd / 4.25) * 1e6 + 1 }, 't2');
  assert.equal(await b.check('t2'), 'app_day');
  assert.equal(costOf({ endpoint: 'agent', model: 'muse-wonder-1.0', inTokens: 1e6, outTokens: 1e6 }), 24);
  assert.equal(costOf({ endpoint: 'items', model: 'muse-spark-1.3', inTokens: 1e6, outTokens: 1e6 }), 5.5);
  await s.sql.query(`insert into ai_usage (endpoint, model, usd, at) values ('items', 'mock', 1000, now() - interval '2 days')`);
  assert.notEqual(await b.check('t1'), 'total', 'mock spending never counts toward the Meta credit');
  await s.sql.query(`insert into ai_usage (endpoint, model, usd, at) values ('agent', 'muse-wonder-1.0', $1, now() - interval '2 days')`, [config.guard.totalUsd]);
  assert.equal(await b.check('t1'), 'total');
  config.guard.disabled = true;
  try { assert.equal(await b.check('t1'), 'disabled'); } finally { config.guard.disabled = false; }
});

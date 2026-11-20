import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { enemyScale, waveSize, slotCounts, buildWave, makeEnemy } from '../src/logic/waves.js';
import { makeRng } from '../src/logic/rng.js';

const D = loadData();
const st = D.stages[0];

test('wave size and scale', () => {
  assert.equal(waveSize(1, D.config), D.config.waveCount.base + D.config.waveCount.perWave);
  assert.equal(enemyScale(1, { mult: 1 }, D.config), 1);
});

test('slotCounts keeps total and mix-order ties', () => {
  assert.deepEqual(slotCounts({ normal: 70, fast: 30 }, 14), { normal: 10, fast: 4 });
  assert.deepEqual(slotCounts({ b: 50, a: 50 }, 3), { b: 2, a: 1 });
});

test('buildWave is deterministic, timed per slot, and rejects bad waves', () => {
  const a = buildWave(st, 1, D, makeRng(7));
  assert.deepEqual(a, buildWave(st, 1, D, makeRng(7)));
  assert.equal(new Set(a.map((s) => s.at)).size, waveSize(1, D.config));
  assert.throws(() => buildWave(st, 0, D, makeRng(1)), /bad wave/);
});

test('makeEnemy rounds hp and starts at path end', () => {
  const e = makeEnemy('normal', 3, st, D, 1, 0.3);
  assert.equal(e.hp, e.maxHp);
  assert.equal(Number.isInteger(e.hp), true);
  assert.equal(e.pos, D.config.pathLength + 0.3);
  assert.equal(e.blockedBy, null);
});

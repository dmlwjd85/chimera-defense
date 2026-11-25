import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, runOne, rollStats, findMergePair, deploySpots, applyKnobs } from '../tools/sim.mjs';
import { createBattle, makeUnit } from '../src/logic/battle.js';

const D = loadData();

test('one simulated run finishes with a summary and is repeatable', () => {
  const a = runOne(D, 3), b = runOne(D, 3);
  assert.ok(['clear', 'lose', 'timeout'].includes(a.result));
  assert.ok(a.wave >= 1 && a.wave <= 15);
  assert.ok(a.summons > 0);
  assert.deepEqual(a, b);
  assert.ok(a.field.every((s) => /^(base|chimera|weak):.+:(young|teen|adult|spirit)$/.test(s)));
});

test('bot merge pair prefers a field unit as target', () => {
  const s = createBattle(D, 'forest-1', 1);
  const f = makeUnit(s, D, { kind: 'base', speciesId: 'fox', stage: 'young', parts: null });
  Object.assign(f, { pos: 4, targetPos: 4 });
  s.field.push(f);
  s.bench[2] = makeUnit(s, D, { kind: 'base', speciesId: 'fox', stage: 'young', parts: null });
  assert.deepEqual(findMergePair(s, D, 'evolve'), [{ where: 'bench', index: 2 }, { where: 'field', uid: f.uid }]);
  assert.equal(findMergePair(s, D, 'spirit'), null);
});

test('the bot just sends animals out; the role decides where they stand', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.arenaMuster = true;
  const crow = makeUnit(s, D, { kind: 'base', speciesId: 'crow', stage: 'young', parts: null });
  assert.deepEqual(deploySpots(s, crow), [0]);
});

test('summon luck numbers are deterministic and in range', () => {
  const r1 = rollStats(D, 200, 24, 7), r2 = rollStats(D, 200, 24, 7);
  assert.deepEqual(r1, r2);
  for (const k of ['spiritPct', 'chimeraPct']) assert.ok(r1[k] >= 0 && r1[k] <= 100);
  assert.ok(r1.avgChimera + r1.avgSpirit <= 3, 'at most 24 young = 3 products');
});

test('what-if knobs change only the in-memory copy', () => {
  const d = applyKnobs(loadData(), { enemyHp: 0.5, hpGrowth: 0.1 });
  assert.equal(d.config.enemyHpGrowth, 0.1);
  assert.equal(d.enemyById.normal.hp, D.enemyById.normal.hp * 0.5);
  assert.equal(loadData().config.enemyHpGrowth, D.config.enemyHpGrowth);
});

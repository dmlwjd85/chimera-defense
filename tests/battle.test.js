import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import * as B from '../src/logic/battle.js';

const D = loadData();
const STAGE = D.stages[0].id;
const add = (s, sp, stage) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage, parts: null });

test('create and summon costs', () => {
  const s = B.createBattle(D, STAGE, 1);
  assert.deepEqual([s.gold, s.life, s.bench.length, s.phase], [D.config.startGold, D.config.life, D.config.benchSize, 'prep']);
  B.summon(s, D); B.summon(s, D);
  assert.equal(s.gold, D.config.startGold - 40 - 45);
  assert.equal(B.summon(s, D).reason, 'gold');
});

test('bench and field limits', () => {
  const s = B.createBattle(D, STAGE, 2);
  s.gold = 9999;
  for (let i = 0; i < D.config.benchSize; i++) B.summon(s, D);
  assert.equal(B.summon(s, D).reason, 'benchFull');
  assert.ok(B.deploy(s, D, 0, 3).ok);
  assert.equal(B.deploy(s, D, 1, 3.2).reason, 'occupied');
});

test('merges update bench and discoveries', () => {
  const s = B.createBattle(D, STAGE, 3);
  s.bench[0] = add(s, 'fox', 'young'); s.bench[1] = add(s, 'fox', 'young');
  const r = B.merge(s, D, { where: 'bench', index: 0 }, { where: 'bench', index: 1 });
  assert.deepEqual([r.kind, s.bench[1].stage, s.bench.filter(Boolean).length], ['evolve', 'teen', 1]);
  s.bench[2] = add(s, 'fox', 'adult'); s.bench[3] = add(s, 'crow', 'adult');
  B.merge(s, D, { where: 'bench', index: 2 }, { where: 'bench', index: 3 });
  assert.ok(s.known.recipes.has('cheese_thief'));
  s.bench[2] = add(s, 'fox', 'adult'); s.bench[4] = add(s, 'bear', 'adult');
  assert.equal(B.merge(s, D, { where: 'bench', index: 2 }, { where: 'bench', index: 4 }).kind, 'weak');
  assert.ok(s.known.failed.has('bear+fox'));
});

test('empty field leaks wave 1, then lose at low life', () => {
  const s = B.createBattle(D, STAGE, 5);
  for (let i = 0; i < 2000 && s.wave === 1; i++) B.step(s, D, 0.1);
  assert.deepEqual([s.wave, s.phase], [2, 'prep']);
  assert.equal(s.life, D.config.life - 10);
  const t = B.createBattle(D, STAGE, 6);
  t.life = 1;
  for (let i = 0; i < 2000 && t.phase !== 'ended'; i++) B.step(t, D, 0.1);
  assert.deepEqual([t.result, t.life], ['lose', 0]);
});

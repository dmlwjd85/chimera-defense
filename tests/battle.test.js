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
  // the camp is a 3×3 grid: one animal per cell, outside the camp is refused
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('bear'), mk('fox'), mk('wolf'), mk('bison'), mk('crow')];
  assert.ok(B.deploy(s, D, 0, 2.5).ok && B.deploy(s, D, 1, 2.4).ok && B.deploy(s, D, 2, 2.6).ok);
  assert.deepEqual(s.field.map((u) => u.cell.r).sort(), [0, 1, 2]);
  assert.ok(s.field.every((u) => u.pos === 2.5 && u.cell.c === 2));
  assert.equal(B.deploy(s, D, 3, 2.5).reason, 'occupied');
  assert.equal(B.deploy(s, D, 3, 6).reason, 'outsideCamp');
  assert.ok(B.deploy(s, D, 4, 0.5, { row: 0 }).ok, 'crow takes a cell too and hovers above it');
  assert.equal(s.field.find((u) => u.speciesId === 'crow').skyY, D.config.grid.skyY[0]);
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

test('the camp marches to the middle as one block and walks back after the wave', () => {
  const s = B.createBattle(D, STAGE, 4);
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('bear'), mk('fox'), mk('crow')];
  B.deploy(s, D, 0, 2.5, { row: 1 }); B.deploy(s, D, 1, 0.5, { row: 2 }); B.deploy(s, D, 2, 1.5, { row: 0 });
  B.skipPrep(s, D);
  const f = D.config.formation, g = f.colGap;
  assert.deepEqual(s.field.map((u) => u.targetPos), [f.front, f.front - 2 * g, f.front - g], 'columns close up a little in battle');
  B.standDown(s);
  assert.deepEqual(s.field.map((u) => u.pos), [2.5, 0.5, 1.5]);
});

test('swap exchanges cells without merging', () => {
  const s = B.createBattle(D, STAGE, 5);
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('bear'), mk('bear'), mk('fox')];
  B.deploy(s, D, 0, 2.5, { row: 1 }); B.deploy(s, D, 1, 0.5, { row: 0 });
  const [a, b] = s.field;
  assert.ok(B.swap(s, D, { where: 'field', uid: a.uid }, { where: 'field', uid: b.uid }).ok);
  assert.deepEqual([a.cell, b.cell], [{ c: 0, r: 0 }, { c: 2, r: 1 }]);
  assert.equal(s.field.length, 2);
  assert.ok(B.swap(s, D, { where: 'bench', index: 2 }, { where: 'field', uid: a.uid }).ok);
  assert.equal(s.field.find((u) => u.speciesId === 'fox').cell.c, 0);
});

test('brawl: a free melee animal joins an ally holding an enemy; a leaker gets cut off', async () => {
  const { brawl } = await import('../src/logic/combat.js');
  const { makeEnemy } = await import('../src/logic/waves.js');
  const s = B.createBattle(D, STAGE, 6);
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('bear'), mk('tiger'), mk('bison')];
  B.deploy(s, D, 0, 2.5, { row: 1 }); B.deploy(s, D, 1, 1.5, { row: 0 }); B.deploy(s, D, 2, 0.5, { row: 2 });
  B.skipPrep(s, D);
  const [bear, tiger, bison] = s.field;
  for (const u of s.field) u.pos = u.targetPos;
  const held = makeEnemy('normal', 1, s.stage, D, 900); held.pos = bear.pos + D.config.blockedOffset; held.blockedBy = bear.uid;
  s.enemies = [held];
  brawl(s, D.config, 1);
  assert.ok(Math.abs(tiger.targetPos - (held.pos - D.config.blockedOffset)) < 1e-9, 'tiger walks up to help the bear');
  const leak = makeEnemy('normal', 1, s.stage, D, 901); leak.pos = bison.slot - 1.5;
  s.enemies = [held, leak]; for (const u of s.field) u.engageCd = 0;
  brawl(s, D.config, 1);
  const chaser = s.field.find((u) => u.intercept === leak.eid);
  assert.ok(chaser && chaser !== bear, 'someone free runs back to cut the leaker off');
  assert.ok(chaser.targetPos < leak.pos, 'and stands in front of it');
});

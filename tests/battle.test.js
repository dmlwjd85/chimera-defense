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
  // no camp cells: a cage animal goes into the gate and takes its spot from its role
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('bear'), mk('fox'), mk('wolf'), mk('bison'), mk('crow'), mk('tiger'), mk('dog')];
  for (let i = 0; i < 6; i++) assert.ok(B.deploy(s, D, i).ok);
  assert.equal(B.deploy(s, D, 6).reason, 'fieldFull');
  assert.ok(s.field.every((u) => u.inGate && u.pos === D.config.muster.gate), 'everyone waits inside the gate during prep');
  const by = (sp) => s.field.find((u) => u.speciesId === sp);
  const f = D.config.formation.front;
  assert.equal(by('bear').slot, f, 'bruisers hold the front line');
  assert.equal(by('bison').slot, f);
  assert.notEqual(by('bear').rowY, by('bison').rowY, 'two bruisers split the depth');
  assert.ok(by('tiger').slot < f && by('fox').slot < by('tiger').slot && by('wolf').slot < by('fox').slot, 'dealer, then ranged, then support further back');
  assert.ok([0.18, 0.82].includes(by('tiger').rowY), 'a melee dealer starts on a flank');
  assert.equal(by('crow').skyY, D.config.muster.sky[0], 'flyers hover');
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
  assert.equal(s.life, D.config.life - (D.config.waveCount.base + D.config.waveCount.perWave));   // 1웨이브 일반 적 수만큼 샘
  const t = B.createBattle(D, STAGE, 6);
  t.life = 1;
  for (let i = 0; i < 2000 && t.phase !== 'ended'; i++) B.step(t, D, 0.1);
  assert.deepEqual([t.result, t.life], ['lose', 0]);
});

test('wave start: animals run out of the gate one by one in a line, spread to their spots, and walk back in after', () => {
  const s = B.createBattle(D, STAGE, 4);
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('fox'), mk('bear'), mk('crow')];
  for (let i = 0; i < 3; i++) B.deploy(s, D, i);
  B.skipPrep(s, D);
  const [fox, bear, crow] = s.field;
  assert.ok(bear.gateDelay < crow.gateDelay && crow.gateDelay < fox.gateDelay, 'front-liners first, ranged last');
  B.step(s, D, 0.05);
  assert.ok(!bear.inGate && fox.inGate, 'the bear is out first, the fox still waits');
  assert.equal(bear.targetY, D.config.muster.gateY, 'first straight out of the doorway');
  for (let i = 0; i < 40; i++) B.step(s, D, 0.1);
  assert.ok(s.field.every((u) => !u.inGate && !u.rushing), 'everyone is out and settled');
  assert.ok(Math.abs(bear.pos - bear.slot) < 0.6 && Math.abs(fox.pos - fox.slot) < 0.6, 'standing near their role spots');
  B.standDown(s, D);
  assert.ok(s.field.every((u) => u.inGate && u.pos === D.config.muster.gate), 'back inside the gate');
});

test('a fallen animal gets up inside the gate and runs back out', () => {
  const s = B.createBattle(D, STAGE, 7);
  s.bench = [B.makeUnit(s, D, { kind: 'base', speciesId: 'bear', stage: 'young', parts: null })];
  B.deploy(s, D, 0); B.skipPrep(s, D);
  for (let i = 0; i < 40; i++) B.step(s, D, 0.1);
  const bear = s.field[0];
  Object.assign(bear, { down: true, hp: 0, respawnLeft: 0.05 });
  B.step(s, D, 0.1);
  assert.ok(!bear.down && (bear.inGate || bear.rushing), 'back from the gate');
  for (let i = 0; i < 60; i++) B.step(s, D, 0.1);
  assert.ok(!bear.inGate && !bear.rushing && bear.pos > 3, 'and back at the front');
});

test('enemies come out of the portal in a line, then spread to their own depth', () => {
  const s = B.createBattle(D, STAGE, 9);
  B.skipPrep(s, D);
  for (let i = 0; i < 200 && !s.enemies.length; i++) B.step(s, D, 0.05);
  const e = s.enemies[0];
  assert.ok(Math.abs(e.y - D.config.muster.portalY) < 0.06, 'comes out of the middle of the portal');
  for (let i = 0; i < 60; i++) B.step(s, D, 0.05);
  assert.ok(Math.abs(e.y - e.homeY) < 0.05, 'fanned out with nobody in sight');
});

test('swap: bench animal takes the field spot; field animals cannot trade spots by hand', () => {
  const s = B.createBattle(D, STAGE, 5);
  const mk = (sp) => B.makeUnit(s, D, { kind: 'base', speciesId: sp, stage: 'young', parts: null });
  s.bench = [mk('bear'), mk('fox'), mk('tiger')];
  B.deploy(s, D, 0); B.deploy(s, D, 1);
  const [a, b] = s.field;
  assert.ok(B.swap(s, D, { where: 'field', uid: a.uid }, { where: 'field', uid: b.uid }).ok);
  assert.equal(s.field.length, 2);
  assert.ok(B.swap(s, D, { where: 'bench', index: 2 }, { where: 'field', uid: a.uid }).ok);
  const tiger = s.field.find((u) => u.speciesId === 'tiger');
  assert.ok(tiger && tiger.inGate && s.bench[2].speciesId === 'bear');
  assert.equal(tiger.slot, D.config.formation.front, 'with no bruiser left the dealer leads');
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

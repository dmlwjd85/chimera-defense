import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit, mkEnemy, mkState } from './helpers.js';
import * as E from '../src/logic/effects.js';

const D = loadData();
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('aura reaches nearby living units only', async () => {
  const w = await mkUnit(D, 1, 'wolf', 'young', 3), a = await mkUnit(D, 2, 'fox', 'young', 4.5), b = await mkUnit(D, 3, 'fox', 'young', 6);
  const m = E.auraMultipliers(mkState(D, [w, a, b], []));
  assert.ok(near(m.get(2).dmgMult, 1.1) && near(m.get(3).dmgMult, 1));
  w.down = true;
  assert.ok(near(E.auraMultipliers(mkState(D, [w, a, b], [])).get(2).dmgMult, 1));
});

test('poison ticks and velocity rules', async () => {
  const e = await mkEnemy(D, 'tough', 5);
  Object.assign(e, { poisonDps: 6, poisonLeft: 3 });
  E.tickEnemyTimers(mkState(D, [], [e]), 1);
  assert.ok(near(e.hp, e.maxHp - 6) && near(e.poisonLeft, 2));
  const n = await mkEnemy(D, 'normal', 5);
  assert.ok(near(E.enemyVelocity(n), -n.speed));
  Object.assign(n, { slowPct: 20, slowLeft: 1 });
  assert.ok(near(E.enemyVelocity(n), -0.8 * n.speed));
  n.confuseLeft = 1;
  assert.ok(E.enemyVelocity(n) > 0);
  n.holdLeft = 1;
  assert.equal(E.enemyVelocity(n), 0);
});

test('knockback pushes the primary enemy every N hits', async () => {
  const sh = await mkUnit(D, 1, 'bighorn', 'young', 3);
  const e = await mkEnemy(D, 'normal', 3.3);
  e.blockedBy = 1;
  const every = E.findEffect(sh, 'knockback').every;
  for (let i = 0; i < every; i++) E.applyOnHit(mkState(D, [sh], [e]), sh, [e], e, D.config);
  assert.ok(e.pos > 3.3 && e.blockedBy === null && sh.pos === 3);
});

test('bear holds blocked enemies, frog pulls one in', async () => {
  const bear = await mkUnit(D, 2, 'bear', 'young', 3);
  const e1 = await mkEnemy(D, 'normal', 3.3, 5), e2 = await mkEnemy(D, 'normal', 3.3, 6);
  e1.blockedBy = e2.blockedBy = 2;
  E.tickUnitSkills(mkState(D, [bear], [e1, e2]), 0.05, D.config);
  assert.ok(e1.holdLeft > 0 && e2.holdLeft > 0 && bear.skillCd.hold > 0);
  const frog = await mkUnit(D, 3, 'frog', 'young', 2);
  const e3 = await mkEnemy(D, 'normal', 4.5, 7);
  E.tickUnitSkills(mkState(D, [frog], [e3]), 0.05, D.config);
  assert.ok(near(e3.pos, 2 + D.config.blockedOffset) && e3.blockedBy === 3);
});

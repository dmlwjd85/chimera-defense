import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlanData as loadData, mkUnit, mkEnemy, mkState } from './helpers.js';
import { combatTick } from '../src/logic/combat.js';

const D = loadData();
const run = (s, sec) => { for (let t = 0; t < sec; t += 0.05) { combatTick(s, D, 0.05); s.time += 0.05; } };

test('bear blocks up to its block count', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'young', 3);
  const es = await Promise.all([5, 5.2, 5.4, 5.6].map((p, i) => mkEnemy(D, 'normal', p, i + 1)));
  const s = mkState(D, [bear], es);
  run(s, 2.2);
  const on = s.enemies.filter((e) => e.blockedBy === 1);
  assert.equal(on.filter((e) => !e.crowd).length, bear.stats.block, '정식으로 막는 수는 막기 수만큼');
  assert.equal(on.length, 4, '넘친 적도 지나가지 않고 달라붙어 싸움');
});

test('넘친 적은 잠시 치고받다가 밀치고 빠져나감, 같은 동물에게 다시 붙지 않음', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'young', 3);
  bear.stats.hp = bear.hp = bear.maxHp = 1e9;
  const es = await Promise.all([5, 5.2, 5.4, 5.6].map((p, i) => mkEnemy(D, 'normal', p, i + 1)));
  for (const e of es) e.hp = e.maxHp = 1e9;
  const s = mkState(D, [bear], es);
  run(s, 2.2);
  const extra = s.enemies.find((e) => e.crowd);
  assert.ok(extra, '달라붙은 적');
  run(s, D.config.crowd.hold + 0.5);
  assert.ok(extra.blockedBy === null && extra.passed.includes(1) && extra.pos < bear.pos, '빠져나감');
  assert.equal(s.enemies.filter((e) => e.blockedBy === 1).length, bear.stats.block);
});

test('flying enemies pass melee units; ranged units hit them', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'young', 3);
  const fly = await mkEnemy(D, 'flying', 4);
  const s = mkState(D, [bear], [fly]);
  run(s, 1);
  assert.equal(fly.blockedBy, null);
  assert.equal(fly.hp, fly.maxHp);
  const fox = await mkUnit(D, 2, 'fox', 'young', 3);
  const fly2 = await mkEnemy(D, 'flying', 4.5, 2);
  const s2 = mkState(D, [fox], [fly2]);
  run(s2, 1);
  assert.ok(fly2.hp < fly2.maxHp || !s2.enemies.includes(fly2));
});

test('leaks cost life and kills pay gold', async () => {
  const s = mkState(D, [], [await mkEnemy(D, 'normal', 0.02)]);
  run(s, 0.1);
  assert.deepEqual([s.enemies.length, s.life], [0, 20 - D.enemyById.normal.leak]);
  const e = await mkEnemy(D, 'normal', 3.2);
  e.hp = 1;
  const s2 = mkState(D, [await mkUnit(D, 1, 'bear', 'young', 3)], [e]);
  run(s2, 0.1);
  assert.equal(s2.gold, D.enemyById.normal.gold);
});

test('down, release, respawn', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'young', 3);
  const e = await mkEnemy(D, 'tough', 3.3);
  e.blockedBy = 1;
  bear.hp = 1;
  const s = mkState(D, [bear], [e]);
  run(s, 0.05);
  assert.ok(bear.down && e.blockedBy === null);
  run(s, bear.stats.respawn + 0.1);
  assert.ok(!bear.down);
});

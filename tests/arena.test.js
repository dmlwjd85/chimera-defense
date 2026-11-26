import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit, mkEnemy, mkState } from './helpers.js';
import { combatTick } from '../src/logic/combat.js';
import { dist, depthOf, spawnDepth, driftEnemies, steer } from '../src/logic/arena.js';

const D = loadData();
const run = (s, sec) => { for (let t = 0; t < sec; t += 0.05) { combatTick(s, D, 0.05); s.time += 0.05; } };

test('2D 거리: 깊이 차이도 거리, 공중은 가로만', async () => {
  const a = { pos: 3, y: 0 }, b = { pos: 3, y: 1 };
  assert.equal(dist(a, b, D.config), D.config.arena.depth);
  assert.equal(dist(a, { ...b, flying: true }, D.config), 0);
  assert.equal(depthOf({ lane: 2 }), 1);
  for (let eid = 1; eid < 50; eid++) { const y = spawnDepth(eid); assert.ok(y >= 0.1 && y <= 0.9); }
});

test('근접은 다른 깊이의 적을 못 때리고, 원거리는 때림', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3, { y: 0, slot: 3 });
  const fox = await mkUnit(D, 2, 'fox', 'adult', 3, { y: 0, slot: 3 });
  const e = await mkEnemy(D, 'normal', 3.25, 1);   // 사격 구역(앞줄 곰 3 + killZone) 안
  Object.assign(e, { y: 1, speed: 0 });
  const s = mkState(D, [bear, fox], [e]);
  s.phase = 'prep'; // 움직임 없이 판정만
  run(s, 1.5);
  assert.ok(e.hp < e.maxHp, '여우(원거리)는 맞힘');
  assert.equal(e.blockedBy, null, '곰은 깊이가 달라 붙잡지 못함');
});

test('다가오는 적은 앞에 선 동물 깊이로 방향을 틂', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3, { y: 0.9 });
  const e = await mkEnemy(D, 'normal', 4.5, 1);
  e.y = 0.1;
  const s = mkState(D, [bear], [e]);
  for (let k = 0; k < 20; k++) driftEnemies(s, D.config, 0.1);
  assert.ok(e.y > 0.8, `y ${e.y.toFixed(2)}`);
});

test('붙잡힌 적들은 동물을 앞뒤로 에워쌈', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3, { y: 0.5 });
  const es = await Promise.all([3.5, 3.5, 3.5].map((p, i) => mkEnemy(D, 'normal', p, i + 1)));
  for (const e of es) Object.assign(e, { y: 0.5, blockedBy: 1 });
  const s = mkState(D, [bear], es);
  for (let k = 0; k < 20; k++) driftEnemies(s, D.config, 0.1);
  const ys = es.map((e) => e.y.toFixed(2));
  assert.equal(new Set(ys).size, 3, `서로 다른 깊이 ${ys}`);
});

test('웨이브 중 동물은 겹치지 않고, 딜러는 옆으로 비켜 파고듦', async () => {
  const mk = (uid, sp, y) => mkUnit(D, uid, sp, 'adult', 5, { y, targetY: y, slot: 5, rowY: y });
  const field = [await mk(1, 'bear', 0.5), await mk(2, 'tiger', 0.5), await mk(3, 'dog', 0.5)];
  const e = await mkEnemy(D, 'normal', 6.4, 1);
  Object.assign(e, { y: 0.5, speed: 0, hp: 1e6, maxHp: 1e6 });
  const s = mkState(D, field, [e]);
  for (let k = 0; k < 40; k++) { steer(s, D.config, 0.05); for (const u of field) { u.pos += (u.targetPos - u.pos) * 0.5; u.y += (u.targetY - u.y) * 0.5; } }
  for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
    const g = Math.hypot(field[i].targetPos - field[j].targetPos, (field[i].targetY - field[j].targetY) * D.config.arena.depth);
    assert.ok(g >= D.config.arena.spacing * 0.95, `${field[i].speciesId}-${field[j].speciesId} 간격 ${g.toFixed(2)}`);
  }
  assert.ok(Math.abs(field[1].targetY - 0.5) > 0.1, '호랑이는 깊이를 바꿔 옆으로 들어감');
});

test('사격 구역: 원거리는 땅의 적이 앞줄 근접 동물 가까이 와야 쏨(포탈 입구에서 녹지 않게)', async () => {
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3, { y: 0.5, slot: 3 });
  const fox = await mkUnit(D, 2, 'fox', 'adult', 2.5, { y: 0.5, slot: 2.5 });
  const e = await mkEnemy(D, 'normal', 5.4, 1);
  Object.assign(e, { y: 0.5, speed: 0 });
  const s = mkState(D, [bear, fox], [e]);
  s.phase = 'prep';
  run(s, 1.5);
  assert.equal(e.hp, e.maxHp, '앞줄보다 멀리 있는 적은 아직 안 쏨');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { tileToX, xToTile, benchSlotPos, X0, TILE, BENCH_X0, BENCH_GAP, BENCH_Y, SLOT, PATH_Y, PATH_H } from '../src/scenes/layout.js';
import { benchSlotAt, onPath } from '../src/scenes/dropPlan.js';
import { sellPrice } from '../src/logic/economy.js';
import { loadData } from './helpers.js';

const D = loadData();

test('tileToX and xToTile are inverse', () => {
  const positions = [0, 0.5, 6, 11.5, 12];
  for (const pos of positions) {
    assert.ok(Math.abs(xToTile(tileToX(pos)) - pos) < 1e-9);
  }
  assert.strictEqual(tileToX(0), X0);
  assert.strictEqual(tileToX(1) - tileToX(0), TILE);
});

test('bench slot centres and hit test', () => {
  for (let i = 0; i < 5; i++) {
    const p = benchSlotPos(i);
    assert.strictEqual(p.x, BENCH_X0 + (i % 2) * BENCH_GAP);
    assert.strictEqual(benchSlotAt(p.x, p.y, 5), i);
  }
  const p2 = benchSlotPos(2), p0 = benchSlotPos(0);
  assert.strictEqual(benchSlotAt(p2.x + SLOT / 2 - 1, p2.y, 5), 2);
  assert.strictEqual(benchSlotAt(p0.x, p0.y - SLOT / 2 - 1, 5), -1);
  assert.strictEqual(benchSlotAt(benchSlotPos(5).x, benchSlotPos(5).y, 5), -1);
});

test('onPath uses half the path height', () => {
  assert.ok(onPath(PATH_Y));
  assert.ok(onPath(PATH_Y + PATH_H / 2));
  assert.strictEqual(onPath(PATH_Y - PATH_H / 2 - 1), false);
  assert.strictEqual(onPath(PATH_Y + PATH_H), false);
});

test('sell price follows config for every stage and kind', () => {
  const stages = ['young', 'teen', 'adult', 'spirit'];
  for (const stage of stages) {
    assert.strictEqual(sellPrice({ kind: 'base', stage }, D.config), D.config.sell[stage]);
  }
  assert.strictEqual(sellPrice({ kind: 'chimera', stage: 'adult' }, D.config), D.config.sell.chimera);
  assert.strictEqual(sellPrice({ kind: 'weak', stage: 'young' }, D.config), D.config.sell.weak);
  assert.strictEqual(sellPrice({ kind: 'zzz', stage: 'adult' }, D.config), 0);
});

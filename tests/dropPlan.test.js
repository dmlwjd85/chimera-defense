import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createBattle, makeUnit, merge } from '../src/logic/battle.js';
import { planDrop, refOf, ringFor, benchSlotAt } from '../src/scenes/dropPlan.js';
import { tileToX, benchSlotX, PATH_Y, BENCH_Y } from '../src/scenes/layout.js';

const D = loadData();
const base = (s, sp, stage) => makeUnit(s, D, { kind: 'base', speciesId: sp, stage, parts: null });
const posMap = (s) => {
  const m = new Map();
  s.field.forEach((u) => m.set(u.uid, { x: tileToX(u.pos), y: PATH_Y }));
  s.bench.forEach((u, i) => u && m.set(u.uid, { x: benchSlotX(i), y: BENCH_Y }));
  return m;
};
const plan = (s, uid, x, y, inSell = false) => planDrop(s, D, uid, x, y, { positions: posMap(s), inSell });

test('bench to path deploys, field to path moves, field to bench recalls', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'young');
  const f = base(s, 'bear', 'young');
  Object.assign(f, { pos: 3, targetPos: 3 });
  s.field.push(f);
  assert.deepEqual(plan(s, s.bench[0].uid, tileToX(6), PATH_Y), { action: 'deploy', index: 0, pos: 6, opts: { lane: 1 } });
  assert.deepEqual(plan(s, f.uid, tileToX(8), PATH_Y + 40), { action: 'move', uid: f.uid, pos: 8, opts: { lane: 2 } });
  assert.deepEqual(plan(s, f.uid, benchSlotX(3), BENCH_Y), { action: 'recall', uid: f.uid });
  assert.equal(plan(s, f.uid, 640, 480).action, 'none');
  assert.deepEqual(refOf(s, f.uid), { where: 'field', uid: f.uid });
  assert.equal(benchSlotAt(benchSlotX(4), BENCH_Y, 5), 4);
  assert.equal(benchSlotAt(benchSlotX(5), BENCH_Y, 5), -1);
});

test('drop on same species same stage evolves without confirm; adults ask before spirit', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'young');
  s.bench[1] = base(s, 'fox', 'young');
  const p = plan(s, s.bench[0].uid, benchSlotX(1) + 10, BENCH_Y);
  assert.equal(p.action, 'merge');
  assert.equal(p.preview.kind, 'evolve');
  assert.equal(p.confirm, null);
  s.bench[2] = base(s, 'fox', 'adult');
  s.bench[3] = base(s, 'fox', 'adult');
  const q = plan(s, s.bench[2].uid, benchSlotX(3), BENCH_Y);
  assert.equal(q.preview.kind, 'spirit');
  assert.equal(q.confirm, 'spirit');
  assert.ok(merge(s, D, q.fromRef, q.toRef).ok);
  assert.equal(s.bench[3].stage, 'spirit');
});

test('different-species adults ask with a preview; merge wins over sell zone', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'adult');
  s.bench[1] = base(s, 'crow', 'adult');
  const p = plan(s, s.bench[0].uid, benchSlotX(1), BENCH_Y, true);
  assert.equal(p.action, 'merge');
  assert.equal(p.confirm, 'preview');
  assert.equal(p.preview.textKey, 'merge.unknown');
});

test('sell asks only for chimera and spirit', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'teen');
  s.bench[1] = base(s, 'fox', 'spirit');
  const a = plan(s, s.bench[0].uid, 740, BENCH_Y, true);
  assert.deepEqual([a.action, a.price, a.confirm], ['sell', D.config.sell.teen, false]);
  const b = plan(s, s.bench[1].uid, 740, BENCH_Y, true);
  assert.deepEqual([b.action, b.price, b.confirm], ['sell', D.config.sell.spirit, true]);
});

test('drag rings: green for evolve/spirit, purple for known recipe, grey ? otherwise', () => {
  const s = createBattle(D, 'forest-1', 1);
  const fox = base(s, 'fox', 'adult'), crow = base(s, 'crow', 'adult'), bear = base(s, 'bear', 'adult');
  assert.deepEqual(ringFor(fox, base(s, 'fox', 'adult'), D, s.known), { color: 0x2ecc71, question: false });
  assert.deepEqual(ringFor(fox, crow, D, s.known), { color: 0xaaaaaa, question: true });
  s.known.recipes.add('cheese_thief');
  assert.deepEqual(ringFor(fox, crow, D, s.known), { color: 0x9b59b6, question: false });
  assert.deepEqual(ringFor(fox, bear, D, s.known), { color: 0xaaaaaa, question: true });
  assert.equal(ringFor(fox, base(s, 'fox', 'young'), D, s.known), null);
});

test('moving a unit during prep places it at once; during a wave it walks', async () => {
  const { moveUnit } = await import('../src/logic/battle.js');
  const s = createBattle(D, 'forest-1', 1);
  const f = base(s, 'bear', 'young');
  Object.assign(f, { pos: 3, targetPos: 3 });
  s.field.push(f);
  assert.ok(moveUnit(s, D, f.uid, 7).ok);
  assert.deepEqual([f.pos, f.targetPos], [7, 7]);
  s.phase = 'wave';
  assert.ok(moveUnit(s, D, f.uid, 5).ok);
  assert.deepEqual([f.pos, f.targetPos], [7, 5]);
});

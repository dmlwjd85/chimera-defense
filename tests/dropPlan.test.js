import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createBattle, makeUnit, merge } from '../src/logic/battle.js';
import { planDrop, refOf, ringFor, benchSlotAt } from '../src/scenes/dropPlan.js';
import { tileToX, benchSlotPos, PATH_Y } from '../src/scenes/layout.js';
const BX = (i) => benchSlotPos(i).x, BY = (i) => benchSlotPos(i).y;

const D = loadData();
const base = (s, sp, stage) => makeUnit(s, D, { kind: 'base', speciesId: sp, stage, parts: null });
const posMap = (s) => {
  const m = new Map();
  s.field.forEach((u) => m.set(u.uid, { x: tileToX(u.pos), y: PATH_Y }));
  s.bench.forEach((u, i) => u && m.set(u.uid, { x: BX(i), y: BY(i) }));
  return m;
};
const plan = (s, uid, x, y, inSell = false) => planDrop(s, D, uid, x, y, { positions: posMap(s), inSell });

test('no camp cells: bench to field or roster row deploys, field to bench recalls, field to field does nothing', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'young');
  const f = base(s, 'bear', 'young');
  Object.assign(f, { pos: 5.8, targetPos: 5.8 });
  s.field.push(f);
  assert.deepEqual(plan(s, s.bench[0].uid, tileToX(1.6), PATH_Y), { action: 'deploy', index: 0, pos: 0, opts: {} });
  assert.deepEqual(plan(s, s.bench[0].uid, 120, 672), { action: 'deploy', index: 0, pos: 0, opts: {} });
  assert.equal(plan(s, f.uid, tileToX(0.3), PATH_Y + 150).action, 'none');
  assert.deepEqual(plan(s, f.uid, BX(1), BY(1)), { action: 'recall', uid: f.uid });
  assert.equal(plan(s, f.uid, 640, 700).action, 'none');
  assert.deepEqual(refOf(s, f.uid), { where: 'field', uid: f.uid });
  assert.equal(benchSlotAt(BX(4), BY(4), 5), 4);
  assert.equal(benchSlotAt(BX(5), BY(5), 5), -1);
});

test('drop on same species same stage evolves without confirm; adults ask before spirit', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'young');
  s.bench[1] = base(s, 'fox', 'young');
  const p = plan(s, s.bench[0].uid, BX(1) + 10, BY(1));
  assert.equal(p.action, 'merge');
  assert.equal(p.preview.kind, 'evolve');
  assert.equal(p.confirm, null);
  s.bench[2] = base(s, 'fox', 'adult');
  s.bench[3] = base(s, 'fox', 'adult');
  const q = plan(s, s.bench[2].uid, BX(3), BY(3));
  assert.equal(q.preview.kind, 'spirit');
  assert.equal(q.confirm, 'spirit');
  assert.ok(merge(s, D, q.fromRef, q.toRef).ok);
  assert.equal(s.bench[3].stage, 'spirit');
});

test('different-species adults ask with a preview; merge wins over sell zone', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'adult');
  s.bench[1] = base(s, 'crow', 'adult');
  const p = plan(s, s.bench[0].uid, BX(1), BY(1), true);
  assert.equal(p.action, 'merge');
  assert.equal(p.confirm, 'preview');
  assert.equal(p.preview.textKey, 'merge.unknown');
});

test('sell asks only for chimera and spirit', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.bench[0] = base(s, 'fox', 'teen');
  s.bench[1] = base(s, 'fox', 'spirit');
  const a = plan(s, s.bench[0].uid, 52, 486, true);
  assert.deepEqual([a.action, a.price, a.confirm], ['sell', D.config.sell.teen, false]);
  const b = plan(s, s.bench[1].uid, 52, 486, true);
  assert.deepEqual([b.action, b.price, b.confirm], ['sell', D.config.sell.spirit, true]);
});

test('drag rings: green for evolve/spirit, purple for known recipe, grey ? otherwise', () => {
  const s = createBattle(D, 'forest-1', 1);
  const fox = base(s, 'rabbit', 'adult'), crow = base(s, 'bighorn', 'adult'), bear = base(s, 'crow', 'adult');
  assert.deepEqual(ringFor(fox, base(s, 'rabbit', 'adult'), D, s.known), { color: 0x2ecc71, question: false });
  assert.deepEqual(ringFor(fox, crow, D, s.known), { color: 0xaaaaaa, question: true });
  s.known.recipes.add('jackalope');
  assert.deepEqual(ringFor(fox, crow, D, s.known), { color: 0x9b59b6, question: false });
  assert.deepEqual(ringFor(fox, bear, D, s.known), { color: 0xaaaaaa, question: true });
  assert.equal(ringFor(fox, base(s, 'fox', 'young'), D, s.known), null);
});

test('animals pick their own spot: moving one by hand is refused', async () => {
  const { moveUnit } = await import('../src/logic/battle.js');
  const s = createBattle(D, 'forest-1', 1);
  const f = base(s, 'bear', 'young');
  s.field.push(f);
  assert.equal(moveUnit(s, D, f.uid, 3).reason, 'auto');
});

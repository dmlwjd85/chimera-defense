import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { rarityTable, newRollCtx, unitChances, rollSummon, advanceRollCtx } from '../src/logic/roulette.js';
import { makeRng } from '../src/logic/rng.js';

const D = loadData();
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

test('rarity table uses the band value as a ratio', () => {
  const r = rarityTable(1, D.config);
  assert.ok(Math.abs(r.common + r.rare + r.hero - 1) < 1e-9);
});

test('chances sum to 1 and pity keeps only heroes', () => {
  assert.ok(Math.abs(sum(unitChances(newRollCtx(), 1, D)) - 1) < 1e-9);
  const p = unitChances({ summonIndex: 5, sinceHero: D.config.pityCount, firstWasRanged: true }, 1, D);
  for (const id of Object.keys(p)) assert.equal(D.unitById[id].rarity, 'hero');
});

test('second summon is ranged when the first was not', () => {
  const p = unitChances({ summonIndex: 1, sinceHero: 1, firstWasRanged: false }, 1, D);
  for (const id of Object.keys(p)) assert.ok(D.unitById[id].range >= D.config.flyingMinRange);
});

test('roll is deterministic and habitat odds sum to 1', () => {
  const a = rollSummon(newRollCtx(), 1, D, makeRng(3));
  assert.deepEqual(a, rollSummon(newRollCtx(), 1, D, makeRng(3)));
  assert.ok(Math.abs(sum(a.habitatChances) - 1) < 1e-9);
  const next = advanceRollCtx(newRollCtx(), D.unitById[a.unitId], D.config);
  assert.equal(next.summonIndex, 1);
});

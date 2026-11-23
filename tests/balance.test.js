import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, loadPlanData } from './helpers.js';
import { unitStats, damageBoost } from '../src/logic/stats.js';
import { sameSpeciesFactor, unitChances, ownedSpecies } from '../src/logic/roulette.js';

const D = loadData();
const P = loadPlanData();
const base = (data, sp, stage) => unitStats({ uid: 1, kind: 'base', speciesId: sp, stage, parts: null }, data);
const ctx = { summonIndex: 5, sinceHero: 0, firstWasRanged: true };

test('damage boost follows rarity', () => {
  for (const u of D.units) {
    assert.strictEqual(damageBoost(u, D.config), D.config.damageBoost[u.rarity]);
  }
  for (const u of P.units) {
    assert.strictEqual(damageBoost(u, P.config), 1);
  }
});

test('boosted damage equals plan damage times boost', () => {
  const species = ['fox', 'crow', 'tiger'];
  const stages = ['young', 'adult'];
  for (const sp of species) {
    for (const st of stages) {
      const uD = D.unitById[sp];
      assert.ok(uD, `missing unit ${sp}`);
      const tempo = D.config.tempo?.unit ?? 1, td = D.config.tempo?.unitDamage ?? tempo;
      const diff = Math.abs(base(D, sp, st).damage - base(P, sp, st).damage * damageBoost(uD, D.config) * td);
      assert.ok(diff < 0.2, `${sp}/${st} damage mismatch: ${base(D, sp, st).damage} vs ${base(P, sp, st).damage * damageBoost(uD, D.config) * td} (diff=${diff})`);
      assert.ok(Math.abs(base(D, sp, st).interval - base(P, sp, st).interval * tempo) < 0.011, 'slower, heavier hits keep the same damage per second');
      const hpD = base(D, sp, st).hp;
      const hpP = base(P, sp, st).hp;
      assert.strictEqual(hpD, hpP, `${sp}/${st} hp mismatch: ${hpD} vs ${hpP}`);
    }
  }
});

test('same-species factor', () => {
  assert.strictEqual(sameSpeciesFactor('fox', new Map(), D), 1);
  assert.strictEqual(sameSpeciesFactor('fox', null, D), 1);
  const map3 = new Map([['fox', 3]]);
  assert.strictEqual(sameSpeciesFactor('fox', map3, D), 1 + 3 * D.config.sameSpecies.perUnit);
  const map2c = new Map([['crow', 2]]);
  assert.strictEqual(sameSpeciesFactor('fox', map2c, D), 1 + 2 * D.config.sameSpecies.partnerPerUnit);
  assert.strictEqual(sameSpeciesFactor('bear', map3, D), 1);
  const planMap = new Map([['fox', 3]]);
  assert.strictEqual(sameSpeciesFactor('fox', planMap, P), 1);
});

test('chances still sum to 1 and owned species rise', () => {
  const a = unitChances(ctx, 5, D);
  const b = unitChances(ctx, 5, D, new Map([['fox', 2]]));
  assert.ok(Math.abs(Object.values(a).reduce((s, v) => s + v, 0) - 1) < 1e-9, 'a does not sum to 1');
  assert.ok(Math.abs(Object.values(b).reduce((s, v) => s + v, 0) - 1) < 1e-9, 'b does not sum to 1');
  assert.ok(b.fox > a.fox, `fox chance did not increase: ${a.fox} vs ${b.fox}`);
  assert.ok(b.crow > a.crow, `crow chance did not increase: ${a.crow} vs ${b.crow}`);
  assert.ok(b.bear < a.bear, `bear chance should decrease: ${a.bear} vs ${b.bear}`);
});

test('owned species counts young equivalents and skips spirits and chimeras', () => {
  const u = (sp, stage) => ({ kind: 'base', speciesId: sp, stage });
  const state = {
    field: [u('fox', 'adult')],
    bench: [u('fox', 'young'), u('bear', 'teen'), u('wolf', 'spirit'), { kind: 'chimera', speciesId: 'cheese_thief', stage: 'adult' }, null]
  };
  const owned = ownedSpecies(state);
  assert.ok(owned instanceof Map, 'ownedSpecies should return a Map');
  assert.strictEqual(owned.get('fox'), 5, `fox count ${owned.get('fox')} vs 5`);
  assert.strictEqual(owned.get('bear'), 2, `bear count ${owned.get('bear')} vs 2`);
  assert.ok(!owned.has('wolf'), 'wolf should not be in owned');
  assert.ok(!owned.has('cheese_thief'), 'cheese_thief should not be in owned');
});

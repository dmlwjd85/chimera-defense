import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit } from './helpers.js';
import { activeBonds, computeMods } from '../src/logic/mods.js';
import { unitChances, newRollCtx } from '../src/logic/roulette.js';
import { defaultSave, favorState, buyFavor } from '../src/logic/meta.js';

const D = loadData();
const st = (field) => ({ field, enemies: [], events: [], rng: () => 0.5, time: 0, relics: [], talents: [], levels: {}, stage: D.stages[0], wave: 1, allyBuffs: [] });

test('every animal has ecology notes, traits, a passive and a mythic form', () => {
  for (const u of D.units) {
    for (const k of ['home', 'diet', 'foes', 'fact']) assert.ok(u.eco?.[k], `${u.id}.${k}`);
    assert.equal(D.traits[u.id].str.length, 3); assert.equal(D.traits[u.id].weak.length, 3);
    assert.ok(D.lore.passives[u.id], u.id); assert.ok(D.tales.myth[u.id], u.id); assert.ok(u.stageNames.spirit);
  }
  assert.equal(D.unitById.grasshopper.flyer, false, 'the grasshopper sits on a leaf');
});

test('food-chain clash: the rooster makes the grasshopper sing worse; as 티토노스 it flips into a bonus', async () => {
  const rooster = await mkUnit(D, 1, 'rooster', 'adult', 3), g = await mkUnit(D, 2, 'grasshopper', 'adult', 4);
  const s = st([rooster, g]);
  let b = activeBonds(s, D).find((x) => x.bond.id === 'rooster_grasshopper');
  assert.equal(b.bond.kind, 'clash');
  computeMods(s, D); assert.equal(g.mods.buff, -20);
  const sp = await mkUnit(D, 3, 'grasshopper', 'spirit', 4); s.field = [rooster, sp];
  b = activeBonds(s, D).find((x) => x.bond.id === 'rooster_grasshopper');
  assert.equal(b.bond.kind, 'flip'); assert.equal(b.bond.name, '영원한 노래');
  computeMods(s, D); assert.equal(sp.mods.buff, 30);
});

test('견원지간: dog and monkey bicker, either one as a spirit turns it into friendship', async () => {
  const dog = await mkUnit(D, 1, 'dog', 'adult', 3), mk = await mkUnit(D, 2, 'monkey', 'adult', 4);
  const s = st([dog, mk]); computeMods(s, D);
  assert.ok(dog.mods.interval >= 10 && mk.mods.interval >= 10);
  const wk = await mkUnit(D, 3, 'monkey', 'spirit', 4); s.field = [dog, wk]; computeMods(s, D);
  assert.ok(dog.mods.dmg >= 20 && wk.mods.dmg >= 20);
  for (const b of D.lore.bonds) if (b.flip) assert.ok(D.tales.flips[b.id], b.id);
});

test('favor: essence spent on a known animal raises its summon chance a little', () => {
  const save = defaultSave(); save.essence = 100;
  assert.equal(favorState(save, D, 'fox').reason, 'unseen');
  save.codex.units.push('fox');
  assert.ok(buyFavor(save, D, 'fox').ok); assert.ok(buyFavor(save, D, 'fox').ok);
  assert.equal(save.essence, 100 - D.config.favor.costs[0] - D.config.favor.costs[1]);
  const base = unitChances(newRollCtx(), 5, D, null, {}), fav = unitChances(newRollCtx(), 5, D, null, { favor: save.favor });
  assert.ok(fav.fox > base.fox && fav.fox < base.fox * 1.3);
  assert.ok(Math.abs(Object.values(fav).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

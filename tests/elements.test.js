import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit, mkEnemy } from './helpers.js';
import { elementChance, elementProc } from '../src/logic/elements.js';
import { computeMods } from '../src/logic/mods.js';
import { addPatch, tickPatches, patchAllyMods } from '../src/logic/elements.js';

const D = loadData();
const st = (enemies) => ({ enemies, field: [], events: [], rng: () => 0, time: 0, relics: [], levels: {}, stage: D.stages[0], wave: 1, allyBuffs: [] });

test('every animal and chimera has an element', () => {
  for (const u of D.units) assert.ok(D.config.elements.defs[u.element], u.id);
  for (const r of D.recipes) assert.ok(D.config.elements.defs[r.element], r.id);
});

test('young animals never proc; teen and up do', async () => {
  const y = await mkUnit(D, 1, 'fox', 'young', 3), t = await mkUnit(D, 2, 'fox', 'teen', 3), a = await mkUnit(D, 3, 'fox', 'adult', 3);
  assert.equal(elementChance(y, D.config), 0);
  assert.ok(elementChance(t, D.config) > 0);
  assert.ok(elementChance(a, D.config) > elementChance(t, D.config));
});

test('fire burns, earth stuns nearby, thunder chains, wind pushes', async () => {
  for (const [sp, check] of [
    ['fox', (e) => e[0].burnLeft > 0],
    ['bear', (e) => e[0].stunLeft > 0 && e[1].stunLeft > 0],
    ['tiger', (e) => e[1].hp < e[1].maxHp],
    ['eagle', (e) => e[0].pos > 4],
  ]) {
    const u = await mkUnit(D, 9, sp, 'adult', 3);
    const s = st([await mkEnemy(D, 'normal', 4, 1), await mkEnemy(D, 'normal', 4.3, 2)]);
    s.field = [u]; computeMods(s, D);
    const ev = elementProc(s, u, s.enemies[0], [s.enemies[0]], D.config, true);
    assert.ok(ev && ev.type === 'element', sp);
    assert.ok(check(s.enemies), sp);
  }
});

test('terrain patches: frost slows enemies, rock shields allies, sunbeam speeds them, patches expire', async () => {
  const rabbit = await mkUnit(D, 1, 'rabbit', 'spirit', 3), bear = await mkUnit(D, 2, 'bear', 'spirit', 5), rooster = await mkUnit(D, 3, 'rooster', 'spirit', 8);
  const s = st([await mkEnemy(D, 'normal', 3.2, 1)]);
  s.field = [rabbit, bear, rooster]; computeMods(s, D);
  assert.equal(addPatch(s, rabbit, 3.2, D.config).kind, 'frost');
  assert.equal(addPatch(s, bear, 5, D.config).kind, 'rock');
  assert.equal(addPatch(s, rooster, 8, D.config).kind, 'sunbeam');
  tickPatches(s, D.config, 0.1);
  assert.equal(s.enemies[0].slowPct, D.config.patches.defs.frost.enemy.slow);
  assert.equal(patchAllyMods(s, bear, D.config).taken, -20);
  const before = rooster.mods.interval; computeMods(s, D);
  assert.equal(rooster.mods.interval, before - 15);
  tickPatches(s, D.config, 10);
  assert.equal(s.patches.length, 0);
});

test('every element maps to a defined patch', () => {
  for (const k of Object.values(D.config.patches.byElement)) assert.ok(D.config.patches.defs[k], k);
  for (const k of Object.values(D.config.patches.bySpecies)) assert.ok(D.config.patches.defs[k], k);
});

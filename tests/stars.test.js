import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit } from './helpers.js';
import { createBattle } from '../src/logic/battle.js';
import { makeEnemy } from '../src/logic/waves.js';
import { hitDamage } from '../src/logic/combat.js';
import { elementChance } from '../src/logic/elements.js';
import { defaultSave, rosterPool, nextUnlock, totalStars, starsFor, settleRun, battleOptions } from '../src/logic/meta.js';
import { unitChances, newRollCtx } from '../src/logic/roulette.js';

const D = loadData();

test('roster: six starters cover six attack styles, stars call the others in order', () => {
  const save = defaultSave(), r = D.config.roster;
  assert.equal(r.starter.length, 6);
  assert.deepEqual(rosterPool(save, D), r.starter);
  assert.equal(new Set([...r.starter, ...r.unlocks.map((u) => u.id)]).size, D.units.length);
  assert.equal(nextUnlock(save, D).id, r.unlocks[0].id);
  save.stages['forest-1'] = { cleared: true, bestWave: 15, stars: 3 };
  assert.equal(totalStars(save), 3);
  assert.ok(rosterPool(save, D).includes('ant') && !rosterPool(save, D).includes('tiger'));
  const ch = unitChances(newRollCtx(), 5, D, null, { pool: battleOptions(save, D, 'forest-1').pool });
  assert.ok(!('tiger' in ch) && ch.dog > 0);
  // old saves: a clear without stars still counts as one
  save.stages['forest-2'] = { cleared: true, bestWave: 15 };
  assert.equal(totalStars(save), 4);
});

test('stars: clear, life kept and time each give one', () => {
  const s = createBattle(D, 'forest-1', 1);
  s.finds = { recipes: [], flops: [], species: [], bonds: [] };
  s.result = 'clear'; s.time = 100; s.life = s.maxLife;
  assert.equal(starsFor(s, D), 3);
  s.time = 9999; assert.equal(starsFor(s, D), 2);
  s.life = 1; assert.equal(starsFor(s, D), 1);
  s.result = 'lose'; assert.equal(starsFor(s, D), 0);
  s.result = 'clear'; s.life = s.maxLife; s.time = 100;
  const save = defaultSave();
  const rep = settleRun(save, s, D);
  assert.equal(rep.stars, 3); assert.equal(save.stages['forest-1'].stars, 3);
  assert.deepEqual(rep.joined, D.config.roster.unlocks.filter((u) => u.stars <= 3).map((u) => u.id));
});

test('undead resist one attack style and fear an element; climate tilts elements', async () => {
  const st = D.stageById['stage-4'];
  const sk = makeEnemy('skeleton', 1, st, D, 1), gh = makeEnemy('ghost', 1, st, D, 2);
  const s = createBattle(D, 'stage-4', 1); s.rng = () => 0.99;
  const mk = (id) => mkUnit(D, 1, id, 'adult', 3);
  const melee = await mk('rabbit'), ranged = await mk('crow'), ram = await mk('bighorn');
  const base = (u, e) => hitDamage(s, u, e);
  const plain = makeEnemy('normal', 1, st, D, 3);
  assert.ok(base(ranged, sk) < base(ranged, plain) * 0.6);
  assert.ok(base(melee, gh) < base(melee, plain) * 0.6);
  assert.ok(base(ram, sk) > base(ram, plain) * 1.2); // earth vs bone
  const rain = D.config.climates.rain;
  const fox = { kind: 'base', stage: 'adult', stats: { element: 'fire' }, mods: {} }, frog = { kind: 'base', stage: 'adult', stats: { element: 'water' }, mods: {} };
  assert.ok(elementChance(fox, D.config, rain) < elementChance(fox, D.config) && elementChance(frog, D.config, rain) > elementChance(frog, D.config));
  for (const stg of D.stages) assert.ok(D.config.climates[stg.climate], stg.id);
  assert.equal(D.stages.length + D.config.roadmap.length, 12);
});

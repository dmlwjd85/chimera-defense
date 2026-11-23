import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit } from './helpers.js';
import { createBattle, summon, step } from '../src/logic/battle.js';
import { makeEnemy, buildWave } from '../src/logic/waves.js';
import { computeMods } from '../src/logic/mods.js';
import { defaultSave, battleOptions } from '../src/logic/meta.js';
import { deckOf, soulGaps, soulOnKill, tickSoul, awakened } from '../src/logic/soul.js';
import { makeRng } from '../src/logic/rng.js';

const D = loadData();

test('every animal has its own soul signature and every element an awakening', () => {
  const sc = D.config.soul;
  for (const u of D.units) { const g = sc.sig[u.id]; assert.ok(g?.name && g.tale && g.desc && g.feel && g.type, u.id); assert.ok(sc.awaken.defs[u.element], u.element); }
  assert.ok(new Set(D.units.map((u) => sc.sig[u.id].type)).size >= 12, 'signatures must play differently');
});

test('the soul pet is the first summon, gains momentum from kills and keeps its crown through merges', () => {
  const save = defaultSave(); save.soulPet = 'rabbit'; save.favor = { rabbit: 2 };
  const o = battleOptions(save, D, 'forest-1');
  assert.deepEqual(o.soul, { id: 'rabbit', favor: 2 });
  assert.ok(o.pool.includes('rabbit') && o.pool.length === D.config.soul.deckSize);
  const s = createBattle(D, 'forest-1', 7, o); s.gold = 999;
  summon(s, D);
  const first = s.bench.find(Boolean);
  assert.equal(first.speciesId, 'rabbit'); assert.ok(first.soul);
  summon(s, D); assert.equal(s.bench.filter((u) => u?.soul).length, 1);
  // momentum
  first.pos = 3; s.field = [first]; s.bench = s.bench.map(() => null); s.phase = 'wave';
  computeMods(s, D); const base = first.mods.dmg;
  for (let k = 0; k < 10; k++) soulOnKill(s, D, first, makeEnemy('normal', 1, s.stage, D, 100 + k));
  computeMods(s, D);
  assert.ok(first.mods.dmg >= base + 10 * D.config.soul.perKill - 1e-6);
  assert.ok(s.events.some((e) => e.type === 'streak' && e.n === 5));
});

test('awakening: a spirit soul pet with enough favor sweeps the whole road', async () => {
  const s = createBattle(D, 'forest-1', 1, { soul: { id: 'dog', favor: 3 } });
  const u = await mkUnit(D, 1, 'dog', 'spirit', 3); u.soul = true; u.mods = {};
  s.field = [u]; s.phase = 'wave';
  s.enemies = [makeEnemy('normal', 1, s.stage, D, 1), makeEnemy('flying', 1, s.stage, D, 2)];
  assert.ok(awakened(s, D, u));
  computeMods(s, D);
  tickSoul(s, D, D.config.soul.awaken.first + 0.1);
  assert.ok(s.events.some((e) => e.type === 'awaken' && e.el === 'fire'));
  assert.ok(s.enemies.every((e) => e.hp < e.maxHp) && s.enemies[0].burnLeft > 0);
  const low = createBattle(D, 'forest-1', 1, { soul: { id: 'dog', favor: 1 } }); assert.ok(!awakened(low, D, u));
});

test('deck: saved picks, soul pet always in, gaps tell what to bring; horde waves triple the crowd', () => {
  const unlocked = ['dog', 'rabbit', 'fox', 'rooster', 'crow', 'bighorn', 'ant', 'frog'];
  const save = defaultSave(); save.deck = ['ant', 'frog', 'tiger']; save.soulPet = 'crow';
  const deck = deckOf(save, D, unlocked);
  assert.equal(deck[0], 'crow'); assert.ok(deck.includes('ant') && !deck.includes('tiger')); assert.equal(deck.length, 6);
  assert.ok(soulGaps(D, 'dog').some((g) => g.key === 'air')); assert.ok(soulGaps(D, 'crow').some((g) => g.key === 'bone'));
  assert.ok(soulGaps(D, 'fox', D.stageById['forest-2']).some((g) => g.key === 'climate'));
  const st = D.stageById['forest-1'];
  const hordeWave = st.waves.findIndex((w) => w.horde) + 1;
  assert.ok(hordeWave > 0);
  const q = buildWave(st, hordeWave, D, makeRng(1));
  assert.ok(q.filter((x) => x.horde).length >= 30);
});

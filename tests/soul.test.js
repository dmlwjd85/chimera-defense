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
  assert.deepEqual(o.soul, { id: 'rabbit', favor: 2, path: null });
  for (const u of D.units) { const p = D.config.soul.sig[u.id].paths; assert.ok(p?.a?.name && p.a.desc && p?.b?.name && p.b.desc, u.id); }
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
  assert.equal(deck[0], 'crow'); assert.ok(deck.includes('ant') && !deck.includes('tiger')); assert.equal(deck.length, 3, '직접 짠 덱은 빈자리를 그대로 둠');
  assert.equal(deckOf(defaultSave(), D, unlocked).length, 6, '처음엔 6마리로 채움');
  assert.ok(soulGaps(D, 'dog').some((g) => g.key === 'air')); assert.ok(soulGaps(D, 'crow').some((g) => g.key === 'bone'));
  assert.ok(soulGaps(D, 'fox', D.stageById['forest-2']).some((g) => g.key === 'climate'));
  const st = D.stageById['forest-1'];
  const hordeWave = st.waves.findIndex((w) => w.horde) + 1;
  assert.ok(hordeWave > 0);
  const q = buildWave(st, hordeWave, D, makeRng(1));
  assert.ok(q.filter((x) => x.horde).length >= 30);
});

test('roles: bruisers guard allies, dealers chain a finisher, buffers cheer the whole team', async () => {
  const { tickRoles, dealerCombo } = await import('../src/logic/roles.js');
  const { hitUnit } = await import('../src/logic/combat.js');
  const rc = D.config.roles;
  const s = createBattle(D, 'forest-1', 1); s.phase = 'wave';
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3), fox = await mkUnit(D, 2, 'fox', 'adult', 3.5);
  s.field = [bear, fox]; computeMods(s, D);
  assert.ok(bear.mods.taken <= rc.bruiser.mods.taken);
  const fh = fox.hp, bh = bear.hp;
  hitUnit(s, D, fox, 100, null);
  assert.ok(bear.hp < bh, 'the bruiser takes part of the blow');
  assert.ok(fh - fox.hp < 100 * (1 - rc.bruiser.guard.share / 100) + 1e-6);
  assert.ok(s.events.some((e) => e.type === 'guard'));
  // dealer finisher
  const tiger = await mkUnit(D, 3, 'tiger', 'adult', 3); s.field = [tiger]; computeMods(s, D);
  s.enemies = [makeEnemy('tough', 1, s.stage, D, 1), makeEnemy('tough', 1, s.stage, D, 2)];
  s.enemies[0].pos = 3.5; s.enemies[1].pos = 3.9;
  for (let k = 0; k < rc.dealer.combo.finisher; k++) dealerCombo(s, D, tiger, s.enemies[0], [s.enemies[0]]);
  assert.ok(s.events.some((e) => e.type === 'combo' && e.kind === 'finisher' && e.style === 'spin'));
  assert.ok(s.enemies[1].hp < s.enemies[1].maxHp, 'a spin finisher hits the enemy next to the target');
  // buffer cheer
  const rooster = await mkUnit(D, 4, 'rooster', 'adult', 2); s.field = [rooster, tiger]; s.events.length = 0; s.enemies = [makeEnemy('boss_boar', 1, s.stage, D, 9)];
  tickRoles(s, D, rc.buffer.cheer.first + 0.1);
  assert.ok(s.events.some((e) => e.type === 'cheer'));
  computeMods(s, D);
  assert.ok(tiger.mods.interval <= rc.dealer.mods.interval + rc.buffer.cheer.interval);
});

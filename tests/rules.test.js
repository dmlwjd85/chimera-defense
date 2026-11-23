import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit, mkEnemy, mkState } from './helpers.js';
import { rollTraits, inheritEvolve, inheritSpirit, inheritChimera, inheritWeak, traitView } from '../src/logic/traits.js';
import { computeMods, activeBonds, activeSynergies, effRange } from '../src/logic/mods.js';
import { combatTick, hitUnit, isResting, hitDamage, damageEnemy } from '../src/logic/combat.js';
import { createBattle, summon, merge, buyBait, toggleLock, summonPrice, makeUnit } from '../src/logic/battle.js';
import { unitChances, newRollCtx } from '../src/logic/roulette.js';
import { makeEnemy } from '../src/logic/waves.js';
import { makeRng } from '../src/logic/rng.js';
import { defaultSave, settleRun, levelInfo, buyUnlock, battleOptions, stageUnlocked } from '../src/logic/meta.js';

const D = loadData();
const tr = (sp, id, kind, extra = {}) => ({ sp, id, kind, flipped: false, locked: false, ...extra });
const withTraits = async (uid, sp, stage, pos, traits) => { const u = await mkUnit(D, uid, sp, stage, pos); u.traits = traits; return u; };

test('every demo species has 3 strengths and 3 weaknesses with flips, and a legend passive', () => {
  for (const u of D.units) {
    const t = D.traits[u.id];
    assert.equal(t.str.length, 3, u.id); assert.equal(t.weak.length, 3, u.id);
    for (const w of t.weak) assert.ok(w.flip?.name && w.flip.fx.length, w.id);
    assert.ok(D.lore.passives[u.id], 'passive ' + u.id);
  }
});

test('birth traits: always 2, mix close to 20/60/20', () => {
  const rng = makeRng(5); const n = { 2: 0, 1: 0, 0: 0 };
  for (let i = 0; i < 3000; i++) { const t = rollTraits('fox', D, rng); assert.equal(t.length, 2); n[t.filter((x) => x.kind === 'str').length]++; }
  assert.ok(Math.abs(n[2] / 3000 - 0.2) < 0.04 && Math.abs(n[1] / 3000 - 0.6) < 0.04);
  assert.ok(rollTraits('bison', D, rng, true).every((t) => t.kind === 'str'), 'white bison has 2 strengths');
});

test('evolve: dragged strengths cover receiver weaknesses, locks protect; spirit flips the rest', () => {
  const recv = [tr('fox', 'fox_w1', 'weak'), tr('fox', 'fox_w3', 'weak', { locked: true })];
  const drag = [tr('fox', 'fox_s1', 'str'), tr('fox', 'fox_s2', 'str')];
  const ev = inheritEvolve(recv, drag);
  assert.deepEqual(ev.map((t) => t.id), ['fox_s1', 'fox_w3']);
  const sp = inheritSpirit(ev, []);
  assert.ok(sp[1].flipped && traitView(sp[1], D).name === '어차피 실 거야');
});

test('chimera keeps strengths first (dragged first); weak chimera with 4 weaknesses reverses', () => {
  const c = inheritChimera([tr('bear', 'bear_w1', 'weak'), tr('bear', 'bear_s1', 'str')], [tr('tiger', 'tiger_s2', 'str'), tr('tiger', 'tiger_w1', 'weak')]);
  assert.deepEqual(c.map((t) => t.id), ['tiger_s2', 'bear_s1']);
  const w = inheritWeak([tr('bear', 'bear_w1', 'weak'), tr('bear', 'bear_w2', 'weak')], [tr('fox', 'fox_w1', 'weak'), tr('fox', 'fox_w2', 'weak')], D, makeRng(1));
  assert.ok(w.reversal && w.traits.length === 4 && w.traits.every((t) => t.flipped));
  const none = inheritWeak([tr('bear', 'bear_s1', 'str')], [tr('fox', 'fox_s1', 'str')], D, makeRng(1));
  assert.equal(none.traits.length, 2);
});

test('bond 호가호위 lights within 2 tiles and boosts fox damage; chimeras never light bonds', async () => {
  const fox = await withTraits(1, 'fox', 'young', 2, []), tiger = await withTraits(2, 'tiger', 'young', 3.5, []);
  const s = mkState(D, [fox, tiger], []);
  computeMods(s, D);
  const ids = activeBonds(s, D).map((b) => b.bond.id);
  assert.ok(ids.includes('hogahowi'));
  const withBond = fox.mods.dmg;
  tiger.pos = 7; computeMods(s, D);
  assert.ok(withBond - fox.mods.dmg >= 30 - 1e-9);
});

test('clash 겁먹은 토끼 lowers dodge, but a flipped 눈치가 빠르다 turns it into +15', async () => {
  const rabbit = await withTraits(1, 'rabbit', 'young', 2, []), tiger = await withTraits(2, 'tiger', 'young', 3, []);
  const s = mkState(D, [rabbit, tiger], []);
  computeMods(s, D);
  assert.equal(rabbit.mods.dodge, -15 + 15); // 토끼의 재판 +15 and clash -15
  rabbit.traits = [tr('rabbit', 'rabbit_w1', 'weak', { flipped: true })];
  computeMods(s, D);
  assert.equal(rabbit.mods.dodge, 25 + 15 + 15);
});

test('continent synergy needs 3 of a continent; terrain match gives +20%', async () => {
  const a = await withTraits(1, 'bison', 'young', 1, []), b = await withTraits(2, 'wolf', 'young', 5, []), c = await withTraits(3, 'eagle', 'young', 9, []);
  const s = mkState(D, [a, b, c], []);
  computeMods(s, D);
  assert.deepEqual(activeSynergies(s, D), ['america']);
  assert.equal(effRange(c), c.stats.range + 1);
  const fox = await withTraits(4, 'fox', 'young', 5, []);
  const s2 = mkState(D, [fox], []);
  computeMods(s2, D); const inField = fox.mods.dmg;
  fox.pos = 1; computeMods(s2, D);
  assert.equal(inField - fox.mods.dmg, 20);
});

test('rest cycle (낮잠) stops attacks for 1 of every 8 seconds', async () => {
  const r = await withTraits(1, 'rabbit', 'young', 2, [tr('rabbit', 'rabbit_w2', 'weak')]);
  const s = mkState(D, [r], []);
  computeMods(s, D);
  r.cycleT = 7.5; assert.ok(isResting(r));
  r.cycleT = 3; assert.ok(!isResting(r));
});

test('간을 두고 왔다: rabbit survives one killing blow per stage; tiger drops gold when it goes down', async () => {
  const r = await withTraits(1, 'rabbit', 'young', 2, []), t = await withTraits(2, 'tiger', 'young', 5, []);
  const s = mkState(D, [r, t], []); s.rng = () => 0.99;
  computeMods(s, D);
  hitUnit(s, D, r, 9999); assert.ok(!r.down && r.hp === 1);
  hitUnit(s, D, r, 9999); assert.ok(r.down);
  const g = s.gold; hitUnit(s, D, t, 99999); assert.equal(s.gold - g, 3);
});

test('shadow boss shield ignores single hits and breaks after 5 area hits', async () => {
  const s = mkState(D, [], []);
  const e = makeEnemy('boss_shadow', 15, D.stages[2], D, 1);
  e.shieldLeft = 4;
  assert.equal(damageEnemy(s, e, 100, false), 0);
  for (let i = 0; i < 5; i++) damageEnemy(s, e, 100, true);
  assert.equal(e.shieldLeft, 0);
  assert.equal(damageEnemy(s, e, 100, false), 100);
});

test('bat king calls 4 bats every 6 seconds', async () => {
  const s = mkState(D, [], []); s.stage = D.stages[1]; s.nextEid = 10;
  const boss = makeEnemy('boss_bat', 15, D.stages[1], D, 1); boss.pos = 8;
  s.enemies = [boss];
  for (let i = 0; i < 125; i++) combatTick(s, D, 0.05);
  assert.equal(s.enemies.filter((e) => e.id === 'bat').length, 4);
});

test('bait doubles a role for 3 summons; designation narrows the roulette and costs extra', () => {
  const ctx = newRollCtx(); ctx.summonIndex = 5;
  const plain = unitChances(ctx, 1, D);
  const meat = unitChances(ctx, 1, D, null, { bait: 'meat' });
  assert.ok(meat.crow > plain.crow * 1.5);
  const onlyField = unitChances(ctx, 1, D, null, { habitat: 'field' });
  assert.deepEqual(Object.keys(onlyField).sort(), ['fox', 'rabbit']);
  const st = createBattle(D, 'forest-1', 3);
  assert.equal(summonPrice(st, D, { habitat: 'field' }), 40 + 40);
  assert.ok(buyBait(st, D, 'meat').ok && st.bait.left === 3 && st.gold === 80);
  st.phase = 'wave'; assert.equal(buyBait(st, D, 'honey').reason, 'notPrep');
});

test('summoned units carry 2 traits; lock toggles; merging keeps traits', () => {
  const st = createBattle(D, 'forest-1', 7); st.gold = 9999;
  const r = summon(st, D); assert.ok(r.ok && r.unit.traits.length === 2);
  assert.ok(toggleLock(st, r.unit.uid, 0).locked);
  const a = makeUnit(st, D, { kind: 'base', speciesId: 'fox', stage: 'young', parts: null, traits: [tr('fox', 'fox_w1', 'weak'), tr('fox', 'fox_w2', 'weak')] });
  const b = makeUnit(st, D, { kind: 'base', speciesId: 'fox', stage: 'young', parts: null, traits: [tr('fox', 'fox_s1', 'str'), tr('fox', 'fox_s2', 'str')] });
  st.bench = [a, b, null, null, null];
  const m = merge(st, D, { where: 'bench', index: 1 }, { where: 'bench', index: 0 });
  assert.equal(m.kind, 'evolve');
  assert.deepEqual(m.unit.traits.map((t) => t.id), ['fox_s1', 'fox_s2']);
});

test('species level: xp curve, damage bonus, results and unlocks', () => {
  assert.deepEqual(levelInfo(0, D.config), { level: 1, xp: 0, need: 20 });
  assert.equal(levelInfo(20 + 40, D.config).level, 3);
  const save = defaultSave();
  const st = createBattle(D, 'forest-1', 1, battleOptions(save, D));
  st.result = 'clear'; st.wavesCleared = 15; st.bossKilled = true; st.summonCount = 20;
  st.field = [makeUnit(st, D, { kind: 'base', speciesId: 'fox', stage: 'spirit', parts: null })];
  st.finds.recipes.push('cheese_thief');
  const rep = settleRun(save, st, D);
  assert.equal(rep.essence, 15 + 20 + 30 + 10);
  assert.equal(save.speciesXp.fox, 45);
  assert.ok(save.stages['forest-1'].cleared && stageUnlocked(save, D, 'forest-2') && !stageUnlocked(save, D, 'forest-3'));
  assert.ok(buyUnlock(save, D, 'startGold').ok && save.unlocks.startGold === 1);
  assert.equal(battleOptions(save, D).startGoldBonus, 20);
  const lv = createBattle(D, 'forest-1', 1, { levels: { fox: 6 } });
  const f = makeUnit(lv, D, { kind: 'base', speciesId: 'fox', stage: 'young', parts: null });
  lv.field = [f]; computeMods(lv, D); const high = f.mods.dmg;
  lv.levels = {}; computeMods(lv, D);
  assert.equal(high - f.mods.dmg, 10); // level 6 → +10%
});

test('hundred days: bear-tiger that stays up 100 wave seconds gets +30%', async () => {
  const st = createBattle(D, 'forest-1', 1);
  const u = makeUnit(st, D, { kind: 'chimera', speciesId: 'bear_tiger', stage: 'adult', parts: ['bear', 'tiger'] });
  u.pos = u.targetPos = 2; st.field = [u]; st.phase = 'wave';
  for (let i = 0; i < 2010; i++) combatTick(st, D, 0.05);
  assert.ok(u.hundredDone && u.mods.dmg >= 30);
});

test('a full stage still runs to the end with every rule on', async () => {
  const { runOne } = await import('../tools/sim.mjs');
  for (const stage of ['forest-1', 'forest-2', 'forest-3']) {
    const r = runOne(D, 11, { stage });
    assert.ok(['clear', 'lose'].includes(r.result), stage + ' ' + r.result);
  }
});

test('companion: clear gives a teen-capped animal for the next stage; without one, start gold +40', async () => {
  const { carryCandidates, setCarry } = await import('../src/logic/meta.js');
  const { addCarry } = await import('../src/logic/battle.js');
  const save = defaultSave();
  const st = createBattle(D, 'forest-1', 1);
  st.field = [makeUnit(st, D, { kind: 'base', speciesId: 'wolf', stage: 'spirit', parts: null, traits: [tr('wolf', 'wolf_s1', 'str', { locked: true })] }),
    makeUnit(st, D, { kind: 'chimera', speciesId: 'cheese_thief', stage: 'adult', parts: ['fox', 'crow'] })];
  const c = carryCandidates(st, D);
  assert.equal(c.length, 1, 'chimeras cannot be carried');
  assert.deepEqual([c[0].speciesId, c[0].stage, c[0].traits[0].id, c[0].traits[0].locked], ['wolf', 'teen', 'wolf_s1', false]);
  setCarry(save, D, 'forest-1', c[0]);
  const o2 = battleOptions(save, D, 'forest-2');
  const s2 = createBattle(D, 'forest-2', 1, o2);
  const u = addCarry(s2, D, o2.carry);
  assert.ok(u && s2.bench[0] === u && u.stage === 'teen' && u.carried);
  assert.equal(s2.gold, D.config.startGold);
  const o3 = battleOptions(save, D, 'forest-3');
  assert.equal(o3.carry, null);
  assert.equal(createBattle(D, 'forest-3', 1, o3).gold, D.config.startGold + D.config.carry.fallbackGold);
  assert.equal(battleOptions(save, D, 'forest-1').startGoldBonus, 0, 'stage 1 never gets the fallback');
});

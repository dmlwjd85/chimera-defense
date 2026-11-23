import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit } from './helpers.js';
import { defaultSave, talentState, buyTalent, resetTalents, battleOptions, settleRun } from '../src/logic/meta.js';
import { createBattle, summonPrice } from '../src/logic/battle.js';
import { computeMods } from '../src/logic/mods.js';

const D = loadData();

test('five branches of five nodes (cage included), each with a tale and an effect', () => {
  assert.equal(D.talents.branches.length, 5);
  for (const b of D.talents.branches) { assert.equal(b.nodes.length, 5); for (const n of b.nodes) assert.ok(n.tale && n.desc && (n.fx || n.eco), n.id); }
});

test('nodes are bought in order with shards; reset refunds everything', () => {
  const s = defaultSave();
  assert.equal(talentState(s, D, 'g1').reason, 'shards');
  s.shards = 4;
  assert.equal(talentState(s, D, 'g2').reason, 'locked');
  assert.ok(buyTalent(s, D, 'g1').ok);
  assert.ok(buyTalent(s, D, 'g2').ok);
  assert.equal(s.shards, 1);
  assert.equal(talentState(s, D, 'g1').reason, 'owned');
  assert.equal(resetTalents(s, D), 3);
  assert.equal(s.shards, 4); assert.deepEqual(s.talents, []);
});

test('talents change the run: gold, summon price, unit stats', async () => {
  const s = defaultSave(); s.talents = ['g1', 'g2', 'a1', 't1'];
  const base = createBattle(D, 'forest-1', 1, battleOptions(defaultSave(), D, 'forest-1'));
  const st = createBattle(D, 'forest-1', 1, battleOptions(s, D, 'forest-1'));
  assert.equal(st.gold, base.gold + 15);
  assert.equal(summonPrice(st, D, {}), summonPrice(base, D, {}) - 3);
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3);
  st.field = [bear]; computeMods(st, D);
  assert.equal(bear.mods.hp, 10); assert.equal(bear.mods.dmg >= 8, true);
});

test('a finished run leaves shards: relics by rarity plus waves', () => {
  const save = defaultSave();
  const st = createBattle(D, 'forest-1', 1, battleOptions(save, D, 'forest-1'));
  st.relics = ['pack_howl', 'glass_cannon']; st.wavesCleared = 7; st.result = 'lose'; st.phase = 'ended';
  const r = settleRun(save, st, D);
  const sc = D.talents.shards;
  assert.equal(r.shards, sc[D.relicById.pack_howl.rarity] + sc[D.relicById.glass_cannon.rarity] + Math.floor(7 / sc.perWaves));
  assert.equal(save.shards, r.shards);
});

test('the cage starts at 3 slots and the cage branch adds slots', () => {
  const s = defaultSave();
  assert.equal(createBattle(D, 'forest-1', 1, battleOptions(s, D, 'forest-1')).bench.length, 3);
  s.talents = ['c1', 'c2'];
  assert.equal(createBattle(D, 'forest-1', 1, battleOptions(s, D, 'forest-1')).bench.length, 5);
});

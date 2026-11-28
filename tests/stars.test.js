import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit } from './helpers.js';
import { createBattle } from '../src/logic/battle.js';
import { makeEnemy } from '../src/logic/waves.js';
import { hitDamage } from '../src/logic/combat.js';
import { elementChance } from '../src/logic/elements.js';
import { defaultSave, rosterPool, nextUnlock, totalStars, starsFor, settleRun, battleOptions, unlockCandidates, pickUnlock } from '../src/logic/meta.js';
import { unitChances, newRollCtx } from '../src/logic/roulette.js';

const D = loadData();

test('roster: six starters cover six attack styles, the unlock gauge calls the others (pick 1 of 2)', () => {
  const save = defaultSave(), r = D.config.roster;
  assert.equal(r.starter.length, 6);
  assert.deepEqual(rosterPool(save, D), r.starter);
  assert.equal(new Set([...r.starter, ...r.unlocks.map((u) => u.id)]).size, D.units.length);
  assert.equal(nextUnlock(save, D).id, r.unlocks[0].id);
  save.stages['forest-1'] = { cleared: true, bestWave: 15, stars: 3 };
  assert.equal(totalStars(save), 3);
  assert.ok(!rosterPool(save, D).includes('ant'), '별만으로는 안 열림');
  save.unlockGauge = { pts: 0, level: 0, pending: 1 };
  const cands = unlockCandidates(save, D);
  assert.equal(cands.length, 2);
  assert.ok(pickUnlock(save, D, cands[1]).ok);
  assert.ok(rosterPool(save, D).includes(cands[1]) && !rosterPool(save, D).includes(cands[0]));
  assert.equal(pickUnlock(save, D, cands[0]).ok, false, '한 번에 하나');
  const ch = unitChances(newRollCtx(), 5, D, null, { pool: battleOptions(save, D, 'forest-1').pool });
  assert.ok(!('tiger' in ch) && ch.dog > 0);
  // 예전 저장: 별로 이미 열린 동물은 그대로
  const old = defaultSave(); old.stages['forest-1'] = { cleared: true, stars: 3 };
  assert.ok(rosterPool(old, D).includes('ant'));
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
  assert.deepEqual(rep.joined, []);
  assert.ok(rep.gauge.gain >= 100 + 3 * 30, '클리어 + 별 3개');
  assert.equal(rep.gauge.filled, 1, '첫 칸(150)이 다 참');
  assert.equal(save.unlockGauge.pending, 1);
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

test('spells: one to start, more per cleared stage; mana gates the cast', async () => {
  const { spellsUnlocked, castSpell, spellBlock } = await import('../src/logic/spells.js');
  const { step } = await import('../src/logic/battle.js');
  const save = defaultSave(), list = D.config.spells.list;
  assert.deepEqual(spellsUnlocked(save, D), ['meteor']);
  assert.deepEqual(new Set(list.map((s) => s.kind)), new Set(['attack', 'defense', 'support']));
  save.stages['forest-1'] = { cleared: true }; save.stages['forest-2'] = { cleared: true };
  assert.deepEqual(spellsUnlocked(save, D), ['meteor', 'wall', 'drum', 'snare']);
  const s = createBattle(D, 'forest-1', 1, { spells: list.map((x) => x.id) });
  assert.equal(spellBlock(s, D, 'meteor'), 'noWave');
  s.phase = 'wave'; s.mana = 100;
  s.enemies = [makeEnemy('normal', 1, s.stage, D, 1), makeEnemy('normal', 1, s.stage, D, 2), makeEnemy('boss_boar', 1, s.stage, D, 3)];
  s.enemies[0].pos = 5; s.enemies[1].pos = 5.4; s.enemies[2].pos = 9;
  assert.ok(castSpell(s, D, 'meteor').ok);
  assert.ok(s.enemies[0].hp < s.enemies[0].maxHp && s.enemies[2].hp === s.enemies[2].maxHp);
  assert.equal(s.mana, 60); assert.equal(spellBlock(s, D, 'wall'), 'cooldown');
  s.spellCd = 0; assert.ok(castSpell(s, D, 'wall').ok); assert.ok(s.enemies[0].holdLeft > 3);
  s.spellCd = 0; s.mana = 100; const p = s.enemies[1].pos; assert.ok(castSpell(s, D, 'gust').ok); assert.ok(s.enemies[1].pos > p + 1.9);
  s.spellCd = 0; assert.ok(castSpell(s, D, 'drum').ok); assert.ok(s.allyBuffs.some((b) => b.stat === 'interval'));
  s.mana = 0; s.spellCd = 0; assert.equal(castSpell(s, D, 'chain').reason, 'mana');
  step(s, D, 1); assert.ok(s.mana > 0.4 && s.mana < 1);
  // 마법 가지를 등급 3까지(같은 별을 세 번 담음): 시작 마력 +30, 소모 -18%, 효과 +24%, 회복 +36%
  const m = createBattle(D, 'forest-1', 1, { spells: ['meteor'], talents: ['m1', 'm2', 'm3', 'm4'].flatMap((id) => [id, id, id]) });
  assert.equal(m.mana, D.config.spells.start + 30);
  m.phase = 'wave'; m.mana = 40; m.enemies = [makeEnemy('normal', 1, m.stage, D, 1)];
  assert.ok(castSpell(m, D, 'meteor').ok); assert.equal(m.mana, 7); // 40 - 33
  assert.ok(m.enemies[0].hp < m.enemies[0].maxHp * 0.46); // 45% x 1.24
  m.mana = 0; m.enemies = [makeEnemy('tough', 1, m.stage, D, 9)]; step(m, D, 1); assert.ok(Math.abs(m.mana - 0.68) < 0.05);
});

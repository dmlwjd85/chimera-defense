import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createGauntlet, tickGauntlet, autoRun, takeReward, moveAnimal, nextEncounter, planEncounters, closeRanks, unitsIn, castG, fighters } from '../src/logic/gauntlet.js';
import { starGoals, settleRun, defaultSave } from '../src/logic/meta.js';
import { makeRng } from '../src/logic/rng.js';

const D = loadData();
const fightOut = (st) => { let n = 0; while (st.phase === 'fight' && n++ < 2000) { tickGauntlet(st, D, 0.1); st.events.length = 0; } };

test('연전: 교전 8번, 마지막은 보스, 무리 크기는 3에서 6으로', () => {
  const plan = planEncounters(D.stageById['forest-1'], D, makeRng(3));
  assert.equal(plan.length, 8);
  assert.equal(plan.at(-1).boss, true);
  assert.equal(plan.at(-1).ids[0], 'boss_boar');
  assert.equal(plan[0].ids.length, 3);
  assert.ok(plan[6].ids.length >= 5);
});

test('처음엔 덱 6마리가 역할대로 앞줄·뒷줄에 섬(근접 앞, 원거리 뒤)', () => {
  const st = createGauntlet(D, 'forest-1', 5, {});
  const us = unitsIn(st);
  assert.equal(us.filter(Boolean).length, 6);
  for (const u of us) if (u && u.stats.range > 1) assert.ok(u.seat >= 3, `${u.speciesId} 뒷줄`);
  assert.equal(st.phase, 'fight');
  assert.ok(st.enemies.length >= 3);
});

test('교전이 실시간으로 끝나고 정비로 넘어감: 보상 3갈래, 체력 일부만 회복', () => {
  const st = createGauntlet(D, 'forest-1', 7, {});
  fightOut(st);
  assert.equal(st.phase, 'regroup');
  assert.ok(st.offer.globe.length === 3 && st.offer.food);
  assert.ok(st.time > 3, '한순간에 끝나지 않음');
  const r = takeReward(st, D, 'globe', 0);
  assert.ok(r.ok);
  assert.equal(takeReward(st, D, 'food', st.field[0].uid).ok, false, '보상은 하나만');
  assert.ok(nextEncounter(st, D).ok);
  assert.equal(st.phase, 'fight');
});

test('한 번에 하나: 같은 틱에 행동은 하나만 나감', () => {
  const st = createGauntlet(D, 'forest-1', 9, {});
  for (let i = 0; i < 200 && st.phase === 'fight'; i++) {
    tickGauntlet(st, D, 0.05);
    const acts = st.events.filter((e) => e.type === 'act' && e.move !== 'skill');
    assert.ok(acts.length <= 1);
    st.events.length = 0;
  }
});

test('자리 바꾸기와 합성(같은 종·같은 단계 = 진화)', () => {
  const st = createGauntlet(D, 'forest-1', 11, {});
  fightOut(st);
  const a = st.seats[0], b = st.seats[3];
  assert.ok(moveAnimal(st, D, { where: 'seat', index: 0 }, { where: 'seat', index: 3 }).ok);
  assert.equal(st.seats[0], b); assert.equal(st.seats[3], a);
  // 같은 종을 대기석에 넣고 겹치면 진화
  const u = unitsIn(st).find((x) => x && x.stage === 'young');
  st.offer.globe[0] = { speciesId: u.speciesId, traits: [] };
  takeReward(st, D, 'globe', 0);
  const bi = st.bench.findIndex((x) => x && x.speciesId === u.speciesId);
  const r = moveAnimal(st, D, { where: 'bench', index: bi }, { where: 'seat', index: u.seat });
  assert.equal(r.kind, 'evolve');
  assert.equal(unitsIn(st)[u.seat].stage, 'teen');
});

test('앞줄이 비면 뒷줄 근접이 앞으로 당겨짐', () => {
  const st = createGauntlet(D, 'forest-1', 13, {});
  const front = unitsIn(st).filter((u) => u && u.seat < 3);
  for (const u of front) u.down = true;
  closeRanks(st);
  assert.ok(unitsIn(st).slice(0, 3).some((u) => u && !u.down), '누군가 앞줄로 나옴');
});

test('하드는 한 번 지면 끝, 노멀은 생명이 깎이고 계속', () => {
  for (const hard of [true, false]) {
    const st = createGauntlet(D, 'forest-1', 15, { hard });
    for (const e of st.enemies) { e.attack = 9999; e.hp = e.maxHp = 1e7; }
    fightOut(st);
    if (hard) { assert.equal(st.phase, 'ended'); assert.equal(st.result, 'lose'); }
    else { assert.equal(st.phase, 'regroup'); assert.equal(st.life, st.maxLife - 1); }
  }
});

test('마법은 교전 중에 누를 수 있음', () => {
  const st = createGauntlet(D, 'forest-1', 17, { spells: ['meteor'] });
  st.mana = 100;
  const hp = st.enemies.reduce((s, e) => s + e.hp, 0);
  assert.ok(castG(st, D, 'meteor').ok);
  assert.ok(st.enemies.reduce((s, e) => s + e.hp, 0) < hp);
  assert.equal(castG(st, D, 'meteor').ok, false, '쿨다운');
});

test('봇이 1스테이지 노멀을 대체로 깸, 별·하드 보상 정산', () => {
  let clear = 0;
  for (let i = 1; i <= 6; i++) { const st = autoRun(createGauntlet(D, 'forest-1', i * 101, {}), D); if (st.result === 'clear') clear++; }
  assert.ok(clear >= 4, `클리어 ${clear}/6`);
  const st = autoRun(createGauntlet(D, 'forest-1', 202, { hard: true }), D);
  const g = starGoals(st, D);
  assert.equal(g.gauntlet, true);
  const save = defaultSave();
  const rep = settleRun(save, st, D);
  assert.ok(rep.essence >= 0);
  if (st.result === 'clear') assert.equal(save.stages['forest-1'].hard, true);
  assert.ok(fighters(st).length >= 0);
});

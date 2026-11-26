import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createGauntlet, tickGauntlet, autoRun, takeReward, moveAnimal, nextEncounter, planEncounters, closeRanks, unitsIn, castG, fighters, setPlan, cycleTactic, TACTICS, styleOf, rollRewards } from '../src/logic/gauntlet.js';
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

test('상성: 속성 순환·먹이사슬, 스테이지마다 좋은 동물이 다름', async () => {
  const { elemMult, mcfg, foodChain, speciesFit } = await import('../src/logic/matchup.js');
  const m = mcfg(D);
  assert.equal(elemMult('water', 'fire', m), m.strong);
  assert.equal(elemMult('fire', 'water', m), m.weak);
  assert.equal(elemMult('light', 'moon', m), m.strong);
  assert.equal(foodChain({ kind: 'base', speciesId: 'frog', stage: 'adult' }, 'swarm', D).tag, 'prey');
  assert.equal(foodChain({ kind: 'base', speciesId: 'rabbit', stage: 'young' }, 'fast', D).tag, 'fear');
  assert.equal(foodChain({ kind: 'base', speciesId: 'rabbit', stage: 'spirit' }, 'fast', D).tag, null, '신화급은 천적도 안 무서워함');
  const good = (st) => D.units.map((u) => u.id).filter((id) => speciesFit(id, D.stageById[st], D).label === 'good');
  assert.notDeepEqual(good('forest-2'), good('stage-4'));
});

test('신화급·키메라는 태세를 넘나들고, 정비 때 선호 태세를 찍음', async () => {
  const { cyclePrefStance, canStance, styleOf } = await import('../src/logic/gauntlet.js');
  const st = createGauntlet(D, 'forest-1', 21, {});
  fightOut(st);
  const u = st.field[0];
  u.stage = 'spirit';
  assert.ok(canStance(u));
  assert.equal(cyclePrefStance(st, u.uid).pref, 'tank');
  assert.equal(cyclePrefStance(st, u.uid).pref, 'deal');
  nextEncounter(st, D);
  assert.equal(u.stance, 'deal');
  assert.ok(['skirm', 'ranged'].includes(styleOf(u)));
});

test('하드: 보상 하나는 막힘, 노멀 생명은 2', () => {
  const st = createGauntlet(D, 'forest-1', 23, { hard: true });
  fightOut(st);
  if (st.phase === 'regroup') { assert.ok(st.offer.dropped); assert.equal(takeReward(st, D, st.offer.dropped, st.offer.dropped === 'food' ? st.field[0].uid : st.offer.dropped === 'relic' ? st.offer.relic?.[0] : 0).ok, false); }
  assert.equal(createGauntlet(D, 'forest-1', 1, {}).maxLife, 2);
});

test('금화 부활·놓아주기, 앞줄은 브루저만, 진형 붕괴, 레벨로 출전 단계, 전설 카드', async () => {
  const { reviveUnit, releaseUnit, reviveCost, baseStyle } = await import('../src/logic/gauntlet.js');
  const st = createGauntlet(D, 'forest-1', 31, { levels: { dog: 6, rabbit: 3 }, legend: { kind: 'base', speciesId: 'tiger', traits: [], name: '산군' } });
  const dog = st.field.find((u) => u.speciesId === 'dog'), rabbit = st.field.find((u) => u.speciesId === 'rabbit');
  assert.equal(dog.stage, 'adult'); assert.equal(rabbit.stage, 'teen');
  assert.ok(st.field.some((u) => u.legend && u.speciesId === 'tiger' && u.stage === 'adult'));
  for (const u of st.field) if (u.seat < 3 && baseStyle(u) !== 'bruiser') assert.ok(!st.field.some((x) => baseStyle(x) === 'bruiser' && x.seat >= 3), '브루저가 뒷줄에 밀려 있지 않음');
  fightOut(st);
  const v = st.field[0]; v.resting = true; st.gold = 100;
  const cost = reviveCost(st, D);
  assert.ok(reviveUnit(st, D, v.uid).ok); assert.equal(st.gold, 100 - cost); assert.ok(reviveCost(st, D) > cost, '부활할수록 비쌈');
  const n = st.field.length; assert.ok(releaseUnit(st, D, st.field[1].uid).ok); assert.equal(st.field.length, n - 1);
  // 진형 붕괴
  const st2 = createGauntlet(D, 'forest-1', 33, {});
  for (let i = 0; i < 30; i++) tickGauntlet(st2, D, 0.1);
  for (const u of st2.field) if (baseStyle(u) === 'bruiser') { u.hp = 0; u.down = true; }
  st2.events.length = 0; tickGauntlet(st2, D, 0.1);
  if (st2.phase === 'fight') assert.ok(st2.collapse.u);
});

test('수싸움: 1스테이지는 앞라인만, 2스테이지 수업(벽→사냥, 돌파 당함→지키기), 작전 바꾸기', () => {
  const s1 = autoRun(createGauntlet(D, 'forest-1', 11, {}), D);
  assert.ok(!s1.dstat?.uMark && !s1.dstat?.eMark, '1스테이지엔 돌파 예고 없음');
  // 2스테이지: 3번째 교전에서 '벽' 안내, 5번째에서 '돌파 당함' 안내
  const st = createGauntlet(D, 'forest-2', 5, {});
  const seen = new Set();
  for (let guard = 0; guard < 400 && st.phase !== 'ended'; guard++) {
    while (st.phase === 'fight') { tickGauntlet(st, D, 0.5); for (const ev of st.events) if (ev.type === 'lesson') { seen.add(ev.kind); setPlan(st, D, ev.kind === 'wall' ? 'hunt' : 'guard'); } st.events.length = 0; }
    if (st.phase !== 'regroup') break;
    if (st.offer && !st.offer.taken) takeReward(st, D, 'food', st.field[0].uid);
    nextEncounter(st, D);
  }
  assert.ok(seen.has('wall'), '벽 수업');
  // 작전 고르기: 딜러 돕기 → 사냥 → 요격, 브루저 버티기 ↔ 지키기
  const s3 = createGauntlet(D, 'forest-3', 3, {});
  const sk = s3.field.find((u) => styleOf(u) === 'skirm'), br = s3.field.find((u) => styleOf(u) === 'bruiser');
  if (sk) { const a = cycleTactic(s3, D, sk.uid).tactic, b = cycleTactic(s3, D, sk.uid).tactic; assert.notEqual(a, b); assert.ok(TACTICS.skirm.includes(a)); }
  if (br) assert.ok(['hold', 'guard'].includes(cycleTactic(s3, D, br.uid).tactic));
  assert.equal(cycleTactic(createGauntlet(D, 'forest-1', 3, {}), D, s1.field[0]?.uid ?? 0).ok, false);
});

test('보상 밸런스: 성장기→어른은 먹이 두 그릇, 연전 유물만 나옴', () => {
  const st = createGauntlet(D, 'forest-1', 9, {});
  const teen = st.field[0]; teen.stage = 'teen';
  st.phase = 'regroup'; st.offer = { food: true, taken: null };
  const r1 = takeReward(st, D, 'food', teen.uid);
  assert.equal(r1.meal, 1); assert.equal(r1.need, 2);
  for (let i = 0; i < 30; i++) { st.offer = rollRewards(st, D); for (const id of st.offer.relic ?? []) { const r = D.relicById[id]; assert.ok(!(D.config.gauntlet.relicBan ?? []).includes(id), id); assert.ok(r); } }
});

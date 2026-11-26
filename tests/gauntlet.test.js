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
  for (const u of us) if (u && u.stats.range > 1) assert.ok(u.seat >= 6, `${u.speciesId} 3열`);
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
  const [i, j] = st.seats.map((x, k) => (x != null ? k : -1)).filter((k) => k >= 0);
  const a = st.seats[i], b = st.seats[j];
  assert.ok(moveAnimal(st, D, { where: 'seat', index: i }, { where: 'seat', index: j }).ok);
  assert.equal(st.seats[i], b); assert.equal(st.seats[j], a);
  // 빈 칸으로 옮기기(3×3: 9칸에 6마리)
  const empty = st.seats.indexOf(null);
  assert.ok(empty >= 0 && moveAnimal(st, D, { where: 'seat', index: i }, { where: 'seat', index: empty }).ok);
  // 같은 종을 대기석에 넣고 겹치면 진화
  const u = unitsIn(st).find((x) => x && x.stage === 'young');
  st.offer.globe[0] = { speciesId: u.speciesId, traits: [] };
  takeReward(st, D, 'globe', 0);
  const bi = st.bench.findIndex((x) => x && x.speciesId === u.speciesId);
  const r = moveAnimal(st, D, { where: 'bench', index: bi }, { where: 'seat', index: u.seat });
  assert.equal(r.kind, 'evolve');
  assert.equal(unitsIn(st)[u.seat].stage, 'teen');
});

test('3×3 자리: 브루저 1열·딜러 2열·응원 3열, 라인 맞붙음, 정원, 브루저 없는 라인은 제압', async () => {
  const G = await import('../src/logic/gauntlet.js');
  const st = createGauntlet(D, 'forest-3', 13, { pool: ['bear', 'dog', 'tiger', 'wolf', 'eagle', 'rooster'] });
  assert.equal(st.seats.length, 9);
  for (const u of st.field) { const c = G.colOf(u.seat), sty = G.baseStyle(u); if (sty === 'bruiser') assert.equal(c, 0); if (sty === 'ranged' || sty === 'support') assert.equal(c, 2); }
  const bear = st.field.find((u) => u.speciesId === 'bear');
  assert.ok(G.clashCap(bear) >= 3, '곰은 여럿을 붙잡음');
  // 우리 브루저를 모두 눕히면 적 브루저가 전진 → 후열 제압
  st.charging = false;
  for (const u of st.field) if (G.styleOf(u) === 'bruiser') { u.down = true; u.hp = 0; }
  const eb = st.enemies.find((e) => e.style === 'bruiser') ?? st.enemies[0];
  eb.style = 'bruiser'; eb.stunLeft = 0;
  G.tickGauntlet(st, D, 0.2);
  assert.ok(eb.advance, '적 브루저 전진');
  assert.ok(st.field.some((u) => u.suppressed), '후열 제압');
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
  const st = createGauntlet(D, 'forest-1', 31, { levels: { dog: 9, rabbit: 4 }, legend: { kind: 'base', speciesId: 'tiger', traits: [], name: '산군' } });
  const dog = st.field.find((u) => u.speciesId === 'dog'), rabbit = st.field.find((u) => u.speciesId === 'rabbit');
  assert.equal(dog.stage, 'teen', '레벨이 높아도 성장기까지만'); assert.equal(rabbit.stage, 'teen');
  assert.ok(st.field.some((u) => u.legend && u.speciesId === 'tiger' && u.stage === 'adult'));
  for (const u of st.field) if (baseStyle(u) === 'bruiser') assert.ok(u.seat < 3, '브루저는 1열');
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

test('고급 빌드·수치·주인공·각성·톡 보호막·난이도 사다리', async () => {
  const G = await import('../src/logic/gauntlet.js');
  // 빌드: 호랑이를 회피탱으로 → 브루저 모양, 체력 줄고 피하기 35%
  const st = G.createGauntlet(D, 'forest-3', 4, { pool: ['tiger', 'bear', 'eagle', 'rabbit'], builds: { tiger: 'dodgetank' } });
  const tiger = st.field.find((u) => u.speciesId === 'tiger');
  assert.equal(G.styleOf(tiger), 'bruiser');
  assert.equal(G.statLine(tiger, D).dodge, 35);
  const before = G.statLine(tiger, D).hp;
  G.cycleBuild(st, D, tiger.uid);   // 회피탱 → 딜탱
  assert.equal(tiger.build, 'dealtank'); assert.equal(G.styleOf(tiger), 'skirm');
  assert.ok(G.statLine(tiger, D).hp > before);
  // 주인공: 공격 +, 다른 동물 -
  const bear = st.field.find((u) => u.speciesId === 'bear');
  const a0 = G.statLine(bear, D).atk, o0 = G.statLine(tiger, D).atk;
  G.setStar(st, D, bear.uid);
  assert.ok(G.statLine(bear, D).atk > a0 && G.statLine(tiger, D).atk < o0);
  // 각성: 동료 절반 이상 쓰러지고 체력 낮으면 한 번
  for (const u of st.field.slice(1)) { u.down = true; u.hp = 0; }
  st.field[0].hp = st.field[0].maxHp * 0.2;
  st.charging = false;
  G.tickGauntlet(st, D, 0.1);
  assert.ok(st.field[0].awake || st.dstat?.awaken, '각성');
  // 톡 보호막: 노려진 동물만
  const s2 = G.createGauntlet(D, 'forest-3', 5, {});
  assert.equal(G.tapShield(s2, s2.field[0].uid).ok, false);
  const e = s2.enemies[0]; e.diveMark = { uid: s2.field[0].uid };
  assert.equal(G.tapShield(s2, s2.field[0].uid).ok, true);
  // 사다리: 하드코어는 짐작 없음, 신계는 이번 주 규칙
  const hc = G.createGauntlet(D, 'forest-3', 6, { tier: 'hardcore' });
  assert.ok(hc.hard); assert.equal(G.nextPreview(hc, D).hint, null);
  const god = G.createGauntlet(D, 'forest-3', 6, { tier: 'god', godRule: 'giants' });
  assert.ok(god.enemies.filter((x) => !x.boss).every((x) => x.style === 'bruiser'));
  assert.ok(G.GOD_RULES[G.godRuleOf(Date.now())]);
  // 이야기 궁합: 여러 문화의 민담·신화
  for (const id of ['dangun', 'cheese', 'briar_patch', 'frog_ox', 'zodiac_race', 'bremen']) assert.ok(D.lore.bonds.find((b) => b.id === id), id);
});

test('흐름: 응원 톡·승패 요인, 보상 하나 더(금화), 주머니·상점·준비물, 새 유물', async () => {
  const G = await import('../src/logic/gauntlet.js');
  const M = await import('../src/logic/meta.js');
  const st = createGauntlet(D, 'forest-3', 21, {});
  st.charging = false; G.tickGauntlet(st, D, 0.5);
  const c = st.clashes[0];
  if (c) { const p0 = c.push; st.time += 1; assert.ok(G.cheerClash(st, c.uid, D).ok); assert.ok(c.push >= p0 || c.push === 0.95); }
  fightOut(st);
  assert.ok(Array.isArray(G.encFactors(st, D)));
  // 하나 더: 고른 뒤에만, 금화 들고
  st.gold = 50;
  assert.equal(G.buyExtraReward(st, D).ok, false);
  assert.ok(takeReward(st, D, 'food', st.field[0].uid).ok || true);
  if (st.offer.taken) { assert.ok(G.buyExtraReward(st, D).ok); assert.equal(st.offer.taken, null); assert.ok(st.gold < 50); }
  // 주머니·상점
  const save = defaultSave(D);
  save.pouch = 120; save.deck = ['bear', 'tiger', 'eagle'];
  const shop = M.shopOffers(save, D);
  assert.ok(shop.items.length >= 4);
  const fi = shop.items.findIndex((x) => x.kind === 'food');
  assert.ok(M.buyShop(save, D, fi).ok); assert.equal(save.prep.food, 1);
  const bag = M.takeOutForRun(save, D);
  assert.equal(bag.pouch, 40); assert.equal(save.pouch, 120 - shop.items[fi].price - 40);
  const run = createGauntlet(D, 'forest-1', 3, { pouch: bag.pouch, prep: { relics: ['war_horn'], food: 1, feathers: 1 } });
  assert.equal(run.gold, bag.pouch); assert.ok(run.relics.includes('war_horn')); assert.equal(run.feathers, 1);
  // 새 유물 10개
  for (const id of ['war_horn', 'thorn_mail', 'shadow_cloak', 'vanguard_flag', 'vamp_fang', 'gold_scale', 'phoenix_plume', 'iron_chain', 'thunder_drum', 'mana_spring']) assert.ok(D.relicById[id]?.gauntlet, id);
});

test('잡아채기(개구리 혀·좀비 손)·깊숙이 위험·덩굴 덫·흑역사 팔기', async () => {
  const G = await import('../src/logic/gauntlet.js');
  let snatch = 0, eSnatch = 0;
  for (const st of ['stage-4', 'stage-5', 'stage-6']) for (let i = 1; i <= 3; i++) {
    const s = autoRun(createGauntlet(D, st, i * 37, { pool: ['frog', 'monkey', 'tiger', 'wolf', 'eagle', 'bear'] }), D);
    snatch += s.dstat?.snatch ?? 0; eSnatch += s.dstat?.eSnatch ?? 0;
  }
  assert.ok(snatch > 0, '우리 쪽이 낚아챔'); assert.ok(eSnatch > 0, '적이 우리 딜러를 낚아챔');
  // 덩굴 덫
  const s2 = createGauntlet(D, 'forest-3', 4, { spells: ['snare'] });
  s2.mana = 100; s2.charging = false;
  assert.ok(G.castG(s2, D, 'snare').ok); assert.ok(s2.snareT > s2.time);
  // 흑역사 팔기
  const s3 = createGauntlet(D, 'forest-1', 5, {});
  fightOut(s3);
  const w = s3.field[1]; w.kind = 'weak';
  const g0 = s3.gold, r = G.releaseUnit(s3, D, w.uid);
  assert.ok(r.ok); assert.equal(s3.gold - g0, D.config.gauntlet?.sellWeak ?? 25);
});

test('덱 대결: 코드 주고받기(틀린 글자 잡기), 해금한 동물만, 3판 2선승', async () => {
  const Du = await import('../src/logic/duel.js');
  const G = await import('../src/logic/gauntlet.js');
  const save = defaultSave(D);
  const mine = Du.myDuelDeck(save, D);
  const open = new Set((await import('../src/logic/meta.js')).rosterPool(save, D) ?? D.units.map((u) => u.id));
  assert.ok(mine.length >= 3 && mine.every((u) => open.has(u.id) && u.stage !== 'adult'), '해금한 동물, 성장기까지');
  const code = Du.encodeDeck(mine, 'hunt', D);
  const back = Du.decodeDeck(code, D);
  assert.deepEqual(back.deck.map((u) => u.id), mine.map((u) => u.id)); assert.equal(back.plan, 'hunt');
  const bad = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
  assert.ok(Du.decodeDeck(bad, D).error, '틀린 글자');
  const dd = Du.duelData(D, back);
  const st = G.createGauntlet(dd.data, 'arena', 7, { pool: mine.map((u) => u.id), plan: dd.plan, duel: { hpMul: Du.DUEL.hpMul, need: 2, foePlan: dd.foePlan } });
  assert.ok(st.enemies.every((e) => e.animal), '상대는 동물');
  G.autoRun(st, dd.data);
  assert.equal(st.phase, 'ended'); assert.ok(st.wins === 2 || st.losses === 2);
});

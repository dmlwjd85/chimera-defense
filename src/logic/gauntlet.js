// 연전(2026-11-26): 지도 이동 없이 내가 짠 덱이 교전을 연달아 치름. 교전은 실시간 자동(행동 게이지가 차면 공격),
// 이기면 정비(체력 일부 회복 · 보상 3개 중 1개 · 자리 바꾸기 · 합성), 마지막은 보스.
// 자리: 아군·적 모두 앞줄 3칸(0~2) + 뒷줄 3칸(3~5). 다키스트 던전처럼 앞줄이 먼저 맞고, 근접은 앞줄에서 제 힘을 냄.
// 난이도: 노멀 = 생명이 있어 지면 생명 -1 / 하드 = 한 번 지면 끝(보상 더 큼).
import { makeRng } from './rng.js';
import { makeUnit, merge as mergeAny } from './battle.js';
import { makeEnemy } from './waves.js';
import { computeMods, effDamage, effInterval, effBlock, emptyMods } from './mods.js';
import { hitDamage } from './combat.js';
import { movesOf, a2Of, chargeUlt, ultName } from './moves.js';
import { rollTraits, inheritEvolve } from './traits.js';
import { eco, rollOffer, chooseRelic } from './relics.js';
import { spellDef, spellCost } from './spells.js';
import { mergeKind, mergeOdds } from './merge.js';
import { geneCtx } from './genes.js';
import { mcfg, elemMult, enemyElement, foodChain } from './matchup.js';
import { setRaidApi, raidEncStart, raidTick, raidBusy, raidHitMult, raidTakenMult, raidUlt, raidMarkOf, raidTapMax, raidHoldTime, raidBossDown, moveMiniboss, raidSlamFx, raidTap, bossFit } from './raid.js';

// 3×3 자리: seat = 열×3 + 라인. 열 0 = 1열(브루저), 1 = 2열(딜러), 2 = 3열(응원·원거리). 라인 0 위 · 1 가운데 · 2 아래
export const SEATS = 9;
const FRONT = [0, 1, 2], MID = [3, 4, 5], BACK = [6, 7, 8];
export const colOf = (seat) => Math.floor((seat ?? 1) / 3);
export const laneOf = (seat) => (seat ?? 1) % 3;
// 원거리도 '딜러'라 2열 먼저(2026-11-27: 어린 여우가 응원 칸에 서던 문제)
const COL_ORDER = { bruiser: [0, 1, 2], skirm: [1, 0, 2], ranged: [1, 2, 0], support: [2, 1, 0] };
const LANE_ORDER = [1, 0, 2];
/** 역할에 맞는 추천 자리 순서(열 우선, 라인은 가운데 → 위 → 아래) */
export const seatOrder = (style) => (COL_ORDER[style] ?? COL_ORDER.skirm).flatMap((c) => LANE_ORDER.map((l) => c * 3 + l));
const isFront = (seat) => colOf(seat) === 0;
const NEXT = { young: 'teen', teen: 'adult' };
const fail = (reason) => ({ ok: false, reason });

/** Settings with defaults (config.gauntlet). */
export function gcfg(data) {
  return {
    encounters: 12, startUnits: 3, squadMin: 2, squadMax: 6, timeLimit: 60, healPct: 30, restBackPct: 50, life: 5,
    stagger: 0.15, enemyHp: 20, enemyAtk: 1.5, bossHp: 4, bossAtk: 1, growth: 0.05, atkGrowth: 0.04, squash: 0.55, summonCap: 2, bossBase: 6000, bossTune: { boss_bone: { hp: 0.45, atk: 0.55 } }, minionHp: 0.5, summonerHp: 0.7, bossSquad: 3, healMult: 0.3, hardHp: 1, lossRevive: 80, mvpGrow: true, stageHpPow: 0.5, stageAtkPow: 0.4, zeroAttack: 4, zeroInterval: 1.3,
    backMelee: 0.5, frontRanged: 0.75, taunt: 2, startStage: 'young', manaRegen: 0.6,
    hardEssence: 1.5, hardShards: 2, lowStars: 5,
    clashRate: 0.5, clashNoise: 1, clashLean: 0.6, clashBoss: 0.6, gangMax: 2, gangPower: 0.5, charge: 1.1, protectCd: 3,
    // 적 역할(우리와 같은 문법): bruiser 힘겨루기 / skirm 뒷줄 노리고 치고 빠지기 / ranged 뒤에서 쏨 / support 자기 편 거들기
    enemyRole: { normal: 'bruiser', tough: 'bruiser', zombie: 'bruiser', swarm: 'bruiser', skeleton: 'bruiser', miniboss: 'bruiser',
      fast: 'skirm', ghost: 'skirm', flying: 'ranged', bat: 'ranged', wisp: 'ranged', healer: 'support',
      boss_boar: 'bruiser', boss_shadow: 'bruiser', boss_bone: 'bruiser', boss_frost: 'bruiser', boss_bat: 'ranged', boss_lich: 'support' }, guardChance: 0.6, guardTaken: 0.6, peelChance: 0.7, peelDmg: 0.8, peelStun: 0.6, clashBonus: 1.5, clashStun: 1, clashEnemy: 1, assistPush: 0.05, cheerPush: 0.12, goldWin: 8, goldPerEnc: 2, goldLose: 5, reviveCost: 15, reviveUp: 0.5, releaseGold: 3, collapseTaken: 35, collapseStun: 0.8, growLv: { teen: 4, adult: 99 }, relicAll: 4, skirmBack: 0.4, supDmg: 30, supTaken: 20,
    // 적 등급(색): 뒤 스테이지일수록 푸른·붉은·검은 적이 섞여 나옴(체력·공격 ↑) — 긴장감
    ranks: [null, { prefix: '푸른', tint: 0x7fb8ff, hp: 1.25, atk: 1.15 }, { prefix: '붉은', tint: 0xff7a6a, hp: 1.55, atk: 1.3 }, { prefix: '검은', tint: 0x9a7cff, hp: 1.9, atk: 1.5 }],
    rankChance: [[0, 0, 0], [0, 0, 0], [0.08, 0, 0], [0.15, 0.04, 0], [0.18, 0.07, 0], [0.22, 0.1, 0.02], [0.25, 0.12, 0.03], [0.26, 0.14, 0.05], [0.28, 0.16, 0.06], [0.3, 0.18, 0.08], [0.3, 0.2, 0.1], [0.3, 0.22, 0.12]],
    // 신화·키메라 필살기(2026-11-26): 피해만이 아니라 동물 특성에 맞게 판을 바꿈. 게이지 ×ultSlow, 교전마다 한 마리 ultMax번
    // 2026-11-27 사용자 "보는 맛이 있게 적당히 하고 위력을 낮춰서 여러가지 기술 자주": 게이지 2배 빠르게(ultSlow 2→1), 교전마다 3번(1→3), 피해 1.2→0.7, 부가 효과 ×0.6
    // 2026-11-27 밤 "필살기 더 자주": 게이지 절반에서 발동(ultSlow 1→0.5), 교전당 3→6번
    ultSlow: 0.5, ultMax: 6, ultDmg: 0.7, ultPow: 0.6,
    // growLv.adult 99: 레벨로는 성장기까지만 출전(성체로 시작하면 바로 신화급·키메라가 태어나서)
    // 종마다 장점·단점(연전): hp·dmg·interval·taken %, dodge(피하기 더함), heal(응원 회복 배수), push(힘싸움 미는 힘 배수)
    speciesTune: {
      bear: { hp: 20, interval: 25, pro: '아주 튼튼, 셋까지 붙잡음', con: '느림' },
      bison: { push: 1.15, taken: 15, pro: '힘싸움 미는 힘 +20%', con: '받는 피해 +10%' },
      dog: { interval: -15, hp: -10, pro: '빠르게 물고 늘어짐', con: '체력 조금 낮음' },
      ant: { dmg: 20, taken: -10, interval: -15, pro: '단단한 껍질·빠른 집게, 떼로 낚아챔', con: '체력이 낮음' },
      frog: { interval: 5, hp: 25, dmg: 15, push: 1.1, pro: '혀로 낚아채는 탱커', con: '조금 느림' },
      tiger: { dmg: 8, hp: -5, pro: '한 방이 셈', con: '탱커에게 잘 붙잡힘' },
      fox: { dmg: 50, hp: 10, pro: '작은 몸으로 잘 피하고 세게 침', con: '맞으면 금방 쓰러짐' },
      rabbit: { dodge: 0.15, dmg: 10, hp: 20, pro: '엄청 빠르고 잘 피하는 응원', con: '한 방이 약함' },
      rooster: { heal: 1.4, hp: 10, pro: '응원 회복 +30%', con: '몸이 약함' },
      crow: { dmg: -10, pro: '날아서 붙잡히지 않음, 멀리서 침', con: '피해 -10%' },
      wolf: { dmg: 5, pro: '무리 사냥꾼: 동료가 쓰러질수록 세짐', con: '혼자일 땐 평범' },
      eagle: { dmg: 15, interval: 10, pro: '가장 센 한 방, 날아서 빠져나감', con: '아주 느림' },
      bighorn: { taken: -15, dmg: 0, push: 1.2, pro: '박치기: 힘싸움 +20%, 받는 피해 -15%', con: '피해가 약함' },
      grasshopper: { push: 1.6, hp: 20, heal: 1.2, pro: '응원이 힘싸움을 크게 밀어 줌', con: '몸이 아주 약함' },
      monkey: { dmg: 35, hp: 15, interval: 10, pro: '꼬리로 낚아채고 잘 빠져나감', con: '조금 느림' },
    },
    // 잡아채기: 후열을 노리고 들어오는 딜러를 낚아채는 동물(우리: 개구리 혀·원숭이 꼬리·개미 떼 / 적: 좀비 손·해골 손·뼈 보스)
    catchers: { frog: 'tongue', monkey: 'tail', ant: 'swarm' }, eCatchers: { zombie: 'hand', skeleton: 'bone', boss_bone: 'bone', boss_lich: 'shadow' },
    snatchCd: 7, snatchChance: 0.75, eSnatchChance: 0.5, snatchStun: 1.2, snatchPin: 2.5, deepT: 3, deepTaken: 20, backstab: 1.3, deepFocus: 0.45, sellWeak: 25, extraCost: 15, extraUp: 1, extraMax: 2, globeReroll: 8, globeRerollUp: 6, globeRerollMax: 3, squadMaxTier: { normal: 6, hard: 7, hardcore: 8, god: 9 }, bossSquadTier: { normal: 3, hard: 4, hardcore: 5, god: 6 }, tierMul: { hard: { hp: 1, atk: 1 }, hardcore: { hp: 1, atk: 1 }, god: { hp: 1, atk: 1 } }, reviveSkill: { hp: 35, delay: 1.2, perEnc: 1, shield: 2 }, cleanseCd: 6, pouchMax: 150, pouchTake: 40, potionCost: 10, potionHeal: 35, trainCost: 20, trainDmg: 10, trainMax: 3,
    // 붙잡기: 남는 정원이 있는 탱커는 같은 라인 딜러에게 붙어 후열 노리기를 막음. 고급 딜러(나는 동물·신화·키메라·날쌘 종 성장기 이상)는 빠져나감
    slippery: ['fox', 'monkey', 'rabbit'], eSlippery: ['ghost', 'bat', 'boss_bat'], enemyCap: { bruiser: 2, boss: 3 },
    // 역전 각성(약할수록 큼), 주인공(선택과 집중), 무쌍 견제(한 마리가 피해를 독식하면 적이 집중)
    awakenHp: 0.35, awakenAllies: 0.5, awakenBase: 30, awakenWeak: 70, awakenSpeed: 25, awakenHeal: 0.5,
    starDmg: 30, starHp: 20, starOthers: -10, focusShare: 0.55, focusAfter: 8, focusTaken: 15, focusChance: 0.5,
    // 수싸움 배우기: 스테이지별 단계 0 = 앞라인 힘싸움만(돌파 없음), 1 = 수업(교전 번호별 'wall' 앞이 안 뚫림 → 후열 노리기 / 'dive' 우리가 당함 → 지키기), 2 = 자유
    tacticLevel: { 'forest-1': 0, 'forest-2': 1 }, lessons: { 'forest-2': { 2: 'wall', 4: 'dive' } }, lessonWallHp: 1.5, globeTeenAt: 5, adultMeals: 2, diveMarkAt: 0.55, diveGap: 5, interceptChance: 0.6, diveBonus: 1.6, diveStun: 0.8, holdGuardPush: 0.3, holdGuardChance: 0.5, interceptStun: 0.7, guardFreePush: 0.5, isolateTaken: 20, isolatePush: 0.7,
    // 수싸움: 우리 쪽 돌파꾼(사냥)·요격꾼 기본값, 적 돌파꾼, 도발(지키면서 힘싸움을 안 놓침), 벽 통과(지키기 무시)
    // 돌파 몸놀림(2026-11-27): 순간이동 대신 달려들기(dash)·점프(jump)·날아들기(fly). 막는 쪽은 막아서기(block)·다리걸기(trip)·발목잡기(grab)
    //  달려들기 → 막아서기 또는 다리걸기(넘어짐) · 점프 → 발목잡기(끌려 떨어짐) · 날아들기 → 발목잡기만(반은 빠져나감)
    diveJump: ['fox', 'rabbit', 'monkey', 'frog', 'grasshopper'], diveFly: ['crow', 'eagle', 'bat', 'boss_bat', 'flying', 'ghost', 'wisp'],
    tripChance: 0.5, flyEscape: 0.5, tripStun: 1.1, tripHurt: 0.06,
    hunters: ['tiger', 'wolf', 'monkey', 'eagle', 'fox'], interceptors: ['rabbit', 'bighorn', 'ant'], taunters: ['bear', 'bison'],
    enemyDivers: ['fast', 'ghost', 'bat', 'boss_bat'], phasers: ['ghost'], enemyGuards: ['skeleton', 'tough'],
    temper: { dive: { diveChance: 0.9, guard: 0.15 }, wall: { diveChance: 0.4, guard: 0.5 }, mixed: { diveChance: 0.65, guard: 0.3 }, lessonWall: { diveChance: 0, guard: 0.15 }, lessonDive: { diveChance: 1, guard: 0.3 } }, hardHeal: 15, eliteChance: 0.35, eliteHp: 1.3, bossPhase2: true, stanceEvery: 2.5, stancePref: 0.45, stanceNative: 0.15, cheerHeal: 3, dodge: 0.25, ...(data.config.gauntlet ?? {}),
  };
}

const aliveU = (u) => u && !u.down && !u.resting;
const aliveE = (e) => e && e.hp > 0;
export const unitsIn = (state) => state.seats.map((uid) => state.field.find((u) => u.uid === uid) ?? null);
export const fighters = (state) => unitsIn(state).filter(aliveU);
export const enemiesIn = (state) => state.eSeats.map((eid) => state.enemies.find((e) => e.eid === eid) ?? null);
/** 싸움 모양: 브루저 = 힘겨루기, 근접 딜러·기술 = 치고 빠지기, 원거리·응원 = 뒤에서 거들기 */
export const roleOfEnemy = (g, id, def) => g.enemyRole?.[id] ?? (def?.flying ? 'ranged' : def?.heal ? 'support' : 'bruiser');
/** 원래 싸움 모양(태세 없이) */
/** 빌드(고급자 전용, 기본은 추천=null): 역할 모양(style)과 덤·벌. 근접 동물은 melee, 원거리는 ranged 목록에서 고름
 *  dodge = 맞붙어 있어도 피하는 확률, heal = 응원 회복 배수 */
export const BUILDS = {
  tank: { icon: '🛡', name: '탱커', style: 'bruiser', hp: 25, dmg: -15, tip: '튼튼하게 앞에서 버팀' },
  tankdeal: { icon: '🛡⚔', name: '탱딜', style: 'bruiser', hp: 5, dmg: 15, taken: 10, tip: '앞에서 버티며 세게 침' },
  dodgetank: { icon: '💨', name: '회피탱', style: 'bruiser', hp: -15, dodge: 0.35, tip: '앞에서 요리조리 피함' },
  dealtank: { icon: '⚔🛡', name: '딜탱', style: 'skirm', hp: 20, dmg: -5, taken: -15, dodge: 0, tip: '덜 피하지만 잘 안 쓰러짐' },
  deal: { icon: '⚔', name: '딜러', style: 'skirm', hp: -15, dmg: 20, tip: '치고 빠지며 세게' },
  ranged: { icon: '🏹', name: '원딜', style: 'ranged', tip: '뒤에서 쏨' },
  sniper: { icon: '🎯', name: '저격', style: 'ranged', dmg: 45, interval: 35, tip: '느리지만 한 방이 큼' },
  support: { icon: '✚', name: '응원', style: 'support', dmg: -45, heal: 1.1, tip: '앞 친구를 살림' },
  battlecheer: { icon: '✚⚔', name: '전투응원', style: 'support', dmg: -15, heal: 0.5, tip: '응원하며 같이 싸움' },
};
/** 작은 몸 피하기(2026-11-27): 몸이 작을수록(기본 체력이 낮을수록) 잘 피함 — 체력 차이를 다른 장점으로 메움. 힘싸움 중엔 반만 */
export function smallDodge(u, data) {
  const sc = data?.config?.gauntlet?.smallBody;
  if (!sc || !u || u.kind === 'weak') return 0;
  const ids = u.kind === 'chimera' ? u.parts ?? [] : [u.speciesId];
  const hp = ids.reduce((a, id) => a + (data.unitById[id]?.hp ?? sc.ref), 0) / Math.max(1, ids.length);
  return Math.max(0, Math.min(sc.max, (sc.ref - hp) / sc.span));
}
/** 화면용 수치: ❤ 체력 · ⚔ 공격(한 번) · ⚡ 빠르기(1초에 몇 번) · 🛡 막기(받는 피해 줄임 %) · 💨 피하기 % */
export function statLine(u, data) {
  const g = gcfg(data);
  const def = -((u.mods?.taken ?? 0) + (u.stance === 'tank' ? (nativeStance(u) === 'tank' ? -35 : -25) : 0));
  const bd = u.kind === 'base' && u.build ? BUILDS[u.build]?.dodge : undefined;
  const dodge = Math.min(0.6, (bd != null ? bd : styleOf(u) === 'skirm' ? g.dodge : 0) + (tuneOf(u, g)?.dodge ?? 0) + smallDodge(u, data));
  return { hp: Math.round(u.maxHp ?? u.stats.hp), atk: Math.round(effDamage(u)), spd: Math.round((1 / effInterval(u)) * 10) / 10, def: Math.round(def), dodge: Math.round(dodge * 100) };
}
/** 덱 화면용: 종·단계·빌드의 기본 수치(전투 덤 제외) */
export function previewStats(data, speciesId, stage = 'young', build = null) {
  const u = makeUnit({ nextUid: 1, talents: [], favor: {}, levels: {}, relics: [] }, data, { kind: 'base', speciesId, stage, parts: null, traits: [] });
  u.build = build; applyBuild(u);
  const m = { ...(u.extraMods ?? {}) };
  const tn = tuneOf(u, gcfg(data));
  if (tn) for (const k of ['hp', 'dmg', 'interval', 'taken']) if (tn[k]) m[k] = (m[k] ?? 0) + tn[k];
  u.maxHp = Math.round(u.stats.hp * (1 + (m.hp ?? 0) / 100));
  u.mods = { ...emptyMods(), dmg: m.dmg ?? 0, taken: m.taken ?? 0, interval: m.interval ?? 0 };
  return statLine(u, data);
}
export const BUILD_SETS = { melee: ['tank', 'tankdeal', 'dodgetank', 'dealtank', 'deal'], ranged: ['ranged', 'sniper', 'support', 'battlecheer'] };
export const buildSet = (u) => (u.kind !== 'base' ? null : u.stats.range > 1 || u.stats.role === 'buffer' ? 'ranged' : 'melee');
/** 빌드의 덤·벌을 mods에 넣을 꼴로(u.extraMods) */
export function applyBuild(u) {
  const b = u.kind === 'base' && u.build ? BUILDS[u.build] : null;
  u.buildMods = b ? { hp: b.hp ?? 0, dmg: b.dmg ?? 0, taken: b.taken ?? 0, interval: b.interval ?? 0 } : null;
  u.extraMods = u.buildMods;
  return u;
}
/** 종 장단점(키메라는 첫 부위 종을 따름) */
export const tuneOf = (u, g) => g.speciesTune?.[u.kind === 'chimera' ? u.parts?.[0] : u.speciesId] ?? null;
/** 주인공(선택과 집중): 정비 때 한 마리를 고르면 그 동물만 세지고 나머지는 조금 약해짐. 같은 동물을 다시 누르면 해제 */
export function setStar(state, data, uid) {
  const u = [...state.field, ...state.bench].find((x) => x && x.uid === uid);
  if (!u) return fail('notFound');
  state.star = state.star === uid ? null : uid;
  refreshMods(state, data);
  return { ok: true, star: state.star };
}
/** 빌드 고르기: 추천(null) → 목록 차례로 → 추천 */
export function cycleBuild(state, data, uid) {
  const u = [...state.field, ...state.bench].find((x) => x && x.uid === uid);
  if (!u) return fail('notFound');
  const set = buildSet(u);
  if (!set) return fail('noBuild');
  const list = [null, ...BUILD_SETS[set]];
  u.build = list[(list.indexOf(u.build ?? null) + 1) % list.length];
  u.tactic = null;
  state.builds[u.speciesId] = u.build;
  applyBuild(u); refreshMods(state, data);
  return { ok: true, build: u.build };
}
// 종마다 어울리는 싸움 모양(사거리보다 먼저): 개구리는 긴 혀를 가진 브루저
const SPECIES_STYLE = { frog: 'bruiser' };
export const baseStyle = (u) => (u.kind === 'base' && u.build && BUILDS[u.build] ? BUILDS[u.build].style : SPECIES_STYLE[u.kind === 'chimera' ? null : u.speciesId] ?? (u.stats.role === 'buffer' ? 'support' : u.stats.range > 1 ? 'ranged' : u.stats.role === 'bruiser' ? 'bruiser' : u.stats.role === 'buffer' ? 'support' : u.stats.role === 'weak' ? 'support' : 'skirm'));
/** 작전(정비 때 고름): 브루저 버티기/지키기, 딜러 사냥/요격, 응원 앞/뒤. 없는 역할은 null */
export const TACTICS = { bruiser: ['hold', 'guard'], skirm: ['help', 'hunt', 'intercept'], support: ['front', 'back'], ranged: ['hold', 'hunt'] };
/** 작전 이름(한 단어)·아이콘: 화면과 안내에 씀 */
export const TACTIC_LABEL = { hold: '💪 버티기', guard: '🛡 지키기', help: '🤝 돕기', hunt: '🎯 사냥', intercept: '✋ 요격', front: '📣 앞', back: '🧿 뒤' };
export function defaultTactic(u, g) {
  const st = baseStyle(u), ids = u.kind === 'chimera' ? u.parts ?? [] : [u.speciesId];
  if (st === 'skirm') return ids.some((id) => g.interceptors.includes(id)) ? 'intercept' : 'hunt';
  if (st === 'ranged') return ids.some((id) => g.hunters.includes(id)) ? 'hunt' : 'hold';
  return TACTICS[st]?.[0] ?? null;
}
export const tacticOf = (u, g) => { const opts = TACTICS[styleOf(u)]; if (!opts) return null; return opts.includes(u.tactic) ? u.tactic : defaultTactic(u, g); };
export function cycleTactic(state, data, uid) {
  const u = [...state.field, ...state.bench].find((x) => x && x.uid === uid);
  if (!u) return fail('notFound');
  if (state.tLevel === 0) return fail('locked');
  const g = gcfg(data), opts = TACTICS[styleOf(u)];
  if (!opts) return fail('noTactic');
  const cur = tacticOf(u, g);
  u.tactic = opts[(opts.indexOf(cur) + 1) % opts.length];
  return { ok: true, tactic: u.tactic };
}
/** 난이도 사다리: 노멀 → 하드 → 하드코어(정예 2배·짐작 없음·회복 ↓) → 신계(하드코어 + 매주 바뀌는 신의 규칙) */
export const GOD_RULES = {
  giants: { name: '거인의 주간', desc: '적이 모두 🛡 벽 — 힘싸움으로 밀어야 함' },
  swarm: { name: '날쌘 주간', desc: '적 ⚔ 돌파꾼이 두 배로 자주 노림' },
  noTaunt: { name: '도발 금지', desc: '도발이 안 듦, 지키기만 남음' },
  heroes: { name: '영웅의 주간', desc: '역전 각성이 두 번, 더 크게' },
  myth: { name: '신화의 주간', desc: '신화급·키메라 피해 +40%, 나머지 -15%' },
  glass: { name: '유리 주간', desc: '양쪽 다 피해 1.5배' },
};
/** 이번 주 신의 규칙(월요일마다 바뀜, 모두 같음) */
export function godRuleOf(ms) { const keys = Object.keys(GOD_RULES); const week = Math.floor((ms / 86400000 + 3) / 7); return keys[week % keys.length]; }
export const weekKey = (ms) => `w${Math.floor((ms / 86400000 + 3) / 7)}`;
const rule = (state, k) => state.godRule === k;

/** 손맛: 빨간 화살표로 노려진 우리 동물을 톡 누르면 1.2초 보호막(한 번 노릴 때 한 번, 교전마다 3번까지) */
export function tapShield(state, uid) {
  if (state.phase !== 'fight') return fail('noFight');
  const u = findU(state, uid);
  if (!u || !aliveU(u)) return fail('notFound');
  const warned = state.bossWarn && laneOf(u.seat) === state.bossWarn.lane;
  const rmark = raidMarkOf(state, uid);   // 레이드 표식(🎯)도 눌러서 막음
  if (!warned && !rmark && !state.enemies.some((e) => aliveE(e) && e.diveMark?.uid === uid)) return fail('notMarked');
  if ((state.taps ?? 0) >= raidTapMax(state, state.dataRef, 3)) return fail('noTaps');
  if ((u.shieldT ?? 0) > state.time) return fail('already');
  state.taps = (state.taps ?? 0) + 1;
  u.shieldT = Math.max(state.time + 1.2, warned ? state.bossWarn.at + 0.3 : 0, rmark ? rmark.at + 0.3 : 0); u.shieldBy = null;
  noteStatus(state, 'buff', null, [u], 'shield', 'tapShield', u.shieldT - state.time);
  state.events.push({ type: 'tapShield', uid });
  return { ok: true };
}
/** 한 번에 바꾸기(수업 버튼·초보용): plan 'hunt' = 딜러 사냥, 'guard' = 브루저 지키기 + 딜러 요격 + 응원 뒤, 'front' = 모두 기본(앞라인) */
export function setPlan(state, data, plan) {
  const g = gcfg(data);
  for (const u of [...state.field, ...state.bench]) {
    if (!u) continue;
    const st = styleOf(u);
    if (plan === 'hunt' && (st === 'skirm' || st === 'ranged')) u.tactic = 'hunt';
    else if (plan === 'guard') u.tactic = { bruiser: 'guard', skirm: 'intercept', support: 'back' }[st] ?? u.tactic;
    else if (plan === 'front') u.tactic = TACTICS[st]?.[0] ?? null;
  }
  state.events.push({ type: 'plan', plan });
  return { ok: true };
}
// ---------- 체력 장부(2026-11-27 선생님 "데미지가 들어가는게 직관적이지 않음… 막 회복도 되는데 이해가 안돼") ----------
//  교전 중 체력이 실제로 바뀔 때마다 한 줄씩 적음: 누가(by) → 누구(side·id)에게, 얼마나(d = 실제 체력 변화, 깎이면 −), 무엇으로(kind·cause).
//  화면은 이 장부로만 숫자를 띄움(뜨는 숫자 = 실제 줄어든·찬 체력). 막힌 양(blocked)은 따로. 밸런스 계산은 바꾸지 않음.
//  kind: hit(맞음) dot(독·불) heal(회복) regen(스스로 재생) drain(흡혈) revive(일어남) reflect(가시) env(지형·매복·붕괴)
//        buff·debuff(체력 변화 없음, d 0: 누가 누구에게 무엇을 걸었나 → 연결 이펙트·머리 위 아이콘용)
const HPLOG_MAX = 400;
const refOf = (x) => (x ? (x.eid != null ? { side: 'e', id: x.eid } : x.uid != null ? { side: 'u', id: x.uid } : null) : null);
export function hpNote(state, entry) {
  state.hpLog ??= []; state.hpN = (state.hpN ?? 0) + 1;
  const row = { n: state.hpN, seq: state.curSeq ?? null, t: state.time, ...entry };
  state.hpLog.push(row);
  if (state.hpLog.length > HPLOG_MAX) state.hpLog.splice(0, state.hpLog.length - HPLOG_MAX);
  // 교전 요약: 우리 동물마다 때린 양·받은 양·막은 양·고친 양
  const B = (state.clBook ??= {});
  const bk = (r) => (r && r.side === 'u' ? (B[r.id] ??= { dmg: 0, taken: 0, block: 0, heal: 0 }) : null);
  if (entry.d < 0 && entry.side === 'e') { const b = bk(entry.by); if (b) b.dmg += -entry.d; }
  if (entry.d < 0 && entry.side === 'u') { const b = bk({ side: 'u', id: entry.id }); if (b) b.taken += -entry.d; }
  if (entry.blocked > 0 && entry.side === 'u') { const b = bk(entry.shieldBy ?? { side: 'u', id: entry.id }); if (b) b.block += entry.blocked; }
  if (entry.d > 0 && entry.side === 'u' && entry.kind !== 'regen') { const b = bk(entry.by) ?? null; if (b) b.heal += entry.d; }
  return row;
}
/** 체력을 바꾸고 장부에 적음(계산식은 부르는 쪽 그대로) */
function setHp(state, x, hp, kind, by, cause) {
  const h0 = x.hp; x.hp = hp; const d = x.hp - h0;
  if (Math.abs(d) > 1e-9) hpNote(state, { side: x.eid != null ? 'e' : 'u', id: x.eid ?? x.uid, d, kind, by: refOf(by), cause });
  return d;
}
const healTo = (state, x, amt, by, cause, kind = 'heal') => setHp(state, x, Math.min(x.maxHp, x.hp + amt), kind, by, cause);
/** 도움 효과(aid 사건)로 그려지는 회복: 장부에 적되 aid 표시(화면 숫자는 #97 도움 효과가 띄움). 반환 = 찬 체력(반올림, 이전 healU와 같음) */
const healA = (state, x, amt, by, cause) => { const d = healTo(state, x, amt, by, cause); if (d > 1e-9) state.hpLog[state.hpLog.length - 1].aid = true; return Math.round(d); };
/** 버프·디버프를 걸었다는 기록(체력 변화 없음) */
// aid = true: 차분한 전투(#97)의 도움 효과(aid 사건 → 빛 구슬·+숫자)가 이미 그리는 줄 → 화면 장부(clarity)는 숫자·빛줄기를 겹쳐 그리지 않음
function noteStatus(state, kind, by, to, icon, cause, dur = 0, aidFx = false) { const t = to.filter(Boolean).map(refOf).filter(Boolean); if (t.length) hpNote(state, { kind, d: 0, by: refOf(by), to: t, icon, cause, dur, ...(aidFx ? { aid: true } : {}) }); }
/** 한 동작(공격·기술·힘싸움 결판 등)에 번호를 붙여, 그 사이 생긴 이벤트·장부 줄을 묶음 → 화면이 맞는 순간에 함께 보여 줌 */
function inSeq(state, fn) {
  const n0 = state.events.length, prev = state.curSeq;
  state.seqN = (state.seqN ?? 0) + 1; state.curSeq = state.seqN;
  try { return fn(); } finally { for (let i = n0; i < state.events.length; i++) if (state.events[i] && state.events[i].seq == null) state.events[i].seq = state.curSeq; state.curSeq = prev; }
}
const dstat = (state, k) => { state.dstat ??= {}; state.dstat[k] = (state.dstat[k] ?? 0) + 1; };
const isBack = (u) => ['ranged', 'support'].includes(styleOf(u));
/** 돌파 몸놀림: 'dash' 달려들기 · 'jump' 점프 · 'fly' 날아들기 (키메라는 재료 중 하나라도 해당하면) */
export function diveMove(x, g) {
  const ids = x.eid != null ? [x.id] : x.kind === 'chimera' || x.kind === 'weak' ? x.parts ?? [] : [x.speciesId];
  if (x.eid != null ? x.flying || g.diveFly.includes(x.id) : x.stats?.flyer || ids.every((id) => g.diveFly.includes(id))) return 'fly';
  return ids.some((id) => g.diveJump.includes(id)) ? 'jump' : 'dash';
}
/** 막는 기술: 달려들기 → 막아서기/다리걸기, 점프·날기 → 발목잡기. 날아들기는 반은 빠져나감(null) */
function stopKind(state, mv, g) {
  if (mv === 'dash') return state.rng() < g.tripChance ? 'trip' : 'block';
  if (mv === 'fly' && state.rng() < g.flyEscape) return null;
  return 'grab';
}
/** 돌파꾼인가(후열을 노림) */
function divesU(u, g) { return (styleOf(u) === 'skirm' || styleOf(u) === 'ranged') && tacticOf(u, g) === 'hunt'; }
const isDiverE = (e, g) => g.enemyDivers.includes(e.id) || e.style === 'skirm';
function divesE(state, e, g) { return isDiverE(e, g) && (state.temper?.diveChance ?? 0.65) > 0; }

/** 신화급·키메라는 태세(탱·딜·서폿)를 넘나듦 */
export const canStance = (u) => !!u && (u.kind === 'chimera' || (u.kind === 'base' && u.stage === 'spirit'));
export const nativeStance = (u) => ({ bruiser: 'tank', skirm: 'deal', ranged: 'deal', support: 'support' })[baseStyle(u)];
export const styleOf = (u) => (u.stance === 'tank' ? 'bruiser' : u.stance === 'deal' ? (u.stats.range > 1 ? 'ranged' : 'skirm') : u.stance === 'support' ? 'support' : baseStyle(u));
const findU = (state, uid) => state.field.find((u) => u.uid === uid);
const findE = (state, eid) => state.enemies.find((e) => e.eid === eid);
export const clashOfU = (state, uid) => (state.clashes ?? []).find((c) => c.uid === uid) ?? null;
export const clashOfE = (state, eid) => (state.clashes ?? []).find((c) => c.eid === eid || (c.helpers ?? []).includes(eid)) ?? null;
const isRangedEnemy = (e) => e.flying || !!e.heal || e.id === 'wisp' || e.id === 'boss_lich' || e.id === 'skeleton';

/** Which stage waves become the encounters: spread evenly, the last one is the boss wave. */
/** 난이도 이름: normal · hard · hardcore · god */
export const tierKey = (x) => x?.tier ?? (x?.hard ? 'hard' : 'normal');
/** 난이도별 적 무리 크기(2026-11-28 "난이도가 올라가면 상대방 인원은 6에서 9까지"): 마지막 일반 교전의 마릿수 · 보스 교전 마릿수 */
export const squadSizes = (data, tier = 'normal') => { const g = gcfg(data); return { max: g.squadMaxTier?.[tier] ?? g.squadMax, boss: g.bossSquadTier?.[tier] ?? g.bossSquad }; };
export function planEncounters(stage, data, rng, tier = 'normal') {
  const g = gcfg(data), W = stage.waves.length, N = Math.min(g.encounters, W), SQ = squadSizes(data, tier);
  const out = [];
  for (let i = 0; i < N; i++) {
    const wi = N === 1 ? W - 1 : Math.round((i * (W - 1)) / (N - 1));
    const spec = stage.waves[wi];
    const boss = i === N - 1 ? stage.boss ?? null : null;
    // 난이도로 늘어나는 마릿수는 뒤로 갈수록 붙음(제곱): 앞 교전은 노멀과 비슷하고 마지막 일반 교전에서 SQ.max에 닿음
    const tt = i / Math.max(1, N - 2), baseMax = Math.min(SQ.max, g.squadMax);
    const size = boss ? SQ.boss : Math.round(g.squadMin + (baseMax - g.squadMin) * tt + (SQ.max - baseMax) * tt * tt);
    const ids = [];
    if (boss) ids.push(boss);
    for (const x of spec.extra ?? []) if (x !== boss && ids.length < size) ids.push(x);
    const mix = Object.entries(spec.mix).filter(([id]) => data.enemyById[id]);
    const total = mix.reduce((s, [, w]) => s + w, 0);
    while (ids.length < size) {
      let t = rng() * total, pick = mix[0][0];
      for (const [id, w] of mix) { if ((t -= w) < 0) { pick = id; break; } }
      // 튼튼한 적·힐러는 한 무리에 둘까지
      if (['tough', 'healer', 'zombie'].includes(pick) && ids.filter((x) => x === pick).length >= 2) pick = mix.find(([id]) => !['tough', 'healer', 'zombie'].includes(id))?.[0] ?? pick;
      ids.push(pick);
    }
    // 역할 고르게: 무리에 브루저(힘겨루기)만 몰리지 않게 — 브루저는 절반까지, 넷 이상이면 돌격·궁수/지원을 하나씩
    if (!boss) balanceRoles(ids, stage, data, rng, g);
    // 보름달 교전: 스테이지마다 한 번(보스 전), 이긴 뒤 정비에서 합성 +10%
    const sn = +(String(stage.id).match(/\d+/)?.[0] ?? 1);
    const moon = !boss && N >= 4 && i === 1 + ((sn * 2) % Math.max(1, N - 2));
    out.push({ wave: wi + 1, ids, boss: !!boss, moon });
  }
  return moveMiniboss(out, data);   // 미니보스 자리: raid.json common.minibossAt(없으면 그대로)
}

function balanceRoles(ids, stage, data, rng, g) {
  const role = (id) => roleOfEnemy(g, id, data.enemyById[id]);
  const pool = [...new Set(stage.waves.flatMap((w) => Object.keys(w.mix)))].filter((id) => data.enemyById[id] && !data.enemyById[id].boss);
  const of = (r) => pool.filter((id) => role(id) === r);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const swapIn = (want) => { const cand = want.flatMap(of); if (!cand.length) return false; const i = ids.findIndex((id) => role(id) === 'bruiser' && !data.enemyById[id].boss && id !== 'miniboss'); if (i < 0) return false; ids[i] = pick(cand); return true; };
  const count = (r) => ids.filter((id) => role(id) === r).length;
  if (ids.length >= 3 && count('skirm') === 0) swapIn(['skirm']);
  if (ids.length >= 4 && count('ranged') + count('support') === 0) swapIn(['ranged', 'support']);
  let guard = 0;
  while (count('bruiser') > Math.ceil(ids.length / 2) && guard++ < 6) if (!swapIn(['skirm', 'ranged', 'support'])) break;
}

/** Seat for a unit by its natural role: melee and bruisers in front, ranged and cheerers behind. */
export function prefersFront(u) {
  if (u.stats.range > 1) return false;
  return u.stats.role !== 'buffer' || u.stats.range <= 1;
}

/** 추천 배치: 브루저 1열, 딜러 2열, 응원·원거리 3열(넘치면 옆 열). 9칸에 6마리 */
export function autoSeat(state, units) {
  const seats = Array(SEATS).fill(null);
  const put = (u, order) => { const i = order.find((k) => seats[k] == null); if (i == null) return false; seats[i] = u.uid; u.seat = i; return true; };
  for (const st of ['bruiser', 'support', 'skirm', 'ranged']) for (const u of units.filter((x) => baseStyle(x) === st)) put(u, seatOrder(st));
  for (const u of units) if (!seats.includes(u.uid)) put(u, seatOrder('skirm'));
  return seats;
}

/** New run of one stage. opts: battleOptions(...) plus { hard }. */
export function createGauntlet(data, stageId, seed = 1, opts = {}) {
  const stage = data.stageById[stageId];
  if (!stage) throw new Error('createGauntlet: unknown stage ' + stageId);
  const cfg = data.config, g = gcfg(data);
  const state = {
    mode: 'gauntlet', stage, rng: makeRng(seed), hard: !!opts.hard || !!opts.tier, tier: opts.tier ?? null, godWeek: opts.tier === 'god' ? weekKey(Date.now()) : null, godRule: opts.tier === 'god' ? opts.godRule ?? godRuleOf(Date.now()) : null, phase: 'fight', result: null,
    enc: 0, encTime: 0, time: 0, actGap: 0, life: opts.hard ? 1 : g.life, field: [], bench: Array(cfg.benchSize + (opts.benchBonus ?? 0)).fill(null),
    seats: Array(SEATS).fill(null), enemies: [], eSeats: Array(SEATS).fill(null), nextUid: 1, nextEid: 1, events: [], log: [],
    known: { recipes: new Set(opts.known?.recipes ?? []), failed: new Set(opts.known?.failed ?? []) },
    levels: { ...(opts.levels ?? {}) }, builds: { ...(opts.builds ?? {}) }, allyBuffs: [], kills: 0, relics: [], relicOffer: null, talents: [...(opts.talents ?? [])],
    finds: { recipes: [], flops: [], species: [], bonds: [] }, foundRelics: new Set(opts.foundRelics ?? []), seenSpecies: new Set(opts.seenSpecies ?? []), seenBonds: new Set(opts.seenBonds ?? []),
    favor: { ...(opts.favor ?? {}) }, pool: opts.pool ? [...opts.pool] : data.config.roster?.starter ?? data.units.map((u) => u.id),
    spells: [...(opts.spells ?? [])], soul: opts.soul && data.unitById[opts.soul.id] ? { ...opts.soul } : null,
    dmgWave: {}, dmgRun: {}, mana: cfg.spells?.start ?? 0, spellCd: 0, weakBonus: cfg.weakBonus ?? 30, downs: 0, wins: 0, losses: 0,
    summonCount: 0, offer: null, seenEnemies: new Set(), gold: opts.pouch ?? 0, extraBuys: 0, revives: 0, collapse: { u: false, e: false },
  };
  state.life += eco(state, data, 'life') ?? 0;
  state.maxLife = state.life;
  state.mana = Math.min(cfg.spells?.max ?? 0, state.mana + (eco(state, data, 'manaStart') ?? 0));
  state.gold += eco(state, data, 'startGold') ?? 0;   // 특성 '씨앗 주머니'
  state.plan = opts.plan ?? planEncounters(stage, data, state.rng, tierKey(state));
  if (opts.duel) { state.duel = { ...opts.duel }; state.life = state.maxLife = 99; }
  // 처음 출전: 덱 전부(어린 단계). 소울펫이 있으면 왕관.
  // 출전 단계: 종 레벨이 오르면 성장기(Lv3)·성체(Lv6)로 시작. 신화급은 혼자 못 됨(합성만)
  const lvStage = (id) => { const lv = state.levels[id] ?? 1; return lv >= g.growLv.adult ? 'adult' : lv >= g.growLv.teen ? 'teen' : g.startStage; };
  const legend = opts.legend ?? null;
  // 2026-11-27 사용자 "초반엔 3마리로 시작": 덱 앞에서부터 startUnits마리만 먼저 출전, 나머지는 보상(지구본)으로 합류
  // (덱 대결은 상대와 같은 조건이라 덱 6마리 그대로, 시험용으로 opts.startUnits로 바꿀 수 있음)
  const startN = Math.max(1, Math.min(6, opts.startUnits ?? (opts.duel ? 6 : g.startUnits ?? 6)));
  const deckIds = state.pool.filter((id) => data.unitById[id]).slice(0, legend ? startN - 1 : startN);
  const units = deckIds.map((id) => newAnimal(state, data, id, lvStage(id)));
  // 전설 카드: 덱 한 칸을 차지하고 성체로 출전(같은 종 성체와 합치면 다시 신화급). 키메라는 키메라 그대로
  if (legend) {
    const inst = legend.kind === 'chimera'
      ? { kind: 'chimera', speciesId: legend.speciesId, stage: 'adult', parts: [...legend.parts], traits: (legend.traits ?? []).map((t) => ({ ...t })) }
      : { kind: 'base', speciesId: legend.speciesId, stage: 'adult', parts: null, traits: (legend.traits ?? []).map((t) => ({ ...t })) };
    if (data.unitById[inst.speciesId] || data.recipeById?.[inst.speciesId]) { const u = prep(makeUnit(state, data, inst)); u.legend = true; units.push(u); }
  }
  for (const u of units) if (state.soul && u.speciesId === state.soul.id) { u.soul = true; u.soulKills = 0; }
  state.field = units;
  state.seats = autoSeat(state, units);
  // 상점에서 미리 산 것: 유물(바로 지님) · 먹이(가장 어린 동물이 한 단계) · 깃털(첫 부활 공짜)
  for (const id of opts.prep?.relics ?? []) if (data.relicById[id] && !state.relics.includes(id)) state.relics.push(id);
  for (let i = 0; i < (opts.prep?.food ?? 0); i++) { const kid = state.field.filter((u) => u.kind === 'base' && NEXT[u.stage]).sort((a, b) => (a.stage === 'young' ? 0 : 1) - (b.stage === 'young' ? 0 : 1))[0]; if (kid) grow(state, data, kid); }
  state.feathers = opts.prep?.feathers ?? 0;
  state.genePotion = opts.prep?.gene ?? 0; state.genePity = { ...(opts.genePity ?? {}) }; state.moonNow = false;
  if (state.relics.length) refreshMods(state, data);
  // 첫 교전도 정비 화면부터(자리·작전을 먼저 보고 출발): prelude
  if (opts.prelude) { state.phase = 'regroup'; state.prelude = true; state.offer = null; refreshMods(state, data); state.events.push({ type: 'regroup', prelude: true }); return state; }
  startEncounter(state, data);
  return state;
}

function newAnimal(state, data, speciesId, stage = 'young') {
  const u = makeUnit(state, data, { kind: 'base', speciesId, stage, parts: null, traits: rollTraits(speciesId, data, state.rng) });
  if (!state.seenSpecies.has(speciesId)) { state.seenSpecies.add(speciesId); state.finds.species.push(speciesId); }
  state.summonCount += 1;
  u.build = state.builds?.[speciesId] ?? null; applyBuild(u);
  return prep(u);
}
const prep = (u) => Object.assign(u, { tactic: u.tactic ?? null, gauge: u.gauge ?? Math.random() * 0.3, ultGauge: u.ultGauge ?? 0, elCd: 0, skillT: {}, statusT: {} });

/** Put the encounter's enemies on their seats. */
export function startEncounter(state, data) {
  const g = gcfg(data), spec = state.plan[state.enc];
  state.enemies = []; state.eSeats = Array(SEATS).fill(null);
  for (const id of spec.ids) addEnemy(state, data, id, spec.wave, spec.seats?.[id] ?? null);
  raidEncStart(state, data);   // 보스 레이드 패턴(raid.json, 비면 아무것도 안 함)
  // 쉬던 동물: 혼자 남지 않게, 싸울 동물이 둘보다 적으면 쉬던 동물도 나옴
  if (fighters(state).length < 2) for (const u of unitsIn(state)) if (u?.resting) { u.resting = false; u.hp = Math.max(u.hp, u.maxHp * 0.3); }
  for (const u of state.field) { u.gauge = state.rng() * 0.35; u.skillT = {}; u.temp = []; u.stance = canStance(u) ? u.prefStance ?? nativeStance(u) : null; u.stanceT = 0.3 + state.rng() * 0.6; }
  state.encTime = 0; state.actGap = 0; state.phase = 'fight'; state.allyBuffs = []; state.clashes = []; state.clBook = {};
  state.collapse = { u: false, e: false }; state.isolated = { u: false, e: false }; state.diveAt = { u: -99, e: -99 }; state.taps = 0; state.awoke = false; state.awoke2 = false; state.focus = null; state.tempo = g.tempo ?? 1; state.ultSlow = g.ultSlow ?? 1; state.ultMax = g.ultMax ?? 99; state.snareT = 0; state.cheers = 0; state.phoenixUsed = false; state.dataRef = data; legendCheck(state, data); state.cheerAt = -9; state.encStat = { ...(state.dstat ?? {}) };
  for (const u of state.field) { u.ultUsed = 0; u.ultRevive = 0; u.reviveUsed = 0; u.cleanseAt = -99; u.awake = null; u.advance = false; u.suppressed = false; u.pinnedBy = null; u.slipNote = false; u.clutchOn = false; u.wobbly = false; }
  // 역전: 투지(지는 쪽이 세짐) · 역전 찬스(한 번) · 동물마다 역전 특성
  // 진형 상성(가위바위보): 🛡철벽 > 🎯돌격 > 🏹진지 > 🛡철벽. 유리한 쪽 피해 +adv%
  { const fc = g.formation; if (fc) { const fu = formOf(state.field.filter((u) => !u.resting).map((u) => styleOf(u))), fe = formOf(state.enemies.map((e) => e.style)); const adv = fc.beats[fu] === fe ? 1 : fc.beats[fe] === fu ? -1 : 0; state.form = { u: fu, e: fe, adv }; state.events.push({ type: 'formation', u: fu, e: fe, adv }); } }
  state.routed = { u: false, e: false }; state.bossWarn = null; state.hazardT = (g.hazards?.[state.stage?.id]?.every ?? 0) * (0.5 + state.rng() * 0.4);
  for (const e of state.enemies) if (e.boss) e.slamT = (g.bossSkill?.every?.[stageTier(state)] ?? 0) * 0.7;
  state.grit = { u: 0, e: 0 }; state.reinforced = false; state.eRallyUsed = false; state.eRallyBuff = 0; state.rally = null; state.rallyUsed = false; state.rallyCount = 0; state.rallyBuff = 0; state.roosterCalled = false; state.moonNow = false;
  // 기적의 키메라는 불안정: 교전 시작 때 가끔 흐물흐물(이번 교전 피해 반)
  { const mc = data.config.genes?.miracle; if (mc) for (const u of state.field) if (u.stats?.cross && !u.resting && state.rng() < mc.wobble) { u.wobbly = true; state.events.push({ type: 'wobble', uid: u.uid }); say(state, `${u.stats.name} 흐물흐물…`); } }
  // 적 무리 성향(숨김): 돌파형·철벽형·섞임
  // 무리 성향은 숨기지만 적 구성을 보면 짐작 가능: 돌파꾼(⚔)이 많으면 돌파형, 브루저(🛡)가 많으면 철벽형(20%는 엉뚱하게)
  state.tLevel = state.hard ? 2 : (g.tacticLevel?.[state.stage.id] ?? 2);
  state.lesson = state.tLevel === 1 ? g.lessons?.[state.stage.id]?.[state.enc] ?? null : null;
  state.lessonShown = false;
  // 배우는 단계(0·1)에서는 모두 앞라인 작전으로 시작(직접 바꾸거나 수업 버튼을 누르기 전까지)
  if (state.tLevel < 2) for (const u of state.field) if (u.tactic == null) u.tactic = TACTICS[styleOf(u)]?.[0] ?? null;
  {
    const es = state.enemies.filter(aliveE), dv = es.filter((e) => isDiverE(e, g)).length, br = es.filter((e) => e.style === 'bruiser').length;
    let k = dv >= 2 ? 'dive' : br >= 2 && dv <= 1 ? 'wall' : 'mixed';
    if (state.rng() < 0.2) k = ['dive', 'wall', 'mixed'][Math.floor(state.rng() * 3)];
    if (state.lesson === 'wall') { k = 'lessonWall'; for (const e of es) if (e.style === 'bruiser') { e.maxHp = Math.round(e.maxHp * g.lessonWallHp); e.hp = e.maxHp; } }
    if (state.lesson === 'dive') k = 'lessonDive';
    if (state.duel) k = { hunt: 'dive', guard: 'wall', front: 'mixed' }[state.duel.foePlan] ?? 'mixed';
    state.temperName = k; state.temper = g.temper[k];
  }
  for (const u of state.field) u.diveMark = null;
  // 돌격: 처음 charge초 동안 양쪽이 가운데로 달려와 쾅 부딪힌 뒤 싸움이 시작됨
  state.charging = g.charge > 0;
  pairUp(state, g);
  state.hadTank = { u: fighters(state).some((u) => styleOf(u) === 'bruiser'), e: state.enemies.some((e) => aliveE(e) && e.style === 'bruiser') };
  // 벽 없음: 우리 쪽에 브루저(탱 태세 포함)가 하나도 없이 시작하면 처음부터 진형 붕괴 상태(적 브루저가 그냥 밀고 들어옴)
  if (!state.hadTank.u && state.hadTank.e && !fighters(state).some(canStance)) { state.collapse.u = true; state.events.push({ type: 'collapse', side: 'u', noWall: true }); }
  refreshMods(state, data);
  state.events.push({ type: 'encStart', enc: state.enc, boss: spec.boss });
  return g;
}

function addEnemy(state, data, id, wave, seatWant = null) {
  const g = gcfg(data), def = data.enemyById[id];
  const style = rule(state, 'giants') && !def.boss ? 'bruiser' : roleOfEnemy(g, id, def);
  const ranged = style === 'ranged' || style === 'support';
  const order = seatOrder(def.boss ? 'bruiser' : style);
  const seat = seatWant != null && state.eSeats[seatWant] == null ? seatWant : order.find((k) => state.eSeats[k] == null);
  if (seat == null) return null;
  // 웨이브 성장 대신 교전 번호로 성장(1교전 1배 → 마지막 1+growth×(N-1)배).
  // 길 디펜스용 숫자(튼튼한 적 5배, 보스 200배)는 차이가 너무 커서 0.6제곱으로 눌러 씀.
  const e = makeEnemy(id, 1, state.stage, data, state.nextEid++);
  const up = 1 + g.growth * state.enc, upA = 1 + g.atkGrowth * state.enc;
  const sm = Math.pow(state.stage.mult ?? 1, g.stageHpPow) * (data.config.difficulty?.enemyHp ?? 1);
  const pack = def.spawnCount > 1 ? def.spawnCount * 0.8 : 1;
  const hp = def.boss ? 30 * Math.pow((def.miniboss || def.hp < 3000 ? def.hp : g.bossBase) / 30, g.squash) * g.bossHp * (def.pattern?.type === 'summon' ? g.summonerHp : 1) * (g.bossTune?.[id]?.hp ?? 1) : 30 * Math.pow((def.hp * pack) / 30, g.squash) * g.enemyHp;
  const tune = g.stageScale?.[state.stage.id] ?? 1;
  const TM = g.tierMul?.[tierKey(state)] ?? null;   // 난이도 배율(특성이 받쳐 줘야 깨지게)
  e.hp = e.maxHp = Math.max(1, Math.round(hp * sm * up * tune * (state.hard ? g.hardHp : 1) * (TM?.hp ?? 1)));
  const atk0 = def.attack || g.zeroAttack;
  const atk = 5 * Math.pow((atk0 * (def.spawnCount > 1 ? def.spawnCount * 0.5 : 1)) / 5, g.squash) * (def.boss ? g.bossAtk * (g.bossTune?.[id]?.atk ?? 1) : g.enemyAtk);
  e.attack = Math.max(1, Math.round(atk * Math.pow(state.stage.mult ?? 1, g.stageAtkPow) * (data.config.difficulty?.enemyAttack ?? 1) * upA * (TM?.atk ?? 1)));
  // 대결: 친구 동물은 계산한 수치 그대로(스테이지 배율·성장 없음)
  if (def.raw) { e.hp = e.maxHp = def.hp; e.attack = def.attack; e.interval = def.interval; e.animal = def.animal; e.animalStage = def.stage; }
  if (e.heal) e.heal = { ...e.heal, percent: e.heal.percent * g.healMult };
  e.interval = e.interval || g.zeroInterval;
  Object.assign(e, { skin: def.skin, tint: def.tint, seat, gauge: state.rng() * 0.3, name: def.name, ranged, style, element: enemyElement(data, state.stage, id, state.rng()), shieldLeft: 0, patternT: def.pattern?.every ?? 0, healT: def.heal?.every ?? 0, burnDps: 0, burnLeft: 0, curseLeft: 0, pos: 0 });
  // 등급(색): 스테이지 번호에 따라 푸른(1)·붉은(2)·검은(3)
  if (!def.boss && !state.lesson && !def.raw) {
    const si = Math.max(0, data.stages.findIndex((x) => x.id === state.stage.id)), ch = g.rankChance[Math.min(si, g.rankChance.length - 1)] ?? [0, 0, 0];
    const r = state.rng(); const rank = r < ch[2] ? 3 : r < ch[2] + ch[1] ? 2 : r < ch[2] + ch[1] + ch[0] ? 1 : 0;
    if (rank) { const R = g.ranks[rank]; e.rank = rank; e.name = `${R.prefix} ${e.name}`; e.hp = e.maxHp = Math.round(e.maxHp * R.hp); e.attack = Math.round(e.attack * R.atk); }
  }
  // 하드: 정예(방패·분노·재생·가시) — 이름 옆에 표시
  if (state.hard && !def.boss && state.rng() < g.eliteChance * (state.tier ? 2 : 1)) {
    e.elite = ['shield', 'rage', 'regen', 'thorns'][Math.floor(state.rng() * 4)];
    e.hp = e.maxHp = Math.round(e.maxHp * g.eliteHp);
  }
  state.eSeats[seat] = e.eid;
  e.tempo = g.tempo ?? 1;
  state.enemies.push(e);
  state.seenEnemies.add(id);
  return e;
}

function refreshMods(state, data) {
  for (const u of state.field) u.pos = 0;
  { const g = gcfg(data), on = state.star != null && state.field.some((x) => x.uid === state.star);
    for (const u of state.field) {
      const m = { ...(u.buildMods ?? {}) };
      const tn = tuneOf(u, g);
      if (tn) for (const k of ['hp', 'dmg', 'interval', 'taken']) if (tn[k]) m[k] = (m[k] ?? 0) + tn[k];
      if (u.trained) m.dmg = (m.dmg ?? 0) + u.trained * g.trainDmg;
      if (state.duel) m.hp = (m.hp ?? 0) + (state.duel.hpMul - 1) * 100;
      if (on) { if (u.uid === state.star) { m.dmg = (m.dmg ?? 0) + g.starDmg; m.hp = (m.hp ?? 0) + g.starHp; } else m.dmg = (m.dmg ?? 0) + g.starOthers; }
      u.extraMods = Object.keys(m).length ? m : null;
    } }
  const hpBefore = state.phase === 'fight' ? state.field.map((u) => [u, u.hp]) : null;
  try { computeMods(state, data); } catch (err) { for (const u of state.field) u.mods = u.mods ?? emptyMods(); }
  // 최대 체력이 바뀌면(동료가 쓰러져 특성이 꺼짐 등) 체력도 같은 비율로 바뀜 → 장부에 'scale'(체력바 비율은 그대로라 화면엔 숫자 없음)
  if (hpBefore) for (const [u, h] of hpBefore) if (Math.abs(u.hp - h) > 1e-9) hpNote(state, { side: 'u', id: u.uid, d: u.hp - h, kind: 'scale', by: null, cause: 'maxHp' });
  // 유물 공명: 연전에서 유물 하나마다 모든 동물 피해 +relicAll%
  const n = (state.relics ?? []).length, k = gcfg(data).relicAll ?? 0;
  if (n && k) for (const u of state.field) if (u.mods) u.mods.dmg = (u.mods.dmg ?? 0) + n * k;
  for (const u of state.field) { if (u.maxHp == null) u.maxHp = u.stats.hp; if (u.hp > u.maxHp) { if (state.phase === 'fight') setHp(state, u, u.maxHp, 'scale', null, 'maxHp'); else u.hp = u.maxHp; } }
}

// ---------- the fight ----------
const say = (state, line) => { state.log.push(line); if (state.log.length > 6) state.log.shift(); };

/** 앞줄이 비면 뒷줄 근접이 한 칸 앞으로(다키스트 던전처럼 줄이 당겨짐). 적도 같음. */
export function closeRanks(state) {
  const pull = (seats, get, alive, wantsFront) => {
    for (const f of FRONT) {
      const cur = get(seats[f]);
      if (cur && alive(cur)) continue;
      // 뒷줄에서 앞줄로 나올 친구: 근접 먼저, 없으면 아무나(앞줄이 통째로 비었을 때만)
      const frontAlive = FRONT.some((k) => alive(get(seats[k])));
      const cands = BACK.map((b) => [b, get(seats[b])]).filter(([, x]) => x && alive(x));
      const pick = cands.find(([, x]) => wantsFront(x)) ?? (frontAlive ? null : cands[0]);
      if (!pick) continue;
      const [b, x] = pick;
      [seats[f], seats[b]] = [seats[b], seats[f]];
      x.seat = f;
      const other = get(seats[b]); if (other) other.seat = b;
      state.events.push({ type: 'step', who: x.uid ? 'u' : 'e', id: x.uid ?? x.eid, from: b, to: f });
    }
  };
  pull(state.seats, (id) => state.field.find((u) => u.uid === id), aliveU, prefersFront);
  pull(state.eSeats, (id) => state.enemies.find((e) => e.eid === id), aliveE, (e) => !e.ranged);
}

const buffSum = (state, stat) => state.allyBuffs.reduce((s, b) => s + (b.stat === stat ? b.percent : 0), 0);
const uInterval = (state, u) => effInterval(u) * (state.tempo ?? 1) * (1 - (clutchOf(state, u)?.speed ?? 0) / 100) * Math.max(0.3, 1 + buffSum(state, 'interval') / 100) * (u.awake?.speed ?? 1) * (u.suppressed ? 1.3 : 1);
const eInterval = (e) => e.interval * (e.tempo ?? 1) * (e.slowLeft > 0 ? 1 / Math.max(0.2, 1 - e.slowPct / 100) : 1) * (e.suppressed ? 1.3 : 1);

/** Advance the current encounter by dt seconds. */
export function tickGauntlet(state, data, dt) {
  if (state.phase !== 'fight') return;
  const g = gcfg(data);
  const max = 0.05;
  for (let left = dt; left > 1e-9 && state.phase === 'fight'; left -= max) sub(state, data, Math.min(max, left), g);
}

function sub(state, data, d, g) {
  state.curSeq = null;
  state.time += d; state.encTime += d; state.actGap -= d;
  if (state.charging) {
    if (state.encTime < g.charge) return;
    state.charging = false;
    state.events.push({ type: 'collide', pairs: state.clashes.map((c) => ({ uid: c.uid, eid: c.eid })) });
    { const op = eco(state, data, 'openPush') ?? 0; if (op) for (const c of state.clashes) c.push = Math.min(0.95, c.push + op / 100); }
  }
  if (state.spellCd > 0) state.spellCd -= d;
  const sp = data.config.spells;
  if (sp && state.spells.length) state.mana = Math.min(sp.max, state.mana + g.manaRegen * (1 + (eco(state, data, 'manaRegen') ?? 0) / 100) * d);
  for (const b of state.allyBuffs) b.left -= d;
  state.allyBuffs = state.allyBuffs.filter((b) => b.left > 0);
  inSeq(state, () => updateSuppress(state, g));
  if (!state.charging) updatePins(state, g);
  // 상태: 독·불·둔화·기절·저주
  for (const e of state.enemies) {
    if (!aliveE(e)) continue;
    if (e.poisonLeft > 0) { e.poisonLeft -= d; hurtEnemy(state, data, e, e.poisonDps * d, null, true, { kind: 'dot', cause: 'poison' }); }
    if (e.burnLeft > 0) { e.burnLeft -= d; hurtEnemy(state, data, e, e.burnDps * d, null, true, { kind: 'dot', cause: 'burn' }); }
    if (e.slowLeft > 0) e.slowLeft -= d;
    if (e.curseLeft > 0) e.curseLeft -= d;
    if (e.elite === 'regen') setHp(state, e, Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * d), 'regen', e, 'regen');
    // 하드 보스 2단계: 체력 절반 아래에서 더 세지고 기술이 잦아짐
    // 보스 단계(2026-11-27): 2단계 보스부터 노멀도 체력 절반에서 2단계, 3단계 보스부터 25%에서 광폭화
    if (!e.raid && !state.hard && e.boss && g.bossSkill && stageTier(state) >= 2 && !e.phase2 && e.hp < e.maxHp / 2) { e.phase2 = true; e.attack = Math.round(e.attack * g.bossSkill.phase2Atk); if (e.pattern) e.pattern = { ...e.pattern, every: e.pattern.every * 0.75 }; state.events.push({ type: 'phase2', eid: e.eid }); say(state, `${e.name} 2단계!`); }
    if (!e.raid && e.boss && g.bossSkill && stageTier(state) + (state.hard ? 1 : 0) >= 3 && !e.phase3 && e.hp < e.maxHp * g.bossSkill.phase3At) { e.phase3 = true; e.attack = Math.round(e.attack * g.bossSkill.phase3Atk); e.interval *= g.bossSkill.phase3Speed; if (e.slamT > 2) e.slamT = 2; state.events.push({ type: 'phase3', eid: e.eid }); say(state, `${e.name} 광폭화!`); }
    if (!e.raid && state.hard && g.bossPhase2 && e.boss && !e.phase2 && e.hp < e.maxHp / 2) { e.phase2 = true; e.attack = Math.round(e.attack * 1.4); if (e.pattern) e.pattern = { ...e.pattern, every: e.pattern.every * 0.6, count: (e.pattern.count ?? 1) + 1 }; state.events.push({ type: 'phase2', eid: e.eid }); say(state, `${e.name}: 2단계!`); }
    if (e.shieldLeft > 0) e.shieldLeft -= d;
    if (e.raid) raidTick(state, data, e, d);
    if (e.stunLeft > 0) { e.stunLeft -= d; continue; }
    e.gauge = Math.min(1, e.gauge + d / eInterval(e));
    inSeq(state, () => bossTimers(state, data, e, d));
  }
  for (const u of fighters(state)) {
    if (u.elCd > 0) u.elCd -= d;
    if (u.stunLeft > 0) { u.stunLeft -= d; continue; }
    u.gauge = Math.min(1, u.gauge + d / uInterval(state, u));
    inSeq(state, () => timerSkills(state, data, u, d));
  }
  updateStances(state, data, d, g);
  inSeq(state, () => updateClashes(state, data, d, g));
  // 진형 붕괴: 한쪽 브루저(탱 태세 포함)가 모두 쓰러지면 그쪽은 받는 피해 +collapseTaken%, 상대가 뒷줄로 밀고 들어옴
  if (!state.collapse.u && state.hadTank?.u && !fighters(state).some((u) => styleOf(u) === 'bruiser')) { state.collapse.u = true; state.events.push({ type: 'collapse', side: 'u' }); say(state, '우리 진형 붕괴!'); }
  if (!state.collapse.e && state.hadTank?.e && !state.enemies.some((e) => aliveE(e) && e.style === 'bruiser')) {
    state.collapse.e = true;
    for (const e of state.enemies) if (aliveE(e)) e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? 0.3 : g.collapseStun);
    state.events.push({ type: 'collapse', side: 'e' }); say(state, '적 진형 붕괴!');
  }
  inSeq(state, () => comebackTick(state, data, g));
  inSeq(state, () => reviveTick(state, data, g));
  inSeq(state, () => hazardTick(state, data, g, d));
  if (state.bossWarn && state.time >= state.bossWarn.at) inSeq(state, () => bossSlam(state, data, g));
  // 역전 각성: 동료가 절반 넘게 쓰러지고 체력이 낮은 동물 하나가 깨어남(교전마다 한 번). 약할수록(어린·약체) 크게
  if ((state.awoke ? 1 : 0) + (state.awoke2 ? 1 : 0) < (rule(state, 'heroes') ? 2 : 1)) {
    const all = state.field.filter((u) => !u.resting), live = fighters(state);
    if (all.length >= 2 && live.length <= all.length * g.awakenAllies) {
      const RK = { young: 1, teen: 0.75, adult: 0.5, spirit: 0.25 };
      const cand = live.filter((u) => !u.awake && u.hp / u.maxHp < g.awakenHp).sort((a, b) => (RK[b.stage] ?? 0.3) + (b.kind === 'weak' ? 0.5 : 0) - (RK[a.stage] ?? 0.3) - (a.kind === 'weak' ? 0.5 : 0))[0];
      if (cand) {
        const weak = Math.min(1.5, (RK[cand.stage] ?? 0.3) + (cand.kind === 'weak' ? 0.5 : 0));
        if (state.awoke) state.awoke2 = true; else state.awoke = true;
        cand.awake = { dmg: 1 + (g.awakenBase + g.awakenWeak * weak) * (rule(state, 'heroes') ? 1.5 : 1) / 100, speed: 1 - g.awakenSpeed / 100 };
        setHp(state, cand, Math.max(cand.hp, cand.maxHp * g.awakenHeal), 'heal', cand, 'awaken'); cand.stunLeft = 0; cand.gauge = 1;
        for (const e of state.enemies) if (aliveE(e)) e.stunLeft = Math.max(e.stunLeft ?? 0, 0.8);
        // 약점 극복: 각성하면 약점 하나가 강점으로 뒤집힘(이번 판 내내). 처음 본 뒤집힘은 도감 특성 탭에 기록
        const flip = flipOneWeak(state, data, cand);
        state.events.push({ type: 'awaken', uid: cand.uid, weak, flip }); say(state, `${cand.stats.name} 각성!${flip ? ` 약점 극복: ${flip.from} → ${flip.to}` : ''}`);
        dstat(state, 'awaken');
      }
    }
  }
  // 무쌍 견제: 한 마리가 피해의 절반 넘게 넣으면 적이 그 동물을 집중(표식)
  if (state.focus == null && state.encTime > g.focusAfter) {
    const ent = Object.entries(state.dmgWave), tot = ent.reduce((a, [, r]) => a + r.dmg, 0);
    const top = ent.sort((a, b) => b[1].dmg - a[1].dmg)[0];
    if (top && tot > 0 && top[1].dmg / tot > g.focusShare && ent.length >= 3) { const u = findU(state, +top[0]); if (aliveU(u)) { state.focus = u.uid; state.events.push({ type: 'focus', uid: u.uid }); say(state, `적이 ${u.stats.name}을(를) 노림!`); } }
  }
  // 고립: 후열이 다 쓰러지고 브루저만 남으면 받는 피해 +, 미는 힘 −
  if (!state.isolated.u && state.field.some((u) => isBack(u)) && !fighters(state).some(isBack) && fighters(state).some((u) => styleOf(u) === 'bruiser')) { state.isolated.u = true; state.events.push({ type: 'isolate', side: 'u' }); say(state, '우리 브루저 고립!'); }
  if (!state.isolated.e && state.enemies.some((e) => e.style === 'ranged' || e.style === 'support') && !state.enemies.some((e) => aliveE(e) && (e.style === 'ranged' || e.style === 'support')) && state.enemies.some((e) => aliveE(e) && e.style === 'bruiser')) { state.isolated.e = true; state.events.push({ type: 'isolate', side: 'e' }); say(state, '적 브루저 고립!'); }
  // 돌파 예고: 돌파꾼의 게이지가 diveMarkAt을 넘으면 노릴 후열을 정하고 빨간 화살표로 알림(한 번에 하나만 보이게 화면이 고름)
  // 한 쪽당 diveGap초에 한 번만 돌파 예고(교전당 2~4번)
  state.diveAt ??= { u: -99, e: -99 };
  // 수업: 앞이 안 뚫리는 교전 5초째 → '후열을 노려 봐' 안내
  if (state.lesson === 'wall' && !state.lessonShown && state.encTime > 5) { state.lessonShown = true; state.events.push({ type: 'lesson', kind: 'wall' }); }
  if (state.tLevel > 0) for (const u of fighters(state)) {
    if (state.time - state.diveAt.u < g.diveGap) break;
    if (u.diveMark || u.pinnedBy != null || (u.gauge ?? 0) < g.diveMarkAt || !divesU(u, g)) continue;
    const back = state.enemies.filter((e) => aliveE(e) && (e.style === 'ranged' || e.style === 'support') && (!e.flying || u.stats.canHitFlying || u.stats.flyer));
    if (!back.length) continue;
    const t = lowest(back); u.diveMark = { eid: t.eid }; state.diveAt.u = state.time;
    dstat(state, 'uMark'); state.events.push({ type: 'diveMark', side: 'u', from: u.uid, to: t.eid });
  }
  if (state.tLevel > 0) for (const e of state.enemies) {
    if (state.time - state.diveAt.e < (state.lesson === 'dive' || rule(state, 'swarm') ? 2.5 : g.diveGap)) break;
    if (!aliveE(e) || e.diveMark || e.pinnedBy != null || (e.gauge ?? 0) < g.diveMarkAt || !divesE(state, e, g) || clashOfE(state, e.eid)) continue;
    if (state.rng() > (state.temper?.diveChance ?? 0.65)) { e.diveMark = { skip: true }; state.diveAt.e = state.time - g.diveGap / 2; continue; }
    const back = fighters(state).filter(isBack);
    if (!back.length) continue;
    const t = lowest(back); e.diveMark = { uid: t.uid }; state.diveAt.e = state.time;
    dstat(state, 'eMark'); state.events.push({ type: 'diveMark', side: 'e', from: e.eid, to: t.uid });
  }
  // 한 번에 하나: 게이지가 가득 찬 쪽 중 가장 오래 기다린 하나만, stagger 간격으로
  if (state.actGap <= 0) {
    const ready = [...fighters(state).filter((u) => u.gauge >= 1 && !(u.stunLeft > 0)).map((u) => ({ u })), ...state.enemies.filter((e) => aliveE(e) && e.gauge >= 1 && !(e.stunLeft > 0)).map((e) => ({ e }))];
    if (ready.length) {
      const r = ready[Math.floor(state.rng() * ready.length)];
      inSeq(state, () => { if (r.u) unitAct(state, data, r.u, g); else enemyAct(state, data, r.e, g); });
      state.actGap = g.stagger;
    }
  }
  if (state.time - (state.modsAt ?? -9) > 0.5) { state.modsAt = state.time; refreshMods(state, data); }
  checkEnd(state, data, g);
}

// ---------- 힘겨루기: 앞줄 브루저가 적 근접과 맞붙어 서로 밀고 당김 ----------
/** 태세 고르기: 상황 점수 + 선호 태세(정비 때 찍음) + 원래 역할 */
function updateStances(state, data, d, g) {
  const us = fighters(state);
  const es = state.enemies.filter(aliveE);
  const avgHp = us.reduce((s, x) => s + x.hp / x.maxHp, 0) / Math.max(1, us.length);
  const losing = (state.clashes ?? []).some((c) => c.push < -0.2);
  const freeBrute = es.some((e) => e.style === 'bruiser' && !clashOfE(state, e.eid));
  const raid = es.some((e) => e.style === 'skirm' && !clashOfE(state, e.eid));
  const weakFoe = es.some((e) => e.hp / e.maxHp < 0.4) || es.some((e) => e.boss);
  for (const u of us) {
    if (!canStance(u)) continue;
    u.stanceT -= d;
    if (u.stanceT > 0) continue;
    u.stanceT = g.stanceEvery;
    const sc = { tank: losing || freeBrute || raid ? 1 : 0.2, deal: weakFoe ? 0.9 : 0.5, support: avgHp < 0.55 ? 1 : 0.2 };
    if (u.prefStance) sc[u.prefStance] += g.stancePref;
    sc[nativeStance(u)] += g.stanceNative;
    const pick = Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
    if (pick !== u.stance) {
      if (u.stance === 'tank') { const c = clashOfU(state, u.uid); if (c) { state.clashes = state.clashes.filter((x) => x !== c); state.events.push({ type: 'clashEnd', uid: c.uid, eid: c.eid }); } }
      u.stance = pick;
      state.events.push({ type: 'stance', uid: u.uid, stance: pick });
    }
  }
}

/** 정비 때 선호 태세 바꾸기: 자동 → 탱 → 딜 → 서폿 → 자동 */
export function cyclePrefStance(state, uid) {
  const u = [...state.field, ...state.bench].find((x) => x && x.uid === uid);
  if (!canStance(u)) return fail('noStance');
  const order = [null, 'tank', 'deal', 'support'];
  u.prefStance = order[(order.indexOf(u.prefStance ?? null) + 1) % order.length];
  return { ok: true, pref: u.prefStance };
}

/** 힘싸움 정원: 탱커 능력치(막기)·특성·기술에 따라 동시에 붙잡는 적 수(1~4). 탱 태세·탱커 빌드 +1 */
export function clashCap(u) {
  const b = effBlock(u) || 1;
  return Math.max(1, Math.min(4, b + (u.stance === 'tank' ? 1 : 0) + (u.kind === 'base' && u.build === 'tank' ? 1 : 0)));
}
const laneDist = (a, b) => Math.abs(laneOf(a) - laneOf(b));
/** 짝 짓기(라인): 적 브루저는 같은 라인 우리 브루저와 맞붙고, 없으면 가까운 라인 브루저에 합류(정원까지).
 *  정원이 차거나 막을 브루저가 없으면 적 브루저는 우리 후열로 밀고 들어옴(advance → 제압).
 *  맞붙을 적 브루저가 없는 우리 브루저는 적 후열로 전진. */
function pairUp(state, g) {
  const freeE = () => state.enemies.filter((e) => aliveE(e) && e.style === 'bruiser' && !e.flying && !clashOfE(state, e.eid));
  const walls = fighters(state).filter((u) => styleOf(u) === 'bruiser');
  const room = (u) => { const c = clashOfU(state, u.uid); return clashCap(u) - (c ? 1 + c.helpers.length : 0); };
  for (const e of freeE().sort((a, b) => laneOf(a.seat) - laneOf(b.seat))) {
    // 옆 라인까지만 막을 수 있음(lineup.reach): 두 칸 떨어진 라인이 비면 적 브루저가 그 틈으로 밀고 들어옴
    const reach = g.lineup?.reach ?? 2;
    const cand = walls.filter((u) => room(u) > 0 && laneDist(u.seat, e.seat) <= reach).sort((a, b) => laneDist(a.seat, e.seat) - laneDist(b.seat, e.seat) || colOf(a.seat) - colOf(b.seat))[0];
    if (!cand) { e.advance = true; continue; }
    e.advance = false;
    const c = clashOfU(state, cand.uid);
    if (c) { c.helpers.push(e.eid); state.events.push({ type: 'gang', uid: c.uid, eid: e.eid }); }
    else { state.clashes.push({ uid: cand.uid, eid: e.eid, push: 0, helpers: [], lane: laneOf(cand.seat) }); state.events.push({ type: 'clashStart', uid: cand.uid, eid: e.eid }); }
    cand.advance = false;
  }
  // 힘싸움이 끝났거나 상대가 없는 우리 브루저: 적 후열로 전진
  for (const u of walls) if (!clashOfU(state, u.uid)) {
    const any = state.enemies.some((e) => aliveE(e) && e.style === 'bruiser' && !e.flying && e.advance === false && clashOfE(state, e.eid));
    if (!u.advance) { u.advance = true; if (!state.charging) state.events.push({ type: 'advance', side: 'u', uid: u.uid, any }); }
  }
  for (const e of state.enemies) if (aliveE(e) && e.style === 'bruiser' && e.advance && !e.advNote) { e.advNote = true; if (!state.charging) state.events.push({ type: 'advance', side: 'e', eid: e.eid }); }
}

/** 추천 배치로 되돌리기(정비): 출전 중인 동물을 역할대로 다시 앉힘 */
export function recommendSeats(state, data) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  state.seats = autoSeat(state, state.field);
  refreshMods(state, data);
  state.events.push({ type: 'moved' });
  return { ok: true };
}
/** 응원 톡: 교전 중 힘싸움 막대를 누르면 우리 브루저 쪽으로 조금 밀림(교전마다 8번, 0.35초 간격) */
export function cheerClash(state, uid, data = null) {
  if (state.phase !== 'fight') return fail('noFight');
  const c = clashOfU(state, uid);
  if (!c) return fail('noClash');
  if ((state.cheers ?? 0) >= 8 + (eco(state, data, 'cheerTaps') ?? 0)) return fail('noCheers');
  if (state.time - (state.cheerAt ?? -9) < 0.35) return fail('cooldown');
  state.cheers = (state.cheers ?? 0) + 1; state.cheerAt = state.time;
  const extra = data ? eco(state, data, 'cheerTaps') ?? 0 : 0;
  c.push = Math.min(0.95, c.push + 0.07 * (extra ? 1.5 : 1));
  state.events.push({ type: 'tapCheer', uid, left: 8 + extra - state.cheers });
  return { ok: true, left: 8 + extra - state.cheers };
}
/** 이번 교전의 승패 요인(정비 화면용): 좋은 것 ✔ / 나쁜 것 ✘ 가장 큰 셋 */
export function encFactors(state, data) {
  const now = state.dstat ?? {}, was = state.encStat ?? {};
  const d = (k) => (now[k] ?? 0) - (was[k] ?? 0);
  const name = (uid) => state.field.find((u) => u.uid === uid)?.stats.name ?? '';
  const f = [];
  const cw = d('clashW'), cl = d('clashL');
  if (cw + cl) f.push(cw >= cl ? { good: true, w: cw - cl + 1, text: `💪 힘싸움 ${cw}:${cl} 우세` } : { good: false, w: cl - cw + 1, text: `😣 힘싸움 ${cw}:${cl} 밀림` });
  if (d('uBreach')) f.push({ good: true, w: d('uBreach') * 1.5, text: `🎯 뒤 노리기 성공 ${d('uBreach')}번` });
  if (d('eBreach')) f.push({ good: false, w: d('eBreach') * 1.5, text: `💥 뒷줄이 뚫림 ${d('eBreach')}번` });
  if (d('eSup')) f.push({ good: true, w: d('eSup') * 2, text: `⛓ 적 후열 제압 ${d('eSup')}번` });
  if (d('uSup')) f.push({ good: false, w: d('uSup') * 2, text: `⛓ 우리 후열 제압당함 ${d('uSup')}번 (그 라인에 브루저 없음)` });
  if (d('intercept') + d('guard') + d('taunt')) f.push({ good: true, w: (d('intercept') + d('guard') + d('taunt')) * 1.2, text: `🛡 막아 냄 ${d('intercept') + d('guard') + d('taunt')}번` });
  if (d('uPin')) f.push({ good: false, w: d('uPin'), text: `✋ 딜러가 적 탱커에 붙잡힘 ${d('uPin')}번` });
  if (d('awaken')) f.push({ good: true, w: 2, text: '🔥 역전 각성!' });
  const top = Object.entries(state.dmgLast ?? {}).sort((a, b) => b[1].dmg - a[1].dmg)[0];
  if (top) f.push({ good: true, w: 1, text: `⭐ 최고 활약 ${top[1].name}` });
  return f.sort((a, b) => b.w - a.w).slice(0, 4);
}
/** 잡아채기: 낚아챈 쪽이 기절시키고 자기 곁에 붙잡아 둠(snatchPin초) */
function snatchU(state, data, c, e, kind) {
  const g = gcfg(data);
  c.snatchAt = state.time;
  const a = hurtEnemy(state, data, e, effDamage(c) * 1.2, c, false, { big: true, cause: 'snatch' });
  if (aliveE(e)) { e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? 0.4 : g.snatchStun); e.gauge = 0; e.pinnedBy = c.uid; e.pinUntil = state.time + g.snatchPin; e.deepT = 0; }
  dstat(state, 'snatch'); state.events.push({ type: 'snatch', side: 'u', uid: c.uid, eid: e.eid, kind, dmg: Math.round(a) });
  say(state, `${c.stats.name} 낚아챔!`);
}
function snatchE(state, data, c, u, kind) {
  const g = gcfg(data);
  c.snatchAt = state.time;
  hurtUnit(state, data, u, c.attack * 1.2, c, { big: true, cause: 'snatch' }); const a = state.lastLost;
  if (aliveU(u)) { u.stunLeft = Math.max(u.stunLeft ?? 0, g.snatchStun); u.gauge = 0; u.pinnedBy = c.eid; u.pinUntil = state.time + g.snatchPin; u.deepT = 0; }
  dstat(state, 'eSnatch'); state.events.push({ type: 'snatch', side: 'e', eid: c.eid, uid: u.uid, kind, dmg: Math.round(a) });
  say(state, `${c.name}이(가) ${u.stats.name}을(를) 낚아챔!`);
}
/** 신화·키메라 필살기: 종(키메라는 첫 부위)마다 팀을 돕는 기술. 반환 { kind, name, desc } */
export const ULTS = {
  bear: { name: '대지의 포효', desc: '5초 동안 우리 모두 받는 피해 -30%, 적이 곰만 노림' },
  bison: { name: '대돌진', desc: '모든 힘싸움이 우리 쪽으로 크게 기움, 적 앞줄 기절' },
  dog: { name: '충견의 외침', desc: '가장 약한 동료 체력 40% 회복 + 보호막' },
  ant: { name: '개미 군단', desc: '적 모두 4초 느려지고 날쌘 적이 붙잡힘' },
  frog: { name: '단비', desc: '모두 체력 20% 회복, 제압·기절이 풀림' },
  tiger: { name: '산군의 포효', desc: '적 행동 게이지가 0, 5초 동안 우리 피해 +20%' },
  fox: { name: '여우불 홀림', desc: '적 셋이 2초 동안 홀려 멈춤' },
  rabbit: { name: '달토끼 방아', desc: '우리 모두 행동 게이지 +50%, 4초 동안 잘 피함' },
  rooster: { name: '새벽 울음', desc: '쓰러진 동료 하나가 일어나고 모두 체력 15% 회복' },
  crow: { name: '까마귀 떼', desc: '적 후열이 6초 동안 받는 피해 +30%' },
  wolf: { name: '늑대 무리 사냥', desc: '우리 딜러 모두 적 후열을 노림(막기 무시)' },
  eagle: { name: '하늘의 눈', desc: '적 응원·원거리 3초 기절, 보호막 깨짐' },
  bighorn: { name: '뿔 방벽', desc: '우리 후열 4초 받는 피해 -50%, 들어온 적 브루저를 밀어냄' },
  grasshopper: { name: '축제의 노래', desc: '마력 +30, 응원 톡 +3번' },
  monkey: { name: '분신술', desc: '6초 동안 뒤를 노리는 적을 모두 낚아챔, 금화 +8' },
};
// 필살기가 우리를 돕는지(buff) 적을 묶는지(debuff): 연결 이펙트 색(금빛·보라)만 정함. 회복·버프 수치를 직접 적는 곰·호랑이·토끼·개·개구리·수탉은 위에서 따로 적음
const ULT_FX = { bison: 'debuff', ant: 'debuff', fox: 'debuff', crow: 'debuff', eagle: 'debuff', wolf: 'buff', bighorn: 'buff', grasshopper: 'buff', monkey: 'buff' };
const ULT_ICON = { bison: 'stun', ant: 'slow', fox: 'stun', crow: 'curse', eagle: 'stun', wolf: 'atk', bighorn: 'shield', grasshopper: 'mana', monkey: 'snare' };
function teamUlt(state, data, u, t, g) {
  // 키메라는 부위 동물 기술을 번갈아 씀(여러 가지 기술을 보게)
  const id = u.kind === 'chimera' ? (u.parts ?? [])[((u.ultUsed ?? 1) - 1) % Math.max(1, (u.parts ?? []).length)] : u.speciesId;
  const U = ULTS[id] ?? { name: '필살 일격', desc: '큰 피해' };
  const es = state.enemies.filter(aliveE), us = fighters(state);
  const buff = (stat, percent, left) => { state.allyBuffs.push({ stat, percent, left }); noteStatus(state, 'buff', u, us, stat === 'taken' ? 'shield' : stat === 'dmg' ? 'atk' : 'haste', U.name, left, true); };
  // 위력 낮춤(2026-11-27 "위력을 낮춰서 여러가지 기술 자주 보게"): 수치·시간 × P(ultPow), 대신 게이지 빠르고 교전마다 여러 번
  const P = g.ultPow ?? 1, T = (x) => x * P, Pc = (x) => Math.round(x * P);
  switch (id) {
    case 'bear': buff('taken', -Pc(30), T(5)); aid(state, 'buff', u, us, { stat: 'taken', dur: T(5) }); state.focus = u.uid; state.focusUntil = state.time + T(3); break;
    case 'bison': for (const c of state.clashes ?? []) c.push = Math.min(0.95, c.push + T(0.6)); for (const e of es.filter((x) => isFront(x.seat) && !x.boss)) e.stunLeft = Math.max(e.stunLeft ?? 0, T(1)); break;
    case 'dog': { const w = lowest(us); if (w) { aid(state, 'heal', u, w, { amt: healA(state, w, w.maxHp * T(0.4), u, U.name) }); w.shieldT = state.time + T(3); w.shieldBy = refOf(u); noteStatus(state, 'buff', u, [w], 'shield', U.name, T(3), true); aid(state, 'shield', u, w, { dur: T(3) }); } break; }
    case 'ant': for (const e of es) { e.slowPct = Pc(40); e.slowLeft = T(4); if (e.style === 'skirm' && !e.boss) { e.pinnedBy = u.uid; e.pinUntil = state.time + T(4); e.diveMark = null; } } break;
    case 'frog': { const sick = us.filter((x) => (x.stunLeft ?? 0) > 0 || x.suppressed); const amts = us.map((x) => healA(state, x, x.maxHp * T(0.2), u, U.name)); for (const x of us) { x.stunLeft = 0; x.suppressed = false; } aid(state, 'heal', u, us, { amts }); aid(state, 'cleanse', u, sick, { what: ['stun'] }); break; }
    case 'tiger': for (const e of es) e.gauge = Math.max(0, (e.gauge ?? 0) - T(1)); buff('dmg', Pc(20), T(5)); aid(state, 'buff', u, us, { stat: 'dmg', dur: T(5) }); break;
    case 'fox': for (const e of [...es].sort(() => state.rng() - 0.5).slice(0, 3)) if (!e.boss) e.stunLeft = Math.max(e.stunLeft ?? 0, T(2)); break;
    case 'rabbit': for (const x of us) x.gauge = Math.min(1, (x.gauge ?? 0) + T(0.5)); buff('taken', -Pc(15), T(4)); aid(state, 'haste', u, us); aid(state, 'buff', u, us, { stat: 'taken', dur: T(4) }); break;
    case 'rooster': { const d = state.field.find((x) => x.down && !x.resting); if (d && (u.ultRevive ?? 0) < 1) { u.ultRevive = (u.ultRevive ?? 0) + 1; d.down = false; setHp(state, d, d.maxHp * T(0.4), 'revive', u, U.name); state.events.push({ type: 'revive', uid: d.uid }); } aid(state, 'heal', u, us, { amts: us.map((x) => healA(state, x, x.maxHp * T(0.15), u, U.name)) }); break; }
    case 'crow': for (const e of es.filter((x) => x.style === 'ranged' || x.style === 'support')) e.curseLeft = T(6); break;
    case 'wolf': { const back = es.filter((x) => x.style === 'ranged' || x.style === 'support'); for (const x of us.filter((y) => styleOf(y) === 'skirm')) { const v = lowest(back.length ? back : es); if (v) { x.pinnedBy = null; x.deepT = state.time + T(2); x.deepEid = v.eid; x.gauge = Math.min(1, (x.gauge ?? 0) + T(1)); } } break; }
    case 'eagle': for (const e of es.filter((x) => x.style === 'ranged' || x.style === 'support')) { if (!e.boss) e.stunLeft = Math.max(e.stunLeft ?? 0, T(3)); e.shieldLeft = 0; } break;
    case 'bighorn': for (const x of us.filter(isBack)) x.shieldT = state.time + T(4); aid(state, 'shield', u, us.filter(isBack), { dur: T(4) }); for (const e of es.filter((x) => x.advance)) { e.advance = false; e.stunLeft = Math.max(e.stunLeft ?? 0, T(1.5)); } break;
    case 'grasshopper': aid(state, 'mana', u, [], { amt: Pc(30) }); state.mana = Math.min(data.config.spells?.max ?? 100, (state.mana ?? 0) + Pc(30)); state.cheers = Math.max(-3, (state.cheers ?? 0) - 2); break;
    case 'monkey': state.snareT = Math.max(state.snareT ?? 0, state.time + T(6)); state.gold += 3; break;
    default: break;
  }
  raidUlt(state, data, id);   // 필살기가 끊기·보호막·독과 맞물림
  { const k = ULT_FX[id]; if (k) noteStatus(state, k, u, k === 'debuff' ? state.enemies.filter(aliveE) : fighters(state), ULT_ICON[id] ?? (k === 'debuff' ? 'curse' : 'atk'), U.name, 3, id === 'bighorn' || id === 'grasshopper'); }
  say(state, `${u.stats.name} · ${U.name}!`);
  void t; void g;
  return { kind: id, name: U.name, desc: U.desc };
}

/** 추천 보상(안내용): { kind, why } */
/** 진화까지 남은 먹이(2026-11-27 "진화하는데 필요한 고기양을 알 수 있게"): 어린→성장기 1그릇, 성장기→성체 adultMeals그릇. 다 자랐으면 null */
export function mealInfo(u, data) {
  if (!u || u.kind !== 'base' || !NEXT[u.stage]) return null;
  const need = u.stage === 'teen' ? (gcfg(data).adultMeals ?? 1) : 1, meals = Math.min(need, u.meals ?? 0);
  return { meals, need, left: need - meals, next: NEXT[u.stage] };
}

export function recommendReward(state, data) {
  const o = state.offer;
  if (!o || o.taken) return null;
  const ok = (k) => o[k] && o.dropped !== k;
  const g = gcfg(data);
  const half = state.field.find((u) => u.kind === 'base' && u.stage === 'teen' && (u.meals ?? 0) >= 1);
  if (half && ok('food')) return { kind: 'food', uid: half.uid, why: `${half.stats.name}이(가) 한 그릇만 더 먹으면 어른이 돼요` };
  const lanes = new Set(fighters(state).filter((u) => styleOf(u) === 'bruiser').map((u) => laneOf(u.seat)));
  if (lanes.size < 2 && ok('globe') && (state.bench.includes(null) || state.seats.includes(null))) {
    const idx = (o.globe ?? []).findIndex((c) => baseStyle({ kind: 'base', speciesId: c.speciesId, stats: data.unitById[c.speciesId] }) === 'bruiser');
    if (idx >= 0) return { kind: 'globe', index: idx, why: '브루저가 모자라요 — 막는 동물을 데려와요' };
  }
  // 유물을 하나도 안 가졌거나 교전 3번마다 하나보다 적으면 유물 먼저(2026-11-27 "유물 선택률이 낮아")
  if (ok('relic') && state.enc >= 1 && (state.relics ?? []).length < Math.ceil((state.enc + 1) / 3)) return { kind: 'relic', why: '💎 유물은 이번 판 끝까지 팀 전체가 세져요' };
  // 🎯 보스 대비(보스 레이드): 보스가 가까우면 보스 카드 추천 동물을 데려오라고 권함(raid.json이 비면 bossFit = 0이라 그대로)
  if (ok('globe') && state.enc >= state.plan.length - 4 && (state.bench.includes(null) || state.seats.includes(null))) {
    const idx = (o.globe ?? []).findIndex((c) => bossFit(data, state.stage, c.speciesId) > 0 && !state.field.some((u) => u.speciesId === c.speciesId));
    if (idx >= 0) return { kind: 'globe', index: idx, tag: 'bossFit', why: '', whyKey: 'raid.reward.bossFitWhy', whyVars: { name: data.unitById[o.globe[idx].speciesId]?.name ?? '', boss: data.enemyById[state.stage.boss]?.name ?? '' } };
  }
  const top = Object.entries(state.dmgLast ?? {}).sort((a, b) => b[1].dmg - a[1].dmg).map(([uid]) => state.field.find((u) => u.uid === +uid)).find((u) => u && u.kind === 'base' && NEXT[u.stage]);
  if (top && ok('food')) return { kind: 'food', uid: top.uid, why: `가장 잘 싸운 ${top.stats.name}을(를) 키워요` };
  if (ok('relic') && (state.relics ?? []).length < Math.ceil((state.enc + 1) / 3)) return { kind: 'relic', why: '유물은 이번 판 내내 효과가 있어요' };
  if (ok('globe') && (state.bench.includes(null) || state.seats.includes(null))) return { kind: 'globe', index: 0, why: '같은 동물을 모아 겹치면 진화해요' };
  return ok('relic') ? { kind: 'relic', why: '유물로 팀 전체를 강하게' } : ok('food') ? { kind: 'food', why: '한 마리를 키워요' } : null;
  void g;
}
/** 고급 딜러: 탱커가 붙어도 빠져나감 */
export function canSlip(u, g, state = null, data = null) { if (state && data && styleOf(u) === 'skirm' && eco(state, data, 'slipAll')) return true; return !!u.stats.flyer || u.stage === 'spirit' || u.kind === 'chimera' || (g.slippery.includes(u.speciesId) && u.stage !== 'young'); }
const eCap = (e, g) => (e.boss ? g.enemyCap.boss : g.enemyCap.bruiser);
/** 붙잡기: 남는 정원이 있는 탱커가 같은 라인(없으면 가까운 라인)의 날쌘 딜러에게 붙음 → 그 딜러는 후열을 못 노리고 탱커와 싸움 */
function updatePins(state, g) {
  for (const x of [...state.field, ...state.enemies]) if (x.pinUntil && x.pinUntil <= state.time) { x.pinUntil = 0; x.pinnedBy = null; }
  // 우리 탱커 → 적 딜러
  const uWalls = fighters(state).filter((u) => styleOf(u) === 'bruiser');
  const uLoad = new Map(uWalls.map((u) => { const c = clashOfU(state, u.uid); return [u.uid, c ? 1 + c.helpers.length : 0]; }));
  // 이미 붙어 있으면 그대로(탱커가 쓰러지거나 기절할 때까지)
  for (const e of state.enemies) if (aliveE(e) && e.pinnedBy != null) { if (uLoad.has(e.pinnedBy) && !clashOfE(state, e.eid)) uLoad.set(e.pinnedBy, uLoad.get(e.pinnedBy) + 1); else e.pinnedBy = null; }
  for (const e of state.enemies) {
    if (e.pinnedBy != null) continue;
    if (!aliveE(e) || !(e.style === 'skirm' || g.enemyDivers.includes(e.id)) || clashOfE(state, e.eid)) { e.pinnedBy = null; continue; }
    const slip = g.eSlippery.includes(e.id) || e.boss;
    const t = slip ? null : uWalls.filter((u) => uLoad.get(u.uid) < clashCap(u)).sort((a, b) => laneDist(a.seat, e.seat) - laneDist(b.seat, e.seat))[0];
    if (t && laneDist(t.seat, e.seat) <= 1) { if (state.time - (e.pinAt ?? -99) > 3) { state.events.push({ type: 'pin', side: 'e', by: t.uid, eid: e.eid }); dstat(state, 'ePin'); } e.pinAt = state.time; e.pinnedBy = t.uid; uLoad.set(t.uid, uLoad.get(t.uid) + 1); e.diveMark = null; }
    else { if (slip && !e.slipNote && uWalls.some((u) => laneDist(u.seat, e.seat) === 0)) { e.slipNote = true; state.events.push({ type: 'slip', side: 'e', eid: e.eid }); } e.pinnedBy = null; }
  }
  // 적 탱커 → 우리 딜러
  const eWalls = state.enemies.filter((e) => aliveE(e) && e.style === 'bruiser' && !e.advance);
  const eLoad = new Map(eWalls.map((e) => [e.eid, clashOfE(state, e.eid) ? 1 : 0]));
  for (const u of fighters(state)) if (u.pinnedBy != null) { if (eLoad.has(u.pinnedBy)) eLoad.set(u.pinnedBy, eLoad.get(u.pinnedBy) + 1); else u.pinnedBy = null; }
  for (const u of fighters(state)) {
    if (u.pinnedBy != null) continue;
    const st = styleOf(u);
    if (!(st === 'skirm' || (st === 'ranged' && tacticOf(u, g) === 'hunt'))) { u.pinnedBy = null; continue; }
    const slip = canSlip(u, g, state, state.dataRef);
    const t = slip ? null : eWalls.filter((e) => eLoad.get(e.eid) < eCap(e, g)).sort((a, b) => laneDist(a.seat, u.seat) - laneDist(b.seat, u.seat))[0];
    if (t && laneDist(t.seat, u.seat) <= 1) { if (state.time - (u.pinAt ?? -99) > 3) { state.events.push({ type: 'pin', side: 'u', by: t.eid, uid: u.uid }); dstat(state, 'uPin'); } u.pinAt = state.time; u.pinnedBy = t.eid; eLoad.set(t.eid, eLoad.get(t.eid) + 1); u.diveMark = null; }
    else { if (slip && divesU(u, g) && !u.slipNote && eWalls.some((e) => laneDist(e.seat, u.seat) === 0)) { u.slipNote = true; state.events.push({ type: 'slip', side: 'u', uid: u.uid }); dstat(state, 'uSlip'); } u.pinnedBy = null; }
  }
}

/** 제압: 전진한 브루저가 들어온 라인에 그 편 브루저가 없으면, 그 라인의 후열(브루저가 아닌 동물)이 제압됨(능력치 ↓) */
function updateSuppress(state, g) {
  const wallLanes = (list, styleFn) => new Set(list.filter((x) => styleFn(x) === 'bruiser').map((x) => laneOf(x.seat)));
  const uw = wallLanes(fighters(state), styleOf), ew = wallLanes(state.enemies.filter(aliveE), (e) => e.style);
  const eAdv = state.enemies.filter((e) => aliveE(e) && e.style === 'bruiser' && e.advance && !(e.stunLeft > 0));
  const uAdv = fighters(state).filter((u) => styleOf(u) === 'bruiser' && u.advance && !(u.stunLeft > 0));
  // 전진한 브루저가 노리는 라인 = 가까운 라인 중 막는 브루저가 없는 곳
  const lanesHit = (adv, walls) => new Set(adv.map((a) => [0, 1, 2].filter((l) => !walls.has(l)).sort((x, y) => Math.abs(x - laneOf(a.seat)) - Math.abs(y - laneOf(a.seat)))[0]).filter((l) => l != null));
  const uHit = lanesHit(eAdv, uw), eHit = lanesHit(uAdv, ew);
  for (const u of fighters(state)) {
    const on = styleOf(u) !== 'bruiser' && uHit.has(laneOf(u.seat));
    if (on && !u.suppressed) { state.events.push({ type: 'suppress', side: 'u', uid: u.uid }); dstat(state, 'uSup'); u.supSince = state.time; }
    u.suppressed = on;
    // 후열 붕괴: 적 브루저가 우리 뒷줄에 오래(rout.after초) 눌러앉으면 치명타 + 우리 편 전체 피해 −
    if (on && g.rout && !u.routed && state.time - (u.supSince ?? state.time) >= g.rout.after) {
      u.routed = true; state.routed.u = true;
      hurtUnit(state, state.dataRef, u, u.maxHp * g.rout.hit / 100, null, { kind: 'env', big: true, cause: 'rout' }); u.stunLeft = Math.max(u.stunLeft ?? 0, g.rout.stun);
      state.events.push({ type: 'rout', side: 'u', uid: u.uid }); say(state, `💥 후열 붕괴! ${u.stats.name}`); dstat(state, 'uRout');
    }
  }
  for (const e of state.enemies.filter(aliveE)) {
    const on = e.style !== 'bruiser' && eHit.has(laneOf(e.seat));
    if (on && !e.suppressed) { state.events.push({ type: 'suppress', side: 'e', eid: e.eid }); dstat(state, 'eSup'); e.supSince = state.time; }
    e.suppressed = on;
    if (on && g.rout && !e.routed && state.time - (e.supSince ?? state.time) >= g.rout.after) {
      e.routed = true; state.routed.e = true;
      hurtEnemy(state, state.dataRef, e, e.maxHp * g.rout.hit / 100, null, true, { kind: 'env', big: true, cause: 'rout' }); e.stunLeft = Math.max(e.stunLeft ?? 0, g.rout.stun);
      state.events.push({ type: 'rout', side: 'e', eid: e.eid }); say(state, `💥 적 후열 붕괴! ${e.name}`); dstat(state, 'eRout');
    }
  }
}

function updateClashes(state, data, d, g) {
  // 정리: 우리 브루저가 쓰러지면 끝, 맞붙은 적이 쓰러지면 거들던 적이 대신 맞붙음
  state.clashes = (state.clashes ?? []).filter((c) => {
    const u = findU(state, c.uid);
    c.helpers = (c.helpers ?? []).filter((id) => aliveE(findE(state, id)));
    if (!aliveE(findE(state, c.eid)) && c.helpers.length) { c.eid = c.helpers.shift(); state.events.push({ type: 'clashSwap', uid: c.uid, eid: c.eid }); }
    const ok = u && aliveU(u) && aliveE(findE(state, c.eid));
    if (!ok) state.events.push({ type: 'clashEnd', uid: c.uid, eid: c.eid });
    return ok;
  });
  pairUp(state, g);
  for (const c of state.clashes) {
    const u = findU(state, c.uid), e = findE(state, c.eid);
    // 힘 = √(초당 피해 × 최대 체력) × 남은 체력 — 아군은 세게 치고 약하고 적은 질기고 약하게 쳐서, 둘을 섞어야 맞먹음
    // 자리(체스처럼): 1열이 아닌 브루저는 늦게 합류해 힘이 약함(열마다 −lineup.backPush), 다른 라인 적을 막으면 −lineup.stretch
    const lu = g.lineup ?? {}, seatK = 1 - (lu.backPush ?? 0) * colOf(u.seat) - (lu.stretch ?? 0) * laneDist(u.seat, e.seat);
    // 한 라인을 비우면 나머지 라인에 힘이 모임(lineup.focus) — 대신 그 라인이 뚫린 길이 됨
    const focusU = emptyLanes(state, 'u').size ? 1 + (lu.focus ?? 0) : 1, focusE = emptyLanes(state, 'e').size ? 1 + (lu.focus ?? 0) : 1;
    const su = focusU * Math.max(0.4, seatK) * (u.stunLeft > 0 ? 0.6 : 1) * (tuneOf(u, g)?.push ?? 1) * (1 + (eco(state, data, 'clashPow') ?? 0) / 100) * (state.isolated?.u ? g.isolatePush : 1) * Math.sqrt((effDamage(u) / uInterval(state, u)) * u.maxHp) * (0.4 + 0.6 * u.hp / u.maxHp);
    const se = focusE * (e.stunLeft > 0 ? 0.6 : 1) * (state.isolated?.e ? g.isolatePush : 1) * Math.sqrt((e.attack / eInterval(e)) * e.maxHp) * g.clashEnemy * (e.boss ? g.clashBoss : 1) * (0.4 + 0.6 * e.hp / e.maxHp);
    let sh = 0;
    for (const id of c.helpers) { const h = findE(state, id); if (h) sh += (h.stunLeft > 0 ? 0.6 : 1) * Math.sqrt((h.attack / eInterval(h)) * h.maxHp) * g.clashEnemy * g.gangPower * (0.4 + 0.6 * h.hp / h.maxHp); }
    const lean = su + se + sh > 0 ? (su - se - sh) / (su + se + sh) : 0;
    // 힘 차이는 절반만 반영하고 흔들림을 크게: 강한 쪽이 이기는 편이지만 엎치락뒤치락함
    // 기세(surge): 0.5~1.3초마다 바뀌는 밀고 당김 — 순간순간 엎치락뒤치락
    c.surgeT = (c.surgeT ?? 0) - d;
    if (c.surgeT <= 0) { c.surge = (state.rng() * 2 - 1) * g.clashNoise; c.surgeT = 0.5 + state.rng() * 0.8; }
    c.push += d * g.clashRate * (lean * g.clashLean + c.surge);
    if (c.push >= 1) {
      c.push = 0;
      const a = hurtEnemy(state, data, e, effDamage(u) * g.clashBonus * matchK(state, data, u, e).mult, u, false, { big: true, cause: 'clash' });
      if (aliveE(e)) { e.stunLeft = Math.max(e.stunLeft ?? 0, (e.boss ? g.clashStun * 0.4 : g.clashStun) + (eco(state, data, 'clashStun') ?? 0)); e.gauge = 0; }
      dstat(state, 'clashW'); state.events.push({ type: 'clashWin', uid: u.uid, eid: e.eid, dmg: Math.round(a) });
      say(state, `${u.stats.name} 힘겨루기 승! → ${e.name} ${Math.round(a)}`);
    } else if (c.push <= -1) {
      c.push = 0;
      hurtUnit(state, data, u, e.attack * g.clashBonus, e, { big: true, cause: 'clash' }); const a = state.lastLost;
      if (aliveU(u)) { u.stunLeft = Math.max(u.stunLeft ?? 0, g.clashStun * 0.8); u.gauge = 0; }
      dstat(state, 'clashL'); state.events.push({ type: 'clashLose', uid: u.uid, eid: e.eid, dmg: Math.round(a) });
      say(state, `${e.name}에게 밀림 · ${u.stats.name} ${Math.round(a)}`);
    }
  }
}

/** 힘겨루기를 거드는 한 방: 같은 편이 밀리는 쪽을 받쳐 줌 */
function assist(state, side, id, amount) {
  const c = side === 'e' ? clashOfE(state, id) : clashOfU(state, id);
  if (!c) return;
  c.push = Math.max(-0.95, Math.min(0.95, c.push + (side === 'e' ? amount : -amount)));
}

function frontTargets(list) {
  const f = list.filter((x) => x && isFront(x.seat) && (x.hp > 0) && !x.down && !x.resting);
  return f.length ? f : list.filter((x) => x && x.hp > 0 && !x.down && !x.resting);
}
/** 도움 사건(2026-11-28 "서포트 스킬이 어떤 영향을 주는지 체감되게"): kind = heal · buff(stat) · shield · cleanse · haste · mana. 장면이 누가 누구에게 무엇을 줬는지 그림 */
const aid = (state, kind, from, to, x = {}) => { const ids = (Array.isArray(to) ? to : [to]).filter(Boolean).map((u) => u.uid); if (ids.length || kind === 'mana') state.events.push({ type: 'aid', kind, from: from?.uid ?? null, to: ids, ...x }); };
/** 부활(2026-11-28 "부활 스킬도 서포터 신화나 키메라에는"): 타고난 응원 역할의 신화급·키메라는 교전마다 perEnc번, 쓰러진 친구를 일으킴(체력 hp%, 잠깐 보호막) */
export const canReviveSkill = (u) => !!u && canStance(u) && baseStyle(u) === 'support';
function reviveTick(state, data, g) {
  const R = g.reviveSkill; if (!R) return;
  const d = unitsIn(state).find((x) => x && x.down && !x.resting && state.time - (x.downAt ?? -99) >= R.delay);
  if (!d) return;
  const by = fighters(state).find((u) => canReviveSkill(u) && (u.reviveUsed ?? 0) < R.perEnc && !(u.stunLeft > 0));
  if (!by) return;
  by.reviveUsed = (by.reviveUsed ?? 0) + 1; by.gauge = 0;
  d.down = false; if (setHp(state, d, d.maxHp * Math.min(90, R.hp + (eco(state, data, 'reviveHp') ?? 0)) / 100, 'revive', by, 'reviveSkill') > 1e-9) state.hpLog[state.hpLog.length - 1].aid = true;   // 부활 숫자는 #97 부활 효과가 띄움 d.gauge = 0; d.stunLeft = 0; d.pinnedBy = null; d.suppressed = false; d.shieldT = state.time + R.shield;
  dstat(state, 'revive');
  state.events.push({ type: 'reviveSkill', uid: by.uid, to: d.uid, hp: Math.round(d.hp) });
  say(state, `${by.stats.name} · 부활! ${d.stats.name} 일어남`);
  void data;
}
const lowest = (list) => list.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a), list[0]);

function pickUnitTarget(state, u) {
  const es = state.enemies.filter(aliveE);
  if (!es.length) return null;
  const st = styleOf(u);
  if (u.diveMark?.eid != null) { const e = findE(state, u.diveMark.eid); if (aliveE(e)) return e; }
  if (u.pinnedBy != null) { const e = findE(state, u.pinnedBy); if (aliveE(e)) return e; }
  { const deep = es.filter((e) => (e.deepT ?? 0) > state.time); if (deep.length && st !== 'bruiser' && state.rng() < 0.6) return deep[0]; }
  if (st === 'bruiser') {
    const c = clashOfU(state, u.uid); const e = c && findE(state, c.eid); if (e && aliveE(e)) return e;
    // 전진: 적 후열(브루저가 아닌 적) 중 가까운 라인 → 없으면 남은 적
    if (u.advance) { const back = es.filter((x) => x.style !== 'bruiser' && (!x.flying || u.stats.canHitFlying)); const pool = back.length ? back : es; return [...pool].sort((a, b) => laneDist(a.seat, u.seat) - laneDist(b.seat, u.seat) || a.hp - b.hp)[0]; }
  }
  // 거들기: 밀리는 힘겨루기가 있으면 원거리·응원은 그 적을 먼저
  if (st === 'ranged' || st === 'support') {
    const losing = (state.clashes ?? []).filter((c) => c.push < -0.25).map((c) => findE(state, c.eid)).filter(aliveE);
    if (losing.length && state.rng() < 0.6 && (st === 'ranged' || isFront(u.seat))) return losing[0];
  }
  // 치고 빠지기: 힘겨루기에 묶이지 않은 적, 뒷줄·약한 적을 노림
  if (st === 'skirm') {
    // 같은 라인과 맞붙음: 같은 라인 적 먼저(없으면 가까운 라인)
    const reach = es.filter((e) => !e.flying || u.stats.canHitFlying);
    const near = Math.min(...reach.map((e) => laneDist(e.seat, u.seat)));
    const lane = reach.filter((e) => laneDist(e.seat, u.seat) === near);
    if (lane.length && state.rng() < 0.75) { const loose0 = lane.filter((e) => !clashOfE(state, e.eid)); const p0 = loose0.length ? loose0 : lane; return state.rng() < 0.55 ? lowest(p0) : p0[Math.floor(state.rng() * p0.length)]; }
    const loose = es.filter((e) => !clashOfE(state, e.eid) && (!e.flying || u.stats.canHitFlying));
    // 떼어 내기: 2대1로 끼어든 적을 먼저
    const gang = es.filter((e) => (state.clashes ?? []).some((c) => c.helpers.includes(e.eid)));
    const pool = loose.length ? loose : gang.length ? gang : es;
    return state.rng() < 0.55 ? lowest(pool) : pool[Math.floor(state.rng() * pool.length)];
  }
  if (u.stats.range > 1) {
    // 원거리: 나는 적·뒷줄을 먼저 노리고, 그중 체력 낮은 놈
    const fly = es.filter((e) => e.flying || !isFront(e.seat));
    if (fly.length && state.rng() < 0.4) return lowest(fly);
    const near = Math.min(...es.map((e) => laneDist(e.seat, u.seat)));
    return lowest(es.filter((e) => laneDist(e.seat, u.seat) === near));
  }
  const f = frontTargets(es).filter((e) => !e.flying || u.stats.canHitFlying);
  const pool = f.length ? f : es;
  return state.rng() < 0.6 ? lowest(pool) : pool[Math.floor(state.rng() * pool.length)];
}

function pickEnemyTarget(state, e, g) {
  const us = fighters(state);
  if (!us.length) return null;
  { const c = clashOfE(state, e.eid); const u = c && findU(state, c.uid); if (u && aliveU(u)) return u; }
  if (e.diveMark?.uid != null) { const u = findU(state, e.diveMark.uid); if (aliveU(u)) return u; }
  if (e.pinnedBy != null) { const u = findU(state, e.pinnedBy); if (aliveU(u)) return u; }
  if (state.focusUntil && state.time > state.focusUntil) { state.focus = null; state.focusUntil = 0; }
  if (state.focus != null && state.rng() < g.focusChance) { const u = findU(state, state.focus); if (aliveU(u)) return u; }
  { const deep = us.filter((u) => (u.deepT ?? 0) > state.time); if (deep.length && state.rng() < g.deepFocus) return deep[0]; }
  // 적 돌격대: 우리 뒷줄(원거리·응원)을 노림 → 우리 쪽 지켜 주기·떼어 내기가 나옴
  // 배우는 단계 0(1스테이지)은 앞라인 싸움만: 적 돌격대도 앞줄·딜러를 침. 그 뒤로는 예고 없는 후열 공격이 가끔(0.4) — 큰 돌파는 예고(빨간 화살표)로
  if (e.style === 'skirm') {
    const back = us.filter((u) => ['ranged', 'support'].includes(styleOf(u)));
    if (back.length && state.tLevel !== 0 && state.rng() < g.skirmBack) return lowest(back);
    if (state.tLevel === 0) { const fr = us.filter((u) => !['ranged', 'support'].includes(styleOf(u))); if (fr.length) return fr[Math.floor(state.rng() * fr.length)]; }
  }
  // 전진한 적 브루저: 막는 브루저가 없는 라인의 후열을 침(제압)
  if (e.style === 'bruiser' && e.advance) { const sup = us.filter((u) => u.suppressed); const back = sup.length ? sup : us.filter((u) => styleOf(u) !== 'bruiser'); const pool = back.length ? back : us; return [...pool].sort((a, b) => laneDist(a.seat, e.seat) - laneDist(b.seat, e.seat) || a.hp - b.hp)[0]; }
  const nearLane = (list) => { const m = Math.min(...list.map((u) => laneDist(u.seat, e.seat))); return list.filter((u) => laneDist(u.seat, e.seat) === m); };
  if (e.ranged) return state.rng() < 0.5 ? lowest(nearLane(us)) : us[Math.floor(state.rng() * us.length)];
  // 근접 적: 같은(가까운) 라인 우리 브루저가 벽. 브루저가 다 쓰러지면(진형 붕괴) 뒷줄로 밀고 들어옴
  const wall = us.filter((u) => styleOf(u) === 'bruiser');
  if (wall.length) return lowest(nearLane(wall));
  const back = us.filter((u) => ['ranged', 'support'].includes(styleOf(u)));
  const pool = back.length && state.tLevel !== 0 && state.rng() < 0.7 ? back : us;
  return pool[Math.floor(state.rng() * pool.length)];
}

function pickMoveG(state, u, target, cfg) {
  const m = cfg.moves, have = movesOf(u, cfg, true);   // 연전: 산군은 장면이 전용 v6 연출로 필살기를 보여 줌
  if (!m || have.length === 1) return 'a1';
  if (have.includes('ult') && (u.ultGauge ?? 0) >= m.ult.gauge * (state.ultSlow ?? 1) && (u.ultUsed ?? 0) < (state.ultMax ?? 99)) return 'ult';
  const w = {};
  for (const k of have) if (k !== 'ult') w[k] = m.weights[k] ?? 0;
  if (w.a2 != null && target.hp / target.maxHp < m.rules.a2.lowHp) w.a2 *= m.rules.a2.lowHpMult;
  if (w.el != null) { if ((u.elCd ?? 0) > 0) w.el = 0; else { w.el += u.mods?.elemChance ?? 0; if (target.boss) w.el *= m.rules.el.bossMult; } }
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  let roll = state.rng() * total;
  for (const [k, v] of Object.entries(w)) { if (roll < v) return k; roll -= v; }
  return 'a1';
}

/** Damage to an enemy (shield takes most of it). Returns damage dealt. */
function hurtEnemy(state, data, e, amount, src, quiet = false, info = null) {
  if (!aliveE(e)) return 0;
  if (src && src.uid != null) amount *= upMult(state, src);
  let a = amount * (e.shieldLeft > 0 ? 0.3 : 1) * (e.elite === 'shield' ? 0.65 : 1) * (state.collapse?.e ? 1 + gcfg(data).collapseTaken / 100 : 1) * (e.suppressed ? 1 + (gcfg(data).supTaken + (eco(state, data, 'supPlus') ?? 0)) / 100 : 1) * ((e.deepT ?? 0) > state.time ? 1 + gcfg(data).deepTaken / 100 : 1);
  if (e.raid) a *= raidHitMult(state, e, src);   // 보호막·껍질·숨기(raid.js)
  // 보호막(보스 보호막 ×0.3, 방패 정예 ×0.65)이 막은 양: 장부에 따로(화면 파란 '막음')
  const shK = (e.shieldLeft > 0 ? 0.3 : 1) * (e.elite === 'shield' ? 0.65 : 1);
  const hp0 = e.hp, blocked = shK < 1 ? Math.max(0, Math.min(a / shK, hp0) - Math.min(a, hp0)) : 0;
  a = Math.min(a, e.hp);
  e.hp -= a;
  if (src) {
    for (const book of [state.dmgWave, state.dmgRun]) { const r = (book[src.uid] ??= { name: src.stats.name, speciesId: src.speciesId, soul: !!src.soul, dmg: 0 }); r.dmg += a; r.name = src.stats.name; }
    chargeUlt(src, data.config, 'hit', 1, true);
  }
  if (e.hp <= 0.001) {
    e.hp = 0; state.kills += 1; state.eSeats[state.eSeats.indexOf(e.eid)] = null;
    if (src) { chargeUlt(src, data.config, 'kill', 1, true); if (src.soul) src.soulKills = (src.soulKills ?? 0) + 1; }
    if (e.boss) state.bossKilled = true;
    state.events.push({ type: 'kill', eid: e.eid, boss: e.boss, by: src?.uid ?? null });
  } else if (quiet && a > 0.5 && state.rng() < 0.15) state.events.push({ type: 'dot', eid: e.eid, dmg: a });
  if (e.hp - hp0 < -1e-9 || blocked > 0) hpNote(state, { side: 'e', id: e.eid, d: e.hp - hp0, kind: info?.kind ?? (quiet ? 'dot' : 'hit'), by: refOf(src), blocked, eff: info?.eff ?? null, crit: !!info?.crit, big: !!info?.big, cause: info?.cause ?? null, kill: e.hp <= 0 });
  return a;
}

function hurtUnit(state, data, u, amount, src, info = null) {
  if (!aliveU(u)) return 0;
  // 역전: 지는 쪽 적의 투지(피해 +), 우리 투지(받는 피해 −), 동물 역전 특성(받는 피해)
  const cb = cbCfg(state);
  if (src && src.eid != null) amount *= (state.form?.adv < 0 ? 1 + (cbForm(state)?.adv ?? 0) / 100 : 1) * (state.routed?.e ? 1 - (state.dataRef?.config?.gauntlet?.rout?.teamDmg ?? 0) / 100 : 1) * (1 + (state.grit?.e ?? 0) / 100) * ((state.eRallyBuff ?? 0) > state.time ? 1 + (cb?.rally?.eDmg ?? 0) / 100 : 1);
  amount *= 1 - ((state.grit?.u ?? 0) > 0 ? (cb?.grit?.taken ?? 0) * (state.grit.u / (cb?.grit?.uMax || 1)) : 0) / 100;
  { const c = clutchOf(state, u); if (c?.taken) amount *= 1 + c.taken / 100; }
  amount *= raidTakenMult(state, u);   // 레이드 저주
  const lu0 = state.dataRef?.config?.gauntlet?.lineup;
  const taken = (lu0 && styleOf(u) !== 'bruiser' && colOf(u.seat) === 0 ? lu0.exposed : 0) + (u.mods?.taken ?? 0) + buffSum(state, 'taken') + (state.collapse?.u ? gcfg(data).collapseTaken : 0) + (state.isolated?.u && styleOf(u) === 'bruiser' ? gcfg(data).isolateTaken : 0) + (state.focus === u.uid ? gcfg(data).focusTaken : 0) + (u.suppressed ? gcfg(data).supTaken : 0) + ((u.deepT ?? 0) > state.time ? gcfg(data).deepTaken : 0) + (u.stance === 'tank' ? (nativeStance(u) === 'tank' ? -35 : -25) : 0);
  const a = Math.max(1, amount * Math.max(0.2, 1 + taken / 100) * ((u.shieldT ?? 0) > state.time ? 0.6 : 1));
  // 막은 양 = 보호막(🧿 눌러 막기·응원 보호막 ×0.6)과 '받는 피해 −' 버프(곰 필살기·마법 방패 등)가 없었을 때와의 차이
  const negBuff = state.allyBuffs.reduce((s, b) => s + (b.stat === 'taken' && b.percent < 0 ? b.percent : 0), 0), shOn = (u.shieldT ?? 0) > state.time;
  const amtFull = info?.fullAmount ?? amount;   // 보스 필살기는 🧿 막기가 피해 자체도 줄임(bossSkill.shield) → 그만큼도 '막음'
  const full = negBuff < 0 || shOn || amtFull !== amount ? Math.max(1, amtFull * Math.max(0.2, 1 + (taken - negBuff) / 100)) : a;
  const hp0 = u.hp, lost = Math.min(a, Math.max(0, hp0)), blocked = Math.max(0, Math.min(full, Math.max(0, hp0)) - lost);
  state.lastLost = lost;
  hpNote(state, { side: 'u', id: u.uid, d: -lost, kind: info?.kind ?? 'hit', by: refOf(src), blocked, eff: info?.eff ?? null, crit: !!info?.crit, big: !!info?.big, cause: info?.cause ?? null, shieldBy: shOn ? u.shieldBy ?? null : null, kill: hp0 - a <= 0, raw: a });
  u.hp -= a;
  chargeUlt(u, data.config, 'hurt', (a / u.maxHp) * 100, true);
  if (u.hp <= 0 && !state.phoenixUsed && state.dataRef && eco(state, state.dataRef, 'phoenix')) { state.phoenixUsed = true; u.hp = 0; setHp(state, u, u.maxHp * 0.3, 'revive', u, 'phoenix'); state.events.push({ type: 'phoenix', uid: u.uid }); say(state, `${u.stats.name} 불사조 깃털로 일어남!`); return a; }
  if (u.hp <= 0) { u.hp = 0; u.down = true; u.downAt = state.time; state.downs += 1; state.events.push({ type: 'down', uid: u.uid }); say(state, `${u.stats.name} 쓰러짐`); }
  return a;
}

/** 상성 배수: 속성(×1.5/×0.6) × 먹이사슬(×1.3/×0.8). tag는 화면 글자용. */
function matchK(state, data, u, e) {
  const m = mcfg(data);
  const em = elemMult(u.stats.element, e.element, m);
  const fc = foodChain(u, e.id, data);
  const tag = em > 1 ? 'strong' : em < 1 ? 'weak' : fc.tag;
  if (em > 1 || fc.tag === 'prey') state.matchHits = (state.matchHits ?? 0) + 1;
  return { mult: em * fc.mult, tag };
}

/** 등 뒤 공격(2026-11-27 사용자 "뒤에서 공격하면 멘트와 이펙트와 추가 데미지"): 근접으로
 *  ① 적진 깊이 뛰어든 녀석(자기가 노린 상대만 보고 있음)을 다른 쪽이 침  ② 뛰어든 녀석이 상대 앞줄(1열)을 뒤에서 침 */
function isBackstab(state, atk, atkTarget, tgt, tgtTarget, melee) {
  if (!melee) return false;
  const now = state.time;
  return ((tgt.deepT ?? 0) > now && tgtTarget !== atk) || ((atk.deepT ?? 0) > now && atkTarget !== tgt && colOf(tgt.seat) === 0);
}

function unitAct(state, data, u, g) {
  const cfg = data.config;
  const t = pickUnitTarget(state, u);
  u.gauge = 0;
  if (!t) return;
  const move = pickMoveG(state, u, t, cfg);
  const melee = u.stats.range <= 1;
  const st = styleOf(u);
  let mult = melee && st !== 'skirm' && colOf(u.seat) === 2 ? g.backMelee : !melee && isFront(u.seat) ? g.frontRanged : 1;
  if (u.suppressed) mult *= 1 - g.supDmg / 100;
  mult *= 1 + buffSum(state, 'dmg') / 100;
  if (u.stance === 'deal') mult *= nativeStance(u) === 'deal' ? 1.35 : 1.25;
  if (t.curseLeft > 0) mult *= 1.2;
  const base = hitDamage(state, u, t) * mult;
  const hits = [];
  let name = null, big = false, el = null;
  const row = (e) => state.enemies.filter((x) => aliveE(x) && colOf(x.seat) === colOf(e.seat));
  if (move === 'a1') {
    hits.push([t, base]);
    const ms = u.stats.effects.find((x) => x.type === 'multiShot');
    if (ms) for (const o of state.enemies.filter((x) => aliveE(x) && x !== t).slice(0, ms.count - 1)) hits.push([o, base * 0.7]);
  } else if (move === 'a2') {
    const a2 = a2Of(u, cfg); name = a2.name;
    if (a2.aoe) for (const o of row(t)) hits.push([o, base * a2.mult * (o === t ? 1 : 0.6)]);
    else for (let i = 0; i < (a2.hits ?? 1); i++) hits.push([t, base * a2.mult]);
    if (a2.stun) t.stunLeft = Math.max(t.stunLeft ?? 0, a2.stun);
    if (a2.push) t.gauge = Math.max(0, t.gauge - a2.push);
    if (a2.healAlly) { const al = lowest(fighters(state)); aid(state, 'heal', u, al, { amt: healA(state, al, al.maxHp * a2.healAlly / 100, u, a2.name) }); }
  } else if (move === 'el') {
    el = u.stats.element; const def = cfg.elements.defs[el] ?? {}; name = `${def.icon ?? ''} ${def.name ?? ''} 공격`.trim(); big = true;
    u.elCd = cfg.moves.rules.el.cooldown;
    hits.push([t, base * (cfg.moves.el?.mult ?? 1)]);
    if (el === 'fire') { t.burnDps = base * (def.burnPct ?? 19) / 100; t.burnLeft = def.dur ?? 3; }
    if (el === 'water') { t.slowPct = def.slow ?? 30; t.slowLeft = def.dur ?? 2; for (const o of row(t)) if (o !== t) hits.push([o, base * (def.splashPct ?? 40) / 100]); }
    if (el === 'wind') for (const o of row(t)) o.gauge = Math.max(0, o.gauge - (def.push ?? 0.45));
    if (el === 'earth') for (const o of row(t)) o.stunLeft = Math.max(o.stunLeft ?? 0, def.stun ?? 0.6);
    if (el === 'thunder') for (const o of state.enemies.filter((x) => aliveE(x) && x !== t).slice(0, def.chain ?? 2)) hits.push([o, base * (def.chainPct ?? 55) / 100]);
    if (el === 'moon') { t.curseLeft = def.dur ?? 3; }
    if (el === 'grass') t.stunLeft = Math.max(t.stunLeft ?? 0, def.root ?? 0.8);
    if (el === 'light') hits[0][1] *= 1.3;
  } else if (move === 'ult') {
    big = true; u.ultGauge = 0; u.ultUsed = (u.ultUsed ?? 0) + 1;
    const sk = teamUlt(state, data, u, t, g);
    name = sk.name;
    hits.push([t, base * g.ultDmg]);
    state.events.push({ type: 'ultFx', uid: u.uid, kind: sk.kind, name: sk.name, desc: sk.desc });
  }
  // 기본기 상태 효과(독·둔화·밀치기·묶기)
  for (const fx of u.stats.effects) {
    if (fx.type === 'poison') { t.poisonDps = Math.max(t.poisonLeft > 0 ? t.poisonDps : 0, fx.dps * (cfg.tempo?.unitDamage ?? 1)); t.poisonLeft = fx.duration; }
    if (fx.type === 'slow') { t.slowPct = Math.max(t.slowLeft > 0 ? t.slowPct : 0, fx.percent); t.slowLeft = fx.duration; }
    if (fx.type === 'knockback') { u.kbN = (u.kbN ?? 0) + 1; if (u.kbN % (fx.every ?? 4) === 0) { t.gauge = Math.max(0, t.gauge - 0.5); if (fx.stun) t.stunLeft = Math.max(t.stunLeft ?? 0, fx.stun); } }
    if (fx.type === 'hold' && (u.skillT.hold ?? 0) <= state.time) {
      u.skillT.hold = state.time + fx.cooldown;
      for (const o of frontTargets(state.enemies.filter(aliveE)).slice(0, fx.count)) if (!o.boss) o.stunLeft = Math.max(o.stunLeft ?? 0, fx.duration * 0.5);
      state.events.push({ type: 'skill', uid: u.uid, name: '막아서기' });
    }
  }
  // 우리 돌파: 적 후열을 노렸을 때 적 브루저가 막을 수 있음(무리 성향에 따라, 넋 없음). 막으면 그 브루저가 맞고 힘싸움을 우리가 밀어붙임
  const dived = u.diveMark?.eid === t.eid; u.diveMark = null;
  if (dived && (t.style === 'ranged' || t.style === 'support')) {
    // 빈 라인(2026-11-27): 적이 비워 둔 라인으로 파고들면 막기·낚아채기를 반쯤 피하지만, 옆 라인 적에게 옆구리를 맞음(매복)
    const lg = gcfg(data).lineup ?? {}, openE = emptyLanes(state, 'e').has(laneOf(u.seat));
    if (openE) { flankHit(state, data, 'e', u, laneOf(u.seat)); if (!aliveU(u)) return; }
    if (openE && state.rng() < (lg.openRun ?? 0)) { state.events.push({ type: 'openRun', side: 'u', uid: u.uid }); }
    else {
    // 위험 부담 ①: 적 잡아채는 녀석(좀비·해골 손)이 있으면 낚아채여 기절 + 붙잡힘
    const ec = state.enemies.find((x) => aliveE(x) && g.eCatchers[x.id] && !(x.stunLeft > 0) && state.time - (x.snatchAt ?? -99) >= g.snatchCd && x !== t);
    if (ec && state.rng() < g.eSnatchChance) { snatchE(state, data, ec, u, g.eCatchers[ec.id]); return; }
    const eg = state.enemies.find((x) => aliveE(x) && x.style === 'bruiser' && !(x.stunLeft > 0) && (x.protectAt ?? -99) + g.protectCd <= state.time && (g.enemyGuards.includes(x.id) ? state.rng() < 0.7 : state.rng() < (state.temper?.guard ?? 0.3)));
    const mv = diveMove(u, g), sk = eg ? stopKind(state, mv, g) : null;
    if (eg && sk) {
      eg.protectAt = state.time;
      const a = hurtEnemy(state, data, eg, hits[0][1] * g.guardTaken * (sk === 'block' ? 1 : 0.5), u, false, { cause: 'eguard' });
      const c = clashOfE(state, eg.eid); if (c) c.push = Math.min(0.95, c.push + g.guardFreePush);
      // 다리걸기·발목잡기: 뛰어든 딜러가 넘어지거나 끌려 떨어짐(잠깐 기절 + 조금 다침)
      let fallDmg = 0;
      if (sk !== 'block') { u.stunLeft = Math.max(u.stunLeft ?? 0, g.tripStun); u.gauge = 0; hurtUnit(state, data, u, u.maxHp * g.tripHurt, eg, { cause: 'trip' }); fallDmg = Math.round(state.lastLost); }
      dstat(state, 'eGuard'); state.events.push({ type: 'eguard', eid: eg.eid, for: t.eid, uid: u.uid, dmg: Math.round(a), kind: sk, mv, fallDmg });
      state.events.push({ type: 'act', side: 'u', uid: u.uid, eid: eg.eid, move, name, big, el, melee, style: st, hits: [{ eid: eg.eid, dmg: Math.round(a) }] });
      return;
    }
    }
    // 뚫었다: 급소 공격(피해 ↑) + 잠깐 기절(응원·사격이 멈춤)
    for (const h of hits) if (h[0] === t) h[1] *= g.diveBonus * (1 + (eco(state, data, 'diveBonus') ?? 0) / 100);
    t.stunLeft = Math.max(t.stunLeft ?? 0, g.diveStun); t.gauge = 0;
    // 위험 부담 ②: 뚫고 들어간 딜러는 잠깐 적진 깊숙이(집중 공격, 받는 피해 +)
    u.deepT = state.time + g.deepT; u.deepEid = t.eid;
    dstat(state, 'uBreach'); state.events.push({ type: 'breach', side: 'u', uid: u.uid, eid: t.eid, deep: true, mv: diveMove(u, g) });
  }
  // 적 돌격대도 요리조리: 맞붙지 않았으면 평타를 가끔 피함
  if ((move === 'a1' || move === 'a2') && t.style === 'skirm' && !clashOfE(state, t.eid) && state.rng() < g.dodge) {
    for (const h of hits) if (h[0] === t) h[1] = 0;
    state.events.push({ type: 'edodge', eid: t.eid, uid: u.uid });
  }
  const back = aliveE(t) && isBackstab(state, u, u.deepEid != null ? findE(state, u.deepEid) : null, t, t.deepUid != null ? findU(state, t.deepUid) : null, melee);
  if (back) { for (const h of hits) if (h[0] === t) h[1] *= g.backstab ?? 1.3; dstat(state, 'uBackstab'); }
  const aw = (u.awake?.dmg ?? 1) * (rule(state, 'myth') ? (u.kind === 'chimera' || u.stage === 'spirit' ? 1.4 : 0.85) : 1) * (rule(state, 'glass') ? 1.5 : 1);
  const dealt = hits.filter(([, a]) => a > 0).map(([e, a]) => { const k = matchK(state, data, u, e); return { eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, a * k.mult * aw, u, false, { eff: k.tag, crit: (back || dived) && e === t, big, cause: name ?? move })), eff: k.tag }; });
  // 가시 정예: 근접으로 때리면 20%를 되돌려 받음
  if (melee) for (const h of dealt) { const e = findE(state, h.eid); if (e?.elite === 'thorns' && h.dmg > 0) { hurtUnit(state, data, u, h.dmg * 0.2, e, { kind: 'reflect', cause: 'thorns' }); state.events.push({ type: 'thorns', uid: u.uid, eid: e.eid }); } }
  // 거들기: 힘겨루기 중인 적을 다른 동물이 때리면 우리 브루저 쪽으로 기움
  if (st !== 'bruiser') for (const h of dealt) assist(state, 'e', h.eid, g.assistPush * (big ? 2 : 1));
  // 응원: 응원 동물은 칠 때마다 가장 밀리는 브루저를 북돋움(체력 조금 + 힘겨루기 쪽으로)
  let cheer = null;
  if (st === 'support' && tacticOf(u, g) === 'back') {
    // 응원 '뒤': 노려지는(돌파 예고된) 후열 → 없으면 가장 약한 후열에 보호막(2초, 받는 피해 −40%)
    const marked = state.enemies.filter((e) => e.diveMark?.uid).map((e) => findU(state, e.diveMark.uid)).filter(aliveU);
    const to = marked[0] ?? lowest(fighters(state).filter(isBack).length ? fighters(state).filter(isBack) : fighters(state));
    if (to) { to.shieldT = state.time + 2; to.shieldBy = refOf(u); noteStatus(state, 'buff', u, [to], 'shield', 'cheerShield', 2, true); cheer = to.uid; state.events.push({ type: 'cheer', uid: u.uid, to: to.uid, shield: true }); aid(state, 'shield', u, to, { dur: 2 }); }
  } else if (st === 'support') {
    const c = [...(state.clashes ?? [])].sort((a, b) => a.push - b.push)[0];
    const to = c ? findU(state, c.uid) : lowest(fighters(state));
    if (to && aliveU(to)) {
      const sk = u.stance === 'support' ? (nativeStance(u) === 'support' ? 2.5 : 2) : 1;
      // 응원은 여럿이 겹치면 덜 듦(1/√응원 수): 응원만 잔뜩은 약함
      const nSup = fighters(state).filter((x) => styleOf(x) === 'support').length;
      const cp = 1 + (eco(state, data, 'cheerPlus') ?? 0) / 100;   // 특성 '큰 목청'
      const hb = cp * (u.kind === 'base' && u.build ? BUILDS[u.build]?.heal ?? 1 : 1) * (tuneOf(u, g)?.heal ?? 1) / Math.sqrt(Math.max(1, nSup));
      const amt = healA(state, to, to.maxHp * g.cheerHeal * sk * hb / 100, u, 'cheer');
      if (c) c.push = Math.min(0.95, c.push + g.cheerPush * cp * sk * (tuneOf(u, g)?.push ?? 1) / Math.sqrt(Math.max(1, nSup)));
      cheer = to.uid;
      state.events.push({ type: 'cheer', uid: u.uid, to: to.uid, heal: amt, push: !!c });
    }
    // 정신 차려!(이상 해제): 기절한 친구 하나를 깨움(응원 동물마다 cleanseCd초에 한 번)
    if (state.time - (u.cleanseAt ?? -99) >= Math.max(2, (g.cleanseCd ?? 6) - (eco(state, data, 'cleanseCut') ?? 0))) {
      // 기절만 풂(낚아채여 함께 걸린 붙잡힘도). 탱커에게 붙잡힌 것(자리 싸움)은 규칙이 매번 다시 정하므로 건드리지 않음
      const sick = fighters(state).find((x) => x !== u && (x.stunLeft ?? 0) > 0.3);
      if (sick) { const snatched = (sick.pinUntil ?? 0) > state.time; sick.stunLeft = 0; if (snatched) { sick.pinnedBy = null; sick.pinUntil = 0; } u.cleanseAt = state.time; dstat(state, 'cleanse'); aid(state, 'cleanse', u, sick, { what: snatched ? ['stun', 'pin'] : ['stun'] }); }
    }
  }
  state.events.push({ type: 'act', side: 'u', uid: u.uid, eid: t.eid, move, name, big, el, melee, style: st, cheer, hits: dealt, back });
  const tot = dealt.reduce((s, h) => s + h.dmg, 0);
  { const ls = eco(state, data, 'lifesteal') ?? 0; if (ls && st === 'skirm' && tot > 0) setHp(state, u, Math.min(u.maxHp, u.hp + tot * ls / 100), 'drain', t, 'lifesteal'); }
  if (name || big) say(state, `${u.stats.name} · ${name ?? '공격'} → ${t.name} ${tot}`);
}

function enemyAct(state, data, e, g) {
  const t = pickEnemyTarget(state, e, g);
  e.gauge = 0;
  if (!t) return;
  let dmg = e.attack * (rule(state, 'glass') ? 1.5 : 1) * (e.suppressed ? 1 - g.supDmg / 100 : 1);
  if (e.chargeLeft > 0) dmg *= 1.6;
  if (e.elite === 'rage' && e.hp < e.maxHp / 2) dmg *= 1.6;
  { const m = mcfg(data); dmg *= elemMult(e.element, t.stats.element, m, m.eStrong, m.eWeak); }
  // 천적 앞에서는 벌벌: 더 아프게 맞음
  const fearful = foodChain(t, e.id, data).tag === 'fear';
  if (fearful) { dmg *= 1.2; if (state.rng() < 0.5) state.events.push({ type: 'fear', uid: t.uid, eid: e.eid }); }
  const clash = clashOfE(state, e.eid);
  // 요리조리: 치고 빠지는 동물은 맞붙지 않은 적의 공격을 가끔 피함
  const bd = t.kind === 'base' && t.build ? BUILDS[t.build]?.dodge : undefined;
  const td = tuneOf(t, g)?.dodge ?? 0;
  const cdg = clutchOf(state, t)?.dodge ?? 0;
  if (cdg && state.rng() < cdg / 100) { state.events.push({ type: 'act', side: 'e', eid: e.eid, uid: t.uid, dmg: 0, dodged: true, melee: !e.ranged, boss: e.boss, clutch: true }); return; }
  // 피하기 = 빌드(고급) 또는 돌격 딜러 기본 + 종 보정 + 작은 몸(힘싸움 중엔 반). 최대 60%
  const dch = (bd != null ? bd : !clash && styleOf(t) === 'skirm' ? g.dodge : 0) + td + smallDodge(t, data) * (clash ? 0.5 : 1);
  if (dch > 0 && state.rng() < Math.min(0.6, dch)) {
    state.events.push({ type: 'act', side: 'e', eid: e.eid, uid: t.uid, dmg: 0, dodged: true, melee: !e.ranged, boss: e.boss });
    return;
  }
  // 돌파 막기(우리 후열이 노려질 때): ① 요격(요격 작전 딜러) ② 도발(곰·들소 지키기 — 힘싸움을 안 놓음) ③ 지키기(브루저가 빠져서 막음 → 그 힘싸움은 공짜로 밀림)
  //  넋(벽 통과)은 지키기·도발을 무시. 아무도 안 막으면 '뚫렸다'
  // 예고 없이 근접 적이 후열을 치러 와도 똑같이 막기 판정(연출 '뚫렸다'는 예고된 돌파만)
  const marked = !!(e.diveMark && !e.diveMark.skip);
  const dove = marked || (!e.ranged && !clash);
  e.diveMark = null;
  // 빈 라인: 우리가 비워 둔 라인으로 적이 파고들면 옆 라인 동물이 옆구리를 침(매복), 대신 막기·낚아채기는 반쯤 못 함
  const openU = dove && isBack(t) && emptyLanes(state, 'u').has(laneOf(e.seat));
  if (openU) { flankHit(state, data, 'u', e, laneOf(e.seat)); if (!aliveE(e)) return; }
  const freeRun = openU && state.rng() < (g.lineup?.openRun ?? 0);
  if (freeRun) state.events.push({ type: 'openRun', side: 'e', eid: e.eid });
  if (dove && isBack(t) && !freeRun) {
    const ready = (x) => aliveU(x) && !(x.stunLeft > 0) && (x.protectAt ?? -99) + g.protectCd <= state.time && x !== t;
    // 잡아채기(먼저): 덫 마법이 깔려 있거나, 개구리 혀·원숭이 꼬리·개미 떼가 준비돼 있으면
    if (marked && (state.snareT ?? 0) > state.time) { const c0 = fighters(state).find((x) => x !== t) ?? t; snatchU(state, data, c0, e, 'snare'); return; }
    const cat = marked && fighters(state).find((x) => (x.kind === 'chimera' ? x.parts ?? [] : [x.speciesId]).some((id) => g.catchers[id]) && !(x.stunLeft > 0) && state.time - (x.snatchAt ?? -99) >= g.snatchCd && x !== t);
    if (cat && state.rng() < g.snatchChance) { const id = (cat.kind === 'chimera' ? cat.parts : [cat.speciesId]).find((x) => g.catchers[x]); snatchU(state, data, cat, e, g.catchers[id]); return; }
    const icp = (marked || state.rng() < 0.35) && fighters(state).find((x) => styleOf(x) === 'skirm' && tacticOf(x, g) === 'intercept' && ready(x) && state.rng() < g.interceptChance * (1 + (eco(state, data, 'intercept') ?? 0) / 100));
    if (icp) {
      icp.protectAt = state.time;
      const hit = hurtEnemy(state, data, e, effDamage(icp) * 0.7, icp, false, { big: true, cause: 'intercept' });
      if (aliveE(e)) { e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? 0.3 : g.interceptStun); e.gauge = 0; }
      state.events.push({ type: 'peel', uid: icp.uid, for: t.uid, eid: e.eid, dmg: Math.round(hit), hurt: 0, intercept: true });
      dstat(state, 'intercept'); say(state, `${icp.stats.name} 요격!`);
      return;
    }
    const phase = g.phasers.includes(e.id);
    // 지키기 작전 브루저 + (기본) 힘싸움을 크게 이기고 있는 버티기 브루저도 가끔 손을 뻗음
    const guards = fighters(state).filter((x) => styleOf(x) === 'bruiser' && ready(x) && (tacticOf(x, g) === 'guard' || ((clashOfU(state, x.uid)?.push ?? 0) > g.holdGuardPush && state.rng() < g.holdGuardChance)));
    const taunt = !phase && !e.boss && !rule(state, 'noTaunt') && guards.find((x) => (x.kind === 'chimera' ? x.parts ?? [] : [x.speciesId]).some((id) => g.taunters.includes(id)));
    const guard = !phase && (taunt || guards[0]);
    const emv = diveMove(e, g), esk = guard ? (taunt ? 'block' : stopKind(state, emv, g)) : null;
    if (guard && esk) {
      guard.protectAt = state.time;
      hurtUnit(state, data, guard, dmg * g.guardTaken * (esk === 'block' ? 1 : 0.5), e, { cause: 'guard' }); const a = state.lastLost;
      if (!taunt) { const c = clashOfU(state, guard.uid); if (c) c.push = Math.max(-0.95, c.push - g.guardFreePush); }
      let fallDmg = 0;
      if (esk !== 'block' && aliveE(e)) { e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? 0.4 : g.tripStun); e.gauge = 0; fallDmg = Math.round(hurtEnemy(state, data, e, e.maxHp * g.tripHurt, guard, false, { cause: 'trip' })); }
      state.events.push({ type: 'guard', uid: guard.uid, for: t.uid, eid: e.eid, dmg: Math.round(a), taunt: !!taunt, kind: esk, mv: emv, fallDmg });
      dstat(state, taunt ? 'taunt' : 'guard'); say(state, `${guard.stats.name} ${taunt ? '도발' : '막았다'}!`);
      return;
    }
    if (marked) { e.deepT = state.time + g.deepT; e.deepUid = t.uid; dstat(state, 'eBreach'); state.events.push({ type: 'breach', side: 'e', eid: e.eid, uid: t.uid, deep: true, mv: diveMove(e, g) }); }
    if (marked && state.lesson === 'dive' && !state.lessonShown) { state.lessonShown = true; state.events.push({ type: 'lesson', kind: 'dive' }); }
  }
  const back = isBackstab(state, e, e.deepUid != null ? findU(state, e.deepUid) : null, t, t.deepEid != null ? findE(state, t.deepEid) : null, !e.ranged);
  if (back) { dmg *= g.backstab ?? 1.3; dstat(state, 'eBackstab'); }
  // 속성 상성 표시용(유리·불리 반응)
  const eff = e.element && t.stats.element ? (() => { const m = mcfg(data), k = elemMult(e.element, t.stats.element, m, m.eStrong, m.eWeak); return k > 1 ? 'strong' : k < 1 ? 'weak' : null; })() : null;
  const a = hurtUnit(state, data, t, dmg * (e.style === 'support' ? 0.6 : 1), e, { eff, crit: back, big: !!e.boss }), lostA = state.lastLost ?? a;
  { const th = eco(state, data, 'thornsU') ?? 0; if (th && styleOf(t) === 'bruiser' && !e.ranged && a > 0) hurtEnemy(state, data, e, a * th / 100, t, true, { kind: 'reflect', cause: 'thorns' }); }
  if (!clash) assist(state, 'u', t.uid, g.assistPush * 1.5);
  // 적 지원: 칠 때마다 자기 편 중 가장 밀리는 브루저를 북돋움(체력 조금 + 힘겨루기 쪽으로)
  let cheer = null;
  if (e.style === 'support') {
    const c = [...(state.clashes ?? [])].sort((x, y) => y.push - x.push)[0];
    const to = c ? findE(state, c.eid) : lowest(state.enemies.filter(aliveE));
    if (to && aliveE(to)) {
      healTo(state, to, to.maxHp * g.cheerHeal / 100, e, 'echeer');
      if (c) c.push = Math.max(-0.95, c.push - g.cheerPush);
      cheer = to.eid;
      state.events.push({ type: 'echeer', eid: e.eid, to: to.eid });
    }
  }
  state.events.push({ type: 'act', side: 'e', eid: e.eid, uid: t.uid, dmg: Math.round(lostA), melee: !e.ranged, boss: e.boss, clash: !!clash, style: e.style, cheer, back, eff });
  if (e.boss) say(state, `${e.name} → ${t.stats.name} ${Math.round(lostA)}`);
}

function bossTimers(state, data, e, d) {
  const g = gcfg(data);
  // 보스 필살 패턴: 한 라인을 예고(warn초) → 그 라인 동물 모두 큰 피해. 예고된 라인의 동물은 눌러서 🧿 막기
  const bs = g.bossSkill;
  if (e.boss && bs && !state.bossWarn && !raidBusy(state) && (bs.every[stageTier(state)] ?? 0) > 0) {
    e.slamT = (e.slamT ?? bs.every[stageTier(state)]) - d;
    if (e.slamT <= 0) {
      e.slamT = bs.every[stageTier(state)] * (e.raid ? [1, 0.85, 0.7][e.raid.phase] ?? 0.7 : e.phase3 ? 0.6 : e.phase2 ? 0.8 : 1);
      const live = fighters(state);
      if (live.length) {
        const byLane = [0, 1, 2].map((l) => live.filter((u) => laneOf(u.seat) === l).length);
        const lane = byLane.indexOf(Math.max(...byLane));
        state.bossWarn = { eid: e.eid, lane, at: state.time + bs.warn, name: bs.names?.[e.id] ?? '필살기' };
        state.events.push({ type: 'bossWarn', eid: e.eid, lane, name: state.bossWarn.name, warn: bs.warn }); say(state, `⚠ ${e.name}: ${state.bossWarn.name}!`);
      }
    }
  }
  if (e.healT > 0 && e.heal) {
    e.healT -= d;
    if (e.healT <= 0) {
      e.healT = e.heal.every;
      for (const o of state.enemies.filter(aliveE)) healTo(state, o, o.maxHp * e.heal.percent / 100, e, 'eheal');
      state.events.push({ type: 'eheal', eid: e.eid });
    }
  }
  const p = e.raid?.def?.patterns ? null : e.pattern;   // 레이드 보스는 raid.js가 기술을 맡음
  if (e.chargeLeft > 0 && e.raid) e.chargeLeft -= d;
  if (!p) return;
  if (e.chargeLeft > 0) e.chargeLeft -= d;
  e.patternT -= d;
  if (e.patternT > 0) return;
  e.patternT = p.every;
  if (p.type === 'summon') {
    let n = 0;
    const minions = state.enemies.filter((x) => aliveE(x) && x.minion).length;
    for (let i = 0; i < Math.min(p.count, g.summonCap + (e.phase2 ? 1 : 0) - minions); i++) { const m = addEnemy(state, data, p.enemy, state.plan[state.enc].wave); if (m) { m.minion = true; m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * g.minionHp)); n++; } }
    if (n) { state.events.push({ type: 'summon', eid: e.eid, n }); say(state, `${e.name}: 졸개를 부름`); }
  } else if (p.type === 'shield') {
    e.shieldLeft = p.duration; noteStatus(state, 'buff', e, [e], 'shield', 'bossShield', p.duration); state.events.push({ type: 'shield', eid: e.eid }); say(state, `${e.name}: 보호막`);
  } else if (p.type === 'charge') {
    if (e.hp / e.maxHp * 100 > (p.belowHpPercent ?? 100)) return;
    e.chargeLeft = p.duration;
    for (const u of frontTargets(fighters(state))) if (isFront(u.seat)) hurtUnit(state, data, u, e.attack * 0.8, e, { big: true, cause: 'charge' });
    state.events.push({ type: 'charge', eid: e.eid }); say(state, `${e.name}: 돌진!`);
  }
}

const SCALE_AMT = (u, data) => (data.config.stageMult[u.stage]?.damage ?? 1.8) * (data.config.tempo?.unitDamage ?? 1);

function timerSkills(state, data, u, d) {
  for (const fx of u.stats.effects) {
    if (fx.type !== 'timerSkill') continue;
    const k = 'ts:' + fx.name;
    u.skillT[k] = (u.skillT[k] ?? fx.every * (0.4 + state.rng() * 0.4)) - d;
    if (u.skillT[k] > 0) continue;
    u.skillT[k] = fx.every;
    const es = state.enemies.filter(aliveE), front = frontTargets(es);
    const amt = (fx.amount ?? 0) * SCALE_AMT(u, data);
    const hits = [];
    switch (fx.action) {
      case 'damageHeld': for (const e of front) hits.push({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, amt, u, false, { big: true, cause: fx.name })) }); break;
      case 'damageAll': for (const e of es) hits.push({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, amt, u, false, { big: true, cause: fx.name })) }); break;
      case 'flee': for (const e of es) if (!e.boss) e.stunLeft = Math.max(e.stunLeft ?? 0, fx.dur ?? 2); noteStatus(state, 'debuff', u, es.filter((e) => !e.boss), 'stun', fx.name, fx.dur ?? 2); break;
      case 'stunRadius': for (const e of front) e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? 0.5 : fx.dur ?? 1.5); noteStatus(state, 'debuff', u, front, 'stun', fx.name, fx.dur ?? 1.5); break;
      case 'pushHeld': for (const e of front.slice(0, fx.count ?? 1)) e.gauge = 0; noteStatus(state, 'debuff', u, front.slice(0, fx.count ?? 1), 'push', fx.name, 1); break;
      case 'allyBuff': state.allyBuffs.push({ stat: fx.stat, percent: fx.percent, left: fx.dur }); noteStatus(state, 'buff', u, fighters(state), fx.stat === 'taken' ? 'shield' : fx.stat === 'dmg' ? 'atk' : 'haste', fx.name, fx.dur); break;
      case 'halveRespawn': for (const o of fighters(state)) healTo(state, o, o.maxHp * 0.15, u, fx.name); break;
      default: { const t = pickUnitTarget(state, u); if (t) hits.push({ eid: t.eid, dmg: Math.round(hurtEnemy(state, data, t, effDamage(u) * 2, u, false, { big: true, cause: fx.name })) }); }
    }
    state.events.push({ type: 'act', side: 'u', uid: u.uid, eid: hits[0]?.eid ?? null, move: 'skill', name: fx.name, big: true, melee: u.stats.range <= 1, hits, action: fx.action });
    say(state, `${u.stats.name} · ${fx.name}`);
    return;   // 한 틱에 기술 하나
  }
}

function checkEnd(state, data, g) {
  raidBossDown(state);
  const eAlive = state.enemies.some(aliveE), uAlive = fighters(state).length > 0;
  if (!eAlive) return endEncounter(state, data, true);
  if (!uAlive) return endEncounter(state, data, false);
  if (state.encTime >= g.timeLimit && !raidHoldTime(state, data)) {   // 보스 교전은 시간 판정 대신 광포화(raid.json)
    const frac = (list, hp, max) => { const m = list.reduce((s, x) => s + max(x), 0); return m ? list.reduce((s, x) => s + hp(x), 0) / m : 0; };
    const us = unitsIn(state).filter((u) => u && !u.resting), es = state.enemies;
    const a = frac(us, (u) => (u.down ? 0 : u.hp), (u) => u.maxHp), b = frac(es, (e) => e.hp, (e) => e.maxHp);
    state.events.push({ type: 'timeUp', ally: a, enemy: b });
    endEncounter(state, data, a > b);
  }
}

// ---------- after an encounter ----------
function endEncounter(state, data, win) {
  const g = gcfg(data), spec = state.plan[state.enc];
  state.lastWin = win;
  // 대결: 3판 2선승. 판 사이엔 보상 없이 자리·작전만 고치고, 체력은 모두 가득
  if (state.duel) {
    if (win) state.wins += 1; else state.losses += 1;
    state.events.push({ type: win ? 'encWin' : 'encLose', enc: state.enc, life: state.life, duel: true });
    state.enc += 1;
    if (state.wins >= state.duel.need || state.losses >= state.duel.need || state.enc >= state.plan.length) { state.phase = 'ended'; state.result = state.wins > state.losses ? 'clear' : 'lose'; return; }
    for (const u of state.field) { u.down = false; u.resting = false; u.hp = u.maxHp; u.gauge = 0; u.stunLeft = 0; }
    state.enemies = []; state.eSeats = Array(SEATS).fill(null);
    state.phase = 'regroup'; state.prelude = true; state.offer = null;
    state.events.push({ type: 'regroup', prelude: true });
    return;
  }
  if (win) {
    state.wins += 1;
    state.gold += g.goldWin + g.goldPerEnc * state.enc + (eco(state, data, 'goldWin') ?? 0);
    state.events.push({ type: 'encWin', enc: state.enc, boss: spec.boss });
    if (spec.boss) { state.phase = 'ended'; state.result = 'clear'; state.wavesCleared = state.stage.waves.length; return; }
  } else {
    state.losses += 1; state.life -= 1;
    state.gold += g.goldLose;
    state.events.push({ type: 'encLose', enc: state.enc, life: state.life });
    if (state.life <= 0 || state.hard) { state.life = Math.max(0, state.life); state.phase = 'ended'; state.result = 'lose'; state.wavesCleared = Math.round((state.enc * state.stage.waves.length) / state.plan.length); return; }
  }
  // 정비: 회복은 조금만(나머지는 금화로 치료). 쓰러진 동물은 부상 — 몇 교전 쉬거나, 치료비를 내거나, 후보와 바꿈
  const inj = cbCfg(state)?.injury;
  state.moonNow = !!spec.moon;
  for (const u of state.field) {
    u.wobbly = false;
    if (u.resting) {
      u.injured = Math.max(0, (u.injured ?? 1) - 1);
      if (!u.injured) { u.resting = false; u.hp = Math.max(u.hp, u.maxHp * g.restBackPct / 100); }
      continue;
    }
    if (u.down) {
      u.down = false;
      if (inj) { u.resting = true; u.injured = win ? inj.win : inj.lose; u.hp = 1; state.events.push({ type: 'injured', uid: u.uid, n: u.injured }); }
      else if (win) { u.resting = true; u.hp = 1; } else u.hp = u.maxHp * g.lossRevive / 100;
    } else u.hp = win ? Math.min(u.maxHp, u.hp + u.maxHp * ((state.hard ? g.hardHeal - (state.tier ? 5 : 0) : g.healPct) + (eco(state, data, 'healPlus') ?? 0)) / 100) : Math.max(u.hp, u.maxHp * g.lossRevive / 100);
    u.gauge = 0; u.stunLeft = 0;
  }
  // 대기석(후보): 다친 동물은 부상이 줄고, 다 나으면 체력 가득
  for (const u of state.bench) if (u) { if (u.injured > 0 || u.resting) { u.injured = Math.max(0, (u.injured ?? 1) - 1); if (!u.injured) { u.resting = false; u.hp = u.maxHp; } } else u.hp = u.maxHp; }
  state.enemies = []; state.eSeats = Array(SEATS).fill(null);
  // 활약상: 이긴 교전에서 가장 많이 때린 동물이 한 단계 자람(어린 → 성장기 → 성체)
  state.mvp = null;
  if (win && g.mvpGrow) {
    const top = Object.entries(state.dmgWave).map(([uid, r]) => ({ uid: +uid, dmg: r.dmg })).sort((a, b) => b.dmg - a.dmg);
    for (const t of top) {
      const u = state.field.find((x) => x.uid === t.uid);
      if (!u) continue;
      const before = u.stats.name;
      // 활약상: 어린 동물은 한 단계, 성장기는 먹이 한 그릇(어른이 되려면 두 그릇) — 깨기 시작하면 진화가 너무 쉬워서
      if (u.kind === 'base' && u.stage === 'young') { const n = grow(state, data, u); state.mvp = { uid: n.uid, from: before, to: n.stats.name, dmg: Math.round(t.dmg), grew: true }; }
      else if (u.kind === 'base' && u.stage === 'teen') {
        u.meals = (u.meals ?? 0) + 1;
        if (u.meals >= (g.adultMeals ?? 1)) { const n = grow(state, data, u); state.mvp = { uid: n.uid, from: before, to: n.stats.name, dmg: Math.round(t.dmg), grew: true }; }
        else state.mvp = { uid: u.uid, from: before, to: before, dmg: Math.round(t.dmg), grew: false, meal: true };
      }
      else state.mvp = { uid: u.uid, from: before, to: before, dmg: Math.round(t.dmg), grew: false };
      break;
    }
  }
  state.dmgLast = state.dmgWave;
  state.dmgWave = {};
  // 성장 약초: 이긴 교전 두 번마다 가장 어린 동물이 먹이 한 그릇
  if (win && eco(state, data, 'halfFeed')) {
    state.herb = (state.herb ?? 0) + 0.5;
    const kid = state.field.filter((u) => u.kind === 'base' && NEXT[u.stage] && !u.down).sort((a, b) => (a.stage === 'young' ? 0 : 1) - (b.stage === 'young' ? 0 : 1))[0];
    if (state.herb >= 1 && kid) {
      state.herb -= 1;
      const need = kid.stage === 'teen' ? (g.adultMeals ?? 1) : 1;
      kid.meals = (kid.meals ?? 0) + 1;
      if (kid.meals >= need) grow(state, data, kid);
      state.events.push({ type: 'herb', uid: kid.uid });
    }
  }
  // 지면 그 교전은 넘어감(보스는 다시)
  if (win || !spec.boss) state.enc += 1;
  state.wavesCleared = Math.round((state.enc * state.stage.waves.length) / state.plan.length);
  state.phase = 'regroup';
  // 노멀에서 지면 보상은 그대로 고름(죽음의 소용돌이 방지), 활약상 성장은 이겼을 때만
  state.offer = rollRewards(state, data);
  state.events.push({ type: 'regroup' });
}

/** Three rewards to pick one from: new animal from the deck, food (grow one), relic. */
/** 지구본 후보 3마리(같은 종 쏠림 방지). avoid = 되도록 빼고 뽑을 종(다시 돌리기 때 지금 후보) */
function pickGlobe(state, data, avoid = []) {
  let pool = state.pool.filter((id) => data.unitById[id]);
  if (pool.filter((id) => !avoid.includes(id)).length >= 3) pool = pool.filter((id) => !avoid.includes(id));
  const counts = {};
  for (const u of [...state.field, ...state.bench]) if (u?.kind === 'base') counts[u.speciesId] = (counts[u.speciesId] ?? 0) + 1;
  const left = pool.map((id) => [id, 1 / (1 + 0.6 * (counts[id] ?? 0))]);
  const picks = [];
  while (picks.length < 3 && left.length) {
    let t = state.rng() * left.reduce((a, [, v]) => a + v, 0);
    let i = left.findIndex(([, v]) => (t -= v) < 0); if (i < 0) i = 0;
    picks.push(left.splice(i, 1)[0][0]);
  }
  return picks.map((id) => ({ speciesId: id, traits: rollTraits(id, data, state.rng) }));
}

/** 지구본 다시 돌리기 값(2026-11-27 "지구본 다시 돌리기 추가금 더 내고"): 처음 globeReroll, 돌릴 때마다 +globeRerollUp */
export const globeRerollCost = (state, data) => { const g = gcfg(data); return g.globeReroll + g.globeRerollUp * (state.offer?.rerolls ?? 0); };
export function rerollGlobe(state, data) {
  const o = state.offer, g = gcfg(data);
  if (state.phase !== 'regroup' || !o?.globe) return fail('noOffer');
  if (o.taken || o.dropped === 'globe') return fail('taken');
  if ((o.rerolls ?? 0) >= g.globeRerollMax) return fail('max');
  const cost = globeRerollCost(state, data);
  if (state.gold < cost) return fail('gold');
  state.gold -= cost; o.rerolls = (o.rerolls ?? 0) + 1;
  o.globe = pickGlobe(state, data, o.globe.map((c) => c.speciesId));
  state.events.push({ type: 'globeReroll', cost });
  return { ok: true, cost };
}

export function rollRewards(state, data) {
  const pool = state.pool.filter((id) => data.unitById[id]);
  const counts = {};
  for (const u of [...state.field, ...state.bench]) if (u?.kind === 'base') counts[u.speciesId] = (counts[u.speciesId] ?? 0) + 1;
  // 같은 종 쏠림 방지: 이미 많은 종은 덜 나옴
  const w = pool.map((id) => 1 / (1 + 0.6 * (counts[id] ?? 0)));
  const picks = [];
  const left = pool.map((id, i) => [id, w[i]]);
  while (picks.length < 3 && left.length) {
    let t = state.rng() * left.reduce((s, [, v]) => s + v, 0);
    let i = left.findIndex(([, v]) => (t -= v) < 0); if (i < 0) i = 0;
    picks.push(left.splice(i, 1)[0][0]);
  }
  state.gauntletRelicBan = gcfg(data).relicBan ?? [];
  const relics = rollOffer(state, data);
  const o = {
    globe: picks.map((id) => ({ speciesId: id, traits: rollTraits(id, data, state.rng) })),
    food: true,
    relic: relics.length ? relics : null,
    taken: null, dropped: null,
  };
  // 하드: 보상 선택지 2개(하나는 막힘)
  if (state.hard) { const ks = ['globe', 'food', 'relic'].filter((k) => o[k]); o.dropped = ks[Math.floor(state.rng() * ks.length)]; }
  return o;
}

/** 금화 쓰기 ①: 회복 물약 — 출전 동물 모두 체력 +potionHeal%(정비마다 한 번) */
export function buyPotion(state, data) {
  const g = gcfg(data);
  if (state.phase !== 'regroup' || state.prelude) return fail('notRegroup');
  if (state.potionAt === state.enc) return fail('used');
  if (state.gold < g.potionCost) return fail('gold');
  state.gold -= g.potionCost; state.potionAt = state.enc;
  for (const u of state.field) if (!u.resting) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * g.potionHeal / 100);
  state.events.push({ type: 'potion' });
  return { ok: true };
}
/** 금화 쓰기 ②: 단련 — 한 마리 피해 +trainDmg%(판 내내, 한 마리에 trainMax번까지, 값은 단련할수록 오름) */
export const trainCost = (state, data, u) => Math.round(gcfg(data).trainCost * (1 + 0.5 * (u?.trained ?? 0)));
export function trainUnit(state, data, uid) {
  const g = gcfg(data);
  const u = state.field.find((x) => x.uid === uid);
  if (state.phase !== 'regroup' || !u) return fail('notFound');
  if ((u.trained ?? 0) >= g.trainMax) return fail('max');
  const cost = trainCost(state, data, u);
  if (state.gold < cost) return fail('gold');
  state.gold -= cost; u.trained = (u.trained ?? 0) + 1;
  refreshMods(state, data);
  state.events.push({ type: 'trained', uid, n: u.trained });
  return { ok: true, n: u.trained };
}

/** 보상 하나 더(금화): 기본은 하나, 금화로 더 고를 수 있음(값은 살 때마다 오름) */
export const extraCost = (state, data) => { const g = gcfg(data); return Math.round(g.extraCost * (1 + g.extraUp * (state.offer?.bought ?? 0))); };
export function buyExtraReward(state, data) {
  const o = state.offer;
  if (state.phase !== 'regroup' || !o) return fail('noOffer');
  if (!o.taken) return fail('notTaken');
  if ((o.bought ?? 0) >= gcfg(data).extraMax) return fail('max');
  const cost = extraCost(state, data);
  if (state.gold < cost) return fail('gold');
  state.gold -= cost; o.bought = (o.bought ?? 0) + 1; (o.takenKinds ??= []).push(o.taken); o.taken = null;
  state.events.push({ type: 'extraReward', cost });
  return { ok: true, cost };
}

/** Take one reward. kind 'globe' (arg = candidate index), 'food' (arg = uid), 'relic' (arg = relic id). */
export function takeReward(state, data, kind, arg) {
  const o = state.offer;
  if (state.phase !== 'regroup' || !o) return fail('noOffer');
  if (o.taken) return fail('taken');
  if (o.dropped === kind) return fail('dropped');
  if (kind === 'globe') {
    const c = o.globe?.[arg];
    if (!c) return fail('notFound');
    const slot = state.bench.indexOf(null);
    const seat = state.seats.indexOf(null);
    const fieldOk = seat >= 0 && state.field.length < (data.config.maxDeployed ?? 6);   // 전투 최대 6마리
    if (slot < 0 && !fieldOk) return fail('benchFull');
    // 지구본: 중반(교전 globeTeenAt~)부터는 성장기로 와서 바로 한몫함
    const u = newAnimal(state, data, c.speciesId, state.enc >= (gcfg(data).globeTeenAt ?? 3) ? 'teen' : 'young');
    u.traits = c.traits;
    if (slot < 0) { state.field.push(u); state.seats[seat] = u.uid; u.seat = seat; }
    else state.bench[slot] = u;
    o.taken = 'globe'; o.globe.splice(arg, 1);
    state.events.push({ type: 'reward', kind, uid: u.uid });
    return { ok: true, unit: u };
  }
  if (kind === 'food') {
    const u = [...state.field, ...state.bench].find((x) => x && x.uid === arg);
    if (!u) return fail('notFound');
    if (u.kind !== 'base' || !NEXT[u.stage]) { if (u.hp >= u.maxHp && !u.resting) return fail('maxed'); u.resting = false; u.hp = u.maxHp; o.taken = 'food'; state.events.push({ type: 'reward', kind, uid: u.uid, heal: true }); return { ok: true, unit: u, healed: true }; }
    // 어린→성장기는 한 그릇, 성장기→어른은 adultMeals 그릇(먹이만 고르면 너무 셈)
    const need = u.stage === 'teen' ? (gcfg(data).adultMeals ?? 1) : 1;
    u.meals = (u.meals ?? 0) + 1;
    o.taken = 'food';
    if (u.meals < need) { state.events.push({ type: 'reward', kind, uid: u.uid, meal: u.meals, need }); return { ok: true, unit: u, meal: u.meals, need }; }
    const grown = grow(state, data, u);
    state.events.push({ type: 'reward', kind, uid: grown.uid, grew: true });
    return { ok: true, unit: grown };
  }
  if (kind === 'relic') {
    if (!o.relic?.includes(arg)) return fail('notFound');
    state.relicOffer = o.relic;
    const r = chooseRelic(state, data, arg);
    if (!r.ok) return r;
    if (r.relic.eco?.life) state.maxLife += r.relic.eco.life;
    o.taken = 'relic'; o.relic = o.relic.filter((x) => x !== arg); if (!o.relic.length) o.relic = null;
    refreshMods(state, data);
    return { ok: true, relic: r.relic };
  }
  return fail('kind');
}

/** One stage up (young → teen → adult) in place, keeping seat and traits. */
function grow(state, data, u) {
  const inst = { kind: 'base', speciesId: u.speciesId, stage: NEXT[u.stage], parts: null, traits: inheritEvolve(u.traits, u.traits), white: !!u.white };
  const n = prep(makeUnit(state, data, inst));
  if (u.soul) { n.soul = true; n.soulKills = u.soulKills ?? 0; }
  replace(state, u, n);
  return n;
}

/** 전설 조각(2026-11-28 사용자 "전설키메라 가능한 성체가 한 전투 안에서 탄생하면 전설조각이 그림자 퍼즐로 모이고, 다 모이면 레시피 공개"):
 *  한 판 안에 전설 짝 두 종의 성체가 함께 있으면 그 전설의 조각 하나(판마다 짝마다 한 번). 판이 끝나면 저장(meta.settleRun) */
export function legendCheck(state, data) {
  const L = data.config?.genes?.legends;
  if (!L || !state.finds) return;
  const adults = new Set([...state.field, ...state.bench].filter((u) => u && u.kind === 'base' && u.stage === 'adult').map((u) => u.speciesId));
  const got = (state.finds.legendShards ??= []);
  for (const key of Object.keys(L)) {
    const [a, b] = key.split('+');
    if (adults.has(a) && adults.has(b) && !got.includes(key)) { got.push(key); state.events.push({ type: 'legendShard', key }); }
  }
}

function replace(state, old, n) {
  if (n.tactic == null && old.tactic != null) n.tactic = old.tactic;
  if (old.trained) n.trained = old.trained;
  if (n.kind === 'base' && n.speciesId === old.speciesId && old.build) { n.build = old.build; applyBuild(n); }
  const fi = state.field.indexOf(old);
  if (fi >= 0) { state.field[fi] = n; const s = state.seats.indexOf(old.uid); if (s >= 0) { state.seats[s] = n.uid; n.seat = s; } }
  const bi = state.bench.indexOf(old);
  if (bi >= 0) state.bench[bi] = n;
  if (n.kind === 'base' && n.stage === 'adult' && state.dataRef) legendCheck(state, state.dataRef);
}

/**
 * Drag in the regroup: { where: 'seat', index } or { where: 'bench', index }.
 * Onto an empty place = move. Onto another animal = merge (evolve / spirit / chimera / weak) or swap.
 */
export function moveAnimal(state, data, from, to) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  const at = (r) => (r.where === 'seat' ? state.field.find((u) => u.uid === state.seats[r.index]) ?? null : state.bench[r.index] ?? null);
  const a = at(from), b = at(to);
  if (!a) return fail('empty');
  if (from.where === to.where && from.index === to.index) return fail('same');
  if (!b) {
    if (to.where === 'seat') {
      // 전투에는 최대 6마리(config.maxDeployed, 2026-11-27 사용자 "전투에는 6마리가 최대야")
      if (from.where !== 'seat' && state.field.length >= (data.config.maxDeployed ?? 6)) return fail('fieldFull');
      if (from.where === 'seat') { state.seats[from.index] = null; }
      else { state.bench[from.index] = null; state.field.push(a); }
      state.seats[to.index] = a.uid; a.seat = to.index;
    } else {
      if (from.where === 'seat') { if (state.field.length <= 1) return fail('last'); state.seats[from.index] = null; state.field = state.field.filter((u) => u !== a); a.seat = null; }
      else state.bench[from.index] = null;
      state.bench[to.index] = a;
    }
    refreshMods(state, data);
    state.events.push({ type: 'moved', uid: a.uid });
    return { ok: true, kind: 'move' };
  }
  const kind = mergeKind(a, b, data);
  if (kind === 'swap' || a.resting || b.resting) {
    const put = (r, u) => { if (r.where === 'seat') { state.seats[r.index] = u.uid; u.seat = r.index; if (!state.field.includes(u)) state.field.push(u); } else { state.bench[r.index] = u; state.field = state.field.filter((x) => x !== u); u.seat = null; } };
    put(from, b); put(to, a);
    refreshMods(state, data);
    state.events.push({ type: 'moved', uid: a.uid });
    return { ok: true, kind: 'swap' };
  }
  // 합성: battle.merge를 그대로 씀(자리 정리 없이)
  const ref = (r, u) => (r.where === 'seat' ? { where: 'field', uid: u.uid } : { where: 'bench', index: r.index });
  const seatOfB = to.where === 'seat' ? to.index : null, seatOfA = from.where === 'seat' ? from.index : null;
  const flat = { ...data, config: { ...data.config, muster: null } };
  const r = mergeAny(state, flat, ref(from, a), ref(to, b));
  if (!r.ok) return r;
  if (seatOfA != null) state.seats[seatOfA] = null;
  if (seatOfB != null) { state.seats[seatOfB] = r.unit.uid; r.unit.seat = seatOfB; }
  prep(r.unit);
  r.unit.hp = r.unit.maxHp;
  refreshMods(state, data);
  return { ok: true, kind: r.kind, unit: r.unit };
}

// ---------- 빈 라인: 뚫린 길과 매복 (2026-11-27) ----------
/** 그 편에서 아무도 없는(살아 있는 동물이 없는) 라인들 — 교전 시작 자리 기준 */
export function emptyLanes(state, side) {
  const list = side === 'u' ? state.field.filter((u) => u && !u.down && !u.resting && u.seat != null) : state.enemies.filter((e) => e.hp > 0 && e.seat != null);
  const have = new Set(list.map((x) => laneOf(x.seat)));
  return new Set([0, 1, 2].filter((l) => !have.has(l)));
}
/** 매복: 빈 라인을 지나는 상대를 옆 라인(1·2열) 동물들이 한 대씩 침 */
function flankHit(state, data, side, x, lane) {
  const lg = gcfg(data).lineup ?? {};
  if (!lg.flank) return;
  const near = side === 'u' ? fighters(state).filter((u) => laneDist(u.seat, lane) === 1 && colOf(u.seat) <= 1) : state.enemies.filter((e) => aliveE(e) && laneDist(e.seat, lane) === 1 && colOf(e.seat) <= 1);
  if (!near.length) return;
  let tot = 0;
  for (let i = 0; i < near.length && i < 2; i++) tot += side === 'u' ? hurtEnemy(state, data, x, x.maxHp * lg.flank / 100, near[i], true, { kind: 'hit', cause: 'flank' }) : (hurtUnit(state, data, x, x.maxHp * lg.flank / 100, near[i], { cause: 'flank' }), state.lastLost);
  state.events.push({ type: 'flank', side, by: near.slice(0, 2).map((n) => (side === 'u' ? n.uid : n.eid)), target: side === 'u' ? x.eid : x.uid, dmg: Math.round(tot) });
  dstat(state, side === 'u' ? 'flankU' : 'flankE');
}

// ---------- 진형 · 보스 필살 · 지형 (2026-11-27 기획창) ----------
/** 스테이지 단계: 1~3 → 1, 4~6 → 2, 7~9 → 3, 10~12 → 4 */
export function stageTier(state) { const n = +(String(state.stage?.id ?? '').match(/\d+/)?.[0] ?? 1); return Math.max(1, Math.min(4, Math.ceil(n / 3))); }
const cbForm = (state) => state.dataRef?.config?.gauntlet?.formation ?? null;
/** 진형 이름: 브루저 3+ = wall(철벽), 돌격 3+ = rush(돌격), 원거리·응원 3+ = camp(진지), 나머지 mix(균형) */
export function formOf(styles) {
  const n = (k) => styles.filter((x) => x === k).length;
  if (n('bruiser') >= 3) return 'wall';
  if (n('skirm') >= 3) return 'rush';
  if (n('ranged') + n('support') >= 3) return 'camp';
  return 'mix';
}
/** 다음 적 무리의 진형(정비 미리보기용) */
export function formOfIds(ids, data) { const g = gcfg(data); return formOf(ids.map((id) => roleOfEnemy(g, id, data.enemyById[id]))); }
/** 지금 우리 진형(정비 화면) */
export function formOfField(state) { return formOf(state.seats.map((uid) => state.field.find((u) => u.uid === uid)).filter((u) => u && !u.resting).map((u) => styleOf(u))); }
function bossSlam(state, data, g) {
  const w = state.bossWarn, bs = g.bossSkill; state.bossWarn = null;
  const e = findE(state, w.eid);
  if (!e || !aliveE(e)) return;
  const hits = [];
  for (const u of fighters(state).filter((x) => laneOf(x.seat) === w.lane)) {
    const k = (bs.dmg + bs.dmgPerTier * stageTier(state)) * (styleOf(u) === 'bruiser' ? bs.bruiser : 1) * ((u.shieldT ?? 0) > state.time ? bs.shield : 1);
    const shK = (u.shieldT ?? 0) > state.time ? bs.shield : 1;
    hurtUnit(state, data, u, e.attack * k, e, { big: true, cause: w.name, fullAmount: shK < 1 ? e.attack * k / shK : undefined }); const a = state.lastLost;
    if (aliveU(u)) u.stunLeft = Math.max(u.stunLeft ?? 0, bs.stun);
    hits.push({ uid: u.uid, dmg: Math.round(a), shield: (u.shieldT ?? 0) > state.time });
  }
  raidSlamFx(state, data, e, hits);
  state.events.push({ type: 'bossSlam', eid: e.eid, lane: w.lane, name: w.name, hits }); say(state, `💥 ${w.name}!`); dstat(state, 'bossSlam');
}
/** 지형 영향: every초마다 양쪽 아무나 count마리. 같은 속성은 안 다침, 보스는 절반, 두더지 등불이면 절반 */
function hazardTick(state, data, g, d) {
  const hz = g.hazards?.[state.stage?.id];
  if (!hz || !hz.every) return;
  state.hazardT -= d;
  if (state.hazardT > 0) return;
  state.hazardT = hz.every * (0.75 + state.rng() * 0.5);
  const pool = [...fighters(state).map((u) => ({ side: 'u', x: u })), ...state.enemies.filter(aliveE).map((e) => ({ side: 'e', x: e }))].filter((t) => !hz.front || (t.side === 'u' ? isFront(t.x.seat) : colOf(t.x.seat) === 0));
  const hits = [], half = eco(state, data, 'hazardHalf') ? 0.5 : 1;
  for (let i = 0; i < hz.count && pool.length; i++) {
    const t = pool.splice(Math.floor(state.rng() * pool.length), 1)[0], el = t.side === 'u' ? t.x.stats.element : t.x.element;
    if (hz.immune && el === hz.immune) { hits.push({ side: t.side, id: t.side === 'u' ? t.x.uid : t.x.eid, dmg: 0, immune: true }); continue; }
    const amt = t.x.maxHp * (hz.dmg ?? 0) / 100 * (t.x.boss ? 0.5 : 1) * (t.side === 'u' ? half : 1);
    const a = amt > 0 ? (t.side === 'u' ? (hurtUnit(state, data, t.x, amt, null, { kind: 'env', cause: hz.name }), state.lastLost) : hurtEnemy(state, data, t.x, amt, null, true, { kind: 'env', cause: hz.name })) : 0;
    if (hz.stun && !(t.x.boss)) t.x.stunLeft = Math.max(t.x.stunLeft ?? 0, hz.stun * (t.side === 'u' ? half : 1));
    hits.push({ side: t.side, id: t.side === 'u' ? t.x.uid : t.x.eid, dmg: Math.round(a) });
  }
  state.events.push({ type: 'hazard', icon: hz.icon, name: hz.name, line: hz.line, hits, immune: hz.immune ?? null }); dstat(state, 'hazard');
}

// ---------- 역전 · 부상 · 치료 (2026-11-27) ----------
const cbCfg = (state) => state.dataRef?.config?.gauntlet?.comeback ?? null;
const sideFrac = (list) => { let h = 0, m = 0; for (const x of list) { if (!x) continue; m += x.maxHp; h += Math.max(0, x.hp); } return m ? h / m : 0; };
/** 동물 자신의 역전 특성이 지금 켜져 있으면 { ...설정, dmg(쓰러진 수 곱) }. 키메라는 두 부모 중 먼저 맞는 것 */
function ownClutch(state, u) {
  const cb = cbCfg(state);
  if (!cb?.clutch || !u || u.down || u.resting) return null;
  const ids = u.kind === 'chimera' ? u.parts ?? [] : u.kind === 'base' ? [u.speciesId] : [];
  for (const id of ids) {
    const c = cb.clutch[id];
    if (!c || c.team || c.heal) continue;
    let on = false, k = 1;
    if (c.when === 'lowHp') on = u.hp / u.maxHp < c.at;
    else if (c.when === 'allyDown') { const downs = state.field.filter((x) => x && x.down).length; on = downs > 0; k = Math.min(2, downs); }
    else if (c.when === 'outnumbered') on = state.enemies.filter((e) => e.hp > 0).length > state.field.filter((x) => x && !x.down && !x.resting).length;
    if (on) return { ...c, dmg: (c.dmg ?? 0) * k, id };
  }
  return null;
}
/** 지금 켜진 역전 효과(자기 특성 + 베짱이 '마지막 노래' 같은 팀 효과) */
export function clutchOf(state, u) {
  if (!u || u.down || u.resting) return null;
  const own = ownClutch(state, u), team = state.clutchTeam ?? 0;
  if (!own && !team) return null;
  return { ...(own ?? {}), dmg: (own?.dmg ?? 0) + team };
}
/** 우리 동물이 때릴 때 곱: 투지 · 역전 찬스 · 역전 특성 · 흐물흐물 */
function upMult(state, u) {
  const c = clutchOf(state, u);
  const fa = state.form?.adv > 0 ? 1 + (cbForm(state)?.adv ?? 0) / 100 : 1, ro = state.routed?.u ? 1 - (state.dataRef?.config?.gauntlet?.rout?.teamDmg ?? 0) / 100 : 1;
  return fa * ro * (1 + (state.grit?.u ?? 0) / 100) * ((state.rallyBuff ?? 0) > state.time ? 1 + (cbCfg(state)?.rally?.dmg ?? 0) / 100 : 1) * (1 + (c?.dmg ?? 0) / 100) * (u.wobbly ? state.dataRef?.config?.genes?.miracle?.wobbleDmg ?? 0.5 : 1);
}
/** 매 틱: 투지(체력 차가 크면 지는 쪽 피해 +) · 역전 찬스(크게 밀리면 한 번 버튼) · 역전 특성 켜짐 알림 */
function comebackTick(state, data, g) {
  const cb = g.comeback;
  if (!cb) return;
  const us = state.field.filter((u) => u && !u.resting), uf = sideFrac(us), ef = sideFrac(state.enemies);
  const gr = cb.grit, gap = (a, b) => Math.max(0, Math.min(1, (a - b - gr.gap) / gr.span));
  const gu = Math.round(gr.uMax * gap(ef, uf)), ge = Math.round(gr.eMax * gap(uf, ef));
  if (gu > 0 && !(state.grit.u > 0)) { state.events.push({ type: 'grit', side: 'u' }); say(state, '🔥 우리 편 투지!'); dstat(state, 'gritU'); }
  if (ge > 0 && !(state.grit.e > 0)) { state.events.push({ type: 'grit', side: 'e' }); say(state, '🔥 적도 이를 악묾!'); }
  state.grit = { u: gu, e: ge };
  // 적 증원(긴장감): 우리가 크게 앞서면 한 번, 문에서 적 하나가 더 나옴(보스 교전 제외) — 앞서도 끝까지 안심 못 함
  const rf = cb.reinforce, spec = state.plan[state.enc];
  if (rf && !state.reinforced && !spec?.boss && !eco(state, data, 'noReinforce') && state.encTime > rf.after && uf - ef > rf.gap && ef > 0) {
    state.reinforced = true;
    if (state.rng() < rf.chance && state.eSeats.includes(null)) {
      const ids = spec.ids.filter((id) => !data.enemyById[id]?.boss);
      const e = addEnemy(state, data, ids[Math.floor(state.rng() * ids.length)] ?? spec.ids[0], spec.wave, null);
      if (e) { e.hp = e.maxHp = Math.round(e.maxHp * rf.hp); e.gauge = 0; state.events.push({ type: 'reinforce', eid: e.eid }); say(state, '👿 적 증원!'); dstat(state, 'reinforce'); }
    }
  }
  // 적의 역전(대장의 함성): 적이 크게 밀리면 한 번 — 적 회복 + 몇 초 세짐. 이기고 있어도 끝까지 긴장
  const rc0 = cb.rally;
  if (rc0?.eHeal && !state.eRallyUsed && state.encTime > rc0.after && ef < rc0.below && uf - ef > rc0.gap) {
    state.eRallyUsed = true; state.eRallyBuff = state.time + rc0.dur;
    for (const e of state.enemies) if (aliveE(e)) healTo(state, e, e.maxHp * rc0.eHeal / 100, null, 'eRally');
    state.events.push({ type: 'eRally' }); say(state, '👿 적 대장의 함성!'); dstat(state, 'eRally');
  }
  // 역전 찬스: 한 교전에 한 번, 크게 밀릴 때 버튼(누르면 useRally)
  const rc = cb.rally;
  if (!state.rallyUsed && !state.rally && state.encTime > rc.after && uf < rc.below && ef - uf > rc.gap) { state.rally = { until: state.time + rc.window }; state.events.push({ type: 'rallyReady' }); }
  if (state.rally && state.time > state.rally.until) { state.rally = null; state.rallyUsed = true; state.events.push({ type: 'rallyGone' }); }
  // 역전의 깃발: 한 번 더(쓰고 나서 다시 크게 밀리면)
  if (state.rallyUsed && !state.rally && (state.rallyCount ?? 0) < 1 + (eco(state, data, 'rallyPlus') ?? 0) && (state.rallyCount ?? 0) > 0 && state.time > (state.rallyBuff ?? 0) + 3 && uf < rc.below && ef - uf > rc.gap) { state.rallyUsed = false; }
  // 마지막 노래(베짱이): 동료가 쓰러지면 모두 피해 +
  const downs = state.field.filter((x) => x && x.down).length;
  state.clutchTeam = downs > 0 ? state.field.filter((x) => x && !x.down && !x.resting && (x.kind === 'chimera' ? x.parts ?? [] : [x.speciesId]).some((id) => cb.clutch?.[id]?.team)).reduce((a, x) => a + Math.max(...(x.kind === 'chimera' ? x.parts ?? [] : [x.speciesId]).map((id) => cb.clutch?.[id]?.team ? cb.clutch[id].dmg : 0)), 0) : 0;
  for (const u of us) {
    if (u.down) continue;
    const ids = u.kind === 'chimera' ? u.parts ?? [] : u.kind === 'base' ? [u.speciesId] : [];
    const c = ids.map((id) => cb.clutch?.[id]).find(Boolean);
    if (!c) continue;
    const on = c.team ? downs > 0 : !!ownClutch(state, u);
    // 새벽 함성(수탉): 동료가 쓰러지면 모두 회복(교전마다 한 번)
    if (c.heal && downs > 0 && !state.roosterCalled) { state.roosterCalled = true; for (const x of us) if (!x.down) healTo(state, x, x.maxHp * c.heal / 100, u, c.name); state.events.push({ type: 'clutch', uid: u.uid, name: c.name, desc: c.desc, heal: true }); say(state, `${u.stats.name} ${c.name}!`); continue; }
    if (on && !u.clutchOn) { u.clutchOn = true; state.events.push({ type: 'clutch', uid: u.uid, name: c.name, desc: c.desc }); say(state, `🔥 ${u.stats.name} ${c.name}!`); dstat(state, 'clutch'); }
  }
}
/** 역전 찬스 쓰기(버튼): 모두 조금 회복 · 적 잠깐 멈춤 · 몇 초 피해 + */
export function useRally(state, data) {
  const rc = gcfg(data).comeback?.rally;
  if (!rc || !state.rally || state.phase !== 'fight') return fail('notReady');
  state.rally = null; state.rallyUsed = true; state.rallyCount = (state.rallyCount ?? 0) + 1; state.rallyBuff = state.time + rc.dur;
  for (const u of fighters(state)) healTo(state, u, u.maxHp * rc.heal / 100, null, 'rally');
  for (const e of state.enemies) if (aliveE(e)) e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? rc.stun * 0.5 : rc.stun);
  state.events.push({ type: 'rally' }); say(state, '⚡ 역전의 함성!'); dstat(state, 'rally');
  return { ok: true };
}
const STAGE_KEY = (u) => (u.kind === 'chimera' ? 'chimera' : u.kind === 'weak' ? 'weak' : u.stage);
/** 치료비(부상): 단계마다 다르고, 치료할수록 조금씩 오름 */
export function treatCost(state, data, u) {
  const inj = gcfg(data).comeback?.injury;
  if (!inj) return reviveCost(state, data);
  return Math.max(1, Math.round((inj.treat[STAGE_KEY(u)] ?? 10) * (1 + inj.treatUp * state.revives) * (state.tier ? 2 : 1) * (1 - Math.min(60, eco(state, data, 'treatCut') ?? 0) / 100)));
}
/** 치료(체력): 정비 때 금화로 체력을 채움. 다친 만큼 값(단계마다 가득 채우는 값 × 잃은 비율) */
export function healCost(state, data, list) {
  const inj = gcfg(data).comeback?.injury;
  if (!inj) return 0;
  return list.filter((u) => u && !u.resting && u.hp < u.maxHp).reduce((a, u) => a + Math.ceil((inj.heal[STAGE_KEY(u)] ?? 5) * (1 - u.hp / u.maxHp) * (state.tier ? 2 : 1) * (1 - Math.min(60, eco(state, data, 'treatCut') ?? 0) / 100)), 0);
}
export function healUnits(state, data, uid = null) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  const list = state.field.filter((u) => u && !u.resting && u.hp < u.maxHp && (uid == null || u.uid === uid));
  if (!list.length) return fail('full');
  const cost = healCost(state, data, list);
  if (state.gold < cost) return fail('gold');
  state.gold -= cost;
  for (const u of list) u.hp = u.maxHp;
  state.events.push({ type: 'potion', cost });
  return { ok: true, cost, n: list.length };
}
/** 봇 정비: 다친 출전 동물은 건강한 후보와 바꾸고, 금화가 있으면 큰 동물부터 치료, 체력이 많이 빠졌으면 치료 */
export function botRegroup(state, data) {
  for (let i = 0; i < SEATS; i++) {
    const u = state.field.find((x) => x.uid === state.seats[i]);
    if (!u?.resting) continue;
    const big = u.kind === 'chimera' || u.stage === 'spirit' || u.stage === 'adult';
    if (big && state.gold >= treatCost(state, data, u) + 10) { reviveUnit(state, data, u.uid); continue; }
    const bi = state.bench.findIndex((b) => b && !b.resting);
    if (bi >= 0) moveAnimal(state, data, { where: 'bench', index: bi }, { where: 'seat', index: i });
    else if (state.gold >= treatCost(state, data, u)) reviveUnit(state, data, u.uid);
  }
  const live = state.field.filter((u) => !u.resting);
  const frac = live.reduce((a, u) => a + u.hp / u.maxHp, 0) / Math.max(1, live.length);
  if (frac < 0.7 && state.gold >= healCost(state, data, live)) healUnits(state, data);
}

/** Is a merge of a onto b possible, and what would it be? (for the drag preview) */
export function mergeHint(state, data, from, to) {
  const at = (r) => (r.where === 'seat' ? state.field.find((u) => u.uid === state.seats[r.index]) ?? null : state.bench[r.index] ?? null);
  const a = at(from), b = at(to);
  if (!a || !b || a === b) return null;
  return mergeKind(a, b, data);
}
/** 각성 때 아직 안 뒤집힌 약점 하나를 뒤집음. { id, from, to } 또는 null */
export function flipOneWeak(state, data, u) {
  const i = (u.traits ?? []).findIndex((t) => t.kind === 'weak' && !t.flipped);
  if (i < 0) return null;
  const t = u.traits[i], d = data.traits?.[t.sp]?.weak?.find((x) => x.id === t.id);
  if (!d?.flip) return null;
  u.traits = u.traits.map((x, j) => (j === i ? { ...x, flipped: true } : x));
  (state.finds.flips ??= []).includes(t.id) || state.finds.flips.push(t.id);
  refreshMods(state, data);
  return { id: t.id, from: d.name, to: d.flip.name, desc: d.flip.desc };
}
/** 끌기 미리보기용: { kind, chance(%), cross(강이 다름) } */
export function mergeOddsG(state, data, from, to) {
  const at = (r) => (r.where === 'seat' ? state.field.find((u) => u.uid === state.seats[r.index]) ?? null : state.bench[r.index] ?? null);
  const a = at(from), b = at(to);
  if (!a || !b || a === b) return null;
  if (a.resting || b.resting) return { kind: 'swap', chance: 100 };
  return mergeOdds(a, b, data, geneCtx(state, data));
}

/** 부활: 정비 때 금화를 내고 쉬는/쓰러진 동물을 바로 일으킴(체력 50%). 값은 부활할수록 오름. */
export const reviveCost = (state, data) => { const g = gcfg(data); return Math.round(g.reviveCost * (1 + g.reviveUp * state.revives) * (state.tier ? 2 : 1)); };
export function reviveUnit(state, data, uid) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  const u = [...state.field, ...state.bench].find((x) => x && x.uid === uid);
  if (!u || !(u.resting || u.down)) return fail('notDown');
  const cost = state.feathers > 0 ? 0 : treatCost(state, data, u);
  if (state.gold < cost) return fail('gold');
  if (state.feathers > 0) state.feathers -= 1; else { state.gold -= cost; state.revives += 1; }
  u.resting = false; u.down = false; u.injured = 0; setHp(state, u, Math.max(u.hp, u.maxHp * 0.6), 'revive', null, 'revive');
  state.events.push({ type: 'revive', uid });
  return { ok: true, cost };
}
/** 놓아주기: 동물을 덱에서 떠나보내고 금화 조금(마지막 한 마리는 못 놓음). */
export function releaseUnit(state, data, uid) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  const bi = state.bench.findIndex((x) => x && x.uid === uid);
  const si = state.seats.indexOf(uid);
  if (bi < 0 && si < 0) return fail('notFound');
  if (si >= 0 && state.field.length <= 1) return fail('last');
  const who = bi >= 0 ? state.bench[bi] : state.field.find((u) => u.uid === uid);
  if (bi >= 0) state.bench[bi] = null;
  else { state.seats[si] = null; state.field = state.field.filter((u) => u.uid !== uid); }
  // 흑역사(약체 키메라)는 구경거리라 비싸게 팔림
  const price = who?.kind === 'weak' ? gcfg(data).sellWeak : gcfg(data).releaseGold;
  state.gold += price;
  if (who?.kind === 'weak') { state.events.push({ type: 'sold', uid, price }); }
  refreshMods(state, data);
  state.events.push({ type: 'release', uid });
  return { ok: true, price };
}

/** Leave the regroup for the next encounter. */
export function nextEncounter(state, data) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  if (!fighters(state).length && !unitsIn(state).some(Boolean)) return fail('empty');
  if (!unitsIn(state).some(Boolean)) return fail('empty');
  state.offer = null; state.relicOffer = null; state.prelude = false;
  startEncounter(state, data);
  return { ok: true };
}

/** What the next encounter brings (for the preview). */
export function nextPreview(state, data) {
  const spec = state.plan[state.enc];
  if (!spec) return null;
  const n = {};
  for (const id of spec.ids) n[id] = (n[id] ?? 0) + 1;
  // 역할 수(🛡 벽·⚔ 돌파꾼·🏹 원거리·✚ 응원)와 짐작(hint): 돌파꾼이 많으면 'dive', 벽이 많으면 'wall'. 실제 성향은 숨김(가끔 엉뚱함)
  const g = gcfg(data), roles = { bruiser: 0, skirm: 0, ranged: 0, support: 0 };
  let divers = 0;
  for (const id of spec.ids) { const st = roleOfEnemy(g, id, data.enemyById[id]); roles[st] = (roles[st] ?? 0) + 1; if (g.enemyDivers.includes(id) || st === 'skirm') divers++; }
  if (state.tier) return { boss: spec.boss, roles: null, hint: null, hidden: true, list: Object.entries(n).map(([id, k]) => ({ id, n: k, name: data.enemyById[id]?.name ?? id, boss: !!data.enemyById[id]?.boss })) };
  const hint = (state.tLevel ?? 2) === 0 && !state.hard ? null : divers >= 2 ? 'dive' : roles.bruiser >= 2 && divers <= 1 ? 'wall' : 'mixed';
  return { boss: spec.boss, roles, hint, list: Object.entries(n).map(([id, k]) => ({ id, n: k, name: data.enemyById[id]?.name ?? id, flying: !!data.enemyById[id]?.flying, boss: !!data.enemyById[id]?.boss })) };
}

// ---------- player magic (교전 중 누름) ----------
export function spellBlockG(state, data, id) {
  const def = spellDef(data, id);
  if (!def || !state.spells.includes(id)) return 'locked';
  if (state.phase !== 'fight') return 'noFight';
  if (state.spellCd > 0) return 'cooldown';
  if (state.mana < spellCost(state, data, def)) return 'mana';
  return null;
}

export function castG(state, data, id) {
  const why = spellBlockG(state, data, id);
  if (why) return fail(why);
  const def = spellDef(data, id), P = 1 + (eco(state, data, 'spellPower') ?? 0) / 100;
  const es = state.enemies.filter(aliveE), us = fighters(state);
  const pct = (e, p, bp) => e.maxHp * Math.min(90, (e.boss ? bp : p) * P) / 100;
  const hit = [];
  switch (def.effect) {
    case 'meteor': { const row = es.filter((e) => isFront(e.seat)); for (const e of (row.length ? row : es)) hit.push([e, pct(e, def.pct, def.bossPct)]); break; }
    case 'chain': for (const e of es.slice(0, def.count)) hit.push([e, pct(e, def.pct, def.bossPct)]); break;
    case 'wall': for (const e of es.filter((x) => isFront(x.seat))) e.stunLeft = Math.max(e.stunLeft ?? 0, (e.boss ? def.bossStun : def.hold * 0.6) * P); break;
    case 'guard':
      for (const u of unitsIn(state)) if (u) { if (u.down) { u.down = false; setHp(state, u, 0, 'revive', null, def.name); } healTo(state, u, u.maxHp * def.heal * P / 100, null, def.name, 'heal'); }
      state.allyBuffs.push({ stat: 'taken', percent: -def.shield, left: def.dur * P }); noteStatus(state, 'buff', null, unitsIn(state), 'shield', def.name, def.dur * P); break;
    case 'drum': state.allyBuffs.push({ stat: 'interval', percent: -def.haste, left: def.dur * P }, { stat: 'dmg', percent: def.dmg, left: def.dur * P }); noteStatus(state, 'buff', null, fighters(state), 'atk', def.name, def.dur * P); break;
    case 'hourglass': for (const e of es) { e.slowPct = def.slow; e.slowLeft = def.dur * P; } noteStatus(state, 'debuff', null, es, 'slow', def.name, def.dur * P); break;
    case 'gust': for (const e of es) e.gauge = 0; break;
    case 'snare': state.snareT = state.time + def.dur * P; break;
    default: return fail('locked');
  }
  const hits = hit.map(([e, a]) => ({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, a, null, false, { big: true, cause: def.name, kind: 'magic' })) }));
  state.mana -= spellCost(state, data, def);
  state.spellCd = data.config.spells.globalCd;
  state.spellCasts = (state.spellCasts ?? 0) + 1;
  state.events.push({ type: 'spell', id, hits, name: def.name, icon: def.icon });
  say(state, `마법 · ${def.name}`);
  void us;
  return { ok: true };
}

/** Stars for a finished run: clear / life kept (hard: always) / few animals knocked out. */
export function gauntletGoals(state, data) {
  const g = gcfg(data), sc = data.config.stars ?? { life: 60 };
  const clear = state.result === 'clear';
  return { clear, life: clear && (state.hard || state.life >= state.maxLife * sc.life / 100), time: clear && state.downs <= g.lowStars, lifeNeed: sc.life, downs: state.downs, downNeed: g.lowStars, gauntlet: true, hard: state.hard };
}

/** Run the whole stage with a simple bot (tests and balance). */
export function autoRun(state, data, pick = null) {
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 200) {
    while (state.phase === 'fight') {
      tickGauntlet(state, data, 0.5);
      state.events.length = 0;
      if (state.rally) useRally(state, data);   // 사람은 버튼을 누름
      if (state.bossWarn) for (const u of fighters(state).filter((x) => laneOf(x.seat) === state.bossWarn.lane)) tapShield(state, u.uid);   // 예고된 라인은 눌러서 막음
      for (const m of state.raidMarks ?? []) tapShield(state, m.uid);   // 레이드 표식도 누름
      { const c = state.enemies.find((e) => aliveE(e) && e.raid?.cast?.need != null); if (c && c.raid.cast.botTap == null) { c.raid.cast.botTap = 1; raidTap(state, data); } }   // 보라 막대는 한 번만 톡
      if (state.mana >= 40 && state.spells.length) castG(state, data, state.spells[0]);
    }
    if (state.phase !== 'regroup') break;
    if (state.offer && !state.offer.taken) (pick ?? botPick)(state, data);
    botRegroup(state, data);
    nextEncounter(state, data);
  }
  return state;
}

const RANK = { young: 0, teen: 1, adult: 2, spirit: 3 };
/** 봇: 대기석 동물을 합성(진화·영물·키메라) → 대기석끼리 진화 → 더 큰 동물이면 가장 어린 출전 동물과 바꿈 */
function botPlace(state, data, bi) {
  // 키메라 도전은 성공률 50% 이상일 때만(봇)
  const good = (to) => { const o = mergeOddsG(state, data, { where: 'bench', index: bi }, to); return !!o && (o.kind === 'evolve' || o.kind === 'spirit' || ((o.kind === 'chimera' || o.kind === 'reslime') && o.chance >= 50)); };
  for (let i = 0; i < SEATS; i++) if (state.seats[i] != null && good({ where: 'seat', index: i })) return moveAnimal(state, data, { where: 'bench', index: bi }, { where: 'seat', index: i });
  for (let j = 0; j < state.bench.length; j++) if (j !== bi && state.bench[j] && mergeHint(state, data, { where: 'bench', index: bi }, { where: 'bench', index: j }) === 'evolve') return moveAnimal(state, data, { where: 'bench', index: bi }, { where: 'bench', index: j });
  const u = state.bench[bi];
  const weak = state.field.filter((f) => f.kind === 'base' && !f.soul).sort((a, b) => RANK[a.stage] - RANK[b.stage])[0];
  if (u && weak && RANK[u.stage] > RANK[weak.stage]) return moveAnimal(state, data, { where: 'bench', index: bi }, { where: 'seat', index: weak.seat });
  return null;
}

export function botPick(state, data, prefer) {
  const o = state.offer;
  const young = [...state.field].filter((u) => u.kind === 'base' && NEXT[u.stage]).sort((a, b) => (b.soul ? 1 : 0) - (a.soul ? 1 : 0));
  const r = state.rng();
  const order = prefer ? [prefer, ...['globe', 'food', 'relic'].filter((k) => k !== prefer)] : r < 0.45 ? ['food', 'relic', 'globe'] : r < 0.75 ? ['relic', 'food', 'globe'] : ['globe', 'food', 'relic'];
  for (const k of order) {
    if (o.dropped === k) continue;
    if (k === 'food' && young.length && takeReward(state, data, 'food', young[0].uid).ok) return;
    if (k === 'relic' && o.relic && takeReward(state, data, 'relic', o.relic[0]).ok) return;
    if (k === 'globe') {
      const got = takeReward(state, data, 'globe', 0);
      if (got.ok) {
        const u = got.unit, bi = state.bench.indexOf(u);
        if (bi >= 0) botPlace(state, data, bi);
        return;
      }
    }
  }
}

// 보스 레이드(raid.js)가 쓰는 안쪽 함수들
setRaidApi({ fighters, hurtUnit, hurtEnemy, addEnemy, gcfg, isBack, lowest, laneOf, colOf, styleOf, uInterval, tacticOf });

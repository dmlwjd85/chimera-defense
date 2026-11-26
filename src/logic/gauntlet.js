// 연전(2026-11-26): 지도 이동 없이 내가 짠 덱이 교전을 연달아 치름. 교전은 실시간 자동(행동 게이지가 차면 공격),
// 이기면 정비(체력 일부 회복 · 보상 3개 중 1개 · 자리 바꾸기 · 합성), 마지막은 보스.
// 자리: 아군·적 모두 앞줄 3칸(0~2) + 뒷줄 3칸(3~5). 다키스트 던전처럼 앞줄이 먼저 맞고, 근접은 앞줄에서 제 힘을 냄.
// 난이도: 노멀 = 생명이 있어 지면 생명 -1 / 하드 = 한 번 지면 끝(보상 더 큼).
import { makeRng } from './rng.js';
import { makeUnit, merge as mergeAny } from './battle.js';
import { makeEnemy } from './waves.js';
import { computeMods, effDamage, effInterval, emptyMods } from './mods.js';
import { hitDamage } from './combat.js';
import { movesOf, a2Of, chargeUlt, ultName } from './moves.js';
import { rollTraits, inheritEvolve } from './traits.js';
import { eco, rollOffer, chooseRelic } from './relics.js';
import { spellDef, spellCost } from './spells.js';
import { mergeKind } from './merge.js';

const FRONT = [0, 1, 2], BACK = [3, 4, 5];
const isFront = (seat) => seat < 3;
const NEXT = { young: 'teen', teen: 'adult' };
const fail = (reason) => ({ ok: false, reason });

/** Settings with defaults (config.gauntlet). */
export function gcfg(data) {
  return {
    encounters: 8, squadMin: 3, squadMax: 6, timeLimit: 60, healPct: 30, restBackPct: 50, life: 5,
    stagger: 0.15, enemyHp: 20, enemyAtk: 1.5, bossHp: 4, bossAtk: 1, growth: 0.15, atkGrowth: 0.12, squash: 0.55, summonCap: 2, bossBase: 6000, bossTune: { boss_bone: { hp: 0.45, atk: 0.55 } }, minionHp: 0.5, summonerHp: 0.7, bossSquad: 3, healMult: 0.3, hardHp: 1, lossRevive: 80, mvpGrow: true, stageHpPow: 0.5, stageAtkPow: 0.4, zeroAttack: 4, zeroInterval: 1.3,
    backMelee: 0.5, frontRanged: 0.75, taunt: 2, startStage: 'young', manaRegen: 0.6,
    hardEssence: 1.5, hardShards: 2, lowStars: 3,
    clashRate: 0.5, clashNoise: 1, clashLean: 0.6, clashBoss: 0.6, clashBonus: 1.5, clashStun: 1, clashEnemy: 1, assistPush: 0.05, cheerPush: 0.12, cheerHeal: 3, dodge: 0.25, ...(data.config.gauntlet ?? {}),
  };
}

const aliveU = (u) => u && !u.down && !u.resting;
const aliveE = (e) => e && e.hp > 0;
export const unitsIn = (state) => state.seats.map((uid) => state.field.find((u) => u.uid === uid) ?? null);
export const fighters = (state) => unitsIn(state).filter(aliveU);
export const enemiesIn = (state) => state.eSeats.map((eid) => state.enemies.find((e) => e.eid === eid) ?? null);
/** 싸움 모양: 브루저 = 힘겨루기, 근접 딜러·기술 = 치고 빠지기, 원거리·응원 = 뒤에서 거들기 */
export const styleOf = (u) => (u.stats.range > 1 ? 'ranged' : u.stats.role === 'bruiser' ? 'bruiser' : u.stats.role === 'buffer' ? 'support' : u.stats.role === 'weak' ? 'support' : 'skirm');
const findU = (state, uid) => state.field.find((u) => u.uid === uid);
const findE = (state, eid) => state.enemies.find((e) => e.eid === eid);
export const clashOfU = (state, uid) => (state.clashes ?? []).find((c) => c.uid === uid) ?? null;
export const clashOfE = (state, eid) => (state.clashes ?? []).find((c) => c.eid === eid) ?? null;
const isRangedEnemy = (e) => e.flying || !!e.heal || e.id === 'wisp' || e.id === 'boss_lich' || e.id === 'skeleton';

/** Which stage waves become the encounters: spread evenly, the last one is the boss wave. */
export function planEncounters(stage, data, rng) {
  const g = gcfg(data), W = stage.waves.length, N = Math.min(g.encounters, W);
  const out = [];
  for (let i = 0; i < N; i++) {
    const wi = N === 1 ? W - 1 : Math.round((i * (W - 1)) / (N - 1));
    const spec = stage.waves[wi];
    const boss = i === N - 1 ? stage.boss ?? null : null;
    const size = boss ? g.bossSquad : Math.round(g.squadMin + ((g.squadMax - g.squadMin) * i) / Math.max(1, N - 2));
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
    out.push({ wave: wi + 1, ids, boss: !!boss });
  }
  return out;
}

/** Seat for a unit by its natural role: melee and bruisers in front, ranged and cheerers behind. */
export function prefersFront(u) {
  if (u.stats.range > 1) return false;
  return u.stats.role !== 'buffer' || u.stats.range <= 1;
}

/** Fill the six seats from a list of units (front first for melee). */
export function autoSeat(state, units) {
  const seats = Array(6).fill(null);
  const put = (u, order) => { const i = order.find((k) => seats[k] == null); if (i == null) return false; seats[i] = u.uid; u.seat = i; return true; };
  // 앞줄은 브루저부터(힘겨루기), 치고 빠지는 딜러는 뒷줄이어도 손해 없음
  const rank = (u) => (u.stats.role === 'bruiser' ? 0 : u.stats.role === 'buffer' ? 2 : 1);
  const front = units.filter(prefersFront).sort((a, b) => rank(a) - rank(b)), back = units.filter((u) => !prefersFront(u));
  for (const u of front) if (!put(u, [1, 0, 2])) put(u, [4, 3, 5]);
  for (const u of back) if (!put(u, [4, 3, 5])) put(u, [1, 0, 2]);
  return seats;
}

/** New run of one stage. opts: battleOptions(...) plus { hard }. */
export function createGauntlet(data, stageId, seed = 1, opts = {}) {
  const stage = data.stageById[stageId];
  if (!stage) throw new Error('createGauntlet: unknown stage ' + stageId);
  const cfg = data.config, g = gcfg(data);
  const state = {
    mode: 'gauntlet', stage, rng: makeRng(seed), hard: !!opts.hard, phase: 'fight', result: null,
    enc: 0, encTime: 0, time: 0, actGap: 0, life: opts.hard ? 1 : g.life, field: [], bench: Array(cfg.benchSize + (opts.benchBonus ?? 0)).fill(null),
    seats: Array(6).fill(null), enemies: [], eSeats: Array(6).fill(null), nextUid: 1, nextEid: 1, events: [], log: [],
    known: { recipes: new Set(opts.known?.recipes ?? []), failed: new Set(opts.known?.failed ?? []) },
    levels: { ...(opts.levels ?? {}) }, allyBuffs: [], kills: 0, relics: [], relicOffer: null, talents: [...(opts.talents ?? [])],
    finds: { recipes: [], flops: [], species: [], bonds: [] }, seenSpecies: new Set(opts.seenSpecies ?? []), seenBonds: new Set(opts.seenBonds ?? []),
    favor: { ...(opts.favor ?? {}) }, pool: opts.pool ? [...opts.pool] : data.config.roster?.starter ?? data.units.map((u) => u.id),
    spells: [...(opts.spells ?? [])], soul: opts.soul && data.unitById[opts.soul.id] ? { ...opts.soul } : null,
    dmgWave: {}, dmgRun: {}, mana: cfg.spells?.start ?? 0, spellCd: 0, weakBonus: cfg.weakBonus ?? 30, downs: 0, wins: 0, losses: 0,
    summonCount: 0, offer: null, seenEnemies: new Set(),
  };
  state.life += eco(state, data, 'life') ?? 0;
  state.maxLife = state.life;
  state.mana = Math.min(cfg.spells?.max ?? 0, state.mana + (eco(state, data, 'manaStart') ?? 0));
  state.plan = planEncounters(stage, data, state.rng);
  // 처음 출전: 덱 전부(어린 단계). 소울펫이 있으면 왕관.
  const units = state.pool.filter((id) => data.unitById[id]).slice(0, 6).map((id) => newAnimal(state, data, id, g.startStage));
  for (const u of units) if (state.soul && u.speciesId === state.soul.id) { u.soul = true; u.soulKills = 0; }
  state.field = units;
  state.seats = autoSeat(state, units);
  startEncounter(state, data);
  return state;
}

function newAnimal(state, data, speciesId, stage = 'young') {
  const u = makeUnit(state, data, { kind: 'base', speciesId, stage, parts: null, traits: rollTraits(speciesId, data, state.rng) });
  if (!state.seenSpecies.has(speciesId)) { state.seenSpecies.add(speciesId); state.finds.species.push(speciesId); }
  state.summonCount += 1;
  return prep(u);
}
const prep = (u) => Object.assign(u, { gauge: u.gauge ?? Math.random() * 0.3, ultGauge: u.ultGauge ?? 0, elCd: 0, skillT: {}, statusT: {} });

/** Put the encounter's enemies on their seats. */
export function startEncounter(state, data) {
  const g = gcfg(data), spec = state.plan[state.enc];
  state.enemies = []; state.eSeats = Array(6).fill(null);
  for (const id of spec.ids) addEnemy(state, data, id, spec.wave);
  // 쉬던 동물: 혼자 남지 않게, 싸울 동물이 둘보다 적으면 쉬던 동물도 나옴
  if (fighters(state).length < 2) for (const u of unitsIn(state)) if (u?.resting) { u.resting = false; u.hp = Math.max(u.hp, u.maxHp * 0.3); }
  for (const u of state.field) { u.gauge = state.rng() * 0.35; u.skillT = {}; u.temp = []; }
  state.encTime = 0; state.actGap = 0; state.phase = 'fight'; state.allyBuffs = []; state.clashes = [];
  refreshMods(state, data);
  state.events.push({ type: 'encStart', enc: state.enc, boss: spec.boss });
  return g;
}

function addEnemy(state, data, id, wave) {
  const g = gcfg(data), def = data.enemyById[id];
  const ranged = def.flying || !!def.heal || id === 'wisp' || id === 'boss_lich' || id === 'skeleton';
  const order = def.boss ? [1, 0, 2, 4, 3, 5] : ranged ? [4, 3, 5, 1, 0, 2] : [1, 0, 2, 4, 3, 5];
  const seat = order.find((k) => state.eSeats[k] == null);
  if (seat == null) return null;
  // 웨이브 성장 대신 교전 번호로 성장(1교전 1배 → 마지막 1+growth×(N-1)배).
  // 길 디펜스용 숫자(튼튼한 적 5배, 보스 200배)는 차이가 너무 커서 0.6제곱으로 눌러 씀.
  const e = makeEnemy(id, 1, state.stage, data, state.nextEid++);
  const up = 1 + g.growth * state.enc, upA = 1 + g.atkGrowth * state.enc;
  const sm = Math.pow(state.stage.mult ?? 1, g.stageHpPow) * (data.config.difficulty?.enemyHp ?? 1);
  const pack = def.spawnCount > 1 ? def.spawnCount * 0.8 : 1;
  const hp = def.boss ? 30 * Math.pow((def.miniboss || def.hp < 3000 ? def.hp : g.bossBase) / 30, g.squash) * g.bossHp * (def.pattern?.type === 'summon' ? g.summonerHp : 1) * (g.bossTune?.[id]?.hp ?? 1) : 30 * Math.pow((def.hp * pack) / 30, g.squash) * g.enemyHp;
  e.hp = e.maxHp = Math.max(1, Math.round(hp * sm * up * (state.hard ? g.hardHp : 1)));
  const atk0 = def.attack || g.zeroAttack;
  const atk = 5 * Math.pow((atk0 * (def.spawnCount > 1 ? def.spawnCount * 0.5 : 1)) / 5, g.squash) * (def.boss ? g.bossAtk * (g.bossTune?.[id]?.atk ?? 1) : g.enemyAtk);
  e.attack = Math.max(1, Math.round(atk * Math.pow(state.stage.mult ?? 1, g.stageAtkPow) * (data.config.difficulty?.enemyAttack ?? 1) * upA));
  if (e.heal) e.heal = { ...e.heal, percent: e.heal.percent * g.healMult };
  e.interval = e.interval || g.zeroInterval;
  Object.assign(e, { seat, gauge: state.rng() * 0.3, name: def.name, ranged, shieldLeft: 0, patternT: def.pattern?.every ?? 0, healT: def.heal?.every ?? 0, burnDps: 0, burnLeft: 0, curseLeft: 0, pos: 0 });
  state.eSeats[seat] = e.eid;
  state.enemies.push(e);
  state.seenEnemies.add(id);
  return e;
}

function refreshMods(state, data) {
  for (const u of state.field) u.pos = 0;
  try { computeMods(state, data); } catch (err) { for (const u of state.field) u.mods = u.mods ?? emptyMods(); }
  for (const u of state.field) { if (u.maxHp == null) u.maxHp = u.stats.hp; if (u.hp > u.maxHp) u.hp = u.maxHp; }
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
const uInterval = (state, u) => effInterval(u) * Math.max(0.3, 1 + buffSum(state, 'interval') / 100);
const eInterval = (e) => e.interval * (e.slowLeft > 0 ? 1 / Math.max(0.2, 1 - e.slowPct / 100) : 1);

/** Advance the current encounter by dt seconds. */
export function tickGauntlet(state, data, dt) {
  if (state.phase !== 'fight') return;
  const g = gcfg(data);
  const max = 0.05;
  for (let left = dt; left > 1e-9 && state.phase === 'fight'; left -= max) sub(state, data, Math.min(max, left), g);
}

function sub(state, data, d, g) {
  state.time += d; state.encTime += d; state.actGap -= d;
  if (state.spellCd > 0) state.spellCd -= d;
  const sp = data.config.spells;
  if (sp && state.spells.length) state.mana = Math.min(sp.max, state.mana + g.manaRegen * (1 + (eco(state, data, 'manaRegen') ?? 0) / 100) * d);
  for (const b of state.allyBuffs) b.left -= d;
  state.allyBuffs = state.allyBuffs.filter((b) => b.left > 0);
  closeRanks(state);
  // 상태: 독·불·둔화·기절·저주
  for (const e of state.enemies) {
    if (!aliveE(e)) continue;
    if (e.poisonLeft > 0) { e.poisonLeft -= d; hurtEnemy(state, data, e, e.poisonDps * d, null, true); }
    if (e.burnLeft > 0) { e.burnLeft -= d; hurtEnemy(state, data, e, e.burnDps * d, null, true); }
    if (e.slowLeft > 0) e.slowLeft -= d;
    if (e.curseLeft > 0) e.curseLeft -= d;
    if (e.shieldLeft > 0) e.shieldLeft -= d;
    if (e.stunLeft > 0) { e.stunLeft -= d; continue; }
    e.gauge = Math.min(1, e.gauge + d / eInterval(e));
    bossTimers(state, data, e, d);
  }
  for (const u of fighters(state)) {
    if (u.elCd > 0) u.elCd -= d;
    if (u.stunLeft > 0) { u.stunLeft -= d; continue; }
    u.gauge = Math.min(1, u.gauge + d / uInterval(state, u));
    timerSkills(state, data, u, d);
  }
  updateClashes(state, data, d, g);
  // 한 번에 하나: 게이지가 가득 찬 쪽 중 가장 오래 기다린 하나만, stagger 간격으로
  if (state.actGap <= 0) {
    const ready = [...fighters(state).filter((u) => u.gauge >= 1 && !(u.stunLeft > 0)).map((u) => ({ u })), ...state.enemies.filter((e) => aliveE(e) && e.gauge >= 1 && !(e.stunLeft > 0)).map((e) => ({ e }))];
    if (ready.length) {
      const r = ready[Math.floor(state.rng() * ready.length)];
      if (r.u) unitAct(state, data, r.u, g); else enemyAct(state, data, r.e, g);
      state.actGap = g.stagger;
    }
  }
  if (state.time - (state.modsAt ?? -9) > 0.5) { state.modsAt = state.time; refreshMods(state, data); }
  checkEnd(state, data, g);
}

// ---------- 힘겨루기: 앞줄 브루저가 적 근접과 맞붙어 서로 밀고 당김 ----------
function updateClashes(state, data, d, g) {
  state.clashes = (state.clashes ?? []).filter((c) => { const u = findU(state, c.uid), e = findE(state, c.eid); const ok = u && aliveU(u) && aliveE(e); if (!ok) state.events.push({ type: 'clashEnd', uid: c.uid, eid: c.eid }); return ok; });
  for (const u of fighters(state)) {
    if (styleOf(u) !== 'bruiser' || !isFront(u.seat) || clashOfU(state, u.uid)) continue;
    const free = state.enemies.filter((e) => aliveE(e) && !e.ranged && !e.flying && isFront(e.seat) && !clashOfE(state, e.eid));
    if (!free.length) break;
    free.sort((a, b) => Math.abs((a.seat % 3) - (u.seat % 3)) - Math.abs((b.seat % 3) - (u.seat % 3)));
    const e = free[0];
    state.clashes.push({ uid: u.uid, eid: e.eid, push: 0 });
    state.events.push({ type: 'clashStart', uid: u.uid, eid: e.eid });
  }
  for (const c of state.clashes) {
    const u = findU(state, c.uid), e = findE(state, c.eid);
    // 힘 = √(초당 피해 × 최대 체력) × 남은 체력 — 아군은 세게 치고 약하고 적은 질기고 약하게 쳐서, 둘을 섞어야 맞먹음
    const su = (u.stunLeft > 0 ? 0.6 : 1) * Math.sqrt((effDamage(u) / uInterval(state, u)) * u.maxHp) * (0.4 + 0.6 * u.hp / u.maxHp);
    const se = (e.stunLeft > 0 ? 0.6 : 1) * Math.sqrt((e.attack / eInterval(e)) * e.maxHp) * g.clashEnemy * (e.boss ? g.clashBoss : 1) * (0.4 + 0.6 * e.hp / e.maxHp);
    const lean = su + se > 0 ? (su - se) / (su + se) : 0;
    // 힘 차이는 절반만 반영하고 흔들림을 크게: 강한 쪽이 이기는 편이지만 엎치락뒤치락함
    // 기세(surge): 0.5~1.3초마다 바뀌는 밀고 당김 — 순간순간 엎치락뒤치락
    c.surgeT = (c.surgeT ?? 0) - d;
    if (c.surgeT <= 0) { c.surge = (state.rng() * 2 - 1) * g.clashNoise; c.surgeT = 0.5 + state.rng() * 0.8; }
    c.push += d * g.clashRate * (lean * g.clashLean + c.surge);
    if (c.push >= 1) {
      c.push = 0;
      const a = hurtEnemy(state, data, e, effDamage(u) * g.clashBonus, u);
      if (aliveE(e)) { e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? g.clashStun * 0.4 : g.clashStun); e.gauge = 0; }
      state.events.push({ type: 'clashWin', uid: u.uid, eid: e.eid, dmg: Math.round(a) });
      say(state, `${u.stats.name} 힘겨루기 승! → ${e.name} ${Math.round(a)}`);
    } else if (c.push <= -1) {
      c.push = 0;
      const a = hurtUnit(state, data, u, e.attack * g.clashBonus, e);
      if (aliveU(u)) { u.stunLeft = Math.max(u.stunLeft ?? 0, g.clashStun * 0.8); u.gauge = 0; }
      state.events.push({ type: 'clashLose', uid: u.uid, eid: e.eid, dmg: Math.round(a) });
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
const lowest = (list) => list.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a), list[0]);

function pickUnitTarget(state, u) {
  const es = state.enemies.filter(aliveE);
  if (!es.length) return null;
  const st = styleOf(u);
  if (st === 'bruiser') { const c = clashOfU(state, u.uid); const e = c && findE(state, c.eid); if (e && aliveE(e)) return e; }
  // 거들기: 밀리는 힘겨루기가 있으면 원거리·응원은 그 적을 먼저
  if (st === 'ranged' || st === 'support') {
    const losing = (state.clashes ?? []).filter((c) => c.push < -0.25).map((c) => findE(state, c.eid)).filter(aliveE);
    if (losing.length && state.rng() < 0.6 && (st === 'ranged' || isFront(u.seat))) return losing[0];
  }
  // 치고 빠지기: 힘겨루기에 묶이지 않은 적, 뒷줄·약한 적을 노림
  if (st === 'skirm') {
    const loose = es.filter((e) => !clashOfE(state, e.eid) && (!e.flying || u.stats.canHitFlying));
    const pool = loose.length ? loose : es;
    return state.rng() < 0.55 ? lowest(pool) : pool[Math.floor(state.rng() * pool.length)];
  }
  if (u.stats.range > 1) {
    // 원거리: 나는 적·뒷줄을 먼저 노리고, 그중 체력 낮은 놈
    const fly = es.filter((e) => e.flying || !isFront(e.seat));
    return lowest(fly.length && state.rng() < 0.6 ? fly : es);
  }
  const f = frontTargets(es).filter((e) => !e.flying || u.stats.canHitFlying);
  const pool = f.length ? f : es;
  return state.rng() < 0.6 ? lowest(pool) : pool[Math.floor(state.rng() * pool.length)];
}

function pickEnemyTarget(state, e, g) {
  const us = fighters(state);
  if (!us.length) return null;
  { const c = clashOfE(state, e.eid); const u = c && findU(state, c.uid); if (u && aliveU(u)) return u; }
  if (e.ranged) return state.rng() < 0.5 ? lowest(us) : us[Math.floor(state.rng() * us.length)];
  const f = frontTargets(us);
  const w = f.map((u) => (u.stats.role === 'bruiser' ? g.taunt : 1));
  let t = state.rng() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < f.length; i++) if ((t -= w[i]) < 0) return f[i];
  return f[0];
}

function pickMoveG(state, u, target, cfg) {
  const m = cfg.moves, have = movesOf(u, cfg);
  if (!m || have.length === 1) return 'a1';
  if (have.includes('ult') && (u.ultGauge ?? 0) >= m.ult.gauge) return 'ult';
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
function hurtEnemy(state, data, e, amount, src, quiet = false) {
  if (!aliveE(e)) return 0;
  let a = amount * (e.shieldLeft > 0 ? 0.3 : 1);
  a = Math.min(a, e.hp);
  e.hp -= a;
  if (src) {
    for (const book of [state.dmgWave, state.dmgRun]) { const r = (book[src.uid] ??= { name: src.stats.name, speciesId: src.speciesId, soul: !!src.soul, dmg: 0 }); r.dmg += a; r.name = src.stats.name; }
    chargeUlt(src, data.config, 'hit');
  }
  if (e.hp <= 0.001) {
    e.hp = 0; state.kills += 1; state.eSeats[state.eSeats.indexOf(e.eid)] = null;
    if (src) { chargeUlt(src, data.config, 'kill'); if (src.soul) src.soulKills = (src.soulKills ?? 0) + 1; }
    if (e.boss) state.bossKilled = true;
    state.events.push({ type: 'kill', eid: e.eid, boss: e.boss, by: src?.uid ?? null });
  } else if (quiet && a > 0.5 && state.rng() < 0.15) state.events.push({ type: 'dot', eid: e.eid, dmg: a });
  return a;
}

function hurtUnit(state, data, u, amount, src) {
  if (!aliveU(u)) return 0;
  const taken = (u.mods?.taken ?? 0) + buffSum(state, 'taken');
  const a = Math.max(1, amount * Math.max(0.2, 1 + taken / 100));
  u.hp -= a;
  chargeUlt(u, data.config, 'hurt', (a / u.maxHp) * 100);
  if (u.hp <= 0) { u.hp = 0; u.down = true; state.downs += 1; state.events.push({ type: 'down', uid: u.uid }); say(state, `${u.stats.name} 쓰러짐`); }
  return a;
}

function unitAct(state, data, u, g) {
  const cfg = data.config;
  const t = pickUnitTarget(state, u);
  u.gauge = 0;
  if (!t) return;
  const move = pickMoveG(state, u, t, cfg);
  const melee = u.stats.range <= 1;
  const st = styleOf(u);
  let mult = melee && st !== 'skirm' && !isFront(u.seat) ? g.backMelee : !melee && isFront(u.seat) ? g.frontRanged : 1;
  mult *= 1 + buffSum(state, 'dmg') / 100;
  if (t.curseLeft > 0) mult *= 1.2;
  const base = hitDamage(state, u, t) * mult;
  const hits = [];
  let name = null, big = false, el = null;
  const row = (e) => state.enemies.filter((x) => aliveE(x) && isFront(x.seat) === isFront(e.seat));
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
    if (a2.healAlly) { const al = lowest(fighters(state)); al.hp = Math.min(al.maxHp, al.hp + al.maxHp * a2.healAlly / 100); state.events.push({ type: 'heal', uid: al.uid }); }
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
    const m = cfg.moves.ult; name = ultName(u, cfg); big = true; u.ultGauge = 0;
    hits.push([t, base * m.mult]);
    for (const o of state.enemies.filter((x) => aliveE(x) && x !== t)) hits.push([o, base * m.splash]);
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
  const dealt = hits.map(([e, a]) => ({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, a, u)) }));
  // 거들기: 힘겨루기 중인 적을 다른 동물이 때리면 우리 브루저 쪽으로 기움
  if (st !== 'bruiser') for (const h of dealt) assist(state, 'e', h.eid, g.assistPush * (big ? 2 : 1));
  // 응원: 응원 동물은 칠 때마다 가장 밀리는 브루저를 북돋움(체력 조금 + 힘겨루기 쪽으로)
  let cheer = null;
  if (st === 'support') {
    const c = [...(state.clashes ?? [])].sort((a, b) => a.push - b.push)[0];
    const to = c ? findU(state, c.uid) : lowest(fighters(state));
    if (to && aliveU(to)) {
      to.hp = Math.min(to.maxHp, to.hp + to.maxHp * g.cheerHeal / 100);
      if (c) c.push = Math.min(0.95, c.push + g.cheerPush);
      cheer = to.uid;
      state.events.push({ type: 'cheer', uid: u.uid, to: to.uid });
    }
  }
  state.events.push({ type: 'act', side: 'u', uid: u.uid, eid: t.eid, move, name, big, el, melee, style: st, cheer, hits: dealt });
  const tot = dealt.reduce((s, h) => s + h.dmg, 0);
  if (name || big) say(state, `${u.stats.name} · ${name ?? '공격'} → ${t.name} ${tot}`);
}

function enemyAct(state, data, e, g) {
  const t = pickEnemyTarget(state, e, g);
  e.gauge = 0;
  if (!t) return;
  let dmg = e.attack;
  if (e.chargeLeft > 0) dmg *= 1.6;
  const clash = clashOfE(state, e.eid);
  // 요리조리: 치고 빠지는 동물은 맞붙지 않은 적의 공격을 가끔 피함
  if (!clash && styleOf(t) === 'skirm' && state.rng() < g.dodge) {
    state.events.push({ type: 'act', side: 'e', eid: e.eid, uid: t.uid, dmg: 0, dodged: true, melee: !e.ranged, boss: e.boss });
    return;
  }
  const a = hurtUnit(state, data, t, dmg, e);
  if (!clash) assist(state, 'u', t.uid, g.assistPush * 1.5);
  state.events.push({ type: 'act', side: 'e', eid: e.eid, uid: t.uid, dmg: Math.round(a), melee: !e.ranged, boss: e.boss, clash: !!clash });
  if (e.boss) say(state, `${e.name} → ${t.stats.name} ${Math.round(a)}`);
}

function bossTimers(state, data, e, d) {
  const g = gcfg(data);
  if (e.healT > 0 && e.heal) {
    e.healT -= d;
    if (e.healT <= 0) {
      e.healT = e.heal.every;
      for (const o of state.enemies.filter(aliveE)) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.heal.percent / 100);
      state.events.push({ type: 'eheal', eid: e.eid });
    }
  }
  const p = e.pattern;
  if (!p) return;
  if (e.chargeLeft > 0) e.chargeLeft -= d;
  e.patternT -= d;
  if (e.patternT > 0) return;
  e.patternT = p.every;
  if (p.type === 'summon') {
    let n = 0;
    const minions = state.enemies.filter((x) => aliveE(x) && x.minion).length;
    for (let i = 0; i < Math.min(p.count, g.summonCap - minions); i++) { const m = addEnemy(state, data, p.enemy, state.plan[state.enc].wave); if (m) { m.minion = true; m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * g.minionHp)); n++; } }
    if (n) { state.events.push({ type: 'summon', eid: e.eid, n }); say(state, `${e.name}: 졸개를 부름`); }
  } else if (p.type === 'shield') {
    e.shieldLeft = p.duration; state.events.push({ type: 'shield', eid: e.eid }); say(state, `${e.name}: 보호막`);
  } else if (p.type === 'charge') {
    if (e.hp / e.maxHp * 100 > (p.belowHpPercent ?? 100)) return;
    e.chargeLeft = p.duration;
    for (const u of frontTargets(fighters(state))) if (isFront(u.seat)) hurtUnit(state, data, u, e.attack * 0.8, e);
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
      case 'damageHeld': for (const e of front) hits.push({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, amt, u)) }); break;
      case 'damageAll': for (const e of es) hits.push({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, amt, u)) }); break;
      case 'flee': for (const e of es) if (!e.boss) e.stunLeft = Math.max(e.stunLeft ?? 0, fx.dur ?? 2); break;
      case 'stunRadius': for (const e of front) e.stunLeft = Math.max(e.stunLeft ?? 0, e.boss ? 0.5 : fx.dur ?? 1.5); break;
      case 'pushHeld': for (const e of front.slice(0, fx.count ?? 1)) e.gauge = 0; break;
      case 'allyBuff': state.allyBuffs.push({ stat: fx.stat, percent: fx.percent, left: fx.dur }); break;
      case 'halveRespawn': for (const o of fighters(state)) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15); break;
      default: { const t = pickUnitTarget(state, u); if (t) hits.push({ eid: t.eid, dmg: Math.round(hurtEnemy(state, data, t, effDamage(u) * 2, u)) }); }
    }
    state.events.push({ type: 'act', side: 'u', uid: u.uid, eid: hits[0]?.eid ?? null, move: 'skill', name: fx.name, big: true, melee: u.stats.range <= 1, hits, action: fx.action });
    say(state, `${u.stats.name} · ${fx.name}`);
    return;   // 한 틱에 기술 하나
  }
}

function checkEnd(state, data, g) {
  const eAlive = state.enemies.some(aliveE), uAlive = fighters(state).length > 0;
  if (!eAlive) return endEncounter(state, data, true);
  if (!uAlive) return endEncounter(state, data, false);
  if (state.encTime >= g.timeLimit) {
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
  if (win) {
    state.wins += 1;
    state.events.push({ type: 'encWin', enc: state.enc, boss: spec.boss });
    if (spec.boss) { state.phase = 'ended'; state.result = 'clear'; state.wavesCleared = state.stage.waves.length; return; }
  } else {
    state.losses += 1; state.life -= 1;
    state.events.push({ type: 'encLose', enc: state.enc, life: state.life });
    if (state.life <= 0 || state.hard) { state.life = Math.max(0, state.life); state.phase = 'ended'; state.result = 'lose'; state.wavesCleared = Math.round((state.enc * state.stage.waves.length) / state.plan.length); return; }
  }
  // 정비: 회복. 이기면 쓰러진 동물은 다음 교전 쉼, 지면 모두 간신히 일어남
  for (const u of state.field) {
    if (u.resting) { u.resting = false; u.hp = Math.max(u.hp, u.maxHp * g.restBackPct / 100); continue; }
    if (u.down) {
      u.down = false;
      if (win) { u.resting = true; u.hp = 1; } else u.hp = u.maxHp * g.lossRevive / 100;
    } else u.hp = win ? Math.min(u.maxHp, u.hp + u.maxHp * g.healPct / 100) : Math.max(u.hp, u.maxHp * g.lossRevive / 100);
    u.gauge = 0; u.stunLeft = 0;
  }
  for (const u of state.bench) if (u) u.hp = u.maxHp;
  state.enemies = []; state.eSeats = Array(6).fill(null);
  // 활약상: 이긴 교전에서 가장 많이 때린 동물이 한 단계 자람(어린 → 성장기 → 성체)
  state.mvp = null;
  if (win && g.mvpGrow) {
    const top = Object.entries(state.dmgWave).map(([uid, r]) => ({ uid: +uid, dmg: r.dmg })).sort((a, b) => b.dmg - a.dmg);
    for (const t of top) {
      const u = state.field.find((x) => x.uid === t.uid);
      if (!u) continue;
      const before = u.stats.name;
      if (u.kind === 'base' && NEXT[u.stage]) { const n = grow(state, data, u); state.mvp = { uid: n.uid, from: before, to: n.stats.name, dmg: Math.round(t.dmg), grew: true }; }
      else state.mvp = { uid: u.uid, from: before, to: before, dmg: Math.round(t.dmg), grew: false };
      break;
    }
  }
  state.dmgWave = {};
  // 지면 그 교전은 넘어감(보스는 다시)
  if (win || !spec.boss) state.enc += 1;
  state.wavesCleared = Math.round((state.enc * state.stage.waves.length) / state.plan.length);
  state.phase = 'regroup';
  // 노멀에서 지면 보상은 그대로 고름(죽음의 소용돌이 방지), 활약상 성장은 이겼을 때만
  state.offer = rollRewards(state, data);
  state.events.push({ type: 'regroup' });
}

/** Three rewards to pick one from: new animal from the deck, food (grow one), relic. */
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
  const relics = rollOffer(state, data);
  return {
    globe: picks.map((id) => ({ speciesId: id, traits: rollTraits(id, data, state.rng) })),
    food: true,
    relic: relics.length ? relics : null,
    taken: null,
  };
}

/** Take one reward. kind 'globe' (arg = candidate index), 'food' (arg = uid), 'relic' (arg = relic id). */
export function takeReward(state, data, kind, arg) {
  const o = state.offer;
  if (state.phase !== 'regroup' || !o) return fail('noOffer');
  if (o.taken) return fail('taken');
  if (kind === 'globe') {
    const c = o.globe?.[arg];
    if (!c) return fail('notFound');
    const slot = state.bench.indexOf(null);
    const seat = state.seats.indexOf(null);
    if (slot < 0 && seat < 0) return fail('benchFull');
    const u = newAnimal(state, data, c.speciesId, 'young');
    u.traits = c.traits;
    if (seat >= 0 && slot < 0) { state.field.push(u); state.seats[seat] = u.uid; u.seat = seat; }
    else state.bench[slot] = u;
    o.taken = 'globe';
    state.events.push({ type: 'reward', kind, uid: u.uid });
    return { ok: true, unit: u };
  }
  if (kind === 'food') {
    const u = [...state.field, ...state.bench].find((x) => x && x.uid === arg);
    if (!u) return fail('notFound');
    if (u.kind !== 'base' || !NEXT[u.stage]) { if (u.hp >= u.maxHp && !u.resting) return fail('maxed'); u.resting = false; u.hp = u.maxHp; o.taken = 'food'; state.events.push({ type: 'reward', kind, uid: u.uid, heal: true }); return { ok: true, unit: u, healed: true }; }
    const grown = grow(state, data, u);
    o.taken = 'food';
    state.events.push({ type: 'reward', kind, uid: grown.uid, grew: true });
    return { ok: true, unit: grown };
  }
  if (kind === 'relic') {
    if (!o.relic?.includes(arg)) return fail('notFound');
    state.relicOffer = o.relic;
    const r = chooseRelic(state, data, arg);
    if (!r.ok) return r;
    if (r.relic.eco?.life) state.maxLife += r.relic.eco.life;
    o.taken = 'relic';
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

function replace(state, old, n) {
  const fi = state.field.indexOf(old);
  if (fi >= 0) { state.field[fi] = n; const s = state.seats.indexOf(old.uid); if (s >= 0) { state.seats[s] = n.uid; n.seat = s; } }
  const bi = state.bench.indexOf(old);
  if (bi >= 0) state.bench[bi] = n;
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

/** Is a merge of a onto b possible, and what would it be? (for the drag preview) */
export function mergeHint(state, data, from, to) {
  const at = (r) => (r.where === 'seat' ? state.field.find((u) => u.uid === state.seats[r.index]) ?? null : state.bench[r.index] ?? null);
  const a = at(from), b = at(to);
  if (!a || !b || a === b) return null;
  return mergeKind(a, b, data);
}

/** Leave the regroup for the next encounter. */
export function nextEncounter(state, data) {
  if (state.phase !== 'regroup') return fail('notRegroup');
  if (!fighters(state).length && !unitsIn(state).some(Boolean)) return fail('empty');
  if (!unitsIn(state).some(Boolean)) return fail('empty');
  state.offer = null; state.relicOffer = null;
  startEncounter(state, data);
  return { ok: true };
}

/** What the next encounter brings (for the preview). */
export function nextPreview(state, data) {
  const spec = state.plan[state.enc];
  if (!spec) return null;
  const n = {};
  for (const id of spec.ids) n[id] = (n[id] ?? 0) + 1;
  return { boss: spec.boss, list: Object.entries(n).map(([id, k]) => ({ id, n: k, name: data.enemyById[id]?.name ?? id, flying: !!data.enemyById[id]?.flying, boss: !!data.enemyById[id]?.boss })) };
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
      for (const u of unitsIn(state)) if (u) { if (u.down) { u.down = false; u.hp = 0; } u.hp = Math.min(u.maxHp, u.hp + u.maxHp * def.heal * P / 100); }
      state.allyBuffs.push({ stat: 'taken', percent: -def.shield, left: def.dur * P }); break;
    case 'drum': state.allyBuffs.push({ stat: 'interval', percent: -def.haste, left: def.dur * P }, { stat: 'dmg', percent: def.dmg, left: def.dur * P }); break;
    case 'hourglass': for (const e of es) { e.slowPct = def.slow; e.slowLeft = def.dur * P; } break;
    case 'gust': for (const e of es) e.gauge = 0; break;
    default: return fail('locked');
  }
  const hits = hit.map(([e, a]) => ({ eid: e.eid, dmg: Math.round(hurtEnemy(state, data, e, a, null)) }));
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
      if (state.mana >= 40 && state.spells.length) castG(state, data, state.spells[0]);
    }
    if (state.phase !== 'regroup') break;
    if (state.offer && !state.offer.taken) (pick ?? botPick)(state, data);
    nextEncounter(state, data);
  }
  return state;
}

function botPick(state, data) {
  const o = state.offer;
  const young = [...state.field].filter((u) => u.kind === 'base' && NEXT[u.stage]).sort((a, b) => (b.soul ? 1 : 0) - (a.soul ? 1 : 0));
  const r = state.rng();
  if (r < 0.45 && young.length) return takeReward(state, data, 'food', young[0].uid);
  if (r < 0.75 && o.relic) return takeReward(state, data, 'relic', o.relic[0]);
  const got = takeReward(state, data, 'globe', 0);
  if (got.ok) {
    // 같은 종·단계가 있으면 합치기
    const u = got.unit, bi = state.bench.indexOf(u);
    if (bi >= 0) {
      const mate = state.seats.findIndex((uid) => { const x = state.field.find((f) => f.uid === uid); return x && x.kind === 'base' && x.speciesId === u.speciesId && x.stage === u.stage; });
      if (mate >= 0) moveAnimal(state, data, { where: 'bench', index: bi }, { where: 'seat', index: mate });
    }
  } else if (young.length) takeReward(state, data, 'food', young[0].uid);
}

import { makeRng } from './rng.js';
import { tickMana, castSpell } from './spells.js';
import { tickSoul } from './soul.js';
import { pairKey } from './data.js';
import { summonCost, waveReward, sellPrice, skipGold } from './economy.js';
import { newRollCtx, rollSummon, advanceRollCtx, ownedSpecies } from './roulette.js';
import { unitStats } from './stats.js';
import { mergeKind, mergeUnits } from './merge.js';
import { buildWave, makeEnemy } from './waves.js';
import { combatTick, onWaveStart, onWaveEnd } from './combat.js';
import { eco, rollOffer, chooseRelic } from './relics.js';
import { spawnDepth } from './arena.js';
import { assignSlots, intoGate, sendOut, musterOut } from './muster.js';
import { rollTraits, inheritEvolve, inheritSpirit, inheritChimera, inheritWeak } from './traits.js';

const fail = (reason) => ({ ok: false, reason });
const freeSlot = (state) => state.bench.indexOf(null);
const releaseBlocked = (state, uid) => { for (const e of state.enemies) if (e.blockedBy === uid) e.blockedBy = null; };

/** New battle state for a stage. */
export function createBattle(data, stageId, seed = 1, opts = {}) {
  const stage = data.stageById[stageId];
  if (!stage) throw new Error('createBattle: unknown stage ' + stageId);
  const cfg = data.config;
  const state = {
    stage, rng: makeRng(seed), phase: 'prep', result: null,
    wave: 1, waveTime: 0, prepLeft: cfg.prep.seconds, time: 0,
    life: cfg.life, gold: cfg.startGold + (opts.startGoldBonus ?? 0), summonCount: 0, rollCtx: newRollCtx(),
    field: [], bench: Array(cfg.benchSize + (opts.benchBonus ?? 0)).fill(null), enemies: [], queue: [],
    nextUid: 1, nextEid: 1, events: [],
    known: { recipes: new Set(opts.known?.recipes ?? []), failed: new Set(opts.known?.failed ?? []) },
    levels: { ...(opts.levels ?? {}) }, allyBuffs: [], bait: null, kills: 0, relics: [], relicOffer: null, talents: [...(opts.talents ?? [])],
    finds: { recipes: [], flops: [], species: [], bonds: [] }, seenSpecies: new Set(opts.seenSpecies ?? []), seenBonds: new Set(opts.seenBonds ?? []),
  };
  state.favor = { ...(opts.favor ?? {}) };
  state.pool = opts.pool ? [...opts.pool] : null;
  state.spells = [...(opts.spells ?? [])];
  state.soul = opts.soul && data.unitById[opts.soul.id] ? { ...opts.soul } : null;
  state.dmgWave = {}; state.dmgRun = {};
  state.mana = cfg.spells?.start ?? 0;
  state.spellCd = 0;
  state.weakBonus = cfg.weakBonus ?? 30;
  state.gateY = cfg.muster?.gateYByArt?.[stage.art ?? stage.id] ?? cfg.muster?.gateY;
  state.meleeReach = data.config.arena?.meleeReach ?? data.config.meleeReach ?? 1;
  state.gold += eco(state, data, 'startGold') ?? 0;
  state.life += eco(state, data, 'life') ?? 0;
  state.mana = Math.min(cfg.spells?.max ?? 0, state.mana + (eco(state, data, 'manaStart') ?? 0));
  state.maxLife = state.life;
  return state;
}

/** Put the companion brought from the previous stage on the bench (see meta.carryInstance). */
export function addCarry(state, data, inst) {
  if (!inst || !data.unitById[inst.speciesId]) return null;
  const slot = state.bench.indexOf(null);
  if (slot < 0) return null;
  const u = makeUnit(state, data, { kind: 'base', speciesId: inst.speciesId, stage: inst.stage, parts: null, traits: (inst.traits ?? []).map((t) => ({ ...t })), white: !!inst.white });
  u.carried = true;
  state.bench[slot] = u;
  return u;
}

/** Wrap an instance into a live unit with a fresh uid. */
export function makeUnit(state, data, inst) {
  const stats = unitStats(inst, data);
  return { traits: [], ...inst, uid: state.nextUid++, stats, pos: 0, targetPos: 0, y: 0.5, targetY: 0.5, hp: stats.hp, maxHp: stats.hp, down: false, respawnLeft: 0,
    lastHitAt: -99, attackCd: 0, skillCd: {}, attackCount: 0, moving: false, temp: [] };
}

/** Total gold for one summon with optional continent / habitat designation. */
export function summonPrice(state, data, opts = {}) {
  const d = data.config.designate ?? { continent: 0, habitat: 0 };
  const base = Math.max(10, summonCost(state.summonCount, data.config) - (eco(state, data, 'summonDiscount') ?? 0));
  return base + (opts.habitat ? d.habitat : opts.continent ? d.continent : 0);
}

/** Buy bait in the prep phase: the next N summons weigh that role ×mult. */
export function buyBait(state, data, type) {
  const b = data.config.bait;
  if (!b?.types?.[type]) return fail('notFound');
  if (b.prepOnly && state.phase !== 'prep') return fail('notPrep');
  const cost = eco(state, data, 'baitCost') ?? b.cost;
  if (state.gold < cost) return fail('gold');
  state.gold -= cost;
  state.bait = { type, left: eco(state, data, 'baitSummons') ?? b.summons };
  state.events.push({ type: 'bait', bait: type });
  return { ok: true };
}

/** Lock or unlock one trait so evolution does not overwrite it. */
export function toggleLock(state, uid, index) {
  const u = [...state.field, ...state.bench].find((x) => x && x.uid === uid);
  if (!u || !u.traits?.[index]) return fail('notFound');
  u.traits[index].locked = !u.traits[index].locked;
  return { ok: true, locked: u.traits[index].locked };
}

/** Resolve { where: 'bench', index } or { where: 'field', uid } to a unit. */
export function findUnit(state, ref) {
  if (ref?.where === 'bench') return state.bench[ref.index] ?? null;
  if (ref?.where === 'field') return state.field.find((u) => u.uid === ref.uid) ?? null;
  return null;
}

function removeUnit(state, ref) {
  if (ref.where === 'bench') state.bench[ref.index] = null;
  else {
    state.field = state.field.filter((u) => u.uid !== ref.uid);
    releaseBlocked(state, ref.uid);
  }
}

/** Pay for one roulette summon into the first free bench slot. */
export function summon(state, data, opts = {}) {
  if (state.phase === 'ended') return fail('ended');
  const cost = summonPrice(state, data, opts);
  if (state.gold < cost) return fail('gold');
  const slot = freeSlot(state);
  if (slot < 0) return fail('benchFull');
  const soulFirst = !!state.soul && !state.soulOut;
  const roll = rollSummon(state.rollCtx, state.wave, data, state.rng, ownedSpecies(state),
    { continent: opts.habitat ? data.units.find((u) => u.habitat === opts.habitat)?.continent : opts.continent, habitat: opts.habitat, bait: state.bait?.type, favor: state.favor, pool: soulFirst ? [state.soul.id] : state.pool, heroMult: eco(state, data, 'heroMult') ?? 1, sameExtra: eco(state, data, 'sameSpeciesExtra') ?? 0 });
  if (state.bait) { state.bait.left -= 1; if (state.bait.left <= 0) state.bait = null; }
  const lvCfg = data.config.speciesLevel;
  const lv = state.levels?.[roll.unitId] ?? 1;
  const stage = lvCfg && lv >= 5 && state.rng() < lvCfg.teenChanceAt5 / 100 ? 'teen' : 'young';
  const white = (data.lore?.passives?.[roll.unitId]?.fx ?? []).some((f) => f.whiteChance && state.rng() < f.whiteChance / 100);
  const unit = makeUnit(state, data, { kind: 'base', speciesId: roll.unitId, stage, parts: null, white, traits: rollTraits(roll.unitId, data, state.rng, white) });
  if (!state.seenSpecies.has(roll.unitId)) { state.seenSpecies.add(roll.unitId); state.finds.species.push(roll.unitId); }
  const twin = eco(state, data, 'twinChance');
  if (twin && state.rng() < twin / 100) {
    const slot2 = state.bench.indexOf(null, slot + 1) >= 0 ? state.bench.indexOf(null, slot + 1) : state.bench.findIndex((x, i) => !x && i !== slot);
    if (slot2 >= 0) { state.bench[slot2] = makeUnit(state, data, { kind: 'base', speciesId: roll.unitId, stage: 'young', parts: null, traits: rollTraits(roll.unitId, data, state.rng) }); state.events.push({ type: 'twin', uid: state.bench[slot2].uid }); }
  }
  if (soulFirst) { unit.soul = true; unit.soulKills = 0; state.soulOut = true; }
  state.bench[slot] = unit;
  state.gold -= cost;
  state.summonCount += 1;
  state.rollCtx = advanceRollCtx(state.rollCtx, data.unitById[roll.unitId], data.config);
  state.events.push({ type: 'summon', uid: unit.uid, roll });
  return { ok: true, unit, roll, cost };
}

const isFlyer = (u) => !!u?.stats?.flyer;

/** Lanes (rows) already taken by ground units standing within minSpacing of pos. */
export function lanesUsed(state, pos, ignoreUid, config) {
  return state.field.filter((u) => u.uid !== ignoreUid && !isFlyer(u) && Math.abs(u.targetPos - pos) < config.minSpacing).map((u) => u.lane ?? 0);
}

/** A ground spot is free while fewer than config.lanes (3) animals share the column. Flyers can go anywhere. */
export function isFree(state, pos, ignoreUid, config, unit = null) {
  if (isFlyer(unit)) return true;
  return lanesUsed(state, pos, ignoreUid, config).length < (config.lanes ?? 1);
}

/** Free lane nearest to the preferred one (0 top, 1 middle, 2 bottom). */
export function pickLane(state, pos, ignoreUid, config, pref = 1) {
  const used = new Set(lanesUsed(state, pos, ignoreUid, config));
  const n = config.lanes ?? 1;
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref));
  return order.find((l) => !used.has(l)) ?? 0;
}

function place(state, cfg, unit, p, opts) {
  if (isFlyer(unit)) { unit.lane = null; if (opts.skyY !== undefined) unit.skyY = opts.skyY; else unit.skyY ??= 200; }
  else unit.lane = pickLane(state, p, unit.uid, cfg, opts.lane ?? unit.lane ?? 1);
}

/** Keep a position half a tile inside the path. */
export function clampPos(pos, config) {
  return Math.min(config.pathLength - 0.5, Math.max(0.5, pos));
}

/** Send a cage animal into battle: it waits inside the gate during prep, or runs straight out mid-wave. Where it stands comes from its role. */
export function deploy(state, data, benchIndex, pos, opts = {}) {
  const cfg = data.config;
  const unit = state.bench[benchIndex];
  if (!unit) return fail('empty');
  if (state.field.length >= cfg.maxDeployed) return fail('fieldFull');
  if (cfg.muster) {
    state.bench[benchIndex] = null;
    state.field.push(unit);
    if (state.phase === 'wave') sendOut(state, cfg, unit);
    else { intoGate(unit, cfg, state); assignSlots(state, cfg); }
    return { ok: true, unit };
  }
  const p = clampPos(pos, cfg);
  if (!isFree(state, p, null, cfg, unit)) return fail('occupied');
  place(state, cfg, unit, p, opts);
  state.bench[benchIndex] = null;
  Object.assign(unit, { pos: p, targetPos: p, moving: false });
  if (state.phase === 'wave') unit.home = { pos: clampPos(p - (state.formationDelta ?? 0), cfg), lane: unit.lane, skyY: unit.skyY };
  state.field.push(unit);
  return { ok: true, unit };
}

/** Send a field unit walking to a new spot (free placement only; with the gate muster animals pick their own spot). */
export function moveUnit(state, data, uid, pos, opts = {}) {
  const unit = findUnit(state, { where: 'field', uid });
  if (!unit) return fail('notFound');
  if (unit.down) return fail('down');
  if (data.config.muster) return fail('auto');
  const p = clampPos(pos, data.config);
  if (!isFree(state, p, uid, data.config, unit)) return fail('occupied');
  place(state, data.config, unit, p, opts);
  unit.targetPos = p;
  unit.formationMove = false;
  if (state.phase === 'wave' && unit.home) unit.home = { pos: clampPos(p - (state.formationDelta ?? 0), data.config), lane: unit.lane, skyY: unit.skyY };
  if (state.phase === 'prep') unit.pos = p; // nothing fights during prep, so the unit is placed at once
  return { ok: true };
}

const PLACE_KEYS = ['pos', 'targetPos', 'y', 'targetY', 'lane', 'skyY', 'skyRow', 'home', 'slot', 'rowY', 'rank', 'inGate', 'rushing', 'via', 'gateDelay'];
/** A unit takes over another one's spot on the field (swap / merge onto a fighter). */
const takeOver = (unit, from) => { for (const k of PLACE_KEYS) unit[k] = from[k]; unit.moving = false; if (unit.stats.flyer) unit.lane = null; else unit.lane ??= 1; };
const reslot = (state, cfg) => { if (cfg.muster) assignSlots(state, cfg); };

/** Pull a field unit back to the bench. */
export function recall(state, data, uid) {
  const unit = findUnit(state, { where: 'field', uid });
  if (!unit) return fail('notFound');
  if (unit.down) return fail('down');
  const slot = freeSlot(state);
  if (slot < 0) return fail('benchFull');
  removeUnit(state, { where: 'field', uid });
  unit.moving = false; unit.inGate = false; unit.rushing = false; unit.via = null;
  state.bench[slot] = unit;
  reslot(state, data.config);
  return { ok: true };
}

/** Sell a unit for gold. */
export function sell(state, data, ref) {
  const unit = findUnit(state, ref);
  if (!unit) return fail('notFound');
  const price = sellPrice(unit, data.config);
  removeUnit(state, ref);
  if (ref.where === 'field') reslot(state, data.config);
  state.gold += price;
  state.events.push({ type: 'sell', uid: unit.uid, price });
  return { ok: true, price };
}

function swapUnits(state, fromRef, toRef, from, to, cfg) {
  if (fromRef.where === 'bench' && toRef.where === 'bench') {
    [state.bench[fromRef.index], state.bench[toRef.index]] = [to, from];
  } else if (fromRef.where === 'field' && toRef.where === 'field') {
    if (cfg?.muster) return { ok: true, kind: 'swap' };   // 자리는 역할이 정하므로 바꿀 것이 없음
    [from.pos, to.pos, from.targetPos, to.targetPos] = [to.pos, from.pos, to.targetPos, from.targetPos];
    [from.lane, to.lane, from.skyY, to.skyY] = [to.lane, from.lane, to.skyY, from.skyY];
    [from.home, to.home] = [to.home, from.home];
  } else {
    const [benchRef, benchUnit, fieldUnit] = fromRef.where === 'bench' ? [fromRef, from, to] : [toRef, to, from];
    removeUnit(state, { where: 'field', uid: fieldUnit.uid });
    takeOver(benchUnit, fieldUnit);
    Object.assign(fieldUnit, { home: null, moving: false, inGate: false, rushing: false, via: null });
    state.bench[benchRef.index] = fieldUnit;
    state.field.push(benchUnit);
    if (cfg) reslot(state, cfg);
  }
  return { ok: true, kind: 'swap' };
}

/** Drop one unit onto another: evolve, spirit, chimera, weak chimera, or swap. */
export function merge(state, data, fromRef, toRef) {
  const from = findUnit(state, fromRef), to = findUnit(state, toRef);
  if (!from || !to) return fail('notFound');
  if (from === to) return fail('same');
  if (from.down || to.down) return fail('down');
  const kind = mergeKind(from, to, data);
  if (kind === 'swap') return swapUnits(state, fromRef, toRef, from, to, data.config);
  const inst = mergeUnits(from, to, data, 0);
  if (kind === 'evolve') inst.traits = inheritEvolve(to.traits, from.traits);
  else if (kind === 'spirit') inst.traits = inheritSpirit(to.traits, from.traits);
  else if (kind === 'chimera') inst.traits = inheritChimera(to.traits, from.traits);
  else if (kind === 'weak') { const w = inheritWeak(to.traits, from.traits, data, state.rng); const always = eco(state, data, 'alwaysReversal'); inst.traits = always ? w.traits.map((t) => ({ ...t, flipped: true })) : w.traits; inst.reversal = w.reversal || !!always; }
  if (kind === 'evolve' || kind === 'spirit') inst.white = !!to.white;
  const unit = makeUnit(state, data, inst);
  if ((from.soul || to.soul) && kind !== 'weak') { unit.soul = true; unit.soulKills = (from.soulKills ?? 0) + (to.soulKills ?? 0); }
  const onField = toRef.where === 'field';
  if (onField) takeOver(unit, to);
  removeUnit(state, fromRef);
  removeUnit(state, toRef);
  if (onField) { state.field.push(unit); reslot(state, data.config); }
  else state.bench[toRef.index] = unit;
  if (kind === 'chimera') {
    if (!state.known.recipes.has(unit.speciesId)) state.finds.recipes.push(unit.speciesId);
    state.known.recipes.add(unit.speciesId);
  }
  if (kind === 'spirit') { state.madeSpirit = true; (state.finds.spirits ??= []).push(unit.speciesId); }
  if (kind === 'weak') {
    if (!state.known.failed.has(pairKey(...unit.parts))) state.finds.flops.push(pairKey(...unit.parts));
    state.known.failed.add(pairKey(...unit.parts));
    if (onField) {
      for (const e of state.enemies) {
        if (!e.boss && Math.abs(e.pos - unit.pos) <= data.config.weakStareRange) e.stunLeft = Math.max(e.stunLeft, data.config.weakStareSeconds);
      }
    }
  }
  state.events.push({ type: 'merge', kind, uid: unit.uid });
  return { ok: true, kind, unit };
}

/** Swap two units (bench or field) without merging. */
export function swap(state, data, fromRef, toRef) {
  const from = findUnit(state, fromRef), to = findUnit(state, toRef);
  if (!from || !to) return fail('notFound');
  if (from === to) return fail('same');
  return swapUnits(state, fromRef, toRef, from, to, data.config);
}

/**
 * Formation: with the gate muster everyone lines up in the gate and runs out to its role spot.
 * Without it (old free placement) the whole line marches to the middle of the field, keeping the gaps the player set.
 * Front-liners (melee) lead at config.formation.front, ranged stay at least `rangedGap` behind, flyers keep their sky spot.
 */
export function formUp(state, data) {
  const f = data.config.formation;
  if (data.config.muster) { state.formationDelta = 0; musterOut(state, data.config); return; }
  if (!f || !state.field.length) { state.formationDelta = 0; return; }
  for (const u of state.field) u.home = { pos: u.targetPos, lane: u.lane, skyY: u.skyY };
  const ground = state.field.filter((u) => !u.stats.flyer);
  const melee = ground.filter((u) => u.stats.range <= 1);
  const lead = melee.length ? Math.max(...melee.map((u) => u.home.pos)) : ground.length ? Math.max(...ground.map((u) => u.home.pos)) + f.rangedGap : Math.max(...state.field.map((u) => u.home.pos));
  const delta = Math.max(0, f.front - lead);
  state.formationDelta = delta;
  for (const u of state.field) {
    let p = u.home.pos + delta;
    if (!u.stats.flyer && u.stats.range > 1 && melee.length) p = Math.min(p, f.front - f.rangedGap);
    if (u.stats.flyer) p = Math.min(p, f.front + 0.5);
    u.targetPos = clampPos(p, data.config);
    u.formationMove = true;
  }
}

/** After a wave everyone walks back into the gate (muster) or to the spot the player chose. */
export function standDown(state, data) {
  if (data?.config.muster) { for (const u of state.field) { intoGate(u, data.config, state); u.home = null; u.engageCd = 0; } state.formationDelta = 0; return; }
  for (const u of state.field) {
    if (!u.home) continue;
    Object.assign(u, { pos: u.home.pos, targetPos: u.home.pos, lane: u.home.lane ?? u.lane, skyY: u.home.skyY ?? u.skyY, moving: false, formationMove: false });
    if (u.home.y != null) { u.y = u.home.y; u.targetY = u.home.y; }
    u.home = null; u.slot = null; u.engageCd = 0;
  }
  state.formationDelta = 0;
}

/** Begin the current wave. */
export function startWave(state, data) {
  formUp(state, data);
  state.queue = buildWave(state.stage, state.wave, data, state.rng);
  state.waveTime = 0;
  state.phase = 'wave';
  onWaveStart(state, data);
  state.events.push({ type: 'waveStart', wave: state.wave });
}

/** Skip the rest of the prep timer for bonus gold. */
export function skipPrep(state, data) {
  if (state.phase !== 'prep') return fail('notPrep');
  if (state.relicOffer) return fail('relic');
  const gold = skipGold(state.prepLeft, data.config);
  state.gold += gold;
  startWave(state, data);
  return { ok: true, gold };
}

function endWave(state, data) {
  onWaveEnd(state, data);
  standDown(state, data);
  state.gold += waveReward(state.wave, data.config) + (eco(state, data, 'waveBonus') ?? 0);
  const intr = eco(state, data, 'interest');
  if (intr) { const g = Math.min(intr[1], Math.floor(state.gold / intr[0])); state.gold += g; state.events.push({ type: 'interest', gold: g }); }
  if ((data.relicCfg?.offerWaves ?? []).includes(state.wave) && state.wave < state.stage.waves.length) { state.relicOffer = rollOffer(state, data); state.events.push({ type: 'relicOffer' }); }
  state.wavesCleared = state.wave;
  { const top = Object.entries(state.dmgWave ?? {}).map(([uid, d]) => ({ uid: +uid, ...d })).sort((a, b) => b.dmg - a.dmg).slice(0, 3); if (top.length) state.events.push({ type: 'mvp', wave: state.wave, top }); state.dmgWave = {}; }
  for (const u of state.field) Object.assign(u, { down: false, hp: u.maxHp ?? u.stats.hp, respawnLeft: 0 });
  state.events.push({ type: 'waveEnd', wave: state.wave });
  if (state.wave >= state.stage.waves.length) {
    state.phase = 'ended';
    state.result = 'clear';
  } else {
    state.wave += 1;
    state.phase = 'prep';
    state.prepLeft = data.config.prep.seconds;
  }
}

function subStep(state, data, d) {
  state.time += d;
  if (state.phase === 'prep') {
    if (state.relicOffer) return; // wait for the relic choice
    state.prepLeft -= d;
    if (state.prepLeft <= 0) startWave(state, data);
    return;
  }
  state.waveTime += d;
  let n = 0;
  while (n < state.queue.length && state.queue[n].at <= state.waveTime) n++;
  for (const q of state.queue.slice(0, n)) { { const en = makeEnemy(q.enemyId, state.wave, state.stage, data, state.nextEid++, q.offset); if (q.horde) { const h = data.config.horde; en.hp = en.maxHp = Math.max(1, Math.round(en.hp * h.hp)); en.attack = Math.round(en.attack * h.attack); en.gold = Math.max(1, Math.round(en.gold * h.gold)); en.horde = true; } if (en.y == null) { en.homeY = spawnDepth(en.eid); en.y = data.config.muster?.portalY ?? en.homeY; } state.enemies.push(en); } (state.seenEnemies ??= new Set()).add(q.enemyId); }
  state.queue = state.queue.slice(n);
  combatTick(state, data, d);
  tickMana(state, data, d);
  tickSoul(state, data, d);
  if (state.life <= 0) {
    state.life = 0;
    state.phase = 'ended';
    state.result = 'lose';
  } else if (!state.queue.length && !state.enemies.length) endWave(state, data);
}

/** Advance the battle by dt seconds in small sub-steps. */
export function step(state, data, dt) {
  const max = data.config.maxSubStep;
  let left = dt;
  while (left > 1e-9 && state.phase !== 'ended') {
    const d = Math.min(max, left);
    subStep(state, data, d);
    left -= d;
  }
}

export { chooseRelic, castSpell };

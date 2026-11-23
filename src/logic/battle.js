import { makeRng } from './rng.js';
import { pairKey } from './data.js';
import { summonCost, waveReward, sellPrice, skipGold } from './economy.js';
import { newRollCtx, rollSummon, advanceRollCtx, ownedSpecies } from './roulette.js';
import { unitStats } from './stats.js';
import { mergeKind, mergeUnits } from './merge.js';
import { buildWave, makeEnemy } from './waves.js';
import { combatTick, onWaveStart, onWaveEnd } from './combat.js';
import { rollTraits, inheritEvolve, inheritSpirit, inheritChimera, inheritWeak } from './traits.js';

const fail = (reason) => ({ ok: false, reason });
const freeSlot = (state) => state.bench.indexOf(null);
const releaseBlocked = (state, uid) => { for (const e of state.enemies) if (e.blockedBy === uid) e.blockedBy = null; };

/** New battle state for a stage. */
export function createBattle(data, stageId, seed = 1, opts = {}) {
  const stage = data.stageById[stageId];
  if (!stage) throw new Error('createBattle: unknown stage ' + stageId);
  const cfg = data.config;
  return {
    stage, rng: makeRng(seed), phase: 'prep', result: null,
    wave: 1, waveTime: 0, prepLeft: cfg.prep.seconds, time: 0,
    life: cfg.life, gold: cfg.startGold + (opts.startGoldBonus ?? 0), summonCount: 0, rollCtx: newRollCtx(),
    field: [], bench: Array(cfg.benchSize + (opts.benchBonus ?? 0)).fill(null), enemies: [], queue: [],
    nextUid: 1, nextEid: 1, events: [],
    known: { recipes: new Set(opts.known?.recipes ?? []), failed: new Set(opts.known?.failed ?? []) },
    levels: { ...(opts.levels ?? {}) }, allyBuffs: [], bait: null, kills: 0,
    finds: { recipes: [], flops: [], species: [], bonds: [] }, seenSpecies: new Set(opts.seenSpecies ?? []), seenBonds: new Set(opts.seenBonds ?? []),
  };
}

/** Wrap an instance into a live unit with a fresh uid. */
export function makeUnit(state, data, inst) {
  const stats = unitStats(inst, data);
  return { traits: [], ...inst, uid: state.nextUid++, stats, pos: 0, targetPos: 0, hp: stats.hp, maxHp: stats.hp, down: false, respawnLeft: 0,
    lastHitAt: -99, attackCd: 0, skillCd: {}, attackCount: 0, moving: false, temp: [] };
}

/** Total gold for one summon with optional continent / habitat designation. */
export function summonPrice(state, data, opts = {}) {
  const d = data.config.designate ?? { continent: 0, habitat: 0 };
  return summonCost(state.summonCount, data.config) + (opts.habitat ? d.habitat : opts.continent ? d.continent : 0);
}

/** Buy bait in the prep phase: the next N summons weigh that role ×mult. */
export function buyBait(state, data, type) {
  const b = data.config.bait;
  if (!b?.types?.[type]) return fail('notFound');
  if (b.prepOnly && state.phase !== 'prep') return fail('notPrep');
  if (state.gold < b.cost) return fail('gold');
  state.gold -= b.cost;
  state.bait = { type, left: b.summons };
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
  const roll = rollSummon(state.rollCtx, state.wave, data, state.rng, ownedSpecies(state),
    { continent: opts.habitat ? data.units.find((u) => u.habitat === opts.habitat)?.continent : opts.continent, habitat: opts.habitat, bait: state.bait?.type });
  if (state.bait) { state.bait.left -= 1; if (state.bait.left <= 0) state.bait = null; }
  const lvCfg = data.config.speciesLevel;
  const lv = state.levels?.[roll.unitId] ?? 1;
  const stage = lvCfg && lv >= 5 && state.rng() < lvCfg.teenChanceAt5 / 100 ? 'teen' : 'young';
  const white = (data.lore?.passives?.[roll.unitId]?.fx ?? []).some((f) => f.whiteChance && state.rng() < f.whiteChance / 100);
  const unit = makeUnit(state, data, { kind: 'base', speciesId: roll.unitId, stage, parts: null, white, traits: rollTraits(roll.unitId, data, state.rng, white) });
  if (!state.seenSpecies.has(roll.unitId)) { state.seenSpecies.add(roll.unitId); state.finds.species.push(roll.unitId); }
  state.bench[slot] = unit;
  state.gold -= cost;
  state.summonCount += 1;
  state.rollCtx = advanceRollCtx(state.rollCtx, data.unitById[roll.unitId], data.config);
  state.events.push({ type: 'summon', uid: unit.uid, roll });
  return { ok: true, unit, roll, cost };
}

/** True when pos keeps minSpacing from every other field unit. */
export function isFree(state, pos, ignoreUid, config) {
  return state.field.every((u) => u.uid === ignoreUid || Math.abs(u.targetPos - pos) >= config.minSpacing);
}

/** Keep a position half a tile inside the path. */
export function clampPos(pos, config) {
  return Math.min(config.pathLength - 0.5, Math.max(0.5, pos));
}

/** Move a bench unit onto the path. */
export function deploy(state, data, benchIndex, pos) {
  const cfg = data.config;
  const unit = state.bench[benchIndex];
  if (!unit) return fail('empty');
  if (state.field.length >= cfg.maxDeployed) return fail('fieldFull');
  const p = clampPos(pos, cfg);
  if (!isFree(state, p, null, cfg)) return fail('occupied');
  state.bench[benchIndex] = null;
  Object.assign(unit, { pos: p, targetPos: p, moving: false });
  state.field.push(unit);
  return { ok: true, unit };
}

/** Send a field unit walking to a new spot. */
export function moveUnit(state, data, uid, pos) {
  const unit = findUnit(state, { where: 'field', uid });
  if (!unit) return fail('notFound');
  if (unit.down) return fail('down');
  const p = clampPos(pos, data.config);
  if (!isFree(state, p, uid, data.config)) return fail('occupied');
  unit.targetPos = p;
  if (state.phase === 'prep') unit.pos = p; // nothing fights during prep, so the unit is placed at once
  return { ok: true };
}

/** Pull a field unit back to the bench. */
export function recall(state, data, uid) {
  const unit = findUnit(state, { where: 'field', uid });
  if (!unit) return fail('notFound');
  if (unit.down) return fail('down');
  const slot = freeSlot(state);
  if (slot < 0) return fail('benchFull');
  removeUnit(state, { where: 'field', uid });
  unit.moving = false;
  state.bench[slot] = unit;
  return { ok: true };
}

/** Sell a unit for gold. */
export function sell(state, data, ref) {
  const unit = findUnit(state, ref);
  if (!unit) return fail('notFound');
  const price = sellPrice(unit, data.config);
  removeUnit(state, ref);
  state.gold += price;
  state.events.push({ type: 'sell', uid: unit.uid, price });
  return { ok: true, price };
}

function swapUnits(state, fromRef, toRef, from, to) {
  if (fromRef.where === 'bench' && toRef.where === 'bench') {
    [state.bench[fromRef.index], state.bench[toRef.index]] = [to, from];
  } else if (fromRef.where === 'field' && toRef.where === 'field') {
    [from.pos, to.pos, from.targetPos, to.targetPos] = [to.pos, from.pos, to.targetPos, from.targetPos];
  } else {
    const [benchRef, benchUnit, fieldUnit] = fromRef.where === 'bench' ? [fromRef, from, to] : [toRef, to, from];
    removeUnit(state, { where: 'field', uid: fieldUnit.uid });
    Object.assign(benchUnit, { pos: fieldUnit.pos, targetPos: fieldUnit.targetPos, moving: false });
    fieldUnit.moving = false;
    state.bench[benchRef.index] = fieldUnit;
    state.field.push(benchUnit);
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
  if (kind === 'swap') return swapUnits(state, fromRef, toRef, from, to);
  const inst = mergeUnits(from, to, data, 0);
  if (kind === 'evolve') inst.traits = inheritEvolve(to.traits, from.traits);
  else if (kind === 'spirit') inst.traits = inheritSpirit(to.traits, from.traits);
  else if (kind === 'chimera') inst.traits = inheritChimera(to.traits, from.traits);
  else if (kind === 'weak') { const w = inheritWeak(to.traits, from.traits, data, state.rng); inst.traits = w.traits; inst.reversal = w.reversal; }
  if (kind === 'evolve' || kind === 'spirit') inst.white = !!to.white;
  const unit = makeUnit(state, data, inst);
  const onField = toRef.where === 'field';
  if (onField) Object.assign(unit, { pos: to.pos, targetPos: to.targetPos });
  removeUnit(state, fromRef);
  removeUnit(state, toRef);
  if (onField) state.field.push(unit);
  else state.bench[toRef.index] = unit;
  if (kind === 'chimera') {
    if (!state.known.recipes.has(unit.speciesId)) state.finds.recipes.push(unit.speciesId);
    state.known.recipes.add(unit.speciesId);
  }
  if (kind === 'spirit') state.madeSpirit = true;
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

/** Begin the current wave. */
export function startWave(state, data) {
  state.queue = buildWave(state.stage, state.wave, data, state.rng);
  state.waveTime = 0;
  state.phase = 'wave';
  onWaveStart(state, data);
  state.events.push({ type: 'waveStart', wave: state.wave });
}

/** Skip the rest of the prep timer for bonus gold. */
export function skipPrep(state, data) {
  if (state.phase !== 'prep') return fail('notPrep');
  const gold = skipGold(state.prepLeft, data.config);
  state.gold += gold;
  startWave(state, data);
  return { ok: true, gold };
}

function endWave(state, data) {
  onWaveEnd(state, data);
  state.gold += waveReward(state.wave, data.config);
  state.wavesCleared = state.wave;
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
    state.prepLeft -= d;
    if (state.prepLeft <= 0) startWave(state, data);
    return;
  }
  state.waveTime += d;
  let n = 0;
  while (n < state.queue.length && state.queue[n].at <= state.waveTime) n++;
  for (const q of state.queue.slice(0, n)) { state.enemies.push(makeEnemy(q.enemyId, state.wave, state.stage, data, state.nextEid++, q.offset)); (state.seenEnemies ??= new Set()).add(q.enemyId); }
  state.queue = state.queue.slice(n);
  combatTick(state, data, d);
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

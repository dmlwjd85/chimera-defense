import { makeRng } from './rng.js';
import { pairKey } from './data.js';
import { summonCost, waveReward, sellPrice, skipGold } from './economy.js';
import { newRollCtx, rollSummon, advanceRollCtx } from './roulette.js';
import { unitStats } from './stats.js';
import { mergeKind, mergeUnits } from './merge.js';
import { buildWave, makeEnemy } from './waves.js';
import { combatTick } from './combat.js';

const fail = (reason) => ({ ok: false, reason });
const freeSlot = (state) => state.bench.indexOf(null);
const releaseBlocked = (state, uid) => { for (const e of state.enemies) if (e.blockedBy === uid) e.blockedBy = null; };

/** New battle state for a stage. */
export function createBattle(data, stageId, seed = 1) {
  const stage = data.stageById[stageId];
  if (!stage) throw new Error('createBattle: unknown stage ' + stageId);
  const cfg = data.config;
  return {
    stage, rng: makeRng(seed), phase: 'prep', result: null,
    wave: 1, waveTime: 0, prepLeft: cfg.prep.seconds, time: 0,
    life: cfg.life, gold: cfg.startGold, summonCount: 0, rollCtx: newRollCtx(),
    field: [], bench: Array(cfg.benchSize).fill(null), enemies: [], queue: [],
    nextUid: 1, nextEid: 1, known: { recipes: new Set(), failed: new Set() }, events: [],
  };
}

/** Wrap an instance into a live unit with a fresh uid. */
export function makeUnit(state, data, inst) {
  const stats = unitStats(inst, data);
  return { ...inst, uid: state.nextUid++, stats, pos: 0, targetPos: 0, hp: stats.hp, down: false, respawnLeft: 0,
    lastHitAt: -99, attackCd: 0, skillCd: {}, attackCount: 0, moving: false };
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
export function summon(state, data) {
  if (state.phase === 'ended') return fail('ended');
  const cost = summonCost(state.summonCount, data.config);
  if (state.gold < cost) return fail('gold');
  const slot = freeSlot(state);
  if (slot < 0) return fail('benchFull');
  const roll = rollSummon(state.rollCtx, state.wave, data, state.rng);
  const unit = makeUnit(state, data, { kind: 'base', speciesId: roll.unitId, stage: 'young', parts: null });
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
  const unit = makeUnit(state, data, mergeUnits(from, to, data, 0));
  const onField = toRef.where === 'field';
  if (onField) Object.assign(unit, { pos: to.pos, targetPos: to.targetPos });
  removeUnit(state, fromRef);
  removeUnit(state, toRef);
  if (onField) state.field.push(unit);
  else state.bench[toRef.index] = unit;
  if (kind === 'chimera') state.known.recipes.add(unit.speciesId);
  if (kind === 'weak') {
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
  state.gold += waveReward(state.wave, data.config);
  for (const u of state.field) Object.assign(u, { down: false, hp: u.stats.hp, respawnLeft: 0 });
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
  for (const q of state.queue.slice(0, n)) state.enemies.push(makeEnemy(q.enemyId, state.wave, state.stage, data, state.nextEid++, q.offset));
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

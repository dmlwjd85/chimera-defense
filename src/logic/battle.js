import { makeRng } from './rng.js';
import { pairKey } from './data.js';
import { summonCost, waveReward, sellPrice, skipGold } from './economy.js';
import { newRollCtx, rollSummon, advanceRollCtx, ownedSpecies } from './roulette.js';
import { unitStats } from './stats.js';
import { mergeKind, mergeUnits } from './merge.js';
import { buildWave, makeEnemy } from './waves.js';
import { combatTick, onWaveStart, onWaveEnd } from './combat.js';
import { eco, rollOffer, chooseRelic } from './relics.js';
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
  state.cfgGrid = data.config.grid ?? null;
  state.meleeReach = data.config.meleeReach ?? 1;
  state.gold += eco(state, data, 'startGold') ?? 0;
  state.life += eco(state, data, 'life') ?? 0;
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
  return { traits: [], ...inst, uid: state.nextUid++, stats, pos: 0, targetPos: 0, hp: stats.hp, maxHp: stats.hp, down: false, respawnLeft: 0,
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
  const roll = rollSummon(state.rollCtx, state.wave, data, state.rng, ownedSpecies(state),
    { continent: opts.habitat ? data.units.find((u) => u.habitat === opts.habitat)?.continent : opts.continent, habitat: opts.habitat, bait: state.bait?.type, favor: state.favor, heroMult: eco(state, data, 'heroMult') ?? 1, sameExtra: eco(state, data, 'sameSpeciesExtra') ?? 0 });
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

// ---------- 내 진영 아홉 칸 (config.grid) ----------
/** Column index (0 back … cols-1 front) for a tile position, or -1 outside the camp. */
export function gridCol(pos, cfg) {
  const g = cfg.grid; if (!g) return -1;
  const c = Math.round((pos - g.x0) / g.step);
  if (pos < g.x0 - g.step / 2 - 0.01 || pos > g.x0 + (g.cols - 0.5) * g.step + 0.01) return -1;
  return Math.max(0, Math.min(g.cols - 1, c));
}
export const gridPos = (c, cfg) => cfg.grid.x0 + c * cfg.grid.step;
/** Who sits in cell (c, r), ignoring one uid. */
export function cellUnit(state, c, r, ignoreUid = null) { return state.field.find((u) => u.uid !== ignoreUid && u.cell && u.cell.c === c && u.cell.r === r) ?? null; }
/** Free row in a column nearest to the preferred one, or -1. */
export function freeRow(state, c, cfg, pref = 1, ignoreUid = null) {
  const rows = [...Array(cfg.grid.rows).keys()].sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref));
  return rows.find((r) => !cellUnit(state, c, r, ignoreUid)) ?? -1;
}
/** How far the whole camp marches when a wave starts. */
export const campDelta = (cfg) => (cfg.formation?.front ?? 0) - gridPos(cfg.grid.cols - 1, cfg);
/** Where column c stands while a wave runs: front column at formation.front, the others colGap apart (a bit tighter than the camp). */
export const battleSpot = (c, cfg) => (cfg.formation?.front ?? 0) - (cfg.grid.cols - 1 - c) * (cfg.formation?.colGap ?? cfg.grid.step);
/** Put a unit into a cell: lane / sky height follow the row; pos follows the column (shifted while a wave runs). */
function seat(state, cfg, unit, c, r) {
  unit.cell = { c, r };
  const home = gridPos(c, cfg);
  if (isFlyer(unit)) { unit.lane = null; unit.skyY = cfg.grid.skyY?.[r] ?? 190; } else unit.lane = r;
  unit.home = state.phase === 'wave' ? { pos: home, lane: unit.lane, skyY: unit.skyY } : null;
  unit.slot = battleSpot(c, cfg);
  return { home, target: state.phase === 'wave' ? clampPos(unit.slot, cfg) : home };
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

/** Move a bench unit onto the path. */
export function deploy(state, data, benchIndex, pos, opts = {}) {
  const cfg = data.config;
  const unit = state.bench[benchIndex];
  if (!unit) return fail('empty');
  if (state.field.length >= cfg.maxDeployed) return fail('fieldFull');
  if (cfg.grid) {
    const c = gridCol(pos, cfg);
    if (c < 0) return fail('outsideCamp');
    const r = opts.row ?? (opts.lane !== undefined ? opts.lane : freeRow(state, c, cfg));
    if (r < 0 || cellUnit(state, c, r)) return fail('occupied');
    state.bench[benchIndex] = null;
    const { home, target } = seat(state, cfg, unit, c, r);
    Object.assign(unit, { pos: home, targetPos: target, moving: false, formationMove: state.phase === 'wave' });
    state.field.push(unit);
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

/** Send a field unit walking to a new spot. */
export function moveUnit(state, data, uid, pos, opts = {}) {
  const unit = findUnit(state, { where: 'field', uid });
  if (!unit) return fail('notFound');
  if (unit.down) return fail('down');
  const cfg = data.config;
  if (cfg.grid) {
    const c = gridCol(pos, cfg);
    if (c < 0) return fail('outsideCamp');
    const r = opts.row ?? (opts.lane !== undefined ? opts.lane : freeRow(state, c, cfg, unit.cell?.r ?? 1, uid));
    if (r < 0 || cellUnit(state, c, r, uid)) return fail('occupied');
    const { home, target } = seat(state, cfg, unit, c, r);
    unit.targetPos = target; unit.formationMove = state.phase === 'wave';
    if (state.phase === 'prep') unit.pos = home;
    return { ok: true };
  }
  const p = clampPos(pos, data.config);
  if (!isFree(state, p, uid, data.config, unit)) return fail('occupied');
  place(state, data.config, unit, p, opts);
  unit.targetPos = p;
  unit.formationMove = false;
  if (state.phase === 'wave' && unit.home) unit.home = { pos: clampPos(p - (state.formationDelta ?? 0), data.config), lane: unit.lane, skyY: unit.skyY };
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
    [from.lane, to.lane, from.skyY, to.skyY] = [to.lane, from.lane, to.skyY, from.skyY];
    [from.cell, to.cell, from.home, to.home] = [to.cell, from.cell, to.home, from.home];
    for (const u of [from, to]) if (u.cell && state.cfgGrid) { if (u.stats.flyer) { u.lane = null; u.skyY = state.cfgGrid.skyY[u.cell.r]; } else u.lane = u.cell.r; }
  } else {
    const [benchRef, benchUnit, fieldUnit] = fromRef.where === 'bench' ? [fromRef, from, to] : [toRef, to, from];
    removeUnit(state, { where: 'field', uid: fieldUnit.uid });
    Object.assign(benchUnit, { pos: fieldUnit.pos, targetPos: fieldUnit.targetPos, moving: false, lane: fieldUnit.lane ?? 1, skyY: fieldUnit.skyY ?? 200, cell: fieldUnit.cell, home: fieldUnit.home });
    if (benchUnit.cell && state.cfgGrid) { if (benchUnit.stats.flyer) { benchUnit.lane = null; benchUnit.skyY = state.cfgGrid.skyY[benchUnit.cell.r]; } else benchUnit.lane = benchUnit.cell.r; }
    fieldUnit.cell = null; fieldUnit.home = null;
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
  else if (kind === 'weak') { const w = inheritWeak(to.traits, from.traits, data, state.rng); const always = eco(state, data, 'alwaysReversal'); inst.traits = always ? w.traits.map((t) => ({ ...t, flipped: true })) : w.traits; inst.reversal = w.reversal || !!always; }
  if (kind === 'evolve' || kind === 'spirit') inst.white = !!to.white;
  const unit = makeUnit(state, data, inst);
  const onField = toRef.where === 'field';
  if (onField) { Object.assign(unit, { pos: to.pos, targetPos: to.targetPos, lane: unit.stats.flyer ? null : (to.lane ?? 1), skyY: to.skyY ?? 200, cell: to.cell, home: to.home }); if (unit.cell && state.cfgGrid) { if (unit.stats.flyer) { unit.lane = null; unit.skyY = state.cfgGrid.skyY[unit.cell.r]; } else unit.lane = unit.cell.r; } }
  removeUnit(state, fromRef);
  removeUnit(state, toRef);
  if (onField) state.field.push(unit);
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
  return swapUnits(state, fromRef, toRef, from, to);
}

/**
 * Formation: when a wave starts the whole line marches to the middle of the field, keeping the gaps the player set.
 * Front-liners (melee) lead at config.formation.front, ranged stay at least `rangedGap` behind, flyers keep their sky spot.
 */
export function formUp(state, data) {
  const f = data.config.formation;
  if (!f || !state.field.length) { state.formationDelta = 0; return; }
  if (data.config.grid) {
    const d = campDelta(data.config);
    state.formationDelta = d;
    for (const u of state.field) {
      const c = u.cell?.c ?? gridCol(u.targetPos, data.config);
      const home = gridPos(Math.max(0, c), data.config);
      u.home = { pos: home, lane: u.lane, skyY: u.skyY };
      u.slot = battleSpot(Math.max(0, c), data.config);
      u.targetPos = clampPos(u.slot, data.config);
      u.formationMove = true;
    }
    return;
  }
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

/** After a wave everyone goes back to the spot the player chose. */
export function standDown(state) {
  for (const u of state.field) {
    if (!u.home) continue;
    Object.assign(u, { pos: u.home.pos, targetPos: u.home.pos, lane: u.home.lane ?? u.lane, skyY: u.home.skyY ?? u.skyY, moving: false, formationMove: false });
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
  standDown(state);
  state.gold += waveReward(state.wave, data.config) + (eco(state, data, 'waveBonus') ?? 0);
  const intr = eco(state, data, 'interest');
  if (intr) { const g = Math.min(intr[1], Math.floor(state.gold / intr[0])); state.gold += g; state.events.push({ type: 'interest', gold: g }); }
  if ((data.relicCfg?.offerWaves ?? []).includes(state.wave) && state.wave < state.stage.waves.length) { state.relicOffer = rollOffer(state, data); state.events.push({ type: 'relicOffer' }); }
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
    if (state.relicOffer) return; // wait for the relic choice
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

export { chooseRelic };

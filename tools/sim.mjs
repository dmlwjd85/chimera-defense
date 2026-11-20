// Stage 1 auto-play simulator: node tools/sim.mjs [runs=20] [startSeed=1] [--detail]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildData } from '../src/logic/data.js';
import { createBattle, step, summon, deploy, merge, skipPrep } from '../src/logic/battle.js';
import { mergeKind } from '../src/logic/merge.js';
import { summonCost } from '../src/logic/economy.js';
import { newRollCtx, rollSummon, advanceRollCtx } from '../src/logic/roulette.js';
import { makeRng } from '../src/logic/rng.js';

const NAMES = ['config', 'units', 'recipes', 'enemies', 'stages'];
const SPOTS = [3, 4.5, 6, 7.5, 2, 9];
const PRIORITY = ['chimera', 'evolve', 'spirit'];
const DT = 0.05, TURN = 0.5, MAX_TIME = 3600;

/** Load the five data JSON files into lookup data. */
export function loadData() {
  const raw = {};
  for (const n of NAMES) raw[n] = JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8'));
  return buildData(raw);
}

/** Every live unit with its ref, field units first. */
function unitRefs(state) {
  return [
    ...state.field.map((u) => ({ u, ref: { where: 'field', uid: u.uid } })),
    ...state.bench.map((u, index) => (u ? { u, ref: { where: 'bench', index } } : null)).filter(Boolean),
  ];
}

/** First pair (dragged a onto target b) for a merge kind; b prefers field units. */
export function findMergePair(state, data, kind) {
  const all = unitRefs(state);
  for (const b of all) {
    for (const a of all) {
      if (a.u === b.u || a.u.down || b.u.down) continue;
      if (mergeKind(a.u, b.u, data) === kind) return [a.ref, b.ref];
    }
  }
  return null;
}

/** Deploy spots in order: melee hold the middle, ranged stand just behind the front blocker within reach. */
export function deploySpots(state, unit) {
  const melee = unit.stats.range <= 1;
  if (melee) return [...SPOTS].sort((x, y) => Math.abs(x - 6) - Math.abs(y - 6) || y - x);
  const blockers = state.field.filter((u) => u.stats.block >= 2 || u.stats.range <= 1);
  const front = blockers.length ? Math.max(...blockers.map((u) => u.pos)) : 6;
  const reach = unit.stats.range;
  return [...SPOTS].sort((x, y) => {
    const sx = x <= front && front - x <= reach - 0.5 ? 0 : 1, sy = y <= front && front - y <= reach - 0.5 ? 0 : 1;
    return sx - sy || Math.abs(front - 1 - x) - Math.abs(front - 1 - y);
  });
}

/** Try the deploy spots in role order; true when one worked. */
function deployFirst(state, data) {
  const index = state.bench.findIndex(Boolean);
  if (index < 0) return false;
  return deploySpots(state, state.bench[index]).some((p) => deploy(state, data, index, p).ok);
}

/** One bot decision round: merge, summon, deploy. */
export function botTurn(state, data, opts = {}) {
  const crowded = () => state.field.length + state.bench.filter(Boolean).length > data.config.maxDeployed || !state.bench.includes(null);
  for (let i = 0; i < 3; i++) {
    if (opts.mergeWhenCrowded && !crowded()) break;
    let done = false;
    for (const kind of PRIORITY) {
      const pair = findMergePair(state, data, kind);
      if (pair && merge(state, data, pair[0], pair[1]).ok) { done = true; break; }
    }
    if (!done) break;
  }
  for (let i = 0; i < 2; i++) {
    if (!state.bench.includes(null) || state.gold < summonCost(state.summonCount, data.config)) break;
    if (!summon(state, data).ok) break;
  }
  while (state.field.length < data.config.maxDeployed && state.bench.some(Boolean)) {
    if (!deployFirst(state, data)) break;
  }
}

/** Short label of a unit for the report. */
const label = (u) => `${u.kind}:${u.speciesId ?? u.parts.join('+')}:${u.stage}`;

/** Play one full stage with the bot; returns a summary (and per-wave log). */
export function runOne(data, seed, opts = {}) {
  const state = createBattle(data, 'forest-1', seed);
  const waves = [];
  let nextTurn = 0, lastWave = 0, lifeAtStart = state.life;
  while (state.phase !== 'ended' && state.time < MAX_TIME) {
    if (state.time >= nextTurn) {
      botTurn(state, data, opts);
      if (opts.skip && state.phase === 'prep') skipPrep(state, data);
      nextTurn += TURN;
    }
    if (state.phase === 'wave' && state.wave !== lastWave) { lastWave = state.wave; lifeAtStart = state.life; }
    const before = state.wave;
    step(state, data, DT);
    if (state.wave !== before || state.phase === 'ended') {
      waves.push({ wave: before, leak: lifeAtStart - state.life, gold: state.gold, summons: state.summonCount, field: state.field.map(label) });
    }
  }
  return {
    seed, result: state.result ?? 'timeout', wave: state.wave, life: state.life, summons: state.summonCount,
    gold: state.gold, time: Math.round(state.time), field: state.field.map(label), waves,
  };
}

/**
 * Summon luck only (no combat): over many runs of `count` summons spread across the stage's waves,
 * how often one species reaches 8 (one spirit) and how often a recipe pair reaches 4 + 4 (one chimera).
 */
export function rollStats(data, trials = 2000, count = 24, seed = 1) {
  const rng = makeRng(seed);
  const waves = data.stageById['forest-1'].waves.length;
  let spirit = 0, chimera = 0, both = 0, maxSum = 0;
  for (let t = 0; t < trials; t++) {
    let ctx = newRollCtx();
    const n = {};
    for (let i = 0; i < count; i++) {
      const wave = 1 + Math.floor((i * waves) / count);
      const r = rollSummon(ctx, wave, data, rng);
      n[r.unitId] = (n[r.unitId] ?? 0) + 1;
      ctx = advanceRollCtx(ctx, data.unitById[r.unitId], data.config);
    }
    const max = Math.max(...Object.values(n));
    maxSum += max;
    const hasSpirit = max >= 8;
    const hasChimera = data.recipes.some((rc) => (n[rc.parts[0]] ?? 0) >= 4 && (n[rc.parts[1]] ?? 0) >= 4);
    const hasBoth = data.recipes.some((rc) => Object.keys(n).some((sp) => !rc.parts.includes(sp) && n[sp] >= 8) && (n[rc.parts[0]] ?? 0) >= 4 && (n[rc.parts[1]] ?? 0) >= 4);
    spirit += hasSpirit; chimera += hasChimera; both += hasBoth;
  }
  return { trials, count, spiritPct: (100 * spirit) / trials, chimeraPct: (100 * chimera) / trials, bothPct: (100 * both) / trials, avgMaxSame: maxSum / trials };
}

/** Parse --key=value flags into a plain object. */
export function parseFlags(argv) {
  const flags = {};
  for (const a of argv.filter((x) => x.startsWith('--'))) {
    const [k, v] = a.slice(2).split('=');
    flags[k] = v === undefined ? true : Number(v);
  }
  return flags;
}

/** Balance knobs for what-if runs (never written back to the JSON files). */
export function applyKnobs(data, flags) {
  if (flags.hpGrowth !== undefined) data.config.enemyHpGrowth = flags.hpGrowth;
  if (flags.startGold !== undefined) data.config.startGold = flags.startGold;
  if (flags.enemyHp !== undefined) for (const e of data.enemies) if (!e.boss) e.hp *= flags.enemyHp;
  if (flags.bossHp !== undefined) for (const e of data.enemies) if (e.boss) e.hp = flags.bossHp;
  return data;
}

/** Run many seeds and print one line each plus a summary. */
export function main(argv) {
  const nums = argv.filter((a) => !a.startsWith('--'));
  const runs = Number(nums[0] ?? 20), start = Number(nums[1] ?? 1);
  const flags = parseFlags(argv);
  const data = applyKnobs(loadData(), flags);
  if (flags.roll) {
    const r = rollStats(data, runs * 100, flags.summons ?? 24, start);
    console.log(`roll: ${r.trials} runs x ${r.count} summons -> one species 8+ ${r.spiritPct.toFixed(1)}%, recipe pair 4+4 ${r.chimeraPct.toFixed(1)}%, both ${r.bothPct.toFixed(1)}%, avg max same species ${r.avgMaxSame.toFixed(2)}`);
    return [];
  }
  const opts = { mergeWhenCrowded: !!flags.crowded, skip: !!flags.skip };
  const rs = [];
  for (let s = start; s < start + runs; s++) {
    const r = runOne(data, s, opts);
    rs.push(r);
    if (!flags.quiet) console.log(`seed=${r.seed} result=${r.result} wave=${r.wave} life=${r.life} summons=${r.summons} time=${r.time}s field=[${r.field.join(', ')}]`);
    if (flags.detail) for (const w of r.waves) console.log(`  w${w.wave} leak=${w.leak} gold=${w.gold} summons=${w.summons} field=[${w.field.join(', ')}]`);
  }
  const clear = rs.filter((r) => r.result === 'clear').length;
  const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  console.log(`clear ${clear}/${rs.length} (${Math.round((clear / rs.length) * 100)}%), avg summons ${avg((r) => r.summons)}, avg life ${avg((r) => r.life)}, avg wave ${avg((r) => r.wave)}`);
  return rs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));

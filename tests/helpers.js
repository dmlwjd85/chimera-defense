import { readFileSync } from 'node:fs';
import { buildData } from '../src/logic/data.js';

const NAMES = ['config', 'units', 'recipes', 'enemies', 'stages', 'traits', 'lore', 'relics', 'tales', 'talents', 'story'];
export function loadRaw() {
  const raw = {};
  for (const n of NAMES) raw[n] = JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8'));
  return raw;
}
export function loadData() { return buildData(loadRaw()); }
/** Data without the 2026-11-20 balance proposals (damageBoost, sameSpecies), for formula tests written against plan numbers. */
export function loadPlanData() {
  const raw = loadRaw();
  delete raw.config.damageBoost;
  delete raw.config.sameSpecies;
  delete raw.config.tempo;
  return buildData(raw);
}

/** Field unit for tests (base species). */
export async function mkUnit(D, uid, speciesId, stage, pos, extra = {}) {
  const { unitStats } = await import('../src/logic/stats.js');
  const inst = { uid, kind: 'base', speciesId, stage, parts: null };
  const stats = unitStats(inst, D);
  return { ...inst, stats, pos, targetPos: pos, hp: stats.hp, down: false, respawnLeft: 0, lastHitAt: -99, attackCd: 0, skillCd: {}, attackCount: 0, moving: false, ...extra };
}

/** Live enemy for tests at a given tile position. */
export async function mkEnemy(D, id, pos, eid = 1) {
  const { makeEnemy } = await import('../src/logic/waves.js');
  return { ...makeEnemy(id, 1, D.stages[0], D, eid), pos };
}

/** Minimal battle state for tests. */
export function mkState(D, field, enemies) {
  return { stage: D.stages[0], rng: () => 0.99, phase: 'wave', result: null, wave: 1, waveTime: 0, prepLeft: 0, time: 100, life: 20, gold: 0,
    field, bench: [], enemies, queue: [], nextUid: 99, nextEid: 99, known: { recipes: new Set(), failed: new Set() }, events: [] };
}

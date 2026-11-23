import { randInt } from './rng.js';

/**
 * Enemy stat multiplier for a wave and stage.
 */
export function enemyScale(wave, stage, config) {
  return (1 + config.enemyHpGrowth * (wave - 1)) * stage.mult;
}

/**
 * Number of base slots in a wave.
 */
export function waveSize(wave, config) {
  return config.waveCount.base + config.waveCount.perWave * wave;
}

/** Split total into per-id counts by percent (largest remainder, ties by mix order). */
export function slotCounts(mix, total) {
  const rows = Object.keys(mix).map((id, i) => {
    const exact = (total * mix[id]) / 100;
    return { id, i, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  const counts = Object.fromEntries(rows.map((r) => [r.id, r.base]));
  let left = total - rows.reduce((s, r) => s + r.base, 0);
  const order = [...rows].sort((a, b) => (Math.abs(b.frac - a.frac) > 1e-9 ? b.frac - a.frac : a.i - b.i));
  for (let k = 0; left > 0; k++, left--) counts[order[k % order.length].id] += 1;
  return counts;
}

/** Build the spawn schedule for one wave. */
export function buildWave(stage, wave, data, rng) {
  if (!Number.isInteger(wave) || wave < 1 || wave > stage.waves.length) throw new Error('buildWave: bad wave ' + wave);
  const cfg = data.config;
  const spec = stage.waves[wave - 1];
  const counts = slotCounts(spec.mix, waveSize(wave, cfg));
  const slots = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(id));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const out = [];
  let t = 0, i = 0, lastSlotAt = 0;
  while (i < slots.length) {
    const size = Math.min(randInt(rng, cfg.groupMin, cfg.groupMax), slots.length - i);
    for (let j = 0; j < size; j++, i++) {
      const def = data.enemyById[slots[i]];
      if (!def) throw new Error('buildWave: unknown enemy ' + slots[i]);
      const n = def.spawnCount > 1 ? def.spawnCount : 1;
      for (let k = 0; k < n; k++) out.push({ at: t, enemyId: def.id, offset: k * cfg.swarmSpacing });
      lastSlotAt = t;
      t += cfg.inGroupGap;
    }
    t += cfg.groupGap - cfg.inGroupGap;
  }
  for (const id of spec.extra ?? []) out.push({ at: lastSlotAt + cfg.bossDelay, enemyId: id, offset: 0 });
  return out;
}

/**
 * Create a live enemy instance for a wave.
 */
export function makeEnemy(enemyId, wave, stage, data, eid, offset = 0) {
  const def = data.enemyById[enemyId];
  if (!def) {
    throw new Error('makeEnemy: unknown enemy id ' + enemyId);
  }

  const cfg = data.config;
  const clim = cfg.climates?.[stage.climate]?.enemy;
  const s = def.scaleWithWave ? enemyScale(wave, stage, cfg) : (def.stageMultHp ? stage.mult : 1);
  const hp = Math.round(def.hp * s * (cfg.difficulty?.enemyHp ?? 1));

  return {
    eid: eid,
    id: enemyId,
    pos: cfg.pathLength + offset,
    hp,
    maxHp: hp,
    attack: Math.round(def.attack * s * (cfg.tempo?.enemy ?? 1) * (cfg.difficulty?.enemyAttack ?? 1)),
    interval: def.interval * (cfg.tempo?.enemy ?? 1),
    speed: def.speed * ((def.flying ? clim?.flySpeed : clim?.speed) ?? 1),
    gold: def.gold,
    leak: def.leak,
    flying: !!def.flying,
    blockSlots: def.blockSlots ?? 1,
    boss: !!def.boss,
    heal: def.heal ?? null,
    holdFactor: def.holdFactor ?? 1,
    slowFactor: def.slowFactor ?? 1,
    pattern: def.pattern ?? null,
    resist: def.resist ?? null,
    weak: def.weak ?? null,
    revive: def.revive ?? null,
    kin: def.kin ?? null,
    blockedBy: null,
    lastHitBy: null,
    holdLeft: 0,
    stunLeft: 0,
    slowPct: 0,
    slowLeft: 0,
    poisonDps: 0,
    poisonLeft: 0,
    confuseLeft: 0,
    attackCd: 0,
    healCd: def.heal ? def.heal.every : 0,
    chargeLeft: 0,
    chargeCd: 0,
    patternCd: def.pattern?.every ?? 0,
    shieldLeft: 0,
    shieldHits: 0,
    markPct: 0,
    markLeft: 0,
    intervalMult: 1,
    poisonBy: null
  };
}


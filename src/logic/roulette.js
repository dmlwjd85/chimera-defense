import { pickWeighted } from './rng.js';

/** Rarity ratios (0..1) for the demo band containing this wave. */
export function rarityTable(wave, config) {
  const rows = config.demoRarity;
  const row = rows.find((r) => wave >= r.fromWave && wave <= r.toWave) ?? (wave < rows[0].fromWave ? rows[0] : rows[rows.length - 1]);
  return { common: row.common / 100, rare: row.rare / 100, hero: row.hero / 100 };
}

/**
 * Creates a new roll context object.
 */
export function newRollCtx() {
  return { summonIndex: 0, sinceHero: 0, firstWasRanged: false };
}

const restrict = (list, pred) => { const r = list.filter(pred); return r.length ? r : list; };

/** Per-unit summon chances (sum 1) after pity and first-summon rules. */
export function unitChances(ctx, wave, data) {
  const { config, units } = data;
  const table = rarityTable(wave, config);
  const perRarity = {};
  for (const u of units) perRarity[u.rarity] = (perRarity[u.rarity] ?? 0) + 1;
  let pool = units.filter((u) => table[u.rarity] > 0);
  if (ctx.sinceHero >= config.pityCount) pool = restrict(pool, (u) => u.rarity === 'hero');
  if (ctx.summonIndex === 1 && !ctx.firstWasRanged) pool = restrict(pool, (u) => u.range >= config.flyingMinRange);
  const raw = pool.map((u) => [u.id, table[u.rarity] / perRarity[u.rarity]]);
  const sum = raw.reduce((s, [, p]) => s + p, 0);
  return Object.fromEntries(raw.map(([id, p]) => [id, p / sum]));
}

/**
 * Roll one summon and report continent/habitat odds for the roulette.
 */
export function rollSummon(ctx, wave, data, rng) {
  const chances = unitChances(ctx, wave, data);
  
  const entries = Object.entries(chances);
  const unitId = pickWeighted(rng, entries);

  if (!unitId || !data.unitById[unitId]) {
    throw new Error('rollSummon: no valid unit selected');
  }

  const unit = data.unitById[unitId];

  const continentChances = {};
  for (const [id, chance] of entries) {
    const u = data.unitById[id];
    if (!continentChances[u.continent]) {
      continentChances[u.continent] = 0;
    }
    continentChances[u.continent] += chance;
  }

  const habitatChances = {};
  const totalContinentChance = continentChances[unit.continent];
  
  if (totalContinentChance > 0) {
    for (const [id, chance] of entries) {
      const u = data.unitById[id];
      if (u.continent === unit.continent) {
        habitatChances[u.habitat] = (habitatChances[u.habitat] ?? 0) + chance / totalContinentChance;
      }
    }
  }

  return {
    unitId,
    continent: unit.continent,
    habitat: unit.habitat,
    chances,
    continentChances,
    habitatChances
  };
}

/**
 * Advances the roll context after a summon.
 */
export function advanceRollCtx(ctx, unit, config) {
  return {
    summonIndex: ctx.summonIndex + 1,
    sinceHero: unit.rarity === 'hero' ? 0 : ctx.sinceHero + 1,
    firstWasRanged: ctx.summonIndex === 0 
      ? unit.range >= config.flyingMinRange 
      : ctx.firstWasRanged
  };
}

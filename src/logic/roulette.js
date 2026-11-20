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

const YOUNG_EQUIV = { young: 1, teen: 2, adult: 4 };

/** Species the player can still grow (base young/teen/adult on field or bench) -> count in young units. */
export function ownedSpecies(state) {
  const ids = new Map();
  for (const u of [...state.field, ...state.bench]) {
    if (u && u.kind === 'base' && u.stage !== 'spirit') ids.set(u.speciesId, (ids.get(u.speciesId) ?? 0) + YOUNG_EQUIV[u.stage]);
  }
  return ids;
}

/**
 * Same-species summon rule (config.sameSpecies): each young-equivalent the player holds of this species adds
 * `perUnit` to its weight (1 = normal), and each one held of a chimera partner species adds `partnerPerUnit`.
 */
export function sameSpeciesFactor(id, owned, data) {
  const rule = data.config.sameSpecies;
  if (!rule || !owned || owned.size === 0) return 1;
  let partners = 0;
  for (const r of data.recipes) {
    if (!r.parts.includes(id)) continue;
    for (const p of r.parts) if (p !== id) partners += owned.get(p) ?? 0;
  }
  return 1 + (rule.perUnit ?? 0) * (owned.get(id) ?? 0) + (rule.partnerPerUnit ?? 0) * partners;
}

/** Per-unit summon chances (sum 1) after pity, first-summon and same-species rules. */
export function unitChances(ctx, wave, data, owned = null) {
  const { config, units } = data;
  const table = rarityTable(wave, config);
  const perRarity = {};
  for (const u of units) perRarity[u.rarity] = (perRarity[u.rarity] ?? 0) + 1;
  let pool = units.filter((u) => table[u.rarity] > 0);
  if (ctx.sinceHero >= config.pityCount) pool = restrict(pool, (u) => u.rarity === 'hero');
  if (ctx.summonIndex === 1 && !ctx.firstWasRanged) pool = restrict(pool, (u) => u.range >= config.flyingMinRange);
  const raw = pool.map((u) => [u.id, (table[u.rarity] / perRarity[u.rarity]) * sameSpeciesFactor(u.id, owned, data)]);
  const sum = raw.reduce((s, [, p]) => s + p, 0);
  return Object.fromEntries(raw.map(([id, p]) => [id, p / sum]));
}

/**
 * Roll one summon and report continent/habitat odds for the roulette.
 */
export function rollSummon(ctx, wave, data, rng, owned = null) {
  const chances = unitChances(ctx, wave, data, owned);
  
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

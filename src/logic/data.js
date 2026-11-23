const LIST_KEYS = ['units', 'recipes', 'enemies', 'stages'];

/** Canonical order-independent key for a pair of ids. */
export function pairKey(a, b) {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

/** Map list items by id, rejecting duplicates. */
function indexById(list) {
  const out = {};
  for (const item of list) {
    if (item.id in out) throw new Error('buildData: duplicate id ' + item.id);
    out[item.id] = item;
  }
  return out;
}

/** Validate raw JSON and build lookup tables. */
export function buildData(raw) {
  if (!raw || typeof raw.config !== 'object' || raw.config === null || Array.isArray(raw.config)) throw new Error('buildData: missing config');
  for (const key of LIST_KEYS) if (!Array.isArray(raw[key])) throw new Error('buildData: missing ' + key);
  const { config, units, recipes, enemies, stages } = raw;
  const recipeByPair = {};
  for (const r of recipes) {
    if (!Array.isArray(r.parts) || r.parts.length !== 2) throw new Error('buildData: invalid recipe parts ' + r.id);
    recipeByPair[pairKey(r.parts[0], r.parts[1])] = r;
  }
  return {
    config, units, recipes, enemies, stages, recipeByPair,
    traits: raw.traits ?? {}, lore: raw.lore ?? { passives: {}, bonds: [] },
    relicCfg: raw.relics ?? { offerWaves: [], relics: [] }, relicById: Object.fromEntries((raw.relics?.relics ?? []).map((r) => [r.id, r])),
    unitById: indexById(units), recipeById: indexById(recipes),
    enemyById: indexById(enemies), stageById: indexById(stages),
  };
}

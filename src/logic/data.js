const LIST_KEYS = ['units', 'recipes', 'enemies', 'stages'];
import { autoRecipes, sameClass } from './genes.js';

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
  const { config, units, enemies, stages } = raw;
  for (const r of raw.recipes) if (!Array.isArray(r.parts) || r.parts.length !== 2) throw new Error('buildData: invalid recipe parts ' + r.id);
  // 염색체 합성: 강이 다른 옛 조합(치즈 도둑·황소개구리)은 막힘(oldRecipes, 그림·저장은 그대로), 같은 강 빈 짝은 자동 키메라
  // 강이 다른 짝은 '기적의 키메라'(crossRecipes): 이야기 조합(치즈 도둑·황소개구리 + 전설 6)과 자동 이종 키메라
  const ok = (r) => !config.genes || sameClass(r.parts[0], r.parts[1], { config });
  const autos = autoRecipes(units, raw.recipes, config);
  const story = raw.recipes.filter(ok), oldRecipes = raw.recipes.filter((r) => !ok(r)).map((r) => ({ ...r, cross: true, legend: true }));
  const recipes = [...story, ...autos.filter((r) => !r.cross)];
  const crossRecipes = [...oldRecipes, ...autos.filter((r) => r.cross)];
  const recipeByPair = {};
  for (const r of [...recipes, ...crossRecipes]) recipeByPair[pairKey(r.parts[0], r.parts[1])] = r;
  return {
    config, units, recipes, crossRecipes, oldRecipes, enemies, stages, recipeByPair,
    traits: raw.traits ?? {}, lore: raw.lore ?? { passives: {}, bonds: [] },
    tales: raw.tales ?? {}, talents: raw.talents ?? { branches: [], costs: [] }, talentById: Object.fromEntries((raw.talents?.branches ?? []).flatMap((b) => b.nodes.map((n, i) => [n.id, { ...n, branch: b.id, index: i }]))), relicCfg: raidRelics(raw), relicById: Object.fromEntries((raidRelics(raw).relics ?? []).map((r) => [r.id, r])),
    unitById: indexById(units), recipeById: indexById([...recipes, ...crossRecipes]),
    enemyById: indexById(enemies), stageById: indexById(stages),
    battlefield: raw.battlefield ?? null,
    raid: raw.raid && typeof raw.raid === 'object' ? raw.raid : null,   // 보스 레이드 패턴(public/data/raid.json, 없거나 비면 지금 규칙)   // 교전 땅·성·차원문 자리(public/data/battlefield.json)
  };
}

/** 보스 레이드 유물(raid: true)은 raid.json에 보스가 있을 때만 나옴 — 비어 있으면 유물 뽑기도 예전과 똑같이 */
function raidRelics(raw) {
  const rc = raw.relics ?? { offerWaves: [], relics: [] };
  if (raw.raid?.bosses) return rc;
  return { ...rc, relics: (rc.relics ?? []).filter((r) => !r.raid) };
}

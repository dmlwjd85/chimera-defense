// Outside-the-run progress (plan ch.10): essence, unlocks, species levels, codex, hints, achievements, local save.
export const SAVE_KEY = 'chimera-defense-save-v1';

export function defaultSave() {
  return {
    version: 1, essence: 0,
    unlocks: { startGold: 0, bench: 0 },
    codex: { units: [], recipes: [], failedPairs: [], enemies: [], bonds: [] },
    hintShards: 0, hints: {},
    speciesXp: {},
    stages: {},
    achievements: [],
    shards: 0, talents: [],
    tutorialDone: false,
    settings: { fastRoulette: false },
  };
}

/** Read the save from a Storage-like object; broken or missing data gives a fresh save. */
export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    const d = defaultSave();
    return { ...d, ...s, unlocks: { ...d.unlocks, ...s.unlocks }, codex: { ...d.codex, ...s.codex }, settings: { ...d.settings, ...s.settings } };
  } catch { return defaultSave(); }
}

export function writeSave(storage, save) {
  try { storage?.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch { return false; }
}

/** { level, xp, need } for accumulated species xp. Next level needs 20 × current level, max level 10. */
export function levelInfo(totalXp, cfg) {
  const per = cfg.speciesLevel.xpPerLevel, max = cfg.speciesLevel.max;
  let lv = 1, left = totalXp;
  while (lv < max && left >= per * lv) { left -= per * lv; lv++; }
  return { level: lv, xp: left, need: lv >= max ? 0 : per * lv };
}

export function levelsOf(save, data) {
  const out = {};
  for (const u of data.units) out[u.id] = levelInfo(save.speciesXp[u.id] ?? 0, data.config).level;
  return out;
}

const STAGE_RANK = { young: 0, teen: 1, adult: 2, spirit: 3 };

/** A unit as a companion for the next stage: base animals only, capped at 성장기 (teen), traits kept. */
export function carryInstance(u, data) {
  if (!u || u.kind !== 'base') return null;
  const cap = data.config.carry?.maxStage ?? 'teen';
  const stage = STAGE_RANK[u.stage] > STAGE_RANK[cap] ? cap : u.stage;
  return { speciesId: u.speciesId, stage, white: !!u.white, traits: (u.traits ?? []).map((t) => ({ ...t, locked: false })), from: u.stage };
}

/** Companion candidates after a clear (strongest first). */
export function carryCandidates(state, data) {
  return [...state.field, ...state.bench].filter((u) => u && u.kind === 'base')
    .sort((a, b) => STAGE_RANK[b.stage] - STAGE_RANK[a.stage]).map((u) => ({ ...carryInstance(u, data), name: u.stats.name }));
}

/** Store the companion for the stage after `stageId`. */
export function setCarry(save, data, stageId, inst) {
  const i = data.stages.findIndex((s) => s.id === stageId);
  const next = data.stages[i + 1];
  if (!next) return false;
  (save.carry ??= {})[next.id] = inst;
  return true;
}

/** Options for createBattle from the save. */
export function battleOptions(save, data, stageId = null) {
  const u = data.config.unlocks;
  const idx = stageId ? data.stages.findIndex((s) => s.id === stageId) : 0;
  const carry = stageId ? save.carry?.[stageId] ?? null : null;
  const fallback = idx > 0 && !carry ? data.config.carry?.fallbackGold ?? 0 : 0;
  return {
    carry,
    talents: [...(save.talents ?? [])],
    startGoldBonus: u.startGold.step * save.unlocks.startGold + fallback,
    benchBonus: u.bench.step * save.unlocks.bench + (save.talents ?? []).reduce((n, id) => n + (data.talentById?.[id]?.eco?.bench ?? 0), 0),
    levels: levelsOf(save, data),
    known: { recipes: save.codex.recipes, failed: save.codex.failedPairs },
    seenSpecies: save.codex.units, seenBonds: save.codex.bonds,
  };
}

export const stageUnlocked = (save, data, stageId) => {
  const i = data.stages.findIndex((s) => s.id === stageId);
  return i <= 0 || !!save.stages[data.stages[i - 1].id]?.cleared;
};

const addUniq = (list, items) => { for (const x of items) if (!list.includes(x)) list.push(x); };

/** Species that get stage-clear xp: everything on the path and bench (chimeras give both parts). */
export function xpSpecies(state) {
  const out = new Map();
  for (const u of [...state.field, ...state.bench]) {
    if (!u || u.kind === 'weak') continue;
    const ids = u.kind === 'chimera' ? u.parts : [u.speciesId];
    for (const id of ids) out.set(id, out.get(id) || u.stage === 'spirit');
  }
  return out;
}

/**
 * Apply a finished run to the save. Returns a report for the result screen.
 * Losing gives essence for cleared waves only, no xp.
 */
export function settleRun(save, state, data) {
  const cfg = data.config, ec = cfg.essence;
  const stageId = state.stage.id;
  const clear = state.result === 'clear';
  const rec = (save.stages[stageId] ??= { cleared: false, bestWave: 0 });
  const waves = state.wavesCleared ?? 0;
  const lines = [];
  let essence = waves * ec.perWave;
  lines.push(['웨이브 ' + waves + '개', waves * ec.perWave]);
  if (clear) {
    essence += ec.clear; lines.push(['스테이지 클리어', ec.clear]);
    if (!rec.cleared) { essence += ec.firstClear; lines.push(['최초 클리어', ec.firstClear]); }
  }
  const newRecipes = state.finds.recipes.filter((r) => !save.codex.recipes.includes(r));
  if (newRecipes.length) { essence += newRecipes.length * ec.newRecipe; lines.push(['새 레시피 ' + newRecipes.length + '개', newRecipes.length * ec.newRecipe]); }
  const newSpecies = state.finds.species.filter((s) => !save.codex.units.includes(s));
  if (newSpecies.length) { essence += newSpecies.length * ec.newSpecies; lines.push(['새 동물 ' + newSpecies.length + '종', newSpecies.length * ec.newSpecies]); }
  const newFlops = state.finds.flops.filter((f) => !save.codex.failedPairs.includes(f));
  if (newFlops.length) { essence += newFlops.length * ec.weakFirst; lines.push(['흑역사 ' + newFlops.length + '개', newFlops.length * ec.weakFirst]); }
  save.hintShards += newFlops.length;

  // xp
  const xp = [];
  if (clear) {
    const idx = data.stages.findIndex((s) => s.id === stageId);
    const base = cfg.speciesLevel.stageXp[Math.max(0, idx)] ?? cfg.speciesLevel.stageXp.at(-1);
    for (const [id, spirit] of xpSpecies(state)) {
      const before = levelInfo(save.speciesXp[id] ?? 0, cfg).level;
      const gain = Math.round(base * (spirit ? 1 + cfg.speciesLevel.spiritBonus / 100 : 1));
      save.speciesXp[id] = (save.speciesXp[id] ?? 0) + gain;
      const after = levelInfo(save.speciesXp[id], cfg).level;
      xp.push({ id, gain, before, after });
    }
  }

  // codex and achievements
  addUniq(save.codex.recipes, newRecipes);
  addUniq(save.codex.units, state.finds.species);
  addUniq(save.codex.failedPairs, newFlops);
  addUniq(save.codex.bonds, state.finds.bonds);
  addUniq(save.codex.enemies, [...(state.seenEnemies ?? [])]);
  const ach = [];
  const give = (id) => { if (!save.achievements.includes(id)) { save.achievements.push(id); ach.push(id); } };
  if (state.summonCount > 0) give('firstSummon');
  if (state.madeSpirit) give('firstSpirit');
  if (save.codex.recipes.length > 0) give('firstChimera');
  const demoRecipes = data.recipes.filter((r) => r.parts.every((p) => data.unitById[p])).map((r) => r.id);
  if (demoRecipes.every((r) => save.codex.recipes.includes(r))) give('allRecipes');
  if (clear && state.bossKilled && state.life >= cfg.life) give('flawlessBoss');

  if (clear) rec.cleared = true;
  rec.bestWave = Math.max(rec.bestWave, clear ? state.stage.waves.length : state.wave);
  save.essence += essence;
  // hint shards turn into hints automatically
  const hintsMade = [];
  while (save.hintShards >= cfg.hintShardsPerReveal) {
    const h = revealHint(save, data);
    if (!h) break;
    save.hintShards -= cfg.hintShardsPerReveal;
    hintsMade.push(h);
  }
  const sc = data.talents?.shards ?? {};
  const fromRelics = (state.relics ?? []).reduce((n, id) => n + (sc[data.relicById?.[id]?.rarity] ?? 0), 0);
  const shards = fromRelics + Math.floor(waves / (sc.perWaves ?? 3));
  save.shards = (save.shards ?? 0) + shards;
  return { clear, essence, lines, xp, newRecipes, newSpecies, newFlops, achievements: ach, hintsMade, shards, shardRelics: (state.relics ?? []).length };
}

/** Reveal one material of an undiscovered recipe. Returns { recipe, part } or null. */
export function revealHint(save, data) {
  for (const r of data.recipes) {
    if (save.codex.recipes.includes(r.id) || !r.parts.every((p) => data.unitById[p])) continue;
    const shown = (save.hints[r.id] ??= []);
    const part = r.parts.find((p) => !shown.includes(p));
    if (part && shown.length < 1) { shown.push(part); return { recipe: r.id, part }; }
  }
  return null;
}

/** Spend essence on a permanent unlock: 'startGold' | 'bench' | 'hint'. */
export function buyUnlock(save, data, key) {
  const u = data.config.unlocks;
  if (key === 'hint') {
    if (save.essence < u.hint.cost) return { ok: false, reason: 'essence' };
    const h = revealHint(save, data);
    if (!h) return { ok: false, reason: 'noHint' };
    save.essence -= u.hint.cost;
    return { ok: true, hint: h };
  }
  const def = u[key];
  if (!def) return { ok: false, reason: 'notFound' };
  const lv = save.unlocks[key];
  if (lv >= def.costs.length) return { ok: false, reason: 'max' };
  if (save.essence < def.costs[lv]) return { ok: false, reason: 'essence' };
  save.essence -= def.costs[lv];
  save.unlocks[key] = lv + 1;
  return { ok: true };
}

// ---------- 스킬트리(특성): 판이 끝나면 남는 유물 조각으로 가지마다 차례로 찍는다 ----------
/** Can this talent node be bought now? Returns { ok, reason, cost }. */
export function talentState(save, data, id) {
  const n = data.talentById[id];
  if (!n) return { ok: false, reason: 'unknown', cost: 0 };
  const cost = data.talents.costs[n.index] ?? 1;
  const owned = (save.talents ?? []).includes(id);
  const branch = data.talents.branches.find((b) => b.id === n.branch);
  const prevOk = n.index === 0 || (save.talents ?? []).includes(branch.nodes[n.index - 1].id);
  if (owned) return { ok: false, reason: 'owned', cost, owned };
  if (!prevOk) return { ok: false, reason: 'locked', cost };
  if ((save.shards ?? 0) < cost) return { ok: false, reason: 'shards', cost };
  return { ok: true, cost };
}
export function buyTalent(save, data, id) {
  const st = talentState(save, data, id);
  if (!st.ok) return st;
  save.shards -= st.cost; (save.talents ??= []).push(id);
  return st;
}
/** Give every spent shard back so the tree can be rebuilt. */
export function resetTalents(save, data) {
  const back = (save.talents ?? []).reduce((n, id) => n + (data.talents.costs[data.talentById[id]?.index] ?? 0), 0);
  save.shards = (save.shards ?? 0) + back; save.talents = [];
  return back;
}

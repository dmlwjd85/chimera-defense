// Terrain patches: lookups that need no other logic module (so mods.js can import them without a cycle).
export function patchesAt(state, pos) { return (state.patches ?? []).filter((p) => p.left > 0 && Math.abs(pos - p.pos) <= p.r); }

/** Stat changes an ally gets from the terrain it stands on (strongest per stat). */
export function patchAllyMods(state, u, cfg) {
  const out = {};
  for (const p of patchesAt(state, u.pos)) for (const [k, v] of Object.entries(cfg.patches.defs[p.kind].ally ?? {})) if (Math.abs(v) > Math.abs(out[k] ?? 0)) out[k] = v;
  return out;
}

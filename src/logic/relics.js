// Roguelite relics (유물): after some waves pick 1 of 3. Unit effects use the same fx lines as traits; economy hooks via eco.
export function ownedRelics(state, data) { return (state.relics ?? []).map((id) => data.relicById?.[id]).filter(Boolean); }

/** Sum (numbers), max-merge (arrays first wins), or OR (booleans) of an eco key over owned relics. */
export function eco(state, data, key) {
  let out = null;
  for (const r of ownedRelics(state, data)) {
    const v = r.eco?.[key];
    if (v === undefined) continue;
    if (typeof v === 'number') out = (out ?? 0) + v;
    else if (typeof v === 'boolean') out = out || v;
    else out = out ?? v;
  }
  return out;
}

/** Does a relic fx line apply to this unit? */
export function whoMatches(who, u, state) {
  if (!who) return true;
  if (who.role && u.stats.role !== who.role) return false;
  if (who.flyer !== undefined && !!u.stats.flyer !== who.flyer) return false;
  if (who.kind && u.kind !== who.kind) return false;
  if (who.stage && !who.stage.includes(u.stage)) return false;
  if (who.pair && !(u.kind === 'base' && state.field.filter((o) => o.kind === 'base' && o.speciesId === u.speciesId).length >= 2)) return false;
  return true;
}

/** Roll an offer of N distinct relics the player does not own, weighted by rarity. */
export function rollOffer(state, data) {
  const cfg = data.relicCfg;
  const pool = cfg.relics.filter((r) => !(state.relics ?? []).includes(r.id));
  const out = [];
  while (out.length < (cfg.choices ?? 3) && pool.length) {
    const total = pool.reduce((s, r) => s + (cfg.weights?.[r.rarity] ?? 1), 0);
    let t = state.rng() * total;
    const i = pool.findIndex((r) => (t -= cfg.weights?.[r.rarity] ?? 1) < 0);
    out.push(pool.splice(i < 0 ? 0 : i, 1)[0].id);
  }
  return out;
}

/** Take a relic from the current offer. */
export function chooseRelic(state, data, id) {
  if (!state.relicOffer?.includes(id)) return { ok: false, reason: 'notOffered' };
  (state.relics ??= []).push(id);
  state.relicOffer = null;
  const r = data.relicById[id];
  if (r.eco?.life) state.life += r.eco.life;
  state.events.push({ type: 'relic', id });
  return { ok: true, relic: r };
}

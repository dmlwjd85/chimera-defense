// Individual traits (plan ch.5 '개체 특성'): every animal is born with 2 of its species' 6 traits.
// A trait on a unit: { sp, id, kind: 'str'|'weak', flipped, locked }.

/** Trait definition (from data.traits) for a unit trait entry. */
export function traitDef(t, data) {
  const set = data.traits?.[t.sp];
  if (!set) return null;
  return (t.kind === 'str' ? set.str : set.weak).find((d) => d.id === t.id) ?? null;
}

/** Name, description and effect list that are active for a trait entry. */
export function traitView(t, data) {
  const d = traitDef(t, data);
  if (!d) return { name: t.id, desc: '', fx: [], tone: 'str' };
  if (t.kind === 'weak' && t.flipped) return { name: d.flip.name, desc: d.flip.desc, fx: d.flip.fx, tone: 'flip' };
  return { name: d.name, desc: d.desc, fx: d.fx, tone: t.kind };
}

const pickN = (list, n, rng) => {
  const pool = [...list], out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

const entry = (sp, d, kind) => ({ sp, id: d.id, kind, flipped: false, locked: false });

/** Roll 2 traits at birth: 2 strengths 20%, 1+1 60%, 2 weaknesses 20%. `white` forces 2 strengths. */
export function rollTraits(speciesId, data, rng, white = false) {
  const set = data.traits?.[speciesId];
  if (!set) return [];
  const r = rng();
  const nStr = white ? 2 : r < 0.2 ? 2 : r < 0.8 ? 1 : 0;
  return [
    ...pickN(set.str, nStr, rng).map((d) => entry(speciesId, d, 'str')),
    ...pickN(set.weak, 2 - nStr, rng).map((d) => entry(speciesId, d, 'weak')),
  ];
}

const same = (a, b) => a.sp === b.sp && a.id === b.id;
const clone = (list) => (list ?? []).map((t) => ({ ...t }));

/**
 * Same-species evolution: the receiver keeps its traits, but each unlocked weakness of the receiver is
 * overwritten by a strength of the dragged unit (that the receiver does not have yet).
 */
export function inheritEvolve(receiver, dragged) {
  const out = clone(receiver);
  const donors = clone(dragged).filter((t) => t.kind === 'str' && !out.some((o) => same(o, t)));
  for (let i = 0; i < out.length && donors.length; i++) {
    if (out[i].kind === 'weak' && !out[i].flipped && !out[i].locked) out[i] = { ...donors.shift(), locked: false };
  }
  return out;
}

/** Spirit evolution: inherit like evolve, then every remaining weakness flips into its strength. */
export function inheritSpirit(receiver, dragged) {
  return inheritEvolve(receiver, dragged).map((t) => (t.kind === 'weak' ? { ...t, flipped: true } : t));
}

/** Chimera: from the 4 traits pick strengths first (dragged unit's first), then fill with the rest. Max 2. */
export function inheritChimera(receiver, dragged) {
  const d = clone(dragged), r = clone(receiver);
  const ordered = [...d.filter((t) => t.kind === 'str'), ...r.filter((t) => t.kind === 'str'), ...d.filter((t) => t.kind !== 'str'), ...r.filter((t) => t.kind !== 'str')];
  const out = [];
  for (const t of ordered) if (out.length < 2 && !out.some((o) => same(o, t))) out.push({ ...t, locked: false });
  return out;
}

/**
 * Weak chimera: every weakness of both animals (max 4). With none, one random weakness per species.
 * Four weaknesses flip all at once ('역전의' chimera). Returns { traits, reversal }.
 */
export function inheritWeak(receiver, dragged, data, rng) {
  let weak = [...clone(receiver), ...clone(dragged)].filter((t) => t.kind === 'weak' && !t.flipped).map((t) => ({ ...t, locked: false }));
  if (!weak.length) {
    const sps = [...new Set([...(receiver ?? []), ...(dragged ?? [])].map((t) => t.sp))];
    weak = sps.map((sp) => pickN(data.traits?.[sp]?.weak ?? [], 1, rng)[0]).filter(Boolean).map((d, i) => entry(sps[i], d, 'weak'));
  }
  const reversal = weak.length >= 4;
  return { traits: reversal ? weak.map((t) => ({ ...t, flipped: true })) : weak, reversal };
}

/** Weak-chimera description: weaknesses chained ("미련하다, 시끄럽다."). */
export function weakLine(traits, data) {
  return traits.map((t) => traitView(t, data).name).join(', ') + '.';
}

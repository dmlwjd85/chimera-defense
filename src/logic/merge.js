import { pairKey } from './data.js';
import { genesOf, sameClass, chanceWith } from './genes.js';

export const NEXT_STAGE = { young: 'teen', teen: 'adult', adult: 'spirit' };

const recipeFor = (a, b, data) => data.recipeByPair[pairKey(a.speciesId, b.speciesId)] ?? null;

/** Decide what dropping dragged onto target does (plan chapter 6 table). */
/** 슬라임 다시 합성: 같은 부모 슬라임끼리, 또는 슬라임 + 그 부모 성체 → 원래 짝의 키메라 재도전 */
export function slimeRetry(dragged, target) {
  if (dragged.uid === target.uid) return null;
  const same = (p, q) => p?.length === 2 && q?.length === 2 && pairKey(...p) === pairKey(...q);
  if (dragged.kind === 'weak' && target.kind === 'weak') return same(dragged.parts, target.parts) ? { parts: [...target.parts], pair: true } : null;
  const [sl, ad] = dragged.kind === 'weak' ? [dragged, target] : [target, dragged];
  if (sl.kind === 'weak' && ad.kind === 'base' && ad.stage === 'adult' && sl.parts?.includes(ad.speciesId)) return { parts: [...sl.parts], pair: false };
  return null;
}

export function mergeKind(dragged, target, data) {
  if (genesOf(data) && slimeRetry(dragged, target)) return 'reslime';
  if (dragged.uid === target.uid || dragged.kind !== 'base' || target.kind !== 'base') return 'swap';
  if (dragged.speciesId === target.speciesId) {
    if (dragged.stage !== target.stage) return 'swap';
    if (dragged.stage === 'young' || dragged.stage === 'teen') return 'evolve';
    return dragged.stage === 'adult' ? 'spirit' : 'swap';
  }
  if (dragged.stage !== 'adult' || target.stage !== 'adult') return 'swap';
  // 염색체 합성: 모든 짝이 '키메라 도전'. 같은 강은 염색체 확률, 강이 다르면 기적 확률(mergeOdds)
  return recipeFor(dragged, target, data) ? 'chimera' : 'weak';
}

/** Chance (%) that a 'chimera' merge really succeeds; 100 for every other kind. */
export function mergeOdds(dragged, target, data, ctx = {}) {
  const kind = mergeKind(dragged, target, data);
  if (kind === 'chimera') return { kind, ...chanceWith(dragged.speciesId, target.speciesId, data, ctx) };
  if (kind === 'reslime') {
    const r = slimeRetry(dragged, target), m = genesOf(data).miracle ?? {};
    return { kind, retry: r, ...chanceWith(r.parts[0], r.parts[1], data, ctx, r.pair ? { mult: m.slimePair ?? 2 } : { add: m.slimeAdult ?? 10 }) };
  }
  return { kind, chance: kind === 'weak' ? 0 : 100, cross: false };
}

/** New merged instance, or null when the drop is a swap. `kind` forces the result (a failed gene roll → 'weak'). */
export function mergeUnits(dragged, target, data, uid, kind = mergeKind(dragged, target, data)) {
  switch (kind) {
    case 'evolve':
    case 'spirit':
      return { uid, kind: 'base', speciesId: target.speciesId, stage: NEXT_STAGE[target.stage], parts: null };
    case 'chimera': {
      const r = recipeFor(dragged, target, data);
      return { uid, kind: 'chimera', speciesId: r.id, stage: 'adult', parts: [...r.parts] };
    }
    case 'weak':
      return { uid, kind: 'weak', speciesId: null, stage: 'adult', parts: [target.speciesId, dragged.speciesId] };
    default:
      return null;
  }
}

/** Hover preview: text key, vars, and whether a confirm dialog is needed. */
export function mergePreview(dragged, target, data, known) {
  const kind = mergeKind(dragged, target, data);
  const view = (textKey, vars = {}, needsConfirm = false) => ({ kind, textKey, vars, needsConfirm });
  if (kind === 'evolve' || kind === 'spirit') {
    const name = data.unitById[target.speciesId].stageNames[NEXT_STAGE[target.stage]];
    return view(kind === 'evolve' ? 'merge.evolve' : 'merge.spirit', { name }, kind === 'spirit');
  }
  if (kind === 'chimera') {
    const r = recipeFor(dragged, target, data);
    const chance = chanceWith(dragged.speciesId, target.speciesId, data).chance;
    return known.recipes.has(r.id) ? view('merge.chimera', { name: r.name, chance }) : view('merge.unknown', { chance });
  }
  if (kind === 'weak') return view(known.failed.has(pairKey(dragged.speciesId, target.speciesId)) ? 'merge.weakKnown' : 'merge.unknown');
  return view('merge.swap');
}

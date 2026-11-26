import { pairKey } from './data.js';
import { genesOf, geneChance, sameClass } from './genes.js';

export const NEXT_STAGE = { young: 'teen', teen: 'adult', adult: 'spirit' };

const recipeFor = (a, b, data) => data.recipeByPair[pairKey(a.speciesId, b.speciesId)] ?? null;

/** Decide what dropping dragged onto target does (plan chapter 6 table). */
export function mergeKind(dragged, target, data) {
  if (dragged.uid === target.uid || dragged.kind !== 'base' || target.kind !== 'base') return 'swap';
  if (dragged.speciesId === target.speciesId) {
    if (dragged.stage !== target.stage) return 'swap';
    if (dragged.stage === 'young' || dragged.stage === 'teen') return 'evolve';
    return dragged.stage === 'adult' ? 'spirit' : 'swap';
  }
  if (dragged.stage !== 'adult' || target.stage !== 'adult') return 'swap';
  // 염색체 합성: 강이 다르면 무조건 슬라임. 같은 강이면 키메라 시도(성공은 mergeOdds 확률)
  if (genesOf(data) && !sameClass(dragged.speciesId, target.speciesId, data)) return 'weak';
  return recipeFor(dragged, target, data) ? 'chimera' : 'weak';
}

/** Chance (%) that a 'chimera' merge really succeeds; 100 for every other kind. */
export function mergeOdds(dragged, target, data) {
  const kind = mergeKind(dragged, target, data);
  return { kind, chance: kind === 'chimera' ? geneChance(dragged.speciesId, target.speciesId, data) : kind === 'weak' ? 0 : 100, cross: kind === 'weak' && !!genesOf(data) && !sameClass(dragged.speciesId, target.speciesId, data) };
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
    const chance = geneChance(dragged.speciesId, target.speciesId, data);
    return known.recipes.has(r.id) ? view('merge.chimera', { name: r.name, chance }) : view('merge.unknown', { chance });
  }
  if (kind === 'weak') return view(known.failed.has(pairKey(dragged.speciesId, target.speciesId)) ? 'merge.weakKnown' : 'merge.unknown');
  return view('merge.swap');
}

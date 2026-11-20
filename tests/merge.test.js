import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { mergeKind, mergeUnits, mergePreview } from '../src/logic/merge.js';

const D = loadData();
let n = 0;
const u = (sp, stage, kind = 'base') => ({ uid: ++n, kind, speciesId: sp, stage, parts: kind === 'base' ? null : ['fox', 'crow'] });
const none = { recipes: new Set(), failed: new Set() };

test('evolve and spirit', () => {
  assert.equal(mergeUnits(u('fox', 'young'), u('fox', 'young'), D, 99).stage, 'teen');
  assert.equal(mergeUnits(u('fox', 'teen'), u('fox', 'teen'), D, 99).stage, 'adult');
  const p = mergePreview(u('fox', 'adult'), u('fox', 'adult'), D, none);
  assert.deepEqual([p.kind, p.needsConfirm, p.vars.name], ['spirit', true, D.unitById.fox.stageNames.spirit]);
});

test('chimera, weak and swaps', () => {
  const c = mergeUnits(u('crow', 'adult'), u('fox', 'adult'), D, 99);
  assert.deepEqual([c.kind, c.speciesId, c.parts], ['chimera', 'cheese_thief', ['fox', 'crow']]);
  assert.deepEqual(mergeUnits(u('fox', 'adult'), u('bear', 'adult'), D, 99).parts, ['bear', 'fox']);
  const a = u('fox', 'young');
  for (const [x, y] of [[u('fox', 'spirit'), u('fox', 'spirit')], [u('fox', 'young'), u('fox', 'teen')], [u('fox', 'adult'), u('crow', 'teen')],
    [u('fox', 'spirit'), u('crow', 'adult')], [u('x', 'adult', 'chimera'), u('fox', 'adult')], [u(null, 'adult', 'weak'), u(null, 'adult', 'weak')], [a, a]]) {
    assert.equal(mergeKind(x, y, D), 'swap');
    assert.equal(mergeUnits(x, y, D, 99), null);
  }
});

test('preview hides undiscovered recipes', () => {
  assert.equal(mergePreview(u('fox', 'adult'), u('crow', 'adult'), D, none).textKey, 'merge.unknown');
  const k = mergePreview(u('fox', 'adult'), u('crow', 'adult'), D, { recipes: new Set(['cheese_thief']), failed: new Set() });
  assert.deepEqual([k.textKey, k.vars.name], ['merge.chimera', D.recipeById.cheese_thief.name]);
  assert.equal(mergePreview(u('fox', 'adult'), u('bear', 'adult'), D, none).textKey, 'merge.unknown');
  assert.equal(mergePreview(u('fox', 'adult'), u('bear', 'adult'), D, { recipes: new Set(), failed: new Set(['bear+fox']) }).textKey, 'merge.weakKnown');
});

test('inputs stay unchanged', () => {
  const x = u('fox', 'adult'), y = u('crow', 'adult');
  const before = JSON.stringify([x, y]);
  mergeUnits(x, y, D, 99);
  assert.equal(JSON.stringify([x, y]), before);
});

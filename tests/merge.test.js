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
  const c = mergeUnits(u('bighorn', 'adult'), u('rabbit', 'adult'), D, 99);
  assert.deepEqual([c.kind, c.speciesId, c.parts], ['chimera', 'jackalope', ['rabbit', 'bighorn']]);
  assert.equal(mergeUnits(u('fox', 'adult'), u('bear', 'adult'), D, 99).speciesId, 'auto_bear_fox');
  const w = mergeUnits(u('fox', 'adult'), u('crow', 'adult'), D, 99, 'weak');
  assert.deepEqual([w.kind, w.parts], ['weak', ['crow', 'fox']]);
  assert.equal(mergeKind(u('fox', 'adult'), u('crow', 'adult'), D), 'chimera', '강이 달라도 기적 도전');
  assert.equal(mergeUnits(u('tiger', 'adult'), u('bear', 'adult'), D, 99, 'weak').kind, 'weak', 'forced gene failure');
  const a = u('fox', 'young');
  for (const [x, y] of [[u('fox', 'spirit'), u('fox', 'spirit')], [u('fox', 'young'), u('fox', 'teen')], [u('fox', 'adult'), u('crow', 'teen')],
    [u('fox', 'spirit'), u('crow', 'adult')], [u('x', 'adult', 'chimera'), u('fox', 'adult')], [u(null, 'adult', 'weak'), u('bear', 'adult')], [a, a]]) {
    assert.equal(mergeKind(x, y, D), 'swap');
    assert.equal(mergeUnits(x, y, D, 99), null);
  }
});

test('preview hides undiscovered recipes', () => {
  assert.equal(mergePreview(u('rabbit', 'adult'), u('bighorn', 'adult'), D, none).textKey, 'merge.unknown');
  const k = mergePreview(u('rabbit', 'adult'), u('bighorn', 'adult'), D, { recipes: new Set(['jackalope']), failed: new Set() });
  assert.deepEqual([k.textKey, k.vars.name, k.vars.chance], ['merge.chimera', D.recipeById.jackalope.name, 85]);
  assert.equal(mergePreview(u('fox', 'adult'), u('crow', 'adult'), D, none).textKey, 'merge.unknown');
});

test('inputs stay unchanged', () => {
  const x = u('fox', 'adult'), y = u('crow', 'adult');
  const before = JSON.stringify([x, y]);
  mergeUnits(x, y, D, 99);
  assert.equal(JSON.stringify([x, y]), before);
});

test('염색체 합성: 같은 강만, 염색체 수 차이로 성공률', async () => {
  const { geneChance, sameClass, classOf } = await import('../src/logic/genes.js');
  assert.equal(classOf('frog', D), 'amph');
  assert.ok(sameClass('dog', 'wolf', D) && !sameClass('fox', 'crow', D) && !sameClass('bison', 'frog', D));
  assert.equal(geneChance('dog', 'wolf', D), 100);          // 78 = 78
  assert.equal(geneChance('rabbit', 'bighorn', D), 85);     // 44 vs 54
  assert.equal(geneChance('bear', 'tiger', D), 46);         // 74 vs 38
  assert.equal(geneChance('fox', 'wolf', D), 34);          // 34 vs 78: 차이 44 × 1.5
  assert.equal(geneChance('fox', 'crow', D), 0);
  assert.equal(mergeKind(u('ant', 'adult'), u('grasshopper', 'adult'), D), 'chimera');
  const { miracleChance, chanceWith } = await import('../src/logic/genes.js');
  assert.equal(miracleChance('rooster', 'fox', D), 3, '강이 다르면 기적 3~10%');
  assert.equal(miracleChance('bison', 'frog', D), 15, '이야기 조합(황소개구리) +12');
  assert.equal(miracleChance('bison', 'frog', D, new Set(['frog_ox'])), 20, '인연 발견 +5');
  const w = chanceWith('rooster', 'fox', D, { potion: true, relicCross: 8, myth: true, moon: true });
  assert.equal(w.chance, 3 + 20 + 8 + 5 + 10);
  assert.equal(chanceWith('rooster', 'fox', D, { pity: { 'fox+rooster': 5 } }).chance, 100, '실패 5번이면 확정');
  // 슬라임 재합성
  const sl = { uid: 7, kind: 'weak', speciesId: null, stage: 'adult', parts: ['crow', 'fox'] };
  assert.equal(mergeKind(sl, { ...sl, uid: 8 }, D), 'reslime');
  assert.equal(mergeKind(sl, u('fox', 'adult'), D), 'reslime');
  assert.equal(mergeKind(sl, u('bear', 'adult'), D), 'swap');
  // 같은 강 짝은 전부 키메라가 있음
  for (const a of D.units) for (const b of D.units) if (a.id < b.id && sameClass(a.id, b.id, D)) assert.ok(D.recipeByPair[a.id < b.id ? `${a.id}+${b.id}` : `${b.id}+${a.id}`], a.id + b.id);
});

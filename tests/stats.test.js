import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlanData as loadData } from './helpers.js';
import { unitStats } from '../src/logic/stats.js';

const D = loadData();
const base = (sp, stage) => unitStats({ uid: 1, kind: 'base', speciesId: sp, stage, parts: null }, D);
const eff = (s, t) => s.effects.find((e) => e.type === t);

test('fox by stage', () => {
  const y = base('fox', 'young'), t = base('fox', 'teen'), a = base('fox', 'adult'), s = base('fox', 'spirit');
  assert.deepEqual([y.hp, y.damage, eff(y, 'poison').dps], [55, 7, 6]);
  assert.equal('percent' in eff(y, 'poison'), false);
  assert.deepEqual([t.hp, t.damage, eff(t, 'poison').dps, eff(t, 'confuse')], [77, 9.8, 6.6, undefined]);
  assert.deepEqual([a.hp, a.damage, eff(a, 'confuse').targets, a.skills.length], [99, 12.6, 1, 2]);
  assert.deepEqual([s.hp, s.damage, eff(s, 'poison').dps, eff(s, 'confuse').targets, s.skills.length], [176, 22.4, 9, 3, 3]);
  assert.equal(s.effects.filter((e) => ['confuse', 'confuseTargets', 'text'].includes(e.type)).length, 1);
});

test('bear hold count and modifiers', () => {
  assert.deepEqual(['young', 'teen', 'adult', 'spirit'].map((st) => eff(base('bear', st), 'hold').count), [3, 4, 5, 6]);
  // 스플래시는 특별한 기술에만(2026-11-26): 동물 기본 공격은 모두 한 마리, 독수리 광역은 급강하(기본2)에서만
  for (const u of D.units) assert.equal(base(u.id, 'spirit').aoeRadius, 0, u.id);
  assert.equal(eff(base('bighorn', 'adult'), 'knockback').stun, 1);
});

test('chimera and weak chimera', () => {
  const c = unitStats({ uid: 2, kind: 'chimera', speciesId: 'cheese_thief', stage: 'adult', parts: ['fox', 'crow'] }, D);
  // 치즈 도둑(여우+까마귀)은 강이 다른 '기적의 키메라' → 체력·피해 +15%
  assert.deepEqual([c.hp, c.damage, c.range, c.block, eff(c, 'poison').dps, c.cross], [Math.round(D.config.chimeraHpRatio * (D.unitById.fox.hp + D.unitById.crow.hp) * D.config.stageMult.adult.damage * 1.15), Math.round(43.2 * 1.15 * 10) / 10, 4, 1, 10, true]);
  const w = unitStats({ uid: 3, kind: 'weak', speciesId: null, stage: 'adult', parts: ['fox', 'bear'] }, D);
  assert.deepEqual([w.damage, w.hp, w.interval, w.range, w.block, w.respawn, w.effects.length], [7, 55, 1.2, 1, 1, 8, 0]);
  assert.ok(w.name.endsWith('슬라임'), w.name);
});

test('does not mutate data and rejects unknown kinds', () => {
  base('fox', 'spirit');
  assert.equal(D.unitById.fox.baseSkill[0].dps, 6);
  assert.throws(() => unitStats({ kind: 'ghost' }, D), /unknown kind/);
});

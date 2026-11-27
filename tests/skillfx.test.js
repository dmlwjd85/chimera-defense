// 스킬 이펙트 설정(public/data/skillfx.json)과 계획(logic/skillfx.js) 시험
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFx, tierOf, budget, fullOk, motionOk, RELEASES, hex } from '../src/logic/skillfx.js';
import { ULTS } from '../src/logic/gauntlet.js';
import { loadData } from './helpers.js';

const cfg = JSON.parse(readFileSync(new URL('../public/data/skillfx.json', import.meta.url), 'utf8'));
const D = loadData();
const HEX = /^#[0-9a-f]{6}$/i;
const SPRITES = ['flame', 'wisp', 'star', 'rock', 'drop', 'feather', 'note', 'cross', 'leaf', 'crescent', 'pix', 'ember', 'shard'];

test('모든 테마: 색 4개 + 외곽선 + 도트 조각', () => {
  for (const [k, t] of Object.entries(cfg.themes)) {
    if (k.startsWith('_')) continue;
    assert.equal(t.c.length, 4, k);
    for (const c of [...t.c, t.o]) assert.match(c, HEX, `${k} ${c}`);
    assert.ok(SPRITES.includes(t.sprite), `${k} sprite ${t.sprite}`);
  }
});

test('필살기가 있는 모든 종에 이펙트가 있음(테마·모양이 실제로 있음)', () => {
  for (const id of Object.keys(ULTS)) {
    const s = cfg.ults[id];
    assert.ok(s, `ult ${id}`);
    assert.ok(cfg.themes[s.theme], `${id} theme ${s.theme}`);
    assert.ok(RELEASES.includes(s.release), `${id} release ${s.release}`);
    assert.ok(cfg.releases[s.release]?.travel > 0, `${id} travel`);
  }
});

test('모든 시간 기술(timerSkill)에 이펙트가 있음', () => {
  for (const u of D.units ?? Object.values(D.unitById)) for (const k of ['adultSkill', 'spiritSkill']) for (const e of u[k]?.effects ?? []) {
    if (e.type !== 'timerSkill') continue;
    const s = cfg.skills.byName[u[k].name] ?? cfg.skills.byAction[e.action];
    assert.ok(s, `${u.id} ${u[k].name}`);
    assert.ok(cfg.themes[s.theme] && RELEASES.includes(s.release), `${u.id} ${u[k].name}`);
  }
});

test('모든 속성에 테마', () => {
  for (const el of Object.keys(D.config.elements.defs)) assert.ok(cfg.themes[cfg.elements[el]], el);
});

test('신화급·키메라는 일반보다 크고 화려함', () => {
  const N = cfg.tiers.normal, M = cfg.tiers.myth, C = cfg.tiers.chimera;
  for (const T of [M, C]) { assert.ok(T.scale > N.scale); assert.ok(T.particles > N.particles); assert.ok(T.ring > N.ring); assert.ok(T.number > N.number); }
  assert.equal(tierOf({ kind: 'chimera' }), 'chimera');
  assert.equal(tierOf({ kind: 'base', stage: 'spirit' }), 'myth');
  assert.equal(tierOf({ kind: 'base', stage: 'adult' }), 'normal');
});

test('계획: 키메라 필살기는 쓴 부위 모양 + 둘째 부위 색', () => {
  const u = { kind: 'chimera', parts: ['fox', 'tiger'], stats: {} };
  const p = planFx(cfg, { u, move: 'ult', kind: 'fox', units: D.unitById });
  assert.equal(p.release, 'wisps'); assert.equal(p.theme, 'foxfire'); assert.equal(p.theme2, 'thunder'); assert.equal(p.tier, 'chimera');
  assert.ok(p.banner);
});

test('계획: 일반 동물 속성 공격은 꾸미지 않음, 신화급은 꾸밈', () => {
  assert.equal(planFx(cfg, { u: { kind: 'base', stage: 'adult', speciesId: 'fox', stats: { element: 'fire' } }, move: 'el', el: 'fire' }), null);
  const p = planFx(cfg, { u: { kind: 'base', stage: 'spirit', speciesId: 'fox', stats: { element: 'fire' } }, move: 'el', el: 'fire' });
  assert.equal(p.theme, 'foxfire'); assert.equal(p.release, 'pillar');
});

test('흔들림 끄기: 설정·저장소·기기 동작 줄이기', () => {
  assert.equal(motionOk(cfg, null, false), true);
  assert.equal(motionOk(cfg, '0', false), false);
  assert.equal(motionOk(cfg, null, true), false);
  assert.equal(motionOk({ ...cfg, shake: false }, null, false), false);
  const p = planFx({ ...cfg, shake: false, flash: false }, { u: { kind: 'base', stage: 'spirit', speciesId: 'bear', stats: {} }, move: 'ult', kind: 'bear' });
  assert.equal(p.shake, 0); assert.equal(p.flash, 0);
});

test('입자 상한·동시 연출 상한', () => {
  assert.equal(budget(0, 400, 20), 20);
  assert.equal(budget(400, 400, 20), 0);
  assert.ok(budget(350, 400, 40) < 40);
  assert.ok(budget(395, 400, 40) <= 5);
  assert.equal(fullOk(0, cfg), true);
  assert.equal(fullOk(cfg.limits.maxFull, cfg), false);
  assert.equal(hex('#ff0000'), 0xff0000);
});

test('꺼 두면 계획 없음', () => {
  assert.equal(planFx({ ...cfg, enabled: false }, { u: { kind: 'chimera', parts: ['fox'] }, move: 'ult', kind: 'fox' }), null);
});

test('반복 줄이기: 같은 동물이 금방 또 쓰면 짧고 가볍게, 처음·오래 뒤엔 그대로', async () => {
  const { damp } = await import('../src/logic/skillfx.js');
  const p = planFx(cfg, { u: { kind: 'base', stage: 'spirit', speciesId: 'fox', uid: 1, stats: {} }, move: 'ult', kind: 'fox' });
  assert.equal(damp(p, cfg, null, 1000), p);
  assert.equal(damp(p, cfg, 0, cfg.repeat.window + 1), p);
  const r = damp(p, cfg, 0, 3000);
  assert.ok(r.repeat); assert.ok(r.charge < p.charge); assert.ok(r.particles < p.particles); assert.equal(r.flash, 0); assert.equal(r.word, null); assert.equal(r.banner, false);
  assert.ok(cfg.limits.flashGap >= 2000);
});

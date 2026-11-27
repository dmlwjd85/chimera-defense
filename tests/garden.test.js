import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { defaultSave } from '../src/logic/meta.js';
import * as G from '../src/logic/garden.js';

const D = loadData();
const withStars = (n) => { const s = defaultSave(); s.stages = {}; for (let i = 0; i < 12; i++) s.stages['s' + i] = { cleared: true, stars: Math.max(0, Math.min(3, n - i * 3)) }; return s; };

test('무릉도원 칸: 처음 1마리, 별 3개마다 +1, 최대 10', () => {
  assert.equal(G.gardenSlots(withStars(0), D), 1);
  assert.equal(G.gardenSlots(withStars(3), D), 2);
  assert.equal(G.gardenSlots(withStars(8), D), 3);
  assert.equal(G.gardenSlots(withStars(36), D), 10);
  assert.equal(G.starsToNextSlot(withStars(8), D), 1);
  assert.equal(G.starsToNextSlot(withStars(36), D), 0);
});

test('무릉도원: 도감에서 만난 동물만 고름, 칸이 차면 못 데려옴, 돌려보내기', () => {
  const s = withStars(3); s.codex.units = ['dog', 'fox']; s.codex.spirits = ['fox'];
  const list = G.gardenChoices(s, D);
  assert.ok(list.some((c) => c.id === 'dog' && c.stage === 'adult'));
  assert.ok(list.some((c) => c.id === 'fox' && c.stage === 'spirit'));
  assert.ok(!list.some((c) => c.id === 'tiger'));
  assert.ok(G.addGardenAnimal(s, D, list[0]).ok);
  assert.ok(G.addGardenAnimal(s, D, list[1]).ok);
  assert.equal(G.addGardenAnimal(s, D, list[2]).reason, 'full');
  assert.ok(G.removeGardenAnimal(s, s.garden.animals[0].key).ok);
  assert.equal(s.garden.animals.length, 1);
});

test('무릉도원: 쓰다듬기는 그 종 경험 +1, 하루 10번까지', () => {
  const s = withStars(0); s.speciesXp = {};
  for (let i = 0; i < 12; i++) G.petAnimal(s, D, { id: 'dog', kind: 'base' }, '2026-11-27');
  assert.equal(s.speciesXp.dog, 10);
  G.petAnimal(s, D, { id: 'dog', kind: 'base' }, '2026-11-28');
  assert.equal(s.speciesXp.dog, 11);
});

test('무릉도원: 소품 놓기·옮기기·치우기, 12개까지', () => {
  const s = withStars(0);
  for (let i = 0; i < 12; i++) assert.ok(G.addProp(s, D, 'peach', 100 + i, 500).ok);
  assert.equal(G.addProp(s, D, 'pond', 1, 1).reason, 'full');
  assert.ok(G.moveProp(s, 0, 300, 520)); assert.equal(s.garden.props[0].x, 300);
  assert.ok(G.removeProp(s, 0)); assert.equal(s.garden.props.length, 11);
  assert.equal(G.meetKind({ id: 'wolf' }, { id: 'rabbit' }, D), 'chase');
  assert.equal(G.meetKind({ id: 'rabbit' }, { id: 'wolf' }, D), 'flee');
  assert.equal(G.meetKind({ id: 'dog' }, { id: 'dog' }, D), 'same');
});

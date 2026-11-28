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

test('무릉도원: 소품 놓기·옮기기·치우기, 정해진 수까지', () => {
  const s = withStars(0);
  const MAX = G.gcfgGarden(D).maxProps;
  for (let i = 0; i < MAX; i++) assert.ok(G.addProp(s, D, 'peach', 100 + i, 500).ok);
  assert.equal(G.addProp(s, D, 'pond', 1, 1).reason, 'full');
  assert.ok(G.moveProp(s, 0, 300, 520)); assert.equal(s.garden.props[0].x, 300);
  assert.ok(G.removeProp(s, 0)); assert.equal(s.garden.props.length, MAX - 1);
  assert.equal(G.meetKind({ id: 'wolf' }, { id: 'rabbit' }, D), 'chase');
  assert.equal(G.meetKind({ id: 'rabbit' }, { id: 'wolf' }, D), 'flee');
  assert.equal(G.meetKind({ id: 'dog' }, { id: 'dog' }, D), 'same');
});

test('전설 조각: 한 판에 전설 짝 두 종 성체가 함께 있으면 조각 하나(판마다 한 번), 6개면 레시피 공개', async () => {
  const { createGauntlet, legendCheck } = await import('../src/logic/gauntlet.js');
  const { settleRun } = await import('../src/logic/meta.js');
  const st = createGauntlet(D, 'forest-1', 3, {});
  const mk = (id) => ({ ...st.field[0], uid: 900 + id.length, kind: 'base', speciesId: id, stage: 'adult' });
  st.bench[0] = mk('bison'); st.bench[1] = mk('eagle');
  legendCheck(st, D); legendCheck(st, D);
  assert.deepEqual(st.finds.legendShards, ['bison+eagle']);
  assert.equal(st.events.filter((e) => e.type === 'legendShard').length, 1);
  const s = withStars(0);
  for (let i = 0; i < 6; i++) { const r = settleRun(s, st, D); if (i < 5) assert.equal(r.legendShards[0].done, false); else assert.equal(r.legendShards[0].done, true); }
  assert.equal(s.legendShards['bison+eagle'], 6);
  assert.ok(s.codex.legends.includes('bison+eagle'));
});

test('무릉도원 소품과 어울리기: 새·원숭이는 나무에 앉고, 물 좋아하는 동물은 연못에 들어가고, 소품마다 누구나 할 일이 있음', () => {
  const acts = (id, prop, kind = 'base', parts = null) => G.propActsFor({ id, kind, parts }, prop).map((a) => a.act);
  assert.ok(acts('crow', 'peach').includes('perch'));
  assert.ok(acts('eagle', 'peach').includes('perch'));
  assert.ok(acts('monkey', 'peach').includes('perch'));
  assert.ok(!acts('bear', 'peach').includes('perch'));
  assert.ok(acts('bear', 'peach').includes('shake'));
  assert.ok(acts('frog', 'pond').includes('swim'));
  assert.ok(!acts('crow', 'pond').includes('swim'));
  assert.ok(acts('crow', 'pond').includes('drink'));
  assert.ok(acts('rabbit', 'flowers').includes('graze'));
  assert.ok(acts('rooster', 'nest').includes('brood'));
  // 키메라는 첫 부위 종을 따름
  assert.ok(acts('x', 'pond', 'chimera', ['frog', 'bear']).includes('swim'));
  // 모든 소품: 그림 열쇠·이름이 있고, 어떤 동물이든 할 일이 하나는 있음
  for (const prop of G.GARDEN_PROPS) {
    assert.ok(G.PROP_ART[prop] && G.PROP_NAME[prop], prop);
    for (const u of D.units) assert.ok(G.propActsFor({ id: u.id, kind: 'base' }, prop).length >= 1, `${prop} ${u.id}`);
  }
  // 고르기: 무게대로, 자리가 없으면 다른 행동, 다 없으면 null
  assert.equal(G.pickPropAct({ id: 'crow' }, 'peach', () => 0).act, 'perch');
  assert.equal(G.pickPropAct({ id: 'crow' }, 'peach', () => 0, (a) => a.act !== 'perch').act, 'nap');
  assert.equal(G.pickPropAct({ id: 'crow' }, 'peach', () => 0.5, () => false), null);
  assert.equal(G.pickPropAct({ id: 'crow' }, 'nope'), null);
  // 새 소품도 놓을 수 있음
  const s = withStars(0);
  for (const id of ['drum', 'bell', 'fountain', 'nest', 'feed']) assert.ok(G.addProp(s, D, id, 400, 500).ok, id);
});

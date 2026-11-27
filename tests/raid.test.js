// 보스 레이드(raid.json) 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData, loadRaw } from './helpers.js';
import { buildData } from '../src/logic/data.js';
import { createGauntlet, autoRun } from '../src/logic/gauntlet.js';

const BASE = loadData();
const OFF = buildData({ ...loadRaw(), raid: {} });

function fp(D, id, seed, hard) {
  const st = createGauntlet(D, id, seed * 7919, { hard, spells: ['meteor', 'wall'] });
  autoRun(st, D);
  return [id, seed, hard, st.result, st.enc, st.downs, st.life, Math.round(st.time * 100)].join(',');
}

test('raid.json이 비면 예전(main) 게임과 결과가 똑같다', () => {
  const want = readFileSync(new URL('./fixtures/raid-off-fingerprint.txt', import.meta.url), 'utf8').trim().split('\n');
  for (const line of want.filter((l) => l.startsWith('forest-1,'))) {
    const [id, seed, hard] = line.split(',');
    assert.equal(fp(OFF, id, +seed, hard === 'true'), line);
    assert.equal(fp(buildData({ ...loadRaw(), raid: null }), id, +seed, hard === 'true'), line);
  }
});

test('늦은 보스 6마리도 속성이 생기고(raid.json), 파일이 비면 예전처럼 속성 없음', async () => {
  const { enemyElement } = await import('../src/logic/matchup.js');
  const want = { boss_lava: 'fire', boss_witch: 'water', boss_knight: 'moon', boss_gate: 'thunder', boss_mole: 'grass', overlord: 'fire' };
  for (const [id, el] of Object.entries(want)) {
    assert.equal(enemyElement(BASE, { id: 'x' }, id), el, id);
    assert.equal(enemyElement(OFF, { id: 'x' }, id), null, id);
  }
});

test('보스 레이드 유물은 raid.json에 보스가 있을 때만 나온다', async () => {
  const { loadRaw } = await import('./helpers.js');
  const { buildData } = await import('../src/logic/data.js');
  const on = buildData(loadRaw());
  const off = buildData({ ...loadRaw(), raid: {} });
  assert.ok(on.relicCfg.relics.some((r) => r.raid));
  assert.ok(!off.relicCfg.relics.some((r) => r.raid));
});

test('보스 카드·보스 대비: good 목록이면 +1, bad면 -1, raid 없으면 0', async () => {
  const { bossCard, bossFit } = await import('../src/logic/raid.js');
  const st = BASE.stageById['stage-7'];
  const c = bossCard(BASE, st);
  assert.equal(c.element, 'fire');
  assert.ok(c.patterns.length >= 3);
  assert.equal(bossFit(BASE, st, c.good[0]), 1);
  assert.equal(bossFit(BASE, st, c.bad.find((x) => !c.good.includes(x))), -1);
  assert.equal(bossFit(OFF, st, c.good[0]), 0);
  assert.equal(bossCard(OFF, st), null);
});

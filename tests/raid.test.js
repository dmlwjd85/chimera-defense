// 보스 레이드(raid.json) 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from './helpers.js';
import { createGauntlet, autoRun } from '../src/logic/gauntlet.js';

const BASE = loadData();
const OFF = { ...BASE, raid: null };

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
    assert.equal(fp({ ...BASE, raid: {} }, id, +seed, hard === 'true'), line);
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

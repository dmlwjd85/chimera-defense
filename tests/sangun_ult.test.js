import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { loadData, mkUnit, mkEnemy, mkState } from './helpers.js';
import { tickUnitSkills, applySangunUlt } from '../src/logic/combat.js';

const D = loadData();

test('산군 필살기 v6 에셋과 시간표 JSON이 규격대로 포장돼 있음', () => {
  const cfg = JSON.parse(readFileSync(new URL('../public/data/sangun_ult.json', import.meta.url), 'utf8'));
  assert.equal(cfg.one_play_ms, 2560);
  assert.equal(cfg.ground_baseline_y, 104);
  assert.equal(cfg.canvas.width, 192);
  assert.equal(cfg.canvas.height, 144);
  assert.equal(cfg.frames.length, 17);
  const total = cfg.frames.reduce((s, f) => s + f.duration_ms, 0);
  assert.equal(total, 2560);

  for (const name of ['char', 'under', 'over']) {
    const pngUrl = new URL(`../public/assets/fx/sangun-ult/${name}.png`, import.meta.url);
    const jsonUrl = new URL(`../public/assets/fx/sangun-ult/${name}.json`, import.meta.url);
    assert.ok(existsSync(pngUrl), `${name}.png exists`);
    assert.ok(existsSync(jsonUrl), `${name}.json exists`);
    const atlas = JSON.parse(readFileSync(jsonUrl, 'utf8'));
    const count = Object.keys(atlas.frames).length;
    assert.equal(count, name === 'char' ? 8 : 17);
  }
});

test('deferSangunUlt가 켜진 상태에서 산군(spirit) 어흥 발동 시 연출 이벤트를 먼저 내고, 종료 후 기존 효과가 적용됨', async () => {
  const sangun = await mkUnit(D, 1, 'tiger', 'spirit', 5.4);
  sangun.skillCd = { t0: 0.01 };
  const e1 = await mkEnemy(D, 'normal', 6.4, 1);
  const e2 = await mkEnemy(D, 'normal', 11.5, 2); // 반경(3) 밖
  const s = mkState(D, [sangun], [e1, e2]);
  s.deferSangunUlt = true;
  s.patches = [];

  tickUnitSkills(s, D, 0.05);
  const ultEv = s.events.find((ev) => ev.type === 'sangunUlt');
  assert.ok(ultEv, 'sangunUlt 이벤트가 발생해야 함');
  assert.equal(ultEv.uid, 1);
  assert.deepEqual(ultEv.eids, [1]);
  assert.equal(e1.confuseLeft ?? 0, 0, '연출 중에는 아직 달아나기(confuseLeft)가 적용되지 않음');
  assert.equal(s.patches.length, 0, '연출 중에는 번개 장판도 아직 생성되지 않음');

  const applied = applySangunUlt(s, D, 1);
  assert.deepEqual(applied, [1]);
  assert.ok(e1.confuseLeft > 0, '연출 완료 후 범위 내 적에게 공포(달아남) 적용');
  assert.equal(e2.confuseLeft ?? 0, 0, '범위 밖 적은 영향 없음');
  assert.equal(s.patches.length, 1, '신화급 산군 번개 장판 생성');
  assert.ok(s.events.some((ev) => ev.type === 'skill' && ev.fx === 'flee'));
});

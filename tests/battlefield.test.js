import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { laneFeet, fightLaneY, groundOf, laneSpread, laneBounds, midRows, midPlace, bfOf, labelFull, labelBar, LABEL_HOLD } from '../src/logic/battlefield.js';
import { loadData } from './helpers.js';

const D = loadData();
const BF = bfOf(D.battlefield);
const arts = [...new Set(D.stages.map((s) => s.art ?? s.id)), 'forest-1'];

test('모든 스테이지 배경에 땅 높이·성·차원문 자리가 있음', () => {
  for (const a of arts) {
    assert.ok(BF.ground[a] != null, `땅 높이 없음: ${a}`);
    for (const k of ['castle', 'portal']) {
      const L = BF.landmarks[a]?.[k];
      assert.ok(L, `${k} 자리 없음: ${a}`);
      for (const n of ['x', 'y', 'w', 'h']) assert.ok(Number.isInteger(L[n]), `${a} ${k}.${n}는 정수(1배 겹쳐 그리기)`);
      assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.w <= 1280 && L.y + L.h <= 720, `${a} ${k} 화면 안`);
      assert.ok(existsSync(new URL(`../public/assets/bg/lm/${a}-${k}.png`, import.meta.url)), `${a}-${k}.png 없음`);
      assert.ok(existsSync(new URL(`../public/assets/bg/lm/${a}-${k}-rim.png`, import.meta.url)), `${a}-${k}-rim.png 없음`);
    }
    // 성은 왼쪽, 차원문은 오른쪽
    assert.ok(BF.landmarks[a].castle.x + BF.landmarks[a].castle.w / 2 < 400);
    assert.ok(BF.landmarks[a].portal.x + BF.landmarks[a].portal.w / 2 > 900);
  }
});

test('덧그림이 화면 묶음(manifest)에 들어 있음', () => {
  const m = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'));
  for (const a of arts) for (const k of ['castle', 'castle-rim', 'portal', 'portal-rim']) assert.equal(m.images[`lm-${a}-${k}`], `assets/bg/lm/${a}-${k}.png`);
});

test('세 라인 발이 모두 그 배경의 땅 위, 아래 기록판에 이름표가 닿지 않음', () => {
  for (const a of arts) {
    const f = laneFeet(BF, a);
    assert.equal(f[0], groundOf(BF, a));
    assert.ok(f[0] >= BF.ground[a], `${a}: 먼 줄이 땅보다 위(하늘)`);
    assert.ok(f[0] < f[1] && f[1] < f[2], `${a}: 위→아래 순서`);
    assert.ok(f[1] - f[0] >= BF.minGap && f[2] - f[1] >= BF.minGap, `${a}: 줄 간격 ${f}`);
    assert.ok(f[2] + BF.nameBelowFoot <= BF.hudTop, `${a}: 앞줄 이름표가 아래 기록판(${BF.hudTop})에 닿음`);
    const y = fightLaneY(BF, a);
    assert.deepEqual(y, f.map((v) => v - BF.foot));
    // 예전 값(공중) [318, 418, 518]보다 먼 줄이 확실히 내려옴
    assert.ok(y[0] >= 360, `${a}: 먼 줄이 아직 높음 ${y[0]}`);
    const b = laneBounds(BF, a);
    assert.ok(b.min < y[0] && b.max >= y[2], `${a}: 머무는 범위가 세 라인을 품음`);
    assert.ok(b.max + BF.foot + BF.nameBelowFoot <= BF.hudTop);
    assert.ok(laneSpread(BF, a) * 2 <= Math.min(f[1] - f[0], f[2] - f[1]), `${a}: 같은 라인 비켜 서기가 옆 라인을 넘지 않음`);
  }
});

test('날아다니는 적은 땅보다 조금 떠 있고, 먼 줄에서도 화면 위 알림 띠(~150)보다 아래', () => {
  for (const a of arts) {
    const y = fightLaneY(BF, a)[0] - BF.flyLift;
    assert.ok(BF.flyLift > 0 && BF.flyLift <= 60);
    assert.ok(y > 300, `${a}: 나는 적 ${y}`);
  }
});

test('표에 없는 배경은 가운데 값, 너무 높거나 낮은 값은 묶음', () => {
  assert.equal(groundOf({ ground: {} }, 'nope'), Math.round((BF.groundMin + BF.groundMax) / 2));
  assert.equal(groundOf({ ground: { a: 100 } }, 'a'), BF.groundMin);
  assert.equal(groundOf({ ground: { a: 700 } }, 'a'), BF.groundMax);
});

test('가운데 연출 줄은 먼 줄 머리보다 위', () => {
  for (const a of arts) {
    const rows = midRows(BF, a), top = fightLaneY(BF, a)[0];
    assert.ok(rows.length >= 2, `${a}: 줄 ${rows}`);
    for (const r of rows) assert.ok(r >= 150 && r <= top - 96);
  }
});

test('가운데 연출: 여러 개가 같이 떠도 겹치지 않게 줄 세움', () => {
  const rows = [178, 222, 266], busy = [];
  for (let i = 0; i < 8; i++) {
    const p = midPlace({ rows, w: 300, h: 36, want: 640, busy });
    assert.ok(p, `${i}번째 자리 없음`);
    for (const b of busy) assert.ok(p.x1 <= b.x0 || p.x0 >= b.x1 || p.y1 <= b.y0 || p.y0 >= b.y1, '겹침');
    assert.ok(p.x0 >= 12 && p.x1 <= 1268);
    busy.push(p);
  }
  // 꽉 차면 null(억지로 겹치지 않음)
  const full = [{ x0: 0, x1: 1280, y0: 0, y1: 720 }];
  assert.equal(midPlace({ rows, w: 100, h: 30, want: 640, busy: full }), null);
});

test('새 문구는 text.json 한 곳에 모여 있음(다국어용)', () => {
  const t = JSON.parse(readFileSync(new URL('../public/data/text.json', import.meta.url), 'utf8'));
  for (const k of ['mid.ult.title', 'mid.ult.who', 'mid.start.1', 'mid.boss.1', 'mid.bossTaunt.1', 'mid.down.1', 'mid.win.1', 'mid.nextBoss']) assert.ok(typeof t[k] === 'string' && t[k].length > 0, k);
  for (const [k, v] of Object.entries(t)) if (k.startsWith('mid.')) assert.ok(v.length <= 24, `짧게: ${k}`);
});

test('교전 중 이름표는 평소에 숨기고, 올리거나 누른 뒤에만 전부 보임', () => {
  assert.equal(labelFull('regroup'), true);
  assert.equal(labelFull('ended'), true);
  assert.equal(labelFull(undefined), true);
  assert.equal(labelFull('fight'), false);
  assert.equal(labelFull('fight', { hover: true }), true);
  assert.equal(labelFull('fight', { until: 3000, now: 1000 }), true);
  assert.equal(labelFull('fight', { until: 3000, now: 3000 }), false);
  assert.equal(labelFull('fight', { hover: false, until: 0, now: 10 }), false);
  // 다른 대상을 눌렀을 때(until이 그 대상 것이 아니면 호출부가 until=0을 넘김)는 숨김
  assert.equal(labelFull('fight', { hover: false, until: 0, now: 1 }), false);
  assert.ok(LABEL_HOLD >= 1500 && LABEL_HOLD <= 4000);
  assert.deepEqual(labelBar(true), { h: 8, y: 48, gy: 55 });
  assert.deepEqual(labelBar(false), { h: 5, y: 46, gy: 52 });
  assert.ok(labelBar(false).h < labelBar(true).h);
});

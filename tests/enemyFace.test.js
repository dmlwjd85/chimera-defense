import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENEMY_FACES_LEFT, PORTRAIT_FACES_RIGHT, enemyFace, enemyPortraitFlip } from '../src/logic/enemyFace.js';
import { decodePng } from '../tools/dotpng.mjs';

test('원화부터 왼쪽을 보는 적은 뒤집지 않아 스폰 때도 왼쪽을 본다', () => {
  const left = ['bat', 'wisp', 'boss_frost', 'fast', 'boss_bat', 'boss_bat_t1', 'boss_bat_t2'];
  for (const id of left) {
    assert.equal(enemyFace(id), 1, id);
    assert.ok(ENEMY_FACES_LEFT.has(id), id);
  }
});

test('원화가 오른쪽을 보는 적은 뒤집어 왼쪽을 본다', () => {
  for (const id of ['normal', 'zombie', 'miniboss', 'boss_boar', 'boss_frost_t1', 'skeleton', 'boss_lich', 'boss_bone', 'flying', 'swarm']) {
    assert.equal(enemyFace(id), -1, id);
  }
});

test('등 뒤를 칠 때만 잠깐 반대(오른쪽)를 본다', () => {
  assert.equal(enemyFace('fast', true), -1);
  assert.equal(enemyFace('normal', true), 1);
  assert.equal(enemyFace('boss_bat', true), -1);
});

test('한 장 초상화: 오른쪽을 보는 그림만 뒤집어 왼쪽으로', () => {
  assert.equal(enemyPortraitFlip('fast'), false);
  assert.equal(enemyPortraitFlip('flying'), true);
  assert.equal(enemyPortraitFlip('swarm'), true);
  assert.equal(enemyPortraitFlip('boss_bat'), false);
  assert.equal(enemyPortraitFlip('boss_frost'), false);
  assert.equal(enemyPortraitFlip('bat'), false);
  for (const id of ['normal', 'miniboss', 'zombie', 'boss_boar', 'boss_lich', 'skeleton', 'boss_bone', 'healer', 'ghost']) {
    assert.equal(enemyPortraitFlip(id), true, id);
    assert.ok(PORTRAIT_FACES_RIGHT.has(id), id);
  }
});

test('떠도는 넋은 원화가 오른쪽을 보므로 뒤집어 왼쪽을 본다', () => {
  assert.equal(enemyFace('ghost'), -1);
  assert.equal(enemyPortraitFlip('ghost'), true);
});

// 걷기 첫 장의 머리(눈)가, 방향 표를 적용한 뒤에 왼쪽(동물 쪽)에 있는지 그림으로 검사

function walkCrop(id) {
  const d = JSON.parse(readFileSync(new URL(`../public/data/dotm/en_${id}.dot.json`, import.meta.url), 'utf8'));
  const fr = d.sets.adult.move.frames[0];
  const [x, y, w, h] = d.rects[fr];
  const img = decodePng(readFileSync(new URL(`../public/${d.file}`, import.meta.url)));
  const pixels = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = ((y + yy) * img.width + (x + xx)) * 4;
    const a = img.data[i + 3];
    if (a < 16) continue;
    pixels.push({ x: xx, y: yy, r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
  }
  return { w, h, pixels };
}

function applyFace(crop, facing) {
  if (facing >= 0) return crop;
  return { ...crop, pixels: crop.pixels.map((p) => ({ ...p, x: crop.w - 1 - p.x })) };
}

/** 눈처럼 보이는 보라·분홍 점의 가로 무게중심(0=왼쪽, 1=오른쪽) */
function eyeCenterX(crop) {
  let sx = 0, n = 0;
  for (const p of crop.pixels) {
    // 홀림 나비·독무당벌레의 눈: 분홍·보라(빨강·파랑이 초록보다 큼)
    if (p.r > 80 && p.b > 80 && p.g < p.r * 0.85 && p.g < p.b * 0.85 && (p.r + p.b) > 280) {
      sx += p.x; n++;
    }
  }
  return n > 8 ? sx / n / crop.w : null;
}

test('홀림 나비·독무당벌레 떼는 뒤집은 뒤 눈이 왼쪽(동물 쪽)에 있다', () => {
  for (const id of ['flying', 'swarm']) {
    const crop = applyFace(walkCrop(id), enemyFace(id));
    const cx = eyeCenterX(crop);
    assert.ok(cx != null, `${id}: 눈 색 점을 찾지 못함`);
    assert.ok(cx < 0.5, `${id}: 눈 가로 위치 ${cx.toFixed(3)} (0.5보다 왼쪽이어야 함)`);
  }
});

test('복면 여우 자객은 뒤집지 않아 주둥이(왼쪽 끝)가 왼쪽에 남는다', () => {
  assert.equal(enemyFace('fast'), 1);
  const crop = walkCrop('fast');
  // 주황 털이 있는 가장 왼쪽 칸이 전체 너비의 왼쪽 절반에 있어야 함
  const xs = crop.pixels.filter((p) => p.r > 160 && p.g > 70 && p.g < 160 && p.b < 80).map((p) => p.x);
  assert.ok(xs.length > 10, '여우 주황 털을 찾지 못함');
  const left = Math.min(...xs) / crop.w;
  assert.ok(left < 0.35, `여우 왼쪽 끝 ${left.toFixed(3)} (주둥이가 왼쪽)`);
});

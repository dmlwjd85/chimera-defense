import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ENEMY_ART_DIR, PORTRAIT_ART_DIR, enemyFace, enemyPortraitFlip } from '../src/logic/enemyFace.js';
import { decodePng } from '../tools/dotpng.mjs';

test('원화 방향 표: 시트 48장·적 이름·초상화가 빠짐없이 들어 있다 (기억으로 정하지 않기)', () => {
  const dir = new URL('../public/data/dotm/', import.meta.url);
  const sheets = readdirSync(dir).filter((f) => /^en_.*\.dot\.json$/.test(f)).map((f) => f.slice(3, -9));
  assert.ok(sheets.length >= 48, '적 시트 수');
  for (const id of sheets) assert.ok(ENEMY_ART_DIR[id], `시트 ${id}가 원화 방향 표에 없음`);
  for (const id of Object.keys(ENEMY_ART_DIR)) assert.ok(sheets.includes(id), `표의 ${id} 시트가 없음`);
  const enemies = JSON.parse(readFileSync(new URL('../public/data/enemies.json', import.meta.url), 'utf8'));
  const list = Array.isArray(enemies) ? enemies : (enemies.enemies ?? Object.values(enemies));
  assert.ok(list.length >= 24);
  for (const e of list) {
    assert.ok(ENEMY_ART_DIR[e.id], `적 ${e.id}가 표에 없음`);
    assert.ok(PORTRAIT_ART_DIR[e.id], `적 ${e.id} 초상화가 표에 없음`);
    if (e.boss) for (const t of ['_t1', '_t2']) if (sheets.includes(e.id + t)) assert.ok(ENEMY_ART_DIR[e.id + t], e.id + t);
  }
  const pngs = readdirSync(new URL('../public/assets/units/', import.meta.url)).filter((f) => /^enemy-.*\.png$/.test(f)).map((f) => f.slice(6, -4));
  for (const id of pngs) assert.ok(PORTRAIT_ART_DIR[id], `초상화 ${id}가 표에 없음`);
  for (const t of [ENEMY_ART_DIR, PORTRAIT_ART_DIR]) for (const [id, v] of Object.entries(t)) {
    assert.ok(['R', 'F', 'L'].includes(v[0]) && v[1], `${id}: 방향·근거가 있어야 함`);
  }
});

test('표대로: 왼쪽 원화만 그대로, 나머지는 모두 뒤집어 늘 왼쪽을 본다 (보스 3단계 포함)', () => {
  for (const [id, v] of Object.entries(ENEMY_ART_DIR)) assert.equal(enemyFace(id), v[0] === 'L' ? 1 : -1, id);
  for (const id of ['boss_frost', 'boss_frost_t1', 'boss_frost_t2', 'boss_bat', 'boss_bat_t1', 'boss_bat_t2', 'fast', 'bat', 'wisp', 'ghost', 'flying', 'swarm', 'normal']) {
    assert.equal(enemyFace(id), -1, id);
  }
});

test('등 뒤를 칠 때만 잠깐 반대(오른쪽)를 본다', () => {
  assert.equal(enemyFace('fast', true), 1);
  assert.equal(enemyFace('normal', true), 1);
  assert.equal(enemyFace('boss_frost', true), 1);
});

test('한 장 초상화: 왼쪽 원화가 아니면 뒤집어 왼쪽으로 (표대로)', () => {
  for (const [id, v] of Object.entries(PORTRAIT_ART_DIR)) assert.equal(enemyPortraitFlip(id), v[0] !== 'L', id);
  for (const id of ['fast', 'boss_frost', 'boss_bat', 'bat', 'wisp', 'flying', 'swarm', 'ghost']) assert.equal(enemyPortraitFlip(id), true, id);
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

test('복면 여우 자객: 큰 꼬리가 왼쪽에 있는 원화라 오른쪽을 본다 → 뒤집어야 한다', () => {
  assert.equal(enemyFace('fast'), -1);
  const crop = walkCrop('fast');
  // 주황 털의 가장 왼쪽 끝(=꼬리)이 전체 너비의 왼쪽 가장자리에 붙어 있다
  const xs = crop.pixels.filter((p) => p.r > 160 && p.g > 70 && p.g < 160 && p.b < 80).map((p) => p.x);
  assert.ok(xs.length > 10);
  assert.ok(Math.min(...xs) / crop.w < 0.35, '꼬리가 왼쪽 끝');
  // 단검(밝은 회색 칼날)은 오른쪽 절반에 있다
  const blade = crop.pixels.filter((p) => p.r > 170 && p.g > 170 && p.b > 170 && Math.abs(p.r - p.b) < 30).map((p) => p.x);
  assert.ok(blade.length > 4 && blade.reduce((a, b) => a + b, 0) / blade.length / crop.w > 0.6, '단검이 오른쪽');
});

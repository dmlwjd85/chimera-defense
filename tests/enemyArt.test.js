// 적 그림 키가 실제 파일·칸과 맞는지: 안 맞으면 전투·도감에 네모 대체 그림이 뜬다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateDot } from '../src/rig/dotData.js';
import { decodePng } from '../tools/dotpng.mjs';

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const src = (p) => new URL(`../${p}`, import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(pub(p), 'utf8'));

test('모든 적: 동작 시트·초상화 파일이 있고, 장 이름과 칸이 그림 안에 맞음', () => {
  const enemies = readJson('data/enemies.json');
  const manifest = readJson('assets/manifest.json').images;
  const index = new Set(readJson('data/dotm/index.json').species);
  assert.ok(enemies.length > 0);
  const missing = [];
  for (const e of enemies) {
    const sheetKey = 'en_' + (e.skin ?? e.id);
    const portraitKey = 'enemy-' + e.id;
    if (!manifest[portraitKey]) missing.push(`${e.id}: 도감 초상화 키가 목록에 없음`);
    else if (!existsSync(pub(manifest[portraitKey]))) missing.push(`${e.id}: 초상화 파일 없음 (${manifest[portraitKey]})`);
    if (!index.has(sheetKey)) missing.push(`${e.id}: 동작 시트가 색인에 없음 (${sheetKey})`);
    else {
      const d = readJson(`data/dotm/${sheetKey}.dot.json`);
      const errs = validateDot(d);
      if (errs.length) missing.push(`${e.id}: 설정 오류 ${errs.join('; ')}`);
      if (!existsSync(pub(d.file))) missing.push(`${e.id}: 시트 그림 없음 (${d.file})`);
      else {
        const img = decodePng(readFileSync(pub(d.file)));
        for (const name of d.frames) {
          const r = d.rects?.[name];
          if (!r || r.length < 4) { missing.push(`${e.id}: 장 ${name}에 칸 없음`); continue; }
          const [x, y, w, h] = r;
          if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > img.width || y + h > img.height) {
            missing.push(`${e.id}: 장 ${name}이 시트(${img.width}×${img.height}) 밖 ${r.slice(0, 4)}`);
          }
        }
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('8스테이지에는 안개 늪의 마녀 동작 시트가 연결되어 있음', () => {
  const stages = readJson('data/stages.json');
  const stage = stages.find((s) => s.id === 'stage-8');
  assert.equal(stage?.boss, 'boss_witch');
  assert.ok(stage.waves.some((w) => (w.extra ?? []).includes('boss_witch')));
  for (const key of ['en_boss_witch', 'en_boss_witch_t1', 'en_boss_witch_t2']) {
    const d = readJson(`data/dotm/${key}.dot.json`);
    assert.ok(existsSync(pub(d.file)), key);
  }
});

test('전투·연전은 preload 인자가 아니라 init에서 받은 판 이름으로 시트를 불러옴', () => {
  // Phaser preload() 타입은 (this)=>void 라서, preload(d)의 d는 시작 값이 아님.
  // 예전에는 항상 1스테이지 시트만 불러 마녀 같은 뒷판 적이 네모로 보였음.
  const battle = readFileSync(src('src/scenes/BattleScene.js'), 'utf8');
  const gauntlet = readFileSync(src('src/scenes/GauntletScene.js'), 'utf8');
  for (const [name, srcText] of [['BattleScene', battle], ['GauntletScene', gauntlet]]) {
    assert.match(srcText, /init\s*\(\s*d\s*\)\s*\{\s*this\.bootData/, `${name} must keep start data in init`);
    assert.match(srcText, /preload\s*\(\s*\)\s*\{/, `${name} preload must not take a start-data argument`);
    assert.match(srcText, /const d = this\.bootData/, `${name} preload must read bootData`);
  }
});

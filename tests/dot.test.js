// 도트 데이터 시험: 규격 검사기 자체가 맞게 잡는지 + 실제 등록된 도트 그림(public/data/dot)이 규격을 지키는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateDot, checkFrame, checkSheet, clipDuration, OUTLINE } from '../src/rig/dotData.js';
import { decodePng, encodePng } from '../tools/dotpng.mjs';

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(pub(p), 'utf8'));

// 작은 예시 종: 8×8 칸 2장, 발밑선 y=6
const FILL = '#ea6c12';
const sample = () => ({
  species: 'test', sheet: 'dot-test', file: 'assets/dot/test.png', frameW: 8, frameH: 8, foot: 6, cols: 2,
  palette: [OUTLINE, FILL, '#ffffff'], frames: ['idle_01', 'claw_01'], standing: ['idle_01'], attacks: ['claw'],
  sets: { adult: { idle: { frames: ['idle_01'], durs: [0.24], loop: true }, claw: { frames: ['idle_01', 'claw_01'], durs: [0.12, 0.11], hold: { frame: 1, sec: 0.09 }, events: [[0.12, 'hit']] } } },
  stages: { adult: { set: 'adult', scale: 1 } },
});
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** 문자 격자로 그림 만들기: K=외곽선, F=주색, W=흰색, h=반투명, x=팔레트 밖 색, .=투명 */
function img(rows) {
  const height = rows.length, width = rows[0].length, data = new Uint8Array(width * height * 4);
  const col = { K: [...hexRgb(OUTLINE), 255], F: [...hexRgb(FILL), 255], W: [255, 255, 255, 255], h: [...hexRgb(FILL), 128], x: [1, 2, 3, 255] };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) data.set(col[ch], (y * width + x) * 4); }));
  return { width, height, data };
}
const GOOD = ['........', '..KKKK..', '.KFFFFK.', '.KFFFFK.', '.KFFFFK.', '.KFFFFK.', '..KKKK..', '........'];

test('validateDot: sample passes, clip length includes the hit freeze', () => {
  assert.deepEqual(validateDot(sample()), []);
  assert.ok(Math.abs(clipDuration(sample().sets.adult.claw) - 0.32) < 1e-9);
});

test('validateDot catches broken data', () => {
  const cases = [
    [(d) => { delete d.sets.adult.idle; }, /idle missing/],
    [(d) => { d.sets.adult.claw.events = []; }, /hit event/],
    [(d) => { d.sets.adult.claw.durs = [0.1]; }, /durs must match/],
    [(d) => { d.sets.adult.claw.frames[1] = 'nope'; }, /unknown frame nope/],
    [(d) => { d.sets.adult.claw.events = [[5, 'hit']]; }, /outside the clip/],
    [(d) => { d.stages.teen = { set: 'baby', scale: 1 }; }, /unknown set baby/],
    [(d) => { d.palette = ['#ea6c12']; }, /outline/],
    [(d) => { d.sheet = 'fox'; }, /dot-/],
    [(d) => { d.foot = 8; }, /foot/],
  ];
  for (const [breakIt, re] of cases) { const d = sample(); breakIt(d); assert.match(validateDot(d).join('\n'), re); }
});

test('checkFrame: clean frame passes', () => {
  const r = checkFrame(img(GOOD), 0, 0, { ...sample(), standing: true });
  assert.deepEqual(r.errors, []); assert.equal(r.colors, 2);
});

test('checkFrame catches pixel problems', () => {
  const spec = { ...sample(), standing: true };
  const bad = (rows, re) => assert.match(checkFrame(img(rows), 0, 0, spec).errors.join('\n'), re);
  bad(GOOD.map((r, y) => (y === 3 ? '.KFhFFK.' : r)), /semi-transparent/);
  bad(GOOD.map((r, y) => (y === 3 ? '.KFxFFK.' : r)), /outside palette/);
  bad(GOOD.map((r, y) => (y === 3 ? '.FFFFFK.' : r)), /outline broken/);
  bad([...GOOD.slice(0, 7), '...K....'], /below the foot line/);
  bad(GOOD.map((r, y) => (y === 6 ? '........' : y === 0 ? 'K.......' : r)), /isolated pixels|does not touch/);
  bad(['........', '..KKKK..', '.KFFFFK.', '.KFFFFK.', '..KKKK..', '........', '........', '........'], /does not touch the foot line/);
  bad(GOOD.map(() => '........'), /empty frame/);
  // 흰색(타격 빛)은 외곽선 없이 투명과 닿아도 됨
  assert.deepEqual(checkFrame(img(GOOD.map((r, y) => (y === 0 ? '...W....' : r))), 0, 0, spec).errors, []);
});

test('checkSheet checks size and every frame', () => {
  const a = img(GOOD), sheet = { width: 16, height: 8, data: new Uint8Array(16 * 8 * 4) };
  for (let y = 0; y < 8; y++) for (const ox of [0, 8]) sheet.data.set(a.data.subarray(y * 32, y * 32 + 32), (y * 16 + ox) * 4);
  assert.deepEqual(checkSheet(sheet, sample()).errors, []);
  assert.match(checkSheet({ ...sheet, width: 15 }, sample()).errors.join(), /sheet width/);
});

test('PNG write → read keeps every pixel', () => {
  const a = img(GOOD), b = decodePng(encodePng(a));
  assert.equal(b.width, 8); assert.equal(b.height, 8); assert.deepEqual([...b.data], [...a.data]);
});

test('every registered dot species follows the spec', () => {
  const index = readJson('data/dot/index.json');
  assert.ok(Array.isArray(index.species));
  const manifest = readJson('assets/manifest.json').images;
  for (const sp of index.species) {
    const d = readJson(`data/dot/${sp}.dot.json`);
    assert.deepEqual(validateDot(d), [], sp);
    assert.equal(d.species, sp);
    assert.equal(manifest[d.sheet], d.file, `${sp}: manifest must list ${d.sheet}`);
    assert.ok(existsSync(pub(d.file)), `${sp}: ${d.file} missing`);
    const r = checkSheet(decodePng(readFileSync(pub(d.file))), d);
    assert.deepEqual(r.errors, [], `${sp} sheet`);
  }
});

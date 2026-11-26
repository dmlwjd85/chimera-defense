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
    [(d) => { delete d.sets.adult.claw; }, /no attack clip/],
    [(d) => { d.sets.adult.top = 99; }, /top must be a row/],
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

// ---------- 도트 재생기(DotInstance): RigInstance와 같은 약속으로 움직이는지 ----------
import { DotInstance } from '../src/rig/DotInstance.js';

const T6 = [0.12, 0.12, 0.07, 0.11, 0.20, 0.28];
const foxLike = () => ({
  ...sample(), frames: ['b1', 'b2', 'b3', 'b4', 'a1', 'a2', 'a3', 'a4', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'], cols: 14, standing: [],
  sets: {
    baby: { idle: { frames: ['b1', 'b2', 'b3', 'b4'], durs: [0.22, 0.22, 0.22, 0.22], loop: true } },
    adult: {
      idle: { frames: ['a1', 'a2', 'a3', 'a4'], durs: [0.24, 0.24, 0.24, 0.24], loop: true },
      claw: { frames: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], durs: T6, hold: { frame: 3, sec: 0.09 }, events: [[0.31, 'hit']] },
    },
  },
  stages: { young: { set: 'baby', scale: 0.8 }, teen: { set: 'baby', scale: 1 }, adult: { set: 'adult', scale: 1 } },
});
const step = (inst, sec, dt = 1 / 120) => { const ev = []; for (let t = 0; t < sec - 1e-9; t += dt) ev.push(...inst.update(dt)); return ev; };

test('DotInstance: claw follows the 0.12/0.12/0.07/0.11+freeze/0.20/0.28 timetable and fires hit at frame 4', () => {
  assert.deepEqual(validateDot(foxLike()), []);
  const f = new DotInstance(foxLike(), { stage: 'adult' });
  const hits = []; f.on('hit', (e) => hits.push(e.t));
  f.play('claw');
  const seen = [];
  for (const t of [0.05, 0.17, 0.27, 0.35, 0.47, 0.6, 0.85]) { step(f, t - (seen.length ? [0.05, 0.17, 0.27, 0.35, 0.47, 0.6, 0.85][seen.length - 1] : 0)); seen.push(f.getPose().frame); }
  assert.deepEqual(seen, ['c1', 'c2', 'c3', 'c4', 'c4', 'c5', 'c6']);   // 0.42~0.51초는 4번 장에서 멈칫
  assert.deepEqual(hits, [0.31]);
  assert.equal(f.motion, 'claw'); assert.equal(f.finished, false);
  const ev = step(f, 0.2);
  assert.ok(ev.some((e) => e.name === 'complete' && e.data === 'claw'));
  assert.equal(f.motion, 'idle');                                        // 끝나면 대기로 돌아감
});

test('DotInstance: every battle motion exists, unknown names fall back to idle, stages pick their art', () => {
  const d = foxLike();
  for (const st of ['young', 'teen', 'adult']) {
    const f = new DotInstance(d, { stage: st });
    for (const m of ['idle', 'move', 'attack', 'claw', 'skill', 'hit', 'down', 'respawn', 'victory', 'merge_in', 'evolve']) {
      assert.ok(f.anims[m], `${st} ${m}`);
      f.play(m); step(f, 0.3); assert.ok(d.frames.includes(f.getPose().frame), `${st} ${m} frame`);
    }
    assert.equal(f.anims.fly, undefined);                                 // 나는 동물이 아니면 날갯짓 없음(전투 코드가 걷기로 씀)
    f.play('no_such_motion'); assert.equal(f.motion, 'idle');
    assert.equal(new DotInstance(d, { stage: st }).getPose().frame[0], st === 'adult' ? 'a' : 'b');
  }
  assert.equal(new DotInstance(d, { stage: 'spirit' }).stageKey, 'adult'); // 그림 없는 단계는 성체로
});

test('DotInstance: baby attack (no drawn claw) still hits on time, lunges forward; down stays; flash/silhouette/facing', () => {
  const f = new DotInstance(foxLike(), { stage: 'young' });
  const hits = []; f.on('hit', (e) => hits.push(e.t));
  f.play('claw'); step(f, 0.4);
  assert.deepEqual(hits, [0.31]);
  assert.ok(f.getPose().dx > 0, 'lunges toward the enemy');
  f.play('down'); step(f, 2);
  assert.equal(f.motion, 'down'); assert.equal(f.finished, true); assert.ok(f.getPose().alpha < 0.6);
  f.hitFlash(0.1); assert.equal(f.getPose().white, true); step(f, 0.12); assert.equal(f.getPose().white, false);
  f.silhouette = true; assert.equal(f.getPose().silhouette, true);
  f.setFacing(-1); assert.equal(f.getPose().facing, -1);
});

// 동작 시트(PixelLab 동작, public/data/dotm): 규격 + 잘라 묶은 칸(rects)이 시트 안에 있고 장마다 칸 검사(반투명·팔레트 밖·외딴 점)를 통과
test('motion dot sheets (dotm) pass the rules', () => {
  if (!existsSync(pub('data/dotm/index.json'))) return;
  for (const key of readJson('data/dotm/index.json').species) {
    const d = readJson(`data/dotm/${key}.dot.json`);
    assert.deepEqual(validateDot(d), [], key);
    const sheet = decodePng(readFileSync(pub(d.file)));
    assert.ok(d.palette.length <= 16 && d.palette.includes(OUTLINE), `${key} palette`);
    for (const name of d.frames) {
      const [x, y, w, h] = d.rects[name];
      assert.ok(x + w <= sheet.width && y + h <= sheet.height, `${key} ${name} rect inside sheet`);
      const r = checkFrame(sheet, x, y, { frameW: w, frameH: h, foot: h + 99, palette: d.palette });
      const bad = r.errors.filter((e) => !/outline broken|foot line/.test(e));
      assert.deepEqual(bad, [], `${key} ${name}`);
    }
    // 기술 묶음 동작이 단계마다 있는지: 아기 기본1, 성장기 +기본2, 성체 +속성, 신화급 +필살기
    const own = readJson('data/config.json').moves?.ultOwn ?? [];   // 전용 필살기 연출이 있는 종(산군)은 공용 필살기 동작 없음
    const need = { baby: ['idle', 'move', 'attack', 'hit', 'down'], teen: ['attack2'], adult: ['attack2', 'skill'], myth: ['attack2', 'skill', ...(own.includes(d.species.replace('_spirit', '')) ? [] : ['ult'])] };
    // 적(en_*): 걷기·맞기·쓰러짐 + 공격하는 적은 공격(막아선 동물과 치고받음), 보스는 기술(패턴 신호)
    if (key.startsWith('en_')) {
      const st = d.sets.adult;
      for (const m of ['idle', 'move', 'hit', 'down', ...(d.noAttack ? [] : ['attack'])]) assert.ok(st?.[m], `${key} ${m}`);
      assert.ok(st.hit.frames.length >= 1 && st.move.frames.length >= 4, `${key} frames`);
      continue;
    }
    for (const [set, ms] of Object.entries(need)) if (d.sets[set]) for (const m of ms) assert.ok(d.sets[set][m], `${key} ${set} ${m}`);
  }
});

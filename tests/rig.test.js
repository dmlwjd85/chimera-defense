import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RigInstance } from '../src/rig/RigInstance.js';
import { validateTemplate, validateAnims, validateRig, MOTIONS, STAGES } from '../src/rig/rigData.js';
import { sampleKeys, eventsBetween } from '../src/rig/animator.js';
import { fromTRS, mul, apply, decompose, lerpAngle } from '../src/rig/math.js';
import { AngleSpring, Blink, Breath } from '../src/rig/procedural.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../public/data/rig/${n}.json`, import.meta.url), 'utf8'));
const T = read('quadruped.template'), A = read('quadruped.anims'), R = read('monkey.rig');
const mk = (o = {}) => new RigInstance(T, A, R, o);
const run = (r, sec, step = 1 / 60) => { const ev = []; for (let t = 0; t < sec - 1e-9; t += step) ev.push(...r.update(step)); return ev; };

test('data files validate', () => {
  assert.deepEqual(validateTemplate(T), []);
  assert.deepEqual(validateAnims(A, T), []);
  assert.deepEqual(validateRig(R, T), []);
  for (const m of MOTIONS) assert.ok(A[m], m);
});

test('validator catches broken data', () => {
  const bad = structuredClone(T); bad.bones.push({ name: 'x', parent: 'nope' });
  assert.match(validateTemplate(bad).join(), /parent nope/);
  const badA = structuredClone(A); badA.idle.tracks.hips.y = [[1, 0], [0.5, 1]];
  assert.match(validateAnims(badA, T).join(), /out of order/);
  const badR = structuredClone(R); delete badR.stages.teen;
  assert.match(validateRig(badR, T).join(), /teen/);
});

test('math: TRS, compose, decompose, shortest angle', () => {
  const m = mul(fromTRS(10, 0, 90), fromTRS(5, 0, 0));
  const [x, y] = apply(m, 0, 0);
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 5) < 1e-9, 'child at +x rotates to +y (clockwise)');
  const d = decompose(fromTRS(3, 4, 30, 2, 0.5));
  assert.ok(Math.abs(d.rot - 30) < 1e-9 && Math.abs(d.sx - 2) < 1e-9 && Math.abs(d.sy - 0.5) < 1e-9);
  assert.equal(lerpAngle(350, 10, 0.5), 360);
});

test('keyframe sampling holds ends and eases between', () => {
  const k = [[0, 0], [1, 10, 'linear']];
  assert.equal(sampleKeys(k, -1), 0);
  assert.equal(sampleKeys(k, 0.5), 5);
  assert.equal(sampleKeys(k, 2), 10);
  assert.equal(sampleKeys([], 0.5, 7), 7);
  assert.deepEqual(eventsBetween(A.attack, 0, 0.5).map((e) => e.name), ['hit']);
});

test('feet sit on the ground line at every stage', () => {
  for (const st of STAGES) {
    const r = mk({ stage: st }); r.update(0);
    const feet = T.bones.filter((b) => b.foot).map((b) => apply(r.worlds[b.name], b.length, 0)[1]);
    assert.ok(Math.abs(Math.max(...feet)) < 1e-6, `${st}: lowest foot at ${Math.max(...feet)}`);
  }
});

test('young has a bigger head relative to body than adult', () => {
  const ratio = (st) => {
    const r = mk({ stage: st }); r.update(0);
    const head = decompose(r.worlds.head).sx, body = decompose(r.worlds.hips).sx;
    return head / body;
  };
  assert.ok(ratio('young') > ratio('teen') && ratio('teen') > ratio('adult'));
});

test('attack fires hit once per swing and then returns to idle', () => {
  const r = mk(); r.play('attack');
  const ev = run(r, 0.8);
  assert.equal(ev.filter((e) => e.name === 'hit').length, 1);
  assert.ok(ev.some((e) => e.name === 'complete' && e.data === 'attack'));
  assert.equal(r.motion, 'idle');
});

test('listeners receive events', () => {
  const r = mk(); let hits = 0; r.on('hit', () => hits++);
  r.play('attack'); run(r, 0.7);
  assert.equal(hits, 1);
});

test('looping clips fire their events every loop', () => {
  const clip = { duration: 0.5, loop: true, events: [[0.25, 'step']], tracks: {} };
  const r = new RigInstance(T, { ...A, walk: clip }, R); r.play('walk');
  const ev = run(r, 1.6, 0.05);
  assert.equal(ev.filter((e) => e.name === 'step').length, 3);
});

test('down holds its last frame and fades', () => {
  const r = mk(); r.play('down'); run(r, 2);
  assert.equal(r.motion, 'down'); assert.ok(r.finished);
  assert.ok(r.alphaOf.root < 0.6);
});

test('mix blends instead of snapping', () => {
  const r = mk(); r.play('attack'); run(r, 0.2);
  const before = decompose(r.worlds.hips).x;
  r.play('hit', { mix: 0.2 }); r.update(1 / 60);
  const after = decompose(r.worlds.hips).x;
  assert.ok(Math.abs(after - before) < 10, `jumped ${after - before}`);
});

test('facing mirrors the draw list around x', () => {
  const r = mk({ x: 500 }); r.update(0);
  const a = r.getDrawList().find((d) => d.slot === 'muzzle').x;
  r.setFacing(-1);
  const b = r.getDrawList().find((d) => d.slot === 'muzzle').x;
  assert.ok(a > 500 && b < 500 && Math.abs((a - 500) + (b - 500)) < 1e-6);
});

test('draw list is z-sorted, hides null parts, and the tail rope has points', () => {
  const r = mk(); r.update(0);
  const dl = r.getDrawList();
  for (let i = 1; i < dl.length; i++) assert.ok(dl[i - 1].z <= dl[i].z);
  assert.ok(!dl.some((d) => d.slot === 'deco'));
  const tail = dl.find((d) => d.slot === 'tail');
  assert.equal(tail.rope.length, 3 * 5 + 1);
});

test('tail spring lags when the body turns, then settles', () => {
  const s = new AngleSpring({ stiffness: 60, damping: 8, limit: 35 });
  s.step(0, 0, 1 / 60);
  const off = s.step(30, 0, 1 / 60);
  assert.ok(off < -20, 'lags behind a sudden turn');
  let last = off; for (let i = 0; i < 600; i++) last = s.step(30, 0, 1 / 60);
  assert.ok(Math.abs(last) < 0.5, 'settles');
});

test('breath and blink stay in range and are deterministic', () => {
  const b = new Breath({ period: 2.6, scaleY: 0.03 });
  for (let i = 0; i < 300; i++) { b.update(0.01); const v = b.value(); assert.ok(v >= 0.97 - 1e-9 && v <= 1.03 + 1e-9); }
  const seq = (seed) => { const k = new Blink({}, seed); const out = []; for (let i = 0; i < 1200; i++) { k.update(1 / 60); out.push(k.value() < 0.5 ? 1 : 0); } return out.join(''); };
  assert.equal(seq(3), seq(3));
  assert.ok(seq(3).includes('1'), 'blinks within 20 s');
});

test('hit flash decays to zero', () => {
  const r = mk(); r.hitFlash(0.1);
  assert.equal(r.flash, 1); run(r, 0.2); assert.equal(r.flash, 0);
});

test('every motion runs at every stage without NaN', () => {
  for (const st of STAGES) for (const m of MOTIONS) {
    const r = mk({ stage: st }); r.play(m); run(r, A[m].duration + 0.1);
    for (const d of r.getDrawList()) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.rot), `${st}/${m}/${d.slot}`);
  }
});

test('every drawn rig (animals, chimeras) validates and runs all motions at every stage', () => {
  const idx = read('index');
  for (const id of idx.rigs) {
    const rig = read(id + '.rig'), tpl = read(rig.template + '.template'), an = read((rig.anims ?? rig.template) + '.anims');
    assert.deepEqual([...validateTemplate(tpl), ...validateAnims(an, tpl), ...validateRig(rig, tpl)], [], id);
    for (const st of [...STAGES, 'spirit']) for (const m of MOTIONS) {
      const r = new RigInstance(tpl, an, rig, { stage: st }); r.play(m); run(r, an[m].duration + 0.05, 1 / 30);
      for (const d of r.getDrawList()) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), `${id}/${st}/${m}/${d.slot}`);
    }
    const r = new RigInstance(tpl, an, rig, { stage: 'young' }); r.update(0);
    r.play('down', { mix: 0 }); r.play('idle', { mix: 0 }); r.setStage('young');   // 서 있는 기본 자세(IK로 낮춘 엉덩이 없이)에서 발바닥이 땅에 닿음
    const { worlds } = r.solveBones({}, 0, false, null);
    const feet = r.bones.filter((b) => b.foot).map((b) => apply(worlds[b.name], b.length, 0)[1] + (b.footPad || 0) * Math.hypot(worlds[b.name][0], worlds[b.name][1]));
    assert.ok(Math.abs(Math.max(...feet)) < 1e-6, id + ' feet on the ground');
  }
});

test('sprite template (one-image enemies) runs every motion', () => {
  const tpl = read('sprite.template'), an = read('sprite.anims');
  assert.deepEqual(validateAnims(an, tpl), []);
  const rig = { species: 'normal', stages: { adult: { scale: 1 } } };
  for (const m of MOTIONS) { const r = new RigInstance(tpl, an, rig, { stage: 'adult' }); r.play(m); run(r, an[m].duration); }
});

test('제미나이 부위판 리그: 머리가 주둥이를 품고, 꼬리는 통째 그림, 뼈를 도안 비율에 맞춤', () => {
  const fox = read('fox.rig');
  assert.equal(fox.gemini, true);
  const r = new RigInstance(T, A, fox, {}); r.update(0);
  const dl = r.getDrawList();
  assert.ok(!dl.some((d) => d.slot === 'muzzle' || d.slot === 'jaw'), '주둥이·턱 부위는 숨김');
  const tail = dl.find((d) => d.slot === 'tail');
  assert.ok(tail && !tail.rope, '꼬리는 휘지 않는 한 장 그림');
  assert.equal(fox.boneOverrides.leg_fn_up.length, 62, '도안 비율에 맞춘 짧은 다리 뼈');
  assert.ok(dl.some((d) => d.slot === 'leg_fn_paw') && dl.some((d) => d.slot === 'torso_front'), '발과 앞몸통이 따로 움직이는 부위로 들어감');
});

test('다리 IK: 서 있을 때 발이 제자리, 몸이 앞뒤로 움직여도 발은 땅에 남음', () => {
  const dog = read('dog.rig');
  const r = new RigInstance(T, A, dog, {}); r.update(0);
  const foot = (n) => { const lo = r.bones.find((b) => b.name === `leg_${n}_lo`); return apply(r.worlds[lo.name], lo.length, 0); };
  for (const n of ['fn', 'fr', 'bn', 'br']) { const f = foot(n), rest = r.footRest[n]; assert.ok(Math.hypot(f[0] - rest.x, f[1] - rest.y) < 1.5, `${n} 발이 ${f} / ${rest.x},${rest.y}`); }
  r.play('bite', { mix: 0 }); r.update(0.28);                      // 몸이 앞으로 크게 나간 순간
  const hipsX = decompose(r.worlds.hips).x;
  r.play('idle', { mix: 0 }); r.update(0);
  assert.ok(Math.abs(hipsX - decompose(r.worlds.hips).x) > 8, '몸은 움직였어야 함');
  r.play('bite', { mix: 0 }); r.update(0.28);
  for (const n of ['bn', 'br']) { const f = foot(n), rest = r.footRest[n]; assert.ok(Math.hypot(f[0] - rest.x, f[1] - rest.y) < 2.5, `${n} 발이 끌림`); }
});

test('걸음: 딛는 발은 땅에 붙어 뒤로 밀리고, 떼는 발은 들림', () => {
  const r = new RigInstance(T, A, read('dog.rig'), { motion: 'move' });
  let lifted = 0, grounded = 0;
  for (let i = 0; i < 28; i++) { r.update(0.02); const t = r.lastIk.fn; if (t.y < r.footRest.fn.y - 3) lifted++; else grounded++; }
  assert.ok(lifted > 5 && grounded > 8, `들림 ${lifted}, 디딤 ${grounded}`);
});

test('공격 동작: 할퀴기·들이받기·물기·덮치기 클립이 있고 리그가 쓸 목록을 가짐', () => {
  for (const m of ['claw', 'butt', 'bite', 'pounce']) assert.ok(A[m], m);
  const B = read('biped.anims'), TB = read('biped.template'), san = read('tiger_spirit.rig');
  assert.deepEqual(validateAnims(B, TB), []);
  assert.ok(san.attacks.every((n) => B[n]), '산군 공격 동작');
  const r = new RigInstance(TB, B, san, { stage: 'spirit' });
  for (const m of san.attacks) { r.play(m, { mix: 0 }); for (let i = 0; i < 30; i++) r.update(0.03); }
  assert.ok(Object.values(r.worlds).every((w) => w.every(Number.isFinite)));
});

test('산군 걸음: 엉덩이 관절은 모여 있고 두 발이 서로 교차하며 나아감, 서 있을 땐 발을 벌려 디딤', () => {
  const TB = read('biped.template'), B = read('biped.anims'), san = read('tiger_spirit.rig');
  const r = new RigInstance(TB, B, san, { stage: 'spirit', motion: 'move' });
  let front = 0, back = 0;
  for (let i = 0; i < 40; i++) { r.update(0.02); const d = r.lastIk.bn.x - r.lastIk.br.x; if (d > 20) front++; if (d < -20) back++; }
  assert.ok(front > 6 && back > 6, `가까운 발이 앞 ${front}, 뒤 ${back}`);
  assert.ok(r.footRest.bn.x - r.footRest.br.x > 60, '서 있을 때 벌린 발');
  const hip = (n) => r.bones.find((b) => b.name === `leg_${n}_up`).y;
  assert.ok(Math.abs(hip('bn') - hip('br')) < 40, '엉덩이 관절은 모음');
});

test('새·개구리 전용 동작: 새는 두 발로 걷고(IK) 날 땐 다리를 접고 날개를 폄, 쪼기·급강하·폴짝 뛰기가 있음', () => {
  const BT = read('bird.template'), BA = read('bird.anims'), FT = read('frog.template'), FA = read('frog.anims');
  assert.deepEqual(validateAnims(BA, BT), []);
  assert.deepEqual(validateAnims(FA, FT), []);
  assert.deepEqual(BT.ik.map((l) => l.name), ['fn', 'bn']);
  assert.ok(!read('bug.template').ik, '벌레는 다리 IK 없음');
  for (const sp of ['crow', 'eagle', 'rooster']) {
    const rig = read(sp + '.rig'); assert.equal(rig.anims, 'bird');
    assert.ok(rig.attacks.length && rig.attacks.every((n) => BA[n]), sp + ' 공격 동작');
  }
  const frog = read('frog.rig'); assert.equal(frog.anims, 'frog'); assert.ok(frog.attacks.every((n) => FA[n]));
  // 걷기: 딛는 발은 땅에, 드는 발은 떠 있음
  const w = new RigInstance(BT, BA, read('rooster.rig'), { stage: 'adult', motion: 'move', seed: 1 });
  let lifted = 0, planted = 0;
  for (let i = 0; i < 40; i++) { w.update(1 / 60); const ik = w.lastIk; if (ik.fn.y < w.footRest.fn.y - 4 || ik.bn.y < w.footRest.bn.y - 4) lifted++; if (Math.abs(ik.fn.y - w.footRest.fn.y) < 0.5 || Math.abs(ik.bn.y - w.footRest.bn.y) < 0.5) planted++; }
  assert.ok(lifted > 8 && planted > 30, `걸음 ${lifted}/${planted}`);
  // 날기: IK 없이 다리를 접어 발이 서 있을 때보다 높이 올라감, 날개는 커짐
  const foot = (inst) => Math.max(...inst.getDrawList().filter((d) => d.slot.endsWith('_paw') || d.slot.endsWith('_lo')).map((d) => d.y));
  const st = new RigInstance(BT, BA, read('crow.rig'), { stage: 'adult', motion: 'idle', seed: 1 }); run(st, 0.3);
  const fl = new RigInstance(BT, BA, read('crow.rig'), { stage: 'adult', motion: 'fly', seed: 1 }); run(fl, 0.5);
  assert.equal(fl.lastIk, null);
  assert.ok(foot(fl) < foot(st) - 8, `접은 다리 ${foot(fl)} < ${foot(st)}`);
  const wing = (inst) => inst.getDrawList().find((d) => d.slot === 'wing');
  assert.ok(Math.abs(wing(fl).sx) > Math.abs(wing(st).sx) * 1.15, '날개 펴짐');
  // 개구리 폴짝: 한 주기 안에 몸이 떠올랐다 내려옴
  const fr = new RigInstance(FT, FA, frog, { stage: 'adult', motion: 'move', seed: 1 });
  const ys = []; for (let i = 0; i < 36; i++) { fr.update(1 / 60); ys.push(fr.getDrawList().find((d) => d.slot === 'body').y); }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 20, `폴짝 높이 ${Math.max(...ys) - Math.min(...ys)}`);
});

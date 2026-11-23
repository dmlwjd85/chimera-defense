import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RigInstance } from '../src/rig/RigInstance.js';
import { validateTemplate, validateAnims, validateRig, MOTIONS, STAGES } from '../src/rig/rigData.js';
import { sampleKeys, eventsBetween } from '../src/rig/animator.js';
import { fromTRS, mul, apply, decompose, lerpAngle } from '../src/rig/math.js';
import { AngleSpring, Blink, Breath } from '../src/rig/procedural.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../public/data/rig/${n}.json`, import.meta.url), 'utf8'));
const T = read('quadruped.template'), A = read('quadruped.anims'), R = read('fox.rig');
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
    const feet = tpl.bones.filter((b) => b.foot).map((b) => apply(r.worlds[b.name], b.length, 0)[1]);
    assert.ok(Math.abs(Math.max(...feet)) < 1e-6, id + ' feet on the ground');
  }
});

test('sprite template (one-image enemies) runs every motion', () => {
  const tpl = read('sprite.template'), an = read('sprite.anims');
  assert.deepEqual(validateAnims(an, tpl), []);
  const rig = { species: 'normal', stages: { adult: { scale: 1 } } };
  for (const m of MOTIONS) { const r = new RigInstance(tpl, an, rig, { stage: 'adult' }); r.play(m); run(r, an[m].duration); }
});

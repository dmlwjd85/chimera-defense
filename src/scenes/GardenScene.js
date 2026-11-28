// 무릉도원(2026-11-27): 도감에서 고른 동물이 복숭아꽃 동산을 거닐고 어울림. 처음 1마리, 별을 모으면 10마리까지.
// 쓰다듬기(하트 + 그 종 경험 조금) · 소품 꾸미기(끌어 놓기) · 사진 찍기.
import Phaser from 'phaser';
import { button, style, speciesImage } from './ui.js';
import { unitRig, queueMotionSheets, dropMotionSheets } from './rigs.js';
import GauntletScene from './GauntletScene.js';
import { buildData } from '../logic/data.js';
import { writeSave, totalStars } from '../logic/meta.js';
import * as G from '../logic/garden.js';
import { sfx } from './sfx.js';

const GROUND = { x0: 80, x1: 1200, y0: 450, y1: 650 };   // 동물이 걷는 풀밭(발 기준)
const persp = (y) => 0.9 + 0.14 * Math.max(0, Math.min(1, (y - GROUND.y0) / (GROUND.y1 - GROUND.y0)));   // 원근 살짝
const BASE = 0.34;                                        // 연전과 같은 동물 배율
const PROP_SCALE = { pavilion: 2, peach: 2, pond: 2, lantern: 1.5, flowers: 1.5, bridge: 2, drum: 2, bell: 2, fountain: 2.4, nest: 2, feed: 2 };
// 높은 데 앉는 자리(소품 그림 안에서: 가운데 기준 가로 비율, 바닥 기준 세로 비율) — 새·원숭이
const PERCH = { peach: [[-0.27, 0.72], [0.25, 0.76], [0, 0.9]], pavilion: [[-0.05, 0.9]], lantern: [[0, 0.93]], bridge: [[0.33, 0.86]], fountain: [[0, 0.88]] };
const SEAT = { brood: { nest: [[0, 0.42]] }, rest: { pavilion: [[0.05, 0.24]] } };
const FOOT = 30;   // 동물 묶음(c)의 y에서 발까지
const PROP_CAP = { peach: 4, pavilion: 2, bridge: 2 };   // 한 소품에 한꺼번에 어울리는 동물 수(기본 2) — 작은 연못에 여럿이 몰리지 않게
const rnd = (a, b) => a + Math.random() * (b - a);
// 깊이(2026-11-28 사용자 "소품들이 캐릭터 앞으로 나와 있는데 캐릭터가 앞에 있게"): 소품은 늘 동물 뒤(0~), 동물은 그 위(PET_Z~)에서 발 높이 순
const PROP_Z = (y) => y * 0.1, PET_Z = 200;
const STAGE_NAME = { young: '어린', teen: '성장기', adult: '성체', spirit: '신화급' };

export default class GardenScene extends Phaser.Scene {
  constructor() { super('Garden'); }

  preload() {
    try { queueMotionSheets(this, G.gardenOf(this.registry.get('save')).animals.map((a) => a.id)); } catch (e) { console.warn('garden sheets', e); }
  }

  create() {
    this.events.once('shutdown', () => dropMotionSheets(this));
    this.D = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.g = G.gardenOf(this.save);
    this.pets = []; this.propObjs = []; this.ui = []; this.decor = false;
    // 도트 그림은 또렷하게(늘려도 번지지 않게)
    for (const k of ['bg-garden', ...G.GARDEN_PROPS.map((id) => G.PROP_ART[id])]) if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
    // 배경: PixelLab 무릉도원(도트 톤을 전투와 맞춤). 없으면 하늘·풀 두 색
    if (this.textures.exists('bg-garden')) this.add.image(640, 360, 'bg-garden').setDisplaySize(1280, 720).setDepth(-10);
    else { this.add.rectangle(640, 200, 1280, 400, 0xbfe3f0).setDepth(-10); this.add.rectangle(640, 560, 1280, 320, 0x8cc56a).setDepth(-10); }
    // 꽃잎이 바람에 날림
    if (this.textures.exists('fx-spark')) this.add.particles(0, 0, 'fx-spark', { x: { min: -40, max: 1280 }, y: -20, speedY: { min: 18, max: 46 }, speedX: { min: 12, max: 50 }, lifespan: 16000, scale: { min: 0.12, max: 0.22 }, tint: [0xffc0d8, 0xffd6e6, 0xffffff], alpha: { start: 0.9, end: 0.4 }, rotate: { min: 0, max: 360 }, frequency: 420 }).setDepth(900);
    this.g.props.forEach((p, i) => this.makeProp(p, i));
    this.g.animals.forEach((a) => this.spawn(a));
    this.drawUi();
    this.input.on('drag', (pointer, obj, x, y) => { if (!this.decor || obj.propIndex == null) return; this.kickOff(obj); const px = Phaser.Math.Clamp(x, GROUND.x0, GROUND.x1), py = Phaser.Math.Clamp(y, GROUND.y0 - 40, GROUND.y1 + 40); obj.setPosition(px, py).setDepth(PROP_Z(py)); });
    this.input.on('dragend', (pointer, obj) => { if (obj.propIndex == null) return; G.moveProp(this.save, obj.propIndex, obj.x, obj.y); this.persist(); });
    if (!this.g.animals.length) this.time.delayedCall(500, () => this.openPicker());
  }

  persist() { writeSave(this.registry.get('storage'), this.save); }

  // ---------- 화면 위 단추 ----------
  drawUi() {
    this.ui.forEach((o) => o.destroy()); this.ui = [];
    const slots = G.gardenSlots(this.save, this.D), next = G.starsToNextSlot(this.save, this.D);
    const bar = this.add.rectangle(640, 34, 1280, 68, 0x1a1420, 0.55).setDepth(2000);
    const t = this.add.text(24, 16, '🍑 무릉도원', style(28, '#ffe3ef', { stroke: '#5a2040', strokeThickness: 5 })).setDepth(2001);
    const s = this.add.text(232, 14, `🐾 ${this.g.animals.length} / ${slots}마리`, style(18, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setDepth(2001);
    const s2 = this.add.text(232, 40, next ? `⭐ 별 ${next}개 더 모으면 한 칸 더 (지금 별 ${totalStars(this.save)}개)` : '🌸 동산이 가득 열렸어요', style(13, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setDepth(2001);
    const b1 = button(this, 690, 34, 150, 44, '🐾 데려오기', () => this.openPicker(), { size: 17, depth: 2002 });
    const b2 = button(this, 850, 34, 150, 44, this.decor ? '✔ 다 꾸몄어요' : '🏮 꾸미기', () => this.toggleDecor(), { size: 17, depth: 2002, fill: this.decor ? 0x8a6a1a : undefined });
    const b3 = button(this, 1000, 34, 130, 44, '📸 사진', () => this.photo(), { size: 17, depth: 2002 });
    const b4 = button(this, 1170, 34, 170, 44, '← 처음으로', () => this.scene.start('Title'), { size: 17, depth: 2002 });
    this.ui.push(bar, t, s, s2, b1, b2, b3, b4);
    if (this.decor) this.drawPalette();
  }

  // ---------- 동물 ----------
  spawn(a, at = null) {
    const unit = { kind: a.kind ?? 'base', speciesId: a.id, stage: a.stage, parts: a.parts ?? null, uid: Math.floor(Math.random() * 1e6), stats: {} };
    const c = this.add.container(at?.x ?? rnd(GROUND.x0 + 60, GROUND.x1 - 60), at?.y ?? rnd(GROUND.y0 + 20, GROUND.y1 - 20));
    const shadow = this.add.ellipse(0, 34, 66, 14, 0x000000, 0.28);
    const sub = this.add.container(0, 30);
    let fix = 1; try { fix = GauntletScene.prototype.sizeFix.call(this, unit); } catch { /* 크기 맞춤 없이 */ }
    const rig = unitRig(this, unit, sub, BASE * fix);
    if (!rig) { c.destroy(); return null; }
    rig.inst.play('idle', { loop: true });
    c.add([shadow, sub]);
    const p = { a, unit, c, sub, rig, shadow, state: 'idle', t: rnd(0.5, 2.5), face: Math.random() < 0.5 ? -1 : 1, meetCd: rnd(2, 5), hop: 0 };
    c.setSize(110 * fix, 120 * fix).setInteractive(new Phaser.Geom.Rectangle(-55 * fix, -70 * fix, 110 * fix, 120 * fix), Phaser.Geom.Rectangle.Contains);
    c.on('pointerdown', () => { if (!this.decor) this.pet(p); });
    this.pets.push(p);
    return p;
  }

  setState(p, st, t, extra = {}) {
    Object.assign(p, { state: st, t }, extra);
    const r = p.rig.inst;
    if (st === 'walk' || st === 'goto' || st === 'chase' || st === 'flee' || st === 'rally') r.play(r.anims.move ? 'move' : 'idle', { loop: true });
    else if (st === 'nap') r.play(r.anims.down ? 'down' : 'idle');
    else r.play('idle', { loop: true });
    if (r.timeScale != null) r.timeScale = st === 'chase' || st === 'flee' || st === 'rally' ? 1.5 : 1;
  }

  bubble(p, text, color = '#ffffff', size = 20) {
    const o = this.add.text(p.c.x, p.c.y - 90 * (p.c.scale || 1), text, style(size, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: o, y: o.y - 34, alpha: 0, delay: 650, duration: 650, onComplete: () => o.destroy() });
  }

  brain(p, dt) {
    p.t -= dt; p.meetCd -= dt;
    const c = p.c, sp = 46 * (p.unit.stage === 'young' ? 0.8 : 1);
    if (p.state === 'act') this.updateAct(p, dt);
    else if (p.state === 'walk' || p.state === 'goto' || p.state === 'chase' || p.state === 'flee' || p.state === 'rally') {
      let tx = p.tx, ty = p.ty;
      if (p.state === 'chase' && p.other) { tx = p.other.c.x; ty = p.other.c.y; }
      if (p.state === 'flee' && p.other) { tx = c.x + (c.x - p.other.c.x); ty = c.y + (c.y - p.other.c.y) * 0.5; }
      tx = Phaser.Math.Clamp(tx, GROUND.x0, GROUND.x1); ty = Phaser.Math.Clamp(ty, GROUND.y0, GROUND.y1);
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), v = (p.state === 'rally' ? p.rsp : sp * (p.state === 'walk' ? 1 : p.state === 'goto' ? 1.5 : 2.4)) * dt;
      if (Math.abs(dx) > 4) p.face = dx < 0 ? -1 : 1;
      if (p.state === 'goto' && d <= v) { c.setPosition(tx, ty); this.beginAct(p); }
      else if (p.state === 'goto' && p.t <= 0) this.dropPlan(p);
      else if (p.state === 'rally' && (d <= v || p.t <= 0)) { if (d <= v) c.setPosition(tx, ty); this.rallied(p); }
      else if (d <= v || p.t <= 0) { if (p.state === 'walk' && d <= v) c.setPosition(tx, ty); this.setState(p, 'idle', rnd(1.5, 4)); }
      else c.setPosition(c.x + (dx / d) * v, c.y + (dy / d) * v);
    } else if (p.state === 'nap') {
      if (Math.random() < dt * 0.6) this.bubble(p, 'z', '#cfe6ff', 16);
      if (p.t <= 0) { this.setState(p, 'idle', rnd(1, 2)); this.bubble(p, '🥱', '#fff', 18); }
    } else if (p.state === 'idle' && p.t <= 0) {
      const k = Math.random();
      // 소품이 있으면 가끔 가서 어울림(새는 나무에 앉고, 개구리는 연못에 퐁당…)
      if (this.propObjs.length && Math.random() < G.gcfgGarden(this.D).propChance && this.tryPropAct(p)) { /* 가는 중 */ }
      else if (k < 0.62) { const [tx, ty] = this.freeSpot(); this.setState(p, 'walk', 9, { tx, ty }); }
      else if (k < 0.72) this.setState(p, 'nap', rnd(5, 9));
      else if (k < 0.86) { p.face *= -1; this.setState(p, 'idle', rnd(1.2, 2.5)); }
      else { this.hop(p, 2); this.bubble(p, ['♪', '🎵', '✨'][Math.floor(Math.random() * 3)], '#ffe066'); this.setState(p, 'idle', rnd(1.5, 3)); }
    }
    // 만남: 가까이 지나가면 어울림(같은 종 장난 · 술래잡기 · 인사)
    if (p.meetCd <= 0 && (p.state === 'walk' || p.state === 'idle')) {
      const o = this.pets.find((q) => q !== p && q.meetCd <= 0 && (q.state === 'walk' || q.state === 'idle') && Math.abs(q.c.x - c.x) < 90 && Math.abs(q.c.y - c.y) < 50);
      if (o) this.meet(p, o);
    }
    // 그리기: 방향·원근·깊이·폴짝
    if (p.hop > 0) { p.hop = Math.max(0, p.hop - dt); }
    const hy = p.hop > 0 ? -Math.abs(Math.sin(p.hop * Math.PI * 3)) * 14 : 0;
    p.sub.y = 30 + hy;
    p.rig.inst.setFacing(p.face);
    const A = p.state === 'act' ? p.act : null;
    c.setScale(A?.s ?? persp(c.y)).setDepth(PET_Z + (A?.gy ?? c.y));   // 높은 데·물속에서는 땅에 있을 때 크기·깊이 그대로
    p.shadow.setVisible(!A?.air);
    p.rig.view.update(dt);
  }

  hop(p, n = 1) { p.hop = n / 3; }

  /** 걸어갈 곳: 소품(연못·정자·다리 등) 밑동을 피해서 */
  freeSpot() {
    for (let k = 0; k < 12; k++) {
      const x = rnd(GROUND.x0 + 30, GROUND.x1 - 30), y = rnd(GROUND.y0, GROUND.y1);
      const hit = this.propObjs.some((o) => Math.abs(x - o.x) < o.displayWidth * 0.5 + 20 && y > o.y - Math.min(70, o.displayHeight * 0.45) && y < o.y + 18);
      if (!hit) return [x, y];
    }
    return [rnd(GROUND.x0 + 30, GROUND.x1 - 30), rnd(GROUND.y0, GROUND.y1)];
  }

  meet(p, o) {
    const kind = G.meetKind(p.a, o.a, this.D);
    p.meetCd = o.meetCd = rnd(8, 14);
    const face = () => { p.face = o.c.x >= p.c.x ? 1 : -1; o.face = -p.face; };
    if (kind === 'same') { face(); this.setState(p, 'idle', 1.6); this.setState(o, 'idle', 1.6); this.hop(p, 2); this.hop(o, 2); this.bubble(p, '♥', '#ff8fb0'); this.bubble(o, '♪', '#ffe066'); }
    else if (kind === 'chase' || kind === 'flee') {
      const [hunter, prey] = kind === 'chase' ? [p, o] : [o, p];
      this.bubble(hunter, '!', '#ffd84d', 24); this.bubble(prey, '💦', '#8fd3ff', 20);
      this.setState(hunter, 'chase', 2.6, { other: prey }); this.setState(prey, 'flee', 2.6, { other: hunter });
    } else { face(); this.setState(p, 'idle', 1.4); this.setState(o, 'idle', 1.4); this.bubble(p, '👋', '#fff', 20); this.time.delayedCall(260, () => this.bubble(o, '😊', '#fff', 20)); }
  }

  pet(p) {
    const r = G.petAnimal(this.save, this.D, p.a);
    this.hop(p, 2);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 90, () => { const h = this.add.text(p.c.x + rnd(-26, 26), p.c.y - 60, '♥', style(22, '#ff7aa8', { stroke: '#fff', strokeThickness: 3 })).setOrigin(0.5).setDepth(1600); this.tweens.add({ targets: h, y: h.y - 60, alpha: 0, duration: 900, onComplete: () => h.destroy() }); });
    if (r.gained) { this.bubble(p, `정 +${r.gained} (오늘 ${r.left}번 더)`, '#ffd6e6', 14); this.persist(); }
    else this.bubble(p, '😊', '#fff', 20);
    if (p.state === 'nap') this.setState(p, 'idle', 1.5);
    if (p.state === 'act' && p.act?.nap) p.act.t = Math.max(p.act.t, (p.act.dur ?? 0) - 0.3);   // 자다가 쓰다듬으면 곧 일어남
    try { sfx('click'); } catch { /* 소리 없음 */ }
  }

  // ---------- 소품과 어울리기(2026-11-28): 가서 → 그 소품에 맞는 행동 → 돌아옴 ----------
  /** 그 행동을 지금 더 할 자리가 있는가 */
  actFree(o, a) {
    let n = 0; for (const q of o.users) if ((q.act?.kind ?? q.plan?.act) === a.act) n++;
    return n < (a.max ?? 2);
  }

  /** 다가갈 곳(stand, 땅)과 행동할 발 자리(at) */
  actSpot(p, o, act) {
    const W = o.displayWidth, H = o.displayHeight, x = o.x, y = o.y;
    const side = p.c.x < x ? -1 : 1, gy = (v) => Phaser.Math.Clamp(v, GROUND.y0, GROUND.y1), gx = (v) => Phaser.Math.Clamp(v, GROUND.x0, GROUND.x1);
    const seats = act === 'perch' ? PERCH[o.propId] : SEAT[act]?.[o.propId];
    if (seats) {
      const taken = new Set([...o.users].map((q) => (q.act?.kind ?? q.plan?.act) === act ? (q.act?.spot ?? q.plan?.spot)?.idx : null));
      const free = seats.map((_, i) => i).filter((i) => !taken.has(i));
      if (!free.length) return null;
      const idx = free[Math.floor(Math.random() * free.length)], [fx, fy] = seats[idx];
      return { stand: [gx(x + fx * W + side * 44), gy(y + 8)], at: [x + fx * W, y - fy * H], face: -side, idx };
    }
    if (act === 'swim') return { stand: [gx(x + side * (W * 0.5 + 8)), gy(y - H * 0.2)], at: [x + side * W * 0.1, y - H * 0.47], face: -side };
    if (act === 'cross') return { stand: [gx(x + side * (W * 0.5 + 26)), gy(y - 2)], at: [gx(x - side * (W * 0.5 + 26)), gy(y - 2)], face: -side };
    if (act === 'nap') return { stand: [gx(x + side * W * 0.36), gy(y + 12)], at: [gx(x + side * W * 0.36), gy(y + 12)], face: side };
    // 소품이 동물 몸에 가리지 않게 몸 반쯤(half) 떨어져 섬. 마시기·들이받기는 바짝
    const half = 40 * persp(y);
    const pad = { drink: 6, warm: 20 + half, play: 6 + half, ring: 6 + half, eat: 4 + half, peek: 6 + half, shake: -8, graze: half - 6, sniff: half - 4 }[act] ?? half;
    const sx = gx(x + side * (W * 0.5 + pad)), sy = gy(y + (act === 'drink' && o.propId === 'pond' ? -H * 0.18 : 2));
    return { stand: [sx, sy], at: [sx, sy], face: -side };
  }

  /** 소품 하나 골라 어울리러 감(only = 그 소품만). 할 게 없으면 false */
  tryPropAct(p, only = null) {
    const list = only ? [only] : Phaser.Utils.Array.Shuffle([...this.propObjs]);
    for (const o of list) {
      if (!o.active || o.users.size >= (PROP_CAP[o.propId] ?? 2)) continue;
      const a = G.pickPropAct(p.a, o.propId, Math.random, (x) => this.actFree(o, x));
      if (!a) continue;
      const spot = this.actSpot(p, o, a.act);
      if (!spot) continue;
      o.users.add(p);
      this.setState(p, 'goto', 14, { tx: spot.stand[0], ty: spot.stand[1], plan: { o, act: a.act, spot } });
      return true;
    }
    return false;
  }

  dropPlan(p) { p.plan?.o?.users?.delete(p); p.plan = null; this.setState(p, 'idle', rnd(1, 2.5)); }

  play(p, names, opts = {}) { const r = p.rig.inst, n = names.find((x) => r.anims[x]) ?? 'idle'; r.play(n, opts); r.timeScale = opts.ts ?? 1; return n; }

  beginAct(p) {
    const plan = p.plan; p.plan = null;
    if (!plan?.o?.active) { plan?.o?.users?.delete(p); return this.setState(p, 'idle', rnd(1, 2)); }
    const { o, act, spot } = plan, s = persp(p.c.y);
    p.face = spot.face;
    p.act = { kind: act, o, spot, t: 0, ph: 0, from: [p.c.x, p.c.y], gy: p.c.y, s, beat: 0.3, n: 0, air: false };
    p.state = 'act'; p.t = 999;
    const A = p.act;
    if (act === 'perch' || act === 'brood' || act === 'rest') { A.to = [spot.at[0], spot.at[1] - FOOT * s]; A.air = true; A.nap = act === 'rest'; this.play(p, ['leap', 'move'], { loop: true, ts: 1.5 }); }
    else if (act === 'swim') { A.wl = spot.at[1] + 4; A.to = [spot.at[0], A.wl - 8 * s]; A.air = true; this.play(p, ['leap', 'move'], { loop: true, ts: 1.5 }); this.bubble(p, '!', '#8fd3ff', 20); }
    else if (act === 'cross') { A.dur = Math.max(2.4, Math.abs(spot.at[0] - p.c.x) / 62); A.pause = Math.random() < 0.6; this.play(p, ['move'], { loop: true }); }
    else if (act === 'nap') { A.dur = rnd(6, 10); A.nap = true; this.play(p, ['down', 'idle']); }
    else { A.dur = { drink: 3.6, warm: rnd(5, 8), graze: 4.2, sniff: 3.4, play: 3.6, ring: 2.4, eat: 3.8, peek: 3, shake: 3.2 }[act] ?? 3; this.play(p, ['idle'], { loop: true }); }
    if (act === 'warm') this.lamp(o, true);
  }

  /** 끝내기: 물·기울기·그림자·소품 자리 정리하고 땅으로. quiet = 사라지는 중(상태를 바꾸지 않음) */
  endAct(p, quiet = false) {
    const A = p.act;
    p.plan?.o?.users?.delete(p); p.plan = null;
    if (!A) return;
    if (p.mask) { p.c.clearMask(); p.maskG?.destroy(); p.mask = p.maskG = null; }
    p.sub.setAngle(0);
    A.o?.users?.delete(p);
    if (A.kind === 'warm' && A.o?.active && ![...A.o.users].some((q) => q.act?.kind === 'warm')) this.lamp(A.o, false);
    if (A.air || A.kind === 'cross') p.c.setPosition(A.kind === 'cross' && A.done ? A.spot.at[0] : A.from[0], A.kind === 'cross' && A.done ? A.spot.at[1] : A.from[1]);
    p.act = null; p.rig.inst.timeScale = 1;
    if (quiet) return;
    if (p.rallyTo) this.startRally(p);   // 종소리에 내려온 참이면 곧장 모이러 감
    else { this.setState(p, 'idle', rnd(1, 3)); p.meetCd = rnd(3, 6); }
  }

  /** 그 소품을 쓰던 동물을 모두 내려보냄(소품을 옮기거나 치울 때) */
  kickOff(o) { for (const q of [...(o.users ?? [])]) { if (q.state === 'act') this.endAct(q); else if (q.plan?.o === o) this.dropPlan(q); } }

  updateAct(p, dt) {
    const A = p.act, o = A.o, c = p.c;
    if (!o.active) return this.endAct(p);
    A.t += dt * (A.fast ?? 1);
    const arc = (k, h) => Math.sin(Math.min(1, k) * Math.PI) * h, ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const fly = (from, to, k, h) => { const e = ease(Math.min(1, k)); c.setPosition(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e - arc(k, h)); };
    const beat = (every, fn) => { A.beat -= dt; if (A.beat <= 0) { A.beat = every; A.n++; fn(A.n); } };
    const W = o.displayWidth, H = o.displayHeight;
    switch (A.kind) {
      case 'perch': case 'brood': case 'rest': {
        // 날아오르기(뛰어오르기) → 앉아 있기 → 내려오기
        if (A.ph === 0) { fly(A.from, A.to, A.t / 0.7, A.kind === 'rest' ? 30 : 44); if (A.t >= 0.7) { A.ph = 1; A.t = 0; A.dur = rnd(6, 10); A.beat = 0.4; this.play(p, A.nap ? ['down', 'idle'] : ['idle'], { loop: !A.nap }); if (Math.random() < 0.5) p.face *= -1; } }
        else if (A.ph === 1) {
          c.setPosition(A.to[0], A.to[1]);
          beat(rnd(1.8, 3), () => this.bubble(p, A.kind === 'brood' ? '♥' : A.nap ? 'z' : ['♪', '🎵', '♬'][Math.floor(Math.random() * 3)], A.kind === 'brood' ? '#ff8fb0' : A.nap ? '#cfe6ff' : '#ffe066', A.nap ? 16 : 20));
          if (A.t >= A.dur || A.leave) { A.ph = 2; A.t = 0; this.play(p, ['leap', 'move'], { loop: true, ts: 1.5 }); }
        } else { fly(A.to, A.from, A.t / 0.6, 26); if (A.t >= 0.6) this.endAct(p); }
        break;
      }
      case 'swim': {
        if (A.ph === 0) {
          fly(A.from, A.to, A.t / 0.45, 46);
          if (A.t >= 0.45) {
            A.ph = 1; A.t = 0; A.dur = rnd(6, 9); A.beat = 0.2;
            // 물에 잠긴 아랫몸은 안 보이게(물금 아래를 가림) + 첨벙
            p.maskG = this.make.graphics(); p.maskG.fillStyle(0xffffff).fillRect(0, 0, 1280, A.wl); p.mask = p.maskG.createGeometryMask(); c.setMask(p.mask);
            this.splash(A.to[0], A.wl, o); this.bubble(p, '퐁당!', '#8fd3ff', 20);
            this.play(p, ['move'], { loop: true, ts: 0.6 });
            try { sfx('dodge'); } catch { /* */ }
          }
        } else if (A.ph === 1) {
          const x = o.x + Math.sin(A.t * 0.7 + (A.spot.at[0] < o.x ? Math.PI : 0)) * W * 0.16;
          if (Math.abs(x - c.x) > 0.05) p.face = x < c.x ? -1 : 1;
          c.setPosition(x, A.to[1] + Math.sin(A.t * 3.2) * 3 * A.s);
          beat(0.9, (n) => { this.ripple(c.x, A.wl + 2, o); if (n % 4 === 0) this.bubble(p, ['♪', '😊', '💦'][Math.floor(Math.random() * 3)], '#cfefff', 18); });
          if (A.t >= A.dur || A.leave) { A.ph = 2; A.t = 0; A.out = [c.x, c.y]; c.clearMask(); p.maskG?.destroy(); p.mask = p.maskG = null; this.splash(c.x, A.wl, o); this.play(p, ['leap', 'move'], { loop: true, ts: 1.5 }); p.face = A.from[0] < c.x ? -1 : 1; }
        } else { fly(A.out, A.from, A.t / 0.45, 40); if (A.t >= 0.45) { this.endAct(p); this.hop(p, 2); this.bubble(p, '💦', '#8fd3ff', 20); } }
        break;
      }
      case 'cross': {
        // 다리 위로 건너감: 다리 모양을 따라 올라갔다 내려옴. 가끔 꼭대기에서 잠깐 구경
        const k = Math.min(1, A.t / A.dur), x = A.from[0] + (A.spot.at[0] - A.from[0]) * k, u = (x - (o.x - W / 2)) / W, r = 0.14;
        const lift = (u < 0 ? Math.max(0, 1 + u / r) * 0.34 : u > 1 ? Math.max(0, 1 - (u - 1) / r) * 0.34 : 0.34 + 0.34 * Math.sin(Math.PI * u)) * H;
        A.air = lift > 6;
        c.setPosition(x, A.from[1] - lift);
        if (A.pause && k >= 0.5) { A.pause = false; A.hold = 2.2; this.play(p, ['idle'], { loop: true }); this.hop(p, 2); this.bubble(p, ['✨', '🌸', '♪'][Math.floor(Math.random() * 3)], '#ffe066'); }
        if (A.hold > 0) { A.hold -= dt; A.t -= dt; if (A.hold <= 0) this.play(p, ['move'], { loop: true }); }
        if (k >= 1) { A.done = true; this.endAct(p); }
        break;
      }
      case 'nap': {
        beat(rnd(1.6, 2.6), () => this.bubble(p, 'z', '#cfe6ff', 16));
        if (A.t >= A.dur) { this.endAct(p); this.bubble(p, '🥱', '#fff', 18); }
        break;
      }
      case 'drink': {
        p.sub.setAngle(p.face * 13 * Math.min(1, A.t / 0.3) * (A.t > A.dur - 0.4 ? Math.max(0, (A.dur - A.t) / 0.4) : 1));   // 고개 숙여 마심
        beat(0.8, () => { this.pop(c.x + p.face * 30 * A.s, c.y + 6, '💧', 16); if (o.propId === 'pond') this.ripple(o.x + (c.x < o.x ? -1 : 1) * W * 0.3, o.y - H * 0.45, o); });
        if (A.t >= A.dur) { this.endAct(p); this.bubble(p, '😋', '#fff', 20); }
        break;
      }
      case 'warm': {
        beat(rnd(1.6, 2.4), (n) => { if (n === 1) this.bubble(p, '😊', '#fff', 20); this.pop(o.x + rnd(-50, 50), o.y - H * rnd(0.4, 1), '✦', 12, '#ffe9a0'); });
        if (A.t >= A.dur) this.endAct(p);
        break;
      }
      case 'graze': case 'eat': {
        beat(0.85, () => { this.play(p, ['attack']); this.pop(c.x + p.face * 26 * A.s, c.y - 30 * A.s, '냠', 15, '#ffe9a8'); if (A.kind === 'graze') this.puff(o.x + rnd(-W * 0.2, W * 0.2), o.y - H * 0.5, 3, [0xff9ec4, 0xffe066, 0x8fd66a]); this.wobble(o); });
        if (A.t >= A.dur) { this.endAct(p); this.hop(p, 2); this.bubble(p, '♥', '#ff8fb0'); }
        break;
      }
      case 'sniff': {
        p.sub.setAngle(p.face * 11 * Math.min(1, A.t / 0.3) * (A.t > A.dur - 0.4 ? Math.max(0, (A.dur - A.t) / 0.4) : 1));
        beat(1.2, (n) => { if (n === 1) this.bubble(p, '🌸', '#ffd6e6', 20); else this.butterfly(o.x + rnd(-W * 0.25, W * 0.25), o.y - H * 0.7); });
        if (A.t >= A.dur) this.endAct(p);
        break;
      }
      case 'play': {
        // 북 치기: 둥! 둥! — 가까이 있는 친구들이 들썩
        beat(0.6, (n) => { if (n > 5) return; this.play(p, ['attack']); this.drum(o); });
        if (A.t >= A.dur) { this.endAct(p); this.bubble(p, '♪', '#ffe066'); }
        break;
      }
      case 'ring': {
        beat(9, () => { this.play(p, ['attack']); this.time.delayedCall(180, () => { if (o.active) this.bell(o); }); });
        if (A.t >= A.dur) this.endAct(p);
        break;
      }
      case 'peek': {
        beat(1.3, (n) => this.bubble(p, n === 1 ? '?' : '🥚', '#fff', 20));
        if (A.t >= A.dur) this.endAct(p);
        break;
      }
      case 'shake': {
        // 나무 들이받기: 쿵 → 꽃잎이 날리고 복숭아가 톡 → 냠
        beat(9, () => { this.play(p, ['attack']); this.time.delayedCall(200, () => { if (!o.active) return; this.wobble(o, 4); this.puff(o.x, o.y - H * 0.7, 10, [0xffb6cf, 0xffd6e6, 0xffffff], 90); this.peach(o, p); try { sfx('hold'); } catch { /* */ } }); });
        if (A.t >= A.dur) { this.endAct(p); this.hop(p, 2); this.bubble(p, '🍑 냠', '#ffd6e6', 18); }
        break;
      }
      default: if (A.t >= (A.dur ?? 2)) this.endAct(p);
    }
  }

  // ----- 소품 효과(그림은 그대로, 움직임·빛·글자만) -----
  pop(x, y, text, size = 16, color = '#ffffff', hold = 250) {
    const o = this.add.text(x, y, text, style(size, color, { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: o, y: y - 26, alpha: 0, delay: hold, duration: 500, onComplete: () => o.destroy() });
  }
  /** 작은 알갱이(꽃잎·풀잎)가 흩날림 */
  puff(x, y, n, colors, spread = 40) {
    for (let i = 0; i < n; i++) {
      const d = this.add.ellipse(x + rnd(-10, 10), y + rnd(-10, 10), 7, 5, colors[i % colors.length], 1).setDepth(1400).setAngle(rnd(0, 180));
      this.tweens.add({ targets: d, x: d.x + rnd(-spread, spread), y: d.y + rnd(20, 90), angle: d.angle + rnd(-200, 200), alpha: 0, duration: rnd(700, 1300), ease: 'Sine.in', onComplete: () => d.destroy() });
    }
  }
  wobble(o, deg = 2) { if (this.tweens.isTweening(o)) return; this.tweens.add({ targets: o, angle: { from: -deg, to: deg }, duration: 70, yoyo: true, repeat: 2, onComplete: () => o.setAngle(0) }); }
  bounce(o) { if (this.tweens.isTweening(o)) return; const s = o.baseScale; this.tweens.add({ targets: o, scaleY: s * 0.92, scaleX: s * 1.05, duration: 80, yoyo: true, onComplete: () => o.setScale(s) }); }
  /** 물결 고리(소품 바로 위, 동물 아래) */
  ripple(x, y, o) {
    const e = this.add.ellipse(x, y, 20, 8).setStrokeStyle(2, 0xffffff, 0.9).setDepth(PROP_Z(o.y) + 1);
    this.tweens.add({ targets: e, scaleX: 3.4, scaleY: 3, alpha: 0, duration: 900, onComplete: () => e.destroy() });
  }
  splash(x, y, o) {
    this.ripple(x, y, o); this.time.delayedCall(160, () => { if (o.active) this.ripple(x, y, o); });
    for (let i = 0; i < 7; i++) { const d = this.add.circle(x, y, rnd(2.5, 4.5), 0xbfeaff, 1).setDepth(1400); this.tweens.add({ targets: d, x: x + rnd(-46, 46), y: { value: y - rnd(26, 60), ease: 'Quad.out', duration: 260, yoyo: true }, alpha: { value: 0, delay: 380, duration: 160 }, duration: 520, onComplete: () => d.destroy() }); }
  }
  butterfly(x, y) {
    const b = this.add.text(x, y, '🦋', style(16)).setOrigin(0.5).setDepth(1500), tx = x + rnd(-120, 120);
    this.tweens.add({ targets: b, x: tx, y: y - rnd(90, 150), duration: 2600, ease: 'Sine.inOut', onComplete: () => b.destroy() });
    this.tweens.add({ targets: b, scaleX: 0.3, duration: 140, yoyo: true, repeat: 8 });
    this.tweens.add({ targets: b, alpha: 0, delay: 2100, duration: 500 });
  }
  /** 석등 불빛 켜고 끄기 */
  lamp(o, on) {
    if (on && !o.glow) { o.glow = this.add.circle(o.x, o.y - o.displayHeight * 0.58, 52, 0xffd27a, 0.3).setBlendMode('ADD').setDepth(PROP_Z(o.y) + 0.5); this.tweens.add({ targets: o.glow, alpha: { from: 0.22, to: 0.4 }, scale: { from: 0.95, to: 1.08 }, duration: 700, yoyo: true, repeat: -1 }); }
    else if (!on && o.glow) { this.tweens.killTweensOf(o.glow); o.glow.destroy(); o.glow = null; }
  }
  /** 북: 둥! + 음표 + 가까운 친구들이 들썩 */
  drum(o) {
    this.bounce(o); this.pop(o.x + rnd(-10, 10), o.y - o.displayHeight - 6, '둥!', 20, '#ffe066'); this.pop(o.x + rnd(-40, 40), o.y - o.displayHeight - 24, '♪', 18, '#ffe066');
    try { sfx('slam'); } catch { /* */ }
    for (const q of this.pets) if ((q.state === 'idle' || q.state === 'walk') && Math.hypot(q.c.x - o.x, q.c.y - o.y) < 300) this.hop(q, 1);
  }
  /** 종: 댕~ + 퍼지는 고리 + 자던 친구가 깸 */
  bell(o) {
    this.wobble(o, 14); this.pop(o.x, o.y - o.displayHeight - 8, '댕~', 22, '#ffe9a0');
    const e = this.add.circle(o.x, o.y - o.displayHeight * 0.5, 24).setStrokeStyle(3, 0xffe9a0, 0.9).setDepth(1400);
    this.tweens.add({ targets: e, scale: 9, alpha: 0, duration: 900, onComplete: () => e.destroy() });
    try { sfx('clang'); } catch { /* */ }
    for (const q of this.pets) {
      if (q.state === 'nap') { this.setState(q, 'idle', 1.5); this.bubble(q, '!', '#ffd84d', 22); this.hop(q, 1); }
      else if (q.state === 'act' && q.act?.nap) q.act.t = Math.max(q.act.t, (q.act.dur ?? 0) - 0.2);
      else if (q.state === 'idle') q.face = o.x < q.c.x ? -1 : 1;
    }
  }
  /** 종을 톡 치면: 모두 하던 일을 멈추고 종 둘레로 달려와 모임 → 다 모이면 함께 폴짝 → 잠깐 머물다 흩어짐 */
  gather(o) {
    if (!this.pets.length || this.time.now < (o.gatherCd ?? 0)) return;
    const GO = 2.4, STAY = 4, now = this.time.now;   // 달려오는 시간(초) · 모여서 머무는 시간(초)
    o.gatherCd = now + 1500;
    const slots = G.gatherSlots(this.pets.length, o.x, o.y, GROUND);
    const order = [...this.pets].sort((a, b) => Math.hypot(a.c.x - o.x, a.c.y - o.y) - Math.hypot(b.c.x - o.x, b.c.y - o.y));
    for (const q of order) {
      // 높은 데·물속·다리 위에 있으면 서둘러 내려온 다음 달려옴(순간 이동 없이)
      const A = q.state === 'act' ? q.act : null, high = !!A && (A.air || A.kind === 'cross');
      const from = high ? (A.kind === 'cross' ? [q.c.x, A.from[1]] : A.from) : [q.c.x, q.c.y];
      let bi = 0, bd = Infinity;
      slots.forEach((s, i) => { const d = Math.hypot(s[0] - from[0], s[1] - from[1]); if (d < bd) { bd = d; bi = i; } });
      const [tx, ty] = slots.splice(bi, 1)[0];
      q.rallyTo = { tx, ty, o, by: now + GO * 1000, end: now + (GO + STAY) * 1000 };
      q.other = null; q.meetCd = GO + STAY + 2;
      if (high) { A.fast = 3; A.leave = true; if (A.kind === 'cross') { A.pause = false; A.hold = 0; this.play(q, ['move'], { loop: true, ts: 1.5 }); } }
      else {
        if (A) this.endAct(q, true); else if (q.plan) { q.plan.o?.users?.delete(q); q.plan = null; }
        this.startRally(q);
      }
      this.time.delayedCall(rnd(0, 260), () => { if (q.rallyTo?.o === o) this.bubble(q, '!', '#ffd84d', 22); });
    }
    this.pop(o.x, o.y - o.displayHeight - 34, '모여라~', 26, '#fff3c4', 1100);
    this.time.delayedCall(GO * 1000 + 350, () => {
      if (!o.active) return;
      const here = this.pets.filter((q) => q.rallied === o && q.state === 'idle');
      if (here.length < 2) return;
      here.forEach((q, i) => { this.hop(q, 2); if (i % 2 === 0) this.bubble(q, ['♪', '♥', '🎵'][i % 3], '#ffe066'); });
      this.pop(o.x, o.y - o.displayHeight - 34, '다 모였다!', 28, '#ffe066', 1200);
      this.puff(o.x, o.y - o.displayHeight * 0.6, 8, [0xffe9a0, 0xffffff, 0xffc6dc], 110);
    });
  }
  /** 모일 자리로 출발: 제때 닿도록 먼 동물일수록 빨리 달림 */
  startRally(p) {
    const R = p.rallyTo, left = Math.max(0.7, (R.by - this.time.now) / 1000), d = Math.hypot(R.tx - p.c.x, R.ty - p.c.y);
    this.setState(p, 'rally', left + 1.5, { tx: R.tx, ty: R.ty, rsp: Math.max(110, d / left) });
  }
  /** 모이는 자리에 닿음: 종 쪽을 보고 기다림 */
  rallied(p) {
    const R = p.rallyTo; p.rallyTo = null;
    if (!R) return this.setState(p, 'idle', rnd(1, 2));
    if (R.o?.active) p.face = R.o.x < p.c.x ? -1 : 1;
    p.rallied = R.o;
    this.setState(p, 'idle', Math.max(1.2, (R.end - this.time.now) / 1000) + rnd(0, 1.6));
    this.hop(p, 1);
  }
  /** 복숭아가 톡 떨어짐 */
  peach(o, p = null) {
    const x = o.x + rnd(-o.displayWidth * 0.25, o.displayWidth * 0.25), y0 = o.y - o.displayHeight * 0.6, y1 = Math.min(GROUND.y1, o.y + rnd(4, 16));
    const f = this.add.text(x, y0, '🍑', style(20)).setOrigin(0.5).setDepth(PET_Z + y1 - 1);
    this.tweens.add({ targets: f, y: y1, duration: 520, ease: 'Bounce.out', onComplete: () => this.tweens.add({ targets: f, alpha: 0, delay: p ? 900 : 2200, duration: 400, onComplete: () => f.destroy() }) });
  }

  /** 소품을 톡 누르면: 그 소품이 반응하고, 가까운 한가한 동물이 와서 어울림 */
  tapProp(o) {
    const H = o.displayHeight, W = o.displayWidth;
    this.bounce(o);
    switch (o.propId) {
      case 'peach': this.wobble(o, 3); this.puff(o.x, o.y - H * 0.7, 8, [0xffb6cf, 0xffd6e6, 0xffffff], 90); if (Math.random() < 0.5) this.peach(o); break;
      case 'pond': this.ripple(o.x + rnd(-W * 0.2, W * 0.2), o.y - H * 0.47, o); break;
      case 'fountain': this.splash(o.x, o.y - H * 0.7, o); break;
      case 'lantern': this.lamp(o, !o.glow); break;
      case 'flowers': this.puff(o.x, o.y - H * 0.5, 6, [0xff9ec4, 0xffe066, 0xffffff]); this.butterfly(o.x, o.y - H * 0.7); break;
      case 'drum': this.drum(o); break;
      case 'bell': this.bell(o); try { sfx('click'); } catch { /* */ } this.gather(o); return;   // 종은 모두 불러 모음
      case 'nest': this.pop(o.x, o.y - H - 4, '♥', 18, '#ff8fb0'); break;
      case 'feed': this.puff(o.x, o.y - H * 0.8, 5, [0xf2d16b, 0xe6b84a]); break;
      default: break;
    }
    try { sfx('click'); } catch { /* */ }
    const free = this.pets.filter((q) => q.state === 'idle' || q.state === 'walk').sort((a, b) => Math.hypot(a.c.x - o.x, a.c.y - o.y) - Math.hypot(b.c.x - o.x, b.c.y - o.y));
    for (const q of free.slice(0, 3)) if (this.tryPropAct(q, o)) { this.bubble(q, '!', '#ffd84d', 22); break; }
  }

  // ---------- 도감에서 데려오기 ----------
  openPicker(page = 0) {
    this.closePicker();
    const have = new Set(this.cache.json.get('dotmIndex')?.species ?? []);
    const hasArt = (id, stage) => have.has(stage === 'spirit' ? id + '_spirit' : id);
    const list = G.gardenChoices(this.save, this.D, hasArt);
    const objs = (this.pk = []);
    const add = (o) => { objs.push(o); return o; };
    add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setDepth(3000).setInteractive());
    add(this.add.rectangle(640, 380, 1180, 590, 0x2a1f2e, 0.97).setStrokeStyle(3, 0xffb6cf).setDepth(3001));
    const slots = G.gardenSlots(this.save, this.D);
    add(this.add.text(640, 110, `🐾 도감에서 데려오기 · ${this.g.animals.length} / ${slots}마리`, style(24, '#ffe3ef', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(3002));
    add(this.add.text(640, 142, '누르면 동산에 데려오고, 다시 누르면 돌려보내요', style(14, '#d8c8d8')).setOrigin(0.5).setDepth(3002));
    if (!list.length) add(this.add.text(640, 360, '아직 만난 동물이 없어요. 연전에서 동물을 만나 봐요!', style(18, '#fff')).setOrigin(0.5).setDepth(3002));
    const PER = 24, pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.max(0, Math.min(pages - 1, page));
    list.slice(page * PER, page * PER + PER).forEach((ch, i) => {
      const x = 130 + (i % 8) * 146, y = 230 + Math.floor(i / 8) * 150;
      const inG = this.g.animals.filter((a) => a.id === ch.id && a.stage === ch.stage);
      const card = add(this.add.rectangle(x, y + 10, 134, 138, inG.length ? 0x3d5a2e : 0x3a2f40, 1).setStrokeStyle(2, inG.length ? 0x9cff6b : 0x7a6a80).setDepth(3002).setInteractive({ useHandCursor: true }));
      const img = speciesImage(this, ch.id, ch.stage === 'spirit' ? 'spirit' : ch.stage, x, y - 6, 84);
      if (img) add(img.setDepth(3003)); else add(this.add.text(x, y - 6, ch.kind === 'chimera' ? '🧬' : '🐾', style(40)).setOrigin(0.5).setDepth(3003));
      add(this.add.text(x, y + 62, ch.name, style(13, '#ffffff', { stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: 128 } })).setOrigin(0.5).setDepth(3003));
      if (inG.length) add(this.add.text(x + 56, y - 50, '✔', style(20, '#9cff6b', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(3003));
      card.on('pointerdown', () => this.pick(ch, page));
    });
    if (pages > 1) {
      add(button(this, 470, 640, 120, 40, '◀ 앞', () => this.openPicker(page - 1), { size: 16, depth: 3003 }));
      add(this.add.text(640, 640, `${page + 1} / ${pages}`, style(16, '#fff')).setOrigin(0.5).setDepth(3003));
      add(button(this, 810, 640, 120, 40, '뒤 ▶', () => this.openPicker(page + 1), { size: 16, depth: 3003 }));
    }
    add(button(this, 1150, 110, 110, 40, '닫기', () => this.closePicker(), { size: 16, depth: 3003 }));
  }
  closePicker() { (this.pk ?? []).forEach((o) => o.destroy()); this.pk = null; }

  pick(ch, page) {
    const inG = this.g.animals.find((a) => a.id === ch.id && a.stage === ch.stage);
    if (inG) {
      G.removeGardenAnimal(this.save, inG.key);
      const i = this.pets.findIndex((p) => p.a.key === inG.key);
      if (i >= 0) { const p = this.pets[i]; p.rallyTo = null; this.endAct(p, true); this.tweens.add({ targets: p.c, alpha: 0, duration: 300, onComplete: () => p.c.destroy() }); this.pets.splice(i, 1); }
      this.persist(); this.drawUi(); this.openPicker(page); return;
    }
    const r = G.addGardenAnimal(this.save, this.D, ch);
    if (!r.ok) { this.toast(`동산이 꽉 찼어요 — ⭐ 별을 더 모으면 칸이 늘어요`); return; }
    this.persist(); this.drawUi(); this.closePicker();
    const go = () => { const p = this.spawn(r.animal, { x: rnd(500, 780), y: rnd(470, 560) }); if (p) { this.hop(p, 3); this.bubble(p, '🌸 왔어요!', '#ffe3ef', 18); try { sfx('summon'); } catch { /* */ } } };
    queueMotionSheets(this, [ch.id]);
    if (this.load.list.size || this.load.inflight?.size) { this.load.once('complete', go); this.load.start(); } else go();
  }

  toast(msg) {
    const t = this.add.text(640, 680, msg, style(18, '#ffffff', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(4000);
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 500, onComplete: () => t.destroy() });
  }

  // ---------- 소품 꾸미기 ----------
  makeProp(p, i) {
    const key = G.PROP_ART[p.id];
    if (!this.textures.exists(key)) return null;
    const o = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setScale(PROP_SCALE[p.id] ?? 2).setDepth(PROP_Z(p.y));
    o.propIndex = i; o.propId = p.id; o.users = new Set(); o.baseScale = PROP_SCALE[p.id] ?? 2; o.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(o, this.decor);
    o.on('pointerdown', () => { if (this.decor) this.selectProp(o); else this.tapProp(o); });
    this.propObjs.push(o);
    return o;
  }
  refreshProps() { this.propObjs.forEach((o) => { this.kickOff(o); o.glow?.destroy(); o.destroy(); }); this.propObjs = []; this.g.props.forEach((p, i) => this.makeProp(p, i)); }
  selectProp(o) {
    this.selX?.destroy();
    this.selX = button(this, o.x + o.displayWidth / 2 - 10, o.y - o.displayHeight + 10, 44, 36, '✖', () => { G.removeProp(this.save, o.propIndex); this.persist(); this.selX?.destroy(); this.selX = null; this.refreshProps(); }, { size: 16, depth: 2500, fill: 0x8a2a2a });
  }
  toggleDecor() {
    this.decor = !this.decor;
    this.selX?.destroy(); this.selX = null;
    this.propObjs.forEach((o) => this.input.setDraggable(o, this.decor));
    this.palette?.forEach((o) => o.destroy()); this.palette = null;
    this.drawUi();
  }
  drawPalette() {
    const objs = (this.palette = []);
    objs.push(this.add.rectangle(640, 672, 1280, 96, 0x1a1420, 0.7).setDepth(2000));
    objs.push(this.add.text(16, 636, '눌러서 놓고,\n끌어서 옮기고,\n눌러서 ✖', style(12, '#ffd6e6', { stroke: '#000', strokeThickness: 3 })).setDepth(2001));
    G.GARDEN_PROPS.forEach((id, i) => {
      const x = 236 + i * 96, key = G.PROP_ART[id];
      const bg = this.add.rectangle(x, 668, 90, 84, 0x3a2f40, 1).setStrokeStyle(2, 0xffb6cf).setDepth(2001).setInteractive({ useHandCursor: true });
      objs.push(bg);
      if (this.textures.exists(key)) { const im = this.add.image(x, 660, key).setDepth(2002); im.setScale(Math.min(52 / im.height, 80 / im.width)); objs.push(im); }
      objs.push(this.add.text(x, 702, G.PROP_NAME[id], style(12, '#fff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(2002));
      bg.on('pointerdown', () => {
        const r = G.addProp(this.save, this.D, id, rnd(380, 900), rnd(470, 560));
        if (!r.ok) { this.toast(`소품은 ${G.gcfgGarden(this.D).maxProps}개까지 놓을 수 있어요`); return; }
        this.persist();
        const o = this.makeProp(this.g.props[r.index], r.index);
        if (o) { o.setScale(0.1); this.tweens.add({ targets: o, scale: PROP_SCALE[id] ?? 2, duration: 260, ease: 'Back.out' }); this.selectProp(o); }
        try { sfx('click'); } catch { /* */ }
      });
    });
    this.ui.push(...objs);
  }

  // ---------- 사진 ----------
  photo() {
    const hide = [...this.ui, ...(this.palette ?? []), this.selX].filter(Boolean);
    hide.forEach((o) => o.setVisible(false));
    this.time.delayedCall(60, () => {
      this.game.renderer.snapshot((img) => {
        hide.forEach((o) => o.setVisible?.(true));
        const fl = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0.9).setDepth(5000);
        this.tweens.add({ targets: fl, alpha: 0, duration: 380, onComplete: () => fl.destroy() });
        try { sfx('click'); } catch { /* */ }
        try {
          const a = document.createElement('a');
          a.href = img.src; a.download = `무릉도원_${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(a); a.click(); a.remove();
          this.toast('📸 찰칵! 사진을 저장했어요');
        } catch { this.toast('사진을 저장하지 못했어요'); }
      });
    });
  }

  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    for (const p of this.pets) if (p.c.active) this.brain(p, dt);
  }
}

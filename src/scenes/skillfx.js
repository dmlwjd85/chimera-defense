// 신화급·키메라 스킬 이펙트(2026-11-27 선생님 "신화급 및 키메라들 스킬 이펙트 화려하게, 영물이랑 키메라가 활약하는 맛이 살게").
// 기 모으기 → 발동(속성마다 다른 모양) → 타격(별 폭발·흔들림·섬광·잠깐 멈춤·큰 피해 숫자) 3단계.
// 그림은 모두 여기서 코드로 찍는 도트(굵고 진한 외곽선, 밝은 색 — 손그림 동화 느낌). 외부 그림 없음.
// 값(색·수·시간·상한)은 public/data/skillfx.json, 계획은 logic/skillfx.js.
// 성능: 입자 뿌리개는 (색·조각·움직임)마다 한 번만 만들어 계속 다시 씀, 모양(그래픽)도 묶음에서 빌려 쓰고 돌려줌.
//       살아 있는 입자가 상한을 넘으면 새로 뿌릴 수를 줄이고, 동시에 화려한 연출이 너무 많으면 가벼운 연출로.
import Phaser from 'phaser';
import { FONT } from '../text.js';
import { planFx, hex, budget, fullOk, motionOk, damp } from '../logic/skillfx.js';

// 도트 조각(o 외곽선, 1 밝은 속, 2 주색, 3 짙은 색, 4 아주 짙은 색, . 빈칸)
const SPRITES = {
  flame: ['...o...', '..o1o..', '..o1o..', '.o121o.', '.o212o.', 'o21112o', 'o21112o', 'o22122o', 'o32223o', '.o333o.', '..ooo..'],
  wisp: ['..oooo..', '.o1112o.', 'o111122o', 'o111222o', 'o112223o', '.o2223o.', '..o33o..', '...oo...'],
  star: ['...o...', '..o1o..', '.oo1oo.', 'o11111o', '.oo2oo.', '..o2o..', '...o...'],
  rock: ['.oooo.', 'o2213o', 'o2233o', 'o2334o', 'o3344o', '.oooo.'],
  drop: ['..o..', '.o1o.', '.o1o.', 'o112o', 'o122o', 'o223o', '.ooo.'],
  feather: ['...oo', '..o1o', '.o12o', '.o12o', 'o122o', 'o23o.', 'o3o..', 'oo...'],
  note: ['...oooo', '...o22o', '...o2oo', '...o2o.', '.ooo2o.', 'o1122o.', 'o1223o.', '.oooo..'],
  cross: ['..ooo..', '..o1o..', 'ooo1ooo', 'o11111o', 'ooo2ooo', '..o2o..', '..ooo..'],
  leaf: ['..ooo.', '.o122o', 'o1223o', 'o223o.', '.oo...'],
  crescent: ['...ooo...', '..o111o..', '.o11oo...', 'o112o....', 'o112o....', 'o122o....', '.o223oo..', '..o333o..', '...ooo...'],
  pix: ['ooo', 'o1o', 'ooo'],
  ember: ['.oo.', 'o12o', 'o23o', '.oo.'],
  shard: ['..o..', '.o1o.', '.o12o', 'o112o', 'o122o', '.o23o', '..oo.'],
};

// 움직임 묶음(입자 뿌리개 설정). 크기는 도트 한 칸 = scale px(정수배라 도트가 뭉개지지 않음)
const MOTION = {
  burst: (s) => ({ speed: { min: 110, max: 300 }, lifespan: { min: 380, max: 640 }, gravityY: 420, rotate: { min: -40, max: 40 }, scale: s, alpha: { start: 1, end: 0, ease: 'Quad.easeIn' } }),
  pop: (s) => ({ speed: { min: 40, max: 140 }, lifespan: { min: 300, max: 480 }, scale: { start: s, end: s * 0.34 }, alpha: { start: 1, end: 0.2 } }),
  rise: (s) => ({ speedY: { min: -180, max: -60 }, speedX: { min: -45, max: 45 }, lifespan: { min: 520, max: 900 }, scale: s, alpha: { start: 1, end: 0, ease: 'Quad.easeIn' } }),
  fall: (s) => ({ speedY: { min: 520, max: 680 }, speedX: { min: -90, max: -50 }, lifespan: { min: 520, max: 700 }, scale: s, alpha: { start: 1, end: 0.6 } }),
  home: (s) => ({ lifespan: 400, scale: s, alpha: { start: 1, end: 0.9 }, rotate: { min: -20, max: 20 } }),
};

const DEPTH = 1610;   // 동물(100+y)·기존 이펙트(1600) 위, 가운데 판(1840)·필살기 컷(1900) 아래

export class SkillFX {
  constructor(scene, cfg, units = {}) {
    this.sc = scene; this.cfg = cfg ?? null; this.units = units;
    this.emitters = new Map(); this.shapes = []; this.shapesOut = 0; this.active = 0;
    this.lastFlash = -1e9; this.stats = { fired: 0, lite: 0, skippedParticles: 0, maxAlive: 0, maxActive: 0 };
    let stored = null; try { stored = window.localStorage?.getItem('chimera-shake'); } catch { stored = null; }
    let reduced = false; try { reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }
    this.motion = motionOk(this.cfg, stored, reduced);
    const L = this.cfg?.limits ?? {};
    this.cap = L.particleCap ?? 420; this.perEm = L.perEmitter ?? 90; this.shapeMax = L.shapePool ?? 48;
    this.aliveCache = { t: -1, n: 0 };
    window.__skillfx = this;   // 시험용(입자 수·동시 연출 수 확인)
  }

  get on() { return !!this.cfg && this.cfg.enabled !== false; }

  /** 기술 한 번의 계획(없으면 null) */
  plan(info) {
    if (!this.on) return null;
    const p = planFx(this.cfg, { ...info, units: this.units });
    if (!p || info.u?.uid == null) return p;
    // 같은 동물이 같은 종류 기술을 금방 또 쓰면 짧고 가볍게(필살기가 교전당 6번까지라 반복해도 피곤하지 않게)
    this.lastUse ??= new Map();
    const key = `${info.u.uid}:${p.move}`, now = this.sc.time.now;
    const out = damp(p, this.cfg, this.lastUse.get(key), now);
    this.lastUse.set(key, now);
    if (out.repeat) this.stats.repeats = (this.stats.repeats ?? 0) + 1;
    return out;
  }

  theme(name) { const t = this.cfg?.themes?.[name] ?? this.cfg?.themes?.light; return { c: (t?.c ?? ['#ffffff', '#ffe066', '#ffb02e', '#8a4a10']).map(hex), o: hex(t?.o ?? '#1a1020'), sprite: t?.sprite ?? 'star' }; }

  // ---------- 도트 조각 그림(처음 쓸 때 한 번만 찍음) ----------
  tex(themeName, sprite) {
    const key = `skfx-${themeName}-${sprite}`;
    const tx = this.sc.textures;
    if (tx.exists(key)) return key;
    const rows = SPRITES[sprite] ?? SPRITES.pix, h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const th = this.theme(themeName);
    const cv = tx.createCanvas(key, w, h);
    const ctx = cv.getContext();
    const col = { o: th.o, 1: th.c[0], 2: th.c[1], 3: th.c[2], 4: th.c[3] };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch] == null) return; ctx.fillStyle = '#' + col[ch].toString(16).padStart(6, '0'); ctx.fillRect(x, y, 1, 1); }));
    cv.refresh();
    try { tx.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch { /* */ }
    return key;
  }

  em(themeName, sprite, motion, scale) {
    const key = `${themeName}|${sprite}|${motion}|${scale}`;
    let e = this.emitters.get(key);
    if (e) return e;
    const conf = { ...MOTION[motion](scale), emitting: false, maxAliveParticles: this.perEm };
    if (motion === 'home') {
      // 표적 여러 곳으로 날아감: 쏠 때 표적 하나를 골라 입자에 적어 두고, 날아가는 동안 그쪽으로
      conf.moveToX = { onEmit: (p) => { const T = e.__targets ?? [[p.x, p.y]]; const t = T[(e.__i = (e.__i ?? 0) + 1) % T.length]; p.__tx = t[0] + Phaser.Math.Between(-e.__spread, e.__spread); p.__ty = t[1] + Phaser.Math.Between(-e.__spread, e.__spread) * 0.6; return p.__tx; }, onUpdate: (p) => p.__tx };
      conf.moveToY = { onEmit: (p) => p.__ty, onUpdate: (p) => p.__ty };
      conf.lifespan = { onEmit: () => e.__life ?? 400 };
    }
    e = this.sc.add.particles(0, 0, this.tex(themeName, sprite), conf).setDepth(DEPTH);
    e.__spread = 10;
    this.emitters.set(key, e);
    return e;
  }

  alive() {
    const now = this.sc.time.now;
    if (this.aliveCache.t === now) return this.aliveCache.n;
    let n = 0; for (const e of this.emitters.values()) n += e.getAliveParticleCount();
    this.aliveCache = { t: now, n };
    if (n > this.stats.maxAlive) this.stats.maxAlive = n;
    return n;
  }

  /** 입자 뿌리기(상한 안에서) */
  emit(themeName, sprite, motion, x, y, n, scale = 3) {
    const want = Math.round(n), k = budget(this.alive(), this.cap, want);
    if (k < want) this.stats.skippedParticles += want - k;
    if (k <= 0) return;
    this.em(themeName, sprite, motion, scale).explode(k, x, y);
    this.aliveCache.n += k;
  }

  /** 여러 표적으로 날려 보내기(from 둘레에서 출발) */
  home(themeName, sprite, from, targets, n, life, scale = 3, ring = 30, spread = 14) {
    if (!targets.length) return;
    const want = Math.round(n), k = budget(this.alive(), this.cap, want);
    if (k <= 0) { this.stats.skippedParticles += want; return; }
    const e = this.em(themeName, sprite, 'home', scale);
    e.__targets = targets; e.__life = life; e.__spread = spread;
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; e.emitParticleAt(from[0] + Math.cos(a) * ring, from[1] + Math.sin(a) * ring * 0.6, 1); }
    this.aliveCache.n += k;
  }

  /** 둘레에서 한가운데로 모이기(기 모으기) */
  converge(themeName, sprite, at, r, n, life, scale = 3) {
    const want = Math.round(n), k = budget(this.alive(), this.cap, want);
    if (k <= 0) return;
    const e = this.em(themeName, sprite, 'home', scale);
    e.__targets = [at]; e.__life = life; e.__spread = 4;
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + Math.random() * 0.4; const rr = r * (0.8 + Math.random() * 0.4); e.emitParticleAt(at[0] + Math.cos(a) * rr, at[1] + Math.sin(a) * rr * 0.75, 1); }
    this.aliveCache.n += k;
  }

  // ---------- 모양(그래픽) 묶음: 빌려 쓰고 돌려줌 ----------
  shape(depth = DEPTH) {
    let g = this.shapes.pop();
    if (!g) { if (this.shapesOut >= this.shapeMax) return null; g = this.sc.add.graphics(); }
    this.shapesOut++;
    g.clear().setVisible(true).setAlpha(1).setScale(1).setAngle(0).setPosition(0, 0).setDepth(depth).setBlendMode(Phaser.BlendModes.NORMAL);
    return g;
  }
  give(g) { if (!g || !g.scene) return; this.sc.tweens.killTweensOf(g); g.clear().setVisible(false); this.shapesOut--; this.shapes.push(g); }
  /** 모양 하나를 그리고 tween 한 뒤 돌려줌 */
  draw(x, y, paint, tween, depth = DEPTH) {
    const g = this.shape(depth);
    if (!g) return null;
    g.setPosition(x, y); paint(g);
    this.sc.tweens.add({ targets: g, ...tween, onComplete: () => this.give(g) });
    return g;
  }

  /** 땅에 그리는 도트 고리(굵은 외곽선) */
  ring(x, y, r, th, opts = {}) {
    const px = opts.px ?? 3, flat = opts.flat ?? 0.4, n = Math.max(16, Math.round(r / 3));
    return this.draw(x, y, (g) => {
      const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([Math.round(Math.cos(a) * r / px) * px, Math.round(Math.sin(a) * r * flat / px) * px]); }
      g.fillStyle(th.o, 1); for (const [a, b] of pts) g.fillRect(a - px * 1.5, b - px * 1.5, px * 3, px * 3);
      g.fillStyle(th.c[opts.shade ?? 1], 1); for (const [a, b] of pts) g.fillRect(a - px * 0.75, b - px * 0.75, px * 1.5, px * 1.5);
    }, { scale: { from: opts.from ?? 0.25, to: opts.to ?? 1 }, alpha: { from: 1, to: 0 }, duration: opts.dur ?? 420, delay: opts.delay ?? 0, ease: opts.ease ?? 'Cubic.out' }, opts.depth ?? 40);
  }

  /** 별 모양 폭발(외곽선 + 주색 + 밝은 속) */
  star(x, y, r, th, dur = 260) {
    const spikes = 8, pts = (k) => { const out = []; for (let i = 0; i < spikes * 2; i++) { const rr = (i % 2 ? r * 0.42 : r) * k; const a = (i / (spikes * 2)) * Math.PI * 2 + 0.2; out.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr }); } return out; };
    return this.draw(x, y, (g) => {
      g.fillStyle(th.o, 1).fillPoints(pts(1.18), true);
      g.fillStyle(th.c[1], 1).fillPoints(pts(1), true);
      g.fillStyle(th.c[0], 1).fillPoints(pts(0.55), true);
    }, { scale: { from: 0.3, to: 1.15 }, alpha: { from: 1, to: 0 }, duration: dur, ease: 'Back.out' });
  }

  /** 번개(꺾인 선, 외곽선 → 주색 → 흰 속) */
  bolt(x1, y1, x2, y2, th, w = 3) {
    const pts = [{ x: 0, y: 0 }];
    for (let i = 1; i < 7; i++) { const k = i / 7; pts.push({ x: (x2 - x1) * k + Phaser.Math.Between(-16, 16), y: (y2 - y1) * k + Phaser.Math.Between(-10, 10) }); }
    pts.push({ x: x2 - x1, y: y2 - y1 });
    return this.draw(x1, y1, (g) => {
      g.lineStyle(w * 3.4, th.o, 1).strokePoints(pts); g.lineStyle(w * 2, th.c[1], 1).strokePoints(pts); g.lineStyle(w * 0.8, th.c[0], 1).strokePoints(pts);
    }, { alpha: { from: 1, to: 0 }, duration: 260, delay: 40, ease: 'Quad.in' });
  }

  /** 할퀸 자국·베기(세 줄) */
  claws(x, y, th, ang = -35, len = 70) {
    return this.draw(x, y, (g) => {
      for (const o of [-16, 0, 16]) { const p = [{ x: -len / 2, y: o - 10 }, { x: 0, y: o }, { x: len / 2, y: o + 6 }]; g.lineStyle(11, th.o, 1).strokePoints(p); g.lineStyle(6, th.c[1], 1).strokePoints(p); g.lineStyle(2, th.c[0], 1).strokePoints(p); }
      g.setAngle(ang);
    }, { scaleX: { from: 0.2, to: 1.1 }, alpha: { from: 1, to: 0 }, duration: 300, ease: 'Cubic.out' });
  }

  /** 기둥(불기둥·빛기둥) */
  column(x, yBottom, h, w, th, dur = 420, delay = 0) {
    return this.draw(x, yBottom, (g) => {
      g.fillStyle(th.o, 1).fillRect(-w / 2 - 4, -h - 4, w + 8, h + 4);
      g.fillStyle(th.c[2], 1).fillRect(-w / 2, -h, w, h);
      g.fillStyle(th.c[1], 1).fillRect(-w / 2 + w * 0.18, -h, w * 0.64, h);
      g.fillStyle(th.c[0], 1).fillRect(-w * 0.12, -h, w * 0.24, h);
    }, { scaleY: { from: 0.1, to: 1 }, scaleX: { from: 1.2, to: 0.2 }, alpha: { from: 1, to: 0 }, duration: dur, delay, ease: 'Cubic.out' });
  }

  /** 땅 갈라짐 */
  crack(x1, y1, x2, y2, th) {
    const pts = [{ x: 0, y: 0 }]; const n = 9;
    for (let i = 1; i < n; i++) { const k = i / n; pts.push({ x: (x2 - x1) * k, y: (y2 - y1) * k + (i % 2 ? -6 : 6) }); }
    pts.push({ x: x2 - x1, y: y2 - y1 });
    return this.draw(x1, y1, (g) => { g.lineStyle(10, th.o, 1).strokePoints(pts); g.lineStyle(5, th.c[2], 1).strokePoints(pts); g.lineStyle(2, th.c[0], 1).strokePoints(pts); }, { alpha: { from: 1, to: 0 }, duration: 620, delay: 120, ease: 'Quad.in' }, 35);
  }

  /** 반원 방패(보호막) */
  dome(x, y, r, th, dur = 700) {
    return this.draw(x, y, (g) => {
      g.lineStyle(9, th.o, 1).strokeCircle(0, 0, r); g.lineStyle(4, th.c[1], 1).strokeCircle(0, 0, r);
      g.fillStyle(th.c[0], 0.18).fillCircle(0, 0, r);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillStyle(th.c[0], 1).fillRect(Math.cos(a) * r - 3, Math.sin(a) * r - 3, 6, 6); }
    }, { scale: { from: 0.4, to: 1 }, alpha: { from: 1, to: 0 }, duration: dur, ease: 'Back.out' });
  }

  /** 화면 섬광(옅게, 자주 번쩍이지 않게) */
  flash(th, a) {
    if (!(a > 0) || !this.motion) return;
    const now = this.sc.time.now, gap = this.cfg?.limits?.flashGap ?? 900;
    if (now - this.lastFlash < gap) return;
    this.lastFlash = now;
    if (!this.flashRect || !this.flashRect.scene) this.flashRect = this.sc.add.rectangle(640, 360, 1280, 720, 0xffffff, 1).setDepth(1835).setAlpha(0);
    this.flashRect.setFillStyle(th.c[0], 1).setAlpha(Math.min(0.35, a));
    this.sc.tweens.killTweensOf(this.flashRect);
    this.sc.tweens.add({ targets: this.flashRect, alpha: 0, duration: 220, ease: 'Quad.out' });
  }

  shake(ms, k) { if (k > 0 && this.motion) this.sc.cameras.main.shake(ms, k); }
  hitStop(s) { if (s > 0) this.sc.paused = Math.max(this.sc.paused ?? 0, s); }

  /** 큰 피해 숫자(색 테두리 + 튀어나옴) */
  number(x, y, d, plan) {
    const N = this.cfg?.number ?? {}, th = this.theme(plan.theme), k = plan.number ?? 1;
    // 가까운 곳에 막 뜬 숫자가 있으면 위로 비켜서 겹치지 않게
    const now = this.sc.time.now; this.nums = (this.nums ?? []).filter((q) => now - q.t < 450);
    const near = this.nums.filter((q) => Math.abs(q.x - x) < 80 && Math.abs(q.y0 - y) < 40).length;
    this.nums.push({ t: now, x, y0: y });
    y -= near * Math.round((N.size ?? 30) * 0.95);
    const size = Math.round((N.size ?? 30) * k * (plan.move === 'ult' ? 1 : 0.85));
    const hx = (c) => '#' + c.toString(16).padStart(6, '0');
    const t = this.sc.add.text(x + Phaser.Math.Between(-6, 6), y, String(Math.round(d)), { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color: hx(th.c[0]), stroke: hx(th.o), strokeThickness: N.stroke ?? 8 }).setOrigin(0.5).setDepth(1705).setScale(2.1).setAngle(Phaser.Math.Between(-8, 8));
    t.setShadow(0, 4, hx(th.c[2]), 0, true, true);
    this.star(x, y + 4, size * 0.9, th, 220);
    this.sc.tweens.add({ targets: t, scale: 1, duration: 150, ease: 'Back.out' });
    this.sc.tweens.add({ targets: t, y: y - 52, alpha: 0, delay: N.hold ?? 520, duration: 420, onComplete: () => t.destroy() });
  }

  /** 소리 글자(쿠웅! 어흥!) */
  word(x, y, text, plan) {
    if (!text) return;
    const th = this.theme(plan.theme), hx = (c) => '#' + c.toString(16).padStart(6, '0');
    const size = Math.round((this.cfg?.number?.wordSize ?? 30) * (plan.tier === 'normal' ? 0.75 : 1));
    const t = this.sc.add.text(x, y, text, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color: hx(th.c[1]), stroke: hx(th.o), strokeThickness: 8 }).setOrigin(0.5).setDepth(1706).setAngle(-8).setScale(0.3);
    t.setShadow(3, 3, hx(th.c[3]), 0, true, true);
    this.sc.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.out' });
    this.sc.tweens.add({ targets: t, alpha: 0, y: y - 18, delay: 620, duration: 260, onComplete: () => t.destroy() });
  }

  // ---------- 3단계 ----------
  /**
   * 기술 한 번 재생. ctx = { at: [x,y] 시전자, targets: [[x,y]…], allies: [[x,y]…] }.
   * onImpact 는 맞는 순간에 부름(기존 피해 숫자·맞는 동작 등). 반환 = 맞기까지 ms.
   */
  play(plan, ctx, onImpact) {
    const full = fullOk(this.active, this.cfg);
    this.stats.fired++;
    if (!full) {   // 너무 많이 겹침: 가벼운 연출(타격만)
      this.stats.lite++;
      const d = 120;
      this.sc.time.delayedCall(d, () => { this.impact(plan, ctx, false); onImpact?.(); });
      return d;
    }
    this.active++; if (this.active > this.stats.maxActive) this.stats.maxActive = this.active;
    const charge = plan.charge, travel = plan.travel;
    this.charge(plan, ctx);
    this.sc.time.delayedCall(charge, () => { try { this.release(plan, ctx); } catch (e) { console.warn('skillfx release', e); } });
    this.sc.time.delayedCall(charge + travel, () => { try { this.impact(plan, ctx, true); } catch (e) { console.warn('skillfx impact', e); } onImpact?.(); });
    this.sc.time.delayedCall(charge + travel + 500, () => { this.active = Math.max(0, this.active - 1); });
    return charge + travel;
  }

  /** 속성 공격(신화급·키메라): 기다리지 않고 맞는 순간만 꾸밈 */
  accent(plan, ctx) {
    if (!fullOk(this.active + 1, this.cfg)) { this.impact(plan, ctx, false); return; }
    this.release(plan, { ...ctx, quick: true });
    this.sc.time.delayedCall(Math.min(160, plan.travel), () => this.impact(plan, ctx, true));
  }

  charge(plan, { at }) {
    const th = this.theme(plan.theme), s = plan.scale, P = plan.particles, R = 70 * plan.ring;
    const ms = plan.charge;
    // 발밑 마법진이 조여 들며 빛남
    this.ring(at[0], at[1] + 30, R * 1.25, th, { from: 1.15, to: 0.55, dur: ms + 80, ease: 'Quad.in', px: s });
    if (plan.tier !== 'normal' && !plan.repeat) this.ring(at[0], at[1] + 30, R * 0.9, th, { from: 0.4, to: 1.1, dur: ms + 160, delay: 60, shade: 0, px: s });
    // 둘레에서 모여드는 알갱이와 별
    this.converge(plan.theme, 'pix', [at[0], at[1] - 20], R * 1.2, 10 * P, ms, s);
    this.converge(plan.theme, th.sprite, [at[0], at[1] - 20], R * 1.5, 4 * P, ms, s);
    if (plan.theme2) this.converge(plan.theme2, 'star', [at[0], at[1] - 20], R * 1.3, 4 * P, ms, s);
    // 몸에서 피어오르는 불씨
    this.emit(plan.theme, 'ember', 'rise', at[0], at[1] - 10, 5 * P, s);
    if (plan.tier !== 'normal' && !plan.repeat) this.column(at[0], at[1] + 30, 150 * plan.ring, 26, th, ms + 120);
  }

  impact(plan, { at, targets }, full) {
    const th = this.theme(plan.theme), s = plan.scale, P = plan.particles * (full ? 1 : 0.4);
    const T = targets.slice(0, 6);
    T.forEach(([x, y], i) => {
      this.star(x, y - 18, (plan.tier === 'normal' ? 34 : 52) * (plan.move === 'el' ? 0.75 : 1), th);
      this.emit(plan.theme, th.sprite, 'burst', x, y - 18, 4 * P, s);
      if (i < 3) this.emit(plan.theme, 'pix', 'pop', x, y - 18, 6 * P, s);
      if (plan.theme2) this.emit(plan.theme2, 'star', 'burst', x, y - 24, 4 * P, s);
      if (full && plan.move !== 'el') this.ring(x, y + 26, 54 * plan.ring, th, { dur: 380, px: s });
    });
    if (!full) return;
    const k = T.length ? 1 : 0.5;
    this.shake(plan.move === 'ult' ? 180 : 130, plan.shake * k);
    this.flash(th, plan.flash);
    this.hitStop(plan.hitStop);
    if (plan.word && plan.move !== 'el') { const w = T[0] ?? at; this.word(w[0] - 10, w[1] - 150, plan.word, plan); }
  }

  release(plan, ctx) {
    const fn = this['r_' + plan.release] ?? this.r_slam;
    fn.call(this, plan, ctx, this.theme(plan.theme));
  }

  // ---------- 발동 모양(속성마다) ----------
  r_slam(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    const x = targets[0]?.[0] ?? at[0] + 120, y = targets[0]?.[1] ?? at[1];
    this.ring(x, y + 26, 110 * p.ring, th, { dur: 360, px: s });
    this.emit(p.theme, th.sprite, 'burst', x, y + 10, 8 * P, s);
  }
  r_quake(p, { at, targets, allies }, th) {
    const s = p.scale, P = p.particles;
    for (const [x, y] of targets.slice(0, 4)) { this.crack(at[0] + 30, at[1] + 30, x, y + 28, th); this.sc.time.delayedCall(p.travel - 60, () => this.emit(p.theme, 'rock', 'burst', x, y + 20, 3 * P, s)); }
    this.emit(p.theme, 'pix', 'burst', at[0] + 20, at[1] + 26, 10 * P, s);
    if (p.aura) { const ga = this.theme(p.aura); for (const [x, y] of (allies ?? []).slice(0, 6)) { this.dome(x, y - 20, 44, ga, 760); this.emit(p.aura, 'shard', 'rise', x, y, 3 * P, s); } }
  }
  r_stampede(p, { at, targets }, th) {
    const s = p.scale, P = p.particles, ys = (targets.length ? targets : [at]).slice(0, 3).map((t) => t[1]);
    ys.forEach((y, i) => {
      this.draw(at[0], y + 18, (g) => { g.fillStyle(th.o, 1).fillRect(-6, -8, 120, 16); g.fillStyle(th.c[1], 1).fillRect(0, -4, 108, 8); g.fillStyle(th.c[0], 1).fillRect(60, -2, 48, 4); }, { x: 1150, alpha: { from: 1, to: 0 }, duration: p.travel + 160, delay: i * 50, ease: 'Quad.in' });
      this.sc.time.delayedCall(i * 50 + 60, () => this.emit(p.theme, 'rock', 'burst', at[0] + 60, y + 26, 4 * P, s));
    });
    for (let i = 0; i < 4; i++) this.sc.time.delayedCall(i * 70, () => this.emit(p.theme, 'pix', 'rise', at[0] + 40 + i * 70, at[1] + 30, 4 * P, s));
  }
  r_guardHeal(p, { at, allies }, th) {
    const s = p.scale, P = p.particles, A = (allies?.length ? allies : [at]).slice(0, p.count);
    for (const [x, y] of A) {
      this.ring(x, y + 28, 60 * p.ring, th, { dur: 520, px: s });
      this.dome(x, y - 24, 46, th, 780);
      this.emit(p.theme, 'flame', 'rise', x, y + 10, 6 * P, s);
      this.emit('grass', 'cross', 'rise', x, y - 20, 3 * P, s);
    }
  }
  r_swarm(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    this.home(p.theme, 'pix', at, targets.length ? targets : [[at[0] + 200, at[1]]], p.count * P, p.travel, s, 26, 24);
    this.home(p.theme, 'ember', at, targets.length ? targets : [[at[0] + 200, at[1]]], 6 * P, p.travel + 40, s, 40, 20);
  }
  r_rain(p, { at, targets, allies }, th) {
    const s = p.scale, P = p.particles, n = Math.max(1, Math.round(p.count * P / 6));
    for (let i = 0; i < 6; i++) this.sc.time.delayedCall(i * 50, () => { for (let j = 0; j < n; j++) this.emit(p.theme, 'drop', 'fall', Phaser.Math.Between(260, 1140), Phaser.Math.Between(60, 160), 1, s); });
    for (const [x, y] of [...targets, ...(allies ?? [])].slice(0, 8)) this.ring(x, y + 26, 44 * p.ring, th, { dur: 460, delay: p.travel - 80, px: s });
    for (const [x, y] of (allies ?? []).slice(0, 6)) this.sc.time.delayedCall(p.travel - 40, () => this.emit('grass', 'cross', 'rise', x, y - 20, 2 * P, s));
    void at;
  }
  r_roar(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    for (let i = 0; i < 3; i++) this.ring(at[0] + 20, at[1] - 10, 150 * p.ring, th, { flat: 0.75, dur: 420, delay: i * 90, px: s, depth: DEPTH });
    if (p.theme === 'thunder') for (const [x, y] of targets.slice(0, p.count)) this.bolt(at[0] + 30, at[1] - 30, x, y - 20, th, s);
    else this.home(p.theme, th.sprite, at, targets, 8 * P, p.travel, s, 20, 18);
  }
  r_wisps(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    // 꼬리 아홉 개처럼 둘레에 떠올랐다가 표적으로
    this.home(p.theme, 'wisp', [at[0], at[1] - 50], targets.length ? targets : [[at[0] + 220, at[1]]], p.count * Math.min(1.4, P), p.travel, s + 1, 60, 12);
    this.home(p.theme, 'pix', [at[0], at[1] - 50], targets.length ? targets : [[at[0] + 220, at[1]]], 10 * P, p.travel + 60, s, 70, 26);
  }
  r_moon(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    const img = this.sc.add.image(at[0] - 10, at[1] - 90, this.tex(p.theme, 'crescent')).setDepth(DEPTH).setScale(s * 4).setAlpha(0);
    this.sc.tweens.add({ targets: img, alpha: 1, y: at[1] - 150, duration: p.travel * 0.6, ease: 'Back.out', onComplete: () => this.sc.tweens.add({ targets: img, alpha: 0, duration: 260, onComplete: () => img.destroy() }) });
    this.emit(p.theme, 'star', 'burst', at[0], at[1] - 120, 8 * P, s);
    this.home(p.theme, 'star', [at[0], at[1] - 140], targets, p.count * P, p.travel, s, 24, 16);
  }
  r_dawn(p, { at, allies }, th) {
    const s = p.scale, P = p.particles;
    this.draw(at[0], at[1] - 40, (g) => {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const a1 = a - 0.08, a2 = a + 0.08, R = 260;
        g.fillStyle(th.o, 0.5).fillTriangle(0, 0, Math.cos(a1 - 0.03) * R, Math.sin(a1 - 0.03) * R, Math.cos(a2 + 0.03) * R, Math.sin(a2 + 0.03) * R);
        g.fillStyle(th.c[1], 0.55).fillTriangle(0, 0, Math.cos(a1) * R, Math.sin(a1) * R, Math.cos(a2) * R, Math.sin(a2) * R); }
      g.fillStyle(th.o, 1).fillCircle(0, 0, 30); g.fillStyle(th.c[1], 1).fillCircle(0, 0, 25); g.fillStyle(th.c[0], 1).fillCircle(0, 0, 14);
    }, { scale: { from: 0.2, to: 1 }, angle: { from: 0, to: 20 }, alpha: { from: 1, to: 0 }, duration: p.travel + 280, ease: 'Cubic.out' });
    this.emit(p.theme, 'feather', 'rise', at[0], at[1] - 30, 6 * P, s);
    for (const [x, y] of (allies ?? []).slice(0, 6)) this.emit(p.theme, 'cross', 'rise', x, y - 20, 2 * P, s);
  }
  r_feathers(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    this.home(p.theme, 'feather', [at[0], at[1] - 40], targets.length ? targets : [[at[0] + 240, at[1]]], p.count * P, p.travel, s + 1, 50, 30);
    this.emit(p.theme, 'feather', 'burst', at[0], at[1] - 40, 4 * P, s);
  }
  r_howl(p, { at, targets }, th) {
    const s = p.scale;
    for (let i = 0; i < 3; i++) this.ring(at[0] + 20, at[1] - 40, 120 * p.ring, th, { flat: 0.8, dur: 380, delay: i * 70, px: s, depth: DEPTH });
    for (const [x, y] of targets.slice(0, p.count)) this.sc.time.delayedCall(p.travel - 40, () => this.claws(x, y - 30, th));
  }
  r_skybolt(p, { at, targets }, th) {
    const s = p.scale, P = p.particles, T = targets.length ? targets.slice(0, p.count) : [[at[0] + 200, at[1]]];
    T.forEach(([x, y], i) => this.sc.time.delayedCall(i * 40, () => { this.bolt(x + Phaser.Math.Between(-30, 30), 40, x, y - 10, th, s + 1); this.emit(p.theme, 'shard', 'burst', x, y, 5 * P, s); }));
  }
  r_wall(p, { at, allies, targets }, th) {
    const s = p.scale, P = p.particles, A = allies?.length ? allies : [at];
    const wx = Math.max(...A.map((a) => a[0])) + 60, ys = A.map((a) => a[1]), y0 = Math.min(...ys) - 70, y1 = Math.max(...ys) + 40;
    this.draw(wx, y0, (g) => {
      const h = y1 - y0; for (let yy = 0; yy < h; yy += 22) { const off = (yy / 22) % 2 ? 6 : 0; g.fillStyle(th.o, 1).fillRect(-14 + off, yy - 2, 28, 22); g.fillStyle(th.c[1], 1).fillRect(-10 + off, yy + 1, 20, 16); g.fillStyle(th.c[0], 1).fillRect(-6 + off, yy + 3, 6, 6); }
    }, { scaleY: { from: 0.1, to: 1 }, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Back.out' });
    this.draw(wx + 20, (y0 + y1) / 2, (g) => { g.fillStyle(th.o, 1).fillRect(-6, -(y1 - y0) / 2, 18, y1 - y0); g.fillStyle(th.c[1], 0.9).fillRect(-2, -(y1 - y0) / 2 + 4, 10, y1 - y0 - 8); }, { x: (targets[0]?.[0] ?? wx + 300), alpha: { from: 1, to: 0 }, duration: p.travel + 120, ease: 'Quad.in' });
    this.emit(p.theme, 'shard', 'rise', wx, (y0 + y1) / 2, 8 * P, s);
  }
  r_notes(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    for (let i = 0; i < 3; i++) this.ring(at[0], at[1] - 30, 130 * p.ring, i % 2 ? this.theme('light') : th, { flat: 0.7, dur: 520, delay: i * 110, px: s, depth: DEPTH });
    this.emit(p.theme, 'note', 'rise', at[0], at[1] - 40, p.count * P * 0.5, s);
    this.home(p.theme, 'note', [at[0], at[1] - 50], targets, 6 * P, p.travel, s, 30, 20);
  }
  r_clones(p, { at, targets }, th) {
    const s = p.scale, P = p.particles;
    // 분신 셋: 연기 펑 + 바람 회오리 + 여의봉 휘두름 자국
    [-50, 0, 50].forEach((dx, i) => this.sc.time.delayedCall(i * 60, () => { this.emit(p.theme, 'pix', 'pop', at[0] + dx, at[1] - 30, 6 * P, s); this.ring(at[0] + dx, at[1] + 26, 40, th, { dur: 300, px: s }); }));
    this.home(p.theme, 'leaf', at, targets, 10 * P, p.travel, s, 40, 20);
    for (const [x, y] of targets.slice(0, p.count)) this.sc.time.delayedCall(p.travel - 40, () => this.claws(x, y - 30, th, -60, 90));
  }
  r_pillar(p, { targets }, th) {
    const s = p.scale, P = p.particles;
    for (const [x, y] of targets.slice(0, 3)) { this.column(x, y + 30, 170, 34, th, 460); this.emit(p.theme, 'flame', 'rise', x, y + 10, 8 * P, s); }
  }
}

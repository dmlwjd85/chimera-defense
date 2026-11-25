import { dotOn, dotify } from './dotfx.js';
import { DOT_PX } from '../rig/dotData.js';

/** pixelfx 시트 이름(assets/fx/pfx/<이름>.png + .json)과 기준점(시트 JSON의 pivot ÷ 칸 크기). */
export const PFX = ['hit-spark', 'blunt-hit', 'crit-hit', 'claw-swipe', 'poof'];
const PFX_PIVOT = { 'hit-spark': [0.43, 0.56], 'blunt-hit': [0.5, 0.53], 'crit-hit': [0.39, 0.51], 'claw-swipe': [0.53, 0.68], poof: [0.5, 0.6] };   // 처음 8장의 그림 한가운데
// Battle effects: hit sparks, projectiles, area rings, status particles, evolution beams, kills, banners, ambient weather.
// Uses textures fx-* (tools/gen_bg.py). Every call is cheap: emitters are created once and `explode`d.
import Phaser from 'phaser';
import { FONT } from '../text.js';

const PRESETS = {
  spark: { tex: 'fx-spark', speed: { min: 90, max: 220 }, lifespan: 260, scale: { start: 0.6, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: 'ADD' },
  flare: { tex: 'fx-flare', speed: 0, lifespan: 160, scale: { start: 0.4, end: 0.9 }, alpha: { start: 0.6, end: 0 }, blendMode: 'ADD' },
  bigFlare: { tex: 'fx-flare', speed: 0, lifespan: 380, scale: { start: 0.8, end: 2.4 }, alpha: { start: 0.55, end: 0 }, blendMode: 'ADD' },
  star: { tex: 'fx-star', speed: { min: 80, max: 200 }, lifespan: 420, scale: { start: 0.55, end: 0.1 }, rotate: { min: 0, max: 360 }, gravityY: 300 },
  puff: { tex: 'fx-puff', speed: { min: 20, max: 60 }, lifespan: 450, scale: { start: 0.4, end: 0.9 }, alpha: { start: 0.45, end: 0 } },
  shard: { tex: 'fx-shard', speed: { min: 150, max: 380 }, lifespan: 650, scale: { start: 1, end: 0.3 }, rotate: { min: 0, max: 360 }, gravityY: 500 },
  coin: { tex: 'fx-coin', speed: { min: 80, max: 180 }, angle: { min: 230, max: 310 }, lifespan: 600, scale: { start: 0.9, end: 0.6 }, gravityY: 500 },
  heart: { tex: 'fx-heart', speed: { min: 30, max: 90 }, angle: { min: 240, max: 300 }, lifespan: 900, scale: { start: 0.8, end: 0.3 }, alpha: { start: 1, end: 0 } },
  bubble: { tex: 'fx-bubble', speed: { min: 20, max: 50 }, angle: { min: 250, max: 290 }, lifespan: 800, scale: { start: 0.4, end: 0.8 }, alpha: { start: 0.9, end: 0 }, tint: 0x7CFC9A },
  snow: { tex: 'fx-snow', speed: { min: 20, max: 60 }, lifespan: 700, scale: { start: 0.6, end: 0.1 }, rotate: { min: 0, max: 360 }, tint: 0xbfe6ff },
  note: { tex: 'fx-note', speed: { min: 30, max: 70 }, angle: { min: 240, max: 300 }, lifespan: 900, scale: { start: 0.8, end: 0.4 }, alpha: { start: 1, end: 0 } },
  rise: { tex: 'fx-spark', speedY: { min: -160, max: -60 }, speedX: { min: -30, max: 30 }, lifespan: 900, scale: { start: 0.7, end: 0 }, blendMode: 'ADD' },
  orb: { tex: 'fx-orb', speedY: { min: 80, max: 160 }, lifespan: 400, scale: { start: 0.9, end: 0.4 }, tint: 0xc5e1a5 },
  leaf: { tex: 'fx-leaf', speed: { min: 60, max: 160 }, lifespan: 600, scale: { start: 0.6, end: 0.2 }, rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 } },
  confetti: { tex: 'fx-leaf', speed: { min: 200, max: 500 }, angle: { min: 220, max: 320 }, lifespan: 2200, scale: { start: 0.9, end: 0.6 }, rotate: { min: 0, max: 360 }, gravityY: 400 },
};
const TINT = { gold: 0xffd84d, purple: 0xb388ff, green: 0x7CFC9A, red: 0xff5252, blue: 0x7fd1ff, white: 0xffffff, orange: 0xffa040, pink: 0xff8fb1 };

const PROJECTILE = {
  crow: ['fx-stone', 0xffffff, 0.9], eagle: ['fx-feather', 0xffffff, 1.1], fox: ['fx-orb', 0x7fffd4, 0.9], rooster: ['fx-note', 0xffe066, 1.1],
  grasshopper: ['fx-note', 0x9cff6b, 1.1], frog: ['fx-bubble', 0x9fe4ff, 1.1], cheese_thief: ['fx-stone', 0xffe9a8, 1], thunderbird: ['fx-bolt', 0xfff6a0, 0.6],
  phoenix: ['fx-orb', 0xff9800, 1.2], monkey: ['fx-orb', 0xffb347, 0.9], bullfrog: ['fx-bubble', 0x9fe4ff, 1.4],
};
/** How each kind of animal lands its blows. */
export const STRIKE = {
  ant: 'bite', dog: 'bite', bear: 'paw', bear_tiger: 'paw', bison: 'horn', bighorn: 'horn', tiger: 'claw', rabbit: 'kick', jackalope: 'kick', wolf: 'bite', wolf_in_sheep: 'bite',
  crow: 'drop', cheese_thief: 'drop', eagle: 'dive', thunderbird: 'dive', phoenix: 'dive', fox: 'foxfire', frog: 'bubble', bullfrog: 'bubble', rooster: 'song', grasshopper: 'song',
};

export class FX {
  /** 도트 이펙트 한 번 재생(pixelfx 시트). 도트 1칸 = 화면 2px(DOT_PX)로 캐릭터와 같은 크기. 없으면 false. */
  pfx(name, x, y, opts = {}) {
    const sc = this.scene, key = 'pfx-' + name;
    if (!sc.textures.exists(key)) return false;
    sc.pfxLive ??= 0;
    if (sc.pfxLive > (opts.cap ?? 16)) return true;   // 너무 많으면 건너뜀(가림·성능)
    if (!sc.anims.exists(key)) {
      const names = sc.textures.get(key).getFrameNames().filter((f) => f !== '__BASE').sort((a, b) => +a.split(' ').pop() - +b.split(' ').pop());
      sc.anims.create({ key, frames: names.map((frame) => ({ key, frame })), frameRate: 30 });
    }
    const piv = PFX_PIVOT[name] ?? [0.5, 0.5];
    const sp = sc.add.sprite(x, y, key).setOrigin(piv[0], piv[1]).setScale((opts.scale ?? 1) * DOT_PX).setDepth(opts.depth ?? 1600);
    if (opts.flip) sp.setFlipX(true);
    if (opts.tint != null) sp.setTint(opts.tint);
    if (opts.alpha != null) sp.setAlpha(opts.alpha);
    sc.pfxLive++;
    sp.play({ key, frameRate: opts.fps ?? 30 });
    sp.once('animationcomplete', () => { sc.pfxLive--; sp.destroy(); });
    return true;
  }

  constructor(scene) {
    this.scene = scene;
    this.emitters = {};
    this.ok = scene.textures.exists('fx-spark');
  }

  em(name, depth = 1600) {
    if (this.emitters[name]) return this.emitters[name];
    const p = PRESETS[name];
    const e = this.scene.add.particles(0, 0, p.tex, { ...p, tex: undefined, emitting: false });
    e.setDepth(depth);
    if (dotOn()) dotify(this.scene, e, false, true);
    return (this.emitters[name] = e);
  }

  burst(name, x, y, n, tint) {
    if (!this.ok) return;
    // 간소화(2026-11-25): 같은 자리에서 같은 입자가 연달아 터지면 건너뜀(동물이 가려지지 않게)
    const now = this.scene.time.now; this.recent ??= [];
    this.recent = this.recent.filter((r) => now - r.t < 90);
    if (n > 1 && this.recent.some((r) => r.name === name && Math.abs(r.x - x) < 40 && Math.abs(r.y - y) < 40)) return;
    this.recent.push({ name, x, y, t: now });
    const e = this.em(name);
    if (tint !== undefined) e.setParticleTint(tint); else if (!PRESETS[name].tint) e.setParticleTint(0xffffff);
    const live = this.scene.state?.enemies?.length ?? 0;
    const k = live > 14 ? 0.35 : live > 7 ? 0.5 : 0.65;
    e.explode(Math.max(1, Math.round(n * k)), x, y);
  }

  hit(x, y, color = 'white', big = false) {
    const t = TINT[color] ?? color, tint = t === 0xffffff || color === 'white' ? null : t;
    if (this.pfx(big ? 'blunt-hit' : 'hit-spark', x, y, { tint, flip: Math.random() < 0.5, fps: big ? 40 : 30 })) return;
    this.burst('flare', x, y, 1, TINT[color] ?? color);
    this.burst('spark', x, y, big ? 10 : 5, TINT[color] ?? color);
  }

  slash(x, y, color = 0xffffff) {
    if (!this.ok) return;
    const s = this.scene.add.image(x, y, 'fx-slash').setDepth(1600).setBlendMode('ADD').setTint(color).setScale(0.35).setAngle(Phaser.Math.Between(-30, 20));
    this.scene.tweens.add({ targets: s, scale: 0.6, alpha: 0, duration: 200, ease: 'Cubic.out', onComplete: () => s.destroy() });
  }

  ring(x, y, color = 'white', size = 1, dur = 380) {
    if (!this.ok) return;
    const r = this.scene.add.image(x, y, 'fx-ring').setDepth(1590).setBlendMode('ADD').setTint(TINT[color] ?? color).setScale(0.1).setAlpha(0.95);
    this.scene.tweens.add({ targets: r, scaleX: size, scaleY: size * 0.55, alpha: 0, duration: dur, ease: 'Cubic.out', onComplete: () => r.destroy() });
  }

  /** Arc a projectile from a ranged unit to its target, then pop. */
  projectile(species, x1, y1, x2, y2, aoe) {
    if (!this.ok) return;
    const [tex, tint, sc] = PROJECTILE[species] ?? ['fx-orb', 0xffffff, 0.8];
    const p = this.scene.add.image(x1, y1 - 20, tex).setDepth(1595).setTint(tint).setScale(sc);
    if (tex === 'fx-orb' || tex === 'fx-bolt') p.setBlendMode('ADD');
    const trail = this.em('rise');
    const dist = Math.abs(x2 - x1);
    const t = { k: 0 };
    this.scene.tweens.add({
      targets: t, k: 1, duration: Math.min(260, 90 + dist * 0.5), ease: 'Sine.in',
      onUpdate: () => {
        const x = x1 + (x2 - x1) * t.k, y = y1 - 20 + (y2 - y1 + 20) * t.k - Math.sin(t.k * Math.PI) * Math.min(70, dist * 0.25);
        p.setPosition(x, y); p.rotation += tex === 'fx-note' ? 0.08 : 0.3;
        if (Math.random() < 0.6) { trail.setParticleTint(tint); trail.explode(1, x, y); }
        if (Math.random() < 0.5) { const gh = this.scene.add.image(x, y, tex).setDepth(1594).setTint(tint).setScale(sc * 0.9).setAlpha(0.45).setBlendMode('ADD'); this.scene.tweens.add({ targets: gh, alpha: 0, scale: sc * 0.4, duration: 180, onComplete: () => gh.destroy() }); }
      },
      onComplete: () => {
        p.destroy();
        this.hit(x2, y2, tint, aoe);
        if (tex === 'fx-bubble') { this.burst('bubble', x2, y2, 8, 0x9fe4ff); this.ring(x2, y2, 0x9fe4ff, 0.7, 260); }
        if (species === 'fox') this.burst('rise', x2, y2, 8, 0x7fffd4);
        if (tex === 'fx-note') this.burst('note', x2, y2, 4, tint);
        if (aoe) { this.ring(x2, y2, tint, 1.2); this.groundAoe(x2, y2 + 26, 70, tint); }
      },
    });
  }

  status(e, x, y) {
    const now = this.scene.time.now;
    if ((e.fxAt ?? 0) > now) return;
    e.fxAt = now + 280;
    if (e.poisonLeft > 0) this.burst('bubble', x + Phaser.Math.Between(-8, 8), y - 8, 1);
    if (e.slowLeft > 0) this.burst('snow', x, y - 10, 1);
    if (e.stunLeft > 0 || e.holdLeft > 0) this.burst('star', x, y - 26, 1, 0xffe066);
    if (e.confuseLeft > 0) this.burst('note', x, y - 26, 1, 0xc39bd3);
    if (e.burnLeft > 0) this.burst('rise', x + Phaser.Math.Between(-8, 8), y, 2, 0xff7a1a);
    if (e.curseLeft > 0) this.burst('star', x, y - 30, 1, 0xb388ff);
  }

  kill(x, y, gold, boss) {
    if (!this.pfx('poof', x, y, { fps: 45, scale: boss ? 1.5 : 1, cap: 22 })) {
      this.burst('puff', x, y, boss ? 14 : 5, 0xdddddd);
      this.burst('spark', x, y, boss ? 24 : 6, 0xffe066);
    }
    if (gold > 0 && this.ok) {
      for (let i = 0; i < Math.min(3, Math.ceil(gold / 3)); i++) {
        const c = this.scene.add.image(x, y, 'fx-coin').setDepth(1700).setScale(0.7);
        this.scene.tweens.add({ targets: c, x: { from: x, to: 160 }, y: { from: y - 20, to: 26 }, scale: 0.4, duration: 520 + i * 70, ease: 'Cubic.in', delay: i * 40, onComplete: () => c.destroy() });
      }
    }
    if (boss) { this.burst('bigFlare', x, y, 1, 0xffe066); this.ring(x, y, 'gold', 3, 700); }
  }

  /** Column of light for evolution; gold for spirit. */
  evolve(x, y, spirit) {
    if (!this.ok) return;
    const col = spirit ? 0xffd84d : 0x9cff6b;
    const beam = this.scene.add.image(x, y - 80, 'fx-beam').setDepth(1580).setBlendMode('ADD').setTint(col).setScale(1.2, 0.1).setAlpha(0.95);
    this.scene.tweens.add({ targets: beam, scaleY: 5, scaleX: 0.5, alpha: 0, duration: 750, ease: 'Cubic.out', onComplete: () => beam.destroy() });
    this.ring(x, y + 20, col, 1.6, 600);
    this.burst('rise', x, y, spirit ? 30 : 16, col);
    this.burst('star', x, y - 20, spirit ? 14 : 6, col);
    if (spirit) this.burst('bigFlare', x, y - 20, 1, col);
  }

  chimera(x, y) {
    if (!this.ok) return;
    for (let i = 0; i < 3; i++) {
      const r = this.scene.add.image(x, y, 'fx-ring').setDepth(1590).setBlendMode('ADD').setTint(0xb388ff).setScale(1.6 - i * 0.3).setAlpha(0);
      this.scene.tweens.add({ targets: r, scale: 0.05, alpha: { from: 0.9, to: 0.2 }, angle: 180, duration: 420, delay: i * 90, ease: 'Cubic.in', onComplete: () => r.destroy() });
    }
    this.scene.time.delayedCall(480, () => { this.burst('bigFlare', x, y, 1, 0xd2b4ff); this.burst('shard', x, y, 18, 0xd2b4ff); this.burst('star', x, y, 10, 0xd2b4ff); });
  }

  weak(x, y) { this.burst('puff', x, y, 10, 0x9a9a9a); this.burst('note', x, y - 20, 4, 0xbbbbbb); }

  skill(x, y, color = 'purple') { this.ring(x, y + 18, color, 1.4, 500); this.burst('rise', x, y, 12, TINT[color] ?? color); }

  down(x, y) { this.burst('puff', x, y + 10, 6, 0xcccccc); this.burst('star', x, y - 20, 5, 0xffe066); }

  respawn(x, y) { this.burst('rise', x, y + 20, 14, 0x9cff6b); this.ring(x, y + 24, 'green', 1, 400); }

  heal(x, y) { this.burst('rise', x, y, 6, 0x58d68d); }

  hearts(x1, y1, x2, y2) { this.burst('heart', x1, y1 - 30, 4); this.burst('heart', x2, y2 - 30, 4); }

  clash(x, y) { this.burst('flare', x, y - 40, 1, 0xff9f43); this.burst('spark', x, y - 40, 6, 0xff9f43); }

  shieldBreak(x, y) { this.burst('shard', x, y, 26, 0xd2b4ff); this.burst('bigFlare', x, y, 1, 0xb388ff); this.scene.cameras.main.shake(180, 0.006); }

  leak(x, y) { this.burst('flare', x, y, 1, 0xff3030); this.burst('spark', x, y, 10, 0xff5252); }

  confetti(w = 1280) {
    if (!this.ok) return;
    const e = this.em('confetti', 2500);
    for (const c of [0xffd84d, 0xff8fb1, 0x7fd1ff, 0x9cff6b, 0xffffff]) { e.setParticleTint(c); e.explode(25, w / 2 + Phaser.Math.Between(-300, 300), 720); }
  }

  // ---------- skill effects (one per skill kind) ----------
  line(x1, y1, x2, y2, color, width = 8, dur = 220) {
    const g = this.scene.add.graphics().setDepth(1595);
    const t = { k: 0 };
    this.scene.tweens.add({ targets: t, k: 1, duration: dur, yoyo: true, onUpdate: () => {
      g.clear(); g.lineStyle(width + 4, 0x2b1d16, 1).lineBetween(x1, y1, x1 + (x2 - x1) * t.k, y1 + (y2 - y1) * t.k);
      g.lineStyle(width, color, 1).lineBetween(x1, y1, x1 + (x2 - x1) * t.k, y1 + (y2 - y1) * t.k);
    }, onComplete: () => g.destroy() });
  }

  claws(x, y, color = 0xffa040) {
    if (this.pfx('claw-swipe', x, y, { fps: 40 })) return;
    if (!this.ok) return;
    for (let i = 0; i < 3; i++) {
      const s = this.scene.add.image(x - 14 + i * 14, y - 10 + i * 6, 'fx-slash').setDepth(1600).setBlendMode('ADD').setTint(color).setScale(0.3).setAngle(-55);
      this.scene.tweens.add({ targets: s, scale: 0.5, alpha: 0, duration: 260, delay: i * 50, onComplete: () => s.destroy() });
    }
    this.hit(x, y, color, true);
  }

  shockwave(x, y, color = 0xff9f43, n = 3, size = 2.4) {
    for (let i = 0; i < n; i++) this.scene.time.delayedCall(i * 110, () => this.ring(x, y, color, size, 520));
  }

  bubbleShield(x, y, color = 0x7fd1ff) {
    if (!this.ok) return null;
    const b = this.scene.add.circle(x, y, 42, color, 0.18).setStrokeStyle(3, color, 0.9).setDepth(1500);
    this.scene.tweens.add({ targets: b, scale: { from: 0.94, to: 1.06 }, yoyo: true, repeat: -1, duration: 500 });
    return b;
  }

  pillar(x, y, color) {
    if (!this.ok) return;
    const beam = this.scene.add.image(x, y - 60, 'fx-beam').setDepth(1580).setBlendMode('ADD').setTint(color).setScale(0.8, 0.1);
    this.scene.tweens.add({ targets: beam, scaleY: 3.5, alpha: 0, duration: 600, ease: 'Cubic.out', onComplete: () => beam.destroy() });
  }

  stampede(y) {
    for (let k = 0; k < 10; k++) this.scene.time.delayedCall(k * 45, () => { const x = 130 + k * 110; this.burst('puff', x, y + 20, 4, 0xc9a26a); this.burst('spark', x, y, 3, 0xffe066); });
  }

  /** Three tearing claw marks raked across the target. */
  scratch(x, y, color = 0xffffff, dir = 1) {
    const sc = this.scene;
    for (let i = 0; i < 3; i++) {
      const g = sc.add.graphics().setDepth(1606);
      const ox = (i - 1) * 13 * dir, len = 46 - Math.abs(i - 1) * 6;
      const x1 = x + ox - dir * len * 0.4, y1 = y - len * 0.55, x2 = x + ox + dir * len * 0.4, y2 = y + len * 0.45;
      const t = { k: 0 };
      sc.tweens.add({ targets: t, k: 1, duration: 90, delay: i * 35, onUpdate: () => {
        g.clear();
        const ex = x1 + (x2 - x1) * t.k, ey = y1 + (y2 - y1) * t.k;
        g.lineStyle(7, 0xff5a3c, 0.35).lineBetween(x1, y1, ex, ey);
        g.lineStyle(4, color, 1).lineBetween(x1 + (ex - x1) * 0.15, y1 + (ey - y1) * 0.15, ex, ey);
        g.lineStyle(1.5, 0xffffff, 1).lineBetween(x1 + (ex - x1) * 0.3, y1 + (ey - y1) * 0.3, ex - (ex - x1) * 0.1, ey - (ey - y1) * 0.1);
      }, onComplete: () => sc.tweens.add({ targets: g, alpha: 0, duration: 260, delay: 80, onComplete: () => g.destroy() }) });
    }
    this.burst('spark', x, y, 6, 0xffd0a0);
  }

  /** Jaws snapping shut. */
  bite(x, y, color = 0xffffff) {
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(1606);
    const t = { k: 0 };
    sc.tweens.add({ targets: t, k: 1, duration: 130, ease: 'Cubic.in', onUpdate: () => {
      g.clear();
      const gap = 26 * (1 - t.k) + 3;
      for (const sgn of [-1, 1]) {
        g.lineStyle(5, color, 0.95); g.beginPath(); g.arc(x, y + sgn * gap, 24, sgn < 0 ? 0.25 : Math.PI + 0.25, sgn < 0 ? Math.PI - 0.25 : Math.PI * 2 - 0.25, false); g.strokePath();
        for (let k = -2; k <= 2; k++) g.fillStyle(0xffffff, 1).fillTriangle(x + k * 9 - 3, y + sgn * (gap - 2), x + k * 9 + 3, y + sgn * (gap - 2), x + k * 9, y + sgn * (gap - 11));
      }
    }, onComplete: () => { this.impact(x, y, 0xff8a65, 0.7); sc.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() }); } });
  }

  /** Heavy paw slamming down: a paw print stamp, dust and a short quake. */
  paw(x, y, color = 0xffe0b0) {
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(1606).setPosition(x, y - 70).setScale(1.4).setAlpha(0.9);
    g.fillStyle(0x3a2412, 0.85).fillEllipse(0, 8, 34, 26);
    for (const [dx, dy] of [[-15, -12], [-5, -18], [6, -18], [16, -12]]) g.fillEllipse(dx, dy, 11, 13);
    g.lineStyle(2.5, color, 1).strokeEllipse(0, 8, 34, 26);
    sc.tweens.add({ targets: g, y, scale: 1, duration: 110, ease: 'Quad.in', onComplete: () => {
      this.groundAoe(x, y + 26, 60, 0xd9a35a, { shake: false, dur: 360 });
      this.impact(x, y - 4, 0xffb35c, 1.1);
      this.burst('puff', x, y + 20, 6, 0xc9a26a);
      sc.cameras.main.shake(90, 0.004);
      sc.tweens.add({ targets: g, alpha: 0, duration: 260, delay: 60, onComplete: () => g.destroy() });
    } });
  }

  /** Horn / hoof ram: a horizontal streak that ends in a burst and pushed dust. */
  horn(x, y, dir = 1) {
    const sc = this.scene;
    const streak = sc.add.rectangle(x - dir * 60, y, 70, 10, 0xffffff, 0.85).setDepth(1605).setBlendMode('ADD');
    sc.tweens.add({ targets: streak, x: x - dir * 8, scaleX: 0.2, duration: 100, ease: 'Quad.in', onComplete: () => {
      streak.destroy();
      this.impact(x, y, 0xffd08a, 1.2);
      this.ring(x, y + 8, 0xffffff, 0.9, 260);
      for (let i = 0; i < 4; i++) this.burst('puff', x + dir * (10 + i * 12), y + 22, 1, 0xd9c49a);
    } });
  }

  /** Quick double kick. */
  kick(x, y, dir = 1) {
    this.impact(x - dir * 4, y + 6, 0xffffff, 0.6);
    this.scene.time.delayedCall(80, () => { this.impact(x + dir * 6, y - 6, 0xffe066, 0.8); this.burst('star', x, y - 10, 3, 0xffe066); });
  }

  /** A stone or loot dropped straight from the sky onto the target. */
  drop(x, y, tex = 'fx-stone', tint = 0xffffff) {
    const sc = this.scene;
    const p = sc.add.image(x + Phaser.Math.Between(-10, 10), y - 220, tex).setDepth(1595).setTint(tint).setScale(1.1);
    const sh = sc.add.ellipse(x, y + 28, 10, 4, 0x000000, 0.35).setDepth(35);
    sc.tweens.add({ targets: sh, scaleX: 3, scaleY: 3, duration: 200 });
    sc.tweens.add({ targets: p, x, y, angle: 360, duration: 200, ease: 'Quad.in', onComplete: () => { p.destroy(); sh.destroy(); this.impact(x, y, 0xffe066, 0.9); this.burst('shard', x, y + 8, 6, 0x9e9e9e); this.burst('puff', x, y + 22, 3, 0xd9c49a); } });
  }

  /** Wing gust: curling wind arcs that blow across a spot. */
  gust(x, y, dir = 1, color = 0xe0f7ff, n = 5) {
    const sc = this.scene;
    for (let i = 0; i < n; i++) {
      const g = sc.add.graphics().setDepth(1604).setBlendMode('ADD').setPosition(x - dir * 50, y - 30 + i * 13);
      g.lineStyle(3, color, 0.9); g.beginPath(); g.arc(0, 0, 16 + (i % 3) * 5, dir > 0 ? -2.4 : 0.7, dir > 0 ? 0.7 : 3.8); g.strokePath();
      g.lineStyle(2, color, 0.6).lineBetween(-dir * 30, 6, dir * 4, 6);
      sc.tweens.add({ targets: g, x: x + dir * 40, alpha: 0, duration: 320, delay: i * 25, onComplete: () => g.destroy() });
    }
    this.burst('leaf', x, y, 5, 0xd8f5c8);
  }

  /** Melee swing: a thick crescent sweeping across the target, with speed lines. */
  meleeArc(x1, y1, x2, y2, color = 0xffffff, big = false) {
    const sc = this.scene;
    const dir = Math.sign(x2 - x1) || 1;
    const g = sc.add.graphics().setDepth(1605).setBlendMode('ADD');
    const R = big ? 58 : 44;
    const cx = x2 - dir * R * 0.55, cy = y2 - 4;
    const a0 = dir > 0 ? -2.2 : Math.PI + 2.2, a1 = dir > 0 ? 0.9 : Math.PI - 0.9;
    const t = { k: 0 };
    sc.tweens.add({
      targets: t, k: 1, duration: 170, ease: 'Cubic.out',
      onUpdate: () => {
        g.clear();
        const end = a0 + (a1 - a0) * t.k, start = a0 + (a1 - a0) * Math.max(0, t.k - 0.55);
        for (const [w, al, rr] of [[big ? 16 : 12, 0.35, R + 6], [big ? 9 : 7, 0.85, R], [3, 1, R - 7]]) {
          g.lineStyle(w * (1 - t.k * 0.4), color, al * (1 - Math.max(0, t.k - 0.6) * 2.5));
          g.beginPath(); g.arc(cx, cy, rr, Math.min(start, end), Math.max(start, end)); g.strokePath();
        }
      },
      onComplete: () => sc.tweens.add({ targets: g, alpha: 0, duration: 90, onComplete: () => g.destroy() }),
    });
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const ly = y2 - 18 + i * 12 + Phaser.Math.Between(-3, 3);
      const l = sc.add.rectangle(x2 - dir * 50, ly, 34, 2, 0xffffff, 0.8).setDepth(1604).setBlendMode('ADD');
      sc.tweens.add({ targets: l, x: x2 + dir * 18, scaleX: 0.2, alpha: 0, duration: 160, delay: i * 18, onComplete: () => l.destroy() });
    }
  }

  /** Impact star (cartoon "pow") on a heavy hit. */
  impact(x, y, color = 0xffe066, size = 1) {
    if (this.pfx('crit-hit', x, y, { scale: 0.75, fps: 40, alpha: 0.9 })) return;
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(1606);
    size *= 0.65;
    const pts = []; for (let i = 0; i < 16; i++) { const r = (i % 2 ? 9 : 22) * size; const a = i / 16 * Math.PI * 2 + 0.2; pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
    g.setAlpha(0.75);
    g.fillStyle(0xffffff, 1).fillPoints(pts, true);
    g.lineStyle(2.5, color, 1).strokePoints(pts, true, true);
    g.setPosition(x, y).setScale(0.3);
    sc.tweens.add({ targets: g, scale: 1.25, duration: 90, ease: 'Back.out', onComplete: () => sc.tweens.add({ targets: g, alpha: 0, scale: 1.5, duration: 140, onComplete: () => g.destroy() }) });
  }

  /** Area damage painted on the road plane: flash disc, expanding rim, radial cracks, rim dust. */
  groundAoe(x, y, r = 90, color = 0xffb35c, opts = {}) {
    const sc = this.scene;
    const flat = 0.34;
    const g = sc.add.graphics().setDepth(opts.depth ?? 30).setPosition(x, y);
    const t = { k: 0 };
    const cracks = Array.from({ length: 9 }, (_, i) => ({ a: i / 9 * Math.PI * 2 + Math.random() * 0.4, l: 0.55 + Math.random() * 0.4 }));
    sc.tweens.add({
      targets: t, k: 1, duration: opts.dur ?? 520, ease: 'Cubic.out',
      onUpdate: () => {
        const k = t.k, rr = r * (0.25 + 0.75 * k), fade = 1 - k;
        g.clear();
        g.fillStyle(color, 0.45 * fade).fillEllipse(0, 0, rr * 2, rr * 2 * flat);
        g.fillStyle(0xffffff, 0.45 * Math.max(0, 1 - k * 3)).fillEllipse(0, 0, rr * 1.2, rr * 1.2 * flat);
        g.lineStyle(5 * fade + 1, color, 0.95 * fade).strokeEllipse(0, 0, rr * 2, rr * 2 * flat);
        g.lineStyle(2, 0xffffff, 0.8 * fade).strokeEllipse(0, 0, rr * 1.7, rr * 1.7 * flat);
        g.lineStyle(2.5, 0x2a1a08, 0.55 * Math.min(1, fade * 1.6));
        for (const c of cracks) { const L = r * c.l * Math.min(1, k * 2.2); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(c.a) * L * 0.5, Math.sin(c.a) * L * 0.5 * flat + 2); g.lineTo(Math.cos(c.a + 0.15) * L, Math.sin(c.a + 0.15) * L * flat); g.strokePath(); }
      },
      onComplete: () => g.destroy(),
    });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.scene.time.delayedCall(60, () => this.burst('puff', x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85 * flat - 6, 1, opts.dust ?? 0xd9c49a)); }
    if (opts.shake !== false) sc.cameras.main.shake(140, 0.0035 * (r / 90));
  }

  /** Zigzag bolt between two points. */
  bolt(x1, y1, x2, y2, color = 0xfff6a0) {
    const g = this.scene.add.graphics().setDepth(1606).setBlendMode('ADD');
    const pts = [{ x: x1, y: y1 }];
    for (let i = 1; i < 7; i++) { const k = i / 7; pts.push({ x: x1 + (x2 - x1) * k + Phaser.Math.Between(-10, 10), y: y1 + (y2 - y1) * k + Phaser.Math.Between(-14, 14) }); }
    pts.push({ x: x2, y: y2 });
    g.lineStyle(7, color, 0.35).strokePoints(pts); g.lineStyle(3, 0xffffff, 1).strokePoints(pts);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** Elemental proc: each element has its own look. */
  element(el, [ux, uy], targets) {
    const sc = this.scene;
    const [tx, ty] = targets[0] ?? [ux, uy];
    switch (el) {
      case 'fire':
        this.burst('flare', tx, ty, 1, 0xff7a1a); this.burst('rise', tx, ty, 14, 0xff9a3c); this.burst('spark', tx, ty - 6, 8, 0xffd34d);
        for (let i = 0; i < 3; i++) sc.time.delayedCall(i * 70, () => this.burst('rise', tx + Phaser.Math.Between(-12, 12), ty + 8, 5, 0xff5a1a));
        break;
      case 'water':
        this.groundAoe(tx, ty + 26, 70, 0x4fc3ff, { shake: false, dust: 0xbfe6ff, dur: 420 });
        this.burst('bubble', tx, ty, 10, 0x8fd8ff); this.burst('orb', tx, ty - 20, 8, 0x7fd1ff);
        break;
      case 'wind': {
        const dir = Math.sign(tx - ux) || 1;
        for (let i = 0; i < 4; i++) {
          const g = sc.add.graphics().setDepth(1604).setBlendMode('ADD');
          const yy = ty - 24 + i * 14;
          g.lineStyle(3, 0xe0f7ff, 0.9); g.beginPath(); g.arc(tx - dir * 30, yy, 18 + i * 3, dir > 0 ? -2.6 : 0.5, dir > 0 ? 0.5 : 3.6); g.strokePath();
          sc.tweens.add({ targets: g, x: dir * 46, alpha: 0, duration: 300, delay: i * 30, onComplete: () => g.destroy() });
        }
        this.burst('leaf', tx, ty, 8, 0xd8f5c8);
        break;
      }
      case 'earth':
        this.groundAoe(tx, ty + 26, 90, 0xc08a4a, { shake: true, dust: 0xb89870, dur: 480 });
        this.burst('shard', tx, ty + 18, 10, 0xb08a5a); this.impact(tx, ty - 4, 0xc08a4a, 1);
        break;
      case 'thunder': {
        this.bolt(tx + Phaser.Math.Between(-20, 20), ty - 160, tx, ty, 0xfff6a0);
        for (let i = 1; i < targets.length; i++) this.bolt(targets[i - 1][0], targets[i - 1][1], targets[i][0], targets[i][1], 0xc8e6ff);
        targets.forEach(([x, y]) => { this.burst('flare', x, y, 1, 0xfff6a0); this.burst('spark', x, y, 6, 0xfff6a0); });
        sc.cameras.main.flash(60, 255, 250, 200);
        break;
      }
      case 'moon': {
        const m = sc.add.text(tx, ty - 46, '☾', { fontSize: '34px', color: '#d8c8ff' }).setOrigin(0.5).setDepth(1606).setScale(0.4);
        sc.tweens.add({ targets: m, scale: 1.1, angle: -20, duration: 200, ease: 'Back.out', onComplete: () => sc.tweens.add({ targets: m, alpha: 0, y: ty - 70, duration: 600, onComplete: () => m.destroy() }) });
        this.ring(tx, ty, 0xb388ff, 1.1); this.burst('star', tx, ty - 10, 5, 0xd8c8ff);
        break;
      }
      case 'grass': {
        const g = sc.add.graphics().setDepth(1603);
        const vines = Array.from({ length: 5 }, (_, i) => ({ a: -Math.PI / 2 + (i - 2) * 0.45, h: 30 + Math.random() * 20 }));
        const t = { k: 0 };
        sc.tweens.add({ targets: t, k: 1, duration: 260, onUpdate: () => { g.clear(); for (const v of vines) { g.lineStyle(4, 0x4caf50, 1); g.beginPath(); g.moveTo(tx + Math.cos(v.a) * 8, ty + 24); g.lineTo(tx + Math.cos(v.a) * 18 * t.k + Math.sin(t.k * 6) * 4, ty + 24 - v.h * t.k); g.strokePath(); g.fillStyle(0x8bc34a, 1).fillCircle(tx + Math.cos(v.a) * 18 * t.k, ty + 24 - v.h * t.k, 4); } }, onComplete: () => sc.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 300, onComplete: () => g.destroy() }) });
        this.burst('leaf', tx, ty + 10, 6, 0x9ccc65);
        break;
      }
      case 'light':
        this.burst('bigFlare', tx, ty - 10, 1, 0xfff1a8); this.pillar(tx, ty + 20, 0xfff1a8); this.burst('star', tx, ty - 20, 6, 0xfff1a8);
        break;
      default: break;
    }
  }

  /** 무협 RPG풍 기술 컷인: 화면을 가르는 띠, 속도선, 붓글씨 같은 기술 이름. */
  cutIn(name, color = 0xffe066, sub = '') {
    const sc = this.scene, now = sc.time.now;
    if (now - (sc.lastCutIn ?? -9999) < 3500) return false;
    sc.lastCutIn = now;
    const c = sc.add.container(0, 0).setDepth(1900);
    const band = sc.add.graphics();
    band.fillStyle(0x05080c, 0.82).fillPoints([{ x: -40, y: 150 }, { x: 1320, y: 110 }, { x: 1320, y: 230 }, { x: -40, y: 270 }], true);
    band.lineStyle(3, color, 1).lineBetween(-40, 150, 1320, 110).lineBetween(-40, 270, 1320, 230);
    c.add(band);
    for (let i = 0; i < 16; i++) {
      const l = sc.add.rectangle(Phaser.Math.Between(0, 1280), Phaser.Math.Between(140, 250), Phaser.Math.Between(80, 260), Phaser.Math.Between(1, 3), 0xffffff, 0.5).setAngle(-1.8);
      c.add(l); sc.tweens.add({ targets: l, x: l.x - 500, duration: 420, repeat: 1 });
    }
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = sc.add.text(1500, 186, name, { fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color: '#ffffff', stroke: hex, strokeThickness: 10 }).setOrigin(0.5).setAngle(-1.8);
    t.setShadow(4, 5, '#000000', 0, true, true);
    const s2 = sc.add.text(640, 232, sub, { fontFamily: FONT, fontSize: '17px', color: '#efe3c8', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setAngle(-1.8).setAlpha(0);
    c.add([t, s2]);
    c.setAlpha(0);
    sc.tweens.add({ targets: c, alpha: 1, duration: 80 });
    sc.tweens.add({ targets: t, x: 640, duration: 200, ease: 'Cubic.out', onComplete: () => { sc.cameras.main.shake(120, 0.004); sc.tweens.add({ targets: t, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.out' }); sc.tweens.add({ targets: s2, alpha: 1, duration: 150 }); } });
    sc.tweens.add({ targets: c, alpha: 0, x: -120, delay: 950, duration: 200, onComplete: () => c.destroy() });
    return true;
  }

  /** Big comic sound word that slams onto the screen (타격·속성). */
  sfxWord(x, y, text, color = '#ffe066', size = 24) {
    const sc = this.scene;
    const t = sc.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#2a1606', strokeThickness: 6 }).setOrigin(0.5).setDepth(1720).setAngle(Phaser.Math.Between(-14, 14)).setScale(1.8).setAlpha(0.2);
    t.setShadow(3, 3, '#000000', 0, true, true);
    sc.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 110, ease: 'Back.out' });
    sc.tweens.add({ targets: t, y: y - 18, alpha: 0, delay: 420, duration: 260, onComplete: () => t.destroy() });
  }

  /** Comic shout bubble with the skill name over the caster. */
  shout(x, y, text, color = 0xffe066, opts = {}) {
    const sc = this.scene;
    x = Math.max(90, Math.min(1190, x));   // 성문 안에서 외쳐도 말풍선은 화면 안에
    sc.shoutSlots ??= [];
    const now = sc.time.now;
    sc.shoutSlots = sc.shoutSlots.filter((s) => s.until > now);
    // 같은 말이 가까이서 연달아 나오면 한 번만, 쌓여도 두 줄까지만(화면을 덮지 않게)
    if (sc.shoutSlots.some((s) => s.text === text && Math.abs(s.x - x) < 200)) return;
    let yy = y;
    while (sc.shoutSlots.some((s) => Math.abs(s.x - x) < 130 && Math.abs(s.y - yy) < 32)) { yy -= 34; if (y - yy > 34) return; }
    sc.shoutSlots.push({ x, y: yy, until: now + 900, text });
    const c = sc.add.container(x, yy).setDepth(1750);
    const t = sc.add.text(0, 0, text, { fontFamily: FONT, fontSize: `${opts.size ?? 22}px`, fontStyle: 'bold', color: opts.ink ?? '#2a1606', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5);
    const w = t.width + 28, h = t.height + 14;
    const g = sc.add.graphics();
    const pts = [];
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; const sp = i % 2 ? 1 : 1.16; pts.push({ x: Math.cos(a) * w / 2 * sp, y: Math.sin(a) * h / 2 * sp }); }
    g.fillStyle(0x000000, 0.35).fillPoints(pts.map((p) => ({ x: p.x + 3, y: p.y + 4 })), true);
    g.fillStyle(color, 1).fillPoints(pts, true);
    g.lineStyle(3, 0x2a1606, 1).strokePoints(pts, true, true);
    g.fillStyle(color, 1).fillTriangle(-8, h / 2 - 2, 8, h / 2 - 2, -2, h / 2 + 14);
    g.lineStyle(3, 0x2a1606, 1).lineBetween(-8, h / 2 + 1, -2, h / 2 + 14).lineBetween(8, h / 2 + 1, -2, h / 2 + 14);
    c.add([g, t]).setScale(0.2).setAngle(Phaser.Math.Between(-10, 10));
    if (opts.label) { const lb = sc.add.text(0, h / 2 + 18, opts.label, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5); c.add(lb); }
    sc.tweens.add({ targets: c, scale: 1.12, duration: 130, ease: 'Back.out', onComplete: () => sc.tweens.add({ targets: c, scale: 1, duration: 90 }) });
    sc.tweens.add({ targets: c, x: { from: x - 2, to: x + 2 }, duration: 40, yoyo: true, repeat: 3 });
    sc.tweens.add({ targets: c, y: yy - 16, alpha: 0, delay: opts.hold ?? 720, duration: 240, onComplete: () => c.destroy() });
  }

  /** Dispatch a skill event to its effect. at = [x,y] of the caster; targets = [[x,y]...]. */
  skillFx(kind, at, targets = [], extra = {}) {
    const [x, y] = at;
    switch (kind) {
      case 'damageHeld': targets.forEach(([tx, ty]) => { this.claws(tx, ty); this.impact(tx, ty - 6, 0xffa040, 1.2); }); break;                       // 앞발 후려치기
      case 'flee': this.groundAoe(x + 60, y + 30, 170, 0xff7043); this.shockwave(x, y, 0xff7043, 3, 3); this.burst('spark', x + 20, y - 20, 12, 0xffcc80); this.scene.cameras.main.shake(160, 0.004); break; // 어흥
      case 'pushHeld': targets.forEach(([tx, ty]) => { this.groundAoe(tx, ty + 26, 60, 0xffffff, { shake: false }); this.impact(tx, ty - 6, 0xffb35c, 1.1); this.burst('puff', tx, ty + 10, 6, 0xd9c49a); this.hit(tx, ty, 'white', true); }); this.ring(x + 30, y + 10, 0xffffff, 1.2); break; // 뒷발·뿔 자랑
      case 'damageAll': this.stampede(y); targets.forEach(([tx, ty], i) => this.scene.time.delayedCall(i * 40, () => this.groundAoe(tx, ty + 26, 80, 0xffb35c, { shake: false }))); targets.forEach(([tx, ty]) => this.hit(tx, ty, 'orange')); this.scene.cameras.main.shake(300, 0.005); break; // 떼 지어 달리기
      case 'stunRadius': this.groundAoe(x, y + 30, 150, 0x9cff6b); this.shockwave(x, y + 20, 0x9cff6b, 2, 2.6); this.burst('puff', x, y + 25, 10, 0xb8e0a0); targets.forEach(([tx, ty]) => this.burst('star', tx, ty - 20, 4)); this.scene.cameras.main.shake(200, 0.006); break; // 방석 착지
      case 'allyBuff': this.pillar(x, y, extra.color ?? 0xffd84d); this.burst('note', x, y - 30, 10, extra.color ?? 0xffd84d); (extra.allies ?? []).forEach(([ax, ay]) => this.ring(ax, ay + 20, extra.color ?? 0xffd84d, 0.9)); break; // 하울링·전국 투어
      case 'halveRespawn': this.burst('bigFlare', x, y - 30, 1, 0xffe066); if (extra.allyAt) { this.pillar(...extra.allyAt, 0xffe066); this.burst('rise', ...extra.allyAt, 12, 0xffe066); } break; // 새벽 네 시
      case 'stance': this.pillar(x, y, 0x7fd1ff); this.ring(x, y + 10, 0x7fd1ff, 1.2); break; // 겨울잠 직전·몸 부풀리기
      case 'charm': targets.forEach(([tx, ty]) => { this.burst('heart', tx, ty - 10, 5); this.burst('flare', tx, ty, 1, 0xff8fb1); }); this.burst('heart', x, y - 30, 3); break; // 홀리기
      case 'tongue': targets.forEach(([tx, ty]) => this.line(x + 20, y - 5, tx, ty, 0xff8fb1, 7, 160)); break; // 혀 낚시
      case 'hundred': this.groundAoe(x, y + 30, 120, 0xffd84d, { shake: false }); this.pillar(x, y, 0xffd84d); this.shockwave(x, y, 0xffd84d, 2, 2); this.burst('star', x, y - 30, 16, 0xffd84d); break; // 백일 수행
      case 'crowCall': this.groundAoe(x, y + 30, 220, 0xffe066, { shake: false, dur: 700 }); this.burst('bigFlare', x, y - 40, 1, 0xffe066); this.burst('note', x, y - 40, 12, 0xffe066); this.shockwave(x, y - 20, 0xffe066, 2, 2.5); break; // 꼬끼오
      case 'roosterFlee': this.burst('note', x, y - 30, 4, 0xfff6a0); targets.forEach(([tx, ty]) => this.burst('puff', tx, ty, 3, 0xffffff)); break; // 닭이 울면 귀신이 물러간다
      case 'hold': targets.forEach(([tx, ty]) => { this.ring(tx, ty + 10, extra.burst ? 0xff9f43 : 0xffffff, 0.7, 300); if (extra.burst) this.hit(tx, ty, 'orange', true); }); break; // 저지·들이받기
      case 'counter': targets.forEach(([tx, ty]) => { this.slash(tx, ty, 0x7fd1ff); this.hit(tx, ty, 'blue'); }); break; // 약 올리기
      default: this.skill(x, y, 'purple');
    }
  }

  /** On-hit flavour by the attacker's effects (poison splash, frost, shock, wolf mark, gold sparkle). */
  onHitFlavor(effects, tx, ty) {
    const has = (t) => effects.some((e) => e.type === t);
    if (has('poison')) this.burst('bubble', tx, ty, 4);
    if (has('slow')) this.burst('snow', tx, ty, 4);
    if (has('stunOnHit')) { this.burst('flare', tx, ty, 1, 0xfff6a0); if (this.ok) { const b = this.scene.add.image(tx, ty - 30, 'fx-bolt').setDepth(1601).setBlendMode('ADD').setScale(0.7); this.scene.tweens.add({ targets: b, alpha: 0, y: ty - 10, duration: 220, onComplete: () => b.destroy() }); } }
    if (has('mark')) { if (this.ok) { const m = this.scene.add.text(tx, ty - 26, '✕', { fontSize: '22px', color: '#ff5252', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(1601); this.scene.tweens.add({ targets: m, alpha: 0, scale: 1.6, duration: 500, onComplete: () => m.destroy() }); } }
    if (has('goldBonus')) this.burst('spark', tx, ty, 3, 0xffd84d);
    if (has('sameTargetStack')) this.burst('bubble', tx, ty - 10, 2, 0x7fd1ff);
  }

  /** Big text that slides in, holds and fades. */
  banner(text, color = '#ffffff', sub = '') {
    const s = this.scene;
    this._banner?.forEach((o) => { s.tweens.killTweensOf(o); o.destroy(); });
    const bg = s.add.rectangle(640, 200, 1280, 92, 0x000000, 0.45).setDepth(2400).setScale(1, 0);
    const t = s.add.text(640, 194, text, { fontFamily: FONT, fontSize: '46px', color, stroke: '#000000', strokeThickness: 8 }).setOrigin(0.5).setDepth(2401).setAlpha(0).setX(500);
    const st = sub ? s.add.text(640, 232, sub, { fontFamily: FONT, fontSize: '18px', color: '#dddddd' }).setOrigin(0.5).setDepth(2401).setAlpha(0) : null;
    s.tweens.add({ targets: bg, scaleY: 1, duration: 180, ease: 'Back.out' });
    s.tweens.add({ targets: t, x: 640, alpha: 1, duration: 260, ease: 'Cubic.out' });
    if (st) s.tweens.add({ targets: st, alpha: 1, duration: 300, delay: 150 });
    const mine = this._banner = [bg, t, st].filter(Boolean);
    s.time.delayedCall(1300, () => { if (this._banner !== mine) return; s.tweens.add({ targets: mine, alpha: 0, duration: 300, onComplete: () => { mine.forEach((o) => o.destroy()); if (this._banner === mine) this._banner = null; } }); });
  }
}

/** Stage climate on screen: a sky tint plus rain, snow, blowing sand or a thunderstorm. */
export function weather(scene, c) {
  if (c.tint) scene.add.rectangle(640, 360, 1280, 720, Phaser.Display.Color.GetColor(c.tint[0], c.tint[1], c.tint[2]), c.tint[3]).setDepth(-4);
  if (!c.weather) return;
  if (!scene.textures.exists('fx-rain')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 16); g.generateTexture('fx-rain', 2, 16); g.destroy();
  }
  const rain = (freq, alpha) => scene.add.particles(0, 0, 'fx-rain', {
    x: { min: -100, max: 1380 }, y: -20, speedY: { min: 620, max: 820 }, speedX: { min: -160, max: -110 }, rotate: 12,
    lifespan: 1100, frequency: freq, quantity: 2, scaleY: { min: 0.8, max: 1.6 }, alpha: { start: alpha, end: alpha * 0.6 }, tint: 0xbfe0ff,
  }).setDepth(7);
  if (c.weather === 'rain') rain(14, 0.45);
  if (c.weather === 'storm') {
    rain(9, 0.55);
    const flash = scene.add.rectangle(640, 360, 1280, 720, 0xdfe8ff, 0).setDepth(8);
    scene.time.addEvent({ delay: 5200, loop: true, callback: () => { if (Math.random() < 0.7) scene.tweens.add({ targets: flash, alpha: { from: 0.32, to: 0 }, duration: 420, ease: 'Quad.out' }); } });
  }
  if (c.weather === 'snow' && scene.textures.exists('fx-snow')) scene.add.particles(0, 0, 'fx-snow', {
    x: { min: 0, max: 1500 }, y: -10, speedY: { min: 90, max: 170 }, speedX: { min: -220, max: -120 }, lifespan: 6000, frequency: 45,
    scale: { min: 0.2, max: 0.55 }, rotate: { start: 0, end: 360 }, alpha: { start: 0.95, end: 0.3 },
  }).setDepth(7);
  if (c.weather === 'sand' && scene.textures.exists('fx-puff')) scene.add.particles(0, 0, 'fx-puff', {
    x: 1340, y: { min: 200, max: 620 }, speedX: { min: -420, max: -260 }, speedY: { min: -20, max: 20 }, lifespan: 5200, frequency: 260,
    scale: { min: 0.8, max: 1.8 }, alpha: { start: 0.22, end: 0 }, tint: 0xe2b874,
  }).setDepth(7);
}

/** Ambient life for a stage: drifting clouds, falling leaves/petals, fireflies, portal motes, water glints. */
export function ambient(scene, stage) {
  if (!scene.textures.exists('fx-puff')) return;
  const night = !!stage.night || stage.id === 'forest-3';
  for (let i = 0; i < 4; i++) {
    const c = scene.add.image(Phaser.Math.Between(0, 1280), Phaser.Math.Between(40, 160), 'fx-puff').setDepth(-5).setAlpha(night ? 0.12 : 0.28).setScale(Phaser.Math.FloatBetween(1.6, 2.8), 1.1);
    scene.tweens.add({ targets: c, x: c.x + 1500, duration: Phaser.Math.Between(60000, 110000), repeat: -1, onRepeat: () => { c.x = -200; } });
  }
  const leafTint = { field: 0xffb3c6, forest: 0x9ccc65, village: 0xffd36b, plains: 0xe0c27e, wetland: 0xb2dfdb, mountain: 0xffffff };
  stage.zones.forEach((z, i) => {
    scene.add.particles(0, 0, z === 'mountain' ? 'fx-snow' : 'fx-leaf', {
      x: { min: 100 + i * 360, max: 460 + i * 360 }, y: -10, speedY: { min: 30, max: 70 }, speedX: { min: -30, max: 10 },
      lifespan: 9000, frequency: z === 'forest' ? 500 : 900, scale: { min: 0.25, max: 0.5 }, rotate: { start: 0, end: 360 },
      alpha: { start: 0.85, end: 0.2 }, tint: leafTint[z] ?? 0xffffff,
    }).setDepth(5);
  });
  if (night || stage.zones.includes('forest') || stage.zones.includes('wetland')) {
    scene.add.particles(0, 0, 'fx-flare', {
      x: { min: 100, max: 1180 }, y: { min: 180, max: 470 }, speed: { min: 5, max: 20 }, lifespan: 4000, frequency: night ? 160 : 450,
      scale: { start: 0.12, end: 0.04 }, alpha: { start: 0, end: 0, ease: 'Sine.inOut' }, tint: 0xfff6a0, blendMode: 'ADD',
      emitCallback: (p) => { p.alpha = 0.9; },
    }).setDepth(6);
  }
  scene.add.particles(1232, 320, 'fx-flare', { speed: { min: 10, max: 40 }, lifespan: 1400, frequency: 120, scale: { start: 0.25, end: 0 }, tint: 0xb388ff, blendMode: 'ADD', emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, 70, 130) } }).setDepth(7);
}

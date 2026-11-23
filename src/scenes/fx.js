// Battle effects: hit sparks, projectiles, area rings, status particles, evolution beams, kills, banners, ambient weather.
// Uses textures fx-* (tools/gen_bg.py). Every call is cheap: emitters are created once and `explode`d.
import Phaser from 'phaser';
import { FONT } from '../text.js';

const PRESETS = {
  spark: { tex: 'fx-spark', speed: { min: 120, max: 320 }, lifespan: 380, scale: { start: 0.9, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: 'ADD' },
  flare: { tex: 'fx-flare', speed: 0, lifespan: 220, scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD' },
  bigFlare: { tex: 'fx-flare', speed: 0, lifespan: 500, scale: { start: 1, end: 4 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD' },
  star: { tex: 'fx-star', speed: { min: 80, max: 240 }, lifespan: 700, scale: { start: 0.9, end: 0.2 }, rotate: { min: 0, max: 360 }, gravityY: 300 },
  puff: { tex: 'fx-puff', speed: { min: 20, max: 70 }, lifespan: 600, scale: { start: 0.5, end: 1.3 }, alpha: { start: 0.7, end: 0 } },
  shard: { tex: 'fx-shard', speed: { min: 150, max: 380 }, lifespan: 650, scale: { start: 1, end: 0.3 }, rotate: { min: 0, max: 360 }, gravityY: 500 },
  coin: { tex: 'fx-coin', speed: { min: 80, max: 180 }, angle: { min: 230, max: 310 }, lifespan: 600, scale: { start: 0.9, end: 0.6 }, gravityY: 500 },
  heart: { tex: 'fx-heart', speed: { min: 30, max: 90 }, angle: { min: 240, max: 300 }, lifespan: 900, scale: { start: 0.8, end: 0.3 }, alpha: { start: 1, end: 0 } },
  bubble: { tex: 'fx-bubble', speed: { min: 20, max: 50 }, angle: { min: 250, max: 290 }, lifespan: 800, scale: { start: 0.4, end: 0.8 }, alpha: { start: 0.9, end: 0 }, tint: 0x7CFC9A },
  snow: { tex: 'fx-snow', speed: { min: 20, max: 60 }, lifespan: 700, scale: { start: 0.6, end: 0.1 }, rotate: { min: 0, max: 360 }, tint: 0xbfe6ff },
  note: { tex: 'fx-note', speed: { min: 30, max: 70 }, angle: { min: 240, max: 300 }, lifespan: 900, scale: { start: 0.8, end: 0.4 }, alpha: { start: 1, end: 0 } },
  rise: { tex: 'fx-spark', speedY: { min: -160, max: -60 }, speedX: { min: -30, max: 30 }, lifespan: 900, scale: { start: 0.7, end: 0 }, blendMode: 'ADD' },
  leaf: { tex: 'fx-leaf', speed: { min: 60, max: 160 }, lifespan: 600, scale: { start: 0.6, end: 0.2 }, rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 } },
  confetti: { tex: 'fx-leaf', speed: { min: 200, max: 500 }, angle: { min: 220, max: 320 }, lifespan: 2200, scale: { start: 0.9, end: 0.6 }, rotate: { min: 0, max: 360 }, gravityY: 400 },
};
const TINT = { gold: 0xffd84d, purple: 0xb388ff, green: 0x7CFC9A, red: 0xff5252, blue: 0x7fd1ff, white: 0xffffff, orange: 0xffa040, pink: 0xff8fb1 };

const PROJECTILE = {
  crow: ['fx-stone', 0xffffff, 0.9], eagle: ['fx-feather', 0xffffff, 1.1], fox: ['fx-orb', 0x9cff6b, 0.8], rooster: ['fx-note', 0xffe066, 1],
  grasshopper: ['fx-note', 0x9cff6b, 1], frog: ['fx-orb', 0xff8fb1, 0.7], cheese_thief: ['fx-orb', 0xb388ff, 0.9], thunderbird: ['fx-bolt', 0xfff6a0, 0.6],
  phoenix: ['fx-orb', 0xff9800, 1.1], bullfrog: ['fx-orb', 0xff8fb1, 0.8],
};

export class FX {
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
    return (this.emitters[name] = e);
  }

  burst(name, x, y, n, tint) {
    if (!this.ok) return;
    const e = this.em(name);
    if (tint !== undefined) e.setParticleTint(tint); else if (!PRESETS[name].tint) e.setParticleTint(0xffffff);
    e.explode(n, x, y);
  }

  hit(x, y, color = 'white', big = false) {
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
        p.setPosition(x, y); p.rotation += 0.3;
        if (Math.random() < 0.35) { trail.setParticleTint(tint); trail.explode(1, x, y); }
      },
      onComplete: () => {
        p.destroy();
        this.hit(x2, y2, tint, aoe);
        if (aoe) this.ring(x2, y2, tint, 1.2);
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
  }

  kill(x, y, gold, boss) {
    this.burst('puff', x, y, boss ? 14 : 5, 0xdddddd);
    this.burst('spark', x, y, boss ? 24 : 6, 0xffe066);
    if (gold > 0 && this.ok) {
      for (let i = 0; i < Math.min(5, Math.ceil(gold / 2)); i++) {
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

  /** Big text that slides in, holds and fades. */
  banner(text, color = '#ffffff', sub = '') {
    const s = this.scene;
    const bg = s.add.rectangle(640, 200, 1280, 92, 0x000000, 0.45).setDepth(2400).setScale(1, 0);
    const t = s.add.text(640, 194, text, { fontFamily: FONT, fontSize: '46px', color, stroke: '#000000', strokeThickness: 8 }).setOrigin(0.5).setDepth(2401).setAlpha(0).setX(500);
    const st = sub ? s.add.text(640, 232, sub, { fontFamily: FONT, fontSize: '18px', color: '#dddddd' }).setOrigin(0.5).setDepth(2401).setAlpha(0) : null;
    s.tweens.add({ targets: bg, scaleY: 1, duration: 180, ease: 'Back.out' });
    s.tweens.add({ targets: t, x: 640, alpha: 1, duration: 260, ease: 'Cubic.out' });
    if (st) s.tweens.add({ targets: st, alpha: 1, duration: 300, delay: 150 });
    s.time.delayedCall(1300, () => s.tweens.add({ targets: [bg, t, st].filter(Boolean), alpha: 0, duration: 300, onComplete: () => [bg, t, st].forEach((o) => o?.destroy()) }));
  }
}

/** Ambient life for a stage: drifting clouds, falling leaves/petals, fireflies, portal motes, water glints. */
export function ambient(scene, stage) {
  if (!scene.textures.exists('fx-puff')) return;
  const night = stage.id === 'forest-3';
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

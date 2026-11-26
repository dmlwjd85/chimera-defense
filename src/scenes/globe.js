// 소환 지구본: 실제 대륙 모양(Natural Earth)을 정사영으로 그린다. 천천히 돌다가, 소환하면 빠르게 돌아 뽑힌 대륙에서 멈춘다.
import Phaser from 'phaser';

const RAD = Math.PI / 180;
const LAND = { eurasia: 0x7cc25a, america: 0xe0b83c, africa: 0xe08246, oceania: 0x8fb88a, antarctica: 0xf2f6fa };
/** Where on the map each habitat of a continent sits (lon, lat). */
export const HAB_SPOT = {
  'eurasia:forest': [100, 58], 'eurasia:field': [45, 48], 'eurasia:village': [127, 37],
  'america:plains': [-100, 42], 'america:mountain': [-112, 50], 'america:wetland': [-60, -5],
  'africa:plains': [25, -5],
};
const dim = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k); };

export class Globe {
  constructor(scene, x, y, R, map, opts = {}) {
    Object.assign(this, { scene, x, y, R, map, lon: 100, tilt: 18, highlight: null, pin: null, spinning: false, acc: 0, streak: 0 });
    // depth: 바닥 깊이(기본 2 — 예전 소환판). 정비 화면 보상 카드 위에 올릴 땐 2001처럼 크게
    const d = opts.depth ?? 2, o = (x0) => { this.objs.push(x0); return x0; };
    this.objs = [];
    o(scene.add.circle(x, y, R + 9, 0x7fc8ff, 0.12).setDepth(d));
    o(scene.add.circle(x, y, R + 4, 0x9fd8ff, 0.22).setDepth(d));
    this.g = o(scene.add.graphics().setDepth(d + 1));
    const mg = scene.make.graphics({}, false); mg.fillStyle(0xffffff).fillCircle(x, y, R);
    this.mask = mg;
    this.g.setMask(mg.createGeometryMask());
    this.over = o(scene.add.graphics().setDepth(d + 3));
    this.label = o(scene.add.text(x, y + R - 14, '', { fontFamily: 'sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b1a2b', strokeThickness: 4, backgroundColor: '#0b1a2bcc', padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(d + 6).setAlpha(0));
    // stand
    const st = o(scene.add.graphics().setDepth(d));
    st.lineStyle(4, 0xd4b06a, 0.9); st.beginPath(); st.arc(x, y, R + 9, 0.35, Math.PI - 0.35); st.strokePath();
    st.fillStyle(0xd4b06a, 0.95).fillRoundedRect(x - 22, y + R + 8, 44, 6, 3);
    this.speedK = opts.speed ?? 1;
    this.draw();
  }

  /** 지우기(정비 화면이 닫힐 때). */
  destroy() { if (this.dead) return; this.dead = true; this.reset(); this.objs.forEach((x0) => x0.destroy()); this.mask?.destroy(); }

  /** Orthographic projection → [sx, sy, z]. */
  proj(lon, lat) {
    const l = (lon - this.lon) * RAD, p = lat * RAD, t = this.tilt * RAD;
    const cx = Math.cos(p) * Math.sin(l), cz0 = Math.cos(p) * Math.cos(l), sy = Math.sin(p);
    const y = Math.cos(t) * sy - Math.sin(t) * cz0, z = Math.sin(t) * sy + Math.cos(t) * cz0;
    return [cx, y, z];
  }

  draw() {
    const { g, x, y, R } = this;
    g.clear();
    // ocean with a soft terminator
    g.fillStyle(0x1b4f8f, 1).fillCircle(x, y, R);
    g.fillStyle(0x2f78c4, 1).fillCircle(x - R * 0.12, y - R * 0.12, R * 0.9);
    g.fillStyle(0x4f9fe0, 0.7).fillCircle(x - R * 0.28, y - R * 0.28, R * 0.6);
    // graticule
    g.lineStyle(1, 0xcfe8ff, 0.16);
    for (let lon = -180; lon < 180; lon += 30) this.line(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]));
    for (let lat = -60; lat <= 60; lat += 30) this.line(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]));
    // land
    for (const poly of this.map.polys) {
      let vis = false, hid = false; const pts = [];
      for (const [lo, la] of poly.p) {
        let [px, py, z] = this.proj(lo, la);
        if (z > 0) vis = true; else { hid = true; const n = Math.hypot(px, py) || 1; px /= n; py /= n; }
        pts.push({ x: x + px * R, y: y - py * R });
      }
      if (!vis) continue;
      const base = LAND[poly.c] ?? 0x8fb88a;
      const hl = this.highlight;
      const col = hl ? (poly.c === hl ? Phaser.Display.Color.ValueToColor(base).brighten(18 + 14 * Math.sin(this.scene.time.now / 110)).color : dim(base, 0.5)) : base;
      g.fillStyle(col, 1).fillPoints(pts, true);
      if (!hid) g.lineStyle(hl && poly.c === hl ? 1.6 : 0.8, hl && poly.c === hl ? 0xffffff : dim(base, 0.6), hl && poly.c === hl ? 0.9 : 0.7).strokePoints(pts, true, true);
    }
    // night side + speed streaks + gloss
    g.fillStyle(0x04122a, 0.34).fillCircle(x + R * 0.55, y + R * 0.45, R * 0.95);
    if (this.streak > 0.05) { g.lineStyle(2, 0xffffff, 0.35 * this.streak); for (let i = 0; i < 9; i++) { const yy = y - R + (i + 0.5) * (2 * R / 9); const w = Math.sqrt(Math.max(0, R * R - (yy - y) ** 2)); g.lineBetween(x - w * (0.3 + 0.6 * ((i * 37) % 10) / 10), yy, x + w * (0.2 + 0.7 * ((i * 53) % 10) / 10), yy); } }
    g.fillStyle(0xffffff, 0.22).fillEllipse(x - R * 0.38, y - R * 0.46, R * 0.7, R * 0.36);
    // pin and rim
    const o = this.over; o.clear();
    if (this.highlight) { const k = 0.55 + 0.45 * Math.sin(this.scene.time.now / 140); o.lineStyle(9, LAND[this.highlight] ?? 0xffffff, 0.35 * k).strokeCircle(x, y, R + 7); o.lineStyle(4, LAND[this.highlight] ?? 0xffffff, 0.9).strokeCircle(x, y, R + 2); }
    o.lineStyle(3, 0x9fd8ff, 0.95).strokeCircle(x, y, R);
    o.lineStyle(1, 0xffffff, 0.5).strokeCircle(x, y, R - 2);
    if (this.pin) {
      const [px, py, z] = this.proj(this.pin.lon, this.pin.lat);
      if (z > 0) {
        const sx = x + px * R, sy = y - py * R - (this.pin.drop ?? 0);
        const pr = this.pin.ring ?? 0;
        if (pr > 0) { o.lineStyle(3, 0xffe066, 1 - pr).strokeEllipse(x + px * R, y - py * R, 50 * pr, 24 * pr); o.fillStyle(0xfff6a0, 0.25 * (1 - pr)).fillRect(sx - 3, sy - 60, 6, 46); }
        o.fillStyle(0x000000, 0.35).fillEllipse(x + px * R, y - py * R + 2, 10, 4);
        o.fillStyle(0xff4d4d, 1).fillCircle(sx, sy - 14, 7); o.fillTriangle(sx - 5, sy - 10, sx + 5, sy - 10, sx, sy);
        o.fillStyle(0xffffff, 1).fillCircle(sx, sy - 14, 2.6);
      }
    }
  }

  line(coords) {
    const { g, x, y, R } = this;
    let pen = false;
    g.beginPath();
    for (const [lo, la] of coords) {
      const [px, py, z] = this.proj(lo, la);
      if (z <= 0) { pen = false; continue; }
      if (pen) g.lineTo(x + px * R, y - py * R); else { g.moveTo(x + px * R, y - py * R); pen = true; }
    }
    g.strokePath();
  }

  /** Slow idle turn; repaint ~20 times a second. */
  update(dt) {
    if (this.dead) return;
    if (!this.spinning && !this.hold) this.lon = (this.lon + dt * 7 * (this.speedK ?? 1)) % 360;
    this.acc += dt;
    if (this.spinning || this.highlight || this.acc > 0.05) { this.acc = 0; this.draw(); }
  }

  /** Face a continent without the show (designation). */
  face(cont) {
    this.reset();
    if (!cont) return;
    const c = this.map.centers[cont]; if (!c) return;
    this.hold = true;
    let d = ((c[0] - this.lon + 540) % 360) - 180;
    this.scene.tweens.add({ targets: this, lon: this.lon + d, tilt: Math.max(-10, Math.min(30, c[1] * 0.5)), duration: 500, ease: 'Cubic.out' });
  }

  reset() { this.tw?.forEach((t) => t.remove()); this.tw = []; this.highlight = null; this.pin = null; this.spinning = false; this.hold = false; this.streak = 0; this.label.setAlpha(0); this.g.setScale(1); }

  /**
   * The summon show: whirl → brake on the continent → latitude ring sweep → pin drops on the habitat.
   * steps: { onStop, onPin } callbacks; total time ≈ dur * 2.
   */
  spinTo(cont, spot, dur, names, steps = {}) {
    this.reset();
    const sc = this.scene, c = this.map.centers[cont] ?? [0, 20];
    const target = spot?.[0] ?? c[0];
    const from = this.lon, turns = dur > 400 ? 3 : 1;
    const to = from + ((target - from + 540) % 360) - 180 + 360 * turns;
    this.spinning = true; this.streak = 1;
    this.tw.push(sc.tweens.add({ targets: this, lon: to, tilt: Math.max(-12, Math.min(32, (spot?.[1] ?? c[1]) * 0.55)), duration: dur, ease: 'Cubic.out' }));
    this.tw.push(sc.tweens.add({ targets: this, streak: 0, duration: dur, ease: 'Quad.in' }));
    this.tw.push(sc.tweens.add({ targets: this.g, scaleX: { from: 1.06, to: 1 }, duration: dur, ease: 'Sine.out' }));
    this.tw.push(sc.time.delayedCall(dur, () => {
      this.spinning = false; this.hold = true; this.lon = ((to % 360) + 360) % 360; this.highlight = cont;
      this.label.setText(names.cont).setAlpha(1).setScale(0.4);
      this.tw.push(sc.tweens.add({ targets: this.label, scale: 1, duration: 220, ease: 'Back.out' }));
      steps.onStop?.();
      if (!spot) return;
      this.pin = { lon: spot[0], lat: spot[1], drop: 120, ring: 0 };
      this.tw.push(sc.tweens.add({ targets: this.pin, drop: 0, duration: Math.max(160, dur * 0.55), ease: 'Bounce.out', onComplete: () => {
        steps.onPin?.();
        this.label.setText(`${names.cont} · ${names.hab}`);
        this.tw.push(sc.tweens.add({ targets: this.pin, ring: 1, duration: 500, repeat: 1 }));
      } }));
    }));
  }

  /** Screen position of the current pin (for beams). */
  pinXY() { if (!this.pin) return [this.x, this.y]; const [px, py] = this.proj(this.pin.lon, this.pin.lat); return [this.x + px * this.R, this.y - py * this.R - 14]; }
}

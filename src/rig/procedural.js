// Procedural layers: breathing, blinking, spring secondary motion.
import { clamp, mulberry32 } from './math.js';

export class Breath {
  constructor(cfg = {}) { this.slots = cfg.slots || ['body']; this.period = cfg.period || 2.6; this.scaleY = cfg.scaleY ?? 0.03; this.t = 0; }
  update(dt) { this.t += dt; }
  /** Multiplier for the breathing slots' sy (slots, not bones, so legs do not stretch). weight 0..1 comes from the clip (idle 1, action clips lower). */
  value(weight = 1) { return 1 + Math.sin((this.t / this.period) * Math.PI * 2) * this.scaleY * weight; }
}

export class Blink {
  constructor(cfg = {}, seed = 1) {
    this.slot = cfg.slot || 'eye'; this.min = cfg.min ?? 3; this.max = cfg.max ?? 6; this.close = cfg.close ?? 0.12;
    this.rng = mulberry32(seed); this.wait = this.next(); this.closing = 0;
  }
  next() { return this.min + (this.max - this.min) * this.rng(); }
  update(dt) {
    if (this.closing > 0) { this.closing -= dt; if (this.closing <= 0) this.wait = this.next(); return; }
    this.wait -= dt;
    if (this.wait <= 0) this.closing = this.close;
  }
  /** Eye sy multiplier: dips to 0.1 at mid-blink. */
  value() {
    if (this.closing <= 0) return 1;
    const u = 1 - this.closing / this.close;
    return 1 - 0.9 * Math.sin(u * Math.PI);
  }
}

/**
 * Angular spring for one bone. It lags behind the angle its parent wants (inertia) and swings back.
 * stiffness and damping per the image order (tail 60/8, ear 120/12); limit is the max offset in degrees.
 */
export class AngleSpring {
  constructor({ stiffness = 60, damping = 8, limit = 35, sway = 0.12 } = {}) {
    Object.assign(this, { stiffness, damping, limit, sway });
    this.angle = null; this.vel = 0; this.prevX = null;
  }
  reset() { this.angle = null; this.vel = 0; this.prevX = null; }
  /** target: world angle the bone would have without the spring; px: parent world x (for sway on movement). Returns offset in degrees. */
  step(target, px, dt) {
    if (this.angle === null || dt <= 0) { this.angle = target; this.prevX = px; return 0; }
    const h = Math.min(dt, 1 / 30);
    const vx = (px - this.prevX) / dt; this.prevX = px;
    let acc = this.stiffness * (target - this.angle) - this.damping * this.vel;
    acc += -vx * this.sway; // moving right pushes the tail tip back (counter-clockwise lag)
    this.vel += acc * h;
    this.angle += this.vel * h;
    const off = clamp(this.angle - target, -this.limit, this.limit);
    this.angle = target + off;
    return off;
  }
}

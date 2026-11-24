// One animated character: template (bones/slots) + anims (clips) + rig (species skin and stage modifiers).
// Pure logic, no Phaser. The renderer reads getDrawList() every frame.
import { fromTRS, mul, apply, decompose } from './math.js';
import { sampleClip, blendPoses, eventsBetween, neutral } from './animator.js';
import { Breath, Blink, AngleSpring } from './procedural.js';
import { chainPoints } from './rope.js';

const IDENTITY = [1, 0, 0, 1, 0, 0];

export class RigInstance {
  constructor(template, anims, rig, opts = {}) {
    this.template = template; this.anims = anims; this.rig = rig;
    this.bones = template.bones;
    this.boneIndex = Object.fromEntries(this.bones.map((b, i) => [b.name, i]));
    this.lengths = Object.fromEntries(this.bones.map((b) => [b.name, b.length || 0]));
    const p = template.procedural || {};
    this.breath = new Breath(p.breath);
    this.blink = new Blink(p.blink, opts.seed ?? 7);
    this.springs = {};
    for (const s of p.springs || []) for (const b of s.bones) this.springs[b] = new AngleSpring(s);
    this.x = opts.x ?? 0; this.y = opts.y ?? 0;
    this.displayScale = opts.scale ?? 1;   // canvas px → screen px (1024 canvas → about 0.15 in battle)
    this.facing = 1; this.timeScale = 1; this.moveVelocity = 0;
    this.skin = opts.skin || 'default';
    this.listeners = {};
    this.flashLeft = 0; this.flashDur = 0.12;
    this.cur = null; this.prev = null; this.mixLeft = 0; this.mixDur = 0;
    this.setStage(opts.stage || 'adult');
    this.play(opts.motion || 'idle');
  }

  // ---------- public API ----------
  on(name, fn) { (this.listeners[name] ||= []).push(fn); return this; }
  setFacing(f) { this.facing = f < 0 ? -1 : 1; }
  setSkin(name) { this.skin = name; }
  hitFlash(dur = 0.12) { this.flashDur = dur; this.flashLeft = dur; }
  setStage(stage) {
    const def = this.rig.stages?.[stage];
    if (!def) throw new Error(`rig ${this.rig.species}: no stage ${stage}`);
    this.stage = stage; this.stageDef = def;
    for (const s of Object.values(this.springs)) s.reset();
    this.groundOffset = 0;
    this.groundOffset = -this.lowestFoot();
  }
  /** play(name, { loop, mix, then }) — non-loop clips return to `then` (default idle) unless the clip holds its last frame. */
  play(name, opts = {}) {
    const clip = this.anims[name];
    if (!clip) throw new Error(`unknown motion ${name}`);
    const loop = opts.loop ?? clip.loop ?? false;
    const mix = opts.mix ?? clip.mix ?? 0.12;
    if (this.cur && mix > 0) { this.prev = { ...this.cur, frozen: sampleClip(this.cur.clip, this.cur.t) }; this.mixLeft = this.mixDur = mix; }
    else { this.prev = null; this.mixLeft = 0; }
    this.cur = { name, clip, t: 0, loop, then: opts.then ?? (clip.hold ? null : 'idle'), done: false };
    return this;
  }
  get motion() { return this.cur?.name; }
  get finished() { return !!this.cur?.done; }

  update(dt) {
    const events = [];
    const s = dt * this.timeScale * (this.stageDef.speed || 1);
    this.breath.update(s); this.blink.update(s);
    if (this.flashLeft > 0) this.flashLeft = Math.max(0, this.flashLeft - dt);
    if (this.mixLeft > 0) this.mixLeft = Math.max(0, this.mixLeft - s);
    const c = this.cur, d = c.clip.duration;
    if (!c.done) {
      let t0 = c.t, t1 = c.t + s;
      if (c.loop) {
        while (t1 > d) { events.push(...eventsBetween(c.clip, t0, d)); t1 -= d; t0 = -1e-9; }
        events.push(...eventsBetween(c.clip, t0, t1)); c.t = t1;
      } else {
        events.push(...eventsBetween(c.clip, t0, Math.min(t1, d)));
        c.t = Math.min(t1, d);
        if (t1 >= d) {
          c.done = true;
          events.push({ t: d, name: 'complete', data: c.name });
          if (c.then) { const next = c.then; this.emitAll(events); this.play(next); return this.solve(s, events); }
        }
      }
    }
    this.emitAll(events);
    return this.solve(s, events);
  }

  // ---------- pose solving ----------
  currentOffsets() {
    let pose = sampleClip(this.cur.clip, this.cur.t);
    if (this.prev && this.mixLeft > 0) pose = blendPoses(pose, this.prev.frozen, this.mixLeft / this.mixDur);
    return pose;
  }

  /** Local TRS for one bone after setup pose, stage modifiers and clip offsets. */
  localOf(b, off) {
    const amp = this.stageDef.amp ?? 1;
    // 뼈 배율: 숫자면 가로세로 같이, [길이, 굵기]면 따로(짧고 굵은 다리 같은 2등신 비율용)
    const bsv = this.stageDef.boneScale?.[b.name] ?? 1;
    const bs = Array.isArray(bsv) ? bsv[0] : bsv, bsy = Array.isArray(bsv) ? bsv[1] : bsv;
    const o = off || neutral();
    const sy = (b.sy ?? 1) * bsy * o.sy;
    let y = (b.y || 0) + o.y * amp;
    if (!b.parent) y += this.groundOffset;
    return { x: (b.x || 0) + o.x * amp, y, rot: (b.rot || 0) + o.rot * amp, sx: (b.sx ?? 1) * bs * o.sx, sy, alpha: o.alpha };
  }

  /** Bone world matrices in rig space (feet on y=0, facing right). */
  solveBones(offsets, dt, simulate) {
    const worlds = {}; const alphaOf = {};
    for (const b of this.bones) {
      const L = this.localOf(b, offsets[b.name]);
      const parent = b.parent ? worlds[b.parent] : IDENTITY;
      let m = mul(parent, fromTRS(L.x, L.y, L.rot, L.sx, L.sy));
      const spring = simulate && this.springs[b.name];
      if (spring) {
        const target = decompose(m).rot;
        const vx = (this.moveVelocity * this.facing) / (this.displayScale * (this.stageDef.scale || 1));
        spring.prevX = spring.prevX === null ? null : spring.prevX - vx * dt; // treat whole-body motion as parent motion
        const off = spring.step(target, parent[4], dt);
        m = mul(parent, fromTRS(L.x, L.y, L.rot + off, L.sx, L.sy));
      }
      worlds[b.name] = m;
      alphaOf[b.name] = (b.parent ? alphaOf[b.parent] : 1) * L.alpha;
    }
    return { worlds, alphaOf };
  }

  lowestFoot() {
    const { worlds } = this.solveBones({}, 0, false);
    let maxY = -Infinity;
    for (const b of this.bones) if (b.foot) maxY = Math.max(maxY, apply(worlds[b.name], b.length || 0, 0)[1]);
    return maxY === -Infinity ? 0 : maxY;
  }

  placement() {
    const k = this.displayScale * (this.stageDef.scale || 1);
    return fromTRS(this.x, this.y, 0, k * this.facing, k);
  }

  solve(dt, events) {
    const { worlds, alphaOf } = this.solveBones(this.currentOffsets(), dt, true);
    this.worlds = worlds; this.alphaOf = alphaOf;
    this.lastEvents = events;
    return events;
  }

  /** Everything the renderer needs, in screen space, sorted back to front. */
  getDrawList() {
    if (!this.worlds) this.solve(0, []);
    const P = this.placement();
    const parts = this.rig.stages[this.stage].parts || {};
    const skinParts = this.rig.skins?.[this.skin]?.parts || {};
    const out = [];
    const over = this.rig.slotOverrides ?? {};
    for (const base of this.template.slots) {
      const slot = over[base.name] ? { ...base, ...over[base.name] } : base;
      const fallback = 'part' in slot ? slot.part : slot.name;
      const part = slot.name in skinParts ? skinParts[slot.name] : slot.name in parts ? parts[slot.name] : fallback;
      if (part === null || part === false) continue;
      const bw = this.worlds[slot.bone];
      let local = fromTRS(slot.x || 0, slot.y || 0, slot.rot || 0, slot.sx ?? 1, slot.sy ?? 1);
      if (slot.name === this.blink.slot) local = mul(local, fromTRS(0, 0, 0, 1, this.blink.value()));
      if (this.breath.slots.includes(slot.name)) local = mul(local, fromTRS(0, 0, 0, 1, this.breath.value(this.cur.clip.breath ?? 1)));
      const m = mul(P, mul(bw, local));
      const entry = { slot: slot.name, part, z: slot.z ?? 0, m, ...decompose(m), alpha: this.alphaOf[slot.bone], ph: slot.ph, color: slot.color, flipY: !!slot.flipY };
      if (slot.rope) {
        entry.rope = chainPoints(slot.rope, this.worlds, this.lengths, slot.ropeSegments || 4).map(([x, y]) => apply(P, x, y));
      }
      out.push(entry);
    }
    out.sort((a, b) => a.z - b.z);
    return out;
  }

  /** Bone joints in screen space (for the lab's bone overlay). */
  getBoneLines() {
    const P = this.placement();
    return this.bones.map((b) => {
      const m = mul(P, this.worlds[b.name]);
      return { name: b.name, a: apply(m, 0, 0), b: apply(m, b.length || 0, 0) };
    });
  }

  get flash() { return this.flashDur > 0 ? this.flashLeft / this.flashDur : 0; }

  emitAll(events) {
    for (const e of events) for (const fn of this.listeners[e.name] || []) fn(e, this);
    for (const e of events) for (const fn of this.listeners['*'] || []) fn(e, this);
  }
}

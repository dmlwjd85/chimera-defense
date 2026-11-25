// 도트 캐릭터 하나의 상태(어떤 동작의 몇 번째 장인지). Phaser 없는 순수 코드라 node 시험으로 검사함.
// RigInstance와 겉모양(play·update·on·setFacing·hitFlash·motion·finished·anims·rig·silhouette)을 맞춰서
// 전투 코드(BattleScene·OpeningScene·rigs.playAttack)를 고치지 않고 그대로 쓸 수 있게 함.
import { clipDuration } from './dotData.js';

// 아직 따로 그리지 않은 동작은 있는 장(대기·공격)을 써서 코드 연출로 대신함(계획서 1-3: 찌그러짐·깜빡임·투명도 대체).
// fx 칸: bob(위아래 통통, 도트), lunge(앞으로 내딛기 [준비 뒤로, 타격 앞으로], 도트), recoil(뒤로 움찔, 도트),
//        sink(아래로 가라앉기, 도트), alpha(투명도), fadeIn(투명→불투명), hop(제자리 뛰기, 도트), flashAt(흰 번쩍 시각)
const ATTACK_TIMING = [0.12, 0.12, 0.07, 0.11, 0.20, 0.28];   // 여우 할퀴기 시간표(4번 장에서 타격)
const HIT_AT = 0.31;
const HOLD = { frame: 3, sec: 0.09 };                          // 4번 장 타격 순간 멈칫

/** 그 단계 세트에 없는 동작을 대기·공격 장으로 만들어 줌. */
export function synthClip(set, name, attacks) {
  const idle = set.idle, f = idle.frames, at = attacks.map((a) => set[a]).find(Boolean);
  const pick = (...i) => i.map((k) => f[k % f.length]);
  switch (name) {
    case 'move': return { frames: [...f], durs: f.map(() => 0.11), loop: true, fx: { bob: 1 } };
    case 'hit': return { frames: pick(0, 0), durs: [0.08, 0.18], fx: { recoil: 2 } };
    case 'down': return { frames: pick(0), durs: [0.46], hold: null, stay: true, fx: { sink: 2, alpha: 0.55 } };
    case 'respawn': return { frames: [...f], durs: f.map(() => 0.2), fx: { fadeIn: true, bob: 1 } };
    case 'merge_in': return { frames: [...f], durs: f.map(() => 0.2), events: [[0.5, 'pop']], fx: { fadeIn: true, hop: 2 } };
    case 'evolve': return { frames: pick(0, 1, 2, 3, 0, 1, 2), durs: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2], events: [[0.7, 'flash']], fx: { hop: 2, flashAt: 0.7 } };
    case 'victory': return { frames: [...f], durs: f.map(() => 0.15), loop: true, fx: { hop: 2 } };
    case 'skill':
      if (at) return { ...at, loop: false, events: [[HIT_AT, 'cast']] };
      return { frames: pick(0, 1, 2, 2, 3, 0), durs: ATTACK_TIMING, hold: HOLD, events: [[HIT_AT, 'cast']], fx: { lunge: 4 } };
    default:   // 공격 동작(할퀴기 등)인데 이 단계 그림이 없음 → 대기 장으로 앞으로 내딛기
      if (at) return at;
      return { frames: pick(0, 1, 2, 2, 3, 0), durs: ATTACK_TIMING, hold: HOLD, events: [[HIT_AT, 'hit']], fx: { lunge: 4 } };
  }
}

const ALL_MOTIONS = ['idle', 'move', 'attack', 'skill', 'hit', 'down', 'respawn', 'victory', 'merge_in', 'evolve'];

export class DotInstance {
  constructor(dot, opts = {}) {
    this.dot = dot;
    this.rig = { species: dot.species, attacks: [...(dot.attacks || [])], stages: dot.stages };
    this.listeners = {};
    this.facing = 1; this.timeScale = 1; this.moveVelocity = 0; this.silhouette = false;
    this.flashLeft = 0; this.flashDur = 0.12;
    this.displayScale = opts.scale ?? 1;
    this.cur = null;
    this.setStage(opts.stage || 'adult');
    this.play(opts.motion || 'idle', { loop: (opts.motion || 'idle') === 'idle' ? true : undefined });
  }

  // ---------- RigInstance와 같은 겉모양 ----------
  on(name, fn) { (this.listeners[name] ||= []).push(fn); return this; }
  setFacing(f) { this.facing = f < 0 ? -1 : 1; }
  setSkin() {}
  hitFlash(dur = 0.12) { this.flashDur = dur; this.flashLeft = dur; }
  get flash() { return this.flashDur > 0 ? this.flashLeft / this.flashDur : 0; }
  get motion() { return this.cur?.name; }
  get finished() { return !!this.cur?.done; }

  setStage(stage) {
    const st = this.dot.stages;
    const key = st[stage] ? stage : st.adult ? 'adult' : Object.keys(st)[0];
    this.stage = stage; this.stageKey = key; this.stageDef = st[key];
    this.set = this.dot.sets[this.stageDef.set];
    // 모든 동작 이름에 클립을 마련해 둠(그린 것은 그대로, 없는 것은 코드 연출). anims[이름]이 있으면 그 동작을 쓸 수 있다는 뜻.
    this.anims = {};
    for (const n of [...ALL_MOTIONS, ...this.rig.attacks]) this.anims[n] = this.set[n] ?? synthClip(this.set, n, this.rig.attacks);
    for (const [n, c] of Object.entries(this.set)) if (c && c.frames) this.anims[n] = c;
    if (this.cur) this.play(this.cur.name, { loop: this.cur.loop });
  }

  /** play(이름, { loop, then }) — 없는 동작 이름은 대기로(멈추지 않게). 한 번짜리 동작이 끝나면 then(기본 대기)으로. */
  play(name, opts = {}) {
    if (!this.anims[name]) name = 'idle';
    const clip = this.anims[name];
    const loop = opts.loop ?? clip.loop ?? false;
    this.cur = { name, clip, t: 0, loop, dur: clipDuration(clip), then: opts.then ?? (clip.stay ? null : 'idle'), done: false };
    return this;
  }

  update(dt) {
    const events = [];
    if (this.flashLeft > 0) this.flashLeft = Math.max(0, this.flashLeft - dt);
    const c = this.cur, s = dt * this.timeScale * (this.stageDef.speed || 1), d = c.dur;
    if (!c.done && s > 0) {
      let t0 = c.t, t1 = c.t + s;
      if (c.loop) {
        while (t1 > d) { events.push(...this.eventsBetween(c.clip, t0, d)); t1 -= d; t0 = -1e-9; }
        events.push(...this.eventsBetween(c.clip, t0, t1)); c.t = t1;
      } else {
        events.push(...this.eventsBetween(c.clip, t0, Math.min(t1, d)));
        c.t = Math.min(t1, d);
        if (t1 >= d) {
          c.done = true;
          events.push({ t: d, name: 'complete', data: c.name });
          if (c.then) { const next = c.then; this.emitAll(events); this.play(next, { loop: next === 'idle' ? true : undefined }); return events; }
        }
      }
    }
    this.emitAll(events);
    return events;
  }

  eventsBetween(clip, t0, t1) {
    return (clip.events || []).filter(([t]) => t > t0 && t <= t1).map(([t, name, data]) => ({ t, name, data }));
  }
  emitAll(events) { for (const e of events) for (const fn of this.listeners[e.name] || []) fn(e); }

  /** 지금 보여 줄 장의 순서(0부터). hold 장은 정해진 시간만큼 더 머묾. */
  frameIndex(clip = this.cur.clip, t = this.cur.t) {
    let acc = 0;
    for (let i = 0; i < clip.frames.length; i++) {
      acc += clip.durs[i] + (clip.hold && clip.hold.frame === i ? clip.hold.sec : 0);
      if (t < acc - 1e-9) return i;
    }
    return clip.frames.length - 1;
  }

  /**
   * 화면 그리는 쪽(DotView)이 읽는 값. dx·dy는 도트 단위 정수(오른쪽을 볼 때 기준, + = 앞/아래), alpha는 투명도.
   */
  getPose() {
    const c = this.cur, clip = c.clip, fx = clip.fx || {}, i = this.frameIndex();
    const u = c.dur > 0 ? Math.min(1, c.t / c.dur) : 0;
    let dx = 0, dy = 0, alpha = 1, white = this.flashLeft > 0;
    if (fx.bob) dy -= (i % 2) * fx.bob;
    if (fx.lunge) dx += i === 0 ? -1 : i === 3 ? fx.lunge : i === 4 ? Math.round(fx.lunge / 2) : 0;
    if (fx.recoil) dx -= i === 0 ? fx.recoil : 1;
    if (fx.sink) dy += Math.round(fx.sink * u);
    if (fx.alpha != null) alpha = 1 - (1 - fx.alpha) * u;
    if (fx.fadeIn) alpha = Math.min(1, 0.2 + u * 1.6);
    if (fx.hop) dy -= Math.round(fx.hop * Math.abs(Math.sin(Math.PI * 2 * u * (c.loop ? 1 : 2))));
    if (fx.flashAt != null && Math.abs(c.t - fx.flashAt) < 0.12) white = true;
    return { frame: clip.frames[i], index: i, dx, dy, alpha, white, silhouette: !!this.silhouette, facing: this.facing };
  }
}

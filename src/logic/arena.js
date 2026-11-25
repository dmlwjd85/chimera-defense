// 벨트스크롤 패싸움(작업기록 15): 가로 pos(타일) + 앞뒤 깊이 y(0 뒤 ~ 1 앞).
// 동물은 역할대로 표적을 골라 다가가고, 적은 시야 안 동물 쪽으로 방향을 틀며, 붙잡힌 적은 붙잡은 동물을 에워쌈.
import { effRange } from './mods.js';

const A = (cfg) => cfg.arena ?? null;
const DEF_DEPTH = 1.6;

/** Depth 0..1 of a unit or enemy (old saves / tests without y: from the lane, else the middle). */
export function depthOf(o) {
  if (o?.y != null) return o.y;
  if (o?.lane != null) return o.lane / 2;
  return 0.5;
}

/** Ground distance in tiles; anything in the air only counts the horizontal gap. */
export function dist(a, b, cfg) {
  const dx = a.pos - b.pos;
  if (a.flying || b.flying || a.stats?.flyer || b.stats?.flyer) return Math.abs(dx);
  const dy = (depthOf(a) - depthOf(b)) * (A(cfg)?.depth ?? DEF_DEPTH);
  return Math.hypot(dx, dy);
}

/** Starting depth for an enemy: spread over the field without using the battle rng (keeps old seeds stable). */
export function spawnDepth(eid) {
  return 0.12 + (((eid * 0.6180339887) % 1) * 0.76);
}

/** Depth for a camp row (0 back … rows-1 front). */
export function rowDepth(r, cfg) {
  const rows = cfg.grid?.rows ?? 3;
  return rows > 1 ? r / (rows - 1) : 0.5;
}

const reachOf = (state, u) => (u.stats.range <= 1 ? (state.meleeReach ?? 1) + Math.max(0, effRange(u) - 1) : effRange(u));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Where each ground animal should stand this moment of the wave (replaces the one-row brawl). */
export function steer(state, cfg, dt) {
  const a = A(cfg);
  if (!a) return;
  const foes = state.enemies.filter((e) => e.hp > 0);
  const ground = state.field.filter((u) => !u.down && !u.stats.flyer && u.slot != null);
  const plans = [];
  for (const u of ground) {
    u.engageCd = (u.engageCd ?? 0) - dt;
    if (u.engageCd > 0) continue;
    u.engageCd = a.retarget;
    const reach = reachOf(state, u);
    const canHit = (e) => !e.flying || u.stats.canHitFlying;
    // 이미 붙잡고 있거나 손 닿는 곳에 적이 있으면 그 자리에서 싸움
    if (foes.some((e) => e.blockedBy === u.uid)) continue;
    if (!u.moving && foes.some((e) => canHit(e) && dist(u, e, cfg) <= reach)) continue;
    const role = u.stats.role;
    const ranged = u.stats.range > 1;
    const lim = role === 'bruiser' || ranged ? a.leash : a.leashSoft ?? a.leash;
    const near = foes.filter((e) => canHit(e) && (!e.flying || ranged) && e.pos >= u.slot - a.back && e.pos <= u.slot + lim + reach);
    let goal = null;
    if (role === 'buffer' && !ranged) {
      const mates = ground.filter((o) => o !== u);
      if (mates.length) {
        const cx = mates.reduce((s, o) => s + o.pos, 0) / mates.length;
        const cy = mates.reduce((s, o) => s + depthOf(o), 0) / mates.length;
        goal = [cx - a.bufferBack, cy];
      }
    } else if (near.length) {
      let t;
      if (ranged) t = near.reduce((b, e) => (!b || e.pos < b.pos ? e : b), null);
      else if (role === 'bruiser') t = near.filter((e) => e.blockedBy == null).sort((x, y) => x.pos - y.pos)[0] ?? near.sort((x, y) => x.pos - y.pos)[0];
      else if (role === 'dealer') t = near.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp || dist(u, x, cfg) - dist(u, y, cfg))[0];
      else t = near.filter((e) => e.blockedBy != null).sort((x, y) => dist(u, x, cfg) - dist(u, y, cfg))[0] ?? near.sort((x, y) => dist(u, x, cfg) - dist(u, y, cfg))[0];
      if (t) {
        const ty = t.flying ? depthOf(u) : depthOf(t);
        if (ranged) goal = [t.pos - reach * 0.8, depthOf(u) + (ty - depthOf(u)) * 0.5];
        else {
          const side = role === 'dealer' ? (depthOf(u) <= ty ? -a.flank : a.flank) : 0;
          goal = [t.pos - (state.meleeReach ?? 1) * 0.6, ty + side];
        }
      }
    }
    if (!goal) goal = [u.slot, u.rowY ?? depthOf(u)];
    goal[0] = Math.max(u.slot - a.back, Math.min(u.slot + (role === 'bruiser' || ranged ? a.leash : a.leashSoft ?? a.leash), goal[0]));
    goal[0] = Math.min(cfg.pathLength - 0.5, Math.max(0.5, goal[0]));
    goal[1] = clamp01(goal[1]);
    plans.push([u, goal]);
  }
  // 겹치지 않게: 이미 서 있거나 가려는 동물과 spacing 이상 떨어뜨림
  const D = a.depth ?? DEF_DEPTH;
  for (const [u, g] of plans) {
    for (let k = 0; k < 4; k++) {
      const hit = ground.find((o) => o !== u && Math.hypot(o.targetPos - g[0], ((o.targetY ?? depthOf(o)) - g[1]) * D) < a.spacing);
      if (!hit) break;
      const hy = hit.targetY ?? depthOf(hit);
      const dy = g[1] - hy || (u.uid % 2 ? 0.01 : -0.01);
      const dx = g[0] - hit.targetPos;
      const len = Math.hypot(dx, dy * D) || 1;
      g[0] = hit.targetPos + (dx / len) * a.spacing;
      g[1] = clamp01(hy + ((dy * D) / len) * a.spacing / D);
    }
    if (Math.abs(g[0] - u.targetPos) > a.hysteresis || Math.abs(g[1] - (u.targetY ?? depthOf(u))) * D > a.hysteresis) {
      u.targetPos = g[0]; u.targetY = g[1]; u.formationMove = true;
    }
  }
}

/** Free enemies turn toward the animal in front of them; held enemies gather around the animal holding them. */
export function driftEnemies(state, cfg, dt) {
  const a = A(cfg);
  if (!a) return;
  const byUid = new Map(state.field.map((u) => [u.uid, u]));
  const ring = a.ring ?? [0];
  const held = new Map();
  for (const e of state.enemies) {
    if (e.flying || e.hp <= 0) continue;
    e.y ??= spawnDepth(e.eid);
    let want = null, speed = a.drift;
    const b = e.blockedBy == null ? null : byUid.get(e.blockedBy);
    if (b && !b.stats.flyer) {
      const i = held.get(b.uid) ?? 0; held.set(b.uid, i + 1);
      want = depthOf(b) + ring[i % ring.length];
      speed = a.pinDrift;
    } else if (e.confuseLeft <= 0 && !(e.stunLeft > 0) && !(e.holdLeft > 0)) {
      // 앞에 선 동물 중 가깝고(가로+깊이) 붙잡을 자리가 남은 쪽을 고름
      let best = null, bd = Infinity;
      const D = a.depth ?? DEF_DEPTH;
      for (const u of state.field) {
        if (u.down || u.stats.flyer || e.passed?.includes(u.uid)) continue;
        const dx = e.pos - u.pos;
        if (dx < -0.2 || dx > a.sight) continue;
        const full = state.enemies.some((o) => o.blockedBy === u.uid) ? 0.6 : 0;
        const score = dx + Math.abs(depthOf(u) - e.y) * D * 0.7 + full;
        if (score < bd) { bd = score; best = u; }
      }
      if (best) want = depthOf(best);
    }
    if (want == null) continue;
    want = clamp01(want);
    const step = speed * dt;
    e.y = Math.abs(want - e.y) <= step ? want : e.y + Math.sign(want - e.y) * step;
  }
}

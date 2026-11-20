import { auraMultipliers, tickEnemyTimers, enemyVelocity, damageAgainst, applyOnHit, evades, tickUnitSkills, tickHealers, findEffect } from './effects.js';

const standing = (u) => !u.down && !u.moving;
const usedSlots = (state, uid) => state.enemies.reduce((s, e) => s + (e.blockedBy === uid ? e.blockSlots : 0), 0);
const releaseBy = (state, uid) => { for (const e of state.enemies) if (e.blockedBy === uid) e.blockedBy = null; };

/** Advance combat by dt seconds (no spawning, no wave flow). */
export function combatTick(state, data, dt) {
  const cfg = data.config;
  for (const u of state.field) {
    if (u.down) continue;
    const gap = u.targetPos - u.pos;
    const stepLen = cfg.unitMoveSpeed * dt;
    u.moving = Math.abs(gap) > 1e-9;
    u.pos = Math.abs(gap) <= stepLen ? u.targetPos : u.pos + Math.sign(gap) * stepLen;
    if (u.moving) releaseBy(state, u.uid);
  }
  for (const u of state.field) {
    if (!u.down) continue;
    u.respawnLeft -= dt;
    if (u.respawnLeft <= 0) Object.assign(u, { down: false, hp: u.stats.hp, respawnLeft: 0, lastHitAt: state.time, attackCd: 0 });
  }
  const auras = auraMultipliers(state);
  tickEnemyTimers(state, dt);
  const byUid = new Map(state.field.map((u) => [u.uid, u]));
  for (const e of state.enemies) {
    const b = e.blockedBy === null ? null : byUid.get(e.blockedBy);
    if (e.blockedBy !== null && (!b || !standing(b))) e.blockedBy = null;
  }
  for (const e of state.enemies) e.pos = Math.min(cfg.pathLength, e.pos + enemyVelocity(e) * dt);
  const free = state.enemies.filter((e) => e.blockedBy === null && !e.flying && e.hp > 0).sort((a, b) => a.pos - b.pos);
  for (const e of free) {
    let best = null;
    for (const u of state.field) {
      if (!standing(u)) continue;
      const d = e.pos - u.pos;
      if (d < 0 || d > cfg.blockReach || usedSlots(state, u.uid) + e.blockSlots > u.stats.block) continue;
      if (!best || d < e.pos - best.pos) best = u;
    }
    if (best) { e.blockedBy = best.uid; e.pos = best.pos + cfg.blockedOffset; }
  }
  for (const e of state.enemies) {
    if (e.blockedBy === null || e.holdLeft > 0 || e.stunLeft > 0) continue;
    e.attackCd -= dt;
    if (e.attackCd > 0) continue;
    e.attackCd += e.interval;
    const b = byUid.get(e.blockedBy);
    hitUnit(state, data, b, e.attack);
    if (e.boss) for (const o of state.field) if (o !== b && !o.down && Math.abs(o.pos - b.pos) <= 1) hitUnit(state, data, o, e.attack);
  }
  for (const u of state.field) {
    if (!standing(u)) continue;
    u.attackCd = Math.max(0, u.attackCd - dt);
    if (u.attackCd > 0) continue;
    const target = pickTarget(state, u);
    if (!target) continue;
    const m = auras.get(u.uid) ?? { dmgMult: 1, intervalMult: 1 };
    u.attackCd = u.stats.interval * m.intervalMult;
    const hits = u.stats.aoeRadius > 0
      ? state.enemies.filter((e) => e.hp > 0 && Math.abs(e.pos - target.pos) <= u.stats.aoeRadius && (!e.flying || u.stats.canHitFlying))
      : [target];
    for (const e of hits) e.hp -= damageAgainst(u, e, u.stats.damage * m.dmgMult);
    applyOnHit(state, u, hits, target, cfg);
    state.events.push({ type: 'attack', uid: u.uid, eid: target.eid });
  }
  tickUnitSkills(state, dt, cfg);
  tickHealers(state, dt);
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp <= 0) {
      const killer = e.lastHitBy === null ? null : byUid.get(e.lastHitBy);
      const gold = e.gold + (killer ? findEffect(killer, 'goldBonus')?.amount ?? 0 : 0);
      state.gold += gold;
      state.events.push({ type: 'kill', eid: e.eid, id: e.id, gold });
    } else if (e.pos <= 0) {
      state.life -= e.leak;
      state.events.push({ type: 'leak', eid: e.eid, id: e.id, leak: e.leak });
    } else alive.push(e);
  }
  state.enemies = alive;
  for (const u of state.field) {
    if (!u.down && state.time - u.lastHitAt >= cfg.regen.delay) u.hp = Math.min(u.stats.hp, u.hp + u.stats.hp * cfg.regen.percentPerSec / 100 * dt);
  }
}

/** Target for a unit: its blocked enemy first, else the hittable enemy nearest the defense line. */
export function pickTarget(state, u) {
  let best = null;
  for (const e of state.enemies) if (e.hp > 0 && e.blockedBy === u.uid && (!best || e.pos < best.pos)) best = e;
  if (best) return best;
  for (const e of state.enemies) {
    if (e.hp <= 0 || Math.abs(e.pos - u.pos) > u.stats.range || (e.flying && !u.stats.canHitFlying)) continue;
    if (!best || e.pos < best.pos) best = e;
  }
  return best;
}

/** Deal damage to a unit, handling evade, damage reduction and going down. */
export function hitUnit(state, data, u, amount) {
  if (evades(state, u)) return;
  const cut = findEffect(u, 'damageTakenDown');
  u.hp -= cut ? amount * (1 - cut.percent / 100) : amount;
  u.lastHitAt = state.time;
  if (u.hp > 0) return;
  Object.assign(u, { hp: 0, down: true, respawnLeft: u.stats.respawn });
  releaseBy(state, u.uid);
  state.events.push({ type: 'down', uid: u.uid });
}

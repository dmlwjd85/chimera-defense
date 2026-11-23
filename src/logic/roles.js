// 역할 손맛: 브루저는 든든하게 막고 몸을 던져 가로막음, 딜러는 빠르고 다양한 연계, 버퍼는 체감되는 응원.
import { damageEnemy } from './combat.js';
import { effDamage } from './mods.js';

export const roleOf = (u) => u?.stats?.role ?? null;
const R = (data) => data.config.roles ?? null;

/** Role stat changes and buffer auras/cheers. Called from computeMods for field units. */
export function applyRoleMods(state, data) {
  const rc = R(data);
  if (!rc) return;
  const field = state.field.filter((u) => !u.down);
  for (const u of state.field) {
    const r = rc[roleOf(u)];
    if (r?.mods) for (const [s, v] of Object.entries(r.mods)) u.mods[s] += v;
    // 버티기 자세: 둘 이상 막고 있으면 받는 피해가 더 줄어듦
    if (roleOf(u) === 'bruiser' && state.enemies.filter((e) => e.blockedBy === u.uid && e.hp > 0).length >= rc.bruiser.brace.blocked) u.mods.taken += rc.bruiser.brace.taken;
  }
  // 버퍼 오라: 가장 센 것 하나만(겹치지 않음)
  const b = rc.buffer;
  if (b) {
    const buffers = field.filter((u) => roleOf(u) === 'buffer');
    for (const u of state.field) {
      if (!buffers.some((s) => s !== u && Math.abs(s.pos - u.pos) <= b.aura.tiles)) continue;
      u.mods.interval += b.aura.interval; u.mods.dmg += b.aura.dmg; u.roleAura = true;
    }
    if ((state.cheer?.left ?? 0) > 0) for (const u of state.field) { u.mods.interval += state.cheer.interval; u.mods.dmg += state.cheer.dmg; }
  }
}

/** Timers: buffer cheers. */
export function tickRoles(state, data, dt) {
  const rc = R(data);
  if (!rc) return;
  if (state.cheer) state.cheer.left -= dt;
  if (state.phase !== 'wave') return;
  const c = rc.buffer?.cheer;
  if (!c) return;
  for (const u of state.field) {
    if (u.down || roleOf(u) !== 'buffer') continue;
    u.cheerCd = (u.cheerCd ?? c.first) - dt;
    if (u.cheerCd > 0) continue;
    u.cheerCd = c.every;
    if (!state.enemies.some((e) => e.hp > 0)) continue;
    const k = 1 + (u.stage === 'spirit' || u.kind === 'chimera' ? c.spiritBonus : u.stage === 'adult' ? c.adultBonus : 0) / 100;
    const next = { left: c.dur, interval: c.interval * k, dmg: c.dmg * k, by: u.uid };
    if (!state.cheer || state.cheer.left <= 0 || next.dmg >= state.cheer.dmg) state.cheer = next; else state.cheer.left = Math.max(state.cheer.left, c.dur);
    state.events.push({ type: 'cheer', uid: u.uid, interval: Math.round(-next.interval), dmg: Math.round(next.dmg), dur: c.dur });
  }
}

/** Bruiser guard: a bruiser near the ally takes part of the blow. Returns the amount the ally still takes. */
export function guardShare(state, data, u, amount, attacker) {
  const g = R(data)?.bruiser?.guard;
  if (!g || roleOf(u) === 'bruiser') return amount;
  const guard = state.field.filter((o) => o !== u && !o.down && roleOf(o) === 'bruiser' && !o.stats.flyer && Math.abs(o.pos - u.pos) <= g.tiles && o.hp > (o.maxHp ?? o.stats.hp) * g.minHp / 100)
    .sort((a, b) => b.hp - a.hp)[0];
  if (!guard) return amount;
  const part = amount * g.share / 100;
  guard.hp -= part * (1 + (guard.mods?.taken ?? 0) / 100);
  guard.lastHitAt = state.time;
  if (state.time - (guard.guardShownAt ?? -9) > 1.2) { guard.guardShownAt = state.time; state.events.push({ type: 'guard', uid: guard.uid, ally: u.uid }); }
  return amount - part;
}

/** Bruisers dash when they go to block a leaker. */
export const moveMult = (data, u) => (roleOf(u) === 'bruiser' && u.intercept != null ? R(data)?.bruiser?.dashSpeed ?? 1 : 1);

/** Dealer combo after a normal attack: every Nth hit strikes twice, every Mth is a finisher shaped by how it attacks. */
export function dealerCombo(state, data, u, target, hits) {
  const c = R(data)?.dealer?.combo;
  if (!c || roleOf(u) !== 'dealer' || target.hp <= 0 && !hits.length) return;
  u.comboN = (u.comboN ?? 0) + 1;
  const base = effDamage(u), cfg = data.config;
  if (u.comboN % c.finisher === 0) {
    const style = u.stats.flyer ? 'dive' : u.stats.range <= 1 ? 'spin' : 'pierce';
    const near = (r) => state.enemies.filter((e) => e.hp > 0 && (u.stats.flyer || u.stats.range > 1 || !e.flying) && Math.abs(e.pos - target.pos) <= r);
    let list = [];
    if (style === 'spin') list = near(c.spinRadius);
    else if (style === 'dive') list = near(c.diveRadius);
    else list = state.enemies.filter((e) => e.hp > 0 && e.pos >= target.pos - 0.1 && e.pos <= target.pos + c.pierceLen).sort((a, b) => a.pos - b.pos).slice(0, c.pierceCount);
    if (!list.includes(target) && target.hp > 0) list.unshift(target);
    for (const e of list) {
      damageEnemy(state, e, base * c.finMult, true, u.uid);
      if (style === 'dive' && !e.boss) e.stunLeft = Math.max(e.stunLeft, c.diveStun);
      if (style === 'spin' && !e.boss) { e.pos = Math.min(cfg.pathLength, e.pos + c.spinPush); e.blockedBy = null; }
    }
    state.events.push({ type: 'combo', uid: u.uid, kind: 'finisher', style, eid: target.eid, eids: list.map((e) => e.eid) });
  } else if (u.comboN % c.double === 0 && target.hp > 0) {
    damageEnemy(state, target, base * c.doubleMult, false, u.uid);
    state.events.push({ type: 'combo', uid: u.uid, kind: 'double', eid: target.eid });
  }
}

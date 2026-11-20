const TIMERS = ['holdLeft', 'stunLeft', 'slowLeft', 'poisonLeft', 'confuseLeft'];

/** First effect of a type on a unit, or null. */
export function findEffect(unit, type) {
  return unit.stats.effects.find((e) => e.type === type) ?? null;
}

const alive = (u) => !u.down;
const blockedByUnit = (state, uid) => state.enemies.filter((e) => e.blockedBy === uid);

/** Per-unit damage/interval multipliers from aura and haste (strongest only, no stacking). */
export function auraMultipliers(state) {
  const best = new Map(state.field.map((u) => [u.uid, { aura: 0, haste: 0 }]));
  for (const src of state.field.filter(alive)) {
    for (const type of ['aura', 'haste']) {
      const eff = findEffect(src, type);
      if (!eff) continue;
      for (const u of state.field) {
        if (alive(u) && Math.abs(u.pos - src.pos) <= eff.radius) best.get(u.uid)[type] = Math.max(best.get(u.uid)[type], eff.percent);
      }
    }
  }
  const out = new Map();
  for (const [uid, b] of best) out.set(uid, { dmgMult: 1 + b.aura / 100, intervalMult: 1 - b.haste / 100 });
  return out;
}

/** Apply poison and count down status timers and boss charge. */
export function tickEnemyTimers(state, dt) {
  for (const e of state.enemies) {
    if (e.poisonLeft > 0) e.hp -= e.poisonDps * Math.min(dt, e.poisonLeft);
    for (const k of TIMERS) e[k] = Math.max(0, e[k] - dt);
    if (e.slowLeft === 0) e.slowPct = 0;
    if (e.poisonLeft === 0) e.poisonDps = 0;
    const p = e.pattern;
    if (p?.type === 'charge' && e.hp <= e.maxHp * p.belowHpPercent / 100) {
      e.chargeLeft = Math.max(0, e.chargeLeft - dt);
      e.chargeCd -= dt;
      if (e.chargeCd <= 0) {
        e.chargeLeft = p.duration;
        e.chargeCd = p.every;
      }
    }
  }
}

/** Enemy velocity in tiles/s this tick; negative walks toward the defense line. */
export function enemyVelocity(e) {
  if (e.blockedBy !== null || e.holdLeft > 0 || e.stunLeft > 0) return 0;
  let v = e.chargeLeft > 0 ? e.pattern.speed : e.speed;
  if (e.slowLeft > 0) v *= 1 - (e.slowPct / 100) * e.slowFactor;
  return e.confuseLeft > 0 ? v : -v;
}

/** Damage after bonusVs effects (all matching bonuses multiply). */
export function damageAgainst(unit, e, baseDamage) {
  let dmg = baseDamage;
  for (const b of unit.stats.effects) {
    if (b.type !== 'bonusVs') continue;
    if ((b.target === 'flying' && e.flying) || (b.target === 'fullHp' && e.hp >= e.maxHp)) dmg *= 1 + b.percent / 100;
  }
  return dmg;
}

/** On-hit effects after one attack: slow, poison, stun, and knockback on the primary target. */
export function applyOnHit(state, unit, hitEnemies, primary, config) {
  const slow = findEffect(unit, 'slow');
  const poison = findEffect(unit, 'poison');
  const stun = findEffect(unit, 'stunOnHit');
  for (const e of hitEnemies) {
    e.lastHitBy = unit.uid;
    if (slow) {
      e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, slow.percent);
      e.slowLeft = Math.max(e.slowLeft, slow.duration);
    }
    if (poison) {
      e.poisonDps = Math.max(e.poisonLeft > 0 ? e.poisonDps : 0, poison.dps);
      e.poisonLeft = poison.duration;
    }
    if (stun) e.stunLeft = Math.max(e.stunLeft, stun.duration);
  }
  const kb = findEffect(unit, 'knockback');
  if (!kb) return;
  unit.attackCount = (unit.attackCount ?? 0) + 1;
  if (unit.attackCount % kb.every !== 0 || !primary || primary.boss) return;
  primary.pos = Math.min(config.pathLength, primary.pos + kb.tiles);
  primary.blockedBy = null;
  if (kb.stun > 0) primary.stunLeft = Math.max(primary.stunLeft, kb.stun);
}

/** Roll the unit's evade chance. */
export function evades(state, unit) {
  const ev = findEffect(unit, 'evade');
  return ev ? state.rng() < ev.percent / 100 : false;
}

const nearest = (list) => list.reduce((best, e) => (!best || e.pos < best.pos ? e : best), null);
const byPos = (a, b) => a.pos - b.pos;

/** Cooldown skills of standing units: hold, confuse, pull. */
export function tickUnitSkills(state, dt, config) {
  for (const u of state.field) {
    if (u.down || u.moving) continue;
    for (const k of Object.keys(u.skillCd)) u.skillCd[k] = Math.max(0, u.skillCd[k] - dt);
    const ready = (type) => (u.skillCd[type] ?? 0) <= 0;

    const hold = findEffect(u, 'hold');
    if (hold && ready('hold')) {
      const held = blockedByUnit(state, u.uid).sort(byPos).slice(0, hold.count);
      for (const e of held) e.holdLeft = Math.max(e.holdLeft, hold.duration * e.holdFactor);
      if (held.length) u.skillCd.hold = hold.cooldown;
    }

    const confuse = findEffect(u, 'confuse');
    if (confuse && ready('confuse')) {
      const picks = state.enemies
        .filter((e) => !e.boss && e.confuseLeft === 0 && Math.abs(e.pos - u.pos) <= u.stats.range)
        .sort(byPos).slice(0, confuse.targets);
      for (const e of picks) Object.assign(e, { confuseLeft: confuse.duration, blockedBy: null });
      if (picks.length) u.skillCd.confuse = confuse.cooldown;
    }

    const pull = findEffect(u, 'pull');
    if (pull && ready('pull')) {
      const room = u.stats.block - blockedByUnit(state, u.uid).reduce((s, e) => s + e.blockSlots, 0);
      const target = room < 1 ? null : nearest(state.enemies.filter((e) =>
        e.blockedBy === null && !e.flying && !e.boss && e.pos > u.pos + config.blockReach && e.pos <= u.pos + pull.range));
      if (target) {
        Object.assign(target, { pos: u.pos + config.blockedOffset, blockedBy: u.uid });
        u.skillCd.pull = pull.cooldown;
      }
    }
  }
}

/** Healer enemies restore a percent of max hp to nearby enemies on a timer. */
export function tickHealers(state, dt) {
  for (const h of state.enemies) {
    if (!h.heal || h.hp <= 0) continue;
    h.healCd -= dt;
    if (h.healCd > 0) continue;
    h.healCd = h.heal.every;
    for (const o of state.enemies) {
      if (o.hp > 0 && Math.abs(o.pos - h.pos) <= h.heal.radius) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * h.heal.percent / 100);
    }
  }
}

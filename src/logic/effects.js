// Small shared helpers for unit effects and enemy status timers.
const TIMERS = ['holdLeft', 'stunLeft', 'slowLeft', 'poisonLeft', 'confuseLeft', 'markLeft', 'shieldLeft'];

/** First effect of a type on a unit, or null. */
export function findEffect(unit, type) {
  return unit.stats.effects.find((e) => e.type === type) ?? null;
}

/** All effects of a type on a unit. */
export function effectsOf(unit, type) {
  return unit.stats.effects.filter((e) => e.type === type);
}

/** Apply poison and count down status timers and boss patterns that only need time. */
export function tickEnemyTimers(state, dt) {
  for (const e of state.enemies) {
    if (e.poisonLeft > 0) e.hp -= e.poisonDps * Math.min(dt, e.poisonLeft);
    for (const k of TIMERS) e[k] = Math.max(0, (e[k] ?? 0) - dt);
    if (e.slowLeft === 0) e.slowPct = 0;
    if (e.poisonLeft === 0) e.poisonDps = 0;
    if (e.markLeft === 0) e.markPct = 0;
    const p = e.pattern;
    if (p?.type === 'charge' && e.hp <= e.maxHp * p.belowHpPercent / 100) {
      e.chargeLeft = Math.max(0, e.chargeLeft - dt);
      e.chargeCd -= dt;
      if (e.chargeCd <= 0) { e.chargeLeft = p.duration; e.chargeCd = p.every; }
    }
    if (p?.type === 'shield') {
      e.patternCd -= dt;
      if (e.patternCd <= 0) { e.patternCd = p.every; e.shieldLeft = p.duration; e.shieldHits = 0; state.events?.push({ type: 'shieldUp', eid: e.eid }); }
    }
  }
}

/** Enemy velocity in tiles/s this tick; negative walks toward the defense line. */
export function enemyVelocity(e) {
  if (e.blockedBy !== null || e.holdLeft > 0 || e.stunLeft > 0) return 0;
  let v = e.chargeLeft > 0 ? e.pattern.speed : e.speed;
  if (e.slowLeft > 0) v *= 1 - (e.slowPct / 100) * e.slowFactor;
  v *= e.speedMult ?? 1;
  return e.confuseLeft > 0 ? v : -v;
}

/** Healer enemies restore a percent of max hp to nearby enemies on a timer. */
export function tickHealers(state, dt) {
  for (const h of state.enemies) {
    if (!h.heal || h.hp <= 0) continue;
    h.healCd -= dt;
    if (h.healCd > 0) continue;
    h.healCd = h.heal.every;
    state.events?.push({ type: 'heal', eid: h.eid });
    for (const o of state.enemies) {
      if (o.hp > 0 && Math.abs(o.pos - h.pos) <= h.heal.radius) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * h.heal.percent / 100);
    }
  }
}

// One combat tick: movement, blocking, attacks, skills, traits, bonds, bosses, deaths (plan ch.2, 5, 7, 9).
import { findEffect, effectsOf, tickEnemyTimers, enemyVelocity, tickHealers } from './effects.js';
import { computeMods, effDamage, effInterval, effRange, effBlock, effAoe, cdMult, statusMult } from './mods.js';
import { makeEnemy } from './waves.js';

const standing = (u) => !u.down && !u.moving;
const usedSlots = (state, uid) => state.enemies.reduce((s, e) => s + (e.blockedBy === uid ? e.blockSlots : 0), 0);
const releaseBy = (state, uid) => { for (const e of state.enemies) if (e.blockedBy === uid) e.blockedBy = null; };
const flags = (u) => u.mods?.flags ?? {};
const isSwarm = (e) => e.id === 'swarm';

/** True while a unit does not attack or use skills (rest timers, rest cycles, rest conditions). */
export function isResting(u) {
  if (u.restLeft > 0 || u.mods?.rest) return true;
  const c = flags(u).restCycle;
  if (!c) return false;
  const t = (u.cycleT ?? 0) % c[0];
  return t >= c[0] - c[1];
}

/** Can unit u attack enemy e at all (range ignored)? */
function hittable(u, e) {
  if (e.hp <= 0) return false;
  if (e.flying && !u.stats.canHitFlying) return false;
  const f = flags(u);
  if (f.noHit === 'swarm' && isSwarm(e)) return false;
  if (f.cantHitBehind && e.pos < u.pos - 0.05) return false;
  if (f.cantHitClose && Math.abs(e.pos - u.pos) <= f.cantHitClose && e.blockedBy !== u.uid) return false;
  return true;
}

/** Target for a unit: its blocked enemy first, else the hittable enemy nearest the defense line. */
export function pickTarget(state, u) {
  let best = null;
  for (const e of state.enemies) if (e.blockedBy === u.uid && hittable(u, e) && (!best || e.pos < best.pos)) best = e;
  if (best) return best;
  const range = effRange(u);
  const inRange = state.enemies.filter((e) => hittable(u, e) && Math.abs(e.pos - u.pos) <= range);
  if (!inRange.length) return null;
  const mis = flags(u).misTarget;
  if (mis && inRange.length > 1 && state.rng() < mis / 100) return inRange[Math.floor(state.rng() * inRange.length)];
  return inRange.reduce((b, e) => (!b || e.pos < b.pos ? e : b), null);
}

function vsMatch(target, u, e, state) {
  switch (target) {
    case 'flying': return e.flying;
    case 'ground': return !e.flying;
    case 'boss': return e.boss;
    case 'normal': return !e.boss;
    case 'fullHp': return e.hp >= e.maxHp;
    case 'lowHp': return e.hp < e.maxHp / 2;
    case 'poisoned': return e.poisonLeft > 0;
    case 'held': return e.blockedBy === u.uid || e.holdLeft > 0;
    case 'ahead': return e.pos > u.pos;
    case 'lone': return e.blockedBy === u.uid && state.enemies.filter((o) => o.blockedBy === u.uid).length === 1;
    case 'wolfMarked': return state.time - (e.wolfHitAt ?? -99) < 1.5;
    default: return false;
  }
}

/** Damage of one hit of u on e, before shields. */
export function hitDamage(state, u, e) {
  let dmg = effDamage(u);
  let crit = u.mods?.crit ?? 0;
  for (const b of effectsOf(u, 'bonusVs')) if (vsMatch(b.target, u, e, state)) dmg *= 1 + b.percent / 100;
  for (const b of u.mods?.vs ?? []) {
    if (!vsMatch(b.target, u, e, state)) continue;
    if (b.dmg) dmg *= 1 + b.dmg / 100;
    if (b.crit) crit += b.crit;
  }
  const v = flags(u).variance;
  if (v) dmg *= 1 + (v[0] + state.rng() * (v[1] - v[0])) / 100;
  const st = findEffect(u, 'sameTargetStack');
  if (st) dmg *= 1 + Math.min(st.max, st.per * (u.sameTargetN ?? 0)) / 100;
  const ar = flags(u).afterRest;
  if (ar?.dmg && u.afterRestLeft > 0) dmg *= 1 + ar.dmg / 100;
  if (ar?.firstHit && u.firstHitReady) dmg *= ar.firstHit;
  if (e.markPct) dmg *= 1 + e.markPct / 100;
  if (crit > 0 && state.rng() < crit / 100) dmg *= 2;
  return Math.max(0, dmg);
}

/** Deal damage to an enemy, respecting the shadow boss shield (single hits are ignored, aoe hits break it). */
export function damageEnemy(state, e, amount, aoe, srcUid = null) {
  if (e.shieldLeft > 0) {
    if (!aoe) { state.events.push({ type: 'shielded', eid: e.eid }); return 0; }
    e.shieldHits = (e.shieldHits ?? 0) + 1;
    if (e.shieldHits >= (e.pattern?.breakHits ?? 5)) { e.shieldLeft = 0; state.events.push({ type: 'shieldBreak', eid: e.eid }); }
    return 0;
  }
  e.hp -= amount;
  if (srcUid !== null) e.lastHitBy = srcUid;
  return amount;
}

/** On-hit status effects: slow, poison, stun, wolf mark, knockback (every Nth attack). */
export function applyOnHit(state, u, hits, primary, cfg) {
  const slow = findEffect(u, 'slow'), poison = findEffect(u, 'poison'), stun = findEffect(u, 'stunOnHit'), mark = findEffect(u, 'mark');
  const sm = statusMult(u);
  for (const e of hits) {
    if (slow) { e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, slow.percent * sm); e.slowLeft = Math.max(e.slowLeft, slow.duration); }
    if (poison) { e.poisonDps = Math.max(e.poisonLeft > 0 ? e.poisonDps : 0, poison.dps * sm); e.poisonLeft = poison.duration; e.poisonBy = u.uid; }
    if (stun) e.stunLeft = Math.max(e.stunLeft, stun.duration);
    if (mark) { e.markPct = Math.max(e.markPct ?? 0, mark.percent); e.markLeft = mark.dur; }
    if (u.kind === 'base' && u.speciesId === 'wolf') e.wolfHitAt = state.time;
  }
  const kb = findEffect(u, 'knockback');
  if (!kb) return;
  u.attackCount = (u.attackCount ?? 0) + 1;
  if (u.attackCount % kb.every !== 0 || !primary || primary.boss) return;
  primary.pos = Math.min(cfg.pathLength, primary.pos + kb.tiles);
  primary.blockedBy = null;
  const st = Math.max(kb.stun ?? 0, flags(u).knockStun ?? 0);
  if (st > 0) primary.stunLeft = Math.max(primary.stunLeft, st);
  if (flags(u).restOnKnock) u.restLeft = Math.max(u.restLeft ?? 0, flags(u).restOnKnock);
  state.events.push({ type: 'knock', uid: u.uid, eid: primary.eid });
}

/** Deal damage to a unit, handling dodge, counter, ignored hits, damage taken, survive-once and going down. */
export function hitUnit(state, data, u, amount, attacker = null) {
  const f = flags(u);
  const evade = effectsOf(u, 'evade').reduce((s, e) => s + e.percent, 0) + (u.mods?.dodge ?? 0);
  if (evade > 0 && state.rng() < Math.min(75, evade) / 100) {
    state.events.push({ type: 'dodge', uid: u.uid });
    if (attacker && findEffect(u, 'counter') && !u.down) damageEnemy(state, attacker, effDamage(u), false, u.uid);
    return;
  }
  if (f.ignoreFirstHits && (u.ignoredHits ?? 0) < f.ignoreFirstHits) { u.ignoredHits = (u.ignoredHits ?? 0) + 1; return; }
  const cut = findEffect(u, 'damageTakenDown');
  let amt = amount * (1 + (u.mods?.taken ?? 0) / 100);
  if (cut) amt *= 1 - cut.percent / 100;
  u.hp -= Math.max(0, amt);
  u.lastHitAt = state.time;
  if (u.hp > 0) return;
  if (f.surviveOnce && !u.survived) { u.survived = true; u.hp = 1; state.events.push({ type: 'survive', uid: u.uid }); return; }
  const respawn = u.stats.respawn * Math.max(0.2, 1 + (u.mods?.respawn ?? 0) / 100);
  Object.assign(u, { hp: 0, down: true, respawnLeft: respawn, respawnMax: respawn, aliveTime: 0, sameTargetN: 0 });
  releaseBy(state, u.uid);
  if (f.downGold) { state.gold += f.downGold; state.events.push({ type: 'gold', uid: u.uid, gold: f.downGold }); }
  state.events.push({ type: 'down', uid: u.uid });
}

// ---------- unit skills ----------
function timerAction(state, data, u, s) {
  const cfg = data.config;
  const near = (r) => state.enemies.filter((e) => e.hp > 0 && Math.abs(e.pos - u.pos) <= r);
  switch (s.action) {
    case 'damageHeld': { const hs = state.enemies.filter((e) => e.blockedBy === u.uid); hs.forEach((e) => damageEnemy(state, e, s.amount, true, u.uid)); return hs.length > 0; }
    case 'flee': { const hs = near(s.radius).filter((e) => !e.boss && !e.flying); hs.forEach((e) => Object.assign(e, { confuseLeft: Math.max(e.confuseLeft, s.dur), blockedBy: null })); return hs.length > 0; }
    case 'pushHeld': {
      const hs = state.enemies.filter((e) => e.blockedBy === u.uid && !e.boss).slice(0, s.count ?? 99);
      for (const e of hs) { e.pos = Math.min(cfg.pathLength, e.pos + s.tiles); e.blockedBy = null; }
      return hs.length > 0;
    }
    case 'damageAll': { const hs = state.enemies.filter((e) => e.hp > 0 && !(s.normalOnly && e.boss)); hs.forEach((e) => damageEnemy(state, e, s.amount, true, u.uid)); return hs.length > 0; }
    case 'stunRadius': { const hs = near(s.radius); hs.forEach((e) => { e.stunLeft = Math.max(e.stunLeft, s.dur * (e.boss ? 0.5 : 1)); }); return hs.length > 0; }
    case 'allyBuff': state.allyBuffs.push({ stat: s.stat, percent: s.percent, left: s.dur, src: u.uid }); return true;
    case 'halveRespawn': { const d = state.field.find((o) => o.down && o.respawnLeft > 1); if (d) d.respawnLeft /= 2; return !!d; }
    default: return false;
  }
}

export function tickUnitSkills(state, data, dt) {
  const cfg = data.config;
  for (const u of state.field) {
    if (u.down) continue;
    for (const k of Object.keys(u.skillCd)) u.skillCd[k] = Math.max(0, u.skillCd[k] - dt);
    // hp-triggered stances run even while walking or resting
    for (const [i, h] of effectsOf(u, 'hpTrigger').entries()) {
      const key = 'hp' + i;
      if ((u.skillCd[key] ?? 0) <= 0 && u.hp < (u.maxHp ?? u.stats.hp) * h.below / 100) {
        u.temp.push({ left: h.dur, mods: h.mods, regen: h.regenPct ?? 0, name: h.name });
        u.skillCd[key] = h.cooldown * cdMult(u);
        state.events.push({ type: 'skill', uid: u.uid, name: h.name });
      }
    }
    if (u.moving || isResting(u)) continue;
    const ready = (k) => (u.skillCd[k] ?? 0) <= 0;
    const cm = cdMult(u);

    const hold = findEffect(u, 'hold');
    if (hold && ready('hold')) {
      const held = state.enemies.filter((e) => e.blockedBy === u.uid && e.holdLeft <= 0).sort((a, b) => a.pos - b.pos).slice(0, hold.count);
      if (held.length) {
        let dur = hold.duration * (1 + (u.mods?.holdDur ?? 0) / 100);
        if (!u.heldThisWave) dur *= 1 + (u.mods?.firstHoldDur ?? 0) / 100;
        u.heldThisWave = true;
        const burst = findEffect(u, 'holdBurst');
        const mult = flags(u).holdBurstMult ?? 1;
        const burstDmg = burst ? burst.amount * mult : mult > 1 ? effDamage(u) * mult : 0;
        for (const e of held) {
          e.holdLeft = Math.max(e.holdLeft, dur * e.holdFactor);
          if (burstDmg > 0) damageEnemy(state, e, burstDmg, true, u.uid);
        }
        u.skillCd.hold = hold.cooldown * cm;
        state.events.push({ type: 'hold', uid: u.uid });
      }
    }

    const confuse = findEffect(u, 'confuse');
    if (confuse && ready('confuse')) {
      const range = effRange(u);
      const picks = state.enemies.filter((e) => !e.boss && e.confuseLeft === 0 && e.hp > 0 && Math.abs(e.pos - u.pos) <= range)
        .sort((a, b) => a.pos - b.pos).slice(0, confuse.targets);
      for (const e of picks) Object.assign(e, { confuseLeft: confuse.duration, blockedBy: null });
      if (picks.length) { u.skillCd.confuse = confuse.cooldown * cm; state.events.push({ type: 'skill', uid: u.uid, name: '홀리기' }); }
    }

    const pull = findEffect(u, 'pull');
    if (pull && ready('pull')) {
      const room = effBlock(u) - usedSlots(state, u.uid);
      const cands = room < 1 ? [] : state.enemies.filter((e) =>
        e.blockedBy === null && !e.flying && !e.boss && e.hp > 0 && e.pos > u.pos + cfg.blockReach && e.pos <= u.pos + pull.range);
      const target = cands.reduce((b, e) => (!b || e.pos < b.pos ? e : b), null);
      if (target) {
        Object.assign(target, { pos: u.pos + cfg.blockedOffset, blockedBy: u.uid });
        if (pull.stun) target.stunLeft = Math.max(target.stunLeft, pull.stun);
        u.skillCd.pull = (pull.cooldown + (u.mods?.pullCdAdd ?? 0)) * cm;
        state.events.push({ type: 'skill', uid: u.uid, name: '혀 낚시' });
      }
    }

    for (const [i, s] of effectsOf(u, 'timerSkill').entries()) {
      const key = 't' + i;
      if (u.skillCd[key] === undefined) u.skillCd[key] = s.every * cm;
      if (!ready(key)) continue;
      const used = timerAction(state, data, u, s);
      u.skillCd[key] = used ? s.every * cm : 0.5;
      if (used) state.events.push({ type: 'skill', uid: u.uid, name: s.name ?? '' });
    }
  }
}

/** Effects that fire when a wave starts (rooster call, legend passive, wave counters). */
export function onWaveStart(state, data) {
  for (const u of state.field) {
    u.ignoredHits = 0; u.heldThisWave = false; u.waveStartPos = u.pos;
    for (const s of effectsOf(u, 'waveStartBuff')) state.allyBuffs.push({ stat: s.stat, percent: s.percent, left: s.dur, src: u.uid });
  }
  for (const u of state.bench) if (u) { u.ignoredHits = 0; u.heldThisWave = false; }
}

/** Wave end: stay stacks (same spot), wave-end gold. */
export function onWaveEnd(state, data) {
  for (const u of state.field) {
    u.stayCount = u.waveStartPos !== undefined && Math.abs(u.pos - u.waveStartPos) < 0.01 ? (u.stayCount ?? 0) + 1 : 0;
    const g = u.mods?.waveEndGold ?? 0;
    if (g > 0) { state.gold += g; state.events.push({ type: 'gold', uid: u.uid, gold: g }); }
  }
  state.allyBuffs = [];
}

// ---------- tick ----------
/** Advance combat by dt seconds (no spawning, no wave flow). */
export function combatTick(state, data, dt) {
  const cfg = data.config;
  state.allyBuffs ??= [];
  for (const u of state.field) { u.temp ??= []; u.skillCd ??= {}; }
  const view = computeMods(state, data);
  state.view = view;
  for (const { bond } of view.bonds) {
    if (state.seenBonds && !state.seenBonds.has(bond.id)) { state.seenBonds.add(bond.id); state.finds?.bonds.push(bond.id); state.events.push({ type: 'bondNew', id: bond.id }); }
  }
  const byUid = new Map(state.field.map((u) => [u.uid, u]));
  // rooster legend: enemies that come near a rooster early in a wave run away once
  for (const u of state.field) {
    const f = flags(u).waveStartFlee;
    if (!f || u.down || state.phase !== 'wave' || state.waveTime > (cfg.roosterWindow ?? 15)) continue;
    for (const e of state.enemies) {
      if (e.boss || e.flying || e.fled || Math.abs(e.pos - u.pos) > f.radius) continue;
      Object.assign(e, { fled: true, confuseLeft: Math.max(e.confuseLeft, f.dur), blockedBy: null });
    }
  }

  // timers on units
  for (const u of state.field) {
    const wasResting = isResting(u);
    u.cycleT = (u.cycleT ?? 0) + (state.phase === 'wave' && !u.down ? dt : 0);
    u.restLeft = Math.max(0, (u.restLeft ?? 0) - dt);
    u.afterRestLeft = Math.max(0, (u.afterRestLeft ?? 0) - dt);
    for (const t of u.temp) t.left -= dt;
    u.temp = u.temp.filter((t) => t.left > 0);
    if (wasResting && !isResting(u) && flags(u).afterRest) { u.afterRestLeft = flags(u).afterRest.dur ?? 0; u.firstHitReady = !!flags(u).afterRest.firstHit; }
    if (!u.down) {
      u.aliveTime = (u.aliveTime ?? 0) + (state.phase === 'wave' ? dt : 0);
      const hd = findEffect(u, 'hundredDays');
      if (hd && !u.hundredDone && u.aliveTime >= hd.seconds) { u.hundredDone = true; state.events.push({ type: 'skill', uid: u.uid, name: '백일 수행' }); }
    }
  }
  for (const b of state.allyBuffs) b.left -= dt;
  state.allyBuffs = state.allyBuffs.filter((b) => b.left > 0);

  // movement
  for (const u of state.field) {
    if (u.down) continue;
    const gap = u.targetPos - u.pos;
    const speed = cfg.unitMoveSpeed * (findEffect(u, 'moveSpeed')?.mult ?? 1);
    const stepLen = speed * dt;
    const was = u.moving;
    u.moving = Math.abs(gap) > 1e-9;
    u.pos = Math.abs(gap) <= stepLen ? u.targetPos : u.pos + Math.sign(gap) * stepLen;
    if (u.moving) releaseBy(state, u.uid);
    if (was && Math.abs(u.targetPos - u.pos) < 1e-9) {
      u.moving = false;
      if (flags(u).restOnMove) u.restLeft = Math.max(u.restLeft, flags(u).restOnMove);
    }
  }
  for (const u of state.field) {
    if (!u.down) continue;
    u.respawnLeft -= dt;
    if (u.respawnLeft <= 0) Object.assign(u, { down: false, hp: u.maxHp ?? u.stats.hp, respawnLeft: 0, lastHitAt: state.time, attackCd: 0 });
  }

  tickEnemyTimers(state, dt);
  // boss summons
  for (const e of [...state.enemies]) {
    const p = e.pattern;
    if (p?.type !== 'summon' || e.hp <= 0) continue;
    e.patternCd -= dt;
    if (e.patternCd > 0) continue;
    e.patternCd = p.every;
    for (let k = 0; k < p.count; k++) {
      const m = makeEnemy(p.enemy, state.wave, state.stage, data, state.nextEid++, 0);
      m.pos = Math.min(cfg.pathLength, e.pos + 0.3 + k * 0.25);
      state.enemies.push(m);
    }
    state.events.push({ type: 'bossSummon', eid: e.eid });
  }

  for (const e of state.enemies) {
    const b = e.blockedBy === null ? null : byUid.get(e.blockedBy);
    if (e.blockedBy !== null && (!b || !standing(b))) e.blockedBy = null;
  }
  for (const e of state.enemies) e.pos = Math.min(cfg.pathLength + 2, e.pos + enemyVelocity(e) * dt);
  const free = state.enemies.filter((e) => e.blockedBy === null && !e.flying && e.hp > 0 && e.confuseLeft <= 0).sort((a, b) => a.pos - b.pos);
  for (const e of free) {
    let best = null;
    for (const u of state.field) {
      if (!standing(u)) continue;
      const d = e.pos - u.pos;
      if (d < 0 || d > cfg.blockReach || usedSlots(state, u.uid) + e.blockSlots > effBlock(u)) continue;
      if (!best || d < e.pos - best.pos) best = u;
    }
    if (best) { e.blockedBy = best.uid; e.pos = best.pos + cfg.blockedOffset; }
  }

  // enemy attacks
  for (const e of state.enemies) {
    if (e.blockedBy === null || e.holdLeft > 0 || e.stunLeft > 0 || e.hp <= 0) continue;
    e.attackCd -= dt;
    if (e.attackCd > 0) continue;
    e.attackCd += e.interval * (e.intervalMult ?? 1);
    const b = byUid.get(e.blockedBy);
    hitUnit(state, data, b, e.attack, e);
    if (e.boss) for (const o of state.field) if (o !== b && !o.down && Math.abs(o.pos - b.pos) <= 1) hitUnit(state, data, o, e.attack, e);
  }

  // unit attacks
  for (const u of state.field) {
    if (!standing(u)) continue;
    u.attackCd = Math.max(0, u.attackCd - dt);
    if (u.attackCd > 0 || isResting(u)) continue;
    const target = pickTarget(state, u);
    if (!target) continue;
    u.attackCd = effInterval(u);
    u.sameTargetN = u.lastTargetEid === target.eid ? (u.sameTargetN ?? 0) + 1 : 0;
    u.lastTargetEid = target.eid;
    const aoe = effAoe(u);
    const hits = aoe > 0
      ? state.enemies.filter((e) => hittable(u, e) && Math.abs(e.pos - target.pos) <= aoe)
      : [target];
    const multi = findEffect(u, 'multiShot')?.count ?? 1;
    for (let k = 0; k < multi; k++) for (const e of hits) damageEnemy(state, e, hitDamage(state, u, e), aoe > 0, u.uid);
    u.firstHitReady = false;
    if (flags(u).splashChance && state.rng() < flags(u).splashChance / 100) {
      const other = state.enemies.find((e) => e !== target && hittable(u, e) && Math.abs(e.pos - u.pos) <= effRange(u) + 1);
      if (other) { damageEnemy(state, other, hitDamage(state, u, other), false, u.uid); state.events.push({ type: 'splash', uid: u.uid, eid: other.eid }); }
    }
    applyOnHit(state, u, hits, target, cfg);
    state.events.push({ type: 'attack', uid: u.uid, eid: target.eid, aoe: aoe > 0 });
  }

  tickUnitSkills(state, data, dt);
  tickHealers(state, dt);

  // deaths and leaks
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp <= 0) {
      const killer = e.lastHitBy === null ? null : byUid.get(e.lastHitBy);
      let gold = e.gold;
      if (killer) {
        gold += (findEffect(killer, 'goldBonus')?.amount ?? 0) + (killer.mods?.killGold ?? 0);
        const fk = flags(killer);
        if (fk.restAfterKill) killer.restLeft = Math.max(killer.restLeft ?? 0, fk.restAfterKill);
        if (fk.killStack) killer.killStacks = (killer.killStacks ?? 0) + 1;
      }
      const holder = e.blockedBy === null ? null : byUid.get(e.blockedBy);
      if (holder && holder !== killer && flags(holder).heldKillGold) gold += flags(holder).heldKillGold;
      const poisoner = e.poisonLeft > 0 && e.poisonBy != null ? byUid.get(e.poisonBy) : null;
      if (poisoner && flags(poisoner).poisonSpread) {
        const next = state.enemies.filter((o) => o !== e && o.hp > 0).sort((a, b) => Math.abs(a.pos - e.pos) - Math.abs(b.pos - e.pos))[0];
        if (next && Math.abs(next.pos - e.pos) <= 2) Object.assign(next, { poisonDps: Math.max(next.poisonDps, e.poisonDps), poisonLeft: Math.max(next.poisonLeft, 3), poisonBy: poisoner.uid });
      }
      gold = Math.max(0, gold);
      state.gold += gold;
      state.kills = (state.kills ?? 0) + 1;
      if (e.boss && e.id !== 'miniboss') state.bossKilled = true;
      state.events.push({ type: 'kill', eid: e.eid, id: e.id, gold, boss: e.boss });
    } else if (e.pos <= 0) {
      state.life -= e.leak;
      if (e.boss && e.id !== 'miniboss') state.bossLeaked = true;
      state.events.push({ type: 'leak', eid: e.eid, id: e.id, leak: e.leak });
    } else alive.push(e);
  }
  state.enemies = alive;

  // regeneration
  for (const u of state.field) {
    if (u.down) continue;
    const max = u.maxHp ?? u.stats.hp;
    const extra = u.temp.reduce((s, t) => s + (t.regen ?? 0), 0);
    if (extra) u.hp = Math.min(max, u.hp + max * extra / 100 * dt);
    if (state.time - u.lastHitAt >= cfg.regen.delay) u.hp = Math.min(max, u.hp + max * cfg.regen.percentPerSec * (1 + (u.mods?.regen ?? 0) / 100) / 100 * dt);
  }
}

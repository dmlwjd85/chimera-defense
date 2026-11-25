// One combat tick: movement, blocking, attacks, skills, traits, bonds, bosses, deaths (plan ch.2, 5, 7, 9).
import { elementProc, addPatch, tickPatches } from './elements.js';
import { findEffect, effectsOf, tickEnemyTimers, enemyVelocity, tickHealers } from './effects.js';
import { computeMods, effDamage, effInterval, effRange, effBlock, effAoe, cdMult, statusMult } from './mods.js';
import { makeEnemy } from './waves.js';
import { soulOnHit, soulOnKill } from './soul.js';
import { guardShare, moveMult, dealerCombo, tickRoles } from './roles.js';
import { dist, steer, driftEnemies } from './arena.js';
import { tickMuster, rushMult, intoGate } from './muster.js';
import { pickMove, a2Of, chargeUlt, tickMoves, ultName } from './moves.js';

// 2D 거리(앞뒤 깊이 포함). state.arenaCfg 는 combatTick 이 넣어 둠
const gap = (state, a, b) => dist(a, b, { arena: state.arenaCfg });

const standing = (u) => !u.down && !u.moving && !u.inGate;
const usedSlots = (state, uid) => state.enemies.reduce((s, e) => s + (e.blockedBy === uid && !e.crowd ? e.blockSlots : 0), 0);
// 걸어가다 적과 부딪히면 그 자리에 멈춰 맞붙음(패싸움)
const halt = (u) => { u.targetPos = u.pos; u.targetY = u.y; u.moving = false; u.formationMove = false; u.rushing = false; u.via = null; };
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
  const range = u.stats.range <= 1 ? (state.meleeReach ?? 1) + Math.max(0, effRange(u) - 1) : effRange(u);
  const inRange = state.enemies.filter((e) => hittable(u, e) && gap(state, u, e) <= range);
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
  if (e.resist) dmg *= (u.stats.range <= 1 ? e.resist.melee : e.resist.ranged) ?? 1;
  if (e.weak && u.stats.element && e.weak.includes(u.stats.element)) dmg *= 1 + (state.weakBonus ?? 30) / 100;
  if (e.markPct) dmg *= 1 + e.markPct / 100;
  if (e.curseLeft > 0) dmg *= 1 + (state.curseBonus ?? 20) / 100;
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
  if (srcUid !== null) {
    e.lastHitBy = srcUid;
    const src = state.field?.find((x) => x.uid === srcUid);
    if (src && state.dmgRun) for (const book of [state.dmgWave, state.dmgRun]) { const r = (book[srcUid] ??= { name: src.stats.name, speciesId: src.speciesId, soul: !!src.soul, dmg: 0 }); r.dmg += Math.min(amount, e.hp + amount); r.name = src.stats.name; }
  }
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
    if (attacker && findEffect(u, 'counter') && !u.down) { damageEnemy(state, attacker, effDamage(u), false, u.uid); state.events.push({ type: 'counter', uid: u.uid, eid: attacker.eid }); }
    return;
  }
  if (f.ignoreFirstHits && (u.ignoredHits ?? 0) < f.ignoreFirstHits) { u.ignoredHits = (u.ignoredHits ?? 0) + 1; return; }
  const cut = findEffect(u, 'damageTakenDown');
  let amt = guardShare(state, data, u, amount, attacker) * (1 + (u.mods?.taken ?? 0) / 100);
  if (cut) amt *= 1 - cut.percent / 100;
  u.hp -= Math.max(0, amt);
  u.lastHitAt = state.time;
  if (data.config.moves) chargeUlt(u, data.config, 'hurt', 100 * Math.max(0, amt) / (u.maxHp ?? u.stats.hp));
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
  const hit = (hs) => { s.lastEids = hs.map((e) => e.eid); return hs.length > 0; };
  switch (s.action) {
    case 'damageHeld': { const hs = state.enemies.filter((e) => e.blockedBy === u.uid); hs.forEach((e) => damageEnemy(state, e, s.amount, true, u.uid)); return hit(hs); }
    case 'flee': { const hs = near(s.radius).filter((e) => !e.boss && !e.flying); hs.forEach((e) => Object.assign(e, { confuseLeft: Math.max(e.confuseLeft, s.dur), blockedBy: null })); return hit(hs); }
    case 'pushHeld': {
      const hs = state.enemies.filter((e) => e.blockedBy === u.uid && !e.boss).slice(0, s.count ?? 99);
      for (const e of hs) { e.pos = Math.min(cfg.pathLength, e.pos + s.tiles); e.blockedBy = null; }
      return hit(hs);
    }
    case 'damageAll': { const hs = state.enemies.filter((e) => e.hp > 0 && !(s.normalOnly && e.boss)); hs.forEach((e) => damageEnemy(state, e, s.amount, true, u.uid)); return hit(hs); }
    case 'stunRadius': { const hs = near(s.radius); hs.forEach((e) => { e.stunLeft = Math.max(e.stunLeft, s.dur * (e.boss ? 0.5 : 1)); }); return hit(hs); }
    case 'allyBuff': state.allyBuffs.push({ stat: s.stat, percent: s.percent, left: s.dur, src: u.uid }); s.lastEids = []; return true;
    case 'halveRespawn': { const d = state.field.find((o) => o.down && o.respawnLeft > 1); if (d) d.respawnLeft /= 2; s.lastEids = []; s.lastAlly = d?.uid; return !!d; }
    default: return false;
  }
}

/** 산군 필살기 연출이 끝난 뒤 데이터(units.json)에 정의된 어흥 효과와 번개 장판을 적용한다. */
export function applySangunUlt(state, data, uid) {
  const cfg = data.config;
  const u = state.field.find((x) => x.uid === uid && !x.down);
  if (!u) return [];
  const s = effectsOf(u, 'timerSkill').find((e) => e.action === 'flee');
  if (!s) return [];
  const used = timerAction(state, data, u, s);
  const eids = used ? (s.lastEids ?? []) : [];
  if (used) {
    state.events.push({ type: 'skill', uid: u.uid, name: s.name ?? '어흥', fx: s.action, eids, big: false });
    const t = state.enemies.find((e) => e.eid === eids[0]);
    addPatch(state, u, t ? t.pos : u.pos + 0.6, cfg);
  }
  return eids;
}

export function tickUnitSkills(state, data, dt) {
  const cfg = data.config;
  for (const u of state.field) {
    if (u.down || u.inGate) continue;
    for (const k of Object.keys(u.skillCd)) u.skillCd[k] = Math.max(0, u.skillCd[k] - dt);
    // hp-triggered stances run even while walking or resting
    for (const [i, h] of effectsOf(u, 'hpTrigger').entries()) {
      const key = 'hp' + i;
      if ((u.skillCd[key] ?? 0) <= 0 && u.hp < (u.maxHp ?? u.stats.hp) * h.below / 100) {
        u.temp.push({ left: h.dur, mods: h.mods, regen: h.regenPct ?? 0, name: h.name });
        u.skillCd[key] = h.cooldown * cdMult(u);
        state.events.push({ type: 'skill', uid: u.uid, name: h.name, fx: 'stance' });
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
        state.events.push({ type: 'hold', uid: u.uid, eids: held.map((e) => e.eid), burst: burstDmg > 0 });
      }
    }

    const confuse = findEffect(u, 'confuse');
    if (confuse && ready('confuse')) {
      const range = effRange(u);
      const picks = state.enemies.filter((e) => !e.boss && e.confuseLeft === 0 && e.hp > 0 && Math.abs(e.pos - u.pos) <= range)
        .sort((a, b) => a.pos - b.pos).slice(0, confuse.targets);
      for (const e of picks) Object.assign(e, { confuseLeft: confuse.duration, blockedBy: null });
      if (picks.length) { u.skillCd.confuse = confuse.cooldown * cm; state.events.push({ type: 'skill', uid: u.uid, name: '홀리기', fx: 'charm', eids: picks.map((e) => e.eid) }); }
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
        state.events.push({ type: 'skill', uid: u.uid, name: '혀 낚시', fx: 'tongue', eids: [target.eid] });
      }
    }

    for (const [i, s] of effectsOf(u, 'timerSkill').entries()) {
      const key = 't' + i;
      if (u.skillCd[key] === undefined) u.skillCd[key] = s.every * cm;
      if (!ready(key)) continue;
      if (state.deferSangunUlt && u.speciesId === 'tiger' && u.stage === 'spirit' && s.action === 'flee') {
        const hs = state.enemies.filter((e) => e.hp > 0 && Math.abs(e.pos - u.pos) <= s.radius && !e.boss && !e.flying);
        if (!hs.length) { u.skillCd[key] = 0.5; continue; }
        u.skillCd[key] = s.every * cm;
        state.events.push({ type: 'sangunUlt', uid: u.uid, name: s.name ?? '어흥', fx: s.action, radius: s.radius, dur: s.dur, eids: hs.map((e) => e.eid) });
        continue;
      }
      const used = timerAction(state, data, u, s);
      u.skillCd[key] = used ? s.every * cm : 0.5;
      if (used) {
        state.events.push({ type: 'skill', uid: u.uid, name: s.name ?? '', fx: s.action, eids: s.lastEids ?? [], ally: s.lastAlly, big: u.stage === 'spirit' || u.kind === 'chimera' });
        if (u.stage === 'spirit' || u.kind === 'chimera') { const t = state.enemies.find((e) => e.eid === (s.lastEids ?? [])[0]); addPatch(state, u, t ? t.pos : u.pos + 0.6, cfg); }
      }
    }
  }
}

/** Effects that fire when a wave starts (rooster call, legend passive, wave counters). */
export function onWaveStart(state, data) {
  for (const u of state.field) {
    u.ignoredHits = 0; u.heldThisWave = false; u.waveStartPos = u.pos;
    for (const s of effectsOf(u, 'waveStartBuff')) { state.allyBuffs.push({ stat: s.stat, percent: s.percent, left: s.dur, src: u.uid }); state.events.push({ type: 'skill', uid: u.uid, name: '꼬끼오', fx: 'crowCall' }); }
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
  state.arenaCfg = cfg.arena ?? null;
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
      state.events.push({ type: 'skill', uid: u.uid, name: '닭이 울면', fx: 'roosterFlee', eids: [e.eid] });
    }
  }

  // timers on units
  for (const u of state.field) {
    const wasResting = isResting(u);
    u.cycleT = (u.cycleT ?? 0) + (state.phase === 'wave' && !u.down ? dt : 0);
    u.restLeft = Math.max(0, (u.restLeft ?? 0) - dt);
    u.afterRestLeft = Math.max(0, (u.afterRestLeft ?? 0) - dt);
    tickMoves(u, dt);
    for (const t of u.temp) t.left -= dt;
    u.temp = u.temp.filter((t) => t.left > 0);
    if (wasResting && !isResting(u) && flags(u).afterRest) { u.afterRestLeft = flags(u).afterRest.dur ?? 0; u.firstHitReady = !!flags(u).afterRest.firstHit; }
    if (!u.down) {
      u.aliveTime = (u.aliveTime ?? 0) + (state.phase === 'wave' ? dt : 0);
      const hd = findEffect(u, 'hundredDays');
      if (hd && !u.hundredDone && u.aliveTime >= hd.seconds) { u.hundredDone = true; state.events.push({ type: 'skill', uid: u.uid, name: '백일 수행', fx: 'hundred' }); }
    }
  }
  for (const b of state.allyBuffs) b.left -= dt;
  state.allyBuffs = state.allyBuffs.filter((b) => b.left > 0);

  // 패싸움: 근접은 가까운 적(동료가 붙잡은 적 포함)에게 다가가 붙고, 원거리는 사거리 안으로 따라붙는다
  if (state.phase === 'wave') { if (cfg.muster) tickMuster(state, cfg, dt); if (cfg.arena) steer(state, cfg, dt); else if (cfg.brawl) brawl(state, cfg, dt); }

  // movement
  for (const u of state.field) {
    if (u.down || u.inGate) continue;
    const D = u.stats.flyer || !cfg.arena ? 0 : cfg.arena.depth;
    u.y ??= 0.5; u.targetY ??= u.y;
    if (!D) u.y = u.targetY;
    const gx = u.targetPos - u.pos, gy = (u.targetY - u.y) * D;
    const len = Math.hypot(gx, gy);
    const speed = cfg.unitMoveSpeed * (findEffect(u, 'moveSpeed')?.mult ?? 1) * moveMult(data, u) * rushMult(cfg, u);
    const stepLen = speed * dt;
    const was = u.moving;
    u.moving = len > 1e-9;
    if (len <= stepLen) { u.pos = u.targetPos; u.y = u.targetY; } else { u.pos += (gx / len) * stepLen; if (D) u.y += (gy / len) * stepLen / D; }
    if (u.moving) releaseBy(state, u.uid);
    if (was && Math.abs(u.targetPos - u.pos) < 1e-9 && Math.abs(u.targetY - u.y) < 1e-9) {
      u.moving = false;
      if (flags(u).restOnMove && !u.formationMove) u.restLeft = Math.max(u.restLeft, flags(u).restOnMove);
      u.formationMove = false;
    }
  }
  for (const u of state.field) {
    if (!u.down) continue;
    u.respawnLeft -= dt;
    if (u.respawnLeft <= 0) {
      Object.assign(u, { down: false, hp: u.maxHp ?? u.stats.hp, respawnLeft: 0, lastHitAt: state.time, attackCd: 0 });
      // 성문 출전: 쓰러졌던 동물은 성문 안에서 다시 일어나 자기 자리로 달려 나감
      if (cfg.muster && state.phase === 'wave') { releaseBy(state, u.uid); intoGate(u, cfg, state); }
    }
  }

  tickEnemyTimers(state, dt);
  tickPatches(state, cfg, dt);
  tickRoles(state, data, dt);
  for (const e of state.enemies) if (e.sandLeft > 0) e.sandLeft -= dt;
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

  const C = cfg.crowd;
  for (const e of state.enemies) {
    const b = e.blockedBy === null ? null : byUid.get(e.blockedBy);
    if (e.blockedBy !== null && (!b || !standing(b))) { e.blockedBy = null; e.crowd = false; }
    if (!e.crowd) continue;
    if (e.blockedBy === null) { e.crowd = false; continue; }
    // 달라붙어 싸우던 적: 막는 자리가 비면 정식으로 막힘, 아니면 잠시 뒤 밀치고 빠져나감
    if (usedSlots(state, e.blockedBy) + e.blockSlots <= effBlock(b)) { e.crowd = false; continue; }
    e.crowdLeft -= dt;
    if (e.crowdLeft <= 0) { (e.passed ??= []).push(e.blockedBy); state.events.push({ type: 'slip', eid: e.eid, uid: e.blockedBy }); e.blockedBy = null; e.crowd = false; }
  }
  for (const e of state.enemies) e.pos = Math.min(cfg.pathLength + 2, e.pos + enemyVelocity(e) * dt);
  if (cfg.arena) driftEnemies(state, cfg, dt);
  const free = state.enemies.filter((e) => e.blockedBy === null && !e.flying && e.hp > 0 && e.confuseLeft <= 0).sort((a, b) => a.pos - b.pos);
  for (const e of free) {
    let best = null;
    for (const u of state.field) {
      if (!(cfg.arena && u.stats.role === 'bruiser' ? !u.down && !u.inGate && !u.stats.flyer : standing(u))) continue;
      const dx = e.pos - u.pos, d = gap(state, e, u);
      if (dx < -0.15 || d > cfg.blockReach || usedSlots(state, u.uid) + e.blockSlots > effBlock(u)) continue;
      if (!best || d < gap(state, e, best)) best = u;
    }
    if (best) { e.blockedBy = best.uid; e.pos = best.pos + cfg.blockedOffset; if (cfg.arena && best.moving) halt(best); continue; }
    // 자리가 다 찼어도 그냥 지나가지 않음: 앞을 막아선 동물에게 달라붙어 한동안 치고받다가 밀치고 나감(동물마다 한 번)
    if (!C || (e.passed?.length ?? 0) >= C.maxTimes) continue;
    let near = null;
    for (const u of state.field) {
      if (!(cfg.arena && u.stats.role === 'bruiser' ? !u.down && !u.inGate : standing(u)) || u.stats.flyer || e.passed?.includes(u.uid)) continue;
      const dx = e.pos - u.pos, d = gap(state, e, u);
      if (dx < -0.15 || d > cfg.blockReach) continue;
      if (!near || d < gap(state, e, near)) near = u;
    }
    if (near) { Object.assign(e, { blockedBy: near.uid, crowd: true, crowdLeft: C.hold * (e.boss ? C.bossK : 1), pos: near.pos + cfg.blockedOffset }); if (cfg.arena && near.moving) halt(near); }
  }

  // enemy attacks
  for (const e of state.enemies) {
    if (e.blockedBy === null || e.holdLeft > 0 || e.stunLeft > 0 || e.hp <= 0) continue;
    e.attackCd -= dt;
    if (e.attackCd > 0) continue;
    e.attackCd += e.interval * (e.intervalMult ?? 1) * (e.sandLeft > 0 ? 1 + cfg.patches.defs.sand.enemy.attackSlow / 100 : 1);
    const b = byUid.get(e.blockedBy);
    state.events.push({ type: 'enemyAttack', eid: e.eid });
    hitUnit(state, data, b, e.attack, e);
    if (e.boss) for (const o of state.field) if (o !== b && !o.down && !o.stats.flyer && gap(state, o, b) <= 1) hitUnit(state, data, o, e.attack, e);
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
    // 기술 고르기(config.moves): 기본1·기본2·속성·필살기 — 조건에 따라 가중치가 바뀌는 무작위
    const move = cfg.moves ? pickMove(state, u, target, cfg) : 'a1';
    const a2 = move === 'a2' ? a2Of(u, cfg) : null;
    const MV = cfg.moves ?? {};
    let mult = 1, reps = 1;
    if (a2) { mult = a2.mult ?? 1; reps = a2.hits ?? 1; }
    if (move === 'el') mult = MV.el?.mult ?? 1;
    if (move === 'ult') mult = MV.ult?.mult ?? 2.5;
    const aoe = Math.max(effAoe(u), move === 'ult' ? MV.ult?.aoe ?? 1 : 0);
    const hits = aoe > 0
      ? state.enemies.filter((e) => hittable(u, e) && gap(state, e, target) <= aoe)
      : [target];
    const multi = findEffect(u, 'multiShot')?.count ?? 1;
    for (let r = 0; r < reps; r++) for (let k = 0; k < multi; k++) for (const e of hits) { if (e.hp > 0 || r === 0) damageEnemy(state, e, hitDamage(state, u, e) * mult * (move === 'ult' && e !== target ? MV.ult?.splash ?? 0.5 : 1), aoe > 0, u.uid); }
    u.firstHitReady = false;
    if (a2?.push && !target.boss && target.hp > 0) { target.pos = Math.min(cfg.pathLength, target.pos + a2.push); }
    if (a2?.stun && target.hp > 0) target.stunLeft = Math.max(target.stunLeft ?? 0, target.boss ? a2.stun / 3 : a2.stun);
    if (a2?.healAlly) { const mate = state.field.filter((o) => !o.down && !o.inGate && o !== u).sort((x, y) => x.hp / (x.maxHp ?? x.stats.hp) - y.hp / (y.maxHp ?? y.stats.hp))[0]; if (mate) mate.hp = Math.min(mate.maxHp ?? mate.stats.hp, mate.hp + (mate.maxHp ?? mate.stats.hp) * a2.healAlly / 100); }
    if (flags(u).splashChance && state.rng() < flags(u).splashChance / 100) {
      const other = state.enemies.find((e) => e !== target && hittable(u, e) && Math.abs(e.pos - u.pos) <= effRange(u) + 1);
      if (other) { damageEnemy(state, other, hitDamage(state, u, other), false, u.uid); state.events.push({ type: 'splash', uid: u.uid, eid: other.eid }); }
    }
    applyOnHit(state, u, hits, target, cfg);
    if (move === 'el' || move === 'ult') { elementProc(state, u, target, hits, cfg, true); if (move === 'el') u.elCd = MV.rules?.el?.cooldown ?? 4; }
    else elementProc(state, u, target, hits, cfg);
    if (move === 'ult') { u.ultGauge = 0; state.events.push({ type: 'ult', uid: u.uid, eid: target.eid, name: ultName(u, cfg), eids: hits.map((e) => e.eid) }); }
    else if (cfg.moves) chargeUlt(u, cfg, 'hit');
    soulOnHit(state, data, u, target, hits);
    dealerCombo(state, data, u, target, hits);
    state.events.push({ type: 'attack', uid: u.uid, eid: target.eid, aoe: aoe > 0, eids: hits.map((e) => e.eid), move, moveName: a2?.name ?? (move === 'el' ? cfg.elements?.defs?.[u.stats.element]?.name + ' 공격' : null), hits: reps });
  }

  tickUnitSkills(state, data, dt);
  tickHealers(state, dt);

  // deaths and leaks
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp <= 0 && e.revive && !e.revived && e.pos > 0) {
      // 언데드: 한 번은 다시 일어난다
      Object.assign(e, { revived: true, hp: Math.round(e.maxHp * e.revive.percent / 100), stunLeft: 0.8, poisonLeft: 0, burnLeft: 0 });
      state.events.push({ type: 'revive', eid: e.eid });
      alive.push(e);
      continue;
    }
    if (e.hp <= 0) {
      const killer = e.lastHitBy === null ? null : byUid.get(e.lastHitBy);
      let gold = e.gold;
      if (killer) {
        gold += (findEffect(killer, 'goldBonus')?.amount ?? 0) + (killer.mods?.killGold ?? 0);
        const fk = flags(killer);
        if (fk.restAfterKill) killer.restLeft = Math.max(killer.restLeft ?? 0, fk.restAfterKill);
        if (fk.killStack) killer.killStacks = (killer.killStacks ?? 0) + 1;
        gold += soulOnKill(state, data, killer, e);
        if (cfg.moves) chargeUlt(killer, cfg, 'kill');
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

/** Pick where each animal should stand this moment of the brawl (kept near its battle slot, never stacked in a row). */
export function brawl(state, cfg, dt) {
  const B = cfg.brawl, off = cfg.blockedOffset ?? 0.5, reach = state.meleeReach ?? 1;
  const plans = [];
  // 가로막기: 대형 뒤로 빠져나간 적은 손이 빈 근접 동물이 쫓아가 앞을 막는다 (적 하나에 한 마리)
  const melee = state.field.filter((u) => !u.down && u.slot != null && !u.stats.flyer && u.stats.range <= 1 && effBlock(u) > 0);
  const line = melee.length ? Math.min(...melee.map((u) => u.slot)) : 0;
  const leakers = state.enemies.filter((e) => e.hp > 0 && !e.flying && e.blockedBy == null && e.pos < line - 0.4).sort((a, b) => a.pos - b.pos);
  const busy = new Set(state.enemies.filter((e) => e.hp > 0 && e.blockedBy != null).map((e) => e.blockedBy));
  const taken = new Set();
  for (const e of leakers) {
    const free = melee.filter((u) => !busy.has(u.uid) && !taken.has(u.uid)).sort((a, b) => Math.abs(a.pos - e.pos) - Math.abs(b.pos - e.pos))[0];
    if (!free) break;
    taken.add(free.uid);
    const t = clampTo(Math.max(0.5, e.pos - 0.7), cfg);
    if (Math.abs(t - free.targetPos) > 0.05) { free.targetPos = t; free.formationMove = true; }
    free.engageCd = B.retarget;
    free.intercept = e.eid;
  }
  for (const u of state.field) {
    if (u.down || u.slot == null || u.stats.flyer || u.stats.range > 1 || taken.has(u.uid)) continue;
    u.intercept = null;
    u.engageCd = (u.engageCd ?? 0) - dt;
    if (u.engageCd > 0) continue;
    u.engageCd = B.retarget;
    const inReach = state.enemies.some((e) => e.hp > 0 && !e.flying && Math.abs(e.pos - u.pos) <= reach && (e.blockedBy === u.uid || e.blockedBy == null || Math.abs(e.pos - u.pos) <= reach * 0.8));
    if (inReach && !u.moving) continue; // already swinging: stay put
    // gang up: go stand next to an enemy an ally is already holding
    const held = state.enemies.filter((e) => e.hp > 0 && !e.flying && e.blockedBy != null && e.blockedBy !== u.uid && e.pos >= u.slot - 0.6 && e.pos <= u.slot + B.leash);
    const pick = held.reduce((b, e) => (!b || Math.abs(e.pos - u.slot) < Math.abs(b.pos - u.slot) ? e : b), null);
    plans.push([u, pick ? Math.min(u.slot + B.leash, Math.max(u.slot - 0.5, pick.pos - off)) : u.slot]);
  }
  // keep animals of the same row apart: anyone already standing in that row counts as an obstacle
  for (const [u, t0] of plans) {
    let t = t0;
    const row = state.field.filter((o) => o !== u && !o.down && !o.stats.flyer && (o.lane ?? 1) === (u.lane ?? 1));
    for (let k = 0; k < 4; k++) { const hit = row.find((o) => Math.abs(o.targetPos - t) < B.spacing); if (!hit) break; t = hit.targetPos - B.spacing; }
    const nt = clampTo(t, cfg);
    if (Math.abs(nt - u.targetPos) > 0.05) { u.targetPos = nt; u.formationMove = true; }
  }
}
const clampTo = (p, cfg) => Math.min(cfg.pathLength - 0.5, Math.max(0.5, p));

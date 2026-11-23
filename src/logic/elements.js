// 속성 공격: 성장기부터 공격이 가끔 속성을 띤다. 추가 피해 + 속성마다 다른 효과.
import { effDamage } from './mods.js';
import { damageEnemy } from './combat.js';
import { patchesAt, patchAllyMods } from './patchMods.js';
export { patchesAt, patchAllyMods };

/** Chance (%) that this unit's hit turns elemental. */
export function elementChance(u, cfg) {
  if (!u.stats.element || !cfg.elements) return 0;
  const c = cfg.elements.chance;
  return (u.kind === 'chimera' ? c.chimera : c[u.stage] ?? 0) + (u.mods?.elemChance ?? 0);
}

/** Roll and apply an elemental proc after a normal attack. Returns the event or null. */
export function elementProc(state, u, target, hits, cfg) {
  const ch = elementChance(u, cfg);
  if (ch <= 0 || state.rng() >= ch / 100) return null;
  const el = u.stats.element, d = cfg.elements.defs[el];
  const base = effDamage(u) * (cfg.elements.bonus + (u.mods?.elemDmg ?? 0)) / 100;
  const touched = [target];
  damageEnemy(state, target, base, false, u.uid);
  const near = (r) => state.enemies.filter((e) => e !== target && e.hp > 0 && !e.flying === !target.flying && Math.abs(e.pos - target.pos) <= r);
  switch (el) {
    case 'fire': target.burnDps = Math.max(target.burnLeft > 0 ? target.burnDps : 0, effDamage(u) * d.burnPct / 100); target.burnLeft = d.dur; target.burnBy = u.uid; break;
    case 'water': for (const e of [target, ...near(d.splash)]) { if (e !== target) { damageEnemy(state, e, base * d.splashPct / 100, true, u.uid); touched.push(e); } e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, d.slow); e.slowLeft = Math.max(e.slowLeft, d.dur); } break;
    case 'wind': if (!target.boss) { target.pos = Math.min(cfg.pathLength, target.pos + d.push); target.blockedBy = null; } break;
    case 'earth': for (const e of [target, ...near(d.radius)]) { if (!e.flying) { e.stunLeft = Math.max(e.stunLeft, e.boss ? d.stun / 3 : d.stun); if (e !== target) touched.push(e); } } break;
    case 'thunder': { if (patchesAt(state, target.pos).some((p) => p.kind === 'puddle')) damageEnemy(state, target, base * (cfg.patches.defs.puddle.enemy.wet / 100), false, u.uid); const chain = near(d.range).sort((a, b) => Math.abs(a.pos - target.pos) - Math.abs(b.pos - target.pos)).slice(0, d.chain); for (const e of chain) { damageEnemy(state, e, effDamage(u) * d.chainPct / 100, true, u.uid); touched.push(e); } break; }
    case 'moon': target.curseLeft = d.dur; break;
    case 'grass': if (!target.boss) target.holdLeft = Math.max(target.holdLeft, d.root); break;
    case 'light': target.attackCd = (target.attackCd ?? 0) + d.delay; break;
    default: break;
  }
  const ev = { type: 'element', uid: u.uid, el, eid: target.eid, eids: touched.map((e) => e.eid) };
  state.events.push(ev);
  const pc = cfg.patches?.chance?.[u.kind === 'chimera' ? 'chimera' : u.stage] ?? 0;
  if (pc > 0 && state.rng() < pc / 100) addPatch(state, u, target.pos, cfg);
  return ev;
}

// ---------- 지형 장판: 속성 공격과 영물·키메라의 기술이 길 위에 잠깐 남기는 지형 ----------
/** Leave this unit's terrain at a spot (refreshes an overlapping patch of the same kind). */
export function addPatch(state, u, pos, cfg) {
  const pc = cfg.patches;
  if (!pc || !u.stats.element) return null;
  const kind = pc.bySpecies?.[u.speciesId] ?? pc.byElement[u.stats.element];
  if (!kind) return null;
  const list = (state.patches ??= []);
  const same = list.find((p) => p.kind === kind && Math.abs(p.pos - pos) <= pc.radius);
  if (same) { same.left = pc.dur; same.by = u.uid; same.power = effDamage(u); return same; }
  if (list.length >= pc.max) list.shift();
  const p = { id: (state.nextPatchId = (state.nextPatchId ?? 0) + 1), kind, pos: Math.max(0.5, Math.min(cfg.pathLength - 0.5, pos)), r: pc.radius, left: pc.dur, dur: pc.dur, by: u.uid, power: effDamage(u), tick: 1 };
  list.push(p);
  state.events.push({ type: 'patch', id: p.id, kind, pos: p.pos });
  return p;
}

/** Per-tick terrain effects on enemies; ally effects are read in computeMods via patchAllyMods. */
export function tickPatches(state, cfg, dt) {
  if (!state.patches?.length) return;
  for (const p of state.patches) {
    p.left -= dt;
    const d = cfg.patches.defs[p.kind].enemy;
    if (!d) continue;
    const inside = state.enemies.filter((e) => e.hp > 0 && Math.abs(e.pos - p.pos) <= p.r);
    for (const e of inside) {
      const slow = e.flying ? d.flySlow ?? 0 : Math.max(d.slow ?? 0, d.flySlow ? 0 : 0);
      if (slow) { e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, slow); e.slowLeft = Math.max(e.slowLeft, 0.3); }
      if (d.burn && !e.flying) { e.hp -= p.power * d.burn / 100 * dt; e.lastHitBy = p.by; }
      if (d.attackSlow) e.sandLeft = 0.3;
    }
    if (d.bolt) { p.tick -= dt; if (p.tick <= 0 && inside.length) { p.tick = 1; const e = inside[Math.floor(state.rng() * inside.length)]; damageEnemy(state, e, p.power * d.bolt / 100, true, p.by); state.events.push({ type: 'patchBolt', id: p.id, eid: e.eid }); } }
  }
  state.patches = state.patches.filter((p) => p.left > 0);
}


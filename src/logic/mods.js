// Per-tick modifiers for every field unit: traits, legend passives, bonds/clashes, auras, continent synergy,
// terrain, species level and timed buffs. All abilities are '효과 + 조건' lines (plan ch.12) read from data.
import { traitView } from './traits.js';
import { ownedRelics, eco, whoMatches } from './relics.js';

const STATS = ['dmg', 'interval', 'range', 'block', 'hp', 'cd', 'holdDur', 'crit', 'dodge', 'taken', 'buff', 'regen', 'respawn', 'status', 'killGold', 'aoe', 'waveEndGold', 'firstHoldDur', 'auraRadiusAdd'];
const FLAGS = ['restCycle', 'afterRest', 'restAfterKill', 'restOnMove', 'restOnKnock', 'misTarget', 'variance', 'cantHitBehind', 'cantHitClose',
  'noHit', 'killStack', 'ignoreFirstHits', 'poisonSpread', 'holdBurstMult', 'knockStun', 'perBruiserHp', 'stayStack', 'terrainMult', 'aoeSet',
  'auraRadius', 'downGold', 'heldKillGold', 'surviveOnce', 'splashChance', 'waveStartFlee', 'buffRecv'];

export function emptyMods() {
  const m = { flags: {}, vs: [], rest: false, buffRecv: 1, auraIn: {}, auraNeg: {} };
  for (const s of STATS) m[s] = 0;
  return m;
}

const alive = (u) => !u.down;
export const zoneIndex = (pos, cfg) => Math.max(0, Math.min(2, Math.floor(pos / (cfg.pathLength / 3))));
/** True when the unit stands in a zone whose terrain is one of its habitats. */
export const terrainMatch = (u, state, cfg) => u.stats.habitats.includes(state.stage.zones[zoneIndex(u.pos, cfg)]);

/** Base species ids a unit counts as for bonds (chimeras and weak chimeras never light bonds). */
const bondSpecies = (u) => (u.kind === 'base' ? u.speciesId : null);

/** Evaluate an `if` condition for a unit. */
export function condOk(c, u, state, data) {
  if (!c) return true;
  const cfg = data.config;
  if (c.near) {
    const any = state.field.some((o) => o !== u && alive(o) && Math.abs(o.pos - u.pos) <= c.near.tiles);
    if (any !== c.near.present) return false;
  }
  if ('terrain' in c && terrainMatch(u, state, cfg) !== c.terrain) return false;
  if (c.waveFrom && state.wave < c.waveFrom) return false;
  if (c.waveTo && state.wave > c.waveTo) return false;
  if (c.waves && !c.waves.includes(state.wave)) return false;
  if (c.even && state.wave % 2 !== 0) return false;
  if (c.waveTimeLt !== undefined && !(state.phase === 'wave' && state.waveTime < c.waveTimeLt)) return false;
  if (c.waveTimeGt !== undefined && !(state.phase === 'wave' && state.waveTime >= c.waveTimeGt)) return false;
  if (c.hpBelow !== undefined && !(u.hp < (u.maxHp ?? u.stats.hp) * c.hpBelow / 100)) return false;
  if (c.bossOnPath && !state.enemies.some((e) => e.boss)) return false;
  if (c.buffed && !u.wasBuffed) return false;
  if (c.hasTrait && !(u.traits ?? []).some((t) => `${t.id}${t.flipped ? '_flip' : ''}` === c.hasTrait)) return false;
  if (c.notTrait && (u.traits ?? []).some((t) => `${t.id}${t.flipped ? '_flip' : ''}` === c.notTrait)) return false;
  return true;
}

/** Apply one fx line's stat and flag keys to a mods object. */
function applyFx(m, fx, u, state, data, auras, enemyAuras) {
  if (!condOk(fx.if, u, state, data)) return;
  for (const s of STATS) if (typeof fx[s] === 'number') m[s] += fx[s];
  if (fx.rest) m.rest = true;
  if (fx.vs) m.vs.push(fx.vs);
  if (fx.aura) auras.push({ src: u, ...fx.aura });
  if (fx.enemyAura) enemyAuras.push({ src: u, ...fx.enemyAura });
  for (const f of FLAGS) {
    if (!(f in fx)) continue;
    if (f === 'buffRecv') m.buffRecv = Math.max(m.buffRecv, fx.buffRecv);
    else m.flags[f] = fx[f];
  }
}

/** Every fx list that belongs to the unit itself (traits, passive, special stats). */
export function ownFx(u, data) {
  const out = [];
  for (const t of u.traits ?? []) out.push(...traitView(t, data).fx);
  const sp = bondSpecies(u);
  const passive = sp ? data.lore?.passives?.[sp] : null;
  if (passive) out.push(...passive.fx);
  if (u.kind !== 'base' && u.parts) {
    // Chimeras keep their parts' legend passives? No: the plan ties passives to a species (base animal) only.
  }
  return out;
}

/** Bonds and clashes that are lit right now: [{ bond, units: {species: unit} }]. */
export function activeBonds(state, data) {
  const bonds = data.lore?.bonds ?? [];
  const live = state.field.filter((u) => alive(u) && bondSpecies(u));
  const out = [];
  for (const b of bonds) {
    const [a, c] = b.pair;
    const as = live.filter((u) => u.speciesId === a), cs = live.filter((u) => u.speciesId === c);
    if (!as.length || !cs.length) continue;
    let pick = null;
    if (b.sameTeam) pick = [as[0], cs[0]];
    else {
      for (const x of as) for (const y of cs) if (!pick && Math.abs(x.pos - y.pos) <= b.tiles) pick = [x, y];
    }
    if (pick && !(b.kind === 'clash' && eco(state, data, 'noClash'))) out.push({ bond: b, units: { [a]: pick[0], [c]: pick[1] } });
  }
  return out;
}

/** Continent tags that have 3+ deployed animals (chimeras count for both of theirs). */
export function activeSynergies(state, data) {
  const syn = data.config.synergy;
  if (!syn) return [];
  const count = {};
  for (const u of state.field) for (const c of u.stats.continents) count[c] = (count[c] ?? 0) + 1;
  const min = Math.min(syn.min, eco(state, data, 'synergyMin') ?? syn.min);
  return Object.keys(syn.effects).filter((c) => (count[c] ?? 0) >= min);
}

/** Species level map value → damage percent. Chimeras use the average of their parts. */
export function levelDamage(u, state, data) {
  const lv = state.levels ?? {};
  const per = data.config.speciesLevel?.dmgPerLevel ?? 0;
  const ids = u.kind === 'base' ? [u.speciesId] : u.kind === 'chimera' ? u.parts : [];
  if (!ids.length) return 0;
  const avg = ids.reduce((s, id) => s + ((lv[id] ?? 1) - 1), 0) / ids.length;
  return avg * per;
}

/** Radius of a unit's own aura/haste effects after trait and skill changes. */
export function auraRadiusOf(u, base) {
  const f = u.mods?.flags ?? {};
  if (f.auraRadius !== undefined) return f.auraRadius;
  return Math.max(0, base + (u.mods?.auraRadiusAdd ?? 0));
}

/**
 * Compute mods for every field unit and enemy aura effects. Writes u.mods, u.maxHp, u.wasBuffed, e.intervalMult.
 * Returns { bonds, synergies } for the screen.
 */
export function computeMods(state, data) {
  const cfg = data.config;
  const auras = [], enemyAuras = [];
  for (const u of state.field) {
    const m = emptyMods();
    for (const fx of ownFx(u, data)) applyFx(m, fx, u, state, data, auras, enemyAuras);
    for (const t of u.temp ?? []) if (t.left > 0) for (const [k, v] of Object.entries(t.mods)) m[k] += v;
    if (u.stayCount && m.flags.stayStack) m[m.flags.stayStack.stat] += Math.min(m.flags.stayStack.max, m.flags.stayStack.per * u.stayCount);
    if (u.killStacks && m.flags.killStack) m.dmg += Math.min(m.flags.killStack[1], m.flags.killStack[0] * u.killStacks);
    if (u.hundredDone) m.dmg += 30, m.hp += 30;
    m.dmg += levelDamage(u, state, data);
    for (const r of ownedRelics(state, data)) for (const fx of r.fx ?? []) if (whoMatches(fx.who, u, state)) applyFx(m, fx, u, state, data, auras, enemyAuras);
    u.mods = m;
  }
  // bonds (fx per member species)
  const bonds = activeBonds(state, data);
  for (const { bond, units } of bonds) {
    for (const [sp, list] of Object.entries(bond.fx ?? {})) {
      const u = units[sp];
      if (!u) continue;
      for (const fx of list) applyFx(u.mods, fx, u, state, data, auras, enemyAuras);
    }
  }
  // flags that set radius need mods first, so built-in auras are read after own fx
  for (const u of state.field) {
    if (!alive(u)) continue;
    const buffMult = 1 + u.mods.buff / 100;
    for (const e of u.stats.effects) {
      if (e.type === 'aura') auras.push({ src: u, radius: auraRadiusOf(u, e.radius), dmg: e.percent * buffMult, group: 'aura' });
      if (e.type === 'haste') auras.push({ src: u, radius: auraRadiusOf(u, e.radius), interval: -e.percent * buffMult, group: 'haste' });
      if (e.type === 'songCd') auras.push({ src: u, radius: auraRadiusOf(u, e.radius), cd: e.percent, group: 'song' });
    }
  }
  // auras: strongest positive and strongest negative per stat (no stacking), self excluded for trait auras
  for (const u of state.field) { u.mods.auraIn = {}; u.mods.auraNeg = {}; }
  for (const a of auras) {
    if (a.src.down) continue;
    for (const u of state.field) {
      if (u.down) continue;
      if (a.src === u && !a.group) continue;
      if (Math.abs(u.pos - a.src.pos) > a.radius) continue;
      if (a.stage && !a.stage.includes(u.stage)) continue;
      for (const s of STATS) {
        if (typeof a[s] !== 'number') continue;
        const good = s === 'interval' || s === 'cd' || s === 'taken' ? a[s] < 0 : a[s] > 0;
        if (good) {
          const v = a[s] * u.mods.buffRecv;
          if (Math.abs(v) > Math.abs(u.mods.auraIn[s] ?? 0)) u.mods.auraIn[s] = v;
        } else if (Math.abs(a[s]) > Math.abs(u.mods.auraNeg[s] ?? 0)) u.mods.auraNeg[s] = a[s];
      }
    }
  }
  // all-ally timed buffs (skills), synergy, terrain, relic economy buffs
  const syns = activeSynergies(state, data);
  const bondDmg = (eco(state, data, 'bondDmg') ?? 0) * bonds.filter((b) => b.bond.kind !== 'clash').length;
  const few = eco(state, data, 'fewBuff');
  const fewOn = few && state.field.length <= few[0];
  for (const u of state.field) {
    const m = u.mods;
    u.wasBuffed = Object.keys(m.auraIn).length > 0 || (state.allyBuffs ?? []).length > 0;
    for (const [s, v] of Object.entries(m.auraIn)) m[s] += v;
    for (const [s, v] of Object.entries(m.auraNeg)) m[s] += v;
    for (const b of state.allyBuffs ?? []) m[b.stat] += b.percent * (b.percent > 0 || b.stat === 'interval' ? m.buffRecv : 1);
    for (const c of syns) for (const [s, v] of Object.entries(cfg.synergy.effects[c])) m[s] += v;
    m.dmg += bondDmg;
    if (fewOn) { m.dmg += few[1]; m.hp += few[2]; }
    if (cfg.terrain && terrainMatch(u, state, cfg)) {
      const k = Math.max(m.flags.terrainMult ?? 1, 1);
      for (const [s, v] of Object.entries(cfg.terrain)) m[s] += v * k;
    }
    if (m.flags.perBruiserHp) m.hp += m.flags.perBruiserHp * state.field.filter((o) => (o.stats.role ?? '') === 'bruiser').length;
    // max hp follows hp%; keep the current fraction
    const newMax = Math.max(1, Math.round(u.stats.hp * (1 + m.hp / 100)));
    const oldMax = u.maxHp ?? u.stats.hp;
    if (newMax !== oldMax) { u.hp = u.hp * newMax / oldMax; u.maxHp = newMax; }
  }
  for (const e of state.enemies) {
    let worst = 0;
    for (const a of enemyAuras) if (!a.src.down && Math.abs(e.pos - a.src.pos) <= a.radius) worst = Math.max(worst, a.interval);
    e.intervalMult = 1 + worst / 100;
  }
  return { bonds, synergies: syns };
}

// ---- derived numbers used by combat ----
export const effDamage = (u) => u.stats.damage * Math.max(0.1, 1 + (u.mods?.dmg ?? 0) / 100);
export const effInterval = (u) => u.stats.interval * Math.max(0.25, 1 + (u.mods?.interval ?? 0) / 100);
export const effRange = (u) => Math.max(1, u.stats.range + (u.mods?.range ?? 0));
export const effBlock = (u) => (u.stats.flyer ? 0 : Math.max(0, u.stats.block + (u.mods?.block ?? 0)));
export const effAoe = (u) => {
  const set = u.mods?.flags?.aoeSet;
  const base = set !== undefined && set > u.stats.aoeRadius ? set : u.stats.aoeRadius;
  return base > 0 ? base + (u.mods?.aoe ?? 0) : 0;
};
export const cdMult = (u) => Math.max(0.3, 1 + (u.mods?.cd ?? 0) / 100);
export const statusMult = (u) => 1 + (u.mods?.status ?? 0) / 100;

// 소울펫: 판의 주인공. 첫 소환으로 반드시 나오고, 처치할수록 기세가 붙고, 동물마다 다른 '소울 기술'로 전투 양상이 달라진다.
// 영물이 되고 정이 충분하면 속성 각성기를 쓴다. 덱은 소울펫 + 약점을 메울 동료들.
import { damageEnemy } from './combat.js';
import { effDamage } from './mods.js';

export const soulCfg = (data) => data.config.soul ?? null;
export const soulSig = (data, id) => soulCfg(data)?.sig?.[id] ?? null;
/** Species whose soul rules a unit follows (a chimera made from the soul pet keeps them). */
const sigOf = (state, data, u) => (u?.soul && state.soul ? soulSig(data, state.soul.id) : null);
const fav = (state) => state.soul?.favor ?? 0;
/** Signature numbers grow a little with favor. */
const grow = (state, data) => 1 + (soulCfg(data).favorSig ?? 0) * fav(state) / 100;

/** Mods the soul pet adds to itself (and, for some signatures, to the whole team). Called from computeMods. */
export function applySoulMods(state, data) {
  const sc = soulCfg(data);
  if (!sc || !state.soul) return;
  const u = state.field.find((x) => x.soul);
  if (!u) return;
  const sig = sigOf(state, data, u), m = u.mods, g = grow(state, data);
  const kills = Math.min(sc.maxKills, u.soulKills ?? 0);
  m.dmg += kills * sc.perKill + fav(state) * sc.favorDmg;
  m.hp += fav(state) * sc.favorHp;
  if (!sig) return;
  const p = sig.p ?? {};
  for (const [s, v] of Object.entries(sig.mods ?? {})) m[s] += v;
  switch (sig.type) {
    case 'gate': m.dmg += p.perBlocked * g * state.enemies.filter((e) => e.blockedBy === u.uid && e.hp > 0).length; break;
    case 'berserk': m.dmg += p.max * g * (1 - Math.max(0, u.hp) / (u.maxHp ?? u.stats.hp)); break;
    case 'gold': m.dmg += Math.min(p.max, Math.floor(state.gold / p.per) * p.dmg * g); break;
    case 'pack': m.dmg += Math.min(p.max, p.dmg * g * state.field.filter((o) => o !== u && !o.down && Math.abs(o.pos - u.pos) <= p.tiles).length); break;
    case 'teamHaste': { const v = -Math.min(p.max, kills * p.perKill * g); for (const o of state.field) if (o !== u) o.mods.interval += v; break; }
    default: break;
  }
  if ((state.soulRally ?? 0) > 0) for (const o of state.field) o.mods.dmg += state.soulRallyPct ?? 0;
}

/** After the soul pet's normal attack. */
export function soulOnHit(state, data, u, target, hits) {
  const sig = sigOf(state, data, u);
  if (!sig) return;
  const p = sig.p ?? {}, g = grow(state, data), cfg = data.config;
  u.soulHits = (u.soulHits ?? 0) + 1;
  switch (sig.type) {
    case 'flurry': if (u.soulHits % p.every === 0) { for (let k = 0; k < p.extra; k++) damageEnemy(state, target, effDamage(u) * g, false, u.uid); state.events.push({ type: 'soulSig', uid: u.uid, eid: target.eid, sig: sig.type }); } break;
    case 'pushMark': if (!target.boss) { target.pos = Math.min(cfg.pathLength, target.pos + p.push); } target.markPct = Math.max(target.markPct ?? 0, p.mark * g); target.markLeft = Math.max(target.markLeft ?? 0, p.dur); break;
    case 'pierce': { const o = state.enemies.filter((e) => e !== target && e.hp > 0 && !hits.includes(e) && Math.abs(e.pos - target.pos) <= p.reach).sort((a, b) => Math.abs(a.pos - target.pos) - Math.abs(b.pos - target.pos)).slice(0, p.count); for (const e of o) damageEnemy(state, e, effDamage(u) * p.pct * g / 100, false, u.uid); if (o.length) state.events.push({ type: 'soulSig', uid: u.uid, eid: o[0].eid, sig: sig.type }); break; }
    case 'execute': if (!target.boss && target.hp > 0 && target.hp <= target.maxHp * p.below * g / 100) { target.hp = 0; target.lastHitBy = u.uid; u.hp = Math.min(u.maxHp ?? u.stats.hp, u.hp + (u.maxHp ?? u.stats.hp) * p.heal / 100); state.events.push({ type: 'soulSig', uid: u.uid, eid: target.eid, sig: sig.type }); } break;
    default: break;
  }
}

/** When the soul pet lands the killing blow. Also counts the streak. */
export function soulOnKill(state, data, u, e) {
  const sc = soulCfg(data);
  if (!sc || !u?.soul) return 0;
  u.soulKills = (u.soulKills ?? 0) + 1;
  const st = (state.soulStreak ??= { n: 0, at: -99 });
  st.n = state.time - st.at <= sc.streak.window ? st.n + 1 : 1; st.at = state.time;
  if (sc.streak.calls.includes(st.n)) state.events.push({ type: 'streak', uid: u.uid, n: st.n });
  const sig = sigOf(state, data, u);
  if (!sig) return 0;
  const p = sig.p ?? {}, g = grow(state, data);
  switch (sig.type) {
    case 'killBurst': { const near = state.enemies.filter((o) => o !== e && o.hp > 0 && Math.abs(o.pos - e.pos) <= p.radius); for (const o of near) { damageEnemy(state, o, e.maxHp * p.pct * g / 100, true, u.uid); o.poisonDps = Math.max(o.poisonLeft > 0 ? o.poisonDps : 0, effDamage(u) * p.poison / 100); o.poisonLeft = 3; o.poisonBy = u.uid; } state.events.push({ type: 'soulSig', uid: u.uid, eid: e.eid, sig: sig.type, pos: e.pos }); break; }
    case 'killRally': state.soulRally = p.dur; state.soulRallyPct = p.dmg * g; state.events.push({ type: 'soulSig', uid: u.uid, eid: e.eid, sig: sig.type }); break;
    case 'killReset': u.attackCd = 0; state.events.push({ type: 'soulSig', uid: u.uid, eid: e.eid, sig: sig.type }); break;
    case 'gold': return p.killGold ?? 0;
    default: break;
  }
  return 0;
}

/** Timers: rally, wave charge, awakening. */
export function tickSoul(state, data, dt) {
  const sc = soulCfg(data);
  if (!sc || !state.soul) return;
  if (state.soulRally > 0) state.soulRally -= dt;
  const u = state.field.find((x) => x.soul && !x.down);
  if (!u) return;
  const sig = sigOf(state, data, u), es = state.enemies.filter((e) => e.hp > 0);
  if (sig?.type === 'charge' && state.soulChargeWave !== state.wave && state.waveTime >= sig.p.delay && es.length) {
    state.soulChargeWave = state.wave;
    const hit = es.filter((e) => !e.flying);
    for (const e of hit) { damageEnemy(state, e, e.maxHp * (e.boss ? sig.p.bossPct : sig.p.pct) * grow(state, data) / 100, true, u.uid); e.stunLeft = Math.max(e.stunLeft, e.boss ? 0.5 : sig.p.stun); }
    state.events.push({ type: 'soulSig', uid: u.uid, sig: 'charge', eids: hit.map((e) => e.eid) });
  }
  // 각성기: 영물(또는 키메라)이 된 소울펫, 정 단계 조건
  if (!awakened(state, data, u) || !es.length) return;
  u.awakenCd = (u.awakenCd ?? sc.awaken.first) - dt;
  if (u.awakenCd > 0) return;
  u.awakenCd = sc.awaken.every;
  const el = u.stats.element, d = sc.awaken.defs[el] ?? sc.awaken.defs.fire;
  const k = (1 + sc.awaken.perFavor * Math.max(0, fav(state) - sc.awakenAt) / 100) * (d.mult ?? 1);
  for (const e of es) {
    damageEnemy(state, e, e.maxHp * (e.boss ? sc.awaken.bossPct : sc.awaken.pct) * k / 100, true, u.uid);
    if (d.burn) { e.burnDps = Math.max(e.burnLeft > 0 ? e.burnDps : 0, effDamage(u) * d.burn / 100); e.burnLeft = 4; e.burnBy = u.uid; }
    if (d.slow) { e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, d.slow); e.slowLeft = Math.max(e.slowLeft, 4); }
    if (d.push && !e.boss) { e.pos = Math.min(data.config.pathLength, e.pos + d.push); e.blockedBy = null; }
    if (d.stun && !e.flying) e.stunLeft = Math.max(e.stunLeft, e.boss ? d.stun / 3 : d.stun);
    if (d.curse) e.curseLeft = d.curse;
    if (d.root && !e.boss && !e.flying) e.holdLeft = Math.max(e.holdLeft, d.root);
  }
  if (d.heal) for (const o of state.field) if (!o.down) o.hp = Math.min(o.maxHp ?? o.stats.hp, o.hp + (o.maxHp ?? o.stats.hp) * d.heal / 100);
  state.events.push({ type: 'awaken', uid: u.uid, el, name: d.name, eids: es.map((e) => e.eid) });
}

export const awakened = (state, data, u) => !!u?.soul && (u.stage === 'spirit' || u.kind === 'chimera') && fav(state) >= soulCfg(data).awakenAt;

// ---------- deck (meta) ----------
/** Animals taken into battle: the saved deck (unlocked ones only), topped up to deck size, soul pet always in. */
export function deckOf(save, data, unlocked) {
  const sc = soulCfg(data), size = sc?.deckSize ?? 6;
  let deck = (save.deck ?? []).filter((id) => unlocked.includes(id));
  const soul = unlocked.includes(save.soulPet) ? save.soulPet : null;
  if (soul && !deck.includes(soul)) deck = [soul, ...deck];
  deck = deck.slice(0, size);
  for (const id of unlocked) { if (deck.length >= size) break; if (!deck.includes(id)) deck.push(id); }
  return deck;
}

/** What the soul pet cannot do on its own in this stage: hints for filling the deck. */
export function soulGaps(data, id, stage = null) {
  const u = data.unitById[id];
  if (!u) return [];
  const out = [];
  const E = data.config.elements?.defs ?? {};
  if (u.range < (data.config.flyingMinRange ?? 3)) out.push({ key: 'air', text: '나는 적을 못 침', need: '사거리 긴 동물' });
  else out.push({ key: 'bone', text: '해골에게 피해 절반', need: '근접 동물' });
  if (u.range <= 1) out.push({ key: 'ghost', text: '넋에게 피해가 덜 들어감', need: '원거리 동물' });
  if (!u.aoeRadius) out.push({ key: 'swarm', text: '떼로 오면 손이 모자람', need: '광역 동물이나 별똥별' });
  if (u.block <= 1 && u.hp < 120) out.push({ key: 'frail', text: '몸이 약함', need: '앞에서 막아 줄 동물' });
  const c = stage ? data.config.climates?.[stage.climate] : null;
  if (c?.weak?.includes(u.element)) out.push({ key: 'climate', text: `${c.icon} ${c.name}에 ${E[u.element]?.icon ?? ''} 약해짐`, need: `${(c.strong ?? []).map((e) => E[e]?.icon ?? '').join('')} 속성 동료` });
  return out;
}

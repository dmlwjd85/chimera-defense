// 보스 레이드 패턴(2026-11-28 선생님 "좋아 진행하자", 설계안 /design/보스_패턴_상성_설계안.md).
// 데이터: public/data/raid.json. 그 파일이 비었거나 보스가 없으면 이 파일의 모든 함수는 아무것도 하지 않음
// (지금 게임과 똑같이 돌아감 — 시험 tests/raid.test.js가 확인). 글자는 text.json raid.* 에서 화면이 찾아 씀.
//
// 기술 종류(kind) 9가지 + 보조: summon 졸개 · charge 돌진 · shield 보호막(서로 다른 n마리/세 라인) · armor 껍질 ·
//   cast 시전 막대(끊기) · mark 표식 · zone 장판 · hide 숨기/날기 · poison 독 쌓기 · blizzard 눈보라 · rally 호령 · rocks 낙석
import { eco } from './relics.js';

let API = null;
/** gauntlet.js가 자기 안쪽 함수(피해 주기·적 부르기 등)를 넘겨 줌(서로 import 하면 순환이 생겨서) */
export function setRaidApi(api) { API = api; }

export const raidData = (data) => data?.raid ?? null;
export const raidCommon = (data) => data?.raid?.common ?? {};
/** 보스 한 마리의 레이드 정보(없으면 null) */
export function raidDef(data, id) { const b = data?.raid?.bosses?.[id]; return b && typeof b === 'object' ? b : null; }
/** 상성용 속성: raid.json에 있으면 그 값(굶주린 왕은 1단계 속성) */
export function raidElement(data, id) {
  const R = raidDef(data, id);
  if (!R) return undefined;
  if (Array.isArray(R.phaseElements)) return R.phaseElements[0] ?? null;
  return R.element;
}

const TIER_CHAIN = { normal: [], hard: ['hard'], hardcore: ['hard', 'hardcore'], god: ['hard', 'hardcore', 'god'] };
export const tierKey = (state) => (state.tier === 'god' ? 'god' : state.tier ? 'hardcore' : state.hard ? 'hard' : 'normal');
const alive = (x) => x && x.hp > 0;
const aliveU = (u) => u && !u.down && !u.resting;

/** 난이도·단계 덮어쓰기를 합친 기술 값 */
function pat(state, e, p) {
  const R = e.raid.def;
  let out = { ...p, effect: { ...(p.effect ?? {}) } };
  const add = (o) => { if (!o) return; out = { ...out, ...o, effect: { ...out.effect, ...(o.effect ?? {}) } }; };
  for (const k of TIER_CHAIN[tierKey(state)]) add(R.tiers?.[k]?.[p.id]);
  for (let ph = 2; ph <= e.raid.phase + 1; ph++) add(R.phaseMods?.[ph]?.[p.id]);
  return out;
}
const C = (data) => raidCommon(data);
const warnMult = (state, data) => (state.tier ? C(data).warn?.hardcoreMult ?? 0.75 : 1) * (eco(state, data, 'raidWarn') ? 1 + eco(state, data, 'raidWarn') / 2.2 : 1);

/** 교전 시작: 보스에게 레이드 상태를 붙이고, 배우기 교전이면 졸개 하나가 보스 기술을 약하게 흉내 냄 */
export function raidEncStart(state, data) {
  state.raidMarks = []; state.raidZones = []; state.raidBlizzard = null; state.raidBusyUntil = 0; state.raidBoss = null;
  if (!raidData(data)?.bosses) return;
  state.raidLearned ??= {};
  for (const u of state.field) { u.raidPoison = 0; u.raidCurse = 0; u.raidHeat = 0; u.raidSlow = 0; u.raidHp = u.hp; }
  const spec = state.plan?.[state.enc];
  const stageBoss = raidDef(data, state.stage?.boss);
  for (const e of state.enemies) {
    const R = raidDef(data, e.id);
    if (!R || !e.boss) continue;
    let def = R;
    if (R.taste && stageBoss) {
      // 미니보스: 그 스테이지 보스의 맛보기 기술 하나(위력 tastePower, 예고 tasteWarn배)
      const tp = (stageBoss.patterns ?? []).find((x) => x.id === stageBoss.taste);
      def = { ...R, patterns: [...(R.patterns ?? []), ...(tp ? [{ ...tp, phase: 1, power: C(data).tastePower ?? 0.5, warnX: C(data).tasteWarn ?? 1.5, first: 5, taste: true }] : [])], phases: [] };
    }
    attach(state, data, e, def);
    if (!R.taste) state.raidBoss = e.eid;
  }
  // 배우기 교전(tasteAt): 보스 없는 교전에서 가장 튼튼한 적이 맛보기 기술을 한 번 씀
  if (spec && !spec.boss && stageBoss && (C(data).tasteAt ?? []).includes(state.enc)) {
    const tp = (stageBoss.patterns ?? []).find((x) => x.id === stageBoss.taste);
    const host = [...state.enemies].filter(alive).sort((a, b) => b.maxHp - a.maxHp)[0];
    if (tp && host) attach(state, data, host, { phases: [], patterns: [{ ...tp, phase: 1, power: C(data).minionPower ?? 0.3, warnX: C(data).tasteWarn ?? 1.5, first: 6, once: true, taste: true }] }, true);
  }
}

function attach(state, data, e, def, minion = false) {
  e.raid = { def, phase: 0, pats: {}, minion, enrage: 0, lastStun: e.stunLeft ?? 0, doomT: 0 };
  for (const p of def.patterns ?? []) e.raid.pats[p.id] = { t: p.first ?? (p.every ?? 10) * 0.6, n: 0 };
  if (def.element !== undefined && !minion) e.element = def.element;
  if (Array.isArray(def.phaseElements) && !minion) e.element = def.phaseElements[0];
  if (def.weak && !minion) e.weak = def.weak;
  if (def.dropHeal && !minion) e.heal = null;
  if (!minion && def.dropPattern) e.pattern = null;
}

/** 지금 큰 예고(라인·시전·표식)가 하나라도 떠 있으면 true — 겹쳐서 억울하게 맞지 않게 */
export function raidBusy(state) {
  if (!state.raidMarks) return false;
  return state.raidMarks.length > 0 || state.time < (state.raidBusyUntil ?? 0) || state.enemies.some((e) => alive(e) && e.raid?.cast);
}

const phaseTh = (state, data, e) => {
  const R = e.raid.def;
  if (Array.isArray(R.phases)) return R.phases;
  const n = +(String(state.stage?.id ?? '').match(/\d+/)?.[0] ?? 1);
  return n <= 3 ? C(data).earlyPhases ?? [0.6] : C(data).phases ?? [0.7, 0.4];
};

/** 보스마다 매 순간: 단계·광포화·끊기·시전·표식·장판·독·기술 시간표 */
export function raidTick(state, data, e, d) {
  const r = e.raid, R = r.def, cm = C(data);
  // 단계 전환
  const th = phaseTh(state, data, e);
  if (!r.minion && r.phase < th.length && e.hp / e.maxHp < th[r.phase]) {
    r.phase += 1;
    if (state.bossWarn?.eid === e.eid) state.bossWarn = null;
    r.cast = null; state.raidMarks = state.raidMarks.filter((m) => m.eid !== e.eid);
    e.stunLeft = Math.max(e.stunLeft ?? 0, cm.phasePause ?? 0.8); r.lastStun = e.stunLeft;
    e.attack = Math.round(e.attack * (state.hard ? cm.phaseAtkHard ?? 1.25 : cm.phaseAtk ?? 1.15));
    if (Array.isArray(R.phaseElements)) e.element = R.phaseElements[Math.min(r.phase, R.phaseElements.length - 1)];
    state.raidBusyUntil = state.time + 1.2;
    state.events.push({ type: 'raidPhase', eid: e.eid, boss: e.id, phase: r.phase + 1, element: e.element ?? null });
  }
  // 광포화(보스 교전의 진짜 보스만)
  const en = cm.enrage;
  if (en && !r.minion && state.raidBoss === e.eid && state.encTime >= en.at) {
    const step = Math.floor((state.encTime - en.at) / (en.every ?? 10)) + 1;
    while (r.enrage < step) { r.enrage += 1; e.attack = Math.round(e.attack * (1 + (en.atk ?? 25) / 100)); state.events.push({ type: 'raidEnrage', eid: e.eid, step: r.enrage }); }
    if (state.encTime >= (en.final ?? 100)) {
      r.doomT -= d;
      if (r.doomT <= 0) {
        r.doomT = en.doomEvery ?? 5;
        for (const u of API.fighters(state)) API.hurtUnit(state, data, u, u.maxHp * (en.doomPct ?? 12) / 100, e);
        state.events.push({ type: 'raidDoom', eid: e.eid });
      }
    }
  }
  // 끊기: 시전 중 새 기절이 걸리면 +1
  if (r.cast) {
    if ((e.stunLeft ?? 0) > (r.lastStun ?? 0) + 0.05) addPts(state, data, e, 1, 'stun');
    if (r.cast && state.time >= r.cast.end) finishCast(state, data, e);
  }
  r.lastStun = e.stunLeft ?? 0;
  if (r.shield && state.time >= r.shield.until) { r.shield = null; state.events.push({ type: 'raidShieldEnd', eid: e.eid }); }
  if (r.armor && state.time >= r.armor.until) { if (r.armor.healEnd) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * r.armor.healEnd / 100); r.armor = null; state.events.push({ type: 'raidArmorEnd', eid: e.eid }); }
  if (r.hide && state.time >= r.hide) { r.hide = 0; state.events.push({ type: 'raidHideEnd', eid: e.eid }); }
  if (r.regen && state.enemies.some((x) => alive(x) && x.minion)) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * r.regen / 100 * d);
  if (r.duel) duelTick(state, data, e, d);
  if (!r.minion || state.raidBoss == null) worldTick(state, data, e, d);
  // 기술 시간표(기절 중엔 멈춤)
  if ((e.stunLeft ?? 0) > 0 || r.cast) return;
  for (const p0 of R.patterns ?? []) {
    if ((p0.phase ?? 1) > r.phase + 1 || (p0.until && r.phase + 1 > p0.until)) continue;
    const ps = r.pats[p0.id];
    if (!ps || (p0.once && ps.n > 0)) continue;
    ps.t -= d;
    if (ps.t > 0) continue;
    const big = ['cast', 'mark', 'zone'].includes(p0.kind);
    if (big && (raidBusy(state) || state.bossWarn)) { ps.t = 0.5; continue; }
    const p = pat(state, e, p0);
    ps.t = (p.every ?? 10) * (r.phase >= 2 ? cm.phase3Speed ?? 0.85 : 1);
    ps.n += 1;
    fire(state, data, e, p);
    if (big) break;
  }
}

function addPts(state, data, e, n, why) {
  const c = e.raid.cast;
  if (!c || c.need == null) return;
  c.pts += n;
  state.events.push({ type: 'raidInterruptPt', eid: e.eid, pts: c.pts, need: c.need, why });
  if (c.pts >= c.need) {
    e.raid.cast = null;
    e.stunLeft = Math.max(e.stunLeft ?? 0, C(data).interruptStun ?? 1.5); e.raid.lastStun = e.stunLeft;
    state.raidBusyUntil = state.time + 1;
    state.events.push({ type: 'raidInterrupt', eid: e.eid, pid: c.pid, boss: e.id });
    if (c.taste) learn(state, c.pid, e);
  }
}
function learn(state, pid, e) {
  const bid = state.stage?.boss;
  if (!bid || state.raidLearned[`${bid}:${pid}`]) return;
  state.raidLearned[`${bid}:${pid}`] = true;
  state.events.push({ type: 'raidLearned', pid, boss: bid, eid: e.eid });
}

const learned = (state, e, pid) => !e.raid.minion && !!state.raidLearned?.[`${e.id}:${pid}`];
const dmgOf = (e, p, k) => e.attack * (k ?? 1) * (p.power ?? 1);

function pickTarget(state, e, how) {
  const live = API.fighters(state);
  if (!live.length) return null;
  const back = live.filter(API.isBack);
  if (how === 'top') {
    const ent = Object.entries(state.dmgWave ?? {}).sort((a, b) => b[1].dmg - a[1].dmg).map(([uid]) => live.find((u) => u.uid === +uid)).filter(Boolean);
    return ent[0] ?? API.lowest(live);
  }
  if (how === 'lowBack') return API.lowest(back.length ? back : live);
  if (how === 'back') return back.length ? back[Math.floor(state.rng() * back.length)] : live[Math.floor(state.rng() * live.length)];
  return live[Math.floor(state.rng() * live.length)];
}
const busiestLane = (state) => { const live = API.fighters(state); const by = [0, 1, 2].map((l) => live.filter((u) => API.laneOf(u.seat) === l).length); return by.indexOf(Math.max(...by)); };

function fire(state, data, e, p) {
  const g = API.gcfg(data), W = (p.warn ?? C(data).warn?.normal ?? 2.2) * (p.warnX ?? 1) * warnMult(state, data);
  const ev = (o) => state.events.push({ eid: e.eid, boss: e.id, pid: p.id, taste: !!p.taste, ...o });
  switch (p.kind) {
    case 'summon': {
      const minions = state.enemies.filter((x) => alive(x) && x.minion).length;
      let n = 0;
      for (let i = 0; i < Math.min(p.count ?? 2, (g.summonCap ?? 2) + (p.capPlus ?? 0) + (e.raid.phase >= 1 ? 1 : 0) - minions); i++) {
        const m = API.addEnemy(state, data, p.enemy, state.plan[state.enc].wave);
        if (m) { m.minion = true; m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * (g.minionHp ?? 0.5))); n++; }
      }
      if (p.effect?.regen) e.raid.regen = p.effect.regen;
      if (n) ev({ type: 'raidSummon', n });
      break;
    }
    case 'charge': {
      const front = API.fighters(state).filter((u) => API.colOf(u.seat) === 0);
      const bru = front.filter((u) => API.styleOf(u) === 'bruiser').length;
      for (const u of front) API.hurtUnit(state, data, u, dmgOf(e, p, p.effect?.dmg ?? 0.8) * (bru >= 2 ? 0.5 : 1), e);
      e.chargeLeft = p.effect?.dur ?? 3;
      ev({ type: 'raidCharge', held: bru >= 2 });
      break;
    }
    case 'shield': {
      const need = (p.effect?.need ?? 4) - (eco(state, data, 'raidShieldNeed') ?? 0);
      e.raid.shield = { until: state.time + (p.effect?.dur ?? 5), need: Math.max(1, need), mode: p.effect?.mode ?? 'distinct', hit: new Set(), lanes: new Set() };
      ev({ type: 'raidShield', need: e.raid.shield.need, mode: e.raid.shield.mode });
      break;
    }
    case 'armor': {
      const a = p.effect;
      e.raid.armor = { until: state.time + (a.dur ?? 4), mult: a.mult ?? 0.6, by: a.breakBy?.elements ?? [], need: a.breakBy?.hits ?? 0, hits: 0, healEnd: a.healEnd ?? 0, stunOnBreak: a.stunOnBreak ?? 0, needMinion: a.needMinion ?? null };
      ev({ type: 'raidArmor', need: e.raid.armor.need });
      break;
    }
    case 'cast': {
      let need = p.need ?? null;
      if (need != null) need = Math.max(1, need - (learned(state, e, p.id) ? 1 : 0) - (eco(state, data, 'raidInterrupt') ?? 0));
      const len = (p.cast ?? 2.5) * (p.warnX ?? 1) * warnMult(state, data);
      e.raid.cast = { pid: p.id, end: state.time + len, len, need, pts: 0, p, taste: !!p.taste };
      ev({ type: 'raidCast', need, len });
      break;
    }
    case 'mark': {
      const n = p.count ?? 1, picked = [];
      for (let i = 0; i < n; i++) { const t = pickTarget(state, e, p.target ?? 'random'); if (t && !picked.includes(t)) picked.push(t); }
      for (const t of picked) state.raidMarks.push({ uid: t.uid, eid: e.eid, pid: p.id, at: state.time + W, p, taste: !!p.taste });
      if (picked.length) ev({ type: 'raidMark', uids: picked.map((u) => u.uid), warn: W });
      break;
    }
    case 'zone': {
      const lane = p.lane === 'most' ? busiestLane(state) : Math.floor(state.rng() * 3);
      state.raidZones.push({ lane, until: state.time + (p.effect?.dur ?? 8), pct: (p.effect?.pct ?? 2) * (eco(state, data, 'raidZoneHalf') ? 0.5 : 1), eid: e.eid, acc: 0, pid: p.id, spawn: p.effect?.spawn ?? null, spawnN: p.effect?.spawnN ?? 0 });
      if (p.effect?.spawn) for (let i = 0; i < (p.effect.spawnN ?? 1); i++) { const m = API.addEnemy(state, data, p.effect.spawn, state.plan[state.enc].wave); if (m) { m.minion = true; m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * (g.minionHp ?? 0.5))); } }
      ev({ type: 'raidZone', lane });
      break;
    }
    case 'hide': e.raid.hide = state.time + (p.effect?.dur ?? 4); ev({ type: 'raidHide', dur: p.effect?.dur ?? 4 }); break;
    case 'poison': {
      for (const u of API.fighters(state)) u.raidPoison = Math.min(p.effect?.max ?? 6, (u.raidPoison ?? 0) + (p.effect?.stacks ?? 1) - (eco(state, data, 'raidCleanse') ? 0.5 : 0));
      ev({ type: 'raidPoison' });
      break;
    }
    case 'blizzard': state.raidBlizzard = { until: state.time + (p.effect?.dur ?? 8), slow: p.effect?.slow ?? 0.2, safe: p.effect?.safe ?? 'fire', eid: e.eid }; ev({ type: 'raidBlizzard' }); break;
    case 'rally': for (const m of state.enemies.filter((x) => alive(x) && x.minion)) m.attack = Math.round(m.attack * (1 + (p.effect?.atk ?? 30) / 100)); ev({ type: 'raidRally' }); break;
    case 'rocks': {
      const live = API.fighters(state).filter((u) => (u.stats?.element ?? null) !== (p.effect?.immune ?? '-'));
      for (let i = 0; i < (p.effect?.count ?? 2) && live.length; i++) { const u = live.splice(Math.floor(state.rng() * live.length), 1)[0]; API.hurtUnit(state, data, u, u.maxHp * (p.effect?.pct ?? 4) / 100 * (eco(state, data, 'hazardHalf') ? 0.5 : 1), e); }
      ev({ type: 'raidRocks' });
      break;
    }
    default: break;
  }
}

function finishCast(state, data, e) {
  const c = e.raid.cast; e.raid.cast = null;
  const p = c.p, f = p.effect ?? {};
  state.raidBusyUntil = state.time + 1;
  const ev = (o) => state.events.push({ type: 'raidCastDone', eid: e.eid, boss: e.id, pid: p.id, ...o });
  const live = API.fighters(state);
  switch (f.type) {
    case 'heal': for (const o of state.enemies.filter(alive)) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (f.pct ?? 15) * (p.power ?? 1) / 100); ev({ heal: true }); break;
    case 'healPerMinion': {
      const ms = state.enemies.filter((x) => alive(x) && x.minion);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (f.pct ?? 4) * ms.length * (p.power ?? 1) / 100);
      if (f.eat) for (const m of ms) { m.hp = 0; state.eSeats[state.eSeats.indexOf(m.eid)] = null; state.events.push({ type: 'kill', eid: m.eid, boss: false, by: null }); }
      ev({ heal: true, n: ms.length });
      break;
    }
    case 'armor': fire(state, data, e, { ...p, kind: 'armor', effect: f }); ev({}); break;
    case 'knock': {
      const lane = busiestLane(state);
      const t = live.filter((u) => API.laneOf(u.seat) === lane).sort((a, b) => a.seat - b.seat)[0] ?? live[0];
      if (t) {
        const cover = live.some((u) => u !== t && API.laneOf(u.seat) === lane && API.styleOf(u) === 'bruiser');
        const shield = (t.shieldT ?? 0) > state.time;
        API.hurtUnit(state, data, t, dmgOf(e, p, f.dmg ?? 1.6) * (cover ? 0.5 : 1) * (shield ? 0.4 : 1), e);
        if (aliveU(t) && !shield) t.stunLeft = Math.max(t.stunLeft ?? 0, f.stun ?? 1.5);
        ev({ uid: t.uid, cover });
      }
      break;
    }
    case 'buster': {
      const cl = (state.clashes ?? []).find((x) => x.eid === e.eid);
      let t = cl ? live.find((u) => u.uid === cl.uid) : null;
      t ??= live.filter((u) => API.styleOf(u) === 'bruiser').sort((a, b) => a.seat - b.seat)[0] ?? live.sort((a, b) => a.seat - b.seat)[0];
      if (!t) break;
      let swapped = false;
      if ((t.raidHeat ?? 0) > state.time) {
        const other = live.find((u) => u !== t && API.styleOf(u) === 'bruiser' && API.tacticOf(u, API.gcfg(state.dataRef)) === 'guard' && !((u.raidHeat ?? 0) > state.time));
        if (other) { t = other; swapped = true; }
      }
      const heated = (t.raidHeat ?? 0) > state.time;
      const shield = (t.shieldT ?? 0) > state.time;
      API.hurtUnit(state, data, t, dmgOf(e, p, f.dmg ?? 2) * (heated ? f.heatMult ?? 2 : 1) * (shield ? 0.4 : 1), e);
      t.raidHeat = state.time + (f.heat ?? 8);
      ev({ uid: t.uid, swapped, heated });
      break;
    }
    case 'bigHit': {
      const d0 = e.raid.duel && live.find((u) => u.uid === e.raid.duel.uid);
      const t = d0 ?? API.lowest(live.filter(API.isBack).length ? live.filter(API.isBack) : live);
      if (!t) break;
      const shield = (t.shieldT ?? 0) > state.time;
      API.hurtUnit(state, data, t, dmgOf(e, p, f.dmg ?? 2.4) * (shield ? 0.4 : 1), e);
      if (!aliveU(t) && f.healOnKill) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * f.healOnKill / 100);
      ev({ uid: t.uid });
      break;
    }
    case 'banish': {
      const t = pickTarget(state, e, 'top');
      if (t && !((t.shieldT ?? 0) > state.time)) { t.stunLeft = Math.max(t.stunLeft ?? 0, f.stun ?? 5); t.raidBanished = state.time + (f.stun ?? 5); }
      ev({ uid: t?.uid ?? null });
      break;
    }
    default: ev({});
  }
}

function resolveMark(state, data, m) {
  const e = state.enemies.find((x) => x.eid === m.eid);
  let u = state.field.find((x) => x.uid === m.uid);
  if (!alive(e) || !aliveU(u)) return;
  const p = m.p, f = p.effect ?? {};
  const shield = (u.shieldT ?? 0) > state.time;
  // 🛡 지키기 작전 브루저가 대신 맞으러 나섬(뒷줄 동물이 노려졌을 때)
  let guard = null;
  if (!shield && API.styleOf(u) !== 'bruiser' && !f.noGuard) {
    guard = API.fighters(state).find((x) => x !== u && API.styleOf(x) === 'bruiser' && API.tacticOf(x, API.gcfg(state.dataRef)) === 'guard' && Math.abs(API.laneOf(x.seat) - API.laneOf(u.seat)) <= 1);
  }
  const hitU = guard ?? u;
  const k = (shield ? 0.4 : 1) * (guard ? 0.6 : 1) * (learned(state, e, p.id) ? 0.8 : 1) * (f.bruiserHalf && API.styleOf(hitU) === 'bruiser' ? 0.5 : 1);
  if (f.dmg) API.hurtUnit(state, data, hitU, dmgOf(e, p, f.dmg) * k, e);
  const safe = shield || !!guard;
  if (!safe && aliveU(u)) {
    if (f.freeze) u.stunLeft = Math.max(u.stunLeft ?? 0, f.freeze * (p.power ?? 1));
    if (f.stun) u.stunLeft = Math.max(u.stunLeft ?? 0, f.stun);
    if (f.curse) u.raidCurse = state.time + f.curse;
    if (f.pull) u.stunLeft = Math.max(u.stunLeft ?? 0, f.pull);
  }
  if (f.duel && !m.taste) e.raid.duel = { uid: u.uid, until: state.time + f.duel };
  if (safe && m.taste) learn(state, p.id, e);
  state.events.push({ type: 'raidMarkHit', eid: e.eid, boss: e.id, pid: p.id, uid: hitU.uid, marked: u.uid, shield, guard: guard?.uid ?? null });
}

function duelTick(state, data, e, d) {
  const du = e.raid.duel;
  if (state.time >= du.until) { e.raid.duel = null; return; }
  du.acc = (du.acc ?? 0) + d;
  if (du.acc < 1) return;
  du.acc = 0;
  const u = state.field.find((x) => x.uid === du.uid);
  if (!aliveU(u)) { e.raid.duel = null; return; }
  const guard = API.fighters(state).find((x) => x !== u && API.styleOf(x) === 'bruiser' && API.tacticOf(x, API.gcfg(state.dataRef)) === 'guard');
  const t = guard ?? u;
  API.hurtUnit(state, data, t, e.attack * (e.raid.def.duelDmg ?? 0.5) * ((t.shieldT ?? 0) > state.time ? 0.4 : 1), e);
  state.events.push({ type: 'raidDuelHit', eid: e.eid, uid: t.uid, guard: !!guard });
}

/** 장판·독·눈보라·표식 처리(보스 하나가 맡음) */
function worldTick(state, data, e, d) {
  for (const m of [...state.raidMarks]) if (state.time >= m.at) { state.raidMarks.splice(state.raidMarks.indexOf(m), 1); resolveMark(state, data, m); }
  state.raidZones = state.raidZones.filter((z) => state.time < z.until);
  for (const z of state.raidZones) {
    z.acc += d;
    if (z.acc < 0.5 || !z.pct) continue;
    for (const u of API.fighters(state).filter((x) => API.laneOf(x.seat) === z.lane)) API.hurtUnit(state, data, u, u.maxHp * z.pct * z.acc / 100, e);
    z.acc = 0;
  }
  state.raidPoisonT = (state.raidPoisonT ?? 0) + d;
  const sec = state.raidPoisonT >= 1;
  if (sec) state.raidPoisonT = 0;
  for (const u of API.fighters(state)) {
    // 독: 1초마다 겹 × 0.5%. 회복을 받으면(체력이 늘면) 한 겹 지워짐
    if (sec && (u.raidPoison ?? 0) > 0) {
      if (u.hp > (u.raidHp ?? u.hp) + 0.5) { u.raidPoison = Math.max(0, u.raidPoison - 1); state.events.push({ type: 'raidCleanse', uid: u.uid }); }
      else API.hurtUnit(state, data, u, u.maxHp * (C(data).poisonPct ?? 0.5) * u.raidPoison / 100, e);
    }
    if (sec) u.raidHp = u.hp;
    // 눈보라·서리: 행동 게이지가 덜 참(불 동물이 있는 라인은 괜찮음)
    const bz = state.raidBlizzard && state.time < state.raidBlizzard.until ? state.raidBlizzard : null;
    const safe = bz && API.fighters(state).some((x) => API.laneOf(x.seat) === API.laneOf(u.seat) && x.stats?.element === bz.safe);
    const slow = (bz && !safe ? bz.slow : 0) + ((u.raidSlow ?? 0) > state.time ? 0.3 : 0);
    if (slow > 0 && !(u.stunLeft > 0)) u.gauge = Math.max(0, (u.gauge ?? 0) - slow * d / Math.max(0.3, API.uInterval(state, u)));
  }
}

/** 적이 맞을 때 배수(보호막·껍질·숨기). src = 때린 동물(없으면 독·불 같은 지속 피해) */
export function raidHitMult(state, e, src) {
  const r = e.raid;
  if (!r) return 1;
  let k = 1;
  if (r.hide && state.time < r.hide && src && (src.stats?.range ?? 1) <= 1 && !src.stats?.flyer) k *= 0.1;
  if (r.shield) {
    k *= 0.3;
    if (src?.uid != null) {
      r.shield.hit.add(src.uid); r.shield.lanes.add(API.laneOf(src.seat));
      const n = r.shield.mode === 'lanes' ? r.shield.lanes.size : r.shield.hit.size;
      if (n >= r.shield.need) { r.shield = null; state.events.push({ type: 'raidShieldBreak', eid: e.eid, boss: e.id }); }
    }
  }
  if (r.armor) {
    const a = r.armor;
    const on = !a.needMinion || state.enemies.some((x) => alive(x) && x.id === a.needMinion);
    if (on) k *= a.mult;
    if (src && a.need && a.by.includes(src.stats?.element)) {
      a.hits += 1;
      if (a.hits >= a.need) { r.armor = null; if (a.stunOnBreak) { e.stunLeft = Math.max(e.stunLeft ?? 0, a.stunOnBreak); } state.events.push({ type: 'raidArmorBreak', eid: e.eid, boss: e.id }); }
    }
  }
  return k;
}

/** 우리 동물이 맞을 때 배수(저주) */
export function raidTakenMult(state, u) {
  return (u.raidCurse ?? 0) > state.time ? 1.3 : 1;
}

/** 필살기가 레이드 장치와 맞물림: 산군의 포효 = 시전 즉시 끊김, 대돌진·개미 군단·하늘의 눈 = 끊기 +2, 하늘의 눈 = 보호막 깸, 단비 = 독·저주 지움 */
export function raidUlt(state, data, id) {
  if (!state.raidMarks) return;
  for (const e of state.enemies.filter((x) => alive(x) && x.raid)) {
    if (e.raid.cast?.need != null) {
      if (id === 'tiger') addPts(state, data, e, 99, 'ult');
      else if (['bison', 'ant', 'eagle'].includes(id)) addPts(state, data, e, 2, 'ult');
    }
    if (id === 'eagle' && e.raid.shield) { e.raid.shield = null; state.events.push({ type: 'raidShieldBreak', eid: e.eid, boss: e.id, by: 'eagle' }); }
  }
  if (id === 'frog') for (const u of state.field) { u.raidPoison = 0; u.raidCurse = 0; }
}

/** 손조작: 보라 시전 막대를 누르면 응원 톡 1번을 써서 끊기 +1 */
export function raidTap(state, data) {
  if (state.phase !== 'fight') return { ok: false, reason: 'noFight' };
  const e = state.enemies.find((x) => alive(x) && x.raid?.cast && x.raid.cast.need != null);
  if (!e) return { ok: false, reason: 'noCast' };
  const max = 8 + (eco(state, data, 'cheerTaps') ?? 0);
  if ((state.cheers ?? 0) >= max) return { ok: false, reason: 'noCheers' };
  if (state.time - (state.raidTapAt ?? -9) < (C(data).tapGap ?? 0.4)) return { ok: false, reason: 'cooldown' };
  state.cheers = (state.cheers ?? 0) + 1; state.raidTapAt = state.time;
  addPts(state, data, e, 1, 'tap');
  return { ok: true, left: max - state.cheers };
}

/** 이 동물이 레이드 표식을 받았나(🧿 톡 막기용) */
export const raidMarkOf = (state, uid) => (state.raidMarks ?? []).find((m) => m.uid === uid) ?? null;
/** 🧿 톡 횟수: 레이드 보스 교전이면 tapShieldBoss */
export const raidTapMax = (state, data, base) => (state.raidBoss != null ? C(data).tapShieldBoss ?? base : base);
/** 보스 교전은 시간 판정 대신 광포화(cap초까지) */
export function raidHoldTime(state, data) {
  const en = C(data).enrage;
  if (!en || state.raidBoss == null) return false;
  const b = state.enemies.find((x) => x.eid === state.raidBoss);
  return alive(b) && state.encTime < (en.cap ?? 150);
}

/** 미니보스 자리를 설정값(common.minibossAt, 0부터 센 교전 번호)으로 옮김. 없으면 그대로 */
export function moveMiniboss(plan, data) {
  const at = raidCommon(data).minibossAt;
  if (at == null || !plan[at] || plan[at].boss) return plan;
  const from = plan.findIndex((s) => s.ids.includes('miniboss'));
  if (from < 0 || from === at) return plan;
  plan[from].ids.splice(plan[from].ids.indexOf('miniboss'), 1);
  plan[at].ids[0] = 'miniboss';
  return plan;
}

/** 보스 카드(출전 준비·덱 화면): 속성·약점·필요한 역할·패턴 목록·추천 동물 */
export function bossCard(data, stage) {
  const id = stage?.boss, R = raidDef(data, id), def = data.enemyById?.[id];
  if (!R || !def) return null;
  return { id, name: def.name, element: raidElement(data, id) ?? null, phaseElements: R.phaseElements ?? null, weak: R.weak ?? def.weak ?? [], need: R.need ?? [], good: R.good ?? [], bad: R.bad ?? [], spell: R.spell ?? null,
    patterns: (R.patterns ?? []).map((p) => ({ id: p.id, kind: p.kind, phase: p.phase ?? 1, telegraph: p.kind === 'cast' ? (p.need != null ? 'bar' : 'barHard') : p.kind === 'mark' ? 'mark' : p.kind === 'zone' ? 'zone' : 'none' })) };
}

/** 이 동물이 이 보스에 잘 맞나(보스 카드 good 목록·속성) — 지구본 '🎯 보스 대비' 표시용 */
export function bossFit(data, stage, speciesId) {
  const R = raidDef(data, stage?.boss);
  if (!R) return 0;
  if ((R.good ?? []).includes(speciesId)) return 1;
  if ((R.bad ?? []).includes(speciesId)) return -1;
  return 0;
}

/** 공통 필살(라인 내려찍기)에 보스마다 덧붙는 효과: slow 느려짐(초) · poison 독 겹 */
export function raidSlamFx(state, data, e, hits) {
  const f = e?.raid?.def?.slamFx;
  if (!f) return;
  for (const h of hits) {
    const u = state.field.find((x) => x.uid === h.uid);
    if (!aliveU(u) || h.shield) continue;
    if (f.slow) u.raidSlow = state.time + f.slow;
    if (f.poison) u.raidPoison = Math.min(6, (u.raidPoison ?? 0) + f.poison);
  }
}

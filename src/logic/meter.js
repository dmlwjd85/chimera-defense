// 딜 미터기(2026-11-28 선생님 "딜 미터기 보여줘 넣은딜 막은딜 회복한양 등등").
// 규칙이 적는 체력 장부(state.hpLog 한 줄 = 실제 체력 변화, #96)를 읽기만 해서 우리 동물마다 쌓음. 규칙 상태는 바꾸지 않음(읽기 전용).
//  dmg   넣은 피해 = 그 동물이 적에게 실제로 깎은 체력
//  block 막은 피해 = 보호막·막기로 줄어든 양(보호막을 건 동물 몫, 없으면 맞은 동물 몫) — 장부 blocked
//  heal  회복한 양 = 그 동물이 우리 편에게 실제로 채운 체력(스스로 재생 regen은 빼고, 흡혈·부활 포함)
//  taken 받은 피해 = 그 동물이 실제로 잃은 체력
//  kills 처치 수(마지막 일격) · breaks 보스 기술 끊기(팀 몫, raidInterrupt 사건)
// 한 줄은 번호(n)로 한 번만 셈(같은 줄을 두 번 읽어도 두 번 안 셈). 장부의 교전 요약(clBook)과 같은 규칙.
export const METER_KEYS = ['dmg', 'block', 'heal', 'taken'];
export const METER_EXTRA = ['kills'];

export function newMeter(lastN = 0) { return { units: {}, team: { breaks: 0 }, lastN }; }
const zero = () => ({ dmg: 0, block: 0, heal: 0, taken: 0, kills: 0 });
const ally = (r) => (r && r.side === 'u' && r.id != null ? r.id : null);
const row = (m, uid) => (m.units[uid] ??= zero());

/** 장부 한 줄 → 미터. 셌으면 true */
export function meterAddRow(m, r) {
  if (!r) return false;
  if (r.n != null) { if (r.n <= m.lastN) return false; m.lastN = r.n; }
  const d = r.d ?? 0;
  if (r.side === 'e' && d < 0) {
    const by = ally(r.by);
    if (by != null) { row(m, by).dmg += -d; if (r.kill) row(m, by).kills += 1; }
  }
  if (r.side === 'u') {
    if (d < 0) row(m, r.id).taken += -d;
    if ((r.blocked ?? 0) > 0) { const sb = r.shieldBy ?? { side: 'u', id: r.id }; if (ally(sb) != null) row(m, sb.id).block += r.blocked; }
    if (d > 0 && r.kind !== 'regen') { const by = ally(r.by); if (by != null) row(m, by).heal += d; }
  }
  return true;
}

/** 장부 여러 줄(새 줄만 셈) */
export function meterPull(m, rows) { let n = 0; for (const r of rows ?? []) if (meterAddRow(m, r)) n++; return n; }

/** 사건 → 미터(보스 기술 끊기) */
export function meterEvent(m, ev) { if (ev?.type === 'raidInterrupt') m.team.breaks += 1; }

/** 교전 미터를 판 전체 미터에 더함. keyOf(uid) → 판 전체에서 쓸 번호(자라서 번호가 바뀐 동물을 한 줄로 모을 때) */
export function meterMerge(into, m, keyOf = (uid) => uid) {
  for (const [uid, r] of Object.entries(m.units)) { const t = row(into, keyOf(+uid)); for (const k of [...METER_KEYS, ...METER_EXTRA]) t[k] += r[k]; }
  into.team.breaks += m.team.breaks;
  return into;
}

/** 줄 목록(넣은 피해 많은 순). nameOf(uid) → 이름. 아무것도 안 한 동물은 뺌 */
export function meterRows(m, nameOf = (uid) => String(uid)) {
  return Object.entries(m.units).map(([uid, r]) => ({ uid: +uid, name: nameOf(+uid), ...r }))
    .filter((r) => r.dmg + r.block + r.heal + r.taken > 0.5)
    .sort((a, b) => b.dmg - a.dmg || b.block + b.heal - (a.block + a.heal));
}

/** 항목별 1등 uid(0보다 클 때만) */
export function meterLeaders(m) {
  const out = {};
  for (const k of [...METER_KEYS, ...METER_EXTRA]) {
    let best = null, bv = 0.5;
    for (const [uid, r] of Object.entries(m.units)) if (r[k] > bv) { bv = r[k]; best = +uid; }
    if (best != null) out[k] = best;
  }
  return out;
}

/** 모두 합(검사용) */
export function meterTotals(m) {
  const t = zero();
  for (const r of Object.values(m.units)) for (const k of Object.keys(t)) t[k] += r[k];
  return t;
}

/** 자람(성장기·성체)은 규칙에서 새 번호의 동물로 바뀜 → 판 전체 기록은 같은 동물로 이어 셈.
 *  prev·now = [{ uid, speciesId }] (정비 전·후 명단), alias = Map(새 번호 → 처음 번호). 같은 종이 사라지고 새로 생기면 이어 붙임(합성으로 생긴 다른 종은 새 동물) */
export function meterLink(alias, prev, now) {
  const root = (u) => { let x = u, n = 0; while (alias.has(x) && n++ < 50) x = alias.get(x); return x; };
  const nowIds = new Set(now.map((n) => n.uid)), prevIds = new Set(prev.map((p) => p.uid));
  const gone = prev.filter((p) => !nowIds.has(p.uid));
  for (const n of now) {
    if (prevIds.has(n.uid) || alias.has(n.uid)) continue;
    const i = gone.findIndex((g) => g.speciesId === n.speciesId);
    if (i >= 0) { alias.set(n.uid, root(gone[i].uid)); gone.splice(i, 1); }
  }
  return root;
}

// 공격 기술 묶음(2026-11-26): 단계마다 쓸 수 있는 공격 수가 다르고, 매 공격마다 조건에 따라 가중치를 바꿔 무작위로 고름.
//   어린: 기본1 / 성장기: 기본1·기본2 / 성체: 기본1·기본2·속성 / 신화·키메라: 기본1·기본2·속성·필살기
// 기본2는 역할마다 모양이 다름(맷집=몸통박치기, 딜러=연속 공격, 기술=급소 찌르기, 지원=응원 박치기, 원거리=2연사).
// 필살기는 무작위가 아니라 게이지가 차면 다음 공격에 나감(때릴 때·맞을 때·처치할 때 참).
import { climateSide } from './elements.js';

const M = (cfg) => cfg.moves ?? null;

/** Which moves this unit has (by stage / chimera). */
export function movesOf(u, cfg) {
  const m = M(cfg);
  if (!m) return ['a1'];
  const key = u.kind === 'chimera' ? 'chimera' : u.kind === 'weak' ? 'young' : u.stage;
  const list = m.stages[key] ?? m.stages.young;
  return u.stats.element ? list : list.filter((k) => k !== 'el');
}

/** Role-shaped second basic attack. */
export function a2Of(u, cfg) {
  const role = u.stats.range > 1 ? 'ranged' : u.stats.role;
  return M(cfg)?.a2ByRole?.[role] ?? M(cfg)?.a2ByRole?.dealer;
}

/** Ultimate name for this unit (species data → default). */
export function ultName(u, cfg) {
  const m = M(cfg);
  if (u.kind === 'chimera') return m?.ult?.chimeraName ?? '키메라 일격';
  return m?.ultNames?.[u.speciesId] ?? m?.ult?.name ?? '필살기';
}

/**
 * Pick the move for this attack. Weights (config.moves.weights) change with the situation:
 *  - 기본2: 표적 근처에 적이 crowd마리 이상이면 ×crowdMult, 표적 체력이 lowHp 아래면 ×lowHpMult
 *  - 속성: 쿨다운 중이면 못 씀, 표적이 그 속성에 약하면(불타는 중이 아닌데 물/얼음 기후 등은 기후로) ×기후 배수, 특성·유물의 속성 확률 +%p
 *  - 필살기: 게이지가 가득 차면 무조건
 */
export function pickMove(state, u, target, cfg) {
  const m = M(cfg);
  const have = movesOf(u, cfg);
  if (!m || have.length === 1) return 'a1';
  if (have.includes('ult') && (u.ultGauge ?? 0) >= m.ult.gauge) return 'ult';
  const r = m.rules, w = {};
  for (const k of have) if (k !== 'ult') w[k] = m.weights[k] ?? 0;
  if (w.a2 != null) {
    const near = state.enemies.filter((e) => e !== target && e.hp > 0 && Math.abs(e.pos - target.pos) <= 1).length;
    if (near + 1 >= r.a2.crowd) w.a2 *= r.a2.crowdMult;
    if (target.hp / target.maxHp < r.a2.lowHp) w.a2 *= r.a2.lowHpMult;
  }
  if (w.el != null) {
    if ((u.elCd ?? 0) > 0) w.el = 0;
    else {
      w.el += u.mods?.elemChance ?? 0;
      w.el *= climateSide(u.stats.element, cfg.climates?.[state.stage.climate], r.el.climateUp, r.el.climateDown, 1);
      if (target.boss) w.el *= r.el.bossMult;
    }
  }
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  let roll = state.rng() * total;
  for (const [k, v] of Object.entries(w)) { if (roll < v) return k; roll -= v; }
  return 'a1';
}

/** Charge the ultimate gauge (only units that have one). */
export function chargeUlt(u, cfg, kind, amount = 1) {
  const m = M(cfg);
  if (!m || !movesOf(u, cfg).includes('ult')) return;
  const add = kind === 'hit' ? m.ult.perHit : kind === 'kill' ? m.ult.perKill : kind === 'hurt' ? m.ult.perHurtPct * amount : 0;
  u.ultGauge = Math.min(m.ult.gauge, (u.ultGauge ?? 0) + add);
}

/** Tick move cooldowns. */
export function tickMoves(u, dt) { if (u.elCd > 0) u.elCd = Math.max(0, u.elCd - dt); }

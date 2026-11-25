// 성문 출전(작업기록 16): 배치 칸 없이 타고난 역할대로 자리를 잡는다.
// 준비 시간엔 성문 안에서 쉬고, 웨이브가 오면 한 마리씩 줄지어 달려나와 자기 자리로 퍼지며,
// 웨이브가 끝나면 다시 성문 안으로 걸어 들어간다.

const M = (cfg) => cfg.muster ?? {};

/** Where the gate is (tile pos) and how deep its doorway sits (0 back … 1 front). */
export const gatePos = (cfg) => M(cfg).gate ?? -0.6;
export const gateDepth = (cfg, state) => state?.gateY ?? M(cfg).gateY ?? 0.7;

/** Role rank: who runs out first and stands furthest forward. */
export function rankOf(u) {
  if (u.stats.flyer) return 3;
  if (u.stats.range > 1) return u.stats.role === 'buffer' ? 5 : 4;
  return { bruiser: 0, dealer: 1, technician: 2, buffer: 5 }[u.stats.role] ?? 2;
}

/** How far behind the front line each rank stands (tiles). */
const BACK = [0, 0.45, 0.9, 0.7, 1.6, 2.1];

/** n depths spread over the field, middle first for the front line, flanks first for dealers. */
function depths(n, rank) {
  if (n <= 0) return [];
  if (rank === 1) return [0.18, 0.82, 0.5, 0.34, 0.66, 0.08].slice(0, n);
  if (n === 1) return [0.5];
  const lo = n === 2 ? 0.3 : 0.14, hi = n === 2 ? 0.7 : 0.86;
  const even = [...Array(n).keys()].map((i) => lo + ((hi - lo) * i) / (n - 1));
  // 가운데부터 채워서 한 마리 더 들어와도 자리가 크게 흔들리지 않게
  return even.sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
}

/** Give every field animal its battle spot from its role alone (no player placement). */
export function assignSlots(state, cfg) {
  const front = cfg.formation?.front ?? 6;
  const back = M(cfg).back ?? BACK;
  const sky = M(cfg).sky ?? [150, 190, 230];
  const groups = new Map();
  for (const u of state.field) { const r = rankOf(u); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(u); }
  // 맨 앞에 선 무리가 전열(front)에 서도록: 맷집이 없으면 딜러가, 딜러도 없으면 그다음이 앞장섬
  const ground = [...groups.keys()].filter((r) => r !== 3);
  const lead = ground.length ? Math.min(...ground.map((r) => back[r] ?? 1)) : 0;
  for (const [rank, list] of groups) {
    list.sort((a, b) => a.uid - b.uid);
    const ys = depths(list.length, rank);
    list.forEach((u, i) => {
      u.slot = Math.max(0.5, front - Math.max(0, (back[rank] ?? 1) - lead));
      u.rowY = ys[i];
      u.rank = rank;
      if (u.stats.flyer) { u.lane = null; u.skyRow = i % sky.length; u.skyY = sky[u.skyRow]; }
      else u.lane = Math.round(u.rowY * 2);
    });
  }
}

/** Put an animal inside the gate (hidden, waiting). */
export function intoGate(u, cfg, state) {
  Object.assign(u, { pos: gatePos(cfg), targetPos: gatePos(cfg), y: gateDepth(cfg, state), targetY: gateDepth(cfg, state), inGate: true, rushing: false, moving: false, formationMove: false, gateDelay: 0, via: null });
}

/** Wave start: everyone in the gate lines up and runs out one by one, front-liners first. */
export function musterOut(state, cfg) {
  assignSlots(state, cfg);
  const stagger = M(cfg).stagger ?? 0.35;
  const order = [...state.field].sort((a, b) => a.rank - b.rank || a.uid - b.uid);
  order.forEach((u, i) => { intoGate(u, cfg, state); u.gateDelay = i * stagger; });
}

/** Someone deployed mid-wave runs straight out of the gate. */
export function sendOut(state, cfg, u) {
  assignSlots(state, cfg);
  const last = Math.max(0, ...state.field.filter((o) => o.inGate && o !== u).map((o) => o.gateDelay ?? 0));
  intoGate(u, cfg, state);
  u.gateDelay = state.field.some((o) => o.inGate && o !== u) ? last + (M(cfg).stagger ?? 0.35) : 0;
}

/** Each tick of a wave: release animals from the gate, walk the line-out waypoint, then hand over to the brawl. */
export function tickMuster(state, cfg, dt) {
  const out = M(cfg).lineOut ?? 1.1;
  for (const u of state.field) {
    if (u.inGate) {
      u.gateDelay = (u.gateDelay ?? 0) - dt;
      if (u.gateDelay > 0) continue;
      u.inGate = false; u.rushing = true;
      // 문 앞으로 똑바로 한 줄 → 그다음 자기 자리로 부채꼴로 퍼짐
      u.via = [gatePos(cfg) + out, gateDepth(cfg, state)];
      u.targetPos = u.via[0]; u.targetY = u.stats.flyer ? u.targetY : u.via[1];
      u.formationMove = true;
      continue;
    }
    if (!u.rushing) continue;
    const there = Math.abs(u.targetPos - u.pos) < 1e-6 && Math.abs(u.targetY - u.y) < 1e-6;
    if (!there) continue;
    if (u.via) { u.via = null; u.targetPos = u.slot; u.targetY = u.stats.flyer ? u.targetY : u.rowY; u.formationMove = true; }
    else u.rushing = false;
  }
}

/** Speed factor while running out of the gate. */
export const rushMult = (cfg, u) => (u.rushing ? M(cfg).runMult ?? 1.6 : 1);

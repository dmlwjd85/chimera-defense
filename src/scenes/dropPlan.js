import { PATH_Y, PATH_H, SLOT, xToTile, benchSlotPos, laneAt, SKY_TOP, SKY_BOTTOM, inRosterRow } from './layout.js';
import { mergeKind, mergePreview } from '../logic/merge.js';
import { sellPrice } from '../logic/economy.js';

// Pure drop rules for the battle screen (no Phaser): what a drag-and-drop or tap should do.
export const DRAG_MIN = 8;
export const DROP_RADIUS = 40;
export const RING = { evolve: 0x2ecc71, spirit: 0x2ecc71, known: 0xb06bff, unknown: 0xffd84d };   // 진화 초록 ⬆, 아는 키메라 보라 ✦, 모험 노랑 ?(개선제안 5)

/** Where a unit lives: { where: 'field', uid } or { where: 'bench', index }, or null. */
export function refOf(state, uid) {
  if (state.field.some((u) => u.uid === uid)) return { where: 'field', uid };
  const index = state.bench.findIndex((u) => u && u.uid === uid);
  return index >= 0 ? { where: 'bench', index } : null;
}

/** Unit for a ref, or null. */
export function unitOf(state, ref) {
  if (!ref) return null;
  if (ref.where === 'field') return state.field.find((u) => u.uid === ref.uid) ?? null;
  return state.bench[ref.index] ?? null;
}

/** All live units, field first. */
export const allUnits = (state) => [...state.field, ...state.bench.filter(Boolean)];

/** True when a screen point is on the path strip. */
export const onPath = (y) => Math.abs(y - PATH_Y) <= PATH_H / 2;

/** Bench slot index under a screen point, or -1. */
export function benchSlotAt(x, y, benchSize) {
  for (let i = 0; i < benchSize; i++) { const p = benchSlotPos(i); if (Math.abs(x - p.x) <= SLOT / 2 && Math.abs(y - p.y) <= SLOT / 2) return i; }
  return -1;
}

/**
 * Decide what a drop does, without touching the screen (pure, testable).
 * Returns { action: 'merge'|'sell'|'deploy'|'move'|'recall'|'none', ... }.
 */
export function planDrop(state, data, uid, x, y, ctx) {
  const fromRef = refOf(state, uid);
  const from = unitOf(state, fromRef);
  if (!from) return { action: 'none' };
  let best = null;
  for (const [otherUid, p] of ctx.positions) {
    if (otherUid === uid) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= DROP_RADIUS && (!best || d < best.d)) best = { uid: otherUid, d };
  }
  if (best) {
    const toRef = refOf(state, best.uid);
    const to = unitOf(state, toRef);
    if (to) {
      const p = mergePreview(from, to, data, state.known);
      return { action: 'merge', fromRef, toRef, preview: p, confirm: p.kind === 'spirit' ? 'spirit' : p.kind === 'chimera' || p.kind === 'weak' ? 'preview' : null };
    }
  }
  if (ctx.inSell) {
    const price = sellPrice(from, data.config);
    return { action: 'sell', ref: fromRef, price, name: from.stats.name, confirm: from.kind === 'chimera' || from.stage === 'spirit' };
  }
  const flyer = !!from.stats?.flyer;
  if (data.config.muster) {
    // 배치 칸 없음: 케이지 동물을 들판이나 출전 줄에 놓으면 출전(자리는 역할이 정함), 출전한 동물을 케이지에 놓으면 귀환
    const onField = onPath(y) || (flyer && y >= SKY_TOP && y <= SKY_BOTTOM);
    if (fromRef.where === 'bench' && (onField || inRosterRow(x, y))) return { action: 'deploy', index: fromRef.index, pos: 0, opts: {} };
    if (fromRef.where === 'field' && benchSlotAt(x, y, state.bench.length) >= 0) return { action: 'recall', uid };
    return { action: 'none' };
  }
  if (flyer ? y >= SKY_TOP && y <= SKY_BOTTOM : onPath(y)) {
    const pos = xToTile(x);
    const opts = flyer ? { skyY: Math.round(y) } : { lane: laneAt(y) };
    return fromRef.where === 'bench' ? { action: 'deploy', index: fromRef.index, pos, opts } : { action: 'move', uid, pos, opts };
  }
  if (fromRef.where === 'field' && benchSlotAt(x, y, state.bench.length) >= 0) return { action: 'recall', uid };
  return { action: 'none' };
}

/** Ring colour for a drag hint, and whether to draw '?'. */
export function ringFor(dragged, other, data, known) {
  const kind = mergeKind(dragged, other, data);
  if (kind === 'evolve' || kind === 'spirit') return { color: RING[kind], question: false, icon: '⬆', width: 5 };
  if (kind === 'chimera') {
    const p = mergePreview(dragged, other, data, known);
    return p.textKey === 'merge.chimera' ? { color: RING.known, question: false, icon: '✦', width: 6 } : { color: RING.unknown, question: true, icon: '?', width: 3 };
  }
  if (kind === 'weak') return { color: RING.unknown, question: true, icon: '?', width: 3 };
  return null;
}


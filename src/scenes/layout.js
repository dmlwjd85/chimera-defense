// Screen layout of the battle scene (no Phaser import, so node tests can use it).
// 2026-11-25 아래 조작판 한 줄(시안 1): 출전 초상화 6 · 케이지 · 판매 · 합성 제단 · 마법 · 지구본 소환. 들판은 y 235~565.
export const SIDE_L = 0, SIDE_R = 1280, SIDE_TOP = 100;
export const PATH_Y = 400, X0 = 100, TILE = 90, PATH_H = 330;
export const DOCK_Y = 612;
export const SLOT = 48, BENCH_X0 = 330, BENCH_GAP = 52, BENCH_Y = 672, BENCH_ROW = 0;

/** Tile position to screen x. */
export function tileToX(pos) { return X0 + pos * TILE; }
/** Screen x to tile position. */
export function xToTile(x) { return (x - X0) / TILE; }
/** Centre of a cage slot (2 columns in the left sidebar). */
export function benchSlotPos(i) { return { x: BENCH_X0 + i * BENCH_GAP, y: BENCH_Y }; }
/** Screen x of a cage slot centre. */
export function benchSlotX(i) { return benchSlotPos(i).x; }
/** Centre of a deployed-animal portrait (one row, dock left). */
export function rosterPos(i) { return { x: 32 + i * 46, y: 672 }; }
/** True when a screen point is on the deployed-animal row (drop a cage animal there to send it out). */
export function inRosterRow(x, y) { return x >= 6 && x <= rosterPos(5).x + 24 && Math.abs(y - 672) <= 30; }

/** Container y for each ground lane (0 top, 1 middle, 2 bottom); the unit's feet sit ~30px lower. */
export const LANE_Y = [PATH_Y - 150, PATH_Y - 8, PATH_Y + 134];
/** 원근감: 뒷줄은 조금 작게, 앞줄은 조금 크게. */
export const LANE_SCALE = [0.8, 0.98, 1.16];
/** Flyers can hover anywhere between these screen heights. */
export const SKY_TOP = 130, SKY_BOTTOM = PATH_Y + 20;
/** Nearest lane for a screen y. */
export function laneAt(y) { const t = (y - (PATH_Y - PATH_H / 2)) / (PATH_H / 3); return Math.max(0, Math.min(2, Math.floor(t))); }

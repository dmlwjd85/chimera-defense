// Screen layout of the battle scene (no Phaser import, so node tests can use it).
// 2026-11-25 사이드바 배치: 왼쪽(출전 초상화·케이지·판매·먹이), 오른쪽(합성 제단·소환·마법), 가운데는 넓은 들판.
export const SIDE_L = 104, SIDE_R = 1176, SIDE_TOP = 100;
export const PATH_Y = 446, X0 = 150, TILE = 82, PATH_H = 420;
export const SLOT = 50, BENCH_X0 = 28, BENCH_GAP = 48, BENCH_Y = 318, BENCH_ROW = 56;
/** 아래 조작판은 없앰(사이드바로). 화면 맨 아래. */
export const DOCK_Y = 720;

/** Tile position to screen x. */
export function tileToX(pos) { return X0 + pos * TILE; }
/** Screen x to tile position. */
export function xToTile(x) { return (x - X0) / TILE; }
/** Centre of a cage slot (2 columns in the left sidebar). */
export function benchSlotPos(i) { return { x: BENCH_X0 + (i % 2) * BENCH_GAP, y: BENCH_Y + Math.floor(i / 2) * BENCH_ROW }; }
/** Screen x of a cage slot centre. */
export function benchSlotX(i) { return benchSlotPos(i).x; }
/** Centre of a deployed-animal portrait (2 columns × 3 rows, left sidebar top). */
export function rosterPos(i) { return { x: BENCH_X0 + (i % 2) * BENCH_GAP, y: 148 + Math.floor(i / 2) * 52 }; }

/** Container y for each ground lane (0 top, 1 middle, 2 bottom); the unit's feet sit ~30px lower. */
export const LANE_Y = [PATH_Y - 172, PATH_Y - 12, PATH_Y + 148];
/** 원근감: 뒷줄은 조금 작게, 앞줄은 조금 크게. */
export const LANE_SCALE = [0.8, 0.99, 1.18];
/** Flyers can hover anywhere between these screen heights. */
export const SKY_TOP = 130, SKY_BOTTOM = PATH_Y + 20;
/** Nearest lane for a screen y. */
export function laneAt(y) { const t = (y - (PATH_Y - PATH_H / 2)) / (PATH_H / 3); return Math.max(0, Math.min(2, Math.floor(t))); }

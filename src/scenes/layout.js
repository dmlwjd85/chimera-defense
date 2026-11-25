// Screen layout of the battle scene (no Phaser import, so node tests can use it).
// 2026-11-25 화면 재배치: 아래 조작판을 한 줄(y 612~720)로 줄이고 들판을 넓힘(y 235~565)
export const PATH_Y = 400, X0 = 100, TILE = 90, PATH_H = 330, BENCH_Y = 667, BENCH_X0 = 66, BENCH_GAP = 84, SLOT = 76;
export const DOCK_Y = 612;

/** Tile position to screen x. */
export function tileToX(pos) { return X0 + pos * TILE; }
/** Screen x to tile position. */
export function xToTile(x) { return (x - X0) / TILE; }
/** Screen x of a bench slot centre. */
export function benchSlotX(i) { return BENCH_X0 + i * BENCH_GAP; }

/** Container y for each ground lane (0 top, 1 middle, 2 bottom); the unit's feet sit ~30px lower. */
// 2026-11-25 패싸움: 들판을 위아래로 넓힘(뒤 y≈231 ~ 앞 y≈419, 발 위치는 +30)
export const LANE_Y = [PATH_Y - 150, PATH_Y - 8, PATH_Y + 134];
/** 원근감: 뒷줄은 조금 작게, 앞줄은 조금 크게. */
export const LANE_SCALE = [0.8, 0.98, 1.16];
/** Flyers can hover anywhere between these screen heights. */
export const SKY_TOP = 130, SKY_BOTTOM = PATH_Y + 20;
/** Nearest lane for a screen y. */
export function laneAt(y) { const t = (y - (PATH_Y - PATH_H / 2)) / (PATH_H / 3); return Math.max(0, Math.min(2, Math.floor(t))); }

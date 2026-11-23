// Screen layout of the battle scene (no Phaser import, so node tests can use it).
export const PATH_Y = 330, X0 = 100, TILE = 90, PATH_H = 120, BENCH_Y = 630, BENCH_X0 = 110, BENCH_GAP = 105, SLOT = 90;

/** Tile position to screen x. */
export function tileToX(pos) { return X0 + pos * TILE; }
/** Screen x to tile position. */
export function xToTile(x) { return (x - X0) / TILE; }
/** Screen x of a bench slot centre. */
export function benchSlotX(i) { return BENCH_X0 + i * BENCH_GAP; }

/** Container y for each ground lane (0 top, 1 middle, 2 bottom); the unit's feet sit ~30px lower. */
export const LANE_Y = [PATH_Y - 38, PATH_Y - 10, PATH_Y + 18];
/** Flyers can hover anywhere between these screen heights. */
export const SKY_TOP = 130, SKY_BOTTOM = PATH_Y + 40;
/** Nearest lane for a screen y. */
export function laneAt(y) { const t = (y - (PATH_Y - PATH_H / 2)) / (PATH_H / 3); return Math.max(0, Math.min(2, Math.floor(t))); }

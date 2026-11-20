// Screen layout of the battle scene (no Phaser import, so node tests can use it).
export const PATH_Y = 330, X0 = 100, TILE = 90, PATH_H = 120, BENCH_Y = 630, BENCH_X0 = 110, BENCH_GAP = 105, SLOT = 90;

/** Tile position to screen x. */
export function tileToX(pos) { return X0 + pos * TILE; }
/** Screen x to tile position. */
export function xToTile(x) { return (x - X0) / TILE; }
/** Screen x of a bench slot centre. */
export function benchSlotX(i) { return BENCH_X0 + i * BENCH_GAP; }

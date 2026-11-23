// 2D affine helpers for the rig. Angles in degrees, clockwise positive (screen y down).
export const DEG = Math.PI / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Shortest-path angle lerp (degrees). */
export function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}
export const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  step: () => 0,
};
/** Matrix [a,b,c,d,tx,ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty. */
export function fromTRS(x, y, rotDeg, sx = 1, sy = 1) {
  const r = rotDeg * DEG, cs = Math.cos(r), sn = Math.sin(r);
  return [cs * sx, sn * sx, -sn * sy, cs * sy, x, y];
}
export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** Decompose to {x,y,rot,sx,sy} (no skew assumed beyond what sign flips give). */
export function decompose(m) {
  const sx = Math.hypot(m[0], m[1]);
  const det = m[0] * m[3] - m[1] * m[2];
  const sy = sx ? det / sx : 0;
  return { x: m[4], y: m[5], rot: Math.atan2(m[1], m[0]) / DEG, sx, sy };
}
/** Small deterministic PRNG so blinks and idle offsets are reproducible in tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

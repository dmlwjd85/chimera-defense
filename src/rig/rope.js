// Rope deformer: turn a bone chain into evenly spaced points for a bendable strip (tail, snake body).
import { apply } from './math.js';

/** worlds: { bone: matrix }, lengths: { bone: length }. Returns [[x,y], ...] from chain start to tip. */
export function chainPoints(bones, worlds, lengths, segmentsPerBone = 4) {
  const pts = [];
  bones.forEach((b, i) => {
    const m = worlds[b]; const len = lengths[b] || 0;
    for (let s = 0; s < segmentsPerBone; s++) pts.push(apply(m, (len * s) / segmentsPerBone, 0));
    if (i === bones.length - 1) pts.push(apply(m, len, 0));
  });
  return pts;
}

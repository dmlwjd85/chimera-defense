// Keyframe sampling. Keys are [time, value, ease?]; ease applies to the segment that ENDS at that key.
import { EASE, lerp } from './math.js';

export function sampleKeys(keys, t, fallback) {
  if (!keys || !keys.length) return fallback;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k[0]) {
      const p = keys[i - 1];
      const span = k[0] - p[0];
      const u = span > 0 ? (t - p[0]) / span : 1;
      const ease = EASE[k[2] || 'inOut'] || EASE.inOut;
      return lerp(p[1], k[1], ease(u));
    }
  }
  return last[1];
}

const NEUTRAL = { rot: 0, x: 0, y: 0, sx: 1, sy: 1, alpha: 1 };

/** Sample one clip at time t → { bone: {rot,x,y,sx,sy,alpha} } (offsets; sx/sy/alpha are multipliers). */
export function sampleClip(clip, t) {
  const out = {};
  for (const [bone, tr] of Object.entries(clip.tracks || {})) {
    const o = { ...NEUTRAL };
    for (const ch of Object.keys(tr)) o[ch] = sampleKeys(tr[ch], t, NEUTRAL[ch]);
    out[bone] = o;
  }
  return out;
}

export function neutral() { return { ...NEUTRAL }; }

/** Blend two sampled poses: w=0 → a, w=1 → b. */
export function blendPoses(a, b, w) {
  const out = {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const n of names) {
    const pa = a[n] || NEUTRAL, pb = b[n] || NEUTRAL, o = {};
    for (const ch of Object.keys(NEUTRAL)) o[ch] = lerp(pa[ch], pb[ch], w);
    out[n] = o;
  }
  return out;
}

/** Events crossed when time moves from t0 (exclusive) to t1 (inclusive) inside one pass of the clip. */
export function eventsBetween(clip, t0, t1) {
  return (clip.events || []).filter(([t]) => t > t0 && t <= t1).map(([t, name, data]) => ({ t, name, data }));
}

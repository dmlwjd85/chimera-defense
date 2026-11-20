/**
 * Creates a seeded random number generator using the Mulberry32 algorithm.
 * Returns a function that generates numbers in [0, 1).
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a random integer between min and max, inclusive.
 */
export function randInt(rng, min, max) {
  const range = max - min + 1;
  return Math.floor(rng() * range) + min;
}

/**
 * Picks an item from entries based on weights using the provided RNG.
 * entries is an array of [key, weight] pairs.
 * Returns null if total weight is 0 or less.
 */
export function pickWeighted(rng, entries) {
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);

  if (totalWeight <= 0) return null;

  let threshold = rng() * totalWeight;
  
  for (const [key, weight] of entries) {
    threshold -= weight;
    if (threshold < 0) return key;
  }

  // Fallback to last entry in case of floating point precision issues
  return entries[entries.length - 1][0];
}

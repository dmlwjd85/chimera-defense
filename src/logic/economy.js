/**
 * Calculates the cost to summon a new unit at a given stage.
 * The cost increases with each subsequent summon up to a maximum limit.
 */
export function summonCost(count, config) {
  const safeCount = Math.max(0, count);
  return Math.min(config.summon.base + config.summon.step * safeCount, config.summon.max);
}

/**
 * Calculates the reward for completing a wave of enemies.
 * The base reward is increased by a fixed amount per wave.
 */
export function waveReward(wave, config) {
  return config.waveReward.base + config.waveReward.perWave * wave;
}

/**
 * Determines the selling price for an inst based on its kind and stage.
 * Returns 0 if the kind or stage is not recognized in the configuration.
 */
export function sellPrice(inst, config) {
  const prices = config.sell;

  switch (inst.kind) {
    case 'weak': return prices.weak || 0;
    case 'chimera': return prices.chimera || 0;
    case 'base': return prices[inst.stage] || 0;
    default: return 0;
  }
}

/**
 * Calculates the amount of gold gained by skipping time during a stage.
 * The gain is capped at a maximum value defined in the configuration.
 */
export function skipGold(secondsLeft, config) {
  const safeSeconds = Math.max(0, secondsLeft);
  return Math.min(Math.floor(safeSeconds) * config.prep.skipGoldPerSec, config.prep.skipGoldMax);
}

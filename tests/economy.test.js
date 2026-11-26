import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildData, pairKey } from '../src/logic/data.js';
import { makeRng, randInt, pickWeighted } from '../src/logic/rng.js';
import { summonCost, waveReward, sellPrice, skipGold } from '../src/logic/economy.js';

const dataDir = new URL('../public/data/', import.meta.url);

function loadJson(filename) {
  return JSON.parse(readFileSync(new URL(filename, dataDir), 'utf8'));
}

// Load raw data files
const config = loadJson('config.json');
const units = loadJson('units.json');
const recipes = loadJson('recipes.json');
const enemies = loadJson('enemies.json');
const stages = loadJson('stages.json');

const gameData = buildData({ config, units, recipes, enemies, stages });

// Test pairKey
assert.strictEqual(pairKey('fox', 'crow'), 'crow+fox');
assert.strictEqual(pairKey('crow', 'fox'), 'crow+fox');

// Test buildData structure and validation
assert.ok(Array.isArray(gameData.units));
assert.strictEqual(gameData.units.length, 15);
assert.ok(Object.keys(gameData.unitById).length === 15);
assert.ok(Array.isArray(gameData.recipes));
// 염색체 합성: 같은 강 이야기 조합 5 + 자동 35, 강이 다른 옛 조합 2개(치즈 도둑·황소개구리)는 막힘
assert.strictEqual(gameData.recipes.filter((r) => !r.auto).length, 5);
assert.strictEqual(gameData.recipes.filter((r) => r.auto).length, 35);
assert.strictEqual(gameData.oldRecipes.length, 2);
assert.ok(Object.keys(gameData.recipeById).length === 42);
assert.strictEqual(gameData.recipeByPair['crow+fox'], undefined);
assert.strictEqual(gameData.recipeByPair['bighorn+rabbit'].id, 'jackalope');
assert.strictEqual(gameData.recipeByPair['ant+grasshopper'].name, '개짱이');

try {
  buildData({ config: null, units, recipes, enemies, stages });
  assert.fail('buildData should throw on missing key');
} catch (e) {
  assert.ok(e.message.includes('missing'));
}

// Test summonCost
assert.strictEqual(summonCost(0, gameData.config), 40);
assert.strictEqual(summonCost(1, gameData.config), 45);
assert.strictEqual(summonCost(12, gameData.config), 100);
assert.strictEqual(summonCost(13, gameData.config), 100);
assert.strictEqual(summonCost(30, gameData.config), 100);

let totalSummon = 0;
for (let i = 0; i < 24; i++) {
  totalSummon += summonCost(i, gameData.config);
}
assert.strictEqual(totalSummon, 2010);

// Test waveReward
assert.strictEqual(waveReward(1, gameData.config), 35);
assert.strictEqual(waveReward(15, gameData.config), 105);

// Test sellPrice
const youngInst = { kind: 'base', stage: 'young' };
const teenInst = { kind: 'base', stage: 'teen' };
const adultInst = { kind: 'base', stage: 'adult' };
const spiritInst = { kind: 'base', stage: 'spirit' };
const chimeraInst = { kind: 'chimera' };
const weakInst = { kind: 'weak' };

assert.strictEqual(sellPrice(youngInst, gameData.config), 15);
assert.strictEqual(sellPrice(teenInst, gameData.config), 25);
assert.strictEqual(sellPrice(adultInst, gameData.config), 40);
assert.strictEqual(sellPrice(spiritInst, gameData.config), 80);
assert.strictEqual(sellPrice(chimeraInst, gameData.config), 40);
assert.strictEqual(sellPrice(weakInst, gameData.config), 15);

// Test skipGold
assert.strictEqual(skipGold(7.9, gameData.config), 7);
assert.strictEqual(skipGold(20, gameData.config), 15);
assert.strictEqual(skipGold(-3, gameData.config), 0);

// Test makeRng determinism
const rng = makeRng(42);
const values = [];
for (let i = 0; i < 10; i++) {
  values.push(rng());
}
assert.ok(values.every(v => v >= 0 && v < 1));

// Test pickWeighted
const weightedEntries = [['a', 0], ['b', 1]];
for (let i = 0; i < 100; i++) {
  const picked = pickWeighted(makeRng(i), weightedEntries);
  assert.strictEqual(picked, 'b');
}

console.log('All economy tests passed.');

import { readFileSync } from 'node:fs';
import { buildData } from '../src/logic/data.js';

const NAMES = ['config', 'units', 'recipes', 'enemies', 'stages'];
export function loadRaw() {
  const raw = {};
  for (const n of NAMES) raw[n] = JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url), 'utf8'));
  return raw;
}
export function loadData() { return buildData(loadRaw()); }

// 같은 씨앗으로 연전을 끝까지 돌려 결과 지문을 찍음(raid.json이 비었을 때 예전과 같은지 비교용)
import { loadData } from './sim.mjs';
import { createGauntlet, autoRun } from '../src/logic/gauntlet.js';
const D = loadData();
const out = [];
for (const id of ['forest-1', 'forest-3', 'stage-6', 'stage-12']) for (const seed of [3, 11]) for (const hard of [false, true]) {
  const st = createGauntlet(D, id, seed * 7919, { hard, spells: ['meteor', 'wall'] });
  autoRun(st, D);
  out.push([id, seed, hard, st.result, st.enc, st.downs, st.life, Math.round(st.time * 100)].join(','));
}
console.log(out.join('\n'));

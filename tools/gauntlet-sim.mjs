// 연전 자동 플레이 봇: node tools/gauntlet-sim.mjs [runs=30] [--hard] [--stage=forest-1] [--detail]
import { loadData } from './sim.mjs';
import { createGauntlet, autoRun } from '../src/logic/gauntlet.js';

const args = process.argv.slice(2);
const runs = +(args.find((a) => /^\d+$/.test(a)) ?? 30);
const hard = args.includes('--hard');
const detail = args.includes('--detail');
const only = args.find((a) => a.startsWith('--stage='))?.slice(8);
const D = loadData();
D.config.gauntlet = { ...(D.config.gauntlet ?? {}) };
for (const a of args) { const m = a.match(/^--(\w+)=([\d.]+)$/); if (m) D.config.gauntlet[m[1]] = +m[2]; }
const stages = only ? [only] : D.stages.map((s) => s.id);
for (const id of stages) {
  let clear = 0, enc = 0, time = 0, downs = 0, life = 0;
  const reached = {};
  for (let i = 1; i <= runs; i++) {
    // 앞 스테이지를 깬 정도의 덱: 기본 6종 + 스테이지 번호만큼 마법
    const spells = (D.config.spells?.list ?? []).slice(0, 1 + D.stages.findIndex((s) => s.id === id)).map((s) => s.id);
    const st = createGauntlet(D, id, i * 7919, { hard, spells });
    autoRun(st, D);
    if (st.result === 'clear') clear++;
    enc += st.enc; time += st.time; downs += st.downs; life += st.life;
    reached[st.enc] = (reached[st.enc] ?? 0) + 1;
    if (detail) console.log(id, i, st.result, 'enc', st.enc, 'life', st.life, 'downs', st.downs, 't', Math.round(st.time));
  }
  console.log(`${id}${hard ? ' (하드)' : ''}: 클리어 ${Math.round((clear / runs) * 100)}%  평균 교전 ${(enc / runs).toFixed(1)}  평균 ${Math.round(time / runs)}초  쓰러짐 ${(downs / runs).toFixed(1)}  남은 생명 ${(life / runs).toFixed(1)}  도달 ${JSON.stringify(reached)}`);
}

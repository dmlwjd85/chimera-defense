// 연전 자동 플레이 봇: node tools/gauntlet-sim.mjs [runs=30] [--hard] [--stage=forest-1] [--detail]
import { loadData } from './sim.mjs';
import { createGauntlet, autoRun, botPick, TACTICS, BUILD_SETS, styleOf } from '../src/logic/gauntlet.js';
import { bestDeck } from '../src/logic/matchup.js';

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
  const reached = {}; const ds = {}; let fights = 0;
  for (let i = 1; i <= runs; i++) {
    // 앞 스테이지를 깬 정도의 덱: 기본 6종 + 스테이지 번호만큼 마법
    const spells = (D.config.spells?.list ?? []).slice(0, 1 + D.stages.findIndex((s) => s.id === id)).map((s) => s.id);
    const deckMode = args.find((a) => a.startsWith('--deck='))?.slice(7) ?? 'starter';
    const all = D.units.map((u) => u.id), stg = D.stageById[id];
    const pool = deckMode === 'best' ? bestDeck(stg, D, all) : deckMode === 'worst' ? bestDeck(stg, D, all, 6, true) : undefined;
    const bl = args.find((a) => a.startsWith('--build='))?.slice(8).split(',');
    const builds = {};
    if (bl) for (const u of D.units) { const set = u.range > 1 || u.role === 'buffer' ? 'ranged' : 'melee'; const b = bl.find((x) => BUILD_SETS[set].includes(x)); if (b) builds[u.id] = b; }
    const st = createGauntlet(D, id, i * 7919, { hard, spells, pool, builds });
    const tac = args.find((a) => a.startsWith('--tac='))?.slice(6).split(',');
    if (tac) for (const u of [...st.field, ...st.bench]) { if (!u) continue; const o = TACTICS[styleOf(u)]; const pick = o && tac.find((t) => o.includes(t)); if (pick) u.tactic = pick; }
    const rw = args.find((a) => a.startsWith('--reward='))?.slice(9);
    autoRun(st, D, rw ? (s2, d2) => botPick(s2, d2, rw) : undefined);
    if (st.result === 'clear') clear++;
    enc += st.enc; time += st.time; downs += st.downs; life += st.life;
    fights += st.enc; for (const [k, v] of Object.entries(st.dstat ?? {})) ds[k] = (ds[k] ?? 0) + v;
    reached[st.enc] = (reached[st.enc] ?? 0) + 1;
    if (detail) console.log(id, i, st.result, 'enc', st.enc, 'life', st.life, 'downs', st.downs, 't', Math.round(st.time));
  }
  console.log(`${id}${hard ? ' (하드)' : ''} [${args.find((a) => a.startsWith('--deck='))?.slice(7) ?? 'starter'}]: 클리어 ${Math.round((clear / runs) * 100)}%  평균 교전 ${(enc / runs).toFixed(1)}  평균 ${Math.round(time / runs)}초  쓰러짐 ${(downs / runs).toFixed(1)}  남은 생명 ${(life / runs).toFixed(1)}  도달 ${JSON.stringify(reached)}`);
  if (Object.keys(ds).length) console.log('  교전당 수싸움', Object.entries(ds).map(([k, v]) => `${k} ${(v / fights).toFixed(2)}`).join('  '));
}

// 보스 균형 맞추기용 빠른 시뮬레이션: 보스 직전까지 키운 상태를 한 번 찍어 두고(보스 앞 교전은 무거움),
// 보스전만 여러 설정으로 다시 돌림. node tools/boss-tune.mjs --stage=stage-5 [--runs=24] [--decks=good,bad] [--set=boss_frost.hpMult=0.6,...]
import { loadData } from './sim.mjs';
import { createGauntlet, tickGauntlet, tapShield, fighters, laneOf, botPick, botRegroup, nextEncounter, useRally, castG } from '../src/logic/gauntlet.js';
import { raidTap } from '../src/logic/raid.js';
import { makeRng } from '../src/logic/rng.js';

function step(st, D) {
  tickGauntlet(st, D, 0.5);
  st.events.length = 0;
  if (st.rally) useRally(st, D);
  if (st.bossWarn) for (const u of fighters(st).filter((x) => laneOf(x.seat) === st.bossWarn.lane)) tapShield(st, u.uid);
  for (const m of st.raidMarks ?? []) tapShield(st, m.uid);
  const c = st.enemies.find((e) => e.hp > 0 && e.raid?.cast?.need != null);
  if (c && c.raid.cast.botTap == null) { c.raid.cast.botTap = 1; raidTap(st, D); }
  if (st.mana >= 40 && st.spells.length) castG(st, D, st.spells[0]);
}

/** 보스 직전 상태(정비 끝, 보스 교전 시작 전) */
export function snapshot(D, stageId, deck, seed) {
  const n = D.stages.findIndex((s) => s.id === stageId);
  const spells = (D.config.spells?.list ?? []).slice(0, 1 + n).map((s) => s.id);
  const st = createGauntlet(D, stageId, seed, { pool: deck, spells });
  st.life = 99;
  const last = st.plan.length - 1;
  let guard = 0;
  while (st.phase !== 'ended' && guard++ < 200) {
    while (st.phase === 'fight') step(st, D);
    if (st.phase !== 'regroup') break;
    if (st.offer && !st.offer.taken) botPick(st, D);
    botRegroup(st, D);
    if (st.enc === last) break;
    nextEncounter(st, D);
  }
  if (st.enc !== last || st.phase === 'ended') return null;
  const { rng, dataRef, ...rest } = st;
  return structuredClone(rest);
}

export function fightFrom(snap, D, seed, { hard = false, tier = null } = {}) {
  const st = structuredClone(snap);
  st.rng = makeRng(seed); st.dataRef = D;
  st.hard = hard || !!tier; st.tier = tier; st.life = 1;
  nextEncounter(st, D);
  let g = 0;
  while (st.phase === 'fight' && g++ < 2000) step(st, D);
  return !!st.lastWin;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const D = loadData();
  const stage = arg('stage'), runs = +arg('runs', 24);
  const boss = D.stageById[stage].boss;
  const decks = arg('decks', '') ? arg('decks').split(';').map((s) => s.split(',')) : [D.raid.bosses[boss].good, D.raid.bosses[boss].bad];
  const sets = arg('sets', '').split('|').filter(Boolean);   // 설정 묶음 여럿: "hpMult=0.6|hpMult=0.5,atkMult=0.9"
  const t0 = Date.now();
  const snaps = decks.map((dk) => { const out = []; for (let i = 1; i <= runs; i++) { const s = snapshot(D, stage, dk, i * 7919); if (s) out.push(s); } return out; });
  const tSnap = Date.now() - t0;
  const R0 = structuredClone(D.raid.bosses[boss]);
  for (const set of sets.length ? sets : ['']) {
    const R = structuredClone(R0);
    for (const kv of set.split(',').filter(Boolean)) { const [k, v] = kv.split('='); const path = k.split('.'); let o = R; for (const p of path.slice(0, -1)) o = o[p] ??= {}; o[path.at(-1)] = isNaN(+v) ? v : +v; }
    D.raid.bosses[boss] = R;
    const row = [];
    for (const md of [{ hard: false }, { hard: true }]) snaps.forEach((ss, di) => { let w = 0; ss.forEach((s, i) => { w += fightFrom(s, D, 1000 + i * 31, md) ? 1 : 0; }); row.push(Math.round((w / ss.length) * 100)); });
    console.log(JSON.stringify({ stage, boss, set, decks: decks.map((d) => d.join('+')), n: snaps.map((s) => s.length), normal: row.slice(0, decks.length), hard: row.slice(decks.length) }));
  }
  console.error(`snap ${tSnap}ms total ${Date.now() - t0}ms`);
}

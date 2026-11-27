// 보스전 승률 시뮬레이션(보스 레이드 균형 맞추기용)
// node tools/boss-sim.mjs [판수=20] [--stage=forest-1] [--hard] [--tier=hardcore|god] [--off] [--wave12] [--deck=good|bad]
//  덱: raid.json 보스의 good(맞춘 덱)·bad(안 맞춘 덱). 앞 교전은 자동 봇이 보통 난이도로 지지 않고(생명 99) 치르며 자람
//  → 보스 교전만 그 난이도로(하드면 하드 강화, 생명 1) 첫 도전. 결과 = 보스 첫 도전 승률
//  --off  : raid.json을 비운 채(예전 규칙)  --wave12 : #91(12교전) 설정을 덮어씀
import { loadData } from './sim.mjs';
import { createGauntlet, tickGauntlet, tapShield, fighters, laneOf, botPick, botRegroup, nextEncounter, useRally, castG } from '../src/logic/gauntlet.js';
import { raidTap } from '../src/logic/raid.js';

function botFightStep(st, D) {
  tickGauntlet(st, D, 0.5);
  st.events.length = 0;
  if (st.rally) useRally(st, D);
  if (st.bossWarn) for (const u of fighters(st).filter((x) => laneOf(x.seat) === st.bossWarn.lane)) tapShield(st, u.uid);
  for (const m of st.raidMarks ?? []) tapShield(st, m.uid);
  const c = st.enemies.find((e) => e.hp > 0 && e.raid?.cast?.need != null);
  if (c && c.raid.cast.botTap == null) { c.raid.cast.botTap = 1; raidTap(st, D); }
  if (st.mana >= 40 && st.spells.length) castG(st, D, st.spells[0]);
}

export function bossFight(D, stageId, deck, seed, { hard = false, tier = null } = {}) {
  const n = D.stages.findIndex((s) => s.id === stageId);
  const spells = (D.config.spells?.list ?? []).slice(0, 1 + n).map((s) => s.id);
  const st = createGauntlet(D, stageId, seed, { pool: deck, spells });
  st.life = 99;
  const last = st.plan.length - 1;
  let guard = 0;
  while (st.phase !== 'ended' && guard++ < 200) {
    while (st.phase === 'fight') botFightStep(st, D);
    if (st.phase !== 'regroup') break;
    if (st.offer && !st.offer.taken) botPick(st, D);
    botRegroup(st, D);
    if (st.enc === last) { st.hard = hard || !!tier; st.tier = tier; st.life = 1; break; }
    nextEncounter(st, D);
  }
  if (st.enc !== last || st.phase === 'ended') return null;
  nextEncounter(st, D);
  let hpLeft = 1, g2 = 0;
  while (st.phase === 'fight' && g2++ < 2000) {
    const b = st.enemies.find((e) => e.id === st.stage.boss); if (b) hpLeft = Math.max(0, b.hp) / b.maxHp;
    botFightStep(st, D);
  }
  return { win: !!st.lastWin, time: st.encTime, hpLeft: st.lastWin ? 0 : hpLeft };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const runs = +(args.find((a) => /^\d+$/.test(a)) ?? 20);
  const only = args.find((a) => a.startsWith('--stage='))?.slice(8);
  const tierArg = args.find((a) => a.startsWith('--tier='))?.slice(7) ?? null;
  const deckArg = args.find((a) => a.startsWith('--deck='))?.slice(7) ?? null;
  const D = loadData();
  const raid = D.raid;
  if (args.includes('--off')) D.raid = null;
  D.config.gauntlet = { ...(D.config.gauntlet ?? {}) };
  if (args.includes('--wave12')) Object.assign(D.config.gauntlet, { encounters: 12, startUnits: 3, squadMin: 2, growth: 0.05, atkGrowth: 0.04 });
  for (const a of args) { const m = a.match(/^--(\w+)=([\d.]+)$/); if (m) D.config.gauntlet[m[1]] = +m[2]; }
  const stages = only ? [only] : D.stages.map((s) => s.id);
  const modes = tierArg ? [{ hard: true, tier: tierArg, label: tierArg }] : args.includes('--hard') ? [{ hard: true, label: '하드' }] : args.includes('--normal') ? [{ hard: false, label: '보통' }] : [{ hard: false, label: '보통' }, { hard: true, label: '하드' }];
  for (const id of stages) {
    const st = D.stageById[id], R = raid?.bosses?.[st.boss];
    if (!R?.good) { console.log(id, st.boss, '(raid.json 덱 없음)'); continue; }
    const row = [];
    for (const md of modes) for (const [dk, deck] of [['good', R.good], ['bad', R.bad]]) {
      if (deckArg && deckArg !== dk) continue;
      let w = 0, t = 0, hp = 0, c = 0;
      for (let i = 1; i <= runs; i++) { const r = bossFight(D, id, deck, i * 7919, md); if (!r) continue; c++; w += r.win ? 1 : 0; t += r.time; hp += r.hpLeft; }
      row.push(`${md.label}·${dk === 'good' ? '맞춘' : '안맞춘'} ${c ? Math.round((w / c) * 100) : '-'}%(${c}판,${c ? Math.round(t / c) : 0}초,보스남은${c ? Math.round((hp / c) * 100) : 0}%)`);
    }
    console.log(`${id} ${st.boss}${args.includes('--off') ? ' [예전]' : ''}: ${row.join('  ')}`);
  }
}

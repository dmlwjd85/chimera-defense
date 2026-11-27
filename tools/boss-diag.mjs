// 보스전 진 이유 보기: node tools/boss-diag.mjs --stage=forest-2 [--runs=8] [--hard] [--deck=good|bad|a,b,c]
import { loadData } from './sim.mjs';
import { snapshot } from './boss-tune.mjs';
import { tickGauntlet, tapShield, fighters, laneOf, nextEncounter, useRally, castG } from '../src/logic/gauntlet.js';
import { raidTap } from '../src/logic/raid.js';
import { makeRng } from '../src/logic/rng.js';
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const D = loadData(); const stage = arg('stage'); const boss = D.stageById[stage].boss;
const dk = arg('deck', 'good'); const deck = dk === 'good' || dk === 'bad' ? D.raid.bosses[boss][dk] : dk.split(',');
const hard = process.argv.includes('--hard'); const runs = +arg('runs', 8);
for (let i = 1; i <= runs; i++) {
  const snap = snapshot(D, stage, deck, i * 7919); if (!snap) { console.log('nosnap'); continue; }
  const st = structuredClone(snap); st.rng = makeRng(1000 + (i - 1) * 31); st.dataRef = D; st.hard = hard; st.life = 1;
  nextEncounter(st, D);
  const dmg = {}; let g = 0; let minMax = 0;
  const lvl = fighters(st).map((u) => `${u.speciesId ?? u.kind}:${u.stage ?? ''}`).join(' ');
  while (st.phase === 'fight' && g++ < 2000) {
    tickGauntlet(st, D, 0.5);
    for (const ev of st.events) if (ev.type === 'unitDie' || ev.type === 'allyDie') dmg.die = (dmg.die ?? 0) + 1;
    st.events.length = 0;
    if (st.rally) useRally(st, D);
    if (st.bossWarn) for (const u of fighters(st).filter((x) => laneOf(x.seat) === st.bossWarn.lane)) tapShield(st, u.uid);
    for (const m of st.raidMarks ?? []) tapShield(st, m.uid);
    const c = st.enemies.find((e) => e.hp > 0 && e.raid?.cast?.need != null);
    if (c && c.raid.cast.botTap == null) { c.raid.cast.botTap = 1; raidTap(st, D); }
    if (st.mana >= 40 && st.spells.length) castG(st, D, st.spells[0]);
    minMax = Math.max(minMax, st.enemies.filter((e) => e.hp > 0 && !e.boss).length);
  }
  const b = st.enemies.find((e) => e.id === boss); const enc = Math.round(st.encTime ?? -1);
  console.log(JSON.stringify({ i, win: !!st.lastWin, t: Math.round(st.time - (snap.time ?? 0)), enc, rb: st.raidBoss, raid: !!b?.raid, bossHp: b ? Math.round((100 * b.hp) / b.maxHp) : 'gone', alive: fighters(st).length, maxAdds: minMax, team: lvl }));
}

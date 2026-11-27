// 원인 조사(지금 코드): 교전 한 판을 0.05초씩 돌리며, 이벤트가 말하는 피해 숫자와 실제 체력 변화를 비교
// 사용: node qa/combat-clarity/probe-before.mjs [stage] [enc] [seed]
import { loadData } from '../../tools/sim.mjs';
import * as G from '../../src/logic/gauntlet.js';
const D = loadData();
const [stage = 'stage-8', encArg = '7', seedArg = '11'] = process.argv.slice(2);
const st = G.createGauntlet(D, stage, +seedArg, {});
// 원하는 교전까지 봇으로 진행
while (st.phase !== 'ended' && st.enc < +encArg) {
  while (st.phase === 'fight') { G.tickGauntlet(st, D, 0.5); st.events.length = 0; if (st.bossWarn) for (const u of st.field) if (u && !u.down) G.tapShield(st, u.uid); }
  if (st.phase !== 'regroup') break;
  if (st.offer && !st.offer.taken) G.botPick(st, D);
  G.botRegroup(st, D); G.nextEncounter(st, D);
}
const name = (side, id) => side === 'u' ? (st.field.find((x) => x?.uid === id)?.stats?.name ?? 'u' + id) + `#${id}` : (st.enemies.find((x) => x.eid === id)?.name ?? 'e' + id) + `#${id}`;
const snap = () => { const m = new Map(); for (const u of st.field) if (u) m.set('u' + u.uid, u.hp); for (const e of st.enemies) m.set('e' + e.eid, e.hp); return m; };
const rows = [];
let guard = 0;
const evClaims = (ev) => {   // 이벤트가 화면에 띄우라고 주는 숫자(대상 → 숫자)
  const c = [];
  if (ev.type === 'act' && ev.side === 'u') for (const h of ev.hits ?? []) c.push(['e' + h.eid, h.dmg, `${ev.move}${ev.name ? ' ' + ev.name : ''}`, 'u' + ev.uid]);
  if (ev.type === 'act' && ev.side === 'e' && !ev.dodged) c.push(['u' + ev.uid, ev.dmg, '적 공격', 'e' + ev.eid]);
  if (ev.type === 'clashWin') c.push(['e' + ev.eid, ev.dmg, '힘싸움 승', 'u' + ev.uid]);
  if (ev.type === 'clashLose') c.push(['u' + ev.uid, ev.dmg, '힘싸움 패', 'e' + ev.eid]);
  if (ev.type === 'guard') { c.push(['u' + ev.uid, ev.dmg, '막아서기(맞음)', 'e' + ev.eid]); if (ev.fallDmg) c.push(['e' + ev.eid, ev.fallDmg, '다리걸기', 'u' + ev.uid]); }
  if (ev.type === 'eguard') { c.push(['e' + ev.eid, ev.dmg, '적 막아서기', 'u' + ev.uid]); if (ev.fallDmg) c.push(['u' + ev.uid, ev.fallDmg, '넘어짐', 'e' + ev.eid]); }
  if (ev.type === 'peel') c.push(['e' + ev.eid, ev.dmg, '요격', 'u' + ev.uid]);
  if (ev.type === 'snatch') c.push([ev.side === 'u' ? 'e' + ev.eid : 'u' + ev.uid, ev.dmg, '낚아채기', ev.side === 'u' ? 'u' + ev.uid : 'e' + ev.eid]);
  if (ev.type === 'flank') c.push([(ev.side === 'u' ? 'e' : 'u') + ev.target, ev.dmg, '매복', null]);
  if (ev.type === 'bossSlam') for (const h of ev.hits ?? []) c.push(['u' + h.uid, h.dmg, '보스 필살', 'e' + ev.eid]);
  if (ev.type === 'dot') c.push(['e' + ev.eid, ev.dmg, '독/불(가끔 표시)', null]);
  if (ev.type === 'spell') for (const h of ev.hits ?? []) c.push(['e' + h.eid, h.dmg, '마법', null]);
  return c;
};
const HEALEV = { heal: '강타 회복', eheal: '적 치유사 회복(모두)', echeer: '적 응원 회복', cheer: '우리 응원', clutch: '역전 특성', rally: '역전의 함성', eRally: '적 대장의 함성', revive: '부활', phoenix: '불사조', awaken: '각성' };
while (st.phase === 'fight' && guard++ < 4000) {
  const before = snap();
  G.tickGauntlet(st, D, 0.05);
  const after = snap();
  const evs = st.events.splice(0);
  const claims = evs.flatMap(evClaims);
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const k of keys) {
    const b = before.get(k) ?? 0, a = after.get(k) ?? 0, d = a - b;
    const mine = claims.filter((c) => c[0] === k);
    const shown = mine.reduce((s, c) => s + (c[1] ?? 0), 0);
    const tags = evs.filter((e) => (e.uid != null && 'u' + e.uid === k && HEALEV[e.type]) || (e.to != null && (e.type === 'cheer' ? 'u' : 'e') + e.to === k) || (e.type === 'eheal' && k[0] === 'e') || ((e.type === 'rally') && k[0] === 'u') || (e.type === 'eRally' && k[0] === 'e')).map((e) => HEALEV[e.type]).filter(Boolean);
    if (Math.abs(d) < 0.01 && !mine.length) continue;
    rows.push({ t: +st.time.toFixed(2), who: name(k[0], +k.slice(1)), what: mine.map((c) => c[2]).join('+') || (d > 0 ? (tags.join('+') || '(이벤트 없는 회복)') : '(숫자 없는 피해)'), by: [...new Set(mine.map((c) => c[3]).filter(Boolean))].map((x) => name(x[0], +x.slice(1))).join(','), shown: mine.length ? shown : null, real: +(-d).toFixed(1), hpAfter: +a.toFixed(1), tags: tags.join('+') });
  }
}
console.log(JSON.stringify({ stage, enc: st.enc, field: st.field.filter(Boolean).map((u) => `${u.stats.name}(${u.stage})`), enemies: st.enemies.map((e) => `${e.name}${e.elite ? '[' + e.elite + ']' : ''}`), rows }, null, 0));

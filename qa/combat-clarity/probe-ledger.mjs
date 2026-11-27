// 원인 보고용: 교전 한 판을 0.05초씩 돌리며 체력 장부(hpLog)와 실제 체력 변화를 맞춰 보고,
// '지금 화면(이 PR 전)'이 띄우던 숫자 규칙으로 무엇이 보였는지 함께 표로 만듦.
// 사용: node qa/combat-clarity/probe-ledger.mjs [stage] [enc] [seed] [--json]
import { loadData } from '../../tools/sim.mjs';
import * as G from '../../src/logic/gauntlet.js';
import { bestDeck } from '../../src/logic/matchup.js';
const D = loadData();
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [stage = 'stage-8', encArg = '4', seedArg = '11'] = args;
const pool = bestDeck(D.stageById[stage], D, D.units.map((u) => u.id));
const levels = Object.fromEntries(D.units.map((u) => [u.id, 5]));
const st = G.createGauntlet(D, stage, +seedArg, { pool, levels, spells: (D.config.spells?.list ?? []).slice(0, 4).map((s) => s.id) });
while (st.phase !== 'ended' && st.enc < +encArg) {
  while (st.phase === 'fight') { G.tickGauntlet(st, D, 0.5); st.events.length = 0; if (st.bossWarn) for (const u of st.field) if (u && !u.down) G.tapShield(st, u.uid); }
  if (st.phase !== 'regroup') break;
  if (st.offer && !st.offer.taken) G.botPick(st, D);
  G.botRegroup(st, D); G.nextEncounter(st, D);
}
if (st.phase !== 'fight') { console.error('교전에 못 감', st.phase, st.enc); process.exit(2); }
st.hpLog = []; st.events.length = 0;
const NAMES = {};
const seeNames = () => { for (const u of st.field) if (u) NAMES['u' + u.uid] = u.stats.name; for (const e of st.enemies) NAMES['e' + e.eid] = `${e.name}${e.elite ? '[' + e.elite + ']' : ''}`; };
seeNames();
const ENEMIES0 = st.enemies.map((e) => `${e.name}${e.elite ? '[' + e.elite + ']' : ''}`);
const nm = (r) => !r ? '(없음)' : NAMES[r.side + r.id] ?? (r.side === 'u' ? '우리' : '적') + r.id;
const snap = () => { const m = new Map(); for (const u of st.field) if (u) m.set('u' + u.uid, u.hp); for (const e of st.enemies) m.set('e' + e.eid, e.hp); return m; };
let bad = 0, ticks = 0, mismatch = [];
const all = [];
const evs = [];
while (st.phase === 'fight' && ticks < 6000) {
  const b = snap(), n0 = st.hpLog.length ? st.hpLog[st.hpLog.length - 1].n : 0;
  if (st.bossWarn) for (const u of st.field) if (u && !u.down) G.tapShield(st, u.uid);   // 사람처럼 예고된 필살기는 눌러 막음
  G.tickGauntlet(st, D, 0.05); ticks++; seeNames();
  const a = snap(); const rows = st.hpLog.filter((r) => r.n > n0);
  for (const ev of st.events) evs.push({ ...ev, t: st.time });
  st.events.length = 0;
  all.push(...rows);
  if (st.phase !== 'fight') break;   // 교전이 끝나는 틱은 끝 정리(쉬기·회복)가 섞임
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    if (!b.has(k)) continue;   // 이번 틱에 새로 나온 적(소환·증원)
    const d = (a.get(k) ?? 0) - b.get(k), sum = rows.filter((r) => r.side + r.id === k).reduce((s, r) => s + r.d, 0);
    if (Math.abs(d - sum) > 0.01) { bad++; if (mismatch.length < 5) mismatch.push({ k, d, sum, t: st.time }); }
  }
}
// 이 PR 전 화면 규칙으로 '보였던 숫자' 추정
const maxHp = (r) => (r.side === 'u' ? st.field.find((x) => x?.uid === r.id)?.maxHp : st.enemies.find((x) => x.eid === r.id)?.maxHp) ?? 1e9;
function oldShown(r) {
  if (r.kind === 'buff' || r.kind === 'debuff') return '-';
  if (r.d > 0) return '없음(숫자 안 뜸)';
  const real = -r.d;
  if (r.side === 'e') {
    if (r.kind === 'dot') return '대부분 없음(15%만 한 틱 조각)';
    if (['clash', 'snatch', 'intercept', 'eguard', 'trip'].includes(r.cause) || r.big) return String(Math.round(real));
    if (r.kind === 'env' || r.kind === 'reflect') return '없음';
    if (r.cause === 'flank') return '없음';
    return real >= maxHp(r) * 0.08 ? String(Math.round(real)) : '없음(최대 체력 8% 미만이라 숨김)';
  }
  // 우리 편이 맞음: 적 공격·힘싸움 등은 이벤트 숫자(넘치는 피해 포함) 그대로
  if (r.kind === 'env') return String(Math.round(r.raw ?? real));
  if (r.cause === 'flank' || r.kind === 'reflect') return '없음';
  return String(Math.round(r.raw ?? real));
}
const KIND = { hit: '공격', dot: '독·불', heal: '회복', regen: '재생', drain: '흡혈', revive: '일어남', reflect: '가시 반사', env: '지형·붕괴', magic: '마법', buff: '버프', debuff: '디버프' };
const table = all.map((r) => ({ t: +r.t.toFixed(2), by: nm(r.by), to: r.to ? r.to.map(nm).join('·') : nm({ side: r.side, id: r.id }), what: `${KIND[r.kind] ?? r.kind}${r.cause ? '(' + r.cause + ')' : ''}`, old: oldShown(r), real: r.d ? +(-r.d).toFixed(1) : 0, blocked: +(r.blocked ?? 0).toFixed(1), raw: r.raw != null ? +r.raw.toFixed(1) : null }));
const sum = {}; for (const r of all) { const k = (r.side ?? '-') + ':' + r.kind; sum[k] ??= { n: 0, amt: 0, blocked: 0, hidden: 0 }; sum[k].n++; sum[k].amt += Math.abs(r.d); sum[k].blocked += r.blocked ?? 0; if (/없음/.test(oldShown(r))) sum[k].hidden += Math.abs(r.d); }
const out = { stage, enc: st.enc, seed: +seedArg, ticks, invariantBad: bad, mismatch, field: st.field.filter(Boolean).map((u) => `${u.stats.name}`), enemies: ENEMIES0, summary: sum, table, events: evs.length };
if (process.argv.includes('--json')) console.log(JSON.stringify(out)); else { console.log(JSON.stringify({ ...out, table: table.length }, null, 1)); }

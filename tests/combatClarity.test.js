// 전투 숫자 = 실제 체력 변화 (선생님 2026-11-27 "대미지만큼 닳는것도 아닌것 같고 막 회복도 되는데 이해가 안돼")
// 규칙의 체력 장부(state.hpLog)가 실제 체력 변화와 한 칸도 어긋나지 않는지, 화면에 넘기는 맞은 양(dmg)이 실제 줄어든 양인지 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createGauntlet, tickGauntlet, tapShield, botRegroup, nextEncounter, botPick } from '../src/logic/gauntlet.js';
import { bestDeck } from '../src/logic/matchup.js';
import { unitStats } from '../src/logic/stats.js';
import { summaryRows } from '../src/scenes/clarity.js';

const D = loadData();
const snap = (st) => { const m = new Map(); for (const u of st.field) if (u) m.set('u' + u.uid, u.hp); for (const e of st.enemies) m.set('e' + e.eid, e.hp); return m; };

function runTo(stage, enc, seed, opts) {
  const st = createGauntlet(D, stage, seed, opts);
  while (st.phase !== 'ended' && st.enc < enc) {
    while (st.phase === 'fight') { tickGauntlet(st, D, 0.5); st.events.length = 0; }
    if (st.phase !== 'regroup') break;
    if (st.offer && !st.offer.taken) botPick(st, D);
    botRegroup(st, D); nextEncounter(st, D);
  }
  return st;
}

/** 한 교전을 0.05초씩 돌리며 장부와 실제 체력·사건을 맞춰 봄 */
function audit(st, extra = () => {}) {
  st.hpLog = []; st.events.length = 0;
  let ticks = 0, rows = 0, blocked = 0, kinds = new Set(), errs = [];
  while (st.phase === 'fight' && ticks < 4000) {
    extra(st);   // 시험용 손대기(장부 밖)는 재기 전에
    if (st.bossWarn) for (const u of st.field) if (u && !u.down) tapShield(st, u.uid);
    const b = snap(st), n0 = st.hpLog.length ? st.hpLog.at(-1).n : 0;
    tickGauntlet(st, D, 0.05); ticks++;
    const a = snap(st), got = st.hpLog.filter((r) => r.n > n0);
    rows += got.length; for (const r of got) { kinds.add(r.kind); blocked += r.blocked ?? 0; if ((r.blocked ?? 0) < 0) errs.push(['막음<0', r]); }
    if (st.phase === 'fight') {
      for (const k of a.keys()) {
        if (!b.has(k)) continue;
        const sum = got.filter((r) => r.side + r.id === k).reduce((s, r) => s + r.d, 0);
        if (Math.abs(a.get(k) - b.get(k) - sum) > 1e-6) errs.push(['장부≠체력', k, a.get(k) - b.get(k), sum]);
      }
      // 화면에 넘기는 '맞은 양' = 같은 행동 장부의 실제 줄어든 양
      for (const ev of st.events) {
        if (ev.type === 'act' && ev.side === 'e' && !ev.dodged && ev.seq != null) {
          const lost = -got.filter((r) => r.seq === ev.seq && r.side === 'u' && r.id === ev.uid && r.d < 0 && r.by?.id === ev.eid).reduce((s, r) => s + r.d, 0);
          if (Math.abs(Math.round(lost) - ev.dmg) > 1) errs.push(['적 공격 dmg≠실제', ev.dmg, lost]);
          const hp0 = b.get('u' + ev.uid); if (hp0 != null && ev.dmg > Math.ceil(hp0) + 1) errs.push(['체력보다 큰 숫자', ev.dmg, hp0]);
        }
      }
    }
    st.events.length = 0;
  }
  return { ticks, rows, blocked, kinds, errs };
}

test('체력 장부: 숲-1 교전마다 숫자 합 = 실제 체력 변화', () => {
  const st = runTo('forest-1', 5, 7, {});
  const r = audit(st);
  assert.deepEqual(r.errs.slice(0, 3), []);
  assert.ok(r.rows > 50, `장부 줄이 너무 적음 ${r.rows}`);
  assert.ok(r.kinds.has('hit'));
});

test('체력 장부: 센 덱 보스 앞 교전(적 회복·마법 포함)도 어긋남 0', () => {
  const pool = bestDeck(D.stageById['stage-8'], D, D.units.map((u) => u.id));
  const levels = Object.fromEntries(D.units.map((u) => [u.id, 5]));
  const st = runTo('stage-8', 4, 11, { pool, levels, spells: (D.config.spells?.list ?? []).slice(0, 4).map((s) => s.id) });
  assert.equal(st.phase, 'fight');
  const r = audit(st);
  assert.deepEqual(r.errs.slice(0, 3), []);
  for (const k of ['hit', 'heal']) assert.ok(r.kinds.has(k), `${k} 줄 없음: ${[...r.kinds]}`);
  const rows = summaryRows(st);
  assert.ok(rows.length > 0 && rows.every((x) => x.dmg >= 0 && x.block >= 0 && x.heal >= 0));
});

test('흡혈: 우리 돌격형이 때린 만큼 회복이 장부에 drain으로 남고 체력과 맞음', () => {
  const st = runTo('forest-1', 3, 3, {});
  st.relics = [...(st.relics ?? []), 'vamp_fang'];
  const fox = st.field.find((u) => u && u.speciesId === 'fox') ?? st.field.find((u) => u && !u.down);
  Object.assign(fox, { kind: 'base', speciesId: 'tiger', stage: 'spirit', parts: null, tactic: 'help' });
  fox.stats = unitStats({ kind: 'base', speciesId: 'tiger', stage: 'spirit', parts: null, traits: fox.traits ?? [] }, D); fox.maxHp = fox.stats.hp; fox.hp = fox.maxHp;
  // 체력을 깎아 회복할 틈을 줌
  let once = true;
  const r = audit(st, (s) => { if (once) for (const u of s.field) if (u) u.hp = u.maxHp * 0.5; once = false; });
  assert.deepEqual(r.errs.slice(0, 3), []);
  assert.ok(r.kinds.has('drain'), `흡혈 줄 없음: ${[...r.kinds]}`);
});

test('보호막: 눌러 막은 양은 장부에 blocked로 따로, 줄어든 숫자는 실제만큼', () => {
  const st = runTo('forest-1', 4, 5, {});
  // 보호막(강아지 필살기·눌러 막기와 같은 shieldT)을 모두에게 5초 걸어 둠
  let once = true;
  const r = audit(st, (s) => { if (once) for (const u of s.field) if (u) u.shieldT = s.time + 5; once = false; });
  assert.deepEqual(r.errs.slice(0, 3), []);
  assert.ok(r.blocked > 0, '막힌 양이 기록되지 않음');
  const bl = st.hpLog.filter((x) => x.side === 'u' && x.blocked > 0 && !x.kill);
  assert.ok(bl.every((x) => Math.abs(-x.d - x.raw) < 1e-6), '살아남은 맞음은 숫자 = 실제 깎인 양');
  // 보호막 ×0.6: 원래 피해 = 맞은 양/0.6 → 막은 양 = 맞은 양 × (1/0.6 − 1) ≈ 0.667 (다른 줄임 버프가 없을 때)
  assert.ok(bl.some((x) => Math.abs(x.blocked / -x.d - 2 / 3) < 0.01), '막은 양 비율이 보호막 ×0.6과 안 맞음');
});

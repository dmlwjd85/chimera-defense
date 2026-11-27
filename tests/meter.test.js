// 딜 미터기(2026-11-28 "딜 미터기 보여줘 넣은딜 막은딜 회복한양 등등"): 체력 장부만 읽어 쌓는 순수 함수.
// 실제 교전을 돌리며 ① 받은 피해·회복이 실제 체력 변화와 맞는지 ② 넣은 피해가 규칙의 피해 기록(dmgWave)과 같은지
// ③ 장부 교전 요약(clBook)과 한 칸도 안 다른지(두 번 세지 않음) ④ 같은 줄을 다시 읽어도 안 늘어나는지 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createGauntlet, tickGauntlet, tapShield, botRegroup, nextEncounter, botPick } from '../src/logic/gauntlet.js';
import { newMeter, meterAddRow, meterPull, meterEvent, meterMerge, meterRows, meterLeaders, meterTotals } from '../src/logic/meter.js';

const D = loadData();

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

/** 한 교전을 0.05초씩: 매 틱 새 장부 줄을 미터에(화면과 같은 방식), 아군 체력은 틱마다 재서 비교 */
function fight(st) {
  const m = newMeter(st.hpN ?? 0);
  const hp0 = new Map(st.field.filter(Boolean).map((u) => [u.uid, u.hp]));
  const recv = new Map(), errs = [], act = new Map();   // act = 실제 체력 변화 합(교전 중 틱은 실제 체력, 끝나는 틱은 장부 — 끝난 뒤 쉬며 차는 체력은 교전 밖)
  let ticks = 0;
  while (st.phase === 'fight' && ticks < 5000) {
    if (st.bossWarn) for (const u of st.field) if (u && !u.down) tapShield(st, u.uid);
    const before = new Map(st.field.filter(Boolean).map((u) => [u.uid, u.hp]));
    tickGauntlet(st, D, 0.05); ticks++;
    const fresh = (st.hpLog ?? []).filter((r) => r.n > m.lastN);
    for (const r of fresh) if (r.side === 'u' && r.d > 0) recv.set(r.id, (recv.get(r.id) ?? 0) + r.d);
    meterPull(m, st.hpLog);
    assert.equal(meterPull(m, st.hpLog), 0, '같은 줄을 다시 읽으면 0줄');
    for (const ev of st.events) meterEvent(m, ev);
    // 틱마다: 아군 실제 체력 변화 = 회복 받은 양 − 받은 피해(장부 그대로)
    for (const u of st.field.filter(Boolean)) {
      const d = u.hp - before.get(u.uid);
      const rows = fresh.filter((r) => r.side === 'u' && r.id === u.uid).reduce((s, r) => s + r.d, 0);
      if (st.phase === 'fight' && Math.abs(d - rows) > 1e-6) errs.push(['체력≠장부', u.uid, d, rows]);
      act.set(u.uid, (act.get(u.uid) ?? 0) + (st.phase === 'fight' ? d : rows));
    }
    st.events.length = 0;
  }
  return { m, hp0, recv, errs, ticks, act };
}

test('미터: 장부 한 줄씩 — 넣은·막은·회복·받은·처치, 같은 줄 두 번 안 셈', () => {
  const m = newMeter();
  const rows = [
    { n: 1, side: 'e', id: 5, d: -30, by: { side: 'u', id: 1 }, kill: false },
    { n: 2, side: 'e', id: 5, d: -12, by: { side: 'u', id: 2 }, kill: true },
    { n: 3, side: 'u', id: 1, d: -20, by: { side: 'e', id: 5 }, blocked: 8, shieldBy: { side: 'u', id: 3 } },
    { n: 4, side: 'u', id: 2, d: -5, by: { side: 'e', id: 5 }, blocked: 4 },
    { n: 5, side: 'u', id: 1, d: 15, kind: 'heal', by: { side: 'u', id: 3 } },
    { n: 6, side: 'u', id: 1, d: 3, kind: 'regen', by: { side: 'u', id: 1 } },   // 스스로 재생은 회복 몫 아님
    { n: 7, side: 'e', id: 5, d: 10, kind: 'heal', by: { side: 'e', id: 6 } },   // 적 회복은 안 셈
    { n: 8, kind: 'buff', d: 0, by: { side: 'u', id: 3 }, to: [{ side: 'u', id: 1 }] },
  ];
  assert.equal(meterPull(m, rows), 8);
  assert.equal(meterPull(m, rows), 0);
  assert.equal(meterAddRow(m, rows[0]), false);
  meterEvent(m, { type: 'raidInterrupt' }); meterEvent(m, { type: 'kill' });
  assert.deepEqual(m.units[1], { dmg: 30, block: 0, heal: 0, taken: 20, kills: 0 });
  assert.deepEqual(m.units[2], { dmg: 12, block: 4, heal: 0, taken: 5, kills: 1 });
  assert.deepEqual(m.units[3], { dmg: 0, block: 8, heal: 15, taken: 0, kills: 0 });
  assert.equal(m.team.breaks, 1);
  assert.deepEqual(meterLeaders(m), { dmg: 1, block: 3, heal: 3, taken: 1, kills: 2 });
  assert.deepEqual(meterRows(m, (u) => 'n' + u).map((r) => r.name), ['n1', 'n2', 'n3']);
  const run = meterMerge(meterMerge(newMeter(), m), m);
  assert.equal(meterTotals(run).dmg, 84); assert.equal(run.team.breaks, 2);
});

for (const [stage, enc, seed] of [['forest-1', 0, 3], ['forest-1', 4, 7], ['stage-5', 2, 11]]) {
  test(`미터 = 실제 체력 변화 (${stage} 교전 ${enc + 1})`, () => {
    const st = runTo(stage, enc, seed, {});
    assert.equal(st.phase, 'fight');
    const { m, hp0, recv, errs, ticks, act } = fight(st);
    assert.ok(ticks > 10);
    assert.deepEqual(errs.slice(0, 3), []);
    // ① 받은 피해 = 실제로 줄어든 체력 합 + 받은 회복(장부 + 쪽)
    for (const u of st.field.filter(Boolean)) {
      if (!hp0.has(u.uid)) continue;
      const taken = m.units[u.uid]?.taken ?? 0, want = -(act.get(u.uid) ?? 0) + (recv.get(u.uid) ?? 0);
      assert.ok(Math.abs(taken - want) < 1e-6, `${u.uid} 받은 피해 ${taken} ≠ 실제 ${want}`);
    }
    // ② 넣은 피해 = 규칙의 교전 피해 기록(적 체력을 실제로 깎은 양)
    for (const [uid, r] of Object.entries(st.dmgLast ?? {})) assert.ok(Math.abs((m.units[uid]?.dmg ?? 0) - r.dmg) < 1e-6, `${uid} 넣은 피해 ${m.units[uid]?.dmg} ≠ ${r.dmg}`);
    assert.ok(meterTotals(m).dmg > 0);
    // ③ 장부 교전 요약(clBook)과 같음 = 두 번 세지 않음
    for (const [uid, b] of Object.entries(st.clBook)) for (const k of ['dmg', 'taken', 'block', 'heal']) assert.ok(Math.abs((m.units[uid]?.[k] ?? 0) - b[k]) < 1e-6, `${uid}.${k} ${m.units[uid]?.[k]} ≠ ${b[k]}`);
  });
}

test('미터: 보스 레이드 교전도 맞음(막기·끊기 포함)', () => {
  const st = runTo('forest-1', 11, 5, {});
  if (st.phase !== 'fight') return;   // 봇이 그 전에 졌으면 건너뜀
  const { m, hp0, recv, errs, act } = fight(st);
  assert.deepEqual(errs.slice(0, 3), []);
  for (const u of st.field.filter(Boolean)) if (hp0.has(u.uid)) assert.ok(Math.abs((m.units[u.uid]?.taken ?? 0) - (-(act.get(u.uid) ?? 0) + (recv.get(u.uid) ?? 0))) < 1e-6);
  for (const [uid, b] of Object.entries(st.clBook)) for (const k of ['dmg', 'taken', 'block', 'heal']) assert.ok(Math.abs((m.units[uid]?.[k] ?? 0) - b[k]) < 1e-6);
  const t = meterTotals(m);
  assert.ok(t.block > 0 && t.heal > 0 && t.dmg > 0, `보스전엔 막음·회복·피해가 다 있어야 ${JSON.stringify(t)}`);
});

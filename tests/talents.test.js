import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, mkUnit } from './helpers.js';
import { defaultSave, talentState, buyTalent, resetTalents, talentRank, talentCost, talentPoints, talentPointsMax, migrateTalents, battleOptions, settleRun } from '../src/logic/meta.js';
import { createGauntlet, planEncounters, squadSizes, treatCost, gcfg } from '../src/logic/gauntlet.js';
import { eco } from '../src/logic/relics.js';
import { computeMods } from '../src/logic/mods.js';
import { makeRng } from '../src/logic/rng.js';

const D = loadData();
const T = D.talents;
const node = (id) => T.branches.flatMap((b) => b.nodes).find((n) => n.id === id);

test('별자리 나무: 여섯 가지 × 다섯 별, 별마다 옛이야기·효과, 등급은 3까지(예외는 max)', () => {
  assert.equal(T.branches.length, 6);
  for (const b of T.branches) { assert.equal(b.nodes.length, 5); for (const n of b.nodes) assert.ok(n.tale && n.desc && (n.fx || n.eco), n.id); }
  assert.equal(T.maxRank, 3);
  assert.equal(talentPointsMax(D), 6 * 5 * 3 - 2);   // 두 번째 함성만 1등급
  assert.equal(new Set(T.branches.flatMap((b) => b.nodes.map((n) => n.id))).size, 30);
});

test('아래 별부터 차례로, 등급을 올릴수록 비쌈, 되돌리면 쓴 조각이 모두 돌아옴', () => {
  const s = defaultSave();
  assert.equal(talentState(s, D, 'f1').reason, 'shards');
  s.shards = 100;
  assert.equal(talentState(s, D, 'f2').reason, 'locked');
  const c0 = talentCost(D, 'f1', 0), c1 = talentCost(D, 'f1', 1), c2 = talentCost(D, 'f1', 2);
  assert.ok(c0 < c1 && c1 < c2);
  assert.equal(buyTalent(s, D, 'f1').rank, 1);
  assert.equal(talentState(s, D, 'f2').ok, true);          // 아래 별 1등급이면 위 별이 열림
  assert.equal(buyTalent(s, D, 'f1').rank, 2);
  assert.equal(buyTalent(s, D, 'f1').rank, 3);
  assert.equal(talentState(s, D, 'f1').reason, 'owned');   // 끝 등급
  assert.equal(talentRank(s, 'f1'), 3); assert.equal(talentPoints(s), 3);
  assert.equal(s.shards, 100 - c0 - c1 - c2);
  assert.ok(buyTalent(s, D, 'f2').ok);
  assert.equal(resetTalents(s, D), c0 + c1 + c2 + talentCost(D, 'f2', 0));
  assert.equal(s.shards, 100); assert.deepEqual(s.talents, []);
  // 한 번만 밝히는 별
  s.talents = ['m1', 'm2', 'm3', 'm4']; s.shards = 100;
  assert.equal(buyTalent(s, D, 'm5').rank, 1);
  assert.equal(talentState(s, D, 'm5').reason, 'owned');
});

test('예전 특성은 쓴 조각을 돌려주고 비움(한 번만)', () => {
  const old = { shards: 2, talents: ['g1', 'g2', 'a1', 'c5'] };
  assert.equal(migrateTalents(old), 1 + 2 + 1 + 5);
  assert.equal(old.shards, 11); assert.deepEqual(old.talents, []); assert.equal(old.talentRefund, 9);
  old.talents = ['f1'];
  assert.equal(migrateTalents(old), 0); assert.deepEqual(old.talents, ['f1']);
  assert.equal(migrateTalents(defaultSave()), 0);
});

test('특성이 연전에 실제로 듣는다: 등급만큼 쌓임(체력·금화·대기석·치료비·응원)', async () => {
  const s = defaultSave(); s.talents = ['f1', 'f1', 'f1', 'g1', 'g1', 'g2', 'g3', 'g4', 'g4', 'g5', 's1', 's2', 's2', 's3', 's4', 's5'];
  const base = createGauntlet(D, 'forest-1', 1, battleOptions(defaultSave(), D, 'forest-1'));
  const st = createGauntlet(D, 'forest-1', 1, battleOptions(s, D, 'forest-1'));
  assert.equal(st.gold, base.gold + node('g1').eco.startGold * 2);
  assert.equal(st.bench.length, base.bench.length + 1);
  assert.equal(eco(st, D, 'cheerPlus'), node('s2').eco.cheerPlus * 2); assert.equal(eco(st, D, 'cheerTaps'), 1); assert.equal(eco(st, D, 'reviveHp'), 10); assert.equal(eco(st, D, 'cleanseCut'), 1);
  const bear = await mkUnit(D, 1, 'bear', 'adult', 3);
  st.field = [bear]; computeMods(st, D);
  assert.equal(bear.mods.hp, node('f1').fx[0].hp * 3 + D.config.roles.bruiser.mods.hp);   // 든든한 등 3등급
  const hurt = { kind: 'base', stage: 'adult' };
  if (gcfg(D).comeback?.injury) assert.ok(treatCost(st, D, hurt) < treatCost(base, D, hurt));
});

test('난이도가 오르면 적 무리가 커짐: 마지막 일반 교전 6 → 7 → 8 → 9, 보스 교전도 늘어남', () => {
  const stage = D.stageById['forest-3'];
  const last = (tier) => { const plan = planEncounters(stage, D, makeRng(3), tier); return [plan.at(-2).ids.length, plan.at(-1).ids.length, plan[0].ids.length]; };
  assert.deepEqual(['normal', 'hard', 'hardcore', 'god'].map((t) => last(t)[0]), [6, 7, 8, 9]);
  assert.deepEqual(['normal', 'hard', 'hardcore', 'god'].map((t) => last(t)[1]), ['normal', 'hard', 'hardcore', 'god'].map((t) => squadSizes(D, t).boss));
  assert.ok(squadSizes(D, 'god').boss > squadSizes(D, 'normal').boss && squadSizes(D, 'god').boss <= 9);
  assert.equal(last('god')[2], last('normal')[2]);   // 첫 교전은 같음
  // 판을 만들 때 난이도가 그대로 반영됨
  assert.equal(createGauntlet(D, 'forest-3', 4, { tier: 'god' }).plan.at(-2).ids.length, 9);
  assert.equal(createGauntlet(D, 'forest-3', 4, { hard: true }).plan.at(-2).ids.length, 7);
  assert.equal(createGauntlet(D, 'forest-3', 4, {}).plan.at(-2).ids.length, 6);
});

test('유물 조각: 들고 있던 유물(난이도 배수) + 이긴 교전 + 클리어 + 그 난이도 첫 클리어', () => {
  const sc = T.shards, rar = (id) => sc[D.relicById[id].rarity];
  const run = (save, opts, result, wins) => { const st = createGauntlet(D, 'forest-1', 1, { ...battleOptions(save, D, 'forest-1'), ...opts }); st.relics = ['pack_howl', 'glass_cannon']; st.wins = wins; st.enc = wins; st.wavesCleared = wins; st.result = result; st.phase = 'ended'; return settleRun(save, st, D); };
  const rel = rar('pack_howl') + rar('glass_cannon');
  const save = defaultSave();
  // 지면: 유물 + 이긴 교전만
  assert.equal(run(save, {}, 'lose', 7).shards, rel + Math.floor(7 / sc.perEnc));
  // 노멀 첫 클리어 → 다음엔 첫 클리어 보너스 없음
  assert.equal(run(save, {}, 'clear', 12).shards, rel + 4 + sc.clear.normal + sc.first.normal);
  assert.equal(run(save, {}, 'clear', 12).shards, rel + 4 + sc.clear.normal);
  // 하드: 유물 배수·클리어·첫 클리어가 더 큼(난이도마다 따로 한 번씩)
  const h = run(save, { hard: true }, 'clear', 12);
  assert.equal(h.shards, Math.round(rel * sc.relicMult.hard) + 4 + sc.clear.hard + sc.first.hard);
  assert.ok(h.shardLines.some((l) => l[0] === '첫 클리어'));
  assert.equal(run(save, { hard: true }, 'clear', 12).shards, Math.round(rel * sc.relicMult.hard) + 4 + sc.clear.hard);
  const g = run(save, { tier: 'god' }, 'clear', 12);
  assert.equal(g.shards, Math.round(rel * sc.relicMult.god) + 4 + sc.clear.god + sc.first.god);
  assert.ok(g.shards > h.shards);
});

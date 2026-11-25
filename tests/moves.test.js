import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import * as B from '../src/logic/battle.js';
import { movesOf, pickMove, chargeUlt, a2Of } from '../src/logic/moves.js';
import { makeEnemy } from '../src/logic/waves.js';

const D = loadData();
const mk = (s, sp, stage, kind = 'base') => B.makeUnit(s, D, { kind, speciesId: sp, stage, parts: null });

test('each stage has its own attack set: young 1, teen 2, adult 2+element, mythic 2+element+ultimate', () => {
  const s = B.createBattle(D, 'forest-1', 1);
  assert.deepEqual(movesOf(mk(s, 'tiger', 'young'), D.config), ['a1']);
  assert.deepEqual(movesOf(mk(s, 'tiger', 'teen'), D.config), ['a1', 'a2']);
  assert.deepEqual(movesOf(mk(s, 'tiger', 'adult'), D.config), ['a1', 'a2', 'el']);
  assert.deepEqual(movesOf(mk(s, 'tiger', 'spirit'), D.config), ['a1', 'a2', 'el', 'ult']);
  assert.equal(a2Of(mk(s, 'bear', 'teen'), D.config).name, '몸통박치기');
  assert.equal(a2Of(mk(s, 'fox', 'teen'), D.config).name, '2연사');
});

test('moves are random but follow the situation; the ultimate fires when the gauge is full', () => {
  const s = B.createBattle(D, 'forest-1', 3);
  const u = mk(s, 'tiger', 'adult');
  const t = makeEnemy('normal', 1, s.stage, D, 1); t.pos = 5;
  const n = { a1: 0, a2: 0, el: 0 };
  for (let i = 0; i < 600; i++) { u.elCd = 0; n[pickMove(s, u, t, D.config)]++; }
  assert.ok(n.a1 > n.a2 && n.a2 > 0 && n.el > 0, JSON.stringify(n));
  // 근처에 적이 많고 표적이 다 죽어 가면 기본2가 늘어남
  const crowd = [1, 2, 3].map((k) => { const e = makeEnemy('normal', 1, s.stage, D, 10 + k); e.pos = 5.2; return e; });
  s.enemies = [t, ...crowd]; t.hp = t.maxHp * 0.3;
  const m = { a1: 0, a2: 0, el: 0 };
  for (let i = 0; i < 600; i++) { u.elCd = 0; m[pickMove(s, u, t, D.config)]++; }
  assert.ok(m.a2 / 600 > n.a2 / 600 + 0.1, 'more second attacks in a crowd');
  u.elCd = 3; assert.notEqual([...Array(50)].map(() => pickMove(s, u, t, D.config)).includes('el'), true, 'element waits for its cooldown');
  const g = mk(s, 'tiger', 'spirit');
  for (let i = 0; i < 20; i++) chargeUlt(g, D.config, 'hit');
  assert.equal(pickMove(s, g, t, D.config), 'ult');
});

test('an ultimate in battle hits around the target and resets the gauge', () => {
  const s = B.createBattle(D, 'forest-1', 4);
  s.bench = [mk(s, 'tiger', 'spirit')]; B.deploy(s, D, 0); B.skipPrep(s, D);
  for (let i = 0; i < 40; i++) B.step(s, D, 0.1);
  const u = s.field[0]; u.ultGauge = 100; s.queue = [];
  const e1 = makeEnemy('normal', 1, s.stage, D, 901), e2 = makeEnemy('normal', 1, s.stage, D, 902);
  e1.pos = u.pos + 0.6; e2.pos = u.pos + 1.2; e1.y = e2.y = u.y; e1.hp = e1.maxHp = e2.hp = e2.maxHp = 1e5; s.enemies = [e1, e2];
  u.attackCd = 0; s.events.length = 0;
  for (let i = 0; i < 10 && !s.events.some((ev) => ev.type === 'ult'); i++) B.step(s, D, 0.05);
  assert.ok(s.events.some((ev) => ev.type === 'ult'), 'ultimate fired');
  assert.ok(e2.hp < e2.maxHp, 'splash hit the second enemy');
  assert.ok((u.ultGauge ?? 0) < 20);
});

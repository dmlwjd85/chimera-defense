import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';
import { createBattle, chooseRelic, skipPrep, summonPrice, step } from '../src/logic/battle.js';
import { rollOffer, eco } from '../src/logic/relics.js';

const D = loadData();

test('every relic has icon, name, rarity, desc and a known rarity weight', () => {
  assert.ok(D.relicCfg.relics.length >= 20);
  for (const r of D.relicCfg.relics) {
    assert.ok(r.id && r.icon && r.name && r.desc, r.id);
    assert.ok(D.relicCfg.weights[r.rarity] > 0, r.id);
  }
});

test('offers are distinct and never include owned relics', () => {
  const s = createBattle(D, 'forest-1', 11);
  s.relics = ['pack_howl', 'coupon'];
  for (let i = 0; i < 50; i++) {
    const o = rollOffer(s, D);
    assert.equal(o.length, 3);
    assert.equal(new Set(o).size, 3);
    assert.ok(!o.includes('pack_howl') && !o.includes('coupon'));
  }
});

test('choosing a relic clears the offer, emits an event, and applies economy', () => {
  const s = createBattle(D, 'forest-1', 3);
  const before = summonPrice(s, D, {});
  s.relicOffer = ['coupon', 'rampart', 'pack_howl'];
  assert.equal(skipPrep(s, D).ok, false, 'cannot start while choosing');
  assert.equal(chooseRelic(s, D, 'glass_cannon').ok, false, 'not offered');
  const life = s.life;
  assert.ok(chooseRelic(s, D, 'rampart').ok);
  assert.equal(s.relicOffer, null);
  assert.equal(s.life, life + D.relicById.rampart.eco.life);
  assert.ok(s.events.some((e) => e.type === 'relic' && e.id === 'rampart'));
  s.relicOffer = ['coupon']; chooseRelic(s, D, 'coupon');
  assert.ok(summonPrice(s, D, {}) < before);
  assert.equal(eco(s, D, 'summonDiscount'), D.relicById.coupon.eco.summonDiscount);
});

test('prep timer waits while a relic offer is pending', () => {
  const s = createBattle(D, 'forest-1', 5);
  s.relicOffer = rollOffer(s, D);
  const left = s.prepLeft;
  step(s, D, 5);
  assert.equal(s.prepLeft, left);
  assert.equal(s.phase, 'prep');
});

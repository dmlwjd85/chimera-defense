import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from './helpers.js';

const D = loadData();
const T = D.tales;

test('every trait and flipped trait has a fairy-tale line', () => {
  for (const [sp, set] of Object.entries(D.traits)) for (const d of [...set.str, ...set.weak]) {
    assert.ok(T.traits[d.id], d.id);
    if (d.flip) assert.ok(T.traits[d.id + '_f'], d.id + '_f');
  }
});

test('every species skill, passive, recipe, bond and relic has a line', () => {
  for (const u of D.units) for (const k of ['base', 'adult', 'spirit']) assert.equal(T.skills[`${u.id}_${k}`]?.length, 2, `${u.id}_${k}`);
  for (const id of Object.keys(D.lore.passives)) assert.ok(T.passives[id], id);
  for (const r of D.recipes.filter((x) => !x.auto)) assert.ok(T.recipes[r.id], r.id);
  for (const r of D.recipes.filter((x) => x.auto)) assert.ok(r.codex && r.codex.length <= 48, r.id);
  for (const b of D.lore.bonds) assert.ok(T.bonds[b.id], b.id);
  for (const r of D.relicCfg.relics) assert.ok(T.relics[r.id], r.id);
});

test('lines read like one sentence of a tale (no stat jargon)', () => {
  const all = [...Object.values(T.traits), ...Object.values(T.skills).map((s) => s[1]), ...Object.values(T.passives), ...Object.values(T.recipes), ...Object.values(T.bonds), ...Object.values(T.relics)];
  for (const s of all) {
    assert.ok(s.length <= 48, s);
    assert.ok(!/[%+]|\d+초|쿨타임|피해 \+/.test(s), s);
  }
});

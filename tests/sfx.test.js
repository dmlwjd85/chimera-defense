import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SOUND_FILES, SOUND_NAMES, ENEMY_HIT_DB, sfx } from '../src/scenes/sfx.js';

// The 13 roles that play real files (skill shares the magic file).
const ROLES = ['click', 'hit', 'slam', 'shoot', 'magic', 'shield', 'heal', 'kill', 'coin', 'evolve', 'clear', 'lose', 'boss'];

test('sfx: 13 roles + skill are wired to files and every name has a synth fallback', () => {
  for (const r of [...ROLES, 'skill']) {
    assert.ok(SOUND_FILES[r], `${r} has no file entry`);
    assert.ok(SOUND_NAMES.includes(r), `${r} has no synthesized fallback`);
  }
});

test('sfx: every role file is in the repository (Kenney CC0, ogg and mp3)', () => {
  const seen = new Set();
  for (const d of Object.values(SOUND_FILES)) for (const f of d.files) {
    if (seen.has(f)) continue; seen.add(f);
    const base = new URL(`../public/assets/sfx/${f}`, import.meta.url);
    assert.ok(existsSync(base.pathname + '.ogg') && existsSync(base.pathname + '.mp3'), `${f} missing`);
  }
});

test('sfx: sfx() without a browser is silent and never throws; enemy hit is quieter', () => {
  assert.doesNotThrow(() => { sfx('hit', ENEMY_HIT_DB); sfx('skill'); sfx('nope'); });
  assert.equal(ENEMY_HIT_DB, -4);
});

test('sfx: no scene calls an undefined sound name', () => {
  for (const f of ['BattleScene', 'GauntletScene', 'TitleScene', 'StageSelect', 'OpeningScene']) {
    const p = new URL(`../src/scenes/${f}.js`, import.meta.url);
    if (!existsSync(p.pathname)) continue;
    for (const m of readFileSync(p.pathname, 'utf8').matchAll(/\bsfx\('([A-Za-z]+)'/g)) assert.ok(SOUND_NAMES.includes(m[1]), `${f}: sfx('${m[1]}') is undefined`);
  }
});

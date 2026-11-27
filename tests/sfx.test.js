import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SOUND_FILES, SOUND_NAMES, sfx } from '../src/scenes/sfx.js';

const FILE_ROLES = ['click', 'coin', 'evolve', 'clear'];   // lose·boss는 밝은 합성음(2026-11-27)
const SYNTH_ROLES = ['hit', 'slam', 'shoot', 'kill', 'magic', 'skill', 'shield', 'heal'];

test('sfx: file roles are wired and present (Kenney CC0, ogg and mp3)', () => {
  for (const r of FILE_ROLES) {
    assert.ok(SOUND_FILES[r], `${r} has no file entry`);
    assert.ok(SOUND_NAMES.includes(r), `${r} has no synthesized fallback`);
  }
  const seen = new Set();
  for (const d of Object.values(SOUND_FILES)) for (const f of d.files) {
    if (seen.has(f)) continue; seen.add(f);
    const base = new URL(`../public/assets/sfx/${f}`, import.meta.url);
    assert.ok(existsSync(base.pathname + '.ogg') && existsSync(base.pathname + '.mp3'), `${f} missing`);
  }
});

test('sfx: seven battle roles (and skill) are synth-only, with no leftover files', () => {
  for (const r of SYNTH_ROLES) {
    assert.ok(!SOUND_FILES[r], `${r} should not play a file`);
    assert.ok(SOUND_NAMES.includes(r), `${r} has no synthesized sound`);
  }
  for (const f of ['hit_light', 'hit_heavy', 'shoot', 'kill', 'magic', 'shield', 'heal']) {
    const base = new URL(`../public/assets/sfx/${f}`, import.meta.url);
    assert.ok(!existsSync(base.pathname + '.ogg') && !existsSync(base.pathname + '.mp3'), `${f} should have been removed`);
  }
});

test('sfx: sfx() without a browser is silent and never throws', () => {
  assert.doesNotThrow(() => { sfx('hit'); sfx('skill'); sfx('nope'); });
});

test('sfx: no scene calls an undefined sound name', () => {
  for (const f of ['BattleScene', 'GauntletScene', 'TitleScene', 'StageSelect', 'OpeningScene']) {
    const p = new URL(`../src/scenes/${f}.js`, import.meta.url);
    if (!existsSync(p.pathname)) continue;
    for (const m of readFileSync(p.pathname, 'utf8').matchAll(/\bsfx\('([A-Za-z]+)'/g)) assert.ok(SOUND_NAMES.includes(m[1]), `${f}: sfx('${m[1]}') is undefined`);
  }
});

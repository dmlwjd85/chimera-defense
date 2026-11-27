import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_FACES_LEFT, PORTRAIT_FACES_RIGHT, enemyFace, enemyPortraitFlip } from '../src/logic/enemyFace.js';

test('원화부터 왼쪽을 보는 적은 뒤집지 않아 스폰 때도 왼쪽을 본다', () => {
  const left = ['bat', 'wisp', 'boss_frost', 'fast', 'flying', 'swarm', 'boss_bat', 'boss_bat_t1', 'boss_bat_t2'];
  for (const id of left) {
    assert.equal(enemyFace(id), 1, id);
    assert.ok(ENEMY_FACES_LEFT.has(id), id);
  }
});

test('원화가 오른쪽을 보는 적은 뒤집어 왼쪽을 본다', () => {
  for (const id of ['normal', 'zombie', 'miniboss', 'boss_boar', 'boss_frost_t1', 'skeleton', 'boss_lich', 'boss_bone']) {
    assert.equal(enemyFace(id), -1, id);
  }
});

test('등 뒤를 칠 때만 잠깐 반대(오른쪽)를 본다', () => {
  assert.equal(enemyFace('fast', true), -1);
  assert.equal(enemyFace('normal', true), 1);
  assert.equal(enemyFace('boss_bat', true), -1);
});

test('한 장 초상화: 오른쪽을 보는 그림만 뒤집어 왼쪽으로', () => {
  assert.equal(enemyPortraitFlip('fast'), false);
  assert.equal(enemyPortraitFlip('flying'), false);
  assert.equal(enemyPortraitFlip('swarm'), false);
  assert.equal(enemyPortraitFlip('boss_bat'), false);
  assert.equal(enemyPortraitFlip('boss_frost'), false);
  assert.equal(enemyPortraitFlip('bat'), false);
  for (const id of ['normal', 'miniboss', 'zombie', 'boss_boar', 'boss_lich', 'skeleton', 'boss_bone', 'healer', 'ghost']) {
    assert.equal(enemyPortraitFlip(id), true, id);
    assert.ok(PORTRAIT_FACES_RIGHT.has(id), id);
  }
});

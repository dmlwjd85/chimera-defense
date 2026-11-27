// 적이 동물 쪽(왼쪽)을 보게 할지 정하는 표. Phaser 없이 시험할 수 있게 따로 둠.
// 뒤집기(setFacing -1 / flipX)는 원화가 오른쪽을 볼 때만 한다. 이미 왼쪽을 보는 그림을 뒤집으면 오른쪽으로 나온다.

/** 원래 그림이 이미 왼쪽을 보는 적 — 뒤집지 않음. 시트 걷기(move) 첫 장으로 2026-11-27에 48종을 다시 확인. */
export const ENEMY_FACES_LEFT = new Set([
  'bat', 'wisp', 'boss_frost',
  // 아래는 원화부터 왼쪽을 보는데 뒤집혀 스폰 때 오른쪽을 보고 있었음
  'fast', 'flying', 'swarm',
  'boss_bat', 'boss_bat_t1', 'boss_bat_t2',
]);

/** 한 장 초상화(도감·다음 적)가 오른쪽을 봐서, 뒤집어 왼쪽으로 보이게 할 것 */
export const PORTRAIT_FACES_RIGHT = new Set([
  'normal', 'healer', 'miniboss', 'ghost', 'zombie', 'boss_bone',
  'boss_boar', 'boss_lich', 'skeleton',
]);

export const enemyPortraitFlip = (id) => PORTRAIT_FACES_RIGHT.has(id);

const SKIN_OF = {};   // 새 보스 5종도 전용 그림(2026-11-27)이 생겨서 빌려 쓰는 그림 없음

/** 적이 동물 쪽(왼쪽)을 볼 때 setFacing 값. back이면 등 뒤를 치는 잠깐(돌아섬). */
export const enemyFace = (id0, back = false) => {
  const id = SKIN_OF[id0] ?? id0;
  return (ENEMY_FACES_LEFT.has(id) ? 1 : -1) * (back ? -1 : 1);
};

export const enemyFaceOld = (id, back = false) => (ENEMY_FACES_LEFT.has(id) ? 1 : -1) * (back ? -1 : 1);

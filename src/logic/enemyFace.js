// 적이 동물 쪽(왼쪽)을 보게 할지 정하는 표. Phaser 없이 시험할 수 있게 따로 둠.
// 뒤집기(setFacing -1 / flipX)는 원화가 왼쪽이 아닐 때 한다. 이미 왼쪽을 보는 그림만 그대로 둔다.
// 방향은 기억이 아니라 아래 표(원화를 크게 키워 본 결과)로만 정한다. 2026-11-27 48장·초상화 24장 전부 다시 봄.
//   R = 원화가 오른쪽을 봄(머리·코·무기가 오른쪽 / 꼬리·망토 자락이 왼쪽으로 끌림)
//   F = 거의 정면(좌우가 비슷함). 왼쪽으로 확실히 보이지 않으므로 R과 똑같이 뒤집어 늘 왼쪽 모양으로 맞춤
//   L = 원화가 왼쪽을 봄 → 뒤집지 않음 (지금 L인 그림은 없음)

/** 움직이는 시트(en_<이름>.dot.json) 48장의 원화 방향. 값 = [방향, 근거] */
export const ENEMY_ART_DIR = {
  bat: ['F', '정면, 날개가 좌우 비슷'],
  boss_bat: ['R', '망토 자락이 왼쪽으로 끌리고 팔이 오른쪽으로 뻗음'],
  boss_bat_t1: ['F', '정면, 날개 좌우 비슷'],
  boss_bat_t2: ['F', '정면, 날개 좌우 비슷'],
  boss_boar: ['R', '코(송곳니)가 오른쪽'],
  boss_boar_t1: ['R', '코가 오른쪽'],
  boss_boar_t2: ['R', '코와 칼이 오른쪽'],
  boss_bone: ['R', '굽은 칼이 오른쪽 앞, 망토가 왼쪽으로 끌림'],
  boss_bone_t1: ['R', '칼이 오른쪽, 망토가 왼쪽으로 끌림'],
  boss_bone_t2: ['R', '칼이 오른쪽, 망토가 왼쪽으로 끌림'],
  boss_frost: ['R', '로브 꼬리가 왼쪽으로 끌리고 지팡이가 오른쪽 앞'],
  boss_frost_t1: ['R', '로브 꼬리가 왼쪽으로 끌림'],
  boss_frost_t2: ['F', '정면, 낫이 오른쪽'],
  boss_gate: ['F', '좌우 똑같은 쌍둥이 문지기(정면)'],
  boss_gate_t1: ['F', '좌우 똑같은 쌍둥이(정면)'],
  boss_gate_t2: ['F', '좌우 똑같은 쌍둥이(정면)'],
  boss_knight: ['R', '칼끝이 오른쪽, 망토가 왼쪽으로 끌림'],
  boss_knight_t1: ['R', '망토가 왼쪽으로 끌림'],
  boss_knight_t2: ['R', '칼이 오른쪽, 망토가 왼쪽으로 끌림'],
  boss_lava: ['R', '얼굴이 몸 오른쪽에 붙어 오른쪽을 봄'],
  boss_lava_t1: ['R', '얼굴이 오른쪽'],
  boss_lava_t2: ['F', '정면, 얼굴이 가운데'],
  boss_lich: ['R', '새 부리가 오른쪽'],
  boss_lich_t1: ['R', '새 부리가 오른쪽'],
  boss_lich_t2: ['F', '정면, 지팡이가 오른쪽'],
  boss_mole: ['R', '코가 오른쪽'],
  boss_mole_t1: ['R', '코가 오른쪽'],
  boss_mole_t2: ['R', '코가 오른쪽'],
  boss_shadow: ['F', '정면, 주먹이 오른쪽'],
  boss_shadow_t1: ['F', '정면'],
  boss_shadow_t2: ['F', '정면, 주먹이 오른쪽'],
  boss_witch: ['R', '매부리코와 지팡이가 오른쪽'],
  boss_witch_t1: ['F', '정면, 가마솥이 오른쪽'],
  boss_witch_t2: ['F', '정면'],
  fast: ['R', '꼬리가 왼쪽에 길게 끌리고 단검이 오른쪽 앞'],
  flying: ['R', '머리·더듬이가 오른쪽'],
  ghost: ['R', '꼬리가 왼쪽, 등불이 오른쪽'],
  healer: ['F', '정면, 지팡이가 오른손'],
  miniboss: ['R', '코가 오른쪽'],
  normal: ['R', '꼬리가 왼쪽, 몽둥이가 오른쪽'],
  overlord: ['R', '망토가 왼쪽으로 끌리고 손이 오른쪽'],
  overlord_t1: ['R', '망토가 왼쪽으로 끌림'],
  overlord_t2: ['F', '정면, 날개 좌우 비슷'],
  skeleton: ['R', '방패가 오른쪽 앞, 도끼가 뒤(왼쪽)'],
  swarm: ['R', '머리·눈이 오른쪽'],
  tough: ['F', '정면, 주먹이 오른쪽'],
  wisp: ['F', '정면, 얼굴이 가운데'],
  zombie: ['R', '코가 오른쪽, 꼬리가 왼쪽'],
};

/** 한 장 초상화(public/assets/units/enemy-<이름>.png) 24장의 원화 방향 (도감·다음 적 미리보기에 쓰임) */
export const PORTRAIT_ART_DIR = {
  bat: ['F', '정면'],
  boss_bat: ['R', '망토 자락이 왼쪽, 팔이 오른쪽'],
  boss_boar: ['R', '코가 오른쪽'],
  boss_bone: ['R', '칼이 오른쪽, 망토가 왼쪽'],
  boss_frost: ['R', '로브 꼬리가 왼쪽, 지팡이가 오른쪽'],
  boss_gate: ['F', '좌우 똑같은 쌍둥이'],
  boss_knight: ['R', '칼끝이 오른쪽'],
  boss_lava: ['R', '얼굴이 오른쪽'],
  boss_lich: ['R', '부리가 오른쪽'],
  boss_mole: ['R', '코가 오른쪽'],
  boss_shadow: ['F', '정면'],
  boss_witch: ['R', '코와 지팡이가 오른쪽'],
  fast: ['R', '꼬리가 왼쪽, 단검이 오른쪽'],
  flying: ['R', '머리가 오른쪽'],
  ghost: ['R', '꼬리가 왼쪽, 등불이 오른쪽'],
  healer: ['F', '정면'],
  miniboss: ['R', '코가 오른쪽'],
  normal: ['R', '꼬리가 왼쪽, 몽둥이가 오른쪽'],
  overlord: ['R', '망토가 왼쪽'],
  skeleton: ['R', '방패가 오른쪽'],
  swarm: ['R', '머리가 오른쪽'],
  tough: ['F', '정면'],
  wisp: ['F', '정면'],
  zombie: ['R', '코가 오른쪽'],
};

const idsWhere = (table, dir) => Object.keys(table).filter((k) => table[k][0] === dir);

/** 원화가 이미 왼쪽을 보는 적 — 뒤집지 않음 (지금은 없음) */
export const ENEMY_FACES_LEFT = new Set(idsWhere(ENEMY_ART_DIR, 'L'));

/** 뒤집어야 왼쪽으로 보이는 초상화 */
export const PORTRAIT_FACES_RIGHT = new Set(Object.keys(PORTRAIT_ART_DIR).filter((k) => PORTRAIT_ART_DIR[k][0] !== 'L'));

export const enemyPortraitFlip = (id) => PORTRAIT_FACES_RIGHT.has(id);

/** 적이 동물 쪽(왼쪽)을 볼 때 setFacing 값. back이면 등 뒤를 치는 잠깐(돌아섬). 표에 없는 이름은 뒤집음(오른쪽 원화가 대부분). */
export const enemyFace = (id, back = false) => (ENEMY_FACES_LEFT.has(id) ? 1 : -1) * (back ? -1 : 1);

export const enemyFaceOld = enemyFace;

/** 움직이는 시트(dot)가 없어서 한 장 그림(enemy-<이름>.png, flipArt)으로 대신 그릴 때는 방향 뜻이 반대다.
 *  한 장 그림은 flipArt로 이미 한 번 뒤집혀 있어서 setFacing(-1)이면 다시 오른쪽이 된다. (2026-11-28 도둑여우·파란 나비가 시트 로딩 전 오른쪽을 보던 원인) */
export const enemyFaceRig = (rig, id, back = false) => (rig?.dot ? enemyFace(id, back) : -enemyFace(id, back));

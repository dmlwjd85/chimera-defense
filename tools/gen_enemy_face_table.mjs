// 적 방향 표(docs/enemy-face-table.md)를 코드의 원화 방향 표에서 만든다. 실행: node tools/gen_enemy_face_table.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { ENEMY_ART_DIR, PORTRAIT_ART_DIR, enemyFace, enemyPortraitFlip } from '../src/logic/enemyFace.js';

// 고치기 전(#86 이전 main) 표: 이 이름들만 뒤집지 않았다 / 초상화는 이 이름들만 뒤집었다
const OLD_NOT_FLIPPED = new Set(['bat', 'wisp', 'boss_frost', 'fast', 'boss_bat', 'boss_bat_t1', 'boss_bat_t2']);   // 나비·무당벌레는 앞선 #86 커밋에서 이미 고침
const OLD_PORTRAIT_FLIPPED = new Set(['normal', 'healer', 'miniboss', 'ghost', 'zombie', 'boss_bone', 'boss_boar', 'boss_lich', 'skeleton', 'flying', 'swarm']);

const list = JSON.parse(readFileSync(new URL('../public/data/enemies.json', import.meta.url), 'utf8'));
const arr = Array.isArray(list) ? list : (list.enemies ?? Object.values(list));
const name = Object.fromEntries(arr.map((e) => [e.id, e.name]));
const word = { R: '오른쪽', F: '정면(거의 좌우 비슷)', L: '왼쪽' };
const sheetName = (id) => {
  const m = id.match(/^(.*)_t([12])$/);
  return m ? `${name[m[1]]} (${m[2] === '1' ? '하드' : '하드코어·신계'} 그림)` : name[id];
};
const before = (id, dir) => OLD_NOT_FLIPPED.has(id) ? (dir === 'R' ? '오른쪽 ❌' : '정면(오른쪽 기움) ❌') : '왼쪽';
let md = `# 적 원화 방향과 전투 방향 표\n\n- 자동 생성: \`node tools/gen_enemy_face_table.mjs\` (기준 데이터는 \`src/logic/enemyFace.js\`의 원화 방향 표)\n- 원화 방향 = 원본 그림을 크게 키워 본 결과(근거 한 줄 포함). 정면은 좌우가 비슷해 확실히 왼쪽으로 보이지 않으므로 오른쪽 그림과 똑같이 뒤집어 늘 왼쪽 모양으로 맞춘다.\n- ❌ = 고치기 전에 교전 화면에서 왼쪽이 아니던 것. (홀림 나비·독무당벌레 떼는 이 PR의 앞 커밋에서 이미 고쳐서 "왼쪽"으로 적었다. 그 앞의 main에서는 오른쪽이었다.)\n\n## 움직이는 그림(전투) 48장\n\n| 이름 | 데이터 이름 | 원화 방향 | 근거 | 고치기 전 전투 | 고친 뒤 전투 |\n|---|---|---|---|---|---|\n`;
for (const id of Object.keys(ENEMY_ART_DIR).sort()) {
  const [d, why] = ENEMY_ART_DIR[id];
  md += `| ${sheetName(id)} | ${id} | ${word[d]} | ${why} | ${before(id, d)} | ${enemyFace(id) === -1 ? '왼쪽 (뒤집음)' : '왼쪽 (그대로)'} |\n`;
}
md += `\n## 한 장 초상화(도감·다음 적 미리보기) 24장\n\n| 이름 | 데이터 이름 | 원화 방향 | 근거 | 고치기 전 | 고친 뒤 |\n|---|---|---|---|---|---|\n`;
for (const id of Object.keys(PORTRAIT_ART_DIR).sort()) {
  const [d, why] = PORTRAIT_ART_DIR[id];
  const was = OLD_PORTRAIT_FLIPPED.has(id) ? '왼쪽(뒤집음)' : (d === 'R' ? '오른쪽 ❌' : '정면 그대로');
  md += `| ${name[id]} | ${id} | ${word[d]} | ${why} | ${was} | ${enemyPortraitFlip(id) ? '왼쪽 (뒤집음)' : '왼쪽 (그대로)'} |\n`;
}
writeFileSync(new URL('../docs/enemy-face-table.md', import.meta.url), md);
console.log('docs/enemy-face-table.md', md.split('\n').length, '줄');

// Rig data for the battle: part-drawn animals (quadruped/bird/frog/bug templates) and one-image enemies (sprite template).
import { RigInstance } from '../rig/RigInstance.js';
import { RigView } from '../rig/RigView.js';
import { DotInstance } from '../rig/DotInstance.js';
import { DotView, ensureDotFrames } from '../rig/DotView.js';
import { DOT_PX, validateDot } from '../rig/dotData.js';
import { enemyFace } from '../logic/enemyFace.js';   // re-export만으로는 이 파일 안에서 쓸 수 없음(2026-11-27, main 합친 뒤 교전 시작 오류)

/** Queue every rig JSON in Boot's preload. */
export function preloadRigs(scene) {
  scene.load.json('rigIndex', 'data/rig/index.json');
  scene.load.once('filecomplete-json-rigIndex', (k, t, idx) => {
    for (const tp of [...idx.templates, 'sprite']) scene.load.json('rigT-' + tp, `data/rig/${tp}.template.json`);
    for (const a of idx.anims) scene.load.json('rigA-' + a, `data/rig/${a}.anims.json`);
    for (const id of idx.rigs) scene.load.json('rigR-' + id, `data/rig/${id}.rig.json`);
  });
  // 도트 그림이 있는 종: 설정 파일만 여기서 읽음(시트 그림은 manifest/art-pack에 dot-<종> 키로 들어 있음)
  scene.load.json('dotIndex', 'data/dot/index.json');
  scene.load.json('dotmIndex', 'data/dotm/index.json');
  scene.load.once('filecomplete-json-dotIndex', (k, t, idx) => {
    for (const id of idx?.species ?? []) scene.load.json('dotD-' + id, `data/dot/${id}.dot.json`);
  });
}

/** 동작 도트 시트(PixelLab 동작): 폰 메모리 때문에 전투에 들어갈 때 덱에 든 종만 불러오고, 전투가 끝나면 내림. */
export function queueMotionSheets(scene, speciesIds) {
  const have = new Set(scene.cache.json.get('dotmIndex')?.species ?? []);
  for (const id of new Set(speciesIds)) for (const key of [id, id + '_spirit']) {
    if (!have.has(key)) continue;
    if (scene.cache.json.exists('dotM-' + key)) { const d = scene.cache.json.get('dotM-' + key); if (!scene.textures.exists(d.sheet)) scene.load.image(d.sheet, d.file); continue; }
    scene.load.json('dotM-' + key, `data/dotm/${key}.dot.json`);
    scene.load.once('filecomplete-json-dotM-' + key, (k, t, d) => { if (d?.sheet && !scene.textures.exists(d.sheet)) scene.load.image(d.sheet, d.file); });
  }
}
export function dropMotionSheets(scene) {
  for (const key of scene.textures.getTextureKeys()) if (key.startsWith('dot-m-')) scene.textures.remove(key);
}

/** 도트 그림 켜짐 여부. ?dotart=0 이면 예전 조각 리그로 비교해 볼 수 있음(저장하지 않음). */
export const dotArtOn = () => { try { return new URLSearchParams(location.search).get('dotart') !== '0'; } catch { return true; } };

const dotBad = new Set();
/** 그 종·단계의 도트 설정(없거나 깨졌거나 시트가 없으면 null → 기존 리그로). 영물(spirit)은 도트 영물 그림이 있을 때만. */
export function dotDataFor(scene, speciesId, stage) {
  if (!dotArtOn()) return null;
  // 신화급은 따로 그린 시트(<종>_spirit)가 있으면 그걸로(팔레트 16색이 단계 묶음마다 따로라서)
  // 동작 시트가 불러와져 있으면 그걸 먼저(전투), 없으면 정지 그림 시트(덱·지도·초상화)
  const mv = scene.cache.json.get('dotM-' + speciesId + (stage === 'spirit' ? '_spirit' : ''));
  if (mv && mv.stages?.[stage] && !dotBad.has(mv.species + 'm') && scene.textures.exists(mv.sheet)) {
    if (!mv._checked) { const errs = validateDot(mv); if (errs.length) { console.warn(`dotm ${mv.species}:`, errs); dotBad.add(mv.species + 'm'); } else mv._checked = true; }
    if (mv._checked && ensureDotFrames(scene, mv)) return mv;
  }
  const d = (stage === 'spirit' && scene.cache.json.get('dotD-' + speciesId + '_spirit')) || scene.cache.json.get('dotD-' + speciesId);
  if (!d || dotBad.has(d.species)) return null;
  if (stage === 'spirit' && !d.stages.spirit) return null;
  if (!d._checked) {
    const errs = validateDot(d);
    if (errs.length) { console.warn(`dot ${d.species}:`, errs); dotBad.add(d.species); return null; }
    d._checked = true;
  }
  if (!scene.textures.exists(d.sheet) || !ensureDotFrames(scene, d)) return null;
  return d;
}

const json = (scene, key) => scene.cache.json.get(key);

/** 공격 동작들(할퀴기·들이받기·물기·덮치기 포함). 리그의 attacks 목록을 차례로 돌려 써서 공격이 단조롭지 않게 함. */
export const ATTACK_MOTIONS = ['attack', 'claw', 'butt', 'bite', 'pounce', 'peck', 'swoop'];
export function playAttack(inst, move = null) {
  const list = (inst.rig.attacks || []).filter((n) => inst.anims[n]);
  // 기술 묶음: 기본1 = 첫 공격 동작, 기본2 = 둘째 동작, 속성·필살기 = 기술 동작
  if (move === 'ult' && inst.dot?.sets?.[inst.stageDef?.set]?.ult) return inst.play('ult');
  if (move === 'el' || move === 'ult') return inst.play(inst.anims.skill ? 'skill' : list.at(-1) ?? 'attack');
  if (move === 'a1' || move === 'a2') { if (!list.length) return inst.play('attack'); return inst.play(list[move === 'a2' ? Math.min(1, list.length - 1) : 0]); }
  if (!list.length) return inst.play('attack');
  inst._atk = ((inst._atk ?? -1) + 1) % list.length;
  return inst.play(list[inst._atk]);
}
const ART_SPIRITS = new Set([]); // 리코스 그림 한 장으로 움직일 신화급(지금은 없음: 케르베로스는 개 리그에 머리 둘을 더한 것)

/** Rig instance + view for a unit, inside `parent` container; null when there is no rig (weak chimera). */
export function unitRig(scene, unit, parent, scale = 0.17) {
  // 돌연변이 슬라임(PixelLab 동작, 2026-11-27): 회색 얼룩 두 곳에 두 부모 색을 입힌 시트로
  if (unit.kind === 'weak') {
    const sd = slimeDot(scene, unit);
    if (!sd) return null;
    const inst = new DotInstance(sd, { stage: 'adult', scale });
    return { inst, view: new DotView(scene, inst, { parent, px: DOT_PX * (scale / 0.22) }), dot: true };
  }
  // 자동 키메라 정식 그림(PixelLab, 한 몸으로 섞인 성체)이 있으면 그걸로
  if (unit.kind === 'chimera') {
    const own = dotDataFor(scene, unit.speciesId, 'adult');
    if (own) {
      const inst = new DotInstance(own, { stage: 'adult', scale });
      return { inst, view: new DotView(scene, inst, { parent, px: DOT_PX * (scale / 0.22) }), dot: true };
    }
  }
  // 자동 키메라(같은 강 짝, 전용 그림 전): 힘센 쪽 성체 도트에 다른 쪽 색을 입힘 — 이미지 작업창 주문서에 정식 그림 올림
  if (unit.kind === 'chimera' && unit.stats?.look) {
    const ld = dotDataFor(scene, unit.stats.look, 'adult');
    if (ld) {
      const inst = new DotInstance(ld, { stage: 'adult', scale: scale * 1.08 });
      const view = new DotView(scene, inst, { parent, px: DOT_PX * ((scale * 1.08) / 0.22) });
      view.tint = unit.stats.lookTint;
      return { inst, view, dot: true };
    }
  }
  // 도트 그림이 있는 종은 도트로(전투 기본 배율 0.22일 때 도트 1칸 = 3px). 없는 종은 아래 기존 리그 그대로.
  const dot = dotDataFor(scene, unit.speciesId, unit.stage);
  if (dot) {
    const inst = new DotInstance(dot, { stage: unit.stage, scale });
    return { inst, view: new DotView(scene, inst, { parent, px: DOT_PX * (scale / 0.22) }), dot: true };
  }
  // 리코스 그림을 통째로 쓰는 신화급(케르베로스): 한 장짜리 스프라이트 리그로 움직임
  const artKey = unit.stage === 'spirit' && ART_SPIRITS.has(unit.speciesId) ? `unit-${unit.speciesId}-spirit` : null;
  if (artKey && scene.textures.exists(artKey)) {
    const template = json(scene, 'rigT-sprite'), anims = json(scene, 'rigA-sprite');
    if (template && anims) {
      const w = scene.textures.get(artKey).getSourceImage().width || 256;
      const rig = { species: unit.speciesId, template: 'sprite', textures: { body: artKey }, artScale: 256 / w, stages: { spirit: { scale: 1, speed: 1 } } };
      const inst = new RigInstance(template, anims, rig, { stage: 'spirit', x: 0, y: 0, scale: 0.5, seed: unit.uid });
      return { inst, view: new RigView(scene, inst, { parent }) };
    }
  }
  const rig = (unit.stage === 'spirit' && json(scene, 'rigR-' + unit.speciesId + '_spirit')) || json(scene, 'rigR-' + unit.speciesId);
  if (!rig) return null;
  const template = json(scene, 'rigT-' + rig.template), anims = json(scene, 'rigA-' + (rig.anims ?? rig.template));
  if (!template || !anims) return null;
  const stage = rig.stages[unit.stage] ? unit.stage : 'adult';
  const inst = new RigInstance(template, anims, rig, { stage, x: 0, y: 0, scale, seed: unit.uid });
  return { inst, view: new RigView(scene, inst, { parent }) };
}

/** 슬라임·자동 키메라 동작 시트 이름: 덱(pool)에 든 종끼리 짝이 되는 자동 키메라 + 슬라임. */
export function poolExtraIds(pool, recipes = []) {
  const ids = ['slime'], u = [...new Set(pool)].sort(), has = new Set(u);
  for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) ids.push(`auto_${u[i]}_${u[j]}`);
  // 이야기 키메라(recipes.json): 두 재료가 다 덱에 있으면 그 시트도
  for (const r of recipes ?? []) if (r.parts?.every((p) => has.has(p))) ids.push(r.id);
  return ids;
}

/** 슬라임 시트를 두 부모 색으로 물들인 복사본(회색 얼룩: 그림 왼쪽 반 = 첫 부모, 오른쪽 반 = 둘째 부모). 없으면 null. */
export function slimeDot(scene, unit) {
  const mv = scene.cache.json.get('dotM-slime');
  if (!dotArtOn() || !mv || !scene.textures.exists(mv.sheet) || unit.parts?.length !== 2) return null;
  const D = scene.D ?? scene.data2;
  const cols = unit.parts.map((p) => D?.unitById?.[p]?.color ?? '#888888');
  const key = `${mv.sheet}-${cols.join('-').replace(/#/g, '')}`;
  if (!scene.textures.exists(key)) {
    const src = scene.textures.get(mv.sheet).getSourceImage();
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d'); g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, cv.width, cv.height), px = img.data;
    // 얼룩 색 = 팔레트에서 채도가 거의 없는 중간 밝기 회색(몸은 회녹색, 외곽선은 짙음)
    const spot = new Map();
    for (const h of mv.palette ?? []) {
      const r = parseInt(h.slice(1, 3), 16), gg = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      const lum = (r * 299 + gg * 587 + b * 114) / 1000;
      if (Math.max(r, gg, b) - Math.min(r, gg, b) < 16 && lum > 95 && lum < 225) spot.set((r << 16) | (gg << 8) | b, lum / 170);
    }
    const rgb = cols.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    for (const r of Object.values(mv.rects)) {
      const [x0, y0, w, h, lx] = r, mid = x0 - lx;   // 기준점(몸 가운데) x
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const i = (y * cv.width + x) * 4;
        if (!px[i + 3]) continue;
        const k = spot.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
        if (k == null) continue;
        const c = rgb[x < mid ? 0 : 1];
        px[i] = Math.min(255, c[0] * k); px[i + 1] = Math.min(255, c[1] * k); px[i + 2] = Math.min(255, c[2] * k);
      }
    }
    g.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, cv);
  }
  const d = { ...mv, sheet: key };
  if (!d._checked && validateDot(mv).length) return null;
  return ensureDotFrames(scene, d) ? d : null;
}

/** 적 동작 시트(PixelLab, en_<id>): 그 판에 나올 적만. 보스가 불러내는 졸병도 같이. */
export function stageEnemyIds(stage, data) {
  const ids = new Set();
  for (const w of stage?.waves ?? []) { for (const id of Object.keys(w.mix ?? {})) ids.add(id); for (const id of w.extra ?? []) ids.add(id); }
  if (stage?.boss) ids.add(stage.boss);
  for (const id of [...ids]) { const p = data?.enemyById?.[id]?.pattern; if (p?.enemy) ids.add(p.enemy); }
  // 새 보스는 아직 전용 그림이 없어 기존 그림(skin)에 색만 입힘 → 그 그림 시트도 불러옴
  for (const id of [...ids]) { const sk = data?.enemyById?.[id]?.skin; if (sk) ids.add(sk); }
  // 보스 단계 그림(하드·하드코어)도 같이(시트 둘뿐)
  if (stage?.boss) { ids.add(stage.boss + '_t1'); ids.add(stage.boss + '_t2'); }
  return [...ids].map((id) => 'en_' + id);
}

/** 적 방향 표(왼쪽을 보는 원화는 뒤집지 않음). 내용은 src/logic/enemyFace.js */
export { ENEMY_FACES_LEFT, PORTRAIT_FACES_RIGHT, enemyPortraitFlip, enemyFace, enemyFaceOld } from '../logic/enemyFace.js';

/** 적 도트(동작 시트가 불러와져 있을 때만). 오른쪽을 보는 그림 → 왼쪽(동물 쪽)을 보게 뒤집음. */
function enemyDot(scene, enemy, parent, scale) {
  if (!dotArtOn()) return null;
  // 어려운 난이도 보스: 단계 그림(en_<id>_t1 하드 · _t2 하드코어·신계)이 있으면 그걸로
  const tierMv = enemy.lookTier ? scene.cache.json.get(`dotM-en_${enemy.id}_t${enemy.lookTier}`) ?? (enemy.lookTier === 2 ? scene.cache.json.get(`dotM-en_${enemy.id}_t1`) : null) : null;
  const mv = tierMv && scene.textures.exists(tierMv.sheet) ? tierMv : scene.cache.json.get('dotM-en_' + (enemy.skin ?? enemy.id));
  if (!mv || dotBad.has(mv.species + 'm') || !scene.textures.exists(mv.sheet)) return null;
  if (!mv._checked) { const errs = validateDot(mv); if (errs.length) { console.warn(`dotm ${mv.species}:`, errs); dotBad.add(mv.species + 'm'); return null; } mv._checked = true; }
  if (!ensureDotFrames(scene, mv)) return null;
  // 적 등급(푸른·붉은·검은): 몸 색은 그대로 두고 외곽선만 등급 색으로 바꾼 시트를 씀(몸 전체 물들이기 대신)
  const rk = enemy.rankTint ? rankDot(scene, mv, enemy.rankTint) : null;
  const inst = new DotInstance(rk ?? mv, { stage: 'adult', scale, motion: 'move' });
  const faceId = tierMv && mv === tierMv ? mv.species.slice(3) : enemy.skin ?? enemy.id;   // 단계 그림은 종 이름에 _t1/_t2가 붙음. 방향은 enemyFace(faceId)가 정함
  inst.setFacing(enemyFace(faceId));
  const view = new DotView(scene, inst, { parent, px: DOT_PX * (scale / 0.22) });
  if (enemy.tint && !rk) view.tint = enemy.tint;
  return { inst, view, dot: true, ranked: !!rk, faceId };
}

/** 등급 색 시트: 외곽선(#291a1f)만 등급 색 테두리로 바꿈. 팔레트 한 색만 바꾸므로 그림·몸 색은 그대로. */
export function rankDot(scene, mv, tint) {
  const key = `${mv.sheet}-r${tint.toString(16)}`;
  if (!scene.textures.exists(key)) {
    const src = scene.textures.get(mv.sheet).getSourceImage();
    if (!src?.width) return null;
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d'); g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, cv.width, cv.height), px = img.data;
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    const map = new Map();
    for (const h of mv.palette ?? []) {
      const r = parseInt(h.slice(1, 3), 16), gg = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
      const k = (r << 16) | (gg << 8) | b;
      if (Math.abs(r - 0x29) + Math.abs(gg - 0x1a) + Math.abs(b - 0x1f) < 24) map.set(k, [tr * 0.62, tg * 0.62, tb * 0.62]);   // 외곽선(#291a1f) → 등급 색 테두리(몸 색·눈은 그대로)
    }
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const c = map.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      if (c) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
    }
    g.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, cv);
  }
  const d = { ...mv, sheet: key };
  return ensureDotFrames(scene, d) ? d : null;
}

/** One-image enemy animated with the sprite template. */
export function enemyRig(scene, enemy, parent, px, dotScale = 0.22) {
  const dot = enemyDot(scene, enemy, parent, dotScale);   // dotScale = 그 화면의 동물 배율(전투 0.22, 연전 0.34)과 같게
  if (dot) return dot;
  const key = 'enemy-' + enemy.id;
  if (!scene.textures.exists(key)) return null;
  const template = json(scene, 'rigT-sprite'), anims = json(scene, 'rigA-sprite');
  if (!template || !anims) return null;
  const rig = { species: enemy.id, template: 'sprite', textures: { body: key }, artScale: 256 / (scene.textures.get(key).getSourceImage().width || 256), flipArt: true,
    stages: { adult: { scale: 1, speed: enemy.boss ? 0.8 : 1 + (enemy.speed - 1) * 0.4 } } };
  const inst = new RigInstance(template, anims, rig, { stage: 'adult', x: 0, y: 0, scale: px / 256, seed: enemy.eid, motion: 'move' });
  inst.setFacing(-1);
  return { inst, view: new RigView(scene, inst, { parent }) };
}

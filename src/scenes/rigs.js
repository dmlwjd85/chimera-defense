// Rig data for the battle: part-drawn animals (quadruped/bird/frog/bug templates) and one-image enemies (sprite template).
import { RigInstance } from '../rig/RigInstance.js';
import { RigView } from '../rig/RigView.js';
import { DotInstance } from '../rig/DotInstance.js';
import { DotView, ensureDotFrames } from '../rig/DotView.js';
import { DOT_PX, validateDot } from '../rig/dotData.js';

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
  scene.load.once('filecomplete-json-dotIndex', (k, t, idx) => {
    for (const id of idx?.species ?? []) scene.load.json('dotD-' + id, `data/dot/${id}.dot.json`);
  });
}

/** 도트 그림 켜짐 여부. ?dotart=0 이면 예전 조각 리그로 비교해 볼 수 있음(저장하지 않음). */
export const dotArtOn = () => { try { return new URLSearchParams(location.search).get('dotart') !== '0'; } catch { return true; } };

const dotBad = new Set();
/** 그 종·단계의 도트 설정(없거나 깨졌거나 시트가 없으면 null → 기존 리그로). 영물(spirit)은 도트 영물 그림이 있을 때만. */
export function dotDataFor(scene, speciesId, stage) {
  if (!dotArtOn()) return null;
  const d = scene.cache.json.get('dotD-' + speciesId);
  if (!d || dotBad.has(speciesId)) return null;
  if (stage === 'spirit' && !d.stages.spirit) return null;
  if (!d._checked) {
    const errs = validateDot(d);
    if (errs.length) { console.warn(`dot ${speciesId}:`, errs); dotBad.add(speciesId); return null; }
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
  if (move === 'el' || move === 'ult') return inst.play(inst.anims.skill ? 'skill' : list.at(-1) ?? 'attack');
  if (move === 'a1' || move === 'a2') { if (!list.length) return inst.play('attack'); return inst.play(list[move === 'a2' ? Math.min(1, list.length - 1) : 0]); }
  if (!list.length) return inst.play('attack');
  inst._atk = ((inst._atk ?? -1) + 1) % list.length;
  return inst.play(list[inst._atk]);
}
const ART_SPIRITS = new Set([]); // 리코스 그림 한 장으로 움직일 신화급(지금은 없음: 케르베로스는 개 리그에 머리 둘을 더한 것)

/** Rig instance + view for a unit, inside `parent` container; null when there is no rig (weak chimera). */
export function unitRig(scene, unit, parent, scale = 0.17) {
  if (unit.kind === 'weak') return null;
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

/** One-image enemy animated with the sprite template. */
export function enemyRig(scene, enemy, parent, px) {
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

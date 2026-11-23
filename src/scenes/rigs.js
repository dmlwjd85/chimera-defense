// Rig data for the battle: part-drawn animals (quadruped/bird/frog/bug templates) and one-image enemies (sprite template).
import { RigInstance } from '../rig/RigInstance.js';
import { RigView } from '../rig/RigView.js';

/** Queue every rig JSON in Boot's preload. */
export function preloadRigs(scene) {
  scene.load.json('rigIndex', 'data/rig/index.json');
  scene.load.once('filecomplete-json-rigIndex', (k, t, idx) => {
    for (const tp of [...idx.templates, 'sprite']) scene.load.json('rigT-' + tp, `data/rig/${tp}.template.json`);
    for (const a of idx.anims) scene.load.json('rigA-' + a, `data/rig/${a}.anims.json`);
    for (const id of idx.rigs) scene.load.json('rigR-' + id, `data/rig/${id}.rig.json`);
  });
}

const json = (scene, key) => scene.cache.json.get(key);

/** Rig instance + view for a unit, inside `parent` container; null when there is no rig (weak chimera). */
export function unitRig(scene, unit, parent, scale = 0.17) {
  if (unit.kind === 'weak') return null;
  const rig = json(scene, 'rigR-' + unit.speciesId);
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
  const rig = { species: enemy.id, template: 'sprite', textures: { body: key }, artScale: 1, flipArt: true,
    stages: { adult: { scale: 1, speed: enemy.boss ? 0.8 : 1 + (enemy.speed - 1) * 0.4 } } };
  const inst = new RigInstance(template, anims, rig, { stage: 'adult', x: 0, y: 0, scale: px / 256, seed: enemy.eid, motion: 'move' });
  inst.setFacing(-1);
  return { inst, view: new RigView(scene, inst, { parent }) };
}

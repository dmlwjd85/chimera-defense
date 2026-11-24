// 리그 한 마리의 기본 자세 배치값(부위별 위치·회전·배율)을 JSON으로 출력. tools/apply_parts.py가 부위 그림 크기를 맞출 때 씀.
import fs from 'fs';
import { RigInstance } from '../src/rig/RigInstance.js';
const D = new URL('../public/data/rig/', import.meta.url).pathname;
const [rigPath, stage = 'adult'] = process.argv.slice(2);
const rig = JSON.parse(fs.readFileSync(rigPath));
const template = JSON.parse(fs.readFileSync(D + rig.template + '.template.json'));
const anims = JSON.parse(fs.readFileSync(D + (rig.anims ?? rig.template) + '.anims.json'));
const inst = new RigInstance(template, anims, rig, { stage, x: 0, y: 0, scale: 1, seed: 1 });
inst.update(0);
console.log(JSON.stringify({ artRes: rig.artRes ?? 2, list: inst.getDrawList().map((d) => ({ slot: d.slot, sx: d.sx, sy: d.sy })) }));

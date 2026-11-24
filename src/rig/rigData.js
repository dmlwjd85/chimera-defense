// Validation and lookup for template / anims / rig JSON.
export const STAGES = ['young', 'teen', 'adult'];
export const MOTIONS = ['idle', 'move', 'attack', 'skill', 'hit', 'down', 'respawn', 'victory', 'merge_in', 'evolve'];
export const CHANNELS = ['rot', 'x', 'y', 'sx', 'sy', 'alpha'];

export function validateTemplate(t) {
  const errs = [];
  if (!t || !Array.isArray(t.bones) || !t.bones.length) return ['bones missing'];
  const seen = new Set();
  t.bones.forEach((b, i) => {
    if (!b.name) errs.push(`bone ${i} has no name`);
    if (seen.has(b.name)) errs.push(`duplicate bone ${b.name}`);
    if (i === 0 && b.parent) errs.push('first bone must be the root');
    if (i > 0 && !seen.has(b.parent)) errs.push(`bone ${b.name}: parent ${b.parent} must come earlier`);
    seen.add(b.name);
  });
  (t.slots || []).forEach((s) => { if (!seen.has(s.bone)) errs.push(`slot ${s.name}: unknown bone ${s.bone}`); });
  for (const sp of t.procedural?.springs || []) for (const b of sp.bones) if (!seen.has(b)) errs.push(`spring: unknown bone ${b}`);
  for (const r of t.ropes || []) for (const b of r.bones) if (!seen.has(b)) errs.push(`rope ${r.slot}: unknown bone ${b}`);
  return errs;
}

export function validateAnims(anims, template) {
  const errs = [];
  const bones = new Set(template.bones.map((b) => b.name));
  for (const n of ['fr', 'fn', 'br', 'bn']) bones.add('ik_' + n); // 발 목표(IK) 트랙
  for (const m of MOTIONS) if (!anims[m]) errs.push(`motion ${m} missing`);
  for (const [name, a] of Object.entries(anims)) {
    if (!(a.duration > 0)) errs.push(`${name}: duration must be > 0`);
    for (const [bone, tr] of Object.entries(a.tracks || {})) {
      if (!bones.has(bone)) errs.push(`${name}: unknown bone ${bone}`);
      for (const [ch, keys] of Object.entries(tr)) {
        if (!CHANNELS.includes(ch)) errs.push(`${name}.${bone}: unknown channel ${ch}`);
        let last = -1;
        for (const k of keys) {
          if (!Array.isArray(k) || k.length < 2) { errs.push(`${name}.${bone}.${ch}: bad key`); continue; }
          if (k[0] < last) errs.push(`${name}.${bone}.${ch}: keys out of order`);
          if (k[0] < 0 || k[0] > a.duration + 1e-9) errs.push(`${name}.${bone}.${ch}: key time ${k[0]} outside 0..${a.duration}`);
          last = k[0];
        }
      }
    }
    for (const e of a.events || []) if (e[0] < 0 || e[0] > a.duration) errs.push(`${name}: event ${e[1]} outside clip`);
  }
  return errs;
}

export function validateRig(rig, template) {
  const errs = [];
  for (const s of STAGES) if (!rig.stages?.[s]) errs.push(`stage ${s} missing`);
  const slots = new Set((template.slots || []).map((s) => s.name));
  for (const [st, def] of Object.entries(rig.stages || {})) {
    for (const k of Object.keys(def.parts || {})) if (!slots.has(k)) errs.push(`${st}: unknown slot ${k}`);
  }
  return errs;
}

// Load rig JSON from public/data/rig (browser) and build instances.
import { RigInstance } from './RigInstance.js';
import { validateTemplate, validateAnims, validateRig } from './rigData.js';

const cache = {};
async function getJson(base, name) {
  const url = `${base}${name}.json`;
  return (cache[url] ||= fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }));
}

/** Returns { template, anims, rig, make(opts) }. Throws with the validation errors if any file is broken. */
export async function loadRig(species, base = 'data/rig/') {
  const rig = await getJson(base, `${species}.rig`);
  const template = await getJson(base, `${rig.template}.template`);
  const anims = await getJson(base, `${rig.anims ?? rig.template}.anims`);
  const errs = [...validateTemplate(template), ...validateAnims(anims, template), ...validateRig(rig, template)];
  if (errs.length) throw new Error(`rig ${species}:\n` + errs.join('\n'));
  return { template, anims, rig, make: (opts) => new RigInstance(template, anims, rig, opts) };
}

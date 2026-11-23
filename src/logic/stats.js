const STATUS_FIELD = { slow: 'percent', aura: 'percent', haste: 'percent', poison: 'dps' };
const MODIFIERS = new Set(['confuseTargets', 'aoeRadiusSet', 'knockbackStun', 'respawnHalf', 'hasteRadiusSet', 'text']);

/** Round to one decimal place. */
export const round1 = (x) => Math.round(x * 10) / 10;

const copyAll = (effects) => effects.map((e) => ({ ...e }));
const uniq = (list) => [...new Set(list)];

/** Scale effect numbers by an evolution multiplier (returns new objects). */
export function scaleEffects(effects, mult) {
  return effects.map((e) => {
    const out = { ...e };
    if (e.type === 'hold') out.count = Math.round(e.count * mult.hold);
    const field = STATUS_FIELD[e.type];
    if (field) out[field] = round1(e[field] * mult.status);
    return out;
  });
}

/** Fold modifier effects into stats and drop modifiers/text from the effect list. */
export function applyModifiers(stats) {
  const find = (type) => stats.effects.find((e) => e.type === type);
  for (const m of stats.effects) {
    if (m.type === 'confuseTargets' && find('confuse')) find('confuse').targets = m.targets;
    else if (m.type === 'knockbackStun' && find('knockback')) find('knockback').stun = m.stun;
    else if (m.type === 'aoeRadiusSet') stats.aoeRadius = m.radius;
    else if (m.type === 'respawnHalf') stats.respawn /= 2;
    else if (m.type === 'hasteRadiusSet' && find('haste')) find('haste').radius = m.radius;
  }
  stats.effects = stats.effects.filter((e) => !MODIFIERS.has(e.type));
  return stats;
}

/** Damage multiplier for a species from config.damageBoost by rarity (1 when not set). */
export function damageBoost(sp, config) {
  const b = config.damageBoost;
  return b && typeof b[sp.rarity] === 'number' ? b[sp.rarity] : 1;
}

/** Look up both part species of a chimera or weak chimera. */
function partsOf(inst, data) {
  const parts = (inst.parts ?? []).map((id) => data.unitById[id]);
  if (parts.length !== 2 || parts.some((p) => !p)) throw new Error('unitStats: bad parts ' + inst.parts);
  return parts;
}

function baseStats(inst, data) {
  const sp = data.unitById[inst.speciesId];
  const m = data.config.stageMult[inst.stage];
  if (!sp || !m) throw new Error(`unitStats: bad base ${inst.speciesId}/${inst.stage}`);
  const adult = inst.stage === 'adult' || inst.stage === 'spirit';
  const spirit = inst.stage === 'spirit';
  const skillLine = (s) => `${s.name}: ${s.desc}`;
  return {
    name: sp.stageNames[inst.stage],
    hp: Math.round(sp.hp * m.damage), damage: round1(sp.damage * damageBoost(sp, data.config) * m.damage),
    interval: sp.interval, range: sp.range, aoeRadius: sp.aoeRadius, block: sp.block, respawn: sp.respawn,
    effects: [...scaleEffects(sp.baseSkill, m), ...(adult ? copyAll(sp.adultSkill.effects) : []), ...(spirit ? copyAll(sp.spiritSkill.effects) : [])],
    skills: [sp.baseSkillDesc, ...(adult ? [skillLine(sp.adultSkill)] : []), ...(spirit ? [skillLine(sp.spiritSkill)] : [])],
    skillTales: [['base', sp.baseSkillDesc], ...(adult ? [['adult', sp.adultSkill.desc]] : []), ...(spirit ? [['spirit', sp.spiritSkill.desc]] : [])].map(([k, desc]) => { const t = data.tales?.skills?.[`${sp.id}_${k}`]; return { name: t?.[0] ?? (k === 'adult' ? sp.adultSkill.name : k === 'spirit' ? sp.spiritSkill.name : '기본기'), tale: t?.[1] ?? '', desc }; }),
    element: sp.element ?? null, continents: [sp.continent], habitats: [sp.habitat], color: sp.color, image: sp.image ?? null, role: sp.role, flyer: !!sp.flyer,
  };
}

function chimeraStats(inst, data) {
  const r = data.recipeById[inst.speciesId];
  if (!r) throw new Error('unitStats: unknown recipe ' + inst.speciesId);
  const [a, b] = partsOf(inst, data);
  const m = data.config.stageMult.adult;
  return {
    name: r.name,
    hp: Math.round(data.config.chimeraHpRatio * (a.hp + b.hp) * m.damage),
    damage: round1(r.damage * ((damageBoost(a, data.config) + damageBoost(b, data.config)) / 2) * m.damage),
    interval: r.interval, range: r.range, aoeRadius: r.aoeRadius,
    block: r.block ?? Math.max(a.block, b.block), respawn: Math.max(a.respawn, b.respawn),
    effects: scaleEffects(r.effects, m), skills: [r.desc], skillTales: [{ name: r.name, tale: data.tales?.recipes?.[r.id] ?? '', desc: r.desc }],
    element: r.element ?? null, continents: uniq([a.continent, b.continent]), habitats: uniq([a.habitat, b.habitat]), color: r.color, image: r.image ?? null, role: r.role, flyer: !!r.flyer,
  };
}

function weakStats(inst, data) {
  const [a, b] = partsOf(inst, data);
  return {
    name: (inst.reversal ? '역전의 ' : data.config.weakNamePrefix) + a.name + b.name,
    hp: Math.min(a.hp, b.hp), damage: round1(Math.min(a.damage * damageBoost(a, data.config), b.damage * damageBoost(b, data.config))),
    interval: Math.max(a.interval, b.interval), range: Math.min(a.range, b.range), aoeRadius: 0,
    block: Math.min(a.block, b.block), respawn: Math.max(a.respawn, b.respawn),
    effects: [], skills: [], skillTales: [],
    continents: uniq([a.continent, b.continent]), habitats: uniq([a.habitat, b.habitat]), color: '#777777', image: null, role: 'weak',
  };
}

const BUILDERS = { base: baseStats, chimera: chimeraStats, weak: weakStats };

/** Final stats of a field/bench unit instance. */
export function unitStats(inst, data) {
  const build = BUILDERS[inst.kind];
  if (!build) throw new Error('unitStats: unknown kind ' + inst.kind);
  const s = applyModifiers(build(inst, data));
  return { kind: inst.kind, stage: inst.stage, ...s, canHitFlying: s.range >= data.config.flyingMinRange };
}

// 상성(2026-11-26): 덱 하나로 모든 스테이지를 깨기 어렵게 세 겹으로.
//  ① 속성: 물→불·땅, 불→풀·바람·달, 풀→물·땅, 땅→번개·불, 번개→물·바람, 바람→풀·땅, 빛↔달 — 강하면 ×1.5, 약하면 ×0.6 (적이 칠 때도 ×1.3 / ×0.8)
//  ② 먹이사슬: 사냥꾼 → 먹잇감 ×1.3, 천적 앞에서는 ×0.8 + 벌벌 떪
//  ③ 스테이지 성격: 그 판에 많이 나오는 적·속성·저항을 덱 화면에 미리 보여 주고, 동물마다 효과 좋음/별로
const DEF = {
  strong: 1.6, weak: 0.5, eStrong: 1.45, eWeak: 0.7, prey: 1.35, fear: 0.75, stageShare: 0.7,
  beats: { water: ['fire', 'earth'], fire: ['grass', 'wind', 'moon'], grass: ['water', 'earth'], earth: ['thunder', 'fire'], thunder: ['water', 'wind'], wind: ['grass', 'earth'], light: ['moon'], moon: ['light'] },
  enemyElem: { normal: 'fire', fast: 'wind', tough: 'earth', swarm: 'grass', flying: 'wind', healer: 'grass', miniboss: 'grass', bat: 'moon',
    skeleton: 'earth', ghost: 'moon', zombie: 'earth', wisp: 'fire', boss_boar: 'earth', boss_bat: 'moon', boss_shadow: 'moon', boss_bone: 'earth', boss_frost: 'water', boss_lich: 'moon' },
  // 스테이지 기운: 보스가 아닌 적의 절반이 이 속성으로 물듦(비 오는 습지 = 물, 얼어붙은 호수 = 물)
  stageElem: { 'forest-2': 'water', 'forest-3': 'moon', 'stage-4': 'earth', 'stage-5': 'water', 'stage-6': 'thunder' },
  // 먹이사슬(실제 생태 기준). hunters: 이 동물이 사냥하는 적 / fears: 이 동물이 무서워하는 적
  hunters: {
    frog: ['swarm', 'flying'], crow: ['swarm', 'flying'], rooster: ['swarm'], monkey: ['swarm'], grasshopper: [],
    tiger: ['miniboss', 'zombie', 'boss_boar'], wolf: ['miniboss', 'zombie', 'boss_boar'], dog: ['fast'], bear: ['healer', 'swarm'],
    eagle: ['bat', 'fast', 'flying'], fox: ['swarm', 'bat'], ant: ['healer'],
  },
  fears: { rabbit: ['fast'], rooster: ['fast'], grasshopper: ['swarm'], frog: ['bat'] },
};

export const mcfg = (data) => ({ ...DEF, ...(data.config.matchup ?? {}) });

/** 속성 상성 배수(공격 속성 → 맞는 속성). */
export function elemMult(att, def, m, strong = m.strong, weak = m.weak) {
  if (!att || !def) return 1;
  if (m.beats[att]?.includes(def)) return strong;
  if (m.beats[def]?.includes(att)) return weak;
  return 1;
}

/** 적 한 마리의 속성(스테이지 기운이 있으면 보스 아닌 적의 절반이 물듦). */
export function enemyElement(data, stage, id, rngVal = 0) {
  const m = mcfg(data), def = data.enemyById[id];
  const st = m.stageElem[stage?.id];
  if (st && !def?.boss && rngVal < m.stageShare) return st;
  return m.enemyElem[id] ?? null;
}

/** 이 동물(키메라는 두 재료)이 이 적을 사냥하는가 / 무서워하는가. */
export function foodChain(u, enemyId, data) {
  const m = mcfg(data);
  const ids = u.kind === 'chimera' || u.kind === 'weak' ? u.parts ?? [] : [u.speciesId];
  if (ids.some((id) => m.hunters[id]?.includes(enemyId))) return { mult: m.prey, tag: 'prey' };
  // 신화급·키메라는 천적도 두려워하지 않음(뒤집힘)
  if (u.stage !== 'spirit' && u.kind === 'base' && ids.some((id) => m.fears[id]?.includes(enemyId))) return { mult: m.fear, tag: 'fear' };
  return { mult: 1, tag: null };
}

/** 그 스테이지에 나오는 적 무게(웨이브 섞임 비율 합 + 보스). */
export function stageEnemies(stage, data) {
  const w = {};
  for (const wave of stage.waves) for (const [id, p] of Object.entries(wave.mix)) if (data.enemyById[id]) w[id] = (w[id] ?? 0) + p;
  if (stage.boss) w[stage.boss] = (w[stage.boss] ?? 0) + 150;
  return w;
}

/** 스테이지 성격 요약: 많이 나오는 속성, 나는 적 비율, 저항, 보스. 덱 화면·난이도 화면용. */
export function stageProfile(stage, data) {
  const m = mcfg(data), w = stageEnemies(stage, data);
  const total = Object.values(w).reduce((s, v) => s + v, 0) || 1;
  const el = {};
  for (const [id, v] of Object.entries(w)) {
    const base = m.enemyElem[id];
    const st = m.stageElem[stage.id];
    if (st && !data.enemyById[id].boss) { el[st] = (el[st] ?? 0) + v * m.stageShare; if (base) el[base] = (el[base] ?? 0) + v * (1 - m.stageShare); }
    else if (base) el[base] = (el[base] ?? 0) + v;
  }
  const elements = Object.entries(el).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ el: k, share: v / total }));
  const fly = Object.entries(w).filter(([id]) => data.enemyById[id].flying).reduce((s, [, v]) => s + v, 0) / total;
  const resist = { melee: 0, ranged: 0 };
  for (const [id, v] of Object.entries(w)) { const r = data.enemyById[id].resist; if (r?.melee) resist.melee += v / total; if (r?.ranged) resist.ranged += v / total; }
  const tags = [];
  const E = data.config.elements?.defs ?? {};
  if (elements[0]) tags.push(`${E[elements[0].el]?.icon ?? ''} ${E[elements[0].el]?.name ?? elements[0].el} 기운`);
  if (fly >= 0.18) tags.push('🪽 나는 적 많음');
  if (resist.ranged >= 0.2) tags.push('🦴 원거리 저항');
  if (resist.melee >= 0.2) tags.push('👻 근접 저항');
  const bossDef = data.enemyById[stage.boss];
  if (bossDef?.pattern?.type === 'shield') tags.push('🛡 보호막 보스');
  if (bossDef?.heal) tags.push('✚ 회복하는 보스');
  if (bossDef?.pattern?.type === 'summon') tags.push('📣 졸개 부르는 보스');
  return { weights: w, elements, fly, resist, tags, boss: stage.boss };
}

/**
 * 동물 한 종이 이 스테이지에 얼마나 맞는가(1 = 보통). 속성(적 속성 비율로 가중), 먹이사슬(먹잇감·천적 비율),
 * 나는 적(원거리 유리), 저항(근접/원거리 불리)을 곱함.
 */
export function speciesFit(speciesId, stage, data) {
  const m = mcfg(data), sp = data.unitById[speciesId];
  if (!sp) return { score: 1, label: 'mid', why: [] };
  const prof = stageProfile(stage, data);
  const total = Object.values(prof.weights).reduce((s, v) => s + v, 0) || 1;
  let elScore = 0;
  for (const e of prof.elements) elScore += e.share * elemMult(sp.element, e.el, m);
  const elRest = 1 - prof.elements.reduce((s, e) => s + e.share, 0);
  elScore += elRest;
  let fc = 0;
  const fake = { kind: 'base', speciesId, stage: 'adult', parts: null };
  for (const [id, v] of Object.entries(prof.weights)) fc += (v / total) * foodChain(fake, id, data).mult;
  const ranged = sp.range >= (data.config.flyingMinRange ?? 3);
  const flyScore = ranged ? 1 + prof.fly * 0.6 : 1 - prof.fly * 0.5;
  const resScore = 1 - (ranged ? prof.resist.ranged : prof.resist.melee) * 0.5;
  const score = elScore * fc * flyScore * resScore;
  const why = [];
  const E = data.config.elements?.defs ?? {};
  const top = prof.elements[0];
  if (top) { const k = elemMult(sp.element, top.el, m); if (k > 1) why.push(`${E[sp.element]?.icon}→${E[top.el]?.icon} 속성 유리`); if (k < 1) why.push(`${E[sp.element]?.icon}→${E[top.el]?.icon} 속성 불리`); }
  const prey = Object.keys(prof.weights).filter((id) => foodChain(fake, id, data).tag === 'prey');
  const fear = Object.keys(prof.weights).filter((id) => foodChain(fake, id, data).tag === 'fear');
  if (prey.length) why.push(`🍖 ${prey.map((id) => data.enemyById[id].name).join('·')} 사냥`);
  if (fear.length) why.push(`😨 ${fear.map((id) => data.enemyById[id].name).join('·')} 무서워함`);
  if (prof.fly >= 0.18) why.push(ranged ? '🪽 나는 적 잡기 좋음' : '🪽 나는 적 못 잡음');
  if ((ranged ? prof.resist.ranged : prof.resist.melee) >= 0.2) why.push(ranged ? '🦴 원거리 저항에 막힘' : '👻 근접 저항에 막힘');
  return { score, label: score >= 1.12 ? 'good' : score <= 0.9 ? 'bad' : 'mid', why };
}

/** 스테이지에 가장 잘 맞는 n종(봇·추천용). */
export function bestDeck(stage, data, pool, n = 6, worst = false) {
  // 역할을 고르게(브루저 2 · 근접 딜러/기술 2 · 원거리/응원 2) 두고 그 안에서 상성 좋은(나쁜) 순
  const group = (id) => { const u = data.unitById[id]; return u.range > 1 || u.role === 'buffer' ? 'back' : u.role === 'bruiser' ? 'tank' : 'melee'; };
  const by = (a, b) => (speciesFit(b, stage, data).score - speciesFit(a, stage, data).score) * (worst ? -1 : 1);
  const out = [];
  for (const gname of ['tank', 'melee', 'back']) out.push(...pool.filter((id) => group(id) === gname).sort(by).slice(0, Math.round(n / 3)));
  for (const id of [...pool].sort(by)) { if (out.length >= n) break; if (!out.includes(id)) out.push(id); }
  return out.slice(0, n);
}

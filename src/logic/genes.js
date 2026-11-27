// 염색체 합성(2026-11-27): 같은 강(포유류·조류·곤충·양서류·파충류)끼리만 키메라가 되고,
// 성공 확률은 두 동물의 염색체 수(2n) 차이로 정해짐. 실패하거나 강이 다르면 돌연변이 슬라임.
import { eco } from './relics.js';

const pairKey = (a, b) => (a < b ? `${a}+${b}` : `${b}+${a}`);

export const genesOf = (data) => data?.config?.genes ?? null;
export const classOf = (id, data) => genesOf(data)?.cls?.[id] ?? null;
export const chromoOf = (id, data) => genesOf(data)?.chromo?.[id] ?? null;
/** [이름, 아이콘] of a class id. */
export const className = (cls, data) => genesOf(data)?.classes?.[cls] ?? [cls ?? '?', '❔'];

/** Same class (genes off → always true). */
export function sameClass(a, b, data) {
  const g = genesOf(data);
  if (!g) return true;
  const ca = g.cls?.[a], cb = g.cls?.[b];
  return !!ca && ca === cb;
}

/** Success chance in % for merging adult a with adult b (0 when the classes differ). */
export function geneChance(a, b, data) {
  const g = genesOf(data);
  if (!g) return 100;
  if (!sameClass(a, b, data)) return 0;
  const d = Math.abs((g.chromo?.[a] ?? 0) - (g.chromo?.[b] ?? 0));
  return Math.max(g.minPct ?? 0, Math.min(100, Math.round(100 - d * (g.perDiff ?? 1))));
}

const hexOf = (c) => parseInt(String(c ?? '#888888').replace('#', ''), 16) || 0x888888;
const mix = (a, b, k = 0.5) => {
  const A = hexOf(a), B = hexOf(b);
  const ch = (s) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
};
const power = (u) => u.hp / 10 + u.damage / (u.interval || 1);
const copy = (x) => JSON.parse(JSON.stringify(x ?? []));

/**
 * 같은 강인데 이야기 조합이 없는 짝마다 자동 키메라 레시피를 만듦.
 * 힘이 센 쪽(look)의 모습·역할을 따르고, 다른 쪽 기본기 하나를 얹음.
 */
export function autoRecipes(units, recipes, config) {
  const g = config?.genes;
  if (!g) return [];
  const have = new Set(recipes.map((r) => pairKey(r.parts[0], r.parts[1])));
  const out = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j], key = pairKey(a.id, b.id);
      if (have.has(key) || !g.cls?.[a.id] || !g.cls?.[b.id]) continue;
      const cross = g.cls[a.id] !== g.cls[b.id];
      const [lead, side] = power(a) >= power(b) ? [a, b] : [b, a];
      // 강이 다른 짝 = 기적의 키메라(이종). 전설 이름이 있으면 그 이름, 없으면 두 이름을 붙임
      const nm = cross ? (g.legends?.[key] ?? [lead.name + side.name, `기적처럼 태어난 ${lead.name}와 ${side.name}.`]) : (g.names?.[key] ?? [lead.name + side.name, '두 동물이 섞인 모습.']);
      out.push({
        id: 'auto_' + key.replace('+', '_'), name: nm[0], parts: key.split('+'), role: lead.role,
        damage: Math.round(((a.damage + b.damage) / 2) * 1.15 * 10) / 10, interval: Math.min(a.interval, b.interval), range: lead.range,
        aoeRadius: Math.max(a.aoeRadius ?? 0, b.aoeRadius ?? 0), block: null,
        effects: [...copy(lead.baseSkill), ...(cross ? copy(side.baseSkill) : copy(side.baseSkill).slice(0, 1))],
        desc: `${lead.baseSkillDesc} · ${side.baseSkillDesc}`, source: nm[2] ?? '염색체 합성',
        color: mix(lead.color, side.color, 0.35), image: null, codex: nm[1], flyer: !!(a.flyer && b.flyer), element: lead.element ?? null,
        auto: true, look: lead.id, tintOf: side.id, cross, legend: !!(cross && g.legends?.[key]),
      });
    }
  }
  return out;
}

/** 기적 확률(강이 다를 때, %): base + 염색체가 비슷한 만큼, 이야기 조합 +story, 인연 발견 +bond */
export function miracleChance(a, b, data, seenBonds = null) {
  const g = genesOf(data), m = g?.miracle;
  if (!m) return 0;
  const d = Math.abs((g.chromo?.[a] ?? 0) - (g.chromo?.[b] ?? 0));
  let c = m.base + Math.max(0, ((m.span - d) / m.span) * (m.max - m.base));
  const r = data.recipeByPair?.[a < b ? `${a}+${b}` : `${b}+${a}`];
  if (r && (r.legend || !r.auto)) c += m.story;
  if (seenBonds && data.lore?.bonds?.some((x) => x.pair.includes(a) && x.pair.includes(b) && (seenBonds.has?.(x.id) || seenBonds.includes?.(x.id)))) c += m.bond;
  return Math.round(c);
}

/** 합성 성공 확률의 바탕(%): 같은 강 = 염색체, 다른 강 = 기적 */
export function baseChance(a, b, data, seenBonds = null) {
  if (!genesOf(data)) return 100;
  return sameClass(a, b, data) ? geneChance(a, b, data) : miracleChance(a, b, data, seenBonds);
}

/**
 * 판 상태에서 모은 도움(유전자 물약 · 괴짜 박사의 노트 · 신화급 출전 · 보름달 · 실패 눈금).
 * ctx = { potion, relicCross, myth, moon, pity: { [pair]: 실패 수 }, seenBonds }
 */
export function chanceWith(a, b, data, ctx = {}, extra = { mult: 1, add: 0 }) {
  const g = genesOf(data), m = g?.miracle ?? {};
  const key = a < b ? `${a}+${b}` : `${b}+${a}`;
  const cross = !!g && !sameClass(a, b, data);
  const base = baseChance(a, b, data, ctx.seenBonds);
  let c = base * (extra.mult ?? 1) + (extra.add ?? 0);
  if (extra.mult > 1 || extra.add) c = Math.min(m.slimeCap ?? 95, c);
  const bonus = [];
  if (ctx.potion) { c += m.potion ?? 0; bonus.push('🧪'); }
  if (cross && ctx.relicCross) { c += ctx.relicCross; bonus.push('📓'); }
  if (ctx.myth) { c += m.myth ?? 0; bonus.push('🌟'); }
  if (ctx.moon) { c += m.moon ?? 0; bonus.push('🌕'); }
  const fails = ctx.pity?.[key] ?? 0, sure = !!m.pity && fails >= m.pity;
  return { chance: sure ? 100 : Math.max(0, Math.min(100, Math.round(c))), base, cross, key, fails, pity: m.pity ?? 0, sure, bonus };
}

/** 판 상태에서 합성 도움 모으기(battle.merge·미리보기 공용) */
export function geneCtx(state, data) {
  return {
    potion: (state.genePotion ?? 0) > 0, relicCross: eco(state, data, 'crossGene') ?? 0,
    myth: (state.field ?? []).some((u) => u && u.kind === 'base' && u.stage === 'spirit' && !u.down && !u.resting),
    moon: !!state.moonNow, pity: state.genePity ?? {}, seenBonds: state.seenBonds ?? null,
  };
}

/** Tint for an auto chimera drawn with its lead animal's dots: the other parent's color washed toward white. */
export function autoTint(r, data) {
  const side = data.unitById?.[r.tintOf];
  return hexOf(mix(side?.color ?? '#ffffff', '#ffffff', 0.45));
}

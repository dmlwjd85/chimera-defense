// 염색체 합성(2026-11-27): 같은 강(포유류·조류·곤충·양서류·파충류)끼리만 키메라가 되고,
// 성공 확률은 두 동물의 염색체 수(2n) 차이로 정해짐. 실패하거나 강이 다르면 돌연변이 슬라임.
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
      if (have.has(key) || !g.cls?.[a.id] || g.cls[a.id] !== g.cls[b.id]) continue;
      const [lead, side] = power(a) >= power(b) ? [a, b] : [b, a];
      const nm = g.names?.[key] ?? [lead.name + side.name, '두 동물이 섞인 모습.'];
      out.push({
        id: 'auto_' + key.replace('+', '_'), name: nm[0], parts: key.split('+'), role: lead.role,
        damage: Math.round(((a.damage + b.damage) / 2) * 1.15 * 10) / 10, interval: Math.min(a.interval, b.interval), range: lead.range,
        aoeRadius: Math.max(a.aoeRadius ?? 0, b.aoeRadius ?? 0), block: null,
        effects: [...copy(lead.baseSkill), ...copy(side.baseSkill).slice(0, 1)],
        desc: `${lead.baseSkillDesc} · ${side.baseSkillDesc}`, source: nm[2] ?? '염색체 합성',
        color: mix(lead.color, side.color, 0.35), image: null, codex: nm[1], flyer: !!(a.flyer && b.flyer), element: lead.element ?? null,
        auto: true, look: lead.id, tintOf: side.id,
      });
    }
  }
  return out;
}

/** Tint for an auto chimera drawn with its lead animal's dots: the other parent's color washed toward white. */
export function autoTint(r, data) {
  const side = data.unitById?.[r.tintOf];
  return hexOf(mix(side?.color ?? '#ffffff', '#ffffff', 0.45));
}

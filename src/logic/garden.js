// 무릉도원(2026-11-27 사용자 "무릉도원 꾸미기 기능 — 도감에서 캐릭터 골라서 아름다운 동산에 걸어다니고 움직이는 장면, 처음엔 1마리만, 해금하면 10마리까지")
// 칸 해금 = 별점 합계(사용자 선택). 쓰다듬기 = 하트 + 그 종 경험 조금(하루 한도). 소품 = 끌어 놓기.
import { totalStars } from './meta.js';

export const GARDEN_PROPS = ['pavilion', 'peach', 'pond', 'lantern', 'flowers', 'bridge'];
export const PROP_NAME = { pavilion: '정자', peach: '복숭아나무', pond: '연못', lantern: '석등', flowers: '꽃밭', bridge: '돌다리' };

export const gcfgGarden = (data) => ({ starsPerSlot: 3, maxSlots: 10, maxProps: 12, petXp: 1, petDaily: 10, ...(data?.config?.garden ?? {}) });

/** 동산에 둘 수 있는 동물 수: 처음 1마리, 별 starsPerSlot개마다 +1, 최대 maxSlots */
export function gardenSlots(save, data) {
  const g = gcfgGarden(data);
  return Math.min(g.maxSlots, 1 + Math.floor(totalStars(save) / g.starsPerSlot));
}
/** 다음 칸까지 남은 별(다 열렸으면 0) */
export function starsToNextSlot(save, data) {
  const g = gcfgGarden(data), n = gardenSlots(save, data);
  if (n >= g.maxSlots) return 0;
  return n * g.starsPerSlot - totalStars(save);
}

/** 저장 칸 정리(없으면 만들고, 이상한 값은 버림) */
export function gardenOf(save) {
  const g = (save.garden ??= {});
  g.animals = Array.isArray(g.animals) ? g.animals.filter((a) => a && typeof a.id === 'string' && typeof a.stage === 'string') : [];
  g.props = Array.isArray(g.props) ? g.props.filter((p) => p && GARDEN_PROPS.includes(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  g.pets ??= {};
  return g;
}

/** 도감에서 고를 수 있는 동물: 만난 종(어린·성장기·성체), 신화급을 만났으면 신화급, 만든 키메라 */
export function gardenChoices(save, data, hasArt = () => true) {
  const c = save.codex ?? {};
  const out = [];
  for (const u of data.units ?? []) {
    if (!(c.units ?? []).includes(u.id)) continue;
    for (const stage of ['young', 'teen', 'adult']) if (hasArt(u.id, stage)) out.push({ id: u.id, stage, kind: 'base', name: `${{ young: '어린', teen: '성장기', adult: '성체' }[stage]} ${u.name}` });
    if ((c.spirits ?? []).includes(u.id) && hasArt(u.id, 'spirit')) out.push({ id: u.id, stage: 'spirit', kind: 'base', name: u.stageNames?.spirit ?? `신화급 ${u.name}` });
  }
  for (const id of c.recipes ?? []) {
    const r = data.recipeById?.[id];
    if (r && hasArt(id, 'adult')) out.push({ id, stage: 'adult', kind: 'chimera', name: r.name, parts: [...(r.parts ?? [])] });
  }
  return out;
}

export function addGardenAnimal(save, data, choice) {
  const g = gardenOf(save);
  if (g.animals.length >= gardenSlots(save, data)) return { ok: false, reason: 'full' };
  g.animals.push({ id: choice.id, stage: choice.stage, kind: choice.kind ?? 'base', parts: choice.parts ?? null, key: `${choice.id}|${choice.stage}|${Date.now() % 1e7}|${g.animals.length}` });
  return { ok: true, animal: g.animals[g.animals.length - 1] };
}
export function removeGardenAnimal(save, key) {
  const g = gardenOf(save), i = g.animals.findIndex((a) => a.key === key);
  if (i < 0) return { ok: false };
  g.animals.splice(i, 1);
  return { ok: true };
}

export function addProp(save, data, id, x, y) {
  const g = gardenOf(save);
  if (!GARDEN_PROPS.includes(id)) return { ok: false, reason: 'unknown' };
  if (g.props.length >= gcfgGarden(data).maxProps) return { ok: false, reason: 'full' };
  g.props.push({ id, x: Math.round(x), y: Math.round(y) });
  return { ok: true, index: g.props.length - 1 };
}
export function moveProp(save, i, x, y) { const p = gardenOf(save).props[i]; if (!p) return false; p.x = Math.round(x); p.y = Math.round(y); return true; }
export function removeProp(save, i) { const g = gardenOf(save); if (!g.props[i]) return false; g.props.splice(i, 1); return true; }

/** 쓰다듬기: 그 종 경험 +petXp(하루 petDaily번까지, 키메라는 첫 부위 종). 반환 { ok, gained, left } */
export function petAnimal(save, data, animal, today = new Date().toISOString().slice(0, 10)) {
  const g = gardenOf(save), cfg = gcfgGarden(data);
  const sp = animal.kind === 'chimera' ? animal.parts?.[0] : animal.id;
  if (g.petDay !== today) { g.petDay = today; g.pets = {}; }
  const n = g.pets[sp] ?? 0;
  if (!sp || !data.unitById?.[sp] || n >= cfg.petDaily) return { ok: true, gained: 0, left: 0 };
  g.pets[sp] = n + 1;
  save.speciesXp ??= {};
  save.speciesXp[sp] = (save.speciesXp[sp] ?? 0) + cfg.petXp;
  return { ok: true, gained: cfg.petXp, left: cfg.petDaily - n - 1 };
}

// 동산 술래잡기 짝(장난으로 쫓고 쫓김, 다치지 않음)
const CHASE = { wolf: ['rabbit', 'bighorn'], fox: ['rooster', 'rabbit'], tiger: ['bighorn', 'bison'], eagle: ['rabbit', 'monkey'], frog: ['grasshopper', 'ant'], rooster: ['grasshopper', 'ant'], dog: ['crow', 'rooster'], bear: ['monkey'] };

/** 두 동물이 만났을 때: same(같은 종 장난) · chase(먹이사슬: a가 b를 쫓음) · flee(b가 a를 쫓음) · greet(인사) */
export function meetKind(a, b, data) {
  const sa = a.kind === 'chimera' ? a.parts?.[0] : a.id, sb = b.kind === 'chimera' ? b.parts?.[0] : b.id;
  if (sa && sa === sb) return 'same';
  const eats = (x, y) => (CHASE[x] ?? []).includes(y);
  if (eats(sa, sb)) return 'chase';
  if (eats(sb, sa)) return 'flee';
  return 'greet';
}

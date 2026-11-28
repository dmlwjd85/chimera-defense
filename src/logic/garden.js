// 무릉도원(2026-11-27 사용자 "무릉도원 꾸미기 기능 — 도감에서 캐릭터 골라서 아름다운 동산에 걸어다니고 움직이는 장면, 처음엔 1마리만, 해금하면 10마리까지")
// 칸 해금 = 별점 합계(사용자 선택). 쓰다듬기 = 하트 + 그 종 경험 조금(하루 한도). 소품 = 끌어 놓기.
import { totalStars } from './meta.js';

// 소품(2026-11-28 사용자 "새는 나무 위에 앉을 수 있게 · 연못에 들어간다던가 오브젝트랑 상호작용 가능한 걸로 몇 개 더 추가하고 기존 오브젝트도 기존 그림들 활용해서"):
// 뒤 다섯 개(북·종·샘물·둥지·먹이 자루)는 새로 그리지 않고 이미 있는 유물 그림을 그대로 씀.
export const GARDEN_PROPS = ['pavilion', 'peach', 'pond', 'lantern', 'flowers', 'bridge', 'drum', 'bell', 'fountain', 'nest', 'feed'];
export const PROP_NAME = { pavilion: '정자', peach: '복숭아나무', pond: '연못', lantern: '석등', flowers: '꽃밭', bridge: '돌다리', drum: '북', bell: '종', fountain: '샘물', nest: '둥지', feed: '먹이 자루' };
/** 소품 그림 열쇠(manifest.json) */
export const PROP_ART = { pavilion: 'garden-pavilion', peach: 'garden-peach', pond: 'garden-pond', lantern: 'garden-lantern', flowers: 'garden-flowers', bridge: 'garden-bridge',
  drum: 'relic-war_drum', bell: 'relic-sentry_bell', fountain: 'relic-mana_spring', nest: 'relic-twin_egg', feed: 'relic-feed_bag' };

// 동물 무리(키메라는 첫 부위 종): 새는 높은 데 앉고, 원숭이는 나무를 타고, 물을 좋아하는 동물은 연못에 들어가고, 풀 먹는 동물은 꽃밭을 뜯고, 덩치는 나무를 들이받음
const GROUP = {
  bird: ['crow', 'eagle', 'rooster'], climb: ['monkey'],
  water: ['frog', 'dog', 'bear', 'tiger', 'bison'],
  graze: ['rabbit', 'bighorn', 'bison', 'grasshopper', 'ant'],
  big: ['bear', 'bison', 'bighorn', 'tiger'],
};
export const speciesOf = (a) => (a?.kind === 'chimera' ? a.parts?.[0] : a?.id);
export const inGroup = (a, g) => (GROUP[g] ?? []).includes(speciesOf(a));

/** 소품마다 할 수 있는 행동: act(장면이 그리는 이름) · who(이 무리만, 없으면 누구나) · w(고를 무게) · max(한꺼번에 몇 마리, 기본 2) */
export const PROP_ACTS = {
  peach: [{ act: 'perch', who: ['bird', 'climb'], w: 6, max: 3 }, { act: 'shake', who: ['big'], w: 3, max: 1 }, { act: 'nap', w: 2 }],
  pond: [{ act: 'swim', who: ['water'], w: 6, max: 1 }, { act: 'drink', w: 3, max: 1 }],
  pavilion: [{ act: 'perch', who: ['bird'], w: 3, max: 1 }, { act: 'rest', w: 4, max: 1 }],
  lantern: [{ act: 'perch', who: ['bird'], w: 3, max: 1 }, { act: 'warm', w: 3 }],
  flowers: [{ act: 'graze', who: ['graze'], w: 5 }, { act: 'sniff', w: 3 }],
  bridge: [{ act: 'perch', who: ['bird'], w: 3, max: 1 }, { act: 'cross', w: 5 }],
  drum: [{ act: 'play', w: 4, max: 1 }],
  bell: [{ act: 'ring', w: 3, max: 1 }],
  fountain: [{ act: 'perch', who: ['bird'], w: 3, max: 1 }, { act: 'drink', w: 4 }],
  nest: [{ act: 'brood', who: ['bird'], w: 7, max: 1 }, { act: 'peek', w: 2 }],
  feed: [{ act: 'eat', w: 5 }],
};
/** 그 동물이 그 소품에서 할 수 있는 행동 목록 */
export function propActsFor(animal, propId) {
  return (PROP_ACTS[propId] ?? []).filter((a) => !a.who || a.who.some((g) => inGroup(animal, g)));
}
/** 무게대로 하나 고름. free(행동 정보) = 자리가 남았는가(없으면 다 됨). 할 게 없으면 null */
export function pickPropAct(animal, propId, rnd = Math.random, free = () => true) {
  const list = propActsFor(animal, propId).filter((a) => free(a));
  const total = list.reduce((n, a) => n + a.w, 0);
  if (!total) return null;
  let t = rnd() * total;
  for (const a of list) if ((t -= a.w) < 0) return a;
  return list[list.length - 1];
}

export const gcfgGarden = (data) => ({ starsPerSlot: 3, maxSlots: 10, maxProps: 16, petXp: 1, petDaily: 10, propChance: 0.35, ...(data?.config?.garden ?? {}) });

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

/**
 * 종을 치면 모일 자리(2026-11-28): 종을 가운데 두고 양옆·뒤·앞에 둘러섬.
 * 종 바로 앞뒤(종을 가리는 곳)와 풀밭 밖은 비움. 가까운 자리부터 좌우 짝으로 채움.
 * 좌표는 동물 몸 가운데(발은 그보다 30쯤 아래) 기준.
 */
const GATHER_AT = [[140, -5], [70, -100], [105, 80], [205, 38], [192, -112], [262, -28], [300, 72], [140, -185], [330, -120], [384, -10], [262, -190]];
export function gatherSlots(n, bx, by, ground) {
  const out = [];
  for (const [dx, dy] of GATHER_AT) for (const sx of [-1, 1]) {
    if (out.length >= n) break;
    const x = bx + sx * dx, y = by + dy;
    if (x < ground.x0 + 20 || x > ground.x1 - 20 || y < ground.y0 || y > ground.y1) continue;
    out.push([x, y]);
  }
  // 구석이라 자리가 모자라면: 풀밭 격자에서 종에 가까운 빈자리부터 채움
  if (out.length < n) {
    const grid = [];
    for (let x = ground.x0 + 20; x <= ground.x1 - 20; x += 56) for (let y = ground.y0; y <= ground.y1; y += 40) grid.push([x, y]);
    grid.sort((p, q) => Math.hypot(p[0] - bx, p[1] - by) - Math.hypot(q[0] - bx, q[1] - by));
    for (const g of grid) {
      if (out.length >= n) break;
      if (Math.hypot(g[0] - bx, g[1] - by) < 90 || (Math.abs(g[0] - bx) < 70 && g[1] > by - 20)) continue;
      if (out.some((o) => Math.hypot(o[0] - g[0], o[1] - g[1]) < 60)) continue;
      out.push(g);
    }
  }
  return out;
}

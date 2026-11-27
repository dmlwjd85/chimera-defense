// 스킬 이펙트 계획(순수 함수, 시험 가능). 값은 public/data/skillfx.json 한 곳에 둠.
// 장면(src/scenes/skillfx.js)은 여기서 받은 계획대로 도트 입자·모양을 그리기만 함.

export const RELEASES = ['quake', 'stampede', 'guardHeal', 'swarm', 'rain', 'roar', 'wisps', 'moon', 'dawn', 'feathers', 'howl', 'skybolt', 'wall', 'notes', 'clones', 'slam', 'pillar'];

/** '#rrggbb' → 0xrrggbb */
export const hex = (s) => (typeof s === 'number' ? s : parseInt(String(s).replace('#', ''), 16) || 0);

/** 일반·신화급·키메라 */
export function tierOf(u) {
  if (!u) return 'normal';
  if (u.kind === 'chimera') return 'chimera';
  if (u.stage === 'spirit') return 'myth';
  return 'normal';
}

/** 종의 속성 공격 색(여우는 여우불 등) */
export function elementTheme(cfg, speciesId, element) {
  return cfg?.speciesElement?.[speciesId] ?? cfg?.elements?.[element] ?? 'light';
}

/**
 * 한 번의 기술을 어떻게 보일지.
 * info = { u, move: 'ult'|'skill'|'el', kind (필살기 종), name (기술 이름), action, el, units (종 표) }
 * 반환 null 이면 꾸미지 않음(꺼짐·일반 동물의 속성 공격 등).
 */
export function planFx(cfg, info) {
  if (!cfg || cfg.enabled === false || !info?.u) return null;
  const u = info.u, move = info.move, tier = tierOf(u);
  // 일반 동물의 속성 공격은 예전 그대로(신화급·키메라만 화려하게)
  if (move === 'el' && tier === 'normal') return null;
  const T = cfg.tiers?.[tier] ?? cfg.tiers?.normal ?? {}, M = cfg.moves?.[move] ?? {};
  let spec;
  if (move === 'ult') spec = cfg.ults?.[info.kind] ?? cfg.ults?._default;
  else if (move === 'skill') spec = cfg.skills?.byName?.[info.name] ?? cfg.skills?.byAction?.[info.action] ?? { theme: 'light', release: 'slam' };
  else if (move === 'el') {
    const sp = u.kind === 'chimera' ? (u.parts ?? [])[0] : u.speciesId;
    spec = { theme: elementTheme(cfg, sp, info.el ?? u.stats?.element), release: ELEMENT_RELEASE[info.el] ?? 'slam' };
  }
  if (!spec) return null;
  const release = RELEASES.includes(spec.release) ? spec.release : 'slam';
  const theme = cfg.themes?.[spec.theme] ? spec.theme : 'light';
  // 키메라: 둘째 부위의 색을 섞어 반짝임(두 동물이 함께 싸우는 맛)
  let theme2 = null;
  if (T.dual && u.kind === 'chimera') {
    const parts = u.parts ?? [];
    const other = parts.find((p) => p !== info.kind) ?? parts[1];
    const el = other ? info.units?.[other]?.element : null;
    const t2 = other ? elementTheme(cfg, other, el) : null;
    theme2 = t2 && t2 !== theme && cfg.themes?.[t2] ? t2 : null;
  }
  const mul = (a, b) => (a ?? 0) * (b ?? 1);
  return {
    tier, move, theme, theme2, release,
    word: spec.word ?? null,
    count: Math.max(1, Math.round((spec.count ?? 6) * (tier === 'normal' ? 0.6 : 1))),
    aura: spec.aura && cfg.themes?.[spec.aura] ? spec.aura : null,
    scale: T.scale ?? 2,
    particles: mul(T.particles ?? 1, M.particles),
    charge: Math.round((T.charge ?? 200) * (M.charge ?? 1)),
    shake: cfg.shake === false ? 0 : mul(T.shake, M.shake),
    flash: cfg.flash === false ? 0 : mul(T.flash, M.flash),
    hitStop: cfg.hitStop === false ? 0 : mul(T.hitStop, M.hitStop),
    ring: T.ring ?? 1,
    number: T.number ?? 1,
    banner: !!M.banner,
    travel: cfg.releases?.[release]?.travel ?? 200,
  };
}

const ELEMENT_RELEASE = { fire: 'pillar', water: 'rain', wind: 'clones', earth: 'quake', thunder: 'skybolt', moon: 'moon', grass: 'swarm', light: 'dawn' };

/** 입자 상한: 이미 살아 있는 입자(alive)가 많으면 새로 뿌릴 수를 줄임 */
export function budget(alive, cap, n) {
  if (!(cap > 0)) return n;
  if (alive >= cap) return 0;
  const room = cap - alive;
  const k = alive > cap * 0.6 ? room / (cap * 0.4) : 1;
  return Math.max(0, Math.min(room, Math.round(n * k)));
}

/** 화려한 연출을 할지(동시에 maxFull개 넘으면 가벼운 연출) */
export const fullOk = (active, cfg) => active < (cfg?.limits?.maxFull ?? 3);

/** 흔들림·섬광 허용(설정 + 저장소 chimera-shake=0 + 기기 동작 줄이기) */
export function motionOk(cfg, stored, reduced) {
  if (cfg?.shake === false) return false;
  if (stored === '0') return false;
  return !reduced;
}

/** 반복 피로 줄이기: 같은 동물·같은 기술을 window 안에 또 쓰면 짧고 가볍게(처음 한 번만 화려하게). last = 그 동물이 마지막으로 쓴 시각(ms) */
export function damp(plan, cfg, last, now) {
  const R = cfg?.repeat;
  if (!plan || !R || last == null || now - last > (R.window ?? 12000)) return plan;
  return { ...plan, repeat: true, charge: Math.round(plan.charge * (R.charge ?? 0.5)), particles: plan.particles * (R.particles ?? 0.6), shake: plan.shake * (R.shake ?? 0.4), hitStop: plan.hitStop * (R.hitStop ?? 0.5), flash: plan.flash * (R.flash ?? 0), word: R.word === false ? null : plan.word, banner: R.banner === false ? false : plan.banner };
}

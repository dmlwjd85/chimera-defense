// 덱 대결(1안, 2026-11-27): 내 대표 덱을 짧은 코드로 나누고, 친구 덱 코드를 넣으면 그 덱(컴퓨터가 움직임)과 3판 2선승으로 싸움.
// 서버 없이 코드만 주고받음. 덱은 싱글 스토리에서 해금한 동물만, 출전 단계는 종 레벨(성장기까지)만큼.
import { previewStats, baseStyle, BUILDS, SEATS, seatOrder } from './gauntlet.js';
import { levelsOf, rosterPool } from './meta.js';
import { deckOf } from './soul.js';

const ABC = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // 헷갈리는 I·O 뺌
const STAGES = ['young', 'teen'];
const BUILD_KEYS = [null, ...Object.keys(BUILDS)];
export const PLANS = ['front', 'hunt', 'guard'];
export const PLAN_LABEL = { front: '💪 앞싸움', hunt: '🎯 노리기', guard: '🛡 지키기' };
export const DUEL = { hpMul: 6, cpuBonus: 1.6, rounds: 3, need: 2 };   // cpuBonus: 컴퓨터가 움직이는 친구 덱 보정(같은 덱끼리 봇 승률 약 50%)

/** 내 대표 덱: 해금한 동물 중 덱 6마리(부족하면 해금 목록에서 채움), 단계는 레벨 기준(성장기까지), 고급 빌드 반영 */
export function myDuelDeck(save, data) {
  const open = rosterPool(save, data) ?? data.units.map((u) => u.id);
  const ids = deckOf(save, data, open).filter((id) => open.includes(id));
  for (const id of open) if (ids.length < 6 && !ids.includes(id)) ids.push(id);
  const lv = levelsOf(save, data), teenAt = data.config.gauntlet?.growLv?.teen ?? 4;
  return ids.slice(0, 6).map((id) => ({ id, stage: (lv[id] ?? 1) >= teenAt ? 'teen' : 'young', build: save.advanced ? save.builds?.[id] ?? null : null }));
}

const sum = (s) => [...s].reduce((a, c) => a + ABC.indexOf(c) * 7 + 3, 0) % ABC.length;
/** 덱 → 코드(예: K1-0A2B-...). 해금 안 한 동물은 못 넣음 */
export function encodeDeck(deck, plan, data) {
  let body = 'K' + '1' + ABC[PLANS.indexOf(plan) < 0 ? 0 : PLANS.indexOf(plan)];
  for (const u of deck) {
    const si = data.units.findIndex((x) => x.id === u.id);
    if (si < 0) throw new Error('unknown animal ' + u.id);
    body += ABC[si] + ABC[Math.max(0, STAGES.indexOf(u.stage))] + ABC[Math.max(0, BUILD_KEYS.indexOf(u.build ?? null))];
  }
  body += ABC[sum(body)];
  return body.match(/.{1,4}/g).join('-');
}
/** 코드 → { deck, plan } 또는 { error } */
export function decodeDeck(code, data) {
  const s = String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length < 4 || s[0] !== 'K' || s[1] !== '1') return { error: '코드가 아니에요' };
  const body = s.slice(0, -1), chk = s.slice(-1);
  if (ABC[sum(body)] !== chk) return { error: '코드 글자가 하나 틀렸어요' };
  const plan = PLANS[ABC.indexOf(body[2])] ?? 'front';
  const deck = [];
  for (let i = 3; i + 2 < body.length + 0 && i + 2 <= body.length - 1 + 1; i += 3) {
    const u = data.units[ABC.indexOf(body[i])], st = STAGES[ABC.indexOf(body[i + 1])], b = BUILD_KEYS[ABC.indexOf(body[i + 2])];
    if (!u || !st || b === undefined) return { error: '모르는 동물이 들어 있어요' };
    deck.push({ id: u.id, stage: st, build: b });
  }
  if (deck.length < 3 || deck.length > 6) return { error: '동물 수가 맞지 않아요' };
  return { deck, plan };
}

/** 대결용 데이터: 친구 동물을 '적' 칸에 세우는 가짜 적 정의와 대결장 스테이지를 더한 사본 */
export function duelData(data, foe) {
  const g = data.config.gauntlet ?? {};
  const enemyById = { ...data.enemyById }, enemyRole = { ...(g.enemyRole ?? {}) };
  const ids = foe.deck.map((u, i) => {
    const id = `foe${i}_${u.id}`, a = data.unitById[u.id], p = previewStats(data, u.id, u.stage, u.build);
    const style = baseStyle({ kind: 'base', speciesId: u.id, stats: a, build: u.build });
    enemyById[id] = { id, name: a.name, animal: u.id, stage: u.stage, build: u.build, raw: true, hp: Math.round(p.hp * DUEL.hpMul * DUEL.cpuBonus), attack: Math.round(p.atk * DUEL.cpuBonus),
      interval: Math.round((1 / Math.max(0.1, p.spd)) * 100) / 100, speed: 1, gold: 0, leak: 1, flying: false, spawnCount: 1, blockSlots: 1,
      heal: style === 'support' ? { every: 3, percent: 6, radius: 3 } : null, boss: false, scaleWithWave: false, holdFactor: 1, slowFactor: 1, color: a.color, desc: '', codex: '' };
    enemyRole[id] = style;
    return id;
  });
  // 친구 덱의 자리: 추천 배치(브루저 1열·딜러 2열·응원 3열)
  const seats = {}; const used = new Set();
  for (const st of ['bruiser', 'support', 'ranged', 'skirm']) ids.forEach((id) => { if (enemyRole[id] !== st || seats[id] != null) return; const k = seatOrder(st).find((x) => !used.has(x)); used.add(k); seats[id] = k; });
  ids.forEach((id) => { if (seats[id] == null) { const k = [...Array(SEATS).keys()].find((x) => !used.has(x)); used.add(k); seats[id] = k; } });
  const arena = { id: 'arena', name: '⚔ 덱 대결', mult: 1, zones: ['plains', 'forest', 'village'], climate: 'clear', par: 600, art: 'forest-1', waves: [{ mix: {}, extra: [] }], boss: null };
  const plan = Array.from({ length: DUEL.rounds }, () => ({ ids: [...ids], wave: 1, boss: false, seats }));
  return {
    data: { ...data, enemyById, stageById: { ...data.stageById, arena }, config: { ...data.config, gauntlet: { ...g, enemyRole, mvpGrow: false, enemyDivers: [...(g.enemyDivers ?? []), ...(foe.plan === 'hunt' ? ids.filter((id) => enemyRole[id] === 'skirm') : [])] } } },
    plan, foePlan: foe.plan,
  };
}

/** 친구 덱 이름(코드 앞자리로) */
export const foeLabel = (code) => `친구 덱 ${String(code).slice(0, 7)}`;

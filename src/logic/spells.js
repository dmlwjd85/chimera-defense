// 플레이어 마법: 마력을 모아 위기를 넘기는 공격·방어·서포트 주문. 대상은 스스로 고른다(한 번 누르면 끝).
import { damageEnemy } from './combat.js';
import { eco } from './relics.js';

/** Mana a spell costs after the magic talents. */
export const spellCost = (state, data, def) => Math.max(1, Math.round(def.cost * (1 - (eco(state, data, 'spellCost') ?? 0) / 100)));
const power = (state, data) => 1 + (eco(state, data, 'spellPower') ?? 0) / 100;

/** Spells the save has opened: the starter plus one per cleared stage (config.spells.list[].stage). */
export function spellsUnlocked(save, data) {
  const list = data.config.spells?.list ?? [];
  return list.filter((s) => !s.stage || save.stages?.[s.stage]?.cleared).map((s) => s.id);
}

export const spellDef = (data, id) => (data.config.spells?.list ?? []).find((s) => s.id === id) ?? null;

/** Mana trickles in while a wave is running. */
export function tickMana(state, data, dt) {
  const m = data.config.spells;
  if (!m || !state.spells?.length) return;
  state.mana = Math.min(m.max, (state.mana ?? 0) + m.regen * (1 + ((eco(state, data, 'manaRegen') ?? 0) + (state.field?.some((u) => u.soul && !u.down) && data.config.soul?.sig?.[state.soul?.id]?.type === 'mana' ? data.config.soul.sig[state.soul.id].p.regen : 0)) / 100) * dt);
  if (state.spellCd > 0) state.spellCd -= dt;
}

/** Why a spell cannot be cast right now, or null. */
export function spellBlock(state, data, id) {
  const def = spellDef(data, id);
  if (!def || !state.spells?.includes(id)) return 'locked';
  if (state.phase !== 'wave') return 'noWave';
  if ((state.spellCd ?? 0) > 0) return 'cooldown';
  if ((state.mana ?? 0) < spellCost(state, data, def)) return 'mana';
  if (def.needsEnemy && !state.enemies.some((e) => e.hp > 0)) return 'noTarget';
  return null;
}

const alive = (state) => state.enemies.filter((e) => e.hp > 0);
const pct = (e, def, P) => e.maxHp * Math.min(90, (e.boss ? def.bossPct : def.pct) * P) / 100;

/** Cast a spell. Returns { ok, reason }. */
export function castSpell(state, data, id) {
  const reason = spellBlock(state, data, id);
  if (reason) return { ok: false, reason };
  const def = spellDef(data, id), cfg = data.config, P = power(state, data);
  const es = alive(state);
  const ev = { type: 'spell', id, eids: [], pos: null };
  switch (def.effect) {
    case 'meteor': { // the most crowded spot
      let best = es[0], n = -1;
      for (const c of es) { const k = es.filter((e) => Math.abs(e.pos - c.pos) <= def.radius).length; if (k > n) { n = k; best = c; } }
      ev.pos = best.pos;
      for (const e of es) if (Math.abs(e.pos - best.pos) <= def.radius) { damageEnemy(state, e, pct(e, def, P), true); ev.eids.push(e.eid); }
      break;
    }
    case 'chain': { // the ones closest to the gate, flyers too
      for (const e of [...es].sort((a, b) => a.pos - b.pos).slice(0, def.count)) { damageEnemy(state, e, pct(e, def, P), true); ev.eids.push(e.eid); }
      break;
    }
    case 'wall': { // roots the front of the ground pack
      const ground = es.filter((e) => !e.flying).sort((a, b) => a.pos - b.pos);
      const front = ground[0] ?? es[0];
      ev.pos = front.pos;
      for (const e of ground) if (e.pos - front.pos <= def.radius) {
        if (e.boss) e.stunLeft = Math.max(e.stunLeft, def.bossStun * P); else e.holdLeft = Math.max(e.holdLeft, def.hold * P);
        ev.eids.push(e.eid);
      }
      break;
    }
    case 'guard': {
      for (const u of state.field) {
        if (u.down) { u.respawnLeft = Math.min(u.respawnLeft, 0.05); continue; }
        const max = u.maxHp ?? u.stats.hp;
        u.hp = Math.min(max, u.hp + max * def.heal * P / 100);
      }
      state.allyBuffs.push({ stat: 'taken', percent: -def.shield, left: def.dur * P, src: null });
      break;
    }
    case 'drum':
      state.allyBuffs.push({ stat: 'interval', percent: -def.haste, left: def.dur * P, src: null }, { stat: 'dmg', percent: def.dmg, left: def.dur * P, src: null });
      break;
    case 'hourglass':
      for (const e of es) { e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, def.slow); e.slowLeft = Math.max(e.slowLeft, def.dur * P); ev.eids.push(e.eid); }
      break;
    case 'gust':
      for (const e of es) { e.pos = Math.min(cfg.pathLength, e.pos + (e.boss ? def.bossPush : def.push) * P); e.blockedBy = null; ev.eids.push(e.eid); }
      break;
    default: return { ok: false, reason: 'locked' };
  }
  state.mana -= spellCost(state, data, def);
  state.spellCd = cfg.spells.globalCd;
  state.spellCasts = (state.spellCasts ?? 0) + 1;
  state.events.push(ev);
  return { ok: true };
}

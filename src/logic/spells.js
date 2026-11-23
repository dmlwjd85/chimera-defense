// 플레이어 마법: 마력을 모아 위기를 넘기는 공격·방어·서포트 주문. 대상은 스스로 고른다(한 번 누르면 끝).
import { damageEnemy } from './combat.js';

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
  state.mana = Math.min(m.max, (state.mana ?? 0) + m.regen * dt);
  if (state.spellCd > 0) state.spellCd -= dt;
}

/** Why a spell cannot be cast right now, or null. */
export function spellBlock(state, data, id) {
  const def = spellDef(data, id);
  if (!def || !state.spells?.includes(id)) return 'locked';
  if (state.phase !== 'wave') return 'noWave';
  if ((state.spellCd ?? 0) > 0) return 'cooldown';
  if ((state.mana ?? 0) < def.cost) return 'mana';
  if (def.needsEnemy && !state.enemies.some((e) => e.hp > 0)) return 'noTarget';
  return null;
}

const alive = (state) => state.enemies.filter((e) => e.hp > 0);
const pct = (e, def) => e.maxHp * (e.boss ? def.bossPct : def.pct) / 100;

/** Cast a spell. Returns { ok, reason }. */
export function castSpell(state, data, id) {
  const reason = spellBlock(state, data, id);
  if (reason) return { ok: false, reason };
  const def = spellDef(data, id), cfg = data.config;
  const es = alive(state);
  const ev = { type: 'spell', id, eids: [], pos: null };
  switch (def.effect) {
    case 'meteor': { // the most crowded spot
      let best = es[0], n = -1;
      for (const c of es) { const k = es.filter((e) => Math.abs(e.pos - c.pos) <= def.radius).length; if (k > n) { n = k; best = c; } }
      ev.pos = best.pos;
      for (const e of es) if (Math.abs(e.pos - best.pos) <= def.radius) { damageEnemy(state, e, pct(e, def), true); ev.eids.push(e.eid); }
      break;
    }
    case 'chain': { // the ones closest to the gate, flyers too
      for (const e of [...es].sort((a, b) => a.pos - b.pos).slice(0, def.count)) { damageEnemy(state, e, pct(e, def), true); ev.eids.push(e.eid); }
      break;
    }
    case 'wall': { // roots the front of the ground pack
      const ground = es.filter((e) => !e.flying).sort((a, b) => a.pos - b.pos);
      const front = ground[0] ?? es[0];
      ev.pos = front.pos;
      for (const e of ground) if (e.pos - front.pos <= def.radius) {
        if (e.boss) e.stunLeft = Math.max(e.stunLeft, def.bossStun); else e.holdLeft = Math.max(e.holdLeft, def.hold);
        ev.eids.push(e.eid);
      }
      break;
    }
    case 'guard': {
      for (const u of state.field) {
        if (u.down) { u.respawnLeft = Math.min(u.respawnLeft, 0.05); continue; }
        const max = u.maxHp ?? u.stats.hp;
        u.hp = Math.min(max, u.hp + max * def.heal / 100);
      }
      state.allyBuffs.push({ stat: 'taken', percent: -def.shield, left: def.dur, src: null });
      break;
    }
    case 'drum':
      state.allyBuffs.push({ stat: 'interval', percent: -def.haste, left: def.dur, src: null }, { stat: 'dmg', percent: def.dmg, left: def.dur, src: null });
      break;
    case 'hourglass':
      for (const e of es) { e.slowPct = Math.max(e.slowLeft > 0 ? e.slowPct : 0, def.slow); e.slowLeft = Math.max(e.slowLeft, def.dur); ev.eids.push(e.eid); }
      break;
    case 'gust':
      for (const e of es) { e.pos = Math.min(cfg.pathLength, e.pos + (e.boss ? def.bossPush : def.push)); e.blockedBy = null; ev.eids.push(e.eid); }
      break;
    default: return { ok: false, reason: 'locked' };
  }
  state.mana -= def.cost;
  state.spellCd = cfg.spells.globalCd;
  state.spellCasts = (state.spellCasts ?? 0) + 1;
  state.events.push(ev);
  return { ok: true };
}

// 보스 레이드 예고 연출(설계안 카드9·13). 엔진은 src/logic/raid.js, 글자는 text.json raid.* 에서만.
// 매 프레임 상태를 보고 다시 그림(따로 지울 것 없음): 보라/빨간 시전 막대(누르면 끊기) · 표식 고리 · 장판 · 보호막/껍질 고리 ·
// 독·저주 표시 · 결투 줄 · 광포화 시계. 사건(raid*)은 자막·배너로.
import { raidTap, bossCard } from '../logic/raid.js';
import { laneOf } from '../logic/gauntlet.js';
import { style, button } from './ui.js';
import { sfx } from './sfx.js';

const DEPTH = 1450;
// 시전 막대는 전장 글자·말풍선·'쾅!'(1700~1760)과 가운데 하늘 띠(midstage 1840)보다 위,
// 위 알림(1850)·필살기 컷(1900)·배너(2400)보다 아래(2026-11-28 선생님 "안가리게 해줘"). 판은 y 100 아래라 위쪽 HUD와 안 겹침
export const CAST_DEPTH = 1845;
const COL = { cast: 0x9b6cf0, hard: 0xff3b3b, mark: 0xff9f1a, zone: 0xff5a1f, shield: 0xd2b4ff, armor: 0xc08a4a, poison: 0x7bd36b, duel: 0xffe066 };

export class RaidFx {
  constructor(sc) {
    this.sc = sc;
    const dict = sc.cache.json.get('text') ?? {};
    this.T = sc.registry.get('T') ?? ((k, v = {}) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ''));
    this.g = sc.add.graphics().setDepth(DEPTH);
    this.gc = sc.add.graphics().setDepth(CAST_DEPTH);   // 시전 막대 판(이름·막대·끊기 점·안내를 한 판에)
    this.castRects = [];   // 시전 막대 판 자리(검수·겹침 재기용)
    this.labels = new Map();   // key → Text (다시 쓰고, 안 쓰이면 지움)
    this.used = new Set();
    this.hit = null;           // 시전 막대 누르는 자리
  }

  patName(ev) {
    const s = this.sc.state;
    const boss = ev.taste ? s.stage?.boss : ev.boss;
    return this.T(`raid.pat.${boss}.${ev.pid}`);
  }

  label(key, x, y, text, color = '#ffffff', size = 14, depth = DEPTH + 2) {
    this.used.add(key);
    let t = this.labels.get(key);
    if (!t) { t = this.sc.add.text(x, y, text, style(size, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(depth); this.labels.set(key, t); }
    t.setPosition(x, y); if (t.text !== text) t.setText(text); t.setColor(color);
    return t;
  }

  /** 매 프레임 */
  update() {
    const sc = this.sc, s = sc.state, g = this.g;
    g.clear(); this.gc.clear(); this.used.clear(); this.castRects = [];
    if (!s?.raidMarks || s.phase !== 'fight') { this.sweep(); return; }
    const now = s.time;
    let castBar = null;
    for (const e of s.enemies) {
      if (!(e.hp > 0) || !e.raid) continue;
      const v = sc.eViews.get(e.eid); if (!v) continue;
      const x = v.c.x, y = v.c.y, r = e.raid;
      // 보호막·껍질 고리
      if (r.shield) {
        g.lineStyle(4, COL.shield, 0.9).strokeEllipse(x, y - 30, 150, 170);
        const n = r.shield.mode === 'lanes' ? r.shield.lanes.size : r.shield.hit.size;
        this.label(`sh${e.eid}`, x, y - 128, `🛡 ${n}/${r.shield.need}${r.shield.mode === 'lanes' ? this.T('raid.lanes') : ''}`, '#e6d4ff');
      }
      if (r.armor) {
        g.lineStyle(5, COL.armor, 0.9).strokeEllipse(x, y - 25, 140, 150);
        if (r.armor.need) this.label(`ar${e.eid}`, x, y - 110, `🪨 ${r.armor.hits}/${r.armor.need}`, '#f0c890');
      }
      if (r.hide && now < r.hide) { g.fillStyle(0x3a2a1a, 0.55).fillEllipse(x, y + 30, 120, 30); this.label(`hd${e.eid}`, x, y - 60, '🕳', '#ffffff', 26); }
      // 시전 막대(보라 = 끊을 수 있음, 빨강 = 못 끊음): 기술 이름·막대·끊기 점·안내를 어두운 판 하나에 모아 맨 위 층에
      //  (2026-11-28 "안가리게": 이름 말풍선·'쾅!'·다른 말풍선이 막대를 덮지 않게. 이름은 판 안 막대 바로 위)
      if (r.cast) {
        const c = r.cast, k = Math.min(1, Math.max(0, 1 - (c.end - now) / c.len)), gc = this.gc;
        const can = c.need != null, dots = can ? c.need * 14 + 8 : 0;
        const pw = 206 + dots, ph = 84;
        const px = Math.max(8, Math.min(1272 - pw, x - pw / 2)), py = Math.max(100, y - 199);
        const bx = px + 10, by = py + 34, col = can ? COL.cast : COL.hard;
        gc.fillStyle(0x0b0816, 0.88).fillRoundedRect(px, py, pw, ph, 12);
        gc.lineStyle(2, col, 0.95).strokeRoundedRect(px, py, pw, ph, 12);
        gc.fillStyle(0x000000, 0.7).fillRoundedRect(bx - 3, by - 3, 186, 22, 8);
        gc.fillStyle(col, 1).fillRoundedRect(bx, by, 180 * k, 16, 6);
        gc.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(bx - 3, by - 3, 186, 22, 8);
        if (can) for (let i = 0; i < c.need; i++) gc.fillStyle(i < c.pts ? 0xffe066 : 0x333344, 1).fillCircle(bx + 186 + 10 + i * 14, by + 8, 5);
        const nm = this.label(`cn${e.eid}`, px + pw / 2, by - 16, `${this.patName({ boss: e.raid.minion ? s.stage?.boss : e.id, pid: c.pid, taste: c.taste })}${can ? '' : ' ⚠'}`, can ? '#e6d4ff' : '#ffb0a0', 16, CAST_DEPTH + 1);
        if (nm.width > pw - 16) nm.setScale((pw - 16) / nm.width); else if (!sc.tweens.isTweening(nm)) nm.setScale(1);
        this.label(`ch${e.eid}`, px + pw / 2, by + 34, can ? this.T('raid.cast.tap') : this.T('raid.cast.hard'), '#ffffff', 12, CAST_DEPTH + 1);
        this.castRects.push({ eid: e.eid, x: px, y: py, w: pw, h: ph });
        if (can) castBar = { x: px, y: py, w: pw, h: ph };
      }
      // 결투 줄
      if (r.duel) { const u = sc.uViews.get(r.duel.uid); if (u) { g.lineStyle(3, COL.duel, 0.8).lineBetween(x, y - 30, u.c.x, u.c.y - 30); this.label(`du${e.eid}`, (x + u.c.x) / 2, (y + u.c.y) / 2 - 40, '⚔', '#ffe066', 22); } }
      // 광포화 시계(보스 교전의 진짜 보스)
      const en = sc.D.raid?.common?.enrage;
      if (en && s.raidBoss === e.eid) {
        const left = Math.ceil(en.at - s.encTime);
        if (left <= 20 && left > 0) this.label('enr', 640, 200, this.T('raid.enrageTimer', { sec: left }), left <= 5 ? '#ff6b5a' : '#ffd84d', 16);
        else if (r.enrage > 0) this.label('enr', 640, 200, `😡 ×${r.enrage}`, '#ff6b5a', 16);
      }
    }
    // 표식: 우리 동물 발밑 주황 고리 + 줄어드는 안쪽 고리(남은 시간)
    for (const m of s.raidMarks) {
      const v = sc.uViews.get(m.uid); if (!v) continue;
      const k = Math.max(0, (m.at - now) / Math.max(0.1, m.at - (m.from ?? m.at - 2)));
      const shielded = (s.field.find((u) => u.uid === m.uid)?.shieldT ?? 0) > now;
      g.lineStyle(4, shielded ? 0x8fd3ff : COL.mark, 1).strokeEllipse(v.c.x, v.c.y + 34, 120, 38);
      g.fillStyle(shielded ? 0x8fd3ff : COL.mark, 0.25).fillEllipse(v.c.x, v.c.y + 34, 120 * k, 38 * k);
      this.label(`mk${m.uid}`, v.c.x, v.c.y - 120, shielded ? '🧿' : '🎯', '#ffffff', 26);
    }
    // 장판(라인 전체)
    for (const z of s.raidZones ?? []) {
      const ys = [...sc.uViews.entries()].filter(([uid]) => { const u = s.field.find((f) => f.uid === uid); return u && laneOf(u.seat) === z.lane; }).map(([, v]) => v.c.y);
      if (!ys.length) continue;
      const y = ys.reduce((a, b) => a + b, 0) / ys.length + 34;
      g.fillStyle(z.spawn ? 0x5a2a9a : COL.zone, 0.22 + 0.08 * Math.sin(now * 6)).fillRoundedRect(40, y - 26, 560, 52, 20);
    }
    // 눈보라: 화면 전체를 살짝 푸르게
    if (s.raidBlizzard && now < s.raidBlizzard.until) g.fillStyle(0xbfe6ff, 0.1).fillRect(0, 0, 1280, 720);
    // 독·저주 표시
    for (const u of s.field) {
      if (u.down || u.resting) continue;
      const v = sc.uViews.get(u.uid); if (!v) continue;
      const tags = [];
      if ((u.raidPoison ?? 0) > 0) tags.push(`☠${Math.ceil(u.raidPoison)}`);
      if ((u.raidCurse ?? 0) > now) tags.push('💜');
      if ((u.raidHeat ?? 0) > now) tags.push('🔥');
      if (tags.length) this.label(`st${u.uid}`, v.c.x, v.c.y - 96, tags.join(' '), '#c8ffb0', 13);
    }
    this.castHit(castBar);
    this.sweep();
  }

  /** 보라 막대 누르는 자리(막대가 있을 때만) */
  castHit(bar) {
    if (!bar) { this.hit?.destroy(); this.hit = null; return; }
    if (!this.hit) {
      this.hit = this.sc.add.zone(0, 0, bar.w + 40, bar.h + 40).setOrigin(0).setDepth(DEPTH + 3).setInteractive({ useHandCursor: true });
      this.hit.on('pointerdown', (p, lx, ly, evt) => {
        evt?.stopPropagation?.();
        const r = raidTap(this.sc.state, this.sc.D);
        if (r.ok) { sfx('hold'); try { navigator.vibrate?.(25); } catch { /* 없음 */ } } else if (r.reason === 'noCheers') this.sc.toast?.(this.T('raid.noCheers'));
      });
    }
    this.hit.setSize(bar.w + 40, bar.h + 40).setPosition(bar.x - 20, bar.y - 20);
  }

  sweep() { for (const [k, t] of this.labels) if (!this.used.has(k)) { t.destroy(); this.labels.delete(k); } }

  /** 사건 → 자막·배너. 처리했으면 true */
  onEvent(ev) {
    const sc = this.sc, s = sc.state, T = this.T;
    const name = ev.pid ? this.patName(ev) : '';
    const at = (side, id) => sc.posOf(side, id);
    switch (ev.type) {
      case 'raidPhase': {
        const boss = sc.D.enemyById[ev.boss]?.name ?? T('raid.boss');
        sc.fx.banner?.(T('raid.phase', { boss, n: ev.phase }), '#ff6b5a', ev.element !== undefined && sc.D.raid?.bosses?.[ev.boss]?.phaseElements ? T('raid.phaseElem', { el: T(`raid.el.${ev.element ?? 'none'}`) }) : T('raid.phaseSub'));
        sc.cameras.main.shake(300, 0.012); sfx('stampede'); return true;
      }
      case 'raidEnrage': sc.ticker(T('raid.enrage', { n: ev.step }), '#ff6b5a'); return true;
      case 'raidDoom': sc.cameras.main.flash(160, 120, 0, 0); sc.ticker(T('raid.doom'), '#ff3b3b'); sfx('slam'); return true;
      // 시전 시작: 예전엔 머리 위에 이름 말풍선을 따로 띄워 막대를 가렸음 → 막대 판 안의 이름을 톡 튀게(같은 글자를 두 번 쓰지 않음)
      case 'raidCast': { sc.time.delayedCall(0, () => { const t = this.labels.get(`cn${ev.eid}`); if (t?.scene) sc.tweens.add({ targets: t, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.out' }); }); sfx('magic'); return true; }
      case 'raidInterruptPt': { const p = at('e', ev.eid), rc = this.castRects.find((q) => q.eid === ev.eid); if (p) sc.floatAt(rc ? rc.x + rc.w / 2 : p[0], rc ? rc.y + rc.h + 14 : p[1] - 110, T('raid.cast.pts', { pts: ev.pts, need: ev.need }), '#ffe066', 14); return true; }
      case 'raidInterrupt': { const p = at('e', ev.eid); if (p) { sc.fx.impact?.(p[0], p[1] - 160, 0xffe066, 1.4); } sc.ticker(T('raid.interrupt', { name }), '#ffe066'); sfx('evolve'); return true; }
      case 'raidCastDone': { sc.ticker(T('raid.castDone', { name }), '#ff6b5a'); sc.cameras.main.shake(220, 0.01); if (ev.uid != null) { const p = at('u', ev.uid); if (p) sc.fx.impact?.(p[0], p[1] - 10, 0xff3b3b, 1.5); } sfx('slam'); return true; }
      case 'raidLearned': sc.registry.set('raidLearned', { ...(sc.registry.get('raidLearned') ?? {}), [`${ev.boss}:${ev.pid}`]: true }); sc.ticker(T('raid.learned', { name: T(`raid.pat.${ev.boss}.${ev.pid}`) }), '#9cff6b'); return true;
      case 'raidMark': sc.ticker(ev.taste ? T('raid.taste', { name }) : T('raid.mark', { name }), '#ff9f1a'); sfx('hold'); try { navigator.vibrate?.(60); } catch { /* 없음 */ } return true;
      case 'raidMarkHit': { const p = at('u', ev.uid); if (p) { sc.fx.impact?.(p[0], p[1] - 10, ev.shield ? 0x8fd3ff : 0xff9f1a, 1.3); if (ev.shield) sc.floatAt(p[0], p[1] - 130, T('raid.markSafe'), '#8fd3ff', 18); else if (ev.guard) sc.floatAt(p[0], p[1] - 130, T('raid.guard'), '#ffe066', 16); } return true; }
      case 'raidShield': sc.ticker(T(ev.mode === 'lanes' ? 'raid.shield.lanes' : 'raid.shield.distinct', { name, need: ev.need }), '#d2b4ff'); sfx('shield'); return true;
      case 'raidShieldBreak': case 'raidArmorBreak': { const p = at('e', ev.eid); if (p) { sc.fx.impact?.(p[0], p[1] - 30, 0xffffff, 2); sc.say(p[0], p[1] - 120, T(ev.type === 'raidShieldBreak' ? 'raid.shieldBreak' : 'raid.armorBreak'), 0xffffff, { force: true }); } sc.cameras.main.shake(200, 0.01); sfx('slam'); return true; }
      case 'raidArmor': sc.ticker(T('raid.armor', { name, need: ev.need }), '#f0c890'); return true;
      case 'raidHide': sc.ticker(T('raid.hide', { name }), '#d9c49a'); return true;
      case 'raidZone': sc.ticker(T('raid.zone', { name }), '#ff8a5a'); return true;
      case 'raidPoison': sc.ticker(T('raid.poison', { name }), '#9cff6b'); return true;
      case 'raidCleanse': { const p = at('u', ev.uid); if (p) sc.floatAt(p[0], p[1] - 110, T('raid.cleanse'), '#9cff6b', 12); return true; }
      case 'raidBlizzard': sc.ticker(T('raid.blizzard', { name }), '#bfe6ff'); return true;
      case 'raidRally': sc.ticker(T('raid.rally', { name }), '#ffb0a0'); return true;
      case 'raidRocks': sc.ticker(T('raid.rocks', { name }), '#d9c49a'); sc.cameras.main.shake(160, 0.008); return true;
      case 'raidSummon': { const p = at('e', ev.eid); if (p) sc.say(p[0], p[1] - 110, T('raid.summon', { name }), 0xc4a6ff); sfx('bossSummon'); return true; }
      case 'raidCharge': { const p = at('e', ev.eid); if (p) sc.say(p[0], p[1] - 110, T('raid.charge', { name }), 0xff6b5a, { force: true }); if (ev.held) sc.ticker(T('raid.chargeHeld'), '#ffe066'); sfx('stampede'); return true; }
      case 'raidDuelHit': { const p = at('u', ev.uid); if (p) sc.floatAt(p[0], p[1] - 100, ev.guard ? T('raid.guard') : T('raid.duelHit'), '#ffe066', 13); return true; }
      default: return ev.type?.startsWith?.('raid') ?? false;
    }
  }

  destroy() { this.g.destroy(); this.gc.destroy(); this.hit?.destroy(); for (const t of this.labels.values()) t.destroy(); this.labels.clear(); }
}

/** 보스 카드(카드12): 속성·약점·필요한 역할·기술(단계별)·추천 동물. 난이도·덱 화면에서 열림. 닫는 함수 돌려줌 */
export function showBossCard(sc, D, stage, depth = 3100) {
  const card = bossCard(D, stage);
  if (!card) return null;
  const dict = sc.cache.json.get('text') ?? {};
  const T = sc.registry.get('T') ?? ((k, v = {}) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ''));
  const parts = [];
  const add = (o) => { parts.push(o); return o; };
  const close = () => parts.forEach((p) => p.destroy());
  const g = add(sc.add.graphics().setDepth(depth));
  g.fillStyle(0x000000, 0.72).fillRect(0, 0, 1280, 720);
  g.fillStyle(0x16122a, 1).fillRoundedRect(250, 50, 780, 620, 18).lineStyle(3, 0x9b6cf0, 1).strokeRoundedRect(250, 50, 780, 620, 18);
  const blocker = add(sc.add.zone(0, 0, 1280, 720).setOrigin(0).setDepth(depth).setInteractive());
  blocker.on('pointerdown', (p, x, y, e) => e?.stopPropagation?.());
  const txt = (x, y, t, c = '#ffffff', size = 15, o = {}) => add(sc.add.text(x, y, t, style(size, c, { stroke: '#000', strokeThickness: 3, ...o })).setDepth(depth + 1));
  txt(640, 84, T('raid.card.title', { name: card.name }), '#e6d4ff', 26).setOrigin(0.5);
  const el = (k) => T(`raid.el.${k ?? 'none'}`);
  const elLine = card.phaseElements ? T('raid.card.phases', { list: card.phaseElements.map(el).join(' → ') }) : T('raid.card.element', { el: el(card.element) });
  txt(290, 122, `${elLine}   ·   ${T('raid.card.weak', { list: (card.weak ?? []).map(el).join('·') || '-' })}`, '#ffd84d', 16);
  txt(290, 150, T('raid.card.need', { list: card.need.map((n) => T(`raid.need.${n}`)).join(', ') }), '#9cff6b', 16);
  txt(290, 184, T('raid.card.patterns'), '#ffffff', 17);
  let y = 212;
  for (const p of card.patterns) {
    const icon = p.telegraph === 'bar' ? '🟪' : p.telegraph === 'barHard' ? '🟥' : p.telegraph === 'mark' ? '🎯' : p.telegraph === 'zone' ? '🔥' : '▫';
    const ph = p.phase > 1 ? `  (${T('raid.card.phase', { n: p.phase })})` : '';
    const learned = sc.registry.get('raidLearned')?.[`${card.id}:${p.id}`] ? `  ${T('raid.card.learned')}` : '';
    txt(300, y, `${icon} ${T(`raid.pat.${card.id}.${p.id}`)}${ph}${learned}`, '#e6d4ff', 16);
    txt(330, y + 22, T(`raid.hint.${card.id}.${p.id}`), '#c9c2e0', 13, { wordWrap: { width: 660 } });
    y += 62;
  }
  txt(290, Math.max(y + 6, 520), `${T('raid.card.good')}: ${card.good.map((id) => D.unitById[id]?.name ?? id).join(' · ')}`, '#7CFC9A', 16, { wordWrap: { width: 700 } });
  add(button(sc, 640, 630, 180, 40, T('raid.card.close'), close, { depth: depth + 2, size: 16 }));
  return close;
}

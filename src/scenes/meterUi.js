// 딜 미터기 화면(2026-11-28 선생님 "딜 미터기 보여줘 넣은딜 막은딜 회복한양 등등").
// 계산은 src/logic/meter.js(체력 장부만 읽음), 여기선 그리기만. 색은 #96 전투 숫자와 같게(combatfx.json colors),
// 글자는 text.json meter.*. 전투 중엔 아래 띠 안에 작게(접힘이 기본, 전장을 안 가림) · 교전이 끝나면 기록 카드(항목별 막대·숫자·1등)
import { FONT } from '../text.js';
import { button } from './ui.js';
import { METER_KEYS, meterRows, meterLeaders } from '../logic/meter.js';

const ICON = { dmg: '⚔', block: '🛡', heal: '💚', taken: '💥', kills: '☠' };
export function meterColors(sc) {
  const c = sc.cache.json.get('combatfx')?.colors ?? {};
  return { dmg: c.crit ?? '#ff9f43', block: c.blocked ?? '#8fd3ff', heal: c.heal ?? '#6dff8a', taken: c.hitAlly ?? '#ff6b5a' };
}
const hex = (s) => parseInt(String(s).replace('#', ''), 16);
export const fmt = (v) => Math.round(v ?? 0).toLocaleString('ko-KR');
const tf = (size, color, extra = {}) => ({ fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#05070c', strokeThickness: 3, ...extra });
const Tof = (sc) => { const dict = sc.cache.json.get('text') ?? {}; return sc.registry.get('T') ?? ((k, v = {}) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '')); };

/** 전투 중 아래 띠 왼쪽 '📊 딜 미터' 단추: 왼쪽 위 실시간 판(LiveMeter)을 숨기기/보이기(기본 보이기, 저장).
 *  판을 숨겼을 땐 단추 옆 한 줄에 항목별 1등만 */
export class MeterHud {
  constructor(sc, depth = 1803, pref = { get: () => true, set: () => {} }) {
    this.sc = sc; this.depth = depth; this.T = Tof(sc); this.col = meterColors(sc); this.pref = pref;
    this.open = false;   // (예전 펼침 칸은 없앰 — 아래 전투 기록 줄을 가리지 않음)
    this.g = sc.add.graphics().setDepth(depth);
    this.head = sc.add.text(0, 0, '', tf(14, '#f6ead2')).setDepth(depth + 1);
    this.line = sc.add.text(0, 0, '', tf(14, '#cfd6e6')).setDepth(depth + 1);
    this.rowsT = [];
    this.zone = sc.add.zone(0, 0, 10, 10).setOrigin(0).setDepth(depth + 2).setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (p, x, y, ev) => { ev?.stopPropagation?.(); this.pref.set(!this.pref.get()); this.t = 0; });
    this.t = 0; this.visible = true;
  }
  get live() { return !!this.pref.get(); }
  setVisible(on) {
    this.visible = on;
    for (const o of [this.g, this.head, this.line, this.zone]) o.setVisible(on);
    if (this.zone.input) this.zone.input.enabled = on;
  }
  /** m = 이번 교전 미터, nameOf(uid), top = 단추 y */
  update(dt, m, nameOf, top = 612) {
    if (!this.visible) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.25;
    const T = this.T, g = this.g, x0 = 22, live = this.live;
    g.clear();
    const lead = m ? meterLeaders(m) : {};
    this.head.setText(`📊 ${T('meter.title')} ${live ? T('meter.hide') : T('meter.show')}`).setPosition(x0 + 8, top);
    const hw = this.head.width + 16;
    g.fillStyle(0x1c2a3a, 0.95).fillRoundedRect(x0, top - 3, hw, 24, 8).lineStyle(1.5, 0xd4b06a, 0.8).strokeRoundedRect(x0, top - 3, hw, 24, 8);
    this.zone.setPosition(x0, top - 6).setSize(hw, 30);
    if (this.zone.input?.hitArea) this.zone.input.hitArea.setSize(hw, 30);
    if (live) { this.line.setText(''); return; }
    const parts = METER_KEYS.filter((k) => lead[k] != null).map((k) => `${ICON[k]} ${nameOf(lead[k])} ${fmt(m.units[lead[k]][k])}`);
    this.line.setText(parts.length ? parts.join('   ') : T('meter.empty')).setPosition(x0 + hw + 12, top + 1);
  }
  destroy() { for (const o of [this.g, this.head, this.line, this.zone]) o.destroy(); }
}

/**
 * 기록 카드(교전이 끝난 뒤 · 결과 화면): 항목별 막대그래프 + 숫자 + 항목별 1등 👑.
 * tabs = [{ label, meter }], nameOf(uid). 닫는 함수 돌려줌
 */
export function showMeterCard(sc, { tabs, nameOf: nameOf0, depth = 3300, onClose = null, auto = null }) {
  const T = Tof(sc), col = meterColors(sc);
  const parts = [];
  const add = (o) => { parts.push(o); return o; };
  let body = [];
  const close = () => { [...parts, ...body].forEach((o) => o.destroy()); parts.length = 0; body = []; onClose?.(); };
  const X = 230, Y = 96, W = 820, H = 520;
  const dim = add(sc.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setDepth(depth).setInteractive());
  dim.on('pointerdown', (p, x, y, ev) => ev?.stopPropagation?.());
  const g = add(sc.add.graphics().setDepth(depth + 1));
  g.fillStyle(0x0d141d, 0.97).fillRoundedRect(X, Y, W, H, 16).lineStyle(2, 0xd4b06a, 0.9).strokeRoundedRect(X, Y, W, H, 16);
  add(sc.add.text(X + 24, Y + 16, `📊 ${T('meter.cardTitle')}`, tf(24, '#ffe2b8')).setDepth(depth + 2));
  const draw = (ti) => {
    body.forEach((o) => o.destroy()); body = [];
    const b = (o) => { body.push(o.setDepth?.(depth + 2) ?? o); return o; };
    const m = tabs[ti].meter, nameOf = tabs[ti].nameOf ?? nameOf0;
    // 탭
    tabs.forEach((t, k) => b(button(sc, X + W - 110 - (tabs.length - 1 - k) * 150, Y + 30, 140, 32, t.label, () => draw(k), { depth: depth + 2, size: 14, fill: k === ti ? 0x3a5a2a : 0x1c2a3a, stroke: k === ti ? 0x9cff6b : 0xd4b06a })));
    const rows = m ? meterRows(m, nameOf) : [];
    const lead = m ? meterLeaders(m) : {};
    if (!rows.length) { b(sc.add.text(640, Y + 240, T('meter.empty'), tf(18, '#9aa7b8')).setOrigin(0.5)); return; }
    const cols = METER_KEYS, nameW = 150, cw = (W - 48 - nameW - 70) / cols.length, top = Y + 74;
    const max = Object.fromEntries(cols.map((k) => [k, Math.max(1, ...rows.map((r) => r[k]))]));
    cols.forEach((k, c) => {
      const x = X + 24 + nameW + c * cw;
      b(sc.add.text(x, top, `${ICON[k]} ${T('meter.' + k)}`, tf(15, col[k])));
      if (lead[k] != null) b(sc.add.text(x, top + 20, `👑 ${nameOf(lead[k])}`, tf(12, '#ffd84d')));
    });
    b(sc.add.text(X + W - 70, top, `${ICON.kills} ${T('meter.kills')}`, tf(15, '#e6d4ff')));
    const gg = b(sc.add.graphics());
    const rh = Math.min(44, (H - 150) / Math.max(1, rows.length));
    rows.slice(0, 9).forEach((r, j) => {
      const y = top + 48 + j * rh;
      if (j % 2 === 0) gg.fillStyle(0xffffff, 0.04).fillRect(X + 14, y - 4, W - 28, rh - 2);
      b(sc.add.text(X + 24, y + rh / 2 - 12, r.name, tf(16, '#f6ead2')));
      cols.forEach((k, c) => {
        const x = X + 24 + nameW + c * cw, bw = cw - 18, w = bw * r[k] / max[k];
        gg.fillStyle(0x000000, 0.5).fillRoundedRect(x, y + rh / 2 - 2, bw, 12, 5);
        if (r[k] > 0.5) gg.fillStyle(hex(col[k]), 1).fillRoundedRect(x + 1, y + rh / 2 - 1, Math.max(4, w - 2), 10, 4);
        b(sc.add.text(x, y + rh / 2 - 22, `${fmt(r[k])}${lead[k] === r.uid ? ' 👑' : ''}`, tf(16, lead[k] === r.uid ? '#ffd84d' : col[k])));
      });
      b(sc.add.text(X + W - 70, y + rh / 2 - 12, `${r.kills}${lead.kills === r.uid ? ' 👑' : ''}`, tf(16, '#e6d4ff')));
    });
    const foot = [T('meter.foot')];
    if (m.team.breaks > 0) foot.unshift(T('meter.breaks', { n: m.team.breaks }));
    b(sc.add.text(X + 24, Y + H - 72, foot.join('   ·   '), tf(13, '#9aa7b8', { wordWrap: { width: W - 260 } })));
  };
  draw(0);
  if (auto) {
    const label = () => `${auto.get() ? '☑' : '☐'} ${T('meter.auto')}`;
    const ab = add(button(sc, X + 150, Y + H - 26, 260, 30, label(), () => { auto.set(!auto.get()); ab.set(label()); }, { depth: depth + 2, size: 13, fill: 0x1c2a3a }));
  }
  add(button(sc, X + W - 90, Y + H - 30, 140, 40, T('meter.close'), close, { depth: depth + 2, size: 16 }));
  return close;
}

/**
 * 실시간 딜 미터 판(2026-11-28 선생님 "딜미터기 실시간으로도 왼쪽에 초상화랑 띄워줘").
 * 전투 중 화면 왼쪽 위 하늘(성 그림 위·상단 띠 아래, x 8~312 · y 106~232): 아군 한 마리 한 줄 —
 * 초상화(전장에 서 있는 그 도트 그림의 첫 장 윗부분을 잘라 씀) · 이름 · 넣은 피해 막대+숫자(크게) · 막음(파랑)·회복(초록) 작은 숫자.
 * 넣은 피해 순(자리 바뀔 때 미끄러지듯), 쓰러진 동물은 회색, 숫자는 0.2초마다 받아 그 사이 부드럽게 올라감.
 * 5마리부터는 두 칸으로(8마리까지). 아군·적 몸이 판에 들어오면 판을 더 투명하게. #97 글자 예산과 별개인 고정 판.
 */
const BOX = new Map();
/** 그림 한 장에서 투명하지 않은 부분의 사각형(한 번만 재고 기억) */
function opaqueBox(sc, key, frame, fw, fh) {
  const id = key + '|' + frame; if (BOX.has(id)) return BOX.get(id);
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  try {
    for (let y = 0; y < fh; y += 2) for (let x = 0; x < fw; x += 2) {
      if ((sc.textures.getPixelAlpha(x, y, key, frame) ?? 0) > 40) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
  } catch { x1 = -1; }
  const r = x1 < 0 ? { x: 0, y: 0, w: fw, h: fh } : { x: x0, y: y0, w: Math.min(fw - x0, x1 - x0 + 2), h: Math.min(fh - y0, y1 - y0 + 2) };
  BOX.set(id, r); return r;
}
export const LIVE_REGION = { x: 8, y: 106, w: 304, h: 126 };
export class LiveMeter {
  constructor(sc, depth = 1795) {
    this.sc = sc; this.depth = depth; this.col = meterColors(sc);
    this.bg = sc.add.graphics().setDepth(depth);
    this.rows = new Map();   // uid → row
    this.t = 0; this.shown = true; this.alpha = 0.92; this.rect = null;
  }
  setVisible(on) {
    this.shown = on;
    this.bg.setVisible(on);
    for (const r of this.rows.values()) r.c.setVisible(on);
  }
  portrait(v, size) {
    const sc = this.sc, sp = v?.rig?.view?.sprite, inst = v?.rig?.inst;
    const fr = inst?.set?.idle?.frames?.[0] ?? sp?.frame?.name;
    if (sp && fr != null && sc.textures.exists(sp.texture.key) && sc.textures.get(sp.texture.key).has(fr)) {
      const im = sc.add.image(0, 0, sp.texture.key, fr).setOrigin(0, 0);
      // 실제 그림이 있는 칸(투명 여백 뺌)을 찾고, 얼굴 쪽만: 동물들은 오른쪽을 봄 → 그 칸의 오른쪽 75% · 위 75%를 정사각 칸에 맞춤
      const bb = opaqueBox(sc, sp.texture.key, fr, im.frame.width, im.frame.height);
      const cx = bb.x + Math.round(bb.w * 0.25), cw = Math.max(4, bb.x + bb.w - cx), cy = bb.y, ch = Math.max(4, Math.round(bb.h * 0.75));
      im.setCrop(cx, cy, cw, ch);
      const k = Math.min(size / cw, size / ch);
      im.setScale(k).setPosition((size - cw * k) / 2 - cx * k, (size - ch * k) / 2 - cy * k);
      return im;
    }
    return null;
  }
  makeRow(u, v) {
    const sc = this.sc, c = sc.add.container(0, 0).setDepth(this.depth + 1);
    const g = sc.add.graphics();
    const name = sc.add.text(0, 0, '', tf(12, '#f6ead2'));
    const num = sc.add.text(0, 0, '0', tf(16, this.col.dmg));
    const blk = sc.add.text(0, 0, '', tf(11, this.col.block));
    const hel = sc.add.text(0, 0, '', tf(11, this.col.heal));
    c.add([g, name, num, blk, hel]);
    const r = { uid: u.uid, c, g, name, num, blk, hel, pic: null, picSize: 0, shown: { dmg: 0, block: 0, heal: 0 }, want: { dmg: 0, block: 0, heal: 0 }, y: null, x: null, last: {} };
    return r;
  }
  /** dt(실제 초), m(이번 교전 미터), field(아군 목록), views(uid → 전장 그림), avoid(아군·적 몸 사각형 목록) */
  update(dt, m, field, views, avoid = []) {
    if (!this.shown) return;
    const R = LIVE_REGION, list = field.filter(Boolean).slice(0, 8);
    this.t -= dt;
    const pull = this.t <= 0;
    if (pull) {
      this.t = 0.2;
      for (const u of list) {
        let r = this.rows.get(u.uid);
        if (!r) { r = this.makeRow(u, views.get(u.uid)); this.rows.set(u.uid, r); }
        const mu = m?.units?.[u.uid];
        r.want = { dmg: mu?.dmg ?? 0, block: mu?.block ?? 0, heal: mu?.heal ?? 0 };
        if (!m || !mu) r.shown = { dmg: Math.min(r.shown.dmg, r.want.dmg), block: Math.min(r.shown.block, r.want.block), heal: Math.min(r.shown.heal, r.want.heal) };
        r.down = !!u.down || (u.hp ?? 1) <= 0; r.u = u;
      }
      for (const [uid, r] of this.rows) if (!list.some((u) => u.uid === uid)) { r.c.destroy(); this.rows.delete(uid); }
    }
    const rows = list.map((u) => this.rows.get(u.uid)).filter(Boolean)
      .sort((a, b) => b.want.dmg - a.want.dmg || a.uid - b.uid);
    const n = rows.length; if (!n) { this.bg.clear(); this.rect = null; return; }
    const two = n > 4, per = two ? Math.ceil(n / 2) : n, cw = two ? R.w / 2 : R.w;
    const rh = Math.min(30, Math.floor((R.h - 8) / per)), H = per * rh + 8;
    this.rect = { x: R.x, y: R.y, w: R.w, h: H };
    // 아군·적 몸이 판에 들어오면 더 투명하게
    const hit = avoid.some((q) => q.x < R.x + R.w && R.x < q.x + q.w && q.y < R.y + H && R.y < q.y + q.h);
    this.alpha += ((hit ? 0.35 : 0.92) - this.alpha) * Math.min(1, dt * 6);
    this.bg.clear().fillStyle(0x0b1220, 0.55 * this.alpha).fillRoundedRect(R.x, R.y, R.w, H, 10).lineStyle(1, 0xd4b06a, 0.35 * this.alpha).strokeRoundedRect(R.x, R.y, R.w, H, 10);
    const max = Math.max(1, ...rows.map((r) => r.want.dmg));
    const k = Math.min(1, dt * 10);   // 숫자는 0.2초 안에 목표까지 부드럽게
    rows.forEach((r, i) => {
      const col = two ? Math.floor(i / per) : 0, j = two ? i % per : i;
      const tx = R.x + 4 + col * cw, ty = R.y + 4 + j * rh;
      if (r.y == null) { r.x = tx; r.y = ty; }
      r.x += (tx - r.x) * Math.min(1, dt * 8); r.y += (ty - r.y) * Math.min(1, dt * 8);   // 순서가 바뀌면 미끄러지듯
      r.c.setPosition(Math.round(r.x), Math.round(r.y)).setAlpha(this.alpha * (r.down ? 0.6 : 1));
      for (const key of ['dmg', 'block', 'heal']) { const d = r.want[key] - r.shown[key]; r.shown[key] = Math.abs(d) < 0.5 ? r.want[key] : r.shown[key] + d * k; }
      const ps = rh - 4;
      if (!r.pic || r.picSize !== ps) { r.pic?.destroy(); r.pic = this.portrait(r.u && this.sc.uViews?.get(r.uid), ps); r.picSize = ps; if (r.pic) r.c.addAt(r.pic, 1); }
      if (r.pic) { if (r.down) r.pic.setTint(0x6f7480); else r.pic.clearTint(); }
      const w = cw - 8, x1 = ps + 5;
      const small = two || rh < 24;
      const numW = small ? 40 : 52, smallW = small ? 0 : 50;
      const barW = Math.max(20, w - x1 - numW - smallW - 6);
      const nm = String(r.u?.stats?.name ?? '?'), nmMax = two ? 5 : 8;
      const st = (t, s) => { if (r.last[t] !== s) { r.last[t] = s; return true; } return false; };
      if (st('nm', nm + r.down + small)) r.name.setText(nm.length > nmMax ? nm.slice(0, nmMax) + '…' : nm).setStyle(tf(small ? 11 : 12, r.down ? '#8a8f99' : '#f6ead2'));
      r.name.setPosition(x1, small ? -1 : 0);
      const dv = fmt(r.shown.dmg);
      if (st('num', dv + r.down + small)) r.num.setText(dv).setStyle(tf(small ? 13 : 16, r.down ? '#9aa0aa' : this.col.dmg));
      r.num.setPosition(x1 + barW + 4, small ? rh / 2 - 9 : rh / 2 - 12);
      const bt = r.shown.block >= 0.5 ? `🛡${fmt(r.shown.block)}` : '', ht = r.shown.heal >= 0.5 ? `💚${fmt(r.shown.heal)}` : '';
      if (small) {   // 두 칸일 땐 이름 줄 오른쪽에 붙여 씀
        if (st('bh', bt + '|' + ht)) { r.blk.setText(bt); r.hel.setText(ht); }
        r.hel.setOrigin(1, 0).setPosition(w, -1); r.blk.setOrigin(1, 0).setPosition(w - (ht ? r.hel.width + 3 : 0), -1);
      } else {
        if (st('bh', bt + '|' + ht)) { r.blk.setText(bt); r.hel.setText(ht); }
        r.blk.setOrigin(0, 0).setPosition(w - smallW + 2, rh / 2 - 15); r.hel.setOrigin(0, 0).setPosition(w - smallW + 2, rh / 2 - 1);
      }
      const by = small ? rh - 10 : rh - 11, bw = barW * Math.min(1, r.shown.dmg / max);
      r.g.clear().fillStyle(0x000000, 0.35).fillRoundedRect(0, 0, ps, ps, 5)   // 초상화 받침
        .fillStyle(0x000000, 0.45).fillRoundedRect(x1, by, barW, 6, 3);
      if (r.shown.dmg >= 0.5) r.g.fillStyle(r.down ? 0x7a7f88 : hex(this.col.dmg), 1).fillRoundedRect(x1, by, Math.max(3, bw), 6, 3);
    });
  }
  destroy() { this.bg.destroy(); for (const r of this.rows.values()) r.c.destroy(); this.rows.clear(); }
}

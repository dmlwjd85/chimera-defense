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

/** 전투 중 작은 판: 아래 띠 왼쪽(x 20~740, y 606~716). 접힘 = 한 줄(항목별 1등), 펼침 = 동물별 네 칸(최대 4마리) */
export class MeterHud {
  constructor(sc, depth = 1803) {
    this.sc = sc; this.depth = depth; this.T = Tof(sc); this.col = meterColors(sc);
    this.open = !!sc.registry.get('meterOpen');
    this.g = sc.add.graphics().setDepth(depth);
    this.head = sc.add.text(0, 0, '', tf(14, '#f6ead2')).setDepth(depth + 1);
    this.line = sc.add.text(0, 0, '', tf(14, '#cfd6e6')).setDepth(depth + 1);
    this.rowsT = [];
    this.zone = sc.add.zone(0, 0, 10, 10).setOrigin(0).setDepth(depth + 2).setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (p, x, y, ev) => { ev?.stopPropagation?.(); this.open = !this.open; sc.registry.set('meterOpen', this.open); this.t = 0; });
    this.t = 0; this.visible = true;
  }
  setVisible(on) {
    this.visible = on;
    for (const o of [this.g, this.head, this.line, this.zone, ...this.rowsT]) o.setVisible(on);
    if (this.zone.input) this.zone.input.enabled = on;
  }
  /** m = 이번 교전 미터, nameOf(uid), top = 접힘일 때 한 줄 y */
  update(dt, m, nameOf, top = 612) {
    if (!this.visible) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.25;   // 0.25초마다(숫자가 정신없이 바뀌지 않게)
    const T = this.T, g = this.g, x0 = 22;
    g.clear();
    const rows = m ? meterRows(m, nameOf) : [];
    const lead = m ? meterLeaders(m) : {};
    this.head.setText(`📊 ${T('meter.title')} ${this.open ? '▾' : '▸'}`).setPosition(x0 + 8, top);
    const hw = this.head.width + 16;
    g.fillStyle(0x1c2a3a, 0.95).fillRoundedRect(x0, top - 3, hw, 24, 8).lineStyle(1.5, 0xd4b06a, 0.8).strokeRoundedRect(x0, top - 3, hw, 24, 8);
    this.zone.setPosition(x0, top - 6).setSize(hw, 30);
    if (this.zone.input?.hitArea) this.zone.input.hitArea.setSize(hw, 30);
    if (!this.open) {
      this.rowsT.forEach((t) => t.setText(''));
      const parts = METER_KEYS.filter((k) => lead[k] != null).map((k) => `${ICON[k]} ${nameOf(lead[k])} ${fmt(m.units[lead[k]][k])}`);
      this.line.setText(parts.length ? parts.join('   ') : T('meter.empty')).setPosition(x0 + hw + 12, top + 1);
      return;
    }
    this.line.setText('');
    // 펼침: 머리줄 오른쪽에 항목 이름, 아래 4줄
    const cols = METER_KEYS, cw = 140, cx0 = x0 + 118;
    const max = Object.fromEntries(cols.map((k) => [k, Math.max(1, ...rows.map((r) => r[k]))]));
    let i = 0;
    const put = (txt, x, y, color, size = 13) => { let t = this.rowsT[i++]; if (!t) { t = this.sc.add.text(0, 0, '', tf(size, color)).setDepth(this.depth + 1); this.rowsT.push(t); } t.setStyle(tf(size, color)).setText(txt).setPosition(x, y).setVisible(true); return t; };
    cols.forEach((k, c) => put(`${ICON[k]} ${T('meter.' + k)}`, cx0 + c * cw + (c ? 0 : 0), top + 2, this.col[k], 13));
    rows.slice(0, 4).forEach((r, j) => {
      const y = top + 26 + j * 19;
      put(`${r.name}`.slice(0, 7), x0 + 6, y, '#f6ead2', 13);
      cols.forEach((k, c) => {
        const bx = cx0 + c * cw, w = 82 * r[k] / max[k];
        g.fillStyle(0x000000, 0.45).fillRoundedRect(bx, y + 4, 84, 10, 4);
        if (r[k] > 0.5) g.fillStyle(hex(this.col[k]), 1).fillRoundedRect(bx + 1, y + 5, Math.max(3, w), 8, 3);
        put(`${fmt(r[k])}${lead[k] === r.uid ? ' 👑' : ''}`, bx + 90, y, this.col[k], 12);
      });
    });
    if (!rows.length) put(T('meter.empty'), x0 + 6, top + 28, '#9aa7b8', 13);
    for (; i < this.rowsT.length; i++) this.rowsT[i].setText('');
  }
  destroy() { for (const o of [this.g, this.head, this.line, this.zone, ...this.rowsT]) o.destroy(); this.rowsT = []; }
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

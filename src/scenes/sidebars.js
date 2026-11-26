// 아래 조작판(2026-11-25 시안 1): 출전 초상화 · 케이지 · 판매 · 합성 제단 · 마법 · 지구본 소환을 한 줄에.
// 싸우는 동물은 초상화로 고르고, 제단 두 칸에 올려 합성함.
import { DOCK_Y, rosterPos } from './layout.js';
export const ALTAR = { x: 578, w: 192 };
import { panel, style, unitToken, button } from './ui.js';
import { mergeKind, mergePreview } from '../logic/merge.js';
import { refOf, unitOf } from './dropPlan.js';

const CELL_W = 42, CELL_H = 50;
const KIND_LABEL = { evolve: '⬆ 진화', spirit: '🌟 영물', chimera: '🧪 키메라', weak: '🧪 모험', swap: '⇄ 교체' };

/** Dock background (drawn once). */
export function drawSidebars(scene) {
  const g = scene.add.graphics().setDepth(0.5);
  g.fillGradientStyle(0x0b1016, 0x0b1016, 0x0b1016, 0x0b1016, 0.1, 0.1, 0.9, 0.9).fillRect(0, DOCK_Y - 22, 1280, 22);
  g.fillStyle(0x0b1016, 0.92).fillRect(0, DOCK_Y, 1280, 720 - DOCK_Y);
  g.lineStyle(1, 0xd4b06a, 0.45).lineBetween(0, DOCK_Y, 1280, DOCK_Y);
}

/** Deployed-animal portraits: tap to select, drag to merge / move / altar. */
export class Roster {
  constructor(scene) {
    this.scene = scene;
    this.label = scene.add.text(10, DOCK_Y + 4, '', style(11, '#ffe6b0')).setDepth(2);
    const max = scene.data2.config.maxDeployed ?? 6;
    this.cells = [...Array(max)].map((_, i) => {
      const p = rosterPos(i);
      const bg = scene.add.rectangle(p.x, p.y, CELL_W, CELL_H, 0x0b1016, 0.6).setStrokeStyle(1.5, 0x3b4b5e, 0.9).setDepth(1);
      const c = scene.add.container(p.x, p.y).setDepth(3).setSize(CELL_W, CELL_H);
      c.baseDepth = 3;
      c.setInteractive({ draggable: true, useHandCursor: true });
      const hp = scene.add.graphics().setDepth(4);
      const down = scene.add.text(p.x, p.y, '', style(16, '#ffffff', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(5);
      return { i, p, bg, c, hp, down, key: '' };
    });
    this.sel = scene.add.graphics().setDepth(48);
  }

  /** Screen spots of portraits (uid → {x,y}) for drop targets. */
  spots() { return this.cells.filter((k) => k.c.unitUid != null).map((k) => [k.c.unitUid, { x: k.p.x, y: k.p.y }]); }

  update() {
    const s = this.scene.state, max = this.cells.length;
    this.label.setText(`⚔ 출전 ${s.field.length}/${max}`);
    this.cells.forEach((k, i) => {
      const u = s.field[i] ?? null;
      const key = u ? `${u.uid}:${u.speciesId}:${u.stage}:${u.kind}` : '';
      if (key !== k.key) {
        k.c.removeAll(true);
        if (u) { const t = unitToken(this.scene, u, this.scene.data2); t.setScale(0.62).setPosition(0, -2); k.c.add(t); }
        k.key = key;
      }
      k.c.unitUid = u?.uid ?? null;
      if (this.scene.dragUid !== u?.uid || !u) k.c.setPosition(k.p.x, k.p.y);
      k.c.setVisible(!!u);
      if (u) k.c.setInteractive(); else k.c.disableInteractive();
      const selected = u && this.scene.selectedUid === u.uid;
      k.bg.setStrokeStyle(selected ? 2.5 : 1.5, selected ? 0xffd84d : u?.down ? 0x6b2a2a : 0x3b4b5e, 1);
      k.hp.clear();
      if (u) {
        const f = Math.max(0, u.hp) / (u.maxHp ?? u.stats.hp);
        k.hp.fillStyle(0x000000, 0.8).fillRect(k.p.x - CELL_W / 2 + 3, k.p.y + CELL_H / 2 - 7, CELL_W - 6, 4);
        k.hp.fillStyle(f < 0.3 ? 0xe74c3c : 0x2ecc71, 1).fillRect(k.p.x - CELL_W / 2 + 3, k.p.y + CELL_H / 2 - 7, (CELL_W - 6) * f, 4);
      }
      k.down.setText(u?.down ? String(Math.ceil(u.respawnLeft)) : '');
      k.c.setAlpha(u?.down ? 0.4 : 1);
    });
    // 고른 동물: 들판의 발밑에 금색 고리
    this.sel.clear();
    const su = s.field.find((u) => u.uid === this.scene.selectedUid);
    const v = su && this.scene.unitViews.get(su.uid);
    if (v && !su.down && !su.inGate) {
      const x = v.container.x, y = v.container.y + 30 * (v.persp ?? 1);
      const pulse = 1 + Math.sin(this.scene.time.now / 160) * 0.08;
      this.sel.lineStyle(3, 0xffd84d, 0.95).strokeEllipse(x, y, 66 * pulse, 18 * pulse);
    }
  }
}

/** Two-slot merge altar (right sidebar top). */
export class Altar {
  constructor(scene) {
    this.scene = scene;
    this.uids = [null, null];
    const X = ALTAR.x, y0 = DOCK_Y + 4, x = X + 146;
    panel(scene, X, y0, ALTAR.w, 100, { alpha: 0.9, plain: true, stroke: 0xb388ff });
    scene.add.text(X + 8, y0 + 4, '🧪 합성 제단', style(11, '#e8c3ff')).setDepth(2);
    this.slots = [X + 28, X + 76].map((sx, i) => {
      const y = y0 + 58;
      const bg = scene.add.rectangle(sx, y, 42, 42, 0x150b22, 0.85).setStrokeStyle(1.5, 0xb388ff, 0.8).setDepth(1).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => { this.uids[i] = null; });
      const c = scene.add.container(sx, y).setDepth(3);
      const hint = scene.add.text(sx, y, '+', style(18, '#8a6fb0')).setOrigin(0.5).setDepth(2);
      return { x: sx, y, bg, c, hint, key: '' };
    });
    scene.add.text(X + 52, y0 + 58, '+', style(14, '#b388ff')).setOrigin(0.5).setDepth(2);
    this.preview = scene.add.text(x, y0 + 40, '', style(10, '#e8dcff', { align: 'center', wordWrap: { width: 86 } })).setOrigin(0.5).setDepth(2);
    this.btn = button(scene, x, y0 + 80, 84, 26, '합성', () => this.go(), { size: 12, fill: 0x4a2a6a, stroke: 0xb388ff });
    // 합칠 수 있는 성체 둘이 있으면 제단 테두리가 은은하게 빛남(개선제안 5)
    this.glowRect = scene.add.rectangle(X + ALTAR.w / 2, y0 + 50, ALTAR.w + 6, 106).setStrokeStyle(3, 0xffe066, 1).setDepth(3).setVisible(false);
    scene.tweens.add({ targets: this.glowRect, alpha: { from: 1, to: 0.25 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  glow(on) { this.glowRect.setVisible(!!on); }

  /** Slot index under a point, or -1. */
  slotAt(px, py) { return this.slots.findIndex((sl) => Math.abs(px - sl.x) <= 24 && Math.abs(py - sl.y) <= 24); }

  put(i, uid) {
    if (this.uids[1 - i] === uid) this.uids[1 - i] = null;
    this.uids[i] = uid;
  }

  units() { const s = this.scene.state; return this.uids.map((uid) => (uid == null ? null : unitOf(s, refOf(s, uid)))); }

  update() {
    const us = this.units();
    us.forEach((u, i) => { if (!u) this.uids[i] = null; });
    this.slots.forEach((sl, i) => {
      const u = us[i];
      const key = u ? `${u.uid}:${u.stage}:${u.kind}` : '';
      if (key !== sl.key) {
        sl.c.removeAll(true);
        if (u) { const t = unitToken(this.scene, u, this.scene.data2); t.setScale(0.55); sl.c.add(t); }
        sl.key = key;
      }
      sl.hint.setVisible(!u);
    });
    const [a, b] = us;
    if (a && b) {
      const d = this.scene.data2, kind = mergeKind(a, b, d);
      const p = mergePreview(a, b, d, this.scene.state.known);
      const name = p.vars?.name ?? (kind === 'chimera' || kind === 'weak' ? '???' : '');
      this.preview.setText(`${KIND_LABEL[kind] ?? kind}${name && kind !== 'swap' ? `\n${name}` : ''}`);
      this.btn.set(kind === 'swap' ? '자리 바꾸기' : '합성').setEnabled(!a.down && !b.down);
    } else {
      this.preview.setText('두 칸에\n끌어다 놓기');
      this.btn.set('합성').setEnabled(false);
    }
  }

  go() {
    const s = this.scene.state, [a, b] = this.units();
    if (!a || !b) return;
    const p = mergePreview(a, b, this.scene.data2, s.known);
    this.scene.runDropPlan?.({ action: 'merge', fromRef: refOf(s, a.uid), toRef: refOf(s, b.uid), preview: p });
    this.uids = [null, null];
  }
}

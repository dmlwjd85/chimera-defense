// Shared drawing helpers for all scenes (placeholder art: shapes and text, swappable for images later).
import Phaser from 'phaser';
import { FONT } from '../text.js';

export const COLORS = { bg: 0x141a21, panel: 0x1f2a36, line: 0x3b4b5e, accent: 0xffb35c, good: 0x58d68d, bad: 0xf0883e, flip: 0x5dade2, gold: 0xffd84d };
export const hex = (h) => Phaser.Display.Color.HexStringToColor(h ?? '#888888').color;
export const style = (size, color = '#ffffff', extra = {}) => ({ fontSize: `${size}px`, color, fontFamily: FONT, ...extra });

/** Rounded button: returns { bg, text, set(label), setEnabled(b), setVisible(b), destroy() }. */
export function button(scene, x, y, w, h, label, onClick, opts = {}) {
  const g = scene.add.graphics().setDepth(opts.depth ?? 10);
  const fill = opts.fill ?? 0x2f4f6f;
  const draw = (f, a = 1) => { g.clear(); g.fillStyle(f, a).fillRoundedRect(x - w / 2, y - h / 2, w, h, 10); g.lineStyle(2, opts.stroke ?? 0xffffff, 0.8).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10); };
  draw(fill);
  const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth((opts.depth ?? 10) + 1);
  const text = scene.add.text(x, y, label, style(opts.size ?? 16, opts.color ?? '#ffffff', { align: 'center' })).setOrigin(0.5).setDepth((opts.depth ?? 10) + 1);
  let enabled = true;
  zone.on('pointerover', () => enabled && draw(Phaser.Display.Color.ValueToColor(fill).brighten(15).color));
  zone.on('pointerout', () => draw(fill, enabled ? 1 : 0.45));
  zone.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); if (enabled) onClick(); });
  const api = {
    bg: g, text, zone,
    set(label2) { text.setText(label2); return api; },
    setEnabled(b) { enabled = b; draw(fill, b ? 1 : 0.45); text.setAlpha(b ? 1 : 0.6); return api; },
    setVisible(b) { g.setVisible(b); zone.setVisible(b); text.setVisible(b); if (b) zone.setInteractive(); else zone.disableInteractive(); return api; },
    destroy() { g.destroy(); zone.destroy(); text.destroy(); },
  };
  return api;
}

export function panel(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics().setDepth(opts.depth ?? 0);
  g.fillStyle(opts.fill ?? COLORS.panel, opts.alpha ?? 0.92).fillRoundedRect(x, y, w, h, opts.r ?? 12);
  g.lineStyle(2, opts.stroke ?? COLORS.line, 1).strokeRoundedRect(x, y, w, h, opts.r ?? 12);
  return g;
}

export function title(scene, x, y, text, size = 40) {
  return scene.add.text(x, y, text, style(size, '#ffe2b8', { stroke: '#000000', strokeThickness: 6 })).setOrigin(0.5);
}

/**
 * Placeholder token for a unit: colored disc sized by stage, initial letter, stage ring, chimera split.
 * Uses an image instead when a texture `unit-<id>-<stage>` or `unit-<id>` exists (drop-in Grok art).
 */
export function unitToken(scene, unit, data) {
  const c = scene.add.container(0, 0);
  const stageR = { young: 20, teen: 24, adult: 28, spirit: 30 }[unit.stage] ?? 26;
  const id = unit.kind === 'weak' ? null : unit.speciesId;
  const key = id && [`unit-${id}-${unit.stage}`, `unit-${id}`].find((k) => scene.textures.exists(k));
  if (key) {
    c.add(scene.add.image(0, 0, key).setDisplaySize(stageR * 2.4, stageR * 2.4));
  } else if (unit.kind === 'chimera') {
    const [a, b] = unit.parts.map((p) => hex(data.unitById[p].color));
    const g = scene.add.graphics();
    g.fillStyle(a, 1).slice(0, 0, stageR, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), false).fillPath();
    g.fillStyle(b, 1).slice(0, 0, stageR, Phaser.Math.DegToRad(270), Phaser.Math.DegToRad(90), false).fillPath();
    g.lineStyle(3, 0xb388ff, 1).strokeCircle(0, 0, stageR);
    c.add(g);
  } else {
    const color = unit.kind === 'weak' ? 0x777777 : unit.white ? 0xf4f4f4 : hex(unit.stats.color);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35).fillEllipse(2, stageR * 0.85, stageR * 1.8, stageR * 0.5);
    g.fillStyle(color, 1).fillCircle(0, 0, stageR);
    g.lineStyle(3, unit.stage === 'spirit' ? COLORS.gold : 0x1b1b1b, 1).strokeCircle(0, 0, stageR);
    if (unit.stage === 'spirit') g.lineStyle(2, COLORS.gold, 0.6).strokeCircle(0, 0, stageR + 5);
    c.add(g);
  }
  if (!key) {
    const letter = unit.kind === 'weak' ? '?' : unit.kind === 'chimera' ? data.recipeById[unit.speciesId].name[0] : data.unitById[id].name[0];
    c.add(scene.add.text(0, 0, letter, style(stageR, '#111111', { fontStyle: 'bold' })).setOrigin(0.5));
  }
  return c;
}

/** Rough silhouette disc for the globe telescope reveal. */
export function silhouette(scene, x, y, r) {
  const g = scene.add.graphics();
  g.fillStyle(0x0b0e12, 1).fillCircle(x, y, r * 0.55);
  g.fillCircle(x + r * 0.45, y - r * 0.35, r * 0.3);
  return g;
}

/** Simple modal list: lines of [text, color]. */
export function modal(scene, titleText, lines, onClose) {
  scene.modalOpen = true;
  const objs = [];
  const bg = scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive().setDepth(4000);
  objs.push(bg, panel(scene, 290, 120, 700, 480, { depth: 4001 }));
  objs.push(scene.add.text(640, 150, titleText, style(24, '#ffe2b8')).setOrigin(0.5).setDepth(4002));
  let y = 190;
  for (const [t, col] of lines) { const o = scene.add.text(320, y, t, style(16, col ?? '#dddddd', { wordWrap: { width: 640 } })).setDepth(4002); objs.push(o); y += o.height + 6; }
  const close = () => { objs.forEach((o) => o.destroy()); b.destroy(); scene.modalOpen = false; onClose?.(); };
  const b = button(scene, 640, 560, 160, 48, '닫기', close, { depth: 4003 });
  return close;
}

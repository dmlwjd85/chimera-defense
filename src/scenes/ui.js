// Shared drawing helpers for all scenes (placeholder art: shapes and text, swappable for images later).
import Phaser from 'phaser';
import { FONT } from '../text.js';
import { dotDataFor } from './rigs.js';

export const COLORS = { bg: 0x141a21, panel: 0x1f2a36, line: 0x3b4b5e, accent: 0xffb35c, good: 0x58d68d, bad: 0xf0883e, flip: 0x5dade2, gold: 0xffd84d };
export const hex = (h) => Phaser.Display.Color.HexStringToColor(h ?? '#888888').color;
export const style = (size, color = '#ffffff', extra = {}) => ({ fontSize: `${size}px`, color, fontFamily: FONT, ...extra });

/** Premium button: dark glass, gold trim, soft top highlight. Returns { set, setEnabled, setVisible, destroy }. */
export function button(scene, x, y, w, h, label, onClick, opts = {}) {
  const depth = opts.depth ?? 10;
  const g = scene.add.graphics().setDepth(depth);
  const base = opts.fill ?? 0x1c2a3a;
  const trim = opts.stroke ?? 0xd4b06a;
  const r = Math.min(12, h / 2);
  const draw = (hover = false, on = true) => {
    const top = Phaser.Display.Color.ValueToColor(base).brighten(hover ? 28 : 16).color;
    const bot = Phaser.Display.Color.ValueToColor(base).darken(18).color;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x - w / 2 + 2, y - h / 2 + 4, w, h, r);
    g.fillGradientStyle(top, top, bot, bot, on ? 1 : 0.5).fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
    g.fillStyle(0xffffff, hover ? 0.14 : 0.08).fillRoundedRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h * 0.42, { tl: r - 2, tr: r - 2, bl: 2, br: 2 });
    g.lineStyle(2, trim, on ? (hover ? 1 : 0.85) : 0.35).strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    g.lineStyle(1, 0xffffff, 0.08).strokeRoundedRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, Math.max(2, r - 3));
  };
  draw();
  const zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(depth + 1);
  const text = scene.add.text(x, y, label, style(opts.size ?? 16, opts.color ?? '#f6ead2', { align: 'center', stroke: '#0b0f14', strokeThickness: 3 })).setOrigin(0.5).setDepth(depth + 1);
  let enabled = true;
  zone.on('pointerover', () => { if (enabled) draw(true); if (opts.tip) showTip(scene, opts.tip, x, y - h / 2 - 8); });
  zone.on('pointerout', () => { draw(false, enabled); hideTip(scene); });
  zone.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); if (enabled) { scene.tweens.add({ targets: text, scale: { from: 0.92, to: 1 }, duration: 120 }); onClick(); } });
  const api = {
    bg: g, text, zone,
    set(label2) { text.setText(label2); return api; },
    setEnabled(b) { if (b === enabled) return api; enabled = b; draw(false, b); text.setAlpha(b ? 1 : 0.55); return api; },
    setVisible(b) { g.setVisible(b); zone.setVisible(b); text.setVisible(b); if (b) zone.setInteractive(); else zone.disableInteractive(); return api; },
    destroy() { g.destroy(); zone.destroy(); text.destroy(); },
  };
  return api;
}

/** Small hover tooltip (one at a time). */
export function showTip(scene, msg, x, y) {
  hideTip(scene);
  const t = scene.add.text(0, 0, msg, style(13, '#f6ead2', { wordWrap: { width: 260 }, align: 'left' })).setDepth(5001);
  const w = t.width + 18, h = t.height + 12;
  const px = Math.max(8, Math.min(1272 - w, x - w / 2)), py = Math.max(8, y - h);
  const g = scene.add.graphics().setDepth(5000);
  g.fillStyle(0x0d141d, 0.95).fillRoundedRect(px, py, w, h, 8).lineStyle(1.5, 0xd4b06a, 0.9).strokeRoundedRect(px, py, w, h, 8);
  t.setPosition(px + 9, py + 6);
  scene.tipObjs = [g, t];
}
export function hideTip(scene) { scene.tipObjs?.forEach((o) => o.destroy()); scene.tipObjs = null; }

/** Icon chip with a tooltip (for synergies, bonds, relics, traits). */
export function chip(scene, x, y, label, tip, opts = {}) {
  const t = scene.add.text(0, 0, label, style(opts.size ?? 13, opts.color ?? '#f6ead2')).setDepth(opts.depth ?? 20);
  const w = t.width + 14, h = t.height + 6;
  const g = scene.add.graphics().setDepth((opts.depth ?? 20) - 1);
  g.fillStyle(opts.fill ?? 0x142131, 0.9).fillRoundedRect(x, y, w, h, h / 2).lineStyle(1.5, opts.stroke ?? 0xd4b06a, 0.8).strokeRoundedRect(x, y, w, h, h / 2);
  t.setPosition(x + 7, y + 3);
  const z = scene.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: !!opts.onClick }).setDepth((opts.depth ?? 20) + 1);
  if (tip) { z.on('pointerover', () => showTip(scene, tip, x + w / 2, y - 4)); z.on('pointerout', () => hideTip(scene)); }
  if (opts.onClick) z.on('pointerdown', (p, a, b, ev) => { ev?.stopPropagation?.(); opts.onClick(); });
  return { w, h, destroy() { g.destroy(); t.destroy(); z.destroy(); }, objs: [g, t, z] };
}

export function panel(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics().setDepth(opts.depth ?? 0);
  const a = opts.alpha ?? 0.9;
  g.fillStyle(0x000000, 0.3 * a).fillRoundedRect(x + 3, y + 5, w, h, opts.r ?? 14);
  g.fillGradientStyle(0x1a2636, 0x1a2636, 0x0d141d, 0x0d141d, a).fillRoundedRect(x, y, w, h, opts.r ?? 14);
  g.lineStyle(2, opts.stroke ?? 0xd4b06a, 0.75 * Math.min(1, a + 0.1)).strokeRoundedRect(x, y, w, h, opts.r ?? 14);
  g.lineStyle(1, 0xffffff, 0.06).strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, Math.max(4, (opts.r ?? 14) - 4));
  if (!opts.plain) for (const [cx, cy] of [[x + 14, y], [x + w - 14, y], [x + 14, y + h], [x + w - 14, y + h]]) g.fillStyle(0xd4b06a, 0.9).fillPoints([{ x: cx, y: cy - 4 }, { x: cx + 4, y: cy }, { x: cx, y: cy + 4 }, { x: cx - 4, y: cy }], true);
  return g;
}

export function title(scene, x, y, text, size = 40) {
  const t = scene.add.text(x, y, text, style(size, '#ffe6b0', { stroke: '#2a1a08', strokeThickness: Math.max(4, size / 7), fontStyle: 'bold' })).setOrigin(0.5);
  t.setShadow(0, 4, '#000000', 8, true, true);
  return t;
}

/**
 * Placeholder token for a unit: colored disc sized by stage, initial letter, stage ring, chimera split.
 * Uses an image instead when a texture `unit-<id>-<stage>` or `unit-<id>` exists (drop-in Grok art).
 */
/** 종 그림 한 장(도트가 있으면 그 단계 도트, 없으면 unit-<종> 그림). 덱·스테이지 선택 같은 카드용. size = 차지할 네모 한 변. */
export function speciesImage(scene, id, stage, x, y, size) {
  const dot = dotDataFor(scene, id, stage);
  const set = dot && dot.sets[dot.stages[stage]?.set];
  if (set) {
    const h = dot.foot + 1 - (set.top ?? 0);
    const img = scene.add.image(x, y + size / 2, dot.sheet, set.idle.frames[0]).setOrigin(0.5, (dot.foot + 1) / dot.frameH);
    img.setScale(Math.min((size * 0.95) / h, (size * 0.95) / dot.frameW));
    return img;
  }
  if (scene.textures.exists('unit-' + id)) return scene.add.image(x, y, 'unit-' + id).setDisplaySize(size, size);
  return null;
}

export function unitToken(scene, unit, data) {
  const c = scene.add.container(0, 0);
  const stageR = { young: 20, teen: 24, adult: 28, spirit: 30 }[unit.stage] ?? 26;
  const id = unit.kind === 'weak' ? null : unit.speciesId;
  // 도트 그림이 있으면 초상화도 그 단계 도트로(2026-11-26 PixelLab 확정본)
  const dot = id && unit.kind === 'base' ? dotDataFor(scene, id, unit.stage) : null;
  const dset = dot && dot.sets[dot.stages[unit.stage]?.set];
  const key = id && [`unit-${id}-${unit.stage}`, `unit-${id}`].find((k) => scene.textures.exists(k));
  if (dset) {
    if (unit.stage === 'spirit') c.add(scene.add.circle(0, 0, stageR * 1.35, COLORS.gold, 0.35).setStrokeStyle(3, COLORS.gold, 0.9));
    const img = scene.add.image(0, stageR * 0.9, dot.sheet, dset.idle.frames[0]).setOrigin(0.5, (dot.foot + 1) / dot.frameH);
    const h = dot.foot + 1 - (dset.top ?? 0), w = dot.frameW;
    img.setScale(Math.min((stageR * (unit.stage === 'spirit' ? 1.9 : 2.5)) / h, (stageR * 2.8) / w));
    c.add(img);
  } else if (key) {
    if (unit.stage === 'spirit') c.add(scene.add.circle(0, 0, stageR * 1.35, COLORS.gold, 0.35).setStrokeStyle(3, COLORS.gold, 0.9));
    if (unit.white) c.add(scene.add.circle(0, 0, stageR * 1.3, 0xffffff, 0.35));
    c.add(scene.add.image(0, -stageR * 0.2, key).setDisplaySize(stageR * 2.9, stageR * 2.9));
  } else if (unit.kind === 'weak' && unit.parts?.every((p) => dotDataFor(scene, p, 'adult') || scene.textures.exists('unit-' + p))) {
    // 약체 키메라: 두 동물의 성체 도트를 회색으로 겹침(예전 한 장 그림 unit-<종>은 묶음에서 뺌)
    unit.parts.forEach((p, i) => { const im = speciesImage(scene, p, 'adult', (i ? 1 : -1) * stageR * 0.45, -stageR * 1.1, stageR * 2); if (im) c.add(im.setTint(0x8a8a8a).setAngle(i ? 12 : -12)); });
    c.add(scene.add.text(0, -stageR * 0.3, '?', style(stageR, '#ffffff', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5));
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
  if (!key && !(unit.kind === 'weak' && c.list.length > 1)) {
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

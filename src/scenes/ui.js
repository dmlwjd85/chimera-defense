// Shared UI parts for all scenes. Look and colors live in theme.js (rules: docs/UI_규칙.md).
// Scenes draw buttons, boxes, tooltips and chips only through these helpers.
import Phaser from 'phaser';
import { FONT } from '../text.js';
import { dotDataFor } from './rigs.js';
import { INK, INK_CSS, THEME, VARIANTS, variantOf, drawButton, drawPanel, drawParchment, drawChip, textStyle } from './theme.js';

export { INK, INK_CSS, THEME, VARIANTS };
export const COLORS = { bg: 0x141a21, panel: THEME.wood.bot, line: THEME.wood.hi, accent: 0xffb35c, good: 0x58d68d, bad: 0xf0883e, flip: 0x5dade2, gold: 0xffd84d };
export const hex = (h) => Phaser.Display.Color.HexStringToColor(h ?? '#888888').color;
// 예전 검정 계열 글자 테두리는 모두 먹선 색으로 통일
const OLD_STROKES = new Set(['#000', '#000000', '#0b0f14', '#2a1a08', '#111', '#0b1a2b']);
export const style = (size, color = '#ffffff', extra = {}) => {
  const s = { fontSize: `${size}px`, color, fontFamily: FONT, ...extra };
  if (s.stroke && OLD_STROKES.has(String(s.stroke).toLowerCase())) s.stroke = INK_CSS;
  return s;
};

/**
 * Button: warm colored body, thick ink outline, a dark lip underneath (pressed = body sinks).
 * opts: { variant: 'wood'|'green'|'blue'|'purple'|'red'|'gold'|'locked', fill (old color, mapped to a variant), size, color, depth, tip }
 * Returns { bg, text, zone, set, setEnabled, setVisible, destroy }.
 */
export function button(scene, x, y, w, h, label, onClick, opts = {}) {
  const depth = opts.depth ?? 10;
  const g = scene.add.graphics().setDepth(depth);
  const variant = opts.variant ?? variantOf(opts.fill);
  const size = opts.size ?? 16;
  const text = scene.add.text(x, y, label, textStyle(FONT, size, opts.color ?? THEME.cream, { bold: true, extra: { align: 'center' } })).setOrigin(0.5).setDepth(depth + 1);
  let enabled = true, over = false;
  const draw = (s) => { if (!g.active) return; const dy = drawButton(g, x, y, w, h, variant, enabled ? s : 'off'); text.setY(y + (Number(dy) || 0)); };
  draw('idle');
  const zone = scene.add.zone(x, y, w, h + 4).setInteractive({ useHandCursor: true }).setDepth(depth + 1);
  zone.on('pointerover', () => { over = true; if (enabled) draw('hover'); if (opts.tip) showTip(scene, opts.tip, x, y - h / 2 - 8); });
  zone.on('pointerout', () => { over = false; draw('idle'); hideTip(scene); });
  zone.on('pointerdown', (p, lx, ly, ev) => {
    ev?.stopPropagation?.();
    if (!enabled) return;
    draw('down');
    scene.time?.delayedCall(110, () => draw(over ? 'hover' : 'idle'));
    onClick();
  });
  const api = {
    bg: g, text, zone,
    set(label2) { text.setText(label2); return api; },
    setEnabled(b) { if (b === enabled) return api; enabled = b; draw('idle'); text.setAlpha(b ? 1 : 0.6); return api; },
    setVisible(b) { g.setVisible(b); zone.setVisible(b); text.setVisible(b); if (b) zone.setInteractive(); else zone.disableInteractive(); return api; },
    destroy() { g.destroy(); zone.destroy(); text.destroy(); },
  };
  return api;
}

/** Small hover tooltip on parchment (one at a time). */
export function showTip(scene, msg, x, y) {
  hideTip(scene);
  const t = scene.add.text(0, 0, msg, style(13, THEME.parch.text, { wordWrap: { width: 260 }, align: 'left', lineSpacing: 2 })).setDepth(5001);
  const w = t.width + 20, h = t.height + 14;
  const px = Math.max(8, Math.min(1272 - w, x - w / 2)), py = Math.max(8, y - h);
  const g = drawParchment(scene.add.graphics().setDepth(5000), px, py, w, h, 8);
  t.setPosition(px + 10, py + 7);
  scene.tipObjs = [g, t];
}
export function hideTip(scene) { scene.tipObjs?.forEach((o) => o.destroy()); scene.tipObjs = null; }

/** Icon chip with a tooltip (for synergies, bonds, relics, traits). opts.stroke = accent color. */
export function chip(scene, x, y, label, tip, opts = {}) {
  const t = scene.add.text(0, 0, label, style(opts.size ?? 13, opts.color ?? THEME.cream, { stroke: INK_CSS, strokeThickness: 2 })).setDepth(opts.depth ?? 20);
  const w = t.width + 16, h = t.height + 8;
  const g = drawChip(scene.add.graphics().setDepth((opts.depth ?? 20) - 1), x, y, w, h, opts.stroke);
  t.setPosition(x + 8, y + 4);
  const z = scene.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: !!opts.onClick }).setDepth((opts.depth ?? 20) + 1);
  if (tip) { z.on('pointerover', () => showTip(scene, tip, x + w / 2, y - 4)); z.on('pointerout', () => hideTip(scene)); }
  if (opts.onClick) z.on('pointerdown', (p, a, b, ev) => { ev?.stopPropagation?.(); opts.onClick(); });
  return { w, h, destroy() { g.destroy(); t.destroy(); z.destroy(); }, objs: [g, t, z] };
}

/** Wood box (글 상자). opts: { depth, alpha, r, stroke (inner accent color), plain (no corner studs) }. Returns the Graphics. */
export function panel(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics().setDepth(opts.depth ?? 0);
  drawPanel(g, x, y, w, h, { alpha: opts.alpha ?? 0.95, r: opts.r, accent: opts.stroke, plain: opts.plain });
  return g;
}

/** Inset slot (cage cell, card cell). Drawn into an existing Graphics `g`; (x, y) = top-left. */
export function drawSlot(g, x, y, w, h, opts = {}) {
  const r = opts.r ?? 8, a = opts.alpha ?? 0.9;
  g.fillStyle(opts.fill ?? 0x2a1c14, a).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0x000000, 0.25 * a).fillRoundedRect(x + 2, y + 2, w - 4, Math.min(8, h / 4), { tl: r - 2, tr: r - 2, bl: 0, br: 0 });
  if (opts.accent != null) g.lineStyle(opts.accentW ?? 2, opts.accent, opts.accentA ?? 1).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3));
  g.lineStyle(opts.line ?? 2.5, INK, 1).strokeRoundedRect(x, y, w, h, r);
  return g;
}

/** Parchment box for modals and notes. Returns the Graphics. */
export function parchment(scene, x, y, w, h, opts = {}) {
  return drawParchment(scene.add.graphics().setDepth(opts.depth ?? 0), x, y, w, h, opts.r ?? 12);
}

/** Full-screen dimmer that also swallows clicks under a modal. */
export function dimmer(scene, depth = 3000, alpha = 0.6) {
  return scene.add.rectangle(640, 360, 1280, 720, 0x140c0a, alpha).setInteractive().setDepth(depth);
}

/** Heading text: gold fill, thick ink outline, hard drop shadow (no blur). */
export function title(scene, x, y, text, size = 40) {
  const t = scene.add.text(x, y, text, style(size, THEME.goldCss, { stroke: INK_CSS, strokeThickness: Math.max(4, Math.round(size / 6)), fontStyle: 'bold' })).setOrigin(0.5);
  t.setShadow(0, Math.max(3, Math.round(size / 12)), INK_CSS, 0, true, true);
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
  } else if (unit.kind === 'weak' && unit.parts?.every((p) => scene.textures.exists('unit-' + p))) {
    unit.parts.forEach((p, i) => c.add(scene.add.image((i ? 1 : -1) * stageR * 0.45, -stageR * 0.2, 'unit-' + p).setDisplaySize(stageR * 2, stageR * 2).setTint(0x8a8a8a).setAngle(i ? 12 : -12)));
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
  const bg = dimmer(scene, 4000, 0.6);
  objs.push(bg, panel(scene, 290, 120, 700, 480, { depth: 4001 }));
  objs.push(scene.add.text(640, 150, titleText, style(24, THEME.goldCss, { stroke: INK_CSS, strokeThickness: 5, fontStyle: 'bold' })).setOrigin(0.5).setDepth(4002));
  let y = 190;
  for (const [t, col] of lines) { const o = scene.add.text(320, y, t, style(16, col ?? THEME.cream, { wordWrap: { width: 640 } })).setDepth(4002); objs.push(o); y += o.height + 6; }
  const close = () => { objs.forEach((o) => o.destroy()); b.destroy(); scene.modalOpen = false; onClose?.(); };
  const b = button(scene, 640, 560, 160, 48, '닫기', close, { depth: 4003 });
  return close;
}

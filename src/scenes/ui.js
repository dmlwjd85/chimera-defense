// Shared drawing helpers for all scenes (placeholder art: shapes and text, swappable for images later).
import Phaser from 'phaser';
import { FONT } from '../text.js';
import { slimeDot, dotDataFor } from './rigs.js';
import { autoTint } from '../logic/genes.js';

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

const autoLook = (scene, unit, data) => { const r = data.recipeById?.[unit.speciesId]; return !!(r?.auto && (dotDataFor(scene, r.look, 'adult') || scene.textures.exists('unit-' + r.look))); };

export function unitToken(scene, unit, data) {
  const c = scene.add.container(0, 0);
  const stageR = { young: 20, teen: 24, adult: 28, spirit: 30 }[unit.stage] ?? 26;
  const id = unit.kind === 'weak' ? null : unit.speciesId;
  // 도트 그림이 있으면 초상화도 그 단계 도트로(2026-11-26 PixelLab 확정본)
  // 자동 키메라 정식 그림·돌연변이 슬라임(PixelLab 동작 시트가 불러와져 있을 때)도 초상화를 그 도트로
  const dot = id && unit.kind === 'base' ? dotDataFor(scene, id, unit.stage)
    : unit.kind === 'chimera' ? dotDataFor(scene, unit.speciesId, 'adult')   // 자동·이야기 키메라 정식 그림(없으면 null → 예전 그림)
    : unit.kind === 'weak' ? slimeDot(scene, unit) : null;
  const dset = dot && dot.sets[dot.stages[unit.kind === 'base' ? unit.stage : 'adult']?.set];
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
  } else if (unit.kind === 'weak' && unit.parts?.length === 2) {
    // 염색체 돌연변이 슬라임(2026-11-27): 두 부모 색이 얼룩진 도트 젤리. 말랑말랑 흔들림
    const img = slimeImage(scene, unit.parts.map((p) => data.unitById[p]?.color ?? '#888888'), stageR * 2.4);
    img.setY(stageR * 0.9);
    c.add(img);
    scene.tweens?.add({ targets: img, scaleY: img.scaleY * 0.9, scaleX: img.scaleX * 1.06, duration: 520 + ((unit.uid ?? 0) % 5) * 40, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  } else if (unit.kind === 'chimera' && autoLook(scene, unit, data)) {
    // 자동 키메라: 힘센 쪽 성체 도트(다른 쪽 색) + 작은 다른 쪽, 보라 테두리
    const r = data.recipeById[unit.speciesId];
    c.add(scene.add.circle(0, 0, stageR * 1.25, 0xb388ff, 0.22).setStrokeStyle(3, 0xb388ff, 0.9));
    const im = speciesImage(scene, r.look, 'adult', 0, -stageR * 1.05, stageR * 2.3);
    if (im) c.add(im.setTint(autoTint(r, data)));
    const side = speciesImage(scene, r.tintOf, 'adult', stageR * 0.85, stageR * 0.15, stageR * 0.9);
    if (side) c.add(side);
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
  // 그림(도트)이 있으면 글자를 얹지 않음 — 도감 그림 위 한글 글자 지우기
  if (!key && !dset && !(unit.kind === 'weak' && c.list.length > 0) && !(unit.kind === 'chimera' && autoLook(scene, unit, data))) {
    const letter = unit.kind === 'weak' ? '?' : unit.kind === 'chimera' ? data.recipeById[unit.speciesId].name[0] : data.unitById[id].name[0];
    c.add(scene.add.text(0, 0, letter, style(stageR, '#111111', { fontStyle: 'bold' })).setOrigin(0.5));
  }
  return c;
}

// 슬라임 도트(14×11): o 테두리 · b 몸 · l 밝은 몸 · w 반짝 · e 눈 · m 입 · A/B 부모 얼룩
const SLIME = [
  '.....oooo.....',
  '...oollllo....',
  '..olwwllbbo...',
  '.olwwlbbAAbo..',
  '.olllbbbAAbbo.',
  'olbebbbbbebbbo',
  'olbeebbbbeebbo',
  'obBBbbmmbbbbbo',
  'obBBbbbbbbAAbo',
  '.obbbbbbbbbbo.',
  '..oooooooooo..',
];
/** 슬라임 그림 한 장(부모 색 두 개). 같은 색 짝은 텍스처를 다시 씀. */
export function slimeImage(scene, [ca, cb], size) {
  const key = `slime-${ca}-${cb}`;
  if (!scene.textures.exists(key)) {
    const A = Phaser.Display.Color.HexStringToColor(ca), B = Phaser.Display.Color.HexStringToColor(cb);
    const mixC = (k, light) => Phaser.Display.Color.GetColor(Math.min(255, ((A.red + B.red) / 2) * k + light), Math.min(255, ((A.green + B.green) / 2) * k + light), Math.min(255, ((A.blue + B.blue) / 2) * k + light));
    const pal = { o: 0x1a1426, b: mixC(0.55, 70), l: mixC(0.55, 120), w: 0xffffff, e: 0x151018, m: 0x5a2030, A: A.color, B: B.color };
    const P = 6, g = scene.make.graphics({ x: 0, y: 0 }, false);
    SLIME.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch] != null) g.fillStyle(pal[ch], 1).fillRect(x * P, y * P, P, P); }));
    g.generateTexture(key, SLIME[0].length * P, SLIME.length * P);
    g.destroy();
  }
  const img = scene.add.image(0, 0, key).setOrigin(0.5, 1);
  img.setScale(size / (SLIME[0].length * 6));
  return img;
}

// 정비 화면 보상 버튼용 도트 아이콘(전장 도트와 같은 톤: 진한 테두리 + 3단 명암). 16칸
const PIX = {
  meat: { pal: { o: 0x2a1810, r: 0xb4502e, R: 0xe8875a, h: 0xffc9a0, w: 0xf6efdc, g: 0xc9bfa6 }, rows: [
    '................', '........oooo....', '.......orRRro...', '......orRhhRro..', '.....orRhRRRrro.', '.....orRRRRrrro.', '.....orrRRrrrro.', '......orrrrrro..',
    '.....oworrrro...', '....owwgoooo....', '...owwgo........', '.oowwgo.........', 'owwwwgo.........', 'owwggo..........', '.oooo...........', '................'] },
  gem: { pal: { o: 0x1c1430, W: 0xffffff, l: 0xe3d0ff, m: 0xb58cff, d: 0x7a4fd6, D: 0x4b2a8f, s: 0xfff6a0 }, rows: [
    '..s.............', '.sss....oooooo..', '..s....oWllmmdo.', '......oWlllmmddo', '.....oooooooooooo'.slice(0, 16), '.....oWllllmmmdo', '......oWlllmmdo.', '.......oWlmmdo..',
    '........oWmdo...', '.........oWo....', '..........o.....', '............s...', '...........sss..', '............s...', '................', '................'] },
  coin: { pal: { o: 0x3a2a08, y: 0xf2c33a, Y: 0xffe58a, d: 0xb8860b, w: 0xffffff }, rows: [
    '................', '.....oooooo.....', '...ooyyyyyyoo...', '..oyYYyyyyyydo..', '..oYwYyyyyyydo..', '.oyYYyyddyyyydo.', '.oyYyyd..dyyydo.', '.oyyyyd..dyyydo.',
    '.oyyyyyddyyyydo.', '.oyyyyyyyyyyydo.', '..oyyyyyyyyydo..', '..odyyyyyyyddo..', '...oodddddddoo..', '.....oooooo.....', '................', '................'] },
};
/** 도트 아이콘 이미지(meat 고기 · gem 유물 · coin 금화). size = 한 변 px */
/** 유물 아이콘(PixelLab, assets/ui/relic-<id>.png, 2026-11-27). 없으면 이모지 글자 */
export function relicIcon(scene, r, x, y, size) {
  const key = 'relic-' + r.id;
  if (scene.textures.exists(key)) { scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST); return scene.add.image(x, y, key).setDisplaySize(size, size); }
  return scene.add.text(x, y, r.icon, { fontSize: Math.round(size * 0.8) + 'px' }).setOrigin(0.5);
}

export function pixIcon(scene, name, x, y, size) {
  // PixelLab 아이콘(assets/ui/icon-<이름>.png, 2026-11-27)이 있으면 그걸로, 없으면 아래 16칸 코드 도트
  const art = 'icon-' + name;
  if (scene.textures.exists(art)) { scene.textures.get(art).setFilter(Phaser.Textures.FilterMode.NEAREST); return scene.add.image(x, y, art).setDisplaySize(size, size); }
  const def = PIX[name], key = 'pix-' + name;
  if (!def) return null;
  if (!scene.textures.exists(key)) {
    const P = 4, g = scene.make.graphics({ x: 0, y: 0 }, false);
    def.rows.forEach((row, yy) => [...row].forEach((ch, xx) => { const c = def.pal[ch]; if (c != null) g.fillStyle(c, 1).fillRect(xx * P, yy * P, P, P); }));
    g.generateTexture(key, 16 * P, 16 * P);
    g.destroy();
  }
  return scene.add.image(x, y, key).setDisplaySize(size, size);
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

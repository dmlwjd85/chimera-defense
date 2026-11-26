export const INK = 0x291a1f;
export const INK_CSS = '#291a1f';
export const THEME = {
  wood: { top: 0x6b4a33, bot: 0x4a3222, hi: 0xa8794f },
  parch: { top: 0xf6e7c4, bot: 0xead29f, text: '#3b2618' },
  gold: 0xffd45a, goldCss: '#ffd45a', cream: '#fff4dc',
  size: { title: 40, head: 24, btn: 20, body: 16, small: 13 },
  line: { panel: 4, btn: 3, chip: 2 },
  radius: { panel: 12 },
  shadow: { dy: 4, alpha: 0.35 },
};
export const VARIANTS = { wood: 0xa8703f, green: 0x5fae3c, blue: 0x3f86d1, purple: 0x8a55c9, red: 0xc8493a, gold: 0xe0a93a, locked: 0x857a6c };

export function shade(color, amt) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return ((f(r) << 16) | (f(g) << 8)) | f(b);
}

export function toHsl(color) {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  let s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return { h: h * 60, s, l };
}

export function variantOf(fill) {
  if (fill == null || fill === undefined) return 'wood';
  const hsv = toHsl(fill);
  if (hsv.s < 0.08) return 'locked';
  if (hsv.s < 0.38) return 'wood';
  const h = hsv.h;
  if (h < 20 || h >= 330) return 'red';
  if (h >= 20 && h < 55) return 'gold';
  if (h >= 55 && h < 170) return 'green';
  if (h >= 170 && h < 250) return 'blue';
  return 'purple';
}

export function drawButton(g, x, y, w, h, variant, state) {
  g.clear();
  const base = state === 'off' ? VARIANTS.locked : (VARIANTS[variant] ?? VARIANTS.wood);
  const r = Math.min(12, Math.round(h / 4), w / 2, h / 2);
  const lip = h < 32 ? 3 : 4;

  // Shadow
  if (state !== 'down') {
    g.fillStyle(0x000000, THEME.shadow.alpha);
    g.fillRoundedRect(x - w / 2, y - h / 2 + lip + 3, w, h, r);
  }

  // Lip
  if (state !== 'down') {
    const lipColor = shade(base, -0.45);
    g.fillStyle(lipColor, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2 + lip, w, h, r);
    g.lineStyle(h < 32 ? 2 : THEME.line.btn, INK, 1);
    g.strokeRoundedRect(x - w / 2, y - h / 2 + lip, w, h, r);
  }

  // Body
  const dy = state === 'down' ? lip : state === 'hover' ? -1 : 0;
  let bodyColor = base;
  if (state === 'off') bodyColor = VARIANTS.locked;
  else if (state === 'hover') bodyColor = shade(base, 0.12);

  g.fillStyle(bodyColor, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2 + dy, w, h, r);

  // Top highlight
  const highlightY = y - h / 2 + dy + 3;
  g.fillStyle(shade(bodyColor, 0.22), 1);
  g.fillRoundedRect(x - w / 2 + 3, highlightY, w - 6, Math.round(h * 0.45), { tl: Math.max(0, r - 2), tr: Math.max(0, r - 2), bl: 2, br: 2 });

  // Top edge
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(x - w / 2 + r, highlightY, w - 2 * r, 2);

  // Outer dark line
  g.lineStyle(h < 32 ? 2 : THEME.line.btn, INK, 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2 + dy, w, h, r);

  return dy;
}

export function drawPanel(g, x, y, w, h, opts = {}) {
  const alpha = opts.alpha ?? 1;
  const r = Math.min(opts.r ?? THEME.radius.panel, w / 2, h / 2);
  const ri = Math.max(2, r - 4);
  // hard drop shadow
  g.fillStyle(0x000000, THEME.shadow.alpha * alpha);
  g.fillRoundedRect(x, y + THEME.shadow.dy, w, h, r);
  // dark wood frame, lighter wood face inside it
  g.fillStyle(THEME.wood.bot, alpha);
  g.fillRoundedRect(x, y, w, h, r);
  if (w > 16 && h > 16) {
    g.fillStyle(THEME.wood.top, alpha);
    g.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, ri);
    // inner light line around the face
    g.lineStyle(2, opts.accent ?? THEME.wood.hi, 0.9 * alpha);
    g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, ri);
  }
  // outer ink line
  g.lineStyle(THEME.line.panel, INK, Math.min(1, alpha + 0.15));
  g.strokeRoundedRect(x, y, w, h, r);
  // gold studs in the corners (big panels only)
  if (!opts.plain && w >= 120 && h >= 60) {
    for (const [cx, cy] of [[x + 11, y + 11], [x + w - 11, y + 11], [x + 11, y + h - 11], [x + w - 11, y + h - 11]]) {
      g.fillStyle(THEME.gold, 1).fillCircle(cx, cy, 3);
      g.lineStyle(1.5, INK, 0.8).strokeCircle(cx, cy, 3);
    }
  }
  return g;
}

export function drawParchment(g, x, y, w, h, r = 10) {
  // Shadow
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x, y + 3, w, h, r);

  // Background
  g.fillStyle(THEME.parch.bot, 1);
  g.fillRoundedRect(x, y, w, h, r);

  // Top highlight
  const topY = y + 2;
  g.fillStyle(THEME.parch.top, 1);
  g.fillRoundedRect(x + 2, topY, w - 4, Math.round(h * 0.55), { tl: r - 2, tr: r - 2, bl: 0, br: 0 });

  // Outer dark line
  g.lineStyle(2.5, INK, 1);
  g.strokeRoundedRect(x, y, w, h, r);

  return g;
}

export function drawChip(g, x, y, w, h, accent) {
  const r = Math.min(h / 2, w / 2);
  const chipAccent = accent ?? THEME.wood.hi;

  // Background (almond shape)
  g.fillStyle(THEME.wood.bot, 0.95);
  g.fillRoundedRect(x, y, w, h, r);

  // Inner light line (1px inset)
  const innerW = Math.max(2, w - 2);
  const innerH = Math.max(2, h - 2);
  const innerR = Math.min(innerH / 2, innerW / 2);
  g.lineStyle(1.5, chipAccent, 1);
  g.strokeRoundedRect(x + 1, y + 1, innerW, innerH, innerR);

  // Outer dark line
  g.lineStyle(2, INK, 1);
  g.strokeRoundedRect(x, y, w, h, r);

  return g;
}

export function textStyle(font, size, color = '#fff4dc', opts = {}) {
  const isBold = opts.bold === true;
  let strokeThickness = 0;
  if (opts.stroke !== false) {
    strokeThickness = Math.max(2, Math.round(size / 5));
  }

  return {
    fontFamily: font,
    fontSize: `${size}px`,
    color,
    fontStyle: isBold ? 'bold' : 'normal',
    stroke: INK_CSS,
    strokeThickness,
    ...opts.extra,
  };
}

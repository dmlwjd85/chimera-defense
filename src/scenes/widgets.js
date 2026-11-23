import { FONT } from '../text.js';

/**
 * Confirmation dialog box with yes/no buttons.
 * @param {Phaser.Scene} scene - The current scene instance.
 * @param {string} message - Text to display in the dialog.
 * @param {string} yesLabel - Label for the yes button.
 * @param {string} noLabel - Label for the no button.
 * @param {Function} onYes - Callback executed when yes is clicked.
 * @returns {boolean} true if dialog created, false if already open.
 */
export function confirmBox(scene, message, yesLabel, noLabel, onYes) {
  if (scene.modalOpen) return false;

  scene.modalOpen = true;
  const savedPaused = scene.paused;
  scene.paused = true;

  // Background overlay
  const bg = scene.add.rectangle(640, 360, 1280, 720).setFillStyle(0x000000, 0.55).setInteractive();

  // Panel
  const panel = scene.add.rectangle(640, 360, 640, 260)
    .setFillStyle(0x22303c)
    .setStrokeStyle(2, 0xffffff);

  // Message text
  const msg = scene.add.text(640, 315, message, {
    fontFamily: FONT,
    fontSize: '20px',
    color: '#ffffff',
    align: 'center',
    wordWrap: { width: 590 }
  }).setOrigin(0.5).setDepth(3002);

  // Yes button
  const yesBtn = scene.add.rectangle(540, 445, 160, 56)
    .setFillStyle(0x2e8b57)
    .setInteractive({ useHandCursor: true });

  const yesText = scene.add.text(540, 445, yesLabel, {
    fontFamily: FONT,
    fontSize: '22px',
    color: '#ffffff',
    align: 'center'
  }).setOrigin(0.5).setDepth(3002);

  // No button
  const noBtn = scene.add.rectangle(740, 445, 160, 56)
    .setFillStyle(0x7f8c8d)
    .setInteractive({ useHandCursor: true });

  const noText = scene.add.text(740, 445, noLabel, {
    fontFamily: FONT,
    fontSize: '22px',
    color: '#ffffff',
    align: 'center'
  }).setOrigin(0.5).setDepth(3002);

  // Set depths for proper layering
  bg.setDepth(3000);
  panel.setDepth(3001);
  yesBtn.setDepth(3002);
  noBtn.setDepth(3002);

  const objs = [bg, panel, msg, yesBtn, yesText, noBtn, noText];

  function close() {
    objs.forEach((o) => o.destroy());
    scene.modalOpen = false;
    scene.paused = savedPaused;
  }

  yesBtn.on('pointerdown', () => {
    close();
    if (typeof onYes === 'function') onYes();
  });

  noBtn.on('pointerdown', close);

  return true;
}

/**
 * Display an information card on the right side of the screen.
 * @param {Phaser.Scene} scene - The current scene instance.
 * @param {string} title - Card title text.
 * @param {string} subtitle - Subtitle text (yellow color).
 * @param {Array<string>} lines - Array of line strings to display below subtitle.
 */
export function showInfoCard(scene, title, subtitle, lines) {
  hideInfoCard(scene);

  const panel = scene.add.rectangle(1010, 70, 260, 220).setFillStyle(0x000000, 0.7).setOrigin(0, 0);

  const titleText = scene.add.text(1022, 80, title, {
    fontFamily: FONT,
    fontSize: '18px',
    color: '#ffffff'
  }).setDepth(1801);

  const subtitleText = scene.add.text(1022, 106, subtitle, {
    fontFamily: FONT,
    fontSize: '14px',
    color: '#ffd84d'
  }).setDepth(1801);

  let currentY = 132;
  const lineObjects = lines.map(line => {
    const textObj = scene.add.text(1022, currentY, line, {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#dddddd',
      wordWrap: { width: 240 }
    }).setOrigin(0, 0).setDepth(1801);
    currentY += textObj.height + 4;
    return textObj;
  });

  scene.infoCard = [panel, titleText, subtitleText, ...lineObjects];
  panel.setDepth(1800);
}

/**
 * Hide the information card if it exists.
 * @param {Phaser.Scene} scene - The current scene instance.
 */
export function hideInfoCard(scene) {
  if (scene.infoCard) {
    scene.infoCard.forEach(obj => obj.destroy());
    scene.infoCard = null;
  }
}

/**
 * Highlight a range on the screen with a semi-transparent fill.
 * @param {Phaser.Scene} scene - The current scene instance.
 * @param {number} x1 - Left coordinate of the range.
 * @param {number} x2 - Right coordinate of the range.
 * @param {number} y - Vertical position (center).
 * @param {number} h - Height of the highlighted area.
 */
export function showRange(scene, x1, x2, y, h, melee = false) {
  hideRange(scene);

  const gfx = scene.add.graphics();
  const col = melee ? 0xff8a65 : 0xffeb3b;
  gfx.fillStyle(col, 0.22).fillRoundedRect(x1, y - h / 2, x2 - x1, h, 10);
  gfx.lineStyle(2, col, 0.9).strokeRoundedRect(x1, y - h / 2, x2 - x1, h, 10);
  for (let k = x1 + 10; k < x2 - 6; k += 14) gfx.fillStyle(col, 0.5).fillCircle(k, y + h / 2 - 6, 1.5);
  scene.rangeGfx = gfx;
  gfx.setDepth(5);
}

/**
 * Hide the range highlight if it exists.
 * @param {Phaser.Scene} scene - The current scene instance.
 */
export function hideRange(scene) {
  if (scene.rangeGfx) {
    scene.rangeGfx.destroy();
    scene.rangeGfx = null;
  }
}

/**
 * Create a highlighted circle ring around a point, optionally with a question mark.
 * @param {Phaser.Scene} scene - The current scene instance.
 * @param {number} x - Center X coordinate of the circle.
 * @param {number} y - Center Y coordinate of the circle.
 * @param {number} color - Color for the stroke (e.g., 0x2e8b57).
 * @param {boolean} question - Whether to display a '?' mark at center.
 * @returns {Array<Phaser.DisplayObject>} Array containing [circle, questionMark].
 */
export function highlightRing(scene, x, y, color, question) {
  const circle = scene.add.circle(x, y, 34).setStrokeStyle(4, color);

  let questionMark = null;
  if (question) {
    questionMark = scene.add.text(x, y, '?', {
      fontFamily: FONT,
      fontSize: '28px',
      color: '#ffffff'
    }).setOrigin(0.5).setDepth(901);
  }

  circle.setDepth(900);

  return [circle, questionMark].filter(Boolean);
}

/**
 * 고르기 창: 겹쳐 놓았을 때 할 수 있는 일만 버튼으로 보여 준다 (되돌릴 수 없는 일은 꼭 확인).
 * options: [{ icon, label, sub, color, onPick }]; '취소' is added automatically.
 */
export function choiceBox(scene, titleText, lines, options) {
  if (scene.modalOpen) return false;
  scene.modalOpen = true;
  const savedPaused = scene.paused;
  scene.paused = true;
  const objs = [];
  const D = 3000;
  const W = 600, rowH = 64, H = 120 + lines.length * 24 + (options.length + 1) * (rowH + 8);
  const x0 = 640 - W / 2, y0 = Math.max(40, 360 - H / 2);
  objs.push(scene.add.rectangle(640, 360, 1280, 720, 0x05080c, 0.62).setInteractive().setDepth(D));
  const g = scene.add.graphics().setDepth(D + 1);
  g.fillStyle(0x000000, 0.35).fillRoundedRect(x0 + 4, y0 + 6, W, H, 16);
  g.fillGradientStyle(0x1a2636, 0x1a2636, 0x0d141d, 0x0d141d, 1).fillRoundedRect(x0, y0, W, H, 16);
  g.lineStyle(2, 0xd4b06a, 0.9).strokeRoundedRect(x0, y0, W, H, 16);
  objs.push(g);
  const tt = scene.add.text(640, y0 + 30, titleText, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffe6b0', stroke: '#2a1a08', strokeThickness: 4 }).setOrigin(0.5).setDepth(D + 2);
  objs.push(tt);
  let y = y0 + 62;
  for (const [t, col] of lines) { const o = scene.add.text(640, y, t, { fontFamily: FONT, fontSize: '14px', color: col ?? '#cfd8dc', align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0).setDepth(D + 2); objs.push(o); y += o.height + 6; }
  y += 6;
  const close = () => { objs.forEach((o) => o.destroy()); scene.modalOpen = false; scene.paused = savedPaused; };
  const all = [...options, { icon: '✕', label: '취소', sub: '아무것도 안 함', color: 0x7f8c8d, onPick: () => {} }];
  all.forEach((o, i) => {
    const by = y + i * (rowH + 8);
    const bg = scene.add.graphics().setDepth(D + 2);
    const draw = (hover) => { bg.clear(); bg.fillStyle(o.color, hover ? 0.38 : 0.2).fillRoundedRect(x0 + 24, by, W - 48, rowH, 12); bg.lineStyle(2, o.color, hover ? 1 : 0.75).strokeRoundedRect(x0 + 24, by, W - 48, rowH, 12); };
    draw(false);
    const ic = scene.add.text(x0 + 58, by + rowH / 2, o.icon, { fontFamily: FONT, fontSize: '26px' }).setOrigin(0.5).setDepth(D + 3);
    const lb = scene.add.text(x0 + 92, by + 10, o.label, { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#ffffff' }).setDepth(D + 3);
    const sb = scene.add.text(x0 + 92, by + 36, o.sub ?? '', { fontFamily: FONT, fontSize: '12px', color: '#cfd8dc', wordWrap: { width: W - 150 } }).setDepth(D + 3);
    const z = scene.add.zone(640, by + rowH / 2, W - 48, rowH).setInteractive({ useHandCursor: true }).setDepth(D + 4);
    z.on('pointerover', () => draw(true)); z.on('pointerout', () => draw(false));
    z.on('pointerdown', (p, a, b, ev) => { ev?.stopPropagation?.(); close(); o.onPick(); });
    objs.push(bg, ic, lb, sb, z);
  });
  scene.input.keyboard?.once('keydown-ESC', () => { if (objs[0].active) close(); });
  return true;
}

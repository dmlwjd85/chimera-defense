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
  const panel = scene.add.rectangle(640, 360, 560, 220)
    .setFillStyle(0x22303c)
    .setStrokeStyle(2, 0xffffff);

  // Message text
  const msg = scene.add.text(640, 320, message, {
    fontFamily: FONT,
    fontSize: '20px',
    color: '#ffffff',
    align: 'center',
    wordWrap: { width: 500 }
  }).setOrigin(0.5).setDepth(3002);

  // Yes button
  const yesBtn = scene.add.rectangle(540, 420, 160, 56)
    .setFillStyle(0x2e8b57)
    .setInteractive({ useHandCursor: true });

  const yesText = scene.add.text(540, 420, yesLabel, {
    fontFamily: FONT,
    fontSize: '22px',
    color: '#ffffff',
    align: 'center'
  }).setOrigin(0.5).setDepth(3002);

  // No button
  const noBtn = scene.add.rectangle(740, 420, 160, 56)
    .setFillStyle(0x7f8c8d)
    .setInteractive({ useHandCursor: true });

  const noText = scene.add.text(740, 420, noLabel, {
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
export function showRange(scene, x1, x2, y, h) {
  hideRange(scene);

  const gfx = scene.add.graphics();
  gfx.fillStyle(0xffeb3b, 0.25).fillRect(x1, y - h / 2, x2 - x1, h);
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

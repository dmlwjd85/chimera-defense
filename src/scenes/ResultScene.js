import Phaser from 'phaser';
import { FONT } from '../text.js';

/** Result screen scene (key 'Result'). */
export default class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  /**
   * Create the result screen with title, stats, and buttons.
   * @param {object} d - Optional data: { result, wave, total, life }.
   */
  create(d) {
    // Default values if data is missing or incomplete
    d = (d && d.result) ? d : { result: 'lose', wave: 0, total: 15, life: 0 };

    const T = this.registry.get('T');

    // Title text based on result type
    const titleText = (d.result === 'clear') ? T('result.clear') : T('result.lose');
    const color = (d.result === 'clear') ? '#7CFC9A' : '#ff6b6b';
    this.add.text(640, 200, titleText, { fontSize: '64px', fontFamily: FONT, color }).setOrigin(0.5);

    // Wave and life information texts
    this.add.text(640, 300, T('result.wave', { wave: d.wave, total: d.total }), { fontSize: '28px', fontFamily: FONT, color: '#ffffff' }).setOrigin(0.5);
    this.add.text(640, 350, T('result.life', { life: d.life }), { fontSize: '24px', fontFamily: FONT, color: '#ffffff' }).setOrigin(0.5);

    // Retry button (Left) - no longer need to store reference
    this.makeButton(520, 480, T('result.retry'), () => this.scene.start('Battle'));

    // Title button (Right) - no longer need to store reference
    this.makeButton(760, 480, T('result.title'), () => this.scene.start('Title'));

    // Keyboard shortcuts: R for retry, ESC for title
    this.input.keyboard.on('keydown-R', () => this.scene.start('Battle'));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
  }

  /**
   * Helper method to create a styled button.
   * @param {number} x - X position (center).
   * @param {number} y - Y position (center).
   * @param {string} label - Button text.
   * @param {function} onClick - Click handler.
   * @returns {Phaser.GameObjects.Rectangle} The button graphics object.
   */
  makeButton(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 200, 64, 0x3a7bd5).setStrokeStyle(2, 0xffffff);
    const txt = this.add.text(x, y, label, { fontSize: '28px', fontFamily: FONT, color: '#ffffff' }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);

    return bg;
  }
}

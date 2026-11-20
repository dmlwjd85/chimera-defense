import Phaser from 'phaser';
import { FONT } from '../text.js';

export default class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const T = this.registry.get('T');
    const start = () => this.scene.start('Battle');

    this.add.text(640, 200, T('title.name'), { fontSize: '64px', color: '#ffffff', fontFamily: FONT }).setOrigin(0.5);
    this.add.text(640, 280, T('title.sub'), { fontSize: '28px', color: '#aabbcc', fontFamily: FONT }).setOrigin(0.5);

    const btn = this.add.rectangle(640, 460, 240, 70, 0x3a7bd5).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', start);
    this.add.text(640, 460, T('title.start'), { fontSize: '32px', color: '#ffffff', fontFamily: FONT }).setOrigin(0.5);
    this.input.keyboard.once('keydown-SPACE', start);

    const raw = this.registry.get('raw') || {};
    const count = Object.values(raw).filter((v) => v !== null).length;
    this.add.text(1270, 710, T('title.dataCount', { count }), { fontSize: '14px', color: '#888888', fontFamily: FONT }).setOrigin(1, 1);
  }
}

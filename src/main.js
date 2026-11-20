import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BattleScene from './scenes/BattleScene.js';
import { FONT } from './text.js';

class ResultPlaceholder extends Phaser.Scene {
  constructor() { super('Result'); }
  create(d) {
    this.add.text(640, 360, String(d?.result ?? ''), { fontSize: '48px', color: '#ffffff', fontFamily: FONT }).setOrigin(0.5);
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1b1f24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, BattleScene, ResultPlaceholder]
};

const game = new Phaser.Game(config);
window.__game = game;

import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BattleScene from './scenes/BattleScene.js';
import ResultScene from './scenes/ResultScene.js';
import StageSelectScene from './scenes/StageSelectScene.js';
import CodexScene from './scenes/CodexScene.js';
import UnlockScene from './scenes/UnlockScene.js';
import TalentScene from './scenes/TalentScene.js';
import { FONT } from './text.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1b1f24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, StageSelectScene, BattleScene, ResultScene, CodexScene, UnlockScene, TalentScene]
};

const game = new Phaser.Game(config);
window.__game = game;

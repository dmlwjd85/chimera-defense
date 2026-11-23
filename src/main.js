import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import BattleScene from './scenes/BattleScene.js';
import ResultScene from './scenes/ResultScene.js';
import StageSelectScene from './scenes/StageSelectScene.js';
import CodexScene from './scenes/CodexScene.js';
import UnlockScene from './scenes/UnlockScene.js';
import TalentScene from './scenes/TalentScene.js';
import DeckScene from './scenes/DeckScene.js';
import OpeningScene from './scenes/OpeningScene.js';
import { FONT } from './text.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1b1f24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, StageSelectScene, BattleScene, ResultScene, CodexScene, UnlockScene, TalentScene, OpeningScene, DeckScene]
};

const game = new Phaser.Game(config);
window.__game = game;

// 설치형 앱(PWA): 크롬 '앱 설치'와 오프라인 실행. 개발 서버에서는 켜지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; game.events.emit('installable'); });
window.addEventListener('appinstalled', () => { window.__installPrompt = null; game.events.emit('installed'); });

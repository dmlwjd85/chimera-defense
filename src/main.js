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

// 선명도: 화면이 1280x720보다 크게 보이면 내부 해상도를 2배로 그리고 카메라를 2배 확대한다(?k=1로 끔).
const qk = new URLSearchParams(location.search).get('k');
const fit = Math.min(window.innerWidth / 1280, window.innerHeight / 720) * (window.devicePixelRatio || 1);
const K = qk ? Math.max(1, Math.min(3, +qk || 1)) : fit > 1.15 ? 2 : 1;
window.__K = K;
if (K > 1) {
  const addText = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, t, s) { return addText.call(this, x, y, t, s).setResolution(K); };
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280 * K,
  height: 720 * K,
  backgroundColor: '#1b1f24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, StageSelectScene, BattleScene, ResultScene, CodexScene, UnlockScene, TalentScene, OpeningScene, DeckScene]
};

const game = new Phaser.Game(config);
window.__game = game;
if (K > 1) game.events.once('ready', () => { for (const s of game.scene.scenes) s.sys.events.on('start', () => { const cam = s.cameras.main; cam.setZoom(K); cam.centerOn(640, 360); }); });

// 설치형 앱(PWA): 크롬 '앱 설치'와 오프라인 실행. 개발 서버에서는 켜지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; game.events.emit('installable'); });
window.addEventListener('appinstalled', () => { window.__installPrompt = null; game.events.emit('installed'); });

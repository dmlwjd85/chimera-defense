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
// 폰(손가락 입력)은 메모리와 발열을 생각해 1.5배까지만.
const touch = window.matchMedia?.('(pointer: coarse)').matches;
const K = qk ? Math.max(1, Math.min(3, +qk || 1)) : fit > 1.15 ? (touch ? 1.5 : 2) : 1;
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

// Phaser는 한 프레임이 끝나야 다음 프레임을 예약하므로, 프레임 안에서 오류가 하나만 나도 게임이 영영 멈춘다.
// 프레임 함수를 감싸 오류를 기록하고 다음 프레임으로 넘어가게 한다(Game.start가 step을 묶기 전에 바꿔야 함).
const rawStep = Phaser.Game.prototype.step;
Phaser.Game.prototype.step = function (time, delta) { try { rawStep.call(this, time, delta); } catch (e) { reportError(e); } };

const game = new Phaser.Game(config);

// ---------- 멈춤 방지: 한 프레임에서 오류가 나도 게임 루프가 멈추지 않게 하고, 오류를 기록해 둔다 ----------
const ERR_KEY = 'chimera-defense-errors';
let lastErrAt = 0;
export function reportError(e, where = '') {
  try {
    const now = Date.now();
    if (now - lastErrAt < 2000) return; // 같은 오류가 프레임마다 쌓이지 않게
    lastErrAt = now;
    const list = JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
    const scenes = game.scene?.getScenes?.(true).map((s) => s.scene.key).join(',') ?? '';
    list.unshift({ at: new Date().toISOString(), where: where || scenes, msg: String(e?.message ?? e).slice(0, 200), stack: String(e?.stack ?? '').split('\n').slice(1, 4).join(' | ').slice(0, 400) });
    localStorage.setItem(ERR_KEY, JSON.stringify(list.slice(0, 8)));
  } catch { /* storage full or blocked */ }
  console.error('[chimera]', e);
}
window.__errors = () => JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, 'window'));
window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'promise'));
game.events.once('ready', () => {
  // 그래픽 장치가 끊기면(폰 메모리 부족 등) 진행을 저장하고 다시 불러옴
  game.canvas.addEventListener('webglcontextlost', () => { reportError(new Error('webgl context lost'), 'gpu'); try { const r = game.registry; localStorage.setItem('chimera-defense-save-v1', JSON.stringify(r.get('save'))); } catch { /* */ } setTimeout(() => location.reload(), 1500); }, false);
});
window.__game = game;
if (K > 1) game.events.once('ready', () => { for (const s of game.scene.scenes) s.sys.events.on('start', () => { const cam = s.cameras.main; cam.setZoom(K); cam.centerOn(640, 360); }); });

// 설치형 앱(PWA): 크롬 '앱 설치'와 오프라인 실행. 개발 서버에서는 켜지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; game.events.emit('installable'); });
window.addEventListener('appinstalled', () => { window.__installPrompt = null; game.events.emit('installed'); });

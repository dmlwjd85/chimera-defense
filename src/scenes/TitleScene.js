import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { defaultSave, writeSave } from '../logic/meta.js';
import { unlockAudio } from './sfx.js';

export default class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const save = this.registry.get('save');
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720);
    else this.drawBackdrop();
    if (this.textures.exists('fx-leaf')) this.add.particles(0, 0, 'fx-leaf', { x: { min: 0, max: 1280 }, y: -10, speedY: { min: 30, max: 70 }, speedX: { min: -20, max: 20 }, lifespan: 12000, frequency: 350, scale: { min: 0.3, max: 0.6 }, rotate: { start: 0, end: 360 }, tint: [0xffb3c6, 0x9ccc65, 0xffd36b], alpha: 0.8 });
    title(this, 640, 170, '키메라 디펜스', 68);
    this.add.text(640, 240, '지구의 심장을 지켜라 — 동화와 신화 속 짐승들의 대연합', style(22, '#e8d9b8', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5);
    const go = () => this.scene.start(save.openingSeen ? 'StageSelect' : 'Opening', { next: 'StageSelect' });
    button(this, 640, 350, 260, 64, '시작', go, { size: 26, fill: 0x3a7bd5 });
    button(this, 900, 350, 150, 48, '📖 이야기', () => this.scene.start('Opening', { next: 'Title' }), { size: 16, tip: '오프닝 다시 보기' });
    button(this, 640, 430, 260, 54, '도감', () => this.scene.start('Codex'), { size: 20 });
    button(this, 640, 500, 260, 54, '해금', () => this.scene.start('Unlock'), { size: 20 });
    // 크롬에서 설치할 수 있을 때만 보이는 '앱으로 설치' 버튼
    const inst = button(this, 640, 570, 260, 48, '📲 앱으로 설치', async () => {
      const p = window.__installPrompt; if (!p) return;
      p.prompt(); const r = await p.userChoice.catch(() => null);
      if (r?.outcome === 'accepted') inst.setVisible(false);
    }, { size: 18, fill: 0x2e5d3a, stroke: 0x9cff6b, tip: '바탕화면·홈 화면에 아이콘이 생기고 인터넷 없이도 실행돼요' });
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches;
    inst.setVisible(!!window.__installPrompt && !standalone);
    const onAble = () => inst.setVisible(!standalone);
    const onDone = () => inst.setVisible(false);
    this.game.events.on('installable', onAble); this.game.events.on('installed', onDone);
    this.events.once('shutdown', () => { this.game.events.off('installable', onAble); this.game.events.off('installed', onDone); });
    this.add.text(640, 575, `에센스 ${save.essence}   업적 ${save.achievements.length}/5`, style(18, '#ffd84d')).setOrigin(0.5);
    const reset = button(this, 1180, 690, 160, 36, '진행 초기화', () => {
      if (this.confirmReset) { this.registry.set('save', defaultSave()); writeSave(this.registry.get('storage'), this.registry.get('save')); this.scene.restart(); }
      else { this.confirmReset = true; reset.set('한 번 더 누르면 초기화'); }
    }, { size: 13, fill: 0x5c1f1f });
    this.add.text(20, 700, '조작: 스페이스 소환 · 1/2 배속 · P 일시정지', style(13, '#778899')).setOrigin(0, 0.5);
    this.input.keyboard.once('keydown-SPACE', () => { unlockAudio(); go(); });
    this.input.on('pointerdown', unlockAudio);
  }

  drawBackdrop() {
    const g = this.add.graphics();
    g.fillStyle(0x1c2a1f, 1).fillRect(0, 470, 1280, 250);
    g.fillStyle(0x2c3b2e, 1).fillRect(0, 610, 1280, 110);
    for (let i = 0; i < 14; i++) { const x = 40 + i * 95; g.fillStyle(0x0f1a12, 1).fillTriangle(x, 470, x + 45, 330 + (i % 3) * 30, x + 90, 470); }
  }
}

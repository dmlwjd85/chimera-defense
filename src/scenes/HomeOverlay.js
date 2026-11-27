// 어디서든 집으로(2026-11-27): 맨 위에 늘 떠 있는 작은 🏠 버튼. 처음 화면(Title)·로딩·오프닝에서는 숨김.
// 연전 중이면 한 번 물어보고(이번 판은 진 것으로 정리 — 찾은 도감은 남음) 처음 화면으로.
import Phaser from 'phaser';
import { button, style } from './ui.js';

const HIDE = new Set(['Boot', 'Title', 'Opening']);

export default class HomeOverlay extends Phaser.Scene {
  constructor() { super({ key: 'HomeOverlay', active: false }); }

  create() {
    this.btn = button(this, 30, 30, 44, 40, '🏠', () => this.goHome(), { depth: 10, size: 18, fill: 0x1c2a3a, tip: '처음 화면으로' });
    this.ask = null;
  }

  activeKeys() { return this.scene.manager.getScenes(true).map((s) => s.scene.key).filter((k) => k !== 'HomeOverlay'); }

  update() {
    const keys = this.activeKeys();
    const show = keys.length > 0 && !keys.some((k) => HIDE.has(k));
    this.btn.setVisible(show);
    if (!show) this.closeAsk();
    // 다른 장면이 새로 켜져도 늘 맨 위
    if (this.scene.manager.getIndex('HomeOverlay') < this.scene.manager.scenes.length - 1) this.scene.bringToTop();
  }

  goHome() {
    const g = this.scene.get('Gauntlet');
    const mid = this.scene.isActive('Gauntlet') && g?.state && g.state.phase !== 'ended' && !g.leaving;
    if (!mid) return this.leave();
    if (this.ask) return;
    // 연전 중: 한 번 물어봄
    const objs = [];
    objs.push(this.add.rectangle(640, 360, 1280, 720, 0x05080c, 0.7).setInteractive().setDepth(20));
    const p = this.add.graphics().setDepth(21); p.fillStyle(0x1c2a3a, 1).fillRoundedRect(390, 250, 500, 210, 16).lineStyle(3, 0xd4b06a, 1).strokeRoundedRect(390, 250, 500, 210, 16); objs.push(p);
    objs.push(this.add.text(640, 300, '🏠 처음 화면으로 갈까요?', style(24, '#ffe6b0')).setOrigin(0.5).setDepth(22));
    objs.push(this.add.text(640, 342, g.state.duel ? '이번 대결은 진 것으로 쳐요.' : '이번 판은 여기서 끝나요. 찾은 동물·도감은 남아요.', style(15, '#d8d2c2')).setOrigin(0.5).setDepth(22));
    const yes = button(this, 540, 410, 170, 48, '🏠 나가기', () => { this.closeAsk(); this.leave(g); }, { depth: 23, size: 18, fill: 0x8a3a14 });
    const no = button(this, 740, 410, 170, 48, '계속하기', () => this.closeAsk(), { depth: 23, size: 18, fill: 0x2f4f6f });
    this.ask = [...objs, yes, no];
  }

  closeAsk() { this.ask?.forEach((o) => o.destroy()); this.ask = null; }

  leave(g = null) {
    if (g?.quitHome) { g.quitHome(); return; }
    for (const k of this.activeKeys()) this.scene.stop(k);
    this.scene.start('Title');
    this.scene.bringToTop();
  }
}

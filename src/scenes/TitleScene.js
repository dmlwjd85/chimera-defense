import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { defaultSave, writeSave } from '../logic/meta.js';
import { unlockAudio } from './sfx.js';
import { showDebug } from './debug.js';

export default class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const save = this.registry.get('save');
    this.cameras.main.setBackgroundColor('#141a21');
    // 제목 배경: B7-C2 맞대결 포스터(제목 화면만). 없으면 예전 배경 → 그것도 없으면 도형 배경
    // (bg-title은 해금·결과·도감·스테이지 선택·덱·재능 화면이 흐린 배경으로 계속 씀)
    const bgKey = ['bg-title-c', 'bg-title'].find((k) => this.textures.exists(k));
    if (bgKey) this.add.image(640, 360, bgKey).setDisplaySize(1280, 720);
    else this.drawBackdrop();
    // 불티: 아래에서 올라가며 사라지는 주황·금빛 작은 불씨(예전 분홍·초록 나뭇잎 대신)
    if (this.textures.exists('fx-spark')) this.add.particles(0, 0, 'fx-spark', { x: { min: 0, max: 1280 }, y: 735, speedY: { min: -110, max: -40 }, speedX: { min: -18, max: 18 }, lifespan: { min: 4000, max: 7000 }, frequency: 110, scale: { start: 0.28, end: 0 }, alpha: { start: 0.95, end: 0 }, tint: [0xffb347, 0xffd36b, 0xff7a1a, 0xffe9a8], blendMode: 'ADD' }).setDepth(3);
    // 제목: 산군 귀와 왕관 사이 틈에 두 줄(불빛 글자 그림). 그림이 없으면 글자로
    if (this.textures.exists('title-logo-c')) this.add.image(591, 122, 'title-logo-c').setDisplaySize(304.5, 244).setDepth(5);
    else { title(this, 591, 64, '키메라', 72).setDepth(5); title(this, 591, 150, '디펜스', 72).setDepth(5); }
    showDebug(this, null);
    // 부제('지구의 심장을 지켜라…')는 선생님 결정(2026-11-26)으로 제목 화면에서 뺌
    const go = () => this.scene.start(save.openingSeen ? 'StageSelect' : 'Opening', { next: 'StageSelect' });
    button(this, 740, 686, 165, 49, '시작', go, { size: 24, fill: 0x3a7bd5 });
    button(this, 907, 686, 125, 40, '📖 이야기', () => this.scene.start('Opening', { next: 'Title' }), { size: 15, tip: '오프닝 다시 보기' });
    button(this, 1042, 686, 125, 40, '도감', () => this.scene.start('Codex'), { size: 18 });
    button(this, 1177, 686, 125, 40, '해금', () => this.scene.start('Unlock'), { size: 18 });
    // 크롬에서 설치할 수 있을 때만 보이는 '앱으로 설치' 버튼
    const inst = button(this, 740, 631, 165, 36, '📲 앱으로 설치', async () => {
      const p = window.__installPrompt; if (!p) return;
      p.prompt(); const r = await p.userChoice.catch(() => null);
      if (r?.outcome === 'accepted') inst.setVisible(false);
    }, { size: 15, fill: 0x2e5d3a, stroke: 0x9cff6b, tip: '바탕화면·홈 화면에 아이콘이 생기고 인터넷 없이도 실행됨' });
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches;
    inst.setVisible(!!window.__installPrompt && !standalone);
    const onAble = () => inst.setVisible(!standalone);
    const onDone = () => inst.setVisible(false);
    this.game.events.on('installable', onAble); this.game.events.on('installed', onDone);
    this.events.once('shutdown', () => { this.game.events.off('installable', onAble); this.game.events.off('installed', onDone); });
    this.add.text(1042, 636, `에센스 ${save.essence}   업적 ${save.achievements.length}/5`, style(18, '#ffd84d', { stroke: '#1a0b06', strokeThickness: 4 })).setOrigin(0.5);
    const reset = button(this, 1190, 26, 150, 32, '진행 초기화', () => {
      if (this.confirmReset) { this.registry.set('save', defaultSave()); writeSave(this.registry.get('storage'), this.registry.get('save')); this.scene.restart(); }
      else { this.confirmReset = true; reset.set('한 번 더 누르면 초기화'); }
    }, { size: 13, fill: 0x5c1f1f });
    this.add.text(20, 20, '조작: 스페이스 소환 · 1/2 배속 · P 일시정지', style(13, '#c8d0d8', { stroke: '#0b0f14', strokeThickness: 3 })).setOrigin(0, 0.5);
    this.input.keyboard.once('keydown-SPACE', () => { unlockAudio(); go(); });
    this.input.on('pointerdown', unlockAudio);
    // 최근 오류 기록(멈춤 점검용): 누르면 지움
    let errs = []; try { errs = JSON.parse(localStorage.getItem('chimera-defense-errors') || '[]'); } catch { /* */ }
    if (errs.length) {
      const e = errs[0];
      const t = this.add.text(20, 46, `⚠ 최근 오류 ${errs.length}건 · ${e.at.slice(5, 16).replace('T', ' ')} · ${e.where} · ${e.msg}`, style(12, '#ff9f9f', { wordWrap: { width: 900 } })).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { localStorage.removeItem('chimera-defense-errors'); t.destroy(); });
    }
  }

  drawBackdrop() {
    const g = this.add.graphics();
    g.fillStyle(0x1c2a1f, 1).fillRect(0, 470, 1280, 250);
    g.fillStyle(0x2c3b2e, 1).fillRect(0, 610, 1280, 110);
    for (let i = 0; i < 14; i++) { const x = 40 + i * 95; g.fillStyle(0x0f1a12, 1).fillTriangle(x, 470, x + 45, 330 + (i % 3) * 30, x + 90, 470); }
  }
}

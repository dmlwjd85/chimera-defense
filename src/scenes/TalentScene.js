import Phaser from 'phaser';
import { button, title, style, panel, showTip, hideTip, drawSlot, INK } from './ui.js';
import { drawPanel } from './theme.js';
import { buildData } from '../logic/data.js';
import { talentState, buyTalent, resetTalents, writeSave } from '../logic/meta.js';
import { sfx } from './sfx.js';

/** 스킬트리: 판이 끝나면 남는 유물 조각으로 여러 갈래의 특성을 차례로 찍는다. */
export default class TalentScene extends Phaser.Scene {
  constructor() { super('Talent'); }

  create(d) {
    this.back = d?.back ?? 'StageSelect';
    this.D = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.cameras.main.setBackgroundColor('#0e141b');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.3);
    title(this, 640, 52, '별자리 나무', 40);
    this.add.text(640, 92, '진 판의 유물 → 💎조각 · 가지마다 아래부터 하나씩', style(14, '#efe0c4')).setOrigin(0.5);
    panel(this, 1040, 28, 200, 44, { r: 22, plain: true });
    this.shardText = this.add.text(1140, 50, '', style(20, '#e0c3ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    this.layer = this.add.container(0, 0);
    button(this, 120, 670, 180, 46, '← 돌아가기', () => this.scene.start(this.back));
    button(this, 1140, 670, 200, 46, '↺ 전부 되돌리기', () => { const n = resetTalents(this.save, this.D); if (n) { writeSave(this.registry.get('storage'), this.save); sfx('down'); this.paint(); } }, { fill: 0x4a1a1a, stroke: 0xc0392b, size: 15, tip: '💎 전부 돌려받기' });
    this.input.keyboard.on('keydown-ESC', () => this.scene.start(this.back));
    this.paint();
  }

  paint() {
    hideTip(this);
    this.layer.removeAll(true);
    const { D, save } = this;
    this.shardText.setText(`💎 조각 ${save.shards ?? 0}`);
    const g = this.add.graphics(); this.layer.add(g);
    D.talents.branches.forEach((b, bi) => {
      const N = D.talents.branches.length, cw = Math.min(290, 1220 / N), x = 640 - (N * cw) / 2 + cw * (bi + 0.5), col = Phaser.Display.Color.HexStringToColor(b.color).color;
      const hw = cw / 2 - 8, nw = hw - 10;
      drawPanel(g, x - hw, 118, hw * 2, 520, { alpha: 0.92, accent: col, plain: true });
      this.layer.add(this.add.text(x, 142, `${b.icon} ${b.name}`, style(20, b.color, { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5));
      b.nodes.forEach((n, i) => {
        const y = 580 - i * 96, st = talentState(save, D, n.id);
        const owned = st.reason === 'owned', open = st.ok || st.reason === 'shards';
        if (i > 0) { g.lineStyle(5, owned ? col : 0x7a5a3e, owned ? 0.95 : 0.7).lineBetween(x - nw + 38, y + 34, x - nw + 38, y + 62); }
        drawSlot(g, x - nw, y - 34, nw * 2, 68, { r: 12, fill: owned ? col : 0x2a1c14, alpha: owned ? 0.45 : 0.95, accent: owned || open ? col : undefined, accentA: owned ? 1 : 0.7, accentW: owned ? 3 : 2 });
        g.fillStyle(owned ? col : 0x1c130e, owned ? 0.9 : 1).fillCircle(x - nw + 38, y, 24);
        g.lineStyle(3, INK, 1).strokeCircle(x - nw + 38, y, 24); if (owned || open) g.lineStyle(2, col, 1).strokeCircle(x - nw + 38, y, 21);
        const icon = this.add.text(x - nw + 38, y, owned || open ? n.icon : '🔒', style(22)).setOrigin(0.5).setAlpha(owned || open ? 1 : 0.6);
        const nm = this.add.text(x - nw + 70, y - 24, n.name, style(N > 5 ? 14 : 15, owned ? '#ffffff' : open ? '#e8eef2' : '#7f8c99')).setOrigin(0, 0);
        const ds = this.add.text(x - nw + 70, y - 1, n.desc, style(11, owned ? '#f3e6cc' : '#8fa1b3', { wordWrap: { width: nw * 2 - 76 } })).setOrigin(0, 0);
        const cost = this.add.text(x - nw + 38, y + 24, owned ? '✔' : `💎${st.cost}`, style(11, owned ? '#7CFC9A' : st.ok ? '#e0c3ff' : '#9aa7b3', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
        const z = this.add.zone(x, y, nw * 2, 68).setInteractive({ useHandCursor: st.ok });
        z.on('pointerover', () => showTip(this, `${n.name}\n${n.tale}\n· ${n.desc}${owned ? '' : st.ok ? '\n▶ 눌러서 밝히기' : st.reason === 'locked' ? '\n🔒 아래 별 먼저' : '\n💎 부족'}`, x, y - 40));
        z.on('pointerout', () => hideTip(this));
        z.on('pointerdown', () => {
          const r = buyTalent(save, D, n.id);
          if (!r.ok) { this.tweens.add({ targets: [icon, nm], x: '+=4', duration: 40, yoyo: true, repeat: 2 }); return; }
          writeSave(this.registry.get('storage'), save); sfx('evolve');
          this.paint();
          const star = this.add.star(x - nw + 38, y, 8, 10, 34, col, 0.9); this.layer.add(star);
          this.tweens.add({ targets: star, scale: 2.2, alpha: 0, angle: 90, duration: 500, onComplete: () => star.destroy() });
        });
        this.layer.add([icon, nm, ds, cost, z]);
      });
    });
  }
}

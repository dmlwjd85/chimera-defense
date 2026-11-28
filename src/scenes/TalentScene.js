import Phaser from 'phaser';
import { button, title, style, panel, showTip, hideTip } from './ui.js';
import { buildData } from '../logic/data.js';
import { talentState, buyTalent, resetTalents, writeSave, talentPoints, talentPointsMax } from '../logic/meta.js';

/** 등급만큼 쌓인 값으로 설명을 바꿈: '브루저 체력 +6%' × 2등급 → '브루저 체력 +12%' */
export const scaledDesc = (desc, rank) => (rank <= 1 ? desc : desc.replace(/\d+(\.\d+)?/, (m) => String(+(parseFloat(m) * rank).toFixed(1))));
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
    this.add.text(640, 92, '판이 끝나면 들고 있던 유물이 조각💎으로 돌아와요. 가지마다 아래 별부터, 별마다 3등급까지 밝혀요.', style(14, '#cfd8dc')).setOrigin(0.5);
    this.pointText = this.add.text(140, 50, '', style(18, '#ffe9a8', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    if (this.save.talentRefund) { const n = this.save.talentRefund; delete this.save.talentRefund; writeSave(this.registry.get('storage'), this.save); this.time.delayedCall(300, () => { const t = this.add.text(640, 360, `별자리 나무가 새로 짜였어요\n예전에 쓴 조각 💎${n}개를 돌려받았어요`, style(24, '#ffffff', { align: 'center', backgroundColor: '#1f2a4aee', padding: { x: 24, y: 16 }, stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(50); this.tweens.add({ targets: t, alpha: 0, delay: 3200, duration: 500, onComplete: () => t.destroy() }); }); }
    panel(this, 1040, 28, 200, 44, { r: 22, plain: true });
    this.shardText = this.add.text(1140, 50, '', style(20, '#e0c3ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    this.layer = this.add.container(0, 0);
    button(this, 120, 670, 180, 46, '← 돌아가기', () => this.scene.start(this.back));
    button(this, 1140, 670, 200, 46, '↺ 전부 되돌리기', () => { const n = resetTalents(this.save, this.D); if (n) { writeSave(this.registry.get('storage'), this.save); sfx('down'); this.paint(); } }, { fill: 0x4a1a1a, stroke: 0xc0392b, size: 15, tip: '쓴 조각을 모두 돌려받고 다시 찍기' });
    this.input.keyboard.on('keydown-ESC', () => this.scene.start(this.back));
    this.paint();
  }

  paint() {
    hideTip(this);
    this.layer.removeAll(true);
    const { D, save } = this;
    this.shardText.setText(`💎 조각 ${save.shards ?? 0}`);
    this.pointText.setText(`⭐ 밝힌 별 ${talentPoints(save)} / ${talentPointsMax(D)}`);
    const g = this.add.graphics(); this.layer.add(g);
    D.talents.branches.forEach((b, bi) => {
      const N = D.talents.branches.length, cw = Math.min(290, 1220 / N), x = 640 - (N * cw) / 2 + cw * (bi + 0.5), col = Phaser.Display.Color.HexStringToColor(b.color).color;
      const hw = cw / 2 - 8, nw = hw - 10;
      g.fillStyle(0x0d141d, 0.82).fillRoundedRect(x - hw, 118, hw * 2, 520, 16);
      g.lineStyle(2, col, 0.55).strokeRoundedRect(x - hw, 118, hw * 2, 520, 16);
      this.layer.add(this.add.text(x, 142, `${b.icon} ${b.name}`, style(20, b.color, { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5));
      b.nodes.forEach((n, i) => {
        const y = 580 - i * 96, st = talentState(save, D, n.id);
        const rank = st.rank ?? 0, max = st.max ?? 1, full = st.reason === 'owned', owned = rank > 0, open = st.ok || st.reason === 'shards' || owned;
        if (i > 0) { g.lineStyle(5, owned ? col : 0x3b4b5e, owned ? 0.95 : 0.7).lineBetween(x - nw + 38, y + 34, x - nw + 38, y + 62); }
        g.fillStyle(owned ? col : 0x1a2636, owned ? 0.14 + 0.07 * rank : 0.95).fillRoundedRect(x - nw, y - 34, nw * 2, 68, 12);
        g.lineStyle(full ? 3 : 2, owned || open ? col : 0x3b4b5e, full ? 1 : open ? 0.9 : 0.6).strokeRoundedRect(x - nw, y - 34, nw * 2, 68, 12);
        g.fillStyle(owned ? col : 0x0b1016, owned ? 0.9 : 1).fillCircle(x - nw + 38, y - 4, 22);
        g.lineStyle(2.5, owned || open ? col : 0x3b4b5e, 1).strokeCircle(x - nw + 38, y - 4, 22);
        const icon = this.add.text(x - nw + 38, y - 4, open ? n.icon : '🔒', style(21)).setOrigin(0.5).setAlpha(open ? 1 : 0.6);
        const nm = this.add.text(x - nw + 68, y - 27, n.name, style(N > 5 ? 14 : 15, owned ? '#ffffff' : open ? '#e8eef2' : '#7f8c99')).setOrigin(0, 0);
        const ds = this.add.text(x - nw + 68, y - 7, scaledDesc(n.desc, rank), style(11, owned ? '#eef3f5' : '#8fa1b3', { wordWrap: { width: nw * 2 - 74 }, lineSpacing: -1 })).setOrigin(0, 0);
        // 등급 점(●●○)과 다음 등급 값
        // 등급 점: 칸 오른쪽 위 테두리에 걸쳐서(이름과 안 겹치게)
        const pips = this.add.graphics();
        for (let k = 0; k < max; k++) { const px = x + nw - 14 - (max - 1 - k) * 13, py = y - 34; pips.fillStyle(0x0b1016, 1).fillCircle(px, py, 6); pips.fillStyle(k < rank ? col : 0x2a3648, 1).fillCircle(px, py, 4.5); pips.lineStyle(1.5, k < rank ? 0xffffff : 0x55667a, k < rank ? 0.9 : 0.8).strokeCircle(px, py, 4.5); }
        const cost = this.add.text(x - nw + 38, y + 25, full ? '✔ 끝' : `💎${st.cost}`, style(11, full ? '#7CFC9A' : st.ok ? '#e0c3ff' : '#9aa7b3', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
        const z = this.add.zone(x, y, nw * 2, 68).setInteractive({ useHandCursor: st.ok });
        const next = full ? '' : `\n다음 ${rank + 1}등급: ${scaledDesc(n.desc, rank + 1)} · 💎${st.cost}`;
        z.on('pointerover', () => showTip(this, `${n.name}  (${rank}/${max}등급)\n${n.tale}${owned ? `\n· 지금: ${scaledDesc(n.desc, rank)}` : ''}${next}${full ? '\n(끝까지 밝힘)' : st.ok ? '\n(누르면 밝히기)' : st.reason === 'locked' ? '\n(아래 별부터 밝혀야 함)' : '\n(조각 부족)'}`, x, y - 40));
        z.on('pointerout', () => hideTip(this));
        z.on('pointerdown', () => {
          const r = buyTalent(save, D, n.id);
          if (!r.ok) { this.tweens.add({ targets: [icon, nm], x: '+=4', duration: 40, yoyo: true, repeat: 2 }); return; }
          writeSave(this.registry.get('storage'), save); sfx('evolve');
          this.paint();
          const star = this.add.star(x - nw + 38, y - 4, 8, 10, 34, col, 0.9); this.layer.add(star);
          this.tweens.add({ targets: star, scale: 2.2, alpha: 0, angle: 90, duration: 500, onComplete: () => star.destroy() });
        });
        this.layer.add([pips, icon, nm, ds, cost, z]);
      });
    });
  }
}

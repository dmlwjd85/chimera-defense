import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { buildData } from '../logic/data.js';
import { stageUnlocked } from '../logic/meta.js';
import { ZONE_COLORS } from './BattleScene.js';

const ZONE_NAME = { village: '마을', field: '들판', forest: '숲', plains: '대평원', mountain: '산', wetland: '습지' };
const BOSS_ROLE = { boss_boar: '둔화가 없으면 힘들다', boss_bat: '대공이 없으면 힘들다', boss_shadow: '광역이 없으면 힘들다' };

export default class StageSelectScene extends Phaser.Scene {
  constructor() { super('StageSelect'); }

  create() {
    const data = buildData(this.registry.get('raw'));
    const save = this.registry.get('save');
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.6);
    title(this, 640, 70, '숲 챕터', 44);
    data.stages.forEach((st, i) => {
      const x = 230 + i * 410, open = stageUnlocked(save, data, st.id), rec = save.stages[st.id];
      panel(this, x - 180, 130, 360, 470, { alpha: open ? 0.95 : 0.5 });
      this.add.text(x, 165, st.name, style(24, open ? '#ffe2b8' : '#777777')).setOrigin(0.5);
      if (this.textures.exists('thumb-' + st.id)) {
        const im = this.add.image(x, 238, 'thumb-' + st.id).setDisplaySize(330, 120);
        if (!open) im.setTint(0x555555);
        st.zones.forEach((z, k) => this.add.text(x - 110 + k * 110, 286, ZONE_NAME[z], style(13, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5));
      } else st.zones.forEach((z, k) => {
        this.add.rectangle(x - 110 + k * 110, 235, 104, 60, ZONE_COLORS[z] ?? 0x666666).setAlpha(open ? 1 : 0.4);
        this.add.text(x - 110 + k * 110, 235, ZONE_NAME[z], style(16)).setOrigin(0.5);
      });
      this.add.text(x, 305, '← 방어선            적 등장 →', style(12, '#8899aa')).setOrigin(0.5);
      const boss = data.enemyById[st.boss];
      this.add.circle(x, 360, 46, open ? 0x22262b : 0x111111).setStrokeStyle(3, 0x885555);
      this.add.text(x, 360, open ? '?' : '🔒', style(40, '#aa6666')).setOrigin(0.5);
      this.add.text(x, 425, `보스: ${boss?.name ?? '-'}`, style(18)).setOrigin(0.5);
      this.add.text(x, 452, BOSS_ROLE[st.boss] ?? '', style(14, '#f0883e')).setOrigin(0.5);
      this.add.text(x, 476, `적 체력 ×${st.mult}`, style(14, '#aabbcc')).setOrigin(0.5);
      const carry = save.carry?.[st.id];
      if (i > 0 && open) this.add.text(x, 519, carry ? `데려갈 동물: ${carry.white ? '흰 ' : ''}${carry.stage === 'teen' ? '성장기' : '어린'} ${data.unitById[carry.speciesId].name}` : `데려갈 동물 없음 → 시작 골드 +${data.config.carry.fallbackGold}`, style(13, '#9cff6b')).setOrigin(0.5);
      this.add.text(x, 497, rec?.cleared ? '클리어 ✔' : rec ? `최고 웨이브 ${rec.bestWave}` : '처음', style(15, rec?.cleared ? '#58d68d' : '#cccccc')).setOrigin(0.5);
      const b = button(this, x, 560, 200, 52, open ? '출발' : '앞 스테이지를 깨면 열림', () => this.scene.start('Battle', { stageId: st.id }), { size: open ? 22 : 13, fill: open ? 0x3a7bd5 : 0x333333 });
      b.setEnabled(open);
    });
    button(this, 120, 670, 160, 46, '← 타이틀', () => this.scene.start('Title'));
  }
}

import Phaser from 'phaser';
import { button, title, style, panel, showTip, hideTip } from './ui.js';
import { buildData } from '../logic/data.js';
import { stageUnlocked, starsOf, totalStars, nextUnlock } from '../logic/meta.js';
import { soulGaps, soulSig } from '../logic/soul.js';

const ZONE_NAME = { village: '마을', field: '들판', forest: '숲', plains: '대평원', mountain: '산', wetland: '습지' };
const BOSS_ROLE = {
  boss_boar: '둔화가 없으면 힘들다', boss_bat: '대공이 없으면 힘들다', boss_shadow: '광역이 없으면 힘들다',
  boss_bone: '근접과 땅·빛이 열쇠', boss_frost: '원거리와 불·빛이 열쇠', boss_lich: '넋은 원거리로, 해골은 근접으로',
};
const stars = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(max - n);
const mmss = (t) => `${Math.floor(t / 60)}분 ${String(t % 60).padStart(2, '0')}초`;

/** World map: 12 stages (6 open for play, 6 on the roadmap), star totals and the animals stars call in. */
export default class StageSelectScene extends Phaser.Scene {
  constructor() { super('StageSelect'); }

  create() {
    const data = this.D = buildData(this.registry.get('raw'));
    const save = this.S = this.registry.get('save');
    const cfg = data.config;
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.45);
    title(this, 150, 44, '세계 지도', 34);

    // star total and the animals waiting on stars
    const total = totalStars(save), max = (data.stages.length + (cfg.roadmap?.length ?? 0)) * 3;
    this.add.text(290, 30, `⭐ ${total}`, style(26, '#ffd84d', { stroke: '#000', strokeThickness: 4 }));
    this.add.text(292, 62, `/ ${max}`, style(12, '#aabbcc'));
    const nx = nextUnlock(save, data);
    const track = cfg.roster?.unlocks ?? [];
    track.forEach((u, i) => {
      const x = 420 + i * 62, got = total >= u.stars, unit = data.unitById[u.id];
      const key = 'unit-' + u.id;
      this.add.circle(x, 40, 23, got ? 0x24384a : 0x161c24).setStrokeStyle(2, got ? 0xffd84d : nx?.id === u.id ? 0x9cff6b : 0x3b4b5e);
      if (this.textures.exists(key)) { const im = this.add.image(x, 40, key).setDisplaySize(40, 40); if (!got) im.setTint(0x000000).setAlpha(0.55); }
      else this.add.text(x, 40, got ? unit.name[0] : '?', style(18)).setOrigin(0.5);
      this.add.text(x, 73, got ? '합류' : `⭐${u.stars}`, style(11, got ? '#58d68d' : nx?.id === u.id ? '#9cff6b' : '#8899aa')).setOrigin(0.5);
      const z = this.add.zone(x, 44, 56, 66).setInteractive();
      z.on('pointerover', () => showTip(this, got ? `${unit.name} · 합류함` : `별 ${u.stars}개를 모으면 ${nx?.id === u.id ? unit.name : '새 친구'} 합류`, x, 14));
      z.on('pointerout', () => hideTip(this));
    });
    this.add.text(420 + track.length * 62 - 10, 30, nx ? `다음 친구까지 ⭐${nx.stars - total}` : '모두 모임', style(14, '#9cff6b'));
    this.add.text(420 + track.length * 62 - 10, 52, '★ 클리어  ★ 생명 ' + (cfg.stars?.life ?? 60) + '% 이상  ★ 제한 시간', style(11, '#aabbcc'));

    // 12 cards, 4 x 3
    const W = 294, H = 122, GX = 12, GY = 10, X0 = 640 - (4 * W + 3 * GX) / 2, Y0 = 92;
    const cards = [
      ...data.stages.map((st, i) => ({ n: i + 1, st })),
      ...(cfg.roadmap ?? []).map((r) => ({ n: r.n, road: r })),
    ];
    this.sel = this.add.graphics().setDepth(5);
    this.cardPos = [];
    cards.forEach((c, i) => {
      const x = X0 + (i % 4) * (W + GX), y = Y0 + Math.floor(i / 4) * (H + GY);
      this.cardPos.push({ x, y, W, H });
      const open = c.st ? stageUnlocked(save, data, c.st.id) : false;
      const clim = cfg.climates?.[(c.st ?? c.road).climate];
      panel(this, x, y, W, H, { alpha: open ? 0.95 : 0.55 });
      const art = c.st ? 'thumb-' + (c.st.art ?? c.st.id) : null;
      if (art && this.textures.exists(art)) {
        const im = this.add.image(x + 62, y + 46, art).setDisplaySize(108, 64);
        if (!open) im.setTint(0x444444);
        if (clim?.tint && open) this.add.rectangle(x + 62, y + 46, 108, 64, Phaser.Display.Color.GetColor(clim.tint[0], clim.tint[1], clim.tint[2]), clim.tint[3] + 0.12);
      } else {
        this.add.rectangle(x + 62, y + 46, 108, 64, 0x10151b).setStrokeStyle(1, 0x3b4b5e);
        this.add.text(x + 62, y + 46, c.road ? '준비 중' : '🔒', style(c.road ? 13 : 24, '#667788')).setOrigin(0.5);
      }
      if (c.st && !open) this.add.text(x + 62, y + 46, '🔒', style(26)).setOrigin(0.5);
      const name = c.st ? c.st.name : `${c.n} · ${c.road.name}`;
      this.add.text(x + 124, y + 12, name, style(15, open ? '#ffe2b8' : '#8a8f96', { wordWrap: { width: W - 132 } }));
      this.add.text(x + 124, y + 52, `${clim?.icon ?? ''} ${clim?.name ?? ''}`, style(13, open ? '#cfe8ff' : '#667788'));
      if (c.st) {
        const rec = save.stages[c.st.id], n = starsOf(rec);
        this.add.text(x + 124, y + 72, stars(n), style(20, n ? '#ffd84d' : '#55606c', { stroke: '#000', strokeThickness: 3 }));
        this.add.text(x + 12, y + 90, open ? `보스 ${data.enemyById[c.st.boss]?.name ?? '-'}` : '앞 스테이지를 깨면 열림', style(12, open ? '#ffb4a8' : '#667788'));
      } else {
        this.add.text(x + 124, y + 74, `보스 ${c.road.boss}`, style(12, '#8a6f6f'));
        this.add.text(x + 12, y + 90, c.road.theme, style(11, '#667788', { wordWrap: { width: W - 24 } }));
      }
      const z = this.add.zone(x + W / 2, y + H / 2, W, H).setInteractive({ useHandCursor: !!c.st });
      z.on('pointerdown', () => this.pick(i, c));
    });

    panel(this, X0, 494, 4 * W + 3 * GX, 132, { alpha: 0.95 });
    this.detail = this.add.container(0, 0).setDepth(2);
    const lastOpen = cards.reduce((k, c, i) => (c.st && stageUnlocked(save, data, c.st.id) ? i : k), 0);
    this.cards = cards;
    this.pick(lastOpen, cards[lastOpen]);

    button(this, 120, 672, 160, 46, '← 타이틀', () => this.scene.start('Title'));
    const sp = data.unitById[save.soulPet];
    button(this, 640, 672, 420, 46, sp ? `👑 소울펫 ${sp.name} · ${soulSig(data, sp.id).name}   |   덱 짜기` : '👑 소울펫을 정하고 덱 짜기', () => this.scene.start('Deck', { stageId: this.picked ?? null }), { fill: sp ? 0x4a3d14 : 0x2e5a3a, stroke: 0xffd84d, size: 16, tip: '주인공 한 마리와 약점을 메울 동료 고르기' });
    button(this, 1120, 672, 250, 46, `✨ 별자리 나무  💎${save.shards ?? 0}`, () => this.scene.start('Talent', { back: 'StageSelect' }), { fill: 0x3a2466, stroke: 0xc77dff, size: 17, tip: '유물 조각으로 특성 찍기' });
  }

  /** Show one stage in the detail strip. */
  pick(i, c) {
    const data = this.D, save = this.S, cfg = data.config, p = this.cardPos[i];
    this.sel.clear().lineStyle(3, 0xffd84d, 1).strokeRoundedRect(p.x - 2, p.y - 2, p.W + 4, p.H + 4, 12);
    this.detail.removeAll(true);
    this.picked = c.st?.id ?? null;
    this.goBtn?.destroy(); this.goBtn = null;
    const add = (o) => { this.detail.add(o); return o; };
    const x = 60, y = 504;
    const info = c.st ?? c.road;
    const clim = cfg.climates?.[info.climate];
    const elem = (ids) => ids.map((e) => cfg.elements.defs[e]?.icon ?? '').join('');
    add(this.add.text(x, y, c.st ? c.st.name : `${c.n} · ${c.road.name}`, style(22, '#ffe2b8')));
    add(this.add.text(x, y + 34, `${clim?.icon ?? ''} ${clim?.name ?? ''}   ${clim?.strong?.length && clim.strong.length < 8 ? `${elem(clim.strong)} 강해짐` : clim?.strong?.length ? '모든 속성 강해짐' : ''}${clim?.weak?.length ? `   ${elem(clim.weak)} 약해짐` : ''}`, style(15, '#cfe8ff')));
    add(this.add.text(x, y + 58, `“${clim?.tale ?? ''}”`, style(13, '#9fb3c8', { fontStyle: 'italic' })));
    if (!c.st) {
      add(this.add.text(x, y + 84, `땅: ${c.road.zones}   보스: ${c.road.boss}   — ${c.road.theme}`, style(13, '#aabbcc')));
      add(this.add.text(1130, y + 50, '준비 중', style(22, '#667788')).setOrigin(0.5));
      return;
    }
    const st = c.st, open = stageUnlocked(save, data, st.id), rec = save.stages[st.id], boss = data.enemyById[st.boss];
    const kinds = [...new Set(st.waves.flatMap((w) => Object.keys(w.mix)))].filter((id) => data.enemyById[id]?.resist || data.enemyById[id]?.revive).map((id) => data.enemyById[id].name);
    add(this.add.text(x, y + 84, `땅: ${st.zones.map((z) => ZONE_NAME[z]).join(' → ')}    적 체력 ×${st.mult}${kinds.length ? `    조심: ${kinds.join('·')}` : ''}`, style(13, '#aabbcc')));
    const gaps = save.soulPet ? soulGaps(data, save.soulPet, st).map((g) => g.text) : [];
    add(this.add.text(x, y + 104, `보스 ${boss?.name ?? '-'} — ${BOSS_ROLE[st.boss] ?? ''}${gaps.length ? `     👑 ${data.unitById[save.soulPet].name}: ${gaps.slice(0, 2).join(' · ')}` : ''}`, style(13, '#f0883e')));
    const carry = save.carry?.[st.id];
    const mid = 760;
    add(this.add.text(mid, y + 4, `${stars(starsOf(rec))}`, style(26, '#ffd84d', { stroke: '#000', strokeThickness: 4 })));
    add(this.add.text(mid, y + 42, rec?.cleared ? `클리어 ✔${rec.bestTime ? `  최고 ${mmss(rec.bestTime)}` : ''}` : rec ? `최고 웨이브 ${rec.bestWave}` : '처음', style(14, rec?.cleared ? '#58d68d' : '#cccccc')));
    add(this.add.text(mid, y + 64, `★ 제한 시간 ${mmss(st.par ?? cfg.stars.par)}`, style(13, '#aabbcc')));
    const sp = (cfg.spells?.list ?? []).find((s) => s.stage === st.id);
    if (sp) add(this.add.text(mid, y + 106, rec?.cleared ? `🔮 배운 마법: ${sp.icon} ${sp.name}` : `🔮 깨면 배우는 마법: ${sp.icon} ${sp.name}`, style(13, '#d7bde2')));
    if (i > 0 && open) add(this.add.text(mid, y + 86, carry ? `데려갈 동물: ${carry.white ? '흰 ' : ''}${carry.stage === 'teen' ? '성장기' : '어린'} ${data.unitById[carry.speciesId].name}` : `데려갈 동물 없음 → 시작 골드 +${cfg.carry.fallbackGold}`, style(13, carry ? '#9cff6b' : '#aaaaaa')));
    this.goBtn = button(this, 1130, y + 58, 190, 60, open ? '출발' : '잠김', () => this.scene.start('Battle', { stageId: st.id }), { size: open ? 24 : 16, fill: open ? 0x3a7bd5 : 0x333333 });
    this.goBtn.setEnabled(open);
  }
}

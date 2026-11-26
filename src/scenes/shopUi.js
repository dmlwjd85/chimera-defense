// 스테이지 사이 상점(2026-11-26): 주머니 금화로 다음 연전 준비물을 삼.
// 유물 2 · 먹이 꾸러미 · 부활 깃털 · 훈련. 산 것은 다음 스테이지를 시작할 때 들고 감.
import { button, style } from './ui.js';
import { shopOffers, buyShop, rerollShop, writeSave } from '../logic/meta.js';
import { sfx } from './sfx.js';

export function showShop(scene, data, save, storage, onClose = () => {}) {
  const objs = [];
  const add = (o) => { objs.push(o); return o; };
  const close = () => { objs.forEach((o) => o.destroy()); onClose(); };
  const paint = () => {
    objs.forEach((o) => o.destroy()); objs.length = 0;
    add(scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0.72).setDepth(3000).setInteractive());
    const g = add(scene.add.graphics().setDepth(3001));
    g.fillStyle(0x1a1410, 1).fillRoundedRect(150, 70, 980, 580, 20).lineStyle(4, 0xd4b06a, 1).strokeRoundedRect(150, 70, 980, 580, 20);
    add(scene.add.text(640, 108, '🛒 떠돌이 상점', style(34, '#ffd84d', { stroke: '#000', strokeThickness: 5 })).setOrigin(0.5).setDepth(3002));
    add(scene.add.text(640, 150, `주머니 💰 ${save.pouch ?? 0}   ·   산 것은 다음 스테이지를 시작할 때 들고 가요`, style(16, '#f0e6d0')).setOrigin(0.5).setDepth(3002));
    const shop = shopOffers(save, data);
    shop.items.forEach((it, i) => {
      const col = i % 3, row = Math.floor(i / 3), x = 200 + col * 300, y = 186 + row * 210, w = 280, h = 196;
      g.fillStyle(it.sold ? 0x2a2a2a : 0x2b2118, 1).fillRoundedRect(x, y, w, h, 14).lineStyle(2, it.sold ? 0x555555 : 0xd4b06a, 0.9).strokeRoundedRect(x, y, w, h, 14);
      add(scene.add.text(x + w / 2, y + 36, it.icon, style(40)).setOrigin(0.5).setDepth(3002).setAlpha(it.sold ? 0.4 : 1));
      add(scene.add.text(x + w / 2, y + 80, it.name, style(19, it.sold ? '#777777' : '#ffffff')).setOrigin(0.5).setDepth(3002));
      add(scene.add.text(x + w / 2, y + 112, it.desc, style(13, it.sold ? '#666666' : '#d8d2c2', { wordWrap: { width: w - 24 }, align: 'center' })).setOrigin(0.5, 0).setDepth(3002));
      const b = add(button(scene, x + w / 2, y + h - 22, 150, 32, it.sold ? '산 것 ✔' : `💰 ${it.price}`, () => {
        const r = buyShop(save, data, i);
        if (!r.ok) { const m = { gold: '금화가 모자라요', full: '더는 못 들고 가요(2개까지)' }[r.reason] ?? '못 사요'; scene.toast ? scene.toast(m) : null; return; }
        sfx('coin'); writeSave(storage, save); paint();
      }, { depth: 3003, size: 15, fill: it.sold ? 0x333333 : (save.pouch ?? 0) >= it.price ? 0x5a4a14 : 0x3a3020, stroke: 0xffd84d }));
      b.setEnabled(!it.sold && (save.pouch ?? 0) >= it.price);
    });
    const prep = save.prep;
    add(scene.add.text(200, 612, `🎒 챙긴 것: ${prep ? [...(prep.relics ?? []).map((id) => data.relicById[id]?.icon ?? '✨'), ...(prep.food ? [`🍖×${prep.food}`] : []), ...(prep.feathers ? [`🪶×${prep.feathers}`] : [])].join(' ') || '없음' : '없음'}`, style(16, '#9cff6b')).setDepth(3002));
    const rb = add(button(scene, 880, 616, 150, 38, '🔄 새로 진열 💰5', () => { if (rerollShop(save, data).ok) { sfx('click'); writeSave(storage, save); paint(); } }, { depth: 3003, size: 14 }));
    rb.setEnabled((save.pouch ?? 0) >= 5);
    add(button(scene, 1050, 616, 120, 38, '닫기', close, { depth: 3003, size: 16 }));
  };
  paint();
}

import Phaser from 'phaser';
import { FONT, makeT } from '../text.js';
import { loadSave } from '../logic/meta.js';
import { preloadRigs } from './rigs.js';
import { rotateCrumbs } from './debug.js';
import { PFX } from './fx.js';

const DATA_KEYS = ['config', 'units', 'recipes', 'enemies', 'stages', 'traits', 'lore', 'relics', 'tales', 'globe', 'talents', 'story'];

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    rotateCrumbs();
    this.add.text(640, 360, '불러오는 중...', { fontSize: '28px', color: '#ffffff', fontFamily: FONT }).setOrigin(0.5);
    this.load.json('text', 'data/text.json');
    for (const k of DATA_KEYS) this.load.json(k, `data/${k}.json`);
    // Optional art: everything listed in the manifest replaces the placeholder shapes.
    // Art comes bundled (assets/art-pack.json, built by tools/pack-art.mjs); the manifest is the fallback.
    // 폰(손가락 입력)은 그림 메모리가 모자라 전투에서 튕겨서 반쪽 해상도 묶음을 씀(?half=0 끔, ?half=1 켬)
    const qh = new URLSearchParams(location.search).get('half');
    const half = qh != null ? qh === '1' : !!window.matchMedia?.('(pointer: coarse)').matches;
    window.__artHalf = half;
    this.load.json('artpack', half ? 'assets/art-pack-m.json' : 'assets/art-pack.json');
    const useArt = (pack) => {
      this.load.json('manifest', 'assets/manifest.json');
      this.load.once('filecomplete-json-manifest', (k, t, m) => { for (const [key, path] of Object.entries(m?.images ?? {})) this.load.image(key, pack?.[key] ?? path); });
    };
    this.load.once('filecomplete-json-artpack', (k, t, pack) => useArt(pack));
    this.load.once('loaderror', (f) => { if (f.key === 'artpack') useArt(null); });
    preloadRigs(this);
    // 도트 이펙트(pixelfx, MIT — 에셋 출처 장부 참고): 타격·치명타·할퀴기·처치 연기
    for (const n of PFX) this.load.atlas('pfx-' + n, `assets/fx/pfx/${n}.png`, `assets/fx/pfx/${n}.json`);
    this.load.on('loaderror', (f) => console.warn('load failed:', f.key));
  }

  create() {
    // 그림은 이미 텍스처가 됐으니 수십 MB짜리 묶음 글자는 버림
    this.cache.json.remove('artpack');
    const T = makeT(this.cache.json.get('text'));
    this.registry.set('T', T);
    const raw = {};
    for (const k of DATA_KEYS) raw[k] = this.cache.json.get(k) ?? null;
    this.registry.set('raw', raw);
    let storage = null;
    try { storage = window.localStorage; } catch { storage = null; }
    this.registry.set('storage', storage);
    this.registry.set('save', loadSave(storage));
    document.title = T('title.pageTitle');
    this.scene.start('Title');
  }
}

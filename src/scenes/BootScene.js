import Phaser from 'phaser';
import { FONT, makeT } from '../text.js';
import { loadSave } from '../logic/meta.js';
import { preloadRigs } from './rigs.js';

const DATA_KEYS = ['config', 'units', 'recipes', 'enemies', 'stages', 'traits', 'lore', 'relics'];

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.add.text(640, 360, '불러오는 중...', { fontSize: '28px', color: '#ffffff', fontFamily: FONT }).setOrigin(0.5);
    this.load.json('text', 'data/text.json');
    for (const k of DATA_KEYS) this.load.json(k, `data/${k}.json`);
    // Optional art: everything listed in the manifest replaces the placeholder shapes.
    // Art comes bundled (assets/art-pack.json, built by tools/pack-art.mjs); the manifest is the fallback.
    this.load.json('artpack', 'assets/art-pack.json');
    const useArt = (pack) => {
      this.load.json('manifest', 'assets/manifest.json');
      this.load.once('filecomplete-json-manifest', (k, t, m) => { for (const [key, path] of Object.entries(m?.images ?? {})) this.load.image(key, pack?.[key] ?? path); });
    };
    this.load.once('filecomplete-json-artpack', (k, t, pack) => useArt(pack));
    this.load.once('loaderror', (f) => { if (f.key === 'artpack') useArt(null); });
    preloadRigs(this);
    this.load.on('loaderror', (f) => console.warn('load failed:', f.key));
  }

  create() {
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

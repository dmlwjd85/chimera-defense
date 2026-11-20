import Phaser from 'phaser';
import { FONT, makeT } from '../text.js';

const DATA_KEYS = ['config', 'units', 'recipes', 'enemies', 'stages'];

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.add.text(640, 360, '...', { fontSize: '32px', color: '#ffffff', fontFamily: FONT }).setOrigin(0.5);
    this.load.json('text', 'data/text.json');
    for (const k of DATA_KEYS) this.load.json(k, `data/${k}.json`);
    for (const k of ['units', 'recipes']) {
      this.load.once(`filecomplete-json-${k}`, (key, type, list) => {
        for (const x of list ?? []) if (typeof x.image === 'string') this.load.image('unit-' + x.id, x.image);
      });
    }
    this.load.on('loaderror', (f) => console.warn('load failed:', f.key));
  }

  create() {
    const T = makeT(this.cache.json.get('text'));
    this.registry.set('T', T);
    const raw = {};
    for (const k of DATA_KEYS) raw[k] = this.cache.json.get(k) ?? null;
    this.registry.set('raw', raw);
    document.title = T('title.pageTitle');
    this.scene.start('Title');
  }
}

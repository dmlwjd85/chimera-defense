// Rig lab: preview every motion at every stage, trade blows, tweak the setup pose and export JSON.
import Phaser from 'phaser';
import { loadRig } from './rig/load.js';
import { RigView } from './rig/RigView.js';
import { MOTIONS, STAGES } from './rig/rigData.js';

const LABEL = { idle: '대기', move: '이동', attack: '공격', skill: '스킬', hit: '피격', down: '쓰러짐', respawn: '부활', victory: '승리', merge_in: '합성 등장', evolve: '진화' };
const $ = (id) => document.getElementById(id);
const log = (s) => { const el = $('log'); el.textContent = (s + '\n' + el.textContent).slice(0, 2000); };

class RigLabScene extends Phaser.Scene {
  constructor() { super('RigLab'); this.views = []; this.mode = 'stages'; this.speed = 1; this.paused = false; }
  preload() {
    this.load.json('manifest', 'assets/manifest.json');
    this.load.once('filecomplete-json-manifest', (k, t, m) => { for (const [key, path] of Object.entries(m?.images ?? {})) if (key.startsWith('rig-')) this.load.image(key, path); });
  }
  async create() {
    this.cameras.main.setBackgroundColor('#20262e');
    this.add.rectangle(640, 640, 1280, 160, 0x2f3a2c).setDepth(-2000);
    this.add.rectangle(640, 560, 1280, 4, 0x56704a).setDepth(-1999);
    this.title = this.add.text(20, 16, '', { fontSize: '20px', color: '#ffd59a' }).setDepth(20000);
    this.fx = this.add.group();
    try {
      this.fox = await loadRig('fox');
      const idx = await fetch('data/rig/index.json').then((r) => r.json());
      this.all = await Promise.all(idx.rigs.map((id) => loadRig(id)));
    } catch (e) { this.title.setText(String(e.message)); console.error(e); return; }
    this.buildUI(); this.setMode(new URLSearchParams(location.search).get('mode') ?? 'gallery');
    window.__rigLab = this;
  }
  clear() { this.views.forEach((v) => v.destroy()); this.views = []; this.labels?.forEach((t) => t.destroy()); this.labels = []; }
  addFox(stage, x, opts = {}) {
    const inst = (this.pick ?? this.fox).make({ stage, x, y: 560, scale: opts.scale ?? 0.3, seed: this.views.length + 1 });
    if (opts.facing) inst.setFacing(opts.facing);
    const v = new RigView(this, inst); v.showBones = $('bones').checked;
    inst.on('*', (e) => { if (e.name !== 'complete') log(`${stage} · ${inst.motion} → ${e.name}`); });
    this.views.push(v); return v;
  }
  setMode(mode) {
    this.mode = mode; this.clear();
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const st = this.fox.rig.stages;
    if (mode === 'gallery') {
      this.title.setText('전체 동물·키메라 — 부위 그림을 뼈대에 붙여 움직임');
      this.all.forEach((r, i) => {
        const x = 90 + (i % 7) * 175, y = 200 + Math.floor(i / 7) * 205;
        const inst = r.make({ stage: 'adult', x, y, scale: 0.3, seed: i + 1 });
        const v = new RigView(this, inst); v.showBones = $('bones').checked;
        this.views.push(v);
        this.labels.push(this.add.text(x, y + 14, r.rig.species, { fontSize: '13px', color: '#ccc' }).setOrigin(0.5).setDepth(20000));
      });
    } else if (mode === 'stages') {
      this.title.setText('단계 비교 — 같은 모션, 단계별 비율·속도·과장 차이');
      STAGES.forEach((s, i) => { this.addFox(s, 260 + i * 360); this.labels.push(this.add.text(260 + i * 360, 600, st[s].label, { fontSize: '22px', color: '#fff' }).setOrigin(0.5).setDepth(20000)); });
    } else if (mode === 'battle') {
      this.title.setText('전투 미리보기 — 공격의 hit 이벤트에 맞춰 상대가 피격·번쩍·숫자');
      const a = this.addFox('adult', 470), b = this.addFox('teen', 810, { facing: -1 });
      this.duel = { a, b, turn: 0, wait: 0.4 };
      for (const [atk, def] of [[a, b], [b, a]]) atk.inst.on('hit', () => {
        def.inst.play('hit'); def.inst.hitFlash(0.1); this.cameras.main.shake(70, 0.004);
        const t = this.add.text(def.inst.x, def.inst.y - 230, String(10 + Math.floor(Math.random() * 15)), { fontSize: '34px', color: '#ffef7a', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(30000);
        this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 700, ease: 'Cubic.out', onComplete: () => t.destroy() });
      });
    } else if (mode === 'walk') {
      this.title.setText('이동 — 몸 속도가 꼬리·귀 스프링에 전달됨');
      const v = this.addFox('adult', 200); v.inst.play('move'); this.walker = { v, dir: 1 };
    }
  }
  playAll(m) { this.views.forEach((v) => v.inst.play(m, { loop: m === 'idle' || m === 'move' || m === 'victory' ? true : undefined })); }
  update(_, ms) {
    if (!this.fox) return;
    const dt = this.paused ? 0 : (ms / 1000) * this.speed;
    if (this.mode === 'battle' && this.duel && dt > 0) {
      const d = this.duel; d.wait -= dt;
      if (d.wait <= 0) { const atk = d.turn % 2 ? d.b : d.a; atk.inst.play(d.turn % 5 === 4 ? 'skill' : 'attack'); d.turn++; d.wait = 1.1; }
    }
    if (this.mode === 'walk' && this.walker && dt > 0) {
      const w = this.walker, i = w.v.inst, sp = 220 * w.dir;
      i.x += sp * dt; i.moveVelocity = sp;
      if (i.x > 1080 || i.x < 200) { w.dir *= -1; i.setFacing(w.dir); }
    }
    this.views.forEach((v) => { v.inst.timeScale = 1; v.update(dt); });
  }
  buildUI() {
    const box = $('motions');
    for (const m of MOTIONS) { const b = document.createElement('button'); b.textContent = LABEL[m] || m; b.onclick = () => this.playAll(m); box.appendChild(b); }
    document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => this.setMode(b.dataset.mode)));
    $('speed').oninput = (e) => { this.speed = +e.target.value; $('speedv').textContent = this.speed.toFixed(2); };
    $('bones').onchange = (e) => this.views.forEach((v) => (v.showBones = e.target.checked));
    $('flip').onclick = () => this.views.forEach((v) => v.inst.setFacing(-v.inst.facing));
    $('flash').onclick = () => this.views.forEach((v) => { v.inst.hitFlash(0.12); v.inst.play('hit'); });
    $('pause').onclick = (e) => { this.paused = !this.paused; e.target.classList.toggle('on', this.paused); };
    const T = this.fox.template, sel = $('bone');
    T.bones.forEach((b) => { const o = document.createElement('option'); o.value = b.name; o.textContent = b.name; sel.appendChild(o); });
    const show = () => { const b = T.bones.find((x) => x.name === sel.value); for (const k of ['rot', 'x', 'y']) { $('b_' + k).value = b[k] || 0; $('b_' + k + 'v').textContent = b[k] || 0; } };
    sel.onchange = show; show();
    for (const k of ['rot', 'x', 'y']) $('b_' + k).oninput = (e) => {
      const b = T.bones.find((x) => x.name === sel.value); b[k] = +e.target.value; $('b_' + k + 'v').textContent = b[k];
      this.views.forEach((v) => v.inst.setStage(v.inst.stage)); // re-ground feet
    };
    $('export').onclick = () => { $('json').value = JSON.stringify(T, null, 1); };
    $('copy').onclick = async () => { $('json').value ||= JSON.stringify(T, null, 1); try { await navigator.clipboard.writeText($('json').value); log('템플릿 JSON 복사됨'); } catch { $('json').select(); } };
  }
}

new Phaser.Game({
  type: Phaser.WEBGL, parent: 'game', width: 1280, height: 720, backgroundColor: '#20262e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY }, scene: [RigLabScene],
});

// Phaser renderer for a RigInstance. Uses real part images when they exist
// (texture key `${species}_${stage}_${part}`), otherwise draws placeholder shapes.
import Phaser from 'phaser';

const hex = (c) => Phaser.Display.Color.HexStringToColor(c).color;
function shade(c, k) { const o = Phaser.Display.Color.HexStringToColor(c); return Phaser.Display.Color.GetColor(o.red * k, o.green * k, o.blue * k); }

/** Build placeholder textures for one species once per scene. */
export function ensurePlaceholders(scene, template, rig) {
  const pal = rig.palette || {};
  for (const slot of template.slots) {
    const key = `ph_${rig.species}_${slot.name}`;
    if (scene.textures.exists(key) || !slot.ph || !slot.ph.w) continue;
    const { shape, w, h } = slot.ph; const line = 6; const W = Math.ceil(w + line * 2), H = Math.ceil(h + line * 2);
    const fill = hex(pal[slot.color] || '#cccccc'), ink = hex(pal.ink || '#222222');
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(line, ink, 1); g.fillStyle(fill, 1);
    if (shape === 'capsule') { g.fillRoundedRect(line, line, w, h, h / 2); g.strokeRoundedRect(line, line, w, h, h / 2); }
    else if (shape === 'tri') {
      const pts = [line, line + h * 0.15, W - line, H / 2, line, H - line - h * 0.15];
      g.fillTriangle(...pts); g.strokeTriangle(...pts);
      g.fillStyle(shade(pal[slot.color] || '#cccccc', 0.6), 1); g.fillTriangle(line + w * 0.2, H / 2 - h * 0.18, W - line - w * 0.25, H / 2, line + w * 0.2, H / 2 + h * 0.18);
    } else if (shape === 'tail') {
      // horizontal strip: base on the left, white tip on the right (rope maps it along the tail bones)
      const tip = hex(pal.belly || '#ffffff');
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, half = (h / 2) * Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.85)) + 6;
        g.fillStyle(u > 0.78 ? tip : fill, 1); g.fillRect(line + u * (w - 1), H / 2 - half, w / 40 + 1, half * 2);
      }
    } else { g.fillEllipse(W / 2, H / 2, w, h); g.strokeEllipse(W / 2, H / 2, w, h); }
    if (slot.name === 'eye') { g.fillStyle(0xffffff, 1); g.fillCircle(W / 2 + w * 0.15, H / 2 - h * 0.2, w * 0.18); }
    g.generateTexture(key, W, H); g.destroy();
  }
}

export class RigView {
  constructor(scene, inst, opts = {}) {
    this.scene = scene; this.inst = inst; this.opts = opts;
    ensurePlaceholders(scene, inst.template, inst.rig);
    this.container = opts.parent ?? scene.add.container(0, 0);
    this.objs = {};
    this.bonesG = scene.add.graphics(); this.bonesG.setDepth(10000); this.showBones = false;
    this.sync();
  }
  textureFor(slot, part) {
    const given = this.inst.rig.textures?.[slot];
    if (given && this.scene.textures.exists(given)) return given;
    const skin = this.inst.rig.skin ?? this.inst.rig.species;
    for (const k of [`rig-${skin}-${this.inst.stage}-${slot}`, `rig-${skin}-${slot}`, `${this.inst.rig.species}_${this.inst.stage}_${part}`]) if (this.scene.textures.exists(k)) return k;
    return `ph_${this.inst.rig.species}_${slot}`;
  }
  artScale(key) { return key.startsWith('rig-') ? 1 / (this.inst.rig.artRes ?? 2) : (this.inst.rig.artScale ?? 1); }
  objFor(d) {
    let o = this.objs[d.slot];
    const key = this.textureFor(d.slot, d.part);
    if (!this.scene.textures.exists(key)) return null;
    if (o && o.texture.key !== key) { o.destroy(); o = null; }
    if (!o) {
      if (d.rope) {
        o = this.scene.add.rope(0, 0, key, null, d.rope.length); // WebGL only; Canvas falls back to nothing
      } else { o = this.scene.add.image(0, 0, key); if (this.inst.rig.flipArt) o.setFlipX(true); }
      this.container.add(o); this.objs[d.slot] = o;
    }
    return o;
  }
  sync() {
    const list = this.inst.getDrawList();
    const seen = new Set(); const flash = this.inst.flash > 0.01;
    list.forEach((d, i) => {
      const o = this.objFor(d); if (!o) return; seen.add(d.slot);
      o.setVisible(true).setAlpha(d.alpha);
      if (d.rope) {
        // points are screen space; scale the rope so its thickness matches the body, and divide the points back
        const k = (Math.hypot(d.m[0], d.m[1]) || 1) * this.artScale(o.texture.key);
        o.setScale(k);
        d.rope.forEach(([x, y], j) => { if (o.points[j]) { o.points[j].x = x / k; o.points[j].y = y / k; } });
        o.setDirty();
      } else {
        const a = this.artScale(o.texture.key);
        o.setPosition(d.x, d.y); o.rotation = Phaser.Math.DegToRad(d.rot); o.setScale(d.sx * a, d.sy * a);
      }
      const sil = this.inst.silhouette;
      if (d.rope) { if (sil !== o._sil) { o.setColors(sil ? 0x0b0e12 : 0xffffff); o._sil = sil; } o.tintFill = !!sil || flash; } else if (sil) o.setTintFill(0x0b0e12); else if (flash) o.setTintFill(0xffffff); else o.clearTint();
      this.container.moveTo(o, i);
    });
    for (const [k, o] of Object.entries(this.objs)) if (!seen.has(k)) o.setVisible(false);
    if (!this.opts?.parent) this.container.setDepth(this.inst.y);
    this.bonesG.clear();
    if (this.showBones) {
      for (const b of this.inst.getBoneLines()) {
        this.bonesG.lineStyle(3, 0x00e5ff, 0.9).lineBetween(b.a[0], b.a[1], b.b[0], b.b[1]);
        this.bonesG.fillStyle(0xff3d7f, 1).fillCircle(b.a[0], b.a[1], 4);
      }
    }
  }
  update(dt) { const ev = this.inst.update(dt); this.sync(); return ev; }
  destroy() { if (!this.opts?.parent) this.container.destroy(); else Object.values(this.objs).forEach((o) => o.destroy()); this.bonesG.destroy(); }
}

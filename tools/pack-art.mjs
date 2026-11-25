// Bundle every image in public/assets/manifest.json into one JSON of data URIs (public/assets/art-pack.json),
// so the published build is a handful of files. Runs before `vite build`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = new URL('../public/', import.meta.url);
const m = JSON.parse(readFileSync(new URL('assets/manifest.json', root), 'utf8'));
// 폰용(art-pack-m.json): public/assets/m/ 에 반쪽 그림이 있으면 그걸 씀(tools/half_art.py)
for (const [name, half] of [['art-pack.json', false], ['art-pack-m.json', true]]) {
  const out = {};
  for (const [key, path] of Object.entries(m.images ?? {})) {
    const hp = half ? new URL('assets/m/' + path.replace(/^assets\//, ''), root) : null;
    const f = hp && existsSync(hp) ? hp : new URL(path, root);
    if (!existsSync(f)) { console.warn('missing', path); continue; }
    const ext = path.split('.').pop().toLowerCase();
    out[key] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + readFileSync(f).toString('base64');
  }
  writeFileSync(new URL('assets/' + name, root), JSON.stringify(out));
  console.log(name + ':', Object.keys(out).length, 'images');
}

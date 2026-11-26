// Bundle every image in public/assets/manifest.json into one JSON of data URIs (public/assets/art-pack.json),
// so the published build is a handful of files. Runs before `vite build`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = new URL('../public/', import.meta.url);
const m = JSON.parse(readFileSync(new URL('assets/manifest.json', root), 'utf8'));
// 도트 그림이 생긴 종의 예전 조각 리그(rig-<종>-*)·한 장 그림(unit-<종>)은 안 씀 → 묶음에서 뺌(2026-11-26: 33MB → 약 9MB, 첫 로딩이 느렸음)
const dotSp = new Set(JSON.parse(readFileSync(new URL('data/dot/index.json', root), 'utf8')).species ?? []);
const unused = (key) => { const mm = key.match(/^(rig|unit)-([a-z_]+?)(?:-spirit)?(?:-|$)/); if (!mm) return false; const sp = mm[2]; return dotSp.has(sp) || dotSp.has(sp.replace(/_spirit$/, '')); };
// 폰용(art-pack-m.json): public/assets/m/ 에 반쪽 그림이 있으면 그걸 씀(tools/half_art.py)
for (const [name, half] of [['art-pack.json', false], ['art-pack-m.json', true]]) {
  const out = {};
  for (const [key, path] of Object.entries(m.images ?? {})) {
    if (unused(key)) continue;
    const hp = half ? new URL('assets/m/' + path.replace(/^assets\//, ''), root) : null;
    const f = hp && existsSync(hp) ? hp : new URL(path, root);
    if (!existsSync(f)) { console.warn('missing', path); continue; }
    const ext = path.split('.').pop().toLowerCase();
    out[key] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + readFileSync(f).toString('base64');
  }
  writeFileSync(new URL('assets/' + name, root), JSON.stringify(out));
  console.log(name + ':', Object.keys(out).length, 'images');
}

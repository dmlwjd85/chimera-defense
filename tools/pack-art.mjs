// Bundle every image in public/assets/manifest.json into one JSON of data URIs (public/assets/art-pack.json),
// so the published build is a handful of files. Runs before `vite build`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = new URL('../public/', import.meta.url);
const m = JSON.parse(readFileSync(new URL('assets/manifest.json', root), 'utf8'));
const out = {};
for (const [key, path] of Object.entries(m.images ?? {})) {
  const f = new URL(path, root);
  if (!existsSync(f)) { console.warn('missing', path); continue; }
  const ext = path.split('.').pop().toLowerCase();
  out[key] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + readFileSync(f).toString('base64');
}
writeFileSync(new URL('assets/art-pack.json', root), JSON.stringify(out));
console.log('art-pack:', Object.keys(out).length, 'images');

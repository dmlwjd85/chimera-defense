// After `vite build`: list every file in dist/ for the service worker to store on install,
// and stamp the cache name with a content hash so each deploy replaces the old copy.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const dist = new URL('../dist/', import.meta.url).pathname;
const skip = (p) => p === 'sw.js' || p.startsWith('assets/rig/') || p.startsWith('assets/units/') || p.startsWith('assets/bg/') || p.startsWith('assets/fx/') || p.startsWith('assets/temp/') || p.startsWith('assets/m/') || p.startsWith('assets/art-pack');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else { const r = relative(dist, p).split('\\').join('/'); if (!skip(r)) files.push(r); } } };
walk(dist);
const h = createHash('sha1'); for (const f of files.sort()) h.update(f).update(readFileSync(join(dist, f)));
const ver = h.digest('hex').slice(0, 10);
let sw = readFileSync(join(dist, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'chimera-${ver}';`)
  .replace(/const CORE = \[[^\]]*\];/, `const CORE = ${JSON.stringify(['./', ...files.map((f) => './' + f)])};`);
writeFileSync(join(dist, 'sw.js'), sw);
// 앱 안 '🔄 업데이트' 버튼이 비교하는 최신 버전 표(캐시 이름과 같은 값)
writeFileSync(join(dist, 'version.json'), JSON.stringify({ ver, at: new Date().toISOString() }));
console.log('sw precache:', files.length, 'files, cache', ver);

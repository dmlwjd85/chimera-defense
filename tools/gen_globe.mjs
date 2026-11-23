// Build a small world map for the summon globe: land polygons (simplified) tagged with the game's continents.
// Source: world-atlas (Natural Earth 110m). Output: public/data/globe.json
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoCentroid, geoArea } from 'd3-geo';
const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-110m.json', import.meta.url), 'utf8'));
const fc = feature(topo, topo.objects.countries);
const contOf = ([lon, lat]) => {
  if (lat < -60) return 'antarctica';
  if (lon < -30) return 'america';
  if (lon > 110 && lat < -10) return 'oceania';
  if (lon >= -20 && lon <= 52 && lat < 37 && lat > -36 && !(lon > 34 && lat > 30)) return 'africa';
  return 'eurasia';
};
const r1 = (v) => Math.round(v * 10) / 10;
const polys = [];
for (const f of fc.features) {
  const cont = contOf(geoCentroid(f));
  const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of parts) {
    const ring = p[0];
    if (geoArea({ type: 'Polygon', coordinates: [ring] }) < 0.0006) continue; // drop specks
    const pts = ring.filter((_, i) => i % 2 === 0 || ring.length < 30).map(([a, b]) => [r1(a), r1(b)]);
    polys.push({ c: cont, p: pts });
  }
}
const centers = { eurasia: [95, 45], america: [-90, 15], africa: [20, 5] };
writeFileSync(new URL('../public/data/globe.json', import.meta.url), JSON.stringify({ centers, polys }));
console.log('polys', polys.length, 'points', polys.reduce((s, p) => s + p.p.length, 0));

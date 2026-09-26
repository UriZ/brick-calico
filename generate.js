#!/usr/bin/env node
// Brick model generator: voxelize a model spec, merge voxels into standard
// LEGO bricks layer by layer, verify stud connectivity, emit model JSON.
//
//   node generate.js models/calico-cat.js [--preview]
//
// A spec exports: { meta, grid: {W,D,H}, colors, inShape(p), colorAt(p) }
// with p in mm (x width, y up, z depth), origin at ground center.

const fs = require('fs');
const path = require('path');

const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: node generate.js <models/spec.js> [--preview]');
  process.exit(1);
}
const spec = require(path.resolve(specPath));
const showPreview = process.argv.includes('--preview');

const { W, D, H } = spec.grid;
const SX = 8, SY = 9.6;
const xmm = ix => (ix - W / 2 + 0.5) * SX;
const ymm = iy => (iy + 0.5) * SY;
const zmm = iz => (iz - D / 2 + 0.5) * SX;

/* ---------- voxelize ---------- */
const grid = [];
for (let iy = 0; iy < H; iy++) {
  const layer = [];
  for (let iz = 0; iz < D; iz++) {
    const row = [];
    for (let ix = 0; ix < W; ix++) {
      const p = { x: xmm(ix), y: ymm(iy), z: zmm(iz) };
      row.push(spec.inShape(p) ? spec.colorAt(p) : null);
    }
    layer.push(row);
  }
  grid.push(layer);
}
const get = (ix, iy, iz) =>
  ix >= 0 && ix < W && iy >= 0 && iy < H && iz >= 0 && iz < D ? grid[iy][iz][ix] : null;

/* ---------- previews ---------- */
function preview() {
  console.log('\nSIDE VIEW (facing right = +z):');
  for (let iy = H - 1; iy >= 0; iy--) {
    let line = '';
    for (let iz = 0; iz < D; iz++) {
      let c = ' ';
      for (let ix = 0; ix < W; ix++) if (get(ix, iy, iz)) { c = get(ix, iy, iz); break; }
      line += c;
    }
    console.log(String(iy).padStart(2) + '|' + line);
  }
  console.log('\nFRONT VIEW:');
  for (let iy = H - 1; iy >= 0; iy--) {
    let line = '';
    for (let ix = 0; ix < W; ix++) {
      let c = ' ';
      for (let iz = D - 1; iz >= 0; iz--) if (get(ix, iy, iz)) { c = get(ix, iy, iz); break; }
      line += c;
    }
    console.log(String(iy).padStart(2) + '|' + line);
  }
  console.log('\nTOP VIEW (+z = down):');
  for (let iz = 0; iz < D; iz++) {
    let line = '';
    for (let ix = 0; ix < W; ix++) {
      let c = ' ';
      for (let iy = H - 1; iy >= 0; iy--) if (get(ix, iy, iz)) { c = get(ix, iy, iz); break; }
      line += c;
    }
    console.log(String(iz).padStart(2) + '|' + line);
  }
}
if (showPreview) preview();

/* ---------- merge into bricks ---------- */
const SIZES = [[2, 6], [2, 4], [2, 3], [2, 2], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1]];
function orient(sizes, swap) {
  const out = [];
  for (const [a, b] of sizes) {
    if (swap) { out.push([b, a]); if (a !== b) out.push([a, b]); }
    else { out.push([a, b]); if (a !== b) out.push([b, a]); }
  }
  return out;
}

let layers = [];
for (let iy = 0; iy < H; iy++) {
  const used = Array.from({ length: D }, () => new Array(W).fill(false));
  const bricks = [];
  const sizes = orient(SIZES, iy % 2 === 1); // alternate x/z bias for interlock
  const fits = (ix, iz, w, d, c) => {
    if (ix + w > W || iz + d > D) return false;
    for (let dz = 0; dz < d; dz++)
      for (let dx = 0; dx < w; dx++)
        if (used[iz + dz][ix + dx] || get(ix + dx, iy, iz + dz) !== c) return false;
    return true;
  };
  // stud support: does the footprint sit on at least one voxel of the layer below?
  const supported = (ix, iz, w, d) => {
    if (iy === 0) return true;
    for (let dz = 0; dz < d; dz++)
      for (let dx = 0; dx < w; dx++)
        if (get(ix + dx, iy - 1, iz + dz)) return true;
    return false;
  };
  // Pass 1: every cell with no voxel below must share a brick with a cell
  // that has one, or it can never gain a stud connection — steep walls
  // otherwise merge into free-floating 1-wide columns. For each such cell,
  // search all placements covering it (any offset) that also touch support.
  if (iy > 0) {
    for (let iz = 0; iz < D; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const c = get(ix, iy, iz);
        if (!c || used[iz][ix] || get(ix, iy - 1, iz)) continue;
        let placed = null;
        for (const [w, d] of sizes) {
          for (let sx = ix - w + 1; sx <= ix && !placed; sx++)
            for (let sz = iz - d + 1; sz <= iz && !placed; sz++)
              if (sx >= 0 && sz >= 0 && fits(sx, sz, w, d, c) && supported(sx, sz, w, d))
                placed = [sx, sz, w, d];
          if (placed) break;
        }
        if (placed) {
          const [sx, sz, w, d] = placed;
          for (let dz = 0; dz < d; dz++)
            for (let dx = 0; dx < w; dx++) used[sz + dz][sx + dx] = true;
          bricks.push({ x: sx, z: sz, w, d, c });
        }
      }
    }
  }
  // Pass 2: fill the rest, still preferring supported placements
  for (let iz = 0; iz < D; iz++) {
    for (let ix = 0; ix < W; ix++) {
      const c = get(ix, iy, iz);
      if (!c || used[iz][ix]) continue;
      let placed = null;
      for (const [w, d] of sizes) {
        if (fits(ix, iz, w, d, c) && supported(ix, iz, w, d)) { placed = [w, d]; break; }
      }
      if (!placed) {
        for (const [w, d] of sizes) {
          if (fits(ix, iz, w, d, c)) { placed = [w, d]; break; }
        }
      }
      const [w, d] = placed;
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++) used[iz + dz][ix + dx] = true;
      bricks.push({ x: ix, z: iz, w, d, c });
    }
  }
  if (bricks.length) layers.push({ y: iy, bricks });
}

/* ---------- connectivity (stud connections = vertical overlap) ---------- */
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}
let allBricks = [];
layers.forEach(L => L.bricks.forEach(b => allBricks.push({ ...b, y: L.y })));
const byLayer = new Map();
allBricks.forEach((b, i) => {
  if (!byLayer.has(b.y)) byLayer.set(b.y, []);
  byLayer.get(b.y).push(i);
});
const seen = new Set();
const queue = (byLayer.get(0) || []).slice();
queue.forEach(i => seen.add(i));
while (queue.length) {
  const i = queue.pop();
  const b = allBricks[i];
  for (const dy of [-1, 1]) {
    for (const j of byLayer.get(b.y + dy) || []) {
      if (!seen.has(j) && overlaps(allBricks[j], b)) { seen.add(j); queue.push(j); }
    }
  }
}
allBricks.forEach((b, i) => {
  if (!seen.has(i)) console.log('FLOATING (dropped):', JSON.stringify(b));
});
const kept = allBricks.filter((_, i) => seen.has(i));
const layerMap = new Map();
kept.forEach(b => {
  if (!layerMap.has(b.y)) layerMap.set(b.y, { y: b.y, bricks: [] });
  layerMap.get(b.y).bricks.push({ x: b.x, z: b.z, w: b.w, d: b.d, c: b.c });
});
layers = [...layerMap.keys()].sort((a, b) => a - b).map(y => layerMap.get(y));

/* ---------- stats & output ---------- */
const counts = {};
kept.forEach(b => {
  const key = `${Math.min(b.w, b.d)}x${Math.max(b.w, b.d)} ${spec.colors[b.c].name}`;
  counts[key] = (counts[key] || 0) + 1;
});
console.log('\n--- ' + spec.meta.title + ' ---');
console.log('bricks:', kept.length, '| layers:', layers.length,
  '| dropped (unconnected):', allBricks.length - kept.length);
console.log('size: %s x %s x %s cm (W x D x H grid)',
  (W * 0.8).toFixed(1), (D * 0.8).toFixed(1), (H * 0.96).toFixed(1));
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));

const out = { meta: spec.meta, grid: spec.grid, colors: spec.colors, layers };
const outDir = path.join(__dirname, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, spec.meta.slug + '.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('\nwrote ' + path.relative(process.cwd(), outPath) + ', ' + JSON.stringify(out).length + ' bytes');

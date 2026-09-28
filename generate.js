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

/* ---------- slope pass ----------
   A surface cell becomes a 45° slope facing direction d when: nothing above it,
   the neighbor toward d on its own layer is empty, and the cell diagonally
   behind-above (-d, +1) is filled — i.e. the classic stair-step. Requires a
   voxel below so slopes never carry structure. Corner cells (two candidate
   directions) stay square. */
const DIRS = [
  { dx: 1, dz: 0, name: 'E' }, { dx: -1, dz: 0, name: 'W' },
  { dx: 0, dz: 1, name: 'S' }, { dx: 0, dz: -1, name: 'N' },
];
const slopeDir = Array.from({ length: H }, () =>
  Array.from({ length: D }, () => new Array(W).fill(null)));
for (let iy = 0; iy < H; iy++)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (!get(ix, iy, iz) || get(ix, iy + 1, iz)) continue;
      if (iy > 0 && !get(ix, iy - 1, iz)) continue;
      // a neighbor with no support below may need this cell as a same-layer
      // bridge to reach a stud connection — keep it square in that case
      const needyNeighbor = iy > 0 && DIRS.some(d =>
        get(ix + d.dx, iy, iz + d.dz) && !get(ix + d.dx, iy - 1, iz + d.dz));
      if (needyNeighbor) continue;
      const cands = DIRS.filter(d =>
        !get(ix + d.dx, iy, iz + d.dz) && get(ix - d.dx, iy + 1, iz - d.dz));
      if (cands.length === 1) slopeDir[iy][iz][ix] = cands[0].name;
    }

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

  // merge slope cells first: 1 deep in the facing direction, runs of up to 4
  // wide along the perpendicular, same color + direction
  for (let iz = 0; iz < D; iz++) {
    for (let ix = 0; ix < W; ix++) {
      const dir = slopeDir[iy][iz][ix];
      if (!dir || used[iz][ix]) continue;
      const c = get(ix, iy, iz);
      const alongX = dir === 'S' || dir === 'N'; // run perpendicular to facing
      let run = 1;
      while (run < 4) {
        const nx = ix + (alongX ? run : 0), nz = iz + (alongX ? 0 : run);
        if (nx >= W || nz >= D || used[nz][nx]) break;
        if (slopeDir[iy][nz][nx] !== dir || get(nx, iy, nz) !== c) break;
        run++;
      }
      for (let i = 0; i < run; i++)
        used[iz + (alongX ? 0 : i)][ix + (alongX ? i : 0)] = true;
      bricks.push({
        x: ix, z: iz, w: alongX ? run : 1, d: alongX ? 1 : run, c,
        k: 's', dir,
      });
    }
  }
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

/* ---------- tile caps: every exposed stud gets a smooth tile ---------- */
const occ = Array.from({ length: H }, () =>
  Array.from({ length: D }, () => new Array(W).fill(false)));
kept.forEach(b => {
  for (let dz = 0; dz < b.d; dz++)
    for (let dx = 0; dx < b.w; dx++) occ[b.y][b.z + dz][b.x + dx] = true;
});
const covered = (ix, iy, iz) => iy + 1 < H && occ[iy + 1][iz][ix];
kept.forEach(b => {
  if (b.k === 's') return; // slopes have no studs
  // greedy-merge this brick's exposed cells into tile rectangles (rows, then widen)
  const caps = [];
  const done = new Set();
  for (let dz = 0; dz < b.d; dz++)
    for (let dx = 0; dx < b.w; dx++) {
      const key = dx + ',' + dz;
      if (done.has(key) || covered(b.x + dx, b.y, b.z + dz)) continue;
      let w = 1;
      while (dx + w < b.w && !done.has((dx + w) + ',' + dz) &&
             !covered(b.x + dx + w, b.y, b.z + dz)) w++;
      let d = 1;
      outer: while (dz + d < b.d) {
        for (let i = 0; i < w; i++)
          if (done.has((dx + i) + ',' + (dz + d)) ||
              covered(b.x + dx + i, b.y, b.z + dz + d)) break outer;
        d++;
      }
      for (let jz = 0; jz < d; jz++)
        for (let jx = 0; jx < w; jx++) done.add((dx + jx) + ',' + (dz + jz));
      caps.push([b.x + dx, b.z + dz, w, d]);
    }
  if (caps.length) b.caps = caps;
});

const layerMap = new Map();
kept.forEach(b => {
  if (!layerMap.has(b.y)) layerMap.set(b.y, { y: b.y, bricks: [] });
  const { y, ...rest } = b;
  layerMap.get(b.y).bricks.push(rest);
});
layers = [...layerMap.keys()].sort((a, b) => a - b).map(y => layerMap.get(y));

/* ---------- stats & output ---------- */
const counts = {};
let tileCount = 0, slopeCount = 0;
kept.forEach(b => {
  const kind = b.k === 's' ? 'Slope' : 'Brick';
  if (b.k === 's') slopeCount++;
  const key = `${kind} ${Math.min(b.w, b.d)}x${Math.max(b.w, b.d)} ${spec.colors[b.c].name}`;
  counts[key] = (counts[key] || 0) + 1;
  (b.caps || []).forEach(([, , w, d]) => {
    tileCount++;
    const tk = `Tile ${Math.min(w, d)}x${Math.max(w, d)} ${spec.colors[b.c].name}`;
    counts[tk] = (counts[tk] || 0) + 1;
  });
});
console.log('slopes:', slopeCount, '| tile caps:', tileCount);
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

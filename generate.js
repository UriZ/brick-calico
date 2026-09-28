#!/usr/bin/env node
// Brick model generator, plate resolution: voxelize a model spec at 3.2mm
// vertical steps, merge voxels into bricks (3 plates tall), plates, and
// sloped parts, verify stud connectivity with a repair loop, emit JSON.
//
//   node generate.js models/calico-cat.js [--preview]
//
// A spec exports: { meta, grid: {W,D,H}, colors, inShape(p), colorAt(p) }
// with p in mm (x width, y up, z depth), origin at ground center.
// grid.H is given in brick layers; internally the engine works in plates.

const fs = require('fs');
const path = require('path');

const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: node generate.js <models/spec.js> [--preview]');
  process.exit(1);
}
const spec = require(path.resolve(specPath));
const showPreview = process.argv.includes('--preview');

const { W, D } = spec.grid;
const P = spec.grid.H * 3;            // total plate layers
const SX = 8, PY = 3.2;
const xmm = ix => (ix - W / 2 + 0.5) * SX;
const ymm = py => (py + 0.5) * PY;
const zmm = iz => (iz - D / 2 + 0.5) * SX;

/* ---------- voxelize (plate resolution) ---------- */
const grid = [];
for (let py = 0; py < P; py++) {
  const layer = [];
  for (let iz = 0; iz < D; iz++) {
    const row = [];
    for (let ix = 0; ix < W; ix++) {
      const p = { x: xmm(ix), y: ymm(py), z: zmm(iz) };
      row.push(spec.inShape(p) ? spec.colorAt(p) : null);
    }
    layer.push(row);
  }
  grid.push(layer);
}
const get = (ix, py, iz) =>
  ix >= 0 && ix < W && py >= 0 && py < P && iz >= 0 && iz < D ? grid[py][iz][ix] : null;

/* erode doomed lips: a 1-plate-thin cell (nothing above or below) whose
   orthogonal same-color neighbors are all thin too can never gain a stud
   connection — a single pass removes the outermost such ring */
{
  const DIRS0 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const thin = (x, py, z) => py > 0 && get(x, py, z) &&
    !get(x, py + 1, z) && !get(x, py - 1, z);
  const doomed = [];
  for (let py = 1; py < P; py++)
    for (let iz = 0; iz < D; iz++)
      for (let ix = 0; ix < W; ix++) {
        if (!thin(ix, py, iz)) continue;
        const c = grid[py][iz][ix];
        const rescued = DIRS0.some(([dx, dz]) =>
          get(ix + dx, py, iz + dz) === c && !thin(ix + dx, py, iz + dz));
        if (!rescued) doomed.push([ix, py, iz]);
      }
  for (const [ix, py, iz] of doomed) grid[py][iz][ix] = null;
  if (doomed.length) console.log('eroded doomed lip cells:', doomed.length);
}
// color of a 3-plate column starting at py, or null if mixed/incomplete
const color3 = (ix, py, iz) => {
  const c = get(ix, py, iz);
  if (!c || get(ix, py + 1, iz) !== c || get(ix, py + 2, iz) !== c) return null;
  return c;
};

/* ---------- previews (front view at plate resolution) ---------- */
if (showPreview) {
  console.log('\nFRONT VIEW (plate rows):');
  for (let py = P - 1; py >= 0; py--) {
    let line = '';
    for (let ix = 0; ix < W; ix++) {
      let c = ' ';
      for (let iz = D - 1; iz >= 0; iz--) if (get(ix, py, iz)) { c = get(ix, py, iz); break; }
      line += c;
    }
    if (line.trim() || py < 4) console.log(String(py).padStart(3) + '|' + line);
  }
}

/* ---------- slope pass ----------
   Sloped parts are brick-height (3 plates) and placed only where the shape
   steps a full brick over one or two studs — steep walls, ear tips, arches.
   Gentle curves are left to 1-plate stepping, which reads smooth by itself.
   's' 45° slope (1 deep), 'c' curved slope (2 deep), 'i' inverted (1 deep,
   hanging). Cells whose neighbor lacks support stay square (bridge duty). */
const DIRS = [
  { dx: 1, dz: 0, name: 'E' }, { dx: -1, dz: 0, name: 'W' },
  { dx: 0, dz: 1, name: 'S' }, { dx: 0, dz: -1, name: 'N' },
];
const slopeAt = Array.from({ length: P }, () =>
  Array.from({ length: D }, () => new Array(W).fill(null)));
const isNeedy = (ix, py, iz) => py > 0 && DIRS.some(d =>
  get(ix + d.dx, py, iz + d.dz) && !get(ix + d.dx, py - 1, iz + d.dz));
const colEmpty = (ix, py, iz) =>
  !get(ix, py, iz) && !get(ix, py + 1, iz) && !get(ix, py + 2, iz);

for (let py = 0; py + 2 < P; py += 3)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (slopeAt[py][iz][ix]) continue;
      const c = color3(ix, py, iz);
      if (!c || get(ix, py + 3, iz)) continue;        // full column, exposed top
      if (py > 0 && !get(ix, py - 1, iz)) continue;   // resting on something
      if (isNeedy(ix, py, iz)) continue;
      // curved (2 deep) first: two-column ledge with the wall rising behind
      let placedC = false;
      const candsC = DIRS.filter(d => {
        const bx = ix + d.dx, bz = iz + d.dz;
        return color3(bx, py, bz) === c && !get(bx, py + 3, bz) &&
          !(slopeAt[py][bz] ?.[bx]) &&
          colEmpty(bx + d.dx, py, bz + d.dz) &&
          get(ix - d.dx, py + 3, iz - d.dz) &&
          (py === 0 || get(bx, py - 1, bz)) && !isNeedy(bx, py, bz);
      });
      if (candsC.length === 1) {
        const d = candsC[0];
        slopeAt[py][iz][ix] = { k: 'c', dir: d.name, lead: true };
        slopeAt[py][iz + d.dz][ix + d.dx] = { k: 'c', dir: d.name, lead: false };
        placedC = true;
      }
      if (placedC) continue;
      const cands = DIRS.filter(d =>
        colEmpty(ix + d.dx, py, iz + d.dz) &&
        get(ix - d.dx, py + 3, iz - d.dz) &&
        !(slopeAt[py][iz + d.dz] ?.[ix + d.dx]));
      if (cands.length === 1) slopeAt[py][iz][ix] = { k: 's', dir: cands[0].name, lead: true };
    }
// inverted slopes on the undersides
for (let py = 3; py + 2 < P; py += 3)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (slopeAt[py][iz][ix]) continue;
      const c = color3(ix, py, iz);
      if (!c || !get(ix, py + 3, iz)) continue;       // hangs from above
      if (get(ix, py - 1, iz)) continue;              // nothing below
      if (isNeedy(ix, py, iz)) continue;
      const cands = DIRS.filter(d =>
        colEmpty(ix + d.dx, py, iz + d.dz) &&
        get(ix - d.dx, py - 1, iz - d.dz) &&
        !(slopeAt[py][iz + d.dz] ?.[ix + d.dx]));
      if (cands.length === 1) slopeAt[py][iz][ix] = { k: 'i', dir: cands[0].name, lead: true };
    }

/* ---------- merge (bricks, plates, sloped parts) ---------- */
const SIZES = [[2, 6], [2, 4], [2, 3], [2, 2], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1]];
function orient(sizes, swap) {
  const out = [];
  for (const [a, b] of sizes) {
    if (swap) { out.push([b, a]); if (a !== b) out.push([a, b]); }
    else { out.push([a, b]); if (a !== b) out.push([b, a]); }
  }
  return out;
}

function mergeAll(forced) {
  const claimed = Array.from({ length: P }, () =>
    Array.from({ length: D }, () => new Array(W).fill(false)));
  const parts = [];
  const free = (ix, py, iz, h) => {
    for (let i = 0; i < h; i++) if (claimed[py + i][iz][ix]) return false;
    return true;
  };
  const claim = (x, z, w, d, py, h) => {
    for (let i = 0; i < h; i++)
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++) claimed[py + i][z + dz][x + dx] = true;
  };

  for (let py = 0; py < P; py++) {
    const sizes = orient(SIZES, py % 2 === 1);
    // footprint fits at height h (1 = plate, 3 = brick: uniform color column)
    const fits = (sx, sz, w, d, c, h) => {
      if (sx < 0 || sz < 0 || sx + w > W || sz + d > D || py + h > P) return false;
      if (h === 3 && py % 3 !== 0) return false; // bricks stay phase-aligned
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++) {
          const x = sx + dx, z = sz + dz;
          if (!free(x, py, z, h)) return false;
          if (h === 1 ? get(x, py, z) !== c : color3(x, py, z) !== c) return false;
        }
      return true;
    };
    const supported = (sx, sz, w, d) => {
      if (py === 0) return true;
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++)
          if (get(sx + dx, py - 1, sz + dz)) return true;
      return false;
    };

    // pass 0: dominoes forced by the repair loop
    for (const f of forced) {
      if (f.y !== py) continue;
      if (fits(f.x, f.z, f.w, f.d, f.c, f.h)) {
        claim(f.x, f.z, f.w, f.d, py, f.h);
        parts.push({ y: py, x: f.x, z: f.z, w: f.w, d: f.d, c: f.c, h: f.h });
      }
    }

    // sloped parts based at this plate (3 plates tall)
    for (let iz = 0; iz < D; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const sl = slopeAt[py][iz][ix];
        if (!sl || !sl.lead) continue;
        const c = get(ix, py, iz);
        const alongX = sl.dir === 'S' || sl.dir === 'N';
        const depth = sl.k === 'c' ? 2 : 1;
        const dd = DIRS.find(d => d.name === sl.dir);
        const cellsOf = run => {
          const cells = [];
          for (let i = 0; i < run; i++)
            for (let j = 0; j < depth; j++)
              cells.push([ix + (alongX ? i : 0) + j * dd.dx, iz + (alongX ? 0 : i) + j * dd.dz]);
          return cells;
        };
        const allFree = run => cellsOf(run).every(([cx, cz]) =>
          cx >= 0 && cx < W && cz >= 0 && cz < D && free(cx, py, cz, 3));
        if (!allFree(1)) continue;
        const same = (nx, nz) => {
          const o = nx >= 0 && nx < W && nz >= 0 && nz < D ? slopeAt[py][nz][nx] : null;
          return o && o.lead && o.k === sl.k && o.dir === sl.dir && get(nx, py, nz) === c;
        };
        let run = 1;
        while (run < 4) {
          const nx = ix + (alongX ? run : 0), nz = iz + (alongX ? 0 : run);
          if (!same(nx, nz) || !allFree(run + 1)) break;
          run++;
        }
        const cells = cellsOf(run);
        let minX = W, minZ = D;
        for (const [cx, cz] of cells) {
          minX = Math.min(minX, cx);
          minZ = Math.min(minZ, cz);
        }
        const w = alongX ? run : depth, d = alongX ? depth : run;
        claim(minX, minZ, w, d, py, 3);
        parts.push({ y: py, x: minX, z: minZ, w, d, c, h: 3, k: sl.k, dir: sl.dir });
      }
    }

    // pass 1: unsupported cells must share a part with a supported cell
    if (py > 0) {
      for (let iz = 0; iz < D; iz++) {
        for (let ix = 0; ix < W; ix++) {
          const c = get(ix, py, iz);
          if (!c || claimed[py][iz][ix] || get(ix, py - 1, iz)) continue;
          let placed = null;
          outer:
          for (const h of [3, 1]) {
            const cc = h === 3 ? color3(ix, py, iz) : c;
            if (!cc) continue;
            for (const [w, d] of sizes)
              for (let sx = ix - w + 1; sx <= ix; sx++)
                for (let sz = iz - d + 1; sz <= iz; sz++)
                  if (fits(sx, sz, w, d, cc, h) && supported(sx, sz, w, d)) {
                    placed = [sx, sz, w, d, h, cc];
                    break outer;
                  }
          }
          if (placed) {
            const [sx, sz, w, d, h, cc] = placed;
            claim(sx, sz, w, d, py, h);
            parts.push({ y: py, x: sx, z: sz, w, d, c: cc, h });
          }
        }
      }
    }

    // pass 2: fill — supported bricks, supported plates, then any
    for (let iz = 0; iz < D; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const c = get(ix, py, iz);
        if (!c || claimed[py][iz][ix]) continue;
        const c3 = color3(ix, py, iz);
        const tryPass = (h, needSupport) => {
          const cc = h === 3 ? c3 : c;
          if (!cc) return null;
          for (const [w, d] of sizes)
            if (fits(ix, iz, w, d, cc, h) && (!needSupport || supported(ix, iz, w, d)))
              return [w, d, h, cc];
          return null;
        };
        const placed = tryPass(3, true) || tryPass(1, true) || tryPass(3, false) || tryPass(1, false);
        const [w, d, h, cc] = placed;
        claim(ix, iz, w, d, py, h);
        parts.push({ y: py, x: ix, z: iz, w, d, c: cc, h });
      }
    }
  }
  return parts;
}

/* ---------- connectivity (stud connections = vertical overlap) ---------- */
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}
function connectivity(parts) {
  const byBase = new Map(), byTop = new Map();
  parts.forEach((b, i) => {
    if (!byBase.has(b.y)) byBase.set(b.y, []);
    byBase.get(b.y).push(i);
    const t = b.y + b.h;
    if (!byTop.has(t)) byTop.set(t, []);
    byTop.get(t).push(i);
  });
  const seen = new Set();
  const queue = (byBase.get(0) || []).slice();
  queue.forEach(i => seen.add(i));
  while (queue.length) {
    const i = queue.pop();
    const b = parts[i];
    for (const j of byBase.get(b.y + b.h) || [])
      if (!seen.has(j) && overlaps(parts[j], b)) { seen.add(j); queue.push(j); }
    for (const j of byTop.get(b.y) || [])
      if (!seen.has(j) && overlaps(parts[j], b)) { seen.add(j); queue.push(j); }
  }
  return seen;
}

/* ---------- repair loop ----------
   When a merged component floats, force a minimal plate "domino" across its
   seam onto an anchored kept cell and re-merge; stale bridges are removed
   and blacklisted so the ordinary passes can retry those cells. */
let forced = [];
const dead = new Set();
const fkey = f => [f.y, f.x, f.z, f.w, f.d, f.h].join('/');
let parts, seen;
for (let attempt = 0; attempt < 40; attempt++) {
  parts = mergeAll(forced);
  seen = connectivity(parts);
  const floats = parts.filter((_, i) => !seen.has(i));
  if (!floats.length) break;
  const floatKeys = new Set(floats.map(fkey));
  const before = forced.length;
  forced = forced.filter(f => {
    if (floatKeys.has(fkey(f))) { dead.add(fkey(f)); return false; }
    return true;
  });
  if (forced.length < before) continue; // stale bridges removed — retry clean
  const keptCells = new Set();
  parts.forEach((b, i) => {
    if (!seen.has(i)) return;
    for (let p = b.y; p < b.y + b.h; p++)
      for (let dz = 0; dz < b.d; dz++)
        for (let dx = 0; dx < b.w; dx++)
          keptCells.add(p + '|' + (b.x + dx) + ',' + (b.z + dz));
  });
  const forcedCells = new Set();
  forced.forEach(f => {
    for (let p = f.y; p < f.y + f.h; p++)
      for (let dz = 0; dz < f.d; dz++)
        for (let dx = 0; dx < f.w; dx++)
          forcedCells.add(p + '|' + (f.x + dx) + ',' + (f.z + dz));
  });
  const anchored = (x, py, z) =>
    keptCells.has((py - 1) + '|' + x + ',' + z) || keptCells.has((py + 1) + '|' + x + ',' + z);
  let added = false;
  for (const fb of floats) {
    let done = false;
    for (let dz = 0; dz < fb.d && !done; dz++)
      for (let dx = 0; dx < fb.w && !done; dx++) {
        const cx = fb.x + dx, cz = fb.z + dz, py = fb.y;
        if (forcedCells.has(py + '|' + cx + ',' + cz)) continue;
        for (const dir of DIRS) {
          for (let len = 2; len <= 4 && !done; len++) {
            let ok = true, hasAnchor = false;
            for (let i = 0; i < len; i++) {
              const px = cx + dir.dx * i, pz = cz + dir.dz * i;
              if (get(px, py, pz) !== fb.c || forcedCells.has(py + '|' + px + ',' + pz)) { ok = false; break; }
              if (i > 0 && anchored(px, py, pz)) hasAnchor = true;
            }
            if (!ok) break;
            if (!hasAnchor) continue;
            const ex = cx + dir.dx * (len - 1), ez = cz + dir.dz * (len - 1);
            const f = {
              y: py, c: fb.c, h: 1,
              x: Math.min(cx, ex), z: Math.min(cz, ez),
              w: dir.dx ? len : 1, d: dir.dz ? len : 1,
            };
            if (dead.has(fkey(f))) continue;
            forced.push(f);
            for (let i = 0; i < len; i++)
              forcedCells.add(py + '|' + (cx + dir.dx * i) + ',' + (cz + dir.dz * i));
            added = true;
            done = true;
          }
          if (done) break;
        }
      }
  }
  if (!added) break;
}
parts.forEach((b, i) => {
  if (!seen.has(i)) console.log('FLOATING (dropped):', JSON.stringify(b));
});
const kept = parts.filter((_, i) => seen.has(i));

/* ---------- tile caps: every exposed stud gets a smooth tile ---------- */
const occ = Array.from({ length: P }, () =>
  Array.from({ length: D }, () => new Array(W).fill(false)));
kept.forEach(b => {
  for (let p = b.y; p < b.y + b.h; p++)
    for (let dz = 0; dz < b.d; dz++)
      for (let dx = 0; dx < b.w; dx++) occ[p][b.z + dz][b.x + dx] = true;
});
const covered = (ix, pTop, iz) => pTop + 1 < P && occ[pTop + 1][iz][ix];
kept.forEach(b => {
  if (b.k) return; // sloped parts have no studs
  const top = b.y + b.h - 1;
  const caps = [];
  const done = new Set();
  for (let dz = 0; dz < b.d; dz++)
    for (let dx = 0; dx < b.w; dx++) {
      const key = dx + ',' + dz;
      if (done.has(key) || covered(b.x + dx, top, b.z + dz)) continue;
      let w = 1;
      while (dx + w < b.w && !done.has((dx + w) + ',' + dz) &&
             !covered(b.x + dx + w, top, b.z + dz)) w++;
      let d = 1;
      outer: while (dz + d < b.d) {
        for (let i = 0; i < w; i++)
          if (done.has((dx + i) + ',' + (dz + d)) ||
              covered(b.x + dx + i, top, b.z + dz + d)) break outer;
        d++;
      }
      for (let jz = 0; jz < d; jz++)
        for (let jx = 0; jx < w; jx++) done.add((dx + jx) + ',' + (dz + jz));
      caps.push([b.x + dx, b.z + dz, w, d]);
    }
  if (caps.length) b.caps = caps;
});

/* ---------- stats & output ---------- */
const label = b =>
  b.k === 's' ? 'Slope' : b.k === 'c' ? 'Curved slope' : b.k === 'i' ? 'Inv. slope' :
  b.h === 1 ? 'Plate' : 'Brick';
const counts = {};
let tileCount = 0, slopeCount = 0, plateCount = 0;
kept.forEach(b => {
  if (b.k) slopeCount++;
  else if (b.h === 1) plateCount++;
  const key = `${label(b)} ${Math.min(b.w, b.d)}x${Math.max(b.w, b.d)} ${spec.colors[b.c].name}`;
  counts[key] = (counts[key] || 0) + 1;
  (b.caps || []).forEach(([, , w, d]) => {
    tileCount++;
    const tk = `Tile ${Math.min(w, d)}x${Math.max(w, d)} ${spec.colors[b.c].name}`;
    counts[tk] = (counts[tk] || 0) + 1;
  });
});
console.log('\n--- ' + spec.meta.title + ' ---');
console.log('parts:', kept.length, `(plates: ${plateCount}, slopes: ${slopeCount})`,
  '| tile caps:', tileCount,
  '| plate layers:', P,
  '| dropped (unconnected):', parts.length - kept.length);
console.log('size: %s x %s x %s cm (W x D x H grid)',
  (W * 0.8).toFixed(1), (D * 0.8).toFixed(1), (P * 0.32).toFixed(1));
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([k, v]) => `${v}\t${k}`).join('\n'));

const layerMap = new Map();
kept.forEach(b => {
  if (!layerMap.has(b.y)) layerMap.set(b.y, { y: b.y, bricks: [] });
  const { y, ...rest } = b;
  layerMap.get(b.y).bricks.push(rest);
});
const layers = [...layerMap.keys()].sort((a, b) => a - b).map(y => layerMap.get(y));

const out = {
  meta: spec.meta,
  grid: { W, D, H: P, unit: 'plate' },
  colors: spec.colors,
  layers,
};
const outDir = path.join(__dirname, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, spec.meta.slug + '.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('\nwrote ' + path.relative(process.cwd(), outPath) + ', ' + JSON.stringify(out).length + ' bytes');

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
   Surface cells become sloped parts so curved shapes read smooth:
   - 's'  45° slope: nothing above, neighbor toward d empty, behind-above
          filled (classic stair-step), voxel below.
   - 'c'  curved slope, 2 deep: a two-cell ledge (this cell + the one toward
          d) with the wall rising behind — the gentle-step case. The lead
          cell stores it; the second cell is consumed with it.
   - 'i'  inverted 45° slope on the underside: nothing below, neighbor toward
          d empty, behind-below filled, and a voxel above to hang from.
   Cells that an unsupported neighbor may need as a same-layer bridge stay
   square, as do corner cells (two candidate directions). */
const DIRS = [
  { dx: 1, dz: 0, name: 'E' }, { dx: -1, dz: 0, name: 'W' },
  { dx: 0, dz: 1, name: 'S' }, { dx: 0, dz: -1, name: 'N' },
];
const slopeAt = Array.from({ length: H }, () =>
  Array.from({ length: D }, () => new Array(W).fill(null)));
const isNeedy = (ix, iy, iz) => iy > 0 && DIRS.some(d =>
  get(ix + d.dx, iy, iz + d.dz) && !get(ix + d.dx, iy - 1, iz + d.dz));

// curved slopes first (they claim two cells)
for (let iy = 0; iy < H; iy++)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (!get(ix, iy, iz) || get(ix, iy + 1, iz) || slopeAt[iy][iz][ix]) continue;
      if (iy > 0 && !get(ix, iy - 1, iz)) continue;
      if (isNeedy(ix, iy, iz)) continue;
      const cands = DIRS.filter(d => {
        const bx = ix + d.dx, bz = iz + d.dz;
        return get(bx, iy, bz) && !get(bx, iy + 1, bz) && !slopeAt[iy][bz] ?.[bx] &&
          !get(bx + d.dx, iy, bz + d.dz) &&
          get(ix - d.dx, iy + 1, iz - d.dz) &&
          (iy === 0 || get(bx, iy - 1, bz)) && !isNeedy(bx, iy, bz);
      });
      if (cands.length === 1) {
        const d = cands[0];
        slopeAt[iy][iz][ix] = { k: 'c', dir: d.name, lead: true };
        slopeAt[iy][iz + d.dz][ix + d.dx] = { k: 'c', dir: d.name, lead: false };
      }
    }
// then plain 45° slopes
for (let iy = 0; iy < H; iy++)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (!get(ix, iy, iz) || get(ix, iy + 1, iz) || slopeAt[iy][iz][ix]) continue;
      if (iy > 0 && !get(ix, iy - 1, iz)) continue;
      if (isNeedy(ix, iy, iz)) continue;
      const cands = DIRS.filter(d =>
        !get(ix + d.dx, iy, iz + d.dz) && get(ix - d.dx, iy + 1, iz - d.dz) &&
        !(slopeAt[iy][iz + d.dz] ?.[ix + d.dx]));
      if (cands.length === 1) slopeAt[iy][iz][ix] = { k: 's', dir: cands[0].name, lead: true };
    }
// inverted slopes on the undersides
for (let iy = 1; iy < H; iy++)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (!get(ix, iy, iz) || slopeAt[iy][iz][ix]) continue;
      if (get(ix, iy - 1, iz) || !get(ix, iy + 1, iz)) continue; // hangs from above
      if (isNeedy(ix, iy, iz)) continue;
      const cands = DIRS.filter(d =>
        !get(ix + d.dx, iy, iz + d.dz) && get(ix - d.dx, iy - 1, iz - d.dz) &&
        !(slopeAt[iy][iz + d.dz] ?.[ix + d.dx]));
      if (cands.length === 1) slopeAt[iy][iz][ix] = { k: 'i', dir: cands[0].name, lead: true };
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

/* ---------- merge (as a function, so the repair loop can re-run it) ---------- */
function mergeAll(forced) {
  const layers = [];
  for (let iy = 0; iy < H; iy++) {
    const used = Array.from({ length: D }, () => new Array(W).fill(false));
    const bricks = [];
    const sizes = orient(SIZES, iy % 2 === 1); // alternate x/z bias for interlock
    const fits = (ix, iz, w, d, c) => {
      if (ix < 0 || iz < 0 || ix + w > W || iz + d > D) return false;
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++)
          if (used[iz + dz][ix + dx] || get(ix + dx, iy, iz + dz) !== c) return false;
      return true;
    };
    const supported = (ix, iz, w, d) => {
      if (iy === 0) return true;
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++)
          if (get(ix + dx, iy - 1, iz + dz)) return true;
      return false;
    };
    const claim = (x, z, w, d) => {
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++) used[z + dz][x + dx] = true;
    };

    // pass 0: dominoes forced by the repair loop — placed first so nothing steals them
    for (const f of forced) {
      if (f.y !== iy) continue;
      if (fits(f.x, f.z, f.w, f.d, f.c)) {
        claim(f.x, f.z, f.w, f.d);
        bricks.push({ x: f.x, z: f.z, w: f.w, d: f.d, c: f.c });
      }
    }

    // sloped cells: 1 deep ('s'/'i') or 2 deep ('c') toward the facing
    // direction, runs up to 4 wide along the perpendicular
    for (let iz = 0; iz < D; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const sl = slopeAt[iy][iz][ix];
        if (!sl || !sl.lead || used[iz][ix]) continue;
        const c = get(ix, iy, iz);
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
        const free = run => cellsOf(run).every(([cx, cz]) =>
          cx >= 0 && cx < W && cz >= 0 && cz < D && !used[cz][cx]);
        if (!free(1)) continue; // a forced domino claimed part of it — stay square
        const same = (nx, nz) => {
          const o = nx >= 0 && nx < W && nz >= 0 && nz < D ? slopeAt[iy][nz][nx] : null;
          return o && o.lead && o.k === sl.k && o.dir === sl.dir &&
            !used[nz][nx] && get(nx, iy, nz) === c;
        };
        let run = 1;
        while (run < 4) {
          const nx = ix + (alongX ? run : 0), nz = iz + (alongX ? 0 : run);
          if (!same(nx, nz) || !free(run + 1)) break;
          run++;
        }
        const cells = cellsOf(run);
        let minX = W, minZ = D;
        for (const [cx, cz] of cells) {
          used[cz][cx] = true;
          minX = Math.min(minX, cx);
          minZ = Math.min(minZ, cz);
        }
        bricks.push({
          x: minX, z: minZ,
          w: alongX ? run : depth, d: alongX ? depth : run, c,
          k: sl.k, dir: sl.dir,
        });
      }
    }

    // pass 1: every unsupported cell tries to share a brick with a supported one
    if (iy > 0) {
      for (let iz = 0; iz < D; iz++) {
        for (let ix = 0; ix < W; ix++) {
          const c = get(ix, iy, iz);
          if (!c || used[iz][ix] || get(ix, iy - 1, iz)) continue;
          let placed = null;
          for (const [w, d] of sizes) {
            for (let sx = ix - w + 1; sx <= ix && !placed; sx++)
              for (let sz = iz - d + 1; sz <= iz && !placed; sz++)
                if (fits(sx, sz, w, d, c) && supported(sx, sz, w, d))
                  placed = [sx, sz, w, d];
            if (placed) break;
          }
          if (placed) {
            claim(...placed);
            bricks.push({ x: placed[0], z: placed[1], w: placed[2], d: placed[3], c });
          }
        }
      }
    }

    // pass 2: fill the rest, preferring supported placements
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
        claim(ix, iz, w, d);
        bricks.push({ x: ix, z: iz, w, d, c });
      }
    }
    if (bricks.length) layers.push({ y: iy, bricks });
  }
  return layers;
}

/* ---------- connectivity (stud connections = vertical overlap) ---------- */
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}
function connectivity(layers) {
  const allBricks = [];
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
  return { allBricks, seen };
}

/* ---------- repair loop ----------
   When a merged component floats, force a minimal 2x1 "domino" across its
   seam onto a same-color kept cell and re-merge. Placed first on the next
   round, dominoes cannot be consumed by the greedy passes. */
let forced = [];
const dead = new Set(); // bridges that proved useless — never re-add them
const fkey = f => [f.y, f.x, f.z, f.w, f.d].join('/');
let layers, allBricks, seen;
for (let attempt = 0; attempt < 40; attempt++) {
  layers = mergeAll(forced);
  ({ allBricks, seen } = connectivity(layers));
  const floats = allBricks.filter((_, i) => !seen.has(i));
  if (!floats.length) break;
  // a forced bridge that itself floats is stale: remove it, blacklist it, and
  // let the ordinary passes have another go at those cells
  const floatKeys = new Set(floats.map(fkey));
  const before = forced.length;
  forced = forced.filter(f => {
    if (floatKeys.has(fkey(f))) { dead.add(fkey(f)); return false; }
    return true;
  });
  if (forced.length < before) continue;
  const keptCells = new Set();
  allBricks.forEach((b, i) => {
    if (!seen.has(i)) return;
    for (let dz = 0; dz < b.d; dz++)
      for (let dx = 0; dx < b.w; dx++)
        keptCells.add(b.y + '|' + (b.x + dx) + ',' + (b.z + dz));
  });
  const forcedCells = new Set();
  forced.forEach(f => {
    for (let dz = 0; dz < f.d; dz++)
      for (let dx = 0; dx < f.w; dx++)
        forcedCells.add(f.y + '|' + (f.x + dx) + ',' + (f.z + dz));
  });
  // a bridge must reach an ANCHORED cell — one with a voxel directly above
  // or below — otherwise the forced brick just floats too
  const anchored = (x, y, z) =>
    keptCells.has((y - 1) + '|' + x + ',' + z) || keptCells.has((y + 1) + '|' + x + ',' + z);
  let added = false;
  for (const fb of floats) {
    let done = false;
    for (let dz = 0; dz < fb.d && !done; dz++)
      for (let dx = 0; dx < fb.w && !done; dx++) {
        const cx = fb.x + dx, cz = fb.z + dz;
        if (forcedCells.has(fb.y + '|' + cx + ',' + cz)) {
          // a stale forced bridge whose anchor floated away: grow it one stud
          // toward a (currently) anchored cell so it reaches solid ground
          const f = forced.find(f => f.y === fb.y &&
            cx >= f.x && cx < f.x + f.w && cz >= f.z && cz < f.z + f.d);
          if (f && (f.w === 1 || f.d === 1) && Math.max(f.w, f.d) < 6) {
            const horiz = f.d === 1;
            const ends = horiz ? [[f.x - 1, f.z], [f.x + f.w, f.z]]
                               : [[f.x, f.z - 1], [f.x, f.z + f.d]];
            ends.sort((a, b) =>
              (anchored(b[0], fb.y, b[1]) ? 1 : 0) - (anchored(a[0], fb.y, a[1]) ? 1 : 0));
            for (const [ex, ez] of ends) {
              if (ex < 0 || ez < 0 || ex >= W || ez >= D) continue;
              if (get(ex, fb.y, ez) !== f.c || forcedCells.has(fb.y + '|' + ex + ',' + ez)) continue;
              if (horiz) { f.x = Math.min(f.x, ex); f.w += 1; }
              else { f.z = Math.min(f.z, ez); f.d += 1; }
              forcedCells.add(fb.y + '|' + ex + ',' + ez);
              added = true;
              done = true;
              break;
            }
          }
          continue;
        }
        for (const dir of DIRS) {
          // straight run from the float cell toward an anchored cell, length <= 4
          for (let len = 2; len <= 4 && !done; len++) {
            let ok = true, hasAnchor = false;
            for (let i = 0; i < len; i++) {
              const px = cx + dir.dx * i, pz = cz + dir.dz * i;
              if (get(px, fb.y, pz) !== fb.c || forcedCells.has(fb.y + '|' + px + ',' + pz)) { ok = false; break; }
              if (i > 0 && anchored(px, fb.y, pz)) hasAnchor = true;
            }
            if (!ok) break;
            if (!hasAnchor) continue;
            const ex = cx + dir.dx * (len - 1), ez = cz + dir.dz * (len - 1);
            const f = {
              y: fb.y, c: fb.c,
              x: Math.min(cx, ex), z: Math.min(cz, ez),
              w: dir.dx ? len : 1, d: dir.dz ? len : 1,
            };
            if (dead.has(fkey(f))) continue;
            forced.push(f);
            for (let i = 0; i < len; i++)
              forcedCells.add(fb.y + '|' + (cx + dir.dx * i) + ',' + (cz + dir.dz * i));
            added = true;
            done = true;
          }
          if (done) break;
        }
        if (done) continue;
        // last resort: extend an adjacent collinear forced brick to swallow this cell
        for (const dir of DIRS) {
          const nx = cx + dir.dx, nz = cz + dir.dz;
          const f = forced.find(f =>
            f.y === fb.y && f.c === fb.c &&
            nx >= f.x && nx < f.x + f.w && nz >= f.z && nz < f.z + f.d &&
            (dir.dx ? (f.d === 1 && f.z === cz && f.w < 6) : (f.w === 1 && f.x === cx && f.d < 6)));
          if (!f) continue;
          if (dir.dx) { f.x = Math.min(f.x, cx); f.w += 1; }
          else { f.z = Math.min(f.z, cz); f.d += 1; }
          forcedCells.add(fb.y + '|' + cx + ',' + cz);
          added = true;
          done = true;
          break;
        }
      }
  }
  if (!added) break; // no bridge exists; remaining floats get dropped
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
  if (b.k) return; // sloped parts have no studs
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
  const kind = { s: 'Slope', c: 'Curved slope', i: 'Inv. slope' }[b.k] || 'Brick';
  if (b.k) slopeCount++;
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

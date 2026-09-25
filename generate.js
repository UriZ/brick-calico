// LEGO calico cat generator
// Grid: x = width (studs, 8mm), z = depth (studs, 8mm), y = layers (bricks, 9.6mm)
// Cat faces +z. Origin: ground center.

const W = 22, D = 24, H = 26;
const SX = 8, SY = 9.6;

const xmm = ix => (ix - W / 2 + 0.5) * SX;
const ymm = iy => (iy + 0.5) * SY;
const zmm = iz => (iz - D / 2 + 0.5) * SX;

// ---------- shape primitives ----------
const sq = v => v * v;

function inEllipsoid(p, c, r) {
  return sq((p.x - c.x) / r.x) + sq((p.y - c.y) / r.y) + sq((p.z - c.z) / r.z) <= 1;
}
function inSphere(p, c, r) {
  return sq(p.x - c.x) + sq(p.y - c.y) + sq(p.z - c.z) <= r * r;
}
// swept sphere along segment with lerped radius
function inCapsule(p, a, b, r0, r1) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = (apx * abx + apy * aby + apz * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - t * abx, dy = apy - t * aby, dz = apz - t * abz;
  const r = r0 + (r1 - r0) * t;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

// tail: cubic bezier in xz plane at y=10, tube radius 9.5 -> 6.5
const TP = [{ x: 4, z: -90 }, { x: 70, z: -86 }, { x: 74, z: 14 }, { x: 30, z: 70 }];
function tailPoint(t) {
  const u = 1 - t;
  const x = u * u * u * TP[0].x + 3 * u * u * t * TP[1].x + 3 * u * t * t * TP[2].x + t * t * t * TP[3].x;
  const z = u * u * u * TP[0].z + 3 * u * u * t * TP[1].z + 3 * u * t * t * TP[2].z + t * t * t * TP[3].z;
  return { x, z };
}
function tailT(p) {
  // returns t of closest sample if inside tube, else -1
  if (p.y < 0 || p.y > 22) return -1;
  let best = -1, bestD = 1e9;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const q = tailPoint(t);
    const d = sq(p.x - q.x) + sq(p.z - q.z) + sq((p.y - 9) * 1.05);
    if (d < bestD) { bestD = d; best = t; }
  }
  const r = 9.5 + (6.5 - 9.5) * best;
  return bestD <= r * r ? best : -1;
}

// ears: elliptical cones on top of head
function inEar(p, sx) {
  const y0 = 204, y1 = 246;
  if (p.y < y0 || p.y > y1) return false;
  const t = (p.y - y0) / (y1 - y0);
  const r = 15 + (2.5 - 15) * t;
  const dx = p.x - sx * 21, dz = (p.z - 22) * 1.7;
  return dx * dx + dz * dz <= r * r;
}

function inCat(p) {
  if (p.y < 0) return false;
  // haunches / rear mass
  if (inEllipsoid(p, { x: 0, y: 58, z: -42 }, { x: 55, y: 62, z: 52 })) return true;
  // torso leaning up-forward
  if (inCapsule(p, { x: 0, y: 60, z: -36 }, { x: 0, y: 148, z: 16 }, 47, 37)) return true;
  // chest
  if (inEllipsoid(p, { x: 0, y: 118, z: 24 }, { x: 38, y: 52, z: 30 })) return true;
  // head
  if (inEllipsoid(p, { x: 0, y: 190, z: 30 }, { x: 34, y: 31, z: 32 })) return true;
  // muzzle
  if (inEllipsoid(p, { x: 0, y: 180, z: 58 }, { x: 18, y: 13, z: 16 })) return true;
  // ears
  if (inEar(p, 1) || inEar(p, -1)) return true;
  // front legs
  if (inCapsule(p, { x: 16, y: 14, z: 54 }, { x: 17, y: 96, z: 38 }, 11.5, 12)) return true;
  if (inCapsule(p, { x: -16, y: 14, z: 54 }, { x: -17, y: 96, z: 38 }, 11.5, 12)) return true;
  // front paws
  if (inEllipsoid(p, { x: 16, y: 9, z: 64 }, { x: 13, y: 11, z: 22 })) return true;
  if (inEllipsoid(p, { x: -16, y: 9, z: 64 }, { x: 13, y: 11, z: 22 })) return true;
  // hind paws peeking out
  if (inEllipsoid(p, { x: 37, y: 9, z: 14 }, { x: 11, y: 10, z: 22 })) return true;
  if (inEllipsoid(p, { x: -37, y: 9, z: 14 }, { x: 11, y: 10, z: 22 })) return true;
  // tail
  if (tailT(p) >= 0) return true;
  return false;
}

// ---------- calico coloring ----------
// colors: w white, o orange, k black, g green (eyes), p pink (nose)
function catColor(p) {
  // face details first
  if (inSphere(p, { x: 13, y: 196, z: 54 }, 7)) return 'g';
  if (inSphere(p, { x: -13, y: 196, z: 54 }, 7)) return 'g';
  if (inSphere(p, { x: 0, y: 186, z: 70 }, 7)) return 'p';

  const tt = tailT(p);
  if (tt >= 0) {
    if (tt > 0.78) return 'k';        // black tip
    if (tt > 0.5) return 'o';
    if (tt > 0.28) return 'k';
    return 'o';                        // orange base (tail is mostly patched)
  }
  // black patches
  if (inSphere(p, { x: 24, y: 216, z: 18 }, 27)) return 'k';   // right ear + crown
  if (inSphere(p, { x: 21, y: 193, z: 48 }, 15)) return 'k';   // right eye patch
  if (inEllipsoid(p, { x: -28, y: 128, z: -14 }, { x: 30, y: 42, z: 34 })) return 'k'; // left shoulder/back
  if (inSphere(p, { x: 42, y: 48, z: -62 }, 24)) return 'k';   // right rear spot
  // orange patches
  if (inSphere(p, { x: -24, y: 214, z: 20 }, 25)) return 'o';  // left ear
  if (inSphere(p, { x: -19, y: 191, z: 52 }, 13)) return 'o';  // left eye patch
  if (inEllipsoid(p, { x: 34, y: 84, z: -34 }, { x: 34, y: 52, z: 46 })) return 'o'; // right haunch
  if (inSphere(p, { x: -38, y: 60, z: -60 }, 22)) return 'o';  // left rear spot
  if (inSphere(p, { x: 12, y: 158, z: 8 }, 20)) return 'o';    // nape spot
  return 'w';
}

// ---------- voxelize ----------
// grid[iy][iz][ix] = color char or null
const grid = [];
for (let iy = 0; iy < H; iy++) {
  const layer = [];
  for (let iz = 0; iz < D; iz++) {
    const row = [];
    for (let ix = 0; ix < W; ix++) {
      const p = { x: xmm(ix), y: ymm(iy), z: zmm(iz) };
      row.push(inCat(p) ? catColor(p) : null);
    }
    layer.push(row);
  }
  grid.push(layer);
}

const get = (ix, iy, iz) =>
  ix >= 0 && ix < W && iy >= 0 && iy < H && iz >= 0 && iz < D ? grid[iy][iz][ix] : null;

// ---------- hollow interior (keep 1-voxel shell) ----------
let hollowed = 0;
const HOLLOW = false; // hollow shells break stud connectivity on tapered walls
const toRemove = [];
if (HOLLOW)
for (let iy = 0; iy < H; iy++)
  for (let iz = 0; iz < D; iz++)
    for (let ix = 0; ix < W; ix++) {
      if (!grid[iy][iz][ix]) continue;
      if (iy === 0) continue; // keep ground floor solid for stability
      if (
        get(ix + 1, iy, iz) && get(ix - 1, iy, iz) &&
        get(ix, iy + 1, iz) && get(ix, iy - 1, iz) &&
        get(ix, iy, iz + 1) && get(ix, iy, iz - 1)
      ) toRemove.push([ix, iy, iz]);
    }
for (const [ix, iy, iz] of toRemove) { grid[iy][iz][ix] = null; hollowed++; }

// ---------- previews ----------
function sideView() { // project along x: rows y (top down), cols z
  console.log('\nSIDE VIEW (facing right = +z):');
  for (let iy = H - 1; iy >= 0; iy--) {
    let line = '';
    for (let iz = 0; iz < D; iz++) {
      let c = ' ';
      for (let ix = 0; ix < W; ix++) if (get(ix, iy, iz)) { c = get(ix, iy, iz); break; }
      line += c === ' ' ? ' ' : c;
    }
    console.log(String(iy).padStart(2) + '|' + line);
  }
}
function frontView() { // project along z from front
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
}
function topView() {
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
sideView(); frontView(); topView();

// ---------- merge into bricks ----------
// sizes tried in order; alternate x/z bias per layer for interlock
const SIZES_A = [[2,6],[2,4],[2,3],[2,2],[1,6],[1,4],[1,3],[1,2],[1,1]];
function orient(sizes, swap) {
  const out = [];
  for (const [a, b] of sizes) {
    if (swap) { out.push([b, a]); if (a !== b) out.push([a, b]); }
    else { out.push([a, b]); if (a !== b) out.push([b, a]); }
  }
  return out;
}

const layers = [];
let totalBricks = 0;
for (let iy = 0; iy < H; iy++) {
  const used = Array.from({ length: D }, () => new Array(W).fill(false));
  const bricks = [];
  const sizes = orient(SIZES_A, iy % 2 === 1); // [w,d] = studs in x,z
  for (let iz = 0; iz < D; iz++) {
    for (let ix = 0; ix < W; ix++) {
      const c = get(ix, iy, iz);
      if (!c || used[iz][ix]) continue;
      let placed = null;
      for (const [w, d] of sizes) {
        if (ix + w > W || iz + d > D) continue;
        let ok = true;
        for (let dz = 0; dz < d && ok; dz++)
          for (let dx = 0; dx < w && ok; dx++) {
            if (used[iz + dz][ix + dx] || get(ix + dx, iy, iz + dz) !== c) ok = false;
          }
        if (ok) { placed = [w, d]; break; }
      }
      const [w, d] = placed;
      for (let dz = 0; dz < d; dz++)
        for (let dx = 0; dx < w; dx++) used[iz + dz][ix + dx] = true;
      bricks.push({ x: ix, z: iz, w, d, c });
    }
  }
  if (bricks.length) layers.push({ y: iy, bricks });
  totalBricks += bricks.length;
}

// ---------- connectivity check (stud connections = vertical overlap) ----------
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}
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
const floating = allBricks.length - seen.size;
allBricks.forEach((b, i) => {
  if (!seen.has(i)) console.log('FLOATING (dropped):', JSON.stringify(b));
});
// drop unconnected slivers and rebuild layer list
const kept = allBricks.filter((_, i) => seen.has(i));
layers.length = 0;
const layerMap = new Map();
kept.forEach(b => {
  if (!layerMap.has(b.y)) layerMap.set(b.y, { y: b.y, bricks: [] });
  layerMap.get(b.y).bricks.push({ x: b.x, z: b.z, w: b.w, d: b.d, c: b.c });
});
[...layerMap.keys()].sort((a, b) => a - b).forEach(y => layers.push(layerMap.get(y)));
totalBricks = kept.length;
allBricks.length = 0;
allBricks.push(...kept);

// ---------- stats & output ----------
const colorNames = { w: 'White', o: 'Bright Orange', k: 'Black', g: 'Lime', p: 'Bright Pink' };
const counts = {};
allBricks.forEach(b => {
  const key = `${Math.min(b.w, b.d)}x${Math.max(b.w, b.d)} ${colorNames[b.c]}`;
  counts[key] = (counts[key] || 0) + 1;
});
console.log('\n--- STATS ---');
console.log('voxels hollowed out:', hollowed);
console.log('total bricks:', totalBricks, '| layers:', layers.length);
console.log('floating (unconnected) bricks:', floating);
console.log('size: %s x %s x %s cm (W x D x H)',
  (W * 0.8).toFixed(1), (D * 0.8).toFixed(1), (H * 0.96).toFixed(1));
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));

const out = {
  name: 'Brick Calico',
  grid: { W, D, H },
  colors: {
    w: { hex: '#F2F0EB', name: 'White' },
    o: { hex: '#F87D10', name: 'Bright Orange' },
    k: { hex: '#1F262D', name: 'Black' },
    g: { hex: '#A6CA37', name: 'Lime' },
    p: { hex: '#F785B1', name: 'Bright Pink' },
  },
  layers,
};
require('fs').writeFileSync(__dirname + '/cat-model.json', JSON.stringify(out));
console.log('\nwrote cat-model.json,', JSON.stringify(out).length, 'bytes');

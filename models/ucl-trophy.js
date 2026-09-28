// Big Ears — the European champions' cup at roughly 1:2 scale, all pearl
// gold. A surface of revolution (plinth, stem, tapering cup, neck, flared
// rim with a hollow mouth) plus the two signature oversized loop handles,
// built as brick arches. x right, y up, z toward viewer.

const S = require('../lib/shapes');

// cup profile: piecewise-linear radius by height (mm)
const PROFILE = [
  [0, 42], [10, 42], [13, 34], [20, 36],      // stepped foot discs
  [24, 24], [42, 14], [52, 14],               // short stem
  [62, 20], [110, 40], [160, 55], [205, 64],  // broad bowl to the shoulder
  [232, 58], [252, 38], [272, 39],            // hard waist into the neck
  [282, 46], [296, 59], [312, 59],            // wide flared mouth
];
function rAt(y) {
  if (y < 0 || y > 312) return -1;
  for (let i = 1; i < PROFILE.length; i++) {
    const [y0, r0] = PROFILE[i - 1], [y1, r1] = PROFILE[i];
    if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return -1;
}
function inBody(p) {
  const r = rAt(p.y);
  if (r < 0) return false;
  const d = Math.hypot(p.x, p.z);
  if (d > r) return false;
  if (p.y >= 288 && d < r - 14) return false; // hollow mouth
  return true;
}

// handle: thin blade with the classic S-curl, two bezier segments in the
// x-y plane, mirrored to both sides. Segment 1 springs from mid-bowl, sweeps
// far out and rises well above the rim; segment 2 is the tight inward curl
// that hooks back down to land on the rim's edge.
const HSEGS = [
  [[52, 148], [128, 215], [142, 350], [86, 368]],  // main sweep
  [[86, 368], [40, 378], [38, 305], [56, 288]],    // top curl into the rim
];
const HSAMPLES = [];
for (const HP of HSEGS) {
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, u = 1 - t;
    HSAMPLES.push([
      u * u * u * HP[0][0] + 3 * u * u * t * HP[1][0] + 3 * u * t * t * HP[2][0] + t * t * t * HP[3][0],
      u * u * u * HP[0][1] + 3 * u * u * t * HP[1][1] + 3 * u * t * t * HP[2][1] + t * t * t * HP[3][1],
    ]);
  }
}
function inHandle(p) {
  if (Math.abs(p.z) > 8.5) return false; // 2 studs deep — a thin blade
  const ax = Math.abs(p.x);
  let best = 1e9;
  for (const [qx, qy] of HSAMPLES) {
    const d = S.sq(ax - qx) + S.sq(p.y - qy);
    if (d < best) best = d;
  }
  return best <= 72; // tube radius ~8.5
}

// uniform scale: profile is authored at 45%, boost to a true half of 73.5 cm
const SC = 1.115;

module.exports = {
  meta: {
    slug: 'ucl-trophy',
    title: 'Big Ears',
    subtitle: 'The big-eared European champions’ cup in flat silver, handles and all.',
    tallNote: '1:2 scale',
    favicon: '🏆',
    footer: 'The famous silhouette at half scale — about 37 cm tall — half the real trophy. The cup is a ' +
      'surface of revolution: plinth, stem, a bowl that swells to its shoulder, then a waisted ' +
      'neck and flared rim with a hollow mouth. The two oversized handles are true brick ' +
      'arches, each anchored to the shoulder and the neck. Flat silver throughout, like the silver-plated original, finished ' +
      'smooth with tile caps and 45° slopes.',
  },
  grid: { W: 40, D: 20, H: 45 },
  colors: {
    v: { hex: '#A3A9AD', name: 'Flat Silver' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    const q = { x: p.x / SC, y: p.y / SC, z: p.z / SC };
    return inBody(q) || inHandle(q);
  },

  colorAt() { return 'v'; },
};

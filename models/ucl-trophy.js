// Big Ears — the European champions' cup at roughly 1:2 scale, all pearl
// gold. A surface of revolution (plinth, stem, tapering cup, neck, flared
// rim with a hollow mouth) plus the two signature oversized loop handles,
// built as brick arches. x right, y up, z toward viewer.

const S = require('../lib/shapes');

// cup profile: piecewise-linear radius by height (mm)
const PROFILE = [
  [0, 42], [18, 42],            // plinth
  [22, 26], [40, 17], [55, 15], // step-in + stem
  [70, 20], [120, 38], [170, 52], [210, 62], // cup swells to the shoulder
  [235, 60], [255, 45], [272, 45],           // taper to the neck
  [285, 52], [300, 57], [312, 57],           // flared rim
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
  if (p.y >= 288 && d < r - 12) return false; // hollow mouth
  return true;
}

// handle: cubic bezier in the x-y plane, mirrored to both sides
const HP = [[64, 195], [138, 240], [118, 420], [46, 272]];
const HSAMPLES = [];
for (let i = 0; i <= 80; i++) {
  const t = i / 80, u = 1 - t;
  HSAMPLES.push([
    u * u * u * HP[0][0] + 3 * u * u * t * HP[1][0] + 3 * u * t * t * HP[2][0] + t * t * t * HP[3][0],
    u * u * u * HP[0][1] + 3 * u * u * t * HP[1][1] + 3 * u * t * t * HP[2][1] + t * t * t * HP[3][1],
  ]);
}
function inHandle(p) {
  if (Math.abs(p.z) > 8.5) return false; // 2 studs deep
  const ax = Math.abs(p.x);
  let best = 1e9;
  for (const [qx, qy] of HSAMPLES) {
    const d = S.sq(ax - qx) + S.sq(p.y - qy);
    if (d < best) best = d;
  }
  return best <= 110; // tube radius ~10.5
}

// uniform scale: profile is authored at 45%, boost to a true half of 73.5 cm
const SC = 1.115;

module.exports = {
  meta: {
    slug: 'ucl-trophy',
    title: 'Big Ears',
    subtitle: 'The big-eared European champions’ cup in pearl gold, handles and all.',
    tallNote: '1:2 scale',
    favicon: '🏆',
    footer: 'The famous silhouette at half scale — about 37 cm tall — half the real trophy. The cup is a ' +
      'surface of revolution: plinth, stem, a bowl that swells to its shoulder, then a waisted ' +
      'neck and flared rim with a hollow mouth. The two oversized handles are true brick ' +
      'arches, each anchored to the shoulder and the neck. Pearl gold throughout, finished ' +
      'smooth with tile caps and 45° slopes.',
  },
  grid: { W: 36, D: 20, H: 41 },
  colors: {
    g: { hex: '#D4A537', name: 'Pearl Gold' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    const q = { x: p.x / SC, y: p.y / SC, z: p.z / SC };
    return inBody(q) || inHandle(q);
  },

  colorAt() { return 'g'; },
};

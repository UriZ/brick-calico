// Big Ears — the European champions' cup at 1:2 scale, flat silver.
// Proportions measured off the reference photo: an egg-shaped bowl that is
// widest at ~62% of the height (clearly wider than the mouth), a short
// ringed stem on a round plinth, a modest flared mouth, and thin blade
// handles that hug the cup, peak at the very top, and curl back into the
// rim. x right, y up, z toward viewer. All coordinates in final mm.

const S = require('../lib/shapes');

// cup profile: piecewise-linear radius by height (mm); total ~368mm to handle tips
const PROFILE = [
  [0, 53], [26, 53], [30, 40], [34, 24],       // plinth discs
  [42, 20], [48, 27], [54, 20],                // short stem with a ring knob
  [60, 24], [90, 42], [130, 57], [170, 67],    // egg bowl swelling upward
  [205, 72], [235, 71],                        // widest at ~62% height
  [262, 60], [285, 48], [300, 49],             // long curve into the neck
  [308, 54], [318, 58], [324, 58],             // modest flared mouth (< shoulder)
];
function rAt(y) {
  if (y < 0 || y > 324) return -1;
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
  if (p.y >= 310 && d < r - 14) return false; // hollow mouth
  return true;
}

// handles: thin blades, two bezier segments in the x-y plane, mirrored.
// Segment 1 springs from the bowl flank at ~42% height, stays close to the
// body, and rises to the trophy's highest point; segment 2 is the tight
// inward curl that hooks back down onto the rim's edge.
const HSEGS = [
  [[58, 150], [120, 210], [118, 350], [72, 362]],  // main sweep, hugging the bowl
  [[72, 362], [30, 370], [30, 300], [50, 296]],    // top curl into the rim
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
  return best <= 68; // tube radius ~8.2
}

// --- Champions League mark on the bowl front: a bold five-pointed star on a
// white ball. A full ring-of-stars starball fragments into noise at nine studs
// across, so the mark is reduced to its readable core, the way brick sets do.
const LOGO = { cy: 242, R: 38 };
function starPts(cx, cy, R, rot, ratio) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? R : R * ratio;
    const a = rot + i * Math.PI / 5;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const STAR = starPts(0, LOGO.cy, LOGO.R * 0.82, Math.PI / 2, 0.42);
function starball(x, y) {
  if (Math.hypot(x, y - LOGO.cy) > LOGO.R) return null;
  return inPoly(x, y, STAR) ? 'e' : 'w';
}

module.exports = {
  meta: {
    slug: 'ucl-trophy',
    title: 'Big Ears',
    subtitle: 'The big-eared European champions’ cup in flat silver, handles and all.',
    tallNote: '1:2 scale',
    favicon: '🏆',
    footer: 'The famous silhouette at half scale — about 37 cm to the handle tips. ' +
      'Proportions follow the original: an egg-shaped bowl widest just below the ' +
      'shoulder and clearly wider than the flared mouth, a ringed stem on a round ' +
      'plinth, and the two blade handles hugging the cup before curling in at the ' +
      'top. Flat silver, with the Champions League starball on the bowl front above ' +
      'the two inscription lines and a pearl-gold bowl interior. Every exposed ' +
      'surface is capped with a smooth tile — studs appear only where the next ' +
      'layer locks on — so the shell reads as polished metal rather than studs.',
  },
  grid: { W: 32, D: 20, H: 40 },
  colors: {
    v: { hex: '#A3A9AD', name: 'Flat Silver' },
    e: { hex: '#6D7075', name: 'Dark Stone Grey' },
    g: { hex: '#D4A537', name: 'Pearl Gold' },
    w: { hex: '#F2F0EB', name: 'White' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    return inBody(p) || inHandle(p);
  },

  colorAt(p) {
    const r = rAt(p.y);
    if (r > 0) {
      const dd = Math.hypot(p.x, p.z);
      // gold interior: the mouth's inner wall ring and the cavity floor
      if (p.y >= 310 && dd < r - 6) return 'g';
      if (p.y >= 300 && p.y < 310 && dd < rAt(312) - 10) return 'g';
      // engraving on the front face of the bowl (outer shell, z toward viewer)
      if (p.z > 0 && dd > r - 9) {
        // Champions League starball
        const lg = starball(p.x, p.y);
        if (lg) return lg;
        // line 1 — word-length dashes: COUPE DES CLUBS CHAMPIONS
        if (p.y >= 186 && p.y < 195) {
          const W1 = [[-56, -38], [-30, -20], [-12, 4], [12, 44]];
          for (const [a, b] of W1) if (p.x >= a && p.x <= b) return 'e';
        }
        // line 2 — EUROPÉENS, centered
        if (p.y >= 171 && p.y < 180 && Math.abs(p.x) <= 24) return 'e';
      }
    }
    return 'v';
  },
};

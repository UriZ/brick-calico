// Brick Ace v2 — young tennis player, BrickHeadz-style: oversized head with a
// real face (fringe, brows, two-part eyes, nose, mouth, ears) on a 1:6 body.
// From a photo: dark-blond mop, black graffiti tee, sage shorts, barefoot,
// racket raised in the left hand. x right, y up, z toward viewer.

const S = require('../lib/shapes');

// ---- racket, flat in the x-y plane, head up, outboard of the big head ----
const RK = { cx: 64, cy: 290, rx: 22, ry: 30 };
function racketFrame(p) {
  if (p.z < -8.5 || p.z > 8.5) return false; // 2 studs thick
  const e = Math.sqrt(S.sq((p.x - RK.cx) / RK.rx) + S.sq((p.y - RK.cy) / RK.ry));
  return e >= 0.72 && e <= 1.28;
}
function racketShaftGrip(p) {
  if (S.capsule(p, { x: 58, y: 222, z: 0 }, { x: 64, y: 244, z: 0 }, 6.2, 5.8)) return true;
  if (S.capsule(p, { x: 64, y: 244, z: 0 }, { x: 64, y: 258, z: 0 }, 5.8, 5.8)) return true;
  return false;
}

// ---- head core: rounded box, BrickHeadz proportions ----
function inHeadCore(p) {
  return S.box(p, { x: -38, y: 196, z: -30 }, { x: 38, y: 250, z: 30 }) ||
         S.ellipsoid(p, { x: 0, y: 226, z: 0 }, { x: 42, y: 36, z: 34 });
}
// hair shell hugs the head, a touch bigger, cut to crown / back / sides / fringe
function inHairShell(p) {
  return S.ellipsoid(p, { x: 0, y: 232, z: -2 }, { x: 44, y: 40, z: 38 });
}
function hairAt(p) {
  if (!inHairShell(p)) return false;
  if (p.y >= 246) return true;                 // crown
  if (p.z <= -16 && p.y >= 214) return true;   // back of head
  if (Math.abs(p.x) >= 30 && p.y >= 226) return true; // sides
  return false;
}

// deterministic speckles for the graffiti print (thick torso only)
function speck(p) {
  const n = Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453;
  return n - Math.floor(n) < 0.16;
}

const inTorso = p => S.ellipsoid(p, { x: 0, y: 150, z: 0 }, { x: 28, y: 42, z: 17 });
const inArms = p =>
  S.capsule(p, { x: -28, y: 174, z: 0 }, { x: -34, y: 112, z: 8 }, 8, 7) ||
  S.capsule(p, { x: 26, y: 174, z: 0 }, { x: 56, y: 206, z: 0 }, 8, 7.5);

module.exports = {
  meta: {
    slug: 'tennis-kid',
    title: 'Brick Ace',
    subtitle: 'A young tennis champ with his racket up — portrait head, graffiti tee, sage shorts.',
    tallNote: '1:6 scale',
    favicon: '🎾',
    footer: 'BrickHeadz-style portrait: an oversized head carries the face — fringe, brows, ' +
      'two-part eyes, nose, and mouth — on a 1:6 body, about 32 cm to the racket tip. ' +
      'Exposed surfaces are finished smooth with tile caps and 45° slopes, like the official ' +
      'brick sculptures; studs appear only where the next layer locks on.',
  },
  grid: { W: 26, D: 12, H: 35 },
  colors: {
    n: { hex: '#F6D7B3', name: 'Light Nougat' },
    m: { hex: '#AA7D55', name: 'Medium Nougat' },
    h: { hex: '#C9A46A', name: 'Dark Tan' },
    k: { hex: '#23282E', name: 'Black' },
    w: { hex: '#F2F0EB', name: 'White' },
    s: { hex: '#A0BCAC', name: 'Sand Green' },
    t: { hex: '#0F9E97', name: 'Bright Bluish Green' },
    e: { hex: '#5A3A22', name: 'Dark Brown' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    if (inHeadCore(p) || hairAt(p)) return true;
    // ears
    if (S.ellipsoid(p, { x: 42, y: 226, z: 0 }, { x: 7, y: 10, z: 10 })) return true;
    if (S.ellipsoid(p, { x: -42, y: 226, z: 0 }, { x: 7, y: 10, z: 10 })) return true;
    if (inTorso(p)) return true;
    if (S.ellipsoid(p, { x: 0, y: 94, z: 0 }, { x: 29, y: 32, z: 16 })) return true; // shorts
    if (inArms(p)) return true;
    if (S.sphere(p, { x: -33, y: 106, z: 8 }, 7.4)) return true; // right hand
    if (S.sphere(p, { x: 56, y: 212, z: 0 }, 9)) return true;     // left hand on grip
    // legs + bare feet
    if (S.capsule(p, { x: -14, y: 8, z: 0 }, { x: -13, y: 75, z: 0 }, 9.5, 10)) return true;
    if (S.capsule(p, { x: 14, y: 8, z: 0 }, { x: 13, y: 75, z: 0 }, 9.5, 10)) return true;
    if (S.ellipsoid(p, { x: -14, y: 6, z: 8 }, { x: 9, y: 8, z: 16 })) return true;
    if (S.ellipsoid(p, { x: 14, y: 6, z: 8 }, { x: 9, y: 8, z: 16 })) return true;
    if (racketShaftGrip(p) || racketFrame(p)) return true;
    return false;
  },

  colorAt(p) {
    if (racketFrame(p)) return 't';
    if (racketShaftGrip(p)) return 'k';
    if (hairAt(p)) return 'h';
    // ---- face, on the front surface of the head (z >= 24) ----
    if (p.z >= 24 && inHeadCore(p)) {
      const ax = Math.abs(p.x);
      // brows (dark brown), one layer above the eyes, below the fringe
      if (p.y >= 240 && p.y < 250 && ax >= 8 && ax <= 24) return 'e';
      // eyes: 2x2 white with a dark iris at the inner-lower cell
      if (p.y >= 221 && p.y < 240 && ax >= 8 && ax <= 24) {
        if (p.y < 231 && ax < 16) return 'e'; // iris
        return 'w';
      }
      // nose
      if (p.y >= 212 && p.y < 221 && ax < 8) return 'm';
      // mouth
      if (p.y >= 202 && p.y < 212 && ax < 8) return 'e';
    }
    if (inTorso(p)) return (p.y < 170 && speck(p)) ? 'w' : 'k';
    if (inArms(p)) return p.y >= 164 ? 'k' : 'n';
    if (S.ellipsoid(p, { x: 0, y: 94, z: 0 }, { x: 29, y: 32, z: 16 })) return 's';
    return 'n';
  },
};

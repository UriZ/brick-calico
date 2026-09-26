// Brick Ace — a young tennis player at 1:6 scale, racket raised.
// From a photo: dark-blond mop of hair, black graffiti-print tee,
// sage-green shorts, barefoot, racket in the raised left hand.
// x right, y up, z toward viewer. Origin: ground center.

const S = require('../lib/shapes');

// ---- racket, flat in the x-y plane, head up ----
const RK = { cx: 48, cy: 272, rx: 22, ry: 29 }; // frame center + radii
function racketFrame(p) {
  if (p.z < -8.5 || p.z > 8.5) return false; // 2 studs thick
  const e = Math.sqrt(S.sq((p.x - RK.cx) / RK.rx) + S.sq((p.y - RK.cy) / RK.ry));
  return e >= 0.72 && e <= 1.28;
}
function racketShaftGrip(p) {
  // grip from the hand, shaft up to the frame bottom
  if (S.capsule(p, { x: 46, y: 196, z: 0 }, { x: 48, y: 228, z: 0 }, 7, 6)) return true;
  if (S.capsule(p, { x: 48, y: 228, z: 0 }, { x: 48, y: 248, z: 0 }, 6, 5.8)) return true;
  return false;
}

// ---- hair: a mop that covers the crown and fringe ----
function inHair(p) {
  return S.ellipsoid(p, { x: 0, y: 226, z: -2 }, { x: 22, y: 13, z: 21 }) ||
         S.ellipsoid(p, { x: 0, y: 218, z: -8 }, { x: 22, y: 20, z: 16 }); // fuller at the back
}

// cheap deterministic hash for the graffiti-print speckles
function speck(p) {
  const n = Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453;
  return n - Math.floor(n) < 0.16;
}

module.exports = {
  meta: {
    slug: 'tennis-kid',
    title: 'Brick Ace',
    subtitle: 'A young tennis champ with his racket up, in graffiti tee and sage shorts.',
    tallNote: '1:6 scale',
    favicon: '🎾',
    footer: 'Built at 1:6 scale — one stud is 8 mm, so the figure stands about 24 cm to the ' +
      'top of his hair and 31 cm to the tip of the raised racket. Studs-up sculpture from ' +
      'standard 1×1 through 2×6 bricks; the racket head is a genuine hollow ring, kept ' +
      'stud-connected by bricks that bridge each arc onto the one below.',
  },
  grid: { W: 22, D: 12, H: 33 },
  colors: {
    n: { hex: '#F6D7B3', name: 'Light Nougat' },
    h: { hex: '#C9A46A', name: 'Dark Tan' },
    k: { hex: '#23282E', name: 'Black' },
    w: { hex: '#F2F0EB', name: 'White' },
    s: { hex: '#A0BCAC', name: 'Sand Green' },
    t: { hex: '#0F9E97', name: 'Bright Bluish Green' },
    e: { hex: '#5A3A22', name: 'Dark Brown' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    // head + hair
    if (S.ellipsoid(p, { x: 0, y: 212, z: 0 }, { x: 19, y: 21, z: 19 })) return true;
    if (inHair(p)) return true;
    // neck
    if (S.capsule(p, { x: 0, y: 188, z: 0 }, { x: 0, y: 200, z: 0 }, 8, 8)) return true;
    // torso (tee)
    if (S.ellipsoid(p, { x: 0, y: 152, z: 0 }, { x: 26, y: 42, z: 17 })) return true;
    // shorts — a little wider than the torso bottom
    if (S.ellipsoid(p, { x: 0, y: 94, z: 0 }, { x: 27, y: 32, z: 16 })) return true;
    // right arm (his right, -x): hangs, drifting slightly forward
    if (S.capsule(p, { x: -26, y: 174, z: 0 }, { x: -32, y: 112, z: 8 }, 8, 7)) return true;
    if (S.sphere(p, { x: -31, y: 104, z: 10 }, 8)) return true;                                 // hand
    // left arm raised straight to the racket grip
    if (S.capsule(p, { x: 24, y: 174, z: 0 }, { x: 46, y: 196, z: 0 }, 8, 7)) return true;
    if (S.sphere(p, { x: 44, y: 198, z: 0 }, 8.5)) return true;                                 // hand on grip
    // legs
    if (S.capsule(p, { x: -13, y: 8, z: 0 }, { x: -12, y: 75, z: 0 }, 9, 10)) return true;
    if (S.capsule(p, { x: 13, y: 8, z: 0 }, { x: 12, y: 75, z: 0 }, 9, 10)) return true;
    // bare feet, toes forward
    if (S.ellipsoid(p, { x: -13, y: 6, z: 8 }, { x: 9, y: 8, z: 16 })) return true;
    if (S.ellipsoid(p, { x: 13, y: 6, z: 8 }, { x: 9, y: 8, z: 16 })) return true;
    // racket
    if (racketShaftGrip(p) || racketFrame(p)) return true;
    return false;
  },

  colorAt(p) {
    // racket first (it overlaps nothing else)
    if (racketFrame(p)) return 't';
    if (racketShaftGrip(p)) return 'k';
    // eyes on the face (before hair so the fringe can't cover them)
    if (S.sphere(p, { x: 11, y: 214, z: 14 }, 5.5)) return 'e';
    if (S.sphere(p, { x: -11, y: 214, z: 14 }, 5.5)) return 'e';
    // hair over head
    if (inHair(p)) return 'h';
    // tee: black with light graffiti speckles (thick torso only — speckles
    // on thin limbs would block same-layer brick merges)
    if (S.ellipsoid(p, { x: 0, y: 152, z: 0 }, { x: 26, y: 42, z: 17 })) return speck(p) ? 'w' : 'k';
    // arm sleeves: horizontal color seam only (limbs are one color per layer)
    const arm = S.capsule(p, { x: -26, y: 174, z: 0 }, { x: -32, y: 112, z: 8 }, 8, 7) ||
      S.capsule(p, { x: 24, y: 174, z: 0 }, { x: 46, y: 196, z: 0 }, 8, 7);
    if (arm) return p.y >= 164 ? 'k' : 'n';
    // shorts
    if (S.ellipsoid(p, { x: 0, y: 94, z: 0 }, { x: 27, y: 32, z: 16 })) return 's';
    // everything else is skin
    return 'n';
  },
};

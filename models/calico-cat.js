// Brick Calico — a life-size sitting calico house cat.
// Grid: x = width (studs, 8mm), z = depth (studs, 8mm), y = layers (bricks, 9.6mm)
// Cat faces +z. Origin: ground center.

const S = require('../lib/shapes');

const tail = S.bezierTube({
  pts: [{ x: 4, z: -90 }, { x: 70, z: -86 }, { x: 74, z: 14 }, { x: 30, z: 70 }],
  y: 9, r0: 9.5, r1: 6.5, yscale: 1.05,
});

function ear(p, sx) {
  return S.cone(p, { cx: sx * 21, cz: 22, y0: 204, y1: 246, r0: 15, r1: 2.5, zscale: 1.7 });
}

module.exports = {
  meta: {
    slug: 'calico-cat',
    title: 'Brick Calico',
    subtitle: 'A life-size calico house cat, built from standard bricks.',
    tallNote: 'life size',
    favicon: '🐱',
    footer: 'Built at 1:1 scale — one stud is 8 mm, so she stands about 25 cm tall from the ' +
      'ground to her ear tips, the size of a real sitting house cat. Studs-up sculpture using ' +
      'only standard 1×1 through 2×6 bricks; the interior is solid, so every brick locks to the ' +
      'layer beneath it. Two lime 1×1s for the eyes and one bright-pink 1×2 for the nose.',
  },
  grid: { W: 22, D: 24, H: 26 },
  colors: {
    w: { hex: '#F2F0EB', name: 'White' },
    o: { hex: '#F87D10', name: 'Bright Orange' },
    k: { hex: '#1F262D', name: 'Black' },
    g: { hex: '#A6CA37', name: 'Lime' },
    p: { hex: '#F785B1', name: 'Bright Pink' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    // haunches / rear mass
    if (S.ellipsoid(p, { x: 0, y: 58, z: -42 }, { x: 55, y: 62, z: 52 })) return true;
    // torso leaning up-forward
    if (S.capsule(p, { x: 0, y: 60, z: -36 }, { x: 0, y: 148, z: 16 }, 47, 37)) return true;
    // chest
    if (S.ellipsoid(p, { x: 0, y: 118, z: 24 }, { x: 38, y: 52, z: 30 })) return true;
    // head
    if (S.ellipsoid(p, { x: 0, y: 190, z: 30 }, { x: 34, y: 31, z: 32 })) return true;
    // muzzle
    if (S.ellipsoid(p, { x: 0, y: 180, z: 58 }, { x: 18, y: 13, z: 16 })) return true;
    // ears
    if (ear(p, 1) || ear(p, -1)) return true;
    // front legs
    if (S.capsule(p, { x: 16, y: 14, z: 54 }, { x: 17, y: 96, z: 38 }, 11.5, 12)) return true;
    if (S.capsule(p, { x: -16, y: 14, z: 54 }, { x: -17, y: 96, z: 38 }, 11.5, 12)) return true;
    // front paws
    if (S.ellipsoid(p, { x: 16, y: 9, z: 64 }, { x: 13, y: 11, z: 22 })) return true;
    if (S.ellipsoid(p, { x: -16, y: 9, z: 64 }, { x: 13, y: 11, z: 22 })) return true;
    // hind paws peeking out
    if (S.ellipsoid(p, { x: 37, y: 9, z: 14 }, { x: 11, y: 10, z: 22 })) return true;
    if (S.ellipsoid(p, { x: -37, y: 9, z: 14 }, { x: 11, y: 10, z: 22 })) return true;
    // tail
    if (tail.contains(p)) return true;
    return false;
  },

  colorAt(p) {
    // face details first
    if (S.sphere(p, { x: 13, y: 196, z: 54 }, 7)) return 'g';
    if (S.sphere(p, { x: -13, y: 196, z: 54 }, 7)) return 'g';
    if (S.sphere(p, { x: 0, y: 186, z: 70 }, 7)) return 'p';

    const tt = tail.at(p);
    if (tt >= 0) {
      if (tt > 0.78) return 'k';        // black tip
      if (tt > 0.5) return 'o';
      if (tt > 0.28) return 'k';
      return 'o';
    }
    // black patches
    if (S.sphere(p, { x: 24, y: 216, z: 18 }, 27)) return 'k';   // right ear + crown
    if (S.sphere(p, { x: 21, y: 193, z: 48 }, 15)) return 'k';   // right eye patch
    if (S.ellipsoid(p, { x: -28, y: 128, z: -14 }, { x: 30, y: 42, z: 34 })) return 'k'; // left shoulder
    if (S.sphere(p, { x: 42, y: 48, z: -62 }, 24)) return 'k';   // right rear spot
    // orange patches
    if (S.sphere(p, { x: -24, y: 214, z: 20 }, 25)) return 'o';  // left ear
    if (S.sphere(p, { x: -19, y: 191, z: 52 }, 13)) return 'o';  // left eye patch
    if (S.ellipsoid(p, { x: 34, y: 84, z: -34 }, { x: 34, y: 52, z: 46 })) return 'o'; // right haunch
    if (S.sphere(p, { x: -38, y: 60, z: -60 }, 22)) return 'o';  // left rear spot
    if (S.sphere(p, { x: 12, y: 158, z: 8 }, 20)) return 'o';    // nape spot
    return 'w';
  },
};

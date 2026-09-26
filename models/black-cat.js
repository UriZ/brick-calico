// Brick Shadow — a life-size black house cat sitting bolt upright,
// modeled on a photo: lean statue pose, oversized pointed ears,
// pale green eyes, tail curled around the left side.

const S = require('../lib/shapes');

const tail = S.bezierTube({
  pts: [{ x: -4, z: -86 }, { x: -64, z: -82 }, { x: -68, z: 12 }, { x: -26, z: 64 }],
  y: 9, r0: 9, r1: 6, yscale: 1.05,
});

function ear(p, sx) {
  // big, tall, slightly splayed ears — the photo's signature feature
  return S.cone(p, {
    cx: sx * 19 + (p.y - 214) * 0.06 * sx, // tips lean gently outward
    cz: 20, y0: 210, y1: 258, r0: 16, r1: 2.5, zscale: 1.6,
  });
}

module.exports = {
  meta: {
    slug: 'black-cat',
    title: 'Brick Shadow',
    subtitle: 'A life-size black house cat sitting at attention, green-eyed and statue-straight.',
    tallNote: 'life size',
    favicon: '🐈‍⬛',
    footer: 'Built at 1:1 scale — one stud is 8 mm, putting the ear tips about 26 cm off the ' +
      'ground: a lean cat sitting bolt upright. Studs-up sculpture from standard 1×1 through ' +
      '2×6 bricks with a solid interior, all in black except the pale-green 1×1 eyes. The tail ' +
      'wraps around the left side; the edge lines in the viewer keep the black-on-black shape readable.',
  },
  grid: { W: 20, D: 24, H: 28 },
  colors: {
    k: { hex: '#23282E', name: 'Black' },
    g: { hex: '#9ACA3C', name: 'Bright Yellowish Green' },
  },

  inShape(p) {
    if (p.y < 0) return false;
    // haunches — slimmer than a lounging cat, tucked under
    if (S.ellipsoid(p, { x: 0, y: 48, z: -38 }, { x: 47, y: 56, z: 48 })) return true;
    // torso — nearly vertical, long
    if (S.capsule(p, { x: 0, y: 55, z: -28 }, { x: 0, y: 162, z: 10 }, 40, 29)) return true;
    // chest — narrow, held high
    if (S.ellipsoid(p, { x: 0, y: 125, z: 16 }, { x: 30, y: 50, z: 24 })) return true;
    // head — held high, a touch narrower than the calico's
    if (S.ellipsoid(p, { x: 0, y: 200, z: 24 }, { x: 30, y: 29, z: 29 })) return true;
    // muzzle — short and fine
    if (S.ellipsoid(p, { x: 0, y: 189, z: 48 }, { x: 14, y: 11, z: 12 })) return true;
    // ears
    if (ear(p, 1) || ear(p, -1)) return true;
    // front legs — straight, close together (the "at attention" look)
    if (S.capsule(p, { x: 12, y: 12, z: 46 }, { x: 12, y: 104, z: 34 }, 10, 10.5)) return true;
    if (S.capsule(p, { x: -12, y: 12, z: 46 }, { x: -12, y: 104, z: 34 }, 10, 10.5)) return true;
    // front paws
    if (S.ellipsoid(p, { x: 12, y: 8, z: 56 }, { x: 11, y: 10, z: 19 })) return true;
    if (S.ellipsoid(p, { x: -12, y: 8, z: 56 }, { x: 11, y: 10, z: 19 })) return true;
    // hind paws peeking out beside the front legs
    if (S.ellipsoid(p, { x: 31, y: 8, z: 8 }, { x: 10, y: 9, z: 19 })) return true;
    if (S.ellipsoid(p, { x: -31, y: 8, z: 8 }, { x: 10, y: 9, z: 19 })) return true;
    // tail around the left side
    if (tail.contains(p)) return true;
    return false;
  },

  colorAt(p) {
    // pale green eyes — the only non-black feature
    if (S.sphere(p, { x: 11, y: 205, z: 48 }, 6.5)) return 'g';
    if (S.sphere(p, { x: -11, y: 205, z: 48 }, 6.5)) return 'g';
    return 'k';
  },
};

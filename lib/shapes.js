// Shape helpers for model specs. All coordinates in mm.
// A model spec gets this library as `S` and defines inShape(p) / colorAt(p).

const sq = v => v * v;

function ellipsoid(p, c, r) {
  return sq((p.x - c.x) / r.x) + sq((p.y - c.y) / r.y) + sq((p.z - c.z) / r.z) <= 1;
}

function sphere(p, c, r) {
  return sq(p.x - c.x) + sq(p.y - c.y) + sq(p.z - c.z) <= r * r;
}

// swept sphere along segment a->b with radius lerped r0->r1
function capsule(p, a, b, r0, r1) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = (apx * abx + apy * aby + apz * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - t * abx, dy = apy - t * aby, dz = apz - t * abz;
  const r = r0 + (r1 - r0) * t;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

// vertical elliptical cone: radius r0 at y0 shrinking to r1 at y1,
// centered at (cx, cz); xscale/zscale squash the cross-section.
function cone(p, { cx, cz, y0, y1, r0, r1, xscale = 1, zscale = 1 }) {
  if (p.y < y0 || p.y > y1) return false;
  const t = (p.y - y0) / (y1 - y0);
  const r = r0 + (r1 - r0) * t;
  const dx = (p.x - cx) * xscale, dz = (p.z - cz) * zscale;
  return dx * dx + dz * dz <= r * r;
}

// Tube swept along a cubic bezier in the xz plane at height `y`,
// tube radius lerped r0->r1 along the curve, vertical distance scaled
// by `yscale`. Returns an object; .at(p) gives the curve parameter t
// of the closest point if p is inside the tube, else -1 — useful for
// coloring sections of a tail, vine, etc.
function bezierTube({ pts, y, r0, r1, yscale = 1, samples = 60 }) {
  const P = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, u = 1 - t;
    P.push({
      t,
      x: u * u * u * pts[0].x + 3 * u * u * t * pts[1].x + 3 * u * t * t * pts[2].x + t * t * t * pts[3].x,
      z: u * u * u * pts[0].z + 3 * u * u * t * pts[1].z + 3 * u * t * t * pts[2].z + t * t * t * pts[3].z,
    });
  }
  return {
    at(p) {
      let best = -1, bestD = 1e9;
      for (const q of P) {
        const d = sq(p.x - q.x) + sq(p.z - q.z) + sq((p.y - y) * yscale);
        if (d < bestD) { bestD = d; best = q.t; }
      }
      const r = r0 + (r1 - r0) * best;
      return bestD <= r * r ? best : -1;
    },
    contains(p) { return this.at(p) >= 0; },
  };
}

function box(p, min, max) {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

module.exports = { sq, ellipsoid, sphere, capsule, cone, bezierTube, box };

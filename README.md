# Brick Models

Generate LEGO-style brick sculptures from code: each model is a small spec file that
sculpts a shape from geometric primitives; the pipeline voxelizes it, merges voxels
into standard bricks, verifies buildability, and emits a single-file interactive page —
orbitable 3D model, LEGO-manual-style step-by-step instructions (3–5 bricks per step),
and a full parts inventory.

## Models

| Model | Spec | Bricks | Description |
| --- | --- | --- | --- |
| Brick Calico | `models/calico-cat.js` | 566 | Life-size sitting calico house cat |
| Brick Shadow | `models/black-cat.js` | 350 | Life-size black cat sitting bolt upright, green eyes |

## Build

```sh
./build.sh models/black-cat.js            # → dist/black-cat.json + dist/black-cat.html
./build.sh models/black-cat.js --preview  # also print ASCII silhouettes
```

Open `dist/<slug>.html` in any browser. `build.sh` downloads `three.min.js` (r128) on first run.

## Pipeline

```
models/<spec>.js ──► generate.js ──► dist/<slug>.json ──► assemble.js ──► dist/<slug>.html
                     voxelize            bricks/layers        viewer/page.html.part
                     merge → bricks                           viewer/app.js + three.js
                     connectivity check
```

- **Scale**: 1 stud = 8 mm, 1 brick height = 9.6 mm (real LEGO dimensions).
- **Merge**: per layer, greedy largest-first from standard sizes (1×1 … 2×6), alternating
  x/z bias between layers for interlock. The merge is *support-aware*: cells with no voxel
  beneath them are first covered by bricks that also grab a supported cell, so steep walls
  and overhangs stay stud-connected instead of floating.
- **Verification**: BFS over stud connections from the ground; anything unreachable is
  dropped and reported. A finished model prints `dropped (unconnected): 0`.

## Writing a new model spec

A spec is a JS module (see `models/` for two complete examples):

```js
const S = require('../lib/shapes');
module.exports = {
  meta: { slug, title, subtitle, tallNote, favicon, footer },
  grid: { W, D, H },          // studs wide/deep, layers tall
  colors: { k: { hex, name }, ... },
  inShape(p)  { ... },        // p in mm, origin at ground center, y up — true if solid
  colorAt(p)  { ... },        // color key for a solid point
};
```

`lib/shapes.js` provides `ellipsoid`, `sphere`, `capsule` (tapered), `cone` (elliptical,
for ears), `bezierTube` (tails — its `.at(p)` returns the curve parameter, handy for
coloring sections), and `box`. Sculpt with a handful of primitives, run with `--preview`,
and iterate on the ASCII silhouettes until the shape reads well. Details like eyes are
small spheres checked first in `colorAt`.

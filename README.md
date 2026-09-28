# Brick Models

Generate LEGO-style brick sculptures from code: each model is a small spec file that
sculpts a shape from geometric primitives; the pipeline voxelizes it, merges voxels
into standard bricks, verifies buildability, and emits a single-file interactive page —
orbitable 3D model, LEGO-manual-style step-by-step instructions (3–5 bricks per step),
and a full parts inventory.

## Models

| Model | Spec | Bricks | Description |
| --- | --- | --- | --- |
| Brick Calico | `models/calico-cat.js` | ~1500 | Life-size sitting calico house cat |
| Brick Shadow | `models/black-cat.js` | ~900 | Life-size black cat sitting bolt upright, green eyes |
| Brick Ace | `models/tennis-kid.js` | ~600 | Young tennis player, BrickHeadz-style portrait head |
| Big Ears | `models/ucl-trophy.js` | ~1600 | The European champions' cup at 1:2 scale |

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

- **Scale**: 1 stud = 8 mm; the engine works at **plate resolution** (3.2 mm vertical
  steps), so curved silhouettes read smooth. Bricks (3 plates) fill phase-aligned
  interiors; plates handle the surface transitions.
- **Merge**: per plate layer, greedy largest-first from standard footprints (1×1 … 2×6),
  alternating x/z bias for interlock; 45° slopes, 2-deep curved slopes and inverted
  slopes are placed where the shape steps a full brick; every exposed stud gets a tile cap.
- **Verification & repair**: BFS over stud connections from the ground. Floating
  components trigger a repair loop that forces minimal plate bridges onto anchored
  cells and re-merges; bridges that go stale are removed and blacklisted. Remaining
  drops (rare 3.2 mm surface slivers) are reported.

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

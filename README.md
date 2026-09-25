# Brick Calico

A life-size LEGO-style calico cat — an interactive 3D model with LEGO-manual-style
building instructions, generated entirely from code.

- **560 bricks**, standard 1×1 through 2×6 sizes, 25 layers
- **132 build steps**, 3–5 bricks each, with per-step parts callouts
- True house-cat scale: 1 stud = 8 mm → ~25 cm tall, 17.6 × 19.2 cm footprint
- Calico coloring: white base, bright-orange and black patches, lime eyes, pink nose

## Files

| File | Purpose |
| --- | --- |
| `generate.js` | Model generator: voxelizes a sitting cat from geometric primitives (ellipsoids, capsules, a bezier tail), paints calico patches in 3D space, greedy-merges each layer into standard bricks, and verifies stud connectivity. Prints ASCII previews. Outputs `cat-model.json`. |
| `cat-model.json` | The generated model: brick list per layer with sizes and colors. |
| `page.html.part` | Page shell: markup + CSS (light/dark themed). |
| `app.js` | Viewer app: three.js scene building, orbit controls, step engine, isometric 2D part icons, parts inventory. |
| `brick-calico.html` | The assembled single-file page (three.js inlined). Open in any browser. |

## Rebuild

```sh
node generate.js                 # regenerate cat-model.json (prints previews + stats)
./build.sh                       # reassemble brick-calico.html
```

`build.sh` downloads `three.min.js` (r128) on first run.

## Tweaking the cat

Everything about the cat lives in `generate.js`:

- **Pose/shape** — the primitives in `inCat()` (haunches, torso, chest, head, ears, legs, paws, tail bezier `TP`).
- **Coat** — the patch spheres/ellipsoids in `catColor()`; black is checked before orange.
- **Size** — the grid constants `W, D, H` and the primitive coordinates (all in mm).

The generator drops any brick that doesn't connect to the ground through stud overlaps,
so whatever you sculpt stays buildable.

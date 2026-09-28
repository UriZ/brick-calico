/* ============ Brick model viewer (generic) ============ */
const COLORS = MODEL.colors;
const { W, D, H } = MODEL.grid;
const S = 8, SH = 9.6, GAP = 0.4, CAPH = 3.0;
const LAYERS = MODEL.layers;                 // sorted bottom-up
const ALL = [];
LAYERS.forEach(L => L.bricks.forEach(b => ALL.push({ ...b, y: L.y })));
const TILES = ALL.reduce((s, b) => s + (b.caps ? b.caps.length : 0), 0);
const EXT = Math.max(W * S, D * S, H * SH);  // model extent, drives camera + lights

/* build order: within each layer, serpentine front-to-back, ~3-5 bricks per step */
const STEPS = []; // { bricks, layer }
LAYERS.forEach((L, li) => {
  const sorted = L.bricks.map(b => ({ ...b, y: L.y }))
    .sort((a, b) => a.z - b.z || (a.z % 2 ? b.x - a.x : a.x - b.x));
  const n = sorted.length;
  const k = Math.max(1, Math.round(n / 4.2));
  let start = 0;
  for (let i = 0; i < k; i++) {
    const end = Math.round(n * (i + 1) / k);
    if (end > start) STEPS.push({ bricks: sorted.slice(start, end), layer: li });
    start = end;
  }
});
const CUM = []; // cumulative brick lists per step (shared prefixes)
{
  let acc = [];
  for (const s of STEPS) { acc = acc.concat(s.bricks); CUM.push(acc); }
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- facts + legend ---------- */
const colorCount = {};
ALL.forEach(b => {
  colorCount[b.c] = (colorCount[b.c] || 0) + 1 + (b.caps ? b.caps.length : 0);
});
document.getElementById('facts').innerHTML = [
  `<span class="fact"><b>${ALL.length + TILES}</b> pieces</span>`,
  `<span class="fact"><b>${STEPS.length}</b> steps</span>`,
  `<span class="fact"><b>${(H * 0.96).toFixed(0)}&nbsp;cm</b> tall${MODEL.meta.tallNote ? ' — ' + MODEL.meta.tallNote : ''}</span>`,
  `<span class="fact">footprint <b>${(W * 0.8).toFixed(1)} × ${(D * 0.8).toFixed(1)}&nbsp;cm</b></span>`,
].join('');
document.getElementById('legend').innerHTML =
  Object.entries(COLORS).map(([k, c]) =>
    `<span><span class="dot" style="background:${c.hex}"></span>${c.name} · ${colorCount[k] || 0}</span>`
  ).join('');

/* ---------- geometry ---------- */
function mergeGeoms(geoms) {
  let n = 0;
  geoms.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return bg;
}
const wx = b => (b.x + b.w / 2 - W / 2) * S;
const wz = b => (b.z + b.d / 2 - D / 2) * S;

// wedge sloping down toward +z, centered at origin, sitting on y=0
function wedgeGeo(wm, dm, h) {
  const hw = wm / 2, hd = dm / 2;
  const v = (a, b, c) => [a, b, c];
  const b0 = v(-hw, 0, -hd), b1 = v(hw, 0, -hd), b2 = v(hw, 0, hd), b3 = v(-hw, 0, hd);
  const t0 = v(-hw, h, -hd), t1 = v(hw, h, -hd);
  const tris = [
    b0, b2, b1, b0, b3, b2,        // bottom
    b0, b1, t1, b0, t1, t0,        // back (z-)
    t0, t1, b2, t0, b2, b3,        // slope
    b0, t0, b3,                    // left side
    b1, b2, t1,                    // right side
  ];
  const pos = new Float32Array(tris.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// inverted wedge: full top, underside slopes up toward +z
function invWedgeGeo(wm, dm, h) {
  const hw = wm / 2, hd = dm / 2;
  const v = (a, b, c) => [a, b, c];
  const b0 = v(-hw, 0, -hd), b1 = v(hw, 0, -hd);
  const t0 = v(-hw, h, -hd), t1 = v(hw, h, -hd), t2 = v(hw, h, hd), t3 = v(-hw, h, hd);
  const tris = [
    t0, t1, t2, t0, t2, t3,        // top
    b0, t1, b1, b0, t0, t1,        // back (z-)
    b0, b1, t2, b0, t2, t3,        // sloped underside
    b0, t3, t0,                    // left side
    b1, t1, t2,                    // right side
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  g.computeVertexNormals();
  return g;
}
// curved slope: S-curve profile from full height at -z to 0 at +z
function curvedGeo(wm, dm, h) {
  const hw = wm / 2, hd = dm / 2, N = 6;
  const prof = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push([-hd + dm * t, h * (1 - t * t * (3 - 2 * t))]);
  }
  const tris = [];
  const quad = (a, b, c, d) => tris.push(a, b, c, a, c, d);
  for (let i = 0; i < N; i++) {
    const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
    quad([-hw, y0, z0], [hw, y0, z0], [hw, y1, z1], [-hw, y1, z1]); // curved top
  }
  quad([-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]);     // bottom
  quad([-hw, 0, -hd], [hw, 0, -hd], [hw, h, -hd], [-hw, h, -hd]);   // back
  for (const sx of [-1, 1]) {                                        // side fans
    for (let i = 0; i < N; i++) {
      const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
      const a = [sx * hw, 0, -hd], b = [sx * hw, y0, z0], c = [sx * hw, y1, z1];
      if (sx < 0) tris.push(a, b, c); else tris.push(a, c, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  g.computeVertexNormals();
  return g;
}
const DIR_ROT = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

const brickGeoCache = new Map();
function brickGeo(b) {
  const key = [b.x, b.y, b.z, b.w, b.d, b.k || 'b', b.dir || '', JSON.stringify(b.caps || 0)].join(',');
  if (brickGeoCache.has(key)) return brickGeoCache.get(key);
  const geoms = [];
  if (b.k) {
    // sloped part: depth follows the facing direction, run is perpendicular
    const alongX = b.dir === 'S' || b.dir === 'N'; // width axis when facing z
    const wm = (alongX ? b.w : b.d) * S - GAP;     // run length
    const dm = (b.k === 'c' ? 2 : 1) * S - GAP;    // depth
    const g = (b.k === 'c' ? curvedGeo : b.k === 'i' ? invWedgeGeo : wedgeGeo)(wm, dm, SH - GAP);
    g.rotateY(DIR_ROT[b.dir]);
    g.translate(wx(b), b.y * SH, wz(b));
    geoms.push(g);
  } else {
    const box = new THREE.BoxGeometry(b.w * S - GAP, SH - GAP, b.d * S - GAP).toNonIndexed();
    box.translate(wx(b), b.y * SH + (SH - GAP) / 2, wz(b));
    geoms.push(box);
    // tile caps on exposed cells; studs only where another brick will sit
    const capped = new Set();
    (b.caps || []).forEach(([cx, cz, cw, cd]) => {
      for (let i = 0; i < cw; i++) for (let j = 0; j < cd; j++) capped.add((cx + i) + ',' + (cz + j));
      const cap = new THREE.BoxGeometry(cw * S - GAP, CAPH, cd * S - GAP).toNonIndexed();
      cap.translate((cx + cw / 2 - W / 2) * S, b.y * SH + SH - GAP + CAPH / 2, (cz + cd / 2 - D / 2) * S);
      geoms.push(cap);
    });
    for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) {
      if (capped.has((b.x + i) + ',' + (b.z + j))) continue;
      const st = new THREE.CylinderGeometry(2.4, 2.4, 1.8, 12).toNonIndexed();
      st.translate((b.x + i + 0.5 - W / 2) * S, b.y * SH + SH - GAP + 0.9, (b.z + j + 0.5 - D / 2) * S);
      geoms.push(st);
    }
  }
  const g = mergeGeoms(geoms);
  brickGeoCache.set(key, g);
  return g;
}
function brickEdgePts(b, out) {
  const hh = (SH - GAP) / 2;
  const cx = wx(b), cy = b.y * SH + hh, cz = wz(b);
  if (b.k) {
    // sloped-part edges in local frame (down toward +z), then rotate
    const alongX = b.dir === 'S' || b.dir === 'N';
    const hw = ((alongX ? b.w : b.d) * S - GAP) / 2, h = SH - GAP;
    const hd = ((b.k === 'c' ? 2 : 1) * S - GAP) / 2;
    const pts = [
      [-hw, 0, -hd, hw, 0, -hd], [hw, 0, -hd, hw, 0, hd],
      [hw, 0, hd, -hw, 0, hd], [-hw, 0, hd, -hw, 0, -hd],
      [-hw, h, -hd, hw, h, -hd],
      [-hw, 0, -hd, -hw, h, -hd], [hw, 0, -hd, hw, h, -hd],
    ];
    if (b.k === 'i') {
      pts.push([-hw, h, -hd, -hw, h, hd], [hw, h, -hd, hw, h, hd],
        [-hw, h, hd, hw, h, hd],
        [-hw, h, hd, -hw, 0, hd], [hw, h, hd, hw, 0, hd]);
    } else {
      pts.push([-hw, h, -hd, -hw, 0, hd], [hw, h, -hd, hw, 0, hd]);
    }
    const rot = DIR_ROT[b.dir], cos = Math.cos(rot), sin = Math.sin(rot);
    for (const [x1, y1, z1, x2, y2, z2] of pts) {
      out.push(
        cx + x1 * cos + z1 * sin, b.y * SH + y1, cz - x1 * sin + z1 * cos,
        cx + x2 * cos + z2 * sin, b.y * SH + y2, cz - x2 * sin + z2 * cos);
    }
    return;
  }
  const hw = (b.w * S - GAP) / 2, hd = (b.d * S - GAP) / 2;
  const c = [-1, 1];
  for (const sy of c) for (const sz of c) out.push(cx - hw, cy + sy * hh, cz + sz * hd, cx + hw, cy + sy * hh, cz + sz * hd);
  for (const sx of c) for (const sz of c) out.push(cx + sx * hw, cy - hh, cz + sz * hd, cx + sx * hw, cy + hh, cz + sz * hd);
  for (const sx of c) for (const sy of c) out.push(cx + sx * hw, cy + sy * hh, cz - hd, cx + sx * hw, cy + sy * hh, cz + hd);
}

const materials = {};
const isDarkColor = {};
for (const [k, c] of Object.entries(COLORS)) {
  materials[k] = new THREE.MeshPhongMaterial({
    color: new THREE.Color(c.hex).convertSRGBToLinear(),
    shininess: 48, specular: new THREE.Color(0x3a3a3a),
  });
  const n = parseInt(c.hex.slice(1), 16);
  const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  isDarkColor[k] = lum < 80; // dark bricks get light edge lines so shape stays readable
}

function linesFrom(pts, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function buildGroup(bricks, highlightSet) {
  const group = new THREE.Group();
  const byColor = {};
  const edgeDark = [], edgeLight = [], hiPts = [];
  for (const b of bricks) {
    (byColor[b.c] = byColor[b.c] || []).push(brickGeo(b).clone());
    if (highlightSet && highlightSet.has(b)) brickEdgePts(b, hiPts);
    else brickEdgePts(b, isDarkColor[b.c] ? edgeLight : edgeDark);
  }
  for (const [k, geoms] of Object.entries(byColor)) {
    const mesh = new THREE.Mesh(mergeGeoms(geoms), materials[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (edgeDark.length) group.add(linesFrom(edgeDark, 0x0c1118, 0.28));
  if (edgeLight.length) group.add(linesFrom(edgeLight, 0x9aa6b5, 0.30));
  if (hiPts.length) {
    const ls = linesFrom(hiPts, 0xffb400, 0.95);
    ls.renderOrder = 2;
    group.add(ls);
  }
  return group;
}

/* ---------- view factory ---------- */
function makeView(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 10, EXT * 16);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(EXT * 0.5, EXT * 1.05, EXT * 0.65);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -EXT; sc.right = EXT; sc.top = EXT * 1.1; sc.bottom = -EXT * 0.3;
  sc.near = 10; sc.far = EXT * 3.6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.22);
  fill.position.set(-EXT * 0.65, EXT * 0.5, -EXT * 0.5);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(EXT * 6, EXT * 6),
    new THREE.ShadowMaterial({ opacity: 0.17 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let content = null;
  const target = new THREE.Vector3(0, H * SH * 0.45, 0);
  const st = { theta: opts.theta, phi: opts.phi, dist: EXT * opts.dist, auto: opts.auto && !reduceMotion };

  function applyCam() {
    camera.position.set(
      target.x + st.dist * Math.sin(st.phi) * Math.sin(st.theta),
      target.y + st.dist * Math.cos(st.phi),
      target.z + st.dist * Math.sin(st.phi) * Math.cos(st.theta)
    );
    camera.lookAt(target);
  }
  function render() { applyCam(); renderer.render(scene, camera); }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  /* pointer orbit + pinch zoom */
  const zoomLo = EXT * 1.0, zoomHi = EXT * 4.6;
  const pointers = new Map();
  let pinchD = 0;
  canvas.addEventListener('pointerdown', e => {
    st.auto = false;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchD = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) {
      st.theta -= (e.clientX - prev[0]) * 0.006;
      st.phi = Math.min(1.52, Math.max(0.18, st.phi - (e.clientY - prev[1]) * 0.005));
      render();
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      if (pinchD) {
        st.dist = Math.min(zoomHi, Math.max(zoomLo, st.dist * pinchD / d));
        render();
      }
      pinchD = d;
    }
  });
  const lift = e => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    st.auto = false;
    st.dist = Math.min(zoomHi, Math.max(zoomLo, st.dist * (1 + e.deltaY * 0.0012)));
    render();
  }, { passive: false });

  new ResizeObserver(resize).observe(canvas);

  return {
    render, resize, st,
    setContent(group) {
      if (content) {
        scene.remove(content);
        content.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      }
      content = group;
      scene.add(group);
      render();
    },
    tick() {
      if (st.auto) { st.theta += 0.004; render(); }
    },
  };
}

/* ---------- model view ---------- */
const modelView = makeView(document.getElementById('cv-model'),
  { theta: 0.55, phi: 1.12, dist: 2.5, auto: true });
modelView.setContent(buildGroup(ALL));
(function loop() { modelView.tick(); requestAnimationFrame(loop); })();

/* ---------- 2D part icons ---------- */
function shade(hex, f) { // f: -1..1
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, a = Math.abs(f);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}
// kind: 'b' brick, 's' slope, 't' tile
function partIcon(w, d, hex, px, kind) {
  const cnv = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio, 2);
  const Wm = w * 8, Dm = d * 8;
  const Hm = kind === 't' ? 3.2 : 9.6, STH = kind === 'b' ? 1.8 : 0;
  const spanX = (Wm + Dm) * 0.866, spanY = (Wm + Dm) * 0.5 + Hm + STH + 1;
  const k = px / Math.max(spanX, spanY * 1.35);
  const cw = Math.ceil(spanX * k) + 8, ch = Math.ceil(spanY * k) + 8;
  cnv.width = cw * dpr; cnv.height = ch * dpr;
  cnv.style.width = cw + 'px'; cnv.style.height = ch + 'px';
  const ctx = cnv.getContext('2d');
  ctx.scale(dpr, dpr);
  const ox = Dm * 0.866 * k + 4, oy = (Hm + STH) * k + 4;
  const P = (x, y, z) => [ox + (x - z) * 0.866 * k, oy + (x + z) * 0.5 * k - y * k];
  const face = (pts, fill) => {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  };
  const dark = parseInt(hex.slice(1), 16) < 0x404040 * 1.2;
  ctx.strokeStyle = dark ? 'rgba(150,160,175,.9)' : shade(hex, -0.55);
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  if (kind === 's' || kind === 'c') {
    // wedge: full-height back (x=0 side), sloping to nothing at x=W
    face([P(0, Hm, 0), P(Wm, 0, 0), P(Wm, 0, Dm), P(0, Hm, Dm)], shade(hex, 0.14)); // slope face
    face([P(0, 0, Dm), P(Wm, 0, Dm), P(0, Hm, Dm)], hex);                            // front triangle
    return cnv;
  }
  if (kind === 'i') {
    // inverted: full top, notched underside
    face([P(0, Hm, 0), P(Wm, Hm, 0), P(Wm, Hm, Dm), P(0, Hm, Dm)], shade(hex, 0.22));
    face([P(0, 0, Dm), P(Wm, Hm, Dm), P(0, Hm, Dm)], hex);
    return cnv;
  }
  face([P(0, Hm, 0), P(Wm, Hm, 0), P(Wm, Hm, Dm), P(0, Hm, Dm)], shade(hex, 0.22));   // top
  face([P(0, 0, Dm), P(Wm, 0, Dm), P(Wm, Hm, Dm), P(0, Hm, Dm)], hex);                 // front
  face([P(Wm, 0, 0), P(Wm, 0, Dm), P(Wm, Hm, Dm), P(Wm, Hm, 0)], shade(hex, -0.18));   // right
  if (kind === 'b') {
    const studs = [];
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) studs.push([(i + 0.5) * 8, (j + 0.5) * 8]);
    studs.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    for (const [sx, sz] of studs) {
      const [bx, by] = P(sx, Hm, sz), [tx, ty] = P(sx, Hm + STH, sz);
      const rx = 2.55 * k * 0.9, ry = rx * 0.58;
      ctx.fillStyle = hex;
      ctx.beginPath(); ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillRect(tx - rx, ty, rx * 2, by - ty);
      ctx.strokeRect(tx - rx, ty, rx * 2, by - ty);
      ctx.fillStyle = shade(hex, 0.22);
      ctx.beginPath(); ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  return cnv;
}
const KIND_LABEL = { b: 'Brick', s: 'Slope', c: 'Curved slope', i: 'Inv. slope', t: 'Tile' };

/* ---------- instructions ---------- */
const buildView = makeView(document.getElementById('cv-build'),
  { theta: 0.62, phi: 1.02, dist: 2.6, auto: false });
let step = 1;
const scrub = document.getElementById('scrub');
scrub.max = STEPS.length;
scrub.addEventListener('input', e => setStep(+e.target.value));

function stepParts(bricks) {
  // aggregate bricks, slopes, and their tile caps for the callout
  const agg = new Map();
  const add = (kind, w, d, c) => {
    const a = Math.min(w, d), z = Math.max(w, d);
    const key = kind + '|' + a + 'x' + z + '|' + c;
    agg.set(key, (agg.get(key) || 0) + 1);
  };
  for (const b of bricks) {
    add(b.k || 'b', b.w, b.d, b.c);
    (b.caps || []).forEach(([, , w, d]) => add('t', w, d, b.c));
  }
  return agg;
}

function setStep(n) {
  step = Math.min(STEPS.length, Math.max(1, n));
  const shown = CUM[step - 1];
  const newSet = new Set(STEPS[step - 1].bricks);
  buildView.setContent(buildGroup(shown, newSet));
  document.getElementById('stepnum').textContent = step;
  document.getElementById('stepof').textContent = 'of ' + STEPS.length;
  document.getElementById('layerline').textContent =
    'Layer ' + (STEPS[step - 1].layer + 1) + ' of ' + LAYERS.length;
  document.getElementById('btn-prev').disabled = step === 1;
  document.getElementById('btn-next').disabled = step === STEPS.length;
  scrub.value = step;
  const holder = document.getElementById('stepparts');
  holder.innerHTML = '';
  [...stepParts(STEPS[step - 1].bricks).entries()]
    .sort((p, q) => q[1] - p[1])
    .forEach(([key, ct]) => {
      const [kind, sz, c] = key.split('|');
      const [a, z] = sz.split('x').map(Number);
      const div = document.createElement('div');
      div.className = 'pm';
      div.appendChild(partIcon(z, a, COLORS[c].hex, 46, kind));
      const t = document.createElement('div');
      t.innerHTML = `<div class="ct">${ct}×</div><div class="sz">${kind === 'b' ? '' : KIND_LABEL[kind] + ' '}${a}×${z}</div>`;
      div.appendChild(t);
      holder.appendChild(div);
    });
}
document.getElementById('btn-prev').addEventListener('click', () => setStep(step - 1));
document.getElementById('btn-next').addEventListener('click', () => setStep(step + 1));
document.addEventListener('keydown', e => {
  if (document.getElementById('view-build').hidden) return;
  if (e.key === 'ArrowRight') setStep(step + 1);
  if (e.key === 'ArrowLeft') setStep(step - 1);
});
setStep(1);

/* ---------- parts inventory ---------- */
(function inventory() {
  const groups = {};
  Object.keys(COLORS).forEach(k => groups[k] = new Map());
  const add = (c, kind, w, d) => {
    const a = Math.min(w, d), z = Math.max(w, d);
    const key = kind + '|' + a + 'x' + z;
    groups[c].set(key, (groups[c].get(key) || 0) + 1);
  };
  for (const b of ALL) {
    add(b.c, b.k || 'b', b.w, b.d);
    (b.caps || []).forEach(([, , w, d]) => add(b.c, 't', w, d));
  }
  const kindOrder = { b: 0, s: 1, c: 2, i: 3, t: 4 };
  const holder = document.getElementById('inventory');
  for (const [c, map] of Object.entries(groups)) {
    if (!map.size) continue;
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    const g = document.createElement('div');
    g.className = 'pgroup';
    g.innerHTML = `<h2><span class="dot" style="background:${COLORS[c].hex}"></span>${COLORS[c].name}</h2>
      <p class="gsub">${total} pieces</p>`;
    const grid = document.createElement('div');
    grid.className = 'pgrid';
    [...map.entries()]
      .sort((p, q) => {
        const [k1, s1] = p[0].split('|'), [k2, s2] = q[0].split('|');
        if (k1 !== k2) return kindOrder[k1] - kindOrder[k2];
        const [a1, z1] = s1.split('x').map(Number), [a2, z2] = s2.split('x').map(Number);
        return (a2 * z2) - (a1 * z1) || z2 - z1;
      })
      .forEach(([key, ct]) => {
        const [kind, sz] = key.split('|');
        const [a, z] = sz.split('x').map(Number);
        const card = document.createElement('div');
        card.className = 'pcard';
        card.appendChild(partIcon(z, a, COLORS[c].hex, 76, kind));
        card.insertAdjacentHTML('beforeend',
          `<div class="ct">×${ct}</div><div class="nm">${KIND_LABEL[kind]} ${a}×${z}</div>`);
        grid.appendChild(card);
      });
    g.appendChild(grid);
    holder.appendChild(g);
  }
})();

/* ---------- tabs ---------- */
const tabs = [
  ['tab-model', 'view-model', modelView],
  ['tab-build', 'view-build', buildView],
  ['tab-parts', 'view-parts', null],
];
for (const [tid, vid, view] of tabs) {
  document.getElementById(tid).addEventListener('click', () => {
    for (const [t2, v2, view2] of tabs) {
      const on = t2 === tid;
      document.getElementById(t2).setAttribute('aria-selected', on);
      document.getElementById(v2).hidden = !on;
      if (on && view2) requestAnimationFrame(() => view2.resize());
    }
  });
}

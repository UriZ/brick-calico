/* ============ Brick model viewer (generic) ============ */
const COLORS = MODEL.colors;
const { W, D, H } = MODEL.grid;
const S = 8, SH = 9.6, GAP = 0.4;
const LAYERS = MODEL.layers;                 // sorted bottom-up
const ALL = [];
LAYERS.forEach(L => L.bricks.forEach(b => ALL.push({ ...b, y: L.y })));
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
ALL.forEach(b => colorCount[b.c] = (colorCount[b.c] || 0) + 1);
document.getElementById('facts').innerHTML = [
  `<span class="fact"><b>${ALL.length}</b> pieces</span>`,
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

const brickGeoCache = new Map();
function brickGeo(b) {
  const key = b.x + ',' + b.y + ',' + b.z + ',' + b.w + ',' + b.d;
  if (brickGeoCache.has(key)) return brickGeoCache.get(key);
  const geoms = [];
  const box = new THREE.BoxGeometry(b.w * S - GAP, SH - GAP, b.d * S - GAP).toNonIndexed();
  box.translate(wx(b), b.y * SH + (SH - GAP) / 2, wz(b));
  geoms.push(box);
  for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) {
    const st = new THREE.CylinderGeometry(2.4, 2.4, 1.8, 12).toNonIndexed();
    st.translate((b.x + i + 0.5 - W / 2) * S, b.y * SH + SH - GAP + 0.9, (b.z + j + 0.5 - D / 2) * S);
    geoms.push(st);
  }
  const g = mergeGeoms(geoms);
  brickGeoCache.set(key, g);
  return g;
}
function brickEdgePts(b, out) {
  const hw = (b.w * S - GAP) / 2, hh = (SH - GAP) / 2, hd = (b.d * S - GAP) / 2;
  const cx = wx(b), cy = b.y * SH + hh, cz = wz(b);
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

/* ---------- 2D brick icon ---------- */
function shade(hex, f) { // f: -1..1
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, a = Math.abs(f);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}
function brickIcon(w, d, hex, px) {
  const cnv = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio, 2);
  const Wm = w * 8, Dm = d * 8, Hm = 9.6, STH = 1.8;
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
  face([P(0, Hm, 0), P(Wm, Hm, 0), P(Wm, Hm, Dm), P(0, Hm, Dm)], shade(hex, 0.22));   // top
  face([P(0, 0, Dm), P(Wm, 0, Dm), P(Wm, Hm, Dm), P(0, Hm, Dm)], hex);                 // front
  face([P(Wm, 0, 0), P(Wm, 0, Dm), P(Wm, Hm, Dm), P(Wm, Hm, 0)], shade(hex, -0.18));   // right
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
  return cnv;
}

/* ---------- instructions ---------- */
const buildView = makeView(document.getElementById('cv-build'),
  { theta: 0.62, phi: 1.02, dist: 2.6, auto: false });
let step = 1;
const scrub = document.getElementById('scrub');
scrub.max = STEPS.length;
scrub.addEventListener('input', e => setStep(+e.target.value));

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
  // parts callout
  const agg = new Map();
  for (const b of STEPS[step - 1].bricks) {
    const a = Math.min(b.w, b.d), z = Math.max(b.w, b.d);
    const key = a + 'x' + z + '|' + b.c;
    agg.set(key, (agg.get(key) || 0) + 1);
  }
  const holder = document.getElementById('stepparts');
  holder.innerHTML = '';
  [...agg.entries()]
    .sort((p, q) => q[1] - p[1])
    .forEach(([key, ct]) => {
      const [sz, c] = key.split('|');
      const [a, z] = sz.split('x').map(Number);
      const div = document.createElement('div');
      div.className = 'pm';
      div.appendChild(brickIcon(z, a, COLORS[c].hex, 46));
      const t = document.createElement('div');
      t.innerHTML = `<div class="ct">${ct}×</div><div class="sz">${a}×${z}</div>`;
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
  for (const b of ALL) {
    const a = Math.min(b.w, b.d), z = Math.max(b.w, b.d);
    const key = a + 'x' + z;
    groups[b.c].set(key, (groups[b.c].get(key) || 0) + 1);
  }
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
        const [a1, z1] = p[0].split('x').map(Number), [a2, z2] = q[0].split('x').map(Number);
        return (a2 * z2) - (a1 * z1) || z2 - z1;
      })
      .forEach(([sz, ct]) => {
        const [a, z] = sz.split('x').map(Number);
        const card = document.createElement('div');
        card.className = 'pcard';
        card.appendChild(brickIcon(z, a, COLORS[c].hex, 76));
        card.insertAdjacentHTML('beforeend',
          `<div class="ct">×${ct}</div><div class="nm">Brick ${a}×${z}</div>`);
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

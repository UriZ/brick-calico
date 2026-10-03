#!/usr/bin/env node
// Turn a generated model into an orderable parts manifest.
//
//   node manifest.js dist/ucl-trophy.json
//
// Emits, next to the model JSON:
//   <slug>-wanted.xml  BrickLink Wanted List — upload at
//                      bricklink.com → Want → Upload (XML)
//   <slug>-parts.csv   the same list as a spreadsheet
//
// Every part number and colour id below was checked against the BrickLink
// catalogue. The script throws on anything it cannot map rather than
// guessing, so a manifest that builds is a manifest you can order.

const fs = require('fs');
const path = require('path');

/* ---------- BrickLink catalogue ---------- */
const BRICK = { '1x1': '3005', '1x2': '3004', '1x3': '3622', '1x4': '3010', '1x6': '3009',
                '2x2': '3003', '2x3': '3002', '2x4': '3001', '2x6': '2456' };
const PLATE = { '1x1': '3024', '1x2': '3023', '1x3': '3623', '1x4': '3710', '1x6': '3666',
                '2x2': '3022', '2x3': '3021', '2x4': '3020', '2x6': '3795' };
// tiles are ordered as 1xN only: a 2xN cap is two 1xN tiles, identical coverage,
// and it keeps the list on the five tile numbers worth trusting
const TILE  = { 1: '3070b', 2: '3069b', 3: '63864', 4: '2431', 6: '6636' };
// A brick-height wedge one stud deep is not a stock part. These are the nearest
// standard substitutes; both 45° slopes run over two studs where the model's
// wedge runs over one, so those cells sit slightly shallower than rendered.
const SLOPE = {
  s: { id: '3040',  name: 'Slope 45 2 x 1' },
  i: { id: '3665',  name: 'Slope Inverted 45 2 x 1' },
  c: { id: '11477', name: 'Slope Curved 2 x 1 x 2/3' },
};
const COLOR = {
  'Flat Silver': 95, 'Pearl Gold': 115, 'Dark Stone Grey': 85, 'White': 1,
  'Black': 11, 'Bright Orange': 4, 'Lime': 34, 'Bright Pink': 104,
  'Light Nougat': 90, 'Medium Nougat': 150, 'Dark Tan': 69, 'Sand Green': 48,
  'Bright Bluish Green': 39, 'Dark Brown': 120, 'Bright Yellowish Green': 34,
};
// BrickLink's own name where ours differs, so the CSV matches what you'll see
const BL_NAME = {
  'Dark Stone Grey': 'Dark Bluish Gray', 'Bright Orange': 'Orange',
  'Bright Bluish Green': 'Dark Turquoise', 'Bright Yellowish Green': 'Lime',
};

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node manifest.js <dist/model.json>');
  process.exit(1);
}
const model = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const lines = new Map(); // "id|colorId" -> { id, colorId, qty, desc, colorName, note }
function add(id, desc, colorKey, qty, note) {
  const colorName = model.colors[colorKey].name;
  const colorId = COLOR[colorName];
  if (colorId === undefined) throw new Error('no BrickLink colour for "' + colorName + '"');
  if (!id) throw new Error('no BrickLink part for ' + desc);
  const key = id + '|' + colorId;
  const row = lines.get(key) ||
    { id, colorId, qty: 0, desc, colorName: BL_NAME[colorName] || colorName, note: note || '' };
  row.qty += qty;
  lines.set(key, row);
}

for (const layer of model.layers) {
  for (const b of layer.bricks) {
    const a = Math.min(b.w, b.d), z = Math.max(b.w, b.d), size = a + 'x' + z;
    if (b.k) {
      const sl = SLOPE[b.k];
      if (!sl) throw new Error('unknown sloped part kind "' + b.k + '"');
      // depth is 2 for curved parts, 1 otherwise; the run is the other axis
      const run = b.k === 'c' ? a : z;
      add(sl.id, sl.name, b.c, run, 'substitute — see notes');
    } else if (b.h === 1) {
      add(PLATE[size], 'Plate ' + size, b.c, 1);
    } else {
      add(BRICK[size], 'Brick ' + size, b.c, 1);
    }
    for (const [, , cw, cd] of b.caps || []) {
      const ca = Math.min(cw, cd), cz = Math.max(cw, cd);
      add(TILE[cz], 'Tile 1x' + cz, b.c, ca, ca > 1 ? 'two 1x' + cz + ' per 2x' + cz + ' cap' : '');
    }
  }
}

const rows = [...lines.values()].sort((p, q) =>
  p.colorName.localeCompare(q.colorName) || q.qty - p.qty || p.desc.localeCompare(q.desc));
const total = rows.reduce((s, r) => s + r.qty, 0);
const slug = model.meta.slug;
const dir = path.dirname(jsonPath);

/* ---------- BrickLink Wanted List XML ---------- */
const xml = ['<INVENTORY>'];
for (const r of rows) {
  xml.push('  <ITEM>', '    <ITEMTYPE>P</ITEMTYPE>',
    '    <ITEMID>' + r.id + '</ITEMID>',
    '    <COLOR>' + r.colorId + '</COLOR>',
    '    <MINQTY>' + r.qty + '</MINQTY>',
    '    <CONDITION>N</CONDITION>', '  </ITEM>');
}
xml.push('</INVENTORY>', '');
fs.writeFileSync(path.join(dir, slug + '-wanted.xml'), xml.join('\n'));

/* ---------- CSV ---------- */
const csv = ['Part,BrickLink ID,Color,BrickLink Color ID,Qty,Notes'];
for (const r of rows) {
  csv.push([r.desc, r.id, r.colorName, r.colorId, r.qty, r.note]
    .map(v => /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(','));
}
csv.push(['TOTAL', '', '', '', total, ''].join(','));
fs.writeFileSync(path.join(dir, slug + '-parts.csv'), csv.join('\n') + '\n');

/* ---------- report ---------- */
console.log('\n--- ' + model.meta.title + ' — parts manifest ---');
console.log(rows.map(r =>
  String(r.qty).padStart(5) + '  ' + r.desc.padEnd(26) + r.colorName.padEnd(20) +
  '#' + r.id + (r.note ? '  (' + r.note + ')' : '')).join('\n'));
console.log('\n' + total + ' pieces across ' + rows.length + ' distinct lots');
console.log('wrote ' + path.join(dir, slug + '-wanted.xml'));
console.log('wrote ' + path.join(dir, slug + '-parts.csv'));

#!/usr/bin/env node
// Assemble a single-file viewer page from a generated model JSON.
//   node assemble.js dist/calico-cat.json
// Needs three.min.js next to this script (build.sh downloads it).

const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node assemble.js <dist/model.json>');
  process.exit(1);
}
const modelJson = fs.readFileSync(jsonPath, 'utf8');
const model = JSON.parse(modelJson);
const pieces = model.layers.reduce((s, L) => s + L.bricks.length, 0);

const threePath = path.join(__dirname, 'three.min.js');
if (!fs.existsSync(threePath)) {
  console.error('three.min.js missing — run build.sh (it downloads it) or fetch r128 manually.');
  process.exit(1);
}

let shell = fs.readFileSync(path.join(__dirname, 'viewer', 'page.html.part'), 'utf8');
shell = shell
  .replaceAll('{{TITLE}}', model.meta.title)
  .replaceAll('{{SUBTITLE}}', model.meta.subtitle)
  .replaceAll('{{SETNO}}', String(pieces))
  .replaceAll('{{FOOTER}}', model.meta.footer);

const page = shell +
  '<script>\n' + fs.readFileSync(threePath, 'utf8') + '\n</script>\n' +
  '<script>\nconst MODEL=' + modelJson + ';\n' +
  fs.readFileSync(path.join(__dirname, 'viewer', 'app.js'), 'utf8') + '</script>\n';

const outPath = path.join(path.dirname(jsonPath), model.meta.slug + '.html');
fs.writeFileSync(outPath, page);
console.log('wrote ' + outPath + ' (' + page.length + ' bytes, ' + pieces + ' bricks)');

#!/bin/sh
# Assemble brick-calico.html from page shell + three.js + model data + app code
set -e
cd "$(dirname "$0")"

if [ ! -f three.min.js ]; then
  echo "downloading three.js r128..."
  curl -sL -o three.min.js https://unpkg.com/three@0.128.0/build/three.min.js
fi

{
  cat page.html.part
  echo '<script>'
  cat three.min.js
  echo
  echo '</script>'
  echo '<script>'
  printf 'const MODEL='
  cat cat-model.json
  echo ';'
  cat app.js
  echo '</script>'
} > brick-calico.html

echo "wrote brick-calico.html ($(wc -c < brick-calico.html | tr -d ' ') bytes)"

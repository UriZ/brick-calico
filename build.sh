#!/bin/sh
# Generate + assemble a brick model page from a spec.
#   ./build.sh models/calico-cat.js [--preview]
set -e
cd "$(dirname "$0")"

if [ -z "$1" ]; then
  echo "usage: ./build.sh models/<spec>.js [--preview]"
  exit 1
fi

if [ ! -f three.min.js ]; then
  echo "downloading three.js r128..."
  curl -sL -o three.min.js https://unpkg.com/three@0.128.0/build/three.min.js
fi

node generate.js "$1" "$2"
SLUG=$(node -p "require('./$1').meta.slug")
node assemble.js "dist/$SLUG.json"

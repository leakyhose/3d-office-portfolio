#!/usr/bin/env bash
# Rebuilds the runtime scene assets from the source model:
#   art/newcat.glb (+ art/lebombo_1k.hdr)  ->  src/assets/office.glb
#   + the room/lights in scripts/bake/stage.py   src/assets/office-lightmap.webp
#                                              src/assets/room-lightmap.webp
#                                              src/assets/floor-lightmap.webp
#
# Needs Blender 4.3+, cwebp (brew install webp) and npx (@gltf-transform/cli).
# Run again whenever the model, the room or the lights in stage.py change
# (preview.py renders the app's views from stage.py in seconds, without baking).
#
#   scripts/bake/bake.sh [atlas_size=2048] [samples=384]
set -euo pipefail
cd "$(dirname "$0")/../.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
SIZE=${1:-2048}
SAMPLES=${2:-384}
# BAKE_WORK=<dir> keeps the EXRs (re-run encode.py without re-baking)
if [ -n "${BAKE_WORK:-}" ]; then WORK=$BAKE_WORK; mkdir -p "$WORK"
else WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT; fi

"$BLENDER" -b --python scripts/bake/bake.py -- art/newcat.glb "$WORK/bake" "$SIZE" "$SAMPLES"
"$BLENDER" -b --python scripts/bake/encode.py -- "$WORK/bake" "$WORK/enc"
cwebp -quiet -q 90 "$WORK/enc/atlas.png" -o src/assets/office-lightmap.webp
cwebp -quiet -q 85 "$WORK/enc/room.png" -o src/assets/room-lightmap.webp
cwebp -quiet -q 85 "$WORK/enc/floor.png" -o src/assets/floor-lightmap.webp
# Quantize + meshopt-compress the geometry (node/mesh/material names are kept).
npx --yes @gltf-transform/cli meshopt "$WORK/bake/scene_lm.glb" src/assets/office.glb --level medium
ls -la src/assets

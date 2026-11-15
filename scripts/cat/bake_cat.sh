#!/usr/bin/env bash
# Rebuilds the cats and puts them into the runtime scene, re-baking only the
# cats and what they stand on around them (the desk top, the chair):
#   scripts/cat/build_cat.py                  ->  art/cat.glb
#   scripts/cat/build_chair_cat.py            ->  art/chair_cat.glb
#   the two + src/assets/office.glb           ->  src/assets/office.glb
#   + src/assets/office-lightmap.webp             src/assets/office-lightmap.webp
# The rest of the atlas and the floor lightmap are left as they are
# (scripts/bake/bake.sh re-bakes everything, cats included).
#
# Needs Blender 4.3+, cwebp + dwebp (libwebp) and npx (@gltf-transform/cli).
#
#   scripts/cat/bake_cat.sh [samples=384]      SKIP_BUILD=1 keeps art/*cat.glb
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd -W 2>/dev/null || pwd)  # a path Blender understands under Git Bash too
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
# Windows (Git Bash): BLENDER="/c/Program Files/Blender Foundation/Blender 4.3/blender.exe"
SAMPLES=${1:-384}
if [ -n "${BAKE_WORK:-}" ]; then WORK=$BAKE_WORK; mkdir -p "$WORK"
else WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT; fi
WORK=$(cd "$WORK" && (pwd -W 2>/dev/null || pwd))

[ -n "${SKIP_BUILD:-}" ] || "$BLENDER" -b --python-exit-code 1 --python scripts/cat/build_cat.py -- "$ROOT/art/cat.glb"
[ -n "${SKIP_BUILD:-}" ] || "$BLENDER" -b --python-exit-code 1 --python scripts/cat/build_chair_cat.py -- "$ROOT/art/chair_cat.glb"
npx --yes @gltf-transform/cli dequantize src/assets/office.glb "$WORK/office_plain.glb"
dwebp -quiet src/assets/office-lightmap.webp -o "$WORK/atlas_old.png"
"$BLENDER" -b --python-exit-code 1 --python scripts/cat/bake_cat.py -- "$WORK/office_plain.glb" "$ROOT/art/newcat.glb" "$WORK/atlas_old.png" "$WORK/out" "$SAMPLES"
# same quality as bake.sh: re-encoding the untouched texels at their own
# quality changes them least for the size (PSNR 47 dB against the composite)
cwebp -quiet -q 90 "$WORK/out/atlas.png" -o src/assets/office-lightmap.webp
npx --yes @gltf-transform/cli meshopt "$WORK/out/scene_lm.glb" src/assets/office.glb --level medium
ls -la src/assets

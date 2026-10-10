#!/usr/bin/env sh
# Copies the harness output for one spike into rfd/0003/spike/<spike>/ as the
# curated evidence the report links: JPEG stills (the PNGs are ~1 MB each),
# the MP4 videos, and stats.json. Usage: publish-evidence.sh <three|cesium|wgpu>
set -eu
spike=$1
src="$(dirname "$0")/out/$spike"
dst="$(dirname "$0")/../../rfd/0003/spike/$spike"
mkdir -p "$dst"
for f in desktop-hero desktop-orbit-90 desktop-orbit-180 desktop-landfall phone-quality; do
  ${FFMPEG:-ffmpeg} -y -loglevel error -i "$src/$f.png" -q:v 4 "$dst/$f.jpg"
done
cp "$src/orbit.mp4" "$src/playhead.mp4" "$src/stats.json" "$dst/"
ls -la "$dst"

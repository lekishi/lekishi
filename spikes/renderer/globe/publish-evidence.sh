#!/usr/bin/env sh
# Copies one globe spike's harness output into rfd/0003/spike/globe/<spike>/ as
# the evidence the record links: JPEG stills, the flight MP4, and stats.json.
# Usage: publish-evidence.sh <cesium|tilesjs|custom>
set -eu
spike=$1
src="$(dirname "$0")/out/$spike"
dst="$(dirname "$0")/../../../rfd/0003/spike/globe/$spike"
mkdir -p "$dst"
for f in globe region local phone-local; do
  ${FFMPEG:-ffmpeg} -y -loglevel error -i "$src/$f.png" -q:v 4 "$dst/$f.jpg"
done
cp "$src/flight.mp4" "$src/stats.json" "$dst/"
ls -la "$dst"

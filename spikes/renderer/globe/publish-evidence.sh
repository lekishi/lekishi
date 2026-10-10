#!/usr/bin/env sh
# Copies one globe spike's harness output into rfd/0003/spike/globe/<spike>/ as
# the evidence the record links: JPEG stills, the flight MP4, and stats.json.
# The follow-up also has an interaction video, its pick stills and their log.
# Usage: publish-evidence.sh <cesium|tilesjs|custom|followup>
set -eu
spike=$1
src="$(dirname "$0")/out/$spike"
dst="$(dirname "$0")/../../../rfd/0003/spike/globe/$spike"
mkdir -p "$dst"
for f in globe region local phone-local; do
  ${FFMPEG:-ffmpeg} -y -loglevel error -i "$src/$f.png" -q:v 4 "$dst/$f.jpg"
done
cp "$src/flight.mp4" "$src/stats.json" "$dst/"
for f in "$src"/pick-*.png; do
  [ -e "$f" ] || continue
  ${FFMPEG:-ffmpeg} -y -loglevel error -i "$f" -q:v 4 "$dst/$(basename "$f" .png).jpg"
done
for f in interaction.mp4 interaction.json; do
  if [ -e "$src/$f" ]; then cp "$src/$f" "$dst/"; fi
done
ls -la "$dst"

#!/usr/bin/env bash
# Rebuilds data.js (recipes' disassembly sources + bundled offline prices) and downloads any new item images
# from the RuneScape Wiki. Only needed occasionally (new items/updates) — GE prices already refresh on page open.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$APP/tools"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
UA="Mozilla/5.0 (X11; Linux) hydrix-calc-local/1.0"
for m in GEPrices GELimits GEVolumes; do
  curl -sf -A "$UA" "https://runescape.wiki/w/Module:${m}/data.json?action=raw" -o "$(echo "$m" | tr 'A-Z' 'a-z').json"
done
python3 -I "$TOOLS/fetch_dis.py" dis_all.json
python3 -I "$TOOLS/build_data.py"
python3 -I "$TOOLS/pick_images.py"
python3 -I "$TOOLS/fetch_images.py" "$APP/img"
python3 -I "$TOOLS/make_datajs.py" "$APP/data.js"
echo "Done. Reload the page."

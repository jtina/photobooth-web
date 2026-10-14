#!/usr/bin/env bash
# Builds the static site into an output folder (default: _site).
# - regenerates stickers.json from assets/stickers
# - stamps the service worker cache name with a build id
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${1:-_site}"
BUILD_ID="${BUILD_ID:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)}"

python3 - "$ROOT/assets/stickers" "$ROOT/stickers.json" <<'PY'
import json, os, sys
folder, out = sys.argv[1:]
names = sorted(
    (n for n in os.listdir(folder)
     if not n.startswith('.') and os.path.splitext(n)[1].lower() in {'.png', '.jpg', '.jpeg', '.webp'}),
    key=str.casefold,
)
with open(out, 'w', encoding='utf-8') as f:
    json.dump(names, f, indent=2)
    f.write('\n')
print(f'stickers.json: {len(names)} stickers')
PY

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
for item in index.html styles.css manifest.webmanifest sw.js stickers.json js vendor assets; do
  cp -R "$ROOT/$item" "$OUT_DIR/"
done
sed -i.bak "s/BUILD_ID/$BUILD_ID/" "$OUT_DIR/sw.js" && rm -f "$OUT_DIR/sw.js.bak"
touch "$OUT_DIR/.nojekyll"
echo "Built site in $OUT_DIR (build $BUILD_ID)"

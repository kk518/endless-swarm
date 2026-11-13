#!/usr/bin/env bash
# Creator's own editor is the only authority for the Cocos Web Mobile artifact.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
project="$repo_root/clients/cocos"
app_dir="${COCOS_EDITOR_APP:?Set COCOS_EDITOR_APP to the installed CocosCreator.app path}"
editor="$app_dir/Contents/MacOS/CocosCreator"
scene_uuid="ad84ddda-6824-4c91-9534-3b713fe5c091"
output="$repo_root/dist/cocos-creator-web"

test -x "$editor" || { echo "No Creator executable at $editor" >&2; exit 20; }
test -s "$project/assets/scenes/Battle.scene" || { echo "Battle.scene missing" >&2; exit 21; }
test -s "$project/assets/scenes/Battle.scene.meta" || { echo "Battle.scene.meta missing" >&2; exit 22; }

node "$repo_root/scripts/check-m6-copy.mjs" --check

echo "Running Cocos Creator CLI: $editor"
echo "Project: $project"
mkdir -p "$repo_root/dist"
set +e
"$editor" --project "$project" \
  --build "platform=web-mobile;debug=true;buildPath=project://build;outputName=web-mobile;startScene=$scene_uuid" \
  > "$repo_root/dist/cocos-editor.log" 2>&1
status=$?
set -e
echo "Cocos CLI exit code: $status (official success code is 36)"
tail -n 100 "$repo_root/dist/cocos-editor.log" || true
if [[ "$status" -ne 36 ]]; then
  echo "Cocos Creator did not report success. A Vite-built fallback is NOT accepted." >&2
  exit 23
fi

index_file="$(find "$project/build" -maxdepth 6 -name index.html -type f | head -n 1)"
if [[ -z "$index_file" || ! -s "$index_file" ]]; then
  echo "Creator returned success but generated no valid Web Mobile index.html" >&2
  exit 24
fi
build_dir="$(dirname "$index_file")"
if ! grep -q -E 'cocos|Cocos|settings|SystemJS|System\.import' "$index_file"; then
  echo "HTML is missing the expected Cocos runtime markers" >&2
  exit 25
fi
rm -rf "$output"
mkdir -p "$output"
rsync -a "$build_dir/" "$output/"
# Generated Creator HTML keeps its real game bundles; add only a bounded
# startup error/retry overlay, never a Vite fallback.
node "$repo_root/scripts/inject-cocos-startup-guard.mjs" "$output/index.html"
printf '{"commit":"%s","kind":"cocos-creator-3.8.8-web-mobile","editor":"3.8.8"}\n' \
  "${PREVIEW_REVISION:-unknown}" > "$output/preview-version.json"
echo "Verified real Creator Web Mobile artifact at $output"
du -sh "$output" || true

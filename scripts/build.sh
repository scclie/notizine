#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building..."
cd "$PROJECT_DIR"
/nix/store/hzf5adyxj13mx6rmzynzwnajrvmj86fd-zine-0.13.0/bin/zine release --force

if [ "${1:-}" = "--no-purge" ]; then
    echo "Skipping CSS purge."
    exit 0
fi

echo "Purging unused CSS..."
find public -name '*.html' -print0 | while IFS= read -r -d '' f; do
    python3 "$PROJECT_DIR/scripts/purge-css.py" "$f" --in-place
done
echo "Done."

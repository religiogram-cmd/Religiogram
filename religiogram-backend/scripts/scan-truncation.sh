#!/usr/bin/env bash
# scripts/scan-truncation.sh
# Scan source files for signs of truncation (files that end mid-function/class).
# Usage: bash scripts/scan-truncation.sh [src_dir]
# Exits non-zero if any file looks truncated.

set -euo pipefail

SRC_DIR="${1:-src}"
FAIL=0

echo "=== Truncation scan: $SRC_DIR ==="

while IFS= read -r -d '' file; do
  # Skip empty files and .d.ts
  [[ "$file" == *.d.ts ]] && continue
  [[ ! -s "$file" ]] && continue

  last_line=$(tail -1 "$file")
  lines=$(wc -l < "$file")

  # Heuristic: file ends without closing brace/bracket
  if [[ "$last_line" =~ ^[[:space:]]*$ ]]; then
    # Trailing newline — look at second-to-last
    last_line=$(tail -2 "$file" | head -1)
  fi

  if [[ "$lines" -gt 10 ]] && ! echo "$last_line" | grep -qE '^\}|^\]|^};|^\);|^export|^\/\*|^\*\/'; then
    echo "⚠️   Possibly truncated: $file (last line: $last_line)"
    FAIL=1
  fi
done < <(find "$SRC_DIR" -name "*.ts" -not -name "*.spec.ts" -print0)

if [ "$FAIL" -eq 0 ]; then
  echo "✅  No truncated files detected."
else
  echo "❌  Potential truncations found — review before shipping."
  exit 1
fi

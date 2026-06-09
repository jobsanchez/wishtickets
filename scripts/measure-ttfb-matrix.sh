#!/usr/bin/env bash
# Measure TTFB for a small route matrix (same curl format as measure-ttfb.sh).
# Usage:
#   BASE_URL=https://wishtickets.net EVENT_SLUG=my-event ./scripts/measure-ttfb-matrix.sh
# Or pass slug as first arg:
#   ./scripts/measure-ttfb-matrix.sh wishdate-rewrite-dagupan
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE_URL:-https://wishtickets.net}"
SLUG="${1:-${EVENT_SLUG:-}}"
PATHS=("/" "/login")
if [[ -n "$SLUG" ]]; then
  PATHS+=("/${SLUG}" "/${SLUG}/book")
fi
for p in "${PATHS[@]}"; do
  echo "=== ${BASE}${p} ==="
  bash "$DIR/measure-ttfb.sh" "${BASE}${p}"
done

#!/usr/bin/env bash
# Measure approximate TTFB (time to first byte) with curl.
# Usage: ./scripts/measure-ttfb.sh [URL]
# Example: ./scripts/measure-ttfb.sh https://yoursite.netlify.app/
#
# Env:
#   SHOW_HEADERS=1 — print response headers for pass 1 (Cache-Control, x-nextjs-stale-time, age, etc.)
#   SKIP_WARM=1    — only first request (skip second “warm” pass)
#
# Baseline / interpretation:
# - Production warm edge: often ~0.5–1.0s time_starttransfer; expect x-nextjs-stale-time: 300 and
#   Cache-Control: public,max-age=0,must-revalidate on HTML (browser revalidates; CDN may serve stale).
# - Preview deploys can show multi-second TTFB on cold serverless; compare pass 1 vs pass 2 and prod vs preview.
# - Lighthouse lab runs on a cold preview can show ~8s document while warm curl does not — use this script to separate edge cache from cold start.
set -euo pipefail
URL="${1:-http://127.0.0.1:3000}"
HDR_FILE="$(mktemp)"
cleanup() { rm -f "$HDR_FILE"; }
trap cleanup EXIT

if [[ "${SHOW_HEADERS:-}" == "1" ]]; then
  echo "=== pass 1 — headers + timing ==="
  curl -sS -D "$HDR_FILE" -o /dev/null -w "url: %{url_effective}\nhttp_code: %{http_code}\ntime_starttransfer_s: %{time_starttransfer}\ntime_total_s: %{time_total}\n" "$URL"
  sed -n '1,40p' "$HDR_FILE"
else
  echo "=== pass 1 ==="
  curl -sS -o /dev/null -w "url: %{url_effective}\nhttp_code: %{http_code}\ntime_starttransfer_s: %{time_starttransfer}\ntime_total_s: %{time_total}\n" "$URL"
fi

if [[ "${SKIP_WARM:-}" != "1" ]]; then
  echo "=== pass 2 (warm, same connection pool / edge may hit cache) ==="
  curl -sS -o /dev/null -w "url: %{url_effective}\nhttp_code: %{http_code}\ntime_starttransfer_s: %{time_starttransfer}\ntime_total_s: %{time_total}\n" "$URL"
fi

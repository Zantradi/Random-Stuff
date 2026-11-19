#!/usr/bin/env bash
# Starts the local web server for the Alchemical Hydrix/Onyx Calculator (if it isn't running) and opens it.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8642
URL="http://127.0.0.1:${PORT}/"
PAGE="${1:-}"   # optional page to open, e.g. onyx.html
case "$PAGE" in index.html|onyx.html) ;; *) PAGE="" ;; esac

running() { curl -s --max-time 1 "$URL" 2>/dev/null | grep -q 'content="hydrix-calc"'; }

if ! running; then
  setsid nohup python3 "$DIR/serve.py" "$PORT" >/dev/null 2>&1 &
  for _ in $(seq 1 30); do running && break; sleep 0.2; done
fi

if running; then
  xdg-open "$URL$PAGE" >/dev/null 2>&1 &
else
  # Port busy or python missing: open the file directly (everything still works offline).
  xdg-open "$DIR/${PAGE:-index.html}" >/dev/null 2>&1 &
fi

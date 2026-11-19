#!/usr/bin/env bash
# Starts the local web server for the Clue Presets page (if it isn't running) and opens it.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8657
URL="http://127.0.0.1:${PORT}/"

running() { curl -s --max-time 1 "$URL" 2>/dev/null | grep -q 'content="clue-presets"'; }

if ! running; then
  setsid nohup python3 "$DIR/serve.py" "$PORT" >/dev/null 2>&1 &
  for _ in $(seq 1 30); do running && break; sleep 0.2; done
fi

if running; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  # Port busy or python missing: open the file directly (everything but Rebuild still works).
  xdg-open "$DIR/index.html" >/dev/null 2>&1 &
fi

#!/usr/bin/env bash
# Stops the local web server for the Alchemical Hydrix/Onyx calculators.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
stopped=0
pkill -f "$DIR/serve.py 8642" && stopped=1
pkill -f "http.server 8642 --bind 127.0.0.1" && stopped=1   # older launcher
[ "$stopped" = 1 ] && echo "Stopped." || echo "Server was not running."

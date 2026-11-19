#!/usr/bin/env python3
"""Local web server for the Clue Presets page.

Serves this folder on 127.0.0.1 only (like `python3 -m http.server`) with "Cache-Control: no-cache"
so a rebuilt page always shows, and answers POST /rebuild by running build.py and sending back its
output. The rebuild request must carry an "X-Rebuild: 1" header: a browser won't send a custom
header from another website without a CORS preflight this server never approves, so only the page
itself can start a rebuild.
"""
import functools
import http.server
import json
import os
import subprocess
import sys
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, "build.py")
_lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):  # start.sh discards output anyway
        pass

    def do_POST(self):
        if self.path != "/rebuild" or self.headers.get("X-Rebuild") != "1":
            self.send_error(404)
            return
        if not _lock.acquire(blocking=False):
            self._json(409, {"ok": False, "log": "A rebuild is already running."})
            return
        try:
            r = subprocess.run([sys.executable, BUILD], cwd=ROOT, capture_output=True, text=True, timeout=600)
            self._json(200, {"ok": r.returncode == 0, "log": (r.stdout + r.stderr).strip()})
        except subprocess.TimeoutExpired:
            self._json(200, {"ok": False, "log": "build.py took longer than 10 minutes and was stopped."})
        finally:
            _lock.release()

    def _json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8657
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()

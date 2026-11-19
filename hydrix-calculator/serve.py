#!/usr/bin/env python3
"""Local web server for the Alchemical Hydrix/Onyx calculators.

Same as `python3 -m http.server`, bound to 127.0.0.1 only, but it tells the browser to check for a
newer copy of every file on each page load ("Cache-Control: no-cache"). Without that, browsers may
keep running an old app.js after the calculator is updated. Unchanged files still come back as a
quick "304 Not Modified", so nothing is re-downloaded needlessly.
"""
import functools
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):  # keep quiet; start.sh discards output anyway
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        httpd.serve_forever()


if __name__ == '__main__':
    main()

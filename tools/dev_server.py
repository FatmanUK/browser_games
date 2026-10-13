#!/usr/bin/env python3
"""Static file server for local development.

Like `python3 -m http.server`, but disables caching: plain
http.server sends no Cache-Control header, and browsers can
still cache ES module imports across requests (even across a
server restart on the same origin), which hides fresh edits
until a hard refresh. This always serves the files as they
currently are on disk.
"""

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(('', port), NoCacheHandler)
    print(f'Serving on http://localhost:{port}/ (no-cache)')
    server.serve_forever()


if __name__ == '__main__':
    main()

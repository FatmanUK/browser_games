#!/usr/bin/env python3
"""Static file server for local development and the container.

Like `python3 -m http.server`, but with two differences:

- Disables caching: plain http.server sends no Cache-Control
  header, and browsers can still cache ES module imports across
  requests (even across a server restart on the same origin),
  which hides fresh edits until a hard refresh. This always
  serves the files as they currently are on disk.
- Binds dual-stack (IPv6 socket with IPV6_V6ONLY off, same
  approach as `python3 -m http.server`'s own `-b ::`): a client
  resolving "localhost" to ::1 would otherwise get a connection
  reset against an IPv4-only server, which is exactly what
  happens for plain `HTTPServer(('', port), ...)`.
"""

import contextlib
import socket
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class DualStackServer(HTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(
                socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = DualStackServer(('::', port), NoCacheHandler)
    print(f'Serving on http://localhost:{port}/ (no-cache)')
    server.serve_forever()


if __name__ == '__main__':
    main()

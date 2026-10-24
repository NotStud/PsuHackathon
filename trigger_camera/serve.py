"""HTTPS dev server for testing the trigger/camera page on a phone.

Phones only allow camera and motion access on HTTPS, so this generates a
self-signed cert for your LAN IP (needs `openssl` on PATH, which Git Bash has).
POST /shot saves each shot to shots/<request_id>/ so the CV side has real data.

    python serve.py            # then open https://<printed-ip>:8443 on your phone
"""
import email.parser
import email.policy
import json
import re
import socket
import ssl
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHOTS = HERE / 'shots'
CERT, KEY = HERE / '.cert.pem', HERE / '.key.pem'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
MAX_UPLOAD = 50 * 1024 * 1024
ALLOWED_FILES = {'frame.jpg', 'clip.mp4', 'clip.webm'}


def lan_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
        except OSError:
            return '127.0.0.1'


def ensure_cert(ip):
    if CERT.exists() and KEY.exists():
        return
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
                    '-keyout', str(KEY), '-out', str(CERT), '-subj', '/CN=snipe-dev',
                    '-addext', f'subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost'], check=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def do_POST(self):
        if self.path.split('?')[0] != '/shot':
            return self.send_error(404)
        length = int(self.headers.get('Content-Length') or 0)
        if not 0 < length <= MAX_UPLOAD:
            return self.send_error(413)
        raw = b'Content-Type: ' + self.headers['Content-Type'].encode() + b'\r\n\r\n' + self.rfile.read(length)
        msg = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(raw)
        parts = {p.get_param('name', header='content-disposition'): p for p in msg.iter_parts()}

        meta = json.loads(parts['meta'].get_content()) if 'meta' in parts else {}
        shot_id = re.sub(r'[^A-Za-z0-9_-]', '', str(meta.get('request_id', '')))[:100] or 'unnamed'
        out = SHOTS / shot_id
        out.mkdir(parents=True, exist_ok=True)
        (out / 'meta.json').write_text(json.dumps(meta, indent=2))
        for name in ('frame', 'clip'):
            if name in parts and parts[name].get_filename() in ALLOWED_FILES:
                (out / parts[name].get_filename()).write_bytes(parts[name].get_payload(decode=True))

        print(f'shot saved -> {out}')
        # Hit detection plugs in here; until then we just acknowledge the shot.
        body = json.dumps({'saved': shot_id, 'hit': None}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ip = lan_ip()
    ensure_cert(ip)
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print(f'Open https://{ip}:{PORT} on your phone (same Wi-Fi). Accept the certificate warning.')
    server.serve_forever()

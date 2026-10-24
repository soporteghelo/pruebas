"""Vercel: POST /api/submit {action, pairs} -> envía una respuesta y devuelve el estado de Google."""
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _forms import api_submit, responder_json  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        responder_json(self, *api_submit(cuerpo))

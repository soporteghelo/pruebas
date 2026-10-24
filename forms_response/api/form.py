"""Vercel: GET /api/form?url=<enlace del Google Form> -> campos del formulario en JSON."""
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _forms import api_form, responder_json  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("url", [""])[0]
        responder_json(self, *api_form(url))

"""
Uso local: sirve public/index.html en http://localhost:2001/ y expone las mismas APIs que Vercel:
  GET  /api/form?url=<enlace del Google Form>  -> campos del formulario en JSON
  POST /api/submit {action, pairs}             -> envía una respuesta y devuelve el estado de Google
La lógica está en api/_forms.py (compartida con las funciones de Vercel).
"""
import http.server
import os
import socketserver
import sys
import urllib.parse

RAIZ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(RAIZ, "api"))
from _forms import api_form, api_submit, responder_json  # noqa: E402

PUERTO = int(os.environ.get("PUERTO", 2001))
CARPETA = os.path.join(RAIZ, "public")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CARPETA, **kwargs)

    def do_GET(self):
        ruta = urllib.parse.urlparse(self.path)
        if ruta.path == "/api/form":
            url = urllib.parse.parse_qs(ruta.query).get("url", [""])[0]
            return responder_json(self, *api_form(url))
        if ruta.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/submit":
            return responder_json(self, 404, {"error": "no existe"})
        responder_json(self, *api_submit(self.rfile.read(int(self.headers.get("Content-Length", 0)))))

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", PUERTO), Handler) as httpd:
    print(f"App corriendo en http://localhost:{PUERTO}/  (Ctrl+C para detener)", flush=True)
    httpd.serve_forever()

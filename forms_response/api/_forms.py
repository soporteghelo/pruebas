"""Lógica compartida: lectura de Google Forms y envío de respuestas (usada por Vercel y por servidor.py)."""
import json
import re
import urllib.error
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}

TIPOS = {0: "text", 1: "paragraph", 2: "choice", 3: "dropdown", 4: "checkbox",
         5: "scale", 7: "grid", 9: "date", 10: "time", 13: "file"}
SIN_RESPUESTA = {6, 8, 11, 12}  # título/descripción, salto de sección, imagen, video


def url_permitida(url, solo_envio=False):
    p = urllib.parse.urlparse(url)
    if p.scheme != "https":
        return False
    if solo_envio:
        return p.netloc == "docs.google.com" and p.path.startswith("/forms/") and p.path.endswith("/formResponse")
    return p.netloc in ("docs.google.com", "forms.gle")


def g(lst, i, default=None):
    """Índice seguro dentro de las listas anidadas de FB_PUBLIC_LOAD_DATA_."""
    try:
        v = lst[i]
        return default if v is None else v
    except (IndexError, TypeError):
        return default


def leer_formulario(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        final = r.geturl()
        html = r.read().decode("utf-8", "replace")
    if "accounts.google.com" in final:
        raise ValueError("El formulario exige iniciar sesión con Google; no se puede llenar automáticamente.")
    m = re.search(r"FB_PUBLIC_LOAD_DATA_ = (.*?);\s*</script>", html, re.S)
    if not m:
        raise ValueError("No se encontraron los campos. ¿El enlace es de un Google Form público y abierto a respuestas?")
    data = json.loads(m.group(1))
    info = g(data, 1, [])
    path = g(data, 14, "")
    fbzx = re.search(r'name="fbzx" value="([^"]+)"', html)

    campos, pagina, avisos = [], 0, []
    if 'name="emailAddress"' in html:
        campos.append({"entry": "emailAddress", "label": "Correo electrónico", "desc": "El formulario recopila correos",
                       "type": "text", "required": True, "options": [], "page": 0})

    for it in g(info, 1, []):
        tipo_n = g(it, 3)
        titulo = (g(it, 1, "") or "").strip()
        desc = (g(it, 2, "") or "").strip()
        if tipo_n == 8:
            pagina += 1
            continue
        if tipo_n in SIN_RESPUESTA:
            continue
        tipo = TIPOS.get(tipo_n)
        subs = g(it, 4, [])
        if not tipo or not subs:
            avisos.append(f"Pregunta no soportada: {titulo or g(it, 0)}")
            continue

        for s in subs:
            base = {"entry": f"entry.{s[0]}", "label": titulo, "desc": desc, "type": tipo,
                    "required": g(s, 2) == 1, "options": [], "page": pagina}
            ops = g(s, 1, [])
            if tipo in ("choice", "dropdown", "checkbox", "scale"):
                base["options"] = [o[0] for o in ops if g(o, 0)]
                base["other"] = any(g(o, 4) == 1 for o in ops)
                if tipo == "scale":
                    etq = g(s, 3, [])
                    base["desc"] = desc or " → ".join(x for x in etq if x)
            elif tipo == "grid":
                fila = g(g(s, 3, []), 0, "")
                base["label"] = f"{titulo} [{fila}]" if fila else titulo
                base["options"] = [o[0] for o in ops if g(o, 0)]
                base["type"] = "checkbox" if g(g(s, 11, []), 0) == 1 else "choice"
                base["other"] = False
            elif tipo == "date":
                op = g(s, 7, [])
                base["includeTime"] = g(op, 0) == 1
                base["includeYear"] = g(op, 1, 1) == 1
            elif tipo == "file":
                avisos.append(f"“{titulo}” pide subir archivo: no se puede llenar automáticamente.")
            campos.append(base)

    return {
        "title": g(info, 8) or g(data, 3) or "Formulario",
        "description": g(info, 0, ""),
        "action": f"https://docs.google.com/forms/d/{path}/formResponse",
        "viewUrl": final,
        "formKey": path,
        "pages": pagina + 1,
        "fbzx": fbzx.group(1) if fbzx else "",
        "fields": campos,
        "warnings": avisos,
    }


def enviar(action, pares):
    cuerpo = urllib.parse.urlencode(pares).encode("utf-8")
    req = urllib.request.Request(action, data=cuerpo, headers={**UA, "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"ok": r.status == 200, "status": r.status}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code}


# ---- endpoints: devuelven (código HTTP, objeto JSON) ----
def api_form(url):
    url = (url or "").strip()
    if not url_permitida(url):
        return 400, {"error": "Pega un enlace de Google Forms (docs.google.com/forms o forms.gle)."}
    try:
        return 200, leer_formulario(url)
    except Exception as e:
        return 400, {"error": str(e)}


def api_submit(cuerpo):
    try:
        datos = json.loads(cuerpo)
        action, pares = datos["action"], datos["pairs"]
    except Exception:
        return 400, {"error": "solicitud inválida"}
    if not url_permitida(action, solo_envio=True):
        return 400, {"error": "destino no permitido"}
    return 200, enviar(action, [(str(k), str(v)) for k, v in pares])


def responder_json(handler, codigo, obj):
    cuerpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(codigo)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(cuerpo)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(cuerpo)

"""
Responde el Google Form "PRUEBAS COMIT" (TEST_OCT_CSST_PASSO) con los datos de un Excel.

Uso:
    python responder_formulario.py datos.xlsx            # simulación: muestra lo que enviaría
    python responder_formulario.py datos.xlsx --enviar   # envía de verdad

El Excel debe tener en la primera fila estos encabezados (ver plantilla_respuestas.xlsx):
    FECHA | DNI | APELLIDOS Y NOMBRES | GUARDIA | EMPRESA | AREA | P1
"""
import argparse
import datetime as dt
import sys
import time
import urllib.parse
import urllib.request

import openpyxl

FORM_ID = "1FAIpQLSdGaQCUnx-RvjxLDM7-hkMXm0PtEMf0Wx6ELuqwUPmVHIwwWQ"
URL_ENVIO = f"https://docs.google.com/forms/d/e/{FORM_ID}/formResponse"

# entry IDs sacados del formulario
E_FECHA = "entry.1345902017"
E_DNI = "entry.1547985899"
E_NOMBRE = "entry.1552978796"
E_GUARDIA = "entry.417328194"
E_EMPRESA = "entry.450793780"
E_AREA = "entry.988263005"
E_P1 = "entry.2103827563"

GUARDIAS = ["A", "B", "C", "S/G"]
EMPRESAS = ["AESA", "SANDVIK", "FERREYROS", "ZANIN GROUP", "LUCARBAL"]  # + opción "Otro"
AREAS = ["MANTENIMIENTO", "OPERACIONES", "OFICINA TÉCNICA", "LOGÍSTICA",
         "SEGURIDAD", "ADMINISTRACIÓN", "SERVICIOS MINA"]              # + opción "Otro"
P1_OPCIONES = {
    "A": "a) Organismo bipolar y partidario conformado solo por empleados.",
    "B": "b) Órgano bipartito y paritario constituido por representantes del empleador y de los trabajadores",
    "C": "c) Organización que no vela por la seguridad de los trabajadores",
}

COLUMNAS = ["FECHA", "DNI", "APELLIDOS Y NOMBRES", "GUARDIA", "EMPRESA", "AREA", "P1"]


def normalizar(texto):
    """Mayúsculas y sin tildes, para comparar opciones con tolerancia."""
    t = str(texto).strip().upper()
    for a, b in zip("ÁÉÍÓÚ", "AEIOU"):
        t = t.replace(a, b)
    return t


def buscar_opcion(valor, opciones):
    v = normalizar(valor)
    for op in opciones:
        if normalizar(op) == v:
            return op
    return None


def leer_fecha(valor):
    if isinstance(valor, dt.datetime):
        return valor.date()
    if isinstance(valor, dt.date):
        return valor
    texto = str(valor).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return dt.datetime.strptime(texto, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"fecha no reconocida: {valor!r} (usa dd/mm/aaaa)")


def armar_respuesta(fila):
    datos = {}

    fecha = leer_fecha(fila["FECHA"])
    datos[E_FECHA + "_year"] = fecha.year
    datos[E_FECHA + "_month"] = fecha.month
    datos[E_FECHA + "_day"] = fecha.day

    dni = str(fila["DNI"]).strip()
    if dni.endswith(".0"):  # Excel guarda números como float
        dni = dni[:-2]
    if not 1 <= len(dni) <= 10:
        raise ValueError(f"DNI debe tener entre 1 y 10 caracteres: {dni!r}")
    datos[E_DNI] = dni

    nombre = str(fila["APELLIDOS Y NOMBRES"] or "").strip()
    if not nombre:
        raise ValueError("falta APELLIDOS Y NOMBRES")
    datos[E_NOMBRE] = nombre

    guardia = buscar_opcion(fila["GUARDIA"], GUARDIAS)
    if not guardia:
        raise ValueError(f"GUARDIA inválida: {fila['GUARDIA']!r} (usa {', '.join(GUARDIAS)})")
    datos[E_GUARDIA] = guardia

    # EMPRESA y AREA admiten "Otro": si no coincide con una opción se envía como texto libre
    for entry, col, opciones in ((E_EMPRESA, "EMPRESA", EMPRESAS), (E_AREA, "AREA", AREAS)):
        valor = str(fila[col] or "").strip()
        if not valor:
            raise ValueError(f"falta {col}")
        op = buscar_opcion(valor, opciones)
        if op:
            datos[entry] = op
        else:
            datos[entry] = "__other_option__"
            datos[entry + ".other_option_response"] = valor

    p1 = normalizar(fila["P1"]).rstrip(")")[:1]
    if p1 not in P1_OPCIONES:
        raise ValueError(f"P1 inválida: {fila['P1']!r} (usa a, b o c)")
    datos[E_P1] = P1_OPCIONES[p1]

    return datos


def leer_excel(ruta):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    ws = wb.active
    filas = ws.iter_rows(values_only=True)
    encabezados = [normalizar(c) if c else "" for c in next(filas)]
    faltan = [c for c in COLUMNAS if normalizar(c) not in encabezados]
    if faltan:
        sys.exit(f"Faltan columnas en el Excel: {', '.join(faltan)}")
    idx = {c: encabezados.index(normalizar(c)) for c in COLUMNAS}
    for n, valores in enumerate(filas, start=2):
        if all(v is None or str(v).strip() == "" for v in valores):
            continue
        yield n, {c: valores[i] for c, i in idx.items()}


def enviar(datos):
    cuerpo = urllib.parse.urlencode(datos).encode("utf-8")
    req = urllib.request.Request(URL_ENVIO, data=cuerpo, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("excel")
    ap.add_argument("--enviar", action="store_true", help="enviar de verdad (sin esto solo simula)")
    ap.add_argument("--pausa", type=float, default=2.0, help="segundos entre envíos")
    args = ap.parse_args()

    ok = errores = 0
    for n, fila in leer_excel(args.excel):
        try:
            datos = armar_respuesta(fila)
        except ValueError as e:
            print(f"Fila {n}: ERROR - {e}")
            errores += 1
            continue

        if not args.enviar:
            print(f"Fila {n}: [simulación] {datos[E_DNI]} - {datos[E_NOMBRE]}")
            ok += 1
            continue

        try:
            estado = enviar(datos)
            print(f"Fila {n}: enviado ({estado}) {datos[E_DNI]} - {datos[E_NOMBRE]}")
            ok += 1
        except Exception as e:
            print(f"Fila {n}: FALLÓ el envío - {e}")
            errores += 1
        time.sleep(args.pausa)

    modo = "enviadas" if args.enviar else "válidas (simulación)"
    print(f"\nListo: {ok} {modo}, {errores} con error.")


if __name__ == "__main__":
    main()

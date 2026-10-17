// Extracción de participantes 100 % local: sin APIs, sin claves y sin pagos.
//
// Sustituye a la extracción con Gemini manteniendo la misma salida (el CSV de siempre),
// así que el resto de la app —vinculación con la maestra, visor, exportaciones— no
// cambia. Por cada página:
//
//   1. Se mide la tabla (rejilla.ts): renglones, columnas y giro de la foto.
//   2. Se borran sus líneas en una copia de la imagen y se lee con PP-OCRv6 (motor.ts).
//   3. Se reparte lo leído en Nro / Nombre / DNI / Ocupación / Área (tabla.ts).
//
// El OCR local lee peor la letra cursiva que un modelo grande en la nube; lo compensa
// la vinculación con la lista maestra, que tolera DNIs con dígitos mal leídos y nombres
// a medio leer, y la relectura ampliada de los renglones que queden sin resolver.

import { cargarImagen } from "./imagePrep";
import type { RecorteFila } from "./rowCrop";
import { combinedMatchScore, dniFuzzyScore, nameMatchScore } from "./matching";
import { leerImagen, NOMBRE_MODELO, prepararMotor, dejarDeAvisar, type AvisoProgreso, type CajaPx } from "./ocr/motor";
import { borrarLineas, detectarRejilla, type ImagenRGBA } from "./ocr/rejilla";
import { aCifras, esNumerico, leerTabla, limpiarDni, limpiarNombre, type CajaOcr } from "./ocr/tabla";

export interface ProcessedResult {
  csv: string;
  modelUsed: string;
}

export interface ArchivoEntrada {
  data: string;
  mimeType: string;
  name: string;
  /** Página real dentro del documento (1-based). Solo para PDFs de varias hojas. */
  pagina?: number;
}

const CABECERA_CSV =
  "Nro;Apellidos y Nombres;DNI;Ocupacion;Area;SourceFile;FilaDoc;Pagina;RowAnchors;TotalFilas";

export const MOTOR_OCR = `${NOMBRE_MODELO} (local)`;

export { prepararMotor };

// ---------------------------------------------------------------------------
// Imagen
// ---------------------------------------------------------------------------

async function aImagenRGBA(dataUrl: string): Promise<ImagenRGBA> {
  const img = await cargarImagen(dataUrl);
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings)!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);
  return { data, width: W, height: H };
}

async function aBytesPng(img: ImagenRGBA): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  const blob = await new Promise<Blob>((ok, mal) =>
    canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo codificar la imagen."))), "image/png")
  );
  return blob.arrayBuffer();
}

const aFracciones = (cajas: CajaPx[], W: number, H: number): CajaOcr[] =>
  cajas.map((c) => ({ texto: c.texto, x: c.x / W, y: c.y / H, w: c.w / W, h: c.h / H, conf: c.conf }));

// El separador del CSV es ";": no puede aparecer dentro de un campo.
const campo = (s: string) => (s || "").replace(/[;\r\n]+/g, " ").trim();

// ---------------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------------

async function leerPagina(archivo: ArchivoEntrada) {
  const t0 = performance.now();
  const dataUrl = `data:${archivo.mimeType};base64,${archivo.data}`;
  const img = await aImagenRGBA(dataUrl);
  const rejilla = detectarRejilla(img);
  const limpia = borrarLineas(img, rejilla ? rejilla.altoFila * img.height : undefined);
  const cajas = aFracciones(await leerImagen(await aBytesPng(limpia)), img.width, img.height);
  const tabla = leerTabla(cajas, rejilla);

  console.log(
    `[OCR] ${archivo.name}: ${cajas.length} textos, ${tabla.totalFilas} renglones, ` +
      `${tabla.filas.length} participantes en ${((performance.now() - t0) / 1000).toFixed(1)} s (${tabla.modo}).`
  );
  return tabla;
}

/**
 * Extrae un documento (una o varias páginas) y devuelve el CSV que espera la app.
 * Las páginas se leen en orden, de una en una: el motor es uno solo y así el avance
 * que se muestra es real.
 */
export async function processDocuments(
  files: ArchivoEntrada[],
  alAvanzar?: AvisoProgreso
): Promise<ProcessedResult> {
  try {
    if (alAvanzar) alAvanzar("Preparando el motor de lectura", 0);
    await prepararMotor(alAvanzar);

    const lineas: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      alAvanzar?.(
        files.length > 1 ? `Leyendo página ${i + 1} de ${files.length}` : "Leyendo el documento",
        Math.round((i / files.length) * 100)
      );
      const tabla = await leerPagina(f);
      const { yPrimera, xIzq, yUltima, xDer } = tabla.anclas;
      const anclas = `${yPrimera},${xIzq},${yUltima},${xDer}`;
      for (const fila of tabla.filas) {
        lineas.push([
          campo(fila.nro), campo(fila.nombre), campo(fila.dni), campo(fila.ocupacion), campo(fila.area),
          campo(f.name), String(fila.filaDoc), String(f.pagina ?? 1), anclas, String(tabla.totalFilas),
        ].join(";"));
      }
    }

    if (lineas.length === 0) {
      throw new Error(
        "No se reconoció ningún participante. Revisa que la foto esté nítida, derecha y con la tabla completa."
      );
    }
    const csv = [CABECERA_CSV, ...lineas].join("\n");
    console.log("=== CSV leído por el OCR local ===\n" + csv);
    return { csv, modelUsed: MOTOR_OCR };
  } finally {
    if (alAvanzar) dejarDeAvisar(alAvanzar);
  }
}

// ---------------------------------------------------------------------------
// Relectura puntual: solo sobre filas sin coincidencia
// ---------------------------------------------------------------------------

export interface LecturaFila {
  id: string;
  dni: string;
  nombre: string;
  confianza: number;
}

// Mismos umbrales que la vinculación automática de la app: solo se da por buena una
// persona de la lista si la lectura apunta a ella con claridad.
const UMBRAL_CANDIDATO = 0.8;
const MARGEN_CANDIDATO = 0.05;

/**
 * Relee renglones recortados a resolución completa. Es lo que hace una persona cuando no
 * distingue un 4 de un 9: acercar la lupa. El recorte se lee solo, así que el detector
 * trabaja a tamaño nativo en vez de con la página reducida.
 *
 * `candidatos` son las personas de la maestra. Con ellos el problema pasa de "leer 8
 * dígitos cualesquiera" a "elegir dentro de una lista conocida": se puntúa cada persona
 * con el DNI y el nombre releídos y, si una destaca, se devuelve su DNI.
 */
export async function releerFilas(
  recortes: RecorteFila[],
  candidatos: { dni: string; nombre: string }[]
): Promise<{ lecturas: LecturaFila[]; modelUsed: string }> {
  if (recortes.length === 0) return { lecturas: [], modelUsed: MOTOR_OCR };
  await prepararMotor();

  const lecturas: LecturaFila[] = [];
  for (const r of recortes) {
    const img = await aImagenRGBA(`data:${r.mimeType};base64,${r.base64}`);
    // El recorte lleva medio renglón de margen arriba y abajo (ver rowCrop.ts): el
    // renglón ocupa la mitad central, y lo de los bordes es de las filas vecinas.
    const limpia = borrarLineas(img, img.height / 2);
    const cajas = aFracciones(await leerImagen(await aBytesPng(limpia)), img.width, img.height)
      .filter((c) => { const yc = c.y + c.h / 2; return yc > 0.22 && yc < 0.78; })
      .sort((a, b) => a.x - b.x);

    const numericas = cajas.filter((c) => esNumerico(c.texto) && aCifras(c.texto.replace(/\s/g, "")).length >= 6);
    const dniLeido = numericas.length
      ? limpiarDni(numericas.sort((a, b) => b.conf - a.conf)[0].texto)
      : "";

    // Bloques de palabras contiguas: uno será el nombre; el resto, cargo, área o firma.
    const palabras = cajas.filter((c) => !esNumerico(c.texto) && limpiarNombre(c.texto).length >= 2);
    const bloques: CajaOcr[][] = [];
    for (const c of palabras) {
      const b = bloques[bloques.length - 1];
      const prev = b?.[b.length - 1];
      if (prev && c.x - (prev.x + prev.w) < Math.max(prev.h, c.h) * 1.5) b.push(c);
      else bloques.push([c]);
    }
    const textos = bloques.map((b) => limpiarNombre(b.map((c) => c.texto).join(" "))).filter(Boolean);
    const masLargo = [...textos].sort((a, b) => b.length - a.length)[0] ?? "";

    const puntuados = candidatos
      .map((cand) => {
        const sDni = dniLeido.length >= 6 ? dniFuzzyScore(dniLeido, cand.dni) : 0;
        let sNom = 0, texto = masLargo;
        for (const t of textos) {
          const s = t.length >= 4 ? nameMatchScore(t, cand.nombre) : 0;
          if (s > sNom) { sNom = s; texto = t; }
        }
        return { cand, score: combinedMatchScore(sDni, sNom), texto };
      })
      .sort((a, b) => b.score - a.score);

    const [mejor, segundo] = puntuados;
    const confOcr = cajas.length ? cajas.reduce((s, c) => s + c.conf, 0) / cajas.length : 0;
    if (mejor && mejor.score >= UMBRAL_CANDIDATO && (!segundo || mejor.score - segundo.score >= MARGEN_CANDIDATO)) {
      lecturas.push({ id: r.id, dni: mejor.cand.dni, nombre: mejor.texto, confianza: mejor.score });
    } else {
      lecturas.push({ id: r.id, dni: dniLeido, nombre: masLargo, confianza: confOcr * 0.5 });
    }
  }

  console.log("=== Relectura local ===", lecturas);
  return { lecturas, modelUsed: MOTOR_OCR };
}

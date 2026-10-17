// Cliente del motor OCR que vive en el Web Worker (ocr.worker.ts).
//
// Un solo worker para toda la app: los modelos pesan ~30 MB y cargarlos dos veces sería
// tirar memoria. Las lecturas se encolan en él una detrás de otra.

import modelos from "./modelos.json";
import type { CajaPx, FuenteArchivo, MensajeEntrada, MensajeSalida } from "./ocr.worker";

export type { CajaPx };
export type AvisoProgreso = (fase: string, pct: number) => void;

export const NOMBRE_MODELO = modelos.nombre;

let worker: Worker | null = null;
let listo: Promise<string> | null = null;
let siguienteId = 1;
const pendientes = new Map<number, { resolve: (c: CajaPx[]) => void; reject: (e: Error) => void }>();
const oyentes = new Set<AvisoProgreso>();

function fuentes() {
  const base = new URL(`${import.meta.env.BASE_URL}${modelos.carpeta}/`, location.href);
  const fuente = (a: { archivo: string; origen: string; bytes: number }): FuenteArchivo => ({
    // Primero la copia que se sirve con la app; el origen público solo como respaldo
    // si al desplegar no se llegaron a descargar los modelos.
    urls: [new URL(a.archivo, base).href, a.origen],
    bytes: a.bytes,
  });
  return {
    deteccion: fuente(modelos.archivos.deteccion),
    reconocimiento: fuente(modelos.archivos.reconocimiento),
    diccionario: fuente(modelos.archivos.diccionario),
  };
}

function reiniciar(motivo: string) {
  pendientes.forEach((p) => p.reject(new Error(motivo)));
  pendientes.clear();
  worker?.terminate();
  worker = null;
  listo = null;
}

/**
 * Arranca el motor (descarga o recupera de caché los modelos). Se puede llamar las
 * veces que se quiera: todas comparten la misma carga. Conviene llamarla en cuanto el
 * usuario sube un documento para que, al pulsar Extraer, ya esté listo.
 */
export function prepararMotor(alAvanzar?: AvisoProgreso): Promise<string> {
  if (alAvanzar) oyentes.add(alAvanzar);
  if (listo) return listo;

  worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" });
  listo = new Promise<string>((resolve, reject) => {
    worker!.onmessage = (ev: MessageEvent<MensajeSalida>) => {
      const m = ev.data;
      switch (m.tipo) {
        case "progreso":
          oyentes.forEach((f) => f(m.fase, m.pct));
          break;
        case "listo":
          console.log(`Motor OCR local listo (${NOMBRE_MODELO}, ${m.proveedor}).`);
          resolve(m.proveedor);
          break;
        case "error-inicio":
          reiniciar(m.mensaje);
          reject(new Error(`No se pudo cargar el motor de lectura: ${m.mensaje}`));
          break;
        case "resultado":
          pendientes.get(m.id)?.resolve(m.cajas);
          pendientes.delete(m.id);
          break;
        case "error":
          pendientes.get(m.id)?.reject(new Error(m.mensaje));
          pendientes.delete(m.id);
          break;
      }
    };
    worker!.onerror = (ev) => {
      const motivo = ev.message || "el motor de lectura se detuvo inesperadamente";
      reiniciar(motivo);
      reject(new Error(motivo));
    };
  });
  // Un fallo de arranque no debe quedar como promesa rechazada sin manejar si nadie
  // la estaba esperando (precarga en segundo plano).
  listo.catch(() => {});

  const msg: MensajeEntrada = { tipo: "iniciar", archivos: fuentes() };
  worker.postMessage(msg);
  return listo;
}

export function dejarDeAvisar(alAvanzar: AvisoProgreso) {
  oyentes.delete(alAvanzar);
}

/** Lee una imagen (bytes PNG/JPEG). Devuelve las cajas en píxeles de esa imagen. */
export async function leerImagen(imagen: ArrayBuffer, minConfianza?: number): Promise<CajaPx[]> {
  await prepararMotor();
  const id = siguienteId++;
  return new Promise<CajaPx[]>((resolve, reject) => {
    pendientes.set(id, { resolve, reject });
    const msg: MensajeEntrada = { tipo: "leer", id, imagen, minConfianza };
    worker!.postMessage(msg, [imagen]);
  });
}

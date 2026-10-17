/// <reference lib="webworker" />
// Motor OCR en un Web Worker: la inferencia bloquea el hilo en el que corre, y en el
// hilo principal congelaría la interfaz mientras lee cada página.
//
// Todo es local: los modelos (PP-OCRv6) y el runtime de ONNX se sirven desde la propia
// app y quedan guardados en la caché del navegador, así que solo se descargan la primera
// vez y la lectura no depende de ningún servicio externo.

import * as ort from "onnxruntime-web";
// El binario de ONNX Runtime se empaqueta con la app en vez de bajarlo de un CDN
// (la librería, si no se le dice nada, lo pide a jsDelivr).
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import { PaddleOcrService, type RecognitionOptions } from "ppu-paddle-ocr/web";

ort.env.wasm.wasmPaths = { wasm: wasmUrl };

export interface FuenteArchivo {
  urls: string[];   // en orden de preferencia: la copia local primero
  bytes: number;    // tamaño esperado, solo para el avance
}

export type MensajeEntrada =
  | { tipo: "iniciar"; archivos: { deteccion: FuenteArchivo; reconocimiento: FuenteArchivo; diccionario: FuenteArchivo } }
  | { tipo: "leer"; id: number; imagen: ArrayBuffer; minConfianza?: number };

export interface CajaPx {
  texto: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

export type MensajeSalida =
  | { tipo: "progreso"; fase: string; pct: number }
  | { tipo: "listo"; proveedor: string }
  | { tipo: "error-inicio"; mensaje: string }
  | { tipo: "resultado"; id: number; cajas: CajaPx[] }
  | { tipo: "error"; id: number; mensaje: string };

const CACHE = "ocr-modelos-v1";
const enviar = (m: MensajeSalida) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let servicio: PaddleOcrService | null = null;
let iniciando: Promise<void> | null = null;

async function abrirCache(): Promise<Cache | null> {
  try {
    return typeof caches !== "undefined" ? await caches.open(CACHE) : null;
  } catch {
    return null; // modo privado o contexto no seguro: se descarga cada vez
  }
}

/**
 * Trae un archivo de modelo: primero de la caché del navegador, si no de la primera
 * URL que responda. Avisa del avance en bytes para que la primera carga (~30 MB) no
 * parezca colgada.
 */
async function traer(fuente: FuenteArchivo, alAvanzar: (bytes: number) => void): Promise<ArrayBuffer> {
  const cache = await abrirCache();
  for (const url of fuente.urls) {
    try {
      const guardado = await cache?.match(url);
      if (guardado) {
        const buf = await guardado.arrayBuffer();
        alAvanzar(buf.byteLength);
        return buf;
      }
    } catch { /* caché corrupta: se vuelve a descargar */ }
  }

  let ultimoError: unknown = null;
  for (const url of fuente.urls) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      // Un fallback de SPA puede devolver index.html con 200 para un archivo que no existe.
      if ((res.headers.get("content-type") || "").includes("text/html")) throw new Error("no es un modelo");
      const lector = res.body.getReader();
      const trozos: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        trozos.push(value);
        total += value.byteLength;
        alAvanzar(value.byteLength);
      }
      const buf = new Uint8Array(total);
      let o = 0;
      for (const t of trozos) { buf.set(t, o); o += t.byteLength; }
      try { await cache?.put(url, new Response(buf.slice())); } catch { /* sin espacio: no pasa nada */ }
      return buf.buffer;
    } catch (err) {
      ultimoError = err;
    }
  }
  throw new Error(`No se pudo cargar ${fuente.urls[0]}: ${String((ultimoError as Error)?.message ?? ultimoError)}`);
}

async function iniciar(archivos: Extract<MensajeEntrada, { tipo: "iniciar" }>["archivos"]) {
  const lista = [archivos.deteccion, archivos.reconocimiento, archivos.diccionario];
  const esperado = lista.reduce((s, f) => s + f.bytes, 0);
  let recibido = 0;
  let ultimoAviso = 0;
  const avanzar = (n: number) => {
    recibido += n;
    const pct = Math.min(99, Math.round((recibido / esperado) * 100));
    if (pct !== ultimoAviso) {
      ultimoAviso = pct;
      enviar({ tipo: "progreso", fase: "Cargando el modelo de lectura", pct });
    }
  };

  const [det, rec, dic] = await Promise.all(lista.map((f) => traer(f, avanzar)));
  enviar({ tipo: "progreso", fase: "Preparando el motor de lectura", pct: 100 });

  const s = new PaddleOcrService({
    model: { detection: det, recognition: rec, charactersDictionary: dic },
    detection: {
      // Los dígitos manuscritos en casillas son pequeños: se detecta a más resolución
      // que el valor por defecto para no perder trazos finos.
      maxSideLength: 1920,
    },
    recognition: {
      // Una caja por palabra, sin fusionar las de un mismo renglón: si se fusionan, el
      // nombre y el DNI de la misma fila salen en una sola cadena.
      strategy: "per-box",
      // La letra a mano sale con menos confianza que la impresa; con el 0.5 por
      // defecto se descartaban DNIs bien leídos. El filtrado fino se hace después.
      minimumConfidence: 0.2,
      spaceRecovery: false,
      maxCropSourceSideLength: 2600,
      // El diccionario lo pone la librería a partir del archivo cargado.
    } as Partial<RecognitionOptions> as RecognitionOptions,
  });
  await s.initialize();
  servicio = s;
}

self.onmessage = async (ev: MessageEvent<MensajeEntrada>) => {
  const m = ev.data;
  if (m.tipo === "iniciar") {
    if (!iniciando) iniciando = iniciar(m.archivos);
    try {
      await iniciando;
      // Proveedor con el que quedó la sesión (WebGPU si el equipo lo tiene, si no WASM).
      const proveedores = (servicio as unknown as { options?: { session?: { executionProviders?: unknown[] } } })
        ?.options?.session?.executionProviders;
      const proveedor = String(proveedores?.[0] ?? "wasm");
      enviar({ tipo: "listo", proveedor });
    } catch (err) {
      iniciando = null; // permite reintentar
      enviar({ tipo: "error-inicio", mensaje: (err as Error)?.message ?? String(err) });
    }
    return;
  }

  if (m.tipo === "leer") {
    try {
      if (!servicio) throw new Error("El motor de lectura no está listo.");
      const r = await servicio.recognize(m.imagen, {
        flatten: true,
        noCache: true,
        strategy: "per-box",
        minimumConfidence: m.minConfianza ?? 0.2,
      });
      const resultados = r.results; // flatten: true → lista plana
      const cajas: CajaPx[] = resultados
        .filter((x) => x.text && x.text.trim())
        .map((x) => ({ texto: x.text, x: x.box.x, y: x.box.y, w: x.box.width, h: x.box.height, conf: x.confidence }));
      enviar({ tipo: "resultado", id: m.id, cajas });
    } catch (err) {
      enviar({ tipo: "error", id: m.id, mensaje: (err as Error)?.message ?? String(err) });
    }
  }
};

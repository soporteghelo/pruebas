// Cámara frontal + MediaPipe Face Landmarker en el navegador del celular.
// El video nunca se graba ni sale del equipo: cada cuadro se convierte en números y se descarta.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { RostroResumen } from "../types";
import { AnalizadorRostro, type EstadoVivo } from "./analyzer";
import { muestraDesde } from "./features";

let cargando: Promise<FaceLandmarker> | null = null;
let telemetriaBloqueada = false;

/**
 * MediaPipe envía cada minuto estadísticas de uso (tipo de tarea, latencias; nunca imágenes) a
 * odml.pa.googleapis.com. Se responden localmente para que la app no se comunique con terceros;
 * ante una respuesta distinta de 200, MediaPipe deja de intentarlo.
 */
function bloquearTelemetria() {
  if (telemetriaBloqueada || typeof window === "undefined") return;
  telemetriaBloqueada = true;
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.includes("odml.pa.googleapis.com")) return Promise.resolve(new Response(null, { status: 204 }));
    return original(entrada, init);
  };
}

/** Carga el modelo una sola vez. Intenta GPU (WebGL) y, si falla, CPU. */
export function cargarLandmarker(): Promise<FaceLandmarker> {
  bloquearTelemetria();
  cargando ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const archivos = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
    const crear = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    try {
      return await crear("GPU");
    } catch {
      return await crear("CPU");
    }
  })();
  cargando.catch(() => {
    cargando = null;
  });
  return cargando;
}

export type FaseMonitor = "apagado" | "cargando" | "calibrando" | "midiendo" | "error";

const INTERVALO_MS = 1000 / 30;
const INTERVALO_LUZ_MS = 500;

export class MonitorRostro {
  analizador = new AnalizadorRostro();
  fase: FaseMonitor = "apagado";
  error = "";
  progresoCalibracion = 0;
  onCambio?: () => void;

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private lm: FaceLandmarker | null = null;
  private activo = false;
  private ultimoT = -Infinity;
  private ultimaLuzT = -Infinity;
  private luz: number | undefined;
  private lienzo: HTMLCanvasElement | null = null;

  private cambiar(f: FaseMonitor) {
    this.fase = f;
    this.onCambio?.();
  }

  async iniciar(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    this.analizador = new AnalizadorRostro();
    this.progresoCalibracion = 0;
    this.cambiar("cargando");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no permite usar la cámara (se necesita HTTPS).");
      const [stream, lm] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false }),
        cargarLandmarker(),
      ]);
      this.stream = stream;
      this.lm = lm;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.activo = true;
      this.cambiar("calibrando");
      this.programar();
    } catch (e) {
      this.detener();
      const msg = e instanceof Error ? e.message : String(e);
      this.error = /Permission|NotAllowed|denied/i.test(msg)
        ? "No diste permiso para usar la cámara. Puedes activarlo en la configuración del navegador o continuar sin cámara."
        : /NotFound|DevicesNotFound/i.test(msg)
          ? "No se encontró una cámara frontal."
          : `No se pudo iniciar la cámara: ${msg}`;
      this.cambiar("error");
    }
  }

  private programar() {
    if (!this.activo || !this.video) return;
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => this.cuadro());
    else requestAnimationFrame(() => this.cuadro());
  }

  private medirLuz(v: HTMLVideoElement): number | undefined {
    try {
      this.lienzo ??= Object.assign(document.createElement("canvas"), { width: 32, height: 24 });
      const ctx = this.lienzo.getContext("2d", { willReadFrequently: true });
      if (!ctx) return undefined;
      ctx.drawImage(v, 0, 0, 32, 24);
      const d = ctx.getImageData(0, 0, 32, 24).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return s / (d.length / 4);
    } catch {
      return undefined;
    }
  }

  private cuadro() {
    if (!this.activo || !this.video || !this.lm) return;
    const v = this.video;
    const t = performance.now();
    if (v.readyState >= 2 && t - this.ultimoT >= INTERVALO_MS - 2 && (this.fase === "calibrando" || this.fase === "midiendo")) {
      this.ultimoT = t;
      try {
        const res = this.lm.detectForVideo(v, t);
        const m = muestraDesde(res, t, v.videoWidth, v.videoHeight);
        if (t - this.ultimaLuzT >= INTERVALO_LUZ_MS) {
          this.ultimaLuzT = t;
          this.luz = this.medirLuz(v);
        }
        m.luz = this.luz;
        if (this.fase === "calibrando") {
          this.progresoCalibracion = this.analizador.calibrar(m);
          if (this.progresoCalibracion >= 1 && this.analizador.terminarCalibracion()) this.cambiar("midiendo");
        } else {
          this.analizador.agregar(m);
        }
      } catch (e) {
        console.warn("Fallo al analizar un cuadro:", e);
      }
    }
    this.programar();
  }

  vivo(): EstadoVivo {
    return this.analizador.vivo(performance.now());
  }

  /** Termina la medición, apaga la cámara y devuelve el resumen (null si no llegó a medir). */
  terminar(): RostroResumen | null {
    const r = this.fase === "midiendo" ? this.analizador.resumen() : null;
    this.detener();
    return r;
  }

  detener() {
    this.activo = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (this.fase !== "error") this.cambiar("apagado");
  }
}

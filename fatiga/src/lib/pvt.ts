// Métricas del PVT-B (Basner, Mollicone y Dinges, 2011) y duración adaptativa (PVT-BA, Basner 2022).
// Los tiempos se corrigen restando la latencia táctil del equipo antes de clasificarlos.
import { PVT } from "@/config";
import type { CategoriaPvt, EventoPvt, PvtResultado } from "./types";

/** Intervalo entre estímulos, uniforme entre 1 y 4 s (incluye 1 s de retroalimentación). */
export function nuevoIsi(azar: () => number = Math.random): number {
  return PVT.isiMinMs + azar() * (PVT.isiMaxMs - PVT.isiMinMs);
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function desviacion(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Cantidad del 10 % de una muestra (mínimo 1), como en las métricas de Basner. */
const decil = (n: number) => Math.max(1, Math.round(n * 0.1));

/** Lapso (RT ≥ umbral), omisión o falso inicio (sin estímulo o RT < 100 ms). */
export function esFalla(e: EventoPvt, latenciaMs: number, lapsoMs: number): boolean {
  if (e.tipo !== "respuesta") return true;
  const rt = e.rt - latenciaMs;
  return rt < PVT.falsoMs || rt >= lapsoMs;
}

// ---------- Duración adaptativa (PVT-BA) ----------
//
// Cada respuesta actualiza, con el teorema de Bayes, la probabilidad de que el resultado de la
// prueba completa de 3 min sea ALTO (≤6 fallas), MEDIO (7-16) o BAJO (>16 fallas = lapsos +
// falsos inicios). La prueba termina cuando una categoría supera el 99,619 %.
// Las razones de verosimilitud se publicaron solo como gráfico; estos valores se ubican dentro
// de los rangos que reporta el artículo (una falla multiplica 3-5 veces la verosimilitud de BAJO
// y baja 75-85 % la de ALTO; una respuesta sin falla baja 22-43 % la de BAJO y sube 22-40 % la de
// ALTO; en los primeros 30 s están más cerca de 1).
const LR = [
  { altaFalla: 0.25, altaOk: 1.22, bajaFalla: 3.0, bajaOk: 0.78 }, // 0-30 s
  { altaFalla: 0.18, altaOk: 1.35, bajaFalla: 4.5, bajaOk: 0.62 }, // 30-180 s
];

export const PVT_BA = {
  umbral: 0.99619,
  fallasAlta: 6,
  fallasMedia: 16,
  minimoMs: 30_000, // mínimo propio, para tener datos suficientes para la referencia personal
  maximoMs: 180_000,
};

export interface EstadoAdaptativo {
  pAlta: number;
  pMedia: number;
  pBaja: number;
  fallas: number;
  decision: CategoriaPvt | null;
}

export function evaluarAdaptativo(eventos: EventoPvt[], latenciaMs: number, lapsoMs: number): EstadoAdaptativo {
  let oddsAlta = 0.5; // probabilidad previa 1/3 → odds 1:2
  let oddsBaja = 0.5;
  let fallas = 0;
  for (const e of eventos) {
    const falla = esFalla(e, latenciaMs, lapsoMs);
    const lr = LR[e.t < 30_000 ? 0 : 1];
    oddsAlta *= falla ? lr.altaFalla : lr.altaOk;
    oddsBaja *= falla ? lr.bajaFalla : lr.bajaOk;
    if (falla) fallas++;
  }
  let pAlta = fallas > PVT_BA.fallasAlta ? 0 : oddsAlta / (1 + oddsAlta);
  let pBaja = oddsBaja / (1 + oddsBaja);
  let pMedia = Math.max(0, 1 - pAlta - pBaja);
  const total = pAlta + pMedia + pBaja;
  pAlta /= total;
  pMedia /= total;
  pBaja /= total;
  let decision: CategoriaPvt | null = null;
  if (fallas > PVT_BA.fallasMedia || pBaja >= PVT_BA.umbral) decision = "baja";
  else if (pAlta >= PVT_BA.umbral) decision = "alta";
  else if (pMedia >= PVT_BA.umbral) decision = "media";
  return { pAlta, pMedia, pBaja, fallas, decision };
}

/** Categoría por número de fallas, con los cortes de 3 min escalados a la duración real. */
export function categoriaPorFallas(fallas: number, duracionS: number, cortes = { alta: PVT_BA.fallasAlta, media: PVT_BA.fallasMedia }): CategoriaPvt {
  const f = Math.min(1, duracionS / 180);
  if (fallas <= cortes.alta * f) return "alta";
  if (fallas <= cortes.media * f) return "media";
  return "baja";
}

export function calcularPvt(
  eventos: EventoPvt[],
  opciones: { latenciaMs: number; lapsoMs: number; duracionS: number; adaptativo?: boolean; cortes?: { alta: number; media: number } },
): PvtResultado {
  const { latenciaMs, lapsoMs, duracionS, adaptativo = false } = opciones;
  let falsos = 0;
  let timeouts = 0;
  const rts: number[] = [];
  for (const e of eventos) {
    if (e.tipo === "anticipacion") falsos++;
    else if (e.tipo === "timeout") timeouts++;
    else {
      const rt = e.rt - latenciaMs;
      if (rt < PVT.falsoMs) falsos++;
      else rts.push(rt);
    }
  }
  // Las omisiones (30 s sin respuesta) cuentan como lapsos y como velocidad casi nula.
  const conOmisiones = [...rts, ...Array(timeouts).fill(PVT.timeoutMs)];
  const velocidades = conOmisiones.map((rt) => 1000 / rt).sort((a, b) => a - b);
  const ordenRt = [...rts].sort((a, b) => a - b);
  const validos = conOmisiones.length;
  const lapsos = conOmisiones.filter((rt) => rt >= lapsoMs).length;
  const estimulos = validos + eventos.filter((e) => e.tipo === "respuesta" && e.rt - latenciaMs < PVT.falsoMs).length;
  const adapt = adaptativo ? evaluarAdaptativo(eventos, latenciaMs, lapsoMs) : null;
  const categoria = adapt?.decision ?? categoriaPorFallas(lapsos + falsos, duracionS, opciones.cortes);
  return {
    duracionS,
    estimulos,
    validos,
    mediaRt: media(rts),
    medianaRt: mediana(rts),
    sdRt: desviacion(rts),
    velocidad: media(velocidades),
    lentos10: velocidades.length ? media(velocidades.slice(0, decil(velocidades.length))) : 0,
    rapidos10Rt: ordenRt.length ? media(ordenRt.slice(0, decil(ordenRt.length))) : 0,
    lapsos,
    falsos,
    timeouts,
    puntaje: validos + falsos ? 1 - (lapsos + falsos) / (validos + falsos) : 0,
    tasaFallas: duracionS > 0 ? (lapsos + falsos) / (duracionS / 60) : 0,
    categoria,
    adaptativo,
    anticipado: adaptativo && duracionS < PVT_BA.maximoMs / 1000 - 1,
    latenciaMs,
    lapsoMs,
    rts,
  };
}

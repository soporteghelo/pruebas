// Referencia (línea base) personal de tiempo de reacción y de rostro.
//
// Cada persona tiene su propio tiempo de reacción normal (edad, mano, celular, costumbre), así que
// después de 3 evaluaciones en buenas condiciones la app compara a cada trabajador consigo mismo
// en lugar de usar solo cortes generales.
//
// Una evaluación sirve de referencia si se hizo descansado: KSS ≤ 5, cumple las reglas de sueño
// de Dawson, sin alcohol ni medicamentos que den sueño, se siente en condiciones, PVT completo
// (≥15 estímulos) y sin desempeño bajo. Cuando ya existía referencia, tampoco entran las que
// salieron fuera de su rango, para que la referencia no se "arrastre" con días malos.
// Se usa la mediana de las últimas 10 que califican, en este celular.
import { REFERENCIA } from "@/config";
import type { Evaluacion, LineaBase, PvtResultado, RostroResumen } from "./types";

/**
 * Umbral de lapso personal. Los 355 ms del PVT-B equivalen a ~1,45 veces la mediana de una persona
 * descansada típica (~245 ms); se aplica la misma proporción a la mediana propia, sin bajar de 355 ms.
 * Así una persona naturalmente lenta no acumula "lapsos" por responder a su ritmo normal.
 */
export const FACTOR_LAPSO = 1.45;
export const lapsoPersonal = (medianaRt: number, lapsoMs: number) => Math.max(lapsoMs, Math.round(medianaRt * FACTOR_LAPSO));

/** Lapsos (con el umbral dado) + omisiones + falsos inicios. */
export const fallasCon = (p: PvtResultado, lapso: number) => p.rts.filter((rt) => rt >= lapso).length + p.timeouts + p.falsos;

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

function variacion(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  return m > 0 ? sd / m : 0;
}

export function esReferencia(e: Evaluacion): boolean {
  const p = e.pvt;
  const r = e.respuestas;
  if (!p || p.validos < 15 || p.categoria === "baja") return false;
  if (r.kss > 5 || r.alcohol || r.medicamento || !r.enCondiciones) return false;
  if (!e.sueno.ok24 || !e.sueno.ok48) return false;
  const dim = (c: string) => e.dimensiones.find((d) => d.clave === c)?.nivel;
  if (e.lineaBase && (dim("pvt") ?? 0) >= 1) return false;
  if (dim("rostro") === 2) return false;
  return true;
}

/** Evaluaciones que forman la referencia de un DNI (más recientes primero). */
export function sesionesReferencia(historial: Evaluacion[], dni: string, desde = 0): Evaluacion[] {
  return historial
    .filter((e) => e.trabajador.dni === dni && e.fecha > desde && esReferencia(e))
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, REFERENCIA.maximo);
}

export function lineaBase(historial: Evaluacion[], dni: string, desde = 0): LineaBase | null {
  const ok = sesionesReferencia(historial, dni, desde);
  if (ok.length < REFERENCIA.minimo) return null;
  const pvts = ok.map((e) => e.pvt!);
  const medianaRt = mediana(pvts.map((p) => p.medianaRt));
  const lapso = lapsoPersonal(medianaRt, pvts[0].lapsoMs || 355);
  const caras = ok.map((e) => e.rostro).filter((r): r is RostroResumen => !!r && r.calidad !== "insuficiente");
  const deCara = (f: (r: RostroResumen) => number) => (caras.length >= REFERENCIA.minimo ? mediana(caras.map(f)) : null);
  return {
    sesiones: ok.length,
    desde: Math.min(...ok.map((e) => e.fecha)),
    velocidad: mediana(pvts.map((p) => p.velocidad)),
    cvVelocidad: variacion(pvts.map((p) => p.velocidad)),
    medianaRt,
    mediaRt: mediana(pvts.map((p) => p.mediaRt)),
    lapsoPersonal: lapso,
    tasaFallas: mediana(pvts.map((p) => fallasCon(p, lapso) / Math.max(0.5, p.duracionS / 60))),
    perclos: deCara((r) => r.perclos),
    duracionParpadeoMs: deCara((r) => r.duracionParpadeoMs),
    aperturaOjos: deCara((r) => r.aperturaOjos),
  };
}

/** Caída de velocidad a partir de la cual se marca ámbar / rojo para esta persona. */
export function cortesPersonales(lb: LineaBase, u: { pvtCaidaVelocidad: number; pvtCaidaVelocidadRojo: number }) {
  return {
    ambar: Math.max(u.pvtCaidaVelocidad, 2 * lb.cvVelocidad),
    rojo: Math.max(u.pvtCaidaVelocidadRojo, 3 * lb.cvVelocidad),
  };
}

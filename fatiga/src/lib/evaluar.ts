// Arma la evaluación completa a partir de lo medido.
import { dimDeclaraciones, dimKss, dimModelo, dimPvt, dimRostro, dimSueno, nivelFinal, recomendaciones } from "./decision";
import { lineaBase, sesionesReferencia } from "./referencia";
import { construirSuenos, dawson } from "./sueno";
import { predecir } from "./tpm";
import type { Ajustes, Evaluacion, PvtResultado, Respuestas, RostroResumen, Trabajador, Turno } from "./types";

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function evaluar(e: {
  trabajador: Trabajador;
  turno: Turno;
  respuestas: Respuestas;
  pvt: PvtResultado | null;
  rostro: RostroResumen | null;
  historial: Evaluacion[];
  ajustes: Ajustes;
  /** Fecha desde la que vale la referencia de este DNI (si el supervisor la reinició). */
  referenciaDesde?: number;
  ahora?: number;
}): Evaluacion {
  const ahora = e.ahora ?? Date.now();
  const u = e.ajustes.umbrales;
  const sueno = dawson(e.respuestas, ahora, e.turno.inicio, e.turno.fin, u);
  const modelo = predecir(construirSuenos(e.respuestas, ahora), Math.max(ahora, e.turno.inicio), e.turno.fin);
  const lb = lineaBase(e.historial, e.trabajador.dni, e.referenciaDesde ?? 0);
  const sesionesRef = sesionesReferencia(e.historial, e.trabajador.dni, e.referenciaDesde ?? 0).length;
  const dimensiones = [
    dimSueno(sueno, u),
    dimKss(e.respuestas.kss, u),
    dimPvt(e.pvt, u, lb, sesionesRef),
    dimRostro(e.rostro, u, lb),
    dimModelo(modelo, u),
    dimDeclaraciones(e.respuestas),
  ];
  const nivel = nivelFinal(dimensiones);
  return {
    id: uid(),
    fecha: ahora,
    trabajador: e.trabajador,
    turno: e.turno,
    respuestas: e.respuestas,
    sueno,
    modelo,
    pvt: e.pvt,
    rostro: e.rostro,
    lineaBase: lb,
    dimensiones,
    nivel,
    recomendaciones: recomendaciones(nivel, dimensiones, { sueno, modelo, respuestas: e.respuestas, tareaCritica: e.turno.tareaCritica }),
    sincronizado: false,
    dispositivo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : "",
  };
}

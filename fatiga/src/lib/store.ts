// Persistencia local (este celular). Solo se guardan resultados numéricos, nunca imágenes.
import { AJUSTES_INICIALES, LS } from "@/config";
import type { Ajustes, Evaluacion, Trabajador } from "./types";

const MAX_HISTORIAL = 300;

function leer<T>(clave: string, defecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
}

function escribir(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function cargarAjustes(): Ajustes {
  const a = leer<Partial<Ajustes>>(LS.ajustes, {});
  return { ...AJUSTES_INICIALES, ...a, umbrales: { ...AJUSTES_INICIALES.umbrales, ...(a.umbrales || {}) } };
}

export const guardarAjustes = (a: Ajustes) => escribir(LS.ajustes, a);

export const cargarHistorial = (): Evaluacion[] => leer<Evaluacion[]>(LS.historial, []);

export function guardarHistorial(h: Evaluacion[]): Evaluacion[] {
  let lista = h.slice(0, MAX_HISTORIAL);
  // Si el almacenamiento se llena, se aligeran las evaluaciones más antiguas ya sincronizadas.
  while (!escribir(LS.historial, lista) && lista.length > 20) {
    lista = lista.slice(0, Math.floor(lista.length * 0.8));
  }
  return lista;
}

export function agregarEvaluacion(e: Evaluacion): Evaluacion[] {
  return guardarHistorial([e, ...cargarHistorial().filter((x) => x.id !== e.id)]);
}

export function marcarSincronizadas(ids: string[]): Evaluacion[] {
  const s = new Set(ids);
  return guardarHistorial(cargarHistorial().map((e) => (s.has(e.id) ? { ...e, sincronizado: true } : e)));
}

export const borrarHistorial = () => guardarHistorial([]);

/** Reinicios de referencia personal por DNI (fecha desde la que se vuelve a construir). */
export const cargarReinicios = (): Record<string, number> => leer<Record<string, number>>(LS.reinicios, {});
export function reiniciarReferencia(dni: string): Record<string, number> {
  const r = { ...cargarReinicios(), [dni]: Date.now() };
  escribir(LS.reinicios, r);
  return r;
}

export const cargarUltimoTrabajador = (): Trabajador | null => leer<Trabajador | null>(LS.ultimoTrabajador, null);
export const guardarUltimoTrabajador = (t: Trabajador) => escribir(LS.ultimoTrabajador, t);

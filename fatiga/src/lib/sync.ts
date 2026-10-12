// Envío de evaluaciones a Google Sheets mediante el Apps Script incluido (apps-script/Code.gs).
// Si no hay internet, quedan pendientes en el celular y se reintentan al volver la conexión.
import { plano } from "./export";
import { cargarHistorial, marcarSincronizadas } from "./store";
import type { Evaluacion } from "./types";

export async function enviar(url: string, evs: Evaluacion[]): Promise<number> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita el preflight CORS de Apps Script
    body: JSON.stringify({ registros: evs.map(plano) }),
  });
  const txt = await r.text();
  let res: { ok?: boolean; error?: string; agregadas?: number };
  try {
    res = JSON.parse(txt);
  } catch {
    throw new Error(`Apps Script no devolvió JSON (HTTP ${r.status}). Revisa que el acceso sea "Cualquier usuario".`);
  }
  if (!res.ok) throw new Error(res.error || "Error en Apps Script");
  return res.agregadas ?? evs.length;
}

let enCurso: Promise<{ enviadas: number; error?: string }> | null = null;

/** Envía todo lo pendiente. Devuelve cuántas se enviaron y el error, si hubo. */
export function sincronizarPendientes(url: string): Promise<{ enviadas: number; error?: string }> {
  if (!url || (typeof navigator !== "undefined" && !navigator.onLine)) return Promise.resolve({ enviadas: 0 });
  enCurso ??= (async () => {
    const pendientes = cargarHistorial().filter((e) => !e.sincronizado);
    if (!pendientes.length) return { enviadas: 0 };
    try {
      await enviar(url, pendientes);
      marcarSincronizadas(pendientes.map((e) => e.id));
      return { enviadas: pendientes.length };
    } catch (e) {
      return { enviadas: 0, error: e instanceof Error ? e.message : String(e) };
    }
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

// Registro plano (una fila por evaluación) para CSV, Google Sheets y mensajes al supervisor.
import { NIVELES, VERSION } from "@/config";
import { horaTexto } from "./decision";
import type { Evaluacion } from "./types";

const r1 = (x: number | undefined | null) => (x === undefined || x === null || Number.isNaN(x) ? "" : Math.round(x * 10) / 10);
const r3 = (x: number | undefined | null) => (x === undefined || x === null || Number.isNaN(x) ? "" : Math.round(x * 1000) / 1000);
const fecha = (t: number) => new Date(t).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
const NIVEL_DIM = ["Verde", "Ámbar", "Rojo"];

export function plano(e: Evaluacion): Record<string, string | number> {
  const d = (c: string) => e.dimensiones.find((x) => x.clave === c);
  const nd = (c: string) => {
    const n = d(c)?.nivel;
    return n === null || n === undefined ? "No evaluado" : NIVEL_DIM[n];
  };
  return {
    ID: e.id,
    Fecha: fecha(e.fecha),
    Hora: horaTexto(e.fecha),
    Trabajador: e.trabajador.nombre,
    DNI: e.trabajador.dni,
    Empresa: e.trabajador.empresa,
    Cargo: e.trabajador.cargo,
    Área: e.trabajador.area,
    "Inicio turno": `${fecha(e.turno.inicio)} ${horaTexto(e.turno.inicio)}`,
    "Fin turno": `${fecha(e.turno.fin)} ${horaTexto(e.turno.fin)}`,
    "Tarea crítica": e.turno.tareaCritica ? "SI" : "NO",
    Resultado: NIVELES[e.nivel].corto,
    Dictamen: NIVELES[e.nivel].nombre,
    "Sueño 24 h": r1(e.sueno.sueno24),
    "Sueño 48 h": r1(e.sueno.sueno48),
    "Vigilia al fin del turno (h)": r1(e.sueno.vigiliaFin),
    "Sueño previo": nd("sueno"),
    KSS: e.respuestas.kss,
    "KSS previsto ahora": r1(e.modelo.kssAhora),
    "KSS previsto fin": r1(e.modelo.kssFin),
    "KSS previsto máx": r1(e.modelo.kssMax),
    "Hora de menor alerta": horaTexto(e.modelo.horaMax),
    "PVT mediana (ms)": e.pvt ? Math.round(e.pvt.medianaRt) : "",
    "PVT media (ms)": e.pvt ? Math.round(e.pvt.mediaRt) : "",
    "PVT velocidad 1/RT": r3(e.pvt?.velocidad),
    "PVT 10% lento 1/RT": r3(e.pvt?.lentos10),
    "PVT lapsos": e.pvt?.lapsos ?? "",
    "PVT falsos inicios": e.pvt?.falsos ?? "",
    "PVT estímulos": e.pvt?.validos ?? "",
    "PVT puntaje": r3(e.pvt?.puntaje),
    "PVT duración (s)": e.pvt ? Math.round(e.pvt.duracionS) : "",
    "PVT modo": e.pvt ? (e.pvt.adaptativo ? "adaptativo" : "fijo") : "",
    "PVT desempeño": e.pvt?.categoria ?? "",
    "Referencia personal (evaluaciones)": e.lineaBase?.sesiones ?? 0,
    "Mediana habitual (ms)": e.lineaBase ? Math.round(e.lineaBase.medianaRt) : "",
    "Velocidad vs. referencia %": e.pvt && e.lineaBase ? r1((e.pvt.velocidad / e.lineaBase.velocidad - 1) * 100) : "",
    PVT: nd("pvt"),
    "PERCLOS %": e.rostro ? r1(e.rostro.perclos * 100) : "",
    "Parpadeos/min": r1(e.rostro?.parpadeosMin),
    "Duración parpadeo (ms)": e.rostro ? Math.round(e.rostro.duracionParpadeoMs) : "",
    "Cierres ≥0,5 s": e.rostro?.cierresLargos ?? "",
    "Cierres ≥1 s": e.rostro?.microsuenos ?? "",
    Bostezos: e.rostro?.bostezos ?? "",
    Cabeceos: e.rostro?.cabeceos ?? "",
    "Calidad rostro": e.rostro?.calidad ?? "sin cámara",
    Rostro: nd("rostro"),
    Alcohol: e.respuestas.alcohol ? "SI" : "NO",
    "Medicamento con sueño": e.respuestas.medicamento ? "SI" : "NO",
    "En condiciones": e.respuestas.enCondiciones ? "SI" : "NO",
    Recomendaciones: e.recomendaciones.join(" | "),
    Versión: VERSION,
  };
}

function descargar(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function exportarCsv(evs: Evaluacion[]) {
  if (!evs.length) return;
  const filas = evs.map(plano);
  const cols = Object.keys(filas[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const txt = [cols.join(";"), ...filas.map((f) => cols.map((c) => esc(f[c])).join(";"))].join("\r\n");
  const sello = new Date().toISOString().slice(0, 10);
  descargar(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }), `evaluaciones_fatiga_${sello}.csv`);
}

/** Texto para compartir con el supervisor (WhatsApp, correo…). */
export function textoCompartir(e: Evaluacion): string {
  const icono = ["🟢", "🟡", "🔴"];
  const lineas = [
    `*Test de Fatiga* ${icono[e.nivel]} ${NIVELES[e.nivel].nombre}`,
    `${e.trabajador.nombre} (DNI ${e.trabajador.dni})${e.trabajador.empresa ? ` · ${e.trabajador.empresa}` : ""}`,
    `${fecha(e.fecha)} ${horaTexto(e.fecha)} · Turno ${horaTexto(e.turno.inicio)}–${horaTexto(e.turno.fin)}${e.turno.tareaCritica ? " · tarea crítica" : ""}`,
    "",
    ...e.dimensiones.map((d) => `${d.nivel === null ? "⚪" : icono[d.nivel]} ${d.titulo}: ${d.valor}`),
    "",
    ...e.recomendaciones.map((r) => `• ${r}`),
  ];
  return lineas.join("\n");
}

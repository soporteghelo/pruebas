// Señales sintéticas a 30 cuadros/s para verificar la detección de parpadeos, cierres,
// bostezos, cabeceos y PERCLOS sin cámara.
import { describe, expect, it } from "vitest";
import { AnalizadorRostro } from "../src/lib/face/analyzer";
import { angulos, ear } from "../src/lib/face/features";
import type { Muestra } from "../src/lib/face/features";

const FPS = 30;
const EAR_ABIERTO = 0.3;

interface Evento {
  inicio: number; // s
  dur: number; // s
  tipo: "ojo" | "bostezo" | "cabeceo" | "postura" | "habla";
  valor?: number;
}

/** Cierre 0-1 con flancos de 60 ms, como un parpadeo real. */
function cierreEn(t: number, evs: Evento[]): number {
  let c = 0;
  for (const e of evs.filter((x) => x.tipo === "ojo")) {
    const a = e.inicio;
    const b = e.inicio + e.dur;
    const f = 0.06;
    if (t >= a - f && t <= b + f) c = Math.max(c, t < a ? (t - (a - f)) / f : t > b ? 1 - (t - b) / f : 1);
  }
  return c;
}

function generar(segundos: number, evs: Evento[], t0 = 0): Muestra[] {
  const out: Muestra[] = [];
  for (let i = 0; i < segundos * FPS; i++) {
    const s = i / FPS;
    const c = cierreEn(s, evs);
    let jaw = 0.03;
    let pitch = -10;
    for (const e of evs) {
      const dentro = s >= e.inicio && s < e.inicio + e.dur;
      if (!dentro) continue;
      if (e.tipo === "bostezo" || e.tipo === "habla") jaw = e.valor ?? 0.7;
      if (e.tipo === "cabeceo" || e.tipo === "postura") pitch += e.valor ?? 25;
    }
    out.push({
      t: t0 + s * 1000,
      rostro: true,
      ear: EAR_ABIERTO * (1 - 0.8 * c),
      parpadeo: 0.08 + 0.75 * c,
      mandibula: jaw,
      pitch,
      yaw: 2,
      tamano: 0.2,
      luz: 120,
    });
  }
  return out;
}

function preparado(): AnalizadorRostro {
  const a = new AnalizadorRostro();
  // Calibración de 7 s con dos parpadeos normales.
  for (const m of generar(7, [{ inicio: 2, dur: 0.12, tipo: "ojo" }, { inicio: 5, dur: 0.12, tipo: "ojo" }])) a.calibrar(m);
  expect(a.terminarCalibracion()).toBe(true);
  return a;
}

describe("rasgos geométricos", () => {
  it("EAR de un ojo abierto y cerrado", () => {
    const pts: { x: number; y: number }[] = [];
    const ojo = (alto: number) => {
      pts[33] = { x: 0, y: 0 };
      pts[133] = { x: 10, y: 0 };
      pts[160] = { x: 3, y: -alto };
      pts[158] = { x: 7, y: -alto };
      pts[144] = { x: 3, y: alto };
      pts[153] = { x: 7, y: alto };
      return ear(pts, [33, 160, 158, 133, 153, 144]);
    };
    expect(ojo(1.5)).toBeCloseTo(0.3, 6);
    expect(ojo(0.25)).toBeCloseTo(0.05, 6);
  });
  it("ángulos desde una matriz por columnas", () => {
    const a = (20 * Math.PI) / 180;
    // Rotación en X de 20°, almacenada por columnas.
    const m = [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
    const r = angulos(m);
    expect(r.pitch).toBeCloseTo(20, 4);
    expect(r.yaw).toBeCloseTo(0, 4);
  });
});

describe("analizador de fatiga facial", () => {
  it("persona alerta: parpadeos normales, PERCLOS bajo, sin eventos", () => {
    const a = preparado();
    const evs: Evento[] = Array.from({ length: 15 }, (_, i) => ({ inicio: 1 + i * 4, dur: 0.12, tipo: "ojo" as const }));
    for (const m of generar(62, evs, 10_000)) a.agregar(m);
    const r = a.resumen();
    expect(r.calidad).toBe("buena");
    expect(r.parpadeosMin).toBeGreaterThan(13);
    expect(r.parpadeosMin).toBeLessThan(16);
    expect(r.duracionParpadeoMs).toBeGreaterThan(120);
    expect(r.duracionParpadeoMs).toBeLessThan(220);
    expect(r.cierresLargos + r.microsuenos + r.bostezos + r.cabeceos).toBe(0);
    expect(r.perclos).toBeLessThan(0.05);
  });

  it("persona somnolienta: cierres largos, microsueño, bostezo y cabeceo", () => {
    const a = preparado();
    const evs: Evento[] = [
      { inicio: 3, dur: 0.12, tipo: "ojo" },
      { inicio: 8, dur: 0.7, tipo: "ojo" }, // cierre largo
      { inicio: 14, dur: 0.8, tipo: "ojo" }, // cierre largo
      { inicio: 20, dur: 1.6, tipo: "ojo" }, // microsueño
      { inicio: 30, dur: 2.2, tipo: "bostezo", valor: 0.75 },
      { inicio: 31, dur: 0.6, tipo: "ojo" }, // ojos cerrados al bostezar: no suma
      { inicio: 42, dur: 0.8, tipo: "cabeceo", valor: 25 },
      { inicio: 42.1, dur: 0.3, tipo: "ojo" },
      { inicio: 50, dur: 0.3, tipo: "habla", valor: 0.6 }, // hablar no es bostezar
    ];
    for (const m of generar(60, evs, 10_000)) a.agregar(m);
    const r = a.resumen();
    expect(r.cierresLargos).toBe(2);
    expect(r.microsuenos).toBe(1);
    expect(r.bostezos).toBe(1);
    expect(r.cabeceos).toBe(1);
    expect(r.cabeceosOjosCerrados).toBe(1);
    // ~3.6 s con ojos ≥80 % cerrados en 60 s
    expect(r.perclos).toBeGreaterThan(0.05);
    expect(r.perclos).toBeLessThan(0.09);
  });

  it("un cambio de postura sostenido no es cabeceo", () => {
    const a = preparado();
    for (const m of generar(40, [{ inicio: 15, dur: 8, tipo: "postura", valor: 22 }], 10_000)) a.agregar(m);
    expect(a.resumen().cabeceos).toBe(0);
  });

  it("sin rostro visible el resultado es insuficiente", () => {
    const a = preparado();
    // El rostro desaparece a los 15 s: quedan menos de 20 s útiles.
    const ms = generar(40, [], 10_000).map((m) => (m.t >= 25_000 ? { t: m.t, rostro: false } : m));
    for (const m of ms) a.agregar(m);
    const r = a.resumen();
    expect(r.calidad).toBe("insuficiente");
  });

  it("mirar a un costado no cuenta como ojos cerrados", () => {
    const a = preparado();
    const ms = generar(40, [], 10_000).map((m) => (m.t > 20_000 && m.t < 26_000 ? { ...m, yaw: 45, ear: 0.08, parpadeo: 0.9 } : m));
    for (const m of ms) a.agregar(m);
    const r = a.resumen();
    expect(r.perclos).toBeLessThan(0.01);
    expect(r.microsuenos).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { AJUSTES_INICIALES } from "../src/config";
import { dimPvt } from "../src/lib/decision";
import { evaluar } from "../src/lib/evaluar";
import { calcularPvt, categoriaPorFallas, evaluarAdaptativo, PVT_BA } from "../src/lib/pvt";
import { lineaBase, sesionesReferencia } from "../src/lib/referencia";
import type { CategoriaPvt, Evaluacion, EventoPvt, Respuestas } from "../src/lib/types";

const u = AJUSTES_INICIALES.umbrales;

/** Generador pseudoaleatorio con semilla (resultados repetibles). */
function rng(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Simula una prueba de 3 min: cada estímulo es falla con probabilidad pFalla. */
function simular(pFalla: number, azar: () => number, rtBase = 260): EventoPvt[] {
  const ev: EventoPvt[] = [];
  let t = 1000 + azar() * 3000;
  while (t < 180_000) {
    const falla = azar() < pFalla;
    const rt = falla ? (azar() < 0.15 ? 60 : 380 + azar() * 500) : rtBase - 40 + azar() * 80;
    ev.push({ tipo: "respuesta", rt, t });
    t += rt + 1000 + azar() * 3000;
  }
  return ev;
}

/** Aplica la regla adaptativa como lo hace la app: revisa después de cada respuesta. */
function adaptativa(ev: EventoPvt[]): { categoria: CategoriaPvt; ms: number } {
  for (let i = 0; i < ev.length; i++) {
    const hasta = ev.slice(0, i + 1);
    const e = ev[i];
    const ms = e.t + (e.tipo === "respuesta" ? e.rt : 0);
    const d = evaluarAdaptativo(hasta, 0, 355).decision;
    if (d && ms >= PVT_BA.minimoMs) return { categoria: d, ms };
  }
  const fallas = ev.filter((e) => e.tipo !== "respuesta" || e.rt < 100 || e.rt >= 355).length;
  return { categoria: categoriaPorFallas(fallas, 180), ms: 180_000 };
}

describe("PVT adaptativo (PVT-BA)", () => {
  it("termina antes y coincide con la prueba completa de 3 min en la gran mayoría de casos", () => {
    const azar = rng(42);
    let iguales = 0;
    let total = 0;
    let duracion = 0;
    let cruzadas = 0; // alta ↔ baja: el error grave
    for (let i = 0; i < 600; i++) {
      const p = azar() * 0.4;
      const ev = simular(p, azar);
      const completa = calcularPvt(ev, { latenciaMs: 0, lapsoMs: 355, duracionS: 180 }).categoria;
      const a = adaptativa(ev);
      total++;
      duracion += a.ms;
      if (a.categoria === completa) iguales++;
      if ((a.categoria === "alta" && completa === "baja") || (a.categoria === "baja" && completa === "alta")) cruzadas++;
    }
    const acuerdo = iguales / total;
    const media = duracion / total / 1000;
    console.log(`acuerdo ${(acuerdo * 100).toFixed(1)} % · duración media ${media.toFixed(0)} s · cruzadas ${cruzadas}`);
    expect(acuerdo).toBeGreaterThan(0.85);
    expect(media).toBeLessThan(120); // la prueba completa dura 180 s
    expect(cruzadas).toBe(0);
  });

  it("una persona descansada termina en alrededor de un minuto y medio", () => {
    const azar = rng(7);
    const durs = Array.from({ length: 50 }, () => adaptativa(simular(0.02, azar)));
    expect(durs.every((d) => d.categoria === "alta")).toBe(true);
    const media = durs.reduce((a, d) => a + d.ms, 0) / durs.length / 1000;
    console.log(`descansado: duración media ${media.toFixed(0)} s`);
    expect(media).toBeGreaterThan(45);
    expect(media).toBeLessThan(110);
  });

  it("muchas fallas terminan pronto en desempeño bajo", () => {
    const r = adaptativa(simular(0.6, rng(3)));
    expect(r.categoria).toBe("baja");
    expect(r.ms).toBeLessThan(90_000);
  });
});

// ---------- Referencia personal ----------

const resp = (x: Partial<Respuestas> = {}): Respuestas => ({
  dormir: "22:00", despertar: "06:00", horasSuenoAnterior: 8, siestaMin: 0, calidad: "buena",
  kss: 3, alcohol: false, medicamento: false, enCondiciones: true, ...x,
});
const trabajador = { nombre: "Persona Lenta", dni: "45000001", empresa: "Demo", cargo: "Operador", area: "Mina" };
const dia = (d: number, h = 6) => new Date(2026, 9, d, h, 30).getTime();

function pvtCon(rtMedio: number, semilla: number) {
  const azar = rng(semilla);
  // Corregidos sin latencia; ~45 estímulos en ~110 s
  const ev: EventoPvt[] = Array.from({ length: 45 }, (_, i) => ({ tipo: "respuesta" as const, rt: rtMedio - 30 + azar() * 60, t: i * 2500 }));
  return calcularPvt(ev, { latenciaMs: 0, lapsoMs: 355, duracionS: 110, adaptativo: true });
}

function sesion(historial: Evaluacion[], d: number, rt: number, x: Partial<Respuestas> = {}): Evaluacion {
  return evaluar({
    trabajador,
    turno: { inicio: dia(d, 7), fin: dia(d, 19), tareaCritica: true },
    respuestas: resp(x),
    pvt: pvtCon(rt, d),
    rostro: null,
    historial,
    ajustes: AJUSTES_INICIALES,
    ahora: dia(d),
  });
}

describe("referencia personal", () => {
  it("se forma con 3 evaluaciones en buenas condiciones y descarta las que no califican", () => {
    let h: Evaluacion[] = [];
    h = [sesion(h, 1, 300), ...h];
    h = [sesion(h, 2, 305, { kss: 7 }), ...h]; // somnoliento: no cuenta
    h = [sesion(h, 3, 298, { alcohol: true }), ...h]; // no cuenta
    h = [sesion(h, 4, 302), ...h];
    expect(sesionesReferencia(h, trabajador.dni).length).toBe(2);
    expect(lineaBase(h, trabajador.dni)).toBeNull();
    h = [sesion(h, 5, 299), ...h];
    const lb = lineaBase(h, trabajador.dni)!;
    expect(lb.sesiones).toBe(3);
    expect(lb.medianaRt).toBeGreaterThan(285);
    expect(lb.medianaRt).toBeLessThan(315);
  });

  it("una persona naturalmente lenta queda en verde frente a su propia referencia", () => {
    // Mediana ~330 ms: con cortes generales tendría lapsos frecuentes; con su referencia es su normal.
    let h: Evaluacion[] = [];
    for (let d = 1; d <= 4; d++) h = [sesion(h, d, 330), ...h];
    const hoy = sesion(h, 5, 335);
    const pvt = hoy.dimensiones.find((x) => x.clave === "pvt")!;
    expect(hoy.lineaBase).not.toBeNull();
    expect(pvt.nivel).toBe(0);
    expect(pvt.detalle).toMatch(/referencia/);
  });

  it("una persona rápida que hoy está 25 % más lenta sale en rojo aunque su tiempo sea 'normal' para otros", () => {
    let h: Evaluacion[] = [];
    for (let d = 1; d <= 4; d++) h = [sesion(h, d, 220), ...h];
    const lb = lineaBase(h, trabajador.dni)!;
    const hoy = pvtCon(295, 99); // −25 % de velocidad, sin lapsos
    expect(dimPvt(hoy, u, lb, 4).nivel).toBe(2);
    const leve = pvtCon(250, 98); // ~−12 %
    expect(dimPvt(leve, u, lb, 4).nivel).toBe(1);
    expect(dimPvt(pvtCon(225, 97), u, lb, 4).nivel).toBe(0);
  });

  it("sin referencia usa los cortes generales del PVT-B", () => {
    const p = calcularPvt(
      Array.from({ length: 60 }, (_, i) => ({ tipo: "respuesta" as const, rt: i % 6 === 0 ? 420 : 260, t: i * 3000 })),
      { latenciaMs: 0, lapsoMs: 355, duracionS: 180 },
    );
    expect(p.categoria).toBe("media"); // 10 lapsos
    const d = dimPvt(p, u, null, 1);
    expect(d.nivel).toBe(1);
    expect(d.detalle).toMatch(/1 de 3/);
  });
});

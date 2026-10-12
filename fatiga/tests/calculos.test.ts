import { describe, expect, it } from "vitest";
import { AJUSTES_INICIALES } from "../src/config";
import { dimRostro, nivelFinal } from "../src/lib/decision";
import { evaluar } from "../src/lib/evaluar";
import { calcularPvt, nuevoIsi } from "../src/lib/pvt";
import { construirSuenos, dawson, ultimoSueno } from "../src/lib/sueno";
import { circadiano, kssEn, P, predecir, sDurmiendo } from "../src/lib/tpm";
import type { Dimension, EventoPvt, Respuestas, RostroResumen } from "../src/lib/types";

const H = 3_600_000;
const u = AJUSTES_INICIALES.umbrales;
// Fechas en hora local, igual que en la app.
const en = (dia: number, hora: number, min = 0) => new Date(2026, 9, dia, hora, min).getTime();

const resp = (x: Partial<Respuestas> = {}): Respuestas => ({
  dormir: "22:00",
  despertar: "06:00",
  horasSuenoAnterior: 8,
  siestaMin: 0,
  calidad: "buena",
  kss: 3,
  alcohol: false,
  medicamento: false,
  enCondiciones: true,
  ...x,
});

describe("PVT-B", () => {
  const opc = { latenciaMs: 0, lapsoMs: 355, duracionS: 180 };
  it("intervalo entre estímulos entre 1 y 4 s", () => {
    expect(nuevoIsi(() => 0)).toBe(1000);
    expect(nuevoIsi(() => 1)).toBe(4000);
  });
  it("calcula lapsos, falsos inicios, 1/RT y puntaje", () => {
    const ev: EventoPvt[] = [
      ...[250, 260, 270, 280, 290, 300, 310, 320].map((rt, i) => ({ tipo: "respuesta" as const, rt, t: i })),
      { tipo: "respuesta", rt: 400, t: 9 }, // lapso
      { tipo: "respuesta", rt: 80, t: 10 }, // falso inicio (<100 ms)
      { tipo: "anticipacion", t: 11 }, // falso inicio
      { tipo: "timeout", t: 12 }, // lapso
    ];
    const r = calcularPvt(ev, opc);
    expect(r.validos).toBe(10);
    expect(r.lapsos).toBe(2);
    expect(r.falsos).toBe(2);
    expect(r.timeouts).toBe(1);
    expect(r.medianaRt).toBe(290);
    expect(r.puntaje).toBeCloseTo(1 - 4 / 12, 6);
    // El 10 % más lento (1 valor) es la omisión de 30 s: 1/30 s⁻¹.
    expect(r.lentos10).toBeCloseTo(1 / 30, 6);
    expect(r.velocidad).toBeGreaterThan(2.5);
  });
  it("resta la latencia táctil antes de clasificar", () => {
    const ev: EventoPvt[] = [{ tipo: "respuesta", rt: 400, t: 0 }, { tipo: "respuesta", rt: 160, t: 1 }];
    const r = calcularPvt(ev, { ...opc, latenciaMs: 70 });
    expect(r.lapsos).toBe(0); // 330 ms corregido
    expect(r.falsos).toBe(1); // 90 ms corregido
    expect(r.rts).toEqual([330]);
  });
});

describe("modelo de tres procesos (parámetros FIPS)", () => {
  it("usa la recuperación lineal hasta el quiebre y luego exponencial", () => {
    expect(P.g).toBeCloseTo(-0.3813, 3);
    const quiebre = (P.bl - 7.96) / (P.g * (P.bl - P.ha));
    expect(sDurmiendo(7.96, quiebre)).toBeCloseTo(P.bl, 6);
    expect(sDurmiendo(7.96, 8)).toBeGreaterThan(13);
    expect(sDurmiendo(7.96, 8)).toBeLessThan(P.ha);
  });
  it("el ritmo circadiano es máximo a las 16:48", () => {
    expect(circadiano(16.8)).toBeCloseTo(2.5, 6);
    expect(circadiano(4.8)).toBeCloseTo(-2.5, 6);
  });
  it("da KSS bajo de mañana tras dormir bien y alto de madrugada sin dormir", () => {
    const r = resp();
    const suenos = construirSuenos(r, en(12, 7));
    const manana = kssEn(suenos, en(12, 9)).kss;
    const madrugada = kssEn(suenos, en(13, 4)).kss; // 22 h despierto
    expect(manana).toBeGreaterThan(2.5);
    expect(manana).toBeLessThan(5);
    expect(madrugada).toBeGreaterThan(7);
    expect(madrugada).toBeLessThanOrEqual(9);
  });
  it("predice la curva del turno y su peor momento", () => {
    const suenos = construirSuenos(resp(), en(12, 18));
    const p = predecir(suenos, en(12, 19), en(13, 7));
    expect(p.curva.length).toBeGreaterThan(70);
    expect(new Date(p.horaMax).getHours()).toBeGreaterThanOrEqual(4);
    expect(new Date(p.horaMax).getHours()).toBeLessThanOrEqual(7);
  });
});

describe("sueño previo (Dawson)", () => {
  it("ubica el último sueño aunque cruce la medianoche", () => {
    const s = ultimoSueno({ dormir: "23:30", despertar: "05:00" }, en(12, 6));
    expect(s.fin).toBe(en(12, 5));
    expect(s.inicio).toBe(en(11, 23, 30));
  });
  it("cumple con buen descanso y turno de día", () => {
    const d = dawson(resp(), en(12, 6, 30), en(12, 7), en(12, 19), u);
    expect(d.sueno24).toBeCloseTo(8, 6);
    expect(d.sueno48).toBeCloseTo(16, 6);
    expect(d.ok24 && d.ok48 && d.okVigilia).toBe(true);
  });
  it("detecta poco sueño y vigilia larga en turno de noche", () => {
    const r = resp({ dormir: "01:00", despertar: "05:00", horasSuenoAnterior: 6 });
    const d = dawson(r, en(12, 18), en(12, 19), en(13, 7), u);
    expect(d.sueno24).toBeCloseTo(4, 6);
    expect(d.ok24).toBe(false);
    expect(d.ok48).toBe(false); // 10 h
    expect(d.vigiliaFin).toBeCloseTo(26, 6);
    expect(d.okVigilia).toBe(false);
  });
  it("suma las siestas", () => {
    const r = resp({ dormir: "01:00", despertar: "05:00", siestaMin: 90 });
    expect(dawson(r, en(12, 6), en(12, 7), en(12, 19), u).sueno24).toBeCloseTo(5.5, 6);
  });
});

describe("semáforo", () => {
  const dim = (clave: Dimension["clave"], nivel: 0 | 1 | 2 | null): Dimension => ({ clave, titulo: "", nivel, valor: "", detalle: "" });
  it("dos ámbar en dimensiones medidas suben a rojo; el modelo no escala", () => {
    expect(nivelFinal([dim("sueno", 1), dim("kss", 0), dim("pvt", 0)])).toBe(1);
    expect(nivelFinal([dim("sueno", 1), dim("pvt", 1)])).toBe(2);
    expect(nivelFinal([dim("sueno", 1), dim("modelo", 1)])).toBe(1);
    expect(nivelFinal([dim("declaraciones", 2), dim("kss", 0)])).toBe(2);
    expect(nivelFinal([dim("rostro", null), dim("pvt", 0)])).toBe(0);
  });
  it("el rostro con calidad insuficiente no penaliza", () => {
    const r: RostroResumen = {
      segundosValidos: 8, segundosTotales: 60, fps: 20, perclos: 0.5, parpadeosMin: 10, duracionParpadeoMs: 150,
      cierresLargos: 3, microsuenos: 3, bostezos: 0, cabeceos: 0, cabeceosOjosCerrados: 0, aperturaOjos: 0.3, luz: 120,
      calidad: "insuficiente", avisos: ["poco rostro"],
    };
    expect(dimRostro(r, u, null).nivel).toBeNull();
    expect(dimRostro({ ...r, calidad: "buena" }, u, null).nivel).toBe(2);
  });
  it("evaluación completa: trabajador descansado sale en verde", () => {
    const ev = evaluar({
      trabajador: { nombre: "Ana Quispe", dni: "40112233", empresa: "Contratista", cargo: "Operadora", area: "Mina" },
      turno: { inicio: en(12, 7), fin: en(12, 19), tareaCritica: true },
      respuestas: resp(),
      pvt: calcularPvt(Array.from({ length: 50 }, (_, i) => ({ tipo: "respuesta" as const, rt: 300 + (i % 5) * 5, t: i })), { latenciaMs: 70, lapsoMs: 355, duracionS: 180 }),
      rostro: null,
      historial: [],
      ajustes: AJUSTES_INICIALES,
      ahora: en(12, 6, 40),
    });
    expect(ev.nivel).toBe(0);
    expect(ev.dimensiones.find((d) => d.clave === "rostro")?.nivel).toBeNull();
  });
  it("evaluación completa: poco sueño y KSS 8 sale en rojo", () => {
    const ev = evaluar({
      trabajador: { nombre: "Luis Rojas", dni: "41223344", empresa: "Contratista", cargo: "Conductor", area: "Transporte" },
      turno: { inicio: en(12, 19), fin: en(13, 7), tareaCritica: true },
      respuestas: resp({ dormir: "02:00", despertar: "06:00", horasSuenoAnterior: 5, kss: 8 }),
      pvt: null,
      rostro: null,
      historial: [],
      ajustes: AJUSTES_INICIALES,
      ahora: en(12, 18, 30),
    });
    expect(ev.nivel).toBe(2);
    expect(ev.recomendaciones[0]).toMatch(/No inicies/);
  });
});

describe("referencia de horas", () => {
  it("construye 5 sueños: último, anterior y 3 días habituales", () => {
    const s = construirSuenos(resp(), en(12, 7));
    expect(s.length).toBe(5);
    expect(s[s.length - 1].fin).toBe(en(12, 6));
    expect((s[s.length - 2].fin - s[s.length - 2].inicio) / H).toBe(8);
  });
});

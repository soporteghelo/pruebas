// Modelo de tres procesos de la alerta (Åkerstedt y Folkard), con los parámetros y la
// ecuación de KSS que usa el paquete FIPS (Wilson et al.; parametrización de Ingre et al., 2014).
//   S: proceso homeostático (baja despierto, se recupera durmiendo)
//   C: ritmo circadiano de 24 h; U: componente de 12 h; W: inercia del sueño al despertar
//   KSS = 10.6 − 0.6 · (S + C + U + W)
import type { Intervalo, PuntoKss, TpmResultado } from "./types";

export const P = {
  la: 2.4, // asíntota inferior de S
  ha: 14.3, // asíntota superior de S
  d: -0.0353, // tasa de descenso de S despierto (1/h)
  g: Math.log((14.3 - 14) / (14.3 - 7.96)) / 8, // tasa de recuperación durmiendo (≈ −0.381)
  bl: 12.2, // punto de quiebre: bajo él la recuperación es lineal
  Cm: 0,
  Ca: 2.5,
  p: 16.8, // hora del pico circadiano
  Um: -0.5,
  Ua: 0.5,
  Wc: -5.72,
  Wd: -1.51,
  S0: 7.96,
  kssIntercepto: 10.6,
  kssBeta: -0.6,
};

const H = 3_600_000;

/** S despierto, taw = horas desde el despertar, sw = S al despertar. */
export const sDespierto = (sw: number, taw: number) => P.la + (sw - P.la) * Math.exp(P.d * taw);

/** S durmiendo, tas = horas desde que se durmió, ss = S al dormirse. */
export function sDurmiendo(ss: number, tas: number): number {
  const quiebre = (P.bl - ss) / (P.g * (P.bl - P.ha));
  if (tas <= quiebre) return ss + tas * (P.g * (P.bl - P.ha));
  return P.ha - (P.ha - P.bl) * Math.exp(P.g * (tas - quiebre));
}

export const circadiano = (hora: number) => P.Cm + P.Ca * Math.cos(((2 * Math.PI) / 24) * (hora - P.p));
export const ultradiano = (hora: number) => P.Um + P.Ua * Math.cos(((2 * Math.PI) / 12) * (hora - P.p - 3));
export const inercia = (taw: number) => P.Wc * Math.exp(P.Wd * taw);

/** Hora local del día en horas decimales. */
export function horaDelDia(t: number): number {
  const d = new Date(t);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Une sueños que se superponen y los ordena. */
export function normalizarSuenos(suenos: Intervalo[]): Intervalo[] {
  const o = suenos.filter((s) => s.fin > s.inicio).sort((a, b) => a.inicio - b.inicio);
  const r: Intervalo[] = [];
  for (const s of o) {
    const u = r[r.length - 1];
    if (u && s.inicio <= u.fin) u.fin = Math.max(u.fin, s.fin);
    else r.push({ ...s });
  }
  return r;
}

/**
 * Valor de S, W y estado en el instante t. La simulación arranca al inicio del primer sueño
 * con S = S0 (como FIPS); con varios días previos el valor inicial deja de influir.
 */
export function estadoEn(suenos: Intervalo[], t: number): { s: number; w: number; despierto: boolean } {
  const ss = normalizarSuenos(suenos);
  if (!ss.length || t < ss[0].inicio) return { s: P.S0, w: 0, despierto: true };
  let sAlDormir = P.S0;
  for (let i = 0; i < ss.length; i++) {
    const { inicio, fin } = ss[i];
    if (t < fin) return { s: sDurmiendo(sAlDormir, (t - inicio) / H), w: 0, despierto: false };
    const sAlDespertar = sDurmiendo(sAlDormir, (fin - inicio) / H);
    const siguiente = ss[i + 1]?.inicio ?? Infinity;
    if (t < siguiente) {
      const taw = (t - fin) / H;
      return { s: sDespierto(sAlDespertar, taw), w: inercia(taw), despierto: true };
    }
    sAlDormir = sDespierto(sAlDespertar, (siguiente - fin) / H);
  }
  return { s: P.S0, w: 0, despierto: true };
}

export function kssEn(suenos: Intervalo[], t: number): PuntoKss {
  const { s, w, despierto } = estadoEn(suenos, t);
  const hora = horaDelDia(t);
  const alerta = s + circadiano(hora) + ultradiano(hora) + w;
  const kss = P.kssIntercepto + P.kssBeta * alerta;
  return { t, kss: Math.min(9, Math.max(1, kss)), despierto };
}

/** Predicción de KSS desde ahora hasta el final del turno, cada 10 minutos. */
export function predecir(suenos: Intervalo[], ahora: number, finTurno: number): TpmResultado {
  const fin = Math.max(finTurno, ahora);
  const curva: PuntoKss[] = [];
  const paso = 10 * 60_000;
  for (let t = ahora; t < fin; t += paso) curva.push(kssEn(suenos, t));
  curva.push(kssEn(suenos, fin));
  const max = curva.reduce((m, p) => (p.kss > m.kss ? p : m), curva[0]);
  return { kssAhora: curva[0].kss, kssFin: curva[curva.length - 1].kss, kssMax: max.kss, horaMax: max.t, curva };
}

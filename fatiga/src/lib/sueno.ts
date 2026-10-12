// Historial de sueño a partir de las respuestas y modelo previo de sueño-vigilia
// (Dawson y McCulloch, 2005): al terminar el turno, una persona debería haber dormido
//   ≥5 h en las últimas 24 h, ≥12 h en las últimas 48 h, y
//   no estar más horas despierta que las que durmió en las últimas 48 h.
import type { DawsonResultado, Intervalo, Respuestas, Umbrales } from "./types";

const H = 3_600_000;
/** Sueño supuesto para los días previos a las 48 h que informa el trabajador. */
const SUENO_HABITUAL_H = 7.5;
const DIAS_PREVIOS = 3;

/** Último instante con la hora "HH:MM" que no sea posterior a `limite`. */
export function ultimaHora(hhmm: string, limite: number): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(limite);
  d.setHours(h || 0, m || 0, 0, 0);
  let t = d.getTime();
  if (t > limite) t -= 24 * H;
  return t;
}

/** Sueño principal más reciente: termina en la última "despertar" antes de ahora. */
export function ultimoSueno(r: Pick<Respuestas, "dormir" | "despertar">, ahora: number): Intervalo {
  const fin = ultimaHora(r.despertar, ahora);
  const inicio = ultimaHora(r.dormir, fin - 60_000);
  return { inicio, fin };
}

export const horas = (i: Intervalo) => (i.fin - i.inicio) / H;

/**
 * Sueños para el modelo: el último sueño (horas exactas), el anterior (misma hora de despertar
 * un día antes, con la duración informada) y tres días previos de sueño habitual.
 */
export function construirSuenos(r: Respuestas, ahora: number): Intervalo[] {
  const ultimo = ultimoSueno(r, ahora);
  const suenos: Intervalo[] = [ultimo];
  const finAnterior = ultimo.fin - 24 * H;
  if (r.horasSuenoAnterior > 0) suenos.push({ inicio: finAnterior - r.horasSuenoAnterior * H, fin: finAnterior });
  for (let d = 2; d < 2 + DIAS_PREVIOS; d++) {
    const fin = ultimo.fin - d * 24 * H;
    suenos.push({ inicio: fin - SUENO_HABITUAL_H * H, fin });
  }
  return suenos.sort((a, b) => a.inicio - b.inicio);
}

function solape(i: Intervalo, desde: number, hasta: number): number {
  return Math.max(0, Math.min(i.fin, hasta) - Math.max(i.inicio, desde)) / H;
}

/**
 * Evaluación de Dawson. El sueño se cuenta hacia atrás desde `referencia` (inicio del turno o
 * ahora, lo que sea más tarde). Las siestas suman al sueño; no reinician las horas de vigilia.
 */
export function dawson(r: Respuestas, ahora: number, inicioTurno: number, finTurno: number, u: Pick<Umbrales, "sueno24" | "sueno48">): DawsonResultado {
  const ref = Math.max(ahora, inicioTurno);
  const ultimo = ultimoSueno(r, ahora);
  const informados: Intervalo[] = [ultimo];
  if (r.horasSuenoAnterior > 0) {
    const fin = ultimo.fin - 24 * H;
    informados.push({ inicio: fin - r.horasSuenoAnterior * H, fin });
  }
  const siesta = (r.siestaMin || 0) / 60;
  const sueno24 = informados.reduce((a, i) => a + solape(i, ref - 24 * H, ref), 0) + siesta;
  const sueno48 = informados.reduce((a, i) => a + solape(i, ref - 48 * H, ref), 0) + siesta;
  const vigiliaFin = Math.max(0, (Math.max(finTurno, ref) - ultimo.fin) / H);
  return {
    sueno24,
    sueno48,
    vigiliaFin,
    ok24: sueno24 >= u.sueno24,
    ok48: sueno48 >= u.sueno48,
    okVigilia: vigiliaFin <= sueno48,
  };
}

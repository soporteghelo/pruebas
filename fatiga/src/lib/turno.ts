// Convierte las horas "HH:MM" del turno en fechas reales alrededor de ahora.
const H = 3_600_000;

function aLas(hhmm: string, base: number): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/**
 * El inicio es la ocurrencia de esa hora más cercana a ahora, aceptando turnos que empezaron
 * hasta 6 h antes (reevaluación a mitad de turno). El fin es la primera ocurrencia después del inicio.
 */
export function turnoDesde(inicio: string, fin: string, ahora: number): { inicio: number; fin: number } {
  let ti = aLas(inicio, ahora);
  if (ti < ahora - 6 * H) ti += 24 * H;
  else if (ti > ahora + 18 * H) ti -= 24 * H;
  let tf = aLas(fin, ti);
  if (tf <= ti) tf += 24 * H;
  return { inicio: ti, fin: tf };
}

export const duracionTexto = (horas: number) => {
  const h = Math.floor(horas + 1e-9);
  const m = Math.round((horas - h) * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

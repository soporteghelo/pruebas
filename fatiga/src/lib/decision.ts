// Combina las seis dimensiones en un semáforo y arma las recomendaciones.
//
// Regla: ROJO si alguna dimensión está en rojo, o si dos o más de las dimensiones medidas
// (sueño, somnolencia, PVT, rostro) están en ámbar. ÁMBAR si alguna está en ámbar.
// La predicción del modelo de tres procesos solo puede llegar a ámbar (es un promedio poblacional).
import { KSS, REFERENCIA } from "@/config";
import { categoriaPorFallas } from "./pvt";
import { cortesPersonales, fallasCon } from "./referencia";
import type { DawsonResultado, Dimension, LineaBase, Nivel, PvtResultado, Respuestas, RostroResumen, TpmResultado, Umbrales } from "./types";

const h = (x: number) => `${x.toFixed(1).replace(/\.0$/, "")} h`;
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
export const horaTexto = (t: number) => new Date(t).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

export const duracionTexto = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? (r ? `${m} min ${r} s` : `${m} min`) : `${r} s`;
};

export function dimSueno(d: DawsonResultado, u: Umbrales): Dimension {
  const fallas: string[] = [];
  if (!d.ok24) fallas.push(`durmió ${h(d.sueno24)} en las últimas 24 h (mínimo ${u.sueno24} h)`);
  if (!d.ok48) fallas.push(`durmió ${h(d.sueno48)} en las últimas 48 h (mínimo ${u.sueno48} h)`);
  if (!d.okVigilia) fallas.push(`al terminar el turno llevará ${h(d.vigiliaFin)} despierto, más que lo dormido en 48 h (${h(d.sueno48)})`);
  return {
    clave: "sueno",
    titulo: "Sueño previo",
    nivel: (fallas.length === 0 ? 0 : fallas.length === 1 ? 1 : 2) as Nivel,
    valor: `${h(d.sueno24)} en 24 h · ${h(d.sueno48)} en 48 h`,
    detalle: fallas.length ? `Según el modelo de Dawson: ${fallas.join("; ")}.` : `Cumple las tres reglas de Dawson (≥${u.sueno24} h/24 h, ≥${u.sueno48} h/48 h y vigilia ≤ sueño de 48 h).`,
  };
}

export function dimKss(kss: number, u: Umbrales): Dimension {
  return {
    clave: "kss",
    titulo: "Somnolencia declarada (KSS)",
    nivel: kss >= u.kssRojo ? 2 : kss >= u.kssAmbar ? 1 : 0,
    valor: `${kss} de 9`,
    detalle: KSS[kss - 1] ?? "",
  };
}

const CATEGORIA = { alta: "alto", media: "medio", baja: "bajo" } as const;

/**
 * Tiempo de reacción.
 * - Sin referencia personal (menos de 3 evaluaciones en buenas condiciones): cortes generales del
 *   PVT-B (desempeño alto = verde, medio = ámbar, bajo = rojo).
 * - Con referencia: se compara la velocidad (1/RT) con la propia mediana, tolerando la variación
 *   normal de la persona. El desempeño bajo sigue siendo rojo siempre.
 */
export function dimPvt(p: PvtResultado | null, u: Umbrales, lb: LineaBase | null, sesionesRef = 0): Dimension {
  const titulo = "Tiempo de reacción (PVT-B)";
  if (!p || p.validos < 5) return { clave: "pvt", titulo, nivel: null, valor: "No realizado", detalle: "No se completó la prueba de reacción." };
  const fallas = p.lapsos + p.falsos;
  const categoria = p.categoria ?? "alta";
  const resumen = `${n(p.lapsos, "lapso", "lapsos")} (≥${p.lapsoMs} ms) y ${n(p.falsos, "falso inicio", "falsos inicios")} en ${p.validos} estímulos, ${duracionTexto(p.duracionS)}${p.anticipado ? " (terminó antes: resultado claro)" : ""}; desempeño ${CATEGORIA[categoria]}`;
  if (!lb || lb.velocidad <= 0) {
    const nivel: Nivel = categoria === "baja" ? 2 : categoria === "media" ? 1 : 0;
    return {
      clave: "pvt",
      titulo,
      nivel,
      valor: `Mediana ${Math.round(p.medianaRt)} ms · ${n(fallas, "falla", "fallas")}`,
      detalle: `${resumen}. Tu referencia personal se está formando (${Math.min(sesionesRef, REFERENCIA.minimo)} de ${REFERENCIA.minimo} evaluaciones en buenas condiciones); mientras tanto se usan los cortes generales del PVT-B.`,
    };
  }
  const caida = 1 - p.velocidad / lb.velocidad;
  const cortes = cortesPersonales(lb, u);
  // Lapsos contados con su umbral personal: el desempeño bajo sigue siendo rojo siempre.
  const fallasP = fallasCon(p, lb.lapsoPersonal);
  const catP = categoriaPorFallas(fallasP, p.duracionS, { alta: u.pvtFallasAlta, media: u.pvtFallasMedia });
  const tasaP = fallasP / Math.max(0.5, p.duracionS / 60);
  let nivel: Nivel = catP === "baja" || caida >= cortes.rojo ? 2 : caida >= cortes.ambar ? 1 : 0;
  const masFallas = catP === "media" && tasaP >= lb.tasaFallas + 2;
  if (nivel === 0 && masFallas) nivel = 1;
  const cambio = caida >= 0 ? `${pct(caida)} más lenta` : `${pct(-caida)} más rápida`;
  const notas = [
    `Comparado con tu referencia (${n(lb.sesiones, "evaluación", "evaluaciones")}): velocidad ${cambio} que tu normal; tu variación habitual es ±${(lb.cvVelocidad * 100).toFixed(1).replace(".", ",")} % y el aviso empieza en −${pct(cortes.ambar)}`,
    `mediana habitual ${Math.round(lb.medianaRt)} ms, hoy ${Math.round(p.medianaRt)} ms`,
    `${n(fallasP, "falla", "fallas")} con tu umbral personal de lapso (≥${lb.lapsoPersonal} ms)`,
  ];
  if (masFallas) notas.push(`${tasaP.toFixed(1)} fallas por minuto frente a ${lb.tasaFallas.toFixed(1)} habituales`);
  if (catP === "baja") notas.push("desempeño bajo incluso frente a tu propio ritmo");
  return {
    clave: "pvt",
    titulo,
    nivel,
    valor: `Mediana ${Math.round(p.medianaRt)} ms · ${caida >= 0 ? "−" : "+"}${pct(Math.abs(caida))} vs. tu normal`,
    detalle: `${notas.join("; ")}. ${resumen}.`,
  };
}

export function dimRostro(r: RostroResumen | null, u: Umbrales, lb: LineaBase | null): Dimension {
  const titulo = "Signos en el rostro";
  if (!r) return { clave: "rostro", titulo, nivel: null, valor: "Sin cámara", detalle: "No se usó la cámara en esta evaluación." };
  if (r.calidad === "insuficiente") return { clave: "rostro", titulo, nivel: null, valor: "No concluyente", detalle: r.avisos.join(" ") };
  const rojo: string[] = [];
  const ambar: string[] = [];
  if (r.perclos >= u.perclosRojo) rojo.push(`ojos cerrados el ${pct(r.perclos)} del tiempo (PERCLOS)`);
  else if (r.perclos >= u.perclosAmbar) ambar.push(`ojos cerrados el ${pct(r.perclos)} del tiempo (PERCLOS)`);
  if (r.microsuenos >= u.microsuenosRojo) rojo.push(n(r.microsuenos, "cierre de ojos de 1 s o más", "cierres de ojos de 1 s o más"));
  else if (r.microsuenos >= 1) ambar.push(`${r.microsuenos} cierre de ojos de 1 s o más`);
  if (r.cabeceosOjosCerrados >= 1) rojo.push(`${r.cabeceosOjosCerrados} cabeceo${r.cabeceosOjosCerrados > 1 ? "s" : ""} con los ojos cerrados`);
  if (r.cierresLargos + r.microsuenos >= u.cierresLargosAmbar && r.cierresLargos > 0) ambar.push(n(r.cierresLargos, "parpadeo largo (≥0,5 s)", "parpadeos largos (≥0,5 s)"));
  if (r.bostezos >= u.bostezosAmbar) ambar.push(n(r.bostezos, "bostezo", "bostezos"));
  if (r.cabeceos >= u.cabeceosAmbar) ambar.push(n(r.cabeceos, "cabeceo", "cabeceos"));
  if (lb) {
    if (lb.duracionParpadeoMs && r.duracionParpadeoMs >= lb.duracionParpadeoMs * 1.4) ambar.push(`parpadeos ${pct(r.duracionParpadeoMs / lb.duracionParpadeoMs - 1)} más largos que tu referencia`);
    if (lb.perclos !== null && r.perclos >= lb.perclos + 0.1 && r.perclos < u.perclosAmbar) ambar.push(`PERCLOS 10 puntos sobre tu referencia`);
    if (lb.aperturaOjos && r.aperturaOjos > 0 && r.aperturaOjos < lb.aperturaOjos * 0.85) ambar.push(`párpados ${pct(1 - r.aperturaOjos / lb.aperturaOjos)} más caídos que tu referencia`);
  }
  const nivel: Nivel = rojo.length ? 2 : ambar.length ? 1 : 0;
  const signos = [...rojo, ...ambar];
  return {
    clave: "rostro",
    titulo,
    nivel,
    valor: `PERCLOS ${pct(r.perclos)} · ${Math.round(r.parpadeosMin)} parpadeos/min`,
    detalle: (signos.length ? `Se observó: ${signos.join("; ")}.` : "Sin signos de somnolencia en el rostro.") + (r.avisos.length ? ` ${r.avisos.join(" ")}` : ""),
  };
}

export function dimModelo(m: TpmResultado, u: Umbrales): Dimension {
  const alto = m.kssMax >= u.modeloKssAmbar;
  return {
    clave: "modelo",
    titulo: "Somnolencia prevista en el turno",
    nivel: alto ? 1 : 0,
    valor: `KSS ${m.kssAhora.toFixed(1)} ahora → ${m.kssFin.toFixed(1)} al final`,
    detalle: alto
      ? `El modelo de tres procesos prevé su punto más bajo de alerta hacia las ${horaTexto(m.horaMax)} (KSS ${m.kssMax.toFixed(1)}).`
      : `El modelo de tres procesos no prevé somnolencia alta durante el turno (máximo KSS ${m.kssMax.toFixed(1)}).`,
  };
}

export function dimDeclaraciones(r: Respuestas): Dimension {
  const rojo: string[] = [];
  const ambar: string[] = [];
  if (r.alcohol) rojo.push("consumo de alcohol en las últimas 12 h");
  if (!r.enCondiciones) rojo.push("no se siente en condiciones de trabajar con seguridad");
  if (r.medicamento) ambar.push("medicamento que puede causar sueño");
  const nivel: Nivel = rojo.length ? 2 : ambar.length ? 1 : 0;
  return {
    clave: "declaraciones",
    titulo: "Declaraciones",
    nivel,
    valor: nivel ? "Requiere atención" : "Sin observaciones",
    detalle: nivel ? `Declaró: ${[...rojo, ...ambar].join("; ")}.` : "Sin alcohol, sin medicamentos que den sueño y se siente en condiciones.",
  };
}

const MEDIDAS = ["sueno", "kss", "pvt", "rostro"];

export function nivelFinal(dims: Dimension[]): Nivel {
  if (dims.some((d) => d.nivel === 2)) return 2;
  if (dims.filter((d) => MEDIDAS.includes(d.clave) && d.nivel === 1).length >= 2) return 2;
  if (dims.some((d) => d.nivel === 1)) return 1;
  return 0;
}

export function recomendaciones(nivel: Nivel, dims: Dimension[], ev: { sueno: DawsonResultado; modelo: TpmResultado; respuestas: Respuestas; tareaCritica: boolean }): string[] {
  const d = Object.fromEntries(dims.map((x) => [x.clave, x])) as Record<Dimension["clave"], Dimension>;
  const r: string[] = [];
  if (nivel === 2) {
    r.push(ev.tareaCritica ? "No inicies la conducción ni la operación de equipos. Comunica este resultado a tu supervisor." : "Comunica este resultado a tu supervisor antes de iniciar cualquier tarea de riesgo.");
    r.push("El supervisor define el control: descanso, reasignación a tarea no crítica o retiro. Repite la evaluación después del descanso.");
  } else if (nivel === 1) {
    r.push("Informa a tu supervisor y acuerden controles para el turno (trabajo acompañado, pausas programadas, reevaluación a mitad de turno).");
  }
  if (d.declaraciones?.nivel && ev.respuestas.alcohol) r.push("Declaraste consumo de alcohol: se aplica el procedimiento de la empresa.");
  if (ev.respuestas.medicamento) r.push("Consulta al médico ocupacional si tu medicamento puede causar somnolencia.");
  if (!ev.sueno.ok24 || !ev.sueno.ok48) r.push("Prioriza dormir 7 a 9 horas antes de tu próximo turno, en un lugar oscuro y silencioso.");
  if (!ev.sueno.okVigilia) r.push("Llevarás muchas horas despierto: aprovecha tu descanso para una siesta corta (10 a 20 min).");
  if ((d.kss?.nivel ?? 0) >= 1 || (d.rostro?.nivel ?? 0) >= 1) r.push("Haz una pausa activa de 5 minutos cada hora, hidrátate y no conduzcas solo.");
  if ((d.pvt?.nivel ?? 0) >= 1) r.push("Tu tiempo de reacción está más lento de lo esperado: evita tareas que exijan reacción rápida sin supervisión directa.");
  if (d.modelo?.nivel) r.push(`Programa una pausa antes de las ${horaTexto(ev.modelo.horaMax)}, cuando el modelo prevé menor alerta.`);
  if (nivel === 0) r.push("Mantén tus pausas e hidratación. Si durante el turno sientes sueño, detente y avisa.");
  return [...new Set(r)];
}

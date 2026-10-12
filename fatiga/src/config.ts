// Parámetros del Test de Fatiga. Los umbrales son valores de referencia configurables en
// Ajustes: no existe un punto de corte validado universalmente para declarar aptitud.
import type { Ajustes } from "./lib/types";

export const VERSION = "1.0.0";

/** PVT-B (Basner, Mollicone y Dinges, 2011): 3 min, intervalo 1-4 s, lapso ≥355 ms. */
export const PVT = {
  isiMinMs: 1000,
  isiMaxMs: 4000,
  feedbackMs: 1000, // forma parte del intervalo entre estímulos
  falsoMs: 100, // respuesta más rápida que esto = falso inicio (anticipación)
  timeoutMs: 30000,
};

export const AJUSTES_INICIALES: Ajustes = {
  empresa: "",
  pin: "1234",
  urlAppsScript: "",
  // Las pantallas táctiles agregan retardo (NASA midió ~77 ms en un iPod touch).
  // Se resta de cada tiempo de reacción antes de aplicar los umbrales.
  latenciaMs: 70,
  lapsoMs: 355,
  // Adaptativa (PVT-BA, Basner 2022): termina sola cuando el resultado ya es claro;
  // en promedio dura ~1 min 45 s y como máximo 3 min.
  pvtModo: "adaptativo",
  pvtSegundos: 180,
  camara: true,
  umbrales: {
    kssAmbar: 7, // "somnoliento, sin esfuerzo para mantenerse despierto"
    kssRojo: 8, // "somnoliento, con esfuerzo para mantenerse despierto"
    // Categorías del PVT-B por fallas (lapsos + falsos inicios) en 3 min (Basner 2022):
    // ≤6 alta (verde), 7-16 media (ámbar), >16 baja (rojo). Se usan mientras no hay referencia personal.
    pvtFallasAlta: 6,
    pvtFallasMedia: 16,
    // Con referencia personal: caída de velocidad (1/RT) frente a la propia mediana.
    // El corte real es el mayor entre este valor y 2 (o 3) veces la variación propia de la persona.
    pvtCaidaVelocidad: 0.1,
    pvtCaidaVelocidadRojo: 0.2,
    perclosAmbar: 0.15,
    perclosRojo: 0.3,
    cierresLargosAmbar: 2,
    microsuenosRojo: 2,
    bostezosAmbar: 2,
    cabeceosAmbar: 2,
    modeloKssAmbar: 7, // KSS que predice el modelo al final del turno
    sueno24: 5, // Dawson y McCulloch (2005)
    sueno48: 12,
  },
};

/** Escala de Somnolencia de Karolinska (KSS). */
export const KSS = [
  "Extremadamente alerta",
  "Muy alerta",
  "Alerta",
  "Bastante alerta",
  "Ni alerta ni somnoliento",
  "Algunos signos de somnolencia",
  "Somnoliento, pero sin esfuerzo para mantenerme despierto",
  "Somnoliento, con algo de esfuerzo para mantenerme despierto",
  "Muy somnoliento, luchando contra el sueño",
];

export const NIVELES = [
  { nombre: "APTO", corto: "Verde", mensaje: "Puedes iniciar tu turno. Mantén tus pausas e hidratación." },
  { nombre: "APTO CON CONTROLES", corto: "Ámbar", mensaje: "Informa a tu supervisor antes de iniciar y aplica los controles indicados." },
  { nombre: "NO APTO PARA TAREA CRÍTICA", corto: "Rojo", mensaje: "No conduzcas ni operes equipos. Comunica a tu supervisor ahora." },
] as const;

/** Mínimo de evaluaciones en buenas condiciones para fijar la referencia personal. */
export const REFERENCIA = { minimo: 3, maximo: 10 };

export const LS = {
  reinicios: "tf_reinicios_referencia",
  ajustes: "tf_ajustes",
  historial: "tf_historial",
  ultimoTrabajador: "tf_ultimo_trabajador",
};

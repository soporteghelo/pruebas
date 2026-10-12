// Tipos compartidos del Test de Fatiga.

/** 0 = verde, 1 = ámbar, 2 = rojo. null = no evaluado o no concluyente. */
export type Nivel = 0 | 1 | 2;

export interface Trabajador {
  nombre: string;
  dni: string;
  empresa: string;
  cargo: string;
  area: string;
}

export interface Turno {
  inicio: number; // epoch ms
  fin: number;
  tareaCritica: boolean;
}

export interface Respuestas {
  dormir: string; // "HH:MM" del último sueño principal
  despertar: string; // "HH:MM"
  horasSuenoAnterior: number; // sueño principal anterior a ese
  siestaMin: number; // siestas en las últimas 24 h
  calidad: "buena" | "regular" | "mala";
  kss: number; // 1-9
  alcohol: boolean;
  medicamento: boolean;
  enCondiciones: boolean;
}

export interface Intervalo {
  inicio: number;
  fin: number;
}

/** Evento crudo del PVT. rt en ms medido por el navegador, sin corregir latencia. */
export type EventoPvt =
  | { tipo: "respuesta"; rt: number; t: number }
  | { tipo: "anticipacion"; t: number } // toque sin estímulo en pantalla
  | { tipo: "timeout"; t: number };

/** Categoría del PVT-B según fallas (lapsos + falsos inicios) en 3 min: ≤6 alta, 7-16 media, >16 baja. */
export type CategoriaPvt = "alta" | "media" | "baja";

export interface PvtResultado {
  duracionS: number; // duración real de la prueba
  estimulos: number;
  validos: number;
  mediaRt: number;
  medianaRt: number;
  sdRt: number;
  velocidad: number; // media de 1/RT (1/s)
  lentos10: number; // media de 1/RT del 10 % más lento (1/s)
  rapidos10Rt: number; // media del 10 % más rápido (ms)
  lapsos: number;
  falsos: number;
  timeouts: number;
  puntaje: number; // 1 - (lapsos + falsos) / (validos + falsos)
  tasaFallas: number; // (lapsos + falsos) por minuto
  categoria: CategoriaPvt;
  adaptativo: boolean;
  anticipado: boolean; // terminó antes del máximo porque el resultado ya era claro
  latenciaMs: number;
  lapsoMs: number;
  rts: number[]; // RT corregidos de las respuestas válidas, en orden
}

export interface RostroResumen {
  segundosValidos: number;
  segundosTotales: number;
  fps: number;
  perclos: number; // fracción 0-1 del tiempo con ojos ≥80 % cerrados (P80)
  parpadeosMin: number;
  duracionParpadeoMs: number;
  cierresLargos: number; // 500-999 ms
  microsuenos: number; // ≥1000 ms
  bostezos: number;
  cabeceos: number;
  cabeceosOjosCerrados: number;
  aperturaOjos: number; // EAR de ojo abierto (calibración)
  luz: number; // luminancia media 0-255
  calidad: "buena" | "regular" | "insuficiente";
  avisos: string[];
}

export interface DawsonResultado {
  sueno24: number;
  sueno48: number;
  vigiliaFin: number; // horas despierto al terminar el turno
  ok24: boolean;
  ok48: boolean;
  okVigilia: boolean;
}

export interface PuntoKss {
  t: number;
  kss: number;
  despierto: boolean;
}

export interface TpmResultado {
  kssAhora: number;
  kssFin: number;
  kssMax: number;
  horaMax: number;
  curva: PuntoKss[];
}

export interface Dimension {
  clave: "sueno" | "kss" | "pvt" | "rostro" | "modelo" | "declaraciones";
  titulo: string;
  nivel: Nivel | null;
  valor: string;
  detalle: string;
}

/** Referencia personal de cada trabajador, a partir de sus evaluaciones en buenas condiciones. */
export interface LineaBase {
  sesiones: number;
  desde: number; // fecha de la evaluación más antigua usada
  velocidad: number; // mediana de 1/RT medio (1/s)
  cvVelocidad: number; // variación entre sesiones (desviación / media)
  medianaRt: number;
  mediaRt: number;
  lapsoPersonal: number; // umbral de lapso equivalente para esta persona (ms)
  tasaFallas: number; // mediana de fallas por minuto, con su umbral personal
  perclos: number | null;
  duracionParpadeoMs: number | null;
  aperturaOjos: number | null;
}

export interface Evaluacion {
  id: string;
  fecha: number;
  trabajador: Trabajador;
  turno: Turno;
  respuestas: Respuestas;
  sueno: DawsonResultado;
  modelo: TpmResultado;
  pvt: PvtResultado | null;
  rostro: RostroResumen | null;
  lineaBase: LineaBase | null;
  dimensiones: Dimension[];
  nivel: Nivel;
  recomendaciones: string[];
  sincronizado: boolean;
  dispositivo: string;
}

export interface Umbrales {
  kssAmbar: number;
  kssRojo: number;
  pvtFallasAlta: number; // máximo de fallas en 3 min para categoría alta
  pvtFallasMedia: number; // máximo para categoría media; más es baja
  pvtCaidaVelocidad: number; // caída frente a la referencia personal para ámbar
  pvtCaidaVelocidadRojo: number;
  perclosAmbar: number;
  perclosRojo: number;
  cierresLargosAmbar: number;
  microsuenosRojo: number;
  bostezosAmbar: number;
  cabeceosAmbar: number;
  modeloKssAmbar: number;
  sueno24: number;
  sueno48: number;
}

export interface Ajustes {
  empresa: string;
  pin: string;
  urlAppsScript: string;
  latenciaMs: number;
  lapsoMs: number;
  pvtModo: "adaptativo" | "fijo";
  pvtSegundos: number; // máximo (adaptativo) o duración (fijo)
  camara: boolean;
  umbrales: Umbrales;
}

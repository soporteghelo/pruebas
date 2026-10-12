// Análisis de signos de fatiga en el rostro a partir de muestras por cuadro.
//
// Mejoras frente a los repositorios de referencia (umbrales fijos de EAR, MAR y ángulo):
//  - Calibración personal: el "ojo abierto" de cada persona se mide en los primeros segundos,
//    mirando el celular en la postura real de uso (mirar hacia abajo cierra un poco los párpados).
//  - Cierre ocular fusionado: geometría (EAR normalizado) + blendshape eyeBlink del modelo.
//  - PERCLOS P80 ponderado por tiempo real entre cuadros (no por número de cuadros), así no
//    depende de los FPS del celular.
//  - Parpadeos con histéresis y duración interpolada al 50 % de cierre; se separan los
//    cierres largos (≥500 ms) y los cierres tipo microsueño (≥1 s).
//  - Bostezos por apertura sostenida de mandíbula (≥1 s) para no contar el habla.
//  - Cabeceos contra la mediana móvil del ángulo (se adapta si la persona cambia de postura).
//  - Control de calidad: rostro visible, iluminación, distancia y FPS; si la calidad no alcanza,
//    el resultado facial queda "no concluyente" en vez de dar un falso aviso.
import type { RostroResumen } from "../types";
import type { Muestra } from "./features";

export const PARAM = {
  calibracionMs: 6000,
  yawMax: 30, // grados: más que esto es mirar a otro lado
  dtMax: 250, // ms: huecos mayores no se integran
  earCerradoRel: 0.35, // EAR de ojo cerrado relativo al abierto
  cierreP80: 0.8,
  sube: 0.5,
  baja: 0.3,
  cierreLargoMs: 500,
  microsuenoMs: 1000,
  bostezoMin: 0.5,
  bostezoSobreBase: 0.35,
  bostezoMs: 1000,
  bostezoMaxMs: 10000,
  cabeceoGrados: 15,
  cabeceoRetorno: 6,
  cabeceoMinMs: 150,
  cabeceoMaxMs: 2500,
  ventanaPitchMs: 10000,
  luzMin: 50,
  tamanoMin: 0.08,
  validosMinS: 20,
};

export interface Referencia {
  earAbierto: number;
  bsAbierto: number;
  bsCerrado: number;
  mandibula: number;
}

function percentil(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const o = [...xs].sort((a, b) => a - b);
  const i = Math.min(o.length - 1, Math.max(0, (o.length - 1) * q));
  const a = Math.floor(i);
  return o[a] + (o[Math.ceil(i)] - o[a]) * (i - a);
}

const lim = (x: number) => Math.min(1, Math.max(0, x));
const interp = (t0: number, v0: number, t1: number, v1: number, nivel: number) =>
  v1 === v0 ? t1 : t0 + ((nivel - v0) / (v1 - v0)) * (t1 - t0);

export interface EstadoVivo {
  rostro: boolean;
  mensaje: string;
  cierre: number;
  segundosValidos: number;
  /** Última muestra cruda (para el modo diagnóstico). */
  muestra: Muestra | null;
  ref: Referencia | null;
  parpadeos: number;
  cierresLargos: number;
}

export class AnalizadorRostro {
  ref: Referencia | null = null;
  private cal: Muestra[] = [];
  private calInicio: number | null = null;
  private calValidoMs = 0;

  private ultimo: Muestra | null = null;
  private ultimoValido: { t: number; c: number } | null = null;
  private ultimoRostro = -Infinity;
  private cierreActual = 0;
  private tInicio: number | null = null;
  private tFin = 0;
  private cuadros = 0;
  private tValido = 0;
  private tCerrado = 0;
  private luces: number[] = [];
  private tamanos: number[] = [];

  private ojoArriba: number | null = null;
  private ojoBaja: number | null = null;
  private parpadeos: number[] = [];
  private cierresLargos = 0;
  private microsuenos = 0;

  private bostezoInicio: number | null = null;
  private bostezoFin = -Infinity;
  private bostezos = 0;

  private pitches: { t: number; p: number }[] = [];
  private cabInicio: number | null = null;
  private cabCerrado = false;
  private cabBloqueado = false;
  private cabeceos = 0;
  private cabeceosCerrados = 0;

  // ---------- Calibración ----------

  /** Agrega una muestra de calibración. Devuelve el avance 0-1. */
  calibrar(m: Muestra): number {
    this.registrarPresencia(m);
    if (this.esValida(m)) {
      if (this.calInicio !== null && this.cal.length) this.calValidoMs += Math.min(m.t - this.cal[this.cal.length - 1].t, PARAM.dtMax);
      this.calInicio ??= m.t;
      this.cal.push(m);
    }
    return Math.min(1, this.calValidoMs / PARAM.calibracionMs);
  }

  /** Fija la referencia personal. Devuelve false si no hubo suficiente rostro visible. */
  terminarCalibracion(): boolean {
    const ears = this.cal.map((m) => m.ear!).filter((x) => x > 0);
    if (ears.length < 10) return false;
    const bs = this.cal.map((m) => m.parpadeo).filter((x): x is number => x !== undefined);
    const jaw = this.cal.map((m) => m.mandibula).filter((x): x is number => x !== undefined);
    const bsAbierto = bs.length ? percentil(bs, 0.5) : NaN;
    this.ref = {
      earAbierto: percentil(ears, 0.85),
      bsAbierto,
      // Con el ojo cerrado, eyeBlink de MediaPipe suele quedar entre 0,45 y 0,7 (rara vez llega a 1).
      bsCerrado: Number.isNaN(bsAbierto) ? NaN : Math.min(0.9, Math.max(0.45, bsAbierto + 0.4)),
      mandibula: jaw.length ? percentil(jaw, 0.5) : 0,
    };
    return true;
  }

  // ---------- Medición ----------

  private esValida(m: Muestra): boolean {
    return m.rostro && (m.ear ?? 0) > 0 && (m.yaw === undefined || Math.abs(m.yaw) < PARAM.yawMax);
  }

  private registrarPresencia(m: Muestra) {
    this.ultimo = m;
    if (m.rostro) this.ultimoRostro = m.t;
    if (m.luz !== undefined) this.luces.push(m.luz);
    if (m.tamano !== undefined) this.tamanos.push(m.tamano);
  }

  /** Cierre ocular 0 (abierto) … 1 (cerrado), relativo a la referencia personal. */
  cierre(m: Muestra): number {
    const r = this.ref!;
    const partes: number[] = [];
    if (m.ear !== undefined && r.earAbierto > 0) partes.push(lim((1 - m.ear / r.earAbierto) / (1 - PARAM.earCerradoRel)));
    if (m.parpadeo !== undefined && !Number.isNaN(r.bsAbierto)) partes.push(lim((m.parpadeo - r.bsAbierto) / (r.bsCerrado - r.bsAbierto)));
    return partes.length ? partes.reduce((a, b) => a + b, 0) / partes.length : 0;
  }

  agregar(m: Muestra) {
    if (!this.ref) return;
    this.registrarPresencia(m);
    this.tInicio ??= m.t;
    this.tFin = m.t;
    this.cuadros++;
    const valida = this.esValida(m);
    const previo = this.ultimoValido;
    const continuo = valida && previo !== null && m.t - previo.t <= PARAM.dtMax;
    this.ultimo = m;
    if (!valida) {
      // Sin rostro: se descarta cualquier evento ocular en curso (no se puede medir).
      this.ojoArriba = null;
      this.ojoBaja = null;
      return;
    }
    const c = this.cierre(m);
    this.cierreActual = c;
    if (continuo) {
      const dt = m.t - previo!.t;
      this.tValido += dt;
      // Tiempo con ojos ≥80 % cerrados: cada tramo se reparte según cuánto estuvo sobre P80.
      const a = previo!.c >= PARAM.cierreP80;
      const b = c >= PARAM.cierreP80;
      if (a && b) this.tCerrado += dt;
      else if (a !== b) {
        const tx = interp(previo!.t, previo!.c, m.t, c, PARAM.cierreP80);
        this.tCerrado += a ? tx - previo!.t : m.t - tx;
      }
      this.procesarOjo(previo!.t, previo!.c, m.t, c);
    } else {
      this.ojoArriba = null;
      this.ojoBaja = null;
    }
    this.procesarBostezo(m);
    this.procesarCabeceo(m, c);
    this.ultimoValido = { t: m.t, c };
  }

  private procesarOjo(t0: number, c0: number, t1: number, c1: number) {
    if (this.ojoArriba === null) {
      if (c0 < PARAM.sube && c1 >= PARAM.sube) {
        this.ojoArriba = interp(t0, c0, t1, c1, PARAM.sube);
        this.ojoBaja = null;
      }
      return;
    }
    if (c0 >= PARAM.sube && c1 < PARAM.sube) this.ojoBaja = interp(t0, c0, t1, c1, PARAM.sube);
    if (c1 >= PARAM.sube) this.ojoBaja = null;
    if (c1 < PARAM.baja) {
      const fin = this.ojoBaja ?? t1;
      this.registrarCierre(fin - this.ojoArriba);
      this.ojoArriba = null;
      this.ojoBaja = null;
    }
  }

  private registrarCierre(ms: number) {
    // Al bostezar los ojos suelen cerrarse: ese cierre ya cuenta como bostezo.
    if (this.bostezoInicio !== null || (this.ultimo?.t ?? 0) - this.bostezoFin < 1000) return;
    if (ms < PARAM.cierreLargoMs) this.parpadeos.push(Math.max(ms, 0));
    else if (ms < PARAM.microsuenoMs) this.cierresLargos++;
    else this.microsuenos++;
  }

  private procesarBostezo(m: Muestra) {
    if (m.mandibula === undefined) return;
    const umbral = Math.max(PARAM.bostezoMin, (this.ref?.mandibula ?? 0) + PARAM.bostezoSobreBase);
    if (this.bostezoInicio === null) {
      if (m.mandibula >= umbral) this.bostezoInicio = m.t;
    } else if (m.mandibula < umbral * 0.7) {
      const ms = m.t - this.bostezoInicio;
      if (ms >= PARAM.bostezoMs && ms <= PARAM.bostezoMaxMs) {
        this.bostezos++;
        this.bostezoFin = m.t;
      }
      this.bostezoInicio = null;
    }
  }

  private procesarCabeceo(m: Muestra, c: number) {
    if (m.pitch === undefined) return;
    this.pitches.push({ t: m.t, p: m.pitch });
    while (this.pitches.length && this.pitches[0].t < m.t - PARAM.ventanaPitchMs) this.pitches.shift();
    const historia = this.pitches.filter((x) => x.t < m.t - 1000).map((x) => x.p);
    if (historia.length < 10) return;
    const desvio = Math.abs(m.pitch - percentil(historia, 0.5));
    if (this.cabBloqueado) {
      if (desvio < PARAM.cabeceoRetorno) this.cabBloqueado = false;
      return;
    }
    if (this.cabInicio === null) {
      if (desvio > PARAM.cabeceoGrados) {
        this.cabInicio = m.t;
        this.cabCerrado = c >= PARAM.cierreP80;
      }
      return;
    }
    this.cabCerrado ||= c >= PARAM.cierreP80;
    const ms = m.t - this.cabInicio;
    if (desvio < PARAM.cabeceoRetorno) {
      if (ms >= PARAM.cabeceoMinMs && ms <= PARAM.cabeceoMaxMs) {
        this.cabeceos++;
        if (this.cabCerrado) this.cabeceosCerrados++;
      }
      this.cabInicio = null;
    } else if (ms > PARAM.cabeceoMaxMs) {
      // Cambio de postura, no cabeceo: se espera a que la referencia se adapte.
      this.cabInicio = null;
      this.cabBloqueado = true;
    }
  }

  // ---------- Salidas ----------

  vivo(ahora: number): EstadoVivo {
    const rostro = ahora - this.ultimoRostro < 700;
    const luz = this.luces.length ? this.luces[this.luces.length - 1] : 255;
    const tam = this.tamanos.length ? this.tamanos[this.tamanos.length - 1] : 1;
    let mensaje = "Rostro detectado";
    if (!rostro) mensaje = "Ubica tu rostro frente a la cámara";
    else if (luz < PARAM.luzMin) mensaje = "Busca un lugar con más luz";
    else if (tam < PARAM.tamanoMin) mensaje = "Acerca un poco el celular";
    else if (this.ultimo?.yaw !== undefined && Math.abs(this.ultimo.yaw) >= PARAM.yawMax) mensaje = "Mira hacia la pantalla";
    return {
      rostro,
      mensaje,
      cierre: this.cierreActual,
      segundosValidos: this.tValido / 1000,
      muestra: this.ultimo,
      ref: this.ref,
      parpadeos: this.parpadeos.length,
      cierresLargos: this.cierresLargos + this.microsuenos,
    };
  }

  get segundosValidos() {
    return this.tValido / 1000;
  }

  resumen(): RostroResumen {
    let micro = this.microsuenos;
    let largos = this.cierresLargos;
    // Un cierre que seguía en curso al terminar también cuenta.
    if (this.ojoArriba !== null) {
      const ms = this.tFin - this.ojoArriba;
      if (ms >= PARAM.microsuenoMs) micro++;
      else if (ms >= PARAM.cierreLargoMs) largos++;
    }
    const total = this.tInicio === null ? 0 : (this.tFin - this.tInicio) / 1000;
    const validos = this.tValido / 1000;
    const fps = total > 0 ? this.cuadros / total : 0;
    const luz = this.luces.length ? this.luces.reduce((a, b) => a + b, 0) / this.luces.length : 0;
    const tam = this.tamanos.length ? percentil(this.tamanos, 0.5) : 0;
    const proporcion = total > 0 ? validos / total : 0;
    const avisos: string[] = [];
    if (this.luces.length && luz < PARAM.luzMin) avisos.push("Poca luz: la lectura del rostro es menos confiable.");
    if (this.tamanos.length && tam < PARAM.tamanoMin) avisos.push("El rostro estuvo lejos de la cámara.");
    if (total > 0 && proporcion < 0.75) avisos.push(`El rostro se vio solo el ${Math.round(proporcion * 100)} % del tiempo.`);
    if (total > 0 && fps < 12) avisos.push(`El celular procesó ${fps.toFixed(0)} cuadros/s: algunos parpadeos breves pueden no detectarse.`);
    const insuficiente = validos < PARAM.validosMinS || proporcion < 0.5 || fps < 5;
    if (validos < PARAM.validosMinS) avisos.push(`Se midieron ${validos.toFixed(0)} s con el rostro visible (mínimo ${PARAM.validosMinS} s).`);
    const media = this.parpadeos.length ? this.parpadeos.reduce((a, b) => a + b, 0) / this.parpadeos.length : 0;
    return {
      segundosValidos: validos,
      segundosTotales: total,
      fps,
      perclos: this.tValido > 0 ? this.tCerrado / this.tValido : 0,
      parpadeosMin: validos > 0 ? this.parpadeos.length / (validos / 60) : 0,
      duracionParpadeoMs: media,
      cierresLargos: largos,
      microsuenos: micro,
      bostezos: this.bostezos,
      cabeceos: this.cabeceos,
      cabeceosOjosCerrados: this.cabeceosCerrados,
      aperturaOjos: this.ref?.earAbierto ?? 0,
      luz,
      calidad: insuficiente ? "insuficiente" : avisos.length ? "regular" : "buena",
      avisos,
    };
  }
}

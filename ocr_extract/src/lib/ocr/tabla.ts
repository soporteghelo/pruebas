// De cajas de texto sueltas a filas de la ficha: Nro, Nombre, DNI, Ocupación y Área.
//
// El OCR devuelve trozos de texto con su posición; no sabe qué es un renglón ni qué es
// una columna. Aquí se reconstruye la tabla con tres fuentes de información, en orden de
// confianza:
//
//   1. La rejilla (líneas de la tabla) para renglones y columnas.
//   2. La cabecera impresa ("APELLIDOS Y NOMBRES", "DNI", "ÁREA"...), que el OCR lee casi
//      sin errores porque es texto impreso, para saber qué columna es cuál.
//   3. El contenido, cuando falta lo anterior: 8 dígitos es un DNI, letras es un nombre.
//
// Funciones puras: no tocan el DOM ni el motor OCR.

import { xRecta, yRecta, yReal, type Rejilla } from "./rejilla";

/** Caja de texto leída, en fracciones 0-1 de la página. */
export interface CajaOcr {
  texto: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

export type Campo = "nro" | "nombre" | "dni" | "ocupacion" | "area" | "ignorar";

export interface FilaLeida {
  filaDoc: number;   // renglón físico (1 = primero de datos)
  nro: string;
  nombre: string;
  dni: string;
  ocupacion: string;
  area: string;
  conf: number;      // confianza media del OCR en nombre + DNI
}

export interface TablaLeida {
  filas: FilaLeida[];
  /** Anclas en el formato que espera la app: centros de la 1.ª y última fila (0-1000). */
  anclas: { yPrimera: number; xIzq: number; yUltima: number; xDer: number };
  totalFilas: number;
  /** Cómo se resolvieron renglones y columnas, para el registro en consola. */
  modo: string;
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
const mayus = (s: string) => sinTildes(s).toUpperCase();

// Confusiones típicas del OCR entre letras y cifras manuscritas. Solo se aplican cuando
// el texto ya es mayoritariamente numérico: en un nombre, una "S" es una "S".
const LETRA_A_CIFRA: Record<string, string> = {
  O: "0", D: "0", Q: "0", U: "0", C: "0",
  I: "1", L: "1", "|": "1", "!": "1", "/": "1", J: "1", T: "7",
  Z: "2", E: "3", A: "4", H: "4", S: "5", G: "6", B: "8", g: "9", q: "9",
};

function contar(s: string) {
  let cifras = 0, letras = 0;
  for (const ch of s) {
    if (/\d/.test(ch)) cifras++;
    else if (/\p{L}/u.test(ch)) letras++;
  }
  return { cifras, letras };
}

/** Texto que parece un número (DNI, Nro) aunque el OCR haya metido alguna letra. */
export function aCifras(texto: string): string {
  let out = "";
  for (const ch of texto) {
    if (/\d/.test(ch)) out += ch;
    else if (LETRA_A_CIFRA[ch] !== undefined) out += LETRA_A_CIFRA[ch];
    else if (LETRA_A_CIFRA[ch.toUpperCase()] !== undefined) out += LETRA_A_CIFRA[ch.toUpperCase()];
  }
  return out;
}

export function esNumerico(texto: string): boolean {
  const t = texto.replace(/[\s.,\-_:;]/g, "");
  if (!t) return false;
  const { cifras } = contar(t);
  return cifras / t.length >= 0.6;
}

/** Limpia el DNI leído: solo cifras. Se deja la longitud real: la vinculación ya tolera errores. */
export function limpiarDni(texto: string): string {
  const crudo = texto.replace(/\s+/g, "");
  if (!crudo) return "";
  const cifras = esNumerico(crudo) ? aCifras(crudo) : crudo.replace(/\D/g, "");
  // Un DNI tiene 8 cifras. Con 9-10 casi siempre sobra un trazo del borde de la celda o
  // un guion leído como 1 en un extremo; se recorta el que más probablemente sobra.
  if (cifras.length > 8 && cifras.length <= 10) {
    let c = cifras;
    while (c.length > 8 && (c[0] === "1" || c[0] === "7")) c = c.slice(1);
    while (c.length > 8 && (c[c.length - 1] === "1" || c[c.length - 1] === "7")) c = c.slice(0, -1);
    return c.length > 8 ? c.slice(0, 8) : c;
  }
  return cifras;
}

/** Nombre en mayúsculas, sin cifras ni signos sueltos que no forman parte de un nombre. */
export function limpiarNombre(texto: string): string {
  return texto
    .toUpperCase()
    .replace(/[0-9]/g, " ")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Letras sueltas al principio suelen ser restos del borde de la celda o del Nro.
    .replace(/^(\p{L}\s)+/u, "")
    .trim();
}

const limpiarTexto = (texto: string) =>
  texto.toUpperCase().replace(/[^\p{L}0-9\s.'-]/gu, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

/** Qué columna anuncia un texto de cabecera, o null si no es cabecera reconocible. */
export function campoDeCabecera(texto: string): Campo | null {
  const t = mayus(texto).replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/D\.?\s?N\.?\s?I|DOCUMENTO|IDENTIDAD|CARNET|C\.?E\.?$/.test(t)) return "dni";
  if (/APELLIDO|NOMBRE|PARTICIPANTE|TRABAJADOR|COLABORADOR|ASISTENTE/.test(t)) return "nombre";
  if (/OCUPACI|CARGO|PUESTO|FUNCION/.test(t)) return "ocupacion";
  if (/^AREA|\bAREA\b|SECCION|GERENCIA|DEPARTAMENTO/.test(t)) return "area";
  // Con límites de palabra: "HORACIO" o "NOTARIO" en un nombre no son títulos.
  if (/\b(FIRMAS?|OBSERVAC\w*|EMPRESA|CONTRATISTA|HORAS?|INGRESO|SALIDA|FECHA|HUELLA|NOTA)\b/.test(t)) return "ignorar";
  if (/^(N|NO|NRO|NUM|N°|Nº|N\.|ITEM|#)\.?°?º?$/.test(t)) return "nro";
  return null;
}

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------

interface Intervalo { x0: number; x1: number; campo: Campo | null }

const centroX = (c: CajaOcr) => c.x + c.w / 2;
const centroY = (c: CajaOcr) => c.y + c.h / 2;

/** Columnas a partir de las líneas verticales y de la cabecera encima de la tabla. */
function columnasDesdeRejilla(r: Rejilla, cabecera: CajaOcr[]): Intervalo[] | null {
  const cortes = [...r.verticales];
  // Los bordes de la tabla cierran la primera y la última columna aunque su línea no se
  // haya detectado (borde cortado en la foto).
  if (!cortes.length || cortes[0] - r.x0p > 0.02) cortes.unshift(r.x0p);
  if (cortes[cortes.length - 1] < r.x1p - 0.02) cortes.push(r.x1p);
  if (cortes.length < 3) return null; // una sola columna: no aporta nada

  const intervalos: Intervalo[] = [];
  for (let i = 1; i < cortes.length; i++) {
    if (cortes[i] - cortes[i - 1] < 0.015) continue; // dos líneas pegadas
    intervalos.push({ x0: cortes[i - 1], x1: cortes[i], campo: null });
  }

  // Cada texto de cabecera vota por su columna. Prioridad para el voto más
  // específico ("N° DNI" es DNI, no Nro).
  const prioridad: Campo[] = ["dni", "nombre", "ocupacion", "area", "nro", "ignorar"];
  for (const iv of intervalos) {
    const votos = cabecera
      .filter((c) => {
        const xc = xRecta(r, centroX(c), centroY(c));
        return xc >= iv.x0 && xc <= iv.x1;
      })
      .map((c) => campoDeCabecera(c.texto))
      .filter((v): v is Campo => !!v);
    // Dos títulos de datos distintos en una misma "columna" (nombre y DNI) quieren
    // decir que faltan líneas verticales por detectar: estas columnas no sirven y es
    // mejor deducirlas de la cabecera.
    const distintos = new Set(votos.filter((v) => v !== "ignorar" && v !== "nro"));
    if (distintos.size > 1) return null;
    if (votos.length) iv.campo = prioridad.find((p) => votos.includes(p)) ?? null;
  }
  return intervalos;
}

/** Columnas a partir de la cabecera sola (tabla sin líneas verticales). */
function columnasDesdeCabecera(
  cabecera: CajaOcr[],
  xRef: (c: CajaOcr) => number,
  bordes?: { x0: number; x1: number }
): Intervalo[] | null {
  const grupos: { campo: Campo; x0: number; x1: number }[] = [];
  cabecera
    .map((c) => ({ c, campo: campoDeCabecera(c.texto) }))
    .filter((g): g is { c: CajaOcr; campo: Campo } => !!g.campo)
    .sort((a, b) => xRef(a.c) - xRef(b.c))
    .forEach(({ c, campo }) => {
      const x0 = xRef(c) - c.w / 2, x1 = xRef(c) + c.w / 2;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.campo === campo) { ultimo.x1 = Math.max(ultimo.x1, x1); return; }
      grupos.push({ campo, x0, x1 });
    });
  if (!grupos.some((g) => g.campo === "dni") && !grupos.some((g) => g.campo === "nombre")) return null;

  // Fronteras entre columnas. Los títulos suelen ir centrados en su columna, así que si
  // se conoce el borde izquierdo de la tabla, cada frontera es el reflejo de la anterior
  // respecto al centro del título: con "N°" (estrecha) junto a "APELLIDOS Y NOMBRES"
  // (ancha), el punto medio entre títulos caería dentro de la columna del nombre y se
  // comería los apellidos escritos pegados a la izquierda. Si el reflejo cae fuera del
  // hueco entre dos títulos, o no hay borde conocido, se usa el punto medio.
  const fronteras: number[] = [];
  let anterior = bordes?.x0;
  for (let i = 0; i < grupos.length - 1; i++) {
    const g = grupos[i], sig = grupos[i + 1];
    const medio = (g.x1 + sig.x0) / 2;
    let f = medio;
    if (anterior !== undefined) {
      const reflejo = 2 * ((g.x0 + g.x1) / 2) - anterior;
      if (reflejo >= g.x1 && reflejo <= sig.x0) f = reflejo;
    }
    fronteras.push(f);
    anterior = f;
  }
  return grupos.map((g, i) => ({
    campo: g.campo,
    x0: i === 0 ? -1 : fronteras[i - 1],
    x1: i === grupos.length - 1 ? 2 : fronteras[i],
  }));
}

/**
 * Sin cabecera legible: cada columna se clasifica por lo que contiene. La de más DNIs
 * (6+ cifras) es el DNI, la de números cortos a la izquierda es el Nro, y la de más
 * letras es el nombre. Ocupación y área no se pueden distinguir de una firma por el
 * contenido, así que se dejan sin asignar.
 */
function clasificarPorContenido(intervalos: Intervalo[], porColumna: CajaOcr[][]): void {
  const stats = porColumna.map((cajas) => {
    let largos = 0, cortos = 0, letras = 0;
    for (const c of cajas) {
      const t = c.texto.replace(/\s/g, "");
      if (esNumerico(t)) {
        const n = aCifras(t).length;
        if (n >= 6) largos++;
        else if (n >= 1 && n <= 3) cortos++;
      } else {
        letras += contar(t).letras * c.conf;
      }
    }
    return { largos, cortos, letras, total: cajas.length };
  });

  const libre = (i: number) => intervalos[i].campo === null;
  let iDni = -1;
  stats.forEach((s, i) => {
    if (libre(i) && s.largos >= 2 && (iDni < 0 || s.largos > stats[iDni].largos)) iDni = i;
  });
  if (iDni >= 0) intervalos[iDni].campo = "dni";

  let iNombre = -1;
  stats.forEach((s, i) => {
    if (libre(i) && s.letras > 0 && (iNombre < 0 || s.letras > stats[iNombre].letras)) iNombre = i;
  });
  if (iNombre >= 0) intervalos[iNombre].campo = "nombre";

  const izquierda = Math.min(...[iDni, iNombre].filter((i) => i >= 0));
  stats.forEach((s, i) => {
    if (libre(i) && i < izquierda && s.total > 0 && s.cortos / s.total >= 0.5) intervalos[i].campo = "nro";
  });
}

/** Columna con más solape horizontal (una palabra larga puede invadir la vecina). */
function columnaDe(c: CajaOcr, intervalos: Intervalo[], xRef: (c: CajaOcr) => number): Intervalo | null {
  const a = xRef(c) - c.w / 2, b = xRef(c) + c.w / 2;
  let mejor: Intervalo | null = null, solape = 0;
  for (const iv of intervalos) {
    const s = Math.min(b, iv.x1) - Math.max(a, iv.x0);
    if (s > solape) { solape = s; mejor = iv; }
  }
  return mejor;
}

/**
 * Al borrar las líneas de la tabla, dos celdas escritas muy pegadas pueden salir en una
 * sola caja ("09261453 BODEGUERO PLANTA"). Si una caja invade de verdad varias columnas,
 * se parte en palabras y a cada una se le estima su posición por la proporción de
 * caracteres: basta para mandar cada palabra a su columna.
 */
function partirPorColumnas(c: CajaOcr, intervalos: Intervalo[], xRef: (c: CajaOcr) => number): CajaOcr[] {
  const a = xRef(c) - c.w / 2, b = xRef(c) + c.w / 2;
  const invadidas = intervalos.filter((iv) => Math.min(b, iv.x1) - Math.max(a, iv.x0) > c.w * 0.2);
  if (invadidas.length < 2) return [c];

  const texto = c.texto;
  const L = texto.length;
  if (L < 2) return [c];
  const trozos: CajaOcr[] = [];
  // Palabras, y también el salto entre cifras y letras ("09261453BODEGUERO").
  const re = /[0-9]+|[^\s0-9]+/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    trozos.push({
      ...c,
      texto: m[0],
      x: c.x + (m.index / L) * c.w,
      w: Math.max(1e-4, (m[0].length / L) * c.w),
    });
  }
  return trozos.length ? trozos : [c];
}

// ---------------------------------------------------------------------------
// Renglones sin rejilla
// ---------------------------------------------------------------------------

interface BandaTexto { top: number; bottom: number }

/** Agrupa las cajas en renglones por su altura cuando no hay líneas en la página. */
function renglonesPorTexto(cajas: CajaOcr[]): BandaTexto[] {
  if (!cajas.length) return [];
  const alturas = cajas.map((c) => c.h).sort((a, b) => a - b);
  const hMed = alturas[Math.floor(alturas.length / 2)];
  const orden = [...cajas].sort((a, b) => centroY(a) - centroY(b));
  const grupos: CajaOcr[][] = [];
  for (const c of orden) {
    const g = grupos[grupos.length - 1];
    if (g && centroY(c) - centroY(g[g.length - 1]) < hMed * 0.6) g.push(c);
    else grupos.push([c]);
  }
  return grupos.map((g) => ({
    top: Math.min(...g.map((c) => c.y)),
    bottom: Math.max(...g.map((c) => c.y + c.h)),
  }));
}

// ---------------------------------------------------------------------------
// Ensamblado
// ---------------------------------------------------------------------------

const unir = (cajas: CajaOcr[], xRef: (c: CajaOcr) => number) =>
  [...cajas].sort((a, b) => xRef(a) - xRef(b)).map((c) => c.texto.trim()).filter(Boolean).join(" ");

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

/** Reparte el texto de un renglón sin columnas conocidas entre Nro, nombre y DNI. */
function repartirPorContenido(cajas: CajaOcr[], xRef: (c: CajaOcr) => number) {
  const orden = [...cajas].sort((a, b) => xRef(a) - xRef(b));
  const dni = orden.filter((c) => esNumerico(c.texto) && aCifras(c.texto.replace(/\s/g, "")).length >= 6);
  const conLetras = orden.filter((c) => !esNumerico(c.texto) && contar(c.texto).letras >= 2);
  const primeraLetra = conLetras.length ? xRef(conLetras[0]) : Infinity;
  const nro = orden.filter((c) => esNumerico(c.texto) && aCifras(c.texto).length <= 3 && xRef(c) < primeraLetra);

  // El nombre es el bloque continuo de palabras con más letras: separa el nombre de lo
  // que haya escrito más a la derecha (cargo, área, firma).
  const bloques: CajaOcr[][] = [];
  for (const c of conLetras) {
    const b = bloques[bloques.length - 1];
    const prev = b?.[b.length - 1];
    if (prev && c.x - (prev.x + prev.w) < Math.max(prev.h, c.h) * 2.5) b.push(c);
    else bloques.push([c]);
  }
  const letrasDe = (b: CajaOcr[]) => b.reduce((s, c) => s + contar(c.texto).letras * c.conf, 0);
  const nombre = bloques.sort((a, b) => letrasDe(b) - letrasDe(a))[0] ?? [];
  return { dni: dni.slice(0, 1), nombre, nro: nro.slice(0, 1) };
}

/**
 * Reconstruye la tabla de una página.
 *
 * @param cajas   todo lo que leyó el OCR en la página (fracciones 0-1)
 * @param rejilla geometría de la tabla, o null si la página no tiene líneas
 */
export function leerTabla(cajas: CajaOcr[], rejilla: Rejilla | null): TablaLeida {
  const r = rejilla ?? { ky: 0, kx: 0 };
  const yP = (c: CajaOcr) => yRecta(r, centroX(c), centroY(c));
  const xP = (c: CajaOcr) => xRecta(r, centroX(c), centroY(c));

  // --- Renglones -----------------------------------------------------------
  let bandas: BandaTexto[];
  let tachadas: boolean[] = [];
  let cabecera: CajaOcr[];
  let modoFilas: string;

  if (rejilla) {
    bandas = rejilla.bandas;
    tachadas = rejilla.tachadas;
    // Si la cabecera mide lo mismo que un renglón, la racha uniforme la incluye como
    // si fuera la fila 1: se reconoce por sus títulos y se aparta, o toda la numeración
    // de FilaDoc quedaría corrida en uno.
    const enPrimera = cajas.filter((c) => { const y = yP(c); return y >= bandas[0].top && y < bandas[0].bottom; });
    const titulos = enPrimera.filter((c) => { const k = campoDeCabecera(c.texto); return k && k !== "nro"; });
    let techo: number;
    if (bandas.length > 2 && titulos.length >= 2) {
      techo = bandas[0].top;
      bandas = bandas.slice(1);
      tachadas = tachadas.slice(1);
    } else {
      techo = rejilla.lineaCabecera ?? bandas[0].top - rejilla.altoFila * 2.5;
    }
    const inicio = bandas[0].top;
    cabecera = cajas.filter((c) => { const y = yP(c); return y >= techo - 0.005 && y < inicio + 0.002; });
    modoFilas = "líneas de la tabla";
  } else {
    // Sin rejilla, la cabecera es el renglón que contiene títulos reconocibles; los
    // datos son lo que hay debajo de ella.
    const titulos = cajas.filter((c) => {
      const campo = campoDeCabecera(c.texto);
      return campo === "dni" || campo === "nombre";
    });
    const yCab = titulos.length ? Math.max(...titulos.map((c) => c.y + c.h)) : -1;
    cabecera = titulos.length
      ? cajas.filter((c) => Math.abs(centroY(c) - centroY(titulos[0])) < titulos[0].h * 1.5)
      : [];
    bandas = renglonesPorTexto(cajas.filter((c) => c.y > yCab));
    modoFilas = "agrupación del texto";
  }

  // --- Columnas ------------------------------------------------------------
  let intervalos: Intervalo[] | null = null;
  let modoCols = "contenido de cada renglón";
  if (rejilla) intervalos = columnasDesdeRejilla(rejilla, cabecera);
  if (intervalos && !intervalos.some((iv) => iv.campo === "dni" || iv.campo === "nombre")) {
    // Hay columnas pero la cabecera no se leyó: se deciden por lo que contienen.
    const datos = cajas.filter((c) => { const y = yP(c); return y >= bandas[0].top && y <= bandas[bandas.length - 1].bottom; });
    clasificarPorContenido(intervalos, intervalos.map((iv) => datos.filter((c) => xP(c) >= iv.x0 && xP(c) < iv.x1)));
    modoCols = "líneas verticales + contenido";
  } else if (intervalos) {
    modoCols = "líneas verticales + cabecera";
  }
  if (!intervalos || !intervalos.some((iv) => iv.campo === "dni" || iv.campo === "nombre")) {
    intervalos = columnasDesdeCabecera(cabecera, xP, rejilla ? { x0: rejilla.x0p, x1: rejilla.x1p } : undefined);
    if (intervalos) modoCols = "cabecera";
  }

  // --- Cajas a celdas ------------------------------------------------------
  const porBanda: CajaOcr[][] = bandas.map(() => []);
  for (const c of cajas) {
    const y0 = yRecta(r, centroX(c), c.y), y1 = yRecta(r, centroX(c), c.y + c.h);
    let mejor = -1, solape = 0;
    bandas.forEach((b, i) => {
      const s = Math.min(y1, b.bottom) - Math.max(y0, b.top);
      if (s > solape) { solape = s; mejor = i; }
    });
    // Debe caer mayormente dentro: una caja que solo roza el renglón es de otro.
    if (mejor >= 0 && solape >= (y1 - y0) * 0.45) porBanda[mejor].push(c);
  }

  const filas: FilaLeida[] = [];
  porBanda.forEach((enBanda, i) => {
    if (!enBanda.length) return;
    // Renglón anulado con una raya: la ficha dice que no cuenta.
    if (tachadas[i]) return;
    let celdas: Record<Campo, CajaOcr[]> = { nro: [], nombre: [], dni: [], ocupacion: [], area: [], ignorar: [] };

    if (intervalos) {
      for (const c of enBanda) {
        for (const trozo of partirPorColumnas(c, intervalos, xP)) {
          const iv = columnaDe(trozo, intervalos, xP);
          if (iv?.campo) celdas[iv.campo].push(trozo);
        }
      }
    } else {
      const rep = repartirPorContenido(enBanda, xP);
      celdas = { ...celdas, ...rep };
    }

    // Letra que desborda su celda: un apellido grande que empieza encima de la columna
    // del Nro, o que se alarga hasta la del DNI. Las palabras con letras no son ni un
    // Nro ni un DNI, así que vuelven al nombre.
    const conLetras = (c: CajaOcr) => !esNumerico(c.texto) && contar(c.texto).letras >= 2;
    const iNombre = intervalos?.findIndex((iv) => iv.campo === "nombre") ?? -1;
    const iDni = intervalos?.findIndex((iv) => iv.campo === "dni") ?? -1;
    if (iNombre >= 0) {
      celdas.nombre.push(...celdas.nro.filter(conLetras));
      celdas.nro = celdas.nro.filter((c) => !conLetras(c));
      if (iDni === iNombre + 1) {
        celdas.nombre.push(...celdas.dni.filter(conLetras));
        celdas.dni = celdas.dni.filter((c) => !conLetras(c));
      }
    }

    let nombre = limpiarNombre(unir(celdas.nombre, xP));
    let dni = limpiarDni(unir(celdas.dni, xP));

    // Un DNI escrito dentro de la celda del nombre (o una caja que tomó ambas celdas).
    if (!dni) {
      const m = unir(celdas.nombre, xP).match(/\d[\d\s]{5,}\d/);
      if (m) dni = limpiarDni(m[0]);
    }
    // Texto impreso de la cabecera que cayó en el primer renglón.
    if (campoDeCabecera(nombre) === "nombre" && !dni) return;
    if (nombre.replace(/\s/g, "").length < 3) nombre = nombre.replace(/\s/g, "").length ? nombre : "";
    if (!nombre && dni.length < 5) return; // renglón vacío o con garabatos

    const textoNro = unir(celdas.nro, xP);
    const nroLeido = esNumerico(textoNro) ? aCifras(textoNro).replace(/^0+/, "") : "";
    const confs = [...celdas.nombre, ...celdas.dni].map((c) => c.conf);
    filas.push({
      filaDoc: i + 1,
      nro: nroLeido && nroLeido.length <= 3 ? nroLeido : String(i + 1),
      nombre,
      dni,
      ocupacion: limpiarTexto(unir(celdas.ocupacion, xP)),
      area: limpiarTexto(unir(celdas.area, xP)),
      conf: media(confs),
    });
  });

  // --- Anclas para la app (0-1000) -----------------------------------------
  const x0 = rejilla ? rejilla.x0 : Math.min(...cajas.map((c) => c.x), 0.05);
  const x1 = rejilla ? rejilla.x1 : Math.max(...cajas.map((c) => c.x + c.w), 0.95);
  const xc = (x0 + x1) / 2;
  const centro = (b: BandaTexto) => yReal(r, xc, (b.top + b.bottom) / 2);
  const mil = (v: number) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
  const primera = bandas[0], ultima = bandas[bandas.length - 1];

  return {
    filas,
    anclas: primera
      ? { yPrimera: mil(centro(primera)), xIzq: mil(x0), yUltima: mil(centro(ultima)), xDer: mil(x1) }
      : { yPrimera: 0, xIzq: 0, yUltima: 0, xDer: 1000 },
    totalFilas: bandas.length,
    modo: `renglones por ${modoFilas}; columnas por ${modoCols}`,
  };
}

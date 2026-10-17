// Análisis geométrico de la ficha (visión clásica, sin modelos).
//
// La ficha de asistencia es una tabla con renglones ruled. Saber dónde están sus líneas
// resuelve tres problemas que el OCR solo no resuelve:
//
//  1. En qué renglón cae cada palabra leída (FilaDoc) y dónde marcarla en el visor.
//  2. En qué columna cae (nombre, DNI, área...), con las líneas verticales.
//  3. Limpiar la imagen antes de leerla: una línea vertical pegada a un DNI se lee como
//     un "1" de más, y una horizontal une dos renglones en una sola caja de texto.
//
// Todo es fotométrico o de medida: nada mueve píxeles. Las coordenadas que salen de aquí
// valen tal cual sobre la página original que se ve en el visor.
//
// Funciones puras sobre un buffer RGBA: no tocan el DOM, así que también corren en Node
// para probarlas.

export interface ImagenRGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Banda {
  top: number;    // fracción 0-1, en coordenadas "enderezadas" (ver Rejilla)
  bottom: number;
}

/**
 * Geometría de la tabla. Las fotos de móvil suelen venir algo giradas, así que las
 * posiciones se guardan en un sistema enderezado por cizalla, que para ángulos pequeños
 * (±4°) equivale a rotar sin mover un solo píxel de la imagen:
 *
 *   y' = y - x·ky        (renglones)
 *   x' = x + y·kx        (columnas)
 *
 * con x, y en fracciones 0-1 de la página.
 */
export interface Rejilla {
  ky: number;
  kx: number;
  /** Renglones de datos (el 1.º es la fila 1 de la ficha), en y' fraccional. */
  bandas: Banda[];
  /** Línea horizontal inmediatamente encima de la primera banda (inicio de la cabecera). */
  lineaCabecera: number | null;
  /** Líneas verticales dentro de la tabla, en x' fraccional y ordenadas. */
  verticales: number[];
  /** Bordes izquierdo y derecho de la tabla (x fraccional). */
  x0: number;
  x1: number;
  /** Los mismos bordes en x' (enderezada), que es en lo que están `verticales`. */
  x0p: number;
  x1p: number;
  /** Alto medio de un renglón en fracción de página. */
  altoFila: number;
  /** Renglones anulados con una raya que los cruza (alineado con `bandas`). */
  tachadas: boolean[];
}

const UMBRAL_OSCURO = 150;

export function binarizar(img: ImagenRGBA, umbral = UMBRAL_OSCURO): Uint8Array {
  const { data, width, height } = img;
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    out[i] = lum < umbral ? 1 : 0;
  }
  return out;
}

/**
 * Píxeles que pertenecen a trazos horizontales largos. Se usan para estimar el giro:
 * así la letra manuscrita, que no tiene dirección dominante, no mete ruido.
 */
function trazosHorizontales(bin: Uint8Array, W: number, H: number, minLargo: number): Int32Array {
  const pts: number[] = [];
  for (let y = 0; y < H; y++) {
    const fila = y * W;
    let x = 0;
    while (x < W) {
      if (!bin[fila + x]) { x++; continue; }
      const ini = x;
      while (x < W && bin[fila + x]) x++;
      if (x - ini >= minLargo) {
        // Uno de cada 2 píxeles basta y reduce el coste a la mitad.
        for (let k = ini; k < x; k += 2) pts.push(k, y);
      }
    }
  }
  return Int32Array.from(pts);
}

/** Pendiente (tan del ángulo) que deja las líneas horizontales más nítidas. */
export function estimarInclinacion(bin: Uint8Array, W: number, H: number): number {
  const pts = trazosHorizontales(bin, W, H, Math.max(12, Math.round(W * 0.015)));
  if (pts.length < 200) return 0;

  const offset = Math.ceil(W * Math.tan((5 * Math.PI) / 180)) + 2;
  const hist = new Float64Array(H + 2 * offset + 2);
  const puntuar = (t: number) => {
    hist.fill(0);
    for (let i = 0; i < pts.length; i += 2) {
      const yp = Math.round(pts[i + 1] - pts[i] * t) + offset;
      hist[yp]++;
    }
    let s = 0;
    for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    return s;
  };

  let mejorT = 0, mejor = -1;
  for (let g = -4; g <= 4.0001; g += 0.1) {
    const t = Math.tan((g * Math.PI) / 180);
    const s = puntuar(t);
    if (s > mejor) { mejor = s; mejorT = t; }
  }
  const g0 = (Math.atan(mejorT) * 180) / Math.PI;
  for (let g = g0 - 0.1; g <= g0 + 0.1001; g += 0.02) {
    const t = Math.tan((g * Math.PI) / 180);
    const s = puntuar(t);
    if (s > mejor) { mejor = s; mejorT = t; }
  }
  return mejorT;
}

interface Linea { pos: number; x0: number; x1: number } // en píxeles de análisis (y' o x')

/** Agrupa posiciones de un perfil que superan el umbral en líneas (centro ponderado). */
function picos(perfil: Float64Array, umbral: number, offset: number, fusion: number): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < perfil.length) {
    if (perfil[i] < umbral) { i++; continue; }
    let peso = 0, suma = 0;
    while (i < perfil.length && perfil[i] >= umbral) {
      peso += perfil[i]; suma += perfil[i] * i; i++;
    }
    const centro = suma / peso - offset;
    // Doble trazo o línea gruesa partida: es la misma línea.
    if (out.length && centro - out[out.length - 1] < fusion) {
      out[out.length - 1] = (out[out.length - 1] + centro) / 2;
    } else {
      out.push(centro);
    }
  }
  return out;
}

function lineasHorizontales(bin: Uint8Array, W: number, H: number, t: number): Linea[] {
  const offset = Math.ceil(W * Math.abs(t)) + 2;
  const perfil = new Float64Array(H + 2 * offset + 2);
  for (let y = 0; y < H; y++) {
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      if (bin[fila + x]) perfil[Math.round(y - x * t) + offset]++;
    }
  }
  // Un renglón manuscrito oscurece como mucho un 10-20 % del ancho; una línea de la
  // tabla, casi todo. 30 % separa bien ambos aunque la tabla no ocupe la página entera.
  const centros = picos(perfil, W * 0.3, offset, Math.max(3, H * 0.004));

  // Extensión horizontal de cada línea: el tramo continuo más largo sobre ella.
  return centros.map((c) => {
    const ocupado = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      const yBase = c + x * t;
      for (let d = -2; d <= 2; d++) {
        const y = Math.round(yBase + d);
        if (y >= 0 && y < H && bin[y * W + x]) { ocupado[x] = 1; break; }
      }
    }
    const hueco = Math.max(4, Math.round(W * 0.01));
    let mejor = { x0: 0, x1: 0 }, ini = -1, ultimo = -1;
    for (let x = 0; x <= W; x++) {
      if (x < W && ocupado[x]) {
        if (ini < 0) ini = x;
        ultimo = x;
      } else if (ini >= 0 && (x === W || x - ultimo > hueco)) {
        if (ultimo - ini > mejor.x1 - mejor.x0) mejor = { x0: ini, x1: ultimo };
        ini = -1;
      }
    }
    return { pos: c, ...mejor };
  });
}

/**
 * Un renglón anulado con una raya hecha con regla parece una línea más de la tabla y
 * parte ese renglón en dos, lo que rompe la racha uniforme y desplaza la numeración.
 * Si dos huecos seguidos suman lo que mide un renglón normal, la línea del medio es una
 * raya: se quita (el renglón se marca luego como tachado en detectarTachadas).
 */
function quitarRayas(lineas: Linea[]): Linea[] {
  if (lineas.length < 4) return lineas;
  const gaps = lineas.slice(1).map((l, i) => l.pos - lineas[i].pos).sort((a, b) => a - b);
  const tipico = gaps[Math.floor(gaps.length / 2)];
  const out = [lineas[0]];
  for (let i = 1; i < lineas.length; i++) {
    const prev = out[out.length - 1];
    const sig = lineas[i + 1];
    const corto = lineas[i].pos - prev.pos < tipico * 0.85;
    if (corto && sig && Math.abs(sig.pos - prev.pos - tipico) <= tipico * 0.15) continue;
    out.push(lineas[i]);
  }
  return out;
}

/**
 * La racha más larga de líneas con separación casi uniforme es el cuerpo de la tabla:
 * la cabecera y los bloques de datos del formulario tienen alturas irregulares.
 */
function rachaUniforme(lineas: Linea[], minGap: number): { ini: number; len: number } | null {
  const gaps: number[] = [];
  for (let i = 1; i < lineas.length; i++) gaps.push(lineas[i].pos - lineas[i - 1].pos);
  const parecido = (a: number, b: number) => Math.abs(a - b) <= 0.35 * Math.max(a, b);
  let mejor = { ini: 0, len: 0 };
  let i = 0;
  while (i < gaps.length) {
    if (gaps[i] < minGap) { i++; continue; }
    let j = i;
    while (j + 1 < gaps.length && gaps[j + 1] >= minGap && parecido(gaps[j + 1], gaps[i])) j++;
    if (j - i + 1 > mejor.len) mejor = { ini: i, len: j - i + 1 };
    i = j + 1;
  }
  if (mejor.len < 2) return null;

  // La tolerancia del 35 % deja entrar en la racha la cabecera de la tabla o el pie
  // cuando miden algo más que un renglón. Se recortan los extremos que se alejan de la
  // mediana de la racha: un renglón de datos mide casi exactamente lo mismo que otro.
  const enRacha = gaps.slice(mejor.ini, mejor.ini + mejor.len).sort((a, b) => a - b);
  const mediana = enRacha[Math.floor(enRacha.length / 2)];
  const fuera = (g: number) => Math.abs(g - mediana) > mediana * 0.15;
  while (mejor.len > 2 && fuera(gaps[mejor.ini])) { mejor.ini++; mejor.len--; }
  while (mejor.len > 2 && fuera(gaps[mejor.ini + mejor.len - 1])) mejor.len--;
  return mejor;
}

function lineasVerticales(
  bin: Uint8Array, W: number, H: number, t: number, yTop: number, yBot: number
): number[] {
  // x' = x + y·t  (la misma rotación vista desde el otro eje)
  const offset = Math.ceil(H * Math.abs(t)) + 2;
  const perfil = new Float64Array(W + 2 * offset + 2);
  for (let y = 0; y < H; y++) {
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      if (!bin[fila + x]) continue;
      const yp = y - x * t;
      if (yp < yTop || yp > yBot) continue;
      perfil[Math.round(x + y * t) + offset]++;
    }
  }
  return picos(perfil, (yBot - yTop) * 0.5, offset, Math.max(3, W * 0.004));
}

/**
 * Renglones anulados: una raya recta (horizontal o en diagonal, la "z" de las fichas)
 * que cruza al menos media tabla por dentro del renglón. La letra manuscrita nunca
 * cubre tanto ancho a lo largo de una sola recta, así que no da falsos positivos.
 */
function detectarTachadas(
  bin: Uint8Array, W: number, H: number, t: number,
  cuerpo: Linea[], x0: number, x1: number
): boolean[] {
  const oscuro = (x: number, y: number) => {
    const yi = Math.round(y);
    for (let d = -1; d <= 1; d++) {
      const yy = yi + d;
      if (yy >= 0 && yy < H && bin[yy * W + x]) return true;
    }
    return false;
  };
  const margen = (x1 - x0) * 0.03;
  const xa = Math.max(0, Math.round(x0 + margen)), xb = Math.min(W - 1, Math.round(x1 - margen));
  const xm = (xa + xb) / 2, semiancho = Math.max(1, (xb - xa) / 2);
  const out: boolean[] = [];
  for (let k = 1; k < cuerpo.length; k++) {
    const top = cuerpo[k - 1].pos, bot = cuerpo[k].pos, h = bot - top;
    // Pendiente máxima: la raya no puede salirse del renglón más de un 10 % por arriba
    // o por abajo (una de esquina a esquina llega justo a los bordes).
    const sMax = (h * 0.6) / semiancho;
    let tachada = false;
    for (let s = -sMax; s <= sMax + 1e-9 && !tachada; s += Math.max(sMax / 8, 0.002)) {
      for (let m = top + h * 0.25; m <= top + h * 0.75 && !tachada; m += 2) {
        let hits = 0, n = 0;
        for (let x = xa; x <= xb; x += 3) {
          const yp = m + s * (x - xm);
          n++;
          if (oscuro(x, yp + x * t)) hits++;
        }
        if (hits / n >= 0.5) tachada = true;
      }
    }
    out.push(tachada);
  }
  return out;
}

/**
 * Detecta la rejilla de la tabla. Devuelve null si la página no tiene una tabla ruled
 * reconocible (lista en hoja blanca, foto muy torcida): entonces el llamador agrupa los
 * renglones a partir del propio texto.
 */
export function detectarRejilla(img: ImagenRGBA): Rejilla | null {
  const W = img.width, H = img.height;
  if (W < 50 || H < 50) return null;
  const bin = binarizar(img);
  const t = estimarInclinacion(bin, W, H);

  // Un renglón escrito con letra gruesa y apretada puede oscurecer tanto como una línea,
  // pero no es continuo de borde a borde: las líneas de verdad cruzan toda la tabla.
  const candidatas = lineasHorizontales(bin, W, H, t);
  const extMax = Math.max(0, ...candidatas.map((l) => l.x1 - l.x0));
  const lineas = quitarRayas(candidatas.filter((l) => l.x1 - l.x0 >= extMax * 0.6));
  if (lineas.length < 3) return null;
  const racha = rachaUniforme(lineas, Math.max(8, H * 0.012));
  if (!racha) return null;

  const cuerpo = lineas.slice(racha.ini, racha.ini + racha.len + 1);
  const bandas: Banda[] = [];
  for (let k = 1; k < cuerpo.length; k++) {
    bandas.push({ top: cuerpo[k - 1].pos / H, bottom: cuerpo[k].pos / H });
  }
  const altoFila = bandas.reduce((s, b) => s + (b.bottom - b.top), 0) / bandas.length;
  const previa = racha.ini > 0 ? lineas[racha.ini - 1].pos / H : null;
  // Si la línea anterior está muy lejos no es el borde de la cabecera de la tabla.
  const lineaCabecera = previa !== null && cuerpo[0].pos / H - previa < altoFila * 4 ? previa : null;

  // Bordes de la tabla: mediana de las extensiones de sus líneas (alguna puede venir
  // cortada por una firma o un doblez).
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const x0 = med(cuerpo.map((l) => l.x0)) / W;
  const x1 = med(cuerpo.map((l) => l.x1)) / W;

  const yTop = (lineaCabecera ?? cuerpo[0].pos / H) * H;
  const yBot = cuerpo[cuerpo.length - 1].pos;
  // x0/x1 son x reales medidas sobre la línea central de la tabla; las verticales
  // vienen en x'. Con la foto girada, la diferencia entre ambas es de varios puntos y
  // haría que el borde izquierdo pareciera una columna más.
  const kx = (t * H) / W, ky = (t * W) / H;
  const yMedio = (yTop + yBot) / 2 / H;
  const x0p = x0 + (yMedio + x0 * ky) * kx;
  const x1p = x1 + (yMedio + x1 * ky) * kx;
  const verticales = lineasVerticales(bin, W, H, t, yTop, yBot)
    .map((v) => v / W)
    .filter((v) => v > x0p - 0.02 && v < x1p + 0.02);

  return {
    ky,
    kx,
    bandas,
    tachadas: detectarTachadas(bin, W, H, t, cuerpo, x0 * W, x1 * W),
    lineaCabecera,
    verticales,
    x0,
    x1,
    x0p,
    x1p,
    altoFila,
  };
}

/** Coordenada y enderezada de un punto (fracciones). */
export const yRecta = (r: Pick<Rejilla, "ky">, x: number, y: number) => y - x * r.ky;
/** Coordenada x enderezada de un punto (fracciones). */
export const xRecta = (r: Pick<Rejilla, "kx">, x: number, y: number) => x + y * r.kx;
/** Vuelve de y' a la y real de la página, a la altura horizontal x. */
export const yReal = (r: Pick<Rejilla, "ky">, x: number, yPrima: number) => yPrima + x * r.ky;

/**
 * Borra de la imagen las líneas de la tabla (tramos rectos muy largos) para que el OCR
 * no las lea como "1", "l" o "|" y no una dos celdas en una sola caja.
 *
 * Trabaja sobre una copia; los trazos manuscritos que cruzan una línea pierden uno o
 * dos píxeles en el cruce, que el reconocedor tolera sin problema.
 */
export function borrarLineas(img: ImagenRGBA, altoFilaPx?: number): ImagenRGBA {
  const W = img.width, H = img.height;
  const bin = binarizar(img, 170);
  const borrar = new Uint8Array(W * H);
  const minH = Math.max(30, Math.round(W * 0.03));
  const minV = Math.max(30, Math.round(altoFilaPx ? altoFilaPx * 1.3 : H * 0.04));

  for (let y = 0; y < H; y++) {
    const fila = y * W;
    let x = 0;
    while (x < W) {
      if (!bin[fila + x]) { x++; continue; }
      const ini = x;
      while (x < W && bin[fila + x]) x++;
      if (x - ini >= minH) for (let k = ini; k < x; k++) borrar[fila + k] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!bin[y * W + x]) { y++; continue; }
      const ini = y;
      while (y < H && bin[y * W + x]) y++;
      if (y - ini >= minV) for (let k = ini; k < y; k++) borrar[k * W + x] = 1;
    }
  }

  const out = new Uint8ClampedArray(img.data);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!borrar[y * W + x]) continue;
      // Un píxel de margen alrededor: el borde antialias de la línea también se lee.
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const o = (yy * W + xx) * 4;
          out[o] = out[o + 1] = out[o + 2] = 255;
        }
      }
    }
  }
  return { data: out, width: W, height: H };
}

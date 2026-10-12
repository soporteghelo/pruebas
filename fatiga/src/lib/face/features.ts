// Rasgos por cuadro a partir del resultado de MediaPipe Face Landmarker (478 puntos,
// blendshapes y matriz de transformación facial).

export interface Punto {
  x: number;
  y: number;
}

/** Una medición por cuadro de video. Los campos opcionales faltan si no hay rostro. */
export interface Muestra {
  t: number; // ms (performance.now)
  rostro: boolean;
  ear?: number; // relación de aspecto del ojo, promedio de ambos ojos
  parpadeo?: number; // blendshape eyeBlink promedio (0 abierto … 1 cerrado)
  mandibula?: number; // blendshape jawOpen
  pitch?: number; // grados
  yaw?: number; // grados
  tamano?: number; // distancia entre comisuras externas de los ojos / ancho de imagen
  luz?: number; // luminancia media 0-255
}

// Índices de la malla de 478 puntos: [comisura ext., párpado sup. ×2, comisura int., párpado inf. ×2]
export const OJO_DER = [33, 160, 158, 133, 153, 144];
export const OJO_IZQ = [362, 385, 387, 263, 373, 380];

const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);

/** EAR (Soukupová y Čech, 2016): (|p2−p6| + |p3−p5|) / (2·|p1−p4|), en píxeles. */
export function ear(pts: Punto[], idx: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => pts[i]);
  const ancho = dist(p1, p4);
  return ancho > 0 ? (dist(p2, p6) + dist(p3, p5)) / (2 * ancho) : 0;
}

/**
 * Ángulos de la cabeza desde la matriz 4×4 de MediaPipe (orden por columnas).
 * Solo se usan cambios relativos, así que el signo de cada eje no es crítico.
 */
export function angulos(m: number[]): { pitch: number; yaw: number; roll: number } {
  const r = (fila: number, col: number) => m[col * 4 + fila];
  const g = 180 / Math.PI;
  return {
    pitch: Math.atan2(r(2, 1), r(2, 2)) * g,
    yaw: Math.asin(Math.max(-1, Math.min(1, -r(2, 0)))) * g,
    roll: Math.atan2(r(1, 0), r(0, 0)) * g,
  };
}

interface ResultadoMp {
  faceLandmarks: { x: number; y: number }[][];
  faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  facialTransformationMatrixes?: { data: number[] }[];
}

export function muestraDesde(res: ResultadoMp, t: number, ancho: number, alto: number): Muestra {
  const lm = res.faceLandmarks?.[0];
  if (!lm || lm.length < 400) return { t, rostro: false };
  // A píxeles: el EAR debe calcularse con la proporción real de la imagen.
  const pts = lm.map((p) => ({ x: p.x * ancho, y: p.y * alto }));
  const m: Muestra = {
    t,
    rostro: true,
    ear: (ear(pts, OJO_DER) + ear(pts, OJO_IZQ)) / 2,
    tamano: dist(pts[33], pts[263]) / ancho,
  };
  const bs = res.faceBlendshapes?.[0]?.categories;
  if (bs) {
    const v = (n: string) => bs.find((c) => c.categoryName === n)?.score;
    const l = v("eyeBlinkLeft");
    const r = v("eyeBlinkRight");
    if (l !== undefined && r !== undefined) m.parpadeo = (l + r) / 2;
    m.mandibula = v("jawOpen");
  }
  const mat = res.facialTransformationMatrixes?.[0]?.data;
  if (mat && mat.length === 16) {
    const a = angulos(mat);
    m.pitch = a.pitch;
    m.yaw = a.yaw;
  }
  return m;
}

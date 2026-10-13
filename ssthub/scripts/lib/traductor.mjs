// Traducción inglés → español en la propia computadora, con el modelo libre Helsinki-NLP opus-mt-en-es
// (librería Transformers.js). No depende de ningún servicio: solo baja el modelo la primera vez (~100 MB)
// y después funciona sin internet, sin límites ni bloqueos.
let modelo = null;

// Términos de SST que el modelo traduce mal: se dejan en español antes de traducir…
const ANTES = [
  [/\block[\s-]*out[\s/-]*tag[\s-]*out\b/gi, 'bloqueo y etiquetado'],
  [/\bconfined spaces\b/gi, 'espacios confinados'],
  [/\bconfined space\b/gi, 'espacio confinado'],
  [/\bnear[\s-]miss(es)?\b/gi, 'cuasi accidente'],
  [/\btoolbox talks?\b/gi, 'charla de seguridad'],
  [/\bhot work\b/gi, 'trabajo en caliente'],
  [/\bpermit[\s-]to[\s-]work\b/gi, 'permiso de trabajo'],
  [/\bjob (safety|hazard) analysis\b/gi, 'análisis de trabajo seguro (ATS)'],
  [/\b(JSA|JHA)\b/g, 'ATS'],
  [/\bPPE\b/g, 'EPP'],
  [/\bSDS\b/g, 'hoja de datos de seguridad'],
  [/\bhazmat\b/gi, 'materiales peligrosos'],
];
// …y se corrigen giros frecuentes después de traducir.
const DESPUES = [
  [/\bespacios limitados\b/gi, 'espacios confinados'],
  [/\bespacio limitado\b/gi, 'espacio confinado'],
  [/\b(etiqueta|etiquetado) de bloqueo\b/gi, 'bloqueo y etiquetado'],
  [/\bestrés calor\b/gi, 'estrés por calor'],
  [/\bcarretilla elevadora\b/gi, 'montacargas'],
];
const aplicar = (texto, reglas) => reglas.reduce((t, [re, por]) => t.replace(re, por), texto);

export async function traducirLocal(textos, { lote = 32, alTraducir } = {}) {
  if (!modelo) {
    const { pipeline } = await import('@huggingface/transformers');
    modelo = await pipeline('translation', 'Xenova/opus-mt-en-es', { dtype: 'q8' });
  }
  const limpios = [...new Set(textos.map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  const salida = new Map();
  for (let k = 0; k < limpios.length; k += lote) {
    const tanda = limpios.slice(k, k + lote);
    const res = await modelo(tanda.map((t) => aplicar(t, ANTES)), { max_new_tokens: 200 });
    const pares = tanda.map((t, j) => [t, aplicar(String(res[j]?.translation_text || '').trim(), DESPUES)]).filter(([, x]) => x);
    for (const [t, x] of pares) salida.set(t, x);
    await alTraducir?.(pares, { hechos: Math.min(k + lote, limpios.length), total: limpios.length });
  }
  return salida;
}

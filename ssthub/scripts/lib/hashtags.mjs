// Hashtags: los curados de config/hashtags.json (se detectan por palabras clave)
// más los que las fuentes escriben en sus descripciones (#SST, #SeguridadMinera...).
import { normalizar } from './util.mjs';
import { patron } from './clasificador.mjs';

export const idHashtag = (s) => normalizar(s).replace(/[^a-z0-9]/g, '');

// "#SeguridadMinera" en texto plano; ignora entidades HTML (&#8220;) y números sueltos (#1).
export function extraerHashtags(texto = '') {
  return [...String(texto).matchAll(/(?:^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]{3,40})/gu)]
    .map((m) => m[1])
    .filter((h) => !/^\d+$/.test(h));
}

export function crearEtiquetador(config) {
  const ignorar = new Set((config.ignorar ?? []).map(idHashtag));
  const curados = Object.entries(config.hashtags ?? {}).map(([etiqueta, palabras]) => ({
    id: idHashtag(etiqueta),
    etiqueta,
    reglas: palabras.map(patron),
  }));
  const porId = new Map(curados.map((c) => [c.id, c]));

  return {
    max: config.maxPorItem ?? 5,
    minimoOriginales: config.minimoOriginales ?? 3,
    etiquetaCurada: (id) => porId.get(id)?.etiqueta,

    // Devuelve los hashtags curados ordenados por fuerza y los originales candidatos.
    etiquetar(item) {
      const titulo = normalizar(item.titulo);
      const resto = normalizar([item.resumen, ...(item.etiquetasFuente ?? [])].join(' | '));
      const puntos = new Map();
      for (const c of curados) {
        if (c.reglas.some((re) => re.test(titulo))) puntos.set(c.id, 3);
        else if (c.reglas.some((re) => re.test(resto))) puntos.set(c.id, 1);
      }
      const originales = [];
      for (const h of item.hashtagsFuente ?? []) {
        const id = idHashtag(h);
        if (!id || id.length < 3 || ignorar.has(id)) continue;
        if (porId.has(id)) puntos.set(id, (puntos.get(id) ?? 0) + 2);
        else if (!originales.some((o) => o.id === id)) originales.push({ id, etiqueta: h });
      }
      return {
        curados: [...puntos].sort((a, b) => b[1] - a[1]).map(([id]) => id),
        originales,
      };
    },
  };
}

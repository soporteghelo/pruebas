// Clasificador por palabras clave con puntaje. Sin costo, determinista y editable desde config/categorias.json.
// Asigna TEMAS (de qué riesgo trata) y SECTORES (en qué industria aplica).
import { normalizar } from './util.mjs';

const PESO = { fuertes: 3, debiles: 1 };
const MULTIPLICADOR_CAMPO = { titulo: 3, etiquetas: 2, resumen: 1 };
const PUNTOS_PISTA = 6;
const PUNTOS_PISTA_SECTOR = 2; // la fuente sugiere el sector, pero el texto debe confirmarlo

// "linea* de vida" → coincide con "línea de vida", "lineas de vida", "LÍNEAS-DE-VIDA"...
export function patron(palabra) {
  const base = normalizar(palabra).trim().split('*')
    .map((parte) => parte
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '[\\s-]+')
      .replace(/-(?!\]|\+)/g, '[-\\s]?'))
    .join('[a-z0-9]*');
  return new RegExp(`(?<![a-z0-9])${base}(?![a-z0-9])`);
}

const reglasDe = (c) => Object.entries(PESO).flatMap(([tipo, peso]) => (c[tipo] ?? []).map((p) => [patron(p), peso]));

export function crearClasificador(config) {
  const umbral = config.umbral ?? 3;
  const umbralRelevancia = config.umbralRelevancia ?? 4;
  const maxCategorias = config.maxCategoriasPorItem ?? 4;
  const maxSectores = config.maxSectoresPorItem ?? 2;
  const categorias = config.categorias.map((c) => ({
    id: c.id,
    generica: Boolean(c.generica),
    prioridad: c.prioridad ?? 1,
    // Los formatos (charlas) no prueban por sí solos que algo sea de seguridad.
    cuentaRelevancia: c.cuentaRelevancia !== false,
    reglas: reglasDe(c),
  }));
  const sectores = (config.sectores ?? []).map((s) => ({ id: s.id, reglas: reglasDe(s) }));
  const idGenerica = categorias.find((c) => c.generica)?.id;
  const ids = new Set(categorias.map((c) => c.id));
  const idsSector = new Set(sectores.map((s) => s.id));
  const excluirGlobal = (config.excluirGlobal ?? []).map(patron);
  // "Seguridad y Salud Ocupacional" es el nombre del área, no habla de salud ocupacional: para los temas
  // específicos esas frases genéricas se reemplazan por "sst" antes de buscar palabras clave.
  const genericas = (config.frasesGenericas ?? []).map((f) => new RegExp(patron(f).source, 'g'));
  const sinGenericas = (t) => genericas.reduce((x, re) => x.replace(re, ' sst '), t);

  return {
    ids,
    idsSector,
    idGenerica,

    excluido(titulo, extra = []) {
      const t = normalizar(titulo);
      return [...excluirGlobal, ...extra.map(patron)].some((re) => re.test(t));
    },

    /**
     * @param item        { titulo, resumen, etiquetasFuente }
     * @param pista       id de tema forzado (fuente, búsqueda o enlace manual)
     * @param pistaSector id de sector sugerido por la fuente
     * @returns { categorias, sectores, relevancia, relevante }
     */
    clasificar(item, pista, pistaSector) {
      const campos = [
        [normalizar(item.titulo), MULTIPLICADOR_CAMPO.titulo],
        [normalizar((item.etiquetasFuente ?? []).join(' | ')), MULTIPLICADOR_CAMPO.etiquetas],
        [normalizar(item.resumen), MULTIPLICADOR_CAMPO.resumen],
      ].filter(([t]) => t);
      const camposEspecificos = campos.map(([t, m]) => [sinGenericas(t), m]);

      const puntajes = new Map();
      let relevancia = 0; // solo palabras fuertes de temas de seguridad
      for (const c of categorias) {
        let p = 0;
        for (const [re, peso] of c.reglas) {
          for (const [texto, mult] of c.generica ? campos : camposEspecificos) {
            if (!re.test(texto)) continue;
            p += peso * mult;
            if (c.cuentaRelevancia && peso === PESO.fuertes) relevancia += peso * mult;
          }
        }
        if (p) puntajes.set(c.id, p);
      }
      if (pista && ids.has(pista)) puntajes.set(pista, (puntajes.get(pista) ?? 0) + PUNTOS_PISTA);

      let elegidas = categorias
        .filter((c) => !c.generica && (puntajes.get(c.id) ?? 0) >= umbral)
        .map((c) => ({ id: c.id, orden: puntajes.get(c.id) * c.prioridad }))
        .sort((a, b) => b.orden - a.orden)
        .map((c) => c.id);
      if (pista && ids.has(pista)) elegidas = [pista, ...elegidas.filter((id) => id !== pista)];
      if (!elegidas.length && idGenerica) elegidas = [idGenerica];

      const puntajesSector = new Map();
      for (const s of sectores) {
        let p = 0;
        for (const [re, peso] of s.reglas) for (const [texto, mult] of campos) if (re.test(texto)) p += peso * mult;
        if (p) puntajesSector.set(s.id, p);
      }
      if (pistaSector && puntajesSector.has(pistaSector)) puntajesSector.set(pistaSector, puntajesSector.get(pistaSector) + PUNTOS_PISTA_SECTOR);
      const sectoresElegidos = [...puntajesSector]
        .filter(([, p]) => p >= umbral)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxSectores)
        .map(([id]) => id);

      return {
        categorias: elegidas.slice(0, maxCategorias),
        sectores: sectoresElegidos,
        relevancia,
        relevante: Boolean(pista) || relevancia >= umbralRelevancia,
      };
    },
  };
}

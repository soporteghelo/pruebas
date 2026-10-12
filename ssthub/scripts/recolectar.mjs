#!/usr/bin/env node
// Recolector del Portal SST.
// 1) Lee las fuentes (YouTube por RSS o por API, blogs por RSS, búsquedas de YouTube y enlaces manuales).
// 2) Acumula todo en data/biblioteca.json, así la biblioteca crece aunque los feeds solo muestren lo último.
// 3) Clasifica por tema y sector, pone hashtags, arma las listas destacadas
//    y escribe public/data/contenido.js, que es lo único que carga la página.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  obtener, enParalelo, hash, slug, normalizar, textoPlano, limpiarTitulo, urlCanonica, dominio, fechaISO, leerJson, escribirJson,
} from './lib/util.mjs';
import {
  leerFeed, urlFeedYoutube, canalDe, listarPlaylist, listasDeCanal, playlistDeSubidas, idYoutube, miniaturaYoutube,
  oembedYoutube, buscarYoutube, detallesYoutube, leerMetaPagina,
} from './lib/lectores.mjs';
import { crearClasificador } from './lib/clasificador.mjs';
import { crearEtiquetador, extraerHashtags, idHashtag } from './lib/hashtags.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => path.join(RAIZ, p);
const RUTA_BIBLIOTECA = R('data/biblioteca.json');
const RUTA_SALIDA = R('public/data/contenido.js');
const RUTA_CACHE_LISTAS = R('data/listas-canales.json');

const esPdf = (u) => /\.pdf(\?|#|$)/i.test(u);
const pareceMiniaturaChica = (u) => /-\d{2,3}x\d{2,3}\.(jpe?g|png|webp)/i.test(u || '');
const hashtagsDe = (...textos) => [...new Set(textos.flatMap((t) => extraerHashtags(textoPlano(t, 6000))))].slice(0, 15);

export function idDeEnlace(valor) {
  const v = String(valor).trim();
  if (/^(yt|a)-[\w-]+$/.test(v)) return v;
  const yt = idYoutube(v);
  return yt ? `yt-${yt}` : `a-${hash(urlCanonica(v))}`;
}

function desdeEntrada(e, f) {
  const hashtagsFuente = hashtagsDe(e.titulo, e.html);
  return {
    id: e.ytId ? `yt-${e.ytId}` : `a-${hash(urlCanonica(e.url))}`,
    tipo: e.ytId ? 'video' : esPdf(e.url) ? 'documento' : f.tipoContenido || 'articulo',
    titulo: textoPlano(e.titulo, 200),
    url: e.url,
    miniatura: e.imagen || null,
    ytId: e.ytId || undefined,
    short: e.short || undefined,
    fuenteId: f.id,
    fuente: f.nombre,
    idioma: f.idioma || 'es',
    fecha: fechaISO(e.fecha),
    resumen: textoPlano(e.resumenHtml || e.html, 400),
    etiquetasFuente: e.etiquetas?.length ? e.etiquetas.slice(0, 12) : undefined,
    hashtagsFuente: hashtagsFuente.length ? hashtagsFuente : undefined,
    vistas: e.vistas,
    origen: 'fuente',
  };
}

async function resolverManual(e) {
  const base = { origen: 'manual', fuenteId: 'manual', pista: e.categoria, idioma: e.idioma || 'es' };
  const ytId = idYoutube(e.url);
  if (ytId) {
    const o = await oembedYoutube(e.url).catch(() => ({}));
    return {
      ...base,
      id: `yt-${ytId}`,
      tipo: 'video',
      titulo: textoPlano(e.titulo || o.title || 'Video de YouTube', 200),
      url: e.url,
      miniatura: e.miniatura || miniaturaYoutube(ytId),
      ytId,
      short: /\/shorts\//.test(e.url) || undefined,
      fuente: e.fuente || o.author_name || 'YouTube',
      fecha: fechaISO(e.fecha),
      resumen: textoPlano(e.descripcion || '', 400),
    };
  }
  const meta = esPdf(e.url) ? {} : await leerMetaPagina(e.url).catch(() => ({}));
  const archivo = decodeURIComponent(e.url.split(/[?#]/)[0].split('/').pop() || '').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
  return {
    ...base,
    id: `a-${hash(urlCanonica(e.url))}`,
    tipo: e.tipo || (esPdf(e.url) ? 'documento' : /^video/.test(meta.tipoOg || '') ? 'video' : 'articulo'),
    titulo: textoPlano(e.titulo || meta.titulo || archivo || e.url, 200),
    url: e.url,
    miniatura: e.miniatura || meta.imagen || null,
    fuente: e.fuente || meta.sitio || dominio(e.url),
    fecha: fechaISO(e.fecha || meta.fecha),
    resumen: textoPlano(e.descripcion || meta.descripcion || '', 400),
  };
}

const contar = (lista, clave) => lista.reduce((m, x) => m.set(x[clave], (m.get(x[clave]) ?? 0) + 1), new Map());
const contarVarios = (lista, clave) => {
  const m = new Map();
  for (const x of lista) for (const v of x[clave] ?? []) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};

// Listas destacadas según las reglas de config/listas.json.
function armarListas(cfgListas, publicados, grupoDeTema, hijosDeTema) {
  const existentes = new Set(publicados.map((i) => i.id));
  const listas = [];
  for (const l of cfgListas.listas ?? []) {
    const reglaHashtags = (l.hashtags ?? []).map(idHashtag);
    // Un tema paraguas (p. ej. riesgos críticos) incluye a sus subtemas.
    const temas = l.categorias && new Set(l.categorias.flatMap((c) => [c, ...(hijosDeTema.get(c) ?? [])]));
    let candidatos = publicados.filter((i) =>
      (!temas || i.categorias.some((c) => temas.has(c))) &&
      (!l.sectores || i.sectores.some((s) => l.sectores.includes(s))) &&
      (!l.hashtags || i.hashtags.some((h) => reglaHashtags.includes(h))) &&
      (!l.grupo || i.categorias.some((c) => grupoDeTema.get(c) === l.grupo)) &&
      (!l.tipo || i.tipo === l.tipo) &&
      (!l.idioma || i.idioma === l.idioma));
    if (l.orden === 'vistas') candidatos = [...candidatos].sort((a, b) => (b.vistas ?? 0) - (a.vistas ?? 0) || b.fecha.localeCompare(a.fecha));
    // Variedad: como máximo 4 recursos de una misma fuente.
    const porFuente = new Map();
    const elegidos = (l.enlaces ?? []).map(idDeEnlace).filter((id) => existentes.has(id));
    for (const i of candidatos) {
      if (elegidos.length >= (l.max ?? 20)) break;
      const n = porFuente.get(i.fuenteId) ?? 0;
      if (n >= (l.maxPorFuente ?? 4) || elegidos.includes(i.id)) continue;
      porFuente.set(i.fuenteId, n + 1);
      elegidos.push(i.id);
    }
    if (elegidos.length >= 3) {
      listas.push({ id: l.id, nombre: l.nombre, descripcion: l.descripcion, icono: l.icono, color: l.color, items: elegidos });
    }
  }
  return listas;
}

async function main() {
  const t0 = Date.now();
  const ahora = new Date().toISOString();
  const [cfgFuentes, cfgCategorias, cfgHashtags, cfgListas, curaduria, biblioteca] = await Promise.all([
    leerJson(R('config/fuentes.json')),
    leerJson(R('config/categorias.json')),
    leerJson(R('config/hashtags.json'), { hashtags: {} }),
    leerJson(R('config/listas.json'), { listas: [] }),
    leerJson(R('config/curaduria.json'), { agregar: [], ocultar: [] }),
    leerJson(RUTA_BIBLIOTECA, { items: [] }),
  ]);
  const cacheListas = await leerJson(RUTA_CACHE_LISTAS, {});
  const opc = { filtrarTodo: true, maxItems: 5000, maxPorFuente: 60, maxPorCanalConClave: 150, listasPorCanal: 10, diasCacheListas: 7, concurrencia: 6, buscarImagenEnPagina: true, ...cfgFuentes.opciones };
  const clasificador = crearClasificador(cfgCategorias);
  const etiquetador = crearEtiquetador(cfgHashtags);
  // --sin-red: solo reclasifica la biblioteca (rápido, sin internet), útil al editar la configuración.
  const sinRed = process.argv.includes('--sin-red');
  const claveYT = sinRed ? null : process.env.YT_API_KEY?.trim();

  const fuentes = (cfgFuentes.fuentes ?? []).filter((f) => f.activa !== false).map((f) => ({ ...f, id: slug(f.nombre) }));
  const fuentesPorId = new Map(fuentes.map((f) => [f.id, f]));
  for (const f of fuentes) {
    if (f.categoria && !clasificador.ids.has(f.categoria)) console.warn(`⚠ ${f.nombre}: el tema "${f.categoria}" no existe en categorias.json`);
    if (f.sector && !clasificador.idsSector.has(f.sector)) console.warn(`⚠ ${f.nombre}: el sector "${f.sector}" no existe en categorias.json`);
  }

  const porId = new Map(biblioteca.items.map((i) => [i.id, i]));
  const nuevos = new Set();
  const versionFuente = new Map(); // lo que trajo una fuente para un enlace que hoy es manual
  const incorporar = (item) => {
    const previo = porId.get(item.id);
    if (!previo) {
      porId.set(item.id, { ...item, agregado: ahora });
      nuevos.add(item.id);
      return;
    }
    // Una fuente configurada o un enlace manual tienen prioridad sobre un resultado de búsqueda.
    if (item.origen === 'busqueda' && previo.origen !== 'busqueda') return;
    if (item.origen === 'fuente' && previo.origen === 'manual') { versionFuente.set(item.id, item); return; }
    const miniaturaPrevia = previo.miniatura;
    for (const [k, v] of Object.entries(item)) {
      if (v === undefined || v === null) continue; // nunca borra un dato conocido
      // Un video que está en varias listas suma las etiquetas de todas.
      if ((k === 'etiquetasFuente' || k === 'hashtagsFuente') && Array.isArray(previo[k])) previo[k] = [...new Set([...previo[k], ...v])].slice(0, 15);
      else previo[k] = v;
    }
    if (miniaturaPrevia && (!item.miniatura || pareceMiniaturaChica(item.miniatura))) previo.miniatura = miniaturaPrevia;
  };

  console.log(`\n🦺 Portal SST — recolección ${new Date().toLocaleString('es-PE')}\n`);
  const informe = [];

  // 1) Fuentes: RSS siempre; con clave de YouTube, además, el historial completo de cada canal (1 unidad por cada 50 videos)
  const ahoraMs = Date.now();
  const avisosListas = [];
  const leerListasDelCanal = async (f) => {
    const canal = await canalDe(f);
    let cache = cacheListas[f.id];
    if (!cache || cache.canal !== canal || ahoraMs - Date.parse(cache.fecha) > opc.diasCacheListas * 864e5) {
      try {
        cache = { canal, fecha: ahora, listas: await listasDeCanal(canal) };
        cacheListas[f.id] = cache;
      } catch (err) {
        avisosListas.push(`${f.nombre}: ${err.message}`);
      }
    }
    // Primero las listas cuyo título habla de seguridad; luego las más recientes.
    const elegidas = (cache?.listas ?? [])
      .map((l, k) => ({ ...l, k, rel: clasificador.clasificar({ titulo: l.titulo }).relevancia }))
      .filter((l) => !clasificador.excluido(l.titulo, f.excluir))
      .sort((a, b) => b.rel - a.rel || a.k - b.k)
      .slice(0, f.maxListas ?? opc.listasPorCanal);
    let videos = 0;
    let leidas = 0;
    for (const l of elegidas) {
      try {
        const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${l.id}`;
        const xml = await obtener(url).catch(() => obtener(url));
        const entradas = leerFeed(xml).filter((e) => e.url && e.titulo);
        for (const e of entradas) incorporar(desdeEntrada({ ...e, etiquetas: [...(e.etiquetas ?? []), l.titulo] }, f));
        videos += entradas.length;
        leidas++;
      } catch { /* lista privada, vacía o borrada */ }
    }
    return { videos, leidas };
  };

  await enParalelo(sinRed ? [] : fuentes, opc.concurrencia, async (f) => {
    let leidos = 0;
    let listas = 0;
    try {
      const url = f.tipo === 'youtube' ? await urlFeedYoutube(f) : f.url;
      const entradas = leerFeed(await obtener(url)).filter((e) => e.url && e.titulo).slice(0, opc.maxPorFuente);
      entradas.forEach((e) => incorporar(desdeEntrada(e, f)));
      leidos += entradas.length;
      if (claveYT && f.tipo === 'youtube') {
        const playlist = f.playlist || playlistDeSubidas(await canalDe(f));
        const videos = await listarPlaylist(playlist, opc.maxPorCanalConClave, claveYT);
        for (const v of videos) {
          incorporar(desdeEntrada({
            titulo: v.titulo, url: `https://www.youtube.com/watch?v=${v.ytId}`, fecha: v.fecha,
            html: v.descripcion, ytId: v.ytId, imagen: miniaturaYoutube(v.ytId),
          }, f));
        }
        leidos = Math.max(leidos, videos.length);
      }
      if (f.tipo === 'youtube' && !f.playlist && opc.listasPorCanal > 0 && f.listas !== false) {
        const r = await leerListasDelCanal(f);
        leidos += r.videos;
        listas = r.leidas;
      }
      informe.push({ id: f.id, nombre: f.nombre, leidos, listas });
    } catch (err) {
      informe.push({ id: f.id, nombre: f.nombre, leidos, listas, error: err.message });
    }
  });

  // 2) Búsquedas de YouTube (opcional, requiere clave)
  const busquedas = cfgFuentes.busquedasYoutube ?? {};
  let notaBusquedas = 'omitidas (define YT_API_KEY para activarlas, ver LEEME.md)';
  if (claveYT && busquedas.consultas?.length) {
    let encontrados = 0;
    const errores = [];
    await enParalelo(busquedas.consultas, 3, async (q) => {
      try {
        const idioma = q.idioma ?? busquedas.idioma ?? 'es';
        const res = await buscarYoutube({ ...q, maxResultados: busquedas.maxResultados, region: busquedas.region, idioma, clave: claveYT });
        for (const v of res) {
          encontrados++;
          const hashtagsFuente = hashtagsDe(v.titulo, v.descripcion);
          incorporar({
            id: `yt-${v.ytId}`, tipo: 'video', titulo: textoPlano(v.titulo, 200),
            url: `https://www.youtube.com/watch?v=${v.ytId}`, miniatura: miniaturaYoutube(v.ytId), ytId: v.ytId,
            fuenteId: 'youtube', fuente: v.autor, idioma, fecha: fechaISO(v.fecha),
            resumen: textoPlano(v.descripcion, 400), hashtagsFuente: hashtagsFuente.length ? hashtagsFuente : undefined,
            pista: q.categoria, origen: 'busqueda',
          });
        }
      } catch (err) {
        errores.push(`"${q.consulta}": ${err.message}`);
      }
    });
    notaBusquedas = `${busquedas.consultas.length} consultas, ${encontrados} videos` + (errores.length ? ` · ${errores.length} con error (${errores[0]})` : '');
  }

  // 3) Enlaces manuales (solo se consultan la primera vez)
  const manuales = (curaduria.agregar ?? []).map((e) => (typeof e === 'string' ? { url: e } : e)).filter((e) => e.url);
  let manualesNuevos = 0;
  await enParalelo(sinRed ? [] : manuales, 4, async (e) => {
    const previo = porId.get(idDeEnlace(e.url));
    if (previo?.origen === 'manual') {
      Object.assign(previo, { pista: e.categoria, ...(e.titulo && { titulo: e.titulo }), ...(e.miniatura && { miniatura: e.miniatura }) });
      return;
    }
    try {
      incorporar(await resolverManual(e));
      porId.get(idDeEnlace(e.url)).origen = 'manual';
      manualesNuevos++;
    } catch (err) {
      informe.push({ id: 'manual', nombre: `Manual ${e.url}`, error: err.message });
    }
  });
  const urlsManuales = new Set(manuales.map((e) => idDeEnlace(e.url)));
  if (sinRed) for (const it of porId.values()) if (it.origen === 'manual') urlsManuales.add(it.id);
  for (const it of porId.values()) {
    if (it.origen !== 'manual' || urlsManuales.has(it.id)) continue;
    // Se quitó de curaduria.json: vuelve a su fuente si una la trajo hoy; si no, se elimina.
    if (versionFuente.has(it.id)) porId.set(it.id, { ...versionFuente.get(it.id), agregado: it.agregado });
    else porId.delete(it.id);
  }

  // 4) Clasificar y filtrar toda la biblioteca (así un cambio en la configuración se aplica a todo)
  const ocultos = new Set((curaduria.ocultar ?? []).map(idDeEnlace));
  const descartes = { irrelevantes: 0, excluidos: 0, ocultos: 0, repetidos: 0 };

  // Muchos canales repiten el mismo texto en todas sus descripciones ("Suscríbete a nuestro canal de Seguridad
  // y Salud Ocupacional…"). Esas frases no dicen de qué trata cada video: se quitan antes de clasificar.
  const frasesDe = (texto) => String(texto || '').split(/(?<=[.!?¡¿|•\n])\s+|\s[-–|]\s/).map((x) => normalizar(x).replace(/[^a-z0-9 ]+/g, ' ').trim()).filter((x) => x.length > 12);
  const repetidasPorFuente = new Map();
  {
    const conteo = new Map();
    const totalPorFuente = new Map();
    for (const it of porId.values()) {
      totalPorFuente.set(it.fuenteId, (totalPorFuente.get(it.fuenteId) ?? 0) + 1);
      for (const fr of new Set(frasesDe(it.resumen))) {
        const clave = `${it.fuenteId}|${fr}`;
        conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
      }
    }
    for (const [clave, n] of conteo) {
      const [fid, fr] = [clave.slice(0, clave.indexOf('|')), clave.slice(clave.indexOf('|') + 1)];
      const total = totalPorFuente.get(fid);
      if (total >= 6 && n / total >= 0.4) {
        if (!repetidasPorFuente.has(fid)) repetidasPorFuente.set(fid, new Set());
        repetidasPorFuente.get(fid).add(fr);
      }
    }
  }
  const resumenPropio = (it) => {
    const repetidas = repetidasPorFuente.get(it.fuenteId);
    if (!repetidas) return it.resumen;
    return String(it.resumen || '').split(/(?<=[.!?¡¿|•\n])\s+|\s[-–|]\s/)
      .filter((x) => !repetidas.has(normalizar(x).replace(/[^a-z0-9 ]+/g, ' ').trim())).join(' ');
  };

  let publicados = [];
  for (const it of porId.values()) {
    const f = fuentesPorId.get(it.fuenteId);
    if (it.origen === 'fuente' && !f) { porId.delete(it.id); continue; } // fuente eliminada o desactivada
    if (ocultos.has(it.id)) { descartes.ocultos++; continue; }
    if (it.origen !== 'manual' && clasificador.excluido(it.titulo, f?.excluir)) { descartes.excluidos++; continue; }
    const r = clasificador.clasificar({ ...it, resumen: resumenPropio(it) }, it.pista ?? f?.categoria, f?.sector);
    // Solo entra lo que trata de seguridad laboral (con filtrarTodo, en todas las fuentes; los enlaces manuales siempre).
    const exigirRelevancia = opc.filtrarTodo || f?.filtrar || it.origen === 'busqueda';
    if (it.origen !== 'manual' && exigirRelevancia && !r.relevante) { descartes.irrelevantes++; continue; }
    it.categorias = r.categorias;
    it.sectores = r.sectores;
    publicados.push(it);
  }
  publicados.sort((a, b) => b.fecha.localeCompare(a.fecha));
  // Algunas fuentes suben el mismo video varias veces (cortes, idiomas): se deja solo el más reciente.
  const titulosVistos = new Set();
  publicados = publicados.filter((i) => {
    const clave = `${i.fuenteId}|${normalizar(i.titulo).replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (titulosVistos.has(clave)) { descartes.repetidos++; return false; }
    titulosVistos.add(clave);
    return true;
  });
  const manualesPub = publicados.filter((i) => i.origen === 'manual');
  publicados = [...manualesPub, ...publicados.filter((i) => i.origen !== 'manual').slice(0, Math.max(0, opc.maxItems - manualesPub.length))]
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  // 5) Hashtags: curados por palabras clave + los originales de las fuentes que se repiten
  const etiquetas = new Map(publicados.map((i) => [i.id, etiquetador.etiquetar(i)]));
  const formasOriginales = new Map(); // id → { etiqueta más usada, total }
  for (const { originales } of etiquetas.values()) {
    for (const o of originales) {
      const reg = formasOriginales.get(o.id) ?? { total: 0, formas: new Map() };
      reg.total++;
      reg.formas.set(o.etiqueta, (reg.formas.get(o.etiqueta) ?? 0) + 1);
      formasOriginales.set(o.id, reg);
    }
  }
  const originalesValidos = new Map(
    [...formasOriginales].filter(([, r]) => r.total >= etiquetador.minimoOriginales)
      .map(([id, r]) => [id, [...r.formas].sort((a, b) => b[1] - a[1])[0][0]]),
  );
  for (const i of publicados) {
    const { curados, originales } = etiquetas.get(i.id);
    i.hashtags = [...curados, ...originales.map((o) => o.id).filter((id) => originalesValidos.has(id))].slice(0, etiquetador.max);
  }

  // 6) Miniaturas que faltan o son muy chicas: se toman de la etiqueta og:image del artículo
  if (opc.buscarImagenEnPagina && !sinRed) {
    const faltan = publicados.filter((i) => !i.ytId && i.tipo !== 'documento' && (!i.miniatura || pareceMiniaturaChica(i.miniatura)) && (i.ogIntentos ?? 0) < 3);
    await enParalelo(faltan, 4, async (i) => {
      try {
        const m = await leerMetaPagina(i.url);
        if (m.imagen) i.miniatura = m.imagen;
        i.ogIntentos = 3; // la página respondió: no hace falta volver a preguntar
      } catch {
        i.ogIntentos = (i.ogIntentos ?? 0) + 1; // falla de red: se reintenta en la próxima recolección
      }
    });
  }

  // 7) Duración y vistas de los videos (solo con clave de YouTube)
  if (claveYT) {
    const ids = publicados.filter((i) => i.ytId).map((i) => i.ytId).slice(0, 4000);
    try {
      const det = await detallesYoutube(ids, claveYT);
      for (const i of publicados) {
        const d = det.get(i.ytId);
        if (d?.duracion) i.duracion = d.duracion;
        if (d?.vistas) i.vistas = d.vistas;
      }
    } catch (err) {
      console.warn(`⚠ No pude leer duraciones de YouTube: ${err.message}`);
    }
  }

  // 8) Guardar biblioteca (todo lo recolectado) y la salida de la web (solo lo publicado)
  const recorteBiblioteca = [...porId.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, opc.maxItems * 2);
  await fs.mkdir(path.dirname(RUTA_BIBLIOTECA), { recursive: true });
  await escribirJson(RUTA_BIBLIOTECA, { actualizado: ahora, total: recorteBiblioteca.length, items: recorteBiblioteca }, true);
  await escribirJson(RUTA_CACHE_LISTAS, cacheListas, true);

  const agrupar = (clave, ids) => {
    const m = new Map(ids.map((id) => [id, []]));
    for (const i of publicados) for (const v of i[clave]) m.get(v)?.push(i);
    return m;
  };
  const porCategoria = agrupar('categorias', cfgCategorias.categorias.map((c) => c.id));
  for (const c of cfgCategorias.categorias.filter((x) => x.incluye?.length)) {
    const union = new Set([c.id, ...c.incluye]);
    porCategoria.set(c.id, publicados.filter((i) => i.categorias.some((x) => union.has(x))));
  }
  const porSector = agrupar('sectores', (cfgCategorias.sectores ?? []).map((s) => s.id));
  const porFuente = contar(publicados, 'fuenteId');
  const totalHashtags = contarVarios(publicados, 'hashtags');
  const resumenGrupo = (c, items, clave) => {
    const portada = items.find((i) => i[clave][0] === c.id && i.miniatura) ?? items.find((i) => i.miniatura);
    return {
      id: c.id, nombre: c.nombre, icono: c.icono, color: c.color, descripcion: c.descripcion,
      claves: (c.fuertes ?? []).map((k) => k.replace(/\*/g, '')), // el buscador de la web las usa para sugerir temas
      total: items.length,
      videos: items.filter((i) => i.tipo === 'video').length,
      articulos: items.filter((i) => i.tipo === 'articulo').length,
      documentos: items.filter((i) => i.tipo === 'documento').length,
      portada: portada?.miniatura ?? null,
    };
  };
  const grupoDeTema = new Map(cfgCategorias.categorias.map((c) => [c.id, c.grupo]));
  const hijosDeTema = new Map(cfgCategorias.categorias.filter((c) => c.incluye).map((c) => [c.id, c.incluye]));
  const listas = armarListas(cfgListas, publicados, grupoDeTema, hijosDeTema);

  const salida = {
    generado: ahora,
    grupos: cfgCategorias.grupos ?? [],
    categorias: cfgCategorias.categorias.map((c) => ({ ...resumenGrupo(c, porCategoria.get(c.id), 'categorias'), grupo: c.grupo ?? null, incluye: c.incluye })),
    sectores: (cfgCategorias.sectores ?? []).map((s) => resumenGrupo(s, porSector.get(s.id), 'sectores')),
    hashtags: [...totalHashtags]
      .sort((a, b) => b[1] - a[1])
      .map(([id, total]) => ({ id, etiqueta: etiquetador.etiquetaCurada(id) ?? originalesValidos.get(id) ?? id, total })),
    listas,
    fuentes: [
      ...fuentes.map((f) => ({ id: f.id, nombre: f.nombre, tipo: f.tipo, idioma: f.idioma || 'es', pais: f.pais ?? null })),
      { id: 'youtube', nombre: 'Otros canales de YouTube', tipo: 'youtube', idioma: 'es' },
      { id: 'manual', nombre: 'Recomendados', tipo: 'manual', idioma: 'es' },
    ].map((f) => ({ ...f, total: porFuente.get(f.id) ?? 0 })).filter((f) => f.total),
    items: publicados.map((i) => ({
      id: i.id, tipo: i.tipo, titulo: limpiarTitulo(i.titulo), url: i.url, miniatura: i.miniatura || undefined,
      ytId: i.ytId, short: i.short, fuente: i.fuente, fuenteId: i.fuenteId, idioma: i.idioma, pais: fuentesPorId.get(i.fuenteId)?.pais ?? undefined,
      fecha: i.fecha, agregado: i.agregado, duracion: i.duracion, vistas: i.vistas,
      categorias: i.categorias, sectores: i.sectores.length ? i.sectores : undefined,
      hashtags: i.hashtags.length ? i.hashtags : undefined,
      resumen: i.resumen ? textoPlano(i.resumen, 200) : undefined,
      destacado: i.origen === 'manual' || undefined,
    })),
  };
  await fs.mkdir(path.dirname(RUTA_SALIDA), { recursive: true });
  const js = `// Generado por "npm run recolectar" el ${ahora}. No lo edites a mano.\nwindow.SST_DATOS = ${JSON.stringify(salida)};\n`;
  await fs.writeFile(RUTA_SALIDA, js, 'utf8');

  // 9) Informe
  const ancho = Math.max(...informe.map((x) => x.nombre.length), 10) + 2;
  for (const x of informe.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const linea = x.nombre.padEnd(ancho, '.');
    const extra = x.listas ? ` (${x.listas} listas)` : '';
    console.log(x.error ? `  ✗ ${linea} error: ${x.error}` : `  ✓ ${linea} ${String(x.leidos).padStart(4)} leídos · ${String(porFuente.get(x.id) ?? 0).padStart(4)} en el portal${extra}`);
  }
  console.log(`\n  Búsquedas YouTube: ${notaBusquedas}`);
  if (avisosListas.length) console.log(`  Listas de canales: ${avisosListas.length} canales sin leer (${avisosListas[0]})`);
  if (manuales.length) console.log(`  Enlaces manuales: ${manuales.length} (${manualesNuevos} nuevos)`);
  console.log(`\n  📚 ${publicados.length} recursos publicados (${[...nuevos].filter((id) => publicados.some((p) => p.id === id)).length} nuevos) de ${porFuente.size} fuentes`);
  console.log(`  🗑  Descartados: ${descartes.irrelevantes} sin relación con seguridad · ${descartes.excluidos} excluidos · ${descartes.repetidos} repetidos · ${descartes.ocultos} ocultos\n`);
  const tabla = (titulo, filas) => {
    console.log(`  ${titulo}`);
    for (const c of filas.filter((c) => c.total).sort((a, b) => b.total - a.total)) console.log(`     ${c.icono}  ${c.nombre.padEnd(34)} ${String(c.total).padStart(4)}`);
    const vacias = filas.filter((c) => !c.total).map((c) => c.nombre);
    if (vacias.length) console.log(`     (aún vacías, no se muestran: ${vacias.join(', ')})`);
    console.log('');
  };
  tabla('TEMAS', salida.categorias);
  tabla('SECTORES', salida.sectores);
  console.log(`  # ${salida.hashtags.length} hashtags. Los más usados: ${salida.hashtags.slice(0, 12).map((h) => `#${h.etiqueta} (${h.total})`).join(' ')}`);
  console.log(`  ▶ ${listas.length} listas destacadas: ${listas.map((l) => `${l.nombre} (${l.items.length})`).join(' · ')}`);
  console.log(`\n  ✅ ${path.relative(RAIZ, RUTA_SALIDA)} (${Math.round(Buffer.byteLength(js) / 1024)} KB) en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`\n❌ ${e.message}\n`);
    process.exit(1);
  });
}

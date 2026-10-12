// Lectores de contenido: feeds RSS/Atom, canales de YouTube, API de YouTube y metadatos Open Graph.
import { XMLParser } from 'fast-xml-parser';
import { obtener, decodificar } from './util.mjs';

const LISTAS = new Set(['item', 'entry', 'category', 'link', 'media:content', 'media:thumbnail', 'enclosure']);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (nombre) => LISTAS.has(nombre),
});

const txt = (v) => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v)).trim();
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

// ---------- YouTube ----------

export function idYoutube(url = '') {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export const miniaturaYoutube = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const handlesResueltos = new Map();

// ID del canal (UC...) aunque en la configuración se haya escrito el @usuario.
export async function canalDe(fuente) {
  let canal = String(fuente.canal || '').trim();
  if (canal.startsWith('@')) {
    if (!handlesResueltos.has(canal)) handlesResueltos.set(canal, await resolverHandle(canal));
    canal = handlesResueltos.get(canal);
  }
  if (!/^UC[\w-]{22}$/.test(canal)) throw new Error(`canal no válido: ${fuente.canal}`);
  return canal;
}

export async function urlFeedYoutube(fuente) {
  if (fuente.playlist) return `https://www.youtube.com/feeds/videos.xml?playlist_id=${fuente.playlist}`;
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${await canalDe(fuente)}`;
}

// Videos de una playlist con la API (1 unidad de cuota por cada 50). Las subidas de un canal UC... están en la playlist UU...
export async function listarPlaylist(playlistId, max, clave) {
  const videos = [];
  let pagina = '';
  while (videos.length < max) {
    const p = new URLSearchParams({ part: 'snippet,contentDetails', playlistId, maxResults: '50', key: clave });
    if (pagina) p.set('pageToken', pagina);
    const r = await obtener(`${API}/playlistItems?${p}`, { json: true });
    for (const x of r.items || []) {
      const id = x.contentDetails?.videoId;
      if (!id || /^(private|deleted) video$/i.test(x.snippet?.title || '')) continue;
      videos.push({
        ytId: id,
        titulo: decodificar(x.snippet.title),
        descripcion: decodificar(x.snippet.description || ''),
        fecha: x.contentDetails.videoPublishedAt || x.snippet.publishedAt,
      });
    }
    pagina = r.nextPageToken;
    if (!pagina) break;
  }
  return videos.slice(0, max);
}

export const playlistDeSubidas = (canalId) => 'UU' + canalId.slice(2);

// Listas de reproducción públicas de un canal (id y título), leídas de su pestaña "Listas".
// Cada lista tiene su propio feed RSS con 15 videos, así se llega a mucho más que los 15 del canal sin clave de API.
export async function listasDeCanal(canalId) {
  const html = await obtener(`https://www.youtube.com/channel/${canalId}/playlists?hl=es&gl=PE`, { timeout: 20000 });
  const i = html.indexOf('var ytInitialData = ');
  if (i < 0) throw new Error('página de listas no reconocida');
  const inicio = i + 'var ytInitialData = '.length;
  const datos = JSON.parse(html.slice(inicio, html.indexOf(';</script>', inicio)));
  const listas = new Map();
  const texto = (t) => t?.content ?? t?.simpleText ?? t?.runs?.map((r) => r.text).join('') ?? '';
  const recorrer = (o) => {
    if (!o || typeof o !== 'object') return;
    const l = o.lockupViewModel;
    if (l?.contentId?.startsWith('PL') && l.contentId.length >= 18) listas.set(l.contentId, texto(l.metadata?.lockupMetadataViewModel?.title));
    else if (o.gridPlaylistRenderer?.playlistId?.length >= 18) listas.set(o.gridPlaylistRenderer.playlistId, texto(o.gridPlaylistRenderer.title));
    for (const v of Object.values(o)) recorrer(v);
  };
  recorrer(datos);
  return [...listas].map(([id, titulo]) => ({ id, titulo: decodificar(titulo) }));
}

export async function resolverHandle(handle) {
  const html = await obtener(`https://www.youtube.com/${handle}`, { limite: 800000 });
  const m = html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/channel_id=(UC[\w-]{22})/);
  if (!m) throw new Error(`no encontré el canal ${handle}`);
  return m[1];
}

export async function oembedYoutube(url) {
  return obtener(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { json: true });
}

const API = 'https://www.googleapis.com/youtube/v3';

export async function buscarYoutube({ consulta, maxResultados = 25, region, idioma, clave }) {
  const p = new URLSearchParams({
    part: 'snippet', type: 'video', q: consulta, maxResults: String(maxResultados),
    safeSearch: 'strict', key: clave,
  });
  if (region) p.set('regionCode', region);
  if (idioma) p.set('relevanceLanguage', idioma);
  const r = await obtener(`${API}/search?${p}`, { json: true });
  return (r.items || []).filter((x) => x.id?.videoId).map((x) => ({
    ytId: x.id.videoId,
    titulo: decodificar(x.snippet.title),
    descripcion: decodificar(x.snippet.description),
    autor: decodificar(x.snippet.channelTitle),
    canalId: x.snippet.channelId,
    fecha: x.snippet.publishedAt,
  }));
}

// Duración y vistas de hasta 50 videos por llamada (1 unidad de cuota por llamada).
export async function detallesYoutube(ids, clave) {
  const resultado = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const p = new URLSearchParams({ part: 'contentDetails,statistics', id: ids.slice(i, i + 50).join(','), key: clave });
    const r = await obtener(`${API}/videos?${p}`, { json: true });
    for (const v of r.items || []) {
      resultado.set(v.id, {
        duracion: duracionISO(v.contentDetails?.duration),
        vistas: Number(v.statistics?.viewCount) || undefined,
      });
    }
  }
  return resultado;
}

function duracionISO(iso = '') {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + min * 60 + s || undefined;
}

// ---------- RSS / Atom ----------

// Devuelve entradas normalizadas: { titulo, url, fecha, html, etiquetas, imagen, ytId, short, vistas }
export function leerFeed(xml) {
  let entradas = [];
  try {
    const doc = parser.parse(xml);
    if (doc.feed) entradas = lista(doc.feed.entry).map(entradaAtom);
    else {
      const canal = doc.rss?.channel ?? doc['rdf:RDF'];
      if (canal) entradas = lista(canal.item ?? doc['rdf:RDF']?.item).map(itemRss);
    }
  } catch { /* se intenta abajo bloque por bloque */ }
  if (entradas.length) return entradas;

  // Feeds con la cabecera mal formada: se procesa cada <item>/<entry> por separado.
  const porBloque = (etiqueta, convertir) => (xml.match(new RegExp(`<${etiqueta}[\\s>][\\s\\S]*?</${etiqueta}>`, 'gi')) ?? [])
    .flatMap((b) => { try { return lista(parser.parse(b)[etiqueta]).map(convertir); } catch { return []; } });
  entradas = [...porBloque('item', itemRss), ...porBloque('entry', entradaAtom)];
  if (!entradas.length && !/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('el enlace no es un feed RSS/Atom');
  return entradas;
}

function entradaAtom(e) {
  const enlaces = lista(e.link);
  const alterno = enlaces.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? enlaces[0];
  const url = alterno?.['@_href'] ?? txt(alterno);
  const grupo = e['media:group'] ?? {};
  const ytId = txt(e['yt:videoId']) || null;
  const html = txt(grupo['media:description']) || txt(e.summary) || txt(e.content);
  return {
    titulo: txt(e.title) || txt(grupo['media:title']),
    url,
    fecha: txt(e.published) || txt(e.updated),
    html,
    etiquetas: lista(e.category).map((c) => c['@_term'] ?? txt(c)).filter(Boolean),
    imagen: ytId ? miniaturaYoutube(ytId) : imagenDeMedios(e) ?? imagenDeMedios(grupo) ?? imagenDeHtml(html),
    ytId,
    short: /\/shorts\//.test(url),
    vistas: Number(grupo['media:community']?.['media:statistics']?.['@_views']) || undefined,
  };
}

function itemRss(it) {
  const enlaces = lista(it.link);
  const url = txt(enlaces.find((l) => typeof l === 'string' || l['#text'])) || enlaces.find((l) => l['@_href'])?.['@_href'] || txt(it.guid);
  const html = txt(it['content:encoded']) || txt(it.description);
  return {
    titulo: txt(it.title),
    url,
    fecha: txt(it.pubDate) || txt(it['dc:date']) || txt(it.published) || txt(it.updated),
    html,
    resumenHtml: txt(it.description),
    etiquetas: lista(it.category).map(txt).filter(Boolean),
    imagen: imagenDeMedios(it) ?? imagenDeMedios(it['media:group'] ?? {}) ?? imagenDeHtml(html) ?? imagenDeHtml(txt(it.description)),
    ytId: idYoutube(url),
    // Vimeo y otras plataformas indican la dirección para insertar el video (media:player)
    reproductor: lista(it['media:content']).map((m) => m['media:player']?.['@_url']).find(Boolean) ?? null,
    duracion: Number(lista(it['media:content']).map((m) => m['@_duration']).find(Boolean)) || undefined,
  };
}

function imagenDeMedios(nodo) {
  for (const m of lista(nodo['media:content'])) {
    const u = m['@_url'];
    if (u && (m['@_medium'] === 'image' || /^image\//.test(m['@_type'] || '') || EXT_IMAGEN.test(u))) return u;
  }
  const mini = lista(nodo['media:thumbnail'])[0]?.['@_url']
    ?? lista(nodo['media:content']).flatMap((m) => lista(m['media:thumbnail']))[0]?.['@_url']; // Vimeo la anida en media:content
  if (mini) return mini;
  const adj = lista(nodo.enclosure).find((x) => /^image\//.test(x['@_type'] || '') || EXT_IMAGEN.test(x['@_url'] || ''));
  return adj?.['@_url'] ?? null;
}

const atributo = (etiqueta, nombre) =>
  etiqueta.match(new RegExp(`(?<![\\w-])${nombre}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];

// Primera imagen útil de un HTML. Con srcset elige la más pequeña que tenga al menos 400 px de ancho.
export function imagenDeHtml(html = '') {
  for (const etiqueta of String(html).match(/<img\b[^>]*>/gi) ?? []) {
    let src = null;
    const srcset = atributo(etiqueta, 'srcset') ?? atributo(etiqueta, 'data-srcset');
    if (srcset) {
      const opciones = srcset.split(',')
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => ({ u, w: parseInt(w, 10) || 0 }))
        .filter((o) => o.u)
        .sort((a, b) => a.w - b.w);
      src = (opciones.find((o) => o.w >= 400) ?? opciones.at(-1))?.u;
    }
    src ||= atributo(etiqueta, 'data-src') ?? atributo(etiqueta, 'src');
    if (src && !src.startsWith('data:') && !/pixel|feedburner|gravatar|emoji|wp-includes|\/ads?\//i.test(src)) {
      return decodificar(src);
    }
  }
  return null;
}

// ---------- Open Graph ----------

export async function leerMetaPagina(url) {
  const html = await obtener(url, { timeout: 12000, limite: 500000 });
  const metas = {};
  for (const etiqueta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const clave = (atributo(etiqueta, 'property') ?? atributo(etiqueta, 'name') ?? '').toLowerCase();
    const valor = atributo(etiqueta, 'content');
    if (clave && valor && !(clave in metas)) metas[clave] = decodificar(valor);
  }
  const absoluta = (u) => { try { return u ? new URL(u, url).toString() : null; } catch { return null; } };
  return {
    titulo: metas['og:title'] || metas['twitter:title'] || decodificar(html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() || ''),
    descripcion: metas['og:description'] || metas['description'] || metas['twitter:description'] || '',
    imagen: absoluta(metas['og:image'] || metas['og:image:url'] || metas['og:image:secure_url'] || metas['twitter:image']),
    sitio: metas['og:site_name'] || '',
    tipoOg: metas['og:type'] || '',
    fecha: metas['article:published_time'] || metas['og:updated_time'] || '',
  };
}

// ---------- Otras plataformas de video ----------

export const idVimeo = (url = '') => String(url).match(/vimeo\.com\/(?:video\/)?(\d{5,})/)?.[1] ?? null;
export const urlFeedVimeo = (f) => f.url || `https://vimeo.com/${f.usuario}/videos/rss`;

// Vimeo: su API pública antigua (sin clave) da hasta 3 páginas de 20 videos por cuenta o canal; el RSS solo da 10.
export async function videosVimeo({ usuario, canal, limite = 60 }) {
  const base = canal ? `https://vimeo.com/api/v2/channel/${encodeURIComponent(canal)}/videos.json` : `https://vimeo.com/api/v2/${encodeURIComponent(usuario)}/videos.json`;
  const videos = [];
  for (let pagina = 1; pagina <= 3 && videos.length < limite; pagina++) {
    const lote = await obtener(`${base}?page=${pagina}`, { json: true }).catch((err) => { if (pagina === 1) throw err; return []; });
    if (!Array.isArray(lote) || !lote.length) break;
    videos.push(...lote);
    if (lote.length < 20) break;
  }
  return videos.slice(0, limite).map((v) => ({
    id: String(v.id),
    titulo: decodificar(v.title || ''),
    descripcion: decodificar(String(v.description || '').replace(/<br\s*\/?>/gi, ' ')),
    imagen: v.thumbnail_large || v.thumbnail_medium,
    url: v.url || `https://vimeo.com/${v.id}`,
    fecha: v.upload_date ? new Date(v.upload_date.replace(' ', 'T') + 'Z').toISOString() : null,
    vistas: v.stats_number_of_plays || undefined,
    duracion: v.duration || undefined,
    autor: v.user_name,
    etiquetas: v.tags ? String(v.tags).split(',').map((t) => t.trim()).filter(Boolean) : undefined,
  }));
}

// Dailymotion: API pública sin clave. Por cuenta (usuario) o por búsqueda.
export async function videosDailymotion({ usuario, busqueda, idioma, limite = 100 }) {
  const campos = 'id,title,description,thumbnail_480_url,url,created_time,views_total,duration,owner.screenname,owner.id';
  const base = usuario ? `https://api.dailymotion.com/user/${encodeURIComponent(usuario)}/videos` : 'https://api.dailymotion.com/videos';
  const p = new URLSearchParams({ fields: campos, limit: String(Math.min(limite, 100)), sort: usuario ? 'recent' : 'relevance' });
  if (busqueda) p.set('search', busqueda);
  if (busqueda && idioma) p.set('languages', idioma);
  const r = await obtener(`${base}?${p}`, { json: true });
  return (r.list || []).map((v) => ({
    id: v.id,
    titulo: decodificar(v.title || ''),
    descripcion: decodificar(v.description || ''),
    imagen: v.thumbnail_480_url,
    url: v.url || `https://www.dailymotion.com/video/${v.id}`,
    fecha: v.created_time ? new Date(v.created_time * 1000).toISOString() : null,
    vistas: v.views_total || undefined,
    duracion: v.duration || undefined,
    autor: v['owner.screenname'],
  }));
}

// Internet Archive: búsqueda en su colección de películas (incluye filmes clásicos de capacitación).
export async function videosArchive({ busqueda, limite = 100 }) {
  const p = new URLSearchParams({ q: `(${busqueda}) AND mediatype:movies AND -collection:tvarchive AND -collection:tvnews`, rows: String(limite), output: 'json' });
  p.append('sort[]', 'downloads desc');
  for (const f of ['identifier', 'title', 'description', 'date', 'publicdate', 'downloads']) p.append('fl[]', f);
  const r = await obtener(`https://archive.org/advancedsearch.php?${p}`, { json: true, timeout: 30000 });
  const uno = (v) => (Array.isArray(v) ? v.join(' ') : v || '');
  return (r.response?.docs || []).map((d) => ({
    id: d.identifier,
    titulo: uno(d.title),
    descripcion: uno(d.description),
    imagen: `https://archive.org/services/img/${d.identifier}`,
    url: `https://archive.org/details/${d.identifier}`,
    fecha: d.date || d.publicdate || null, // si no se sabe el año del filme, la fecha en que se subió
    vistas: d.downloads || undefined,
  }));
}

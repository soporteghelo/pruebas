// Utilidades compartidas: descargas con tiempo límite, paralelismo, texto y URLs.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (PortalSST; +recolector de enlaces)';

export async function obtener(url, { timeout = 15000, json = false, limite = 0 } = {}) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-PE,es;q=0.9,en;q=0.7' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (json) return await res.json();
    const texto = await res.text();
    return limite ? texto.slice(0, limite) : texto;
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'tiempo agotado' : e.message);
  } finally {
    clearTimeout(reloj);
  }
}

// Ejecuta fn sobre la lista con como máximo `limite` tareas a la vez.
export async function enParalelo(lista, limite, fn) {
  const resultados = new Array(lista.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lista.length) {
      const k = siguiente++;
      resultados[k] = await fn(lista[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, lista.length) }, trabajador));
  return resultados;
}

export const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

export const normalizar = (s = '') =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const slug = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', iquest: '¿', iexcl: '¡',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ordm: 'º', ordf: 'ª', deg: '°', euro: '€', copy: '©', reg: '®', bull: '•', middot: '·',
};

export function decodificar(s = '') {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

// HTML → texto plano recortado sin cortar palabras.
export function textoPlano(html = '', max = 400) {
  let t = decodificar(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  t = decodificar(t).replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t;
}

// Títulos sin emojis decorativos ("📢 ¡Nuevo! 🇵🇪" → "¡Nuevo!"); las banderas se ven como letras en Windows.
export function limpiarTitulo(titulo, max = 200) {
  const t = textoPlano(titulo, max)
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/^\s*(@\w+\s+)+/, '') // "@Marca Título" → "Título"
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t || textoPlano(titulo, max);
}

// Quita parámetros de rastreo para que el mismo enlace no se duplique.
export function urlCanonica(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const p of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(p)) url.searchParams.delete(p);
    }
    url.hostname = url.hostname.replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(u).trim();
  }
}

export const dominio = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
};

export function fechaISO(valor, respaldo = new Date()) {
  const d = valor ? new Date(valor) : null;
  if (!d || isNaN(d)) return respaldo.toISOString();
  return (d > new Date() ? new Date() : d).toISOString();
}

export async function leerJson(ruta, porDefecto) {
  try {
    return JSON.parse(await fs.readFile(ruta, 'utf8'));
  } catch (e) {
    if (porDefecto !== undefined && e.code === 'ENOENT') return porDefecto;
    throw new Error(`No pude leer ${ruta}: ${e.message}`);
  }
}

export const escribirJson = (ruta, datos) => fs.writeFile(ruta, JSON.stringify(datos, null, 2) + '\n', 'utf8');

// SST Hub — interfaz. Lee window.SST_DATOS (lo genera "npm run recolectar") y pinta la galería.
// Cada miniatura es un enlace directo a la fuente original; lo personal (guardados, listas, vistos)
// vive solo en este navegador.
(() => {
  'use strict';

  const D = window.SST_DATOS;
  const $ = (s, raiz = document) => raiz.querySelector(s);
  const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

  if (!D || !Array.isArray(D.items)) {
    $('#contenido').innerHTML = `<div class="error-carga"><h2>Aún no hay contenido</h2>
      <p>No encontré <code>data/contenido.js</code>. Ejecuta <code>npm run recolectar</code>
      (o haz doble clic en <code>ACTUALIZAR_PORTAL.bat</code>) y vuelve a abrir esta página.</p></div>`;
    return;
  }

  // =====================================================================
  // Utilidades
  // =====================================================================
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const norm = (s = '') => String(s).normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const nf = new Intl.NumberFormat('es');
  const compacto = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
  const fechaLarga = new Intl.DateTimeFormat('es', { dateStyle: 'long' });
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const UNIDADES = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const plural = (n, uno, varios) => `${nf.format(n)} ${n === 1 ? uno : varios}`;
  const inicial = (s) => (String(s).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
  const tono = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 360, 7);
  const esYoutube = (dom) => /(^|\.)youtube\.com$|^youtu\.be$/.test(dom);
  const ahora = () => Date.now();
  const nuevoId = () => ahora().toString(36) + Math.random().toString(36).slice(2, 6);
  const esArchivoLocal = location.protocol === 'file:';

  function haceCuanto(fecha) {
    const dif = (new Date(fecha) - ahora()) / 1000;
    for (const [unidad, seg] of UNIDADES) if (Math.abs(dif) >= seg) return rtf.format(Math.round(dif / seg), unidad);
    return 'ahora';
  }
  function duracion(seg) {
    if (!seg) return '';
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.floor(seg % 60);
    const dos = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
  }
  function duracionTotal(seg) {
    if (!seg) return '';
    const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  const almacen = {
    leer(clave, defecto) {
      try { const v = localStorage.getItem('ssthub:' + clave); return v == null ? defecto : JSON.parse(v); } catch { return defecto; }
    },
    guardar(clave, valor) {
      try { localStorage.setItem('ssthub:' + clave, JSON.stringify(valor)); } catch { /* sin almacenamiento la sesión igual funciona */ }
    },
  };

  const TRAZOS = {
    play: '<path d="M7 4v16l13-8z"/>',
    articulo: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
    documento: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8"/>',
    externo: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    corazon: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    inicio: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    brujula: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    abajo: '<path d="m6 9 6 6 6-6"/>',
    arriba: '<path d="m18 15-6-6-6 6"/>',
    estrella: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    papelera: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    lista: '<path d="M3 6h12M3 12h12M3 18h7"/><path d="m16 15 5 3-5 3z"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    puntos: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    compartir: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    ocultar: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    lapiz: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    anterior: '<path d="M19 20 9 12l10-8zM5 19V5"/>',
    siguiente: '<path d="m5 4 10 8-10 8zM19 5v14"/>',
    whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c.3 1.8 1.7 3.6 3.5 4.5l1.3-1.1 2 1-.5 1.6c-3.3.5-7-3.1-6.7-6.3L10.2 8l1 2z"/>',
    fuente: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
    descargar: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>',
    nuevo: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/>',
    globo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
    numeral: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  };
  const svg = (nombre, clase = '') => `<svg${clase ? ` class="${clase}"` : ''} viewBox="0 0 24 24" aria-hidden="true">${TRAZOS[nombre]}</svg>`;

  // =====================================================================
  // Datos
  // =====================================================================
  const CATS = new Map(D.categorias.map((c) => [c.id, c]));
  const SECTORES = new Map((D.sectores || []).map((s) => [s.id, s]));
  const HASHTAGS = new Map((D.hashtags || []).map((h) => [h.id, h]));
  const FUENTES = new Map(D.fuentes.map((f) => [f.id, f]));
  const LISTAS_DEST = new Map((D.listas || []).map((l) => [l.id, l]));
  const GRUPOS = D.grupos || [];
  const ITEMS = D.items.map((i) => {
    const categorias = (i.categorias || []).filter((c) => CATS.has(c));
    const sectores = (i.sectores || []).filter((s) => SECTORES.has(s));
    const hashtags = (i.hashtags || []).filter((h) => HASHTAGS.has(h));
    return {
      ...i,
      categorias,
      sectores,
      hashtags,
      _dom: dominio(i.url),
      _fecha: Date.parse(i.fecha) || 0,
      // El buscador mira título, descripción, hashtags y fuente. No usa los nombres de los temas:
      // así "IPERC" encuentra lo que habla de IPERC y no todo lo que está clasificado en ese tema.
      _tit: norm(i.titulo),
      _tags: norm(hashtags.map((h) => `${h} ${HASHTAGS.get(h).etiqueta.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')}`).join(' · ')),
      _txt: norm(`${i.resumen || ''} · ${i.fuente}`),
    };
  });
  const POR_ID = new Map(ITEMS.map((i) => [i.id, i]));
  const CATS_VISIBLES = D.categorias.filter((c) => c.total > 0);
  const SECTORES_VISIBLES = (D.sectores || []).filter((s) => s.total > 0);
  const CAT_RESPALDO = { color: '#6B7280', icono: '🛡️', nombre: 'Seguridad' };
  // Un tema "paraguas" (Riesgos críticos, Trabajos de alto riesgo) también muestra sus subtemas.
  const temasDe = (id) => new Set([id, ...(CATS.get(id)?.incluye || [])]);

  // =====================================================================
  // País y recomendaciones ("como YouTube": primero lo de tu país, luego lo popular y reciente del resto)
  // =====================================================================
  const PAISES = {
    PE: 'Perú', CO: 'Colombia', CL: 'Chile', MX: 'México', AR: 'Argentina', EC: 'Ecuador', BO: 'Bolivia', VE: 'Venezuela',
    UY: 'Uruguay', PY: 'Paraguay', CR: 'Costa Rica', GT: 'Guatemala', PA: 'Panamá', DO: 'República Dominicana', HN: 'Honduras',
    SV: 'El Salvador', NI: 'Nicaragua', ES: 'España', US: 'Estados Unidos', CA: 'Canadá', UK: 'Reino Unido', AU: 'Australia',
    BR: 'Brasil', IN: 'India', PH: 'Filipinas', ZA: 'Sudáfrica', NZ: 'Nueva Zelanda', LATAM: 'Latinoamérica', EU: 'Europa', INT: 'Internacional',
  };
  const HISPANOS = new Set(['PE', 'CO', 'CL', 'MX', 'AR', 'EC', 'BO', 'VE', 'UY', 'PY', 'CR', 'GT', 'PA', 'DO', 'HN', 'SV', 'NI', 'LATAM']);
  const ZONAS = {
    'America/Lima': 'PE', 'America/Bogota': 'CO', 'America/Santiago': 'CL', 'America/Mexico_City': 'MX', 'America/Monterrey': 'MX',
    'America/Merida': 'MX', 'America/Cancun': 'MX', 'America/Chihuahua': 'MX', 'America/Hermosillo': 'MX', 'America/Tijuana': 'MX',
    'America/Guayaquil': 'EC', 'America/La_Paz': 'BO', 'America/Caracas': 'VE', 'America/Montevideo': 'UY', 'America/Asuncion': 'PY',
    'America/Costa_Rica': 'CR', 'America/Guatemala': 'GT', 'America/Panama': 'PA', 'America/Santo_Domingo': 'DO',
    'America/Tegucigalpa': 'HN', 'America/El_Salvador': 'SV', 'America/Managua': 'NI', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
  };
  function detectarPais() {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (ZONAS[zona]) return ZONAS[zona];
    if (zona.startsWith('America/Argentina')) return 'AR';
    const region = (navigator.languages || [navigator.language]).map((l) => (l || '').split('-')[1]?.toUpperCase()).find((r) => r && PAISES[r]);
    return region || 'INT';
  }
  let miPais = almacen.leer('pais', null) || detectarPais();
  const miIdioma = () => (HISPANOS.has(miPais) || miPais === 'ES' ? 'es' : 'en');
  const nombrePais = (p) => PAISES[p] || p;
  const paisesDisponibles = () => [...new Set(D.fuentes.map((f) => f.pais).filter((p) => p && PAISES[p]))].sort((a, b) => nombrePais(a).localeCompare(nombrePais(b), 'es'));

  // Puntaje de recomendación: país (lo que más pesa), idioma, popularidad (vistas), frescura y variedad.
  function puntaje(i) {
    let s = 0;
    if (i.pais === miPais) s += 5;
    else if (HISPANOS.has(miPais) && HISPANOS.has(i.pais)) s += 1.5;
    if (i.idioma === miIdioma()) s += 1.5;
    s += i.vistas ? Math.log10(i.vistas + 1) * 0.9 : i.tipo === 'video' ? 1.2 : 1.8;
    s += 2.5 * Math.exp(-(ahora() - i._fecha) / (45 * 864e5));
    if (i.tipo === 'video') s += 0.4;
    if (i.destacado) s += 2;
    if (i.short) s -= 0.8; // los Shorts no dominan el inicio
    return s;
  }
  // El orden recomendado de todo el catálogo se calcula una vez (y de nuevo solo si cambias de país);
  // al filtrar se reutiliza ese orden en vez de volver a ordenar miles de recursos en cada clic.
  let ordenRecomendadoCache = null;
  function calcularPuntajes() {
    for (const i of ITEMS) i._rec = puntaje(i);
    ordenRecomendadoCache = null;
  }
  const ordenRecomendado = () => (ordenRecomendadoCache ??= repartir(ITEMS, (i) => i._rec));
  calcularPuntajes();

  // Reparto parejo: primero entre plataformas (YouTube, Vimeo, Dailymotion, Internet Archive, webs y blogs)
  // y, dentro de cada plataforma, entre fuentes. En cada vuelta entra el mejor recurso pendiente de cada
  // grupo (empezando por el que puntúa más): ni una plataforma ni una fuente acaparan los resultados.
  function agruparPor(xs, clave) {
    const grupos = new Map();
    for (const i of xs) {
      const k = clave(i);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
    return [...grupos.values()];
  }
  function porTurnos(colas, puntaje) {
    const salida = [];
    let activas = colas.filter((c) => c.length).map((c) => ({ c, k: 0 }));
    while (activas.length) {
      activas.sort((a, b) => puntaje(b.c[b.k]) - puntaje(a.c[a.k]));
      for (const a of activas) salida.push(a.c[a.k++]);
      activas = activas.filter((a) => a.k < a.c.length);
    }
    return salida;
  }
  function repartir(xs, puntaje) {
    const mejorPrimero = (g) => g.sort((a, b) => puntaje(b) - puntaje(a));
    const porPlataforma = agruparPor(xs, plataformaClave)
      .map((p) => porTurnos(agruparPor(p, (i) => i.fuenteId).map(mejorPrimero), puntaje));
    return porTurnos(porPlataforma, puntaje);
  }

  // Variedad como en YouTube: cada recurso extra de una misma fuente pierde algo de puntaje
  // y luego se evita que dos de la misma fuente queden seguidos. Recibe la lista ya ordenada por puntaje.
  function diversificar(xs) {
    const porFuente = new Map();
    const salida = xs
      .map((i) => {
        const k = porFuente.get(i.fuenteId) ?? 0;
        porFuente.set(i.fuenteId, k + 1);
        return { i, s: i._rec - 0.7 * k };
      })
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i);
    for (let n = 1; n < salida.length; n++) {
      if (salida[n].fuenteId !== salida[n - 1].fuenteId) continue;
      for (let m = n + 1; m < Math.min(n + 8, salida.length); m++) {
        if (salida[m].fuenteId !== salida[n - 1].fuenteId) { salida.splice(n, 0, salida.splice(m, 1)[0]); break; }
      }
    }
    return salida;
  }

  // =====================================================================
  // Lo personal (este navegador)
  // =====================================================================
  let guardados = new Set(almacen.leer('guardados', []));
  let vistos = almacen.leer('vistos', {});
  let ocultos = new Set(almacen.leer('ocultos', []));
  let misListas = almacen.leer('listas', []);
  let modoVista = almacen.leer('vista', 'grilla');
  // Los videos de YouTube, Vimeo, Dailymotion e Internet Archive se ven dentro del portal (con el reproductor
  // oficial de cada uno). Se puede elegir abrirlos en su página. Abierto como archivo (doble clic) no se puede:
  // los reproductores no funcionan dentro de páginas sin dirección web.
  let preferenciaVideos = almacen.leer('videos', 'aqui');
  const reproducible = (i) => Boolean(i?.ytId || i?.embed);
  const verDentro = (i) => reproducible(i) && !esArchivoLocal && preferenciaVideos === 'aqui';

  // "Nuevo desde tu última visita": la referencia se fija al abrir y se mantiene durante la sesión.
  const refVisita = (() => {
    let ref = null;
    try {
      ref = Number(sessionStorage.getItem('ssthub:refVisita')) || null;
      if (!ref) {
        ref = almacen.leer('visita', null);
        sessionStorage.setItem('ssthub:refVisita', String(ref || ahora()));
      }
    } catch { /* sin almacenamiento no hay "nuevos" */ }
    almacen.guardar('visita', ahora());
    return ref;
  })();
  const esNuevo = (i) => Boolean(refVisita && i.agregado && Date.parse(i.agregado) > refVisita);
  const visibles = () => ITEMS.filter((i) => !ocultos.has(i.id));
  const cuantosNuevos = () => visibles().filter(esNuevo).length;

  const Listas = {
    guardar() { almacen.guardar('listas', misListas); actualizarContadores(); },
    buscar: (id) => misListas.find((l) => l.id === id),
    crear(nombre, items = []) {
      const l = { id: nuevoId(), nombre: nombre.trim().slice(0, 60) || 'Mi lista', items: [...new Set(items)], creada: ahora(), actualizada: ahora() };
      misListas.unshift(l);
      Listas.guardar();
      return l;
    },
    alternar(listaId, itemId) {
      const l = Listas.buscar(listaId);
      if (!l) return false;
      const esta = l.items.includes(itemId);
      l.items = esta ? l.items.filter((x) => x !== itemId) : [...l.items, itemId];
      l.actualizada = ahora();
      Listas.guardar();
      return !esta;
    },
    mover(listaId, idx, delta) {
      const l = Listas.buscar(listaId);
      const j = idx + delta;
      if (!l || j < 0 || j >= l.items.length) return;
      [l.items[idx], l.items[j]] = [l.items[j], l.items[idx]];
      l.actualizada = ahora();
      Listas.guardar();
    },
    renombrar(listaId, nombre) {
      const l = Listas.buscar(listaId);
      if (l && nombre.trim()) { l.nombre = nombre.trim().slice(0, 60); l.actualizada = ahora(); Listas.guardar(); }
    },
    eliminar(listaId) {
      const i = misListas.findIndex((l) => l.id === listaId);
      if (i < 0) return null;
      const [l] = misListas.splice(i, 1);
      Listas.guardar();
      return { lista: l, posicion: i };
    },
  };

  // "A continuación": videos relacionados con uno (mismo tema, hashtags y sector; primero lo recomendado
  // para tu país; máximo 4 por fuente para que haya variedad).
  const cacheRelacionados = new Map();
  function relacionados(i, max = 24) {
    if (cacheRelacionados.has(i.id)) return cacheRelacionados.get(i.id);
    const temas = new Set(i.categorias);
    const tags = new Set(i.hashtags);
    const sectores = new Set(i.sectores);
    const puntos = (x) => (x.categorias[0] === i.categorias[0] ? 3 : 0)
      + x.categorias.filter((c) => temas.has(c)).length
      + x.hashtags.filter((h) => tags.has(h)).length * 0.8
      + x.sectores.filter((s) => sectores.has(s)).length * 0.7
      + (x.fuenteId === i.fuenteId ? 0.6 : 0)
      + x._rec * 0.35;
    const porFuente = new Map();
    const salida = visibles()
      .filter((x) => reproducible(x) && x.id !== i.id && x.categorias.some((c) => temas.has(c)))
      .map((x) => ({ x, p: puntos(x) }))
      .sort((a, b) => b.p - a.p)
      .filter(({ x }) => { const n = porFuente.get(x.fuenteId) ?? 0; porFuente.set(x.fuenteId, n + 1); return n < 4; })
      .slice(0, max)
      .map(({ x }) => x);
    cacheRelacionados.set(i.id, salida);
    return salida;
  }

  // Una lista puede ser tuya (m-…), destacada (d-…), compartida por enlace (c)
  // o la cola "A continuación" de un video que se ve dentro del portal (r-…).
  function obtenerLista(ref) {
    if (!ref) return null;
    if (ref.startsWith('r-')) {
      const i = POR_ID.get(ref.slice(2));
      if (!reproducible(i)) return null;
      const c0 = CATS.get(i.categorias[0]) || CAT_RESPALDO;
      return { ref, tipo: 'relacionados', nombre: 'A continuación', descripcion: `Relacionados con ${c0.nombre}`, icono: '▶️', color: c0.color, ids: [i.id, ...relacionados(i).map((x) => x.id)], editable: false };
    }
    if (ref === 'c') {
      if (!estado.compartida?.ids.length) return null;
      return { ref, tipo: 'compartida', nombre: estado.compartida.nombre || 'Lista compartida', descripcion: 'Alguien compartió esta lista contigo.', icono: '🔗', color: '#FFC21A', ids: estado.compartida.ids, editable: false };
    }
    const id = ref.slice(2);
    if (ref.startsWith('d-')) {
      const l = LISTAS_DEST.get(id);
      return l ? { ref, tipo: 'destacada', nombre: l.nombre, descripcion: l.descripcion, icono: l.icono, color: l.color, ids: l.items, editable: false } : null;
    }
    if (ref.startsWith('m-')) {
      const l = Listas.buscar(id);
      return l ? { ref, tipo: 'mia', id: l.id, nombre: l.nombre, descripcion: '', icono: '▶️', color: '#FFC21A', ids: l.items, editable: true, actualizada: l.actualizada } : null;
    }
    return null;
  }
  const itemsDeLista = (l) => l.ids.map((id) => POR_ID.get(id)).filter(Boolean);

  // =====================================================================
  // Estado y rutas
  //   #/  #/c/<tema>  #/s/<sector>  #/t/<hashtag>  #/f/<fuente>  #/explorar
  //   #/listas  #/lista/<ref>  #/ver/<ref>/<n>  #/guardados  #/vistos
  //   filtros: ?q=&tipo=&sector=&idioma=&plat=&fuente=&orden=&nuevos=   lista compartida: ?n=&i=
  // =====================================================================
  const FILTROS_BASE = { q: '', tipo: 'todo', sector: 'todos', idioma: 'todos', plat: 'todas', fuente: 'todas', orden: 'recomendados', nuevos: '', tags: '' };
  const estado = { vista: 'inicio', id: null, pos: 0, compartida: null, ...FILTROS_BASE };
  const VISTAS = {
    c: 'categoria', s: 'sector', t: 'hashtag', f: 'fuente', explorar: 'explorar', categorias: 'explorar',
    listas: 'listas', lista: 'lista', ver: 'ver', v: 'ver', guardados: 'guardados', vistos: 'vistos',
  };
  const VISTAS_CON_GRILLA = new Set(['inicio', 'categoria', 'sector', 'hashtag', 'fuente', 'guardados', 'vistos']);
  const POR_PAGINA = 24;
  let lista = [];
  let mostrados = 0;

  function leerHash() {
    const [ruta, qs = ''] = location.hash.replace(/^#/, '').split('?');
    const partes = ruta.split('/').filter(Boolean).map(decodeURIComponent);
    const p = new URLSearchParams(qs);
    estado.vista = VISTAS[partes[0]] || 'inicio';
    estado.id = partes[1] ?? null;
    if (partes[0] === 'v' && estado.id) estado.id = `r-${estado.id}`; // #/v/<video>: ver un video dentro del portal
    estado.pos = Math.max(0, parseInt(partes[2], 10) || 0);
    estado.compartida = p.get('i') ? { nombre: (p.get('n') || '').slice(0, 60), ids: p.get('i').split('.').filter(Boolean).slice(0, 100) } : null;
    for (const k of Object.keys(FILTROS_BASE)) estado[k] = p.get(k) || FILTROS_BASE[k];
    const validos = { categoria: CATS, sector: SECTORES, hashtag: HASHTAGS, fuente: FUENTES };
    if (validos[estado.vista] && !validos[estado.vista].has(estado.id)) { estado.vista = 'inicio'; estado.id = null; }
    if ((estado.vista === 'lista' || estado.vista === 'ver') && !obtenerLista(estado.id)) { estado.vista = 'listas'; estado.id = null; }
  }

  function hashDe(e) {
    const base = {
      inicio: '/', categoria: `/c/${e.id}`, sector: `/s/${e.id}`, hashtag: `/t/${e.id}`, fuente: `/f/${e.id}`,
      explorar: '/explorar', listas: '/listas', lista: `/lista/${e.id}`,
      ver: e.id?.startsWith('r-') ? `/v/${e.id.slice(2)}${e.pos ? `/${e.pos}` : ''}` : `/ver/${e.id}/${e.pos || 0}`,
      guardados: '/guardados', vistos: '/vistos',
    }[e.vista];
    const p = new URLSearchParams();
    if (VISTAS_CON_GRILLA.has(e.vista)) {
      for (const [k, v] of Object.entries(FILTROS_BASE)) {
        if (!e[k] || e[k] === v) continue;
        if ((k === 'fuente' && e.vista === 'fuente') || (k === 'sector' && e.vista === 'sector')) continue;
        p.set(k, e[k]);
      }
    }
    if (e.id === 'c' && e.compartida) { p.set('n', e.compartida.nombre); p.set('i', e.compartida.ids.join('.')); }
    const qs = p.toString();
    return '#' + base + (qs ? '?' + qs : '');
  }

  function actualizarFiltros(cambios) {
    Object.assign(estado, cambios);
    history.replaceState(null, '', hashDe(estado));
    render();
    if (el.herramientas.getBoundingClientRect().top < 0) el.herramientas.scrollIntoView({ block: 'start' });
  }

  const hayFiltros = () => Boolean(estado.q) || estado.tipo !== 'todo' || estado.idioma !== 'todos' || estado.plat !== 'todas' || estado.fuente !== 'todas'
    || estado.sector !== 'todos' || Boolean(estado.nuevos) || Boolean(estado.tags);
  const cuantosFiltrosMovil = () => [estado.sector !== 'todos' && estado.vista !== 'sector', estado.idioma !== 'todos', estado.plat !== 'todas',
    estado.fuente !== 'todas' && estado.vista !== 'fuente', estado.orden !== 'recomendados', Boolean(estado.nuevos)].filter(Boolean).length;

  // ---------- Buscador ----------
  // 1) Coincidencia exacta: cada palabra debe aparecer al comienzo de una palabra del título, hashtags o descripción.
  //    Puntaje: título > hashtags > descripción; frase completa y todas las palabras en el título suman extra.
  // 2) Sinónimos y siglas de SST (también español ↔ inglés): "LOTO" encuentra "bloqueo y etiquetado".
  // 3) Si no hay nada: corrige errores de tipeo ("estintor" → "extintor"), luego acepta la mayoría
  //    de las palabras y, al final, ofrece el tema relacionado (avisando en cada caso).
  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'o', 'a', 'al', 'con', 'por', 'para', 'un', 'una', 'que', 'como', 'se', 'su', 'the', 'of', 'and', 'to', 'in', 'for', 'on']);
  const SINONIMOS = [
    ['loto', 'bloqueo y etiquetado', 'lockout', 'tagout'],
    ['epp', 'equipo de proteccion personal', 'equipos de proteccion personal', 'ppe', 'epi', 'elementos de proteccion personal'],
    ['rcp', 'reanimacion cardiopulmonar', 'cpr'],
    ['dea', 'desfibrilador', 'aed'],
    ['ats', 'analisis de trabajo seguro', 'ast', 'jsa'],
    ['petar', 'permiso escrito de trabajo de alto riesgo'],
    ['pets', 'procedimiento escrito de trabajo seguro'],
    ['sst', 'seguridad y salud en el trabajo', 'ssoma', 'sso', 'ssma', 'hse'],
    ['iso 45001', '45001'],
    ['extintor', 'fire extinguisher'],
    ['incendio', 'fire'],
    ['arnes', 'harness'],
    ['andamio', 'scaffold'],
    ['escalera', 'ladder'],
    ['trabajo en altura', 'trabajos en altura', 'work at height', 'working at height', 'fall protection'],
    ['espacio confinado', 'espacios confinados', 'confined space'],
    ['izaje', 'rigging', 'rigger'],
    ['grua', 'crane'],
    ['soldadura', 'welding', 'hot work', 'trabajo en caliente'],
    ['montacargas', 'montacarga', 'forklift', 'carretilla elevadora'],
    ['excavacion', 'zanja', 'trench', 'excavation'],
    ['ruido', 'noise'],
    ['fatiga', 'fatigue', 'somnolencia'],
    ['primeros auxilios', 'first aid'],
    ['accidente', 'accident'],
    ['incidente', 'incident'],
    ['investigacion', 'investigation'],
    ['estres', 'stress'],
    ['ergonomia', 'ergonomic', 'ergonomics'],
    ['quimico', 'chemical'],
    ['electrico', 'electrical', 'electricidad'],
    ['caida', 'fall'],
    ['guante', 'gloves'],
    ['casco', 'hard hat', 'helmet'],
    ['mineria', 'mining', 'minero', 'mina'],
    ['voladura', 'blasting', 'explosivo'],
    ['rescate', 'rescue'],
    ['emergencia', 'emergency'],
    ['evacuacion', 'evacuation'],
    ['sismo', 'terremoto', 'earthquake'],
    ['manejo defensivo', 'conduccion defensiva', 'defensive driving'],
    ['matpel', 'materiales peligrosos', 'hazmat'],
    ['hoja de seguridad', 'hds', 'msds', 'sds'],
    ['5 porques', 'cinco porques', '5 whys'],
    ['arbol de causas', 'arbol de fallas'],
    ['causa raiz', 'root cause'],
    ['cuasi accidente', 'casi accidente', 'near miss'],
    ['liderazgo', 'leadership'],
    ['cultura de seguridad', 'safety culture'],
    ['salud mental', 'mental health'],
    ['charla de 5 minutos', 'charla de seguridad', 'toolbox talk', 'safety talk'],
    ['riesgo critico', 'riesgos criticos', 'critical risk'],
    ['control critico', 'controles criticos', 'critical control'],
  ].map((g) => g.map((t) => norm(t)));
  const SINONIMOS_DE = new Map();
  for (const grupo of SINONIMOS) for (const t of grupo) SINONIMOS_DE.set(t, [...new Set([...(SINONIMOS_DE.get(t) || []), ...grupo.filter((x) => x !== t)])]);

  const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const raizDe = (t) => { const r = t.length > 4 ? t.replace(/(es|s)$/, '') : t; return r.length >= 4 ? r : t; }; // "arneses" → "arnes"
  function palabrasDe(texto) {
    const todas = norm(texto).split(/[^a-z0-9]+/).filter(Boolean);
    const utiles = todas.filter((t) => !PALABRAS_VACIAS.has(t));
    return utiles.length ? utiles : todas;
  }
  const tokensDe = (texto) => palabrasDe(texto).map(raizDe);
  const tokensBusqueda = () => tokensDe(estado.q);
  // Patrón de un término (una palabra o una frase): cada palabra al comienzo de una palabra del texto;
  // las siglas cortas (ATS, EPP, RCP, 5S) deben coincidir completas.
  function patronTermino(termino) {
    const ps = termino.split(' ').filter(Boolean).map(raizDe);
    const ultima = ps.at(-1);
    const cuerpo = ps.map(escaparRe).join('[\\s-]+');
    return new RegExp(`(?<![a-z0-9])${cuerpo}${ultima.length <= 3 ? '(?![a-z0-9])' : ''}`);
  }
  const patronesDe = (tokens) => tokens.map(patronTermino);

  function prepararBusqueda(texto) {
    const crudas = palabrasDe(texto.replace(/^#/, ''));
    if (!crudas.length) return null;
    const terminos = crudas.map((w) => {
      const alternativas = new Set([...(SINONIMOS_DE.get(w) || []), ...(SINONIMOS_DE.get(raizDe(w)) || [])]);
      return { p: patronTermino(w), alt: [...alternativas].map(patronTermino) };
    });
    const frase = crudas.join(' ');
    return {
      crudas,
      terminos,
      frase: crudas.length > 1 ? patronTermino(frase) : null,
      altFrase: (SINONIMOS_DE.get(frase) || []).map(patronTermino),
      // para resaltar en los títulos: cada término (y sus sinónimos) hasta el final de la palabra
      resaltar: [...terminos.flatMap((t) => [t.p, ...t.alt]), ...(SINONIMOS_DE.get(frase) || []).map(patronTermino)]
        .map((p) => new RegExp(`${p.source}[a-z0-9]*`, 'g')),
    };
  }

  function puntuar(i, b) {
    let puntos = 0;
    let encontrados = 0;
    let enTitulo = 0;
    for (const t of b.terminos) {
      let s = 0;
      if (t.p.test(i._tit)) { s = 4; enTitulo++; }
      else if (t.p.test(i._tags)) s = 2.5;
      else if (t.p.test(i._txt)) s = 1.2;
      else if (t.alt.some((p) => p.test(i._tit))) { s = 2.6; enTitulo++; }
      else if (t.alt.some((p) => p.test(i._tags))) s = 1.6;
      else if (t.alt.some((p) => p.test(i._txt))) s = 0.8;
      if (s) { encontrados++; puntos += s; }
    }
    // "primeros auxilios" también encuentra "First Aid" aunque cada palabra por separado no tenga sinónimo
    if (encontrados < b.terminos.length && b.altFrase.length) {
      const n = b.terminos.length;
      if (b.altFrase.some((p) => p.test(i._tit))) { puntos = 3 * n; encontrados = n; enTitulo = n; }
      else if (b.altFrase.some((p) => p.test(i._tags) || p.test(i._txt))) { puntos = 1.2 * n; encontrados = n; }
    }
    if (!encontrados) return null;
    if (b.frase?.test(i._tit)) puntos += 5;
    else if (b.frase?.test(i._txt)) puntos += 1.5;
    if (enTitulo === b.terminos.length) puntos += 3;
    return { puntos: puntos + i._rec * 0.12, encontrados, completo: encontrados === b.terminos.length };
  }

  // Corrección de tipeo con el vocabulario de títulos y hashtags (se arma la primera vez que hace falta).
  let vocabulario = null;
  function obtenerVocabulario() {
    if (vocabulario) return vocabulario;
    vocabulario = new Map();
    for (const i of ITEMS) for (const w of `${i._tit} ${i._tags}`.split(/[^a-z0-9]+/)) if (w.length >= 3) vocabulario.set(w, (vocabulario.get(w) || 0) + 1);
    return vocabulario;
  }
  function distancia(a, b, maximo) {
    if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
    let previa = Array.from({ length: b.length + 1 }, (_, k) => k);
    for (let x = 1; x <= a.length; x++) {
      const actual = [x];
      let minimo = x;
      for (let y = 1; y <= b.length; y++) {
        actual[y] = Math.min(previa[y] + 1, actual[y - 1] + 1, previa[y - 1] + (a[x - 1] === b[y - 1] ? 0 : 1));
        minimo = Math.min(minimo, actual[y]);
      }
      if (minimo > maximo) return maximo + 1;
      previa = actual;
    }
    return previa[b.length];
  }
  function corregir(crudas) {
    const voc = obtenerVocabulario();
    let cambio = false;
    const nuevas = crudas.map((w) => {
      if (w.length < 4 || /\d/.test(w)) return w;
      for (const k of voc.keys()) if (k.startsWith(raizDe(w))) return w; // la palabra existe
      const maximo = w.length >= 8 ? 2 : 1;
      let mejor = null, mejorD = maximo + 1, mejorF = 0;
      for (const [k, f] of voc) {
        const d = distancia(w, k, maximo);
        if (d < mejorD || (d === mejorD && f > mejorF)) { mejor = k; mejorD = d; mejorF = f; }
      }
      if (!mejor || mejorD > maximo) return w;
      cambio = true;
      return mejor;
    });
    return cambio ? nuevas.join(' ') : null;
  }

  // Busca en una lista de recursos. Devuelve los recursos ordenados por relevancia y cómo se encontraron.
  function buscarEn(xs, texto, { permitirTema = true } = {}) {
    const b = prepararBusqueda(texto);
    if (!b) return { items: xs, modo: null };
    const evaluar = (bb) => {
      const res = [];
      for (const i of xs) { const r = puntuar(i, bb); if (r) res.push({ i, r }); }
      return res;
    };
    const porPuntos = (res) => {
      const puntos = new Map(res.map((x) => [x.i, x.r.puntos]));
      return repartir(res.map((x) => x.i), (i) => puntos.get(i));
    };
    const res = evaluar(b);
    const completos = res.filter((x) => x.r.completo);
    if (completos.length) return { items: porPuntos(completos), modo: 'exacta', b };

    const correccion = corregir(b.crudas);
    if (correccion) {
      const b2 = prepararBusqueda(correccion);
      const completos2 = evaluar(b2).filter((x) => x.r.completo);
      if (completos2.length) return { items: porPuntos(completos2), modo: 'corregida', correccion, b: b2 };
    }
    if (b.terminos.length > 1) {
      const minimo = Math.ceil(b.terminos.length / 2);
      const parciales = res.filter((x) => x.r.encontrados >= minimo);
      if (parciales.length) return { items: porPuntos(parciales), modo: 'parcial', b };
    }
    if (permitirTema) {
      const temas = temasDeBusqueda(tokensDe(texto)).slice(0, 3);
      if (temas.length) {
        const ids = new Set(temas.flatMap((c) => [...temasDe(c.id)]));
        return { items: repartir(xs.filter((i) => i.categorias.some((c) => ids.has(c))), (i) => i._rec), modo: 'tema', temas, b };
      }
    }
    return { items: [], modo: 'vacia', b };
  }

  // Marca en el título las palabras encontradas (normaliza letra por letra para ubicar el texto original).
  function resaltar(texto, patrones) {
    if (!patrones?.length) return esc(texto);
    let normal = '';
    const origen = [];
    for (let k = 0; k < texto.length;) {
      const cp = texto.codePointAt(k);
      const ancho = cp > 0xffff ? 2 : 1;
      for (const ch of norm(String.fromCodePoint(cp))) { normal += ch; origen.push([k, k + ancho]); }
      k += ancho;
    }
    const tramos = [];
    for (const re of patrones) {
      re.lastIndex = 0;
      for (let m = re.exec(normal); m; m = re.exec(normal)) {
        if (!m[0].length) { re.lastIndex++; continue; }
        tramos.push([origen[m.index][0], origen[m.index + m[0].length - 1][1]]);
      }
    }
    if (!tramos.length) return esc(texto);
    tramos.sort((a, c) => a[0] - c[0]);
    let html = '';
    let pos = 0;
    for (const [a, c] of tramos) {
      if (c <= pos) continue;
      const desde = Math.max(a, pos);
      html += esc(texto.slice(pos, desde)) + `<mark>${esc(texto.slice(desde, c))}</mark>`;
      pos = c;
    }
    return html + esc(texto.slice(pos));
  }

  // Temas cuyo nombre o palabras clave contienen lo buscado ("extintor" → Prevención de incendios). Solo se sugieren.
  const CLAVES_CAT = new Map(D.categorias.map((c) => [c.id, norm([c.nombre, ...(c.claves || [])].join(' | '))]));
  const temasDeBusqueda = (tokens) => {
    if (!tokens.length) return [];
    const pats = patronesDe(tokens);
    return CATS_VISIBLES.filter((c) => pats.every((p) => p.test(CLAVES_CAT.get(c.id)))).sort((a, b) => a.total - b.total);
  };

  // =====================================================================
  // Elementos
  // =====================================================================
  const el = {
    lateral: $('#lateral'), velo: $('#velo'), chips: $('#chipsCat'), q: $('#q'), sugerencias: $('#sugerencias'),
    cabecera: $('#cabecera'), secciones: $('#secciones'), herramientas: $('#herramientas'), seg: $('#segTipo'),
    selSector: $('#selSector'), selIdioma: $('#selIdioma'), selPlat: $('#selPlat'), selFuente: $('#selFuente'), selOrden: $('#selOrden'),
    btnFiltros: $('#btnFiltros'), burbujaFiltros: $('#burbujaFiltros'), barraPlat: $('#barraPlat'),
    resultado: $('#resultado'), barraHashtags: $('#barraHashtags'), grilla: $('#grilla'), vacio: $('#vacio'), centinela: $('#centinela'), pie: $('#pie'),
    hoja: $('#hoja'), hojaVelo: $('#hojaVelo'), hojaTitulo: $('#hojaTitulo'), hojaCuerpo: $('#hojaCuerpo'),
    btnMas: $('#btnMas'), btnInstalar: $('#btnInstalar'),
  };

  // =====================================================================
  // Lateral, chips y contadores
  // =====================================================================
  function pintarLateral() {
    const item = (ruta, href, icono, nombre, cuenta, estilo = '') =>
      `<a class="nav-item" data-ruta="${ruta}" href="${href}"${estilo}>${icono}<span class="nombre">${esc(nombre)}</span>` +
      (cuenta === undefined ? '' : `<span class="cuenta"${typeof cuenta === 'string' ? ` data-cuenta="${cuenta}"` : ''}>${typeof cuenta === 'number' ? nf.format(cuenta) : ''}</span>`) + '</a>';
    const emoji = (x) => `<span class="nav-emoji" aria-hidden="true">${x.icono}</span>`;
    const itemCat = (c) => item(`c:${c.id}`, `#/c/${c.id}`, emoji(c), c.nombre, c.total, ` style="--cat:${c.color}"`);
    const itemSector = (s) => item(`s:${s.id}`, `#/s/${s.id}`, emoji(s), s.nombre, s.total, ` style="--cat:${s.color}"`);

    const grupos = [...GRUPOS, { id: null, nombre: 'General' }]
      .map((g) => ({ g, cats: CATS_VISIBLES.filter((c) => (c.grupo ?? null) === g.id) }))
      .filter((x) => x.cats.length);
    const fuentes = [...FUENTES.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    el.lateral.innerHTML = `
      <nav aria-label="Principal">
        ${item('inicio', '#/', svg('inicio', 'nav-ico'), 'Inicio')}
        ${item('explorar', '#/explorar', svg('brujula', 'nav-ico'), 'Explorar')}
        ${item('listas', '#/listas', svg('lista', 'nav-ico'), 'Mis listas', 'listas')}
        ${item('guardados', '#/guardados', svg('corazon', 'nav-ico'), 'Guardados', 'guardados')}
        ${item('vistos', '#/vistos', svg('reloj', 'nav-ico'), 'Vistos', 'vistos')}
      </nav>
      ${SECTORES_VISIBLES.length ? `<p class="nav-titulo">Sectores</p>${SECTORES_VISIBLES.map(itemSector).join('')}` : ''}
      <p class="nav-titulo">Temas</p>
      ${grupos.map(({ g, cats }) => `<p class="nav-grupo">${esc(g.nombre)}</p>${cats.map(itemCat).join('')}`).join('')}
      <details id="detFuentes">
        <summary class="nav-titulo">Fuentes (${fuentes.length}) ${svg('abajo')}</summary>
        ${fuentes.map((f) => item(`f:${f.id}`, `#/f/${f.id}`, `<span class="avatar" style="--h:${tono(f.nombre)}" aria-hidden="true">${esc(inicial(f.nombre))}</span>`, f.nombre, f.total)).join('')}
      </details>
      <div class="lateral-extra" id="lateralExtra"></div>
      <div class="lateral-pie">
        Actualizado ${haceCuanto(D.generado)}.<br>
        SST Hub no aloja contenido: cada recurso te lleva a su fuente original.
      </div>`;
    pintarExtrasLateral();

    const porTotal = [...CATS_VISIBLES].sort((a, b) => b.total - a.total);
    el.chips.innerHTML = `<a class="chip" data-ruta="inicio" href="#/" style="--cat:#FFC21A">Todo</a>` +
      porTotal.map((c) => `<a class="chip" data-ruta="c:${c.id}" href="#/c/${c.id}" style="--cat:${c.color}"><span aria-hidden="true">${c.icono}</span>${esc(c.nombre)}</a>`).join('');

    el.selFuente.innerHTML = `<option value="todas">Todas las fuentes</option>` +
      fuentes.map((f) => `<option value="${esc(f.id)}">${esc(f.nombre)} (${nf.format(f.total)})</option>`).join('');
    el.selSector.innerHTML = `<option value="todos">Todos los sectores</option>` +
      SECTORES_VISIBLES.map((s) => `<option value="${esc(s.id)}">${s.icono} ${esc(s.nombre)}</option>`).join('');
    el.selIdioma.closest('.select').hidden = new Set(ITEMS.map((i) => i.idioma)).size < 2;
    const plats = opcionesPlataforma();
    el.selPlat.innerHTML = '<option value="todas">Todas las plataformas</option>' +
      plats.map(([k, nombre, n]) => `<option value="${k}">${nombre} (${nf.format(n)})</option>`).join('');
    el.selPlat.closest('.select').hidden = plats.length < 2;
  }

  // Instalar la app y restaurar ocultos (cambian durante la sesión).
  function pintarExtrasLateral() {
    const caja = $('#lateralExtra');
    if (!caja) return;
    const botones = [`<button type="button" class="nav-item" data-accion="elegir-pais">${svg('brujula', 'nav-ico')}<span class="nombre">Tu país: ${esc(nombrePais(miPais))}</span></button>`];
    if (puedeInstalar()) botones.push(`<button type="button" class="nav-item" data-accion="instalar">${svg('descargar', 'nav-ico')}<span class="nombre">Instalar la app</span></button>`);
    if (!esArchivoLocal) botones.push(`<button type="button" class="nav-item" data-accion="alternar-videos">${svg('play', 'nav-ico relleno')}<span class="nombre">Videos: ${preferenciaVideos === 'aqui' ? 'se ven aquí' : 'se abren en YouTube'}</span></button>`);
    if (ocultos.size) botones.push(`<button type="button" class="nav-item" data-accion="restaurar-ocultos">${svg('ocultar', 'nav-ico')}<span class="nombre">Restaurar ocultos</span><span class="cuenta">${ocultos.size}</span></button>`);
    caja.innerHTML = botones.length ? `<p class="nav-titulo">Opciones</p>${botones.join('')}` : '';
  }

  function actualizarContadores() {
    const nGuardados = ITEMS.filter((i) => guardados.has(i.id)).length;
    const nVistos = ITEMS.filter((i) => vistos[i.id]).length;
    const cuentas = { guardados: nGuardados, vistos: nVistos, listas: misListas.length };
    for (const [clave, n] of Object.entries(cuentas)) $$(`[data-cuenta="${clave}"]`).forEach((x) => { x.textContent = n ? nf.format(n) : ''; });
    $$('[data-burbuja="guardados"]').forEach((b) => { b.hidden = !nGuardados; b.textContent = nGuardados > 99 ? '99+' : nGuardados; });
  }

  function claveRuta() {
    return { categoria: `c:${estado.id}`, sector: `s:${estado.id}`, fuente: `f:${estado.id}`, lista: 'listas', ver: 'listas' }[estado.vista] ?? estado.vista;
  }
  const PESTANA = { inicio: 'inicio', explorar: 'explorar', categoria: 'explorar', sector: 'explorar', hashtag: 'explorar', fuente: 'explorar', listas: 'listas', lista: 'listas', ver: 'listas', guardados: 'guardados' };

  function marcarActivos() {
    const clave = claveRuta();
    $$('#lateral [data-ruta], #chipsCat [data-ruta]').forEach((a) => (a.dataset.ruta === clave ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const pestana = estado.vista === 'ver' && estado.id?.startsWith('r-') ? 'inicio' : PESTANA[estado.vista];
    $$('#tabbar [data-ruta]').forEach((a) => (a.dataset.ruta === pestana ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (estado.vista === 'fuente') $('#detFuentes').open = true;
    const chip = el.chips.querySelector('[aria-current="page"]');
    if (chip && el.chips.offsetParent) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
    document.body.dataset.pagina = estado.vista;
  }

  // =====================================================================
  // Piezas
  // =====================================================================
  const chipCat = (c, base = 'c') => `<a class="chip" href="#/${base}/${c.id}" style="--cat:${c.color}"><span aria-hidden="true">${c.icono}</span>${esc(c.nombre)}</a>`;
  const chipHashtag = (id, conCuenta = false) => {
    const h = HASHTAGS.get(id);
    return h ? `<a class="hashtag" href="#/t/${id}">#${esc(h.etiqueta)}${conCuenta ? `<span>${nf.format(h.total)}</span>` : ''}</a>` : '';
  };
  const avatarFuente = (nombre) => `<span class="avatar" style="--h:${tono(nombre)}" aria-hidden="true">${esc(inicial(nombre))}</span>`;
  const destinoDe = (i) => (esYoutube(i._dom) ? 'YouTube' : plataformaDe(i).clase === 'sello-web' ? i._dom : plataformaDe(i).nombre);

  const tile = (c, base = 'c') => `<a class="tile" href="#/${base}/${c.id}" style="--cat:${c.color}">
      ${c.portada ? `<img src="${esc(c.portada)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
      <span class="tile-icono" aria-hidden="true">${c.icono}</span>
      <span class="tile-nombre">${esc(c.nombre)}</span>
      <span class="tile-total">${plural(c.total, 'recurso', 'recursos')}</span>
    </a>`;

  function respaldo(i) {
    const c = CATS.get(i.categorias[0]) || CAT_RESPALDO;
    return `<span class="respaldo" style="--cat:${c.color}">
      <span class="respaldo-icono" aria-hidden="true">${c.icono}</span>
      ${i.tipo === 'documento' ? '<span class="respaldo-pdf">PDF</span>' : ''}
      <span class="respaldo-txt">${esc(i._dom)}</span></span>`;
  }
  const imagenDe = (i, clase = 'mini-img') => (i.miniatura
    ? `<img class="${clase}" src="${esc(i.miniatura)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-item="${i.id}">`
    : respaldo(i));

  // Origen del recurso: la plataforma de video (YouTube, Vimeo…) o la web de donde viene.
  const PLATAFORMAS = [
    [/(^|.)youtube.com$|^youtu.be$/, 'YouTube', 'sello-youtube'],
    [/(^|.)vimeo.com$/, 'Vimeo', 'sello-vimeo'],
    [/(^|.)dailymotion.com$/, 'Dailymotion', 'sello-dailymotion'],
    [/(^|.)archive.org$/, 'Internet Archive', 'sello-archive'],
    [/(^|.)(facebook.com|fb.watch)$/, 'Facebook', 'sello-facebook'],
    [/(^|.)tiktok.com$/, 'TikTok', 'sello-tiktok'],
    [/(^|.)linkedin.com$/, 'LinkedIn', 'sello-linkedin'],
  ];
  const LOGO_YT = '<svg class="logo-yt" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="5" width="22" height="14" rx="4" fill="#fff"/><path d="M10 9v6l5-3z" fill="#E62117"/></svg>';
  function plataformaDe(i) {
    const p = PLATAFORMAS.find(([re]) => re.test(i._dom));
    if (!p) return { nombre: i._dom || 'Web', clase: 'sello-web' };
    return { nombre: p[1] === 'YouTube' && i.short ? 'YouTube Shorts' : p[1], clase: p[2] };
  }
  const plataformaClave = (i) => (i._plat ??= plataformaDe(i).clase.replace('sello-', ''));
  const NOMBRES_PLAT = [['youtube', 'YouTube'], ['vimeo', 'Vimeo'], ['dailymotion', 'Dailymotion'], ['archive', 'Internet Archive'],
    ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'], ['web', 'Webs y blogs']];
  function opcionesPlataforma() {
    const n = new Map();
    for (const i of ITEMS) n.set(plataformaClave(i), (n.get(plataformaClave(i)) ?? 0) + 1);
    return NOMBRES_PLAT.filter(([k]) => n.has(k)).map(([k, nombre]) => [k, nombre, n.get(k)]);
  }

  function selloTipo(i) {
    const p = plataformaDe(i);
    const icono = p.clase === 'sello-youtube' ? LOGO_YT : p.clase === 'sello-web' ? svg(i.tipo === 'documento' ? 'documento' : 'globo') : svg('play', 'relleno');
    const tipo = i.tipo === 'documento' ? 'PDF · ' : '';
    return `<span class="sello sello-origen ${p.clase}" title="Origen: ${esc(p.nombre)}">${icono}<span class="sello-txt">${tipo}${esc(p.nombre)}</span></span>`;
  }

  function tarjeta(i) {
    const c0 = CATS.get(i.categorias[0]) || CAT_RESPALDO;
    const guardado = guardados.has(i.id);
    const destino = destinoDe(i);
    const enlace = `href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" data-salida="${i.id}"`;
    return `<article class="tarjeta${vistos[i.id] ? ' visto' : ''}" data-id="${i.id}">
      <a class="mini" ${enlace}${i.ytId ? ` data-yt="${esc(i.ytId)}"` : ''} style="--cat:${c0.color}" aria-label="${esc(i.titulo)}. ${verDentro(i) ? 'Ver aquí' : `Abrir en ${esc(destino)} (pestaña nueva)`}">
        ${imagenDe(i)}
        <span class="sellos">${selloTipo(i)}${esNuevo(i) ? `<span class="sello sello-nuevo">Nuevo</span>` : ''}${i.destacado ? `<span class="sello sello-video sello-dest">${svg('estrella')} Recomendado</span>` : ''}</span>
        ${i.duracion ? `<span class="sello sello-dur">${duracion(i.duracion)}</span>` : ''}
        <span class="sello sello-visto">${svg('check')} Visto</span>
        <span class="mini-salida">${verDentro(i) ? `${svg('play', 'relleno')} Ver aquí` : `${svg('externo')} Abrir en ${esc(destino)}`}</span>
        <span class="progreso"><i></i></span>
      </a>
      <button type="button" class="fav${guardado ? ' activo' : ''}" data-fav="${i.id}" aria-pressed="${guardado}" aria-label="${guardado ? 'Quitar de guardados' : 'Guardar'}">${svg('corazon')}</button>
      <div class="info">
        <div class="info-sup">
          <a class="titulo" ${enlace} title="${esc(i.resumen || i.titulo)}">${busqueda?.b ? resaltar(i.titulo, busqueda.b.resaltar) : esc(i.titulo)}</a>
          <button type="button" class="mas-opciones" data-menu="${i.id}" aria-label="Más opciones: ${esc(i.titulo)}">${svg('puntos')}</button>
        </div>
        <div class="meta">${avatarFuente(i.fuente)}<a class="fuente" href="#/f/${esc(i.fuenteId)}" title="Ver todo de ${esc(i.fuente)}">${esc(i.fuente)}</a></div>
        <div class="meta meta-2">
          ${i.vistas ? `<span>${compacto.format(i.vistas)} vistas</span><span class="punto">·</span>` : ''}
          <time datetime="${i.fecha}" title="${fechaLarga.format(new Date(i.fecha))}">${haceCuanto(i.fecha)}</time>
        </div>
        <div class="etiquetas">${chipCat(c0.id ? c0 : CAT_RESPALDO)}${i.hashtags.slice(0, 2).map((h) => chipHashtag(h)).join('')}</div>
      </div>
    </article>`;
  }

  // Portada tipo "playlist": mosaico de 4 miniaturas + cantidad.
  function mosaico(items, color) {
    const celdas = items.slice(0, 4).map((i) => `<span class="mosaico-celda">${i.miniatura ? `<img src="${esc(i.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`);
    while (celdas.length < 4) celdas.push('<span class="mosaico-celda"></span>');
    return `<span class="mosaico" style="--cat:${color}">${celdas.join('')}</span>`;
  }

  function tarjetaLista(l) {
    const items = itemsDeLista(l);
    const subtitulo = l.tipo === 'mia' ? `Tu lista · ${haceCuanto(l.actualizada)}` : esc(l.descripcion || '');
    return `<a class="lista-card" href="#/lista/${l.ref}" style="--cat:${l.color}">
      <span class="lista-portada">${mosaico(items, l.color)}<span class="lista-cuenta">${svg('lista')}${nf.format(items.length)}</span>
        <span class="lista-play">${svg('play')} Ver lista</span></span>
      <span class="lista-info"><b><span aria-hidden="true">${l.icono}</span> ${esc(l.nombre)}</b><small>${subtitulo}</small></span>
    </a>`;
  }

  // =====================================================================
  // Cabeceras y secciones
  // =====================================================================
  const cabSimple = (titulo, texto, extra = '') => `<div class="cab-simple"><div><h1>${titulo}</h1><p>${texto}</p></div>${extra}</div>`;
  const seccion = (titulo, enlace, contenido) => `<div class="seccion-titulo"><h2>${titulo}</h2>${enlace || ''}</div>${contenido}`;
  const verTodo = (href, texto) => `<a href="${href}">${texto} ${svg('flecha')}</a>`;

  function cabeceraGrupo(c, base, tipoNombre) {
    const hermanas = base === 'c'
      ? CATS_VISIBLES.filter((x) => x.grupo === c.grupo && x.id !== c.id).slice(0, 8).map((x) => chipCat(x)).join('')
      : SECTORES_VISIBLES.filter((x) => x.id !== c.id).slice(0, 8).map((x) => chipCat(x, 's')).join('');
    const grupo = base === 'c' ? GRUPOS.find((g) => g.id === c.grupo) : null;
    const enBusqueda = estado.q ? `<p class="cab-stats">Buscando “${esc(estado.q)}” aquí. <a class="limpiar" href="#/?q=${encodeURIComponent(estado.q)}">Buscar en todo el portal</a></p>` : '';
    return `<div class="cab-cat" style="--cat:${c.color}">
      <span class="cab-icono" aria-hidden="true">${c.icono}</span>
      <div>
        <p class="migas"><a href="#/explorar">Explorar</a> › ${tipoNombre}${grupo ? ` › ${esc(grupo.nombre)}` : ''}</p>
        <h1>${esc(c.nombre)}</h1>
        <p>${esc(c.descripcion)}</p>
        <p class="cab-stats"><span><b>${nf.format(c.total)}</b> recursos</span>
          ${c.videos ? `<span>${plural(c.videos, 'video', 'videos')}</span>` : ''}
          ${c.articulos ? `<span>${plural(c.articulos, 'artículo', 'artículos')}</span>` : ''}
          ${c.documentos ? `<span>${plural(c.documentos, 'documento', 'documentos')}</span>` : ''}</p>
        ${enBusqueda}
        ${hermanas ? `<div class="relacionadas">${hermanas}</div>` : ''}
      </div>
    </div>`;
  }

  function pintarCabecera() {
    const { vista, q } = estado;
    let html = '';
    if (vista === 'inicio' && !q) {
      const xs = visibles();
      const videos = xs.filter((i) => i.tipo === 'video').length;
      const nuevos = cuantosNuevos();
      html = `<div class="hero">
        <div>
          <p class="hero-kicker">Seguridad y salud en el trabajo</p>
          <h1>Aprende a trabajar seguro, <span>sin buscar en mil sitios.</span></h1>
          <p class="hero-sub">${plural(xs.length, 'video, guía o noticia', 'videos, guías y noticias')} de ${plural(FUENTES.size, 'fuente confiable', 'fuentes confiables')}, ordenados por tema y sector.
            Arma listas para tus charlas y compártelas con tu equipo.</p>
          ${nuevos ? `<a class="hero-nuevos" href="#/?nuevos=1">${svg('nuevo')} ${plural(nuevos, 'recurso nuevo', 'recursos nuevos')} desde tu última visita</a>` : ''}
        </div>
        <div class="hero-stats">
          <div class="stat"><b>${nf.format(videos)}</b><span>videos</span></div>
          <div class="stat"><b>${nf.format(xs.length - videos)}</b><span>artículos y guías</span></div>
          <div class="stat"><b>${CATS_VISIBLES.length}</b><span>temas</span></div>
        </div>
      </div>`;
    } else if (vista === 'inicio') {
      const otra = (texto) => `<a class="limpiar" href="#/?q=${encodeURIComponent(texto)}">${esc(texto)}</a>`;
      if (busqueda?.modo === 'tema') {
        html = cabSimple(`Sin coincidencias exactas para “${esc(q)}”`, 'Ningún título ni descripción lo menciona. Te mostramos recursos del tema relacionado:') +
          `<div class="relacionadas relacionadas-busqueda">${busqueda.temas.map((c) => chipCat(c)).join('')}</div>`;
      } else if (busqueda?.modo === 'corregida') {
        html = cabSimple(`Resultados para “${esc(busqueda.correccion)}”`, `No encontramos “${esc(q)}”; mostramos lo más parecido. ¿Buscabas exactamente lo que escribiste? Revisa la ortografía.`);
      } else if (busqueda?.modo === 'parcial') {
        html = cabSimple(`Resultados para “${esc(q)}”`, `Ningún recurso tiene todas las palabras; mostramos los que tienen la mayoría. Prueba con menos palabras, por ejemplo ${otra(busqueda.b.crudas[0])}.`);
      } else {
        const porTema = new Map();
        for (const i of ambito) for (const c of i.categorias) porTema.set(c, (porTema.get(c) ?? 0) + 1);
        const afinar = [...porTema].filter(([c, n]) => CATS.has(c) && n >= 2 && n < ambito.length).sort((a, b) => b[1] - a[1]).slice(0, 8);
        html = cabSimple(`Resultados para “${esc(q)}”`, 'Recursos que lo mencionan en el título, la descripción o sus hashtags, repartidos entre plataformas y fuentes. Al final de la lista seguimos buscando en blogs, Dailymotion e Internet Archive.') +
          (afinar.length ? `<div class="relacionadas relacionadas-busqueda"><span>Afinar por tema:</span>${afinar.map(([c, n]) => {
            const x = CATS.get(c);
            return `<a class="chip chip-cat" href="#/c/${c}?q=${encodeURIComponent(q)}" style="--cat:${x.color}"><span aria-hidden="true">${x.icono}</span>${esc(x.nombre)}<small>${nf.format(n)}</small></a>`;
          }).join('')}</div>` : '');
      }
    } else if (vista === 'categoria') {
      html = cabeceraGrupo(CATS.get(estado.id), 'c', 'Tema');
    } else if (vista === 'sector') {
      html = cabeceraGrupo(SECTORES.get(estado.id), 's', 'Sector');
    } else if (vista === 'hashtag') {
      const h = HASHTAGS.get(estado.id);
      const relacionados = hashtagsRelacionados(estado.id, 10);
      html = `<div class="cab-hashtag"><p class="migas"><a href="#/explorar">Explorar</a> › Hashtag</p>
        <h1><span>#</span>${esc(h.etiqueta)}</h1><p>${plural(h.total, 'recurso', 'recursos')} con este hashtag.</p>
        ${relacionados.length ? `<div class="relacionadas">${relacionados.map((x) => chipHashtag(x)).join('')}</div>` : ''}</div>`;
    } else if (vista === 'fuente') {
      const f = FUENTES.get(estado.id);
      html = `<div class="cab-fuente">${avatarFuente(f.nombre)}<div><p class="migas"><a href="#/explorar">Explorar</a> › Fuente${f.pais ? ` · ${esc(f.pais)}` : ''}</p>
        <h1>${esc(f.nombre)}</h1><p>${plural(f.total, 'recurso', 'recursos')} · ${{ youtube: 'Canal de YouTube', rss: 'Sitio web', vimeo: 'Cuenta de Vimeo', dailymotion: 'Dailymotion', archive: 'Internet Archive' }[f.tipo] ?? 'Selección'} · ${f.idioma === 'en' ? 'en inglés' : 'en español'}</p></div></div>`;
    } else if (vista === 'guardados') {
      html = cabSimple('Guardados', 'Tu lista personal. Se guarda en este navegador, sin cuentas ni contraseñas.',
        `<a class="boton boton-sec" href="#/listas">${svg('lista')} Mis listas</a>`);
    } else if (vista === 'vistos') {
      const hay = ITEMS.some((i) => vistos[i.id]);
      html = cabSimple('Vistos recientemente', 'Lo que abriste desde aquí, para volver a encontrarlo.',
        hay ? `<button type="button" class="boton boton-sec" data-accion="borrar-vistos">${svg('papelera')} Borrar historial</button>` : '');
    }
    el.cabecera.innerHTML = html;
  }

  function hashtagsRelacionados(id, max) {
    const conteo = new Map();
    for (const i of visibles()) {
      if (!i.hashtags.includes(id)) continue;
      for (const h of i.hashtags) if (h !== id) conteo.set(h, (conteo.get(h) ?? 0) + 1);
    }
    return [...conteo].sort((a, b) => b[1] - a[1]).slice(0, max).map(([h]) => h);
  }

  function pintarSeccionesInicio() {
    if (estado.vista !== 'inicio' || estado.q) { el.secciones.innerHTML = ''; return; }
    const listas = [...LISTAS_DEST.keys()].map((id) => obtenerLista(`d-${id}`));
    const temas = [...CATS_VISIBLES].sort((a, b) => b.total - a.total).slice(0, 12);
    const tags = (D.hashtags || []).slice(0, 24);
    el.secciones.innerHTML = [
      listas.length ? seccion('Listas para tu próxima charla', verTodo('#/listas', 'Ver listas'), `<div class="carrusel carrusel-listas">${listas.map(tarjetaLista).join('')}</div>`) : '',
      seccion('Explora por tema', verTodo('#/explorar', `Ver los ${CATS_VISIBLES.length} temas`), `<div class="carrusel">${temas.map((c) => tile(c)).join('')}</div>`),
      SECTORES_VISIBLES.length ? seccion('¿En qué sector trabajas?', '', `<div class="pildoras">${SECTORES_VISIBLES.map((s) => `
        <a class="pildora" href="#/s/${s.id}" style="--cat:${s.color}"><span class="pildora-icono" aria-hidden="true">${s.icono}</span>
          <span><b>${esc(s.nombre)}</b><small>${plural(s.total, 'recurso', 'recursos')}</small></span></a>`).join('')}</div>`) : '',
      tags.length ? seccion('Hashtags del momento', verTodo('#/explorar#hashtags', 'Ver todos'), `<div class="hashtags-fila">${tags.map((h) => chipHashtag(h.id, true)).join('')}</div>`) : '',
      `<div class="seccion-titulo"><h2>${estado.nuevos ? 'Nuevo desde tu última visita'
        : estado.orden === 'recomendados' ? `Recomendados para ti · ${esc(nombrePais(miPais))}` : 'Todos los recursos'}</h2>
        <button type="button" class="enlace-boton" data-accion="elegir-pais">${svg('brujula')} Cambiar país</button></div>`,
    ].join('');
  }

  function pintarExplorar() {
    el.cabecera.innerHTML = cabSimple('Explorar', 'Elige por sector, por tema, por hashtag o por fuente. Un mismo recurso puede estar en varios.');
    const tagsMax = Math.max(1, ...(D.hashtags || []).map((h) => h.total));
    const fuentes = [...FUENTES.values()].sort((a, b) => b.total - a.total);
    el.secciones.innerHTML = [
      SECTORES_VISIBLES.length ? seccion('Por sector', '', `<div class="tiles">${SECTORES_VISIBLES.map((s) => tile(s, 's')).join('')}</div>`) : '',
      ...[...GRUPOS, { id: null, nombre: 'Temas generales' }].map((g) => {
        const cats = CATS_VISIBLES.filter((c) => (c.grupo ?? null) === g.id);
        return cats.length ? seccion(esc(g.nombre), '', `<div class="tiles">${cats.map((c) => tile(c)).join('')}</div>`) : '';
      }),
      (D.hashtags || []).length ? `<div id="hashtags">${seccion('Hashtags', '', `<div class="nube">${D.hashtags.slice(0, 80).map((h) =>
        `<a class="hashtag" href="#/t/${h.id}" style="--peso:${(0.85 + 0.75 * Math.sqrt(h.total / tagsMax)).toFixed(2)}">#${esc(h.etiqueta)}<span>${nf.format(h.total)}</span></a>`).join('')}</div>`)}</div>` : '',
      seccion('Fuentes', '', `<div class="fuentes-grilla">${fuentes.map((f) => `
        <a class="fuente-card" href="#/f/${f.id}">${avatarFuente(f.nombre)}<span><b>${esc(f.nombre)}</b>
          <small>${{ youtube: 'YouTube', rss: 'Web', vimeo: 'Vimeo', dailymotion: 'Dailymotion', archive: 'Internet Archive' }[f.tipo] ?? 'Selección'}${f.pais ? ` · ${esc(f.pais)}` : ''} · ${plural(f.total, 'recurso', 'recursos')}</small></span></a>`).join('')}</div>`),
    ].join('');
    if (location.hash.endsWith('#hashtags')) $('#hashtags')?.scrollIntoView();
  }

  // ---------- Listas ----------
  function pintarListas() {
    el.cabecera.innerHTML = cabSimple('Listas', 'Arma listas para tus charlas, inducciones o capacitaciones. Míralas aquí seguidas o compártelas por WhatsApp.',
      `<button type="button" class="boton" data-accion="crear-lista">${svg('mas')} Nueva lista</button>`);
    const mias = misListas.map((l) => obtenerLista(`m-${l.id}`));
    const destacadas = [...LISTAS_DEST.keys()].map((id) => obtenerLista(`d-${id}`));
    el.secciones.innerHTML = [
      seccion('Mis listas', '', mias.length
        ? `<div class="listas-grilla">${mias.map(tarjetaLista).join('')}</div>`
        : `<div class="aviso-vacio"><span aria-hidden="true">▶️</span><div><b>Todavía no tienes listas.</b>
            <p>Crea una con «Nueva lista» o toca ${svg('puntos')} en cualquier recurso y elige «Agregar a una lista».</p></div></div>`),
      destacadas.length ? seccion('Listas destacadas', '', `<div class="listas-grilla">${destacadas.map(tarjetaLista).join('')}</div>`) : '',
    ].join('');
  }

  function pintarDetalleLista() {
    const l = obtenerLista(estado.id);
    const items = itemsDeLista(l);
    const faltan = l.ids.length - items.length;
    const videos = items.filter((i) => i.tipo === 'video');
    const deYoutube = videos.filter((i) => i.ytId);
    const total = items.reduce((s, i) => s + (i.duracion || 0), 0);
    const etiqueta = { mia: 'Tu lista', destacada: 'Lista destacada', compartida: 'Lista compartida' }[l.tipo];
    const acciones = [
      items.length ? `<a class="boton" href="#/ver/${l.ref}/0${l.ref === 'c' ? hashDe({ ...estado, vista: 'lista' }).replace(/^[^?]*/, '') : ''}">${svg('play')} Ver lista</a>` : '',
      deYoutube.length ? `<a class="boton boton-sec" href="${urlYoutubeDeLista(deYoutube)}" target="_blank" rel="noopener noreferrer">${svg('externo')} Reproducir en YouTube</a>` : '',
      items.length ? `<button type="button" class="boton boton-sec" data-accion="compartir-lista">${svg('compartir')} Compartir</button>` : '',
      l.editable ? `<button type="button" class="boton boton-sec" data-accion="renombrar-lista">${svg('lapiz')} Renombrar</button>
        <button type="button" class="boton boton-sec boton-peligro" data-accion="eliminar-lista">${svg('papelera')} Eliminar</button>`
        : `<button type="button" class="boton boton-sec" data-accion="copiar-lista">${svg('mas')} Guardar en mis listas</button>`,
    ].join('');

    el.cabecera.innerHTML = `<div class="cab-lista" style="--cat:${l.color}">
      <div class="cab-lista-portada">${mosaico(items, l.color)}</div>
      <div class="cab-lista-info">
        <p class="migas"><a href="#/listas">Listas</a> › ${etiqueta}</p>
        <h1><span aria-hidden="true">${l.icono}</span> ${esc(l.nombre)}</h1>
        ${l.descripcion ? `<p>${esc(l.descripcion)}</p>` : ''}
        <p class="cab-stats"><span><b>${nf.format(items.length)}</b> recursos</span>${videos.length ? `<span>${plural(videos.length, 'video', 'videos')}</span>` : ''}
          ${total ? `<span>${duracionTotal(total)}</span>` : ''}${faltan ? `<span>${plural(faltan, 'recurso ya no está disponible', 'recursos ya no están disponibles')}</span>` : ''}</p>
        <div class="acciones">${acciones}</div>
      </div>
    </div>`;

    if (!items.length) {
      el.secciones.innerHTML = `<div class="aviso-vacio"><span aria-hidden="true">📭</span><div><b>Esta lista está vacía.</b>
        <p>Toca ${svg('puntos')} en cualquier recurso y elige «Agregar a una lista».</p><a class="boton" href="#/">Explorar recursos</a></div></div>`;
      return;
    }
    const sufijo = l.ref === 'c' ? hashDe({ ...estado, vista: 'lista' }).replace(/^[^?]*/, '') : '';
    el.secciones.innerHTML = `<ol class="filas">${items.map((i, k) => `
      <li class="fila${vistos[i.id] ? ' visto' : ''}" data-id="${i.id}">
        <span class="fila-n">${k + 1}</span>
        <a class="fila-mini" href="#/ver/${l.ref}/${k}${sufijo}" style="--cat:${(CATS.get(i.categorias[0]) || CAT_RESPALDO).color}">${imagenDe(i)}${i.duracion ? `<span class="sello sello-dur">${duracion(i.duracion)}</span>` : ''}</a>
        <div class="fila-info">
          <a class="fila-titulo" href="#/ver/${l.ref}/${k}${sufijo}">${esc(i.titulo)}</a>
          <span class="fila-meta">${esc(i.fuente)} · ${i.tipo === 'video' ? 'Video' : i.tipo === 'documento' ? 'PDF' : 'Artículo'} · ${haceCuanto(i.fecha)}</span>
        </div>
        <div class="fila-acciones">${l.editable ? `
          <button type="button" class="icono-btn" data-mover="-1" data-pos="${k}" aria-label="Subir" ${k === 0 ? 'disabled' : ''}>${svg('arriba')}</button>
          <button type="button" class="icono-btn" data-mover="1" data-pos="${k}" aria-label="Bajar" ${k === items.length - 1 ? 'disabled' : ''}>${svg('abajo')}</button>
          <button type="button" class="icono-btn" data-quitar-de-lista="${i.id}" aria-label="Quitar de la lista">${svg('papelera')}</button>`
          : `<button type="button" class="icono-btn" data-menu="${i.id}" aria-label="Más opciones">${svg('puntos')}</button>`}
        </div>
      </li>`).join('')}</ol>`;
  }

  const urlYoutubeDeLista = (videos) => `https://www.youtube.com/watch_videos?video_ids=${videos.slice(0, 50).map((i) => i.ytId).join(',')}`;

  // ---------- Reproductor ----------
  // Hay un solo reproductor para toda la app (#flotante, fuera de la página). En la página del video se coloca
  // encima del espacio reservado (#repPantalla); al navegar a otra parte pasa a "mini" en una esquina y sigue
  // sonando. Nunca se mueve en el documento: mover un iframe lo recargaría y cortaría el video.
  // YouTube usa su API (pausa y avance automático); Vimeo, Dailymotion y Archive, el iframe de cada plataforma.
  let reproductor = null; // { player, modo: 'yt' | 'iframe', clave, ref, ids, nombre, pos, compartida }
  let cargaApiYT = null;
  let avanceAutomatico = almacen.leer('autoavance', true);
  const flotante = $('#flotante');

  function cargarApiYoutube() {
    if (window.YT?.Player) return Promise.resolve();
    cargaApiYT ??= new Promise((ok, falla) => {
      const anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { anterior?.(); ok(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { cargaApiYT = null; falla(new Error('sin conexión con YouTube')); };
      document.head.append(s);
    });
    return cargaApiYT;
  }

  const enSuPagina = () => Boolean(reproductor) && estado.vista === 'ver' && estado.id === reproductor.ref;
  const itemSonando = () => (reproductor ? POR_ID.get(reproductor.ids[reproductor.pos]) : null);
  const rutaDelReproductor = () => hashDe({ vista: 'ver', id: reproductor.ref, pos: reproductor.pos, compartida: reproductor.compartida });

  function cerrarReproductor() {
    try { reproductor?.player?.destroy(); } catch { /* ya no existe */ }
    reproductor = null;
    $('#flotanteVideo').innerHTML = '<div id="repVideo"></div>';
    flotante.hidden = true;
    flotante.classList.remove('minimizado', 'sin-api');
  }

  // Pone el reproductor sobre su espacio en la página del video, o en la esquina si estás en otra parte.
  function ubicarFlotante() {
    document.body.classList.toggle('con-mini', Boolean(reproductor) && !enSuPagina());
    if (!reproductor) { flotante.hidden = true; return; }
    const lugar = enSuPagina() ? $('#repPantalla') : null;
    if (lugar?.dataset.afuera) { flotante.hidden = true; return; }
    flotante.hidden = false;
    if (lugar) {
      const r = lugar.getBoundingClientRect();
      flotante.classList.remove('minimizado');
      Object.assign(flotante.style, { top: `${r.top + scrollY}px`, left: `${r.left + scrollX}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else {
      flotante.classList.add('minimizado');
      flotante.removeAttribute('style');
    }
    actualizarBarraMini();
  }
  new ResizeObserver(() => ubicarFlotante()).observe(document.body);
  window.addEventListener('resize', ubicarFlotante);

  function actualizarBarraMini() {
    const i = itemSonando();
    if (!i) return;
    $('#flotanteTitulo').textContent = i.titulo;
    $('#flotanteLista').textContent = reproductor.ids.length > 1 ? `${reproductor.nombre} · ${reproductor.pos + 1} de ${reproductor.ids.length}` : i.fuente;
  }

  function iconoPausa(sonando) {
    $('#flotantePausa').innerHTML = sonando ? '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>' : `<svg class="relleno" viewBox="0 0 24 24">${TRAZOS.play}</svg>`;
    $('#flotantePausa').setAttribute('aria-label', sonando ? 'Pausar' : 'Reproducir');
  }

  const claveDe = (i) => i.ytId || i.embed;
  const urlEmbed = (i) => `${i.embed}${i.embed.includes('?') ? '&' : '?'}autoplay=1`;

  // Empieza (o continúa, si ya es el mismo) el video de una lista.
  function reproducir(l, pos) {
    const i = POR_ID.get(l.ids[pos]);
    if (!reproducible(i)) return;
    const mismo = reproductor && reproductor.clave === claveDe(i);
    reproductor ??= { player: null, modo: null, clave: null };
    Object.assign(reproductor, { ref: l.ref, ids: l.ids, nombre: l.nombre, pos, compartida: l.ref === 'c' ? estado.compartida : null });
    if (!mismo) cargarVideo(i);
    ubicarFlotante();
  }

  // Pone un video en el reproductor. Pasar de YouTube a otra plataforma (o al revés) cambia el iframe.
  function cargarVideo(i) {
    reproductor.clave = claveDe(i);
    flotante.classList.toggle('sin-api', !i.ytId); // sin API no hay botón de pausa (se usa el del propio video)
    if (!i.ytId) {
      try { reproductor.player?.destroy(); } catch { /* ya no existe */ }
      reproductor.player = null;
      reproductor.modo = 'iframe';
      $('#flotanteVideo').innerHTML = `<iframe id="repVideo" src="${esc(urlEmbed(i))}" title="${esc(i.titulo)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      registrarVisto(i.id);
      return;
    }
    if (reproductor.modo === 'yt') { reproductor.player?.loadVideoById?.(i.ytId); return; } // si aún carga, onReady lo pone
    reproductor.modo = 'yt';
    $('#flotanteVideo').innerHTML = '<div id="repVideo"></div>';
    cargarApiYoutube().then(() => {
      if (reproductor?.modo !== 'yt' || reproductor.player) return;
      reproductor.player = new window.YT.Player('repVideo', {
        videoId: reproductor.clave,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: (e) => { if (reproductor?.modo === 'yt' && e.target.getVideoData?.().video_id !== reproductor.clave) e.target.loadVideoById(reproductor.clave); },
          onStateChange: (e) => {
            const actual = itemSonando();
            if (e.data === window.YT.PlayerState.PLAYING && actual) registrarVisto(actual.id);
            if (e.data === window.YT.PlayerState.PLAYING) iconoPausa(true);
            if (e.data === window.YT.PlayerState.PAUSED) iconoPausa(false);
            if (e.data === window.YT.PlayerState.ENDED && avanceAutomatico) avanzar(1);
          },
          onError: () => {
            const actual = itemSonando();
            if (enSuPagina() && actual) pantallaAfuera(actual, 'Su autor no permite verlo fuera de YouTube.');
            else if (!avanzar(1)) cerrarReproductor();
          },
        },
      });
    }).catch(() => {
      const actual = itemSonando();
      if (enSuPagina() && actual) pantallaAfuera(actual, 'No se pudo conectar con YouTube.');
    });
  }

  // Siguiente o anterior. En la página del video también actualiza la página; en "mini" solo cambia el video
  // (y salta los artículos, que no se pueden reproducir).
  function avanzar(delta) {
    if (!reproductor) return false;
    if (enSuPagina()) {
      const pos = reproductor.pos + delta;
      if (pos < 0 || pos >= reproductor.ids.length) return false;
      irAPosicion(pos);
      return true;
    }
    let pos = reproductor.pos + delta;
    while (pos >= 0 && pos < reproductor.ids.length && !reproducible(POR_ID.get(reproductor.ids[pos]))) pos += Math.sign(delta);
    const i = POR_ID.get(reproductor.ids[pos]);
    if (!reproducible(i)) return false;
    reproductor.pos = pos;
    cargarVideo(i);
    actualizarBarraMini();
    return true;
  }

  const ACCIONES_FLOTANTE = {
    pausa() {
      const p = reproductor?.player;
      if (!p?.getPlayerState) return;
      if (p.getPlayerState() === window.YT.PlayerState.PLAYING) p.pauseVideo(); else p.playVideo();
    },
    siguiente() { avanzar(1); },
    ampliar() { if (reproductor) location.hash = rutaDelReproductor(); },
    cerrar() { cerrarReproductor(); },
  };

  function sufijoCompartida() {
    return estado.id === 'c' ? hashDe({ ...estado, vista: 'lista' }).replace(/^[^?]*/, '') : '';
  }

  function irAPosicion(pos) {
    const l = obtenerLista(estado.id);
    const items = itemsDeLista(l);
    if (pos < 0 || pos >= items.length) return;
    estado.pos = pos;
    history.replaceState(null, '', hashDe(estado));
    pintarReproductor(true);
  }

  function pintarReproductor(soloCambio = false) {
    const l = obtenerLista(estado.id);
    const items = itemsDeLista(l);
    if (!items.length) { location.hash = `#/lista/${l.ref}`; return; }
    estado.pos = Math.min(estado.pos, items.length - 1);
    const i = items[estado.pos];
    const sig = items[estado.pos + 1];
    const destino = destinoDe(i);
    const sufijo = sufijoCompartida();

    if (!soloCambio || !$('#repPantalla')) {
      el.cabecera.innerHTML = '';
      el.secciones.innerHTML = `<div class="reproductor">
        <div class="rep-principal"><div class="rep-pantalla" id="repPantalla"></div><div class="rep-info" id="repInfo"></div></div>
        <aside class="rep-cola" id="repCola" aria-label="Recursos de la lista"></aside>
      </div>`;
    }

    // Pantalla: el reproductor flotante se coloca encima; para artículos (o sin conexión) se muestra un aviso.
    const pantalla = $('#repPantalla');
    pantalla.innerHTML = '';
    delete pantalla.dataset.afuera;
    if (reproducible(i) && !esArchivoLocal) {
      // Las listas se identifican por sus recursos (la de "A continuación" usa los que había al empezar).
      const ids = items.map((x) => x.id);
      reproducir({ ref: l.ref, ids, nombre: l.nombre }, estado.pos);
    } else {
      reproductor?.player?.pauseVideo?.();
      if (reproducible(i)) pantallaAfuera(i, 'Para verla aquí, abre el portal con <b>ABRIR_PORTAL.bat</b> o desde su dirección en internet.');
      else pantallaAfuera(i, i.tipo === 'documento' ? 'Este recurso es un documento PDF.' : 'Este recurso es un artículo.', true);
    }

    const guardado = guardados.has(i.id);
    $('#repInfo').innerHTML = `
      <h1 class="rep-titulo">${esc(i.titulo)}</h1>
      <div class="meta">${avatarFuente(i.fuente)}<a class="fuente" href="#/f/${esc(i.fuenteId)}">${esc(i.fuente)}</a><span class="punto">·</span>
        <time datetime="${i.fecha}">${haceCuanto(i.fecha)}</time>${i.vistas ? `<span class="punto">·</span><span>${compacto.format(i.vistas)} vistas</span>` : ''}</div>
      <div class="rep-controles">
        <button type="button" class="boton boton-sec" data-rep="anterior" ${estado.pos === 0 ? 'disabled' : ''}>${svg('anterior')} Anterior</button>
        <button type="button" class="boton" data-rep="siguiente" ${sig ? '' : 'disabled'}>Siguiente ${svg('siguiente')}</button>
        ${i.ytId || !reproducible(i) ? `<label class="interruptor"><input type="checkbox" id="repAuto" ${avanceAutomatico ? 'checked' : ''}><span></span>Avance automático</label>` : ''}
        <span class="rep-separador"></span>
        <button type="button" class="icono-btn fav-btn${guardado ? ' activo' : ''}" data-fav="${i.id}" aria-pressed="${guardado}" aria-label="${guardado ? 'Quitar de guardados' : 'Guardar'}">${svg('corazon')}</button>
        <a class="icono-btn" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" data-salida="${i.id}" aria-label="Abrir en ${esc(destino)}" title="Abrir en ${esc(destino)}">${svg('externo')}</a>
        <button type="button" class="icono-btn" data-menu="${i.id}" aria-label="Más opciones">${svg('puntos')}</button>
      </div>
      <p class="rep-nota">Sigue explorando: el video continúa en una ventanita mientras navegas.</p>
      <div class="etiquetas">${i.categorias.map((c) => chipCat(CATS.get(c))).join('')}${i.hashtags.map((h) => chipHashtag(h)).join('')}</div>
      ${i.resumen ? `<p class="rep-resumen">${esc(i.resumen)}</p>` : ''}`;

    $('#repCola').innerHTML = `
      <header><div><b>${esc(l.nombre)}</b><span>${l.tipo === 'relacionados' ? esc(l.descripcion) : `${estado.pos + 1} de ${items.length}`}</span></div>${l.tipo === 'relacionados' ? '' : `<a href="#/lista/${l.ref}${sufijo}">Ver lista</a>`}</header>
      <ol>${items.map((x, k) => `<li${k === estado.pos ? ' aria-current="true"' : ''}>
        <button type="button" data-ir="${k}"><span class="cola-n">${k === estado.pos ? svg('play') : k + 1}</span>
          <span class="cola-mini">${imagenDe(x)}</span>
          <span class="cola-txt"><b>${esc(x.titulo)}</b><small>${esc(x.fuente)}</small></span></button></li>`).join('')}</ol>`;
    $('#repCola li[aria-current]')?.scrollIntoView({ block: 'nearest' });
    document.title = `${i.titulo} · ${l.nombre} · SST Hub`;
    requestAnimationFrame(ubicarFlotante);
  }

  function pantallaAfuera(i, motivo, esArticulo = false) {
    const pantalla = $('#repPantalla');
    if (!pantalla) return;
    pantalla.dataset.afuera = '1';
    reproductor?.player?.pauseVideo?.();
    if (reproductor?.modo === 'iframe') cerrarReproductor(); // sin API no se puede pausar: se cierra
    ubicarFlotante();
    pantalla.innerHTML = `<div class="rep-afuera" style="--cat:${(CATS.get(i.categorias[0]) || CAT_RESPALDO).color}">
      ${i.miniatura ? `<img src="${esc(i.miniatura)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div class="rep-afuera-caja">
        <p>${motivo}</p>
        <a class="boton" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" data-salida="${i.id}">${svg('externo')} ${esArticulo ? 'Leer en' : 'Ver en'} ${esc(destinoDe(i))}</a>
      </div>
    </div>`;
  }

  // =====================================================================
  // Lista de recursos (grilla)
  // =====================================================================
  // Primero el ámbito de la página (tema, sector, hashtag, fuente…) y la búsqueda; después los filtros.
  // Así se puede contar cuántos resultados daría cada opción de filtro y no ofrecer callejones sin salida.
  let ambito = [];
  let facetas = null;
  function alcance() {
    let xs = visibles();
    const { vista, id } = estado;
    if (vista === 'categoria') { const temas = temasDe(id); xs = xs.filter((i) => i.categorias.some((c) => temas.has(c))); }
    else if (vista === 'sector') xs = xs.filter((i) => i.sectores.includes(id));
    else if (vista === 'hashtag') xs = xs.filter((i) => i.hashtags.includes(id));
    else if (vista === 'fuente') xs = xs.filter((i) => i.fuenteId === id);
    else if (vista === 'guardados') xs = ITEMS.filter((i) => guardados.has(i.id));
    else if (vista === 'vistos') xs = ITEMS.filter((i) => vistos[i.id]);
    if (estado.nuevos) xs = xs.filter(esNuevo);
    busqueda = null;
    if (estado.q.trim()) {
      busqueda = buscarEn(xs, estado.q, { permitirTema: vista !== 'categoria' });
      xs = busqueda.items;
    }
    ambito = xs;
    return filtrar(xs);
  }

  // Filtros activos (sin contar el tipo, que tiene sus propios botones). "excepto" deja uno afuera para contar.
  function filtrar(xs, excepto = null) {
    const tags = tagsElegidos();
    const pruebas = [
      ['sector', estado.sector !== 'todos' && estado.vista !== 'sector', (i) => i.sectores.includes(estado.sector)],
      ['idioma', estado.idioma !== 'todos', (i) => i.idioma === estado.idioma],
      ['plat', estado.plat !== 'todas', (i) => plataformaClave(i) === estado.plat],
      ['fuente', estado.fuente !== 'todas' && estado.vista !== 'fuente', (i) => i.fuenteId === estado.fuente],
      ['tags', tags.length > 0, (i) => tags.every((t) => i.hashtags.includes(t))],
    ].filter(([clave, activo]) => activo && clave !== excepto).map(([, , f]) => f);
    return pruebas.length ? xs.filter((i) => pruebas.every((f) => f(i))) : xs;
  }
  const conTipo = (xs, tipo = estado.tipo) => (tipo === 'todo' ? xs : xs.filter((i) => i.tipo === tipo));

  // Cuántos resultados daría cada opción de cada filtro, con el resto de los filtros como están.
  function contarFacetas() {
    const contar = (excepto, claves) => {
      const m = new Map();
      for (const i of conTipo(filtrar(ambito, excepto))) for (const k of [].concat(claves(i))) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    return {
      sector: contar('sector', (i) => i.sectores),
      idioma: contar('idioma', (i) => i.idioma),
      plat: contar('plat', plataformaClave),
      fuente: contar('fuente', (i) => i.fuenteId),
      totalSector: conTipo(filtrar(ambito, 'sector')).length,
      totalIdioma: conTipo(filtrar(ambito, 'idioma')).length,
      totalPlat: conTipo(filtrar(ambito, 'plat')).length,
      totalFuente: conTipo(filtrar(ambito, 'fuente')).length,
    };
  }

  // Los selectores muestran cuántos resultados da cada opción; las que dejarían la página vacía se desactivan.
  function pintarSelects() {
    const f = facetas;
    const op = (valor, texto, n, actual) => `<option value="${esc(valor)}"${n || valor === actual ? '' : ' disabled'}>${texto} (${nf.format(n || 0)})</option>`;
    el.selSector.innerHTML = op('todos', 'Todos los sectores', f.totalSector, estado.sector)
      + SECTORES_VISIBLES.map((x) => op(x.id, `${x.icono} ${esc(x.nombre)}`, f.sector.get(x.id), estado.sector)).join('');
    el.selIdioma.innerHTML = op('todos', 'Todos los idiomas', f.totalIdioma, estado.idioma)
      + op('es', 'Español', f.idioma.get('es'), estado.idioma) + op('en', 'Inglés', f.idioma.get('en'), estado.idioma);
    el.selPlat.innerHTML = op('todas', 'Todas las plataformas', f.totalPlat, estado.plat)
      + NOMBRES_PLAT.filter(([k]) => f.plat.get(k) || k === estado.plat).map(([k, nombre]) => op(k, nombre, f.plat.get(k), estado.plat)).join('');
    const fuentes = [...FUENTES.values()].filter((x) => f.fuente.get(x.id) || x.id === estado.fuente)
      .sort((a, b) => (f.fuente.get(b.id) ?? 0) - (f.fuente.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
    el.selFuente.innerHTML = op('todas', 'Todas las fuentes', f.totalFuente, estado.fuente)
      + fuentes.map((x) => op(x.id, esc(x.nombre), f.fuente.get(x.id), estado.fuente)).join('');
  }

  // Plataformas como pestañas con su cantidad (como las pestañas de un buscador): de un toque ves solo blogs, solo Vimeo…
  function pintarBarraPlat() {
    const f = facetas;
    const plats = NOMBRES_PLAT.filter(([k]) => f.plat.get(k) || k === estado.plat);
    el.barraPlat.hidden = plats.length < 2 && estado.plat === 'todas';
    if (el.barraPlat.hidden) { el.barraPlat.innerHTML = ''; return; }
    const pill = (valor, nombre, n) => `<button type="button" class="plat-pill${valor === estado.plat ? ' activo' : ''}" data-filtro="plat" data-valor="${valor}" aria-pressed="${valor === estado.plat}"${n || valor === estado.plat ? '' : ' disabled'}>${nombre}<span>${nf.format(n || 0)}</span></button>`;
    el.barraPlat.innerHTML = `<span class="barra-hashtags-titulo">${svg('play')} Ver en</span>`
      + pill('todas', 'Todas', f.totalPlat) + plats.map(([k, nombre]) => pill(k, nombre, f.plat.get(k))).join('');
  }

  // Filtros activos como etiquetas con ×: se ve qué está filtrando y se quita de un toque.
  function filtrosActivos() {
    const xs = [];
    if (estado.q) xs.push(['q', '', `“${esc(estado.q)}”`]);
    if (estado.tipo !== 'todo') xs.push(['tipo', 'todo', TIPOS.find(([t]) => t === estado.tipo)?.[1] ?? estado.tipo]);
    if (estado.sector !== 'todos' && estado.vista !== 'sector' && SECTORES.has(estado.sector)) xs.push(['sector', 'todos', esc(SECTORES.get(estado.sector).nombre)]);
    if (estado.idioma !== 'todos') xs.push(['idioma', 'todos', estado.idioma === 'es' ? 'Español' : 'Inglés']);
    if (estado.plat !== 'todas') xs.push(['plat', 'todas', NOMBRES_PLAT.find(([k]) => k === estado.plat)?.[1] ?? estado.plat]);
    if (estado.fuente !== 'todas' && estado.vista !== 'fuente' && FUENTES.has(estado.fuente)) xs.push(['fuente', 'todas', esc(FUENTES.get(estado.fuente).nombre)]);
    if (estado.nuevos) xs.push(['nuevos', '', 'Solo nuevos']);
    return xs;
  }
  const chipQuitar = ([clave, valor, texto]) => `<button type="button" class="filtro-activo" data-filtro="${clave}" data-valor="${valor}" title="Quitar este filtro">${texto} ${svg('cerrar')}</button>`;
  const tagsElegidos = () => (estado.tags ? estado.tags.split(',').filter((t) => HASHTAGS.has(t)) : []);

  // Barra de hashtags: los más frecuentes entre los resultados actuales; cada uno que eliges afina más.
  function pintarBarraHashtags(base) {
    const elegidos = tagsElegidos();
    const omitir = new Set([...elegidos, estado.vista === 'hashtag' ? estado.id : null]);
    const conteo = new Map();
    for (const i of base) for (const h of i.hashtags) if (!omitir.has(h)) conteo.set(h, (conteo.get(h) ?? 0) + 1);
    const sugeridos = [...conteo].filter(([, n]) => n >= 2 && n < base.length).sort((a, b) => b[1] - a[1]).slice(0, 24);
    el.barraHashtags.hidden = !elegidos.length && !sugeridos.length;
    el.barraHashtags.innerHTML = `<span class="barra-hashtags-titulo">${svg('numeral')} Filtrar</span>`
      + (elegidos.length ? `<button type="button" class="hashtag-filtro" data-tag-limpiar>Todos</button>` : '')
      + elegidos.map((h) => `<button type="button" class="hashtag-filtro activo" data-tag="${h}" aria-pressed="true" title="Quitar">#${esc(HASHTAGS.get(h).etiqueta)} ${svg('cerrar')}</button>`).join('')
      + sugeridos.map(([h, n]) => `<button type="button" class="hashtag-filtro" data-tag="${h}" aria-pressed="false">#${esc(HASHTAGS.get(h).etiqueta)}<span>${nf.format(n)}</span></button>`).join('');
  }

  let busqueda = null; // última búsqueda: { modo: exacta | corregida | parcial | tema | vacia, correccion, temas, b }

  function ordenar(xs) {
    const copia = [...xs];
    const porFecha = (a, b) => b._fecha - a._fecha;
    switch (estado.orden) {
      case 'recientes': return estado.vista === 'vistos' ? copia.sort((a, b) => vistos[b.id] - vistos[a.id]) : copia.sort(porFecha);
      case 'antiguos': return copia.sort((a, b) => a._fecha - b._fecha);
      case 'az': return copia.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      case 'vistas': return copia.sort((a, b) => (b.vistas ?? -1) - (a.vistas ?? -1) || porFecha(a, b));
      default: {
        if (estado.vista === 'vistos') return copia.sort((a, b) => vistos[b.id] - vistos[a.id]);
        // En una búsqueda, el buscador ya los dejó ordenados por relevancia.
        if (busqueda?.modo && busqueda.modo !== 'tema') return copia;
        // Todo el catálogo: orden ya calculado. Un tema, sector o filtro: se reparte de nuevo entre las
        // plataformas y fuentes que tiene, para que se turnen también ahí.
        if (copia.length === ITEMS.length) return ordenRecomendado();
        return repartir(copia, (i) => i._rec);
      }
    }
  }

  const TIPOS = [['todo', 'Todo', null], ['video', 'Videos', 'play'], ['articulo', 'Artículos', 'articulo'], ['documento', 'Documentos', 'documento']];

  function pintarSegmentos(base) {
    const n = { todo: base.length };
    for (const i of base) n[i.tipo] = (n[i.tipo] || 0) + 1;
    el.seg.innerHTML = TIPOS.filter(([t]) => t === 'todo' || n[t] || estado.tipo === t)
      .map(([t, nombre, icono]) => `<button type="button" class="segmento" data-tipo="${t}" aria-pressed="${estado.tipo === t}">
        ${icono ? svg(icono) : ''}${nombre}<span class="n">${nf.format(n[t] || 0)}</span></button>`).join('');
  }

  function sincronizarControles() {
    el.selIdioma.value = estado.idioma;
    el.selPlat.value = [...el.selPlat.options].some((o) => o.value === estado.plat) ? estado.plat : 'todas';
    el.selOrden.value = estado.orden;
    el.selFuente.value = FUENTES.has(estado.fuente) ? estado.fuente : 'todas';
    el.selSector.value = SECTORES.has(estado.sector) ? estado.sector : 'todos';
    el.selFuente.closest('.select').hidden = estado.vista === 'fuente';
    el.selSector.closest('.select').hidden = estado.vista === 'sector' || !SECTORES_VISIBLES.length;
    const n = cuantosFiltrosMovil();
    el.burbujaFiltros.hidden = !n;
    el.burbujaFiltros.textContent = n;
    el.grilla.classList.toggle('modo-lista', modoVista === 'lista');
    $$('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === modoVista)));
  }

  function pintarMas() {
    const desde = mostrados;
    const lote = lista.slice(mostrados, mostrados + POR_PAGINA);
    const inicioAfuera = afuera?.clave === claveAfuera() ? afuera.inicio : -1;
    el.grilla.insertAdjacentHTML('beforeend', lote.map((i, k) => (desde + k === inicioAfuera ? separadorAfuera() : '') + tarjeta(i)).join(''));
    mostrados += lote.length;
    // Si la pantalla es alta y aún no hay scroll, se carga otro lote (o se buscan más resultados afuera).
    requestAnimationFrame(() => {
      if (el.centinela.getBoundingClientRect().top > innerHeight + 900) return;
      if (mostrados < lista.length) pintarMas();
      else buscarAfuera();
    });
  }

  // ---------- Más resultados en otras plataformas ----------
  // Cuando se acaban los resultados de una búsqueda, se sigue buscando en vivo en Dailymotion e Internet
  // Archive (sus APIs públicas se pueden consultar desde el navegador). Para que solo entre material de
  // seguridad laboral, el título debe tener lo buscado y además otra palabra de seguridad o de formación
  // ("uso de", "tipos", "curso", "NFPA"…); se descartan noticieros, películas, deportes y música.
  const CONTEXTO_TITULO = /(?<![a-z])(segur|safety|prevenc|prevent|riesgo|risk|peligr|hazard|osha|niosh|msha|nfpa|sst|ssoma|hse|ehs|epp|ppe|capacitaci|training|curso|course|charla|tutorial|como usar|how to|uso de|use of|using|manejo|tipos|types|clases|classes|procedimient|procedure|inspecci|inspection|norma|standard|simulacro|drill|protecci|protection|laboral|ocupacion|occupational|workplace|industrial|primeros auxilios|first aid|rescate|rescue|emergenc)/;
  const PARECE_NOTICIERO = /(?<![a-z])(notici|news|tv|televis|radio|diario|periodis|press|prensa|jornal|canal|multimedia|milenio|telesur|abc|nbc|cbs|cnn|fox|record|band|sbt|globo|wochit|buzz|viral|storyful|newsflare)/;
  // En los blogs de SST basta con que el título o el resumen hablen de seguridad o de trabajo.
  const CONTEXTO_SST = /(?<![a-z])(segur|safety|safe|prevenc|prevent|riesgo|risk|peligr|hazard|trabaj|work|laboral|ocupacion|occupational|osha|niosh|msha|sst|ssoma|hse|ehs|epp|ppe|capacitaci|training|curso|course|charla|norma|nfpa|iso|accident|incident|emergenc|incendi|fire|rescat|rescue|salud|health|industri|obra|construc|miner|mining|mine)/;
  const BLOGS_WP = [...FUENTES.values()].filter((f) => f.wp);
  const BLOGS_SIN_BUSQUEDA = new Set(); // blogs que no respondieron o ignoran la búsqueda
  const EXCLUIR_AFUERA = new RegExp(`(?<![a-z0-9])(${[...(D.excluir || []), 'trailer', 'teaser', 'movie', 'pelicula', 'mlb', 'nba', 'nfl', 'nhl', 'fail', 'fails',
    'funny', 'prank', 'gta', 'lego', 'cancion', 'song', 'music', 'musica', 'concierto', 'concert', 'news', 'noticias', 'noticiero', 'telediario']
    .map((t) => escaparRe(norm(t)).replace(/\\\*/g, '[a-z0-9]*')).join('|')})(?![a-z0-9])`);
  const textoPlano = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&quot;|&#39;/g, ' ').replace(/\s+/g, ' ').trim();
  const PLATAFORMAS_AFUERA = [
    {
      plataforma: 'web',
      nombre: 'blogs de SST',
      tipo: 'articulo',
      // Se pregunta a todos los blogs WordPress de las fuentes a la vez (5 artículos por blog y por página).
      // Algunos blogs ignoran la búsqueda y devuelven sus últimos artículos: si ninguno menciona lo buscado,
      // a ese blog no se le vuelve a preguntar en esta visita.
      async leer(q, pagina, b, estadoBusqueda) {
        const agotados = (estadoBusqueda.blogsAgotados ??= new Set()); // blogs que ya dieron todo lo que tenían
        const menciona = (x) => { const t = norm(`${textoPlano(x.title?.rendered)} ${textoPlano(x.excerpt?.rendered)}`); return b.terminos.some((u) => u.p.test(t) || u.alt.some((p) => p.test(t))); };
        const lotes = await Promise.all(BLOGS_WP.filter((f) => !BLOGS_SIN_BUSQUEDA.has(f.id) && !agotados.has(f.id)).map(async (f) => {
          const p = new URLSearchParams({ search: q, per_page: '5', page: String(pagina), _fields: 'id,date_gmt,link,title,excerpt,jetpack_featured_media_url,yoast_head_json.og_image' });
          try {
            const r = await fetch(`${f.wp}posts?${p}`, { signal: AbortSignal.timeout(9000) });
            const posts = r.ok ? await r.json() : [];
            if (!Array.isArray(posts) || posts.length < 5) agotados.add(f.id);
            if (!Array.isArray(posts)) return { f, mas: false, posts: [] };
            if (posts.length && !posts.some(menciona)) { BLOGS_SIN_BUSQUEDA.add(f.id); return { f, mas: false, posts: [] }; }
            return { f, mas: posts.length === 5, posts };
          } catch { BLOGS_SIN_BUSQUEDA.add(f.id); return { f, mas: false, posts: [] }; }
        }));
        return {
          mas: lotes.some((x) => x.mas),
          videos: lotes.flatMap(({ f, posts }) => posts.map((x) => ({
            tipo: 'articulo', url: x.link, titulo: textoPlano(x.title?.rendered), resumen: x.excerpt?.rendered,
            miniatura: x.jetpack_featured_media_url || x.yoast_head_json?.og_image?.[0]?.url || undefined,
            fecha: x.date_gmt ? `${x.date_gmt}Z` : null, fuente: f.nombre, fuenteId: f.id, idioma: f.idioma, pais: f.pais || undefined,
          }))),
        };
      },
    },
    {
      plataforma: 'dailymotion',
      nombre: 'Dailymotion',
      tipo: 'video',
      async leer(q, pagina) {
        const p = new URLSearchParams({ search: q, limit: '50', page: String(pagina), sort: 'relevance', languages: 'es,en',
          fields: 'id,title,description,thumbnail_480_url,url,created_time,views_total,duration,owner.screenname,language' });
        const r = await fetch(`https://api.dailymotion.com/videos?${p}`).then((x) => x.json());
        return {
          mas: Boolean(r.has_more),
          videos: (r.list || []).map((v) => ({
            id: `dm-${v.id}`, titulo: v.title, resumen: v.description, miniatura: v.thumbnail_480_url,
            url: v.url || `https://www.dailymotion.com/video/${v.id}`, fecha: v.created_time ? new Date(v.created_time * 1000).toISOString() : null,
            vistas: v.views_total || undefined, duracion: v.duration || undefined, fuente: v['owner.screenname'] || 'Dailymotion',
            idioma: v.language === 'en' ? 'en' : 'es',
            embed: D.reproductorDailymotion ? `https://geo.dailymotion.com/player/${D.reproductorDailymotion}.html?video=${v.id}` : undefined,
          })),
        };
      },
    },
    {
      plataforma: 'archive',
      nombre: 'Internet Archive',
      tipo: 'video',
      async leer(q, pagina) {
        const p = new URLSearchParams({ q: `(${q.replace(/[():"\\]/g, ' ')}) AND mediatype:movies AND -collection:tvarchive AND -collection:tvnews`, rows: '50', page: String(pagina), output: 'json' });
        for (const f of ['identifier', 'title', 'description', 'date', 'publicdate', 'downloads', 'language']) p.append('fl[]', f);
        const r = await fetch(`https://archive.org/advancedsearch.php?${p}`).then((x) => x.json());
        const uno = (v) => (Array.isArray(v) ? v.join(' ') : v || '');
        return {
          mas: pagina * 50 < (r.response?.numFound || 0),
          videos: (r.response?.docs || []).map((d) => ({
            id: `ia-${d.identifier}`, titulo: uno(d.title), resumen: uno(d.description), miniatura: `https://archive.org/services/img/${d.identifier}`,
            url: `https://archive.org/details/${d.identifier}`, fecha: d.date || d.publicdate || null, vistas: d.downloads || undefined,
            fuente: 'Internet Archive', idioma: /spa|esp/i.test(uno(d.language)) ? 'es' : 'en', embed: `https://archive.org/embed/${d.identifier}`,
          })),
        };
      },
    },
  ];
  // Temas de un recurso de afuera: los que tienen más palabras clave en su título y descripción.
  let clavesDeTemas = null;
  function temasDeTexto(texto) {
    clavesDeTemas ??= CATS_VISIBLES.map((c) => ({ id: c.id, ps: (c.claves || []).map(norm).filter((k) => k.length >= 3).map(patronTermino) }));
    return clavesDeTemas.map((c) => ({ id: c.id, n: c.ps.filter((p) => p.test(texto)).length }))
      .filter((c) => c.n).sort((a, b) => b.n - a.n).slice(0, 2).map((c) => c.id);
  }
  function prepararAfuera(v, plataforma) {
    const titulo = textoPlano(v.titulo).slice(0, 200);
    const resumen = textoPlano(v.resumen).slice(0, 300);
    const i = {
      tipo: 'video', fuenteId: `afuera-${plataforma}`, ...v, titulo, resumen, sectores: [], hashtags: [], afuera: true,
      _dom: dominio(v.url), _fecha: Date.parse(v.fecha) || 0, _tit: norm(titulo), _tags: '', _txt: norm(`${resumen} · ${v.fuente}`),
    };
    const temas = temasDeTexto(`${i._tit} ${i._txt}`);
    i.categorias = temas.length ? temas : CATS.has('seguridad-general') ? ['seguridad-general'] : [];
    if (!i.id) i.id = `w-${i.url}`;
    i.fecha = new Date(i._fecha || ahora()).toISOString();
    i._rec = puntaje(i);
    return i;
  }
  const URLS_BIBLIOTECA = new Set(ITEMS.map((i) => i.url));
  function sirveAfuera(i, b) {
    if (!i.titulo || POR_ID.has(i.id) || URLS_BIBLIOTECA.has(i.url) || EXCLUIR_AFUERA.test(i._tit)) return false;
    if (estado.idioma !== 'todos' && i.idioma !== estado.idioma) return false;
    if (i.tipo === 'articulo') return Boolean(puntuar(i, b)?.completo) && CONTEXTO_SST.test(`${i._tit} ${i._txt}`); // lo buscado, en el título o el resumen
    const r = puntuar(i, b);
    if (!r?.completo) return false;
    const enTitulo = b.terminos.some((t) => t.p.test(i._tit) || t.alt.some((p) => p.test(i._tit))) || b.altFrase.some((p) => p.test(i._tit));
    if (!enTitulo || PARECE_NOTICIERO.test(norm(i.fuente))) return false;
    // La palabra de contexto no puede ser la misma que se buscó ("seguridad" no basta para "seguridad").
    const resto = b.resaltar.reduce((t, patron) => t.replace(patron, ' '), i._tit);
    return CONTEXTO_TITULO.test(resto);
  }

  let afuera = null; // { clave, pagina, agotadas, cargando, vacias, inicio, items }
  const claveAfuera = () => `${estado.q}|${estado.idioma}|${estado.plat}|${estado.tipo}`;
  const plataformasAfuera = () => PLATAFORMAS_AFUERA.filter((f) => (estado.plat === 'todas' || estado.plat === f.plataforma)
    && (estado.tipo === 'todo' || estado.tipo === f.tipo) && (f.plataforma !== 'web' || BLOGS_WP.length));
  const puedeBuscarAfuera = () => estado.vista === 'inicio' && Boolean(estado.q.trim()) && Boolean(busqueda?.b)
    && ['todo', 'video', 'articulo'].includes(estado.tipo) && plataformasAfuera().length > 0
    && estado.fuente === 'todas' && estado.sector === 'todos' && !estado.tags && !estado.nuevos;
  const nombresAfuera = () => plataformasAfuera().map((f) => f.nombre).join(', ').replace(/, ([^,]*)$/, ' y $1');
  const separadorAfuera = () => `<div class="separador-afuera"><span>${svg('globo')} Más resultados en ${nombresAfuera()}</span>
    <small>Encontrados ahora mismo en sus buscadores; no forman parte de la biblioteca de SST Hub.</small></div>`;

  function avisoAfuera(tipo) {
    let caja = $('#afueraEstado');
    if (!caja) {
      caja = document.createElement('p');
      caja.id = 'afueraEstado';
      caja.className = 'afuera-estado';
      caja.setAttribute('aria-live', 'polite');
      el.centinela.before(caja);
    }
    const nombres = nombresAfuera();
    caja.hidden = !tipo;
    caja.innerHTML = { cargando: `<span class="girando" aria-hidden="true"></span> Buscando más resultados en ${nombres}…`,
      fin: 'No hay más resultados.', nada: `Tampoco encontramos más resultados de seguridad laboral en ${nombres}.` }[tipo] || '';
  }

  // Al volver a pintar la misma búsqueda (por ejemplo al regresar con "atrás"), se reponen los ya encontrados.
  function reponerAfuera() {
    if (!puedeBuscarAfuera() || afuera?.clave !== claveAfuera() || !afuera.items.length) return;
    afuera.inicio = lista.length;
    lista.push(...afuera.items);
  }

  async function buscarAfuera() {
    if (!puedeBuscarAfuera() || mostrados < lista.length) return;
    const clave = claveAfuera();
    if (afuera?.clave !== clave) afuera = { clave, pagina: 0, agotadas: new Set(), cargando: false, vacias: 0, inicio: -1, items: [] };
    const a = afuera;
    if (a.cargando) return;
    const fuentes = plataformasAfuera().filter((f) => !a.agotadas.has(f.plataforma));
    if (!fuentes.length || a.vacias >= 4) { avisoAfuera(a.items.length ? 'fin' : 'nada'); return; }
    a.cargando = true;
    a.pagina++;
    avisoAfuera('cargando');
    const b = busqueda.b;
    const q = busqueda.correccion || estado.q.replace(/^#/, '');
    const lotes = await Promise.all(fuentes.map((f) => f.leer(q, a.pagina, b, a).catch(() => ({ mas: false, videos: [] }))));
    a.cargando = false;
    if (afuera !== a || claveAfuera() !== clave || !puedeBuscarAfuera()) return; // la búsqueda cambió mientras tanto
    const grupos = lotes.map((l, k) => {
      if (!l.mas) a.agotadas.add(fuentes[k].plataforma);
      return l.videos.map((v) => prepararAfuera(v, fuentes[k].plataforma)).filter((i) => sirveAfuera(i, b));
    });
    const puntos = new Map(grupos.flat().map((i) => [i, puntuar(i, b)?.puntos ?? i._rec * 0.12]));
    const mejor = (g) => g.sort((x, y) => puntos.get(y) - puntos.get(x));
    const nuevos = porTurnos(grupos.map((g) => porTurnos(agruparPor(g, (i) => i.fuenteId).map(mejor), (i) => puntos.get(i))), (i) => puntos.get(i))
      .filter((i, k, xs) => xs.findIndex((x) => x.id === i.id) === k);
    a.vacias = nuevos.length ? 0 : a.vacias + 1;
    avisoAfuera('');
    if (nuevos.length) {
      for (const i of nuevos) POR_ID.set(i.id, i); // para poder verlos dentro del portal en esta visita
      if (a.inicio < 0) a.inicio = lista.length;
      a.items.push(...nuevos);
      lista.push(...nuevos);
      el.vacio.hidden = true;
      pintarResultado();
      pintarMas();
    } else {
      requestAnimationFrame(() => { if (el.centinela.getBoundingClientRect().top < innerHeight + 900) buscarAfuera(); });
    }
  }

  function pintarResultado() {
    if (!lista.length && !filtrosActivos().length) { el.resultado.innerHTML = ''; return; }
    const nombres = { categoria: CATS, sector: SECTORES };
    const donde = nombres[estado.vista] ? ` en ${esc(nombres[estado.vista].get(estado.id).nombre)}` : '';
    const tags = tagsElegidos().map((h) => `#${esc(HASHTAGS.get(h).etiqueta)}`).join(' + ');
    const deAfuera = afuera?.clave === claveAfuera() && afuera.inicio >= 0 ? lista.length - afuera.inicio : 0;
    const activos = filtrosActivos();
    el.resultado.innerHTML = `<span class="resultado-n"><b>${plural(lista.length - deAfuera, 'recurso', 'recursos')}</b>${deAfuera ? ` + ${nf.format(deAfuera)} de otras plataformas` : ''}${donde}${tags ? ` · ${tags}` : ''}</span>`
      + (activos.length ? `<span class="filtros-activos">${activos.map(chipQuitar).join('')}</span>` : '')
      + (activos.length > 1 || (activos.length && tags) ? `<button type="button" class="limpiar" data-accion="limpiar">Quitar todos</button>` : '');
  }

  function pintarVacio() {
    let icono = '🔍';
    let titulo = 'No encontramos resultados';
    let texto = 'Prueba con otra palabra o quita algunos filtros.';
    let acciones = `<button type="button" class="boton" data-accion="limpiar">Quitar filtros</button>`;
    if (estado.vista === 'guardados' && !hayFiltros()) {
      icono = '🤍'; titulo = 'Aún no guardas nada';
      texto = 'Toca el corazón de cualquier recurso para tenerlo a mano aquí.';
      acciones = `<a class="boton" href="#/">Explorar recursos</a>`;
    } else if (estado.vista === 'vistos' && !hayFiltros()) {
      icono = '🕘'; titulo = 'Todavía no abres ningún recurso';
      texto = 'Cuando abras un video o un artículo desde aquí, aparecerá en esta lista.';
      acciones = `<a class="boton" href="#/">Explorar recursos</a>`;
    } else if (filtrosActivos().some(([k]) => k !== 'q') || tagsElegidos().length) {
      // Con filtros: cuántos resultados habría quitando cada uno
      const opciones = filtrosActivos().filter(([k]) => k !== 'q').map((f) => {
        const [clave] = f;
        const n = clave === 'tipo' ? filtrar(ambito).length : clave === 'nuevos' ? null : conTipo(filtrar(ambito, clave)).length;
        return { f, n };
      }).filter((x) => x.n);
      if (tagsElegidos().length) {
        const n = conTipo(filtrar(ambito, 'tags')).length;
        if (n) opciones.push({ f: ['tags', '', 'los hashtags'], n });
      }
      opciones.sort((a, b) => b.n - a.n);
      titulo = 'Ningún recurso cumple todos los filtros a la vez';
      texto = opciones.length ? 'Quita uno y verás resultados:' : 'Prueba quitando los filtros.';
      acciones = opciones.map(({ f: [clave, valor, nombre], n }) => `<button type="button" class="boton boton-sec" data-filtro="${clave}" data-valor="${valor}">Quitar «${nombre}» → ${plural(n, 'resultado', 'resultados')}</button>`).join(' ')
        + ` <button type="button" class="boton" data-accion="limpiar">Quitar todos los filtros</button>`;
    } else if (estado.q) {
      titulo = `Sin resultados para “${esc(estado.q)}”`;
      texto = 'Revisa la ortografía o usa una palabra más general, como “altura”, “EPP” o “incendio”.';
      if (estado.vista !== 'inicio') acciones += ` <a class="boton boton-sec" href="#/?q=${encodeURIComponent(estado.q)}">Buscar en todo el portal</a>`;
    }
    const sugerencias = [...CATS_VISIBLES].sort((a, b) => b.total - a.total).slice(0, 6);
    el.vacio.innerHTML = `<div class="vacio-icono" aria-hidden="true">${icono}</div><h2>${titulo}</h2><p>${texto}</p>${acciones}
      <div class="relacionadas relacionadas-centro">${sugerencias.map((c) => chipCat(c)).join('')}</div>`;
    el.vacio.hidden = false;
  }

  // =====================================================================
  // Render principal
  // =====================================================================
  function render() {
    detenerPrevia();
    cerrarSugerencias();
    marcarActivos();
    if (document.activeElement !== el.q) el.q.value = estado.q;
    el.vacio.hidden = true;
    el.grilla.innerHTML = '';
    lista = [];
    mostrados = 0;

    const conGrilla = VISTAS_CON_GRILLA.has(estado.vista);
    el.herramientas.hidden = el.resultado.hidden = el.grilla.hidden = el.barraHashtags.hidden = el.barraPlat.hidden = !conGrilla;

    if (!conGrilla) {
      const pintores = { explorar: pintarExplorar, listas: pintarListas, lista: pintarDetalleLista, ver: () => pintarReproductor(false) };
      pintores[estado.vista]();
      ubicarFlotante();
      const titulos = { explorar: 'Explorar', listas: 'Listas', lista: obtenerLista(estado.id)?.nombre };
      if (titulos[estado.vista]) document.title = `${titulos[estado.vista]} · SST Hub`;
      return;
    }

    const base = alcance();
    facetas = contarFacetas();
    pintarSelects();
    pintarBarraPlat();
    pintarCabecera();
    pintarSeccionesInicio();
    el.herramientas.hidden = !base.length && !hayFiltros();
    pintarSegmentos(base);
    pintarBarraHashtags(base);
    sincronizarControles();
    lista = ordenar(estado.tipo === 'todo' ? base : base.filter((i) => i.tipo === estado.tipo));
    avisoAfuera('');
    reponerAfuera();
    pintarMas();
    pintarResultado();
    if (!lista.length) pintarVacio();
    ubicarFlotante();

    const titulos = {
      categoria: () => CATS.get(estado.id).nombre, sector: () => SECTORES.get(estado.id).nombre,
      hashtag: () => `#${HASHTAGS.get(estado.id).etiqueta}`, fuente: () => FUENTES.get(estado.id).nombre,
      guardados: () => 'Guardados', vistos: () => 'Vistos', inicio: () => (estado.q ? `“${estado.q}”` : ''),
    };
    const t = titulos[estado.vista]?.();
    document.title = t ? `${t} · SST Hub` : 'SST Hub · Seguridad laboral en un solo lugar';
  }

  // =====================================================================
  // Vista previa al pasar el mouse (fotogramas que YouTube publica de cada video)
  // =====================================================================
  const FOTOGRAMAS = ['hq1', 'hq2', 'hq3'];
  const PASO_MS = 800;
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const sinFotogramas = new Set();
  let previa = null;

  function iniciarPrevia(mini) {
    const yt = mini.dataset.yt;
    const img = mini.querySelector('.mini-img');
    if (!img || sinMovimiento.matches || sinFotogramas.has(yt) || previa?.mini === mini) return;
    detenerPrevia();
    const p = (previa = { mini, img, original: img.getAttribute('src'), listos: [], fallidos: 0, paso: 0 });
    FOTOGRAMAS.forEach((f, k) => {
      const url = `https://i.ytimg.com/vi/${yt}/${f}.jpg`;
      const im = new Image();
      im.onload = () => { p.listos[k] = url; };
      im.onerror = () => { if (++p.fallidos === FOTOGRAMAS.length) sinFotogramas.add(yt); };
      im.src = url;
    });
    const avanzar = () => {
      const listos = p.listos.filter(Boolean);
      if (!listos.length || previa !== p) return;
      mini.classList.add('previa');
      img.src = listos[p.paso++ % listos.length];
    };
    p.demora = setTimeout(() => { mini.style.setProperty('--previa', `${PASO_MS * FOTOGRAMAS.length}ms`); avanzar(); p.reloj = setInterval(avanzar, PASO_MS); }, 350);
  }

  function detenerPrevia() {
    if (!previa) return;
    const { mini, img, original, demora, reloj } = previa;
    clearTimeout(demora);
    clearInterval(reloj);
    mini.classList.remove('previa');
    if (img.isConnected && img.getAttribute('src') !== original) img.src = original;
    previa = null;
  }

  el.grilla.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const mini = e.target.closest('.mini[data-yt]');
    if (mini) iniciarPrevia(mini);
  });
  el.grilla.addEventListener('pointerout', (e) => {
    const mini = e.target.closest('.mini[data-yt]');
    if (mini && !mini.contains(e.relatedTarget)) detenerPrevia();
  });

  // =====================================================================
  // Hoja (panel que sube desde abajo en el celular; ventana centrada en el escritorio)
  // =====================================================================
  let alCerrarHoja = null;
  let focoPrevio = null;

  function abrirHoja(titulo, html, { alCerrar } = {}) {
    focoPrevio = document.activeElement;
    el.hojaTitulo.textContent = titulo;
    el.hojaCuerpo.innerHTML = html;
    el.hoja.hidden = el.hojaVelo.hidden = false;
    alCerrarHoja = alCerrar || null;
    requestAnimationFrame(() => {
      el.hoja.classList.add('abierta');
      el.hojaVelo.classList.add('abierto');
      (el.hojaCuerpo.querySelector('[autofocus]') || el.hoja.querySelector('[data-cerrar-hoja]')).focus({ preventScroll: true });
    });
    document.body.classList.add('con-hoja');
  }

  function cerrarHoja() {
    if (el.hoja.hidden) return;
    el.hoja.classList.remove('abierta');
    el.hojaVelo.classList.remove('abierto');
    document.body.classList.remove('con-hoja');
    setTimeout(() => { el.hoja.hidden = el.hojaVelo.hidden = true; el.hojaCuerpo.innerHTML = ''; }, 200);
    alCerrarHoja?.();
    alCerrarHoja = null;
    focoPrevio?.focus?.({ preventScroll: true });
  }

  // Arrastrar la hoja hacia abajo para cerrarla (celular).
  (() => {
    let inicioY = null;
    el.hoja.addEventListener('touchstart', (e) => {
      if (el.hojaCuerpo.scrollTop > 0 && !e.target.closest('.hoja-asa, .hoja-cab')) return;
      inicioY = e.touches[0].clientY;
    }, { passive: true });
    el.hoja.addEventListener('touchmove', (e) => {
      if (inicioY == null) return;
      const dy = Math.max(0, e.touches[0].clientY - inicioY);
      el.hoja.style.transform = dy ? `translateY(${dy}px)` : '';
    }, { passive: true });
    el.hoja.addEventListener('touchend', (e) => {
      if (inicioY == null) return;
      const dy = e.changedTouches[0].clientY - inicioY;
      el.hoja.style.transform = '';
      inicioY = null;
      if (dy > 90) cerrarHoja();
    });
  })();

  function cabeceraItem(i) {
    return `<div class="hoja-item"><span class="hoja-item-mini" style="--cat:${(CATS.get(i.categorias[0]) || CAT_RESPALDO).color}">${imagenDe(i)}</span>
      <div><b>${esc(i.titulo)}</b><small>${esc(i.fuente)} · ${haceCuanto(i.fecha)}</small></div></div>`;
  }

  function menuItem(id) {
    const i = POR_ID.get(id);
    if (!i) return;
    const guardado = guardados.has(id);
    const op = (accion, icono, texto, extra = '') => `<button type="button" class="menu-op" data-op="${accion}" data-id="${id}"${extra}>${svg(icono)}<span>${texto}</span></button>`;
    abrirHoja('Opciones', `${cabeceraItem(i)}
      <div class="menu">
        ${reproducible(i) && !esArchivoLocal ? `<a class="menu-op" href="#/v/${id}">${svg('play', 'relleno')}<span>Ver aquí</span></a>` : ''}
        <a class="menu-op" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" data-salida="${id}">${svg('externo')}<span>Abrir en ${esc(destinoDe(i))}</span></a>
        ${op('agregar-lista', 'lista', 'Agregar a una lista')}
        ${op('guardar', 'corazon', guardado ? 'Quitar de guardados' : 'Guardar')}
        ${op('compartir', 'compartir', 'Compartir')}
        ${op('copiar', 'copiar', 'Copiar enlace')}
        <a class="menu-op" href="#/f/${esc(i.fuenteId)}">${svg('fuente')}<span>Ver todo de ${esc(i.fuente)}</span></a>
        ${op('ocultar', 'ocultar', 'No me interesa', ' data-peligro')}
      </div>`);
  }

  function hojaAgregarALista(id) {
    const i = POR_ID.get(id);
    if (!i) return;
    const pintar = () => `${cabeceraItem(i)}
      <form class="nueva-lista" data-form="nueva-lista" data-id="${id}">
        <input name="nombre" maxlength="60" placeholder="Nombre de una lista nueva" aria-label="Nombre de la nueva lista" required ${misListas.length ? '' : 'autofocus'}>
        <button class="boton" type="submit">${svg('mas')} Crear</button>
      </form>
      ${misListas.length ? `<ul class="opciones-lista">${misListas.map((l) => `
        <li><label><input type="checkbox" data-lista-alternar="${l.id}" data-id="${id}" ${l.items.includes(id) ? 'checked' : ''}>
          <span class="opcion-check">${svg('check')}</span>
          <span class="opcion-txt"><b>${esc(l.nombre)}</b><small>${plural(l.items.length, 'recurso', 'recursos')}</small></span></label></li>`).join('')}</ul>`
        : '<p class="hoja-nota">Aún no tienes listas: escribe un nombre y toca «Crear».</p>'}`;
    abrirHoja('Agregar a una lista', pintar());
    el.hojaCuerpo.dataset.repintar = 'agregar-lista';
    el.hojaCuerpo.dataset.id = id;
    el.hojaCuerpo._repintar = () => { el.hojaCuerpo.innerHTML = pintar(); };
  }

  function hojaFiltros() {
    const fila = (titulo, clave, opciones) => `<div class="filtro"><p class="filtro-titulo">${titulo}</p><div class="filtro-ops">${opciones.map(([valor, texto]) =>
      `<button type="button" class="chip-opcion" data-filtro="${clave}" data-valor="${esc(valor)}" aria-pressed="${String(estado[clave] === valor || (clave === 'vista' && modoVista === valor))}"${conteoOpcion(clave, valor) === 0 && estado[clave] !== valor ? ' disabled' : ''}>${texto}${conteoOpcion(clave, valor) == null ? '' : ` <small>${nf.format(conteoOpcion(clave, valor))}</small>`}</button>`).join('')}</div></div>`;
    const conteoOpcion = (clave, valor) => {
      if (!facetas || !['sector', 'idioma', 'plat'].includes(clave)) return null;
      if (valor === 'todos' || valor === 'todas') return facetas[{ sector: 'totalSector', idioma: 'totalIdioma', plat: 'totalPlat' }[clave]];
      return facetas[clave].get(valor) ?? 0;
    };
    const pintar = () => [
      estado.vista !== 'sector' && SECTORES_VISIBLES.length ? fila('Sector', 'sector', [['todos', 'Todos'], ...SECTORES_VISIBLES.map((s) => [s.id, `${s.icono} ${esc(s.nombre)}`])]) : '',
      fila('Ordenar por', 'orden', [['recomendados', 'Recomendados'], ['recientes', 'Más recientes'], ['vistas', 'Más vistos'], ['antiguos', 'Más antiguos'], ['az', 'A–Z']]),
      `<div class="filtro"><p class="filtro-titulo">Recomendaciones para</p><div class="filtro-ops"><button type="button" class="chip-opcion" data-accion="elegir-pais" aria-pressed="true">${esc(nombrePais(miPais))} · cambiar</button></div></div>`,
      opcionesPlataforma().length > 1 ? fila('Plataforma', 'plat', [['todas', 'Todas'], ...opcionesPlataforma().map(([k, nombre]) => [k, nombre])]) : '',
      new Set(ITEMS.map((i) => i.idioma)).size > 1 ? fila('Idioma', 'idioma', [['todos', 'Todos'], ['es', 'Español'], ['en', 'Inglés']]) : '',
      refVisita ? fila('Novedades', 'nuevos', [['', 'Todo'], ['1', `Solo nuevos (${cuantosNuevos()})`]]) : '',
      fila('Ver como', 'vista', [['grilla', 'Cuadrícula'], ['lista', 'Lista']]),
      estado.vista !== 'fuente' ? `<div class="filtro"><p class="filtro-titulo">Fuente</p><label class="select select-ancho"><select data-filtro-select="fuente">${el.selFuente.innerHTML}</select>${svg('abajo')}</label></div>` : '',
      `<div class="hoja-pie"><button type="button" class="boton boton-sec" data-accion="limpiar">Quitar filtros</button><button type="button" class="boton" data-cerrar-hoja>Ver ${plural(lista.length, 'resultado', 'resultados')}</button></div>`,
    ].join('');
    abrirHoja('Filtros', pintar());
    $('[data-filtro-select="fuente"]', el.hojaCuerpo).value = estado.fuente;
    el.hojaCuerpo._repintar = () => {
      el.hojaCuerpo.innerHTML = pintar();
      const sel = $('[data-filtro-select="fuente"]', el.hojaCuerpo);
      if (sel) sel.value = estado.fuente;
    };
  }

  // ---------- Compartir ----------
  const urlBase = () => location.href.split('#')[0];

  async function compartir({ titulo, texto, url }) {
    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: texto, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    await copiar(url || texto, 'Enlace copiado. Pégalo donde quieras.');
  }

  async function copiar(texto, mensaje = 'Copiado.') {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement('textarea');
      t.value = texto;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    aviso(mensaje);
  }

  function textoDeLista(l) {
    const items = itemsDeLista(l);
    return `▶ ${l.nombre} (${plural(items.length, 'recurso', 'recursos')})\n\n` +
      items.map((i, k) => `${k + 1}. ${i.titulo}\n   ${i.url}`).join('\n') + '\n\nArmado con SST Hub';
  }

  function enlaceDeLista(l) {
    if (esArchivoLocal) return null;
    if (l.tipo === 'destacada') return `${urlBase()}#/lista/${l.ref}`;
    const ids = l.ids.filter((id) => POR_ID.has(id)).slice(0, 60);
    return `${urlBase()}${hashDe({ vista: 'lista', id: 'c', compartida: { nombre: l.nombre, ids } })}`;
  }

  function hojaCompartirLista(l) {
    const enlace = enlaceDeLista(l);
    const mensaje = enlace ? `${l.nombre}: ${enlace}` : textoDeLista(l);
    abrirHoja('Compartir lista', `
      <p class="hoja-nota">${enlace ? 'Quien abra el enlace verá la lista y podrá guardarla en sus listas.' : 'El portal está abierto desde tu computadora, así que se comparte la lista como texto con los enlaces. Cuando lo publiques en internet podrás compartir un enlace directo.'}</p>
      <div class="menu">
        <a class="menu-op" href="https://wa.me/?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener noreferrer">${svg('whatsapp')}<span>Enviar por WhatsApp</span></a>
        ${enlace ? `<button type="button" class="menu-op" data-op="copiar-texto" data-texto="${esc(enlace)}">${svg('copiar')}<span>Copiar enlace</span></button>` : ''}
        <button type="button" class="menu-op" data-op="copiar-texto" data-texto="${esc(textoDeLista(l))}">${svg('articulo')}<span>Copiar como texto (títulos y enlaces)</span></button>
        ${navigator.share ? `<button type="button" class="menu-op" data-op="compartir-nativo">${svg('compartir')}<span>Más opciones…</span></button>` : ''}
      </div>`);
    el.hojaCuerpo._compartir = { titulo: l.nombre, texto: enlace ? l.nombre : textoDeLista(l), url: enlace || undefined };
  }

  // País para las recomendaciones: lo de ese país aparece primero.
  function hojaPais() {
    const conFuentes = new Set(paisesDisponibles());
    const lista = Object.keys(PAISES).filter((p) => HISPANOS.has(p) || conFuentes.has(p)).filter((p) => p !== 'LATAM' && p !== 'EU' && p !== 'INT');
    lista.sort((a, b) => (conFuentes.has(b) - conFuentes.has(a)) || nombrePais(a).localeCompare(nombrePais(b), 'es'));
    abrirHoja('¿Desde qué país ves SST Hub?', `<p class="hoja-nota">Mostramos primero lo que más se ve en tu país y después lo demás. Lo detectamos solo; aquí puedes cambiarlo.</p>
      <div class="filtro-ops">${lista.map((p) => `<button type="button" class="chip-opcion" data-pais="${p}" aria-pressed="${p === miPais}">${esc(nombrePais(p))}${conFuentes.has(p) ? '' : ''}</button>`).join('')}</div>`);
  }

  function cambiarPais(p) {
    miPais = p;
    almacen.guardar('pais', p);
    calcularPuntajes();
    cacheRelacionados.clear();
    cerrarHoja();
    pintarExtrasLateral();
    render();
    aviso(`Recomendaciones para ${nombrePais(p)}.`);
  }

  function hojaNombreLista({ titulo, valor = '', boton, alGuardar }) {
    abrirHoja(titulo, `<form class="nueva-lista nueva-lista-sola" data-form="nombre-lista">
      <input name="nombre" maxlength="60" value="${esc(valor)}" placeholder="Ej.: Charla del lunes, Inducción nuevos" aria-label="Nombre de la lista" required autofocus>
      <button class="boton" type="submit">${boton}</button></form>`);
    el.hojaCuerpo._alGuardar = alGuardar;
  }

  // =====================================================================
  // Acciones
  // =====================================================================
  let relojAviso;
  function aviso(texto, { accion, alHacer } = {}) {
    let caja = $('.aviso');
    if (!caja) {
      caja = document.createElement('div');
      caja.className = 'aviso';
      caja.setAttribute('role', 'status');
      document.body.append(caja);
    }
    caja.innerHTML = `<span>${esc(texto)}</span>${accion ? `<button type="button">${esc(accion)}</button>` : ''}`;
    if (accion) caja.querySelector('button').onclick = () => { alHacer(); caja.classList.remove('visible'); };
    requestAnimationFrame(() => caja.classList.add('visible'));
    clearTimeout(relojAviso);
    relojAviso = setTimeout(() => caja.classList.remove('visible'), accion ? 5000 : 2600);
  }

  function registrarVisto(id) {
    vistos[id] = ahora();
    const ids = Object.keys(vistos);
    if (ids.length > 400) ids.sort((a, b) => vistos[a] - vistos[b]).slice(0, ids.length - 400).forEach((k) => delete vistos[k]);
    almacen.guardar('vistos', vistos);
    $$(`.tarjeta[data-id="${CSS.escape(id)}"], .fila[data-id="${CSS.escape(id)}"]`).forEach((t) => t.classList.add('visto'));
    actualizarContadores();
  }

  function alternarGuardado(id, boton) {
    const activo = !guardados.has(id);
    if (activo) guardados.add(id); else guardados.delete(id);
    almacen.guardar('guardados', [...guardados]);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', String(activo));
      b.setAttribute('aria-label', activo ? 'Quitar de guardados' : 'Guardar');
    });
    if (boton) { boton.classList.remove('latido'); void boton.offsetWidth; boton.classList.add('latido'); }
    actualizarContadores();
    aviso(activo ? 'Guardado. Lo encuentras en ♥ Guardados.' : 'Quitado de tus guardados.');
  }

  function ocultarItem(id) {
    ocultos.add(id);
    almacen.guardar('ocultos', [...ocultos]);
    $$(`.tarjeta[data-id="${CSS.escape(id)}"]`).forEach((t) => t.remove());
    pintarExtrasLateral();
    aviso('Listo, no lo verás más.', {
      accion: 'Deshacer',
      alHacer: () => { ocultos.delete(id); almacen.guardar('ocultos', [...ocultos]); pintarExtrasLateral(); render(); },
    });
  }

  const ACCIONES = {
    limpiar() {
      el.q.value = '';
      actualizarFiltros({ ...FILTROS_BASE, orden: estado.orden });
      el.hojaCuerpo._repintar?.();
    },
    'borrar-vistos'() {
      if (!confirm('¿Borrar la lista de recursos vistos de este navegador?')) return;
      vistos = {};
      almacen.guardar('vistos', vistos);
      actualizarContadores();
      render();
    },
    'restaurar-ocultos'() {
      const n = ocultos.size;
      ocultos = new Set();
      almacen.guardar('ocultos', []);
      pintarExtrasLateral();
      render();
      aviso(`${plural(n, 'recurso vuelve', 'recursos vuelven')} a mostrarse.`);
    },
    'crear-lista'() {
      hojaNombreLista({
        titulo: 'Nueva lista', boton: 'Crear',
        alGuardar: (nombre) => { const l = Listas.crear(nombre); location.hash = `#/lista/m-${l.id}`; aviso('Lista creada. Agrega recursos con ⋮ › Agregar a una lista.'); },
      });
    },
    'renombrar-lista'() {
      const l = obtenerLista(estado.id);
      hojaNombreLista({ titulo: 'Renombrar lista', valor: l.nombre, boton: 'Guardar', alGuardar: (nombre) => { Listas.renombrar(l.id, nombre); render(); } });
    },
    'eliminar-lista'() {
      const l = obtenerLista(estado.id);
      const borrada = Listas.eliminar(l.id);
      location.hash = '#/listas';
      aviso(`Se eliminó «${l.nombre}».`, {
        accion: 'Deshacer',
        alHacer: () => { misListas.splice(borrada.posicion, 0, borrada.lista); Listas.guardar(); render(); },
      });
    },
    'copiar-lista'() {
      const l = obtenerLista(estado.id);
      const nueva = Listas.crear(l.nombre, itemsDeLista(l).map((i) => i.id));
      location.hash = `#/lista/m-${nueva.id}`;
      aviso('Guardada en tus listas. Ahora puedes editarla.');
    },
    'compartir-lista'() { hojaCompartirLista(obtenerLista(estado.id)); },
    instalar() { instalarApp(); },
    'elegir-pais'() { hojaPais(); },
    'alternar-videos'() {
      preferenciaVideos = preferenciaVideos === 'aqui' ? 'youtube' : 'aqui';
      almacen.guardar('videos', preferenciaVideos);
      pintarExtrasLateral();
      render();
      aviso(preferenciaVideos === 'aqui' ? 'Los videos se verán dentro de SST Hub.' : 'Los videos se abrirán en YouTube.');
    },
  };

  const OPERACIONES = {
    'agregar-lista': (id) => hojaAgregarALista(id),
    guardar: (id) => { cerrarHoja(); alternarGuardado(id); },
    compartir: (id) => { const i = POR_ID.get(id); cerrarHoja(); compartir({ titulo: i.titulo, texto: i.titulo, url: i.url }); },
    copiar: (id) => { cerrarHoja(); copiar(POR_ID.get(id).url, 'Enlace copiado.'); },
    ocultar: (id) => { cerrarHoja(); ocultarItem(id); },
    'copiar-texto': (_, boton) => { copiar(boton.dataset.texto, 'Copiado. Pégalo en WhatsApp, correo o donde quieras.'); },
    'compartir-nativo': () => { const datos = el.hojaCuerpo._compartir; cerrarHoja(); compartir(datos); },
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-cerrar-hoja]')) { cerrarHoja(); return; }
    const salida = t.closest('a[data-salida]');
    if (salida) {
      const item = POR_ID.get(salida.dataset.salida);
      const afuera = salida.closest('.hoja, #repInfo, .rep-afuera') || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0;
      if (verDentro(item) && !afuera) {
        e.preventDefault();
        cerrarSugerencias();
        location.hash = `#/v/${item.id}`;
        return;
      }
      registrarVisto(salida.dataset.salida);
      if (salida.closest('.hoja')) cerrarHoja();
      return;
    }
    const fav = t.closest('[data-fav]');
    if (fav) { alternarGuardado(fav.dataset.fav, fav); return; }
    const menu = t.closest('[data-menu]');
    if (menu) { menuItem(menu.dataset.menu); return; }
    const op = t.closest('[data-op]');
    if (op) { OPERACIONES[op.dataset.op]?.(op.dataset.id, op); return; }
    const seg = t.closest('[data-tipo]');
    if (seg) { actualizarFiltros({ tipo: seg.dataset.tipo }); return; }
    const filtro = t.closest('[data-filtro]');
    if (filtro) {
      if (filtro.dataset.filtro === 'vista') cambiarVista(filtro.dataset.valor);
      else if (filtro.dataset.filtro === 'q') { el.q.value = ''; actualizarFiltros({ q: '' }); }
      else actualizarFiltros({ [filtro.dataset.filtro]: filtro.dataset.valor });
      el.hojaCuerpo._repintar?.();
      return;
    }
    const vistaBtn = t.closest('[data-vista]');
    if (vistaBtn) { cambiarVista(vistaBtn.dataset.vista); return; }
    const mover = t.closest('[data-mover]');
    if (mover) { Listas.mover(obtenerLista(estado.id).id, Number(mover.dataset.pos), Number(mover.dataset.mover)); render(); return; }
    const quitar = t.closest('[data-quitar-de-lista]');
    if (quitar) {
      const l = obtenerLista(estado.id);
      const itemId = quitar.dataset.quitarDeLista;
      const pos = l.ids.indexOf(itemId);
      Listas.alternar(l.id, itemId);
      render();
      aviso('Quitado de la lista.', { accion: 'Deshacer', alHacer: () => { const x = Listas.buscar(l.id); x.items.splice(pos, 0, itemId); Listas.guardar(); render(); } });
      return;
    }
    const tag = t.closest('[data-tag]');
    if (tag) {
      const elegidos = tagsElegidos();
      const h = tag.dataset.tag;
      actualizarFiltros({ tags: (elegidos.includes(h) ? elegidos.filter((x) => x !== h) : [...elegidos, h]).join(',') });
      return;
    }
    if (t.closest('[data-tag-limpiar]')) { actualizarFiltros({ tags: '' }); return; }
    const accionFlotante = t.closest('[data-flotante]');
    if (accionFlotante) { ACCIONES_FLOTANTE[accionFlotante.dataset.flotante]?.(); return; }
    const rep = t.closest('[data-rep]');
    if (rep) { irAPosicion(estado.pos + (rep.dataset.rep === 'siguiente' ? 1 : -1)); return; }
    const ir = t.closest('[data-ir]');
    if (ir) { irAPosicion(Number(ir.dataset.ir)); return; }
    const pais = t.closest('[data-pais]');
    if (pais) { cambiarPais(pais.dataset.pais); return; }
    const accion = t.closest('[data-accion]');
    if (accion) ACCIONES[accion.dataset.accion]?.();
  });

  document.addEventListener('auxclick', (e) => {
    const salida = e.button === 1 && e.target.closest('a[data-salida]');
    if (salida) registrarVisto(salida.dataset.salida);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-lista-alternar]')) {
      const agregado = Listas.alternar(t.dataset.listaAlternar, t.dataset.id);
      const l = Listas.buscar(t.dataset.listaAlternar);
      aviso(agregado ? `Agregado a «${l.nombre}».` : `Quitado de «${l.nombre}».`);
      el.hojaCuerpo._repintar?.();
    } else if (t.matches('[data-filtro-select]')) {
      actualizarFiltros({ [t.dataset.filtroSelect]: t.value });
    } else if (t.id === 'repAuto') {
      avanceAutomatico = t.checked;
      almacen.guardar('autoavance', avanceAutomatico);
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const nombre = new FormData(form).get('nombre')?.toString().trim();
    if (!nombre) return;
    if (form.dataset.form === 'nueva-lista') {
      const l = Listas.crear(nombre, [form.dataset.id]);
      aviso(`Creada «${l.nombre}» con este recurso.`);
      el.hojaCuerpo._repintar?.();
    } else if (form.dataset.form === 'nombre-lista') {
      const alGuardar = el.hojaCuerpo._alGuardar;
      cerrarHoja();
      alGuardar?.(nombre);
    }
  });

  function cambiarVista(modo) {
    modoVista = modo === 'lista' ? 'lista' : 'grilla';
    almacen.guardar('vista', modoVista);
    sincronizarControles();
  }

  // Miniatura que no carga → portada de respaldo con el color del tema.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const item = POR_ID.get(img.dataset.item);
    if (item) img.outerHTML = respaldo(item);
    else if (img.closest('.tile, .mosaico-celda, .rep-afuera')) img.remove();
  }, true);

  // =====================================================================
  // Búsqueda con sugerencias
  // =====================================================================
  let opcionActiva = -1;

  const BUSQUEDAS_FRECUENTES = ['IPERC', 'trabajo en altura', 'espacios confinados', 'LOTO', 'ICAM', 'extintores', 'EPP', 'ATS', 'izaje', 'primeros auxilios', 'ISO 45001', 'charla de 5 minutos'];
  let busquedasRecientes = almacen.leer('busquedas', []);
  function recordarBusqueda(q) {
    if (!q || q.length < 2) return;
    busquedasRecientes = [q, ...busquedasRecientes.filter((x) => norm(x) !== norm(q))].slice(0, 6);
    almacen.guardar('busquedas', busquedasRecientes);
  }
  function sugerencias(texto) {
    const q = norm(texto).trim();
    const esHashtag = q.startsWith('#');
    const t = q.replace(/^#/, '');
    if (!t && !esHashtag) {
      const op = (x, ico) => ({ href: `#/?q=${encodeURIComponent(x)}`, html: `<span class="sug-ico sug-hash">${ico}</span><span>${esc(x)}</span>` });
      return [
        busquedasRecientes.length ? ['Tus búsquedas recientes', busquedasRecientes.map((x) => op(x, '↺'))] : null,
        ['Lo más buscado en SST', BUSQUEDAS_FRECUENTES.filter((x) => !busquedasRecientes.some((r) => norm(r) === norm(x))).slice(0, 8).map((x) => op(x, '🔎'))],
      ].filter(Boolean);
    }
    if (t.length < 2) return [];
    const compacto = t.replace(/[^a-z0-9]/g, '');
    const grupos = [];
    const tags = (D.hashtags || []).filter((h) => h.id.includes(compacto)).slice(0, esHashtag ? 10 : 4);
    if (!esHashtag) {
      const coincide = (x) => norm(x.nombre).includes(t) || (x.claves || []).some((k) => norm(k).startsWith(t));
      const temas = CATS_VISIBLES.filter(coincide).slice(0, 3);
      const sectores = SECTORES_VISIBLES.filter(coincide).slice(0, 2);
      if (temas.length) grupos.push(['Temas', temas.map((c) => ({ href: `#/c/${c.id}`, html: `<span class="sug-ico" style="--cat:${c.color}">${c.icono}</span><span>${esc(c.nombre)}</span><small>${nf.format(c.total)}</small>` }))]);
      if (sectores.length) grupos.push(['Sectores', sectores.map((s) => ({ href: `#/s/${s.id}`, html: `<span class="sug-ico" style="--cat:${s.color}">${s.icono}</span><span>${esc(s.nombre)}</span><small>${nf.format(s.total)}</small>` }))]);
    }
    if (tags.length) grupos.push(['Hashtags', tags.map((h) => ({ href: `#/t/${h.id}`, html: `<span class="sug-ico sug-hash">#</span><span>${esc(h.etiqueta)}</span><small>${nf.format(h.total)}</small>` }))]);
    if (!esHashtag) {
      const fuentes = [...FUENTES.values()].filter((f) => norm(f.nombre).includes(t)).slice(0, 2);
      if (fuentes.length) grupos.push(['Fuentes', fuentes.map((f) => ({ href: `#/f/${f.id}`, html: `${avatarFuente(f.nombre)}<span>${esc(f.nombre)}</span><small>${nf.format(f.total)}</small>` }))]);
      const r = buscarEn(visibles(), t, { permitirTema: false });
      const recursos = r.modo === 'exacta' || r.modo === 'corregida' ? r.items.slice(0, 5) : [];
      if (recursos.length) grupos.push(['Recursos', recursos.map((i) => ({ href: i.url, salida: i.id, html: `<span class="sug-mini">${imagenDe(i, 'sug-img')}</span><span class="sug-titulo">${esc(i.titulo)}</span>${svg('externo')}` }))]);
    }
    return grupos;
  }

  function pintarSugerencias() {
    const texto = el.q.value;
    const grupos = sugerencias(texto);
    opcionActiva = -1;
    if (!grupos.length) { cerrarSugerencias(); return; }
    let n = 0;
    el.sugerencias.innerHTML = grupos.map(([titulo, ops]) => `<div class="sug-grupo"><p>${titulo}</p>${ops.map((o) =>
      `<a class="sug-op" role="option" id="sug-${n++}" href="${esc(o.href)}"${o.salida ? ` target="_blank" rel="noopener noreferrer" data-salida="${o.salida}"` : ''}>${o.html}</a>`).join('')}</div>`).join('') +
      (texto.trim() ? `<button type="button" class="sug-buscar" data-buscar-todo>${svg('flecha')} Buscar «${esc(texto.trim())}» en todo</button>` : '');
    el.sugerencias.hidden = false;
    el.q.setAttribute('aria-expanded', 'true');
  }

  function cerrarSugerencias() {
    el.sugerencias.hidden = true;
    el.q.setAttribute('aria-expanded', 'false');
    el.q.removeAttribute('aria-activedescendant');
    opcionActiva = -1;
  }

  function moverSugerencia(delta) {
    const ops = $$('.sug-op', el.sugerencias);
    if (!ops.length) return;
    opcionActiva = (opcionActiva + delta + ops.length) % ops.length;
    ops.forEach((o, k) => o.setAttribute('aria-selected', String(k === opcionActiva)));
    ops[opcionActiva].scrollIntoView({ block: 'nearest' });
    el.q.setAttribute('aria-activedescendant', ops[opcionActiva].id);
  }

  function buscar(q) {
    cerrarSugerencias();
    recordarBusqueda(q);
    if (q === estado.q && VISTAS_CON_GRILLA.has(estado.vista)) return;
    if (!VISTAS_CON_GRILLA.has(estado.vista) || estado.vista === 'guardados' || estado.vista === 'vistos') {
      location.hash = hashDe({ ...estado, ...FILTROS_BASE, vista: 'inicio', id: null, q });
    } else {
      actualizarFiltros({ q });
    }
  }

  let relojSugerencias;
  el.q.addEventListener('input', () => {
    clearTimeout(relojSugerencias);
    relojSugerencias = setTimeout(pintarSugerencias, 120);
    if (!el.q.value.trim() && estado.q) buscar('');
  });
  el.q.addEventListener('focus', () => { if (el.q.value.trim().length >= 2 || !el.q.value.trim()) pintarSugerencias(); });
  el.q.addEventListener('blur', () => setTimeout(cerrarSugerencias, 180));
  el.q.addEventListener('keydown', (e) => {
    if (el.sugerencias.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moverSugerencia(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moverSugerencia(-1); }
    else if (e.key === 'Enter' && opcionActiva >= 0) { e.preventDefault(); $$('.sug-op', el.sugerencias)[opcionActiva].click(); el.q.blur(); }
  });
  el.sugerencias.addEventListener('mousedown', (e) => e.preventDefault()); // que el clic no cierre antes por el blur
  el.sugerencias.addEventListener('click', (e) => {
    if (e.target.closest('[data-buscar-todo]')) { buscar(el.q.value.trim()); return; }
    const op = e.target.closest('.sug-op');
    if (op) {
      const q = new URLSearchParams(op.getAttribute('href').split('?')[1] || '').get('q');
      if (q) recordarBusqueda(q);
      cerrarSugerencias();
      el.q.blur();
    }
  });
  $('#formBuscar').addEventListener('submit', (e) => {
    e.preventDefault();
    buscar(el.q.value.trim());
    if (matchMedia('(hover: none)').matches) el.q.blur(); // oculta el teclado del celular
  });

  el.selSector.addEventListener('change', () => actualizarFiltros({ sector: el.selSector.value }));
  el.selIdioma.addEventListener('change', () => actualizarFiltros({ idioma: el.selIdioma.value }));
  el.selPlat.addEventListener('change', () => actualizarFiltros({ plat: el.selPlat.value }));
  el.selFuente.addEventListener('change', () => actualizarFiltros({ fuente: el.selFuente.value }));
  el.selOrden.addEventListener('change', () => actualizarFiltros({ orden: el.selOrden.value }));
  el.btnFiltros.addEventListener('click', hojaFiltros);

  // =====================================================================
  // Menú lateral (en el celular, botón "Más"), tema e instalación
  // =====================================================================
  function abrirMenu() {
    el.lateral.classList.add('abierto');
    el.velo.hidden = false;
    el.btnMas.setAttribute('aria-expanded', 'true');
    document.body.classList.add('con-menu');
  }
  function cerrarMenu() {
    el.lateral.classList.remove('abierto');
    el.velo.hidden = true;
    el.btnMas.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('con-menu');
  }
  el.btnMas.addEventListener('click', () => (el.lateral.classList.contains('abierto') ? cerrarMenu() : abrirMenu()));
  el.velo.addEventListener('click', cerrarMenu);
  el.hojaVelo.addEventListener('click', cerrarHoja);

  $('#btnTema').addEventListener('click', () => {
    const raiz = document.documentElement;
    const actual = raiz.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    raiz.dataset.theme = actual === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ssthub:tema', raiz.dataset.theme); } catch { /* sin almacenamiento */ }
  });

  let eventoInstalar = null;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const puedeInstalar = () => !esApp && !esArchivoLocal && (Boolean(eventoInstalar) || esIOS);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    el.btnInstalar.hidden = false;
    pintarExtrasLateral();
  });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; el.btnInstalar.hidden = true; pintarExtrasLateral(); aviso('¡Listo! SST Hub quedó instalado.'); });
  el.btnInstalar.addEventListener('click', () => instalarApp());

  async function instalarApp() {
    cerrarMenu();
    if (eventoInstalar) {
      eventoInstalar.prompt();
      await eventoInstalar.userChoice.catch(() => null);
      eventoInstalar = null;
      el.btnInstalar.hidden = true;
      pintarExtrasLateral();
    } else if (esIOS) {
      abrirHoja('Instalar en iPhone o iPad', `<ol class="pasos"><li>Toca el botón <b>Compartir</b> de Safari (el cuadrado con la flecha).</li>
        <li>Elige <b>«Agregar a inicio»</b>.</li><li>Abre SST Hub desde el ícono, como cualquier app.</li></ol>`);
    }
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ }));
  }

  // =====================================================================
  // Teclado, rutas y desplazamiento infinito
  // =====================================================================
  document.addEventListener('keydown', (e) => {
    const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === 'Escape') {
      if (!el.hoja.hidden) cerrarHoja();
      else if (el.lateral.classList.contains('abierto')) cerrarMenu();
      else if (!el.sugerencias.hidden) cerrarSugerencias();
      else if (document.activeElement === el.q && el.q.value) { el.q.value = ''; buscar(''); }
      return;
    }
    if (escribiendo || !el.hoja.hidden) return;
    if (e.key === '/') { e.preventDefault(); el.q.focus(); el.q.select(); }
    else if (estado.vista === 'ver' && (e.key === 'n' || e.key === 'N')) irAPosicion(estado.pos + 1);
    else if (estado.vista === 'ver' && (e.key === 'p' || e.key === 'P')) irAPosicion(estado.pos - 1);
  });

  // Al volver a una página de resultados se recupera la posición del scroll (y los recursos ya cargados).
  const posiciones = new Map();
  window.addEventListener('hashchange', (e) => {
    if (location.hash.endsWith('#hashtags') && estado.vista === 'explorar') { $('#hashtags')?.scrollIntoView(); return; }
    if (VISTAS_CON_GRILLA.has(estado.vista)) posiciones.set(new URL(e.oldURL).hash, { y: scrollY, n: mostrados });
    leerHash();
    cerrarMenu();
    cerrarHoja();
    render();
    const previa = VISTAS_CON_GRILLA.has(estado.vista) && posiciones.get(location.hash);
    if (previa) {
      while (mostrados < Math.min(previa.n, lista.length)) pintarMas();
      window.scrollTo(0, previa.y);
    } else {
      window.scrollTo(0, 0);
    }
  });

  new IntersectionObserver((entradas) => {
    if (!entradas.some((x) => x.isIntersecting)) return;
    if (mostrados < lista.length) pintarMas();
    else buscarAfuera();
  }, { rootMargin: '900px 0px' }).observe(el.centinela);

  // Guardados o listas cambiados en otra pestaña se sincronizan.
  window.addEventListener('storage', (e) => {
    if (e.key === 'ssthub:guardados') guardados = new Set(almacen.leer('guardados', []));
    if (e.key === 'ssthub:vistos') vistos = almacen.leer('vistos', {});
    if (e.key === 'ssthub:listas') misListas = almacen.leer('listas', []);
    if (e.key === 'ssthub:ocultos') ocultos = new Set(almacen.leer('ocultos', []));
    if (e.key?.startsWith('ssthub:')) actualizarContadores();
  });

  // =====================================================================
  // Arranque
  // =====================================================================
  el.pie.innerHTML = `<p><b>SST Hub</b> no aloja videos ni artículos: muestra el título y la miniatura públicos de cada recurso y te lleva a su fuente original. Los derechos pertenecen a sus autores.</p>
    <p>Actualizado ${haceCuanto(D.generado)} · ${plural(ITEMS.length, 'recurso', 'recursos')} de ${plural(FUENTES.size, 'fuente', 'fuentes')}</p>`;
  pintarLateral();
  actualizarContadores();
  leerHash();
  render();
})();

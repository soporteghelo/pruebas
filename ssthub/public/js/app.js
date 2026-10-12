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
  const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
      _tit: norm(i.titulo),
      _busq: norm([
        i.titulo, i.resumen, i.fuente,
        ...categorias.map((c) => CATS.get(c).nombre),
        ...sectores.map((s) => SECTORES.get(s).nombre),
        ...hashtags.map((h) => `${h} ${HASHTAGS.get(h).etiqueta}`),
      ].join(' ')),
    };
  });
  const POR_ID = new Map(ITEMS.map((i) => [i.id, i]));
  const CATS_VISIBLES = D.categorias.filter((c) => c.total > 0);
  const SECTORES_VISIBLES = (D.sectores || []).filter((s) => s.total > 0);
  const CAT_RESPALDO = { color: '#6B7280', icono: '🛡️', nombre: 'Seguridad' };

  // =====================================================================
  // Lo personal (este navegador)
  // =====================================================================
  let guardados = new Set(almacen.leer('guardados', []));
  let vistos = almacen.leer('vistos', {});
  let ocultos = new Set(almacen.leer('ocultos', []));
  let misListas = almacen.leer('listas', []);
  let modoVista = almacen.leer('vista', 'grilla');

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

  // Una lista puede ser tuya (m-…), destacada (d-…) o compartida por enlace (c).
  function obtenerLista(ref) {
    if (!ref) return null;
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
  //   filtros: ?q=&tipo=&sector=&idioma=&fuente=&orden=&nuevos=   lista compartida: ?n=&i=
  // =====================================================================
  const FILTROS_BASE = { q: '', tipo: 'todo', sector: 'todos', idioma: 'todos', fuente: 'todas', orden: 'recientes', nuevos: '' };
  const estado = { vista: 'inicio', id: null, pos: 0, compartida: null, ...FILTROS_BASE };
  const VISTAS = {
    c: 'categoria', s: 'sector', t: 'hashtag', f: 'fuente', explorar: 'explorar', categorias: 'explorar',
    listas: 'listas', lista: 'lista', ver: 'ver', guardados: 'guardados', vistos: 'vistos',
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
      explorar: '/explorar', listas: '/listas', lista: `/lista/${e.id}`, ver: `/ver/${e.id}/${e.pos || 0}`,
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

  const hayFiltros = () => Boolean(estado.q) || estado.tipo !== 'todo' || estado.idioma !== 'todos' || estado.fuente !== 'todas'
    || estado.sector !== 'todos' || Boolean(estado.nuevos);
  const cuantosFiltrosMovil = () => [estado.sector !== 'todos' && estado.vista !== 'sector', estado.idioma !== 'todos',
    estado.fuente !== 'todas' && estado.vista !== 'fuente', estado.orden !== 'recientes', Boolean(estado.nuevos)].filter(Boolean).length;

  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'o', 'a', 'al', 'con', 'por', 'para', 'un', 'una', 'que', 'como', 'the', 'of', 'and', 'to', 'in']);
  function tokensDe(texto) {
    const todos = norm(texto).split(/[^a-z0-9]+/).filter(Boolean);
    const utiles = todos.filter((t) => !PALABRAS_VACIAS.has(t));
    return (utiles.length ? utiles : todos).map((t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t)); // "arneses" encuentra "arnés"
  }
  const tokensBusqueda = () => tokensDe(estado.q);
  // Temas cuyo nombre, descripción o palabras clave contienen lo buscado ("extintor" → Incendios y emergencias).
  const CLAVES_CAT = new Map(D.categorias.map((c) => [c.id, norm([c.nombre, c.descripcion, ...(c.claves || [])].join(' | '))]));
  const temasDeBusqueda = (tokens) => (tokens.length ? CATS_VISIBLES.filter((c) => tokens.every((t) => CLAVES_CAT.get(c.id).includes(t))) : []);

  // =====================================================================
  // Elementos
  // =====================================================================
  const el = {
    lateral: $('#lateral'), velo: $('#velo'), chips: $('#chipsCat'), q: $('#q'), sugerencias: $('#sugerencias'),
    cabecera: $('#cabecera'), secciones: $('#secciones'), herramientas: $('#herramientas'), seg: $('#segTipo'),
    selSector: $('#selSector'), selIdioma: $('#selIdioma'), selFuente: $('#selFuente'), selOrden: $('#selOrden'),
    btnFiltros: $('#btnFiltros'), burbujaFiltros: $('#burbujaFiltros'),
    resultado: $('#resultado'), grilla: $('#grilla'), vacio: $('#vacio'), centinela: $('#centinela'), pie: $('#pie'),
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
  }

  // Instalar la app y restaurar ocultos (cambian durante la sesión).
  function pintarExtrasLateral() {
    const caja = $('#lateralExtra');
    if (!caja) return;
    const botones = [];
    if (puedeInstalar()) botones.push(`<button type="button" class="nav-item" data-accion="instalar">${svg('descargar', 'nav-ico')}<span class="nombre">Instalar la app</span></button>`);
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
    const pestana = PESTANA[estado.vista];
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
  const destinoDe = (i) => (esYoutube(i._dom) ? 'YouTube' : i._dom);

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

  function selloTipo(i) {
    if (i.short) return `<span class="sello sello-video sello-short">${svg('play')} Short</span>`;
    if (i.tipo === 'video') return `<span class="sello sello-video">${svg('play')} Video</span>`;
    if (i.tipo === 'documento') return `<span class="sello">${svg('documento')} PDF</span>`;
    return `<span class="sello">${svg('articulo')} Artículo</span>`;
  }

  function tarjeta(i) {
    const c0 = CATS.get(i.categorias[0]) || CAT_RESPALDO;
    const guardado = guardados.has(i.id);
    const destino = destinoDe(i);
    const enlace = `href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" data-salida="${i.id}"`;
    return `<article class="tarjeta${vistos[i.id] ? ' visto' : ''}" data-id="${i.id}">
      <a class="mini" ${enlace}${i.ytId ? ` data-yt="${esc(i.ytId)}"` : ''} style="--cat:${c0.color}" aria-label="${esc(i.titulo)}. Abrir en ${esc(destino)} (pestaña nueva)">
        ${imagenDe(i)}
        <span class="sellos">${selloTipo(i)}${esNuevo(i) ? `<span class="sello sello-nuevo">Nuevo</span>` : ''}${i.destacado ? `<span class="sello sello-video sello-dest">${svg('estrella')} Recomendado</span>` : ''}</span>
        ${i.duracion ? `<span class="sello sello-dur">${duracion(i.duracion)}</span>` : ''}
        <span class="sello sello-visto">${svg('check')} Visto</span>
        <span class="mini-salida">${svg('externo')} Abrir en ${esc(destino)}</span>
        <span class="progreso"><i></i></span>
      </a>
      <button type="button" class="fav${guardado ? ' activo' : ''}" data-fav="${i.id}" aria-pressed="${guardado}" aria-label="${guardado ? 'Quitar de guardados' : 'Guardar'}">${svg('corazon')}</button>
      <div class="info">
        <div class="info-sup">
          <a class="titulo" ${enlace} title="${esc(i.resumen || i.titulo)}">${esc(i.titulo)}</a>
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
      const temas = temasDeBusqueda(tokensBusqueda()).slice(0, 6);
      html = cabSimple(`Resultados para “${esc(q)}”`, 'Buscamos en títulos, descripciones, hashtags, fuentes y temas relacionados.') +
        (temas.length ? `<div class="relacionadas relacionadas-busqueda"><span>Temas relacionados:</span>${temas.map((c) => chipCat(c)).join('')}</div>` : '');
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
        <h1>${esc(f.nombre)}</h1><p>${plural(f.total, 'recurso', 'recursos')} · ${f.tipo === 'youtube' ? 'Canal de YouTube' : f.tipo === 'rss' ? 'Sitio web' : 'Selección'} · ${f.idioma === 'en' ? 'en inglés' : 'en español'}</p></div></div>`;
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
      `<div class="seccion-titulo"><h2>${estado.nuevos ? 'Nuevo desde tu última visita' : 'Lo más reciente'}</h2></div>`,
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
          <small>${f.tipo === 'youtube' ? 'YouTube' : f.tipo === 'rss' ? 'Web' : 'Selección'}${f.pais ? ` · ${esc(f.pais)}` : ''} · ${plural(f.total, 'recurso', 'recursos')}</small></span></a>`).join('')}</div>`),
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
    const videos = items.filter((i) => i.ytId);
    const total = items.reduce((s, i) => s + (i.duracion || 0), 0);
    const etiqueta = { mia: 'Tu lista', destacada: 'Lista destacada', compartida: 'Lista compartida' }[l.tipo];
    const acciones = [
      items.length ? `<a class="boton" href="#/ver/${l.ref}/0${l.ref === 'c' ? hashDe({ ...estado, vista: 'lista' }).replace(/^[^?]*/, '') : ''}">${svg('play')} Ver lista</a>` : '',
      videos.length ? `<a class="boton boton-sec" href="${urlYoutubeDeLista(videos)}" target="_blank" rel="noopener noreferrer">${svg('externo')} Reproducir en YouTube</a>` : '',
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

  // ---------- Reproductor de listas ----------
  let reproductor = null; // { player, ytId }
  let cargaApiYT = null;
  let avanceAutomatico = almacen.leer('autoavance', true);

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

  function destruirReproductor() {
    try { reproductor?.player?.destroy(); } catch { /* ya no existe */ }
    reproductor = null;
  }

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

    if (!soloCambio) {
      el.cabecera.innerHTML = '';
      el.secciones.innerHTML = `<div class="reproductor">
        <div class="rep-principal"><div class="rep-pantalla" id="repPantalla"></div><div class="rep-info" id="repInfo"></div></div>
        <aside class="rep-cola" id="repCola" aria-label="Recursos de la lista"></aside>
      </div>`;
    }

    // Pantalla: video integrado, aviso para abrir afuera o tarjeta de artículo.
    const pantalla = $('#repPantalla');
    if (i.ytId && !esArchivoLocal) {
      if (reproductor?.player && soloCambio && typeof reproductor.player.loadVideoById === 'function') {
        reproductor.player.loadVideoById(i.ytId);
        reproductor.ytId = i.ytId;
      } else {
        destruirReproductor();
        pantalla.innerHTML = `<div id="repVideo"></div>`;
        const ytId = i.ytId;
        cargarApiYoutube().then(() => {
          if (estado.vista !== 'ver' || !$('#repVideo')) return;
          reproductor = {
            ytId,
            player: new window.YT.Player('repVideo', {
              videoId: ytId,
              host: 'https://www.youtube-nocookie.com',
              playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1 },
              events: {
                onStateChange: (e) => {
                  const actual = itemsDeLista(obtenerLista(estado.id))[estado.pos];
                  if (e.data === window.YT.PlayerState.PLAYING && actual) registrarVisto(actual.id);
                  if (e.data === window.YT.PlayerState.ENDED && avanceAutomatico) irAPosicion(estado.pos + 1);
                },
                onError: () => {
                  const actual = itemsDeLista(obtenerLista(estado.id))[estado.pos];
                  if (actual) pantallaAfuera(actual, 'Su autor no permite verlo fuera de YouTube.');
                },
              },
            }),
          };
        }).catch(() => pantallaAfuera(i, 'No se pudo conectar con YouTube.'));
      }
    } else {
      destruirReproductor();
      if (i.ytId) pantallaAfuera(i, 'Para verla aquí, abre el portal con <b>ABRIR_PORTAL.bat</b> o desde su dirección en internet.');
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
        <label class="interruptor"><input type="checkbox" id="repAuto" ${avanceAutomatico ? 'checked' : ''}><span></span>Avance automático</label>
        <span class="rep-separador"></span>
        <button type="button" class="icono-btn fav-btn${guardado ? ' activo' : ''}" data-fav="${i.id}" aria-pressed="${guardado}" aria-label="${guardado ? 'Quitar de guardados' : 'Guardar'}">${svg('corazon')}</button>
        <a class="icono-btn" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" data-salida="${i.id}" aria-label="Abrir en ${esc(destino)}" title="Abrir en ${esc(destino)}">${svg('externo')}</a>
        <button type="button" class="icono-btn" data-menu="${i.id}" aria-label="Más opciones">${svg('puntos')}</button>
      </div>
      <div class="etiquetas">${i.categorias.map((c) => chipCat(CATS.get(c))).join('')}${i.hashtags.map((h) => chipHashtag(h)).join('')}</div>
      ${i.resumen ? `<p class="rep-resumen">${esc(i.resumen)}</p>` : ''}`;

    $('#repCola').innerHTML = `
      <header><div><b>${esc(l.nombre)}</b><span>${estado.pos + 1} de ${items.length}</span></div><a href="#/lista/${l.ref}${sufijo}">Ver lista</a></header>
      <ol>${items.map((x, k) => `<li${k === estado.pos ? ' aria-current="true"' : ''}>
        <button type="button" data-ir="${k}"><span class="cola-n">${k === estado.pos ? svg('play') : k + 1}</span>
          <span class="cola-mini">${imagenDe(x)}</span>
          <span class="cola-txt"><b>${esc(x.titulo)}</b><small>${esc(x.fuente)}</small></span></button></li>`).join('')}</ol>`;
    $('#repCola li[aria-current]')?.scrollIntoView({ block: 'nearest' });
    document.title = `${i.titulo} · ${l.nombre} · SST Hub`;
  }

  function pantallaAfuera(i, motivo, esArticulo = false) {
    const pantalla = $('#repPantalla');
    if (!pantalla) return;
    destruirReproductor();
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
  function alcance() {
    let xs = visibles();
    const { vista, id } = estado;
    if (vista === 'categoria') xs = xs.filter((i) => i.categorias.includes(id));
    else if (vista === 'sector') xs = xs.filter((i) => i.sectores.includes(id));
    else if (vista === 'hashtag') xs = xs.filter((i) => i.hashtags.includes(id));
    else if (vista === 'fuente') xs = xs.filter((i) => i.fuenteId === id);
    else if (vista === 'guardados') xs = ITEMS.filter((i) => guardados.has(i.id));
    else if (vista === 'vistos') xs = ITEMS.filter((i) => vistos[i.id]);
    if (estado.nuevos) xs = xs.filter(esNuevo);
    if (estado.sector !== 'todos' && vista !== 'sector') xs = xs.filter((i) => i.sectores.includes(estado.sector));
    if (estado.idioma !== 'todos') xs = xs.filter((i) => i.idioma === estado.idioma);
    if (estado.fuente !== 'todas' && vista !== 'fuente') xs = xs.filter((i) => i.fuenteId === estado.fuente);
    const tokens = tokensBusqueda();
    if (tokens.length) {
      // Fuera de un tema, también entra lo que pertenece a un tema relacionado con la búsqueda.
      const temas = new Set(vista === 'categoria' ? [] : temasDeBusqueda(tokens).map((c) => c.id));
      xs = xs.filter((i) => tokens.every((t) => i._busq.includes(t)) || i.categorias.some((c) => temas.has(c)));
    }
    return xs;
  }

  function ordenar(xs) {
    const copia = [...xs];
    const porFecha = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);
    switch (estado.orden) {
      case 'antiguos': return copia.sort((a, b) => porFecha(b, a));
      case 'az': return copia.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      case 'vistas': return copia.sort((a, b) => (b.vistas ?? -1) - (a.vistas ?? -1) || porFecha(a, b));
      default: {
        if (estado.vista === 'vistos') return copia.sort((a, b) => vistos[b.id] - vistos[a.id]);
        const tokens = tokensBusqueda();
        if (!tokens.length) return copia.sort(porFecha);
        // Primero lo que coincide en el título, luego en el texto y al final lo que solo comparte el tema.
        const rango = (i) => (tokens.every((t) => i._tit.includes(t)) ? 0 : tokens.every((t) => i._busq.includes(t)) ? 1 : 2);
        return copia.sort((a, b) => rango(a) - rango(b) || porFecha(a, b));
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
    const lote = lista.slice(mostrados, mostrados + POR_PAGINA);
    el.grilla.insertAdjacentHTML('beforeend', lote.map(tarjeta).join(''));
    mostrados += lote.length;
    // Si la pantalla es alta y aún no hay scroll, se carga otro lote.
    requestAnimationFrame(() => {
      if (mostrados < lista.length && el.centinela.getBoundingClientRect().top < innerHeight + 900) pintarMas();
    });
  }

  function pintarResultado() {
    if (!lista.length) { el.resultado.innerHTML = ''; return; }
    const nombres = { categoria: CATS, sector: SECTORES };
    const donde = nombres[estado.vista] ? ` en ${esc(nombres[estado.vista].get(estado.id).nombre)}` : '';
    const sector = estado.sector !== 'todos' && SECTORES.has(estado.sector) ? ` · sector ${esc(SECTORES.get(estado.sector).nombre)}` : '';
    el.resultado.innerHTML = `<b>${plural(lista.length, 'recurso', 'recursos')}</b>${donde}${sector}${estado.nuevos ? ' · solo nuevos' : ''}` +
      (hayFiltros() ? `<button type="button" class="limpiar" data-accion="limpiar">Quitar filtros</button>` : '');
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
    if (estado.vista !== 'ver') destruirReproductor();

    const conGrilla = VISTAS_CON_GRILLA.has(estado.vista);
    el.herramientas.hidden = el.resultado.hidden = el.grilla.hidden = !conGrilla;

    if (!conGrilla) {
      const pintores = { explorar: pintarExplorar, listas: pintarListas, lista: pintarDetalleLista, ver: () => pintarReproductor(false) };
      pintores[estado.vista]();
      const titulos = { explorar: 'Explorar', listas: 'Listas', lista: obtenerLista(estado.id)?.nombre };
      if (titulos[estado.vista]) document.title = `${titulos[estado.vista]} · SST Hub`;
      return;
    }

    pintarCabecera();
    pintarSeccionesInicio();
    const base = alcance();
    el.herramientas.hidden = !base.length && !hayFiltros();
    pintarSegmentos(base);
    sincronizarControles();
    lista = ordenar(estado.tipo === 'todo' ? base : base.filter((i) => i.tipo === estado.tipo));
    pintarMas();
    pintarResultado();
    if (!lista.length) pintarVacio();

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
      `<button type="button" class="chip-opcion" data-filtro="${clave}" data-valor="${esc(valor)}" aria-pressed="${String(estado[clave] === valor || (clave === 'vista' && modoVista === valor))}">${texto}</button>`).join('')}</div></div>`;
    const pintar = () => [
      estado.vista !== 'sector' && SECTORES_VISIBLES.length ? fila('Sector', 'sector', [['todos', 'Todos'], ...SECTORES_VISIBLES.map((s) => [s.id, `${s.icono} ${esc(s.nombre)}`])]) : '',
      fila('Ordenar por', 'orden', [['recientes', 'Más recientes'], ['vistas', 'Más vistos'], ['antiguos', 'Más antiguos'], ['az', 'A–Z']]),
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
    if (salida) { registrarVisto(salida.dataset.salida); if (salida.closest('.hoja')) cerrarHoja(); return; }
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
    const rep = t.closest('[data-rep]');
    if (rep) { irAPosicion(estado.pos + (rep.dataset.rep === 'siguiente' ? 1 : -1)); return; }
    const ir = t.closest('[data-ir]');
    if (ir) { irAPosicion(Number(ir.dataset.ir)); return; }
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

  function sugerencias(texto) {
    const q = norm(texto).trim();
    const esHashtag = q.startsWith('#');
    const t = q.replace(/^#/, '');
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
      const tokens = tokensDe(t);
      const recursos = visibles().filter((i) => tokens.every((x) => i._tit.includes(x))).slice(0, 5);
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
      `<button type="button" class="sug-buscar" data-buscar-todo>${svg('flecha')} Buscar «${esc(texto.trim())}» en todo</button>`;
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
  el.q.addEventListener('focus', () => { if (el.q.value.trim().length >= 2) pintarSugerencias(); });
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
    if (e.target.closest('.sug-op')) { cerrarSugerencias(); el.q.blur(); }
  });
  $('#formBuscar').addEventListener('submit', (e) => {
    e.preventDefault();
    buscar(el.q.value.trim());
    if (matchMedia('(hover: none)').matches) el.q.blur(); // oculta el teclado del celular
  });

  el.selSector.addEventListener('change', () => actualizarFiltros({ sector: el.selSector.value }));
  el.selIdioma.addEventListener('change', () => actualizarFiltros({ idioma: el.selIdioma.value }));
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

  window.addEventListener('hashchange', () => {
    if (location.hash.endsWith('#hashtags') && estado.vista === 'explorar') { $('#hashtags')?.scrollIntoView(); return; }
    leerHash();
    cerrarMenu();
    cerrarHoja();
    render();
    window.scrollTo(0, 0);
  });

  new IntersectionObserver((entradas) => {
    if (entradas.some((x) => x.isIntersecting) && mostrados < lista.length) pintarMas();
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

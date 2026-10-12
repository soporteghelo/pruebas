# SST Hub — Portal de seguridad laboral

Galería de miniaturas que reúne videos, artículos y guías de seguridad y salud en el trabajo de **38 fuentes confiables**, los **clasifica por tema, sector y hashtag** y, al hacer clic, **te lleva a la página original**. Además permite **armar listas para charlas** y verlas seguidas o compartirlas por WhatsApp. Funciona en computadora y como **app instalable en el celular**.

| Escritorio | Reproductor de listas | Celular |
|---|---|---|
| ![Inicio](docs/escritorio-inicio.png) | ![Reproductor](docs/escritorio-reproductor.png) | ![Celular](docs/celular-inicio.png) |
| ![Lista](docs/escritorio-lista.png) | ![Vista previa](docs/escritorio-categoria-vista-previa.png) | ![Reproductor en celular](docs/celular-reproductor.png) |

## Qué puede hacer

**Encontrar contenido**
- **21 temas** agrupados como los trabaja un área SSOMA (trabajos de alto riesgo, equipos y protección, salud y bienestar, gestión y cultura).
- **9 sectores**: Minería, Construcción, Energía, Petróleo/gas/química, Industria, Transporte, Agro y pesca, Salud y emergencias, Oficinas y servicios. Cada recurso dice **de qué riesgo trata** (tema) y **en qué industria aplica** (sector).
- **Hashtags automáticos** (#LOTO, #IPERC, #Arnés, #SaludMental, #Ley29783…) más los que usan las propias fuentes (#SST, #SeguridadMinera).
- **Buscador con sugerencias** mientras escribes: temas, sectores, hashtags, fuentes y recursos. Entiende sin tildes y en plural (“arneses” encuentra “arnés”), y si buscas “extintor” te sugiere *Incendios y emergencias*. Escribe `#` para buscar solo hashtags.
- Filtros por tipo (video, artículo, PDF), sector, idioma, fuente y orden (recientes, **más vistos**…), en **cuadrícula o lista**.
- **Vista previa animada** al pasar el mouse sobre un video, como en los sitios de videos.
- Etiqueta **“Nuevo”** y aviso de “X recursos nuevos desde tu última visita”.

**Listas (playlists)**
- **Mis listas**: crea listas (“Charla del lunes”, “Inducción nuevos”) desde el botón ⋮ de cualquier recurso. Reordénalas, renómbralas o bórralas (con “Deshacer”).
- **Ver lista**: reproductor integrado con la cola al costado. Pasa solo al siguiente video (avance automático), con botones Anterior / Siguiente y atajos de teclado `N` y `P`.
- **Reproducir en YouTube**: abre todos los videos de la lista como una lista de YouTube.
- **Compartir**: por WhatsApp, con enlace (quien lo abre ve la lista y puede guardarla) o como texto con títulos y enlaces.
- **Listas destacadas** que se arman solas en cada actualización: Inducción básica, Charla de 5 minutos, Lecciones aprendidas, Alto riesgo, Minería, Construcción, Salud mental, Emergencias, Para supervisores y Recursos en inglés.

**Lo personal** (se guarda en el navegador, sin cuentas): ♥ Guardados, Vistos, Mis listas y “No me interesa” para ocultar recursos (con “Deshacer” y opción de restaurar).

**En el celular**: barra inferior tipo app (Inicio · Explorar · Listas · Guardados · Más), paneles que suben desde abajo para filtros y opciones (se cierran deslizando), reproductor a pantalla completa de ancho y **se puede instalar como app** (ícono propio, se abre sin barra del navegador y funciona sin conexión con lo último que cargó).

## Cómo funciona

```
 FUENTES                       RECOLECTOR (npm run recolectar)                    PÁGINA (public/)
 ───────                       ────────────────────────────────                   ────────────────
 26 canales de YouTube (RSS) ┐  1. Lee feeds (gratis, sin clave)                 Galería por tema y sector
 12 blogs y revistas (RSS)   ├► 2. Acumula todo en data/biblioteca.json  ──►     Hashtags y buscador
 YouTube API (opcional)      │  3. Clasifica: tema + sector + hashtags           Listas y reproductor
 Tus enlaces manuales        ┘  4. Descarta lo que no es de seguridad            Clic → fuente original
                                5. Arma las listas destacadas
                                6. Escribe public/data/contenido.js
```

El portal no aloja nada: muestra título y miniatura públicos y enlaza a la fuente. El reproductor de listas usa el reproductor oficial de YouTube (embed).

## Qué necesitas

| | Qué | Estado / costo |
|---|---|---|
| ✅ | **Node.js 22 o superior** | Ya lo tienes (v24) |
| ✅ | Internet al actualizar | — |
| ⭐ Muy recomendado | **Clave de YouTube Data API v3**. Trae hasta **150 videos por canal** en vez de 15, más búsquedas por tema, duración y vistas | Gratis (10 000 unidades/día; una actualización completa usa ~1 700) |
| 🌐 Para publicarlo | Cuenta de **GitHub** (GitHub Pages) o **Vercel/Netlify** | Gratis |
| 🌐 Opcional | Dominio propio, por ejemplo `portalsst.pe` | ~US$ 12–30 al año |

## Uso diario

- **`ACTUALIZAR_PORTAL.bat`**: la primera vez instala lo necesario. Luego recolecta, clasifica y abre el portal.
- **`ABRIR_PORTAL.bat`**: abre el portal en `http://127.0.0.1:3012` sin actualizar. Deja abierta la ventana negra mientras lo uses. Si ya estaba abierto, solo abre el navegador.

> Tus listas, guardados y vistos quedan en el navegador **y en la dirección** desde la que abres el portal. Usa siempre `ABRIR_PORTAL.bat` (o siempre la misma dirección de internet) para encontrarlos. Abrir `public/index.html` con doble clic también funciona, pero ahí el reproductor integrado no puede mostrar videos (limitación de YouTube) y tendrá listas separadas.

Desde la terminal:

```bash
npm run recolectar                                   # actualizar contenido
npm run abrir                                        # abrir el portal (servidor local)
npm run agregar -- https://youtu.be/XXXX epp         # agregar un enlace a mano (sale como ★ Recomendado)
npm run agregar -- https://sitio.pe/guia.pdf         # también PDFs y artículos; el tema es opcional
npm run ocultar -- https://youtu.be/XXXX             # sacar algo del portal para siempre (para todos)
npm run categorias                                   # ver los ids de los temas
```

Después de agregar u ocultar, ejecuta `npm run recolectar` para que se refleje.

## Personalizar

| Quiero… | Edita |
|---|---|
| Agregar o quitar un canal de YouTube o un blog | `config/fuentes.json`. El canal acepta el ID `UC…` o el `@usuario`; el blog, la URL de su feed (en WordPress suele ser `https://sitio.com/feed/`). |
| Que una fuente que publica de todo solo deje pasar seguridad | En esa fuente: `"filtrar": true` |
| Que todo lo de una fuente vaya a un tema / sugerir un sector | En esa fuente: `"categoria": "epp"` / `"sector": "mineria"` |
| Descartar títulos con ciertas palabras | En la fuente: `"excluir": ["premios"]`, o `excluirGlobal` en `categorias.json` |
| Crear o ajustar temas y sectores (íconos, colores, palabras clave) | `config/categorias.json` |
| Crear o ajustar hashtags | `config/hashtags.json` |
| Crear o cambiar las listas destacadas | `config/listas.json` (reglas por tema, sector, hashtag, tipo e idioma; o enlaces fijos) |
| Cambiar el nombre “SST Hub”, textos o colores | `public/index.html`, `public/js/app.js` y las variables al inicio de `public/css/estilos.css` |

Al cambiar cualquier configuración, **toda la biblioteca se reclasifica** en la siguiente recolección. Las instrucciones de cada archivo están dentro de él (campo `_ayuda`).

### Cómo clasifica

Cada tema y sector tiene palabras **fuertes** (3 puntos) y **débiles** (1 punto); en el título valen el triple. El tema con más puntos queda como principal y los demás que superan el umbral se agregan como etiquetas. En las fuentes con `"filtrar": true` solo entra lo que tenga al menos una palabra fuerte de un tema de seguridad: hablar de “minería” o de un “curso” no basta.

## Activar la clave de YouTube (recomendado)

1. Entra a <https://console.cloud.google.com/>, crea un proyecto y activa **YouTube Data API v3**.
2. En *Credenciales* crea una **clave de API** y restríngela a esa API.
3. Copia `.env.ejemplo` como `.env` y pega la clave: `YT_API_KEY=AIza…`
4. Ejecuta `ACTUALIZAR_PORTAL.bat`. La biblioteca pasará de cientos a miles de recursos.

El archivo `.env` no se sube a GitHub (está en `.gitignore`).

## Publicarlo en internet con actualización diaria automática

1. Crea un repositorio en GitHub y sube **esta carpeta** (`PORTAL_SST`) como raíz.
2. En el repositorio: *Settings → Pages → Source*: **GitHub Actions**.
3. Opcional: *Settings → Secrets and variables → Actions* → secreto `YT_API_KEY`.
4. Listo: `.github/workflows/actualizar.yml` recolecta todos los días a las 6:00 a. m. (hora de Perú) y publica en `https://<tu-usuario>.github.io/<repositorio>/`. Desde ahí cualquiera puede **instalarlo en el celular** (Chrome: menú › *Instalar app*; iPhone: Compartir › *Agregar a inicio*) y los enlaces de listas compartidas funcionan para todos.

## Estructura

```
PORTAL_SST/
├── ACTUALIZAR_PORTAL.bat / ABRIR_PORTAL.bat
├── config/
│   ├── fuentes.json        canales, blogs y búsquedas
│   ├── categorias.json     temas, sectores y palabras clave
│   ├── hashtags.json       hashtags automáticos
│   ├── listas.json         listas destacadas
│   └── curaduria.json      enlaces agregados u ocultos a mano
├── scripts/
│   ├── recolectar.mjs      el recolector
│   ├── servidor.mjs        servidor local (http://127.0.0.1:3012)
│   ├── curar.mjs           atajos agregar / ocultar / categorias
│   └── lib/                lectores, clasificador, hashtags y utilidades
├── data/biblioteca.json    todo lo recolectado (se acumula; no borrar)
├── public/                 el sitio que se publica
│   ├── index.html, css/, js/, favicon.svg
│   ├── manifest.webmanifest, sw.js, iconos/   (app instalable)
│   └── data/contenido.js   generado por el recolector
└── .github/workflows/actualizar.yml
```

## Buenas prácticas y aspectos legales

- **Solo enlazar, nunca copiar.** El portal muestra título, miniatura y un resumen corto, y siempre lleva a la fuente. Así funcionan Google News y los agregadores.
- **Fuentes pensadas para compartirse:** los feeds RSS y las imágenes `og:image` existen para eso. Los videos se ven con el reproductor oficial de YouTube y respetan la opción del autor (si no permite insertarlo, el portal ofrece abrirlo en YouTube).
- **Cita la fuente en cada tarjeta** (ya lo hace) y atiende cualquier pedido de retiro con `npm run ocultar`.

## Ideas para una siguiente fase

- **Cuentas y listas en la nube** (Supabase o Firebase) para ver tus listas en todos tus dispositivos y para un contador global de “Lo más visto del mes”.
- **Clasificación con IA** para los casos dudosos y para un nivel por recurso (trabajador, supervisor, especialista).
- **Modo charla**: pantalla completa con un código QR por recurso para que la cuadrilla lo abra en su celular, y registro de asistencia.
- Formulario **“Sugerir un recurso”** con aprobación del administrador.

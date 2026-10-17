# IntelliExtract - Asistencia OCR (versión OCR local)

Extrae la tabla de participantes de registros de asistencia manuscritos (fotos o PDF) y la cruza con la lista maestra de personal.

Esta versión lee las fichas **en el propio navegador**, con [PP-OCRv6](https://github.com/PaddlePaddle/PaddleOCR) a través de [`ppu-paddle-ocr`](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr). No usa Gemini ni ninguna otra API: no hay claves que configurar, no hay cuotas ni pagos, y las imágenes no salen del equipo.

## Cómo funciona

Por cada página:

1. **Mide la tabla** (`src/lib/ocr/rejilla.ts`): detecta las líneas horizontales y verticales, el giro de la foto y los renglones tachados con una raya.
2. **Lee el texto** (`src/lib/ocr/motor.ts` + `ocr.worker.ts`): borra las líneas de la tabla en una copia de la imagen y la lee con PP-OCRv6 *small* (~7,7 M de parámetros) en un Web Worker, para no congelar la interfaz.
3. **Reconstruye la tabla** (`src/lib/ocr/tabla.ts`): reparte cada palabra en su renglón y su columna (Nro, Apellidos y Nombres, DNI, Ocupación, Área) usando las líneas y los títulos impresos de la cabecera.

La salida es el mismo CSV que antes generaba Gemini, así que la vinculación con la lista maestra, el visor y las exportaciones funcionan igual. La relectura de renglones sin coincidencia también es local: recorta el renglón a resolución completa y lo vuelve a leer.

## Modelos

Los archivos del modelo (~30 MB) **no se guardan en git**. El script `scripts/descargar-modelos.mjs` los descarga a `public/models/` antes de `npm run dev` y de `npm run build` (también en Vercel), y la app los sirve ella misma. El navegador los guarda en caché, así que solo se descargan la primera vez en cada equipo.

Si al compilar no se pudieran descargar, la app los pide a su origen público (Hugging Face) la primera vez que se usa.

Qué modelo se usa y de dónde se descarga está en `src/lib/ocr/modelos.json`. Para un equipo muy lento se puede cambiar a la variante *tiny* (~6 MB), que es más rápida pero lee bastante peor la letra a mano.

## Instalación y ejecución local

**Requisitos:** Node.js 18 o superior.

```bash
npm install
npm run dev      # descarga los modelos la primera vez y arranca en http://localhost:3000
```

Para producción:

```bash
npm run build    # deja la app en dist/, modelos incluidos
```

## Límites del OCR local

- Lee bien la letra de imprenta y la cursiva clara. Con letra muy desordenada fallará más que un modelo grande en la nube; la vinculación con la maestra compensa buena parte de esos errores (tolera DNIs con dígitos mal leídos y nombres a medio leer).
- Funciona mejor con fotos derechas, enfocadas y con la tabla completa. Tolera giros de hasta unos 4°, pero no fotos muy en perspectiva ni hojas dobladas.
- La primera extracción en cada equipo descarga ~60 MB (modelo + motor de ONNX). Las siguientes no descargan nada.

## Configuración del Backend y Google Sheets

El envío de los datos a Google Sheets a través de Apps Script no cambia. Revisa el [Manual de Configuración del Backend (Apps Script)](./BACKEND_README.md).

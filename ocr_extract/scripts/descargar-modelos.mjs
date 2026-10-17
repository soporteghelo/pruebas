/**
 * Descarga los modelos del OCR local a public/models para que la app los sirva ella
 * misma. Se ejecuta solo antes de `npm run dev` y de `npm run build` (predev/prebuild),
 * también en Vercel al desplegar.
 *
 * Los modelos no se guardan en git (pesan ~30 MB). Si la descarga fallara al compilar,
 * el despliegue no se rompe: la app los pide entonces a su origen público la primera
 * vez y los guarda en la caché del navegador.
 *
 *   node scripts/descargar-modelos.mjs
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(raiz, "src/lib/ocr/modelos.json"), "utf8"));
const destino = join(raiz, "public", config.carpeta);
mkdirSync(destino, { recursive: true });

let fallos = 0;
for (const { archivo, origen, bytes } of Object.values(config.archivos)) {
  const ruta = join(destino, archivo);
  if (existsSync(ruta) && statSync(ruta).size === bytes) {
    console.log(`✓ ${archivo} (ya descargado)`);
    continue;
  }
  const temporal = `${ruta}.parcial`;
  try {
    const res = await fetch(origen, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(temporal));
    const tam = statSync(temporal).size;
    if (tam !== bytes) throw new Error(`tamaño inesperado: ${tam} bytes, se esperaban ${bytes}`);
    renameSync(temporal, ruta);
    console.log(`✓ ${archivo} (${(tam / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    fallos++;
    if (existsSync(temporal)) unlinkSync(temporal);
    console.warn(`⚠ No se pudo descargar ${archivo}: ${err.message}`);
  }
}

if (fallos) {
  console.warn(
    `⚠ Faltan ${fallos} archivo(s) del modelo. La app los pedirá a su origen público la primera vez que se use.`
  );
}

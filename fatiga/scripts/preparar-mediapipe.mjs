// Copia el motor de visión de MediaPipe (wasm) a public/ y descarga el modelo facial una sola vez,
// para que la app funcione sin conexión y sin depender de un CDN.
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const origen = path.join(raiz, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const destinoWasm = path.join(raiz, "public", "mediapipe");
const modelo = path.join(raiz, "public", "models", "face_landmarker.task");
const URL_MODELO = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

if (!fs.existsSync(origen)) {
  console.error("Falta @mediapipe/tasks-vision. Ejecuta npm install.");
  process.exit(1);
}
fs.mkdirSync(destinoWasm, { recursive: true });
for (const f of fs.readdirSync(origen)) {
  const a = path.join(origen, f);
  const b = path.join(destinoWasm, f);
  if (!fs.existsSync(b) || fs.statSync(b).size !== fs.statSync(a).size) fs.copyFileSync(a, b);
}

if (!fs.existsSync(modelo) || fs.statSync(modelo).size < 1_000_000) {
  fs.mkdirSync(path.dirname(modelo), { recursive: true });
  console.log("Descargando modelo facial…");
  const r = await fetch(URL_MODELO);
  if (!r.ok) {
    console.error(`No se pudo descargar el modelo (HTTP ${r.status}). La app funcionará sin análisis facial.`);
    process.exit(0);
  }
  fs.writeFileSync(modelo, Buffer.from(await r.arrayBuffer()));
}
console.log(`MediaPipe listo: ${fs.readdirSync(destinoWasm).length} archivos wasm, modelo ${(fs.statSync(modelo).size / 1e6).toFixed(1)} MB`);

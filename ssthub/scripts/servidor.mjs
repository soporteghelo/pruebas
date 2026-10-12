#!/usr/bin/env node
// Servidor local mínimo para ver el portal en http://127.0.0.1 (solo desde esta computadora).
// Hace falta para el reproductor de listas (YouTube no reproduce dentro de páginas abiertas como archivo)
// y para instalar el portal como app. Uso: node scripts/servidor.mjs [--abrir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(PUBLICO, path.normalize(ruta));
  if (!archivo.startsWith(PUBLICO)) { res.writeHead(403).end(); return; }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(datos);
  });
});

function abrirNavegador(url) {
  if (!process.argv.includes('--abrir')) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

// ¿Lo que ocupa el puerto ya es SST Hub? Entonces solo se abre el navegador: tus listas y guardados
// se guardan por dirección, así que conviene usar siempre la misma.
async function yaEstaAbierto(url) {
  try {
    const res = await fetch(`${url}manifest.webmanifest`, { signal: AbortSignal.timeout(2000) });
    return res.ok && (await res.text()).includes('SST Hub');
  } catch {
    return false;
  }
}

function escuchar(puerto, intentos = 10) {
  const url = `http://127.0.0.1:${puerto}/`;
  servidor.once('error', async (e) => {
    if (e.code === 'EADDRINUSE' && (await yaEstaAbierto(url))) {
      console.log(`\n🦺 SST Hub ya estaba abierto en ${url}. Lo abro en el navegador.\n`);
      abrirNavegador(url);
      setTimeout(() => process.exit(0), 1500);
    } else if (e.code === 'EADDRINUSE' && intentos > 0) {
      console.warn(`⚠ El puerto ${puerto} está ocupado por otro programa; pruebo el ${puerto + 1}. Ojo: en otra dirección no verás tus listas guardadas.`);
      escuchar(puerto + 1, intentos - 1);
    } else {
      console.error(`❌ No pude abrir el servidor: ${e.message}`);
      process.exit(1);
    }
  });
  servidor.listen(puerto, '127.0.0.1', () => {
    console.log(`\n🦺 SST Hub funcionando en ${url}`);
    console.log('   Deja esta ventana abierta mientras uses el portal. Ciérrala para apagarlo.\n');
    abrirNavegador(url);
  });
}

escuchar(Number(process.env.PORT) || 3012);

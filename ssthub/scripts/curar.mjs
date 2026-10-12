#!/usr/bin/env node
// Atajos de curaduría:
//   npm run agregar -- <url> [categoria]     añade un enlace a mano
//   npm run ocultar -- <url o id>            lo saca del portal para siempre
//   npm run categorias                       lista los ids de categoría
//   npm run ver                              abre el portal en el navegador
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { leerJson, escribirJson } from './lib/util.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_CURADURIA = path.join(RAIZ, 'config/curaduria.json');
const [accion, valor, categoria] = process.argv.slice(2);

async function categorias() {
  const cfg = await leerJson(path.join(RAIZ, 'config/categorias.json'));
  return cfg.categorias;
}

async function main() {
  if (accion === 'categorias') {
    for (const c of await categorias()) console.log(`  ${c.icono}  ${c.id.padEnd(26)} ${c.nombre}`);
    return;
  }
  if (accion === 'ver') {
    const archivo = path.join(RAIZ, 'public', 'index.html');
    const cmd = process.platform === 'win32' ? `start "" "${archivo}"` : process.platform === 'darwin' ? `open "${archivo}"` : `xdg-open "${archivo}"`;
    exec(cmd);
    return;
  }
  if (!['agregar', 'ocultar'].includes(accion) || !valor) {
    console.log('Uso:\n  npm run agregar -- <url> [categoria]\n  npm run ocultar -- <url o id>\n  npm run categorias');
    process.exit(1);
  }

  const cur = await leerJson(RUTA_CURADURIA, { agregar: [], ocultar: [] });
  cur.agregar ??= [];
  cur.ocultar ??= [];

  if (accion === 'agregar') {
    if (!/^https?:\/\//i.test(valor)) throw new Error('la URL debe empezar con http:// o https://');
    if (categoria && !(await categorias()).some((c) => c.id === categoria)) {
      throw new Error(`la categoría "${categoria}" no existe. Mira la lista con: npm run categorias`);
    }
    const existente = cur.agregar.find((e) => (typeof e === 'string' ? e : e.url) === valor);
    if (existente) {
      console.log('Ese enlace ya estaba en la lista.');
      return;
    }
    cur.agregar.push(categoria ? { url: valor, categoria } : { url: valor });
    cur.ocultar = cur.ocultar.filter((o) => o !== valor);
    console.log(`✓ Agregado${categoria ? ` en "${categoria}"` : ''}. Ejecuta "npm run recolectar" para publicarlo.`);
  } else {
    if (!cur.ocultar.includes(valor)) cur.ocultar.push(valor);
    cur.agregar = cur.agregar.filter((e) => (typeof e === 'string' ? e : e.url) !== valor);
    console.log('✓ Oculto. Ejecuta "npm run recolectar" para aplicarlo.');
  }
  await escribirJson(RUTA_CURADURIA, cur);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});

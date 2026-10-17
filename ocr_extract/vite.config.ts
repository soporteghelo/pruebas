import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // El OCR corre en un Web Worker con módulos ES (src/lib/ocr/ocr.worker.ts).
    worker: {
      format: 'es' as const,
    },
    // onnxruntime-web localiza su binario .wasm por URL; si Vite lo pre-empaqueta en
    // desarrollo, esa ruta se rompe. Se le pasa la URL explícita desde el worker.
    // ppu-paddle-ocr se declara aquí porque solo lo importa el worker y Vite no lo ve al
    // arrancar: lo descubriría en la primera extracción y recargaría la página a mitad.
    optimizeDeps: {
      include: ['ppu-paddle-ocr/web'],
      exclude: ['onnxruntime-web'],
    },
    build: {
      // El runtime de ONNX es grande por naturaleza; el aviso por defecto no aporta.
      chunkSizeWarningLimit: 2000,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

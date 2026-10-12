import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // La cámara del celular solo funciona con HTTPS: `npm run dev:https` sirve un certificado local.
    ...(mode === "https" ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "Test de Fatiga",
        short_name: "Fatiga",
        description: "Evaluación de fatiga antes del turno: sueño, somnolencia, PVT-B y análisis facial en el celular.",
        lang: "es",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b1220",
        theme_color: "#1e3a8a",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        // El motor de visión (wasm) y el modelo facial se guardan al primer uso y quedan offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/mediapipe/") || url.pathname.startsWith("/models/"),
            handler: "CacheFirst",
            options: { cacheName: "vision", expiration: { maxEntries: 12 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
}));

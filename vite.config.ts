/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// npm project lives at the repo root; the web app itself in src/web
export default defineConfig({
  root: "src/web",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Het Jaar Rond",
        short_name: "Jaar Rond",
        description: "Stijlgids en opmaak van het jaarboek",
        theme_color: "#f6f4ef",
        background_color: "#f6f4ef",
        display: "standalone",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // API, data and the static style guide are never served from the precache
        navigateFallbackDenylist: [/^\/api/, /^\/data/, /^\/stijlgids/],
        globIgnores: ["stijlgids/**"],
        runtimeCaching: [
          {
            // photos and thumbnails: names are stable per photo id
            urlPattern: ({ url }) => url.pathname.startsWith("/data/") && /\.(jpe?g|png|webp)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "photos", expiration: { maxEntries: 3000, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/data/") && url.pathname.endsWith(".json"),
            handler: "NetworkFirst",
            options: { cacheName: "data", networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/web/src", import.meta.url)) },
  },
  server: {
    proxy: { "/api": "http://localhost:8000", "/data": "http://localhost:8000" },
  },
  test: {
    root: ".",
    include: ["src/web/src/**/*.test.ts"],
  },
});

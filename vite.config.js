import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Divide el bundle en chunks más pequeños → carga paralela + mejor caché del navegador
    rollupOptions: {
      output: {
        manualChunks: {
          "chunk-react":    ["react", "react-dom"],
          "chunk-firebase": ["firebase/app", "firebase/firestore", "firebase/auth"],
          "chunk-mapbox":   ["mapbox-gl"],
          // xlsx-js-style y jspdf/autotable NO van aquí: se cargan con import()
          // dinámico (ensureOfficeLibs) y listarlos en manualChunks los regresa
          // al grafo estático (modulepreload) — Rollup los auto-divide solo.
          "chunk-lucide":   ["lucide-react"],
        },
      },
    },
    // Sube el límite del warning — los chunks separados ya manejan el tamaño
    chunkSizeWarningLimit: 800,
  },
});

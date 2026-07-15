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
          "chunk-xlsx":     ["xlsx-js-style"],
          "chunk-pdf":      ["jspdf", "jspdf-autotable"],
          "chunk-lucide":   ["lucide-react"],
        },
      },
    },
    // Sube el límite del warning — los chunks separados ya manejan el tamaño
    chunkSizeWarningLimit: 800,
  },
});

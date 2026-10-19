// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Augmenter le seuil d'alerte (les gros chunks PDF/Excel sont OK car chargés à la demande)
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          // 🧩 Core React + libs UI qui en dépendent
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler') ||
            id.includes('sonner') ||                    // ✅ toasts (dépend de React)
            id.includes('react-signature-canvas') ||    // ✅ signature (dépend de React)
            id.includes('react-dropzone') ||            // ✅ upload (dépend de React)
            id.includes('@react')
          ) {
            return 'vendor-react';
          }

          // 📊 Graphiques
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }

          // 📄 Génération PDF (jspdf + pdf-lib + html2canvas)
          if (id.includes('jspdf') || id.includes('pdf-lib') || id.includes('html2canvas')) {
            return 'vendor-pdf';
          }

          // 📖 Lecture PDF
          if (id.includes('pdfjs-dist')) {
            return 'vendor-pdfjs';
          }

          // 🔍 OCR
          if (id.includes('tesseract')) {
            return 'vendor-ocr';
          }

          // 📊 Excel / CSV
          if (id.includes('xlsx') || id.includes('exceljs')) {
            return 'vendor-excel';
          }

          // 📦 Data utilities
          if (id.includes('papaparse') || id.includes('jszip')) {
            return 'vendor-data';
          }

          // 🔌 Appwrite
          if (id.includes('appwrite')) {
            return 'vendor-appwrite';
          }

          // 🎨 Icônes
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }

          // 📧 Email
          if (id.includes('@emailjs')) {
            return 'vendor-email';
          }

          // Le reste (petites libs)
          return 'vendor-misc';
        },
      },
    },
  },
});
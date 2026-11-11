import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // âœ… AJOUTÃ‰ : NÃ©cessaire pour les alias

export default defineConfig({
  server: {
    allowedHosts: [
      'rides-victoria-numerical-pieces.trycloudflare.com'
    ],
  },
  plugins: [react()],
  resolve: {
    alias: {
      // âœ… AJOUTÃ‰ : DÃ©finit l'alias "@" pour pointer vers le dossier "src"
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Augmenter le seuil d'alerte (les gros chunks PDF/Excel sont OK car chargÃ©s Ã  la demande)
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          // ðŸ§© Core React + libs UI qui en dÃ©pendent
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler') ||
            id.includes('sonner') ||                    // âœ… toasts (dÃ©pend de React)
            id.includes('react-signature-canvas') ||    // âœ… signature (dÃ©pend de React)
            id.includes('react-dropzone') ||            // âœ… upload (dÃ©pend de React)
            id.includes('@react')
          ) {
            return 'vendor-react';
          }

          // ðŸ“Š Graphiques
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }

          // ðŸ“„ GÃ©nÃ©ration PDF (jspdf + pdf-lib + html2canvas)
          if (id.includes('jspdf') || id.includes('pdf-lib') || id.includes('html2canvas')) {
            return 'vendor-pdf';
          }

          // ðŸ“– Lecture PDF
          if (id.includes('pdfjs-dist')) {
            return 'vendor-pdfjs';
          }

          // ðŸ” OCR
          if (id.includes('tesseract')) {
            return 'vendor-ocr';
          }

          // ðŸ“Š Excel / CSV
          if (id.includes('xlsx') || id.includes('exceljs')) {
            return 'vendor-excel';
          }

          // ðŸ“¦ Data utilities
          if (id.includes('papaparse') || id.includes('jszip')) {
            return 'vendor-data';
          }

          // ðŸ”Œ Appwrite
          if (id.includes('appwrite')) {
            return 'vendor-appwrite';
          }

          // ðŸŽ¨ IcÃ´nes
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }

          // ðŸ“§ Email
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

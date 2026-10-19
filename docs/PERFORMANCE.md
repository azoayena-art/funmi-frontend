\# Performance — décisions actées (16/10/2026)



\## Code splitting (vite.config.ts)

manualChunks : vendor-react / vendor-charts / vendor-pdf / vendor-pdfjs /

vendor-ocr / vendor-excel / vendor-data / vendor-appwrite / vendor-icons /

vendor-email / vendor-misc.

Résultat : bundle initial 4 006 kB → 119 kB (30,9 kB gzip).



\## Lazy loading (App.tsx)

Seules Login, Register, Dashboard sont statiques.

Toutes les autres pages en React.lazy + Suspense (PageLoadingFallback).



\## Requêtes Appwrite

Limites max : Dashboard/Statistics = 200, Reminders = 100, listes = 10/page.

Toujours Query.orderDesc('$createdAt') avec les limites.



\## Virtualisation : ANNULÉE

Toutes les listes paginent à 10/page → react-window inutile.

Ne pas réintroduire sans liste > 100 lignes rendues d'un coup.



\## Warning connu (acceptable)

facturxEmbedder importé dynamiquement (Invoices) et statiquement

(facturxParser) → chunk non séparé. Impact : pdfjs chargé avec ReceivedInvoices.


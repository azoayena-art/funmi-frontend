// scripts/cleanup-ghost-invoices.mjs
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const TEAM = process.argv[2] || '6ac4c02c00293611f4a1';

const GHOST_INVOICES = ['FAC-2026-001', 'FAC-2026-002'];

console.log('🧹 Nettoyage des factures orphelines...\n');

// 1. Trouver les factures orphelines
const allInvoices = [];
let offset = 0;
while (true) {
  const res = await db.listDocuments(DB, 'invoices', [
    Query.equal('teamId', TEAM),
    Query.limit(100),
    Query.offset(offset),
  ]);
  allInvoices.push(...res.documents);
  if (res.documents.length < 100) break;
  offset += 100;
}

const ghostDocs = allInvoices.filter(inv => GHOST_INVOICES.includes(inv.invoiceNumber));
console.log(`📋 ${ghostDocs.length} facture(s) orpheline(s) trouvée(s) :`);
ghostDocs.forEach(inv => {
  console.log(`  - ${inv.invoiceNumber} | ${inv.total} € | statut: ${inv.status}`);
});

// 2. Archiver ces factures
for (const inv of ghostDocs) {
  await db.updateDocument(DB, 'invoices', inv.$id, { status: 'cancelled' });
  console.log(`✅ Archivé ${inv.invoiceNumber}`);
}

// 3. Archiver les paiements associés
const allPayments = [];
offset = 0;
while (true) {
  const res = await db.listDocuments(DB, 'payments', [
    Query.equal('teamId', TEAM),
    Query.limit(100),
    Query.offset(offset),
  ]);
  allPayments.push(...res.documents);
  if (res.documents.length < 100) break;
  offset += 100;
}

const paymentsToArchive = allPayments.filter(p => 
  !p.isArchived && 
  p.linkedInvoiceId && 
  ghostDocs.some(g => g.$id === p.linkedInvoiceId)
);

console.log(`\n💰 ${paymentsToArchive.length} paiement(s) associé(s) à archiver :`);
for (const p of paymentsToArchive) {
  await db.updateDocument(DB, 'payments', p.$id, { isArchived: true });
  console.log(`✅ Archivé paiement ${p.$id} (${p.amountEur || p.amount} €)`);
}

// 4. Contrôle final
const finalPayments = allPayments.filter(p => !p.isArchived && !(paymentsToArchive.some(pa => pa.$id === p.$id)));
const inn = finalPayments.filter(p => p.type === 'in').reduce((s, p) => s + (p.amountEur || p.amount), 0);
const out = finalPayments.filter(p => p.type === 'out').reduce((s, p) => s + (p.amountEur || p.amount), 0);

console.log(`\n🎯 CONTRÔLE FINAL :`);
console.log(`   Encaissements : ${inn.toFixed(2)} € (attendu : 1254.00 €)`);
console.log(`   Décaissements : ${out.toFixed(2)} € (attendu : 7541.64 €)`);
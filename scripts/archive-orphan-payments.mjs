// scripts/archive-orphan-payments.mjs
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const TEAM = process.argv[2] || '6ac4c02c00293611f4a1';

const fetchAll = async (coll, q = []) => {
  let out = [], off = 0;
  for (;;) {
    const r = await db.listDocuments(DB, coll, [...q, Query.limit(100), Query.offset(off)]);
    out.push(...r.documents);
    if (r.documents.length < 100) break;
    off += 100;
  }
  return out;
};

const [payments, invoices] = await Promise.all([
  fetchAll('payments', [Query.equal('teamId', TEAM)]),
  fetchAll('invoices', [Query.equal('teamId', TEAM)]),
]);

const invById = new Map(invoices.map(i => [i.$id, i]));

console.log('='.repeat(90));
console.log('🧹 NETTOYAGE FINAL — Archivage des paiements orphelins');
console.log('='.repeat(90));

let archived = 0;
for (const p of payments) {
  if (p.isArchived || !p.linkedInvoiceId) continue;
  
  const inv = invById.get(p.linkedInvoiceId);
  if (!inv) {
    // Facture physiquement supprimée
    await db.updateDocument(DB, 'payments', p.$id, { isArchived: true });
    console.log(`🗄️ Archivé (facture supprimée) : ${p.$id} | ${p.amountEur || p.amount} € | ${p.description}`);
    archived++;
  } else if (inv.status === 'cancelled') {
    // Facture annulée
    await db.updateDocument(DB, 'payments', p.$id, { isArchived: true });
    console.log(`🗄️ Archivé (facture annulée) : ${p.$id} | ${p.amountEur || p.amount} € | ${p.description} → ${inv.invoiceNumber}`);
    archived++;
  }
}

console.log(`\n✅ ${archived} paiement(s) archivé(s)`);

// Contrôle final
const active = payments.filter(p => !p.isArchived);
const month = active.filter(p => (p.date || '').startsWith('2026-10'));
const inn = month.filter(p => p.type === 'in').reduce((s, p) => s + (p.amountEur ?? p.amount), 0);
const out = month.filter(p => p.type === 'out').reduce((s, p) => s + (p.amountEur ?? p.amount), 0);

console.log('\n' + '='.repeat(90));
console.log(`🎯 CONTRÔLE FINAL — Encaissements: ${inn.toFixed(2)} € | Décaissements: ${out.toFixed(2)} €`);
console.log(`   Attendu : 1254.00 € | 7541.64 €`);
console.log('='.repeat(90));
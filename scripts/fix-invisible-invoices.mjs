// scripts/fix-invisible-invoices.mjs
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const TEAM = process.argv[2] || '6ac4c02c00293611f4a1';
const RUN = process.argv.includes('--run');

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

const [invoices, payments, metadata] = await Promise.all([
  fetchAll('invoices', [Query.equal('teamId', TEAM)]),
  fetchAll('payments', [Query.equal('teamId', TEAM)]),
  fetchAll('invoice_metadata', [Query.equal('teamId', TEAM)]),
]);

const invById = new Map(invoices.map(i => [i.$id, i]));
const metaByInv = new Map(metadata.map(m => [m.invoiceId, m]));

console.log('='.repeat(90));
console.log('🔍 DIAGNOSTIC — Factures invisibles');
console.log('='.repeat(90));

// Lister toutes les factures avec leur statut
console.log('\n📋 Toutes les factures de l\'équipe :');
invoices.forEach(inv => {
  const meta = metaByInv.get(inv.$id);
  let archivedViaMeta = false;
  try {
    const archiveData = JSON.parse(meta?.archiveData || '{}');
    archivedViaMeta = archiveData.archived === true;
  } catch {}
  const isVisibleActive = inv.status !== 'cancelled' && !archivedViaMeta;
  const isVisibleArchived = inv.status === 'cancelled' || archivedViaMeta;
  const status = isVisibleActive ? '✅ ACTIVE' : isVisibleArchived ? '🗄️ ARCHIVÉE' : '❌ INVISIBLE';
  console.log(`  ${status} | ${inv.invoiceNumber} | statut: ${inv.status} | type: ${inv.type} | archivée via metadata: ${archivedViaMeta}`);
});

// Identifier les factures invisibles
const invisibleInvoices = invoices.filter(inv => {
  const meta = metaByInv.get(inv.$id);
  let archivedViaMeta = false;
  try {
    const archiveData = JSON.parse(meta?.archiveData || '{}');
    archivedViaMeta = archiveData.archived === true;
  } catch {}
  return inv.status !== 'cancelled' && !archivedViaMeta;
});

console.log(`\n❌ ${invisibleInvoices.length} facture(s) invisible(s) détectée(s)`);

// Identifier les paiements actifs liés à des factures invisibles
const activePayments = payments.filter(p => !p.isArchived && p.type === 'in');
const paymentsToArchive = activePayments.filter(p => {
  if (!p.linkedInvoiceId) return false;
  const inv = invById.get(p.linkedInvoiceId);
  if (!inv) return true; // Facture physiquement supprimée
  return invisibleInvoices.some(inv2 => inv2.$id === p.linkedInvoiceId);
});

console.log(`\n💰 ${paymentsToArchive.length} paiement(s) actif(s) lié(s) à des factures invisibles :`);
paymentsToArchive.forEach(p => {
  const inv = invById.get(p.linkedInvoiceId);
  console.log(`  🗑️ ${p.$id} | ${p.amountEur || p.amount} € | ${p.description} | Facture: ${inv?.invoiceNumber || 'SUPPRIMÉE'}`);
});

if (!RUN) {
  console.log('\nℹ️ DRY-RUN : relancez avec --run pour archiver ces paiements.');
  process.exit(0);
}

// Archiver les paiements
for (const p of paymentsToArchive) {
  await db.updateDocument(DB, 'payments', p.$id, { isArchived: true });
  console.log(`✅ Archivé ${p.$id}`);
}

// Contrôle final
const finalPayments = await fetchAll('payments', [Query.equal('teamId', TEAM)]);
const activeFinal = finalPayments.filter(p => !p.isArchived);
const inn = activeFinal.filter(p => p.type === 'in').reduce((s, p) => s + (p.amountEur || p.amount), 0);
const out = activeFinal.filter(p => p.type === 'out').reduce((s, p) => s + (p.amountEur || p.amount), 0);

console.log('\n' + '='.repeat(90));
console.log(`🎯 CONTRÔLE FINAL — Encaissements: ${inn.toFixed(2)} € | Décaissements: ${out.toFixed(2)} €`);
console.log(`   Attendu : 1254.00 € | 7541.64 €`);
console.log('='.repeat(90));
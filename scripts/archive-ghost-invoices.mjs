// scripts/archive-ghost-invoices.mjs
import { Client, Databases, Query, ID } from 'node-appwrite';

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

const metaByInv = new Map(metadata.map(m => [m.invoiceId, m]));
const invByNumber = new Map(invoices.map(i => [i.invoiceNumber, i]));

// Identifier les factures fantômes (FAC-001 et FAC-002)
const GHOST_INVOICES = ['FAC-2026-001', 'FAC-2026-002'];
const ghostsToArchive = GHOST_INVOICES
  .map(num => invByNumber.get(num))
  .filter(Boolean);

console.log('='.repeat(90));
console.log('👻 NETTOYAGE DES FACTURES FANTÔMES');
console.log('='.repeat(90));

if (ghostsToArchive.length === 0) {
  console.log('✅ Aucune facture fantôme trouvée.');
  process.exit(0);
}

console.log(`\n📋 ${ghostsToArchive.length} facture(s) fantôme(s) à archiver :`);
ghostsToArchive.forEach(g => {
  console.log(`  🗄️ ${g.invoiceNumber} | ${g.total} € | statut actuel: ${g.status}`);
});

// Identifier les paiements associés
const paymentsToArchive = payments.filter(p => {
  if (p.isArchived) return false;
  if (!p.linkedInvoiceId) return false;
  return ghostsToArchive.some(g => g.$id === p.linkedInvoiceId);
});

console.log(`\n💰 ${paymentsToArchive.length} paiement(s) associé(s) à archiver :`);
paymentsToArchive.forEach(p => {
  console.log(`  🗄️ ${p.$id} | ${p.amountEur || p.amount} € | ${p.description}`);
});

if (!RUN) {
  console.log('\nℹ️ DRY-RUN : relancez avec --run pour appliquer.');
  process.exit(0);
}

// Archiver les factures fantômes
for (const g of ghostsToArchive) {
  await db.updateDocument(DB, 'invoices', g.$id, { status: 'cancelled' });
  console.log(`✅ Facture ${g.invoiceNumber} annulée`);
  
  // Créer/mettre à jour les métadonnées d'archivage
  const existingMeta = metaByInv.get(g.$id);
  const archiveData = {
    archived: true,
    archivedAt: new Date().toISOString(),
    archiveReason: 'Facture remplacée par acompte + facture finale (doublon)',
  };
  
  if (existingMeta) {
    await db.updateDocument(DB, 'invoice_metadata', existingMeta.$id, {
      archiveData: JSON.stringify(archiveData),
      metadataVersion: (existingMeta.metadataVersion || 0) + 1,
    });
  } else {
    await db.createDocument(DB, 'invoice_metadata', ID.unique(), {
      teamId: TEAM,
      userId: g.userId || '6ac4d7fb002fac2a338b',
      invoiceId: g.$id,
      creditData: '{}',
      archiveData: JSON.stringify(archiveData),
      reconciliationData: '{}',
      metadataVersion: 1,
    });
  }
}

// Archiver les paiements associés
for (const p of paymentsToArchive) {
  await db.updateDocument(DB, 'payments', p.$id, { isArchived: true });
  console.log(`✅ Paiement ${p.$id} archivé (${p.amountEur || p.amount} €)`);
}

// Contrôle final
const finalPayments = await fetchAll('payments', [Query.equal('teamId', TEAM)]);
const activePayments = finalPayments.filter(p => !p.isArchived);
const inn = activePayments.filter(p => p.type === 'in').reduce((s, p) => s + (p.amountEur || p.amount), 0);
const out = activePayments.filter(p => p.type === 'out').reduce((s, p) => s + (p.amountEur || p.amount), 0);

console.log('\n' + '='.repeat(90));
console.log(`🎯 CONTRÔLE FINAL`);
console.log(`   Encaissements : ${inn.toFixed(2)} € (attendu : 1254.00 €)`);
console.log(`   Décaissements : ${out.toFixed(2)} € (attendu : 7541.64 €)`);
console.log('='.repeat(90));
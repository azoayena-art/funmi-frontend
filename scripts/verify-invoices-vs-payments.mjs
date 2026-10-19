// scripts/verify-invoices-vs-payments.mjs
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

const [invoices, payments, metadata] = await Promise.all([
  fetchAll('invoices', [Query.equal('teamId', TEAM)]),
  fetchAll('payments', [Query.equal('teamId', TEAM)]),
  fetchAll('invoice_metadata', [Query.equal('teamId', TEAM)]),
]);

// Filtrer les factures actives (non archivées)
const activeInvoices = invoices.filter(inv => {
  const meta = metadata.find(m => m.invoiceId === inv.$id);
  let archived = false;
  try {
    const archiveData = JSON.parse(meta?.archiveData || '{}');
    archived = archiveData.archived === true;
  } catch {}
  return inv.status !== 'cancelled' && !archived;
});

console.log('='.repeat(90));
console.log('📊 ANALYSE DES FACTURES CLIENTS ACTIVES');
console.log('='.repeat(90));

// Identifier les relations acomptes ↔ factures finales
const advanceInvoices = activeInvoices.filter(i => i.type === 'advance');
const finalInvoices = activeInvoices.filter(i => i.type === 'standard' || i.type === 'balance');

// Créer un mapping des acomptes vers leurs factures finales
const advanceToFinal = new Map();
finalInvoices.forEach(final => {
  if (final.originalInvoiceId) {
    const advance = advanceInvoices.find(a => a.$id === final.originalInvoiceId);
    if (advance) {
      advanceToFinal.set(advance.$id, final.$id);
    }
  }
});

console.log(`\n📋 Factures actives : ${activeInvoices.length}`);
console.log(`   - Standards/Balance : ${finalInvoices.length}`);
console.log(`   - Acomptes : ${advanceInvoices.length}`);
console.log(`   - Avoirs : ${activeInvoices.filter(i => i.type === 'credit').length}`);

console.log('\n' + '='.repeat(90));
console.log('💰 CALCUL DES ENCAISSEMENTS ATTENDUS');
console.log('='.repeat(90));

// Calculer les encaissements attendus
let expectedInflows = 0;
const invoiceDetails = [];

activeInvoices.forEach(inv => {
  if (inv.type === 'credit') return; // Les avoirs ne sont pas des encaissements
  
  // Si c'est un acompte qui a une facture finale, l'exclure (déjà compté dans la finale)
  if (inv.type === 'advance' && advanceToFinal.has(inv.$id)) {
    const finalId = advanceToFinal.get(inv.$id);
    const final = finalInvoices.find(f => f.$id === finalId);
    console.log(`  ℹ️ ${inv.invoiceNumber} (${inv.total}€) → Exclu (acompte de ${final?.invoiceNumber})`);
    return;
  }
  
  // Si c'est une facture standard/balance qui a un acompte, utiliser son total complet
  if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
    const advance = advanceInvoices.find(a => a.$id === inv.originalInvoiceId);
    if (advance && advanceToFinal.has(advance.$id)) {
      // Cette facture finale inclut déjà l'acompte dans son total
      console.log(`  ✅ ${inv.invoiceNumber} : ${inv.total}€ (inclut acompte ${advance.invoiceNumber} de ${advance.total}€)`);
    } else {
      console.log(`  ✅ ${inv.invoiceNumber} : ${inv.total}€`);
    }
  } else {
    console.log(`  ✅ ${inv.invoiceNumber} : ${inv.total}€`);
  }
  
  expectedInflows += inv.total || 0;
  invoiceDetails.push({
    number: inv.invoiceNumber,
    total: inv.total,
    type: inv.type,
  });
});

console.log(`\n💵 Encaissements attendus (factures actives) : ${expectedInflows.toFixed(2)} €`);

console.log('\n' + '='.repeat(90));
console.log('💸 ENCAISSEMENTS RÉELS (collection payments)');
console.log('='.repeat(90));

const activePayments = payments.filter(p => !p.isArchived);
const monthPayments = activePayments.filter(p => (p.date || '').startsWith('2026-10'));
const actualInflows = monthPayments
  .filter(p => p.type === 'in')
  .reduce((sum, p) => sum + (p.amountEur || p.amount), 0);

console.log(`\n💵 Encaissements réels (octobre 2026) : ${actualInflows.toFixed(2)} €`);
console.log(`   Nombre de paiements : ${monthPayments.filter(p => p.type === 'in').length}`);

console.log('\n' + '='.repeat(90));
console.log('📊 COMPARAISON');
console.log('='.repeat(90));

const diff = actualInflows - expectedInflows;
console.log(`\nAttendu : ${expectedInflows.toFixed(2)} €`);
console.log(`Réel    : ${actualInflows.toFixed(2)} €`);
console.log(`Écart   : ${diff.toFixed(2)} € ${diff >= 0 ? '(excédent)' : '(manquant)'}`);

if (Math.abs(diff) > 0.01) {
  console.log('\n⚠️ ÉCART DÉTECTÉ !');
  console.log('\nDétail des paiements dans la collection :');
  monthPayments
    .filter(p => p.type === 'in')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach(p => {
      console.log(`  ${p.date?.slice(0, 10)} | ${(p.amountEur || p.amount).toFixed(2).padStart(8)} € | ${p.description || 'N/A'}`);
    });
}

console.log('\n' + '='.repeat(90));
console.log('✅ VÉRIFICATION TERMINÉE');
console.log('='.repeat(90));
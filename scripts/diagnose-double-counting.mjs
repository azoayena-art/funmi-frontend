// scripts/diagnose-double-counting.mjs
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const TEAM = '6ac4c02c00293611f4a1';
const MONTH = '2026-10';

console.log('='.repeat(80));
console.log('🔍 DIAGNOSTIC DOUBLE COMPTAGE - TRÉSORERIE');
console.log('='.repeat(80));

// 1. Charger TOUS les documents payments
const allPayments = [];
let offset = 0;
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

console.log(`\n📊 Collection 'payments': ${allPayments.length} documents`);

// 2. Charger TOUTES les factures
const allInvoices = [];
offset = 0;
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

console.log(`📄 Collection 'invoices': ${allInvoices.length} documents`);

// 3. Extraire les paiements du JSON des factures
const invoicePayments = [];
for (const inv of allInvoices) {
  let pays = [];
  try {
    if (typeof inv.payments === 'string' && inv.payments.trim()) {
      pays = JSON.parse(inv.payments);
    } else if (Array.isArray(inv.payments)) {
      pays = inv.payments;
    }
  } catch { pays = []; }
  
  for (const p of pays) {
    if (p.date && p.date.startsWith(MONTH)) {
      invoicePayments.push({
        invoiceId: inv.$id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.type || 'standard',
        date: p.date,
        amount: p.amount || 0,
        method: p.method,
        reference: p.reference,
      });
    }
  }
}

console.log(`💰 Paiements dans JSON des factures (${MONTH}): ${invoicePayments.length}`);

// 4. Filtrer les documents payments du mois
const monthPayments = allPayments.filter(p => p.date && p.date.startsWith(MONTH));
console.log(`💸 Documents payments (${MONTH}): ${monthPayments.length}`);

// 5. Calculer les totaux
const paymentsIn = monthPayments.filter(p => p.type === 'in').reduce((s, p) => s + (p.amountEur || p.amount), 0);
const paymentsOut = monthPayments.filter(p => p.type === 'out').reduce((s, p) => s + (p.amountEur || p.amount), 0);

const jsonIn = invoicePayments.filter(p => p.type !== 'credit').reduce((s, p) => s + p.amount, 0);
const jsonOut = invoicePayments.filter(p => p.type === 'credit').reduce((s, p) => s + p.amount, 0);

console.log('\n' + '='.repeat(80));
console.log('📈 TOTAUX PAR SOURCE');
console.log('='.repeat(80));
console.log(`Collection 'payments':`);
console.log(`  Encaissements (type=in):  ${paymentsIn.toFixed(2)} €`);
console.log(`  Décaissements (type=out): ${paymentsOut.toFixed(2)} €`);
console.log(`\nJSON des factures:`);
console.log(`  Paiements clients:        ${jsonIn.toFixed(2)} €`);
console.log(`  Remboursements avoirs:    ${jsonOut.toFixed(2)} €`);
console.log(`\nSomme des deux sources (DOUBLE COMPTAGE):`);
console.log(`  Encaissements:            ${(paymentsIn + jsonIn).toFixed(2)} €`);
console.log(`  Décaissements:            ${(paymentsOut + jsonOut).toFixed(2)} €`);

// 6. Identifier les doublons potentiels
console.log('\n' + '='.repeat(80));
console.log('🔍 DÉTECTION DES DOUBLONS');
console.log('='.repeat(80));

const duplicates = [];
for (const doc of monthPayments) {
  const docAmount = doc.amountEur || doc.amount;
  const docDate = doc.date;
  const docDesc = (doc.description || '').toLowerCase();
  
  for (const jsonPay of invoicePayments) {
    if (Math.abs(docAmount - jsonPay.amount) < 0.01 && docDate === jsonPay.date) {
      if (docDesc.includes(jsonPay.invoiceNumber.toLowerCase()) || 
          docDesc.includes('facture') || 
          docDesc.includes('acompte') ||
          docDesc.includes('avoir')) {
        duplicates.push({
          paymentsDoc: doc,
          jsonPayment: jsonPay,
        });
      }
    }
  }
}

console.log(`\n⚠️  ${duplicates.length} doublons potentiels détectés:`);
duplicates.forEach((dup, i) => {
  console.log(`\n[${i+1}] DOUBLON:`);
  console.log(`  Collection payments:`);
  console.log(`    ID: ${dup.paymentsDoc.$id}`);
  console.log(`    Date: ${dup.paymentsDoc.date}`);
  console.log(`    Montant: ${dup.paymentsDoc.amountEur || dup.paymentsDoc.amount} €`);
  console.log(`    Type: ${dup.paymentsDoc.type}`);
  console.log(`    Description: ${dup.paymentsDoc.description || 'N/A'}`);
  console.log(`  JSON facture:`);
  console.log(`    Facture: ${dup.jsonPayment.invoiceNumber}`);
  console.log(`    Date: ${dup.jsonPayment.date}`);
  console.log(`    Montant: ${dup.jsonPayment.amount} €`);
  console.log(`    Type facture: ${dup.jsonPayment.type}`);
});

// 7. Détail des acomptes
console.log('\n' + '='.repeat(80));
console.log('💰 DÉTAIL DES ACOMPTES');
console.log('='.repeat(80));

const advanceInvoices = allInvoices.filter(i => i.type === 'advance');
console.log(`\nFactures d'acompte: ${advanceInvoices.length}`);
advanceInvoices.forEach(inv => {
  let pays = [];
  try {
    if (typeof inv.payments === 'string' && inv.payments.trim()) {
      pays = JSON.parse(inv.payments);
    } else if (Array.isArray(inv.payments)) {
      pays = inv.payments;
    }
  } catch { pays = []; }
  
  const totalPaid = pays.reduce((s, p) => s + (p.amount || 0), 0);
  console.log(`  ${inv.invoiceNumber}: Total=${inv.total}€ | Payé=${totalPaid}€ | Status=${inv.status}`);
  
  const matchingPayments = monthPayments.filter(p => 
    (p.description || '').toLowerCase().includes(inv.invoiceNumber.toLowerCase()) ||
    (p.description || '').toLowerCase().includes('acompte')
  );
  
  if (matchingPayments.length > 0) {
    console.log(`    ⚠️  Aussi dans collection payments:`);
    matchingPayments.forEach(mp => {
      console.log(`      - ${mp.$id}: ${mp.amountEur || mp.amount}€ le ${mp.date}`);
    });
  }
});

console.log('\n' + '='.repeat(80));
console.log('✅ DIAGNOSTIC TERMINÉ');
console.log('='.repeat(80));
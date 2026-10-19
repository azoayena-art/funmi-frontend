// scripts/fix-fac-2026-014-balance.mjs
// Correction du reste à payer pour FAC-2026-014
// Total: 20 000 F CFA | Acompte: 2 000 F CFA | Reste à payer: 18 000 F CFA

import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const APPLY = process.argv.includes('--apply');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n) => `${round2(n).toLocaleString('fr-FR')} F CFA`;

async function main() {
  console.log('\n🔧 Correction FAC-2026-014 - Reste à payer');
  console.log(`   Mode : ${APPLY ? '🔴 APPLY' : '🟢 DRY-RUN (simulation)'}\n`);

  if (!process.env.APPWRITE_API_KEY) {
    console.error('❌ APPWRITE_API_KEY manquante dans .env');
    process.exit(1);
  }

  // 1. Récupérer la facture
  const res = await db.listDocuments(DATABASE_ID, 'invoices', [
    Query.equal('invoiceNumber', 'FAC-2026-014'),
    Query.limit(1),
  ]);

  if (res.documents.length === 0) {
    console.error('❌ Facture FAC-2026-014 introuvable');
    process.exit(1);
  }

  const inv = res.documents[0];
  console.log(`📄 Facture : ${inv.invoiceNumber}`);
  console.log(`   Client : ${inv.clientName}`);
  console.log(`   Total TTC : ${fmt(inv.total || 0)}`);
  console.log(`   Acompte (deposit) : ${fmt(inv.deposit || 0)}`);
  console.log(`   Statut actuel : ${inv.status}`);
  console.log(`   Balance actuelle : ${fmt(inv.balance || 0)}`);
  console.log(`   PaidAmount actuel : ${fmt(inv.paidAmount || 0)}`);

  // 2. Parser les paiements
  let payments = [];
  try {
    if (typeof inv.payments === 'string' && inv.payments.trim()) {
      payments = JSON.parse(inv.payments);
    } else if (Array.isArray(inv.payments)) {
      payments = inv.payments;
    }
  } catch {
    payments = [];
  }

  console.log(`\n💰 Paiements enregistrés (${payments.length}) :`);
  payments.forEach((p, i) => {
    console.log(`   #${i + 1} : ${fmt(p.amount || 0)} le ${p.date} (${p.method || 'N/A'})`);
  });

  const totalPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const depositAmount = Number(inv.deposit) || 0;
  const invoiceTotal = Number(inv.total) || 0;

  console.log(`\n📊 Calculs :`);
  console.log(`   Total facture : ${fmt(invoiceTotal)}`);
  console.log(`   - Acompte : ${fmt(depositAmount)}`);
  console.log(`   = Reste à payer (attendu) : ${fmt(invoiceTotal - depositAmount)}`);
  console.log(`\n   Total payé (hors acompte) : ${fmt(totalPaid)}`);
  console.log(`   Balance actuelle : ${fmt(inv.balance || 0)}`);

  // 3. Calculer les valeurs correctes
  const expectedRemaining = Math.max(0, invoiceTotal - depositAmount - totalPaid);
  const expectedPaidAmount = depositAmount + totalPaid;
  const newStatus = expectedRemaining === 0 ? 'paid' : (expectedPaidAmount > 0 ? 'partial' : 'sent');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 APRÈS CORRECTION :`);
  console.log(`   Total facture : ${fmt(invoiceTotal)}`);
  console.log(`   Acompte déjà payé : ${fmt(depositAmount)}`);
  console.log(`   Paiements supplémentaires : ${fmt(totalPaid)}`);
  console.log(`   ─────────────────────`);
  console.log(`   Total reçu : ${fmt(expectedPaidAmount)}`);
  console.log(`   Balance (reste à payer) : ${fmt(expectedRemaining)}`);
  console.log(`   Nouveau statut : ${newStatus}`);
  console.log(`${'─'.repeat(60)}`);

  // Vérifier si des changements sont nécessaires
  const currentBalance = Number(inv.balance) || 0;
  const currentPaidAmount = Number(inv.paidAmount) || 0;
  
  const balanceChanged = Math.abs(currentBalance - expectedRemaining) > 0.01;
  const paidAmountChanged = Math.abs(currentPaidAmount - expectedPaidAmount) > 0.01;
  const statusChanged = inv.status !== newStatus;

  if (!balanceChanged && !paidAmountChanged && !statusChanged) {
    console.log('\n✅ La facture est déjà correcte. Rien à faire.');
    return;
  }

  if (!APPLY) {
    console.log('\n💡 Pour appliquer la correction :');
    console.log('   node scripts/fix-fac-2026-014-balance.mjs --apply\n');
    return;
  }

  // 4. Appliquer la correction
  console.log('\n🔄 Application de la correction...');
  try {
    const updateData = {
      balance: round2(expectedRemaining),
      paidAmount: round2(expectedPaidAmount),
      status: newStatus,
    };

    // Mettre à jour paidAt si la facture est totalement payée
    if (newStatus === 'paid' && !inv.paidAt) {
      updateData.paidAt = new Date().toISOString();
    }

    await db.updateDocument(DATABASE_ID, 'invoices', inv.$id, updateData);
    
    console.log('✅ Facture corrigée avec succès !');
    console.log(`   → Balance (reste à payer) : ${fmt(expectedRemaining)}`);
    console.log(`   → Total reçu : ${fmt(expectedPaidAmount)}`);
    console.log(`   → Statut : ${newStatus}\n`);
  } catch (e) {
    console.error(`❌ Erreur : ${e.message}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ Erreur fatale :', e.message);
  process.exit(1);
});
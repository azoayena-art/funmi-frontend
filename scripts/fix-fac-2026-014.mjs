// scripts/fix-fac-2026-014.mjs
// Correction ciblée de FAC-2026-014 : plafonner les paiements à 18 000 F CFA (reste après acompte)
//
// Usage :
//   node scripts/fix-fac-2026-014.mjs              # dry-run (simulation)
//   node scripts/fix-fac-2026-014.mjs --apply      # applique la correction

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
  console.log('\n🔧 Correction FAC-2026-014');
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

  const totalPaidBefore = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  console.log(`\n📊 Total payé actuel : ${fmt(totalPaidBefore)}`);
  console.log(`   Dépassement : ${fmt(Math.max(0, totalPaidBefore - (inv.total || 0)))}`);

  // 3. Plafonner les paiements au reste dû après acompte
  const invoiceTotal = Number(inv.total) || 0;
  const depositAmount = Number(inv.deposit) || 0;
  const maxAfterDeposit = Math.max(0, invoiceTotal - depositAmount);

  console.log(`\n🎯 Calcul du plafond :`);
  console.log(`   Total facture : ${fmt(invoiceTotal)}`);
  console.log(`   - Acompte déjà payé : ${fmt(depositAmount)}`);
  console.log(`   = Reste à payer : ${fmt(maxAfterDeposit)}`);

  let runningTotal = 0;
  const correctedPayments = [];
  let truncated = false;

  payments.forEach((p, idx) => {
    const paymentAmount = Number(p.amount) || 0;
    const room = Math.max(0, maxAfterDeposit - runningTotal);
    const allowed = Math.min(paymentAmount, room);

    if (allowed !== paymentAmount) {
      console.log(`\n   ⚠️  Paiement #${idx + 1} : ${fmt(paymentAmount)} → ${fmt(allowed)} (plafonné)`);
      truncated = true;
    }

    if (allowed > 0) {
      correctedPayments.push({ ...p, amount: round2(allowed) });
      runningTotal += allowed;
    }
  });

  const totalPaidAfter = round2(correctedPayments.reduce((s, p) => s + p.amount, 0));
  const totalReceived = round2(depositAmount + totalPaidAfter);
  const newBalance = round2(Math.max(0, invoiceTotal - totalReceived));
  const newStatus = newBalance === 0 ? 'paid' : (totalReceived > 0 ? 'partial' : 'sent');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 APRÈS CORRECTION :`);
  console.log(`   Total facture : ${fmt(invoiceTotal)}`);
  console.log(`   Acompte déjà payé : ${fmt(depositAmount)}`);
  console.log(`   Paiements corrigés : ${fmt(totalPaidAfter)}`);
  console.log(`   ─────────────────────`);
  console.log(`   Total reçu : ${fmt(totalReceived)}`);
  console.log(`   Balance restante : ${fmt(newBalance)}`);
  console.log(`   Nouveau statut : ${newStatus}`);
  console.log(`${'─'.repeat(60)}`);

  if (!truncated) {
    console.log('\n✅ Aucun paiement à plafonner. Rien à faire.');
    return;
  }

  if (!APPLY) {
    console.log('\n💡 Pour appliquer la correction :');
    console.log('   node scripts/fix-fac-2026-014.mjs --apply\n');
    return;
  }

  // 4. Appliquer la correction
  console.log('\n🔄 Application de la correction...');
  try {
    const updateData = {
      payments: JSON.stringify(correctedPayments),
      balance: newBalance,
      status: newStatus,
    };

    // Ne mettre à jour paidAt que si la facture est totalement payée
    if (newStatus === 'paid' && !inv.paidAt) {
      updateData.paidAt = new Date().toISOString();
    }

    await db.updateDocument(DATABASE_ID, 'invoices', inv.$id, updateData);
    
    console.log('✅ Facture corrigée avec succès !');
    console.log(`   → Total reçu : ${fmt(totalReceived)} (${fmt(depositAmount)} acompte + ${fmt(totalPaidAfter)} paiements)`);
    console.log(`   → Balance : ${fmt(newBalance)}`);
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
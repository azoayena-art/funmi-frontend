// scripts/cancel-payment-fac-2026-014.mjs
// Annulation du paiement de 18 000 F CFA du 2026-10-15 sur FAC-2026-014
//
// Usage :
//   node scripts/cancel-payment-fac-2026-014.mjs              # dry-run
//   node scripts/cancel-payment-fac-2026-014.mjs --apply      # applique

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
  console.log('\n🔧 Annulation paiement FAC-2026-014');
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
    console.log(`   #${i + 1} : ${fmt(p.amount || 0)} le ${p.date} (${p.method || 'N/A'}) ${p.reference ? `- réf: ${p.reference}` : ''}`);
  });

  // 3. Identifier le paiement à annuler : 18 000 F CFA du 2026-10-15
  const TARGET_AMOUNT = 18000;
  const TARGET_DATE = '2026-10-15';

  const targetIndex = payments.findIndex(p =>
    Math.abs(Number(p.amount) - TARGET_AMOUNT) < 0.01 &&
    p.date === TARGET_DATE
  );

  if (targetIndex === -1) {
    console.error(`\n❌ Aucun paiement de ${fmt(TARGET_AMOUNT)} à la date ${TARGET_DATE} trouvé`);
    process.exit(1);
  }

  const targetPayment = payments[targetIndex];
  console.log(`\n🎯 Paiement à annuler :`);
  console.log(`   Index : #${targetIndex + 1}`);
  console.log(`   Montant : ${fmt(targetPayment.amount)}`);
  console.log(`   Date : ${targetPayment.date}`);
  console.log(`   Méthode : ${targetPayment.method || 'N/A'}`);
  console.log(`   Référence : ${targetPayment.reference || 'N/A'}`);
  console.log(`   ID paiement : ${targetPayment.id || 'N/A'}`);

  // 4. Calculer les nouveaux états
  const remainingPayments = payments.filter((_, idx) => idx !== targetIndex);
  const totalPaidAfter = round2(remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const depositAmount = Number(inv.deposit) || 0;
  const invoiceTotal = Number(inv.total) || 0;
  const totalReceived = round2(depositAmount + totalPaidAfter);
  const newBalance = round2(Math.max(0, invoiceTotal - totalReceived));
  const newStatus = newBalance === 0 ? 'paid' : (totalReceived > 0 ? 'partial' : 'sent');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 APRÈS ANNULATION :`);
  console.log(`   Total facture : ${fmt(invoiceTotal)}`);
  console.log(`   Acompte (inchangé) : ${fmt(depositAmount)}`);
  console.log(`   Paiements restants : ${fmt(totalPaidAfter)} (${remainingPayments.length} paiement(s))`);
  console.log(`   ─────────────────────`);
  console.log(`   Total reçu : ${fmt(totalReceived)}`);
  console.log(`   Balance (reste à payer) : ${fmt(newBalance)}`);
  console.log(`   Nouveau statut : ${newStatus}`);
  console.log(`${'─'.repeat(60)}`);

  // 5. Chercher le mouvement de trésorerie associé
  let treasuryMovement = null;

  try {
    const treasuryRes = await db.listDocuments(DATABASE_ID, 'payments', [
      Query.equal('teamId', inv.teamId),
      Query.equal('amount', TARGET_AMOUNT),
      Query.equal('date', TARGET_DATE),
      Query.limit(20),
    ]);

    // Chercher celui qui référence cette facture
    treasuryMovement = treasuryRes.documents.find(doc =>
      doc.linkedInvoiceId === inv.$id ||
      (doc.description && doc.description.includes(inv.invoiceNumber)) ||
      (doc.reference && doc.reference === targetPayment.reference)
    );

    if (treasuryMovement) {
      console.log(`\n💼 Mouvement trésorerie associé trouvé :`);
      console.log(`   ID : ${treasuryMovement.$id}`);
      console.log(`   Montant : ${fmt(treasuryMovement.amount)}`);
      console.log(`   Label : ${treasuryMovement.label || treasuryMovement.description}`);
    } else {
      console.log(`\nℹ️ Aucun mouvement trésorerie associé trouvé`);
    }
  } catch (e) {
    console.warn(`⚠️ Recherche mouvement trésorerie : ${e.message}`);
  }

  if (!APPLY) {
    console.log('\n💡 Pour appliquer l\'annulation :');
    console.log('   node scripts/cancel-payment-fac-2026-014.mjs --apply\n');
    return;
  }

  // 6. Appliquer les modifications
  console.log('\n🔄 Application de l\'annulation...');

  try {
    // ✅ CORRECTION : Utilisation uniquement des attributs existants
    const updateData = {
      payments: JSON.stringify(remainingPayments),
      balance: newBalance,
      status: newStatus,
    };

    // Retirer paidAt si la facture n'est plus totalement payée
    if (newStatus !== 'paid' && inv.paidAt) {
      updateData.paidAt = null;
    }

    await db.updateDocument(DATABASE_ID, 'invoices', inv.$id, updateData);
    console.log(`✅ Facture mise à jour`);

    // Supprimer le mouvement de trésorerie associé
    if (treasuryMovement) {
      try {
        await db.deleteDocument(DATABASE_ID, 'payments', treasuryMovement.$id);
        console.log(`✅ Mouvement trésorerie supprimé (${treasuryMovement.$id})`);
      } catch (e) {
        console.warn(`⚠️ Impossible de supprimer le mouvement trésorerie : ${e.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ANNULATION TERMINÉE AVEC SUCCÈS');
    console.log('='.repeat(60));
    console.log(`\n📊 État final de la facture :`);
    console.log(`   Total : ${fmt(invoiceTotal)}`);
    console.log(`   Acompte payé : ${fmt(depositAmount)}`);
    console.log(`   Paiements supplémentaires : ${fmt(totalPaidAfter)}`);
    console.log(`   Reste à payer : ${fmt(newBalance)}`);
    console.log(`   Statut : ${newStatus}\n`);

  } catch (e) {
    console.error(`❌ Erreur : ${e.message}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ Erreur fatale :', e.message);
  process.exit(1);
});
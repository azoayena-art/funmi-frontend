// scripts/regularize-overpayments.mjs
// 🧾 Détecte et régularise les trop-perçus sur les factures
// Un trop-perçu = somme des paiements > total de la facture
//
// ⚠️ Mode DRY-RUN par défaut (aucune écriture). Ajouter --apply pour exécuter.
//
// Usage :
//   node scripts/regularize-overpayments.mjs                          # dry-run toutes factures
//   node scripts/regularize-overpayments.mjs --apply                  # régularise toutes
//   node scripts/regularize-overpayments.mjs --invoice FAC-2026-014   # dry-run une facture
//   node scripts/regularize-overpayments.mjs --invoice FAC-2026-014 --apply
//   node scripts/regularize-overpayments.mjs --team 6ac4c0... --apply # filtre par équipe

import { Client, Databases, Query, ID } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const API_KEY = process.env.APPWRITE_API_KEY;

// Arguments CLI
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const invoiceArg = args.includes('--invoice') ? args[args.indexOf('--invoice') + 1] : null;
const teamArg = args.includes('--team') ? args[args.indexOf('--team') + 1] : null;

if (!API_KEY) {
  console.error('❌ APPWRITE_API_KEY manquante dans .env');
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ============================================================
// 🧩 HELPERS
// ============================================================
const parsePayments = (raw) => {
  if (!raw) return [];
  try {
    if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw);
    if (Array.isArray(raw)) return raw;
  } catch { /* ignore */ }
  return [];
};

const fmt = (n, cur) => `${round2(n).toLocaleString('fr-FR')} ${cur || ''}`.trim();

// Récupère toutes les factures (pagination complète)
async function fetchAllInvoices() {
  const all = [];
  const LIMIT = 100;
  let offset = 0;
  while (true) {
    const queries = [Query.limit(LIMIT), Query.offset(offset)];
    if (teamArg) queries.unshift(Query.equal('teamId', teamArg));
    const res = await db.listDocuments(DATABASE_ID, 'invoices', queries);
    all.push(...res.documents);
    if (res.documents.length < LIMIT) break;
    offset += LIMIT;
  }
  return all;
}

// Trace un événement comptable (piste d'audit)
async function traceOverpayment(inv, overpayment, currency) {
  await db.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
    teamId: inv.teamId,
    data: JSON.stringify({
      type: 'overpayment_regularized',
      documentType: 'invoice',
      documentId: inv.$id,
      documentNumber: inv.invoiceNumber,
      clientName: inv.clientName || '',
      total: inv.total || 0,
      totalPaid: round2(parsePayments(inv.payments).reduce((s, p) => s + (Number(p.amount) || 0), 0)),
      overpayment,
      currency,
      eventDate: new Date().toISOString(),
      action: 'balance_capped_to_zero',
      recommendation: 'Rembourser le client OU imputer sur une prochaine facture',
      createdBy: 'regularize-overpayments-script',
    }),
  });
}

// ============================================================
// 🚀 MAIN
// ============================================================
async function main() {
  console.log(`\n🧾 Régularisation des trop-perçus`);
  console.log(`   Mode : ${APPLY ? '🔴 APPLY (écriture réelle)' : '🟢 DRY-RUN (simulation)'}`);
  if (invoiceArg) console.log(`   Cible : facture ${invoiceArg}`);
  if (teamArg) console.log(`   Équipe : ${teamArg}`);
  console.log('');

  let invoices = await fetchAllInvoices();
  if (invoiceArg) {
    invoices = invoices.filter(i => i.invoiceNumber === invoiceArg);
  }
  console.log(`📋 ${invoices.length} facture(s) analysée(s)\n`);

  const overpaid = [];

  for (const inv of invoices) {
    const total = Number(inv.total) || 0;
    const payments = parsePayments(inv.payments);
    const totalPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const currency = inv.currencyCode || inv.currency || 'EUR';

    if (totalPaid > total + 0.01) {
      overpaid.push({ inv, total, totalPaid, overpayment: round2(totalPaid - total), currency });
    }
  }

  if (overpaid.length === 0) {
    console.log('✅ Aucun trop-perçu détecté. Rien à régulariser.\n');
    return;
  }

  console.log(`⚠️ ${overpaid.length} trop-perçu(s) détecté(s) :\n`);
  console.log('─'.repeat(80));

  for (const { inv, total, totalPaid, overpayment, currency } of overpaid) {
    console.log(`📄 ${inv.invoiceNumber} — ${inv.clientName || 'Client inconnu'}`);
    console.log(`   Total facture : ${fmt(total, currency)}`);
    console.log(`   Total payé    : ${fmt(totalPaid, currency)}`);
    console.log(`   💥 Trop-perçu : ${fmt(overpayment, currency)}`);
    console.log(`   Statut actuel : ${inv.status} | Balance : ${inv.balance}`);

    if (APPLY) {
      try {
        // 1. Plafonner balance à 0 + statut paid
        const lastPaymentDate = parsePayments(inv.payments)
          .map(p => p.date)
          .filter(Boolean)
          .sort()
          .pop();

        await db.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
          balance: 0,
          status: 'paid',
          paidAt: inv.paidAt || lastPaymentDate || new Date().toISOString().split('T')[0],
        });

        // 2. Tracer dans accounting_events
        await traceOverpayment(inv, overpayment, currency);

        console.log(`   ✅ Régularisée (balance=0, statut=paid, événement tracé)`);
      } catch (e) {
        console.log(`   ❌ Erreur : ${e.message}`);
      }
    } else {
      console.log(`   ⏭️  (dry-run — aucune écriture)`);
    }
    console.log('─'.repeat(80));
  }

  console.log(`\n📊 Récapitulatif :`);
  console.log(`   Factures en trop-perçu : ${overpaid.length}`);
  console.log(`   Montant total à traiter : ${fmt(overpaid.reduce((s, o) => s + o.overpayment, 0))}`);
  console.log('');

  if (!APPLY) {
    console.log(`💡 Pour appliquer réellement :`);
    console.log(`   node scripts/regularize-overpayments.mjs --apply`);
    if (invoiceArg) console.log(`   node scripts/regularize-overpayments.mjs --invoice ${invoiceArg} --apply`);
    console.log('');
  }

  console.log(`⚠️  RAPPEL : le trop-perçu doit ensuite être traité manuellement :`);
  console.log(`   • Rembourser le client (mouvement de trésorerie "Remboursement client")`);
  console.log(`   • OU l'imputer sur une prochaine facture de ce client`);
  console.log(`   Consultez la collection "accounting_events" (type=overpayment_regularized) pour la trace.\n`);
}

main().catch(e => {
  console.error('❌ Erreur fatale :', e.message);
  process.exit(1);
});
// scripts/backfill-supplier-payments.mjs
// 🎯 Objectif : recréer dans `payments` (journal de trésorerie) les règlements
//    historiquement enregistrés uniquement sur les factures (clients + fournisseurs).
//    Idempotent : ne crée jamais de doublon (clé = teamId + libellé + date + montant).
import { Client, Databases, ID, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db'; // ← doit matcher src/appwrite.ts

const METHOD_MAP = {
  'Virement bancaire': 'bank_transfer', 'Chèque': 'check', 'Carte bancaire': 'credit_card',
  'Prélèvement SEPA': 'sepa_direct_debit', 'Espèces': 'cash',
  'PayPal': 'paypal', 'Stripe': 'stripe',
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const parsePayments = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
};

const guessUserId = (doc) => {
  if (doc.userId) return doc.userId;
  const perm = (doc.$permissions || []).find(p => typeof p === 'string' && p.startsWith('update("user:'));
  return perm ? perm.slice(13, -2) : undefined;
};

// ---------- 1. Charge tous les mouvements `payments` existants (anti-doublon) ----------
const key = (teamId, desc, date, amount) =>
  `${teamId}|${desc}|${date}|${Math.round(round2(amount) * 100)}`;

const existing = new Set();
let offset = 0;
while (true) {
  const res = await db.listDocuments(DB, 'payments', [Query.limit(100), Query.offset(offset)]);
  res.documents.forEach(d => existing.add(key(d.teamId, d.description, d.date, d.amountEur || d.amount)));
  if (res.documents.length < 100) break;
  offset += 100;
  if (offset > 10000) break;
}
console.log(`📦 ${existing.size} mouvement(s) déjà présent(s) dans payments`);

// ---------- 2. Création tolérante (schéma sans champs liés = retry sans ces champs) ----------
const createPayment = async (payload) => {
  try {
    return await db.createDocument(DB, 'payments', ID.unique(), payload);
  } catch (e) {
    if (e?.type === 'structure_unknown_attribute') {
      const clean = { ...payload };
      delete clean.linkedInvoiceId;
      delete clean.linkedReceivedInvoiceId;
      if (clean.userId === undefined || clean.userId === null) delete clean.userId;
      return await db.createDocument(DB, 'payments', ID.unique(), clean);
    }
    throw e;
  }
};

let created = 0, skipped = 0, failed = 0;

// ---------- 3. Factures FOURNISSEURS → décaissements ----------
const recv = await db.listDocuments(DB, 'received_invoices', [Query.limit(500)]);
for (const inv of recv.documents) {
  for (const p of parsePayments(inv.payments)) {
    const description = `Paiement facture ${inv.invoiceNumber} — ${inv.supplierName}`;
    const k = key(inv.teamId, description, p.date, p.amount);
    if (existing.has(k)) { skipped++; continue; }
    try {
      await createPayment({
        teamId: inv.teamId,
        userId: guessUserId(inv),
        type: 'out',
        category: 'supplier_payment',
        amount: p.amount,
        currencyCode: inv.currencyCode || 'EUR',
        exchangeRate: 1,
        amountEur: p.amount,
        date: p.date,
        method: METHOD_MAP[p.method] || 'other',
        description,
        counterpartyName: inv.supplierName || null,
        linkedInvoiceId: null,
        linkedReceivedInvoiceId: inv.$id,
        reference: p.reference || null,
        vatAmount: 0, vatRate: 0,
        isReconciled: false, isRecurring: false, isArchived: false,
      });
      existing.add(k); created++;
      console.log(`✅ [Fournisseur] ${inv.invoiceNumber} • ${p.date} • ${p.amount}`);
    } catch (e) {
      failed++;
      console.error(`❌ [Fournisseur] ${inv.invoiceNumber} : ${e.message}`);
    }
  }
}

// ---------- 4. Factures CLIENTS → encaissements ----------
const cli = await db.listDocuments(DB, 'invoices', [Query.limit(500)]);
for (const inv of cli.documents) {
  if (inv.type === 'credit' || inv.status === 'draft') continue; // avoirs & brouillons exclus
  for (const p of parsePayments(inv.payments)) {
    const description = `Encaissement facture ${inv.invoiceNumber} — ${inv.clientName || ''}`.trim();
    const k = key(inv.teamId, description, p.date, p.amount);
    if (existing.has(k)) { skipped++; continue; }
    try {
      await createPayment({
        teamId: inv.teamId,
        userId: guessUserId(inv),
        type: 'in',
        category: inv.type === 'advance' ? 'client_advance' : 'client_payment',
        amount: p.amount,
        currencyCode: inv.currencyCode || 'EUR',
        exchangeRate: 1,
        amountEur: p.amount,
        date: p.date,
        method: METHOD_MAP[p.method] || 'other',
        description,
        counterpartyName: inv.clientName || null,
        linkedInvoiceId: inv.$id,
        linkedReceivedInvoiceId: null,
        reference: p.reference || null,
        vatAmount: 0, vatRate: 0,
        isReconciled: false, isRecurring: false, isArchived: false,
      });
      existing.add(k); created++;
      console.log(`✅ [Client] ${inv.invoiceNumber} • ${p.date} • ${p.amount}`);
    } catch (e) {
      failed++;
      console.error(`❌ [Client] ${inv.invoiceNumber} : ${e.message}`);
    }
  }
}

console.log(`\n🎉 Backfill terminé : ${created} créé(s), ${skipped} déjà présent(s), ${failed} échec(s)`);
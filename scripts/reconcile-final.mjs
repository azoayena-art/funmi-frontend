// scripts/reconcile-final.mjs
import { Client, Databases, Query, Permission, Role, ID } from 'node-appwrite';

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
const pays = raw => { try { return typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []); } catch { return []; } };
const cents = n => Math.round((Number(n) || 0) * 100);

const [payments, invoices, received, metadata] = await Promise.all([
  fetchAll('payments', [Query.equal('teamId', TEAM)]),
  fetchAll('invoices', [Query.equal('teamId', TEAM)]),
  fetchAll('received_invoices', [Query.equal('teamId', TEAM)]),
  fetchAll('invoice_metadata', [Query.equal('teamId', TEAM)]),
]);

const invById = new Map(invoices.map(i => [i.$id, i]));
const recById = new Map(received.map(i => [i.$id, i]));
const metaByInv = new Map(metadata.map(m => [m.invoiceId, m]));

// ✅ RÉCUPÉRER UN userId VALIDE (depuis les documents existants ou variable d'env)
let validUserId = process.env.USER_ID;
if (!validUserId) {
  const firstWithUser = payments.find(p => p.userId);
  if (firstWithUser) validUserId = firstWithUser.userId;
}
if (!validUserId) {
  console.error('❌ Aucun userId valide trouvé. Passez USER_ID=... en variable d\'environnement.');
  process.exit(1);
}
console.log(`👤 Utilisation du userId: ${validUserId}`);

console.log('='.repeat(90));
console.log('🔎 AUDIT LIGNE PAR LIGNE — collection payments');
console.log('='.repeat(90));

const toArchive = [];
for (const p of payments) {
  if (p.isArchived) continue;
  let flag = '';
  if (p.linkedInvoiceId) {
    const inv = invById.get(p.linkedInvoiceId);
    if (!inv) flag = '⚠️ facture introuvable';
    else if (inv.status === 'cancelled') flag = `🗄️ facture annulée (${inv.invoiceNumber})`;
    else if (inv.type === 'advance') {
      const hasFinal = invoices.some(f => f.originalInvoiceId === inv.$id && (f.type === 'standard' || f.type === 'balance'));
      if (hasFinal) flag = `🔁 acompte déjà inclus dans la facture finale (${inv.invoiceNumber})`;
    }
  }
  if (p.linkedReceivedInvoiceId && !recById.get(p.linkedReceivedInvoiceId)) flag = '⚠️ facture fournisseur introuvable';
  const line = `${p.date?.slice(0,10)} | ${p.type === 'in' ? 'ENTRÉE ' : 'SORTIE'} | ${(p.amountEur ?? p.amount).toFixed(2).padStart(9)} € | ${p.description || p.category}`;
  console.log(flag ? `${line}  →  ${flag}` : line);
  if (flag) toArchive.push({ doc: p, reason: flag });
}

const missingOut = [];
for (const inv of invoices) {
  if (inv.type !== 'credit') continue;
  const meta = metaByInv.get(inv.$id);
  let credit = {};
  try { credit = JSON.parse(meta?.creditData || '{}'); } catch {}
  for (const r of (credit.refundPayments || [])) {
    const exists = payments.some(p => p.type === 'out' && p.category === 'client_refund'
      && cents(p.amountEur ?? p.amount) === cents(r.amount) && (p.date || '').slice(0, 10) === (r.date || '').slice(0, 10));
    if (!exists) missingOut.push({ invoice: inv, refund: r });
  }
}

const missingSupplier = [];
for (const inv of received) {
  for (const sp of pays(inv.payments)) {
    const exists = payments.some(p => p.type === 'out' && p.linkedReceivedInvoiceId === inv.$id
      && cents(p.amountEur ?? p.amount) === cents(sp.amount) && (p.date || '').slice(0, 10) === (sp.date || '').slice(0, 10));
    if (!exists) missingSupplier.push({ invoice: inv, payment: sp });
  }
}

console.log('\n' + '='.repeat(90));
console.log(`📋 SYNTHÈSE : ${toArchive.length} mouvement(s) à archiver, ${missingOut.length} remboursement(s) à créer, ${missingSupplier.length} paiement(s) fournisseur à recréer`);
console.log('='.repeat(90));
toArchive.forEach(a => console.log(`  🗄️ ${a.doc.$id} — ${a.reason}`));
missingOut.forEach(m => console.log(`  ➕ OUT ${m.refund.amount} € — remboursement avoir ${m.invoice.invoiceNumber} du ${m.refund.date}`));
missingSupplier.forEach(m => console.log(`  ➕ OUT ${m.payment.amount} € — paiement ${m.invoice.invoiceNumber} du ${m.payment.date}`));

if (!RUN) { console.log('\nℹ️ DRY-RUN : relancez avec --run pour appliquer.'); process.exit(0); }

let native = process.env.NATIVE_TEAM_ID || '';
if (!native) {
  for (const name of ['teams', 'custom_teams', 'team_members']) {
    try {
      const docs = await fetchAll(name);
      const hit = docs.find(d => (d.teamId || d.$id) === TEAM && d.appwriteTeamId);
      if (hit) { native = hit.appwriteTeamId; break; }
    } catch {}
  }
}
const perms = native ? [Permission.read(Role.team(native)), Permission.update(Role.team(native)), Permission.delete(Role.team(native))] : undefined;

for (const a of toArchive) {
  await db.updateDocument(DB, 'payments', a.doc.$id, { isArchived: true });
  console.log(`✅ Archivé ${a.doc.$id} (${a.reason})`);
}

for (const m of missingOut) {
  await db.createDocument(DB, 'payments', ID.unique(), {
    teamId: TEAM,
    userId: validUserId, // ✅ AJOUTÉ
    type: 'out', 
    category: 'client_refund',
    amount: m.refund.amount, 
    currencyCode: 'EUR', 
    exchangeRate: 1, 
    amountEur: m.refund.amount,
    date: (m.refund.date || '').slice(0, 10), 
    method: 'other',
    description: `Remboursement avoir ${m.invoice.invoiceNumber} — ${m.invoice.clientName || ''}`.trim(),
    counterpartyName: m.invoice.clientName || null,
    linkedInvoiceId: m.invoice.$id, 
    linkedReceivedInvoiceId: null,
    vatAmount: 0, 
    vatRate: 0, 
    isReconciled: false, 
    isRecurring: false, 
    isArchived: false,
  }, perms);
  console.log(`✅ Créé décaissement remboursement ${m.invoice.invoiceNumber}`);
}

for (const m of missingSupplier) {
  await db.createDocument(DB, 'payments', ID.unique(), {
    teamId: TEAM,
    userId: validUserId, // ✅ AJOUTÉ
    type: 'out', 
    category: 'supplier_payment',
    amount: m.payment.amount, 
    currencyCode: 'EUR', 
    exchangeRate: 1, 
    amountEur: m.payment.amount,
    date: (m.payment.date || '').slice(0, 10), 
    method: 'other',
    description: `Paiement facture ${m.invoice.invoiceNumber} — ${m.invoice.supplierName || ''}`.trim(),
    counterpartyName: m.invoice.supplierName || null,
    linkedInvoiceId: null, 
    linkedReceivedInvoiceId: m.invoice.$id,
    vatAmount: 0, 
    vatRate: 0, 
    isReconciled: false, 
    isRecurring: false, 
    isArchived: false,
  }, perms);
  console.log(`✅ Créé paiement fournisseur ${m.invoice.invoiceNumber}`);
}
console.log('\n🎉 Réconciliation appliquée. Rechargez /treasury (Ctrl+Shift+R).');
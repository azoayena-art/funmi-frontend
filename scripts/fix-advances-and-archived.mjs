// scripts/fix-advances-and-archived.mjs
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

const [payments, invoices, metadata] = await Promise.all([
  fetchAll('payments', [Query.equal('teamId', TEAM)]),
  fetchAll('invoices', [Query.equal('teamId', TEAM)]),
  fetchAll('invoice_metadata', [Query.equal('teamId', TEAM)]),
]);

const invById = new Map(invoices.map(i => [i.$id, i]));
const archivedInvIds = new Set();
for (const m of metadata) {
  let data = {};
  try { data = JSON.parse(m.archiveData || '{}'); } catch {}
  if (data.archived === true) archivedInvIds.add(m.invoiceId);
}
for (const i of invoices) if (i.status === 'cancelled') archivedInvIds.add(i.$id);

// 1️⃣ RESTAURER les acomptes (vrais encaissements partiels)
const ADVANCE_DOCS = ['6ac7e90d0032c64b5785', '6ac803ff001c4c5f56f3'];
for (const id of ADVANCE_DOCS) {
  await db.updateDocument(DB, 'payments', id, { isArchived: false });
  console.log(`✅ Acompte restauré : ${id}`);
}

// 2️⃣ ARCHIVER les mouvements liés à des factures archivées/annulées
for (const p of payments) {
  if (p.isArchived || !p.linkedInvoiceId) continue;
  if (archivedInvIds.has(p.linkedInvoiceId)) {
    await db.updateDocument(DB, 'payments', p.$id, { isArchived: true });
    console.log(`🗄️ Archivé (facture archivée) : ${p.$id} | ${(p.amountEur ?? p.amount)} € | ${p.description}`);
  }
}

// 3️⃣ Contrôle final
const active = (await fetchAll('payments', [Query.equal('teamId', TEAM)])).filter(p => !p.isArchived);
const month = active.filter(p => (p.date || '').startsWith('2026-10'));
const inn = month.filter(p => p.type === 'in').reduce((s, p) => s + (p.amountEur ?? p.amount), 0);
const out = month.filter(p => p.type === 'out').reduce((s, p) => s + (p.amountEur ?? p.amount), 0);
console.log(`\n🎯 CONTRÔLE FINAL — Encaissements: ${inn.toFixed(2)} € | Décaissements: ${out.toFixed(2)} €`);
console.log(`   Attendu : 1254.00 € | 7541.64 €`);
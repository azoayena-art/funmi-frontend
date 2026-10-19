// scripts/verify-treasury.mjs — Imprime les sommes EXACTES que Trésorerie doit afficher
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const MONTH = new Date().toISOString().slice(0, 7);
const TEAM = process.argv[2]; // ex: node scripts/verify-treasury.mjs 6ac4c02c00293611f4a1

const fetchAll = async (coll, queries = []) => {
  let out = [], offset = 0;
  for (;;) {
    const res = await db.listDocuments(DB, coll, [...queries, Query.limit(100), Query.offset(offset)]);
    out.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return out;
};

const pays = raw => { try { return typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []); } catch { return []; } };

const payments = await fetchAll('payments', TEAM ? [Query.equal('teamId', TEAM)] : []);
const clientInvs = await fetchAll('invoices', TEAM ? [Query.equal('teamId', TEAM)] : []);
const supplierInvs = await fetchAll('received_invoices', TEAM ? [Query.equal('teamId', TEAM)] : []);

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

// Source A : collection payments (LE journal de trésorerie)
const payIn  = sum(payments.filter(p => p.type === 'in'  && (p.date || '').startsWith(MONTH)), p => p.amountEur || p.amount);
const payOut = sum(payments.filter(p => p.type === 'out' && (p.date || '').startsWith(MONTH)), p => p.amountEur || p.amount);

// Source B : JSON payments des factures (mémoire des règlements)
const jsonIn  = sum(clientInvs,   i => sum(pays(i.payments).filter(p => (p.date || '').startsWith(MONTH)), p => p.amount || 0));
const jsonOut = sum(supplierInvs, i => sum(pays(i.payments).filter(p => (p.date || '').startsWith(MONTH)), p => p.amount || 0));

console.log(`\n===== ÉQUIPE ${TEAM || '(toutes)'} • MOIS ${MONTH} =====`);
console.log(`A) Collection payments  → ENCAISSÉ : ${payIn.toFixed(2)} € | DÉCAISSÉ : ${payOut.toFixed(2)} €  (${payments.length} docs)`);
console.log(`B) JSON des factures    → ENCAISSÉ : ${jsonIn.toFixed(2)} € | DÉCAISSÉ : ${jsonOut.toFixed(2)} €`);
console.log(`A+B (DOUBLE COMPPTAGE)  → ENCAISSÉ : ${(payIn + jsonIn).toFixed(2)} € | DÉCAISSÉ : ${(payOut + jsonOut).toFixed(2)} €`);
console.log(`\n✅ VALEURS ATTENDUES À L'ÉCRAN = ligne A uniquement.`);
console.log(`⚠️  Si ton écran affiche la ligne A+B → ton Treasury.tsx additionne encore les 2 sources.`);
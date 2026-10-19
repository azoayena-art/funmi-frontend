// scripts/fix-overpayment.mjs
// Correction ciblée de FAC-2026-014 : plafonner à 20 000
import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);

async function main() {
  const res = await db.listDocuments(
    process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db',
    'invoices',
    [Query.equal('invoiceNumber', 'FAC-2026-014'), Query.limit(1)]
  );
  
  if (res.documents.length === 0) { console.log('Facture introuvable'); return; }
  const inv = res.documents[0];
  
  let payments = [];
  try { payments = JSON.parse(inv.payments || '[]'); } catch {}
  
  console.log(`Facture : ${inv.invoiceNumber}`);
  console.log(`Total : ${inv.total} F CFA`);
  console.log(`Paiements actuels :`, payments);
  console.log(`Total payé actuel : ${payments.reduce((s,p) => s + (p.amount||0), 0)}`);
  
  // Plafonner le dernier paiement à la somme restante
  let runningTotal = 0;
  const correctedPayments = payments.map((p, idx) => {
    const room = Math.max(0, inv.total - runningTotal);
    const allowed = Math.min(p.amount || 0, room);
    runningTotal += allowed;
    if (allowed !== p.amount) {
      console.log(`   Paiement #${idx+1} : ${p.amount} → ${allowed} (plafonné)`);
    }
    return { ...p, amount: allowed };
  }).filter(p => p.amount > 0);
  
  const newTotal = correctedPayments.reduce((s,p) => s + p.amount, 0);
  console.log(`\nNouveau total payé : ${newTotal}`);
  
  await db.updateDocument(
    process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db',
    'invoices',
    inv.$id,
    {
      payments: JSON.stringify(correctedPayments),
      balance: 0,
      status: 'paid',
    }
  );
  console.log('✅ Facture corrigée');
}

main().catch(e => { console.error(e.message); process.exit(1); });
// scripts/migrate-invoice-status.mjs
import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  const res = await db.listDocuments(DATABASE_ID, 'invoices', [
    Query.equal('status', 'draft'),
    Query.limit(500),
  ]);
  console.log(`📋 ${res.documents.length} facture(s) en brouillon trouvée(s)`);

  for (const inv of res.documents) {
    // Ne migrer que les factures issues d'une conversion (liées à un devis ou un acompte)
    if (inv.quoteId || inv.originalQuoteId || inv.originalInvoiceId) {
      await db.updateDocument(DATABASE_ID, 'invoices', inv.$id, { status: 'invoiced' });
      console.log(`  ✅ ${inv.invoiceNumber} → Facturé`);
    } else {
      console.log(`  ⏭️ ${inv.invoiceNumber} ignorée (vrai brouillon)`);
    }
  }
  console.log('\n🎉 Migration terminée !');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
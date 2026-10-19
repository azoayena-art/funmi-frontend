// scripts/create-test-invoice.mjs
import { Client, Databases, ID, Query } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
const API_KEY     = process.env.APPWRITE_API_KEY;

if (!API_KEY) { console.error('❌ APPWRITE_API_KEY manquant'); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

(async () => {
  // 1. Récupérer la première équipe
  const teams = await databases.listDocuments(DATABASE_ID, 'teams', [Query.limit(1)]);
  if (teams.documents.length === 0) {
    console.error('❌ Aucune équipe trouvée');
    process.exit(1);
  }
  const team = teams.documents[0];

  // 2. Créer une facture de test
  const invoice = await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), {
    teamId: team.$id,
    userId: team.ownerId || 'system',
    invoiceNumber: `TEST-${Date.now()}`,
    clientName: 'Client Test Trésorerie',
    clientEmail: 'test@example.com',
    total: 1500,
    subtotal: 1250,
    tax: 250,
    currencyCode: 'EUR',
    status: 'sent',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    items: JSON.stringify([{
      id: '1',
      description: 'Prestation de test',
      quantity: 1,
      unitPrice: 1250,
      tvaRate: 20,
      total: 1250
    }]),
    payments: JSON.stringify([]),
    paidAmount: 0,
  });

  console.log(`✅ Facture de test créée : ${invoice.$id}`);
  console.log(`   N° : ${invoice.invoiceNumber}`);
  console.log(`   Montant : 1 500,00 €`);
  console.log(`   Statut : sent (impayée)`);
  console.log(`\n   → Va sur http://localhost:5173/test-payment pour tester le modal`);
})().catch(e => { console.error('💥', e.message); process.exit(1); });
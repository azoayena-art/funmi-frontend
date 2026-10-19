// scripts/setup-bank-transactions.mjs
// 🏦 Crée la collection bank_transactions (import relevés + rapprochement)
import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const COLLECTION_ID = 'bank_transactions';

// ⏳ Attend que tous les attributs soient "available"
async function waitForAttributes() {
  for (let i = 0; i < 30; i++) {
    const col = await databases.getCollection(DATABASE_ID, COLLECTION_ID);
    const pending = col.attributes.filter(a => a.status === 'processing');
    if (pending.length === 0) return col;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timeout création attributs');
}

async function main() {
  console.log('🏦 Setup collection bank_transactions...\n');

  // 1. Collection (documentSecurity = true → permissions par document, cohérent RLS)
  try {
    await databases.getCollection(DATABASE_ID, COLLECTION_ID);
    console.log('ℹ️  Collection déjà existante');
  } catch {
    await databases.createCollection(DATABASE_ID, COLLECTION_ID, COLLECTION_ID, [], true);
    console.log('✅ Collection créée (documentSecurity: ON)');
  }

  // 2. Attributs
  const createAttrs = async () => {
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'teamId', 100, true);
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'date', 10, true);            // ISO YYYY-MM-DD
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'label', 500, true);          // libellé banque
    await databases.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'amount', true, -1000000000, 1000000000); // signé (+/-)
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'currency', 3, false, 'EUR');
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'bankLabel', 100, false);     // nom banque/compte
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'reference', 100, false);     // réf. opération
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'status', 20, false, 'unmatched'); // unmatched|matched|ignored
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'matchedType', 30, false);    // client_invoice|supplier_invoice|treasury_op
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'matchedId', 100, false);
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'rowHash', 64, true);         // anti-doublon d'import
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'importedAt', 30, false);
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'importSource', 20, false, 'csv');
  };

  try {
    await createAttrs();
    console.log('⏳ Attributs en cours de création...');
  } catch (e) {
    console.log(`ℹ️  Attributs possiblement déjà présents (${e.type || e.code})`);
  }

  const col = await waitForAttributes();
  console.log(`✅ ${col.attributes.length} attributs disponibles`);

  // 3. Index
  const indexes = [
    ['idx_team_status', 'key', ['teamId', 'status']],
    ['idx_team_date', 'key', ['teamId', 'date']],
    ['idx_rowhash', 'unique', ['rowHash']],
  ];
  for (const [key, type, attrs] of indexes) {
    try {
      await databases.createIndex(DATABASE_ID, COLLECTION_ID, key, type, attrs);
      console.log(`✅ Index ${key}`);
    } catch (e) {
      console.log(`ℹ️  Index ${key} déjà présent`);
    }
  }

  console.log('\n🎉 Collection bank_transactions prête !');
  console.log('👉 Prochaine étape : service de parsing CSV (5.2)');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
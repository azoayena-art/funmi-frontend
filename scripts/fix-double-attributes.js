import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'received_invoices';

async function run() {
  console.log('🔧 Ajout des attributs Float manquants...\n');

  const floatAttrs = [
    { key: 'subtotal', required: false },
    { key: 'tax', required: false },
    { key: 'total', required: true },
  ];

  for (const attr of floatAttrs) {
    try {
      await databases.createFloatAttribute(
        DATABASE_ID,
        COLLECTION_ID,
        attr.key,
        attr.required
      );
      console.log(`  ✓ Float : ${attr.key} (required=${attr.required})`);
    } catch (e) {
      if (String(e.message).includes('already exists')) {
        console.log(`  ⚠️ ${attr.key} : existe déjà`);
      } else {
        console.error(`  ❌ ${attr.key} : ${e.message}`);
      }
    }
  }

  console.log('\n✅ Attributs Float ajoutés avec succès !');
}

run().catch(err => {
  console.error('\n💥 Erreur:', err.message);
  process.exit(1);
});
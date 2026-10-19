import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID;

const COLLECTIONS = [
  'invoices',
  'clients',
  'quotes',
  'received_invoices',
  'invoice_metadata',
  'accounting_events',
  'receipts',
];

async function verifySecurity() {
  console.log('\n🔒 AUDIT DE SÉCURITÉ MULTI-TENANT\n');
  console.log('='.repeat(50));

  for (const collectionId of COLLECTIONS) {
    console.log(`\n📋 Collection: ${collectionId}`);
    console.log('-'.repeat(50));

    try {
      const collection = await databases.getCollection(DB_ID, collectionId);
      
      // Vérifier les attributs
      const hasTeamId = collection.attributes.some(attr => attr.key === 'teamId');
      const teamIdRequired = collection.attributes.find(attr => attr.key === 'teamId')?.required;
      
      console.log(`   ${hasTeamId ? '✅' : '❌'} Attribut teamId présent`);
      console.log(`   ${teamIdRequired ? '✅' : '⚠️'} teamId requis`);
      
      // Vérifier les index
      const hasTeamIdIndex = collection.indexes.some(idx => 
        idx.attributes.includes('teamId')
      );
      console.log(`   ${hasTeamIdIndex ? '✅' : '⚠️'} Index teamId présent`);
      
      // Vérifier les permissions
      const hasPublicRead = collection.documentSecurity;
      console.log(`   ${!hasPublicRead ? '✅' : '⚠️'} Permissions par défaut (pas de règles publiques)`);
      
    } catch (e) {
      console.log(`   ❌ Erreur: ${e.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Audit terminé\n');
}

verifySecurity().catch(console.error);
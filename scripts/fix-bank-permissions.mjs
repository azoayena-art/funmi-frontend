// scripts/fix-bank-permissions.mjs
// 🔐 Corrige les permissions de la collection bank_transactions :
//   - create("users")  → tout membre connecté peut importer un relevé
//   - documentSecurity ON → read/update/delete contrôlés par document (équipe)
//   - Supprime le read("any") dangereux sur des données bancaires
import { Client, Databases, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';

async function main() {
  const current = await databases.getCollection(DATABASE_ID, 'bank_transactions');
  console.log('Avant :', current.$permissions, '| documentSecurity:', current.documentSecurity);

  const updated = await databases.updateCollection(
    DATABASE_ID,
    'bank_transactions',
    current.name,
    [Permission.create(Role.users())], // ✅ seul create au niveau collection
    true                               // ✅ documentSecurity ON (RLS par document)
  );

  console.log('Après :', updated.$permissions, '| documentSecurity:', updated.documentSecurity);
  console.log('\n🎉 Permissions corrigées. Réessayez le bouton.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
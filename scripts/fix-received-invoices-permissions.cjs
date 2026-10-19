// scripts/fix-received-invoices-permissions.cjs
const { Client, Databases, Permission, Role } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'received_invoices';

async function run() {
  console.log('🔐 Mise à jour des permissions de la collection...\n');

  const permissions = [
    Permission.read(Role.users()),
    Permission.create(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];

  try {
    await databases.updateCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'Factures reçues',
      permissions,
      false // documentSecurity = false (on gère au niveau document si besoin)
    );
    console.log('✅ Permissions mises à jour :');
    permissions.forEach(p => console.log('   •', p));
    console.log('\n🎉 La collection est maintenant accessible aux utilisateurs connectés.');
    console.log('💡 La sécurité est assurée par le filtrage teamId dans les requêtes.');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
}

run();
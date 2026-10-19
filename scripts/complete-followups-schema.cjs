require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB = process.env.VITE_APPWRITE_DATABASE_ID;

(async () => {
  console.log('🔧 Complétion du schéma followups...\n');

  // Attributs manquants (optionnels pour ne pas casser les données existantes)
  const attributes = [
    { key: 'teamId', size: 255, required: false },
    { key: 'userId', size: 255, required: false },
    { key: 'relatedNumber', size: 100, required: false },
    { key: 'clientName', size: 255, required: false },
    { key: 'level', size: 10, required: false, default: '1' },
  ];

  for (const attr of attributes) {
    try {
      await databases.createStringAttribute(
        DB, 'followups', attr.key, attr.size, attr.required, attr.default || null
      );
      console.log(`✅ ${attr.key} créé`);
    } catch (e) {
      if (e.code === 409) console.log(`⏭️  ${attr.key} existe déjà`);
      else console.error(`❌ ${attr.key}:`, e.message);
    }
  }

  // Index pour le filtrage par équipe (CRITIQUE pour la sécurité)
  try {
    await databases.createIndex(DB, 'followups', 'idx_teamId', 'key', ['teamId'], ['ASC']);
    console.log('✅ Index teamId créé');
  } catch (e) {
    if (e.code === 409) console.log('⏭️  Index teamId existe déjà');
    else console.error('❌ Index teamId:', e.message);
  }

  console.log('\n🎉 Schéma complété !');
})();
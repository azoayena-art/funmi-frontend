require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'invoices';
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);
const databases = new Databases(client);

const attributes = [
  { key: 'lastReminderSent', type: 'datetime', required: false },
  { key: 'lastReminderLevel', type: 'string', size: 20, required: false },
  { key: 'reminderCount', type: 'integer', required: false, default: 0 },
  { key: 'lastRejectionReason', type: 'string', size: 500, required: false },
  { key: 'correctedAt', type: 'datetime', required: false },
  { key: 'correctedBy', type: 'string', size: 255, required: false },
  { key: 'correctionCount', type: 'integer', required: false, default: 0 },
];

(async () => {
  console.log('\n🔔 Ajout des attributs relances/corrections...\n');

  for (const attr of attributes) {
    try {
      const existing = await databases.listAttributes(config.databaseId, COLLECTION_ID);
      if (existing.attributes.some(a => a.key === attr.key)) {
        console.log(`⏭️  ${attr.key} existe déjà`);
        continue;
      }

      if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(config.databaseId, COLLECTION_ID, attr.key, attr.required);
      } else if (attr.type === 'string') {
        await databases.createStringAttribute(config.databaseId, COLLECTION_ID, attr.key, attr.size, attr.required);
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(config.databaseId, COLLECTION_ID, attr.key, attr.required, attr.default);
      }

      console.log(`✅ ${attr.key} créé`);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      if (e.code === 409) console.log(`⏭️  ${attr.key} existe déjà (409)`);
      else console.error(`❌ ${attr.key}:`, e.message);
    }
  }

  console.log('\n🎉 Terminé !\n');
})();
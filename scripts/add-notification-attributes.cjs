// scripts/add-notification-attributes.cjs
require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.VITE_APPWRITE_API_KEY);

const databases = new Databases(client);

(async () => {
  const attributes = [
    { key: 'notifyOnRejection', type: 'boolean', default: true },
    { key: 'notifyOnAcceptance', type: 'boolean', default: true },
    { key: 'notifyOnTransmission', type: 'boolean', default: true },
  ];

  for (const attr of attributes) {
    try {
      await databases.createBooleanAttribute(
        process.env.VITE_APPWRITE_DATABASE_ID,
        'einvoice_settings',
        attr.key,
        false,
        attr.default
      );
      console.log(`✅ ${attr.key} créé`);
    } catch (e) {
      if (e.code === 409) console.log(`⏭️ ${attr.key} existe déjà`);
      else console.error(`❌ ${attr.key}:`, e.message);
    }
  }
  console.log('🎉 Terminé !');
})();
require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

(async () => {
  console.log('🚀 Ajout des attributs EmailJS dans einvoice_settings...\n');

  const attributes = [
    { key: 'emailjsServiceId', size: 100, required: false, default: null },
    { key: 'emailjsTemplateId', size: 100, required: false, default: null },
    { key: 'emailjsPublicKey', size: 100, required: false, default: null },
    { key: 'emailjsFromName', size: 100, required: false, default: null },
  ];

  for (const attr of attributes) {
    try {
      await databases.createStringAttribute(
        process.env.VITE_APPWRITE_DATABASE_ID,
        'einvoice_settings',
        attr.key,
        attr.size,
        attr.required,
        attr.default
      );
      console.log(`✅ ${attr.key} créé`);
    } catch (e) {
      if (e.code === 409) console.log(`⏭️  ${attr.key} existe déjà`);
      else console.error(`❌ ${attr.key}:`, e.message);
    }
  }

  console.log('\n🎉 Terminé !');
})();
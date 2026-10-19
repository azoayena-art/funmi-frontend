require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.VITE_APPWRITE_API_KEY);

const databases = new Databases(client);

(async () => {
  console.log('🚀 Création de la collection einvoice_events...');
  
  try {
    await databases.createCollection(
      process.env.VITE_APPWRITE_DATABASE_ID,
      'einvoice_events',
      'Événements E-Facturation'
    );
    console.log('✅ Collection créée');
  } catch (e) {
    if (e.code === 409) console.log('⏭️  Collection existe déjà');
  }

  const attributes = [
    { key: 'teamId', type: 'string', size: 255, required: true },
    { key: 'invoiceId', type: 'string', size: 255, required: true },
    { key: 'invoiceNumber', type: 'string', size: 100, required: true },
    { key: 'eventType', type: 'string', size: 50, required: true },
    { key: 'platform', type: 'string', size: 50, required: false },
    { key: 'transmissionReference', type: 'string', size: 255, required: false },
    { key: 'status', type: 'string', size: 50, required: true },
    { key: 'errorMessage', type: 'string', size: 1000, required: false },
    { key: 'xmlContent', type: 'string', size: 100000, required: false },
    { key: 'eventDate', type: 'string', size: 50, required: true },
    { key: 'createdBy', type: 'string', size: 255, required: true },
  ];

  for (const attr of attributes) {
    try {
      await databases.createStringAttribute(
        process.env.VITE_APPWRITE_DATABASE_ID,
        'einvoice_events',
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`✅ Attribut créé : ${attr.key}`);
    } catch (e) {
      if (e.code === 409) console.log(`⏭️  ${attr.key} existe déjà`);
    }
  }

  console.log('\n🎉 Collection einvoice_events prête !');
})();
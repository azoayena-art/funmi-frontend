require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

// ============================================================
// 🔧 CONFIGURATION (depuis votre .env)
// ============================================================
const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID,
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID,
  apiKey: process.env.VITE_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
};

const COLLECTION_ID = 'einvoice_settings';
const COLLECTION_NAME = 'Paramètres E-Facturation 2026';

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);

const databases = new Databases(client);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// 📋 ATTRIBUTS À CRÉER
// ============================================================
const stringAttributes = [
  { key: 'teamId', size: 255, required: true, default: null },
  { key: 'userId', size: 255, required: true, default: null },
  { key: 'platform', size: 50, required: true, default: 'simulation' },
  { key: 'platformName', size: 255, required: false, default: null },
  { key: 'platformEndpoint', size: 500, required: false, default: null },
  { key: 'platformApiKey', size: 500, required: false, default: null },
  { key: 'transmissionFormat', size: 50, required: true, default: 'factur-x' },
];

const booleanAttributes = [
  { key: 'autoTransmission', required: true, default: false },
  { key: 'requireElectronicForB2B', required: true, default: true },
];

// ============================================================
// 🚀 EXÉCUTION
// ============================================================
(async () => {
  console.log('\n🚀 Création de la collection einvoice_settings...\n');
  console.log('📌 Configuration :');
  console.log(`   Endpoint  : ${config.endpoint}`);
  console.log(`   Project   : ${config.projectId}`);
  console.log(`   Database  : ${config.databaseId}`);
  console.log('');

  // Vérifier que la config est présente
  if (!config.projectId || !config.databaseId || !config.apiKey) {
    console.error('❌ Configuration manquante dans le .env !');
    console.error('   Vérifiez que ces variables existent :');
    console.error('   - VITE_APPWRITE_PROJECT_ID');
    console.error('   - VITE_APPWRITE_DATABASE_ID');
    console.error('   - VITE_APPWRITE_API_KEY');
    process.exit(1);
  }

  // 1. Créer la collection
  try {
    console.log(`📁 Création de la collection "${COLLECTION_NAME}"...`);
    await databases.createCollection(
      config.databaseId,
      COLLECTION_ID,
      COLLECTION_NAME
    );
    console.log('✅ Collection créée\n');
  } catch (e) {
    if (e.code === 409) {
      console.log('⏭️  La collection existe déjà\n');
    } else {
      console.error('❌ Erreur création collection:', e.message);
      process.exit(1);
    }
  }

  await sleep(1000);

  // 2. Récupérer les attributs existants
  let existingAttrs = [];
  try {
    const res = await databases.listAttributes(config.databaseId, COLLECTION_ID);
    existingAttrs = res.attributes.map(a => a.key);
    console.log(`📊 ${existingAttrs.length} attribut(s) existant(s)\n`);
  } catch (e) {
    console.warn('⚠️ Impossible de lister les attributs:', e.message);
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  // 3. Créer les attributs string
  console.log('🔤 Attributs texte :');
  for (const attr of stringAttributes) {
    if (existingAttrs.includes(attr.key)) {
      console.log(`   ⏭️  ${attr.key} (existe déjà)`);
      skipped++;
      continue;
    }
    try {
      await databases.createStringAttribute(
        config.databaseId,
        COLLECTION_ID,
        attr.key,
        attr.size,
        attr.required,
        attr.default
      );
      console.log(`   ✅ ${attr.key} (string, ${attr.size})`);
      created++;
      await sleep(500);
    } catch (e) {
      if (e.code === 409) {
        console.log(`   ⏭️  ${attr.key} (conflit)`);
        skipped++;
      } else {
        console.error(`   ❌ ${attr.key}:`, e.message);
        errors++;
      }
    }
  }

  await sleep(500);

  // 4. Créer les attributs booléens
  console.log('\n🔘 Attributs booléens :');
  for (const attr of booleanAttributes) {
    if (existingAttrs.includes(attr.key)) {
      console.log(`   ⏭️  ${attr.key} (existe déjà)`);
      skipped++;
      continue;
    }
    try {
      await databases.createBooleanAttribute(
        config.databaseId,
        COLLECTION_ID,
        attr.key,
        attr.required,
        attr.default
      );
      console.log(`   ✅ ${attr.key} (boolean, défaut: ${attr.default})`);
      created++;
      await sleep(500);
    } catch (e) {
      if (e.code === 409) {
        console.log(`   ⏭️  ${attr.key} (conflit)`);
        skipped++;
      } else {
        console.error(`   ❌ ${attr.key}:`, e.message);
        errors++;
      }
    }
  }

  await sleep(500);

  // 5. Créer l'index sur teamId
  console.log('\n🗂️ Index :');
  try {
    await databases.createIndex(
      config.databaseId,
      COLLECTION_ID,
      'idx_teamId',
      'key',
      ['teamId'],
      ['ASC']
    );
    console.log('   ✅ idx_teamId créé');
  } catch (e) {
    if (e.code === 409) {
      console.log('   ⏭️  idx_teamId existe déjà');
    } else {
      console.warn('   ⚠️ Index non créé:', e.message);
    }
  }

  // 6. Résumé
  console.log('\n' + '═'.repeat(60));
  console.log(`\n🎉 Terminé !`);
  console.log(`   ✅ Créés   : ${created}`);
  console.log(`   ⏭️  Ignorés : ${skipped}`);
  console.log(`   ❌ Erreurs : ${errors}`);
  console.log('\n📋 Structure finale de la collection :');
  console.log('   - teamId (string, requis)');
  console.log('   - userId (string, requis)');
  console.log('   - platform (string, requis, défaut: "simulation")');
  console.log('   - platformName (string)');
  console.log('   - platformEndpoint (string)');
  console.log('   - platformApiKey (string)');
  console.log('   - transmissionFormat (string, requis, défaut: "factur-x")');
  console.log('   - autoTransmission (boolean, défaut: false)');
  console.log('   - requireElectronicForB2B (boolean, défaut: true)');
  console.log('\n🚀 Vous pouvez maintenant tester l\'onglet E-Facturation 2026 !\n');
})();
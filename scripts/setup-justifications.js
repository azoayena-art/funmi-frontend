// scripts/setup-justifications.js
// Compatible node-appwrite v12 (paramètres positionnels)
import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================
// 🔍 Vérification des variables d'environnement
// ============================================================
const requiredVars = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DATABASE_ID',
  'APPWRITE_API_KEY',
];

const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error('❌ Variables d\'environnement manquantes :');
  missing.forEach(v => console.error(`   - ${v}`));
  console.error('\n📝 Créez un fichier .env à la racine avec :');
  console.error('   VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1');
  console.error('   VITE_APPWRITE_PROJECT_ID=votre_project_id');
  console.error('   VITE_APPWRITE_DATABASE_ID=votre_database_id');
  console.error('   APPWRITE_API_KEY=votre_api_key_admin');
  process.exit(1);
}

// ============================================================
// 🔌 Initialisation du client Appwrite
// ============================================================
const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'expense_justifications';

// ============================================================
// 📋 Définition des attributs à créer
// ============================================================
const stringAttributes = [
  { key: 'teamId', size: 100, required: true },
  { key: 'expenseType', size: 50, required: false },
  { key: 'expenseId', size: 100, required: true },
  { key: 'expenseNumber', size: 100, required: false },
  { key: 'fileId', size: 100, required: true },
  { key: 'fileName', size: 500, required: false },
  { key: 'fileType', size: 100, required: false },
  { key: 'fileHash', size: 128, required: false },
  { key: 'uploadedBy', size: 100, required: false },
];

const integerAttributes = [
  { key: 'fileSize', required: false },
];

const floatAttributes = [
  { key: 'amount', required: false },
];

const datetimeAttributes = [
  { key: 'uploadedAt', required: false },
];

const indexes = [
  { key: 'idx_team_expense', type: 'key', attributes: ['teamId', 'expenseId'] },
  { key: 'idx_file', type: 'key', attributes: ['fileId'] },
  { key: 'idx_team_file', type: 'key', attributes: ['teamId', 'fileId'] },
];

// ============================================================
// 🚀 Fonction principale
// ============================================================
async function setup() {
  console.log('🚀 Configuration de la collection expense_justifications...\n');

  // 1️⃣ Vérifier que la collection existe
  try {
    await databases.getCollection(DATABASE_ID, COLLECTION_ID);
    console.log(`✅ Collection "${COLLECTION_ID}" trouvée\n`);
  } catch (e) {
    console.log(`⚠️  Collection "${COLLECTION_ID}" introuvable, création en cours...`);
    try {
      await databases.createCollection(DATABASE_ID, COLLECTION_ID, 'expense_justifications');
      console.log(`✅ Collection créée\n`);
      // Attendre que la collection soit prête
      await new Promise(r => setTimeout(r, 2000));
    } catch (createErr) {
      console.error(`❌ Impossible de créer la collection : ${createErr.message}`);
      process.exit(1);
    }
  }

  // 2️⃣ Créer les attributs STRING
  console.log('📦 Attributs STRING :');
  for (const attr of stringAttributes) {
    try {
      // Signature node-appwrite v12 :
      // createStringAttribute(databaseId, collectionId, key, size, required, default, array)
      await databases.createStringAttribute(
        DATABASE_ID,
        COLLECTION_ID,
        attr.key,
        attr.size,
        attr.required
      );
      console.log(`   ✅ "${attr.key}" créé`);
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      if (e.message?.includes('already exists') || e.code === 409) {
        console.log(`   ℹ️  "${attr.key}" existe déjà`);
      } else {
        console.log(`   ❌ Erreur "${attr.key}" : ${e.message}`);
      }
    }
  }

  // 3️⃣ Créer les attributs INTEGER
  console.log('\n📦 Attributs INTEGER :');
  for (const attr of integerAttributes) {
    try {
      // createIntegerAttribute(databaseId, collectionId, key, required, min, max, default, array)
      await databases.createIntegerAttribute(
        DATABASE_ID,
        COLLECTION_ID,
        attr.key,
        attr.required
      );
      console.log(`   ✅ "${attr.key}" créé`);
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      if (e.message?.includes('already exists') || e.code === 409) {
        console.log(`   ℹ️  "${attr.key}" existe déjà`);
      } else {
        console.log(`   ❌ Erreur "${attr.key}" : ${e.message}`);
      }
    }
  }

  // 4️⃣ Créer les attributs FLOAT
  console.log('\n📦 Attributs FLOAT :');
  for (const attr of floatAttributes) {
    try {
      // createFloatAttribute(databaseId, collectionId, key, required, min, max, precision, default, array)
      await databases.createFloatAttribute(
        DATABASE_ID,
        COLLECTION_ID,
        attr.key,
        attr.required
      );
      console.log(`   ✅ "${attr.key}" créé`);
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      if (e.message?.includes('already exists') || e.code === 409) {
        console.log(`   ℹ️  "${attr.key}" existe déjà`);
      } else {
        console.log(`   ❌ Erreur "${attr.key}" : ${e.message}`);
      }
    }
  }

  // 5️⃣ Créer les attributs DATETIME
  console.log('\n📦 Attributs DATETIME :');
  for (const attr of datetimeAttributes) {
    try {
      // createDatetimeAttribute(databaseId, collectionId, key, required, default, array)
      await databases.createDatetimeAttribute(
        DATABASE_ID,
        COLLECTION_ID,
        attr.key,
        attr.required
      );
      console.log(`   ✅ "${attr.key}" créé`);
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      if (e.message?.includes('already exists') || e.code === 409) {
        console.log(`   ℹ️  "${attr.key}" existe déjà`);
      } else {
        console.log(`   ❌ Erreur "${attr.key}" : ${e.message}`);
      }
    }
  }

  // 6️⃣ Attendre que tous les attributs soient disponibles
  console.log('\n⏳ Attente de la disponibilité des attributs (5s)...');
  await new Promise(r => setTimeout(r, 5000));

  // 7️⃣ Créer les index
  console.log('\n📇 Création des index :');
  for (const idx of indexes) {
    try {
      // createIndex(databaseId, collectionId, key, type, attributes, orders)
      await databases.createIndex(
        DATABASE_ID,
        COLLECTION_ID,
        idx.key,
        idx.type,
        idx.attributes,
        idx.attributes.map(() => 'ASC')
      );
      console.log(`   ✅ Index "${idx.key}" créé`);
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      if (e.message?.includes('already exists') || e.code === 409) {
        console.log(`   ℹ️  Index "${idx.key}" existe déjà`);
      } else {
        console.log(`   ❌ Erreur index "${idx.key}" : ${e.message}`);
      }
    }
  }

  console.log('\n🎉 Configuration terminée avec succès !');
  console.log('\n📊 Résumé :');
  console.log(`   - ${stringAttributes.length} attributs string`);
  console.log(`   - ${integerAttributes.length} attribut integer`);
  console.log(`   - ${floatAttributes.length} attribut float`);
  console.log(`   - ${datetimeAttributes.length} attribut datetime`);
  console.log(`   - ${indexes.length} index`);
}

setup().catch(err => {
  console.error('💥 Erreur fatale :', err.message);
  process.exit(1);
});
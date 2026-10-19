require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

// ============================================================
// 🔍 Récupération robuste des variables d'environnement
// (cherche avec et sans le préfixe VITE_)
// ============================================================
const getEnv = (...names) => {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return undefined;
};

const ENDPOINT = getEnv('APPWRITE_ENDPOINT', 'VITE_APPWRITE_ENDPOINT');
const PROJECT_ID = getEnv('APPWRITE_PROJECT_ID', 'VITE_APPWRITE_PROJECT_ID');
const API_KEY = getEnv('APPWRITE_API_KEY');
const DATABASE_ID = getEnv('APPWRITE_DATABASE_ID', 'VITE_APPWRITE_DATABASE_ID');

console.log('═══════════════════════════════════════════════════════');
console.log('🔍 TEST DE CONNEXION APPWRITE');
console.log('═══════════════════════════════════════════════════════');
console.log(`   Endpoint    : ${ENDPOINT || '❌ MANQUANT'}`);
console.log(`   Project ID  : ${PROJECT_ID || '❌ MANQUANT'}`);
console.log(`   API Key     : ${API_KEY ? API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 5) : '❌ MANQUANT'}`);
console.log(`   Database ID : ${DATABASE_ID || '❌ MANQUANT'}`);
console.log('═══════════════════════════════════════════════════════\n');

// ============================================================
// ✅ Vérification des variables avant de continuer
// ============================================================
const missing = [];
if (!ENDPOINT) missing.push('APPWRITE_ENDPOINT ou VITE_APPWRITE_ENDPOINT');
if (!PROJECT_ID) missing.push('APPWRITE_PROJECT_ID ou VITE_APPWRITE_PROJECT_ID');
if (!API_KEY) missing.push('APPWRITE_API_KEY');
if (!DATABASE_ID) missing.push('APPWRITE_DATABASE_ID ou VITE_APPWRITE_DATABASE_ID');

if (missing.length > 0) {
  console.log('❌ ERREUR : Variables manquantes dans le fichier .env :');
  missing.forEach(v => console.log(`   - ${v}`));
  console.log('\n💡 Vérifiez le contenu de votre fichier .env :');
  console.log('   Commande Windows : type .env\n');
  console.log('📋 Format attendu dans .env :');
  console.log('   VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1');
  console.log('   VITE_APPWRITE_PROJECT_ID=votre_id_projet');
  console.log('   VITE_APPWRITE_DATABASE_ID=relancepro_db');
  console.log('   APPWRITE_API_KEY=votre_cle_api\n');
  process.exit(1);
}

// ============================================================
// 🔌 Connexion
// ============================================================
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

async function test() {
  try {
    // Test 1 : Lister les collections de la base
    console.log('📋 Test 1 : Listage des collections...');
    const collections = await databases.listCollections(DATABASE_ID);
    console.log(`   ✅ ${collections.total} collection(s) trouvée(s)`);
    collections.collections.forEach(c => {
      console.log(`      - ${c.name} (${c.$id})`);
    });
    console.log('');

    // Test 2 : Lister les documents de la collection invoices
    console.log('📄 Test 2 : Listage des factures...');
    const invoices = await databases.listDocuments(DATABASE_ID, 'invoices', []);
    console.log(`   ✅ ${invoices.total} facture(s) trouvée(s)\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ CONNEXION RÉUSSIE !');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\nVous pouvez maintenant relancer la migration :');
    console.log('   node scripts/migrate-team-id.cjs\n');

  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ ÉCHEC DE LA CONNEXION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\nErreur : ${error.message}\n`);
    console.log('🔧 Solutions possibles :');
    console.log('   1. Vérifiez que l\'API Key est valide et a les bons accès');
    console.log('   2. Vérifiez que VITE_APPWRITE_PROJECT_ID est correct');
    console.log('   3. Vérifiez que VITE_APPWRITE_DATABASE_ID est correct\n');
  }
}

test();
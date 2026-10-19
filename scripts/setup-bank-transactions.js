// scripts/setup-bank-transactions.js
// 🏦 Crée la collection bank_transactions avec tous ses attributs et index
// Exécution : npm run setup:bank
//
// Prérequis :
//   1. Créer une clé API dans Appwrite Console → Overview → API Keys
//      (cocher les permissions : databases.read, databases.write)
//   2. Ajouter dans .env : APPWRITE_API_KEY=votre_cle_api

import { Client, Databases, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================
// ⚙️  CONFIGURATION
// ============================================================
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const COLLECTION_ID = 'bank_transactions';
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ APPWRITE_API_KEY manquante dans .env');
  console.log('');
  console.log('📋 Instructions :');
  console.log('  1. Appwrite Console → Overview → API Keys → Create API key');
  console.log('  2. Nom : "setup-script"');
  console.log('  3. Scopes : databases.read, databases.write');
  console.log('  4. Ajouter dans .env : APPWRITE_API_KEY=votre_cle');
  console.log('  5. Relancer : npm run setup:bank');
  process.exit(1);
}

// ============================================================
// 🔌 CLIENT
// ============================================================
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// 🏗️  HELPERS
// ============================================================
async function safeCreate(fn, label) {
  try {
    await fn();
    console.log(`  ✅ ${label}`);
  } catch (e) {
    if (e.code === 409 || (e.message || '').includes('already exists')) {
      console.log(`  ⚠️  ${label} (déjà existant)`);
    } else {
      console.log(`  ❌ ${label} : ${e.message}`);
    }
  }
}

// ============================================================
// 🚀 SETUP
// ============================================================
async function setup() {
  console.log(`\n🏦 Setup de la collection "${COLLECTION_ID}"`);
  console.log(`   Database : ${DATABASE_ID}`);
  console.log(`   Endpoint : ${ENDPOINT}\n`);

  // 1. Créer la collection avec Document Security activé
  console.log('📦 Collection :');
  await safeCreate(async () => {
    await db.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'Relevés bancaires',
      [
        Permission.read(Role.any()), // lecture pour membres (via Role.team sur docs)
      ],
      true // ⚠️ documentSecurity = true (CRITIQUE)
    );
  }, 'Création collection');

  await sleep(500);

  // 2. Créer les attributs
  console.log('\n📋 Attributs :');
  const stringAttrs = [
    ['teamId', 100, true],
    ['date', 10, true],
    ['valueDate', 10, false],
    ['label', 500, true],
    ['currency', 3, true],
    ['reference', 100, false],
    ['bankLabel', 200, false],
    ['status', 20, true],
    ['matchedType', 30, false],
    ['matchedId', 100, false],
    ['rowHash', 64, true],
    ['importSource', 20, true],
  ];
  for (const [key, size, required] of stringAttrs) {
    await safeCreate(
      () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, key, size, required),
      `String : ${key} (${size})`
    );
    await sleep(150);
  }

  await safeCreate(
    () => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, 'amount', true),
    'Float : amount'
  );
  await sleep(150);

  await safeCreate(
    () => db.createDatetimeAttribute(DATABASE_ID, COLLECTION_ID, 'importedAt', true),
    'Datetime : importedAt'
  );
  await sleep(150);

  // 3. Créer les index
  console.log('\n🔍 Index :');
  await safeCreate(
    () => db.createIndex(
      DATABASE_ID, COLLECTION_ID,
      'idx_team_date',
      'key',
      ['teamId', 'date'],
      ['ASC', 'DESC']
    ),
    'idx_team_date (teamId + date DESC)'
  );

  await safeCreate(
    () => db.createIndex(
      DATABASE_ID, COLLECTION_ID,
      'idx_rowhash',
      'unique',
      ['rowHash'],
      ['ASC']
    ),
    'idx_rowhash (unique — anti-doublon)'
  );

  await safeCreate(
    () => db.createIndex(
      DATABASE_ID, COLLECTION_ID,
      'idx_status',
      'key',
      ['teamId', 'status'],
      ['ASC', 'ASC']
    ),
    'idx_status (teamId + status)'
  );

  console.log('\n🎉 Setup terminé !');
  console.log('');
  console.log('📌 Prochaines étapes :');
  console.log('   1. Vérifier dans Appwrite Console → Databases → ' + DATABASE_ID);
  console.log('   2. Collection "bank_transactions" doit avoir :');
  console.log('      • 14 attributs');
  console.log('      • 3 index (dont idx_rowhash UNIQUE)');
  console.log('      • Document Security = ON');
  console.log('   3. Tester l\'import CSV dans Trésorerie → Relevés bancaires');
  console.log('');
}

setup().catch(e => {
  console.error('❌ Erreur fatale :', e.message);
  process.exit(1);
});
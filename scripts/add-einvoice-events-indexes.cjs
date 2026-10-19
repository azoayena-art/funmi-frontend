require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION = 'einvoice_events';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ✅ Attributs utilisés par eInvoiceTransmissionService.ts
const REQUIRED_ATTRIBUTES = [
  { key: 'teamId', size: 100 },
  { key: 'userId', size: 100 },
  { key: 'invoiceId', size: 100 },
  { key: 'invoiceNumber', size: 100 },
  { key: 'eventType', size: 50 },
  { key: 'platform', size: 50 },
  { key: 'transmissionReference', size: 255 },
  { key: 'status', size: 50 },
  { key: 'errorMessage', size: 500 },
  { key: 'eventDate', size: 100 },
  { key: 'createdBy', size: 100 },
];

(async () => {
  console.log('🔍 Analyse de la collection einvoice_events...\n');

  // 1. Lister les attributs existants
  let existing = [];
  try {
    const res = await databases.listAttributes(DB, COLLECTION);
    existing = res.attributes.map((a) => a.key);
    console.log('📋 Attributs existants :', existing.join(', ') || '(aucun)');
  } catch (e) {
    console.error('❌ Impossible de lire la collection:', e.message);
    process.exit(1);
  }

  // 2. Créer les attributs manquants
  const missing = REQUIRED_ATTRIBUTES.filter((a) => !existing.includes(a.key));
  if (missing.length === 0) {
    console.log('\n✅ Aucun attribut manquant.');
  } else {
    console.log('\n🧱 Attributs manquants :', missing.map((m) => m.key).join(', '));
    for (const attr of missing) {
      try {
        await databases.createStringAttribute(DB, COLLECTION, attr.key, attr.size, false, null);
        console.log(`✅ ${attr.key} créé`);
      } catch (e) {
        if (e.code === 409) console.log(`⏭️  ${attr.key} existe déjà`);
        else console.error(`❌ ${attr.key}:`, e.message);
      }
    }
  }

  // 3. Attendre que tous les attributs soient "available"
  console.log('\n⏳ Attente de la disponibilité des attributs...');
  for (let i = 0; i < 30; i++) {
    const res = await databases.listAttributes(DB, COLLECTION);
    const pending = res.attributes.filter((a) => a.status !== 'available');
    if (pending.length === 0) {
      console.log('✅ Tous les attributs sont disponibles.');
      break;
    }
    if (i === 29) {
      console.warn('⚠️ Attributs non disponibles :', pending.map((p) => p.key).join(', '));
    }
    await sleep(2000);
  }

  // 4. Créer l'index composite
  try {
    await databases.createIndex(
      DB, COLLECTION,
      'idx_invoiceId_eventDate', 'key',
      ['invoiceId', 'eventDate'], ['ASC', 'DESC']
    );
    console.log('✅ Index composite créé : idx_invoiceId_eventDate');
  } catch (e) {
    if (e.code === 409) console.log('⏭️  idx_invoiceId_eventDate existe déjà');
    else console.error('❌ idx_invoiceId_eventDate:', e.message);
  }

  console.log('\n🎉 Terminé !');
})();
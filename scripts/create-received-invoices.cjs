import { Client, Databases, ID } from 'node-appwrite';

// ============================================================
// ⚙️ CONFIGURATION via variables d'environnement
// ============================================================
const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY); // Clé API serveur (pas une clé client)

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'received_invoices';

// ============================================================
// 🛠️ HELPERS
// ============================================================
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForAttributes() {
  console.log('\n⏳ Attente de la disponibilité des attributs...');
  for (let i = 0; i < 30; i++) {
    try {
      const attrs = await databases.listAttributes(DATABASE_ID, COLLECTION_ID);
      const allAvailable = attrs.attributes.every(a => a.status === 'available');
      if (allAvailable) {
        console.log(`✅ ${attrs.attributes.length} attributs disponibles`);
        return true;
      }
      const processing = attrs.attributes.filter(a => a.status !== 'available').map(a => `${a.key}(${a.status})`);
      console.log(`   ⏳ ${i + 1}/30 - En cours : ${processing.join(', ')}`);
    } catch (e) {
      console.log(`   ⏳ ${i + 1}/30 - Attente...`);
    }
    await wait(2000);
  }
  console.warn('⚠️ Timeout : certains attributs peuvent ne pas être prêts');
  return false;
}

async function createStringAttribute(key, size, required) {
  try {
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, key, size, required);
    console.log(`  ✓ String  : ${key} (size=${size}, required=${required})`);
  } catch (e) {
    if (String(e.message).includes('already exists')) {
      console.log(`  ⚠️ ${key} : existe déjà`);
    } else {
      console.error(`  ❌ ${key} : ${e.message}`);
    }
  }
}

async function createDoubleAttribute(key, required) {
  try {
    await databases.createDoubleAttribute(DATABASE_ID, COLLECTION_ID, key, required);
    console.log(`  ✓ Double  : ${key} (required=${required})`);
  } catch (e) {
    if (String(e.message).includes('already exists')) {
      console.log(`  ⚠️ ${key} : existe déjà`);
    } else {
      console.error(`  ❌ ${key} : ${e.message}`);
    }
  }
}

async function createIndex(key, type, attributes, orders) {
  try {
    await databases.createIndex(DATABASE_ID, COLLECTION_ID, key, type, attributes, orders);
    console.log(`  ✓ Index   : ${key} (${attributes.join(', ')})`);
  } catch (e) {
    if (String(e.message).includes('already exists')) {
      console.log(`  ⚠️ Index ${key} : existe déjà`);
    } else {
      console.error(`  ❌ Index ${key} : ${e.message}`);
    }
  }
}

// ============================================================
// 🚀 SCRIPT PRINCIPAL
// ============================================================
async function run() {
  console.log('🚀 Création de la collection received_invoices\n');
  console.log(`📍 Endpoint : ${process.env.VITE_APPWRITE_ENDPOINT}`);
  console.log(`📍 Project  : ${process.env.VITE_APPWRITE_PROJECT_ID}`);
  console.log(`📍 Database : ${DATABASE_ID}`);
  console.log('─'.repeat(60));

  // Vérification des variables d'environnement
  if (!process.env.VITE_APPWRITE_ENDPOINT || !process.env.VITE_APPWRITE_PROJECT_ID || !DATABASE_ID || !process.env.APPWRITE_API_KEY) {
    console.error('\n❌ Variables d\'environnement manquantes.');
    console.error('Vérifiez que vous avez bien :');
    console.error('  - VITE_APPWRITE_ENDPOINT');
    console.error('  - VITE_APPWRITE_PROJECT_ID');
    console.error('  - VITE_APPWRITE_DATABASE_ID');
    console.error('  - APPWRITE_API_KEY (clé API serveur)');
    process.exit(1);
  }

  // ── 1. COLLECTION ─────────────────────────────────────────
  console.log('\n📦 [1/4] Création de la collection...');
  try {
    await databases.createCollection(DATABASE_ID, COLLECTION_ID, 'Factures reçues');
    console.log('✅ Collection "received_invoices" créée');
  } catch (e) {
    if (String(e.message).includes('already exists')) {
      console.log('⚠️ La collection existe déjà, on continue...');
    } else {
      console.error('❌ Erreur création collection:', e.message);
      process.exit(1);
    }
  }

  // ── 2. ATTRIBUTS STRING ───────────────────────────────────
  console.log('\n🔤 [2/4] Création des attributs String...');
  const stringAttrs = [
    { key: 'teamId',          size: 255,     required: true },
    { key: 'userId',          size: 255,     required: true },
    { key: 'invoiceNumber',   size: 100,     required: true },
    { key: 'supplierName',    size: 255,     required: true },
    { key: 'supplierSiret',   size: 50,      required: false },
    { key: 'issueDate',       size: 50,      required: true },
    { key: 'dueDate',         size: 50,      required: false },
    { key: 'currencyCode',    size: 10,      required: true },
    { key: 'xmlContent',      size: 1000000, required: false },
    { key: 'pdfFileId',       size: 255,     required: false },
    { key: 'status',          size: 50,      required: true },
    { key: 'format',          size: 50,      required: false },
    { key: 'extractedAt',     size: 50,      required: false },
    { key: 'validatedBy',     size: 255,     required: false },
    { key: 'validatedAt',     size: 50,      required: false },
    { key: 'rejectionReason', size: 2000,    required: false },
  ];

  for (const attr of stringAttrs) {
    await createStringAttribute(attr.key, attr.size, attr.required);
    await wait(200); // Éviter de surcharger l'API
  }

  // ── 3. ATTRIBUTS DOUBLE ───────────────────────────────────
  console.log('\n🔢 [3/4] Création des attributs Double...');
  const doubleAttrs = [
    { key: 'subtotal', required: false },
    { key: 'tax',      required: false },
    { key: 'total',    required: true },
  ];

  for (const attr of doubleAttrs) {
    await createDoubleAttribute(attr.key, attr.required);
    await wait(200);
  }

  // ── 4. INDEX ──────────────────────────────────────────────
  console.log('\n🗂️ [4/4] Attente puis création des index...');
  await waitForAttributes();

  const indexes = [
    { key: 'idx_team_status',  type: 'key', attributes: ['teamId', 'status'],     orders: ['ASC', 'ASC'] },
    { key: 'idx_team_created', type: 'key', attributes: ['teamId', '$createdAt'], orders: ['ASC', 'DESC'] },
    { key: 'idx_supplier',     type: 'key', attributes: ['supplierName'],         orders: ['ASC'] },
  ];

  for (const idx of indexes) {
    await createIndex(idx.key, idx.type, idx.attributes, idx.orders);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Terminé ! La collection "received_invoices" est prête.');
  console.log('═'.repeat(60));
  console.log('\n📋 Récapitulatif :');
  console.log('   • 16 attributs String (dont xmlContent 1Mo)');
  console.log('   • 3 attributs Double (subtotal, tax, total)');
  console.log('   • 3 index (teamId+status, teamId+createdAt, supplierName)');
  console.log('\n💡 Prochaine étape : rafraîchir votre app, la page Factures reçues');
  console.log('   doit maintenant fonctionner sans erreur.');
}

// ============================================================
// 🏁 EXÉCUTION
// ============================================================
run().catch(err => {
  console.error('\n💥 Erreur fatale:', err.message);
  process.exit(1);
});
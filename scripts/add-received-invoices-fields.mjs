// scripts/add-received-invoices-fields.mjs
import { Client, Databases } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
const COLLECTION  = 'received_invoices';
const API_KEY     = process.env.APPWRITE_API_KEY;

if (!API_KEY) { console.error('❌ APPWRITE_API_KEY manquant'); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isConflict = (e) => e?.code === 409 || /already exists/i.test(e?.message || '');

const SOURCES = ['manual_upload', 'photo_ocr', 'email', 'ppf_pull', 'manual_entry'];
const EINV_STATUS = ['received', 'deposited', 'transmitted', 'accepted', 'refused', 'paid'];
const SUPPLIER_TYPES = ['entreprise', 'particulier'];

async function attr(label, fn) {
  try { await fn(); console.log(`   ➕ ${label}`); }
  catch (e) {
    if (isConflict(e)) console.log(`   ➖ ${label} (déjà présent)`);
    else { console.error(`   ❌ ${label}: ${e.message}`); throw e; }
  }
  await sleep(200);
}

async function waitAvailable() {
  for (let i = 0; i < 40; i++) {
    const res = await databases.listAttributes(DATABASE_ID, COLLECTION);
    const pending = res.attributes.filter(a => a.status === 'processing');
    if (pending.length === 0) return true;
    await sleep(2000);
  }
  return false;
}

(async () => {
  console.log(`🔧 Ajout des champs enrichis sur ${COLLECTION}\n`);

  // Champs existants (rappel)
  await attr('source', () => databases.createEnumAttribute(DATABASE_ID, COLLECTION, 'source', SOURCES, false, 'manual_upload'));
  await attr('originalFileId', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'originalFileId', 50, false));
  await attr('ocrConfidence', () => databases.createFloatAttribute(DATABASE_ID, COLLECTION, 'ocrConfidence', false, 0, 1, null));
  await attr('isElectronic', () => databases.createBooleanAttribute(DATABASE_ID, COLLECTION, 'isElectronic', false, false));
  await attr('einvoiceStatus', () => databases.createEnumAttribute(DATABASE_ID, COLLECTION, 'einvoiceStatus', EINV_STATUS, false, null));
  await attr('supplierEmail', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierEmail', 200, false));

  // ✨ NOUVEAUX champs enrichis
  await attr('supplierType', () => databases.createEnumAttribute(DATABASE_ID, COLLECTION, 'supplierType', SUPPLIER_TYPES, false, 'entreprise'));
  await attr('supplierSiren', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierSiren', 9, false));
  await attr('supplierVatNumber', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierVatNumber', 20, false));
  await attr('supplierPhone', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierPhone', 30, false));
  await attr('supplierAddress', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierAddress', 300, false));
  await attr('supplierPostalCode', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierPostalCode', 10, false));
  await attr('supplierCity', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierCity', 100, false));
  await attr('supplierCountry', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'supplierCountry', 5, false));
  await attr('items (JSON)', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'items', 100000, false));
  await attr('paymentConditions', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'paymentConditions', 300, false));
  await attr('paymentMethods', () => databases.createStringAttribute(DATABASE_ID, COLLECTION, 'paymentMethods', 100, false));

  console.log('   ⏳ Attente disponibilité...');
  await waitAvailable();

  console.log('\n🎉 Champs enrichis ajoutés avec succès.');
})().catch(e => { console.error('\n💥 Erreur:', e?.message || e); process.exit(1); });
// scripts/add-justification-fields.mjs
// Ajoute les champs de justification à la collection `expenses` dans Appwrite.
// Idempotent : peut être relancé sans risque (ignore les attributs existants).

import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const COLLECTION = 'expenses';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------
// 1. Vérifier que la collection existe
// ------------------------------------------------------------
let collection;
try {
  collection = await db.getCollection(DB, COLLECTION);
} catch (e) {
  console.error(`❌ La collection "${COLLECTION}" n'existe pas dans la base "${DB}".`);
  console.error('   Créez-la d\'abord avant de relancer ce script.');
  process.exit(1);
}

const existingKeys = new Set(collection.attributes.map(a => a.key));
console.log(`📦 Collection : ${COLLECTION}`);
console.log(`📋 Attributs existants : ${collection.attributes.length}\n`);

// ------------------------------------------------------------
// 2. Helper : attendre qu'un attribut soit "available"
//    (Appwrite crée les attributs de façon asynchrone)
// ------------------------------------------------------------
async function waitForAttribute(key, maxTries = 15) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const attr = await db.getAttribute(DB, COLLECTION, key);
      if (attr.status === 'available') return true;
    } catch (e) { /* pas encore créé */ }
    await sleep(1000);
  }
  return false;
}

// ------------------------------------------------------------
// 3. Helper : créer un attribut s'il n'existe pas déjà
// ------------------------------------------------------------
async function createIfMissing(key, label, createFn) {
  if (existingKeys.has(key)) {
    console.log(`⏭️  ${key.padEnd(22)} existe déjà`);
    return;
  }
  try {
    await createFn();
    const ok = await waitForAttribute(key);
    console.log(`${ok ? '✅' : '⏳'} ${key.padEnd(22)} créé ${ok ? '' : '(en cours de traitement)'}`);
  } catch (e) {
    const msg = e?.message || '';
    if (e.code === 409 || msg.toLowerCase().includes('already exists')) {
      console.log(`⏭️  ${key.padEnd(22)} existe déjà (409)`);
    } else {
      console.error(`❌ ${key.padEnd(22)} ${msg}`);
    }
  }
  // Petit délai de sécurité entre chaque création
  await sleep(300);
}

// ------------------------------------------------------------
// 4. Création des attributs
// ------------------------------------------------------------
console.log('🚀 Création des attributs de justification...\n');

await createIfMissing('justificationFileId', 'ID fichier justificatif', () =>
  db.createStringAttribute(DB, COLLECTION, 'justificationFileId', 255, false, null, false)
);

await createIfMissing('justificationType', 'Type de justificatif', () =>
  db.createEnumAttribute(
    DB, COLLECTION, 'justificationType',
    ['invoice', 'receipt', 'ticket', 'expense_report', 'other'],
    false, null, false
  )
);

await createIfMissing('justificationNumber', 'N° justificatif', () =>
  db.createStringAttribute(DB, COLLECTION, 'justificationNumber', 255, false, null, false)
);

await createIfMissing('justificationDate', 'Date du justificatif', () =>
  db.createStringAttribute(DB, COLLECTION, 'justificationDate', 50, false, null, false)
);

await createIfMissing('supplierSiret', 'SIRET fournisseur', () =>
  db.createStringAttribute(DB, COLLECTION, 'supplierSiret', 20, false, null, false)
);

await createIfMissing('supplierVatNumber', 'N° TVA intracom', () =>
  db.createStringAttribute(DB, COLLECTION, 'supplierVatNumber', 50, false, null, false)
);

await createIfMissing('isJustified', 'Justifié ?', () =>
  db.createBooleanAttribute(DB, COLLECTION, 'isJustified', false, false, false)
);

await createIfMissing('justificationLevel', 'Niveau de justification', () =>
  db.createEnumAttribute(
    DB, COLLECTION, 'justificationLevel',
    ['complete', 'partial', 'insufficient', 'missing'],
    false, null, false
  )
);

await createIfMissing('justificationScore', 'Score 0-100', () =>
  db.createIntegerAttribute(DB, COLLECTION, 'justificationScore', false, 0, 100, null, false)
);

await createIfMissing('justifiedAt', 'Date justification', () =>
  db.createDatetimeAttribute(DB, COLLECTION, 'justifiedAt', false, null, false)
);

await createIfMissing('justifiedBy', 'Qui a justifié', () =>
  db.createStringAttribute(DB, COLLECTION, 'justifiedBy', 255, false, null, false)
);

await createIfMissing('missingMentions', 'Mentions manquantes (JSON)', () =>
  db.createStringAttribute(DB, COLLECTION, 'missingMentions', 1000, false, null, false)
);

// ------------------------------------------------------------
// 5. Vérification finale
// ------------------------------------------------------------
console.log('\n🔍 Vérification finale...\n');
const updated = await db.getCollection(DB, COLLECTION);
const allKeys = updated.attributes.map(a => a.key);

const expected = [
  'justificationFileId', 'justificationType', 'justificationNumber',
  'justificationDate', 'supplierSiret', 'supplierVatNumber',
  'isJustified', 'justificationLevel', 'justificationScore',
  'justifiedAt', 'justifiedBy', 'missingMentions',
];

let allOk = true;
expected.forEach(k => {
  const present = allKeys.includes(k);
  console.log(`${present ? '✅' : '❌'} ${k}`);
  if (!present) allOk = false;
});

console.log('\n' + (allOk
  ? '🎉 Tous les attributs de justification sont en place !'
  : '⚠️ Certains attributs sont manquants. Relancez le script.'));
import { Client, Databases } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'invoices';

// ============================================================
// ✅ ATTRIBUTS À RECRÉER (supprimés mais utilisés dans le code)
// ============================================================
const ATTRIBUTES_TO_RECREATE = {
  // Utilisé dans le PDF (generatePDF)
  executionDelay: { type: 'string', size: 200, required: false },
  
  // Écrit dans les factures d'acompte (handleGenerateAdvanceInvoice)
  advancePercent: { type: 'string', size: 10, required: false },
  
  // Utilisé dans la réparation des factures (loadInvoices)
  receivedAt: { type: 'string', size: 30, required: false },
  
  // Copié dans les avoirs/accomptes
  clientBillingAddress: { type: 'string', size: 500, required: false },
  
  // Utilisé dans le PDF (generatePDF)
  paymentMethods: { type: 'string', size: 500, required: false },
  
  // Utilisé dans le PDF et la correction des factures rejetées
  paymentConditions: { type: 'string', size: 1000, required: false },
  
  // Copié dans les avoirs
  specialConditions: { type: 'string', size: 2000, required: false },
  
  // Utilisé pour les avoirs/accomptes
  originalQuoteId: { type: 'string', size: 50, required: false },
};

// ============================================================
// ✅ ATTRIBUTS QUI N'ONT PAS PU ÊTRE CRÉÉS (limite atteinte)
// ============================================================
const ATTRIBUTES_MISSING = {
  // Essentiel : adresse de l'entreprise
  companyAddress: { type: 'string', size: 500, required: false },
  
  // Essentiel : adresse du client
  clientAddress: { type: 'string', size: 500, required: false },
  
  // Essentiel : notes internes
  notes: { type: 'string', size: 5000, required: false },
};

// ============================================================
// ❌ ATTRIBUTS À NE PAS RECRÉER (supprimables)
// ============================================================
const ATTRIBUTES_TO_SKIP = [
  'companyLegalForm',
  'companyRcs',
  'insuranceName',
  'insuranceAddress',
  'insurancePolicy',
  'tradeType',
];

// ============================================================
// 🔧 FONCTIONS UTILITAIRES
// ============================================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function createAttribute(key, config) {
  try {
    const { type, size, required } = config;
    
    switch (type) {
      case 'string':
        await databases.createStringAttribute(DB_ID, COLLECTION_ID, key, size || 255, required || false);
        break;
      case 'double':
        await databases.createFloatAttribute(DB_ID, COLLECTION_ID, key, required || false);
        break;
      case 'boolean':
        await databases.createBooleanAttribute(DB_ID, COLLECTION_ID, key, required || false);
        break;
      case 'integer':
        await databases.createIntegerAttribute(DB_ID, COLLECTION_ID, key, required || false);
        break;
      default:
        console.warn(`⚠️ Type inconnu: ${type} pour ${key}`);
        return false;
    }
    
    console.log(`✅ Créé: ${key} (${type}, size: ${size || 'N/A'})`);
    await sleep(300);
    return true;
  } catch (e) {
    if (e.code === 409) {
      console.log(`⏭️  ${key} existe déjà`);
      return true;
    }
    if (e.message?.includes('maximum number')) {
      console.error(`🚨 LIMITE ATTEINTE pour ${key}`);
      console.error(`   Augmentez _APP_COLLECTION_LIMIT ou supprimez plus d'attributs`);
      return false;
    }
    console.error(`❌ Erreur création ${key}:`, e.message);
    return false;
  }
}

// ============================================================
// 🚀 EXÉCUTION PRINCIPALE
// ============================================================
async function recreateAttributes() {
  console.log('🔍 Analyse de la collection invoices...\n');
  
  // 1. Lister les attributs existants
  const collection = await databases.getCollection(DB_ID, COLLECTION_ID);
  const existingAttrs = collection.attributes.map(a => a.key);
  
  console.log(`📊 Attributs existants: ${existingAttrs.length}\n`);
  
  // 2. Recréer les attributs supprimés (sauf les 6 supprimables)
  console.log('🔄 RECRÉATION DES ATTRIBUTS SUPPRIMÉS:\n');
  console.log('❌ Attributs ignorés (supprimables):');
  ATTRIBUTES_TO_SKIP.forEach(key => console.log(`   ⏭️  ${key}`));
  console.log('');
  
  let recreatedCount = 0;
  let failedCount = 0;
  
  for (const [key, config] of Object.entries(ATTRIBUTES_TO_RECREATE)) {
    if (await createAttribute(key, config)) {
      recreatedCount++;
    } else {
      failedCount++;
    }
  }
  
  console.log(`\n✅ ${recreatedCount} attribut(s) recréé(s)`);
  if (failedCount > 0) {
    console.log(`❌ ${failedCount} attribut(s) en échec`);
  }
  
  // 3. Vérifier et créer les attributs manquants
  console.log('\n🔍 VÉRIFICATION DES ATTRIBUTS MANQUANTS:\n');
  let missingCount = 0;
  
  for (const [key, config] of Object.entries(ATTRIBUTES_MISSING)) {
    if (!existingAttrs.includes(key)) {
      if (await createAttribute(key, config)) {
        missingCount++;
      } else {
        failedCount++;
      }
    } else {
      console.log(`⏭️  ${key} existe déjà`);
    }
  }
  
  if (missingCount > 0) {
    console.log(`\n✅ ${missingCount} attribut(s) manquant(s) créé(s)`);
  }
  
  // 4. Résumé final
  console.log('\n📊 RÉSUMÉ FINAL:');
  console.log(`   Attributs recréés: ${recreatedCount}`);
  console.log(`   Attributs manquants créés: ${missingCount}`);
  console.log(`   Attributs en échec: ${failedCount}`);
  console.log(`   Attributs ignorés (supprimables): ${ATTRIBUTES_TO_SKIP.length}`);
  
  if (failedCount === 0) {
    console.log('\n🎉 Tous les attributs ont été recréés avec succès !');
    console.log('\n📋 Attributs recréés:');
    Object.keys(ATTRIBUTES_TO_RECREATE).forEach(key => console.log(`   ✅ ${key}`));
    if (missingCount > 0) {
      console.log('\n📋 Attributs manquants créés:');
      Object.keys(ATTRIBUTES_MISSING).forEach(key => console.log(`   ✅ ${key}`));
    }
  } else {
    console.log('\n⚠️ Certains attributs n\'ont pas pu être créés. Vérifiez la limite.');
  }
}

recreateAttributes().catch(console.error);
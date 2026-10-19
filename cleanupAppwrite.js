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
// ✅ ATTRIBUTS NÉCESSAIRES (utilisés dans le code Invoices.tsx)
// ============================================================
const REQUIRED_ATTRIBUTES = {
  // Identifiants
  invoiceNumber: { type: 'string', size: 50, required: true },
  userId: { type: 'string', size: 50, required: true },
  teamId: { type: 'string', size: 50, required: true },
  status: { type: 'string', size: 30, required: true },
  issueDate: { type: 'string', size: 30, required: true },
  total: { type: 'double', required: true },
  
  // Dates
  dueDate: { type: 'string', size: 30 },
  paidAt: { type: 'string', size: 30 },
  
  // Financier
  subtotal: { type: 'double' },
  vatRate: { type: 'double' },
  vatAmount: { type: 'double' },
  discount: { type: 'double' },
  tax: { type: 'double' },
  deposit: { type: 'double' },
  balance: { type: 'double' },
  
  // Entreprise
  companyName: { type: 'string', size: 200 },
  companyAddress: { type: 'string', size: 500 },
  companySiret: { type: 'string', size: 20 },
  companyTva: { type: 'string', size: 50 },
  companyPhone: { type: 'string', size: 30 },
  companyEmail: { type: 'string', size: 100 },
  logoFileId: { type: 'string', size: 50 },
  
  // Client
  clientName: { type: 'string', size: 200 },
  clientAddress: { type: 'string', size: 500 },
  clientEmail: { type: 'string', size: 100 },
  clientPhone: { type: 'string', size: 30 },
  clientToken: { type: 'string', size: 50 },
  
  // Contenu
  items: { type: 'string', size: 100000 },
  payments: { type: 'string', size: 100000 },
  notes: { type: 'string', size: 5000 },
  type: { type: 'string', size: 30 },
  quoteId: { type: 'string', size: 50 },
  originalInvoiceId: { type: 'string', size: 50 },
  currencyCode: { type: 'string', size: 10 },
  
  // E-Facture
  isElectronic: { type: 'boolean' },
  transmissionStatus: { type: 'string', size: 30 },
  xmlContent: { type: 'string', size: 1000000 },
  pdfHash: { type: 'string', size: 100 },
  einvoicePlatform: { type: 'string', size: 30 },
  einvoiceFormat: { type: 'string', size: 30 },
  transmissionReference: { type: 'string', size: 200 },
};

// ============================================================
// 🗑️ ATTRIBUTS À SUPPRIMER (inutilisés dans le code)
// ============================================================
const ATTRIBUTES_TO_DELETE = [
  'companyLegalForm',
  'companyRcs',
  'insuranceName',
  'insuranceAddress',
  'insurancePolicy',
  'tradeType',
  'executionDelay',
  'advancePercent',
  'receivedAt',
  'clientBillingAddress',
  'paymentMethods',
  'paymentConditions',
  'specialConditions',
  'originalQuoteId',
];

// ============================================================
// 🔧 FONCTIONS UTILITAIRES
// ============================================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function deleteAttribute(key) {
  try {
    await databases.deleteAttribute(DB_ID, COLLECTION_ID, key);
    console.log(`🗑️  Supprimé: ${key}`);
    await sleep(300);
    return true;
  } catch (e) {
    if (e.code === 404) {
      console.log(`⏭️  ${key} n'existe pas déjà`);
      return true;
    }
    console.error(`❌ Erreur suppression ${key}:`, e.message);
    return false;
  }
}

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
    
    console.log(`✅ Créé: ${key} (${type})`);
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
async function cleanup() {
  console.log('🔍 Analyse de la collection invoices...\n');
  
  // 1. Lister les attributs existants
  const collection = await databases.getCollection(DB_ID, COLLECTION_ID);
  const existingAttrs = collection.attributes.map(a => a.key);
  
  console.log(`📊 Attributs existants: ${existingAttrs.length}`);
  console.log(`📋 Attributs nécessaires: ${Object.keys(REQUIRED_ATTRIBUTES).length}`);
  console.log(`🗑️  Attributs à supprimer: ${ATTRIBUTES_TO_DELETE.length}\n`);
  
  // 2. Supprimer les attributs inutilisés
  console.log('🗑️  SUPPRESSION DES ATTRIBUTS INUTILISÉS:\n');
  let deletedCount = 0;
  for (const key of ATTRIBUTES_TO_DELETE) {
    if (existingAttrs.includes(key)) {
      if (await deleteAttribute(key)) deletedCount++;
    } else {
      console.log(`⏭️  ${key} n'existe pas`);
    }
  }
  console.log(`\n✅ ${deletedCount} attribut(s) supprimé(s)\n`);
  
  // 3. Créer les attributs manquants
  console.log('✅ CRÉATION DES ATTRIBUTS MANQUANTS:\n');
  let createdCount = 0;
  let failedCount = 0;
  
  for (const [key, config] of Object.entries(REQUIRED_ATTRIBUTES)) {
    if (!existingAttrs.includes(key)) {
      if (await createAttribute(key, config)) {
        createdCount++;
      } else {
        failedCount++;
      }
    } else {
      console.log(`⏭️  ${key} existe déjà`);
    }
  }
  
  console.log(`\n✅ ${createdCount} attribut(s) créé(s)`);
  if (failedCount > 0) {
    console.log(`❌ ${failedCount} attribut(s) en échec`);
  }
  
  // 4. Résumé final
  console.log('\n📊 RÉSUMÉ FINAL:');
  console.log(`   Attributs supprimés: ${deletedCount}`);
  console.log(`   Attributs créés: ${createdCount}`);
  console.log(`   Attributs en échec: ${failedCount}`);
  console.log(`   Total attributs: ${existingAttrs.length - deletedCount + createdCount}`);
  
  if (failedCount === 0) {
    console.log('\n🎉 Configuration terminée avec succès !');
  } else {
    console.log('\n⚠️ Certains attributs n\'ont pas pu être créés. Vérifiez la limite.');
  }
}

cleanup().catch(console.error);
import { Client, Databases, ID } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'received_invoices';

async function createCollection() {
  console.log('🔧 Création de la collection received_invoices...\n');

  // 1. Créer la collection si elle n'existe pas
  try {
    await databases.createCollection(DB_ID, COLLECTION_ID, 'Factures Fournisseurs', [], false);
    console.log('✅ Collection created_invoices créée\n');
  } catch (e) {
    if (e.code === 409) {
      console.log('⏭️  Collection received_invoices existe déjà\n');
    } else {
      console.error('❌ Erreur création collection:', e.message);
      return;
    }
  }

  // 2. Créer tous les attributs
  const attributes = [
    // Obligatoires
    { key: 'invoiceNumber', type: 'string', size: 50, required: true },
    { key: 'supplierName', type: 'string', size: 200, required: true },
    { key: 'teamId', type: 'string', size: 50, required: true },
    { key: 'userId', type: 'string', size: 50, required: true },
    { key: 'status', type: 'string', size: 30, required: true },
    { key: 'issueDate', type: 'string', size: 30, required: true },
    { key: 'total', type: 'double', required: true },
    { key: 'tax', type: 'double', required: true },
    { key: 'subtotal', type: 'double', required: true },
    { key: 'currencyCode', type: 'string', size: 10, required: true },
    
    // Optionnels
    { key: 'supplierSiret', type: 'string', size: 20 },
    { key: 'dueDate', type: 'string', size: 30 },
    { key: 'paidAt', type: 'string', size: 30 },
    { key: 'archivedAt', type: 'string', size: 30 },
    { key: 'paymentDate', type: 'string', size: 30 },
    { key: 'paymentMethod', type: 'string', size: 50 },
    { key: 'paymentReference', type: 'string', size: 100 },
    { key: 'paidAmount', type: 'double' },
    { key: 'payments', type: 'string', size: 100000 }, // JSON array
    { key: 'format', type: 'string', size: 30 },
    { key: 'pdfFileId', type: 'string', size: 50 },
    { key: 'xmlContent', type: 'string', size: 1000000 }, // XML Factur-X
    { key: 'rejectionReason', type: 'string', size: 1000 },
    { key: 'type', type: 'string', size: 10 }, // '380' ou '381'
    { key: 'notes', type: 'string', size: 5000 },
  ];

  console.log('📝 Création des attributs...\n');
  
  for (const attr of attributes) {
    try {
      switch (attr.type) {
        case 'string':
          await databases.createStringAttribute(
            DB_ID, COLLECTION_ID, attr.key, attr.size || 255, attr.required || false
          );
          break;
        case 'double':
          await databases.createFloatAttribute(
            DB_ID, COLLECTION_ID, attr.key, attr.required || false
          );
          break;
        case 'boolean':
          await databases.createBooleanAttribute(
            DB_ID, COLLECTION_ID, attr.key, attr.required || false
          );
          break;
      }
      console.log(`✅ ${attr.key} (${attr.type}${attr.size ? `, ${attr.size}` : ''})`);
      await new Promise(r => setTimeout(r, 200)); // Anti rate-limit
    } catch (e) {
      if (e.code === 409) {
        console.log(`⏭️  ${attr.key} existe déjà`);
      } else if (e.message?.includes('maximum number')) {
        console.error(`🚨 LIMITE ATTEINTE pour ${attr.key}`);
        console.error(`   Augmentez _APP_COLLECTION_LIMIT ou supprimez des attributs inutilisés`);
      } else {
        console.error(`❌ Erreur ${attr.key}:`, e.message);
      }
    }
  }

  // 3. Créer les index pour les requêtes fréquentes
  console.log('\n📊 Création des index...\n');
  
  const indexes = [
    { key: 'teamId_idx', attributes: ['teamId'], orders: ['ASC'] },
    { key: 'status_idx', attributes: ['status'], orders: ['ASC'] },
    { key: 'supplierName_idx', attributes: ['supplierName'], orders: ['ASC'] },
    { key: 'invoiceNumber_idx', attributes: ['invoiceNumber'], orders: ['ASC'] },
    { key: 'issueDate_idx', attributes: ['issueDate'], orders: ['DESC'] },
  ];

  for (const idx of indexes) {
    try {
      await databases.createIndex(
        DB_ID, COLLECTION_ID, idx.key, 'key', idx.attributes, idx.orders
      );
      console.log(`✅ Index ${idx.key}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      if (e.code === 409) {
        console.log(`⏭️  Index ${idx.key} existe déjà`);
      } else {
        console.error(`❌ Erreur index ${idx.key}:`, e.message);
      }
    }
  }

  console.log('\n🎉 Collection received_invoices prête !');
  console.log('\n📋 Résumé:');
  console.log(`   Collection: ${COLLECTION_ID}`);
  console.log(`   Attributs: ${attributes.length}`);
  console.log(`   Index: ${indexes.length}`);
}

createCollection().catch(console.error);
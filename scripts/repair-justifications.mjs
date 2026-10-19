// scripts/repair-justifications.mjs
// 🔍 Scanne expense_justifications et répare les bucketId incorrects
// Usage : node scripts/repair-justifications.mjs

import { Client, Databases, Storage, Query } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

// ⚙️ Configuration (depuis .env)
const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY); // ⚠️ Clé API admin requise

const databases = new Databases(client);
const storage = new Storage(client);

const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = 'expense_justifications';

// 🗂️ Buckets à tester (adaptés à votre projet)
const BUCKETS_TO_CHECK = [
  'justifications',
  'expense-receipts',
  'documents',
  'company_logos',
];

// 📊 Statistiques
const stats = {
  total: 0,
  found: 0,
  moved: 0,
  orphans: 0,
  errors: 0,
};

async function findFileBucket(fileId) {
  for (const bucketId of BUCKETS_TO_CHECK) {
    try {
      await storage.getFile(bucketId, fileId);
      return bucketId;
    } catch (error) {
      if (error.code === 404) continue;
      console.warn(`⚠️  Erreur bucket ${bucketId}:`, error.message);
    }
  }
  return null;
}

async function repairJustifications() {
  console.log('🚀 Démarrage du scan des justificatifs...\n');
  
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.limit(limit),
      Query.offset(offset),
    ]);
    
    const docs = response.documents;
    stats.total += docs.length;
    
    if (docs.length === 0) break;
    
    for (const doc of docs) {
      const { $id, fileId, bucketId, fileName } = doc;
      
      if (!fileId) {
        console.warn(`⚠️  Document ${$id} sans fileId`);
        stats.errors++;
        continue;
      }
      
      // 1. Vérifier dans le bucket déclaré
      let foundBucket = null;
      try {
        await storage.getFile(bucketId, fileId);
        foundBucket = bucketId;
      } catch (error) {
        if (error.code !== 404) {
          console.error(`❌ Erreur inattendue pour ${$id}:`, error.message);
          stats.errors++;
          continue;
        }
      }
      
      // 2. Si absent, chercher dans les autres buckets
      if (!foundBucket) {
        foundBucket = await findFileBucket(fileId);
      }
      
      // 3. Résultat
      if (foundBucket) {
        if (foundBucket !== bucketId) {
          // ✅ Réparer le bucketId
          console.log(`🔄 ${fileName}`);
          console.log(`   fileId: ${fileId}`);
          console.log(`   ${bucketId} → ${foundBucket}`);
          
          try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_ID, $id, {
              bucketId: foundBucket,
            });
            stats.moved++;
            console.log(`   ✅ Corrigé\n`);
          } catch (error) {
            console.error(`   ❌ Erreur update:`, error.message);
            stats.errors++;
          }
        } else {
          stats.found++;
        }
      } else {
        // ❌ Orphelin
        console.log(`🗑️  ORPHELIN: ${fileName}`);
        console.log(`   fileId: ${fileId}`);
        console.log(`   bucketId: ${bucketId}`);
        console.log(`   ⚠️  Fichier introuvable dans tous les buckets\n`);
        stats.orphans++;
      }
    }
    
    offset += limit;
  }
}

async function main() {
  try {
    await repairJustifications();
    
    console.log('\n═══════════════════════════════════════');
    console.log('📊 RAPPORT FINAL');
    console.log('═══════════════════════════════════════');
    console.log(`Total documents     : ${stats.total}`);
    console.log(`✅ Fichiers OK       : ${stats.found}`);
    console.log(`🔄 BucketId corrigés : ${stats.moved}`);
    console.log(`🗑️  Orphelins         : ${stats.orphans}`);
    console.log(`❌ Erreurs           : ${stats.errors}`);
    console.log('═══════════════════════════════════════\n');
    
    if (stats.orphans > 0) {
      console.log('💡 Pour supprimer les orphelins, relancez avec :');
      console.log('   node scripts/repair-justifications.mjs --delete-orphans\n');
    }
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
}

main();
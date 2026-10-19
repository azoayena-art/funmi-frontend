// scripts/cleanup-orphans.mjs
// 🗑️ Supprime toutes les entrées expense_justifications dont le fichier n'existe plus
// Usage: node scripts/cleanup-orphans.mjs

import { Client, Databases, Storage, Query } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);

const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const BUCKETS = ['justifications', 'expense-receipts', 'documents', 'company_logos'];

async function fileExistsInAnyBucket(fileId, preferredBucket) {
  const toTest = preferredBucket 
    ? [preferredBucket, ...BUCKETS.filter(b => b !== preferredBucket)]
    : BUCKETS;
  
  for (const bucket of toTest) {
    try {
      await storage.getFile(bucket, fileId);
      return { exists: true, bucket };
    } catch (e) {
      if (e.code !== 404) console.warn(`⚠️  ${bucket}: ${e.message}`);
    }
  }
  return { exists: false };
}

async function main() {
  console.log('🗑️  Nettoyage des justificatifs orphelins...\n');
  
  const docs = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.limit(100),
      Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    docs.push(...res.documents);
    offset += 100;
  }
  
  console.log(`📎 ${docs.length} justificatif(s) à vérifier\n`);
  
  let orphans = 0, deleted = 0, valid = 0;
  
  for (const doc of docs) {
    const { $id, fileId, bucketId, fileName } = doc;
    
    if (!fileId) {
      console.warn(`⚠️  ${fileName}: pas de fileId → suppression`);
      await databases.deleteDocument(DATABASE_ID, 'expense_justifications', $id);
      deleted++;
      orphans++;
      continue;
    }
    
    const { exists, bucket } = await fileExistsInAnyBucket(fileId, bucketId);
    
    if (!exists) {
      console.log(`🗑️  ORPHELIN: ${fileName} (fileId: ${fileId})`);
      try {
        await databases.deleteDocument(DATABASE_ID, 'expense_justifications', $id);
        deleted++;
      } catch (e) {
        console.error(`   ❌ Erreur suppression:`, e.message);
      }
      orphans++;
    } else {
      valid++;
      if (bucket !== bucketId) {
        console.log(`🔄 ${fileName}: bucket ${bucketId} → ${bucket} (correction)`);
        await databases.updateDocument(DATABASE_ID, 'expense_justifications', $id, { bucketId: bucket });
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RÉSULTAT');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Fichiers valides : ${valid}`);
  console.log(`🗑️  Orphelins        : ${orphans}`);
  console.log(`✅ Supprimés        : ${deleted}`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
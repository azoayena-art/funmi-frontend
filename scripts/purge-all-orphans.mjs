// scripts/purge-all-orphans.mjs
// 🗑️ Supprime TOUTES les entrées orphelines de expense_justifications
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

async function fileExists(fileId, preferredBucket) {
  const toTest = preferredBucket
    ? [preferredBucket, ...BUCKETS.filter(b => b !== preferredBucket)]
    : BUCKETS;

  for (const bucket of toTest) {
    try {
      await storage.getFile(bucket, fileId);
      return true;
    } catch (e) {
      if (e.code === 404) continue;
    }
  }
  return false;
}

async function main() {
  console.log('🗑️  PURGE COMPLÈTE des justificatifs orphelins\n');
  console.log('═'.repeat(60));

  // 1. Récupérer tous les justificatifs
  const allDocs = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.limit(100),
      Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    allDocs.push(...res.documents);
    offset += 100;
  }

  console.log(`📎 Total justificatifs en base : ${allDocs.length}\n`);

  let valid = 0;
  let orphans = [];

  // 2. Vérifier chaque fichier
  for (const doc of allDocs) {
    const exists = await fileExists(doc.fileId, doc.bucketId);
    if (exists) {
      valid++;
      console.log(`✅ ${doc.fileName}`);
    } else {
      orphans.push(doc);
      console.log(`❌ ${doc.fileName} (fileId: ${doc.fileId})`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Fichiers valides : ${valid}`);
  console.log(`❌ Orphelins trouvés : ${orphans.length}`);
  console.log('═'.repeat(60) + '\n');

  if (orphans.length === 0) {
    console.log('✨ Aucun orphelin à supprimer !');
    return;
  }

  // 3. Confirmation
  console.log('⚠️  Les entrées suivantes vont être supprimées de la base :\n');
  orphans.forEach((doc, i) => {
    console.log(`   ${i + 1}. ${doc.fileName} (${doc.fileId})`);
  });

  console.log('\n💡 Tapez "OUI" pour confirmer la suppression :');
  
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question('> ', resolve);
  });
  rl.close();

  if (answer.trim().toUpperCase() !== 'OUI') {
    console.log('\n❌ Opération annulée');
    return;
  }

  // 4. Suppression
  console.log('\n🗑️  Suppression en cours...\n');
  let deleted = 0;
  let errors = 0;

  for (const doc of orphans) {
    try {
      await databases.deleteDocument(DATABASE_ID, 'expense_justifications', doc.$id);
      console.log(`✅ Supprimé : ${doc.fileName}`);
      deleted++;
    } catch (e) {
      console.error(`❌ Erreur : ${doc.fileName} - ${e.message}`);
      errors++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RÉSULTAT FINAL');
  console.log('═'.repeat(60));
  console.log(`✅ Supprimés : ${deleted}`);
  console.log(`❌ Erreurs   : ${errors}`);
  console.log('═'.repeat(60) + '\n');

  if (deleted > 0) {
    console.log('🎉 Nettoyage terminé !');
    console.log('👉 Rechargez votre application (Ctrl+Shift+R)');
    console.log('👉 Uploadez de nouveaux justificatifs');
  }
}

main().catch(console.error);
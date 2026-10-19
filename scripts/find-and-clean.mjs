// scripts/find-and-clean.mjs
// 🔍 Cherche un fichier dans TOUS les buckets, sinon supprime l'entrée DB
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

const FILE_ID = '6ad0791800276d54bd39';
const BUCKETS = ['justifications', 'expense-receipts', 'documents', 'company_logos'];

async function main() {
  console.log(`🔍 Recherche du fichier ${FILE_ID} dans tous les buckets...\n`);
  
  let foundBucket = null;
  
  for (const bucket of BUCKETS) {
    try {
      const file = await storage.getFile(bucket, FILE_ID);
      console.log(`✅ Fichier trouvé dans bucket: ${bucket}`);
      console.log(`   Nom: ${file.name}`);
      console.log(`   Taille: ${(file.sizeOriginal / 1024).toFixed(2)} KB`);
      console.log(`   Permissions: ${file.$permissions.join(', ')}`);
      foundBucket = bucket;
      break;
    } catch (e) {
      if (e.code === 404) {
        console.log(`❌ ${bucket} — non trouvé`);
      } else {
        console.error(`⚠️  ${bucket}: ${e.message}`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  
  if (!foundBucket) {
    console.log('❌ Fichier INEXISTANT dans tous les buckets');
    console.log('🗑️  Suppression des entrées DB orphelines...\n');
    
    const docs = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.equal('fileId', FILE_ID),
      Query.limit(10),
    ]);
    
    let deleted = 0;
    for (const doc of docs.documents) {
      try {
        await databases.deleteDocument(DATABASE_ID, 'expense_justifications', doc.$id);
        console.log(`✅ Entrée supprimée: ${doc.fileName || doc.$id}`);
        deleted++;
      } catch (e) {
        console.error(`❌ Erreur suppression: ${e.message}`);
      }
    }
    
    console.log(`\n✅ ${deleted} entrée(s) orpheline(s) supprimée(s)`);
    console.log('🎯 Rechargez la page — le fichier fantôme a disparu');
  } else {
    console.log(`✅ Fichier présent dans ${foundBucket}`);
    console.log('🔧 Vous pouvez maintenant corriger ses permissions');
  }
  
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
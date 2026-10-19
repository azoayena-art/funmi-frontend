// scripts/delete-problem-file.mjs
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
const BUCKET_ID = 'justifications';

async function main() {
  console.log(`🗑️  Suppression du fichier ${FILE_ID}...\n`);
  
  // 1. Supprimer du storage
  try {
    await storage.deleteFile(BUCKET_ID, FILE_ID);
    console.log('✅ Fichier supprimé du storage');
  } catch (e) {
    console.log(`⚠️  Storage: ${e.message}`);
  }
  
  // 2. Supprimer les entrées DB qui référencent ce fichier
  const docs = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
    Query.equal('fileId', FILE_ID),
    Query.limit(10),
  ]);
  
  for (const doc of docs.documents) {
    await databases.deleteDocument(DATABASE_ID, 'expense_justifications', doc.$id);
    console.log(`✅ Entrée DB supprimée: ${doc.fileName}`);
  }
  
  console.log('\n✅ Nettoyage terminé. Rechargez la page et uploadez un nouveau fichier.');
}

main().catch(console.error);
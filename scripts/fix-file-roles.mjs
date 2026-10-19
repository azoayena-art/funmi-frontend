// scripts/fix-file-roles.mjs
import { Client, Databases, Storage, Query, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID;

async function main() {
  console.log('🔧 Correction des rôles fichiers...\n');
  
  const docs = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.limit(100), Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    docs.push(...res.documents);
    offset += 100;
  }
  
  let fixed = 0;
  for (const doc of docs) {
    const { fileId, bucketId, fileName, teamId } = doc;
    const bucket = bucketId || 'justifications';
    
    try {
      // Remplacer users par any pour la lecture
      await storage.updateFile(bucket, fileId, undefined, [
        Permission.read(Role.any()),
        Permission.update(Role.team(teamId)),
        Permission.delete(Role.team(teamId)),
      ]);
      console.log(`✅ ${fileName}`);
      fixed++;
    } catch (e) {
      console.error(`❌ ${fileName}: ${e.message}`);
    }
  }
  
  console.log(`\n✅ ${fixed} fichier(s) corrigés`);
}

main();
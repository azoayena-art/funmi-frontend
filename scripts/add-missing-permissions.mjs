// scripts/add-missing-permissions.mjs
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
  console.log('🔧 Ajout des permissions manquantes...\n');
  
  const justifications = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.limit(100),
      Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    justifications.push(...res.documents);
    offset += 100;
  }
  
  console.log(`📎 ${justifications.length} justificatif(s) à traiter\n`);
  
  let fixed = 0, errors = 0;
  
  for (const justif of justifications) {
    const { fileId, bucketId, fileName, teamId, $id } = justif;
    const actualBucket = bucketId || 'justifications';
    
    if (!fileId || !teamId) {
      console.warn(`⚠️  ${fileName}: données manquantes`);
      errors++;
      continue;
    }
    
    try {
      // ✅ Ajouter les permissions team
      await storage.updateFile(
        actualBucket,
        fileId,
        undefined, // nom inchangé
        [
          Permission.read(Role.team(teamId)),
          Permission.update(Role.team(teamId)),
          Permission.delete(Role.team(teamId)),
        ]
      );
      
      console.log(`✅ ${fileName}`);
      fixed++;
    } catch (error) {
      if (error.code === 404) {
        console.warn(`🗑️  ${fileName} — fichier absent`);
      } else {
        console.error(`❌ ${fileName}:`, error.message);
        errors++;
      }
    }
  }
  
  console.log(`\n✅ Corrigés: ${fixed} | ❌ Erreurs: ${errors}`);
}

main().catch(console.error);
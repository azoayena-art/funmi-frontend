// scripts/fix-file-permissions-v2.mjs
// 🔧 Retire Role.users() et garde uniquement Role.team()
// Usage: node scripts/fix-file-permissions-v2.mjs

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
  console.log('🔧 Correction des permissions fichiers...\n');
  
  // Récupérer tous les justificatifs
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
    const { $id, fileId, bucketId, fileName, teamId } = justif;
    const actualBucket = bucketId || 'justifications';
    const appwriteTeamId = teamId;
    
    if (!appwriteTeamId || !fileId) {
      console.warn(`⚠️  ${fileName}: données manquantes`);
      errors++;
      continue;
    }
    
    try {
      // ✅ NOUVELLES PERMISSIONS : uniquement team (sans Role.users())
      const newPermissions = [
        Permission.read(Role.team(appwriteTeamId)),
        Permission.update(Role.team(appwriteTeamId)),
        Permission.delete(Role.team(appwriteTeamId)),
      ];
      
      await storage.updateFile(
        actualBucket,
        fileId,
        undefined,
        newPermissions
      );
      
      console.log(`✅ ${fileName} — permissions corrigées`);
      console.log(`   Bucket: ${actualBucket} | Team: ${appwriteTeamId}`);
      fixed++;
    } catch (error) {
      if (error.code === 404) {
        console.warn(`🗑️  ${fileName} — fichier introuvable`);
      } else {
        console.error(`❌ ${fileName}:`, error.message);
        errors++;
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RÉSULTAT');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Fichiers corrigés : ${fixed}`);
  console.log(`❌ Erreurs           : ${errors}`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
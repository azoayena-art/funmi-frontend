// scripts/fix-all-permissions.mjs
// 🛠️ Remplace TOUTES les permissions "users" par "any" dans tous les fichiers
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
  console.log('🛠️  Correction complète des permissions...\n');
  
  // 1. Récupérer tous les justificatifs
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
  
  console.log(`📎 ${docs.length} fichier(s) à traiter\n`);
  
  let fixed = 0, skipped = 0, errors = 0;
  
  for (const doc of docs) {
    const { fileId, bucketId, fileName, teamId } = doc;
    const bucket = bucketId || 'justifications';
    
    try {
      // Récupérer les permissions actuelles
      const file = await storage.getFile(bucket, fileId);
      const currentPerms = file.$permissions || [];
      
      // Vérifier si "users" est présent
      const hasUsers = currentPerms.some(p => p.includes('"users"'));
      
      if (hasUsers) {
        console.log(`🔄 ${fileName} — contient "users", remplacement...`);
        
        // Nouvelles permissions : remplacer users par any
        const newPerms = [
          Permission.read(Role.any()),           // Lecture publique (accepté par bucket)
          Permission.update(Role.team(teamId)),  // Modification équipe
          Permission.delete(Role.team(teamId)),  // Suppression équipe
        ];
        
        await storage.updateFile(bucket, fileId, undefined, newPerms);
        console.log(`   ✅ Corrigé`);
        fixed++;
      } else {
        console.log(`✓  ${fileName} — OK (pas de "users")`);
        skipped++;
      }
    } catch (e) {
      if (e.code === 404) {
        console.log(`⚠️  ${fileName} — fichier absent`);
      } else {
        console.error(`❌ ${fileName}: ${e.message}`);
        errors++;
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RÉSULTAT');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Corrigés : ${fixed}`);
  console.log(`✓  Déjà OK   : ${skipped}`);
  console.log(`❌ Erreurs   : ${errors}`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
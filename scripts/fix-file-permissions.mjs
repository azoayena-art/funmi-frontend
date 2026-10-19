// scripts/fix-file-permissions.mjs — Version simplifiée
// 🔧 Utilise directement teamId comme appwriteTeamId
// Usage : node scripts/fix-file-permissions.mjs

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
const BUCKET_ID = 'justifications';

async function main() {
  console.log('🔧 Réparation des permissions de fichiers...\n');
  
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
  
  let fixed = 0;
  let errors = 0;
  const teamIdsSeen = new Set();
  
  for (const justif of justifications) {
    const { $id, fileId, bucketId, fileName, teamId } = justif;
    const actualBucket = bucketId || BUCKET_ID;
    
    // ✅ Utiliser teamId directement comme appwriteTeamId
    const appwriteTeamId = teamId;
    teamIdsSeen.add(teamId);
    
    if (!appwriteTeamId) {
      console.warn(`⚠️  ${fileName}: pas de teamId`);
      errors++;
      continue;
    }
    
    try {
      // Mettre à jour les permissions du fichier
      await storage.updateFile(
        actualBucket,
        fileId,
        undefined, // nom inchangé
        [
          Permission.read(Role.team(appwriteTeamId)),
          Permission.read(Role.users()),
          Permission.update(Role.team(appwriteTeamId)),
          Permission.delete(Role.team(appwriteTeamId)),
        ]
      );
      
      console.log(`✅ ${fileName}`);
      console.log(`   bucket: ${actualBucket} | fileId: ${fileId}`);
      console.log(`   teamId: ${appwriteTeamId}`);
      fixed++;
    } catch (error) {
      if (error.code === 404) {
        console.warn(`🗑️  ${fileName} — fichier introuvable dans bucket "${actualBucket}"`);
        // Essayer les autres buckets
        const otherBuckets = ['expense-receipts', 'documents', 'justificatifs'];
        let found = false;
        for (const altBucket of otherBuckets) {
          try {
            await storage.updateFile(
              altBucket,
              fileId,
              undefined,
              [
                Permission.read(Role.team(appwriteTeamId)),
                Permission.read(Role.users()),
                Permission.update(Role.team(appwriteTeamId)),
                Permission.delete(Role.team(appwriteTeamId)),
              ]
            );
            console.log(`   ✅ Trouvé dans bucket alternatif: ${altBucket}`);
            
            // Mettre à jour le document DB
            await databases.updateDocument(DATABASE_ID, 'expense_justifications', $id, {
              bucketId: altBucket,
            });
            console.log(`   ✅ bucketId mis à jour en DB`);
            fixed++;
            found = true;
            break;
          } catch {}
        }
        if (!found) errors++;
      } else {
        console.error(`❌ ${fileName}:`, error.message);
        errors++;
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RÉSULTAT');
  console.log('═══════════════════════════════════════');
  console.log(`👥 Team IDs trouvés    : ${[...teamIdsSeen].join(', ')}`);
  console.log(`✅ Permissions corrigées : ${fixed}`);
  console.log(`❌ Erreurs              : ${errors}`);
  console.log('═══════════════════════════════════════\n');
  
  // Afficher les buckets disponibles
  try {
    const buckets = await storage.listBuckets();
    console.log('🗂️  Buckets disponibles :');
    buckets.buckets.forEach(b => console.log(`   - ${b.$id} (${b.name})`));
  } catch (e) {
    console.warn('⚠️  Impossible de lister les buckets:', e.message);
  }
}

main().catch(console.error);
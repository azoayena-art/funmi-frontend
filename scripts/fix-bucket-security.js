// scripts/fix-bucket-security.js
import { Client, Storage } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

// Buckets à corriger
const bucketsToFix = ['justifications', 'documents'];

async function fixBuckets() {
  console.log('🔧 Correction de la sécurité des buckets...\n');

  for (const bucketId of bucketsToFix) {
    try {
      // 1. Récupérer le bucket actuel
      const bucket = await storage.getBucket(bucketId);
      console.log(`📦 Bucket "${bucketId}" :`);
      console.log(`   Nom: ${bucket.name}`);
      console.log(`   File Security actuel: ${bucket.fileSecurity ? '✅ activé' : '❌ désactivé'}`);

      // 2. Permissions au niveau bucket (users authentifiés peuvent créer/lire)
      const permissions = [
        'create("users")',
        'read("users")',
      ];

      // 3. Activer File Security + permissions
      await storage.updateBucket(
        bucketId,                    // bucketId
        bucket.name,                 // name (obligatoire)
        permissions,                 // permissions
        true                         // fileSecurity = TRUE
      );

      console.log(`   ✅ File Security activé`);
      console.log(`   ✅ Permissions bucket : users → create, read\n`);
    } catch (e) {
      console.error(`   ❌ Erreur sur "${bucketId}" : ${e.message}\n`);
    }
  }

  // Vérification finale
  console.log('🔍 Vérification finale...\n');
  const response = await storage.listBuckets();
  response.buckets.forEach(b => {
    console.log(`   📦 "${b.$id}" : File Security ${b.fileSecurity ? '✅' : '❌'}`);
  });

  console.log('\n🎉 Terminé !');
}

fixBuckets().catch(console.error);
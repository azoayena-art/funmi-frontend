// scripts/check-bucket-permissions.mjs
// 🔍 Affiche les permissions exactes du bucket justifications
import { Client, Storage } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

async function main() {
  console.log('🔍 Inspection du bucket justifications...\n');
  
  try {
    const bucket = await storage.getBucket('justifications');
    
    console.log('📦 Bucket:', bucket.name);
    console.log('🆔 ID:', bucket.$id);
    console.log('🔐 File Security:', bucket.fileSecurity ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ');
    console.log('📏 Taille max:', bucket.maximumFileSize, 'bytes');
    console.log('\n🔑 Permissions actuelles:');
    
    if (bucket.$permissions.length === 0) {
      console.log('   ⚠️  AUCUNE permission configurée !');
    } else {
      bucket.$permissions.forEach((perm, i) => {
        console.log(`   ${i + 1}. ${perm}`);
      });
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('🎯 PERMISSIONS REQUISES POUR QUE ÇA FONCTIONNE');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Dans Appwrite Console → Storage → justifications → Settings:');
    console.log('');
    console.log('1. File Security:');
    console.log('   → ☐ DÉSACTIVÉ (décocher)');
    console.log('');
    console.log('2. Permissions à ajouter (Add a role):');
    console.log('   ├─ Any     → Read ✅');
    console.log('   ├─ Users   → Read ✅ + Create ✅');
    console.log('   └─ Team    → Read ✅ + Create ✅ + Update ✅ + Delete ✅');
    console.log('');
    console.log('═'.repeat(60));
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
}

main();
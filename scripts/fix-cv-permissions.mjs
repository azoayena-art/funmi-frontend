// scripts/fix-cv-permissions.mjs
import { Client, Storage, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

const FILE_ID = '6acfcb6f003122e7011e'; // Remplacez par le vrai fileId
const BUCKET_ID = 'justifications';

async function main() {
  console.log('🔍 Vérification des permissions actuelles...\n');
  
  try {
    const file = await storage.getFile(BUCKET_ID, FILE_ID);
    console.log('📄 Fichier:', file.name);
    console.log('🔐 Permissions actuelles:');
    file.$permissions.forEach((perm, i) => {
      console.log(`   ${i + 1}. ${perm}`);
    });
    
    console.log('\n🔧 Application des nouvelles permissions...');
    
    // ✅ Nouvelles permissions : any() pour read (accepté par le bucket)
    const newPermissions = [
      Permission.read(Role.any()),
      Permission.update(Role.team('6ac4c02c00293611f4a1')), // Remplacez par votre teamId
      Permission.delete(Role.team('6ac4c02c00293611f4a1')),
    ];
    
    await storage.updateFile(BUCKET_ID, FILE_ID, undefined, newPermissions);
    
    console.log('\n✅ Permissions mises à jour avec succès !');
    console.log('   read("any")');
    console.log('   update("team(...)")');
    console.log('   delete("team(...)")');
    
    console.log('\n🎯 Rechargez la page et testez la preview');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
    console.error('   Code:', e.code);
    
    if (e.code === 404) {
      console.log('\n💡 Le fichier n\'existe plus. Utilisez le bouton "Remplacer" dans l\'application.');
    }
  }
}

main();
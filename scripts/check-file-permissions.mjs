// scripts/check-file-permissions.mjs
// 🔍 Affiche les permissions d'un fichier spécifique
import { Client, Storage } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

// Remplacez par votre fileId problématique
const FILE_ID = '6ad0791800276d54bd39';
const BUCKET_ID = 'justifications';

async function main() {
  try {
    const file = await storage.getFile(BUCKET_ID, FILE_ID);
    console.log('📄 Fichier:', file.name);
    console.log('🔐 Permissions actuelles:');
    file.$permissions.forEach((perm, i) => {
      console.log(`   ${i + 1}. ${perm}`);
    });
    
    // Vérifier si "users" est présent
    const hasUsers = file.$permissions.some(p => p.includes('users'));
    if (hasUsers) {
      console.log('\n⚠️  Le fichier contient "users" → doit être remplacé par "any"');
    } else {
      console.log('\n✅ Le fichier ne contient pas "users"');
    }
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
}

main();
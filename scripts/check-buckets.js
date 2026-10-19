import { Client, Storage } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

async function checkBuckets() {
  console.log('🔍 Vérification des buckets...\n');
  try {
    const response = await storage.listBuckets();
    console.log(`✅ ${response.total} bucket(s) trouvé(s) :\n`);
    response.buckets.forEach(b => {
      console.log(`   📦 ID: "${b.$id}"`);
      console.log(`      Nom: ${b.name}`);
      console.log(`      File Security: ${b.fileSecurity ? '✅ activé' : '❌ désactivé'}`);
      console.log(`      Taille max: ${(b.maximumFileSize / 1024 / 1024).toFixed(1)} MB`);
      console.log('');
    });
    
    const bucketEnv = process.env.VITE_APPWRITE_BUCKET_ID;
    const found = response.buckets.find(b => b.$id === bucketEnv);
    if (found) {
      console.log(`✅ Le bucket "${bucketEnv}" du .env existe bien !`);
    } else {
      console.log(`❌ Le bucket "${bucketEnv}" du .env N'EXISTE PAS !`);
      console.log(`   Créez-le ou mettez à jour VITE_APPWRITE_BUCKET_ID dans .env`);
    }
    
    // Vérifier le bucket 'justifications'
    const justifBucket = response.buckets.find(b => b.$id === 'justifications');
    if (justifBucket) {
      console.log(`✅ Le bucket "justifications" existe !`);
    } else {
      console.log(`❌ Le bucket "justifications" N'EXISTE PAS !`);
      console.log(`   Créez-le avec l'ID exact : "justifications"`);
    }
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
}

checkBuckets();
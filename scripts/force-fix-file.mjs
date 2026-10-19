// scripts/force-fix-file.mjs
import { Client, Storage, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);

const FILE_ID = '6ad0791800276d54bd39';
const BUCKET_ID = 'justifications';

async function main() {
  console.log('🔍 Vérification AVANT:');
  const before = await storage.getFile(BUCKET_ID, FILE_ID);
  console.log('   Permissions:', before.$permissions);
  
  console.log('\n🔧 Application des nouvelles permissions...');
  
  // ✅ UNIQUEMENT any (pas users, pas team)
  await storage.updateFile(BUCKET_ID, FILE_ID, undefined, [
    Permission.read(Role.any()),
    Permission.update(Role.any()),
    Permission.delete(Role.any()),
  ]);
  
  console.log('\n🔍 Vérification APRÈS:');
  const after = await storage.getFile(BUCKET_ID, FILE_ID);
  console.log('   Permissions:', after.$permissions);
  
  console.log('\n✅ Fichier corrigé ! Testez la preview maintenant.');
}

main().catch(console.error);
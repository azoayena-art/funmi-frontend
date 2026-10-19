// scripts/add-users-permission.mjs
// 📝 Ajoute la permission "users: read" à tous les fichiers justificatifs
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
  console.log('🔐 Ajout permission "users" aux fichiers...\n');
  
  const docs = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.limit(100),
      Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    docs.push(...res.documents);
    offset += 100;
  }
  
  console.log(`📎 ${docs.length} fichiers à traiter\n`);
  
  let updated = 0;
  
  for (const doc of docs) {
    const { fileId, bucketId, fileName } = doc;
    const bucket = bucketId || 'justifications';
    
    try {
      // Récupérer le fichier pour voir ses permissions actuelles
      const file = await storage.getFile(bucket, fileId);
      const currentPerms = file.$permissions || [];
      
      // Vérifier si "users" a déjà read
      const hasUsersRead = currentPerms.some(p => p.includes('users') && p.includes('read'));
      
      if (!hasUsersRead) {
        // Ajouter read pour users
        const newPerms = [
          ...currentPerms,
          Permission.read(Role.users()),
        ];
        
        await storage.updateFile(bucket, fileId, undefined, newPerms);
        console.log(`✅ ${fileName} → ajouté users:read`);
        updated++;
      } else {
        console.log(`✓  ${fileName} → users:read déjà présent`);
      }
    } catch (e) {
      console.error(`❌ ${fileName}:`, e.message);
    }
  }
  
  console.log(`\n✅ ${updated} fichier(s) mis à jour`);
}

main().catch(console.error);
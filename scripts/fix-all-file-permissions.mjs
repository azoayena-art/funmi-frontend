// scripts/fix-all-file-permissions.mjs
// 🔐 Corrige les permissions de TOUS les fichiers justificatifs
// Remplace read("users") par read("any") pour être compatible avec le bucket
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
const TEAM_ID = '6ac4c02c00293611f4a1'; // ⚠️ Remplacez par votre Team ID

async function main() {
  console.log('🔐 Correction des permissions de tous les fichiers...\n');
  console.log('═'.repeat(60));

  // 1. Récupérer tous les justificatifs
  const allDocs = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
      Query.limit(100),
      Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    allDocs.push(...res.documents);
    offset += 100;
  }

  console.log(`📎 ${allDocs.length} fichier(s) à traiter\n`);

  let fixed = 0;
  let errors = 0;

  // 2. Corriger les permissions de chaque fichier
  for (const doc of allDocs) {
    const { fileId, bucketId, fileName } = doc;
    const bucket = bucketId || 'justifications';

    try {
      // Lire les permissions actuelles
      const file = await storage.getFile(bucket, fileId);
      const currentPerms = file.$permissions;
      
      console.log(`📄 ${fileName}`);
      console.log(`   Permissions actuelles : ${JSON.stringify(currentPerms)}`);

      // Nouvelles permissions : read("any") + update/delete pour team
      const newPermissions = [
        Permission.read(Role.any()),
        Permission.update(Role.team(TEAM_ID)),
        Permission.delete(Role.team(TEAM_ID)),
      ];

      await storage.updateFile(bucket, fileId, undefined, newPermissions);

      console.log(`   ✅ Corrigé : read("any"), update("team"), delete("team")\n`);
      fixed++;
    } catch (e) {
      console.error(`   ❌ Erreur : ${e.message}\n`);
      errors++;
    }
  }

  console.log('═'.repeat(60));
  console.log('📊 RÉSULTAT');
  console.log('═'.repeat(60));
  console.log(`✅ Fichiers corrigés : ${fixed}`);
  console.log(`❌ Erreurs           : ${errors}`);
  console.log('═'.repeat(60) + '\n');

  if (fixed > 0) {
    console.log('🎉 Permissions corrigées !');
    console.log('👉 Rechargez la page (Ctrl+Shift+R)');
    console.log('👉 Testez la preview');
  }
}

main().catch(console.error);
// scripts/fix-documents-bucket.mjs
// 🔐 Corrige les permissions de TOUS les fichiers du bucket documents
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
const TEAM_ID = '6ac4c02c00293611f4a1'; // ⚠️ Votre Team ID
const BUCKET_ID = 'documents';

async function fixFilePermissions(fileId, bucketId) {
  const newPermissions = [
    Permission.read(Role.any()),
    Permission.update(Role.team(TEAM_ID)),
    Permission.delete(Role.team(TEAM_ID)),
  ];
  await storage.updateFile(bucketId, fileId, undefined, newPermissions);
}

async function main() {
  console.log(`🔐 Correction des permissions du bucket ${BUCKET_ID}...\n`);

  // 1. Corriger TOUS les fichiers du bucket (liste directe)
  let fixed = 0, errors = 0, offset = 0;
  
  while (true) {
    const res = await storage.listFiles(BUCKET_ID, [
      Query.limit(100),
      Query.offset(offset),
    ]);
    
    if (res.files.length === 0) break;
    
    for (const file of res.files) {
      try {
        await fixFilePermissions(file.$id, BUCKET_ID);
        console.log(`✅ ${file.name}`);
        fixed++;
      } catch (e) {
        console.error(`❌ ${file.name}: ${e.message}`);
        errors++;
      }
    }
    
    offset += 100;
  }

  console.log(`\n📦 Fichiers du bucket corrigés : ${fixed} | Erreurs : ${errors}`);

  // 2. Corriger aussi les fichiers référencés dans received_invoices
  //    (au cas où ils seraient dans un autre bucket)
  console.log('\n🔍 Vérification des factures reçues...\n');
  
  const invoices = [];
  offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'received_invoices', [
      Query.limit(100),
      Query.offset(offset),
    ]);
    if (res.documents.length === 0) break;
    invoices.push(...res.documents);
    offset += 100;
  }

  let invFixed = 0;
  const BUCKETS_TO_TRY = ['documents', 'justifications', 'expense-receipts'];

  for (const inv of invoices) {
    const fileId = inv.originalFileId || inv.pdfFileId;
    if (!fileId) continue;

    for (const bucket of BUCKETS_TO_TRY) {
      try {
        await storage.getFile(bucket, fileId);
        await fixFilePermissions(fileId, bucket);
        console.log(`✅ Facture ${inv.invoiceNumber} → ${bucket}`);
        invFixed++;
        break;
      } catch (e) {
        if (e.code !== 404) continue;
      }
    }
  }

  console.log(`\n📄 Factures corrigées : ${invFixed}`);
  console.log('\n🎉 Terminé ! Rechargez l\'application et testez "Voir le document".');
}

main().catch(console.error);
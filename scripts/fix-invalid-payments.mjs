// scripts/fix-invalid-payments.mjs
import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';
const RUN = process.argv.includes('--run');

let out = [], offset = 0;
for (;;) {
  const res = await db.listDocuments(DB, 'payments', [Query.limit(100), Query.offset(offset)]);
  out.push(...res.documents);
  if (res.documents.length < 100) break;
  offset += 100;
}

const invalid = out.filter(d => !d.type || !d.category || !d.amount);
console.log(`🔍 ${invalid.length} documents invalides trouvés sur ${out.length} total`);
invalid.forEach(d => {
  console.log(`  ⚠️ ${d.$id} | type=${d.type} | category=${d.category} | amount=${d.amount}`);
});

if (RUN && invalid.length > 0) {
  console.log(`\n🗑️ Suppression de ${invalid.length} documents invalides...`);
  for (const d of invalid) {
    await db.deleteDocument(DB, 'payments', d.$id);
    console.log(`  ✅ Supprimé ${d.$id}`);
  }
  console.log('\n✅ Nettoyage terminé');
} else if (!RUN) {
  console.log('\nℹ️ Dry-run : relancez avec --run pour supprimer les documents invalides');
}
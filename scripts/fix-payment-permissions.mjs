// scripts/fix-payment-permissions.mjs
// Corrige les permissions des documents payments créés sans permissions
import { Client, Databases, Permission, Role, Query } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
const API_KEY     = process.env.APPWRITE_API_KEY;
const DRY_RUN     = process.argv.includes('--dry-run');

if (!API_KEY) { console.error('❌ APPWRITE_API_KEY manquant'); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

(async () => {
  console.log('🔧 Fix des permissions documents\n');

  const collections = ['payments', 'expenses', 'bank_accounts', 'reconciliations'];
  let totalFixed = 0;

  for (const coll of collections) {
    console.log(`📋 ${coll}...`);

    // Charger tous les documents
    const docs = [];
    let offset = 0;
    while (true) {
      const res = await databases.listDocuments(DATABASE_ID, coll, [
        Query.limit(100),
        Query.offset(offset)
      ]);
      docs.push(...res.documents);
      if (res.documents.length < 100) break;
      offset += 100;
      if (offset > 5000) break;
    }

    console.log(`   ${docs.length} document(s) trouvé(s)`);

    let fixed = 0;
    for (const doc of docs) {
      // Vérifier si le document a des permissions
      const perms = doc.$permissions || [];
      if (perms.length === 0) {
        console.log(`   🔓 ${doc.$id} : permissions vides → ajout read(any)`);
        if (!DRY_RUN) {
          try {
            await databases.updateDocument(DATABASE_ID, coll, doc.$id, {}, [
              Permission.read(Role.any()),
              Permission.update(Role.any()),
              Permission.delete(Role.any()),
            ]);
            fixed++;
          } catch (e) {
            console.error(`   ❌ Erreur sur ${doc.$id}: ${e.message}`);
          }
        } else {
          fixed++;
        }
      }
    }

    console.log(`   ✅ ${fixed} document(s) corrigé(s)`);
    totalFixed += fixed;
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Total documents corrigés : ${totalFixed}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`\n🎉 Fix terminé${DRY_RUN ? ' (DRY-RUN)' : ''}.`);
})().catch(e => {
  console.error('\n💥 Erreur fatale:', e?.message || e);
  process.exit(1);
});
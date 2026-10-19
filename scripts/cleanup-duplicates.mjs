// scripts/cleanup-duplicates.mjs
// Supprime les doublons de paiements fournisseurs (conserve le plus récent)
import { Client, Databases, Query } from 'node-appwrite';

const ENDPOINT    = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203';
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'relancepro_db';
const API_KEY     = process.env.APPWRITE_API_KEY;
const DRY_RUN     = process.argv.includes('--dry-run');

if (!API_KEY) { console.error('❌ APPWRITE_API_KEY manquant'); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

(async () => {
  console.log('🧹 Nettoyage des doublons fournisseurs');
  if (DRY_RUN) console.log('   🧪 Mode DRY-RUN\n');

  // 1) Charger tous les paiements fournisseurs
  const all = [];
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, 'payments', [
      Query.equal('category', 'supplier_payment'),
      Query.limit(100),
      Query.offset(offset)
    ]);
    all.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  console.log(`   ${all.length} paiement(s) fournisseur(s) chargé(s)`);

  // 2) Grouper par (facture + montant)
  const groups = {};
  for (const p of all) {
    const key = `${p.linkedReceivedInvoiceId}|${p.amount}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  // 3) Supprimer les doublons (garder le plus ancien = première création)
  let deleted = 0;
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (group.length <= 1) continue;

    // Trier par date de création (le plus ancien en premier = à garder)
    group.sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));
    const [toKeep, ...toDelete] = group;

    console.log(`   🔑 ${key} : ${group.length} docs → garde ${toKeep.$id}, supprime ${toDelete.length}`);

    for (const dup of toDelete) {
      if (!DRY_RUN) {
        await databases.deleteDocument(DATABASE_ID, 'payments', dup.$id);
      }
      deleted++;
    }
  }

  console.log(`\n✅ ${deleted} doublon(s) supprimé(s) ${DRY_RUN ? '(simulé)' : ''}`);
})().catch(e => { console.error('💥', e.message); process.exit(1); });
// scripts/restore-archived-payments.mjs
import { Client, Databases } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
  .setProject(process.env.APPWRITE_PROJECT_ID || '6aacf8ec0010a7098203')
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = process.env.DATABASE_ID || 'relancepro_db';

// Les 10 paiements archivés à tort par le script précédent
const paymentIds = [
  '6ac7e9080018df8a1a7b', // 144 € FAC-2026-001
  '6ac7e909001a08b22ba6', // 300 € FAC-2026-002
  '6ac7e90a001c38f336a3', // 120 € FAC-2026-003
  '6ac7e90d0032c64b5785', //  40 € ACO-2026-001
  '6ac7fa740025f33d9513', // 140 € FAC-2026-005
  '6ac803ff001c4c5f56f3', //  23 € ACO-2026-002
  '6ac80633000177e83a70', // 127 € FAC-2026-006
  '6ac8d0330015a56a0645', // 200 € FAC-2026-007
  '6ac8d04a00354b136171', // 500 € FAC-2026-007
  '6ac8e6420031580401ec', // 104 € FAC-2026-004
];

console.log(`🔄 Restauration de ${paymentIds.length} paiements archivés à tort...\n`);

let restored = 0;
for (const id of paymentIds) {
  try {
    await db.updateDocument(DB, 'payments', id, { isArchived: false });
    console.log(`✅ Restauré ${id}`);
    restored++;
  } catch (e) {
    console.error(`❌ Erreur pour ${id}: ${e.message}`);
  }
}

console.log(`\n🎉 ${restored}/${paymentIds.length} paiements restaurés.`);
console.log('Rechargez /treasury — les encaissements devraient revenir à leur valeur réelle.');
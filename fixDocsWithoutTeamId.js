import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID;

const ALL_COLLECTIONS = [
  'invoices', 'clients', 'quotes', 'received_invoices',
  'invoice_metadata', 'accounting_events', 'receipts'
];

async function fixDocsWithoutTeamId() {
  console.log('\n🗑️ SUPPRESSION DES DOCUMENTS SANS teamId\n');
  console.log('⚠️ ATTENTION : Cette action est IRRÉVERSIBLE !\n');
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    readline.question('Êtes-vous sûr de vouloir continuer ? (oui/non) : ', resolve);
  });
  
  if (answer.toLowerCase() !== 'oui') {
    console.log('❌ Annulé.');
    readline.close();
    return;
  }
  
  readline.close();
  
  let totalDeleted = 0;
  
  for (const collectionId of ALL_COLLECTIONS) {
    try {
      const allDocs = await databases.listDocuments(DB_ID, collectionId, [
        Query.limit(100)
      ]);
      
      const docsWithoutTeamId = allDocs.documents.filter(doc => !doc.teamId);
      
      if (docsWithoutTeamId.length > 0) {
        console.log(`\n📁 ${collectionId} : ${docsWithoutTeamId.length} document(s) à supprimer`);
        
        for (const doc of docsWithoutTeamId) {
          try {
            await databases.deleteDocument(DB_ID, collectionId, doc.$id);
            console.log(`   🗑️ Supprimé : ${doc.$id}`);
            totalDeleted++;
            await new Promise(r => setTimeout(r, 200));
          } catch (e) {
            console.log(`   ❌ Erreur suppression ${doc.$id} : ${e.message}`);
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e) {
      console.log(`❌ ${collectionId} : Erreur : ${e.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ${totalDeleted} document(s) supprimé(s)`);
  console.log('');
}

fixDocsWithoutTeamId().catch(console.error);
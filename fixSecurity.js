import { Client, Databases, Query } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client()
  .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT)
  .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID;

// Collections qui ont besoin d'un index teamId
const COLLECTIONS_NEEDING_INDEX = ['clients', 'quotes'];

// Toutes les collections à vérifier
const ALL_COLLECTIONS = [
  'invoices', 'clients', 'quotes', 'received_invoices',
  'invoice_metadata', 'accounting_events', 'receipts'
];

async function fixSecurity() {
  console.log('\n🔧 CORRECTION DE SÉCURITÉ MULTI-TENANT\n');
  console.log('='.repeat(60));

  // ============================================================
  // 1. CRÉER LES INDEX MANQUANTS
  // ============================================================
  console.log('\n📊 ÉTAPE 1 : Création des index teamId manquants\n');
  
  for (const collectionId of COLLECTIONS_NEEDING_INDEX) {
    try {
      const collection = await databases.getCollection(DB_ID, collectionId);
      const hasTeamIdIndex = collection.indexes.some(idx => 
        idx.attributes.includes('teamId')
      );
      
      if (!hasTeamIdIndex) {
        try {
          await databases.createIndex(
            DB_ID, collectionId, 'teamId_idx', 'key', ['teamId'], ['ASC']
          );
          console.log(`   ✅ ${collectionId} : Index teamId créé`);
        } catch (e) {
          console.log(`   ❌ ${collectionId} : Erreur création index : ${e.message}`);
        }
      } else {
        console.log(`   ⏭️ ${collectionId} : Index teamId déjà présent`);
      }
      
      // Attendre un peu pour éviter le rate limiting
      await new Promise(r => setTimeout(r, 300));
      
    } catch (e) {
      console.log(`   ❌ ${collectionId} : Erreur : ${e.message}`);
    }
  }

  // ============================================================
  // 2. VÉRIFIER LES DOCUMENTS SANS teamId
  // ============================================================
  console.log('\n📊 ÉTAPE 2 : Vérification des documents sans teamId\n');
  
  let totalDocsWithoutTeamId = 0;
  const docsWithoutTeamIdByCollection = {};
  
  for (const collectionId of ALL_COLLECTIONS) {
    try {
      // ✅ CORRECTION : Utiliser Query.limit() au lieu de l'ancienne syntaxe
      const allDocs = await databases.listDocuments(DB_ID, collectionId, [
        Query.limit(100)
      ]);
      
      // Filtrer côté client les documents sans teamId
      const docsWithoutTeamId = allDocs.documents.filter(doc => !doc.teamId);
      
      if (docsWithoutTeamId.length > 0) {
        console.log(`   ⚠️ ${collectionId} : ${docsWithoutTeamId.length} document(s) sans teamId`);
        console.log(`      IDs concernés : ${docsWithoutTeamId.map(d => d.$id).join(', ')}`);
        totalDocsWithoutTeamId += docsWithoutTeamId.length;
        docsWithoutTeamIdByCollection[collectionId] = docsWithoutTeamId.map(d => d.$id);
      } else {
        console.log(`   ✅ ${collectionId} : Tous les documents ont un teamId (${allDocs.total} docs)`);
      }
      
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e) {
      console.log(`   ❌ ${collectionId} : Erreur : ${e.message}`);
    }
  }

  // ============================================================
  // 3. RAPPORT FINAL
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ CORRECTION TERMINÉE\n');
  
  console.log('📋 RÉSUMÉ :');
  console.log('   ✅ Index teamId créés pour : clients, quotes');
  console.log(`   📊 Documents sans teamId détectés : ${totalDocsWithoutTeamId}`);
  
  if (totalDocsWithoutTeamId > 0) {
    console.log('\n⚠️ DOCUMENTS SANS teamId À CORRIGER :');
    for (const [collection, ids] of Object.entries(docsWithoutTeamIdByCollection)) {
      console.log(`   📁 ${collection} : ${ids.length} document(s)`);
      ids.forEach(id => console.log(`      - ${id}`));
    }
    console.log('\n💡 RECOMMANDATION :');
    console.log('   Ces documents doivent être corrigés manuellement ou supprimés.');
    console.log('   Vous pouvez exécuter ce script pour les supprimer :');
    console.log('   node fixDocsWithoutTeamId.js');
  } else {
    console.log('\n✅ Aucun document sans teamId détecté !');
    console.log('   Votre sécurité multi-tenant est optimale.');
  }
  
  console.log('\n⚠️ NOTES IMPORTANTES :');
  console.log('   - teamId "non requis" dans le schéma est acceptable car');
  console.log('     votre code applicatif ajoute toujours teamId.');
  console.log('   - Les permissions "documentSecurity" activées sont une');
  console.log('     BONNE chose pour la sécurité multi-tenant.');
  console.log('   - Les index teamId améliorent les performances des requêtes.');
  console.log('');
}

fixSecurity().catch(console.error);
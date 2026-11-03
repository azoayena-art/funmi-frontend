// audit-db.js
import { Client, Databases } from 'node-appwrite';

// ⚠️ REMPLACEZ CES VALEURS PAR LES VÔTRES
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6aacf8ec0010a7098203'; 
const APPWRITE_API_KEY = 'standard_3d3cee3580e2dc18b139c00df59648e0c8ee8828641ade3313b9d8812cad811168d57ec0e6d7baccfc072724567230c481deb259124aca461ff2e3941ea20175b3b119fdad9ddef20531d85677fdd8d54f89cc28de96a8554d0dd05d02d3ac3b5775cadd3feed6021fb9d33dc9c85b0976081034246272ae13262e04b77b96f4'; 

const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = 'relancepro_db';

async function runAudit() {
    console.log('\n🔍 DÉBUT DE L\'AUDIT DE LA BASE DE DONNÉES...\n');

    try {
        // 1. Récupérer toutes les collections
        const collections = await databases.listCollections(DB_ID);
        
        // Correction : utiliser 'collections' au lieu de 'documents'
        const collectionsList = collections.collections || []; 

        if (collectionsList.length === 0) {
            console.log('Aucune collection trouvée dans la base de données.');
            return;
        }

        // 2. Afficher un tableau récapitulatif
        const summaryTable = collectionsList.map(col => ({
            ID: col.$id,
            Nom: col.name,
            Documents: 'Calcul...',
            Attributs: col.attributes ? col.attributes.length : 0
        }));

        console.table(summaryTable);

        // 3. Détails par collection (Attributs et compte de documents)
        for (const col of collectionsList) {
            console.log(`\n📂 COLLECTION: ${col.name} (ID: ${col.$id})`);
            console.log('---------------------------------------------------');
            
            // Compter les documents
            const docsCount = await databases.listDocuments(DB_ID, col.$id, []);
            console.log(`📊 Total de documents: ${docsCount.total}`);

            // Lister les attributs (schéma)
            if (col.attributes && col.attributes.length > 0) {
                console.log('\n🏗️  Schéma (Attributs) :');
                const attrTable = col.attributes.map(attr => ({
                    Clé: attr.key,
                    Type: attr.type,
                    Requis: attr.required ? 'Oui' : 'Non',
                    Array: attr.array ? 'Oui' : 'Non'
                }));
                console.table(attrTable);
            } else {
                console.log('Aucun attribut personnalisé.');
            }
        }

        console.log('\n✅ AUDIT TERMINÉ.\n');

    } catch (error) {
        console.error('❌ Erreur lors de l\'audit:', error.message);
    }
}

runAudit();
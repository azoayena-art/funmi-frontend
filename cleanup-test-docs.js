// cleanup-test-docs.js
import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('6aacf8ec0010a7098203')
    .setKey('standard_3d3cee3580e2dc18b139c00df59648e0c8ee8828641ade3313b9d8812cad811168d57ec0e6d7baccfc072724567230c481deb259124aca461ff2e3941ea20175b3b119fdad9ddef20531d85677fdd8d54f89cc28de96a8554d0dd05d02d3ac3b5775cadd3feed6021fb9d33dc9c85b0976081034246272ae13262e04b77b96f4');

const databases = new Databases(client);
const DB_ID = 'relancepro_db';

async function cleanup() {
    console.log('Suppression des documents de test...\n');
    
    try {
        // 1. Supprimer d'abord les licences
        console.log('1. Suppression des licences...');
        const licenses = await databases.listDocuments(DB_ID, 'licenses', []);
        for (const lic of licenses.documents) {
            await databases.deleteDocument(DB_ID, 'licenses', lic.$id);
            console.log(`   ✅ Licence supprimée: ${lic.$id}`);
        }
        
        // 2. Puis supprimer les clés d'activation
        console.log('\n2. Suppression des clés d\'activation...');
        const keys = await databases.listDocuments(DB_ID, 'activation_keys', []);
        for (const key of keys.documents) {
            await databases.deleteDocument(DB_ID, 'activation_keys', key.$id);
            console.log(`   ✅ Clé supprimée: ${key.$id}`);
        }
        
        console.log('\n✅ Nettoyage terminé !\n');
        
    } catch (error) {
        console.error('Erreur:', error.message);
    }
}

cleanup();
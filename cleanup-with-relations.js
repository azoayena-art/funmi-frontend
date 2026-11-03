// cleanup-with-relations.js
import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('6aacf8ec0010a7098203')
    .setKey('standard_3d3cee3580e2dc18b139c00df59648e0c8ee8828641ade3313b9d8812cad811168d57ec0e6d7baccfc072724567230c481deb259124aca461ff2e3941ea20175b3b119fdad9ddef20531d85677fdd8d54f89cc28de96a8554d0dd05d02d3ac3b5775cadd3feed6021fb9d33dc9c85b0976081034246272ae13262e04b77b96f4');

const databases = new Databases(client);
const DB_ID = 'relancepro_db';

async function cleanup() {
    console.log('Nettoyage avec gestion des relations...\n');
    
    try {
        // 1. Récupérer tous les documents
        const licenses = await databases.listDocuments(DB_ID, 'licenses', []);
        const keys = await databases.listDocuments(DB_ID, 'activation_keys', []);
        
        console.log(`📊 Documents trouvés:`);
        console.log(`   - Licences: ${licenses.total}`);
        console.log(`   - Clés d'activation: ${keys.total}\n`);
        
        if (licenses.total === 0 && keys.total === 0) {
            console.log('✅ Base déjà propre, rien à supprimer.\n');
            return;
        }
        
        // 2. Essayer de supprimer les licences d'abord
        console.log('1. Tentative de suppression des licences...');
        for (const lic of licenses.documents) {
            try {
                await databases.deleteDocument(DB_ID, 'licenses', lic.$id);
                console.log(`   ✅ Licence supprimée: ${lic.$id}`);
            } catch (error) {
                console.log(`   ⚠️  Licence bloquée: ${lic.$id} (${error.message})`);
            }
        }
        
        // 3. Puis supprimer les clés d'activation
        console.log('\n2. Tentative de suppression des clés d\'activation...');
        for (const key of keys.documents) {
            try {
                await databases.deleteDocument(DB_ID, 'activation_keys', key.$id);
                console.log(`   ✅ Clé supprimée: ${key.$id}`);
            } catch (error) {
                console.log(`   ⚠️  Clé bloquée: ${key.$id} (${error.message})`);
            }
        }
        
        // 4. Réessayer les licences si certaines étaient bloquées
        const remainingLicenses = await databases.listDocuments(DB_ID, 'licenses', []);
        if (remainingLicenses.total > 0) {
            console.log('\n3. Nouvelle tentative pour les licences restantes...');
            for (const lic of remainingLicenses.documents) {
                try {
                    await databases.deleteDocument(DB_ID, 'licenses', lic.$id);
                    console.log(`   ✅ Licence supprimée: ${lic.$id}`);
                } catch (error) {
                    console.log(`   ❌ Échec final: ${lic.$id}`);
                    console.log(`   💡 Solution: Modifiez manuellement la relation "activationKey" dans Appwrite`);
                    console.log(`      → Onglet Attributes → activationKey → On Delete: "Set Null"`);
                }
            }
        }
        
        console.log('\n✅ Nettoyage terminé !\n');
        
    } catch (error) {
        console.error('Erreur:', error.message);
    }
}

cleanup();
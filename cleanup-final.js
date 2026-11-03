// cleanup-final.js
import { Client, Databases, Query } from 'node-appwrite';

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6aacf8ec0010a7098203';
const APPWRITE_API_KEY = 'standard_3d3cee3580e2dc18b139c00df59648e0c8ee8828641ade3313b9d8812cad811168d57ec0e6d7baccfc072724567230c481deb259124aca461ff2e3941ea20175b3b119fdad9ddef20531d85677fdd8d54f89cc28de96a8554d0dd05d02d3ac3b5775cadd3feed6021fb9d33dc9c85b0976081034246272ae13262e04b77b96f4';

const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);
const DB_ID = 'relancepro_db';

async function cleanupCompanySettings() {
    console.log('\n🧹 Nettoyage de company_settings...');
    
    try {
        let totalDeleted = 0;
        let hasMore = true;
        
        while (hasMore) {
            const response = await databases.listDocuments(DB_ID, 'company_settings', [
                Query.limit(100)
            ]);
            
            if (response.documents.length === 0) {
                hasMore = false;
                break;
            }
            
            for (const doc of response.documents) {
                await databases.deleteDocument(DB_ID, 'company_settings', doc.$id);
                totalDeleted++;
                console.log(`   🗑️  Supprimé: ${doc.$id} (${doc.name || 'sans nom'})`);
            }
        }
        
        console.log(`   ✅ ${totalDeleted} documents company_settings supprimés\n`);
        
    } catch (error) {
        console.error(`   ❌ Erreur: ${error.message}\n`);
    }
}

async function cleanupDuplicateRoles() {
    console.log('🧹 Nettoyage des rôles en double...');
    
    try {
        const roles = await databases.listDocuments(DB_ID, 'roles', [
            Query.limit(100)
        ]);
        
        console.log(`   📊 ${roles.total} rôles trouvés au total`);
        
        // Grouper par nom
        const rolesByName = {};
        for (const role of roles.documents) {
            if (!rolesByName[role.name]) {
                rolesByName[role.name] = [];
            }
            rolesByName[role.name].push(role);
        }
        
        console.log(`   📋 Rôles uniques trouvés: ${Object.keys(rolesByName).length}`);
        for (const [name, roleList] of Object.entries(rolesByName)) {
            console.log(`      - "${name}": ${roleList.length} occurrences`);
        }
        
        // Pour chaque groupe, garder le premier (le plus ancien) et supprimer les autres
        let deletedCount = 0;
        for (const [name, roleList] of Object.entries(rolesByName)) {
            if (roleList.length > 1) {
                console.log(`\n   🗑️  "${name}": ${roleList.length} doublons détectés`);
                console.log(`      ✅ Conservation du premier: ${roleList[0].$id}`);
                
                // Supprimer tous sauf le premier
                for (let i = 1; i < roleList.length; i++) {
                    await databases.deleteDocument(DB_ID, 'roles', roleList[i].$id);
                    deletedCount++;
                    console.log(`      🗑️  Supprimé: ${roleList[i].$id}`);
                }
            }
        }
        
        console.log(`\n   ✅ ${deletedCount} rôles en double supprimés\n`);
        
    } catch (error) {
        console.error(`   ❌ Erreur: ${error.message}\n`);
    }
}

async function finalCleanup() {
    console.log('\n🧹 NETTOYAGE FINAL...\n');
    
    await cleanupCompanySettings();
    await cleanupDuplicateRoles();
    
    console.log('✅ NETTOYAGE FINAL TERMINÉ!\n');
}

finalCleanup();
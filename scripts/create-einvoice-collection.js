import { Client, Databases, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'relancepro_db';
const COLLECTION_ID = 'einvoice_events';

async function setupCollection() {
    try {
        console.log(`🔄 Création de la collection '${COLLECTION_ID}'...`);
        
        await databases.createCollection(
            DATABASE_ID,
            COLLECTION_ID,
            'E-Invoice Events',
            [
                Permission.create(Role.any()),
                Permission.read(Role.any()),
                Permission.update(Role.any()),
                Permission.delete(Role.any()),
            ]
        );
        console.log('✅ Collection créée avec succès !');

        console.log('🔄 Ajout des attributs...');
        const attributes = [
            databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'invoiceId', 255, true),
            databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'teamId', 255, true),
            databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'userId', 255, true),
            databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'status', 50, true),
            databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'message', 1000, false),
            databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'transmissionReference', 255, false),
            databases.createDatetimeAttribute(DATABASE_ID, COLLECTION_ID, 'createdAt', true),
        ];

        await Promise.all(attributes);
        console.log('✅ Attributs ajoutés avec succès !');

        console.log('⏳ Attente de la disponibilité des attributs (2 secondes)...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('🔄 Création de l\'index pour optimiser les recherches...');
        await databases.createIndex(
            DATABASE_ID,
            COLLECTION_ID,
            'idx_invoiceId',
            'key',
            ['invoiceId'],
            ['ASC']
        );
        console.log('✅ Index créé avec succès !');
        
        console.log('🎉 Configuration de einvoice_events terminée !');

    } catch (error) {
        if (error.code === 409) {
            console.log('⚠️ La collection ou un attribut existe déjà. Vous pouvez ignorer cette erreur.');
        } else {
            console.error('❌ Erreur lors de la configuration:', error);
        }
    }
}

setupCollection();
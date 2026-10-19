import { databases, DATABASE_ID } from '../appwrite';
import { Permission, Role } from 'appwrite';

const COLLECTION_ID = 'account_mappings';

export const setupAccountMappingsCollection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    console.log('🚀 Setup : Vérification collection account_mappings...');

    // 1. Vérifier si elle existe déjà
    try {
      await databases.getCollection(DATABASE_ID, COLLECTION_ID);
      return {
        success: true,
        message: 'Collection account_mappings existe déjà ✅'
      };
    } catch (e: any) {
      if (e.code !== 404 && e.type !== 'collection_not_found') throw e;
    }

    // 2. Créer la collection
    console.log('📁 Création de la collection...');
    await databases.createCollection(
      DATABASE_ID,
      COLLECTION_ID,
      'Plan Comptable Personnalisé',
      [], // Permissions vides (documentSecurity)
      true // documentSecurity = true
    );

    // 3. Créer les attributs
    console.log('🔧 Création des attributs...');

    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'teamId', 100, true);
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'category', 50, true);
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'accountNumber', 20, true);
    await databases.createStringAttribute(DATABASE_ID, COLLECTION_ID, 'accountLabel', 200, false);
    await databases.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, 'isDefault', false, true);
    await databases.createDatetimeAttribute(DATABASE_ID, COLLECTION_ID, 'updatedAt', false);

    // 4. Attendre la propagation
    console.log('⏳ Attente de la disponibilité des attributs...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. Créer les index
    console.log('📇 Création des index...');
    try {
      await databases.createIndex(
        DATABASE_ID, COLLECTION_ID,
        'idx_team_category', 'unique',
        ['teamId', 'category'],
        ['ASC', 'ASC']
      );
    } catch (e: any) {
      console.warn('Index idx_team_category:', e.message);
    }

    try {
      await databases.createIndex(
        DATABASE_ID, COLLECTION_ID,
        'idx_teamId', 'key',
        ['teamId'],
        ['ASC']
      );
    } catch (e: any) {
      console.warn('Index idx_teamId:', e.message);
    }

    console.log('✅ Collection account_mappings créée avec succès !');

    return {
      success: true,
      message: 'Collection account_mappings créée avec succès ✅'
    };

  } catch (error: any) {
    console.error('❌ Erreur setup account_mappings:', error);
    return {
      success: false,
      message: `Erreur : ${error.message}`
    };
  }
};
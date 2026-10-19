import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID, Permission, Role } from 'appwrite';
import {
  DEFAULT_PCG_ARTISAN,
  getDefaultAccountMapping,
  type AccountMapping,
  type AccountCategory,
} from './defaultAccountMapping';

const COLLECTION_ID = 'account_mappings';

export interface CustomAccount {
  id?: string;
  key: string;
  number: string;
  label: string;
  section: string;
  description: string;
}

const validateTeamId = (teamId: string, paramName: string): void => {
  if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
    throw new Error(`Erreur de sécurité : ${paramName} invalide`);
  }
};

const getPerms = (appwriteTeamId: string) => {
  validateTeamId(appwriteTeamId, 'appwriteTeamId');
  return [
    Permission.read(Role.team(appwriteTeamId)),
    Permission.update(Role.team(appwriteTeamId)),
    Permission.delete(Role.team(appwriteTeamId)),
  ];
};

// ============================================================
// 📥 CHARGEMENT COMPLET (défaut + custom)
// ============================================================
export const loadCustomAccountMapping = async (
  customTeamId: string
): Promise<{ 
  mapping: AccountMapping; 
  customized: boolean;
  customAccounts: CustomAccount[];
}> => {
  validateTeamId(customTeamId, 'customTeamId');

  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [Query.equal('teamId', customTeamId), Query.limit(200)]
    );

    const defaultMapping = getDefaultAccountMapping();
    const customMapping = { ...defaultMapping };
    let customized = false;
    const customAccounts: CustomAccount[] = [];

    res.documents.forEach((doc: any) => {
      if (doc.teamId !== customTeamId) return;

      // Compte personnalisé
      if (doc.category.startsWith('custom_')) {
        customAccounts.push({
          id: doc.$id,
          key: doc.category,
          number: doc.accountNumber,
          label: doc.accountLabel || '',
          section: doc.section || 'achats',
          description: doc.description || '',
        });
        return;
      }

      // Compte par défaut modifié
      customized = true;
      const category = DEFAULT_PCG_ARTISAN.find(c => c.key === doc.category);
      if (!category) return;

      switch (doc.category) {
        case 'sales_services':
          customMapping.salesAccount = doc.accountNumber;
          customMapping.salesAccountLabel = doc.accountLabel;
          break;
        case 'sales_merchandise':
          customMapping.salesMerchandiseAccount = doc.accountNumber;
          customMapping.salesMerchandiseLabel = doc.accountLabel;
          break;
        case 'sales_advance':
          customMapping.advanceAccount = doc.accountNumber;
          customMapping.advanceAccountLabel = doc.accountLabel;
          break;
        case 'client_base':
          customMapping.clientAccount = doc.accountNumber;
          customMapping.clientAccountLabel = doc.accountLabel;
          break;
        case 'vat_collected':
          customMapping.vatCollectedAccount = doc.accountNumber;
          customMapping.vatCollectedLabel = doc.accountLabel;
          break;
        case 'vat_deductible':
          customMapping.vatDeductibleAccount = doc.accountNumber;
          customMapping.vatDeductibleLabel = doc.accountLabel;
          break;
        case 'bank':
          customMapping.bankAccount = doc.accountNumber;
          customMapping.bankAccountLabel = doc.accountLabel;
          break;
        case 'cash':
          customMapping.cashAccount = doc.accountNumber;
          customMapping.cashAccountLabel = doc.accountLabel;
          break;
        case 'supplier_base':
          customMapping.supplierAccount = doc.accountNumber;
          customMapping.supplierAccountLabel = doc.accountLabel;
          break;
        case 'purchase_materials':
          customMapping.purchasesMaterialsAccount = doc.accountNumber;
          customMapping.purchasesMaterialsLabel = doc.accountLabel;
          break;
        case 'purchase_consumables':
          customMapping.purchasesConsumablesAccount = doc.accountNumber;
          customMapping.purchasesConsumablesLabel = doc.accountLabel;
          break;
        case 'purchase_merchandise':
          customMapping.purchasesMerchandiseAccount = doc.accountNumber;
          customMapping.purchasesMerchandiseLabel = doc.accountLabel;
          break;
        case 'subcontracting':
          customMapping.subcontractingAccount = doc.accountNumber;
          customMapping.subcontractingLabel = doc.accountLabel;
          break;
        case 'rental':
          customMapping.rentalAccount = doc.accountNumber;
          customMapping.rentalLabel = doc.accountLabel;
          break;
        case 'maintenance':
          customMapping.maintenanceAccount = doc.accountNumber;
          customMapping.maintenanceLabel = doc.accountLabel;
          break;
        case 'insurance':
          customMapping.insuranceAccount = doc.accountNumber;
          customMapping.insuranceLabel = doc.accountLabel;
          break;
        case 'transport':
          customMapping.transportAccount = doc.accountNumber;
          customMapping.transportLabel = doc.accountLabel;
          break;
      }
    });

    return { mapping: customMapping, customized, customAccounts };
  } catch (error) {
    console.error('Erreur chargement PCG:', error);
    return { mapping: getDefaultAccountMapping(), customized: false, customAccounts: [] };
  }
};

// ============================================================
// 💾 SAUVEGARDE (défaut + custom)
// ============================================================
export const saveAccountMapping = async (
  customTeamId: string,
  appwriteTeamId: string,
  updates: Array<{ category: string; accountNumber: string; accountLabel: string }>,
  customAccounts: CustomAccount[] = []
): Promise<void> => {
  validateTeamId(customTeamId, 'customTeamId');
  validateTeamId(appwriteTeamId, 'appwriteTeamId');

  const perms = getPerms(appwriteTeamId);

  // Sauvegarde des comptes par défaut modifiés
  for (const update of updates) {
    if (!/^\d{1,10}$/.test(update.accountNumber)) {
      throw new Error(`Numéro invalide pour ${update.category}`);
    }

    try {
      const existing = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('teamId', customTeamId), Query.equal('category', update.category), Query.limit(1)]
      );

      if (existing.documents.length > 0) {
        await databases.updateDocument(
          DATABASE_ID, COLLECTION_ID, existing.documents[0].$id,
          {
            accountNumber: update.accountNumber,
            accountLabel: update.accountLabel,
            isDefault: false,
            updatedAt: new Date().toISOString(),
          },
          perms
        );
      } else {
        await databases.createDocument(
          DATABASE_ID, COLLECTION_ID, ID.unique(),
          {
            teamId: customTeamId,
            category: update.category,
            accountNumber: update.accountNumber,
            accountLabel: update.accountLabel,
            section: '',
            description: '',
            isDefault: false,
            updatedAt: new Date().toISOString(),
          },
          perms
        );
      }
    } catch (error) {
      console.error(`Erreur ${update.category}:`, error);
      throw error;
    }
  }

  // Sauvegarde des comptes custom
  for (const custom of customAccounts) {
    try {
      if (custom.id) {
        // Mise à jour
        await databases.updateDocument(
          DATABASE_ID, COLLECTION_ID, custom.id,
          {
            accountNumber: custom.number,
            accountLabel: custom.label,
            section: custom.section,
            description: custom.description,
            updatedAt: new Date().toISOString(),
          },
          perms
        );
      } else {
        // Création
        await databases.createDocument(
          DATABASE_ID, COLLECTION_ID, ID.unique(),
          {
            teamId: customTeamId,
            category: custom.key,
            accountNumber: custom.number,
            accountLabel: custom.label,
            section: custom.section,
            description: custom.description,
            isDefault: false,
            updatedAt: new Date().toISOString(),
          },
          perms
        );
      }
    } catch (error) {
      console.error(`Erreur custom ${custom.key}:`, error);
      throw error;
    }
  }
};

// ============================================================
// 🗑️ SUPPRESSION D'UN COMPTE CUSTOM
// ============================================================
export const deleteCustomAccount = async (
  documentId: string,
  appwriteTeamId: string
): Promise<void> => {
  validateTeamId(appwriteTeamId, 'appwriteTeamId');
  const perms = getPerms(appwriteTeamId);

  try {
    await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, documentId, perms);
  } catch (error) {
    console.error('Erreur suppression:', error);
    throw error;
  }
};

// ============================================================
// 🔄 RESTAURATION PCG PAR DÉFAUT
// ============================================================
export const resetToDefaultMapping = async (
  customTeamId: string,
  appwriteTeamId: string,
  deleteCustom: boolean = false
): Promise<void> => {
  validateTeamId(customTeamId, 'customTeamId');
  validateTeamId(appwriteTeamId, 'appwriteTeamId');

  const perms = getPerms(appwriteTeamId);

  try {
    const res = await databases.listDocuments(
      DATABASE_ID, COLLECTION_ID,
      [Query.equal('teamId', customTeamId), Query.limit(200)]
    );

    const toDelete = res.documents.filter(doc => {
      if (deleteCustom) return true;
      return !doc.category.startsWith('custom_');
    });

    await Promise.all(
      toDelete.map(doc => databases.deleteDocument(DATABASE_ID, COLLECTION_ID, doc.$id, perms))
    );
  } catch (error) {
    console.error('Erreur restauration:', error);
    throw error;
  }
};
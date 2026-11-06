
// src/services/accountMappingService.ts

import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID, Permission, Role } from 'appwrite';
import { logAuditAction } from './auditService';

// ============================================================
// INTERFACES
// ============================================================

export interface CustomAccount {
  key: string;
  id?: string;
  number: string;
  label: string;
  description?: string;
  section: string;
}

export interface CustomSection {
  key: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
  order: number;
  isCustom: true;
}

export interface AccountMapping {
  salesAccount: string;
  salesAccountLabel: string;
  salesMerchandiseAccount: string;
  salesMerchandiseLabel: string;
  advanceAccount: string;
  advanceAccountLabel: string;
  clientAccount: string;
  clientAccountLabel: string;
  vatCollectedAccount: string;
  vatCollectedLabel: string;
  vatDeductibleAccount: string;
  vatDeductibleLabel: string;
  bankAccount: string;
  bankAccountLabel: string;
  cashAccount: string;
  cashAccountLabel: string;
  supplierAccount: string;
  supplierAccountLabel: string;
  purchasesMaterialsAccount: string;
  purchasesMaterialsLabel: string;
  purchasesConsumablesAccount: string;
  purchasesConsumablesLabel: string;
  purchasesMerchandiseAccount: string;
  purchasesMerchandiseLabel: string;
  subcontractingAccount: string;
  subcontractingLabel: string;
  rentalAccount: string;
  rentalLabel: string;
  maintenanceAccount: string;
  maintenanceLabel: string;
  insuranceAccount: string;
  insuranceLabel: string;
  transportAccount: string;
  transportLabel: string;
  discountAccount: string;
  discountAccountLabel: string;
}

type StoredAccountMapping = Record<
  string,
  { number: string; label: string }
>;

// ============================================================
// COMPTES PAR DÉFAUT
// ============================================================

export const getDefaultAccountMapping = (): AccountMapping => ({
  salesAccount: '706000',
  salesAccountLabel: 'Prestations de services',

  salesMerchandiseAccount: '707000',
  salesMerchandiseLabel: 'Ventes de marchandises',

  advanceAccount: '419100',
  advanceAccountLabel: 'Clients - Avances et acomptes reçus',

  clientAccount: '411',
  clientAccountLabel: 'Clients',

  vatCollectedAccount: '445710',
  vatCollectedLabel: 'TVA collectée 20%',

  vatDeductibleAccount: '445660',
  vatDeductibleLabel: 'TVA déductible sur biens et services',

  bankAccount: '512000',
  bankAccountLabel: 'Banque',

  cashAccount: '530000',
  cashAccountLabel: 'Caisse',

  supplierAccount: '401',
  supplierAccountLabel: 'Fournisseurs',

  purchasesMaterialsAccount: '601000',
  purchasesMaterialsLabel: 'Achats stockés - Matières premières',

  purchasesConsumablesAccount: '606000',
  purchasesConsumablesLabel: 'Achats non stockés - Fournitures',

  purchasesMerchandiseAccount: '607000',
  purchasesMerchandiseLabel: 'Achats de marchandises',

  subcontractingAccount: '611000',
  subcontractingLabel: 'Sous-traitance générale',

  rentalAccount: '613000',
  rentalLabel: 'Locations',

  maintenanceAccount: '615000',
  maintenanceLabel: 'Entretien et réparations',

  insuranceAccount: '616000',
  insuranceLabel: "Primes d'assurances",

  transportAccount: '625000',
  transportLabel: 'Déplacements, missions et réceptions',

  discountAccount: '709000',
  discountAccountLabel: 'Remises, rabais et ristournes accordés',
});

// ============================================================
// CORRESPONDANCE DES CHAMPS
// ============================================================

const ACCOUNT_LABEL_KEYS: Partial<
  Record<keyof AccountMapping, keyof AccountMapping>
> = {
  salesAccount: 'salesAccountLabel',
  salesMerchandiseAccount: 'salesMerchandiseLabel',
  advanceAccount: 'advanceAccountLabel',
  clientAccount: 'clientAccountLabel',
  vatCollectedAccount: 'vatCollectedLabel',
  vatDeductibleAccount: 'vatDeductibleLabel',
  bankAccount: 'bankAccountLabel',
  cashAccount: 'cashAccountLabel',
  supplierAccount: 'supplierAccountLabel',
  purchasesMaterialsAccount: 'purchasesMaterialsLabel',
  purchasesConsumablesAccount: 'purchasesConsumablesLabel',
  purchasesMerchandiseAccount: 'purchasesMerchandiseLabel',
  subcontractingAccount: 'subcontractingLabel',
  rentalAccount: 'rentalLabel',
  maintenanceAccount: 'maintenanceLabel',
  insuranceAccount: 'insuranceLabel',
  transportAccount: 'transportLabel',
  discountAccount: 'discountAccountLabel',
};

// ============================================================
// UTILITAIRES JSON
// ============================================================

const parseJSON = <T,>(value: any, fallback: T): T => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('Erreur de lecture JSON:', error);
    return fallback;
  }
};

// Conversion des données enregistrées en AccountMapping.
// Compatible avec les anciennes données au format imbriqué
// et les anciennes données au format plat.

const normalizeAccountMapping = (
  saved: any,
  defaults: AccountMapping
): AccountMapping => {
  const result: any = { ...defaults };

  if (!saved || typeof saved !== 'object') {
    return result;
  }

  Object.entries(saved).forEach(([key, value]: [string, any]) => {
    if (key in defaults) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const labelKey =
          ACCOUNT_LABEL_KEYS[key as keyof AccountMapping];

        if (value.number !== undefined) {
          result[key] = value.number;
        }

        if (labelKey && value.label !== undefined) {
          result[labelKey] = value.label;
        }
      } else {
        result[key] = value;
      }
    }
  });

  return result as AccountMapping;
};

// ============================================================
// PERMISSIONS APPWRITE
// ============================================================

const getWritePerms = (teamId: string) => [
  Permission.read(Role.team(teamId)),
  Permission.update(Role.team(teamId)),
  Permission.delete(Role.team(teamId)),
];

// ============================================================
// CHARGEMENT DU PLAN COMPTABLE
// ============================================================

export const loadCustomAccountMapping = async (
  teamId: string
): Promise<{
  mapping: AccountMapping;
  customized: boolean;
  customAccounts: CustomAccount[];
  customSections: CustomSection[];
}> => {
  const defaultMapping = getDefaultAccountMapping();

  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      'account_configs',
      [
        Query.equal('teamId', teamId),
        Query.limit(1),
      ]
    );

    if (res.documents.length === 0) {
      return {
        mapping: defaultMapping,
        customized: false,
        customAccounts: [],
        customSections: [],
      };
    }

    const doc = res.documents[0];

    const savedMapping = parseJSON<any>(
      doc.accountMappings,
      {}
    );

    const mapping = normalizeAccountMapping(
      savedMapping,
      defaultMapping
    );

    const customAccounts = parseJSON<CustomAccount[]>(
      doc.customAccounts,
      []
    );

    const customSections = parseJSON<CustomSection[]>(
      doc.customSections,
      []
    );

    return {
      mapping,
      customized: doc.customized || false,
      customAccounts: Array.isArray(customAccounts)
        ? customAccounts
        : [],
      customSections: Array.isArray(customSections)
        ? customSections
        : [],
    };

  } catch (error) {
    console.error(
      'Erreur chargement plan comptable:',
      error
    );

    return {
      mapping: defaultMapping,
      customized: false,
      customAccounts: [],
      customSections: [],
    };
  }
};

// ============================================================
// SAUVEGARDE DU PLAN COMPTABLE
// ============================================================

export const saveAccountMapping = async (
  teamId: string,
  appwriteTeamId: string,
  updates: Array<{
    category: string;
    accountNumber: string;
    accountLabel: string;
  }>,
  customAccounts: any[],
  options: {
    accountingStandard: string;
    country: string;
    customSections: any[];
  },
  userId?: string
): Promise<void> => {

  const permissions = getWritePerms(appwriteTeamId);

  try {
    // 1. Récupérer la configuration existante

    const existing = await databases.listDocuments(
      DATABASE_ID,
      'account_configs',
      [
        Query.equal('teamId', teamId),
        Query.limit(1),
      ]
    );

    const existingDoc = existing.documents[0];

    // 2. Récupérer les anciennes correspondances
    // IMPORTANT : on conserve les comptes déjà personnalisés.

    const previousMappings = existingDoc
      ? parseJSON<StoredAccountMapping>(
          existingDoc.accountMappings,
          {}
        )
      : {};

    // 3. Fusionner les nouvelles modifications
    // Sans supprimer les anciennes correspondances.

    const accountMappingsObj: StoredAccountMapping = {
      ...previousMappings,
    };

    updates.forEach((update) => {
      if (!update.category) return;

      accountMappingsObj[update.category] = {
        number: String(update.accountNumber),
        label: String(update.accountLabel),
      };
    });

    // 4. Nettoyer les comptes personnalisés

    const cleanCustomAccounts = (
      Array.isArray(customAccounts)
        ? customAccounts
        : []
    ).map((acc: any) => ({
      key: acc.key,
      number: acc.number,
      label: acc.label,
      description: acc.description || '',
      section: acc.section,
    }));

    // 5. Nettoyer les sections personnalisées

    const cleanCustomSections = (
      Array.isArray(options.customSections)
        ? options.customSections
        : []
    ).map((section: any) => ({
      key: section.key,
      label: section.label,
      icon: section.icon,
      color: section.color,
      description: section.description || '',
      order: section.order,
      isCustom: true,
    }));

    // 6. Préparer les données Appwrite
    // Les attributs JSON sont enregistrés en String.

    const configData = {
      teamId,
      userId: userId || '',
      accountingStandard: options.accountingStandard,
      country: options.country,

      accountMappings: JSON.stringify(
        accountMappingsObj
      ),

      customAccounts: JSON.stringify(
        cleanCustomAccounts
      ),

      customSections: JSON.stringify(
        cleanCustomSections
      ),

      customized: true,
      updatedAt: new Date().toISOString(),
      updatedBy: userId || '',
    };

    // 7. Créer ou actualiser le document

    let docId: string;

    if (existingDoc) {
      docId = existingDoc.$id;

      await databases.updateDocument(
        DATABASE_ID,
        'account_configs',
        docId,
        configData,
        permissions
      );

    } else {
      const created = await databases.createDocument(
        DATABASE_ID,
        'account_configs',
        ID.unique(),
        configData,
        permissions
      );

      docId = created.$id;
    }

    // 8. Journal d'audit

    await logAuditAction(
      teamId,
      userId || 'system',
      'update_account_mapping',
      'account_config',
      docId,
      {
        accountingStandard: options.accountingStandard,
        country: options.country,
      }
    ).catch((err) =>
      console.warn(
        'Erreur log audit:',
        err
      )
    );

  } catch (error: any) {
    console.error(
      'Erreur sauvegarde plan comptable:',
      error
    );

    throw error;
  }
};

// ============================================================
// RÉINITIALISATION DU PLAN COMPTABLE
// ============================================================

export const resetToDefaultMapping = async (
  teamId: string,
  appwriteTeamId: string,
  userId?: string
): Promise<void> => {

  const permissions = getWritePerms(appwriteTeamId);

  try {
    const existing = await databases.listDocuments(
      DATABASE_ID,
      'account_configs',
      [
        Query.equal('teamId', teamId),
        Query.limit(1),
      ]
    );

    if (existing.documents.length === 0) {
      return;
    }

    const docId = existing.documents[0].$id;

    await databases.updateDocument(
      DATABASE_ID,
      'account_configs',
      docId,
      {
        accountMappings: JSON.stringify({}),
        customAccounts: JSON.stringify([]),
        customSections: JSON.stringify([]),
        customized: false,
        updatedAt: new Date().toISOString(),
        updatedBy: userId || '',
      },
      permissions
    );

    await logAuditAction(
      teamId,
      userId || 'system',
      'reset_account_mapping',
      'account_config',
      docId,
      {
        action: 'reset_to_default',
      }
    ).catch((err) =>
      console.warn(
        'Erreur log audit reset:',
        err
      )
    );

  } catch (error: any) {
    console.error(
      'Erreur réinitialisation plan comptable:',
      error
    );

    throw error;
  }
};

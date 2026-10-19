// ============================================================
// 🎯 PCG PAR DÉFAUT POUR ARTISANS DU BÂTIMENT
// ============================================================

export interface AccountCategory {
  key: string;
  label: string;
  description: string;
  defaultNumber: string;
  defaultLabel: string;
  section: 'ventes' | 'clients' | 'tva' | 'tresorerie' | 'fournisseurs' | 'achats';
  required: boolean;
}

export const DEFAULT_PCG_ARTISAN: AccountCategory[] = [
  // ===== VENTES (Revenus) =====
  {
    key: 'sales_services',
    label: 'Ventes de prestations',
    description: 'Main d\'œuvre, interventions, chantiers',
    defaultNumber: '706000',
    defaultLabel: 'Prestations de services',
    section: 'ventes',
    required: true,
  },
  {
    key: 'sales_merchandise',
    label: 'Ventes de marchandises',
    description: 'Matériel revendu (chaudières, climatiseurs...)',
    defaultNumber: '707000',
    defaultLabel: 'Ventes de marchandises',
    section: 'ventes',
    required: false,
  },
  {
    key: 'sales_advance',
    label: 'Acomptes clients',
    description: 'Avances reçues sur travaux',
    defaultNumber: '419100',
    defaultLabel: 'Clients - Avances et acomptes reçus',
    section: 'ventes',
    required: false,
  },

  // ===== CLIENTS =====
  {
    key: 'client_base',
    label: 'Compte clients',
    description: 'Créances sur clients (préfixe 411)',
    defaultNumber: '411',
    defaultLabel: 'Clients',
    section: 'clients',
    required: true,
  },

  // ===== TVA =====
  {
    key: 'vat_collected',
    label: 'TVA collectée',
    description: 'TVA sur vos ventes',
    defaultNumber: '445710',
    defaultLabel: 'TVA collectée 20%',
    section: 'tva',
    required: true,
  },
  {
    key: 'vat_deductible',
    label: 'TVA déductible',
    description: 'TVA sur vos achats',
    defaultNumber: '445660',
    defaultLabel: 'TVA déductible sur biens et services',
    section: 'tva',
    required: true,
  },

  // ===== TRÉSORERIE =====
  {
    key: 'bank',
    label: 'Banque',
    description: 'Compte bancaire principal',
    defaultNumber: '512000',
    defaultLabel: 'Banque',
    section: 'tresorerie',
    required: true,
  },
  {
    key: 'cash',
    label: 'Caisse (espèces)',
    description: 'Paiements en espèces',
    defaultNumber: '530000',
    defaultLabel: 'Caisse',
    section: 'tresorerie',
    required: false,
  },

  // ===== FOURNISSEURS =====
  {
    key: 'supplier_base',
    label: 'Compte fournisseurs',
    description: 'Dettes fournisseurs (préfixe 401)',
    defaultNumber: '401',
    defaultLabel: 'Fournisseurs',
    section: 'fournisseurs',
    required: true,
  },

  // ===== ACHATS (Dépenses) =====
  {
    key: 'purchase_materials',
    label: 'Matériaux de construction',
    description: 'Bois, ciment, carrelage, tuyaux, câbles...',
    defaultNumber: '601000',
    defaultLabel: 'Achats stockés - Matières premières',
    section: 'achats',
    required: true,
  },
  {
    key: 'purchase_consumables',
    label: 'Consommables et petit outillage',
    description: 'Vis, colle, joints, petit matériel...',
    defaultNumber: '606000',
    defaultLabel: 'Achats non stockés - Fournitures',
    section: 'achats',
    required: false,
  },
  {
    key: 'purchase_merchandise',
    label: 'Marchandises achetées',
    description: 'Matériel destiné à la revente',
    defaultNumber: '607000',
    defaultLabel: 'Achats de marchandises',
    section: 'achats',
    required: false,
  },
  {
    key: 'subcontracting',
    label: 'Sous-traitance',
    description: 'Autres corps de métier (électricien, maçon...)',
    defaultNumber: '611000',
    defaultLabel: 'Sous-traitance générale',
    section: 'achats',
    required: false,
  },
  {
    key: 'rental',
    label: 'Location de matériel',
    description: 'Nacelle, échafaudage, outillage loué...',
    defaultNumber: '613000',
    defaultLabel: 'Locations',
    section: 'achats',
    required: false,
  },
  {
    key: 'maintenance',
    label: 'Entretien et réparations',
    description: 'Réparation du matériel et véhicules',
    defaultNumber: '615000',
    defaultLabel: 'Entretien et réparations',
    section: 'achats',
    required: false,
  },
  {
    key: 'insurance',
    label: 'Assurances',
    description: 'RC Pro, décennale, multirisque...',
    defaultNumber: '616000',
    defaultLabel: 'Primes d\'assurances',
    section: 'achats',
    required: false,
  },
  {
    key: 'transport',
    label: 'Déplacements et carburant',
    description: 'Essence, péages, frais de déplacement',
    defaultNumber: '625000',
    defaultLabel: 'Déplacements, missions et réceptions',
    section: 'achats',
    required: false,
  },
];

// ============================================================
// 🔄 CONVERSION VERS AccountMapping (format service export)
// ============================================================

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
}

/**
 * Génère le AccountMapping par défaut depuis la liste PCG
 */
export const getDefaultAccountMapping = (): AccountMapping => {
  const map: any = {};
  
  DEFAULT_PCG_ARTISAN.forEach(cat => {
    switch (cat.key) {
      case 'sales_services':
        map.salesAccount = cat.defaultNumber;
        map.salesAccountLabel = cat.defaultLabel;
        break;
      case 'sales_merchandise':
        map.salesMerchandiseAccount = cat.defaultNumber;
        map.salesMerchandiseLabel = cat.defaultLabel;
        break;
      case 'sales_advance':
        map.advanceAccount = cat.defaultNumber;
        map.advanceAccountLabel = cat.defaultLabel;
        break;
      case 'client_base':
        map.clientAccount = cat.defaultNumber;
        map.clientAccountLabel = cat.defaultLabel;
        break;
      case 'vat_collected':
        map.vatCollectedAccount = cat.defaultNumber;
        map.vatCollectedLabel = cat.defaultLabel;
        break;
      case 'vat_deductible':
        map.vatDeductibleAccount = cat.defaultNumber;
        map.vatDeductibleLabel = cat.defaultLabel;
        break;
      case 'bank':
        map.bankAccount = cat.defaultNumber;
        map.bankAccountLabel = cat.defaultLabel;
        break;
      case 'cash':
        map.cashAccount = cat.defaultNumber;
        map.cashAccountLabel = cat.defaultLabel;
        break;
      case 'supplier_base':
        map.supplierAccount = cat.defaultNumber;
        map.supplierAccountLabel = cat.defaultLabel;
        break;
      case 'purchase_materials':
        map.purchasesMaterialsAccount = cat.defaultNumber;
        map.purchasesMaterialsLabel = cat.defaultLabel;
        break;
      case 'purchase_consumables':
        map.purchasesConsumablesAccount = cat.defaultNumber;
        map.purchasesConsumablesLabel = cat.defaultLabel;
        break;
      case 'purchase_merchandise':
        map.purchasesMerchandiseAccount = cat.defaultNumber;
        map.purchasesMerchandiseLabel = cat.defaultLabel;
        break;
      case 'subcontracting':
        map.subcontractingAccount = cat.defaultNumber;
        map.subcontractingLabel = cat.defaultLabel;
        break;
      case 'rental':
        map.rentalAccount = cat.defaultNumber;
        map.rentalLabel = cat.defaultLabel;
        break;
      case 'maintenance':
        map.maintenanceAccount = cat.defaultNumber;
        map.maintenanceLabel = cat.defaultLabel;
        break;
      case 'insurance':
        map.insuranceAccount = cat.defaultNumber;
        map.insuranceLabel = cat.defaultLabel;
        break;
      case 'transport':
        map.transportAccount = cat.defaultNumber;
        map.transportLabel = cat.defaultLabel;
        break;
    }
  });

  return map as AccountMapping;
};
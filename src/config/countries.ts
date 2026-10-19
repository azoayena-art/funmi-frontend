// src/config/countries.ts
// ============================================================
// 🌍 REGISTRE INTERNATIONAL DES IDENTIFIANTS D'ENTREPRISE
// ------------------------------------------------------------
// Le pays sélectionné dans la page Entreprise pilote :
//   - Les identifiants fiscaux affichés (SIRET, USt-IdNr, EIN, NINEA, ICE, ...)
//   - Les validations (regex) de ces identifiants
//   - Le format du numéro de TVA et les taux
//   - Les mentions obligatoires sur factures / justificatifs
//   - La durée de conservation légale
//   - Le seuil de facture simplifiée
// ============================================================

// ============================================================
// 📐 TYPES
// ============================================================

/** Configuration d'un identifiant fiscal */
export interface IdentifierConfig {
  /** Clé de stockage (champ DB) */
  key: string;
  /** Libellé complet affiché */
  label: string;
  /** Libellé court (badges, colonnes) */
  shortLabel: string;
  /** Validation du format (optionnel) */
  pattern?: RegExp;
  /** Requis pour la déduction de TVA */
  requiredForVat: boolean;
  /** Exemple pour le placeholder */
  example?: string;
}

/** Configuration du régime de TVA */
export interface VatConfig {
  /** Le pays a-t-il un régime de TVA ? */
  enabled: boolean;
  /** Libellé local ("TVA", "MwSt", "IVA", "Sales Tax"...) */
  label: string;
  /** Libellé du numéro ("N° TVA intracommunautaire", "USt-IdNr"...) */
  numberLabel: string;
  /** Préfixe du numéro (FR, DE, GB...) */
  prefix?: string;
  /** Validation du numéro de TVA */
  pattern?: RegExp;
  /** Taux standards de référence */
  standardRates: number[];
  /** Membre de l'UE (VIES) */
  isEU: boolean;
}

/** Configuration complète d'un pays */
export interface CountryConfig {
  /** Code ISO 3166-1 alpha-2 */
  code: string;
  /** Nom du pays */
  name: string;
  /** Drapeau (emoji) */
  flag: string;
  /** Devise par défaut (ISO 4217) */
  currency: string;
  /** Identifiants fiscaux du pays */
  identifiers: IdentifierConfig[];
  /** Régime de TVA */
  vat: VatConfig;
  /** Durée de conservation légale (années) */
  retentionYears: number;
  /** Seuil de facture simplifiée (0 = pas de seuil) */
  simplifiedInvoiceThreshold: number;
}

// ============================================================
// 📦 REGISTRE DES PAYS
// ============================================================

export const COUNTRIES: Record<string, CountryConfig> = {
  // ============================================================
  // 🇪🇺 EUROPE
  // ============================================================
  FR: {
    code: 'FR', name: 'France', flag: '🇫🇷', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Numéro SIREN', shortLabel: 'SIREN',
        pattern: /^\d{9}$/, requiredForVat: true, example: '123456789' },
      { key: 'supplierSiret', label: 'Numéro SIRET', shortLabel: 'SIRET',
        pattern: /^\d{14}$/, requiredForVat: false, example: '12345678900012' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro TVA intracommunautaire',
      prefix: 'FR', pattern: /^FR[0-9A-Z]{2}\d{9}$/i, standardRates: [20, 10, 5.5, 2.1], isEU: true },
    retentionYears: 6, simplifiedInvoiceThreshold: 150,
  },

  DE: {
    code: 'DE', name: 'Allemagne', flag: '🇩🇪', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Steuernummer', shortLabel: 'St.-Nr.',
        pattern: /^\d{2,3}\/?\d{3}\/?\d{5,6}$/, requiredForVat: true, example: '12/345/67890' },
      { key: 'supplierHrb', label: 'Handelsregister (HRB)', shortLabel: 'HRB',
        pattern: /^HR[AB]\s?\d+$/i, requiredForVat: false, example: 'HRB 12345' },
    ],
    vat: { enabled: true, label: 'MwSt', numberLabel: 'USt-IdNr',
      prefix: 'DE', pattern: /^DE\d{9}$/, standardRates: [19, 7], isEU: true },
    retentionYears: 10, simplifiedInvoiceThreshold: 250,
  },

  GB: {
    code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧', currency: 'GBP',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Company Number', shortLabel: 'Company N°',
        pattern: /^[0-9A-Z]{8}$/i, requiredForVat: true, example: '12345678' },
      { key: 'supplierUtr', label: 'Unique Taxpayer Reference', shortLabel: 'UTR',
        pattern: /^\d{10}$/, requiredForVat: false, example: '1234567890' },
    ],
    vat: { enabled: true, label: 'VAT', numberLabel: 'VAT Registration Number',
      prefix: 'GB', pattern: /^GB(\d{9}|\d{12})$/, standardRates: [20, 5], isEU: false },
    retentionYears: 6, simplifiedInvoiceThreshold: 250,
  },

  ES: {
    code: 'ES', name: 'Espagne', flag: '🇪🇸', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF / CIF', shortLabel: 'NIF',
        pattern: /^[A-HJ-NP-SUVW]?\d{7,8}[A-J0-9]?$/i, requiredForVat: true, example: 'B12345678' },
    ],
    vat: { enabled: true, label: 'IVA', numberLabel: 'NIF-IVA',
      prefix: 'ES', pattern: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, standardRates: [21, 10, 4], isEU: true },
    retentionYears: 6, simplifiedInvoiceThreshold: 400,
  },

  IT: {
    code: 'IT', name: 'Italie', flag: '🇮🇹', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Partita IVA', shortLabel: 'P.IVA',
        pattern: /^\d{11}$/, requiredForVat: true, example: '12345678901' },
      { key: 'supplierCodiceFiscale', label: 'Codice Fiscale', shortLabel: 'C.F.',
        pattern: /^[A-Z0-9]{11,16}$/i, requiredForVat: false, example: 'RSSMRA85M01H501Z' },
    ],
    vat: { enabled: true, label: 'IVA', numberLabel: 'Partita IVA',
      prefix: 'IT', pattern: /^IT\d{11}$/, standardRates: [22, 10, 5, 4], isEU: true },
    retentionYears: 10, simplifiedInvoiceThreshold: 400,
  },

  BE: {
    code: 'BE', name: 'Belgique', flag: '🇧🇪', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: "Numéro d'entreprise (KBO/BCE)", shortLabel: 'N° entreprise',
        pattern: /^0\d{9}$/, requiredForVat: true, example: '0123456789' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: 'BE', pattern: /^BE0?\d{9}$/, standardRates: [21, 12, 6], isEU: true },
    retentionYears: 7, simplifiedInvoiceThreshold: 250,
  },

  NL: {
    code: 'NL', name: 'Pays-Bas', flag: '🇳🇱', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'KvK-nummer', shortLabel: 'KvK',
        pattern: /^\d{8}$/, requiredForVat: true, example: '12345678' },
    ],
    vat: { enabled: true, label: 'BTW', numberLabel: 'BTW-nummer (RSIN)',
      prefix: 'NL', pattern: /^NL\d{9}B\d{2}$/, standardRates: [21, 9], isEU: true },
    retentionYears: 7, simplifiedInvoiceThreshold: 250,
  },

  LU: {
    code: 'LU', name: 'Luxembourg', flag: '🇱🇺', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Matricule (RCS)', shortLabel: 'RCS',
        pattern: /^[A-Z]\d{8}$/i, requiredForVat: true, example: 'B123456' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: 'LU', pattern: /^LU\d{8}$/, standardRates: [17, 14, 8], isEU: true },
    retentionYears: 10, simplifiedInvoiceThreshold: 100,
  },

  PT: {
    code: 'PT', name: 'Portugal', flag: '🇵🇹', currency: 'EUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF / NIPC', shortLabel: 'NIF',
        pattern: /^\d{9}$/, requiredForVat: true, example: '123456789' },
    ],
    vat: { enabled: true, label: 'IVA', numberLabel: 'NIF-IVA',
      prefix: 'PT', pattern: /^PT\d{9}$/, standardRates: [23, 13, 6], isEU: true },
    retentionYears: 10, simplifiedInvoiceThreshold: 1000,
  },

  CH: {
    code: 'CH', name: 'Suisse', flag: '🇨🇭', currency: 'CHF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'IDE / UID', shortLabel: 'IDE',
        pattern: /^CHE-?\d{3}\.?\d{3}\.?\d{3}$/, requiredForVat: true, example: 'CHE-123.456.789' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'N° TVA',
      prefix: 'CHE', pattern: /^CHE-?\d{3}\.?\d{3}\.?\d{3}$/, standardRates: [8.1, 2.6], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 400,
  },

  // ============================================================
  // 🌍 AFRIQUE — ZONE CFA BCEAO (XOF)
  // ============================================================
  SN: {
    code: 'SN', name: 'Sénégal', flag: '🇸🇳', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NINEA (N° d\'Identification Nationale des Entreprises et Associations)', shortLabel: 'NINEA',
        pattern: /^\d{6,9}$/, requiredForVat: true, example: '123456789' },
      { key: 'supplierRccm', label: 'RCCM (Registre du Commerce et du Crédit Mobilier)', shortLabel: 'RCCM',
        pattern: /^[A-Z]{2}[A-Z0-9]{1,3}\d{4}[A-Z]\d{7,8}$/i, requiredForVat: false, example: 'SN-DKR-2020-B-12345' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA (Compte fiscal)',
      prefix: '', standardRates: [18, 10, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  CI: {
    code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Compte Contribuable (CC)', shortLabel: 'CC',
        pattern: /^C\d{10}$/, requiredForVat: true, example: 'C1234567890' },
      { key: 'supplierRccm', label: 'RCCM', shortLabel: 'RCCM',
        pattern: /^[A-Z]{2}[A-Z0-9]{1,3}\d{4}[A-Z]\d{7,8}$/i, requiredForVat: false, example: 'CI-ABJ-2020-B-12345' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 9, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 100000,
  },

  ML: {
    code: 'ML', name: 'Mali', flag: '🇲🇱', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF (Numéro d\'Identification Fiscale)', shortLabel: 'NIF',
        pattern: /^\d{11,13}$/, requiredForVat: true, example: '12345678901' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  BF: {
    code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'IFU (Identifiant Financier Unique)', shortLabel: 'IFU',
        pattern: /^\d{13,14}$/, requiredForVat: true, example: '12345678901234' },
      { key: 'supplierRccm', label: 'RCCM', shortLabel: 'RCCM',
        pattern: /^[A-Z]{2}[A-Z0-9]{1,3}\d{4}[A-Z]\d{7,8}$/i, requiredForVat: false, example: 'BF-OUA-2020-B-12345' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 10, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  NE: {
    code: 'NE', name: 'Niger', flag: '🇳🇪', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF', shortLabel: 'NIF',
        pattern: /^\d{8,12}$/, requiredForVat: true, example: '12345678' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [19, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  BJ: {
    code: 'BJ', name: 'Bénin', flag: '🇧🇯', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'IFU (Identifiant Fiscal Unique)', shortLabel: 'IFU',
        pattern: /^\d{9,13}$/, requiredForVat: true, example: '123456789' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  TG: {
    code: 'TG', name: 'Togo', flag: '🇹🇬', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'N° Contribuable (CC)', shortLabel: 'CC',
        pattern: /^P\d{9}$/, requiredForVat: true, example: 'P123456789' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  GW: {
    code: 'GW', name: 'Guinée-Bissau', flag: '🇬🇼', currency: 'XOF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF', shortLabel: 'NIF',
        requiredForVat: true },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  // ============================================================
  // 🌍 AFRIQUE — ZONE CFA BEAC (XAF)
  // ============================================================
  CM: {
    code: 'CM', name: 'Cameroun', flag: '🇨🇲', currency: 'XAF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIU (Numéro Identifiant Unique)', shortLabel: 'NIU',
        pattern: /^P\d{9}$|^M?\d{9}$/, requiredForVat: true, example: 'P123456789' },
      { key: 'supplierRccm', label: 'RCCM', shortLabel: 'RCCM',
        pattern: /^[A-Z]{2}[A-Z0-9]{1,3}\d{4}[A-Z]\d{7,8}$/i, requiredForVat: false, example: 'CM-DLA-2020-B-12345' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [19.25, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  GA: {
    code: 'GA', name: 'Gabon', flag: '🇬🇦', currency: 'XAF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Numéro fiscal', shortLabel: 'N° fiscal',
        requiredForVat: true },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 10, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  CG: {
    code: 'CG', name: 'Congo (Brazzaville)', flag: '🇨🇬', currency: 'XAF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'RCCM', shortLabel: 'RCCM',
        pattern: /^[A-Z]{2}[A-Z0-9]{1,3}\d{4}[A-Z]\d{7,8}$/i, requiredForVat: true, example: 'CG-BZV-2020-B-12345' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  TD: {
    code: 'TD', name: 'Tchad', flag: '🇹🇩', currency: 'XAF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF', shortLabel: 'NIF',
        requiredForVat: true },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  CF: {
    code: 'CF', name: 'Centrafrique', flag: '🇨🇫', currency: 'XAF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'RCCM', shortLabel: 'RCCM',
        pattern: /^[A-Z]{2}[A-Z0-9]{1,3}\d{4}[A-Z]\d{7,8}$/i, requiredForVat: true },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [19, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  GQ: {
    code: 'GQ', name: 'Guinée équatoriale', flag: '🇬🇶', currency: 'XAF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF', shortLabel: 'NIF',
        requiredForVat: true },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [15, 6, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  // ============================================================
  // 🌍 AFRIQUE DU NORD (MAGHREB)
  // ============================================================
  MA: {
    code: 'MA', name: 'Maroc', flag: '🇲🇦', currency: 'MAD',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'ICE (Identifiant Commun de l\'Entreprise)', shortLabel: 'ICE',
        pattern: /^\d{15}$/, requiredForVat: true, example: '001234567890123' },
      { key: 'supplierIF', label: 'IF (Identifiant Fiscal)', shortLabel: 'IF',
        pattern: /^\d{8,10}$/, requiredForVat: false, example: '12345678' },
      { key: 'supplierRC', label: 'RC (Registre de Commerce)', shortLabel: 'RC',
        requiredForVat: false, example: '123456' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro TVA',
      prefix: '', standardRates: [20, 14, 10, 7], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 10000,
  },

  TN: {
    code: 'TN', name: 'Tunisie', flag: '🇹🇳', currency: 'TND',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'Matricule fiscal', shortLabel: 'Mat. fiscal',
        pattern: /^\d{8}[A-Z]{3}\d{3}$/, requiredForVat: true, example: '1234567ABC001' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [19, 13, 7, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 1000,
  },

  DZ: {
    code: 'DZ', name: 'Algérie', flag: '🇩🇿', currency: 'DZD',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF (Numéro d\'Identification Fiscale)', shortLabel: 'NIF',
        pattern: /^\d{15}$/, requiredForVat: true, example: '001216012345678' },
      { key: 'supplierNIS', label: 'NIS (Numéro d\'Identification Statistique)', shortLabel: 'NIS',
        pattern: /^\d{15}$/, requiredForVat: false, example: '001216012345678' },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [19, 9, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 50000,
  },

  // ============================================================
  // 🌍 AFRIQUE — AUTRES PAYS
  // ============================================================
  MG: {
    code: 'MG', name: 'Madagascar', flag: '🇲🇬', currency: 'MGA',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF', shortLabel: 'NIF',
        requiredForVat: true },
      { key: 'supplierSTAT', label: 'N° STAT', shortLabel: 'STAT',
        requiredForVat: false },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [20, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 200000,
  },

  MU: {
    code: 'MU', name: 'Île Maurice', flag: '🇲🇺', currency: 'MUR',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'BRN (Business Registration Number)', shortLabel: 'BRN',
        pattern: /^C\d{7,8}$/, requiredForVat: true, example: 'C12345678' },
    ],
    vat: { enabled: true, label: 'VAT', numberLabel: 'VAT Number',
      prefix: '', standardRates: [15, 0], isEU: false },
    retentionYears: 7, simplifiedInvoiceThreshold: 50000,
  },

  GN: {
    code: 'GN', name: 'Guinée (Conakry)', flag: '🇬🇳', currency: 'GNF',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'NIF', shortLabel: 'NIF',
        requiredForVat: true },
    ],
    vat: { enabled: true, label: 'TVA', numberLabel: 'Numéro de TVA',
      prefix: '', standardRates: [18, 0], isEU: false },
    retentionYears: 10, simplifiedInvoiceThreshold: 500000,
  },

  // ============================================================
  // 🌎 AMÉRIQUES
  // ============================================================
  CA: {
    code: 'CA', name: 'Canada', flag: '🇨🇦', currency: 'CAD',
    identifiers: [
      { key: 'supplierRegistrationId', label: "Numéro d'entreprise (NE)", shortLabel: 'NE',
        pattern: /^\d{9}(RC|RT|RM|RP|RN)\d{4}$/, requiredForVat: true, example: '123456789RC0001' },
    ],
    vat: { enabled: true, label: 'TPS/TVH', numberLabel: 'Numéro TPS/TVH',
      prefix: '', pattern: /^\d{9}RT\d{4}$/, standardRates: [5], isEU: false },
    retentionYears: 6, simplifiedInvoiceThreshold: 30,
  },

  US: {
    code: 'US', name: 'États-Unis', flag: '🇺🇸', currency: 'USD',
    identifiers: [
      { key: 'supplierRegistrationId', label: 'EIN (Employer Identification Number)', shortLabel: 'EIN',
        pattern: /^\d{2}-?\d{7}$/, requiredForVat: true, example: '12-3456789' },
    ],
    vat: { enabled: false, label: 'Sales Tax', numberLabel: 'State Tax ID',
      prefix: '', standardRates: [0], isEU: false },
    retentionYears: 7, simplifiedInvoiceThreshold: 0,
  },
};

// ============================================================
// 🛟 CONFIGURATION DE SECOURS (pays inconnu)
// ============================================================
export const FALLBACK_COUNTRY: CountryConfig = {
  code: 'XX', name: 'Autre', flag: '🏳️', currency: 'EUR',
  identifiers: [
    { key: 'supplierRegistrationId', label: "Numéro d'identification", shortLabel: 'ID',
      requiredForVat: true },
  ],
  vat: { enabled: true, label: 'Taxe', numberLabel: 'Numéro de taxe',
    prefix: '', standardRates: [20], isEU: false },
  retentionYears: 6, simplifiedInvoiceThreshold: 150,
};

// ============================================================
// 🔧 HELPERS
// ============================================================

/**
 * Retourne la configuration d'un pays par son code ISO.
 * Retourne la configuration de secours si le pays est inconnu.
 */
export const getCountryConfig = (code?: string | null): CountryConfig => {
  if (!code) return FALLBACK_COUNTRY;
  return COUNTRIES[code.toUpperCase()] || FALLBACK_COUNTRY;
};

/**
 * Vérifie si un code pays est connu dans le registre.
 */
export const isKnownCountry = (code?: string | null): boolean => {
  return !!code && !!COUNTRIES[code.toUpperCase()];
};

/**
 * Retourne la liste des options de pays pour les sélecteurs.
 * Format : [{ value: 'FR', label: '🇫🇷 France' }, ...]
 */
export const listCountryOptions = (): Array<{ value: string; label: string }> => {
  return Object.values(COUNTRIES).map(c => ({
    value: c.code,
    label: `${c.flag} ${c.name}`,
  }));
};

/**
 * Retourne l'identifiant principal (celui requis pour la TVA).
 */
export const getPrimaryIdentifier = (config: CountryConfig): IdentifierConfig => {
  return config.identifiers.find(i => i.requiredForVat) || config.identifiers[0];
};

/**
 * Valide un identifiant selon sa configuration.
 * Si pas de pattern défini, vérifie juste que la valeur est non vide.
 */
export const validateIdentifier = (identifier: IdentifierConfig, value?: string): boolean => {
  if (!value || !value.trim()) return false;
  if (!identifier.pattern) return true;
  return identifier.pattern.test(value.trim());
};

/**
 * Retourne le numéro de TVA formaté avec son préfixe pays.
 * Ex: FR + 12345678901 → FR12345678901
 */
export const formatVatNumber = (config: CountryConfig, vatNumber: string): string => {
  if (!vatNumber) return '';
  const clean = vatNumber.replace(/\s/g, '').toUpperCase();
  if (config.vat.prefix && !clean.startsWith(config.vat.prefix)) {
    return `${config.vat.prefix}${clean}`;
  }
  return clean;
};

/**
 * Valide un numéro de TVA selon le pays.
 * Si pas de pattern défini, vérifie juste que la valeur est non vide.
 */
export const validateVatNumber = (config: CountryConfig, vatNumber?: string): boolean => {
  if (!vatNumber || !vatNumber.trim()) return false;
  if (!config.vat.pattern) return true;
  const clean = vatNumber.replace(/\s/g, '').toUpperCase();
  return config.vat.pattern.test(clean);
};

/**
 * Retourne le taux de TVA par défaut d'un pays.
 * Utilise le premier taux de la liste (généralement le taux normal).
 */
export const getDefaultVatRate = (config: CountryConfig): number => {
  return config.vat.standardRates[0] || 20;
};

/**
 * Vérifie si un pays utilise la devise FCFA (XOF ou XAF).
 */
export const isCfaZone = (code?: string | null): boolean => {
  if (!code) return false;
  const config = COUNTRIES[code.toUpperCase()];
  return config?.currency === 'XOF' || config?.currency === 'XAF';
};

/**
 * Retourne la liste des pays d'une zone géographique.
 * Zones supportées : 'europe' | 'africa' | 'cfa' | 'maghreb' | 'americas'
 */
export const listCountriesByZone = (zone: 'europe' | 'africa' | 'cfa' | 'maghreb' | 'americas'): CountryConfig[] => {
  const zoneMap: Record<string, string[]> = {
    europe: ['FR', 'DE', 'GB', 'ES', 'IT', 'BE', 'NL', 'LU', 'PT', 'CH'],
    cfa: ['SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'],
    maghreb: ['MA', 'TN', 'DZ'],
    africa: ['SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ', 'MA', 'TN', 'DZ', 'MG', 'MU', 'GN'],
    americas: ['CA', 'US'],
  };
  const codes = zoneMap[zone] || [];
  return codes.map(code => COUNTRIES[code]).filter(Boolean);
};

/**
 * Retourne le montant formaté selon la devise du pays.
 */
export const formatAmountByCountry = (config: CountryConfig, amount: number): string => {
  const localeMap: Record<string, string> = {
    EUR: 'fr-FR', XOF: 'fr-FR', XAF: 'fr-FR', MAD: 'fr-MA',
    TND: 'ar-TN', DZD: 'ar-DZ', GNF: 'fr-FR', MGA: 'fr-FR',
    MUR: 'fr-FR', USD: 'en-US', CAD: 'fr-CA', GBP: 'en-GB', CHF: 'de-CH',
  };
  const locale = localeMap[config.currency] || 'fr-FR';
  const noDecimals = ['XOF', 'XAF', 'GNF', 'JPY'].includes(config.currency);
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: config.currency,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(noDecimals ? 0 : 2)} ${config.currency}`;
  }
};
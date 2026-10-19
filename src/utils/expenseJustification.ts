// src/utils/expenseJustification.ts
// Évaluation de la conformité des justificatifs de dépenses
// Vérifie les mentions obligatoires selon le montant et le type de document

import type { CountryConfig, IdentifierConfig } from '../config/countries';
import { getCountryConfig, getPrimaryIdentifier, FALLBACK_COUNTRY } from '../config/countries';

export type JustificationType = 'invoice' | 'receipt' | 'ticket' | 'expense_report' | 'other';

export type JustificationLevel = 'complete' | 'partial' | 'insufficient' | 'missing';

export interface JustificationCheck {
  level: JustificationLevel;
  score: number;
  presentMentions: string[];
  missingMentions: string[];
  isDeductibleVAT: boolean;
  isDeductibleResult: boolean;
  warnings: string[];
  countryConfig: CountryConfig;
}

export interface RetentionCheck {
  ok: boolean;
  yearsLeft: number;
  message: string;
}

export interface JustifiableExpense {
  expenseId: string;
  expenseType: string;
  amount: number;
  expenseDate?: string;
  justificationNumber?: string;
  justificationDate?: string;
  supplierName?: string;
  supplierSiret?: string;
  supplierVatNumber?: string;
  description?: string;
  category?: string;
  country?: string;
}

// ============================================================
// CONSTANTES
// ============================================================

/** Seuil de facture simplifiée en EUR (modifiable selon pays) */
const SIMPLIFIED_INVOICE_THRESHOLD = 150;

/** Catégories ouvrant droit à déduction TVA */
export const VAT_DEDUCTIBLE_CATEGORIES: string[] = [
  'supplier_payment', 'supplier_advance', 'subscription', 'rent',
  'insurance', 'fuel', 'travel', 'marketing', 'equipment',
  'software', 'consulting', 'maintenance', 'utilities'
];

/** Catégories NON déductibles (TVA et/ou résultat) */
export const NON_DEDUCTIBLE_CATEGORIES: string[] = [
  'loan_repayment',   // Remboursement d'emprunt = pas une charge
  'petty_cash',       // Petite caisse = à régulariser
];

/** Catégories partiellement déductibles (plafonnées) */
export const PARTIALLY_DEDUCTIBLE_CATEGORIES: Record<string, string> = {
  'restaurant': 'Plafond : 19,20 € TTC / repas (2024)',
  'gift': 'Plafond : 73 € TTC / bénéficiaire / an',
  'vehicle': 'Selon CO2 et usage professionnel',
};

// ============================================================
// MENTIONS OBLIGATOIRES
// ============================================================

/** Mentions obligatoires pour une FACTURE COMPLÈTE (≥ 150 €) */
const COMPLETE_INVOICE_REQUIREMENTS = [
  { key: 'justificationNumber', label: 'Numéro de facture',            weight: 15 },
  { key: 'justificationDate',  label: 'Date de la facture',            weight: 15 },
  { key: 'supplierName',       label: 'Nom du fournisseur',            weight: 10 },
  { key: 'supplierSiret',      label: 'SIRET/SIREN fournisseur',       weight: 10 },
  { key: 'amount',             label: 'Montant TTC',                   weight: 15 },
  { key: 'description',        label: 'Description détaillée',         weight: 10 },
];

/** Mentions pour une FACTURE SIMPLIFIÉE / TICKET (< 150 €) */
const SIMPLIFIED_INVOICE_REQUIREMENTS = [
  { key: 'justificationDate', label: 'Date',         weight: 20 },
  { key: 'amount',            label: 'Montant TTC',  weight: 30 },
  { key: 'supplierName',      label: 'Fournisseur',  weight: 20 },
];

// ============================================================
// MÉTADONNÉES POUR L'AFFICHAGE
// ============================================================

/** Libellés + couleurs par niveau (pour Badge / StatCell) */
export const JUSTIFICATION_LEVEL_META: Record<JustificationLevel, {
  label: string;
  tone: 'emerald' | 'amber' | 'orange' | 'rose';
  icon: string;
}> = {
  complete:     { label: 'Conforme',           tone: 'emerald', icon: '✓' },
  partial:      { label: 'Partiel',            tone: 'amber',   icon: '⚠' },
  insufficient: { label: 'Insuffisant',        tone: 'orange',  icon: '!' },
  missing:      { label: 'Manquant',           tone: 'rose',    icon: '✗' },
};

/** Libellés par type de justificatif */
export const JUSTIFICATION_TYPE_META: Record<JustificationType, {
  label: string;
  icon: string;
}> = {
  invoice:        { label: 'Facture',           icon: '📄' },
  receipt:        { label: 'Ticket / Reçu',     icon: '🧾' },
  ticket:         { label: 'Note de frais',     icon: '🎫' },
  expense_report: { label: 'Rapport de frais',  icon: '📊' },
  other:          { label: 'Autre',             icon: '📎' },
};

// ============================================================
// HELPERS
// ============================================================

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const hasValue = (v: unknown): boolean =>
  v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Détermine si une catégorie est déductible TVA.
 */
export const isVatDeductibleCategory = (category?: string): boolean => {
  if (!category) return false;
  if (NON_DEDUCTIBLE_CATEGORIES.includes(category)) return false;
  return VAT_DEDUCTIBLE_CATEGORIES.includes(category);
};

/**
 * Détermine si une catégorie est déductible du résultat (IS/BIC).
 * (Toutes sauf les remboursements d'emprunt et la petite caisse)
 */
export const isResultDeductibleCategory = (category?: string): boolean => {
  if (!category) return false;
  return !NON_DEDUCTIBLE_CATEGORIES.includes(category);
};

// ============================================================
// FONCTION PRINCIPALE : ÉVALUATION
// ============================================================

/**
 * Évalue la conformité d'un justificatif de dépense.
 * Retourne le niveau, le score, les mentions manquantes et la déductibilité.
 */
export const evaluateJustification = (expense: JustifiableExpense): JustificationCheck => {
  const presentMentions: string[] = [];
  const missingMentions: string[] = [];
  const warnings: string[] = [];

  const countryConfig = getCountryConfig(expense.country) || FALLBACK_COUNTRY;
  const threshold = countryConfig.simplifiedInvoiceThreshold || SIMPLIFIED_INVOICE_THRESHOLD;

  // Déterminer le type de justificatif selon le montant
  const isSimplified = expense.amount < threshold;
  const requirements = isSimplified ? SIMPLIFIED_INVOICE_REQUIREMENTS : COMPLETE_INVOICE_REQUIREMENTS;

  // Vérifier chaque mention
  let score = 0;
  let maxScore = 0;

  requirements.forEach(req => {
    maxScore += req.weight;
    const value = expense[req.key as keyof JustifiableExpense];
    if (hasValue(value)) {
      presentMentions.push(req.label);
      score += req.weight;
    } else {
      missingMentions.push(req.label);
    }
  });

  // Calculer le pourcentage
  const percentage = maxScore > 0 ? round2((score / maxScore) * 100) : 0;

  // Déterminer le niveau
  let level: JustificationLevel;
  if (percentage >= 100) {
    level = 'complete';
  } else if (percentage >= 70) {
    level = 'partial';
  } else if (percentage > 0) {
    level = 'insufficient';
  } else {
    level = 'missing';
  }

  // Avertissements
  if (expense.amount < threshold) {
    warnings.push(`Montant < ${threshold} ${countryConfig.currency} : une facture simplifiée suffirait.`);
  } else if (!isSimplified) {
    warnings.push(`Montant ≥ ${threshold} ${countryConfig.currency} : une facture complète est requise (pas un simple ticket).`);
  }

  if (PARTIALLY_DEDUCTIBLE_CATEGORIES[expense.category || '']) {
    warnings.push(PARTIALLY_DEDUCTIBLE_CATEGORIES[expense.category || '']);
  }

  // Déductibilité
  const isDeductibleVAT = isVatDeductibleCategory(expense.category);
  const isDeductibleResult = isResultDeductibleCategory(expense.category);

  return {
    level,
    score: percentage,
    presentMentions,
    missingMentions,
    isDeductibleVAT,
    isDeductibleResult,
    warnings,
    countryConfig,
  };
};

// ============================================================
// VÉRIFICATION DE LA DURÉE DE CONSERVATION
// ============================================================

/**
 * Vérifie si le justificatif est encore dans la période de conservation légale.
 * Durée : 6 ans (fiscal) à compter de la date du document.
 */
export const checkRetention = (justificationDate?: string): RetentionCheck => {
  if (!hasValue(justificationDate)) {
    return { ok: false, yearsLeft: 0, message: 'Date du justificatif manquante' };
  }

  const docDate = new Date(justificationDate!);
  if (isNaN(docDate.getTime())) {
    return { ok: false, yearsLeft: 0, message: 'Date invalide' };
  }

  const RETENTION_YEARS = 6;
  const retentionEnd = new Date(docDate);
  retentionEnd.setFullYear(retentionEnd.getFullYear() + RETENTION_YEARS);

  const now = new Date();
  const msLeft = retentionEnd.getTime() - now.getTime();
  const yearsLeft = Math.max(0, msLeft / (1000 * 60 * 60 * 24 * 365));

  if (msLeft > 0) {
    return {
      ok: true,
      yearsLeft: round2(yearsLeft),
      message: `Conservation valide encore ${Math.ceil(yearsLeft)} an(s)`,
    };
  } else {
    return {
      ok: false,
      yearsLeft: 0,
      message: `Durée de conservation dépassée (${Math.abs(Math.ceil(yearsLeft))} an(s))`,
    };
  }
};

// ============================================================
// PATCH POUR MISE À JOUR DU DOCUMENT
// ============================================================

/**
 * Génère un objet de mise à jour pour patcher le document avec les résultats d'évaluation.
 */
export const buildJustificationPatch = (
  check: JustificationCheck,
  retention: RetentionCheck
): Record<string, any> => {
  return {
    justificationLevel: check.level,
    justificationScore: check.score,
    justificationPresentMentions: check.presentMentions,
    justificationMissingMentions: check.missingMentions,
    isDeductibleVAT: check.isDeductibleVAT,
    isDeductibleResult: check.isDeductibleResult,
    justificationWarnings: check.warnings,
    retentionOk: retention.ok,
    retentionYearsLeft: retention.yearsLeft,
    retentionMessage: retention.message,
    evaluatedAt: new Date().toISOString(),
  };
};

/**
 * Réévalue un justificatif et retourne le patch complet.
 */
export const reevaluateExpense = (
  expense: JustifiableExpense
): { check: JustificationCheck; retention: RetentionCheck; patch: Record<string, any> } => {
  const check = evaluateJustification(expense);
  const retention = checkRetention(expense.justificationDate);
  const patch = buildJustificationPatch(check, retention);

  return { check, retention, patch };
};
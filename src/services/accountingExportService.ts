// ============================================================
// 📦 SERVICE D'EXPORT COMPTABLE - VERSION CORRIGÉE
// Conforme art. L47 A du Livre des Procédures Fiscales (FEC)
// Sécurité multi-tenant + Logique comptable stricte
// ============================================================

import { databases, DATABASE_ID } from '../appwrite';
import { Query, Permission, Role } from 'appwrite';

// ============================================================
// 📋 TYPES & INTERFACES
// ============================================================

export interface JournalEntry {
  id: string;
  journalCode: string;
  journalLib: string;
  entryNumber: string;
  entryDate: string;
  accountNumber: string;
  accountLabel: string;
  auxAccountNumber: string;
  auxAccountLabel: string;
  pieceRef: string;
  pieceDate: string;
  entryLabel: string;
  debit: number;
  credit: number;
  currency: string;
}

export interface ExportConfig {
  startDate: Date;
  endDate: Date;
  teamId: string;
  format: 'fec' | 'csv' | 'sage' | 'cegid' | 'ebp' | 'quickbooks';
  includeDrafts?: boolean;
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
}

// ============================================================
// 🎯 LOGIQUE COMPTABLE - STATUTS À EXPORTER
// ============================================================

/**
 * Statuts de factures CLIENTS à exporter en comptabilité
 * Une facture client est comptabilisée dès son émission (même non payée)
 */
const CLIENT_INVOICE_EXPORTABLE_STATUSES = [
  'sent',       // Émise / Envoyée
  'viewed',     // Vue par le client
  'accepted',   // Acceptée
  'partial',    // Partiellement payée
  'paid',       // Payée
  'overdue',    // En retard / Impayée
  'credit',     // Avoir validé (type = 'credit')
];

/**
 * Statuts de factures CLIENTS à EXCLURE
 */
const CLIENT_INVOICE_EXCLUDED_STATUSES = [
  'draft',      // Brouillon
  'cancelled',  // Annulée
  'rejected',   // Rejetée par le client
];

/**
 * Statuts de factures FOURNISSEURS à exporter en comptabilité
 * Une facture fournisseur est comptabilisée uniquement après VALIDATION par l'artisan
 */
const SUPPLIER_INVOICE_EXPORTABLE_STATUSES = [
  'received',   // Reçue et validée
  'accepted',   // Acceptée
  'to_pay',     // À payer
  'partial',    // Partiellement payée
  'paid',       // Payée
  'overdue',    // En retard
];

/**
 * Statuts de factures FOURNISSEURS à EXCLURE
 * IMPORTANT : pending (en attente) et rejected (rejetée) ne doivent PAS être exportés
 */
const SUPPLIER_INVOICE_EXCLUDED_STATUSES = [
  'draft',      // Brouillon
  'pending',    // En attente de validation ← IMPORTANT
  'rejected',   // Rejetée / Contestée ← IMPORTANT
  'cancelled',  // Annulée
];

// ============================================================
// 🎯 MAPPING PCG PAR DÉFAUT
// ============================================================

export const DEFAULT_ACCOUNT_MAPPING: AccountMapping = {
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
  insuranceLabel: 'Primes d\'assurances',
  transportAccount: '625000',
  transportLabel: 'Déplacements, missions et réceptions',
};

// ============================================================
// 🔒 HELPERS SÉCURITÉ
// ============================================================

const getReadPerms = (teamId: string) => [
  Permission.read(Role.team(teamId)),
];

const validateTeamId = (teamId: string): void => {
  if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
    throw new Error('Erreur de sécurité : teamId invalide');
  }
};

// ============================================================
// 🛠️ HELPERS FORMATAGE
// ============================================================

const formatDateFEC = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const sanitizeAccountNumber = (str: string): string => {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();
};

const getClientAuxNumber = (clientName: string): string => {
  if (!clientName) return 'CLIENT001';
  const base = sanitizeAccountNumber(clientName);
  return base.substring(0, 6) || 'CLIENT001';
};

const parsePayments = (paymentsStr: string | undefined): any[] => {
  if (!paymentsStr) return [];
  try {
    const parsed = typeof paymentsStr === 'string' ? JSON.parse(paymentsStr) : paymentsStr;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ============================================================
// ✅ FILTRES COMPTABLES
// ============================================================

/**
 * Vérifie si une facture CLIENT doit être exportée
 * Logique : facture comptabilisée dès émission, même non payée
 */
const shouldExportClientInvoice = (invoice: any): boolean => {
  // Annulée = jamais exportée
  if (invoice.status === 'cancelled') return false;
  
  // Brouillon = jamais exporté
  if (invoice.status === 'draft') return false;
  
  // Rejetée = jamais exportée
  if (invoice.status === 'rejected') return false;
  
  // Avoir (type = 'credit') = toujours exporté si validé
  if (invoice.type === 'credit') return true;
  
  // Autres statuts : vérifier dans la liste autorisée
  return CLIENT_INVOICE_EXPORTABLE_STATUSES.includes(invoice.status);
};

/**
 * Vérifie si une facture FOURNISSEUR doit être exportée
 * Logique : facture comptabilisée uniquement après validation par l'artisan
 * IMPORTANT : rejected et pending ne sont JAMAIS exportés
 */
const shouldExportSupplierInvoice = (invoice: any): boolean => {
  // Brouillon = jamais exporté
  if (invoice.status === 'draft') return false;
  
  // En attente de validation = PAS exporté (l'artisan n'a pas encore validé)
  if (invoice.status === 'pending') return false;
  
  // Rejetée = jamais exportée (facture contestée)
  if (invoice.status === 'rejected') return false;
  
  // Annulée = jamais exportée
  if (invoice.status === 'cancelled') return false;
  
  // Avoir fournisseur = exporté si validé
  if (invoice.type === 'credit') return true;
  
  // Autres statuts : vérifier dans la liste autorisée
  return SUPPLIER_INVOICE_EXPORTABLE_STATUSES.includes(invoice.status);
};

// ============================================================
// 📝 GÉNÉRATION ÉCRITURES FACTURE CLIENT
// ============================================================

const generateInvoiceEntries = (
  invoice: any,
  mapping: AccountMapping,
  entryCounter: { value: number }
): JournalEntry[] => {
  const entries: JournalEntry[] = [];
  const date = formatDateFEC(invoice.issueDate || invoice.$createdAt);
  const pieceDate = formatDateFEC(invoice.issueDate || invoice.$createdAt);
  const clientAux = getClientAuxNumber(invoice.clientName);
  const isCredit = invoice.type === 'credit';
  const isAdvance = invoice.type === 'advance';

  const totalTTC = round2(invoice.total || 0);
  const totalHT = round2(invoice.subtotal || 0);
  const vatAmount = round2(Math.max(0, totalTTC - totalHT));

  const salesAccount = isAdvance ? mapping.advanceAccount : mapping.salesAccount;
  const salesLabel = isAdvance ? mapping.advanceAccountLabel : mapping.salesAccountLabel;

  if (isCredit) {
    // ===== AVOIR CLIENT =====
    entries.push({
      id: `credit-ht-${invoice.$id}`,
      journalCode: 'VT',
      journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.salesAccount,
      accountLabel: mapping.salesAccountLabel,
      auxAccountNumber: '',
      auxAccountLabel: '',
      pieceRef: invoice.invoiceNumber,
      pieceDate,
      entryLabel: `Avoir sur facture ${invoice.originalInvoiceNumber || ''} - ${invoice.clientName}`,
      debit: totalHT,
      credit: 0,
      currency: 'EUR',
    });

    if (vatAmount > 0) {
      entries.push({
        id: `credit-tva-${invoice.$id}`,
        journalCode: 'VT',
        journalLib: 'Journal des ventes',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.vatCollectedAccount,
        accountLabel: mapping.vatCollectedLabel,
        auxAccountNumber: '',
        auxAccountLabel: '',
        pieceRef: invoice.invoiceNumber,
        pieceDate,
        entryLabel: `TVA sur avoir ${invoice.invoiceNumber}`,
        debit: vatAmount,
        credit: 0,
        currency: 'EUR',
      });
    }

    entries.push({
      id: `credit-client-${invoice.$id}`,
      journalCode: 'VT',
      journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.clientAccount + clientAux,
      accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
      auxAccountNumber: clientAux,
      auxAccountLabel: invoice.clientName,
      pieceRef: invoice.invoiceNumber,
      pieceDate,
      entryLabel: `Avoir client ${invoice.clientName}`,
      debit: 0,
      credit: totalTTC,
      currency: 'EUR',
    });
  } else {
    // ===== FACTURE STANDARD / ACOMPTE / SOLDE =====
    entries.push({
      id: `invoice-client-${invoice.$id}`,
      journalCode: 'VT',
      journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.clientAccount + clientAux,
      accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
      auxAccountNumber: clientAux,
      auxAccountLabel: invoice.clientName,
      pieceRef: invoice.invoiceNumber,
      pieceDate,
      entryLabel: `Facture ${invoice.invoiceNumber} - ${invoice.clientName}`,
      debit: totalTTC,
      credit: 0,
      currency: 'EUR',
    });

    entries.push({
      id: `invoice-ht-${invoice.$id}`,
      journalCode: 'VT',
      journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: salesAccount,
      accountLabel: salesLabel,
      auxAccountNumber: '',
      auxAccountLabel: '',
      pieceRef: invoice.invoiceNumber,
      pieceDate,
      entryLabel: `Vente ${invoice.invoiceNumber}`,
      debit: 0,
      credit: totalHT,
      currency: 'EUR',
    });

    if (vatAmount > 0) {
      entries.push({
        id: `invoice-tva-${invoice.$id}`,
        journalCode: 'VT',
        journalLib: 'Journal des ventes',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.vatCollectedAccount,
        accountLabel: mapping.vatCollectedLabel,
        auxAccountNumber: '',
        auxAccountLabel: '',
        pieceRef: invoice.invoiceNumber,
        pieceDate,
        entryLabel: `TVA collectée ${invoice.invoiceNumber}`,
        debit: 0,
        credit: vatAmount,
        currency: 'EUR',
      });
    }
  }

  return entries;
};

// ============================================================
// 💰 GÉNÉRATION ÉCRITURES DE PAIEMENT
// ============================================================

const generatePaymentEntries = (
  invoice: any,
  mapping: AccountMapping,
  entryCounter: { value: number }
): JournalEntry[] => {
  const entries: JournalEntry[] = [];
  const payments = parsePayments(invoice.payments);
  const clientAux = getClientAuxNumber(invoice.clientName);
  const isCredit = invoice.type === 'credit';

  payments.forEach((payment: any, idx: number) => {
    const amount = round2(payment.amount || 0);
    if (amount <= 0) return;

    const date = formatDateFEC(payment.date || invoice.paidAt);
    const method = (payment.method || 'virement').toLowerCase();

    let treasuryAccount = mapping.bankAccount;
    let treasuryLabel = mapping.bankAccountLabel;
    if (method.includes('espèce') || method.includes('cash')) {
      treasuryAccount = mapping.cashAccount;
      treasuryLabel = mapping.cashAccountLabel;
    }

    if (isCredit) {
      // Remboursement avoir
      entries.push({
        id: `refund-client-${invoice.$id}-${idx}`,
        journalCode: 'BQ',
        journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.clientAccount + clientAux,
        accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
        auxAccountNumber: clientAux,
        auxAccountLabel: invoice.clientName,
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`,
        pieceDate: date,
        entryLabel: `Remboursement avoir ${invoice.invoiceNumber}`,
        debit: amount,
        credit: 0,
        currency: 'EUR',
      });
      entries.push({
        id: `refund-bank-${invoice.$id}-${idx}`,
        journalCode: 'BQ',
        journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: treasuryAccount,
        accountLabel: treasuryLabel,
        auxAccountNumber: '',
        auxAccountLabel: '',
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`,
        pieceDate: date,
        entryLabel: `Sortie trésorerie - ${payment.method || 'virement'}`,
        debit: 0,
        credit: amount,
        currency: 'EUR',
      });
    } else {
      // Encaissement facture
      entries.push({
        id: `payment-bank-${invoice.$id}-${idx}`,
        journalCode: 'BQ',
        journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: treasuryAccount,
        accountLabel: treasuryLabel,
        auxAccountNumber: '',
        auxAccountLabel: '',
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`,
        pieceDate: date,
        entryLabel: `Encaissement facture ${invoice.invoiceNumber} - ${payment.method || 'virement'}`,
        debit: amount,
        credit: 0,
        currency: 'EUR',
      });
      entries.push({
        id: `payment-client-${invoice.$id}-${idx}`,
        journalCode: 'BQ',
        journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.clientAccount + clientAux,
        accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
        auxAccountNumber: clientAux,
        auxAccountLabel: invoice.clientName,
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`,
        pieceDate: date,
        entryLabel: `Règlement client ${invoice.clientName}`,
        debit: 0,
        credit: amount,
        currency: 'EUR',
      });
    }
  });

  return entries;
};

// ============================================================
// 🧾 GÉNÉRATION ÉCRITURES FACTURES FOURNISSEURS
// ============================================================

const generateSupplierInvoiceEntries = (
  invoice: any,
  mapping: AccountMapping,
  entryCounter: { value: number }
): JournalEntry[] => {
  const entries: JournalEntry[] = [];
  const date = formatDateFEC(invoice.issueDate || invoice.receivedAt || invoice.$createdAt);
  const pieceDate = formatDateFEC(invoice.issueDate || invoice.receivedAt || invoice.$createdAt);
  const supplierName = invoice.supplierName || invoice.clientName || 'Fournisseur';
  const supplierAux = getClientAuxNumber(supplierName);

  const totalTTC = round2(invoice.total || invoice.amount || 0);
  const totalHT = round2(invoice.subtotal || invoice.total || 0);
  const vatAmount = round2(Math.max(0, totalTTC - totalHT));

  // Détermination du compte d'achat selon la catégorie
  const category = (invoice.category || 'materials').toLowerCase();
  let purchaseAccount = mapping.purchasesMaterialsAccount;
  let purchaseLabel = mapping.purchasesMaterialsLabel;

  switch (category) {
    case 'materials':
    case 'matériaux':
      purchaseAccount = mapping.purchasesMaterialsAccount;
      purchaseLabel = mapping.purchasesMaterialsLabel;
      break;
    case 'consumables':
    case 'consommables':
    case 'outillage':
      purchaseAccount = mapping.purchasesConsumablesAccount;
      purchaseLabel = mapping.purchasesConsumablesLabel;
      break;
    case 'merchandise':
    case 'marchandises':
      purchaseAccount = mapping.purchasesMerchandiseAccount;
      purchaseLabel = mapping.purchasesMerchandiseLabel;
      break;
    case 'subcontracting':
    case 'sous-traitance':
      purchaseAccount = mapping.subcontractingAccount;
      purchaseLabel = mapping.subcontractingLabel;
      break;
    case 'rental':
    case 'location':
      purchaseAccount = mapping.rentalAccount;
      purchaseLabel = mapping.rentalLabel;
      break;
    case 'maintenance':
    case 'entretien':
    case 'réparation':
      purchaseAccount = mapping.maintenanceAccount;
      purchaseLabel = mapping.maintenanceLabel;
      break;
    case 'insurance':
    case 'assurance':
      purchaseAccount = mapping.insuranceAccount;
      purchaseLabel = mapping.insuranceLabel;
      break;
    case 'transport':
    case 'déplacement':
      purchaseAccount = mapping.transportAccount;
      purchaseLabel = mapping.transportLabel;
      break;
  }

  // Débit compte d'achat
  entries.push({
    id: `supplier-purchase-${invoice.$id}`,
    journalCode: 'AC',
    journalLib: 'Journal des achats',
    entryNumber: String(entryCounter.value++).padStart(6, '0'),
    entryDate: date,
    accountNumber: purchaseAccount,
    accountLabel: purchaseLabel,
    auxAccountNumber: '',
    auxAccountLabel: '',
    pieceRef: invoice.invoiceNumber,
    pieceDate,
    entryLabel: `Achat ${supplierName} - ${invoice.description || 'Fournitures'}`,
    debit: totalHT,
    credit: 0,
    currency: 'EUR',
  });

  // Débit TVA déductible
  if (vatAmount > 0) {
    entries.push({
      id: `supplier-tva-${invoice.$id}`,
      journalCode: 'AC',
      journalLib: 'Journal des achats',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.vatDeductibleAccount,
      accountLabel: mapping.vatDeductibleLabel,
      auxAccountNumber: '',
      auxAccountLabel: '',
      pieceRef: invoice.invoiceNumber,
      pieceDate,
      entryLabel: `TVA déductible ${invoice.invoiceNumber}`,
      debit: vatAmount,
      credit: 0,
      currency: 'EUR',
    });
  }

  // Crédit fournisseur
  entries.push({
    id: `supplier-creditor-${invoice.$id}`,
    journalCode: 'AC',
    journalLib: 'Journal des achats',
    entryNumber: String(entryCounter.value++).padStart(6, '0'),
    entryDate: date,
    accountNumber: mapping.supplierAccount + supplierAux,
    accountLabel: `${mapping.supplierAccountLabel} - ${supplierName}`,
    auxAccountNumber: supplierAux,
    auxAccountLabel: supplierName,
    pieceRef: invoice.invoiceNumber,
    pieceDate,
    entryLabel: `Facture fournisseur ${invoice.invoiceNumber}`,
    debit: 0,
    credit: totalTTC,
    currency: 'EUR',
  });

  return entries;
};

// ============================================================
// 📊 STATISTIQUES DE FILTRAGE (pour la prévisualisation)
// ============================================================

export interface ExportStats {
  clientInvoices: {
    total: number;
    exported: number;
    excluded: {
      draft: number;
      cancelled: number;
      rejected: number;
    };
  };
  supplierInvoices: {
    total: number;
    exported: number;
    excluded: {
      draft: number;
      pending: number;
      rejected: number;
      cancelled: number;
    };
  };
}

// ============================================================
// 🚀 GÉNÉRATION COMPLÈTE DES ÉCRITURES
// ============================================================

export const generateAccountingEntries = async (
  config: ExportConfig,
  mapping: AccountMapping = DEFAULT_ACCOUNT_MAPPING
): Promise<{ entries: JournalEntry[]; stats: ExportStats }> => {
  const { startDate, endDate, teamId } = config;

  validateTeamId(teamId);

  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
    throw new Error('Date de début invalide');
  }
  if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
    throw new Error('Date de fin invalide');
  }
  if (startDate > endDate) {
    throw new Error('La date de début doit être antérieure à la date de fin');
  }

  const allEntries: JournalEntry[] = [];
  const entryCounter = { value: 1 };
  const readPerms = getReadPerms(teamId);

  // Statistiques de filtrage
  const stats: ExportStats = {
    clientInvoices: {
      total: 0,
      exported: 0,
      excluded: { draft: 0, cancelled: 0, rejected: 0 },
    },
    supplierInvoices: {
      total: 0,
      exported: 0,
      excluded: { draft: 0, pending: 0, rejected: 0, cancelled: 0 },
    },
  };

  try {
    // ============================================================
    // 1. FACTURES CLIENTS
    // ============================================================
    const invoicesRes = await databases.listDocuments(
      DATABASE_ID,
      'invoices',
      [
        Query.equal('teamId', teamId),
        Query.orderDesc('$createdAt'),
        Query.limit(2500),
      ],
      readPerms
    );

    stats.clientInvoices.total = invoicesRes.documents.length;

    const filteredInvoices = (invoicesRes.documents as any[]).filter(inv => {
      // Sécurité multi-tenant
      if (inv.teamId !== teamId) {
        console.warn(`🛡️ [SECURITY] Tentative d'accès inter-équipe bloquée: facture ${inv.$id}`);
        return false;
      }

      // Filtrage par statut (logique comptable)
      if (inv.status === 'draft') {
        stats.clientInvoices.excluded.draft++;
        return false;
      }
      if (inv.status === 'cancelled') {
        stats.clientInvoices.excluded.cancelled++;
        return false;
      }
      if (inv.status === 'rejected') {
        stats.clientInvoices.excluded.rejected++;
        return false;
      }

      // Vérification finale avec la fonction helper
      if (!shouldExportClientInvoice(inv)) {
        return false;
      }

      // Filtrage par période
      const dateStr = inv.issueDate || inv.$createdAt;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return false;
      return date >= startDate && date <= endDate;
    });

    stats.clientInvoices.exported = filteredInvoices.length;

    filteredInvoices.forEach(invoice => {
      allEntries.push(...generateInvoiceEntries(invoice, mapping, entryCounter));
      if (invoice.payments) {
        allEntries.push(...generatePaymentEntries(invoice, mapping, entryCounter));
      }
    });

    // ============================================================
    // 2. FACTURES FOURNISSEURS (avec filtrage strict)
    // ============================================================
    try {
      const supplierInvoicesRes = await databases.listDocuments(
        DATABASE_ID,
        'received_invoices',
        [
          Query.equal('teamId', teamId),
          Query.orderDesc('$createdAt'),
          Query.limit(2500),
        ],
        readPerms
      );

      stats.supplierInvoices.total = supplierInvoicesRes.documents.length;

      const filteredSupplierInvoices = (supplierInvoicesRes.documents as any[]).filter(inv => {
        // Sécurité multi-tenant
        if (inv.teamId !== teamId) {
          console.warn(`🛡️ [SECURITY] Tentative d'accès inter-équipe bloquée: facture fournisseur ${inv.$id}`);
          return false;
        }

        // ❌ EXCLUSION : Brouillon
        if (inv.status === 'draft') {
          stats.supplierInvoices.excluded.draft++;
          return false;
        }

        // ❌ EXCLUSION CRITIQUE : En attente de validation (pending)
        if (inv.status === 'pending') {
          stats.supplierInvoices.excluded.pending++;
          console.log(`ℹ️ Facture fournisseur ${inv.invoiceNumber || inv.$id} exclue (en attente de validation)`);
          return false;
        }

        // ❌ EXCLUSION CRITIQUE : Rejetée
        if (inv.status === 'rejected') {
          stats.supplierInvoices.excluded.rejected++;
          console.log(`ℹ️ Facture fournisseur ${inv.invoiceNumber || inv.$id} exclue (rejetée)`);
          return false;
        }

        // ❌ EXCLUSION : Annulée
        if (inv.status === 'cancelled') {
          stats.supplierInvoices.excluded.cancelled++;
          return false;
        }

        // ✅ Vérification avec helper
        if (!shouldExportSupplierInvoice(inv)) {
          return false;
        }

        // Filtrage par période
        const dateStr = inv.issueDate || inv.receivedAt || inv.$createdAt;
        if (!dateStr) return false;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return false;
        return date >= startDate && date <= endDate;
      });

      stats.supplierInvoices.exported = filteredSupplierInvoices.length;

      filteredSupplierInvoices.forEach(invoice => {
        allEntries.push(...generateSupplierInvoiceEntries(invoice, mapping, entryCounter));
      });
    } catch (e) {
      console.warn('⚠️ Collection received_invoices non disponible');
    }

    // Tri chronologique (obligatoire pour FEC)
    allEntries.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    return { entries: allEntries, stats };
  } catch (error) {
    console.error('❌ Erreur génération écritures:', error);
    throw error;
  }
};

// ============================================================
// 📄 EXPORT FORMAT FEC
// ============================================================

export const generateFECFile = (entries: JournalEntry[], companyName: string): Blob => {
  const header = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'
  ];

  const lines = entries.map(e => [
    e.journalCode,
    e.journalLib,
    e.entryNumber,
    e.entryDate,
    e.accountNumber,
    e.accountLabel,
    e.auxAccountNumber,
    e.auxAccountLabel,
    e.pieceRef,
    e.pieceDate,
    e.entryLabel,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
    '',
    '',
    e.entryDate,
    (e.debit - e.credit).toFixed(2),
    e.currency,
  ].join('\t'));

  const content = [header.join('\t'), ...lines].join('\r\n');
  return new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
};

// ============================================================
// 📄 EXPORT CSV GÉNÉRIQUE
// ============================================================

export const generateCSVFile = (entries: JournalEntry[]): Blob => {
  const headers = ['Date', 'Journal', 'N° Pièce', 'Compte', 'Libellé compte', 'Libellé écriture', 'Débit', 'Crédit'];
  const lines = entries.map(e => [
    e.entryDate.substring(0, 4) + '-' + e.entryDate.substring(4, 6) + '-' + e.entryDate.substring(6, 8),
    e.journalCode,
    e.pieceRef,
    e.accountNumber,
    e.accountLabel,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
  ].join(';'));

  const content = [headers.join(';'), ...lines].join('\r\n');
  return new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
};

// ============================================================
// 📄 EXPORTS LOGICIELS COMPTABLES
// ============================================================

export const generateSageFile = (entries: JournalEntry[]): Blob => {
  const lines = entries.map(e => [
    e.journalCode,
    e.accountNumber,
    e.entryDate,
    e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
  ].join(';'));
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
};

export const generateCegidFile = (entries: JournalEntry[]): Blob => {
  const lines = entries.map(e => [
    e.journalCode,
    e.accountNumber,
    e.entryDate,
    e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
  ].join('|'));
  return new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
};

export const generateEBPFile = (entries: JournalEntry[]): Blob => {
  const lines = entries.map(e => [
    e.journalCode,
    e.entryDate,
    e.accountNumber,
    e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
    e.currency,
  ].join('\t'));
  return new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
};

export const generateQuickBooksFile = (entries: JournalEntry[]): Blob => {
  const headers = ['Journal', 'Date', 'Compte', 'N° Pièce', 'Libellé', 'Débit', 'Crédit'];
  const lines = entries.map(e => [
    e.journalCode,
    `${e.entryDate.substring(0, 4)}-${e.entryDate.substring(4, 6)}-${e.entryDate.substring(6, 8)}`,
    e.accountNumber,
    e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
  ].join(','));
  return new Blob(['\uFEFF' + [headers.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
};

// ============================================================
// 🚀 FONCTION PRINCIPALE D'EXPORT
// ============================================================

export const exportAccountingFile = async (
  config: ExportConfig,
  mapping: AccountMapping,
  companyName: string
): Promise<{ blob: Blob; filename: string; entriesCount: number; stats: ExportStats }> => {
  validateTeamId(config.teamId);

  const { entries, stats } = await generateAccountingEntries(config, mapping);

  if (entries.length === 0) {
    throw new Error('Aucune écriture à exporter sur cette période');
  }

  let blob: Blob;
  let extension: string;

  switch (config.format) {
    case 'fec':
      blob = generateFECFile(entries, companyName);
      extension = 'txt';
      break;
    case 'csv':
      blob = generateCSVFile(entries);
      extension = 'csv';
      break;
    case 'sage':
      blob = generateSageFile(entries);
      extension = 'csv';
      break;
    case 'cegid':
      blob = generateCegidFile(entries);
      extension = 'txt';
      break;
    case 'ebp':
      blob = generateEBPFile(entries);
      extension = 'txt';
      break;
    case 'quickbooks':
      blob = generateQuickBooksFile(entries);
      extension = 'csv';
      break;
    default:
      blob = generateCSVFile(entries);
      extension = 'csv';
  }

  const periodStart = config.startDate.toISOString().split('T')[0];
  const periodEnd = config.endDate.toISOString().split('T')[0];
  const safeCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const filename = `${config.format.toUpperCase()}_${safeCompanyName}_${periodStart}_${periodEnd}.${extension}`;

  return { blob, filename, entriesCount: entries.length, stats };
};
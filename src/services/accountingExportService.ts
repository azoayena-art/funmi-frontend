// src/services/accountingExportService.ts
// ============================================================
// 📦 SERVICE D'EXPORT COMPTABLE
// Version complète : FEC + Balance + Grand Livre + Trésorerie
// ============================================================
import { logAuditAction } from './auditService';
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
  discountAccount: string;
  discountAccountLabel: string;
}

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
  treasuryOperations: {
    total: number;
    exported: number;
    inflows: number;
    outflows: number;
  };
}

// ============================================================
// 🎯 LOGIQUE COMPTABLE - STATUTS À EXPORTER
// ============================================================

const CLIENT_INVOICE_EXPORTABLE_STATUSES = [
  'sent', 'viewed', 'accepted', 'partial', 'paid', 'overdue', 'credit',
];

const SUPPLIER_INVOICE_EXPORTABLE_STATUSES = [
  'received', 'accepted', 'to_pay', 'partial', 'paid', 'overdue',
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
  discountAccount: '709000',
  discountAccountLabel: 'Remises, rabais et ristournes accordés',
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
// 🛠️ HELPERS FORMATAGE (EXPORTÉS pour réutilisation)
// ============================================================

/** Formate une date au format FEC (YYYYMMDD) */
export const formatDateFEC = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/** Arrondit un nombre à 2 décimales */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

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

const shouldExportClientInvoice = (invoice: any): boolean => {
  if (invoice.status === 'cancelled' || invoice.status === 'draft' || invoice.status === 'rejected') return false;
  if (invoice.type === 'credit') return true;
  return CLIENT_INVOICE_EXPORTABLE_STATUSES.includes(invoice.status);
};

const shouldExportSupplierInvoice = (invoice: any): boolean => {
  if (invoice.status === 'draft' || invoice.status === 'pending' || invoice.status === 'rejected' || invoice.status === 'cancelled') return false;
  if (invoice.type === 'credit') return true;
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

  const discountRate = invoice.discount || 0;
  const discountAmount = round2(totalHT * (discountRate / 100));
  const netHTAmount = round2(totalHT - discountAmount);
  const vatAmount = round2(Math.max(0, totalTTC - netHTAmount));

  const salesAccount = isAdvance ? mapping.advanceAccount : mapping.salesAccount;
  const salesLabel = isAdvance ? mapping.advanceAccountLabel : mapping.salesAccountLabel;

  if (isCredit) {
    entries.push({
      id: `credit-ht-${invoice.$id}`,
      journalCode: 'VT', journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.salesAccount, accountLabel: mapping.salesAccountLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: invoice.invoiceNumber, pieceDate,
      entryLabel: `Avoir sur facture ${invoice.originalInvoiceNumber || ''} - ${invoice.clientName}`,
      debit: netHTAmount, credit: 0, currency: 'EUR',
    });

    if (discountAmount > 0) {
      entries.push({
        id: `credit-discount-${invoice.$id}`,
        journalCode: 'VT', journalLib: 'Journal des ventes',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.discountAccount || '709000',
        accountLabel: mapping.discountAccountLabel || 'Remises, rabais et ristournes accordés',
        auxAccountNumber: '', auxAccountLabel: '',
        pieceRef: invoice.invoiceNumber, pieceDate,
        entryLabel: `Remise ${discountRate}% sur avoir ${invoice.invoiceNumber}`,
        debit: discountAmount, credit: 0, currency: 'EUR',
      });
    }

    if (vatAmount > 0) {
      entries.push({
        id: `credit-tva-${invoice.$id}`,
        journalCode: 'VT', journalLib: 'Journal des ventes',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.vatCollectedAccount, accountLabel: mapping.vatCollectedLabel,
        auxAccountNumber: '', auxAccountLabel: '',
        pieceRef: invoice.invoiceNumber, pieceDate,
        entryLabel: `TVA sur avoir ${invoice.invoiceNumber}`,
        debit: vatAmount, credit: 0, currency: 'EUR',
      });
    }

    entries.push({
      id: `credit-client-${invoice.$id}`,
      journalCode: 'VT', journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.clientAccount + clientAux,
      accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
      auxAccountNumber: clientAux, auxAccountLabel: invoice.clientName,
      pieceRef: invoice.invoiceNumber, pieceDate,
      entryLabel: `Avoir client ${invoice.clientName}`,
      debit: 0, credit: totalTTC, currency: 'EUR',
    });
  } else {
    entries.push({
      id: `invoice-client-${invoice.$id}`,
      journalCode: 'VT', journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.clientAccount + clientAux,
      accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
      auxAccountNumber: clientAux, auxAccountLabel: invoice.clientName,
      pieceRef: invoice.invoiceNumber, pieceDate,
      entryLabel: `Facture ${invoice.invoiceNumber} - ${invoice.clientName}`,
      debit: totalTTC, credit: 0, currency: 'EUR',
    });

    entries.push({
      id: `invoice-ht-${invoice.$id}`,
      journalCode: 'VT', journalLib: 'Journal des ventes',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: salesAccount, accountLabel: salesLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: invoice.invoiceNumber, pieceDate,
      entryLabel: `Vente ${invoice.invoiceNumber}`,
      debit: 0, credit: totalHT, currency: 'EUR',
    });

    if (discountAmount > 0) {
      entries.push({
        id: `invoice-discount-${invoice.$id}`,
        journalCode: 'VT', journalLib: 'Journal des ventes',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.discountAccount || '709000',
        accountLabel: mapping.discountAccountLabel || 'Remises, rabais et ristournes accordés',
        auxAccountNumber: '', auxAccountLabel: '',
        pieceRef: invoice.invoiceNumber, pieceDate,
        entryLabel: `Remise ${discountRate}% sur facture ${invoice.invoiceNumber}`,
        debit: discountAmount, credit: 0, currency: 'EUR',
      });
    }

    if (vatAmount > 0) {
      entries.push({
        id: `invoice-tva-${invoice.$id}`,
        journalCode: 'VT', journalLib: 'Journal des ventes',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.vatCollectedAccount, accountLabel: mapping.vatCollectedLabel,
        auxAccountNumber: '', auxAccountLabel: '',
        pieceRef: invoice.invoiceNumber, pieceDate,
        entryLabel: `TVA collectée ${invoice.invoiceNumber}`,
        debit: 0, credit: vatAmount, currency: 'EUR',
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
      entries.push({
        id: `refund-client-${invoice.$id}-${idx}`,
        journalCode: 'BQ', journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.clientAccount + clientAux,
        accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
        auxAccountNumber: clientAux, auxAccountLabel: invoice.clientName,
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`, pieceDate: date,
        entryLabel: `Remboursement avoir ${invoice.invoiceNumber}`,
        debit: amount, credit: 0, currency: 'EUR',
      });
      entries.push({
        id: `refund-bank-${invoice.$id}-${idx}`,
        journalCode: 'BQ', journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: treasuryAccount, accountLabel: treasuryLabel,
        auxAccountNumber: '', auxAccountLabel: '',
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`, pieceDate: date,
        entryLabel: `Sortie trésorerie - ${payment.method || 'virement'}`,
        debit: 0, credit: amount, currency: 'EUR',
      });
    } else {
      entries.push({
        id: `payment-bank-${invoice.$id}-${idx}`,
        journalCode: 'BQ', journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: treasuryAccount, accountLabel: treasuryLabel,
        auxAccountNumber: '', auxAccountLabel: '',
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`, pieceDate: date,
        entryLabel: `Encaissement facture ${invoice.invoiceNumber} - ${payment.method || 'virement'}`,
        debit: amount, credit: 0, currency: 'EUR',
      });
      entries.push({
        id: `payment-client-${invoice.$id}-${idx}`,
        journalCode: 'BQ', journalLib: 'Journal de banque',
        entryNumber: String(entryCounter.value++).padStart(6, '0'),
        entryDate: date,
        accountNumber: mapping.clientAccount + clientAux,
        accountLabel: `${mapping.clientAccountLabel} - ${invoice.clientName}`,
        auxAccountNumber: clientAux, auxAccountLabel: invoice.clientName,
        pieceRef: `PAY-${invoice.invoiceNumber}-${idx + 1}`, pieceDate: date,
        entryLabel: `Règlement client ${invoice.clientName}`,
        debit: 0, credit: amount, currency: 'EUR',
      });
    }
  });

  return entries;
};

// ============================================================
// 🏢 GÉNÉRATION ÉCRITURES FACTURES FOURNISSEURS
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

  entries.push({
    id: `supplier-purchase-${invoice.$id}`,
    journalCode: 'AC', journalLib: 'Journal des achats',
    entryNumber: String(entryCounter.value++).padStart(6, '0'),
    entryDate: date,
    accountNumber: purchaseAccount, accountLabel: purchaseLabel,
    auxAccountNumber: '', auxAccountLabel: '',
    pieceRef: invoice.invoiceNumber, pieceDate,
    entryLabel: `Achat ${supplierName} - ${invoice.description || 'Fournitures'}`,
    debit: totalHT, credit: 0, currency: 'EUR',
  });

  if (vatAmount > 0) {
    entries.push({
      id: `supplier-tva-${invoice.$id}`,
      journalCode: 'AC', journalLib: 'Journal des achats',
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: mapping.vatDeductibleAccount, accountLabel: mapping.vatDeductibleLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: invoice.invoiceNumber, pieceDate,
      entryLabel: `TVA déductible ${invoice.invoiceNumber}`,
      debit: vatAmount, credit: 0, currency: 'EUR',
    });
  }

  entries.push({
    id: `supplier-creditor-${invoice.$id}`,
    journalCode: 'AC', journalLib: 'Journal des achats',
    entryNumber: String(entryCounter.value++).padStart(6, '0'),
    entryDate: date,
    accountNumber: mapping.supplierAccount + supplierAux,
    accountLabel: `${mapping.supplierAccountLabel} - ${supplierName}`,
    auxAccountNumber: supplierAux, auxAccountLabel: supplierName,
    pieceRef: invoice.invoiceNumber, pieceDate,
    entryLabel: `Facture fournisseur ${invoice.invoiceNumber}`,
    debit: 0, credit: totalTTC, currency: 'EUR',
  });

  return entries;
};

// ============================================================
// 💰 GÉNÉRATION ÉCRITURES OPÉRATIONS DE TRÉSORERIE
// ============================================================

const generateTreasuryEntries = (
  operation: any,
  mapping: AccountMapping,
  entryCounter: { value: number }
): JournalEntry[] => {
  const entries: JournalEntry[] = [];

  const date = formatDateFEC(operation.date || operation.$createdAt);
  const pieceDate = date;
  const amount = round2(Math.abs(Number(operation.amount) || 0));
  const isInflow = operation.type === 'in' || operation.type === 'inflow' || Number(operation.amount) > 0;

  const isCash = (operation.method || '').toLowerCase().includes('espèce') || (operation.method || '').toLowerCase().includes('cash');
  const treasuryAccount = isCash ? mapping.cashAccount : mapping.bankAccount;
  const treasuryLabel = isCash ? mapping.cashAccountLabel : mapping.bankAccountLabel;
  const journalCode = isCash ? 'JC' : 'BQ';
  const journalLib = isCash ? 'Journal de Caisse' : 'Journal de Banque';

  const ref = operation.reference || operation.invoiceNumber || `OP-${operation.$id}`;
  const label = operation.description || operation.category || 'Opération de trésorerie';

  let counterpartAccount = isInflow ? '700000' : '600000';
  let counterpartLabel = isInflow ? 'Produits divers' : 'Charges diverses';

  if (operation.category && (mapping as any)[operation.category]) {
    counterpartAccount = (mapping as any)[operation.category].accountNumber || counterpartAccount;
    counterpartLabel = (mapping as any)[operation.category].accountLabel || counterpartLabel;
  }

  if (isInflow) {
    entries.push({
      id: `treasury-in-1-${operation.$id}`,
      journalCode, journalLib,
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: treasuryAccount, accountLabel: treasuryLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: ref, pieceDate,
      entryLabel: `Encaissement: ${label}`,
      debit: amount, credit: 0, currency: 'XOF',
    });
    entries.push({
      id: `treasury-in-2-${operation.$id}`,
      journalCode, journalLib,
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: counterpartAccount, accountLabel: counterpartLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: ref, pieceDate,
      entryLabel: `Contrepartie encaissement: ${label}`,
      debit: 0, credit: amount, currency: 'XOF',
    });
  } else {
    entries.push({
      id: `treasury-out-1-${operation.$id}`,
      journalCode, journalLib,
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: counterpartAccount, accountLabel: counterpartLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: ref, pieceDate,
      entryLabel: `Contrepartie décaissement: ${label}`,
      debit: amount, credit: 0, currency: 'XOF',
    });
    entries.push({
      id: `treasury-out-2-${operation.$id}`,
      journalCode, journalLib,
      entryNumber: String(entryCounter.value++).padStart(6, '0'),
      entryDate: date,
      accountNumber: treasuryAccount, accountLabel: treasuryLabel,
      auxAccountNumber: '', auxAccountLabel: '',
      pieceRef: ref, pieceDate,
      entryLabel: `Décaissement: ${label}`,
      debit: 0, credit: amount, currency: 'XOF',
    });
  }

  return entries;
};

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

  const stats: ExportStats = {
    clientInvoices: { total: 0, exported: 0, excluded: { draft: 0, cancelled: 0, rejected: 0 } },
    supplierInvoices: { total: 0, exported: 0, excluded: { draft: 0, pending: 0, rejected: 0, cancelled: 0 } },
    treasuryOperations: { total: 0, exported: 0, inflows: 0, outflows: 0 },
  };

  try {
    // ============================================================
    // 1. FACTURES CLIENTS
    // ============================================================
    const invoicesRes = await databases.listDocuments(
      DATABASE_ID, 'invoices',
      [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2500)],
      readPerms
    );

    stats.clientInvoices.total = invoicesRes.documents.length;

    const filteredInvoices = (invoicesRes.documents as any[]).filter(inv => {
      if (inv.teamId !== teamId) return false;
      if (inv.status === 'draft') { stats.clientInvoices.excluded.draft++; return false; }
      if (inv.status === 'cancelled') { stats.clientInvoices.excluded.cancelled++; return false; }
      if (inv.status === 'rejected') { stats.clientInvoices.excluded.rejected++; return false; }
      if (!shouldExportClientInvoice(inv)) return false;

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
    // 2. FACTURES FOURNISSEURS
    // ============================================================
    try {
      const supplierInvoicesRes = await databases.listDocuments(
        DATABASE_ID, 'received_invoices',
        [Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(2500)],
        readPerms
      );

      stats.supplierInvoices.total = supplierInvoicesRes.documents.length;

      const filteredSupplierInvoices = (supplierInvoicesRes.documents as any[]).filter(inv => {
        if (inv.teamId !== teamId) return false;
        if (inv.status === 'draft') { stats.supplierInvoices.excluded.draft++; return false; }
        if (inv.status === 'pending') { stats.supplierInvoices.excluded.pending++; return false; }
        if (inv.status === 'rejected') { stats.supplierInvoices.excluded.rejected++; return false; }
        if (inv.status === 'cancelled') { stats.supplierInvoices.excluded.cancelled++; return false; }
        if (!shouldExportSupplierInvoice(inv)) return false;

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

    // ============================================================
    // 3. OPÉRATIONS DE TRÉSORERIE (Entrées / Sorties)
    // ============================================================
    try {
      const treasuryOpsRes = await databases.listDocuments(
        DATABASE_ID, 'payments',
        [Query.equal('teamId', teamId), Query.limit(2500)],
        readPerms
      );

      let treasuryTotal = 0;
      let treasuryInflows = 0;
      let treasuryOutflows = 0;

      for (const op of treasuryOpsRes.documents as any[]) {
        const amount = Math.abs(Number(op.amount) || 0);
        if (amount <= 0) continue;

        const isInflow = op.type === 'inflow' || op.type === 'in' || amount > 0;

        treasuryTotal++;
        if (isInflow) {
          treasuryInflows += amount;
        } else {
          treasuryOutflows += amount;
        }

        const isCash = (op.method || '').toLowerCase().includes('cash') || (op.method || '').toLowerCase().includes('especes');
        const treasuryAccount = isCash ? mapping.cashAccount : mapping.bankAccount;
        const treasuryLabel = isCash ? mapping.cashAccountLabel : mapping.bankAccountLabel;
        const journalCode = isCash ? 'JC' : 'BQ';
        const journalLib = isCash ? 'Journal de Caisse' : 'Journal de Banque';

        const entryDateStr = formatDateFEC(op.$createdAt);
        const ref = op.reference || `PAY-${op.$id}`;
        const label = op.description || 'Opération de trésorerie';

        if (isInflow) {
          allEntries.push({
            id: `treasury-in-1-${op.$id}`, journalCode, journalLib,
            entryNumber: String(entryCounter.value++).padStart(6, '0'),
            entryDate: entryDateStr, accountNumber: treasuryAccount, accountLabel: treasuryLabel,
            auxAccountNumber: '', auxAccountLabel: '', pieceRef: ref, pieceDate: entryDateStr,
            entryLabel: `Encaissement: ${label}`, debit: amount, credit: 0, currency: op.currencyCode || 'EUR',
          });
          allEntries.push({
            id: `treasury-in-2-${op.$id}`, journalCode, journalLib,
            entryNumber: String(entryCounter.value++).padStart(6, '0'),
            entryDate: entryDateStr, accountNumber: '700000', accountLabel: 'Produits divers',
            auxAccountNumber: '', auxAccountLabel: '', pieceRef: ref, pieceDate: entryDateStr,
            entryLabel: `Contrepartie: ${label}`, debit: 0, credit: amount, currency: op.currencyCode || 'EUR',
          });
        } else {
          allEntries.push({
            id: `treasury-out-1-${op.$id}`, journalCode, journalLib,
            entryNumber: String(entryCounter.value++).padStart(6, '0'),
            entryDate: entryDateStr, accountNumber: '600000', accountLabel: 'Charges diverses',
            auxAccountNumber: '', auxAccountLabel: '', pieceRef: ref, pieceDate: entryDateStr,
            entryLabel: `Contrepartie: ${label}`, debit: amount, credit: 0, currency: op.currencyCode || 'EUR',
          });
          allEntries.push({
            id: `treasury-out-2-${op.$id}`, journalCode, journalLib,
            entryNumber: String(entryCounter.value++).padStart(6, '0'),
            entryDate: entryDateStr, accountNumber: treasuryAccount, accountLabel: treasuryLabel,
            auxAccountNumber: '', auxAccountLabel: '', pieceRef: ref, pieceDate: entryDateStr,
            entryLabel: `Décaissement: ${label}`, debit: 0, credit: amount, currency: op.currencyCode || 'EUR',
          });
        }
      }

      stats.treasuryOperations = {
        total: treasuryTotal,
        exported: treasuryTotal,
        inflows: treasuryInflows,
        outflows: treasuryOutflows,
      };
    } catch (e) {
      console.warn('⚠️ Collection payments non disponible:', e);
      stats.treasuryOperations = { total: 0, exported: 0, inflows: 0, outflows: 0 };
    }

    // Tri chronologique (obligatoire pour FEC / SYSCOHADA)
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
    e.journalCode, e.journalLib, e.entryNumber, e.entryDate,
    e.accountNumber, e.accountLabel, e.auxAccountNumber, e.auxAccountLabel,
    e.pieceRef, e.pieceDate, e.entryLabel,
    e.debit.toFixed(2), e.credit.toFixed(2),
    '', '', e.entryDate, (e.debit - e.credit).toFixed(2), e.currency,
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
    e.journalCode, e.pieceRef, e.accountNumber, e.accountLabel,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2), e.credit.toFixed(2),
  ].join(';'));

  const content = [headers.join(';'), ...lines].join('\r\n');
  return new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
};

// ============================================================
// 📄 EXPORTS LOGICIELS COMPTABLES
// ============================================================

export const generateSageFile = (entries: JournalEntry[]): Blob => {
  const lines = entries.map(e => [
    e.journalCode, e.accountNumber, e.entryDate, e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`, e.debit.toFixed(2), e.credit.toFixed(2),
  ].join(';'));
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
};

export const generateCegidFile = (entries: JournalEntry[]): Blob => {
  const lines = entries.map(e => [
    e.journalCode, e.accountNumber, e.entryDate, e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`, e.debit.toFixed(2), e.credit.toFixed(2),
  ].join('|'));
  return new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
};

export const generateEBPFile = (entries: JournalEntry[]): Blob => {
  const lines = entries.map(e => [
    e.journalCode, e.entryDate, e.accountNumber, e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`, e.debit.toFixed(2), e.credit.toFixed(2), e.currency,
  ].join('\t'));
  return new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
};

export const generateQuickBooksFile = (entries: JournalEntry[]): Blob => {
  const headers = ['Journal', 'Date', 'Compte', 'N° Pièce', 'Libellé', 'Débit', 'Crédit'];
  const lines = entries.map(e => [
    e.journalCode,
    `${e.entryDate.substring(0, 4)}-${e.entryDate.substring(4, 6)}-${e.entryDate.substring(6, 8)}`,
    e.accountNumber, e.pieceRef,
    `"${e.entryLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2), e.credit.toFixed(2),
  ].join(','));
  return new Blob(['\uFEFF' + [headers.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
};

// ============================================================
// 📘 BALANCE COMPTABLE (Trial Balance)
// ============================================================

export interface TrialBalanceAccount {
  accountNumber: string;
  accountLabel: string;
  debit: number;
  credit: number;
  balance: number; // Positif = Solde Débiteur, Négatif = Solde Créditeur
  accountClass: string; // Classe 1 à 7
}

export const generateTrialBalance = (entries: JournalEntry[]): TrialBalanceAccount[] => {
  const map = new Map<string, TrialBalanceAccount>();

  entries.forEach(entry => {
    const num = entry.accountNumber;
    if (!num) return;

    const cls = num.substring(0, 1);

    if (!map.has(num)) {
      map.set(num, {
        accountNumber: num,
        accountLabel: entry.accountLabel || `Compte ${num}`,
        debit: 0,
        credit: 0,
        balance: 0,
        accountClass: cls,
      });
    }

    const acc = map.get(num)!;
    acc.debit = round2(acc.debit + entry.debit);
    acc.credit = round2(acc.credit + entry.credit);
    acc.balance = round2(acc.debit - acc.credit);
  });

  return Array.from(map.values()).sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
};

export const generateBalanceCSV = (balance: TrialBalanceAccount[]): Blob => {
  const headers = ['Numéro de compte', 'Intitulé', 'Débit', 'Crédit', 'Solde Débiteur', 'Solde Créditeur'];
  const lines = balance.map(e => [
    e.accountNumber,
    `"${e.accountLabel.replace(/"/g, '""')}"`,
    e.debit.toFixed(2),
    e.credit.toFixed(2),
    e.balance > 0 ? e.balance.toFixed(2) : '0.00',
    e.balance < 0 ? Math.abs(e.balance).toFixed(2) : '0.00',
  ].join(';'));

  const content = [headers.join(';'), ...lines].join('\r\n');
  return new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
};

// ============================================================
// 📘 GRAND LIVRE COMPTABLE (General Ledger)
// ============================================================

export interface GeneralLedgerLine {
  entryDate: string;        // YYYYMMDD
  journalCode: string;
  journalLib: string;
  entryNumber: string;
  pieceRef: string;
  pieceDate: string;
  entryLabel: string;
  auxAccountNumber: string;
  auxAccountLabel: string;
  debit: number;
  credit: number;
  cumulative: number;       // Solde progressif (débit positif)
}

export interface GeneralLedgerAccount {
  accountNumber: string;
  accountLabel: string;
  accountClass: string;
  openingBalance: number;   // Report à nouveau (mouvements AVANT la période)
  totalDebit: number;       // Mouvements de la période
  totalCredit: number;
  closingBalance: number;   // Report + mouvements
  lineCount: number;
  lines: GeneralLedgerLine[];
}

/**
 * Construit le Grand Livre à partir des écritures.
 * @param entries         Toutes les écritures depuis l'origine jusqu'à la fin de période
 * @param periodStartFEC  Date de début de période au format YYYYMMDD (avant = report à nouveau)
 */
export const generateGeneralLedger = (
  entries: JournalEntry[],
  periodStartFEC: string
): GeneralLedgerAccount[] => {
  type Internal = GeneralLedgerAccount & { _raw: JournalEntry[] };
  const map = new Map<string, Internal>();

  // Tri : par compte, puis chronologique, puis n° d'écriture
  const sorted = [...entries].sort((a, b) =>
    a.accountNumber.localeCompare(b.accountNumber) ||
    a.entryDate.localeCompare(b.entryDate) ||
    a.entryNumber.localeCompare(b.entryNumber)
  );

  sorted.forEach(e => {
    if (!e.accountNumber) return;
    let acc = map.get(e.accountNumber);
    if (!acc) {
      acc = {
        accountNumber: e.accountNumber,
        accountLabel: e.accountLabel || `Compte ${e.accountNumber}`,
        accountClass: e.accountNumber.charAt(0),
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
        lineCount: 0,
        lines: [],
        _raw: [],
      };
      map.set(e.accountNumber, acc);
    }

    if (e.entryDate < periodStartFEC) {
      // Mouvement ANTÉRIEUR à la période → report à nouveau
      acc.openingBalance = round2(acc.openingBalance + e.debit - e.credit);
    } else {
      acc.totalDebit = round2(acc.totalDebit + e.debit);
      acc.totalCredit = round2(acc.totalCredit + e.credit);
      acc.lineCount += 1;
      acc._raw.push(e);
    }
  });

  const result: GeneralLedgerAccount[] = [];
  map.forEach(acc => {
    let cumulative = acc.openingBalance;
    const lines: GeneralLedgerLine[] = acc._raw.map(e => {
      cumulative = round2(cumulative + e.debit - e.credit);
      return {
        entryDate: e.entryDate,
        journalCode: e.journalCode,
        journalLib: e.journalLib,
        entryNumber: e.entryNumber,
        pieceRef: e.pieceRef,
        pieceDate: e.pieceDate,
        entryLabel: e.entryLabel,
        auxAccountNumber: e.auxAccountNumber,
        auxAccountLabel: e.auxAccountLabel,
        debit: e.debit,
        credit: e.credit,
        cumulative,
      };
    });

    result.push({
      accountNumber: acc.accountNumber,
      accountLabel: acc.accountLabel,
      accountClass: acc.accountClass,
      openingBalance: acc.openingBalance,
      totalDebit: acc.totalDebit,
      totalCredit: acc.totalCredit,
      closingBalance: round2(acc.openingBalance + acc.totalDebit - acc.totalCredit),
      lineCount: acc.lineCount,
      lines,
    });
  });

  return result.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
};

/** Export CSV du Grand Livre complet (reports + mouvements + soldes) */
export const generateGeneralLedgerCSV = (ledger: GeneralLedgerAccount[]): Blob => {
  const fmt = (ymd: string) => (ymd?.length === 8 ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : ymd || '');
  const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;

  const headers = ['Compte', 'Intitulé du compte', 'Date', 'Journal', 'N° pièce', 'Libellé écriture', 'Compte auxiliaire', 'Débit', 'Crédit', 'Solde progressif'];
  const rows: string[] = [];

  ledger.forEach(acc => {
    if (acc.openingBalance !== 0) {
      rows.push([acc.accountNumber, esc(acc.accountLabel), '', '', '', 'REPORT À NOUVEAU', '', '', '', acc.openingBalance.toFixed(2)].join(';'));
    }
    acc.lines.forEach(l => {
      rows.push([
        acc.accountNumber, esc(acc.accountLabel), fmt(l.entryDate), l.journalCode, l.pieceRef,
        esc(l.entryLabel), l.auxAccountNumber || '', l.debit.toFixed(2), l.credit.toFixed(2), l.cumulative.toFixed(2),
      ].join(';'));
    });
    rows.push([acc.accountNumber, esc(acc.accountLabel), '', '', '', 'SOLDE FINAL', '', acc.totalDebit.toFixed(2), acc.totalCredit.toFixed(2), acc.closingBalance.toFixed(2)].join(';'));
    rows.push('');
  });

  const content = [headers.join(';'), ...rows].join('\r\n');
  return new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
};

// ============================================================
// 🚀 FONCTION PRINCIPALE D'EXPORT
// ============================================================

export const exportAccountingFile = async (
  config: ExportConfig,
  mapping: AccountMapping,
  companyName: string,
  userId?: string
): Promise<{ blob: Blob; filename: string; entriesCount: number; stats: ExportStats }> => {
  validateTeamId(config.teamId);

  const { entries, stats } = await generateAccountingEntries(config, mapping);

  if (entries.length === 0) {
    throw new Error('Aucune écriture à exporter sur cette période');
  }

  let blob: Blob;
  let extension: string;

  switch (config.format) {
    case 'fec': blob = generateFECFile(entries, companyName); extension = 'txt'; break;
    case 'csv': blob = generateCSVFile(entries); extension = 'csv'; break;
    case 'sage': blob = generateSageFile(entries); extension = 'csv'; break;
    case 'cegid': blob = generateCegidFile(entries); extension = 'txt'; break;
    case 'ebp': blob = generateEBPFile(entries); extension = 'txt'; break;
    case 'quickbooks': blob = generateQuickBooksFile(entries); extension = 'csv'; break;
    default: blob = generateCSVFile(entries); extension = 'csv';
  }

  const periodStart = config.startDate.toISOString().split('T')[0];
  const periodEnd = config.endDate.toISOString().split('T')[0];
  const safeCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const filename = `${config.format.toUpperCase()}_${safeCompanyName}_${periodStart}_${periodEnd}.${extension}`;

  await logAuditAction(
    config.teamId,
    userId || '',
    `export_${config.format}`,
    'journal_entries',
    undefined,
    {
      entriesCount: entries.length,
      period: `${periodStart}-${periodEnd}`,
    }
  );

  return { blob, filename, entriesCount: entries.length, stats };
};
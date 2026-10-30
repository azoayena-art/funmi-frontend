// src/pages/Invoices.tsx
import { createTreasuryMovement } from '../utils/treasuryGuard';
import {
  Search, Download, CheckCircle2, Receipt, DollarSign,
  Archive, RotateCcw, Eye, X, FileText, FileMinus, AlertTriangle, RefreshCw,
  Banknote, FileCheck2, Link2,
  Zap, FileCode, Send, Clock, History, Upload, Info,
} from 'lucide-react';
import { useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, storage, DATABASE_ID, BUCKET_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { getFilePreviewUrl } from '../utils/storage';
import { verifyDocumentAccess, logAuditAction } from '../utils/security';
import Sidebar from '../components/Sidebar';
import { toast } from 'sonner';
import {
  PageHeader, Modal, ActionMenu, ActionMenuItem, StatCell, StatusIndicator,
  DotLabel, Avatar, SkeletonRow, SkeletonCard, TypeTabs, KPIGrid, Pagination,
  mapInvoiceStatusToShared, formatDate,
  type Entity, type DotTone,
} from '../components/ui/SharedUI';
import { Query, ID } from 'appwrite';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  transmitToPPF,
  simulateRecipientResponse,
} from '../services/eInvoiceTransmissionService';
import TransmissionHistoryModal from '../components/TransmissionHistoryModal';
import PaymentModal from '../components/PaymentModal';

// 🔐 PERMISSIONS RLS CENTRALISÉES
import { getTeamPermissions, verifyTeamAccessStrict } from '../utils/rowLevelPermissions';

// 🌍 REGISTRE INTERNATIONAL DES PAYS
import {
  getCountryConfig, getPrimaryIdentifier, FALLBACK_COUNTRY,
  type CountryConfig, type IdentifierConfig,
} from '../config/countries';

// ============================================================
// 📐 INTERFACES
// ============================================================
interface InvoiceItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface Payment {
  id: string; amount: number; date: string; method: string; reference?: string; notes?: string;
}

interface Invoice {
  $id: string; invoiceNumber: string; quoteId?: string; userId: string; teamId?: string;
  clientToken?: string; status: string; issueDate: string; dueDate?: string; paidAt?: string; receivedAt?: string;
  subtotal: number; vatRate: number; vatAmount: number; total: number; discount: number;
  tax: number; deposit: number; balance: number;
  companyName?: string; companyLegalForm?: string; companyAddress?: string; companySiret?: string;
  companyRcs?: string; companyTva?: string; companyPhone?: string; companyEmail?: string; logoFileId?: string;
  companyPostalCode?: string; companyCity?: string; companyCountry?: string;
  clientName?: string; clientAddress?: string; clientBillingAddress?: string; clientEmail?: string; clientPhone?: string;
  clientPostalCode?: string; clientCity?: string; clientCountry?: string;
  items?: string; paymentMethods?: string; paymentConditions?: string; executionDelay?: string;
  specialConditions?: string; notes?: string; payments?: string | Payment[]; createdAt?: string; type?: string;
  originalQuoteId?: string; originalInvoiceId?: string; advancePercent?: string; currencyCode?: string;
  isElectronic?: boolean;
  transmissionStatus?: 'draft' | 'ready' | 'transmitted' | 'accepted' | 'rejected' | 'disputed' | 'cancelled';
  xmlContent?: string; pdfHash?: string;
  einvoicePlatform?: 'ppf' | 'pdp' | 'od' | 'simulation';
  einvoiceFormat?: 'factur-x' | 'ubl' | 'cii';
  transmissionReference?: string;
}

interface QuoteDetail {
  $id: string; quoteNumber: string; clientName: string; subject?: string; status: string;
  total: number; issueDate?: string; validityDate?: string; items?: string; subtotal?: number;
  discount?: number; tax?: number; deposit?: number; balance?: number;
}

// ============================================================
// 🏷️ LIBELLÉS
// ============================================================
const statusLabels: Record<string, string> = {
  draft: 'Brouillon', invoiced: 'Facturé', sent: 'Envoyée', near_due: 'Bientôt échue',
  overdue: 'En retard', paid: 'Payée', partial: 'Partielle', cancelled: 'Archivée / Annulée',
};

const typeLabels: Record<string, string> = {
  standard: 'Facture', advance: "Facture d'acompte", balance: 'Facture de solde', credit: "Facture d'avoir",
};

const typeToneMap: Record<string, DotTone> = {
  standard: 'violet', advance: 'sky', balance: 'teal', credit: 'rose',
};

const paymentMethodsList = ['Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement SEPA', 'Autre'];

const transmissionStatusLabels: Record<string, string> = {
  draft: 'Brouillon', ready: 'Prête à transmettre', transmitted: 'Transmise',
  accepted: 'Acceptée', rejected: 'Rejetée', disputed: 'Contestée', cancelled: 'Annulée',
};

const transmissionStatusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  ready: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  transmitted: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  disputed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const toInt = (value: any, fallback: number = 0): number => {
  const n = Number(value);
  return isNaN(n) ? fallback : Math.round(n);
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ✅ GÉNÉRATEUR DE TOKEN SÉCURISÉ
const generateSecureToken = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

// ============================================================
// 🏠 PARSER D'ADRESSE
// ============================================================
const parseAddressRetroactive = (
  address: string | undefined,
  existingPostalCode?: string,
  existingCity?: string,
  existingCountry?: string
) => {
  if (existingPostalCode || existingCity) {
    return {
      address: address || '',
      postalCode: existingPostalCode || '',
      city: existingCity || '',
      country: existingCountry || 'FR'
    };
  }
  
  if (!address || !address.trim()) {
    return { address: '', postalCode: '', city: '', country: existingCountry || 'FR' };
  }
  
  const postalRegex = /\b(\d{5})\b/;
  const match = address.match(postalRegex);
  
  if (!match) {
    return { address, postalCode: '', city: '', country: existingCountry || 'FR' };
  }
  
  const postalCode = match[1];
  const postalIndex = match.index!;
  const line1 = address.substring(0, postalIndex).replace(/,\s*$/, '').trim();
  const afterPostal = address.substring(postalIndex + 5).trim();
  const city = afterPostal.replace(/^[,\s-]+/, '').replace(/[,\s-]+$/, '').trim();
  
  return { address: line1 || address, postalCode, city: city || '', country: existingCountry || 'FR' };
};

// ============================================================
// 🧾 XML FACTUR-X
// ============================================================
const escapeXml = (str: string | undefined | null): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};

const getFacturXSchemeId = (countryCode: string): string => {
  const schemeMap: Record<string, string> = {
    FR: '0002', DE: '0002', IT: '0211', ES: '0202', BE: '0208',
    NL: '0106', AT: '0202', PT: '0202', LU: '0202', GB: '0191',
    CH: '0208', US: '9902', CA: '9902', SN: '0202', CI: '0202',
    MA: '0202', TN: '0202', DZ: '0202', CM: '0202', GA: '0202',
  };
  return schemeMap[countryCode?.toUpperCase()] || '9957';
};

const generateFacturXXml = (inv: Invoice, originalRef?: { number: string; date?: string }): string => {
  let items: InvoiceItem[] = [];
  try { items = JSON.parse(inv.items || '[]'); } catch { items = []; }
  
  const isCredit = inv.type === 'credit';
  const typeCode = isCredit ? '381' : '380';
  
  const sellerAddr = parseAddressRetroactive(inv.companyAddress, inv.companyPostalCode, inv.companyCity, inv.companyCountry);
  const buyerAddr = parseAddressRetroactive(inv.clientAddress, inv.clientPostalCode, inv.clientCity, inv.clientCountry);
  const sellerSchemeId = getFacturXSchemeId(sellerAddr.country);

  const linesXml = items.map(item => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;
    const tvaRate = Number(item.tvaRate) || 0;
    const lineTotal = round2(quantity * unitPrice * (1 - discount / 100));
    
    return `
<ram:IncludedSupplyTradeLineItem>
  <ram:AssociatedDocumentLineDocument>
    <ram:LineID>${escapeXml(item.reference || item.id)}</ram:LineID>
  </ram:AssociatedDocumentLineDocument>
  <ram:SpecifiedTradeProduct>
    <ram:Name>${escapeXml(item.description)}</ram:Name>
  </ram:SpecifiedTradeProduct>
  <ram:SpecifiedLineTradeAgreement>
    <ram:NetPriceProductTradePrice>
      <ram:ChargeAmount>${unitPrice.toFixed(2)}</ram:ChargeAmount>
      <ram:BasisQuantity unitCode="${escapeXml(item.unit || 'C62')}">${quantity.toFixed(2)}</ram:BasisQuantity>
    </ram:NetPriceProductTradePrice>
  </ram:SpecifiedLineTradeAgreement>
  <ram:SpecifiedLineTradeDelivery>
    <ram:BilledQuantity unitCode="${escapeXml(item.unit || 'C62')}">${quantity.toFixed(2)}</ram:BilledQuantity>
  </ram:SpecifiedLineTradeDelivery>
  <ram:SpecifiedLineTradeSettlement>
    <ram:ApplicableTradeTax>
      <ram:TypeCode>VAT</ram:TypeCode>
      <ram:CategoryCode>S</ram:CategoryCode>
      <ram:RateApplicablePercent>${tvaRate}</ram:RateApplicablePercent>
    </ram:ApplicableTradeTax>
    <ram:SpecifiedTradeSettlementLineMonetarySummation>
      <ram:LineTotalAmount>${lineTotal.toFixed(2)}</ram:LineTotalAmount>
    </ram:SpecifiedTradeSettlementLineMonetarySummation>
  </ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyTradeLineItem>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(inv.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${(inv.issueDate || '').replace(/-/g, '')}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(inv.companyName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(sellerAddr.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(sellerAddr.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(sellerAddr.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(sellerAddr.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${inv.companySiret ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="${sellerSchemeId}">${escapeXml(inv.companySiret)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(inv.clientName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(buyerAddr.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(buyerAddr.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(buyerAddr.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(buyerAddr.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(inv.currencyCode || 'EUR')}</ram:InvoiceCurrencyCode>
      ${isCredit && originalRef ? `
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${escapeXml(originalRef.number)}</ram:IssuerAssignedID>
        ${originalRef.date ? `<ram:FormattedIssueDate format="102">${originalRef.date.replace(/-/g, '')}</ram:FormattedIssueDate>` : ''}
      </ram:InvoiceReferencedDocument>` : ''}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${(inv.subtotal || 0).toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${(inv.subtotal || 0).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(inv.currencyCode || 'EUR')}">${(inv.tax || 0).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${(inv.total || 0).toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${(inv.balance || inv.total || 0).toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
    ${linesXml}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
};

const validateFacturXXml = (xml: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!xml || typeof xml !== 'string') { errors.push('XML vide ou invalide'); return { valid: false, errors }; }
  if (!xml.includes('<rsm:CrossIndustryInvoice')) errors.push('Balise racine manquante');
  if (!xml.includes('<ram:ID>')) errors.push('Numéro de facture manquant');
  if (!xml.includes('<ram:SellerTradeParty')) errors.push('Vendeur manquant');
  if (!xml.includes('<ram:BuyerTradeParty')) errors.push('Acheteur manquant');
  return { valid: errors.length === 0, errors };
};

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function Invoices() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, currency, currencyConfig, loading: settingsLoading } = useCompanySettings();
  const { customTeamId, appwriteTeamId } = useTeam();
  const SYM = currencyConfig?.symbol || '€';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [typeTab, setTypeTab] = useState<'all' | 'standard' | 'advance' | 'credit' | 'einvoice'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetail | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ percent: '30', invoiceId: '' });
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [generatingFinal, setGeneratingFinal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditInvoice, setCreditInvoice] = useState<Invoice | null>(null);
  const [creditForm, setCreditForm] = useState<{ type: string; amount: string; reason: string; refundChoice: 'allocate' | 'refund' }>({ type: 'total', amount: '', reason: '', refundChoice: 'allocate' });
  const [savingCredit, setSavingCredit] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundCredit, setRefundCredit] = useState<Invoice | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Virement bancaire', reference: '' });
  const [savingRefund, setSavingRefund] = useState(false);
  const [failedEvents, setFailedEvents] = useState<Array<{ type: string; invoiceId: string; data: any }>>([]);
  const [metadataCache, setMetadataCache] = useState<Map<string, any>>(new Map());
  const [transmitting, setTransmitting] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyInvoice, setHistoryInvoice] = useState<Invoice | null>(null);
  const [einvoicePlatform, setEinvoicePlatform] = useState<string>('simulation');
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [invoiceToCorrect, setInvoiceToCorrect] = useState<Invoice | null>(null);
  const [correctionForm, setCorrectionForm] = useState({
    clientName: '', clientAddress: '', clientEmail: '', clientSiret: '',
    invoiceNumber: '', issueDate: '', dueDate: '', paymentConditions: '',
    items: [] as InvoiceItem[], notes: '', correctionNotes: '',
  });
  const [correcting, setCorrecting] = useState(false);

  // 🌍 CONFIGURATION PAYS
  const [companySettings, setCompanySettings] = useState<any>(null);
  useEffect(() => {
    if (!customTeamId) return;
    (async () => {
      try {
        let res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', customTeamId), Query.limit(1),
        ]);
        if (res.documents.length === 0 && user?.$id) {
          res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
            Query.equal('userId', user.$id), Query.limit(1),
          ]);
        }
        if (res.documents.length > 0) setCompanySettings(res.documents[0]);
      } catch (e) {
        console.warn('⚠️ Impossible de charger les paramètres entreprise:', e);
      }
    })();
  }, [customTeamId, user]);

  const companyCountry = companySettings?.country || 'FR';
  const countryConfig: CountryConfig = useMemo(
    () => getCountryConfig(companyCountry) || FALLBACK_COUNTRY,
    [companyCountry]
  );
  const primaryIdentifier: IdentifierConfig = useMemo(
    () => getPrimaryIdentifier(countryConfig) || FALLBACK_COUNTRY.identifiers[0],
    [countryConfig]
  );
  const idLabel = primaryIdentifier?.shortLabel || 'ID';
  const vatLabel = countryConfig?.vat?.label || 'TVA';
  const vatEnabled = countryConfig?.vat?.enabled ?? true;
  const isFrenchEInvoiceRegime = companyCountry === 'FR';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, filterType, viewMode, typeTab]);

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw as string); } catch { return {}; }
  };
  
  const writeJson = (obj: any): string => JSON.stringify(obj || {});

  const loadMetadata = async (invoiceIds: string[], teamIdOverride?: string | null): Promise<Map<string, any>> => {
    const tid = teamIdOverride !== undefined ? teamIdOverride : currentTeamId;
    if (invoiceIds.length === 0 || !tid) return new Map();
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('teamId', tid),
        Query.equal('invoiceId', invoiceIds),
        Query.limit(200),
      ]);
      const best: Record<string, any> = {};
      res.documents.forEach((doc: any) => {
        const cur = best[doc.invoiceId];
        if (!cur || (doc.metadataVersion || 0) > (cur.metadataVersion || 0) || ((doc.metadataVersion || 0) === (cur.metadataVersion || 0) && (doc.$updatedAt || '') > (cur.$updatedAt || ''))) {
          best[doc.invoiceId] = doc;
        }
      });
      const map = new Map<string, any>();
      Object.values(best).forEach((doc: any) => {
        map.set(doc.invoiceId, {
          creditData: readJson(doc.creditData),
          archiveData: readJson(doc.archiveData),
          reconciliationData: readJson(doc.reconciliationData),
          metadataVersion: doc.metadataVersion || 0,
        });
      });
      return map;
    } catch (e) {
      console.warn('Erreur chargement metadata:', e);
      return new Map();
    }
  };

  const loadMetadataForInvoice = async (invoiceId: string): Promise<any> => {
    if (!currentTeamId) return { creditData: {}, archiveData: {}, reconciliationData: {}, metadataVersion: 0 };
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('teamId', currentTeamId),
        Query.equal('invoiceId', invoiceId),
        Query.limit(10),
      ]);
      if (res.documents.length === 0) return { creditData: {}, archiveData: {}, reconciliationData: {}, metadataVersion: 0 };
      
      const doc = res.documents.reduce((a: any, b: any) => 
        ((b.metadataVersion || 0) > (a.metadataVersion || 0) || ((b.metadataVersion || 0) === (a.metadataVersion || 0) && (b.$updatedAt || '') > (a.$updatedAt || ''))) ? b : a
      ) as any;
      
      return {
        creditData: readJson(doc.creditData),
        archiveData: readJson(doc.archiveData),
        reconciliationData: readJson(doc.reconciliationData),
        metadataVersion: doc.metadataVersion || 0,
      };
    } catch (e: any) {
      console.error('Erreur relecture metadata:', e);
      throw new Error(`Impossible de vérifier l'état actuel de l'avoir (${e?.message || 'erreur inconnue'})`);
    }
  };

  const saveMetadata = async (
    invoiceId: string,
    patch: { creditData?: any; archiveData?: any; reconciliationData?: any },
    expectedVersion?: number
  ): Promise<{ success: boolean; newVersion: number; conflict?: boolean }> => {
    if (!currentTeamId || !user) return { success: false, newVersion: 0 };
    const permissions = getTeamPermissions(appwriteTeamId);
    try {
      const existing = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('invoiceId', invoiceId), Query.limit(1),
      ]);
      
      if (existing.documents.length > 0) {
        const doc = existing.documents[0] as any;
        const currentVersion = doc.metadataVersion || 0;
        if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
          return { success: false, newVersion: currentVersion, conflict: true };
        }
        const newVersion = currentVersion + 1;
        const update: any = { metadataVersion: newVersion };
        if (patch.creditData !== undefined) update.creditData = writeJson(patch.creditData);
        if (patch.archiveData !== undefined) update.archiveData = writeJson(patch.archiveData);
        if (patch.reconciliationData !== undefined) update.reconciliationData = writeJson(patch.reconciliationData);
        
        await databases.updateDocument(DATABASE_ID, 'invoice_metadata', doc.$id, update, permissions);
        setMetadataCache(prev => {
          const newMap = new Map(prev);
          newMap.set(invoiceId, { ...newMap.get(invoiceId), ...patch, metadataVersion: newVersion });
          return newMap;
        });
        return { success: true, newVersion };
      } else {
        const newVersion = 1;
        await databases.createDocument(DATABASE_ID, 'invoice_metadata', ID.unique(), {
          teamId: currentTeamId, userId: user.$id, invoiceId,
          creditData: patch.creditData ? writeJson(patch.creditData) : '{}',
          archiveData: patch.archiveData ? writeJson(patch.archiveData) : '{}',
          reconciliationData: patch.reconciliationData ? writeJson(patch.reconciliationData) : '{}',
          metadataVersion: newVersion,
        }, permissions);
        setMetadataCache(prev => {
          const newMap = new Map(prev);
          newMap.set(invoiceId, {
            creditData: patch.creditData || {},
            archiveData: patch.archiveData || {},
            reconciliationData: patch.reconciliationData || {},
            metadataVersion: newVersion,
          });
          return newMap;
        });
        return { success: true, newVersion };
      }
    } catch (e) {
      console.error('Erreur sauvegarde metadata:', e);
      return { success: false, newVersion: 0 };
    }
  };

  const getMetadata = (inv: Invoice | null | undefined): any => (inv ? metadataCache.get(inv.$id) : null) || { creditData: {}, archiveData: {}, reconciliationData: {}, metadataVersion: 0 };
  const getCreditData = (inv: Invoice | null | undefined): any => getMetadata(inv).creditData;
  const getArchiveData = (inv: Invoice | null | undefined): any => getMetadata(inv).archiveData;

  const isDocArchived = (inv: Invoice | null | undefined): boolean => {
    if (!inv) return false;
    const archive = getArchiveData(inv);
    return inv.status === 'cancelled' || archive.archived === true;
  };

  const isLegacyCredit = (inv: Invoice | null | undefined): boolean => {
    if (!inv) return false;
    const credit = getCreditData(inv);
    return inv.type === 'credit' && credit.creditStatus === undefined;
  };

  const getCreditAllocatedAmount = (inv: Invoice | null | undefined): number => {
    if (!inv || inv.type !== 'credit') return 0;
    const credit = getCreditData(inv);
    if (isLegacyCredit(inv)) {
      const original = invoices.find(i => i && i.$id === inv.originalInvoiceId);
      const originalPaid = !!original && original.status === 'paid';
      if (inv.status === 'paid' || inv.paidAt || credit.creditStatus === 'refunded') return 0;
      return originalPaid ? 0 : (inv.total || 0);
    }
    return round2(credit.allocatedAmount || 0);
  };

  const getCreditRefundedAmount = (inv: Invoice | null | undefined): number => {
    if (!inv || inv.type !== 'credit') return 0;
    const credit = getCreditData(inv);
    if (isLegacyCredit(inv)) {
      if (inv.status === 'paid' || inv.paidAt) return inv.total || 0;
      return 0;
    }
    let refunds: { amount: number }[] = [];
    try { if (Array.isArray(credit.refundPayments)) refunds = credit.refundPayments; } catch { refunds = []; }
    const sum = refunds.reduce((s, p) => s + (p.amount || 0), 0);
    if (sum === 0 && (credit.refundedAmount || 0) === 0 && credit.creditStatus === 'refunded') return inv.total || 0;
    return round2(sum || credit.refundedAmount || 0);
  };

  const getCreditRefundableAmount = (inv: Invoice | null | undefined): number => {
    if (!inv || inv.type !== 'credit') return 0;
    const total = inv.total || 0;
    const allocated = getCreditAllocatedAmount(inv);
    const refunded = getCreditRefundedAmount(inv);
    return round2(Math.max(0, total - allocated - refunded));
  };

  const getAllocatedCreditsForInvoice = (invoiceId: string): number =>
    round2(invoices
      .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isDocArchived(inv))
      .reduce((sum, inv) => sum + getCreditAllocatedAmount(inv), 0));

  const getPaidAmount = (invoice: Invoice | null | undefined): number => {
    if (!invoice) return 0;
    let payments: Payment[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) payments = JSON.parse(invoice.payments);
      else if (Array.isArray(invoice.payments)) payments = invoice.payments;
    } catch (e) { payments = []; }
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const getEffectivePaidAmount = (invoice: Invoice | null | undefined): number => {
    if (!invoice) return 0;
    const directPayments = getPaidAmount(invoice);
    if ((invoice.type === 'standard' || invoice.type === 'balance') && invoice.originalInvoiceId) {
      const advanceInvoice = invoices.find(i => i && i.$id === invoice.originalInvoiceId && i.type === 'advance');
      if (advanceInvoice && advanceInvoice.status === 'paid') {
        return directPayments + (advanceInvoice.total || 0);
      }
    }
    return directPayments;
  };

  const getNetRemaining = (invoice: Invoice | null | undefined): number => {
    if (!invoice) return 0;
    if (invoice.type === 'credit') return 0;
    const paidAmount = getEffectivePaidAmount(invoice);
    const allocated = getAllocatedCreditsForInvoice(invoice.$id);
    return round2(Math.max(0, (invoice.total || 0) - paidAmount - allocated));
  };

  const getTotalCreditsForInvoice = useMemo(() => {
    return (invoiceId: string): number => {
      if (!invoiceId) return 0;
      return invoices
        .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isDocArchived(inv))
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
    };
  }, [invoices]);

  const getCreditsListForInvoice = useMemo(() => {
    return (invoiceId: string): Invoice[] => {
      if (!invoiceId) return [];
      return invoices
        .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isDocArchived(inv))
        .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
    };
  }, [invoices]);

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!customTeamId) return;
    loadInvoices();
  }, [user, viewMode, customTeamId]);

  const loadInvoicesRef = useRef<(isBackground?: boolean) => Promise<void>>(async () => { });
  useEffect(() => { loadInvoicesRef.current = loadInvoices; });

  useEffect(() => {
    if (!customTeamId) return;
    (async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'einvoice_settings', [
          Query.equal('teamId', customTeamId), Query.limit(1),
        ]);
        const doc = res.documents[0] as any;
        setEinvoicePlatform(doc?.platform || 'simulation');
      } catch { setEinvoicePlatform('simulation'); }
    })();
  }, [customTeamId]);

  const isSimulation = einvoicePlatform === 'simulation';

  const loadInvoices = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const teamId = customTeamId;
      if (!teamId) {
        console.warn('⚠️ Invoices: customTeamId non résolu, attente...');
        if (!isBackground) setLoading(false);
        return;
      }
      setCurrentTeamId(teamId);
      
      const res = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('teamId', teamId), Query.orderDesc('$createdAt'), Query.limit(200),
      ]);
      const docs = res.documents as unknown as Invoice[];
      
      const stuck = docs.filter(d => d && d.status !== 'paid' && d.status !== 'cancelled' && d.balance === 0 && (d.paidAt || d.receivedAt));
      let repaired = [...docs];
      for (const inv of stuck) {
        try {
          await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
            status: 'paid', balance: 0,
            paidAt: inv.paidAt || new Date().toISOString(),
            receivedAt: inv.receivedAt || new Date().toISOString(),
          });
          const idx = repaired.findIndex(r => r.$id === inv.$id);
          if (idx >= 0) repaired[idx] = { ...repaired[idx], status: 'paid', balance: 0 };
        } catch (e) { console.warn('Réparation ignorée:', e); }
      }
      
      setInvoices(repaired);
      const ids = repaired.map(d => d.$id);
      const meta = await loadMetadata(ids, teamId);
      setMetadataCache(meta);
    } catch (e) {
      console.error('💥 Erreur loadInvoices:', e);
      toast.error('Impossible de charger les factures');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const getDaysOverdue = (dueDate?: string, status?: string) => {
    if (!dueDate || status === 'paid' || status === 'cancelled') return 0;
    const diffDays = Math.ceil((new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const isRowAlert = (inv: Invoice | null | undefined): boolean => {
    if (!inv || isDocArchived(inv)) return false;
    const overdue = getDaysOverdue(inv.dueDate, inv.status) > 0 && getNetRemaining(inv) > 0;
    const einvoiceIssue = inv.isElectronic === true && (inv.transmissionStatus === 'rejected' || inv.transmissionStatus === 'disputed');
    return overdue || einvoiceIssue;
  };

  const handleCopyLink = async (invoice: Invoice) => {
    if (!invoice.clientToken) { toast.warning("Cette facture n'a pas de lien public."); return; }
    try {
      verifyTeamAccessStrict(invoice, currentTeamId, 'Invoices.handleCopyLink');
    } catch {
      toast.error('⚠️ Accès refusé');
      return;
    }
    const link = `${window.location.origin}/f/${invoice.clientToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(invoice.clientToken);
      toast.success('Lien copié dans le presse-papiers');
      setTimeout(() => setCopiedToken(null), 2000);
    } catch { toast.info(`Lien : ${link}`, { duration: 5000 }); }
  };

  const handleViewQuote = async (quoteId: string) => {
    setLoadingQuote(true);
    setShowQuoteModal(true);
    setQuoteDetails(null);
    try {
      const doc = await verifyDocumentAccess('quotes', quoteId, currentTeamId!);
      setQuoteDetails(doc as unknown as QuoteDetail);
      if (user) await logAuditAction(user.$id, currentTeamId!, 'read', 'quote', quoteId);
    } catch (e: any) {
      console.error('Erreur chargement devis:', e);
      toast.error(`Impossible de charger le devis : ${e.message}`);
      setShowQuoteModal(false);
    } finally { setLoadingQuote(false); }
  };

  const generateNextNumber = async (prefix: string, collection: string, field: string): Promise<string> => {
    const currentYear = new Date().getFullYear();
    const fullPrefix = `${prefix}-${currentYear}-`;
    const MAX_RETRIES = 5;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let maxNum = 0;
      try {
        const response = await databases.listDocuments(DATABASE_ID, collection, [
          Query.equal('teamId', currentTeamId!),
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ]);
        response.documents.forEach((doc: any) => {
          const numStr = doc[field];
          if (numStr && numStr.startsWith(fullPrefix)) {
            const num = parseInt(numStr.replace(fullPrefix, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        });
      } catch (e) { console.error('Erreur génération numéro:', e); }
      
      const nextNum = maxNum + 1;
      const nextNumber = `${fullPrefix}${String(nextNum).padStart(3, '0')}`;
      
      try {
        const check = await databases.listDocuments(DATABASE_ID, collection, [
          Query.equal('teamId', currentTeamId!), Query.equal(field, nextNumber), Query.limit(1),
        ]);
        if (check.documents.length === 0) return nextNumber;
      } catch (e) { console.warn('Vérification unicité échouée:', e); return nextNumber; }
      
      await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
    }
    return `${fullPrefix}${String(Date.now()).slice(-6)}`;
  };

  const generateAndStoreXml = async (inv: Invoice): Promise<void> => {
    if (!inv.isElectronic) return;
    try {
      let originalRef: { number: string; date?: string } | undefined;
      if (inv.type === 'credit') {
        const original = inv.originalInvoiceId
          ? invoices.find(i => i && i.$id === inv.originalInvoiceId)
          : undefined;
        if (original) {
          originalRef = { number: original.invoiceNumber, date: original.issueDate };
        }
      }
      
      const xmlContent = generateFacturXXml(inv, originalRef);
      const validation = validateFacturXXml(xmlContent);
      
      if (validation.valid) {
        await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
          xmlContent,
          transmissionStatus: 'ready',
        });
      } else {
        toast.error(`XML Factur-X invalide : ${validation.errors.join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Erreur génération XML pour ${inv.invoiceNumber}:`, error);
      toast.error(`Erreur génération XML : ${error instanceof Error ? error.message : 'Inconnue'}`);
    }
  };

  const createInvoiceWithRetry = async (payload: any, maxRetries = 3): Promise<any> => {
    const perms = getTeamPermissions(appwriteTeamId);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const doc = await databases.createDocument(DATABASE_ID, 'invoices', ID.unique(), payload, perms);
        if (payload.isElectronic) {
          await generateAndStoreXml(doc as unknown as Invoice);
        }
        return doc;
      } catch (e: any) {
        if (e?.code === 409 && attempt < maxRetries - 1) {
          const prefix = payload.invoiceNumber.split('-')[0];
          const newNumber = await generateNextNumber(prefix, 'invoices', 'invoiceNumber');
          payload = { ...payload, invoiceNumber: newNumber };
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }
        throw e;
      }
    }
    throw new Error('Impossible de créer la facture après plusieurs tentatives');
  };

  const generateReceiptPDF = async (inv: Invoice, payment?: Payment) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const paymentAmount = payment ? payment.amount : inv.total;
    const paymentDate = payment ? payment.date : new Date().toISOString().split('T')[0];
    const paymentMethod = payment ? payment.method : (inv.paymentMethods || 'Non spécifié');
    const paymentRef = payment?.reference || '';
    const receiptNumber = await generateNextNumber('REC', 'receipts', 'receiptNumber');
    const companyAddr = parseAddressRetroactive(inv.companyAddress, inv.companyPostalCode, inv.companyCity, inv.companyCountry);
    const receiptCountryConfig = getCountryConfig(inv.companyCountry || companyCountry) || FALLBACK_COUNTRY;
    const receiptIdLabel = getPrimaryIdentifier(receiptCountryConfig)?.shortLabel || 'ID';
    
    let logoB64: string | null = null;
    if (inv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', inv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); });
      } catch (e) { }
    }
    
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { } }
    doc.setFontSize(20); doc.setFont(undefined as any, 'bold'); doc.setTextColor(34, 197, 94);
    doc.text('REÇU DE PAIEMENT', W / 2, Y + 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`N° ${receiptNumber}`, W / 2, Y + 32, { align: 'center' });
    Y = Y + 50;
    
    doc.setDrawColor(34, 197, 94); doc.setLineWidth(1); doc.rect(M, Y, W - 2 * M, 15);
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(34, 197, 94);
    doc.text('ACQUITTÉ', W / 2, Y + 10, { align: 'center' });
    Y += 25;
    
    doc.setFontSize(11); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('Je soussigné(e), représentant de la société :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(inv.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (companyAddr.address) { doc.text(companyAddr.address, M, Y); Y += 4; }
    if (companyAddr.postalCode || companyAddr.city) { doc.text(`${companyAddr.postalCode} ${companyAddr.city}`.trim(), M, Y); Y += 4; }
    if (inv.companySiret) { doc.text(`${receiptIdLabel} : ${inv.companySiret}`, M, Y); Y += 4; }
    
    Y += 8; doc.setFontSize(11); doc.text('Reconnais avoir reçu de :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(inv.clientName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (inv.clientAddress) { doc.text(inv.clientAddress.substring(0, 80), M, Y); Y += 4; }
    
    Y += 8; doc.setFontSize(11); doc.text('La somme de :', M, Y); Y += 6;
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(37, 99, 235);
    doc.text(`${paymentAmount.toFixed(2)} ${SYM}`, M, Y);
    Y += 10; doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined as any, 'normal');
    doc.text('En règlement de la facture :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(`N° ${inv.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    doc.text(`D'un montant total de ${inv.total.toFixed(2)} ${SYM} TTC`, M, Y);
    
    Y += 10; doc.setFontSize(11); doc.text('Moyen de paiement :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(paymentMethod, M, Y);
    if (paymentRef) { Y += 6; doc.setFont(undefined as any, 'normal'); doc.setFontSize(10); doc.text(`Référence : ${paymentRef}`, M, Y); }
    
    Y += 15; doc.setFontSize(9); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${companyAddr.city || '...'}, le ${new Date(paymentDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10; doc.text('Signature et cachet :', M, Y); Y += 3;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(M, Y, 60, 20);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Ce reçu atteste du paiement effectif de la somme indiquée.', W / 2, 285, { align: 'center' });
    
    try {
      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], `receipts/${receiptNumber}.pdf`, { type: 'application/pdf' });
      const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
      const receiptData = {
        teamId: currentTeamId, userId: user.$id, receiptNumber, invoiceId: inv.$id,
        invoiceNumber: inv.invoiceNumber, clientName: inv.clientName || 'Client',
        amount: paymentAmount.toFixed(2), paymentDate, paymentMethod,
        paymentReference: paymentRef, fileId: uploadedFile.$id, status: 'active',
      };
      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), receiptData, getTeamPermissions(appwriteTeamId));
      toast.success(`Reçu ${receiptNumber} généré et stocké !`);
    } catch (e: any) { console.error('Erreur stockage reçu:', e); toast.error(`Erreur : ${e.message}`); }
  };

  const generateDebitReceiptPDF = async (creditInv: Invoice, payment?: Payment) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    const debitAmount = payment ? payment.amount : (creditInv.total || 0);
    const debitDate = payment ? payment.date : (creditInv.paidAt || creditInv.issueDate || new Date().toISOString().split('T')[0]);
    const debitMethod = payment ? payment.method : 'Avoir';
    const debitRef = payment?.reference || '';
    const originalInvoiceNumber = creditInv.notes?.split('\n').find(l => l.startsWith("Référence facture d'origine : "))?.replace("Référence facture d'origine : ", '') || 'N/A';
    const debitReason = creditInv.notes?.split('\n').find(l => l.startsWith('MOTIF AVOIR : '))?.replace('MOTIF AVOIR : ', '') || 'Non spécifié';
    const debitNumber = await generateNextNumber('DEC', 'receipts', 'receiptNumber');
    const companyAddr = parseAddressRetroactive(creditInv.companyAddress, creditInv.companyPostalCode, creditInv.companyCity, creditInv.companyCountry);
    const debitCountryConfig = getCountryConfig(creditInv.companyCountry || companyCountry) || FALLBACK_COUNTRY;
    const debitIdLabel = getPrimaryIdentifier(debitCountryConfig)?.shortLabel || 'ID';
    
    let logoB64: string | null = null;
    if (creditInv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', creditInv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); });
      } catch (e) { }
    }
    
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { } }
    doc.setFontSize(20); doc.setFont(undefined as any, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('REÇU DE DÉCAISSEMENT', W / 2, Y + 25, { align: 'center' });
    doc.setFontSize(10); doc.setFont(undefined as any, 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`N° ${debitNumber}`, W / 2, Y + 32, { align: 'center' });
    Y = Y + 50;
    
    doc.setDrawColor(220, 38, 38); doc.setLineWidth(1); doc.rect(M, Y, W - 2 * M, 15);
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text('REMBOURSEMENT', W / 2, Y + 10, { align: 'center' });
    Y += 25;
    
    doc.setFontSize(11); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('Je soussigné(e), représentant de la société :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(creditInv.companyName || '', M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    if (companyAddr.address) { doc.text(companyAddr.address, M, Y); Y += 4; }
    if (companyAddr.postalCode || companyAddr.city) { doc.text(`${companyAddr.postalCode} ${companyAddr.city}`.trim(), M, Y); Y += 4; }
    if (creditInv.companySiret) { doc.text(`${debitIdLabel} : ${creditInv.companySiret}`, M, Y); Y += 4; }
    
    Y += 8; doc.setFontSize(11); doc.text('Reconnais avoir remboursé à :', M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(creditInv.clientName || '', M, Y); Y += 5;
    
    Y += 8; doc.setFontSize(11); doc.text('La somme de :', M, Y); Y += 6;
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold'); doc.setTextColor(220, 38, 38);
    doc.text(`${debitAmount.toFixed(2)} ${SYM}`, M, Y);
    
    Y += 10; doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.setFont(undefined as any, 'normal');
    doc.text("Au titre de la facture d'avoir :", M, Y); Y += 6;
    doc.setFont(undefined as any, 'bold'); doc.text(`N° ${creditInv.invoiceNumber}`, M, Y); Y += 5;
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    doc.text(`Référence facture d'origine : ${originalInvoiceNumber}`, M, Y); Y += 6;
    doc.text(`Motif : ${debitReason}`, M, Y); Y += 6;
    doc.text(`Moyen : ${debitMethod}`, M, Y);
    if (debitRef) { Y += 6; doc.text(`Référence : ${debitRef}`, M, Y); }
    
    Y += 10; doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text(`Fait à ${companyAddr.city || '...'}, le ${new Date(debitDate).toLocaleDateString('fr-FR')}`, M, Y);
    Y += 10; doc.text('Signature et cachet :', M, Y); Y += 3;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(M, Y, 60, 20);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Ce reçu atteste du remboursement effectif de la somme indiquée.', W / 2, 285, { align: 'center' });
    
    let fileId = '';
    try {
      if (!BUCKET_ID) throw new Error('BUCKET_ID non défini');
      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], `receipts/DEC_${debitNumber}.pdf`, { type: 'application/pdf' });
      const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), file);
      fileId = uploadedFile.$id;
    } catch (e: any) { console.error('⚠️ Upload Storage du reçu DEC impossible :', e?.message || e); }
    
    const debitData: any = {
      teamId: currentTeamId, userId: user.$id, receiptNumber: debitNumber,
      invoiceId: creditInv.$id, invoiceNumber: creditInv.invoiceNumber,
      clientName: creditInv.clientName || 'Client',
      amount: debitAmount.toFixed(2), paymentDate: debitDate,
      paymentMethod: debitMethod, paymentReference: debitRef || originalInvoiceNumber,
      status: 'active',
    };
    if (fileId) debitData.fileId = fileId;
    
    try {
      await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), debitData, getTeamPermissions(appwriteTeamId));
    } catch (e: any) {
      if (fileId && /fileId/i.test(e?.message || '')) {
        try {
          const fallbackData = { ...debitData };
          delete fallbackData.fileId;
          await databases.createDocument(DATABASE_ID, 'receipts', ID.unique(), fallbackData, getTeamPermissions(appwriteTeamId));
          return;
        } catch (e2: any) { console.error('❌ Second échec:', e2); return; }
      }
      console.error('❌ Erreur enregistrement reçu décaissement:', e);
    }
  };

  const handleOpenPaymentModal = (invoice: Invoice) => {
    setInvoiceToPay(invoice);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async (invoice: Invoice, payment: Payment) => {
    await loadInvoices(true);
    try {
      await databases.createDocument(DATABASE_ID, 'invoice_payments', ID.unique(), {
        teamId: currentTeamId,
        data: writeJson({
          invoiceId: invoice.$id, invoiceNumber: invoice.invoiceNumber,
          amount: payment.amount, paymentDate: payment.date, method: payment.method,
          reference: payment.reference || '', status: 'confirmed',
          createdBy: user?.$id, createdAt: new Date().toISOString(), tvaExigibleAt: payment.date,
        }),
      }, getTeamPermissions(appwriteTeamId));
    } catch (eventError) {
      console.error('❌ Événement comptable non enregistré:', eventError);
      setFailedEvents(prev => [...prev, {
        type: 'payment', invoiceId: invoice.$id,
        data: { invoiceId: invoice.$id, invoiceNumber: invoice.invoiceNumber, amount: payment.amount, paymentDate: payment.date, method: payment.method, reference: payment.reference || '' },
      }]);
    }
    try {
      const freshInvoice = await databases.getDocument(DATABASE_ID, 'invoices', invoice.$id) as unknown as Invoice;
      await generateReceiptPDF(freshInvoice, payment);
    } catch (receiptError) {
      console.error('Erreur génération automatique du reçu:', receiptError);
      toast.error('Le paiement est enregistré mais le reçu n\'a pas pu être généré.');
    }
  };

  const handleRetryFailedEvents = async () => {
    if (failedEvents.length === 0) { toast.info('Aucun événement en attente.'); return; }
    let successCount = 0; let failCount = 0;
    const successIndexes = new Set<number>();
    
    for (let i = 0; i < failedEvents.length; i++) {
      const event = failedEvents[i];
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: currentTeamId,
          data: writeJson({ ...event.data, status: 'confirmed', createdBy: user?.$id, createdAt: new Date().toISOString(), retryAt: new Date().toISOString(), retryCount: (event.data?.retryCount || 0) + 1 }),
        }, getTeamPermissions(appwriteTeamId));
        successIndexes.add(i); successCount++;
      } catch (e) { console.error(`❌ Retry échoué pour index ${i}:`, e); failCount++; }
    }
    
    setFailedEvents(prev => prev.filter((_, idx) => !successIndexes.has(idx)));
    if (failCount === 0) toast.success(`${successCount} événement(s) régularisé(s)`);
    else toast.warning(`${successCount} régularisé(s), ${failCount} toujours en échec`);
  };

  const handleArchive = async (id: string, num: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id) as unknown as Invoice;
      try {
        verifyTeamAccessStrict(doc, currentTeamId, 'Invoices.handleArchive');
      } catch {
        toast.error('⚠️ Accès refusé');
        return;
      }
      
      if (doc.status === 'draft') {
        if (!confirm(`Annuler le brouillon ${num} ?`)) return;
        const reason = prompt("Motif de l'annulation (obligatoire) :");
        if (!reason || !reason.trim()) { toast.info('Annulation abandonnée : motif requis.'); return; }
        await databases.updateDocument(DATABASE_ID, 'invoices', id, { status: 'cancelled' });
        await saveMetadata(id, { archiveData: { cancelReason: reason.trim(), cancelledAt: new Date().toISOString(), cancelledBy: user.$id } });
      } else {
        const reason = prompt(`Archivage administratif de ${num} (motif obligatoire) :\n⚠️ Une facture émise ne peut pas être annulée : utilisez un avoir référencé.`);
        if (!reason || !reason.trim()) { toast.info('Archivage abandonné : motif requis.'); return; }
        try {
          await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
            teamId: currentTeamId,
            data: writeJson({ type: 'invoice_archived', documentType: 'invoice', documentId: id, documentNumber: num, eventDate: new Date().toISOString(), reason: reason.trim(), createdBy: user.$id }),
          }, getTeamPermissions(appwriteTeamId));
        } catch (e) { console.error('⚠️ Événement archivage non tracé:', e); }
        await saveMetadata(id, { archiveData: { archived: true, archivedAt: new Date().toISOString(), archivedBy: user.$id, archiveReason: reason.trim() } });
      }
      loadInvoices();
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); }
  };

  const handleUnarchive = async (id: string, num: string) => {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'invoices', id) as unknown as Invoice;
      try {
        verifyTeamAccessStrict(doc, currentTeamId, 'Invoices.handleUnarchive');
      } catch {
        toast.error('⚠️ Accès refusé');
        return;
      }
      
      const meta = getArchiveData(doc);
      if (meta.archived === true) {
        await saveMetadata(id, { archiveData: {} });
      } else if (doc.status === 'cancelled') {
        await databases.updateDocument(DATABASE_ID, 'invoices', id, { status: 'draft' });
        await saveMetadata(id, { archiveData: {} });
      }
      loadInvoices();
      setViewMode('active');
      toast.success(`Facture ${num} restaurée`);
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); }
  };

  const handleOpenAdvanceModal = (invoice: Invoice) => {
    if (invoice.deposit <= 0) { toast.warning("Cette facture n'a pas d'acompte défini."); return; }
    const percent = invoice.total > 0 ? ((invoice.deposit / invoice.total) * 100).toFixed(2) : '0.00';
    setAdvanceForm({ percent, invoiceId: invoice.$id });
    setShowAdvanceModal(true);
  };

  const handleGenerateAdvanceInvoice = async () => {
    const invoice = invoices.find(i => i && i.$id === advanceForm.invoiceId);
    if (!invoice || !currentTeamId) return;
    setSavingAdvance(true);
    try {
      const advanceAmount = invoice.deposit;
      const realPercent = invoice.total > 0 ? ((advanceAmount / invoice.total) * 100).toFixed(2) : '0.00';
      const advanceNumber = await generateNextNumber('ACO', 'invoices', 'invoiceNumber');
      const ratio = invoice.total > 0 ? (advanceAmount / invoice.total) : 0;
      
      let invoiceVatRate = toInt(invoice.vatRate, 20);
      if (invoiceVatRate === 20) {
        try {
          const items = JSON.parse(invoice.items || '[]');
          if (Array.isArray(items) && items.length > 0) {
            const rateCounts = new Map<number, number>();
            items.forEach((item: any) => {
              const rate = parseInt(String(item.tvaRate || 0), 10);
              if (!isNaN(rate) && rate >= 0 && rate <= 100) rateCounts.set(rate, (rateCounts.get(rate) || 0) + 1);
            });
            if (rateCounts.size > 0) {
              let maxCount = 0;
              rateCounts.forEach((count, rate) => { if (count > maxCount) { maxCount = count; invoiceVatRate = rate; } });
            }
          }
        } catch { }
      }
      
      let originalItems: InvoiceItem[] = [];
      try { originalItems = JSON.parse(invoice.items || '[]'); } catch { originalItems = []; }
      
      let advanceHT = 0; let advanceTVA = 0;
      const advanceItems: InvoiceItem[] = originalItems.map((item, idx) => {
        const itemVatRate = toInt(item.tvaRate, invoiceVatRate);
        const itemTotalTTC = round2(item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100) * (1 + itemVatRate / 100));
        const itemAdvanceTTC = round2(itemTotalTTC * ratio);
        const itemAdvanceHT = round2(itemTotalTTC / (1 + itemVatRate / 100));
        const itemAdvanceTVA = round2(itemTotalTTC - itemAdvanceHT);
        advanceHT += itemAdvanceHT; advanceTVA += itemAdvanceTVA;
        return {
          id: `advance-${Date.now()}-${idx}`, reference: item.reference || 'ACOMPTE',
          description: `Acompte ${realPercent}% - ${item.description}`, quantity: 1, unit: 'forfait',
          unitPrice: itemAdvanceHT, tvaRate: itemVatRate, total: itemAdvanceHT, discount: 0,
        };
      });
      
      if (advanceItems.length > 0) {
        const ecart = round2(advanceAmount - round2(advanceHT + advanceTVA));
        if (ecart !== 0) {
          const last = advanceItems[advanceItems.length - 1];
          last.unitPrice = round2(last.unitPrice + ecart);
          last.total = last.unitPrice;
          advanceHT += ecart;
        }
      }
      
      if (advanceItems.length === 0) {
        advanceHT = Math.round((invoice.subtotal || 0) * ratio * 100) / 100;
        advanceTVA = Math.round((invoice.tax || 0) * ratio * 100) / 100;
      }
      
      const advanceInvoice = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: advanceNumber, type: 'advance',
        originalQuoteId: invoice.originalQuoteId || invoice.quoteId || '',
        originalInvoiceId: invoice.$id, advancePercent: realPercent,
        currencyCode: currency,
        clientToken: generateSecureToken(), // ✅ Token sécurisé
        status: 'invoiced',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: advanceHT, vatRate: invoiceVatRate, vatAmount: advanceTVA, tax: advanceTVA,
        discount: 0, total: advanceAmount, deposit: 0, balance: advanceAmount,
        companyName: invoice.companyName, companyLegalForm: invoice.companyLegalForm,
        companyAddress: invoice.companyAddress, companySiret: invoice.companySiret,
        companyRcs: invoice.companyRcs, companyTva: invoice.companyTva,
        companyPhone: invoice.companyPhone, companyEmail: invoice.companyEmail,
        logoFileId: invoice.logoFileId, clientName: invoice.clientName,
        clientAddress: invoice.clientAddress, clientBillingAddress: invoice.clientBillingAddress,
        clientEmail: invoice.clientEmail, clientPhone: invoice.clientPhone,
        companyPostalCode: invoice.companyPostalCode || '', companyCity: invoice.companyCity || '', companyCountry: invoice.companyCountry || 'FR',
        clientPostalCode: invoice.clientPostalCode || '', clientCity: invoice.clientCity || '', clientCountry: invoice.clientCountry || 'FR',
        items: JSON.stringify(advanceItems.length > 0 ? advanceItems : [{
          id: `advance-${Date.now()}`, reference: 'ACOMPTE',
          description: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`, quantity: 1, unit: 'forfait',
          unitPrice: advanceHT, tvaRate: invoiceVatRate, total: advanceHT, discount: 0,
        }]),
        paymentMethods: invoice.paymentMethods, paymentConditions: invoice.paymentConditions,
        executionDelay: invoice.executionDelay,
        specialConditions: `Facture d'acompte - Référence facture d'origine : ${invoice.invoiceNumber}`,
        notes: `Acompte de ${realPercent}% sur la facture ${invoice.invoiceNumber}`,
      };
      
      await createInvoiceWithRetry(advanceInvoice);
      setShowAdvanceModal(false);
      await loadInvoices(true);
      toast.success(`Facture d'acompte ${advanceNumber} créée !`, { description: `Montant : ${fm(advanceAmount)}` });
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); } finally { setSavingAdvance(false); }
  };

  const handleGenerateFinalFromAdvance = async (advanceInvoice: Invoice) => {
    const quoteIdToFetch = advanceInvoice.originalQuoteId || advanceInvoice.quoteId;
    if (!currentTeamId || !quoteIdToFetch) {
      toast.error("Impossible de retrouver le devis d'origine. Vérifiez que le devis existe toujours.");
      return;
    }
    if (!confirm(`Générer la facture finale pour ${advanceInvoice.clientName} ?`)) return;
    setGeneratingFinal(true);
    try {
      const quoteDoc = await verifyDocumentAccess('quotes', quoteIdToFetch, currentTeamId!);
      const quote = quoteDoc as any;
      const finalNumber = await generateNextNumber('FAC', 'invoices', 'invoiceNumber');
      const advanceAmount = advanceInvoice.total || 0;
      const totalAmount = quote.total || 0;
      const remainingAmount = Math.max(0, totalAmount - advanceAmount);
      const quoteVatRate = toInt(quote.vatRate, 20);
      
      const finalInvoice = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: finalNumber, type: 'standard',
        originalQuoteId: quoteIdToFetch,
        originalInvoiceId: advanceInvoice.$id,
        quoteId: quoteIdToFetch,
        currencyCode: currency,
        clientToken: generateSecureToken(), // ✅ Token sécurisé
        status: 'invoiced',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: quote.subtotal || 0, vatRate: quoteVatRate, vatAmount: quote.tax || 0,
        tax: quote.tax || 0, discount: quote.discount || 0, total: totalAmount,
        deposit: advanceAmount, balance: remainingAmount,
        companyName: quote.companyName, companyLegalForm: quote.companyLegalForm,
        companyAddress: quote.companyAddress, companySiret: quote.companySiret,
        companyRcs: quote.companyRcs, companyTva: quote.companyTva,
        companyPhone: quote.companyPhone, companyEmail: quote.companyEmail,
        logoFileId: quote.logoFileId, clientName: quote.clientName,
        clientAddress: quote.clientAddress, clientBillingAddress: quote.clientBillingAddress,
        clientEmail: quote.clientEmail, clientPhone: quote.clientPhone,
        companyPostalCode: quote.companyPostalCode || '', companyCity: quote.companyCity || '', companyCountry: quote.companyCountry || 'FR',
        clientPostalCode: quote.clientPostalCode || '', clientCity: quote.clientCity || '', clientCountry: quote.clientCountry || 'FR',
        items: quote.items, paymentMethods: quote.paymentMethods,
        paymentConditions: quote.paymentConditions, executionDelay: quote.executionDelay,
        specialConditions: quote.specialConditions,
        notes: `Facture finale - Acompte de ${advanceAmount.toFixed(2)} ${SYM} déjà versé via ${advanceInvoice.invoiceNumber}`,
      };
      
      const createdDoc = await createInvoiceWithRetry(finalInvoice);
      await saveMetadata(createdDoc.$id, {
        reconciliationData: {
          advanceInvoiceId: advanceInvoice.$id, advanceNumber: advanceInvoice.invoiceNumber,
          advanceAmountTTC: advanceAmount, advanceAmountHT: advanceInvoice.subtotal || 0,
          advanceAmountTVA: advanceInvoice.tax || 0, jobTotalHT: quote.subtotal || 0,
          jobTotalTVA: quote.tax || 0, reconciliation: 'recap',
        },
      });
      
      await databases.updateDocument(DATABASE_ID, 'quotes', quoteIdToFetch, { status: 'Facturé' });
      
      await loadInvoices(true);
      toast.success(`Facture finale ${finalNumber} créée !`, { description: `Total : ${fm(totalAmount)} • Acompte : -${fm(advanceAmount)} • Net : ${fm(remainingAmount)}` });
    } catch (e: any) {
      console.error('Erreur génération facture finale:', e);
      toast.error(`Erreur : ${e.message}`);
    } finally { setGeneratingFinal(false); }
  };

  const openCreditModal = (inv: Invoice) => {
    const existingCredits = getTotalCreditsForInvoice(inv.$id);
    const maxCreditAllowed = Math.max(0, (inv.total || 0) - existingCredits);
    if (maxCreditAllowed <= 0) {
      toast.warning('Cette facture a déjà été entièrement couverte par des avoirs.');
      return;
    }
    setCreditInvoice(inv);
    setCreditForm(existingCredits > 0
      ? { type: 'partial', amount: maxCreditAllowed.toFixed(2), reason: '', refundChoice: 'allocate' }
      : { type: 'total', amount: inv.total.toFixed(2), reason: '', refundChoice: 'allocate' });
    setShowCreditModal(true);
  };

  const buildCreditLines = (original: Invoice, creditTTC: number) => {
    let items: InvoiceItem[] = [];
    try { items = JSON.parse(original.items || '[]'); } catch { items = []; }
    const invTTC = original.total || 0;
    const originalVatRate = toInt(original.vatRate, 20);
    
    const toBreakdown = (lines: { tvaRate: number; ht: number; tva: number }[]) => {
      const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
      lines.forEach(l => {
        const rate = toInt(l.tvaRate, 0);
        const cur = map.get(rate) || { rate, baseHT: 0, taxAmount: 0 };
        cur.baseHT = round2(cur.baseHT + l.ht);
        cur.taxAmount = round2(cur.taxAmount + l.tva);
        map.set(rate, cur);
      });
      return Array.from(map.values());
    };
    
    if (round2(creditTTC) === round2(invTTC)) {
      const lines = items.map(i => {
        const rate = toInt(i.tvaRate, 0);
        const ht = round2(i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100));
        return { tvaRate: rate, ht, tva: round2(ht * rate / 100) };
      });
      return { items, subtotal: original.subtotal || 0, tax: original.tax || 0, breakdown: toBreakdown(lines) };
    }
    
    if (items.length === 0 || invTTC <= 0) {
      const ratio = invTTC > 0 ? creditTTC / invTTC : 0;
      const subtotal = round2((original.subtotal || 0) * ratio);
      const tax = round2(creditTTC - subtotal);
      return { items: [], subtotal, tax, breakdown: toBreakdown([{ tvaRate: originalVatRate, ht: subtotal, tva: tax }]) };
    }
    
    const linesTTC = items.map(i => {
      const ht = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100);
      return ht * (1 + toInt(i.tvaRate, 0) / 100);
    });
    const sumTTC = linesTTC.reduce((a, b) => a + b, 0);
    let restant = round2(creditTTC);
    const creditLines: { tvaRate: number; ht: number; tva: number }[] = [];
    const creditItems: InvoiceItem[] = items.map((i, idx) => {
      const lineTTC = idx === items.length - 1 ? restant : round2(creditTTC * (linesTTC[idx] / sumTTC));
      restant = round2(restant - lineTTC);
      const rate = toInt(i.tvaRate, 0);
      const ht = round2(lineTTC / (1 + rate / 100));
      const tva = round2(lineTTC - ht);
      creditLines.push({ tvaRate: rate, ht, tva });
      return { ...i, discount: 0, quantity: 1, unitPrice: ht, total: ht, tvaRate: rate };
    });
    
    let subtotal = round2(creditLines.reduce((s, l) => s + l.ht, 0));
    let tax = round2(creditLines.reduce((s, l) => s + l.tva, 0));
    const ecart = round2(creditTTC - round2(subtotal + tax));
    if (ecart !== 0 && creditItems.length > 0) {
      const last = creditItems.length - 1;
      const lastTTC = round2(creditLines[last].ht + creditLines[last].tva);
      const newHt = round2(creditLines[last].ht + ecart);
      creditLines[last] = { ...creditLines[last], ht: newHt, tva: round2(lastTTC - newHt) };
      creditItems[last] = { ...creditItems[last], unitPrice: newHt, total: newHt };
      subtotal = round2(creditLines.reduce((s, l) => s + l.ht, 0));
      tax = round2(creditLines.reduce((s, l) => s + l.tva, 0));
    }
    return { items: creditItems, subtotal, tax, breakdown: toBreakdown(creditLines) };
  };

  const handleGenerateCreditNote = async () => {
    if (!creditInvoice || !currentTeamId) return;
    const creditAmount = parseFloat(creditForm.amount);
    const existingCreditsTotal = getTotalCreditsForInvoice(creditInvoice.$id);
    const maxCreditAllowed = Math.max(0, (creditInvoice.total || 0) - existingCreditsTotal);
    
    if (maxCreditAllowed <= 0) { toast.warning('Cette facture est déjà entièrement couverte par des avoirs.'); return; }
    if (creditForm.type === 'total' && existingCreditsTotal > 0) { toast.warning(`Cette facture a déjà ${fm(existingCreditsTotal)} d'avoirs. Utilisez "Avoir Partiel".`); return; }
    if (creditForm.type === 'partial' && (isNaN(creditAmount) || creditAmount <= 0 || creditAmount > maxCreditAllowed)) { toast.warning(`Montant invalide (max : ${fm(maxCreditAllowed)})`); return; }
    if (!creditForm.reason.trim()) { toast.error("Veuillez indiquer un motif pour l'avoir (obligatoire légalement)."); return; }
    
    setSavingCredit(true);
    try {
      const creditIdStr = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `cred-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const deterministicInvoiceId = ID.custom(creditIdStr);
      const invoiceIdStr = creditIdStr;
      const creditNumber = await generateNextNumber('AV', 'invoices', 'invoiceNumber');
      const creditTotal = creditForm.type === 'total' ? (creditInvoice.total || 0) : creditAmount;
      const { items: creditItems, subtotal: creditSubtotal, tax: creditTax, breakdown } = buildCreditLines(creditInvoice, creditTotal);
      
      let allocatedAmount: number; let toRefund: number; let initialCreditStatus: string;
      if (creditForm.refundChoice === 'refund') {
        allocatedAmount = 0; toRefund = creditTotal; initialCreditStatus = 'to_refund';
      } else {
        const remainingBefore = getNetRemaining(creditInvoice);
        allocatedAmount = round2(Math.min(creditTotal, remainingBefore));
        toRefund = round2(creditTotal - allocatedAmount);
        initialCreditStatus = allocatedAmount >= creditTotal - 0.001 ? 'allocated' : toRefund >= creditTotal - 0.001 ? 'to_refund' : 'partial_refund';
      }
      
      const creditVatRate = toInt(creditInvoice.vatRate, 20);
      const creditPayload: any = {
        teamId: currentTeamId, userId: user.$id, invoiceNumber: creditNumber, type: 'credit',
        originalInvoiceId: creditInvoice.$id, originalQuoteId: creditInvoice.originalQuoteId || creditInvoice.quoteId || '',
        currencyCode: currency,
        clientToken: generateSecureToken(), // ✅ Token sécurisé
        status: 'sent',
        issueDate: new Date().toISOString().split('T')[0], dueDate: new Date().toISOString().split('T')[0],
        subtotal: creditSubtotal, vatRate: creditVatRate, vatAmount: creditTax, tax: creditTax,
        discount: 0, total: creditTotal, deposit: 0, balance: 0,
        companyName: creditInvoice.companyName, companyLegalForm: creditInvoice.companyLegalForm,
        companyAddress: creditInvoice.companyAddress, companySiret: creditInvoice.companySiret,
        companyRcs: creditInvoice.companyRcs, companyTva: creditInvoice.companyTva,
        companyPhone: creditInvoice.companyPhone, companyEmail: creditInvoice.companyEmail,
        logoFileId: creditInvoice.logoFileId, clientName: creditInvoice.clientName,
        clientAddress: creditInvoice.clientAddress, clientBillingAddress: creditInvoice.clientBillingAddress,
        clientEmail: creditInvoice.clientEmail, clientPhone: creditInvoice.clientPhone,
        companyPostalCode: creditInvoice.companyPostalCode || '', companyCity: creditInvoice.companyCity || '', companyCountry: creditInvoice.companyCountry || 'FR',
        clientPostalCode: creditInvoice.clientPostalCode || '', clientCity: creditInvoice.clientCity || '', clientCountry: creditInvoice.clientCountry || 'FR',
        items: JSON.stringify(creditItems.length ? creditItems : (() => { try { return JSON.parse(creditInvoice.items || '[]'); } catch { return []; } })()),
        paymentMethods: creditInvoice.paymentMethods, paymentConditions: creditInvoice.paymentConditions,
        executionDelay: creditInvoice.executionDelay, specialConditions: creditInvoice.specialConditions,
        notes: `MOTIF AVOIR : ${creditForm.reason}\nRéférence facture d'origine : ${creditInvoice.invoiceNumber}\nDate facture d'origine : ${creditInvoice.issueDate || '-'}`,
        isElectronic: creditInvoice.isElectronic === true,
        einvoicePlatform: creditInvoice.isElectronic ? (creditInvoice.einvoicePlatform || 'simulation') : null,
        einvoiceFormat: creditInvoice.isElectronic ? (creditInvoice.einvoiceFormat || 'factur-x') : null,
      };
      
      try {
        await databases.createDocument(DATABASE_ID, 'invoices', deterministicInvoiceId, creditPayload, getTeamPermissions(appwriteTeamId));
      } catch (invoiceError) {
        console.error('Échec création facture:', invoiceError);
        throw new Error(`Impossible de créer la facture d'avoir : ${(invoiceError as Error).message}`);
      }
      
      try {
        await saveMetadata(invoiceIdStr, {
          creditData: { creditStatus: initialCreditStatus, allocatedAmount, refundedAmount: 0, refundPayments: [], taxBreakdown: breakdown },
        });
      } catch (metaError) {
        console.warn('⚠️ Erreur métadonnées avoir (non bloquant):', metaError);
      }
      
      if (creditInvoice.isElectronic) {
        try {
          const createdCredit = await databases.getDocument(DATABASE_ID, 'invoices', invoiceIdStr) as unknown as Invoice;
          await generateAndStoreXml(createdCredit);
        } catch (xmlError) {
          console.warn('⚠️ XML E-Avoir non généré (non bloquant):', xmlError);
        }
      }
      
      setShowCreditModal(false);
      setCreditInvoice(null);
      await loadInvoices(true);
      const remainingOnInvoice = getNetRemaining(creditInvoice);
      toast.success(`${creditInvoice.isElectronic ? '⚡ E-Avoir' : 'Avoir'} ${creditNumber} émis : ${fm(creditTotal)}`, {
        description: `HT : ${fm(creditSubtotal)} | TVA : ${fm(creditTax)} • Imputé : ${fm(allocatedAmount)} • À rembourser : ${fm(toRefund)} • Solde restant : ${fm(remainingOnInvoice)}`,
        duration: 6000,
      });
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); } finally { setSavingCredit(false); }
  };

  const acquireRefundLock = async (creditInvoiceId: string, userId: string): Promise<'ok' | 'missing' | 'locked'> => {
    const permissions = getTeamPermissions(appwriteTeamId);
    try {
      const metadataDocs = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('invoiceId', creditInvoiceId), Query.limit(1),
      ]);
      if (metadataDocs.documents.length === 0) return 'missing';
      const metadataDoc = metadataDocs.documents[0] as any;
      const creditData = JSON.parse(metadataDoc.creditData || '{}');
      if (creditData.refundLock && creditData.refundLock.expiresAt > Date.now()) {
        if (creditData.refundLock.userId !== userId) return 'locked';
      }
      const lockExpiresAt = Date.now() + 30000;
      await databases.updateDocument(DATABASE_ID, 'invoice_metadata', metadataDoc.$id, {
        creditData: JSON.stringify({ ...creditData, refundLock: { userId, expiresAt: lockExpiresAt } }),
      }, permissions);
      return 'ok';
    } catch (e) { console.error('Erreur acquisition verrou:', e); return 'missing'; }
  };

  const releaseRefundLock = async (creditInvoiceId: string) => {
    const permissions = getTeamPermissions(appwriteTeamId);
    try {
      const metadataDocs = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
        Query.equal('invoiceId', creditInvoiceId), Query.limit(1),
      ]);
      if (metadataDocs.documents.length === 0) return;
      const metadataDoc = metadataDocs.documents[0] as any;
      const creditData = JSON.parse(metadataDoc.creditData || '{}');
      await databases.updateDocument(DATABASE_ID, 'invoice_metadata', metadataDoc.$id, {
        creditData: JSON.stringify({ ...creditData, refundLock: null }),
      }, permissions);
    } catch (e) { console.error('Erreur libération verrou:', e); }
  };

  const handleOpenRefundModal = (credit: Invoice) => {
    const refundable = getCreditRefundableAmount(credit);
    if (refundable <= 0) { toast.info('Cet avoir est déjà entièrement traité.'); return; }
    setRefundCredit(credit);
    setRefundForm({ amount: refundable.toFixed(2), date: new Date().toISOString().split('T')[0], method: 'Virement bancaire', reference: '' });
    setShowRefundModal(true);
  };

  const handleRecordRefund = async () => {
    if (!refundCredit || !currentTeamId || !user) return;
    const amount = parseFloat(refundForm.amount);
    if (!amount || amount <= 0) { toast.error('Montant invalide.'); return; }
    setSavingRefund(true);
    try {
      const lockState = await acquireRefundLock(refundCredit.$id, user.$id);
      if (lockState === 'locked') {
        toast.warning('Un autre utilisateur traite cet avoir. Réessayez dans quelques secondes.');
        setSavingRefund(false);
        return;
      }
      
      try {
        const freshMetadata = await loadMetadataForInvoice(refundCredit.$id);
        const freshCreditData = freshMetadata.creditData;
        const currentVersion = freshMetadata.metadataVersion || 0;
        
        let freshRefunds: any[] = [];
        try { if (Array.isArray(freshCreditData.refundPayments)) freshRefunds = freshCreditData.refundPayments; } catch { freshRefunds = []; }
        
        const freshRefunded = round2(freshRefunds.reduce((s, p) => s + (p.amount || 0), 0));
        const freshAllocated = round2(freshCreditData.allocatedAmount || 0);
        const total = refundCredit.total || 0;
        const freshRefundable = round2(Math.max(0, total - freshAllocated - freshRefunded));
        
        if (amount > freshRefundable + 0.01) {
          toast.warning(`Montant invalide (remboursable : ${fm(freshRefundable)})`);
          await releaseRefundLock(refundCredit.$id);
          setSavingRefund(false);
          await loadInvoices(true);
          return;
        }
        
        const payment = { id: `refund-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, amount, date: refundForm.date, method: refundForm.method, reference: refundForm.reference || '' };
        const updatedRefunds = [...freshRefunds, payment];
        const refundedAmount = round2(updatedRefunds.reduce((s, p) => s + (p.amount || 0), 0));
        const newStatus = refundedAmount >= total - 0.001 ? 'refunded' : (freshAllocated > 0 ? 'partial_refund' : 'to_refund');
        
        const saveResult = await saveMetadata(refundCredit.$id, {
          creditData: { ...freshCreditData, refundPayments: updatedRefunds, refundedAmount, creditStatus: newStatus, lastRefundAt: new Date().toISOString(), lastRefundBy: user.$id, refundLock: null },
        }, currentVersion);
        
        if (saveResult.conflict) {
          toast.warning('Conflit de concurrence détecté. Veuillez réessayer.');
          await releaseRefundLock(refundCredit.$id);
          setSavingRefund(false);
          await loadInvoices(true);
          return;
        }
        if (!saveResult.success) throw new Error("Impossible d'enregistrer le remboursement");
        
        await databases.updateDocument(DATABASE_ID, 'invoices', refundCredit.$id, {
          paidAt: refundedAmount + freshAllocated >= total - 0.01 ? (refundCredit.paidAt || refundForm.date) : refundCredit.paidAt,
        });
        
        const movementResult = await createTreasuryMovement({
          teamId: currentTeamId, appwriteTeamId, userId: user.$id,
          type: 'out', category: 'client_refund', amount, date: refundForm.date,
          method: refundForm.method === 'Virement bancaire' ? 'bank_transfer' : 'other',
          description: `Remboursement avoir ${refundCredit.invoiceNumber} — ${refundCredit.clientName || ''}`.trim(),
          counterpartyName: refundCredit.clientName || null,
          linkedInvoiceId: refundCredit.$id,
          reference: refundForm.reference || null,
        });
        if (!movementResult.success) console.warn('⚠️ Mouvement trésorerie non créé :', movementResult.error);
        
        let eventSuccess = false;
        try {
          await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
            teamId: currentTeamId,
            data: writeJson({ type: 'credit_refund', documentType: 'credit', documentId: refundCredit.$id, documentNumber: refundCredit.invoiceNumber, amount, eventDate: refundForm.date, method: refundForm.method, reference: refundForm.reference || '', createdBy: user.$id, createdAt: new Date().toISOString() }),
          }, getTeamPermissions(appwriteTeamId));
          eventSuccess = true;
        } catch (eventError) {
          console.error('❌ Événement comptable non enregistré:', eventError);
          setFailedEvents(prev => [...prev, {
            type: 'credit_refund', invoiceId: refundCredit.$id,
            data: { type: 'credit_refund', documentType: 'credit', documentId: refundCredit.$id, documentNumber: refundCredit.invoiceNumber, amount, eventDate: refundForm.date, method: refundForm.method, reference: refundForm.reference || '' },
          }]);
        }
        
        setShowRefundModal(false);
        await loadInvoices(true);
        if (!eventSuccess) toast.warning('Remboursement enregistré mais NON TRACÉ. Utilisez "Réessayer les événements".');
        else toast.success(`Remboursement de ${fm(amount)} enregistré`);
        
        try {
          const updatedCredit = await databases.getDocument(DATABASE_ID, 'invoices', refundCredit.$id) as unknown as Invoice;
          await generateDebitReceiptPDF(updatedCredit, payment);
        } catch (receiptError) {
          console.error('Erreur génération automatique du reçu de décaissement:', receiptError);
          toast.error('Le remboursement est enregistré mais le reçu DEC n\'a pas pu être généré.');
        }
      } finally {
        await releaseRefundLock(refundCredit.$id);
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
      await releaseRefundLock(refundCredit.$id);
    } finally {
      setSavingRefund(false);
      setRefundCredit(null);
    }
  };

  const generatePDF = async (inv: Invoice) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;
    let items: InvoiceItem[] = [];
    try { items = JSON.parse(inv.items || '[]'); } catch (e) { }
    
    const pdfSubtotal = inv.subtotal || 0;
    const pdfDiscount = inv.discount || 0;
    const pdfTax = inv.tax || 0;
    const pdfTotal = inv.total || 0;
    const pdfDeposit = inv.deposit || 0;
    const pdfBalance = inv.balance || 0;
    const pdfDiscountAmount = pdfSubtotal * (pdfDiscount / 100);
    const pdfTaxableAmount = pdfSubtotal - pdfDiscountAmount;
    
    const companyAddr = parseAddressRetroactive(inv.companyAddress, inv.companyPostalCode, inv.companyCity, inv.companyCountry);
    const clientAddr = parseAddressRetroactive(inv.clientAddress, inv.clientPostalCode, inv.clientCity, inv.clientCountry);
    const fullCompanyAddress = [companyAddr.address, `${companyAddr.postalCode} ${companyAddr.city}`.trim()].filter(Boolean).join(', ');
    const fullClientAddress = [clientAddr.address, `${clientAddr.postalCode} ${clientAddr.city}`.trim()].filter(Boolean).join(', ');
    
    const pdfCountryConfig = getCountryConfig(inv.companyCountry || companyCountry) || FALLBACK_COUNTRY;
    const pdfIdLabel = getPrimaryIdentifier(pdfCountryConfig)?.shortLabel || 'ID';
    const pdfVatLabel = pdfCountryConfig?.vat?.label || 'TVA';
    const pdfVatEnabled = pdfCountryConfig?.vat?.enabled ?? true;
    const pdfIsTvaApplicable = pdfVatEnabled && !(inv.companyTva || '').toLowerCase().includes('non applicable') && !(inv.companyTva || '').toLowerCase().includes('non assujetti');
    
    let logoB64: string | null = null;
    if (inv.logoFileId) {
      try {
        const u = getFilePreviewUrl('company_logos', inv.logoFileId);
        const b = await fetch(u).then(r => r.blob());
        logoB64 = await new Promise<string>((rs, rj) => { const rd = new FileReader(); rd.onloadend = () => rs(rd.result as string); rd.onerror = rj; rd.readAsDataURL(b); });
      } catch (e) { }
    }
    
    let Y = M;
    if (logoB64) { try { doc.addImage(logoB64, logoB64.includes('image/png') ? 'PNG' : 'JPEG', M, Y, 30, 15); } catch (e) { } }
    doc.setFontSize(14); doc.setFont(undefined as any, 'bold');
    doc.text(inv.companyName || '', M, Y + 22);
    doc.setFontSize(8); doc.setFont(undefined as any, 'normal');
    let infoY = Y + 27;
    if (fullCompanyAddress) { doc.text(fullCompanyAddress.substring(0, 60), M, infoY); infoY += 4; }
    if (inv.companyPhone) { doc.text(`Tél: ${inv.companyPhone}`, M, infoY); infoY += 4; }
    if (inv.companyEmail) { doc.text(`Email: ${inv.companyEmail}`, M, infoY); infoY += 4; }
    if (inv.companySiret) { doc.text(`${pdfIdLabel}: ${inv.companySiret}`, M, infoY); infoY += 4; }
    if (inv.companyTva && !inv.companyTva.toLowerCase().includes('non')) { doc.text(`${pdfVatLabel}: ${inv.companyTva}`, M, infoY); infoY += 4; }
    
    const rX = W - M;
    const pdfType = inv.type || 'standard';
    const isCredit = pdfType === 'credit';
    const pdfTitle = isCredit ? "FACTURE D'AVOIR" : (pdfType === 'advance' ? "FACTURE D'ACOMPTE" : pdfType === 'balance' ? 'FACTURE DE SOLDE' : 'FACTURE');
    
    doc.setFontSize(16); doc.setFont(undefined as any, 'bold');
    if (isCredit) doc.setTextColor(220, 38, 38); else doc.setTextColor(0, 0, 0);
    doc.text(`${pdfTitle} N° ${inv.invoiceNumber}`, rX, Y + 5, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8); doc.setFont(undefined as any, 'normal');
    doc.text(`Date: ${inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('fr-FR') : '-'}`, rX, Y + 10, { align: 'right' });
    if (inv.dueDate && !isCredit) doc.text(`Échéance: ${new Date(inv.dueDate).toLocaleDateString('fr-FR')}`, rX, Y + 14, { align: 'right' });
    
    const clientBoxX = rX - 60; const clientBoxY = Y + 18;
    doc.setDrawColor(150); doc.setLineWidth(0.3); doc.rect(clientBoxX, clientBoxY, 60, 22);
    doc.setFontSize(8); doc.setFont(undefined as any, 'bold'); doc.text('CLIENT', clientBoxX + 2, clientBoxY + 4);
    doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
    doc.text(inv.clientName || '', clientBoxX + 2, clientBoxY + 9);
    if (fullClientAddress) doc.text(fullClientAddress.substring(0, 50), clientBoxX + 2, clientBoxY + 13);
    if (inv.clientEmail) doc.text(inv.clientEmail, clientBoxX + 2, clientBoxY + 17);
    
    Y = Math.max(infoY, clientBoxY + 25) + 5;
    const tableData = items.map(i => {
      const ld = i.discount || 0;
      const lt = i.quantity * i.unitPrice * (1 - ld / 100);
      return [i.reference || '-', i.description, i.quantity.toFixed(2), i.unit, `${i.unitPrice.toFixed(2)} ${SYM}`, ld + '%', `${lt.toFixed(2)} ${SYM}`, i.tvaRate + '%'];
    });
    
    autoTable(doc, {
      startY: Y, head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', pdfVatLabel]],
      body: tableData, theme: 'grid', margin: { left: M, right: M },
      headStyles: { fillColor: isCredit ? [220, 38, 38] : [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 60 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 12, halign: 'right' } },
    });
    
    let ty = (doc as any).lastAutoTable.finalY + 8;
    const totalsX = W - M - 60;
    doc.setFontSize(8); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
    const totalLine = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
      doc.setFont(undefined as any, bold ? 'bold' : 'normal'); doc.setTextColor(color[0], color[1], color[2]);
      doc.text(label, totalsX, ty); doc.text(value, W - M, ty, { align: 'right' });
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(totalsX, ty + 1, W - M, ty + 1); ty += 5;
    };
    
    totalLine('Total HT', `${pdfSubtotal.toFixed(2)} ${SYM}`);
    if (pdfDiscount > 0) totalLine(`Remise ${pdfDiscount}%`, `- ${pdfDiscountAmount.toFixed(2)} ${SYM}`, false, [220, 38, 38]);
    totalLine('Total HT après remise', `${pdfTaxableAmount.toFixed(2)} ${SYM}`);
    totalLine(`Total ${pdfVatLabel}`, `${pdfTax.toFixed(2)} ${SYM}`);
    doc.setFont(undefined as any, 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('Total TTC', totalsX, ty); doc.text(`${pdfTotal.toFixed(2)} ${SYM}`, W - M, ty, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(totalsX, ty + 1.5, W - M, ty + 1.5); ty += 6;
    
    if (pdfDeposit > 0) {
      ty += 2; doc.setFontSize(9); doc.setFont(undefined as any, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('ACOMPTE DÉJÀ VERSÉ', totalsX, ty); ty += 5;
      doc.setFontSize(8); doc.setFont(undefined as any, 'normal'); doc.setTextColor(0, 0, 0);
      totalLine("Montant de l'acompte", `- ${pdfDeposit.toFixed(2)} ${SYM}`, false, [37, 99, 235]);
      ty += 2; doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8); doc.line(totalsX, ty, W - M, ty); ty += 5;
      doc.setFontSize(11); doc.setFont(undefined as any, 'bold'); doc.setTextColor(37, 99, 235);
      doc.text('NET À PAYER', totalsX, ty); doc.text(`${pdfBalance.toFixed(2)} ${SYM}`, W - M, ty, { align: 'right' }); ty += 6;
      doc.setDrawColor(200); doc.setLineWidth(0.2);
    }
    
    if (inv.paymentMethods || inv.paymentConditions) {
      ty += 5; doc.setFontSize(10); doc.setFont(undefined as any, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text('Conditions de règlement', M, ty);
      doc.setDrawColor(150); doc.setLineWidth(0.3); doc.line(M, ty + 1, W - M, ty + 1); ty += 6;
      doc.setFontSize(8); doc.setFont(undefined as any, 'normal');
      if (inv.paymentMethods) { doc.text(`Mode: ${inv.paymentMethods}`, M, ty); ty += 4; }
      if (inv.paymentConditions) { doc.text(`Conditions: ${inv.paymentConditions}`, M, ty); ty += 4; }
      if (inv.executionDelay) { doc.text(`Délai: ${inv.executionDelay}`, M, ty); ty += 4; }
      if ((inv.companyCountry || companyCountry) === 'FR') {
        ty += 2; doc.setFont(undefined as any, 'italic'); doc.setTextColor(100, 100, 100);
        doc.text('Pénalités de retard : 3x le taux d\'intérêt légal (loi 2008-776).', M, ty);
        ty += 4; doc.text('Indemnité forfaitaire pour frais de recouvrement : 40€ (art D.441-5).', M, ty);
        ty += 4;
      }
    }
    
    if (!pdfIsTvaApplicable && inv.companyTva) {
      doc.setFontSize(7); doc.setFont(undefined as any, 'italic'); doc.setTextColor(100, 100, 100);
      doc.text(inv.companyTva, M, 285);
    }
    
    if (inv.isElectronic) {
      toast.info('⏳ Génération du PDF Factur-X (XML embarqué)...');
      try {
        let target = inv;
        if (!target.xmlContent) {
          await generateAndStoreXml(target);
          target = await databases.getDocument(DATABASE_ID, 'invoices', inv.$id) as unknown as Invoice;
        }
        if (target.xmlContent) {
          const pdfBytes = doc.output('arraybuffer');
          const { embedFacturXInPdf } = await import('../services/facturxEmbedder');
          const facturxPdfBytes = await embedFacturXInPdf(pdfBytes, target.xmlContent, inv.invoiceNumber);
          const blob = new Blob([facturxPdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${pdfTitle}_${inv.invoiceNumber}_facturx.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success('PDF Factur-X téléchargé', { description: `XML embarqué • Prêt pour dépôt PPF/PDP`, duration: 6000 });
          return;
        }
      } catch (e: any) {
        console.error('Erreur embarquement XML:', e);
        toast.warning('PDF classique téléchargé (embarquement XML échoué)', { description: e.message });
      }
    }
    
    doc.save(`${pdfTitle}_${inv.invoiceNumber}.pdf`);
    toast.success('PDF téléchargé');
  };

  const handleDownloadXml = async (inv: Invoice) => {
    let target = inv;
    if (!target.xmlContent && target.isElectronic) {
      toast.info('⏳ Génération du XML Factur-X...');
      await generateAndStoreXml(target);
      target = await databases.getDocument(DATABASE_ID, 'invoices', inv.$id) as unknown as Invoice;
    }
    if (!target.xmlContent) {
      toast.warning('Cette facture n\'a pas de contenu XML Factur-X.');
      return;
    }
    try {
      const blob = new Blob([target.xmlContent], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `factur-x_${target.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('XML Factur-X téléchargé', { description: `Facture ${target.invoiceNumber} — prêt pour dépôt PPF/PDP` });
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  const handleTransmitToPlatform = async (inv: Invoice) => {
    if (!currentTeamId || !user) return;
    if (!inv.xmlContent && inv.isElectronic) {
      toast.info('⏳ Génération du XML en cours...');
      try {
        await generateAndStoreXml(inv);
        const updatedInv = await databases.getDocument(DATABASE_ID, 'invoices', inv.$id) as unknown as Invoice;
        inv = updatedInv;
        if (!inv.xmlContent) {
          toast.error('Impossible de générer le XML.');
          return;
        }
      } catch (e) {
        toast.error('❌ Erreur lors de la génération du XML');
        return;
      }
    }
    if (!confirm(`Transmettre la facture ${inv.invoiceNumber} à la plateforme PPF (simulation) ?`)) return;
    setTransmitting(true);
    try {
      const result = await transmitToPPF(inv, currentTeamId, user.$id);
      if (result.success) {
        toast.success('✅ Facture transmise !', { description: `Référence : ${result.transmissionReference}`, duration: 6000 });
        await loadInvoices(true);
      } else {
        toast.error('❌ Échec de transmission', { description: result.errorMessage || 'Erreur inconnue', duration: 6000 });
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e.message || 'Erreur lors de la transmission'}`);
    } finally {
      setTransmitting(false);
    }
  };

  const handleMarkTransmittedManually = async (inv: Invoice) => {
    if (!currentTeamId || !user) return;
    const isCredit = inv.type === 'credit';
    const ref = prompt(`Numéro de transmission ${isCredit ? "de l'E-Avoir" : 'de la facture'} ${inv.invoiceNumber} :`, '');
    if (ref === null) return;
    if (!ref.trim()) {
      toast.warning('Numéro de transmission requis');
      return;
    }
    const reference = ref.trim();
    setTransmitting(true);
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
        transmissionStatus: 'transmitted', transmissionReference: reference,
        einvoicePlatform: inv.einvoicePlatform || 'ppf',
      });
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: currentTeamId,
          data: writeJson({ type: 'einvoice_transmitted_manual', documentType: isCredit ? 'credit' : 'invoice', documentId: inv.$id, documentNumber: inv.invoiceNumber, reference, eventDate: new Date().toISOString(), createdBy: user.$id }),
        }, getTeamPermissions(appwriteTeamId));
      } catch (e) { console.warn('Événement non tracé:', e); }
      await loadInvoices(true);
      toast.success(`📤 ${isCredit ? 'E-Avoir' : 'Facture'} marqué(e) transmis(e)`, { description: `Référence : ${reference}`, duration: 6000 });
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setTransmitting(false);
    }
  };

  const handleManualAccept = async (inv: Invoice) => {
    if (!currentTeamId || !user) return;
    const isCredit = inv.type === 'credit';
    if (!confirm(`Marquer ${isCredit ? "l'E-Avoir" : 'la facture'} ${inv.invoiceNumber} comme ACCEPTÉ(E) ?`)) return;
    setTransmitting(true);
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, { transmissionStatus: 'accepted' });
      await loadInvoices(true);
      toast.success(`✅ ${isCredit ? 'E-Avoir' : 'Facture'} marqué(e) accepté(e)`, { duration: 6000 });
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setTransmitting(false);
    }
  };

  const handleManualReject = async (inv: Invoice) => {
    if (!currentTeamId || !user) return;
    const reason = prompt(`Motif du rejet de la facture ${inv.invoiceNumber} (obligatoire) :`);
    if (!reason || !reason.trim()) { toast.info('Rejet abandonné : motif requis.'); return; }
    setTransmitting(true);
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, {
        transmissionStatus: 'rejected', rejectionReason: reason.trim(),
      });
      await loadInvoices(true);
      toast.warning(`❌ Facture ${inv.invoiceNumber} marquée rejetée`, { description: `Motif : ${reason.trim()}`, duration: 7000 });
      const fresh = await databases.getDocument(DATABASE_ID, 'invoices', inv.$id) as unknown as Invoice;
      handleOpenCorrectionModal(fresh);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setTransmitting(false);
    }
  };

  const handleSimulateResponse = async (inv: Invoice, forceStatus?: 'accepted' | 'rejected') => {
    if (!currentTeamId || !user) return;
    setTransmitting(true);
    try {
      const result = await simulateRecipientResponse(inv, currentTeamId, user.$id, forceStatus);
      if (result.success) {
        if (result.status === 'accepted') toast.success('✅ Facture acceptée par le client !', { duration: 6000 });
        else toast.warning('⚠️ Facture rejetée par le client', { duration: 6000 });
        await loadInvoices(true);
      } else {
        toast.error(`Erreur : ${result.errorMessage}`);
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setTransmitting(false);
    }
  };

  const handleOpenCorrectionModal = (inv: Invoice) => {
    let items: InvoiceItem[] = [];
    try { items = JSON.parse(inv.items || '[]'); } catch { items = []; }
    setInvoiceToCorrect(inv);
    setCorrectionForm({
      clientName: inv.clientName || '', clientAddress: inv.clientAddress || '',
      clientEmail: inv.clientEmail || '', clientSiret: (inv as any).clientSiret || '',
      invoiceNumber: inv.invoiceNumber || '', issueDate: inv.issueDate || new Date().toISOString().split('T')[0],
      dueDate: inv.dueDate || '', paymentConditions: inv.paymentConditions || '',
      items: items.length > 0 ? items : [{ id: `item-${Date.now()}`, reference: '', description: '', quantity: 1, unit: 'unité', unitPrice: 0, tvaRate: 20, total: 0, discount: 0 }],
      notes: inv.notes || '', correctionNotes: '',
    });
    setShowCorrectionModal(true);
  };

  const handleAddItem = () => {
    setCorrectionForm({ ...correctionForm, items: [...correctionForm.items, { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, reference: '', description: '', quantity: 1, unit: 'unité', unitPrice: 0, tvaRate: 20, total: 0, discount: 0 }] });
  };

  const handleRemoveItem = (itemId: string) => {
    if (correctionForm.items.length === 1) { toast.warning('La facture doit contenir au moins une ligne'); return; }
    setCorrectionForm({ ...correctionForm, items: correctionForm.items.filter(item => item.id !== itemId) });
  };

  const handleUpdateItem = (itemId: string, field: keyof InvoiceItem, value: any) => {
    const numericFields: (keyof InvoiceItem)[] = ['quantity', 'unitPrice', 'tvaRate', 'discount'];
    setCorrectionForm({
      ...correctionForm,
      items: correctionForm.items.map(item => {
        if (item.id === itemId) {
          const parsedValue = numericFields.includes(field) ? (parseFloat(String(value)) || 0) : value;
          const updatedItem = { ...item, [field]: parsedValue };
          const q = Number(updatedItem.quantity) || 0;
          const u = Number(updatedItem.unitPrice) || 0;
          const d = Number(updatedItem.discount) || 0;
          updatedItem.total = round2(q * u * (1 - d / 100));
          return updatedItem;
        }
        return item;
      }),
    });
  };

  const calculateTotals = () => {
    const subtotal = correctionForm.items.reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const u = Number(item.unitPrice) || 0;
      const d = Number(item.discount) || 0;
      return sum + (q * u * (1 - d / 100));
    }, 0);
    const tax = correctionForm.items.reduce((sum, item) => {
      const q = Number(item.quantity) || 0;
      const u = Number(item.unitPrice) || 0;
      const d = Number(item.discount) || 0;
      const r = Number(item.tvaRate) || 0;
      return sum + (q * u * (1 - d / 100) * r / 100);
    }, 0);
    return { subtotal: round2(subtotal), tax: round2(tax), total: round2(subtotal + tax) };
  };

  const handleCorrectAndRetransmit = async () => {
    if (!invoiceToCorrect || !currentTeamId || !user) return;
    if (!correctionForm.clientName.trim()) { toast.error('Le nom du client est obligatoire'); return; }
    if (correctionForm.items.length === 0) { toast.error('La facture doit contenir au moins une ligne'); return; }
    setCorrecting(true);
    try {
      const totals = calculateTotals();
      await databases.updateDocument(DATABASE_ID, 'invoices', invoiceToCorrect.$id, {
        clientName: correctionForm.clientName, clientAddress: correctionForm.clientAddress,
        clientEmail: correctionForm.clientEmail, invoiceNumber: correctionForm.invoiceNumber,
        issueDate: correctionForm.issueDate, dueDate: correctionForm.dueDate,
        paymentConditions: correctionForm.paymentConditions, items: JSON.stringify(correctionForm.items),
        subtotal: totals.subtotal, tax: totals.tax, total: totals.total, balance: totals.total,
        notes: correctionForm.notes, transmissionStatus: 'ready', transmissionReference: null,
      });
      const updatedInvoice = await databases.getDocument(DATABASE_ID, 'invoices', invoiceToCorrect.$id) as unknown as Invoice;
      if (updatedInvoice.isElectronic) {
        await generateAndStoreXml(updatedInvoice);
      }
      const finalInvoice = await databases.getDocument(DATABASE_ID, 'invoices', invoiceToCorrect.$id) as unknown as Invoice;
      setShowCorrectionModal(false);
      setInvoiceToCorrect(null);
      await loadInvoices(true);
      if (isSimulation) {
        const transmissionResult = await transmitToPPF(finalInvoice, currentTeamId, user.$id);
        if (transmissionResult.success) {
          toast.success('✅ Facture corrigée et re-transmise !', { description: `Nouvelle référence : ${transmissionResult.transmissionReference}`, duration: 6000 });
        } else {
          toast.warning('⚠️ Facture corrigée mais re-transmission échouée', { description: transmissionResult.errorMessage, duration: 6000 });
        }
      } else {
        toast.success(`🔧 Facture corrigée — prête pour un nouveau dépôt`, { duration: 8000 });
      }
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); } finally { setCorrecting(false); }
  };

  const handleCancelTransmission = async (inv: Invoice) => {
    if (!confirm(`Annuler la transmission de la facture ${inv.invoiceNumber} ?`)) return;
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', inv.$id, { transmissionStatus: 'draft', transmissionReference: null });
      await loadInvoices(true);
      toast.info(`Transmission annulée pour ${inv.invoiceNumber}`);
    } catch (e: any) { toast.error(`Erreur : ${e.message}`); }
  };

  const isSubjectToVAT = useMemo(() => {
    return vatEnabled && invoices.some(inv => inv && inv.companyTva && inv.companyTva.trim() !== '' && !inv.companyTva.toLowerCase().includes('non applicable'));
  }, [invoices, vatEnabled]);

  const vatBaseLabel = isSubjectToVAT ? 'HT' : 'TTC';
  const amountOf = (inv: Invoice | null | undefined): number => {
    if (!inv) return 0;
    return isSubjectToVAT ? (inv.subtotal || 0) : (inv.total || 0);
  };

  const filtered = invoices.filter(inv => {
    if (!inv) return false;
    const searchStr = `${inv.invoiceNumber} ${inv.clientName} ${inv.status} ${inv.total}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchType = filterType === 'all' || inv.type === filterType;
    const matchTypeTab =
      typeTab === 'all' ? true :
      typeTab === 'einvoice' ? inv.isElectronic === true :
      (inv.type === typeTab && !inv.isElectronic);
    const matchView = viewMode === 'active' ? !isDocArchived(inv) : isDocArchived(inv);
    return matchSearch && matchStatus && matchType && matchTypeTab && matchView;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedInvoices = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const startItem = filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, filtered.length);

  const revenueInvoicesAll = invoices.filter(i => i && (i.type === 'standard' || i.type === 'advance' || i.type === 'balance') && !isDocArchived(i));
  const advancesWithFinal = new Set(
    invoices
      .filter(i => i && (i.type === 'standard' || i.type === 'balance') && i.originalInvoiceId && !isDocArchived(i))
      .filter(i => invoices.some(a => a && a.$id === i.originalInvoiceId && a.type === 'advance'))
      .map(i => i.originalInvoiceId!)
  );
  const originalsWithAdvance = new Set(
    invoices.filter(i => i && i.type === 'advance' && i.originalInvoiceId && !isDocArchived(i)).map(i => i.originalInvoiceId!)
  );
  const revenueInvoices = revenueInvoicesAll.filter(i => {
    if (i.type === 'advance' && advancesWithFinal.has(i.$id)) return false;
    if ((i.type === 'standard' || i.type === 'balance') && originalsWithAdvance.has(i.$id)) return false;
    return true;
  });
  const creditInvoices = invoices.filter(i => i && i.type === 'credit' && !isDocArchived(i));
  
  const caFacture = revenueInvoices.reduce((sum, i) => sum + amountOf(i), 0);
  const paidFraction = (i: Invoice | null | undefined): number => {
    if (!i) return 0;
    const paid = getEffectivePaidAmount(i);
    return i.total > 0 ? Math.min(1, paid / i.total) : 0;
  };
  const tvaFacturee = revenueInvoices.reduce((sum, i) => sum + (i.tax || 0), 0);
  const tvaExigible = revenueInvoices.reduce((sum, i) => sum + (i.tax || 0) * paidFraction(i), 0);
  const tvaRegulariseeRemboursee = creditInvoices.reduce((sum, i) => {
    const t = i.total || 0;
    const refunded = getCreditRefundedAmount(i);
    return sum + (t > 0 ? (i.tax || 0) * (refunded / t) : 0);
  }, 0);
  const tvaNette = tvaExigible - tvaRegulariseeRemboursee;
  const caEncaisse = revenueInvoices.reduce((sum, i) => sum + Math.min(getEffectivePaidAmount(i), i.total || 0), 0);
  const totalDecaisse = creditInvoices.reduce((sum, i) => sum + getCreditRefundedAmount(i), 0);
  const avoirsARembourser = creditInvoices.reduce((sum, i) => sum + getCreditRefundableAmount(i), 0);
  const caNet = caEncaisse - totalDecaisse;
  const resteAEncaisser = revenueInvoices.reduce((sum, i) => sum + getNetRemaining(i), 0);
  const caEncaisseHT = round2(caEncaisse - tvaExigible);
  const totalDecaisseHT = round2(totalDecaisse - tvaRegulariseeRemboursee);
  const caNetHT = round2(caNet - tvaNette);
  
  const overdueInvoices = revenueInvoices.filter(i => getDaysOverdue(i.dueDate, i.status) > 0 && getNetRemaining(i) > 0);
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + getNetRemaining(i), 0);
  
  const advanceInvoiceIds = new Set(invoices.filter(i => i && i.type === 'advance').map(i => i.originalInvoiceId));
  const balanceInvoiceIds = new Set(invoices.filter(i => i && i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a && a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.originalInvoiceId));
  const finalInvoiceIds = new Set(invoices.filter(i => i && i.type === 'standard' && i.originalInvoiceId && invoices.find(a => a && a.$id === i.originalInvoiceId && a.type === 'advance')).map(i => i.$id));

  const typeTabs = [
    { key: 'all', label: 'Toutes', count: invoices.filter(i => i && !isDocArchived(i)).length },
    { key: 'standard', label: 'Factures', count: invoices.filter(i => i && i.type === 'standard' && !i.isElectronic && !isDocArchived(i)).length },
    { key: 'advance', label: 'Acomptes', count: invoices.filter(i => i && i.type === 'advance' && !isDocArchived(i)).length },
    { key: 'credit', label: 'Avoirs', count: invoices.filter(i => i && i.type === 'credit' && !isDocArchived(i)).length },
    { key: 'einvoice', label: '⚡ E-Factures', count: invoices.filter(i => i && i.isElectronic === true && !isDocArchived(i)).length },
  ];

  const getClientIdLabel = (inv: Invoice | null): string => {
    if (!inv) return idLabel;
    const clientCountry = inv.clientCountry || companyCountry;
    const clientConfig = getCountryConfig(clientCountry) || FALLBACK_COUNTRY;
    return getPrimaryIdentifier(clientConfig)?.shortLabel || 'ID';
  };

  const buildRowActions = (inv: Invoice): ReactNode => {
    if (!inv) return null;
    const paidAmountForInvoice = getEffectivePaidAmount(inv);
    const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
    const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
    const maxCreditAllowed = Math.max(0, (inv.total || 0) - creditsForInvoice);
    const hasAdvance = advanceInvoiceIds.has(inv.$id);
    const hasBalance = balanceInvoiceIds.has(inv.$id);
    const isFinal = finalInvoiceIds.has(inv.$id);
    const isCredit = inv.type === 'credit';
    
    if (viewMode === 'archived') {
      return (<ActionMenuItem onClick={() => handleUnarchive(inv.$id, inv.invoiceNumber)} icon={RotateCcw} label="Désarchiver" />);
    }
    
    return (
      <>
        {inv.clientToken && (<ActionMenuItem onClick={() => handleCopyLink(inv)} icon={copiedToken === inv.clientToken ? CheckCircle2 : Link2} label={copiedToken === inv.clientToken ? 'Lien copié !' : 'Copier le lien client'} />)}
        {hasPermission('invoices.mark_paid') && inv.status !== 'paid' && inv.status !== 'cancelled' && !isCredit && remaining > 0 && (!inv.isElectronic || inv.transmissionStatus === 'accepted') && (<ActionMenuItem onClick={() => handleOpenPaymentModal(inv)} icon={DollarSign} label="Enregistrer paiement" />)}
        {hasPermission('invoices.mark_paid') && inv.isElectronic && inv.transmissionStatus !== 'accepted' && inv.status !== 'paid' && inv.status !== 'cancelled' && !isCredit && remaining > 0 && (<ActionMenuItem onClick={() => { }} icon={DollarSign} label="💰 Paiement disponible après acceptation" disabled />)}
        {hasPermission('invoices.create') && inv.type === 'standard' && inv.status === 'paid' && maxCreditAllowed > 0 && (<ActionMenuItem onClick={() => openCreditModal(inv)} icon={FileMinus} label="Créer un avoir" danger />)}
        {hasPermission('invoices.mark_paid') && isCredit && getCreditRefundableAmount(inv) > 0 && (<ActionMenuItem onClick={() => handleOpenRefundModal(inv)} icon={Banknote} label="Rembourser" danger />)}
        {hasPermission('invoices.create') && inv.type === 'standard' && inv.deposit > 0 && inv.status !== 'paid' && !hasAdvance && !isFinal && (<ActionMenuItem onClick={() => handleOpenAdvanceModal(inv)} icon={FileText} label="Facture d'acompte" />)}
        {hasPermission('invoices.create') && inv.type === 'advance' && inv.status === 'paid' && !hasBalance && (<ActionMenuItem onClick={() => handleGenerateFinalFromAdvance(inv)} icon={FileCheck2} label="Facture finale" disabled={generatingFinal} />)}
        {(inv.quoteId || inv.originalQuoteId) && (<ActionMenuItem onClick={() => handleViewQuote((inv.originalQuoteId || inv.quoteId)!)} icon={Eye} label="Voir le devis" />)}
        <ActionMenuItem onClick={() => generatePDF(inv)} icon={Download} label="Télécharger PDF" />
        {inv.isElectronic && inv.xmlContent && (<ActionMenuItem onClick={() => handleDownloadXml(inv)} icon={FileCode} label={isCredit ? 'Télécharger XML Factur-X (avoir)' : 'Télécharger XML Factur-X'} />)}
        {isFrenchEInvoiceRegime && inv.isElectronic && inv.transmissionStatus === 'ready' && (
          isSimulation ? (
            <ActionMenuItem onClick={() => handleTransmitToPlatform(inv)} icon={Send} label={transmitting ? '⏳ Transmission...' : isCredit ? "🧪 Transmettre l'E-Avoir (simulation)" : '🧪 Transmettre (simulation)'} disabled={transmitting} />
          ) : (
            <ActionMenuItem onClick={() => handleMarkTransmittedManually(inv)} icon={Upload} label={isCredit ? "📤 E-Avoir déposé manuellement" : '📤 Marquer comme déposée dans PPF/PDP'} disabled={transmitting} />
          )
        )}
        {isFrenchEInvoiceRegime && inv.isElectronic && inv.transmissionStatus === 'transmitted' && (
          isSimulation ? (
            <>
              <ActionMenuItem onClick={() => handleSimulateResponse(inv, 'accepted')} icon={CheckCircle2} label="✅ Simuler acceptation client" disabled={transmitting} />
              <ActionMenuItem onClick={() => handleSimulateResponse(inv, 'rejected')} icon={X} label="❌ Simuler rejet client" disabled={transmitting} danger />
            </>
          ) : (
            <>
              <ActionMenuItem onClick={() => handleManualAccept(inv)} icon={CheckCircle2} label={isCredit ? "✅ Marquer l'E-Avoir accepté" : '✅ Marquer comme acceptée'} disabled={transmitting} />
              <ActionMenuItem onClick={() => handleManualReject(inv)} icon={X} label={isCredit ? "❌ Marquer l'E-Avoir rejeté" : '❌ Marquer comme rejetée'} disabled={transmitting} danger />
            </>
          )
        )}
        {isFrenchEInvoiceRegime && inv.isElectronic && inv.transmissionStatus === 'rejected' && (
          <>
            <ActionMenuItem onClick={() => handleOpenCorrectionModal(inv)} icon={FileText} label={isSimulation ? '🔧 Corriger et re-transmettre' : '🔧 Corriger (nouveau XML à déposer)'} />
            <ActionMenuItem onClick={() => handleCancelTransmission(inv)} icon={X} label="❌ Annuler la transmission" danger />
            <ActionMenuItem onClick={() => openCreditModal(inv)} icon={FileMinus} label="💳 Créer un avoir (contesté)" danger />
          </>
        )}
        {isFrenchEInvoiceRegime && inv.isElectronic && (
          <ActionMenuItem
            onClick={() => { setHistoryInvoice(inv); setShowHistoryModal(true); }}
            icon={History}
            label="📜 Historique des transmissions"
          />
        )}
        {hasPermission('invoices.delete') && (<ActionMenuItem onClick={() => handleArchive(inv.$id, inv.invoiceNumber)} icon={Archive} label="Archiver" danger />)}
      </>
    );
  };

  const getEntity = (inv: Invoice): Entity => ({ type: 'entreprise', companyName: inv.clientName || '?' });

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50 dark:bg-slate-900 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full"><tbody>{[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}</tbody></table>
            </div>
          </div>
        </div>
      </Sidebar>
    );
  }
  if (!hasPermission('invoices.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Receipt}
          title="Factures"
          description={<><span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{filtered.length}</span>{' '}document(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</>}
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={failedEvents.length > 0 ? (
            <button onClick={handleRetryFailedEvents} className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/30 active:scale-95">
              <RefreshCw size={16} /> Réessayer {failedEvents.length} événement{failedEvents.length > 1 ? 's' : ''}
            </button>
          ) : undefined}
        />
        
        {isFrenchEInvoiceRegime && (
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2 text-sm">
              <Info size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800 dark:text-blue-200 text-xs">
                <strong>E-facturation B2B (Réforme 2026) :</strong> Obligatoire pour vos clients professionnels français.
                Non applicable pour les particuliers (B2C) ou les clients étrangers (export).
              </p>
            </div>
          </main>
        )}
        
        {!isFrenchEInvoiceRegime && countryConfig.code !== 'XX' && (
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 flex items-start gap-2 text-sm">
              <Info size={16} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-indigo-800 dark:text-indigo-200 text-xs">
                <strong>{countryConfig.flag} {countryConfig.name}</strong> — Vos factures utilisent l'identifiant <strong>{idLabel}</strong>.
                {vatEnabled
                  ? ` ${vatLabel} : ${countryConfig.vat.standardRates.join('%, ')}%.`
                  : ' Pas de TVA dans ce régime.'}
                {' La réforme française d\'e-facturation 2026 ne s\'applique pas à votre entreprise.'}
              </p>
            </div>
          </main>
        )}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KPIGrid columns={isSubjectToVAT ? 7 : 6}>
            <StatCell label={`Facturé (${vatBaseLabel})`} value={fm(caFacture)} sublabel={`HT : ${fm(caFacture)} • TVA : ${fm(tvaFacturee)}`} trend={0} />
            <StatCell label="Encaissé (TTC)" value={fm(caEncaisse)} sublabel={`HT : ${fm(caEncaisseHT)} • TVA : ${fm(tvaExigible)}`} trend={0} />
            <StatCell label="Décaissé (TTC)" value={`- ${fm(totalDecaisse)}`} sublabel={`HT : ${fm(totalDecaisseHT)} • À rembourser : ${fm(avoirsARembourser)}`} trend={0} />
            <StatCell label="CA Net (TTC)" value={fm(caNet)} sublabel={`HT : ${fm(caNetHT)} • Trésorerie nette`} trend={0} />
            {isSubjectToVAT && (<StatCell label={`${vatLabel} nette`} value={fm(tvaNette)} sublabel={tvaNette < 0 ? 'Crédit à reporter' : `Exigible : ${fm(tvaExigible)}`} trend={tvaNette < 0 ? -1 : 0} />)}
            <StatCell label="Reste à encaisser" value={fm(resteAEncaisser)} sublabel="Créances en cours" trend={0} />
            <StatCell label="En retard" value={fm(overdueAmount)} sublabel={`${overdueCount} facture${overdueCount > 1 ? 's' : ''}`} trend={overdueCount > 0 ? -1 : 0} />
          </KPIGrid>
          
          <TypeTabs tabs={typeTabs} activeTab={typeTab} onTabChange={(key) => setTypeTab(key as any)} color="purple" />
          
          <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
            <button onClick={() => setViewMode('active')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'active' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Actives ({invoices.filter(i => i && !isDocArchived(i)).length})</button>
            <button onClick={() => setViewMode('archived')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'archived' ? 'border-purple-600 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>Archivées ({invoices.filter(i => i && isDocArchived(i)).length})</button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={searchInputRef} placeholder="Rechercher (N°, client, montant...)" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-14 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition" />
              <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center pointer-events-none">
                <kbd className="h-5 select-none items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 flex">⌘K</kbd>
              </div>
            </div>
            {viewMode === 'active' && (
              <>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value="all">Tous statuts</option>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'cancelled' && k !== 'partial').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value="all">Tous types</option>
                  {Object.entries(typeLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </>
            )}
          </div>
          
          {loading ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full"><tbody>{[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}</tbody></table>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><Receipt size={28} className="text-slate-400 dark:text-slate-500" /></div>
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">Aucune facture {viewMode === 'active' ? 'active' : 'archivée'}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Les documents apparaîtront ici une fois créés.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible relative">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="relative z-20 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Facture</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dates</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Payé</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Reste</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="relative z-30 divide-y divide-slate-100 dark:divide-slate-700">
                    {paginatedInvoices.map(inv => {
                      if (!inv) return null;
                      const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                      const paidAmountForInvoice = getEffectivePaidAmount(inv);
                      const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
                      const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
                      const creditStatus = getCreditData(inv).creditStatus;
                      const mappedStatus = mapInvoiceStatusToShared(inv.status, inv.type, creditStatus);
                      const alert = isRowAlert(inv);
                      return (
                        <tr key={inv.$id} className={`transition-colors group ${alert ? 'bg-rose-50/80 hover:bg-rose-100/80 dark:bg-rose-900/15 dark:hover:bg-rose-900/25' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                          <td className={`px-4 py-3 ${alert ? 'border-l-4 border-l-rose-500' : ''}`}>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-sm font-semibold ${alert ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{inv.invoiceNumber}</span>
                                {isFrenchEInvoiceRegime && inv.isElectronic && (<span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded"><Zap size={10} /> {inv.type === 'credit' ? 'E-Avoir' : 'E-Facture'}</span>)}
                              </div>
                              <DotLabel label={typeLabels[inv.type || 'standard']} tone={typeToneMap[inv.type || 'standard'] || 'slate'} />
                              {isFrenchEInvoiceRegime && inv.isElectronic && inv.transmissionStatus && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full w-fit ${transmissionStatusColors[inv.transmissionStatus]}`}>
                                  {inv.transmissionStatus === 'accepted' && <CheckCircle2 size={10} />}
                                  {inv.transmissionStatus === 'rejected' && <X size={10} />}
                                  {inv.transmissionStatus === 'transmitted' && <Send size={10} />}
                                  {inv.transmissionStatus === 'ready' && <Clock size={10} />}
                                  {transmissionStatusLabels[inv.transmissionStatus]}
                                </span>
                              )}
                              {isFrenchEInvoiceRegime && inv.isElectronic && inv.transmissionReference && (
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[180px]" title={`Numéro de transmission : ${inv.transmissionReference}`}>
                                  Réf : {inv.transmissionReference}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar client={getEntity(inv)} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{inv.clientName || '-'}</p>
                                {inv.clientEmail && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{inv.clientEmail}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm text-slate-700 dark:text-slate-300">{formatDate(inv.issueDate)}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">Échéance : {formatDate(inv.dueDate)}</span>
                              {daysOverdue > 0 && (<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400"><AlertTriangle size={11} /> +{daysOverdue} j</span>)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right"><span className={`text-sm font-bold tabular-nums ${alert ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{fm(inv.total || 0)}</span></td>
                          <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{fm(paidAmountForInvoice)}</span></td>
                          <td className="px-4 py-3 text-right">
                            {inv.type === 'credit' ? (
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 tabular-nums">{fm(getCreditRefundableAmount(inv))}</span>
                                <span className="text-[10px] text-orange-500 dark:text-orange-300">À rembourser</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className={`text-sm font-semibold tabular-nums ${inv.status === 'paid' ? 'text-slate-400 dark:text-slate-500' : 'text-rose-600 dark:text-rose-400'}`}>{inv.status === 'paid' ? fm(0) : fm(remaining)}</span>
                                {inv.type === 'standard' && creditsForInvoice > 0 && (<span className="text-[10px] text-orange-600 dark:text-orange-400">Avoirs: {fm(creditsForInvoice)}</span>)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3"><StatusIndicator status={mappedStatus} /></td>
                          <td className="px-2 py-3 w-12">
                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity [&:has([aria-expanded='true'])]:opacity-100">
                              <ActionMenu>{buildRowActions(inv)}</ActionMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} startItem={startItem} endItem={endItem} totalItems={filtered.length} itemName="facture" />
              </div>
              
              <div className="md:hidden space-y-3">
                {paginatedInvoices.map(inv => {
                  if (!inv) return null;
                  const daysOverdue = getDaysOverdue(inv.dueDate, inv.status);
                  const paidAmountForInvoice = getEffectivePaidAmount(inv);
                  const creditsForInvoice = inv.type === 'standard' ? getTotalCreditsForInvoice(inv.$id) : 0;
                  const remaining = Math.max(0, (inv.total || 0) - paidAmountForInvoice - creditsForInvoice);
                  const creditStatus = getCreditData(inv).creditStatus;
                  const mappedStatus = mapInvoiceStatusToShared(inv.status, inv.type, creditStatus);
                  const alert = isRowAlert(inv);
                  return (
                    <div key={inv.$id} className={`rounded-2xl border p-4 shadow-sm ${alert ? 'bg-rose-50/80 dark:bg-rose-900/15 border-rose-300 dark:border-rose-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <Avatar client={getEntity(inv)} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-mono text-xs font-semibold ${alert ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{inv.invoiceNumber}</span>
                              {isFrenchEInvoiceRegime && inv.isElectronic && (<span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded"><Zap size={9} /> {inv.type === 'credit' ? 'E-Avoir' : 'E-Facture'}</span>)}
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{inv.clientName || '-'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <DotLabel label={typeLabels[inv.type || 'standard']} tone={typeToneMap[inv.type || 'standard'] || 'slate'} />
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDate(inv.issueDate)}</span>
                            </div>
                            {isFrenchEInvoiceRegime && inv.isElectronic && inv.transmissionStatus && (<span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full mt-1.5 ${transmissionStatusColors[inv.transmissionStatus]}`}>{transmissionStatusLabels[inv.transmissionStatus]}</span>)}
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <StatusIndicator status={mappedStatus} />
                          <ActionMenu>{buildRowActions(inv)}</ActionMenu>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 text-center">
                        <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Total</p><p className={`text-sm font-bold tabular-nums ${alert ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{fm(inv.total || 0)}</p></div>
                        <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Payé</p><p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fm(paidAmountForInvoice)}</p></div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Reste</p>
                          {inv.type === 'credit' ? (<p className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">{fm(getCreditRefundableAmount(inv))}</p>) : (<p className={`text-sm font-bold tabular-nums ${inv.status === 'paid' ? 'text-slate-400 dark:text-slate-500' : 'text-rose-600 dark:text-rose-400'}`}>{inv.status === 'paid' ? fm(0) : fm(remaining)}</p>)}
                        </div>
                      </div>
                      {daysOverdue > 0 && (<div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400"><AlertTriangle size={12} /><span>+{daysOverdue} jour{daysOverdue > 1 ? 's' : ''} de retard</span></div>)}
                    </div>
                  );
                })}
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
              </div>
            </>
          )}
        </main>

        <Modal open={showQuoteModal} onClose={() => { setShowQuoteModal(false); setQuoteDetails(null); }} title="Devis d'origine" icon={<FileText className="text-emerald-600" size={20} />}>
          {loadingQuote ? (<div className="text-center py-12 text-slate-500 dark:text-slate-400">Chargement du devis...</div>) : quoteDetails ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3"><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">N° Devis</p><p className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-base mt-1">{quoteDetails.quoteNumber}</p></div>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3"><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Statut</p><StatusIndicator status={quoteDetails.status === 'Facturé' ? 'paid' : 'sent'} /></div>
                <div className="col-span-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3"><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Client</p><p className="font-semibold text-slate-900 dark:text-white mt-1">{quoteDetails.clientName}</p></div>
              </div>
              {quoteDetails.subject && (<div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3"><p className="text-[10px] text-sky-700 dark:text-sky-300 uppercase font-semibold">Objet</p><p className="text-slate-900 dark:text-white mt-1 text-sm">{quoteDetails.subject}</p></div>)}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total HT</span><span className="font-semibold text-slate-900 dark:text-white">{fm(quoteDetails.subtotal || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">TVA</span><span className="font-semibold text-slate-900 dark:text-white">{fm(quoteDetails.tax || 0)}</span></div>
                  <div className="flex justify-between text-base font-bold border-t border-emerald-200 dark:border-emerald-800 pt-2 col-span-2"><span>Total TTC</span><span>{fm(quoteDetails.total || 0)}</span></div>
                </div>
              </div>
            </div>
          ) : (<div className="text-center py-12 text-slate-500 dark:text-slate-400">Aucune donnée de devis trouvée.</div>)}
        </Modal>
        
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => { setShowPaymentModal(false); setInvoiceToPay(null); }}
          invoice={invoiceToPay}
          type="client"
          onSuccess={handlePaymentSuccess}
        />
        
        <Modal open={showAdvanceModal} onClose={() => setShowAdvanceModal(false)} title="Générer une facture d'acompte" icon={<FileText className="text-violet-600" size={20} />}>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Pourcentage d'acompte (%) *</label><input type="number" min="1" max="99" step="0.01" value={advanceForm.percent} onChange={e => setAdvanceForm({ ...advanceForm, percent: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-3 text-sm focus:ring-2 focus:ring-violet-500 outline-none" /><p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">Montant : {(() => { const inv = invoices.find(i => i && i.$id === advanceForm.invoiceId); return inv ? fm(inv.deposit || 0) : fm(0); })()}</p></div>
            <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Facture :</span><span className="font-semibold text-slate-900 dark:text-white">{invoices.find(i => i && i.$id === advanceForm.invoiceId)?.invoiceNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Client :</span><span className="font-semibold text-slate-900 dark:text-white">{invoices.find(i => i && i.$id === advanceForm.invoiceId)?.clientName}</span></div>
              <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Total :</span><span className="font-semibold text-slate-900 dark:text-white">{(() => { const inv = invoices.find(i => i && i.$id === advanceForm.invoiceId); return inv ? fm(inv.total || 0) : fm(0); })()}</span></div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowAdvanceModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
              <button onClick={handleGenerateAdvanceInvoice} disabled={savingAdvance || !advanceForm.percent || parseFloat(advanceForm.percent) <= 0} className="px-5 py-2.5 text-sm font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">{savingAdvance ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><FileText size={14} /> Générer</>}</button>
            </div>
          </div>
        </Modal>
        
        <Modal open={showCreditModal && !!creditInvoice} onClose={() => setShowCreditModal(false)} title="Créer un avoir" icon={<FileMinus className="text-rose-600" size={20} />}>
          {creditInvoice && (() => {
            const existingCreditsTotal = getTotalCreditsForInvoice(creditInvoice.$id);
            const maxCreditAllowed = Math.max(0, (creditInvoice.total || 0) - existingCreditsTotal);
            const linkedCredits = getCreditsListForInvoice(creditInvoice.$id);
            return (
              <div className="space-y-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
                  <div className="flex justify-between items-center text-sm">
                    <div><p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Facture</p><p className="font-bold text-slate-900 dark:text-white text-sm">{creditInvoice.invoiceNumber}</p></div>
                    <div className="text-right"><p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Client</p><p className="font-semibold text-slate-900 dark:text-white text-sm">{creditInvoice.clientName}</p></div>
                    <div className="text-right"><p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Montant</p><p className="text-lg font-bold text-rose-700 dark:text-rose-300">{fm(creditInvoice.total || 0)}</p></div>
                  </div>
                </div>
                {isFrenchEInvoiceRegime && creditInvoice.isElectronic && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
                      <Zap size={14} className="flex-shrink-0 mt-0.5" />
                      <span><strong>E-Avoir :</strong> la facture d'origine étant électronique, cet avoir sera généré au format <strong>Factur-X (TypeCode 381)</strong>.</span>
                    </p>
                  </div>
                )}
                {existingCreditsTotal > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase mb-2">Avoirs déjà émis</p>
                    <div className="space-y-1">{linkedCredits.map(credit => (<div key={credit.$id} className="flex justify-between text-xs text-amber-900 dark:text-amber-100"><span className="font-mono">{credit.invoiceNumber}</span><span className="font-semibold">- {fm(credit.total || 0)}</span></div>))}</div>
                    <div className="mt-2 pt-2 border-t border-amber-300 dark:border-amber-700 flex justify-between text-sm font-bold"><span className="text-amber-900 dark:text-amber-100">Max autorisé :</span><span className="text-emerald-700 dark:text-emerald-300">{fm(maxCreditAllowed)}</span></div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Type d'avoir</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, type: 'total', amount: creditInvoice.total.toFixed(2) })} disabled={existingCreditsTotal > 0} className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.type === 'total' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'} ${existingCreditsTotal > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>Avoir Total</button>
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, type: 'partial', amount: '' })} className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.type === 'partial' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>Avoir Partiel</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Traitement</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, refundChoice: 'allocate' })} className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.refundChoice === 'allocate' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>Imputer sur la créance</button>
                    <button type="button" onClick={() => setCreditForm({ ...creditForm, refundChoice: 'refund' })} className={`p-2.5 border rounded-lg text-sm font-medium transition-colors ${creditForm.refundChoice === 'refund' ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>Rembourser le client</button>
                  </div>
                </div>
                {creditForm.type === 'partial' && (
                  <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant TTC *</label><input type="number" min="0.01" step="0.01" max={maxCreditAllowed} value={creditForm.amount} onChange={e => setCreditForm({ ...creditForm, amount: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-base font-semibold" placeholder="0.00" autoFocus /><p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Max : <span className="font-bold text-rose-600 dark:text-rose-400">{fm(maxCreditAllowed)}</span></p></div>
                )}
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Motif *</label><textarea rows={2} value={creditForm.reason} onChange={e => setCreditForm({ ...creditForm, reason: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-sm resize-none" placeholder="Ex: Retour marchandise, Remise commerciale..." /></div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowCreditModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                  <button onClick={handleGenerateCreditNote} disabled={savingCredit} className="px-4 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">{savingCredit ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><FileMinus size={14} /> Générer</>}</button>
                </div>
              </div>
            );
          })()}
        </Modal>
        
        <Modal open={showRefundModal && !!refundCredit} onClose={() => setShowRefundModal(false)} title="Remboursement d'avoir" icon={<Banknote className="text-rose-600" size={20} />}>
          {refundCredit && (
            <div className="space-y-4">
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Avoir</span><span className="font-mono font-semibold text-slate-900 dark:text-white">{refundCredit.invoiceNumber}</span></div>
                <div className="flex justify-between mt-1"><span className="text-slate-600 dark:text-slate-400">Reste à rembourser</span><span className="font-bold text-rose-600 dark:text-rose-400">{fm(getCreditRefundableAmount(refundCredit))}</span></div>
              </div>
              <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant ({SYM}) *</label><input type="number" step="0.01" min="0.01" max={getCreditRefundableAmount(refundCredit)} value={refundForm.amount} onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label><input type="date" value={refundForm.date} onChange={e => setRefundForm({ ...refundForm, date: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Moyen *</label><select value={refundForm.method} onChange={e => setRefundForm({ ...refundForm, method: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-rose-500 outline-none">{paymentMethodsList.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Référence</label><input type="text" value={refundForm.reference} onChange={e => setRefundForm({ ...refundForm, reference: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none" placeholder="Justificatif..." /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowRefundModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                <button onClick={handleRecordRefund} disabled={savingRefund || !refundForm.amount || parseFloat(refundForm.amount) <= 0} className="px-4 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">{savingRefund ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> ...</> : <><Banknote size={14} /> Enregistrer</>}</button>
              </div>
            </div>
          )}
        </Modal>
        
        <Modal open={showCorrectionModal && !!invoiceToCorrect} onClose={() => { setShowCorrectionModal(false); setInvoiceToCorrect(null); }} title={`🔧 Corriger ${invoiceToCorrect?.invoiceNumber}`} icon={<FileText className="text-amber-600" size={20} />} maxWidth="sm:max-w-5xl">
          {invoiceToCorrect && (
            <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2">
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 uppercase mb-2">❌ Motif du rejet</p>
                <p className="text-sm text-slate-900 dark:text-white">{(invoiceToCorrect as any).rejectionReason || 'Motif non spécifié par la plateforme'}</p>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">1. Informations client</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nom du client *</label><input type="text" value={correctionForm.clientName} onChange={e => setCorrectionForm({ ...correctionForm, clientName: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Nom complet" /></div>
                  <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label><input type="email" value={correctionForm.clientEmail} onChange={e => setCorrectionForm({ ...correctionForm, clientEmail: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" placeholder="email@exemple.com" /></div>
                </div>
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Adresse complète</label><textarea rows={2} value={correctionForm.clientAddress} onChange={e => setCorrectionForm({ ...correctionForm, clientAddress: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none" placeholder="Adresse complète du client" /></div>
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{getClientIdLabel(invoiceToCorrect)} du client</label><input type="text" value={correctionForm.clientSiret} onChange={e => setCorrectionForm({ ...correctionForm, clientSiret: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Identifiant fiscal" /></div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">2. Informations facture</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">N° de facture</label><input type="text" value={correctionForm.invoiceNumber} onChange={e => setCorrectionForm({ ...correctionForm, invoiceNumber: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono" /></div>
                  <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date d'émission</label><input type="date" value={correctionForm.issueDate} onChange={e => setCorrectionForm({ ...correctionForm, issueDate: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date d'échéance</label><input type="date" value={correctionForm.dueDate} onChange={e => setCorrectionForm({ ...correctionForm, dueDate: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" /></div>
                </div>
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Conditions de paiement</label><input type="text" value={correctionForm.paymentConditions} onChange={e => setCorrectionForm({ ...correctionForm, paymentConditions: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" /></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">3. Lignes ({correctionForm.items.length})</h3>
                  <button onClick={handleAddItem} className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">+ Ajouter une ligne</button>
                </div>
                <div className="space-y-2">
                  {correctionForm.items.map((item, index) => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-slate-500 dark:text-slate-400">Ligne {index + 1}</span><button onClick={() => handleRemoveItem(item.id)} className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300">Supprimer</button></div>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-2"><input type="text" value={item.reference} onChange={e => handleUpdateItem(item.id, 'reference', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs" placeholder="Réf." /></div>
                        <div className="col-span-4"><input type="text" value={item.description} onChange={e => handleUpdateItem(item.id, 'description', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs" placeholder="Description" /></div>
                        <div className="col-span-1"><input type="number" step="0.01" min="0" value={item.quantity} onChange={e => handleUpdateItem(item.id, 'quantity', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs text-right" /></div>
                        <div className="col-span-1"><input type="text" value={item.unit} onChange={e => handleUpdateItem(item.id, 'unit', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs" placeholder="Unité" /></div>
                        <div className="col-span-1"><input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => handleUpdateItem(item.id, 'unitPrice', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs text-right" /></div>
                        <div className="col-span-1"><input type="number" step="0.01" min="0" max="100" value={item.discount} onChange={e => handleUpdateItem(item.id, 'discount', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs text-right" /></div>
                        <div className="col-span-1"><input type="number" step="0.01" min="0" max="100" value={item.tvaRate} onChange={e => handleUpdateItem(item.id, 'tvaRate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded p-1.5 text-xs text-right" /></div>
                        <div className="col-span-1"><div className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded p-1.5 text-xs text-right font-bold text-slate-700 dark:text-slate-300">{fm(item.total)}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
                {(() => { const totals = calculateTotals(); return (<div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2"><div className="flex justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">Sous-total HT :</span><span className="font-bold text-slate-900 dark:text-white">{fm(totals.subtotal)}</span></div><div className="flex justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">TVA :</span><span className="font-bold text-slate-900 dark:text-white">{fm(totals.tax)}</span></div><div className="flex justify-between text-base font-bold border-t border-blue-300 dark:border-blue-700 pt-2"><span className="text-slate-900 dark:text-white">Total TTC :</span><span className="text-blue-600 dark:text-blue-400">{fm(totals.total)}</span></div></div>); })()}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">4. Notes</h3>
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Notes sur la facture</label><textarea rows={3} value={correctionForm.notes} onChange={e => setCorrectionForm({ ...correctionForm, notes: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none" /></div>
                <div><label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Notes de correction</label><textarea rows={2} value={correctionForm.correctionNotes} onChange={e => setCorrectionForm({ ...correctionForm, correctionNotes: e.target.value })} className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none" /></div>
              </div>
              {isFrenchEInvoiceRegime && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {isSimulation ? (<>ℹ️ Après correction, la facture sera <strong>automatiquement re-transmise</strong> à la plateforme PPF (simulation).</>) : (<>ℹ️ Après correction, le document repassera en statut <strong>« Prête à transmettre »</strong>.</>)}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-900 pb-2">
                <button onClick={() => { setShowCorrectionModal(false); setInvoiceToCorrect(null); }} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">Annuler</button>
                <button onClick={handleCorrectAndRetransmit} disabled={correcting} className="px-4 py-2.5 text-sm font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2">{correcting ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>Correction...</>) : (<><RotateCcw size={14} />{isFrenchEInvoiceRegime && isSimulation ? 'Corriger et re-transmettre' : 'Corriger le document'}</>)}</button>
              </div>
            </div>
          )}
        </Modal>
        
        <TransmissionHistoryModal
          open={showHistoryModal}
          onClose={() => { setShowHistoryModal(false); setHistoryInvoice(null); }}
          invoice={historyInvoice}
          teamId={currentTeamId}
        />
      </div>
    </Sidebar>
  );
}
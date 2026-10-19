// src/pages/ReceivedInvoices.tsx — Factures fournisseurs reçues (VALIDATION SIMPLIFIÉE)
// 🛡️ treasuryGuard + KPI sorties 30j prévues
// 📎 Validation binaire : VERT (validé) / ROUGE (rejeté) / ORANGE (en attente)
// 🌍 Internationalisation multi-pays
// 🔐 RLS centralisé via utils/rowLevelPermissions
// ✅ CORRIGÉ : Preview PDF via getFileView() + fallback multi-buckets

import { useState, useEffect, useMemo, useRef } from 'react';
import { databases, storage, DATABASE_ID } from '../appwrite'; // ✅ storage ajouté
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { toast } from 'sonner';
import {
  PageHeader, Modal, ActionMenu, ActionMenuItem,
  Pagination, TypeTabs, Badge,
  KPIGrid, StatCell, Card, SectionTitle,
  DataTable, MobileCard, SearchFilter, SelectFilter, EmptyState,
} from '../components/ui/SharedUI';
import {
  Upload, Eye, Receipt, AlertCircle,
  CreditCard, FileText, FileMinus, Calendar,
  Archive, RotateCcw, FileX, Sparkles, Camera, Keyboard, Mail, CheckCircle2,
  Paperclip, Shield, Info, Globe, X, Clock,
} from 'lucide-react';
import { Query, ID } from 'appwrite';
import { getFilePreviewUrl } from '../utils/storage';
import SupplierInvoiceImportModal from '../components/SupplierInvoiceImportModal';

// 🛡️ Import du treasuryGuard
import { createTreasuryMovement } from '../utils/treasuryGuard';

// 🔐 RLS centralisé
import { getTeamPermissions } from '../utils/rowLevelPermissions';

// 📎 Module justification des dépenses
import JustificationModal, { JustifiableExpense } from '../components/JustificationModal';

// 🌍 REGISTRE INTERNATIONAL DES PAYS
import {
  COUNTRIES, FALLBACK_COUNTRY, getCountryConfig, getPrimaryIdentifier,
  validateIdentifier, validateVatNumber, listCountryOptions,
  type CountryConfig, type IdentifierConfig,
} from '../config/countries';

// ============================================================
// 📐 INTERFACES
// ============================================================
interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface ReceivedInvoice {
  $id: string;
  teamId: string;
  invoiceNumber: string;
  supplierName: string;
  supplierSiret?: string;
  supplierEmail?: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  tax: number;
  subtotal: number;
  currencyCode: string;
  status: 'received' | 'pending' | 'validated' | 'partial' | 'paid' | 'rejected' | 'archived';
  format?: string;
  pdfFileId?: string;
  xmlContent?: string;
  rejectionReason?: string;
  type?: '380' | '381';
  $createdAt: string;
  paidAt?: string;
  archivedAt?: string;
  paymentDate?: string;
  paymentMethod?: string;
  paymentReference?: string;
  paidAmount?: number;
  payments?: string | Payment[];
  source?: 'manual_upload' | 'photo_ocr' | 'email' | 'ppf_pull' | 'manual_entry';
  originalFileId?: string;
  ocrConfidence?: number;
  isElectronic?: boolean;
  einvoiceStatus?: 'received' | 'deposited' | 'transmitted' | 'accepted' | 'refused' | 'paid';
  supplierType?: 'entreprise' | 'particulier';
  supplierSiren?: string;
  supplierVatNumber?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierPostalCode?: string;
  supplierCity?: string;
  supplierCountry?: string;
  items?: string;
  paymentConditions?: string;
  paymentMethods?: string;
  vatRate?: number;
  supplierSecondaryId?: string;
}

interface ImportResult {
  invoiceId: string;
  invoiceNumber: string;
  fileId?: string;
  bucketId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  amount?: number;
  supplierName?: string;
  issueDate?: string;
  supplierCountry?: string;
  supplierRegistrationId?: string;
  supplierVatNumber?: string;
  supplierSecondaryId?: string;
}

// ✅ Statuts de validation
type JustificationStatus = 'validated' | 'rejected' | 'pending' | 'none';

interface JustificationSummary {
  count: number;
  validatedCount: number;
  rejectedCount: number;
  pendingCount: number;
  status: JustificationStatus;
}

const ITEMS_PER_PAGE = 10;

// ============================================================
// 🏷️ LIBELLÉS SOURCE
// ============================================================
const sourceLabels: Record<string, { label: string; icon: any; tone: string }> = {
  manual_upload: { label: '📤 Fichier', icon: Upload, tone: 'blue' },
  photo_ocr:     { label: '📷 OCR',     icon: Sparkles, tone: 'violet' },
  manual_entry:  { label: '⌨️ Manuel',  icon: Keyboard, tone: 'slate' },
  email:         { label: '✉️ Email',   icon: Mail, tone: 'amber' },
  ppf_pull:      { label: '⚡ PPF',     icon: Camera, tone: 'emerald' },
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  'Virement bancaire': 'bank_transfer',
  'Chèque': 'check',
  'Carte bancaire': 'credit_card',
  'Prélèvement SEPA': 'sepa_direct_debit',
  'Espèces': 'cash',
};

// 🌍 Mapping préfixe TVA → Code pays
const VAT_PREFIX_TO_COUNTRY: Record<string, string> = {
  FR: 'FR', DE: 'DE', BE: 'BE', IT: 'IT', ES: 'ES', NL: 'NL',
  AT: 'AT', PT: 'PT', LU: 'LU', IE: 'IE', FI: 'FI', SE: 'SE',
  DK: 'DK', PL: 'PL', CZ: 'CZ', SK: 'SK', HU: 'HU', RO: 'RO',
  BG: 'BG', HR: 'HR', SI: 'SI', LT: 'LT', LV: 'LV', EE: 'EE',
  MT: 'MT', CY: 'CY', GB: 'GB', CH: 'CH', EL: 'GR',
};

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function ReceivedInvoices() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { fm, currency, currencyConfig } = useCompanySettings();
  const { customTeamId, appwriteTeamId } = useTeam();
  const navigate = useNavigate();

  // ============================================================
  // 📦 ÉTATS
  // ============================================================
  const [invoices, setInvoices] = useState<ReceivedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [search, setSearch] = useState('');
  const [collectionMissing, setCollectionMissing] = useState(false);
  const [statusTab, setStatusTab] = useState<'all' | 'validated' | 'paid' | 'partial' | 'pending' | 'rejected' | 'archived'>('all');
  const [filterFormat, setFilterFormat] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterCountry, setFilterCountry] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [invoiceToPay, setInvoiceToPay] = useState<ReceivedInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Virement bancaire',
    reference: '',
  });

  const [justificationStatuses, setJustificationStatuses] = useState<Record<string, JustificationSummary>>({});
  
  const [showJustifModal, setShowJustifModal] = useState(false);
  const [justifExpense, setJustifExpense] = useState<JustifiableExpense | null>(null);
  const [selectedInvoiceForInfo, setSelectedInvoiceForInfo] = useState<ReceivedInvoice | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

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
        if (res.documents.length > 0) {
          setCompanySettings(res.documents[0]);
        }
      } catch (e) {
        console.warn('⚠️ Impossible de charger les paramètres entreprise:', e);
      }
    })();
  }, [customTeamId, user]);

  const companyCountry = companySettings?.country || 'FR';
  const companyConfig: CountryConfig = useMemo(
    () => getCountryConfig(companyCountry),
    [companyCountry]
  );
  const companyIdLabel = useMemo(
    () => getPrimaryIdentifier(companyConfig)?.shortLabel || 'ID',
    [companyConfig]
  );
  const isFrenchEInvoiceRegime = companyCountry === 'FR';

  // ============================================================
  // 🌍 HELPERS PAYS FOURNISSEUR
  // ============================================================
  const detectCountryFromInvoice = (inv: ReceivedInvoice): string => {
    if (inv.supplierCountry && inv.supplierCountry.trim()) {
      return inv.supplierCountry;
    }
    if (inv.supplierVatNumber && inv.supplierVatNumber.trim()) {
      const prefix = inv.supplierVatNumber.substring(0, 2).toUpperCase();
      if (VAT_PREFIX_TO_COUNTRY[prefix]) {
        return VAT_PREFIX_TO_COUNTRY[prefix];
      }
    }
    return 'FR';
  };

  const getSupplierConfig = (inv: ReceivedInvoice): CountryConfig => {
    const countryCode = detectCountryFromInvoice(inv);
    return getCountryConfig(countryCode) || FALLBACK_COUNTRY;
  };

  const getSupplierIdLabel = (inv: ReceivedInvoice): string => {
    const config = getSupplierConfig(inv);
    const primary = getPrimaryIdentifier(config);
    return primary?.shortLabel || 'ID';
  };

  const validateSupplierId = (inv: ReceivedInvoice): boolean => {
    if (!inv.supplierSiret || !inv.supplierSiret.trim()) return false;
    const config = getSupplierConfig(inv);
    const primary = getPrimaryIdentifier(config);
    if (!primary?.pattern) {
      return inv.supplierSiret.trim().length > 0;
    }
    return validateIdentifier(primary, inv.supplierSiret);
  };

  const validateSupplierVat = (inv: ReceivedInvoice): boolean => {
    if (!inv.supplierVatNumber || !inv.supplierVatNumber.trim()) return false;
    const config = getSupplierConfig(inv);
    if (!config.vat?.pattern) {
      return inv.supplierVatNumber.trim().length > 0;
    }
    return validateVatNumber(config, inv.supplierVatNumber);
  };

  const getRetentionYears = (inv: ReceivedInvoice): number => {
    const config = getSupplierConfig(inv);
    return config.retentionYears || 6;
  };

  const evaluateJustificationStatus = (invoiceId: string): JustificationSummary => {
    return justificationStatuses[invoiceId] || {
      count: 0,
      validatedCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
      status: 'none',
    };
  };

  const supplierCountries = useMemo(() => {
    const countries = new Set<string>();
    invoices.forEach(inv => {
      const detected = detectCountryFromInvoice(inv);
      if (detected) countries.add(detected);
    });
    return Array.from(countries).sort();
  }, [invoices]);

  // ============================================================
  // ⌨️ RACCOURCIS CLAVIER
  // ============================================================
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

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) return;
    if (!customTeamId) return;
    loadTeamAndInvoices();
  }, [user, customTeamId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusTab, filterFormat, filterType, filterSource, filterCountry]);

  // ============================================================
  // 📎 CHARGEMENT DES STATUTS DE JUSTIFICATIFS
  // ============================================================
  const loadJustificationStatuses = async (teamId: string, ids: string[]) => {
    if (ids.length === 0) { setJustificationStatuses({}); return; }
    
    const statuses: Record<string, JustificationSummary> = {};
    const CHUNK = 100;
    
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
          Query.equal('teamId', teamId),
          Query.equal('expenseId', chunk),
          Query.limit(500),
        ]);
        
        res.documents.forEach((j: any) => {
          const invId = j.expenseId;
          if (!statuses[invId]) {
            statuses[invId] = {
              count: 0,
              validatedCount: 0,
              rejectedCount: 0,
              pendingCount: 0,
              status: 'none',
            };
          }
          
          statuses[invId].count++;
          
          const validationStatus = j.validationStatus || 'pending';
          if (validationStatus === 'validated') {
            statuses[invId].validatedCount++;
          } else if (validationStatus === 'rejected') {
            statuses[invId].rejectedCount++;
          } else {
            statuses[invId].pendingCount++;
          }
        });
      } catch (e) {
        console.warn(`⚠️ Erreur chargement justificatifs chunk ${i}:`, e);
      }
    }
    
    Object.keys(statuses).forEach(invId => {
      const s = statuses[invId];
      if (s.validatedCount > 0) {
        s.status = 'validated';
      } else if (s.rejectedCount > 0 && s.pendingCount === 0) {
        s.status = 'rejected';
      } else if (s.pendingCount > 0 || s.rejectedCount > 0) {
        s.status = 'pending';
      } else {
        s.status = 'none';
      }
    });
    
    setJustificationStatuses(statuses);
  };

  // ============================================================
  // 🔄 CHARGEMENT + MIGRATION AUTOMATIQUE DU PAYS
  // ============================================================
  const loadTeamAndInvoices = async () => {
    try {
      setLoading(true);
      const teamId = customTeamId;
      if (!teamId) {
        console.warn('⚠️ ReceivedInvoices: customTeamId non résolu');
        setLoading(false);
        return;
      }
      setCurrentTeamId(teamId);

      try {
        const res = await databases.listDocuments(DATABASE_ID, 'received_invoices', [
          Query.equal('teamId', teamId),
          Query.orderDesc('$createdAt'),
          Query.limit(500),
        ]);
        const docs = res.documents as unknown as ReceivedInvoice[];
        
        const needsMigration = docs.filter(d => !d.supplierCountry || !d.supplierCountry.trim());
        if (needsMigration.length > 0 && appwriteTeamId) {
          console.log(`🌍 Migration de ${needsMigration.length} facture(s) sans pays fournisseur...`);
          
          for (const inv of needsMigration) {
            try {
              let detectedCountry = 'FR';
              
              if (inv.supplierVatNumber && inv.supplierVatNumber.trim()) {
                const prefix = inv.supplierVatNumber.substring(0, 2).toUpperCase();
                if (VAT_PREFIX_TO_COUNTRY[prefix]) {
                  detectedCountry = VAT_PREFIX_TO_COUNTRY[prefix];
                }
              }
              
              await databases.updateDocument(
                DATABASE_ID,
                'received_invoices',
                inv.$id,
                { supplierCountry: detectedCountry },
                getTeamPermissions(appwriteTeamId)
              );
              
              const idx = docs.findIndex(d => d.$id === inv.$id);
              if (idx >= 0) {
                docs[idx] = { ...docs[idx], supplierCountry: detectedCountry };
              }
            } catch (e) {
              console.warn(`⚠️ Migration échouée pour ${inv.$id}:`, e);
            }
          }
        }
        
        setInvoices(docs);
        setCollectionMissing(false);

        try {
          await loadJustificationStatuses(teamId, docs.map(d => d.$id));
        } catch (jErr) {
          console.warn('⚠️ Justificatifs non chargés:', jErr);
          setJustificationStatuses({});
        }
      } catch (dbError: any) {
        if (dbError?.code === 404 || dbError?.message?.includes('could not be found')) {
          setCollectionMissing(true);
          setInvoices([]);
          setJustificationStatuses({});
        } else {
          throw dbError;
        }
      }
    } catch (e: any) {
      toast.error('Erreur chargement : ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🧮 HELPERS MONTANTS
  // ============================================================
  const getPaidAmount = (inv: ReceivedInvoice): number => {
    let payments: Payment[] = [];
    try {
      if (typeof inv.payments === 'string' && inv.payments.trim()) {
        payments = JSON.parse(inv.payments);
      } else if (Array.isArray(inv.payments)) {
        payments = inv.payments;
      }
    } catch (e) {
      payments = [];
    }
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const getRemainingAmount = (inv: ReceivedInvoice): number => {
    const paid = getPaidAmount(inv);
    return Math.max(0, (inv.total || 0) - paid);
  };

  const isFullyPaid = (inv: ReceivedInvoice): boolean => getRemainingAmount(inv) <= 0.01;

  // ============================================================
  // 💰 PAIEMENT
  // ============================================================
  const handleMarkPaid = (inv: ReceivedInvoice) => {
    const remaining = getRemainingAmount(inv);
    setInvoiceToPay(inv);
    setPaymentForm({
      amount: remaining.toFixed(2),
      date: new Date().toISOString().split('T')[0],
      method: 'Virement bancaire',
      reference: '',
    });
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!invoiceToPay || !currentTeamId || !appwriteTeamId || !user) return;
    const amount = parseFloat(paymentForm.amount);
    const remaining = getRemainingAmount(invoiceToPay);

    if (!amount || amount <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (amount > remaining + 0.01) {
      toast.warning('Montant invalide', {
        description: `Le montant saisi (${fm(amount)}) est supérieur au reste à payer (${fm(remaining)}).`,
      });
      return;
    }

    try {
      let existingPayments: Payment[] = [];
      try {
        if (typeof invoiceToPay.payments === 'string' && invoiceToPay.payments.trim()) {
          existingPayments = JSON.parse(invoiceToPay.payments);
        } else if (Array.isArray(invoiceToPay.payments)) {
          existingPayments = invoiceToPay.payments;
        }
      } catch (e) {
        existingPayments = [];
      }

      const newPayment: Payment = {
        id: Date.now().toString(),
        amount,
        date: paymentForm.date,
        method: paymentForm.method,
        reference: paymentForm.reference || '',
      };
      const updatedPayments = [...existingPayments, newPayment];
      const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
      const newRemaining = Math.max(0, (invoiceToPay.total || 0) - totalPaid);
      const newStatus = newRemaining <= 0.01 ? 'paid' : 'partial';

      await databases.updateDocument(
        DATABASE_ID,
        'received_invoices',
        invoiceToPay.$id,
        {
          status: newStatus,
          paidAmount: totalPaid,
          payments: JSON.stringify(updatedPayments),
          paidAt: newRemaining <= 0.01 ? new Date().toISOString() : invoiceToPay.paidAt,
          einvoiceStatus: invoiceToPay.isElectronic
            ? (newRemaining <= 0.01 ? 'paid' : invoiceToPay.einvoiceStatus)
            : invoiceToPay.einvoiceStatus,
        },
        getTeamPermissions(appwriteTeamId)
      );

      const movementResult = await createTreasuryMovement({
        teamId: currentTeamId,
        appwriteTeamId,
        userId: user.$id,
        type: 'out',
        category: 'supplier_payment',
        amount,
        date: paymentForm.date,
        method: PAYMENT_METHOD_MAP[paymentForm.method] || 'other',
        description: `Paiement facture ${invoiceToPay.invoiceNumber} — ${invoiceToPay.supplierName}`.trim(),
        counterpartyName: invoiceToPay.supplierName || null,
        linkedReceivedInvoiceId: invoiceToPay.$id,
        reference: paymentForm.reference || null,
      });

      if (!movementResult.success) {
        console.warn('⚠️ Mouvement trésorerie non créé :', movementResult.error);
      } else if (!movementResult.created) {
        console.warn('⚠️ Paiement fournisseur déjà tracé en trésorerie (doublon ignoré).');
      }

      try {
        await databases.createDocument(DATABASE_ID, 'supplier_payments', ID.unique(), {
          teamId: currentTeamId,
          invoiceId: invoiceToPay.$id,
          invoiceNumber: invoiceToPay.invoiceNumber,
          supplierName: invoiceToPay.supplierName,
          amount,
          paymentDate: paymentForm.date,
          method: paymentForm.method,
          reference: paymentForm.reference || '',
          createdBy: user?.$id,
          createdAt: new Date().toISOString(),
        }, getTeamPermissions(appwriteTeamId));
      } catch (eventError) {
        console.warn('⚠️ Événement comptable non tracé:', eventError);
      }

      setShowPaymentModal(false);
      setInvoiceToPay(null);
      await loadTeamAndInvoices();

      if (newStatus === 'paid') {
        toast.success(`Facture ${invoiceToPay.invoiceNumber} entièrement payée`, {
          description: `Décaissement de ${fm(amount)} enregistré en trésorerie`,
        });
      } else {
        toast.success(`Paiement de ${fm(amount)} enregistré`, {
          description: `Reste à payer : ${fm(newRemaining)} • Trésorerie mise à jour`,
        });
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  // ============================================================
  // 👁️ ACTIONS DOCUMENT — VERSION ROBUSTE MULTI-BUCKETS
  // ============================================================
  const handleViewPdf = async (inv: ReceivedInvoice) => {
    const fileId = inv.originalFileId || inv.pdfFileId;

    if (!fileId) {
      toast.warning('Aucun document disponible pour cette facture');
      return;
    }

    // ✅ Buckets à tester par ordre de priorité (dédupliqués)
    const preferredBucket = (inv as any).bucketId || 'documents';
    const bucketsToTry = [preferredBucket, 'documents', 'justifications', 'expense-receipts']
      .filter((v, i, a) => a.indexOf(v) === i);

    for (const bucketId of bucketsToTry) {
      try {
        // Vérifier l'existence du fichier
        await storage.getFile(bucketId, fileId);

        // ✅ getFileView() = fichier ORIGINAL avec bon Content-Type
        // → PDF s'affiche dans le viewer natif du navigateur
        // → Images s'affichent directement
        const url = storage.getFileView(bucketId, fileId).toString();

        window.open(url, '_blank', 'noopener,noreferrer');

        // Mettre à jour le bucketId si trouvé dans un autre bucket
        if (bucketId !== preferredBucket && appwriteTeamId) {
          try {
            await databases.updateDocument(
              DATABASE_ID,
              'received_invoices',
              inv.$id,
              { bucketId },
              getTeamPermissions(appwriteTeamId)
            );
            console.log(`🔄 bucketId corrigé pour ${inv.invoiceNumber}: ${preferredBucket} → ${bucketId}`);
          } catch {}
        }
        return;
      } catch (e: any) {
        if (e.code === 404) continue; // Pas dans ce bucket, essayer le suivant
        if (e.code === 401) {
          toast.error('🔒 Accès refusé au document', {
            description: `Permissions insuffisantes sur le bucket "${bucketId}". Vérifiez Appwrite Console → Storage → ${bucketId} → Permissions (ajoutez Any: Read).`,
            duration: 8000,
          });
          return;
        }
        console.warn(`⚠️ Erreur bucket ${bucketId}:`, e.message);
      }
    }

    toast.error('📁 Document introuvable', {
      description: `Le fichier de la facture ${inv.invoiceNumber} n'existe dans aucun bucket (${bucketsToTry.join(', ')}).`,
      duration: 8000,
    });
  };

  const handleOpenJustifications = (inv: ReceivedInvoice) => {
    setJustifExpense({
      type: 'supplier_invoice',
      id: inv.$id,
      number: inv.invoiceNumber,
      label: inv.supplierName,
      amount: inv.total || 0,
      date: inv.issueDate,
    });
    setShowJustifModal(true);
  };

  // ============================================================
  // 📎 AUTO-ATTACHEMENT DU JUSTIFICATIF APRÈS IMPORT
  // ============================================================
  const handleImportSuccess = async (result: ImportResult) => {
    setShowUploadModal(false);

    if (result.invoiceId && currentTeamId && appwriteTeamId) {
      try {
        await databases.updateDocument(
          DATABASE_ID,
          'received_invoices',
          result.invoiceId,
          {
            supplierCountry: result.supplierCountry || 'FR',
            supplierSiret: result.supplierRegistrationId || undefined,
            supplierVatNumber: result.supplierVatNumber || undefined,
            supplierSecondaryId: result.supplierSecondaryId || undefined,
          },
          getTeamPermissions(appwriteTeamId)
        );
      } catch (e) {
        console.warn('⚠️ Impossible de mettre à jour le pays fournisseur:', e);
      }
    }

    await loadTeamAndInvoices();

    if (
      result?.fileId &&
      result?.invoiceId &&
      currentTeamId &&
      user &&
      appwriteTeamId
    ) {
      try {
        const existingCheck = await databases.listDocuments(
          DATABASE_ID,
          'expense_justifications',
          [
            Query.equal('teamId', currentTeamId),
            Query.equal('expenseId', result.invoiceId),
            Query.equal('fileId', result.fileId),
            Query.limit(1),
          ]
        );

        if (existingCheck.documents.length > 0) {
          console.log('ℹ️ Justificatif déjà attaché, doublon ignoré');
          toast.success(`Facture ${result.invoiceNumber} importée`);
          return;
        }

        await databases.createDocument(
          DATABASE_ID,
          'expense_justifications',
          ID.unique(),
          {
            teamId: currentTeamId,
            expenseType: 'supplier_invoice',
            expenseId: result.invoiceId,
            expenseNumber: result.invoiceNumber || '',
            fileId: result.fileId,
            bucketId: result.bucketId || 'documents',
            fileName: result.fileName || `Facture ${result.invoiceNumber}`,
            fileType: result.fileType || 'application/pdf',
            fileSize: result.fileSize || 0,
            amount: result.amount || 0,
            uploadedBy: user.$id,
            uploadedAt: new Date().toISOString(),
            autoGenerated: true,
            detectedCountry: result.supplierCountry || null,
            validationStatus: 'pending',
          },
          getTeamPermissions(appwriteTeamId)
        );

        await loadJustificationStatuses(currentTeamId, [result.invoiceId]);

        const detectedConfig = getCountryConfig(result.supplierCountry);
        const detectedLabel = getPrimaryIdentifier(detectedConfig)?.shortLabel || 'ID';

        toast.success(`✅ Facture ${result.invoiceNumber} importée`, {
          description: result.supplierCountry
            ? `${detectedConfig.flag} ${detectedConfig.name} • ${detectedLabel} : ${result.supplierRegistrationId || 'à saisir'} • À valider`
            : 'Justificatif attaché automatiquement • À valider',
          duration: 5000,
        });
      } catch (justifError: any) {
        console.warn('⚠️ Justificatif auto non créé:', justifError);
        toast.success(`Facture ${result.invoiceNumber} importée`, {
          description: '⚠️ Justificatif à attacher manuellement',
        });
      }
    } else {
      toast.success(
        result?.invoiceNumber
          ? `Facture ${result.invoiceNumber} créée`
          : 'Facture importée'
      );
    }
  };

  const handleRejectInvoice = async (inv: ReceivedInvoice) => {
    if (!currentTeamId) return;
    const reason = prompt(`Motif du rejet de la facture ${inv.invoiceNumber} :`);
    if (!reason) return;
    try {
      await databases.updateDocument(
        DATABASE_ID,
        'received_invoices',
        inv.$id,
        { status: 'rejected', rejectionReason: reason },
        getTeamPermissions(appwriteTeamId)
      );
      await loadTeamAndInvoices();
      toast.warning(`Facture ${inv.invoiceNumber} rejetée`);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  const handleArchive = async (inv: ReceivedInvoice) => {
    if (!currentTeamId) return;
    if (!confirm(`Archiver la facture ${inv.invoiceNumber} ?`)) return;
    try {
      await databases.updateDocument(
        DATABASE_ID,
        'received_invoices',
        inv.$id,
        { status: 'archived', archivedAt: new Date().toISOString() },
        getTeamPermissions(appwriteTeamId)
      );
      await loadTeamAndInvoices();
      toast.success(`Facture ${inv.invoiceNumber} archivée`);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  const handleUnarchive = async (inv: ReceivedInvoice) => {
    if (!currentTeamId) return;
    try {
      await databases.updateDocument(
        DATABASE_ID,
        'received_invoices',
        inv.$id,
        { status: 'validated', archivedAt: null },
        getTeamPermissions(appwriteTeamId)
      );
      await loadTeamAndInvoices();
      toast.success(`Facture ${inv.invoiceNumber} restaurée`);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  // ============================================================
  // 🎯 FILTRAGE
  // ============================================================
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const matchSearch = !search ||
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        (inv.supplierSiret || '').toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        statusTab === 'all' ? inv.status !== 'archived' :
        statusTab === 'validated' ? inv.status === 'validated' :
        statusTab === 'paid' ? inv.status === 'paid' :
        statusTab === 'partial' ? inv.status === 'partial' :
        statusTab === 'pending' ? inv.status === 'pending' :
        statusTab === 'rejected' ? inv.status === 'rejected' :
        statusTab === 'archived' ? inv.status === 'archived' :
        true;

      const matchFormat = filterFormat === 'all' || (inv.format || '').toLowerCase() === filterFormat;
      const matchType = filterType === 'all' || inv.type === filterType;
      const matchSource = filterSource === 'all' || (inv.source || 'manual_upload') === filterSource;
      const detectedCountry = detectCountryFromInvoice(inv);
      const matchCountry = filterCountry === 'all' || detectedCountry === filterCountry;

      return matchSearch && matchStatus && matchFormat && matchType && matchSource && matchCountry;
    });
  }, [invoices, search, statusTab, filterFormat, filterType, filterSource, filterCountry]);

  const statusTabs = [
    { key: 'all', label: 'Toutes', count: invoices.filter(i => i.status !== 'archived').length },
    { key: 'validated', label: '✅ Validées', count: invoices.filter(i => i.status === 'validated').length },
    { key: 'partial', label: '💳 Partielles', count: invoices.filter(i => i.status === 'partial').length },
    { key: 'paid', label: '💰 Payées', count: invoices.filter(i => i.status === 'paid').length },
    { key: 'pending', label: '⏳ À valider', count: invoices.filter(i => i.status === 'pending').length },
    { key: 'rejected', label: '❌ Rejetées', count: invoices.filter(i => i.status === 'rejected').length },
    { key: 'archived', label: '🗃️ Archivées', count: invoices.filter(i => i.status === 'archived').length },
  ];

  // ============================================================
  // 🧮 KPIs
  // ============================================================
  const activeInvoices = invoices.filter(i => i.status !== 'archived');
  const creditCount = activeInvoices.filter(i => i.type === '381').length;
  const totalAll = activeInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

  const partialInvoices = activeInvoices.filter(i => i.status === 'partial');
  const validatedInvoices = activeInvoices.filter(i => i.status === 'validated');
  const paidInvoices = activeInvoices.filter(i => i.status === 'paid');
  const rejectedInvoices = activeInvoices.filter(i => i.status === 'rejected');

  const partialPaidAmount = partialInvoices.reduce((sum, i) => sum + getPaidAmount(i), 0);
  const partialRemainingAmount = partialInvoices.reduce((sum, i) => sum + getRemainingAmount(i), 0);

  const totalActuallyPaid = paidInvoices.reduce((sum, i) => sum + (i.total || 0), 0) + partialPaidAmount;
  const totalRemainingToPay = validatedInvoices.reduce((sum, i) => sum + (i.total || 0), 0) + partialRemainingAmount;

  const missingJustifications = useMemo(() =>
    activeInvoices.filter(i => justificationStatuses[i.$id]?.count === 0 || !justificationStatuses[i.$id]).length,
    [activeInvoices, justificationStatuses]
  );

  const validatedJustifications = useMemo(() =>
    activeInvoices.filter(i => justificationStatuses[i.$id]?.status === 'validated').length,
    [activeInvoices, justificationStatuses]
  );

  const pendingJustifications = useMemo(() =>
    activeInvoices.filter(i => justificationStatuses[i.$id]?.status === 'pending').length,
    [activeInvoices, justificationStatuses]
  );

  const rejectedJustifications = useMemo(() =>
    activeInvoices.filter(i => justificationStatuses[i.$id]?.status === 'rejected').length,
    [activeInvoices, justificationStatuses]
  );

  const upcomingPayments30d = useMemo(() => {
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    return activeInvoices
      .filter(i => {
        if (i.status === 'paid' || i.status === 'rejected' || i.status === 'archived') return false;
        const remaining = getRemainingAmount(i);
        if (remaining <= 0) return false;
        const dueDate = i.dueDate ? new Date(i.dueDate) : new Date(i.issueDate);
        return dueDate <= in30Days;
      })
      .reduce((sum, i) => sum + getRemainingAmount(i), 0);
  }, [activeInvoices]);

  const filteredValidatedRemaining = filtered
    .filter(i => i.status === 'validated')
    .reduce((s, i) => s + getRemainingAmount(i), 0);
  const filteredPartialPaid = filtered
    .filter(i => i.status === 'partial')
    .reduce((s, i) => s + getPaidAmount(i), 0);
  const filteredPaid = filtered
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + (i.total || 0), 0);
  const filteredTotal = filtered.reduce((s, i) => s + (i.total || 0), 0);
  const filteredMissingJustif = filtered.filter(i => justificationStatuses[i.$id]?.count === 0 || !justificationStatuses[i.$id]).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedInvoices = filtered.slice(startIndex, endIndex);

  const statusMap: Record<string, { label: string; tone: any }> = {
    received: { label: 'Reçue', tone: 'slate' },
    pending: { label: 'À valider', tone: 'amber' },
    validated: { label: 'Validée', tone: 'emerald' },
    partial: { label: 'Partielle', tone: 'orange' },
    rejected: { label: 'Rejetée', tone: 'rose' },
    paid: { label: 'Payée', tone: 'sky' },
    archived: { label: 'Archivée', tone: 'slate' },
  };

  if (permLoading) return <Sidebar><div className="p-8 text-slate-500">Chargement...</div></Sidebar>;

  // ============================================================
  // 🎨 RENDU JSX
  // ============================================================
  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Receipt}
          iconColor="emerald"
          title="Factures reçues"
          description={
            <>
              <span className="font-semibold tabular-nums">{filtered.length}</span>
              {' '}facture(s) fournisseur(s) • {supplierCountries.length} pays
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2.5 rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/30 active:scale-95"
            >
              <Upload size={18} /> Importer une facture
            </button>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {collectionMissing && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Configuration requise</p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                  La collection <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded text-xs">received_invoices</code> n'existe pas encore dans Appwrite.
                </p>
              </div>
            </div>
          )}

          {!loading && (missingJustifications > 0 || pendingJustifications > 0 || rejectedJustifications > 0) && (
            <div className="mb-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex items-start gap-3">
              <AlertCircle size={16} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-800 dark:text-rose-200 space-y-1">
                {missingJustifications > 0 && (
                  <p>
                    <strong>{missingJustifications} dépense(s) sans justificatif</strong> — attachez la pièce comptable.
                  </p>
                )}
                {pendingJustifications > 0 && (
                  <p>
                    <strong>{pendingJustifications} justificatif(s) à valider</strong> — ouvrez et confirmez la conformité.
                  </p>
                )}
                {rejectedJustifications > 0 && (
                  <p>
                    <strong>{rejectedJustifications} justificatif(s) rejeté(s)</strong> — corrigez ou remplacez.
                  </p>
                )}
                <p className="text-[11px] text-rose-600 dark:text-rose-300">
                  📅 Conservation : {companyConfig.retentionYears} ans (selon pays de votre entreprise)
                </p>
              </div>
            </div>
          )}

          <KPIGrid columns={6}>
            <StatCell
              label="Total reçu"
              value={activeInvoices.length.toString()}
              sublabel={`${creditCount} avoir(s) • ${fm(totalAll)}`}
              trend={0}
            />
            <StatCell
              label="À payer (dette)"
              value={fm(totalRemainingToPay)}
              sublabel={`${validatedInvoices.length + partialInvoices.length} facture(s) ouverte(s)`}
              trend={totalRemainingToPay > 0 ? -1 : 0}
            />
            <StatCell
              label="Sorties 30j prévues"
              value={fm(upcomingPayments30d)}
              sublabel="Prévisionnel à échéance"
              trend={upcomingPayments30d > 0 ? -1 : 0}
            />
            <StatCell
              label="Partielles (versé)"
              value={fm(partialPaidAmount)}
              sublabel={`${partialInvoices.length} facture(s) • Reste : ${fm(partialRemainingAmount)}`}
              trend={partialInvoices.length > 0 ? 1 : 0}
            />
            <StatCell
              label="Déjà décaissé"
              value={fm(totalActuallyPaid)}
              sublabel={`${paidInvoices.length} facture(s) soldée(s)`}
              trend={0}
            />
            <StatCell
              label="Justificatifs validés"
              value={validatedJustifications.toString()}
              sublabel={`Sur ${activeInvoices.length} facture(s) active(s)`}
              trend={validatedJustifications > 0 ? 1 : 0}
            />
          </KPIGrid>

          <Card className="mb-6 mt-6">
            <SectionTitle>Sur la liste affichée</SectionTitle>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">À payer (reste)</p>
                <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">{fm(filteredValidatedRemaining)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Partielles (versé)</p>
                <p className="text-sm font-bold text-orange-600 dark:text-orange-400 mt-1">{fm(filteredPartialPaid)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Payées</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">{fm(filteredPaid)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Total affiché</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{fm(filteredTotal)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Conformité justificatifs</p>
              {filteredMissingJustif === 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={12} /> Toutes les dépenses affichées ont un justificatif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
                  <AlertCircle size={12} /> {filteredMissingJustif} sans justificatif
                </span>
              )}
            </div>
          </Card>

          <TypeTabs
            tabs={statusTabs}
            activeTab={statusTab}
            onTabChange={(key) => setStatusTab(key as any)}
            color="emerald"
          />

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder={`Rechercher (N°, fournisseur, ${companyIdLabel}...)`}
              inputRef={searchInputRef}
            />
            <SelectFilter
              value={filterCountry}
              onChange={setFilterCountry}
              options={[
                { value: 'all', label: '🌍 Tous pays' },
                ...supplierCountries.map(code => {
                  const cfg = getCountryConfig(code);
                  return { value: code, label: `${cfg.flag} ${cfg.name}` };
                }),
              ]}
              placeholder="Tous pays"
            />
            <SelectFilter
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: '380', label: '📄 Factures' },
                { value: '381', label: '⚡ Avoirs' },
              ]}
              placeholder="Tous types"
            />
            <SelectFilter
              value={filterFormat}
              onChange={setFilterFormat}
              options={[
                { value: 'factur-x', label: 'Factur-X' },
                { value: 'cii', label: 'CII' },
                { value: 'ubl', label: 'UBL' },
                { value: 'pdf', label: 'PDF simple' },
                { value: 'photo', label: '📷 Photo OCR' },
                { value: 'manual', label: '⌨️ Manuel' },
              ]}
              placeholder="Tous formats"
            />
            <SelectFilter
              value={filterSource}
              onChange={setFilterSource}
              options={[
                { value: 'manual_upload', label: '📤 Fichier' },
                { value: 'photo_ocr', label: '📷 OCR' },
                { value: 'manual_entry', label: '⌨️ Manuel' },
              ]}
              placeholder="Toutes sources"
            />
          </div>

          {loading ? (
            <>
              <DataTable loading={true}><></></DataTable>
              <div className="md:hidden space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />)}
              </div>
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={`Aucune facture ${statusTab !== 'all' ? `dans "${statusTabs.find(t => t.key === statusTab)?.label || statusTab}"` : 'reçue'}`}
              description={!collectionMissing ? "Importez votre première facture fournisseur" : undefined}
              tone="emerald"
              action={
                !collectionMissing ? (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm mt-4 active:scale-95 transition-transform"
                  >
                    <Upload size={16} /><span>Importer une facture</span>
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <DataTable
                headers={[
                  { label: 'Source', align: 'left' },
                  { label: 'Type', align: 'left' },
                  { label: 'N° Facture', align: 'left' },
                  { label: 'Fournisseur', align: 'left' },
                  { label: 'Date', align: 'left' },
                  { label: 'Échéance', align: 'left' },
                  { label: 'Total TTC', align: 'right' },
                  { label: 'Payé', align: 'right' },
                  { label: 'Reste', align: 'right' },
                  { label: 'Justif.', align: 'center' },
                  { label: 'Statut', align: 'left' },
                  { label: '', align: 'right', width: 'w-12' },
                ]}
              >
                {paginatedInvoices.map(inv => {
                  const isCredit = inv.type === '381';
                  const paid = getPaidAmount(inv);
                  const remaining = getRemainingAmount(inv);
                  const fullyPaid = remaining <= 0.01;
                  const isRejected = inv.status === 'rejected';
                  const src = sourceLabels[inv.source || 'manual_upload'];
                  const justifSummary = evaluateJustificationStatus(inv.$id);

                  const supplierCfg = getSupplierConfig(inv);
                  const supplierIdLabel = getSupplierIdLabel(inv);
                  const isIdValid = validateSupplierId(inv);
                  const isVatValid = inv.supplierVatNumber ? validateSupplierVat(inv) : true;

                  return (
                    <tr
                      key={inv.$id}
                      className={`group transition-colors relative ${
                        isRejected
                          ? 'bg-rose-50/80 hover:bg-rose-100/80 dark:bg-rose-900/15 dark:hover:bg-rose-900/25'
                          : justifSummary.status === 'none'
                          ? 'bg-slate-50/60 hover:bg-slate-50/80 dark:bg-slate-800/50 dark:hover:bg-slate-700/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5">
                          <Badge tone={src.tone as any}>
                            <src.icon size={10} className="mr-1" /> {src.label}
                          </Badge>
                          {inv.source === 'photo_ocr' && inv.ocrConfidence != null && (
                            <span className="text-[10px] text-violet-600 dark:text-violet-400">
                              {(inv.ocrConfidence * 100).toFixed(0)}% confiance
                            </span>
                          )}
                          {inv.isElectronic && inv.einvoiceStatus && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400">⚡ {inv.einvoiceStatus}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {isCredit ? (
                          <Badge tone="rose"><FileMinus size={10} className="mr-1" /> Avoir</Badge>
                        ) : (
                          <Badge tone="blue"><FileText size={10} className="mr-1" /> Facture</Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{inv.supplierName}</span>
                            <span className="text-xs" title={supplierCfg.name}>
                              {supplierCfg.flag}
                            </span>
                          </div>
                          {inv.supplierSiret && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[11px] ${isIdValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isIdValid ? '✓' : '✗'}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {supplierIdLabel} : {inv.supplierSiret}
                              </span>
                            </div>
                          )}
                          {inv.supplierVatNumber && supplierCfg.vat?.enabled && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[11px] ${isVatValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isVatValid ? '✓' : '✗'}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {supplierCfg.vat.label} : {inv.supplierVatNumber}
                              </span>
                            </div>
                          )}
                          {inv.supplierEmail && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{inv.supplierEmail}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(inv.issueDate).toLocaleDateString('fr-FR')}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {inv.dueDate ? (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(inv.dueDate).toLocaleDateString('fr-FR')}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`text-sm font-semibold tabular-nums ${isCredit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                          {isCredit ? '- ' : ''}{fm(inv.total)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {fm(paid)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {fullyPaid ? (
                          <span className="text-sm font-semibold text-slate-400 dark:text-slate-500 tabular-nums">{fm(0)}</span>
                        ) : (
                          <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{fm(remaining)}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {justifSummary.status === 'validated' && (
                          <button
                            onClick={() => handleOpenJustifications(inv)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                            title={`${justifSummary.count} justificatif(s) validé(s)`}
                          >
                            <CheckCircle2 size={11} />
                            <Paperclip size={11} /> {justifSummary.count}
                          </button>
                        )}
                        {justifSummary.status === 'rejected' && (
                          <button
                            onClick={() => handleOpenJustifications(inv)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                            title={`${justifSummary.rejectedCount} justificatif(s) rejeté(s)`}
                          >
                            <X size={11} />
                            <Paperclip size={11} /> {justifSummary.count}
                          </button>
                        )}
                        {justifSummary.status === 'pending' && (
                          <button
                            onClick={() => handleOpenJustifications(inv)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                            title={`${justifSummary.pendingCount} justificatif(s) à valider`}
                          >
                            <Clock size={11} />
                            <Paperclip size={11} /> {justifSummary.count}
                          </button>
                        )}
                        {justifSummary.status === 'none' && (
                          <button
                            onClick={() => handleOpenJustifications(inv)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                            title="Aucun justificatif — cliquez pour ajouter"
                          >
                            <Paperclip size={11} /> 0
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={statusMap[inv.status]?.tone || 'slate'}>
                          {statusMap[inv.status]?.label || inv.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-4 text-right w-12 relative overflow-visible">
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <ActionMenu>
                            <ActionMenuItem onClick={() => setSelectedInvoiceForInfo(inv)} icon={Info} label={`Infos ${supplierCfg.name}`} />
                            <ActionMenuItem onClick={() => handleViewPdf(inv)} icon={Eye} label="Voir le document" />
                            <ActionMenuItem
                              onClick={() => handleOpenJustifications(inv)}
                              icon={Paperclip}
                              label={justifSummary.count > 0 ? `Justificatifs (${justifSummary.count})` : '⚠️ Ajouter un justificatif'}
                            />
                            {!fullyPaid && inv.status !== 'archived' && inv.status !== 'rejected' && (
                              <ActionMenuItem onClick={() => handleMarkPaid(inv)} icon={CreditCard} label="Enregistrer paiement" />
                            )}
                            {(inv.status === 'validated' || inv.status === 'partial') && (
                              <ActionMenuItem onClick={() => handleRejectInvoice(inv)} icon={FileX} label="Rejeter" danger />
                            )}
                            {inv.status !== 'archived' && (
                              <ActionMenuItem onClick={() => handleArchive(inv)} icon={Archive} label="Archiver" danger />
                            )}
                            {inv.status === 'archived' && (
                              <ActionMenuItem onClick={() => handleUnarchive(inv)} icon={RotateCcw} label="Restaurer" />
                            )}
                          </ActionMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>

              <div className="md:hidden space-y-4">
                {paginatedInvoices.map(inv => {
                  const isCredit = inv.type === '381';
                  const paid = getPaidAmount(inv);
                  const remaining = getRemainingAmount(inv);
                  const fullyPaid = remaining <= 0.01;
                  const isRejected = inv.status === 'rejected';
                  const src = sourceLabels[inv.source || 'manual_upload'];
                  const justifSummary = evaluateJustificationStatus(inv.$id);
                  const supplierCfg = getSupplierConfig(inv);
                  const supplierIdLabel = getSupplierIdLabel(inv);

                  return (
                    <MobileCard
                      key={inv.$id}
                      className={
                        isRejected ? 'border-rose-300 dark:border-rose-800'
                        : justifSummary.status === 'none' ? 'border-slate-300 dark:border-slate-600'
                        : ''
                      }
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge tone={src.tone as any}>
                              <src.icon size={10} className="mr-1" /> {src.label}
                            </Badge>
                            {isCredit ? (
                              <Badge tone="rose"><FileMinus size={10} className="mr-1" /> Avoir</Badge>
                            ) : (
                              <Badge tone="blue"><FileText size={10} className="mr-1" /> Facture</Badge>
                            )}
                            <Badge tone={statusMap[inv.status]?.tone || 'slate'}>
                              {statusMap[inv.status]?.label || inv.status}
                            </Badge>
                            <span className="text-sm" title={supplierCfg.name}>{supplierCfg.flag}</span>
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{inv.supplierName}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{inv.invoiceNumber}</p>
                          {inv.supplierSiret && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {supplierIdLabel}: {inv.supplierSiret}
                            </p>
                          )}
                          {inv.source === 'photo_ocr' && inv.ocrConfidence != null && (
                            <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">
                              OCR {(inv.ocrConfidence * 100).toFixed(0)}% confiance
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-center">
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total TTC</p>
                          <p className={`text-sm font-bold tabular-nums ${isCredit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                            {isCredit ? '- ' : ''}{fm(inv.total)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Payé</p>
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fm(paid)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Reste</p>
                          <p className={`text-sm font-bold tabular-nums ${fullyPaid ? 'text-slate-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {fm(remaining)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <button onClick={() => handleViewPdf(inv)} className="flex flex-col items-center justify-center p-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform">
                          <Eye size={18} /> <span className="text-[10px] mt-1 font-medium">Doc</span>
                        </button>
                        <button onClick={() => handleOpenJustifications(inv)} className="relative flex flex-col items-center justify-center p-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg active:scale-95 transition-transform">
                          <Paperclip size={18} />
                          <span className="text-[10px] mt-1 font-medium">Justif. {justifSummary.count}</span>
                          {justifSummary.status === 'none' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />}
                          {justifSummary.status === 'validated' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />}
                          {justifSummary.status === 'rejected' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />}
                          {justifSummary.status === 'pending' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />}
                        </button>
                        {!fullyPaid && inv.status !== 'archived' && inv.status !== 'rejected' && (
                          <button onClick={() => handleMarkPaid(inv)} className="flex flex-col items-center justify-center p-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg active:scale-95 transition-transform">
                            <CreditCard size={18} /> <span className="text-[10px] mt-1 font-medium">Payer</span>
                          </button>
                        )}
                        {(inv.status === 'validated' || inv.status === 'partial') && (
                          <button onClick={() => handleRejectInvoice(inv)} className="flex flex-col items-center justify-center p-2 text-rose-600 bg-rose-50 dark:bg-rose-900/30 rounded-lg active:scale-95 transition-transform">
                            <FileX size={18} /> <span className="text-[10px] mt-1 font-medium">Rejeter</span>
                          </button>
                        )}
                      </div>
                    </MobileCard>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  startItem={startIndex + 1}
                  endItem={Math.min(endIndex, filtered.length)}
                  totalItems={filtered.length}
                  itemName="facture"
                />
              )}
            </>
          )}
        </main>

        <SupplierInvoiceImportModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleImportSuccess}
        />

        <JustificationModal
          open={showJustifModal && !!justifExpense}
          onClose={() => { setShowJustifModal(false); setJustifExpense(null); }}
          expense={justifExpense}
          onJustificationChanged={() => {
            if (currentTeamId) {
              loadJustificationStatuses(currentTeamId, invoices.map(i => i.$id));
            }
          }}
        />

        <Modal
          open={!!selectedInvoiceForInfo}
          onClose={() => setSelectedInvoiceForInfo(null)}
          title={`Informations pays du fournisseur`}
          icon={<Globe className="text-emerald-600" size={20} />}
          maxWidth="sm:max-w-md"
        >
          {selectedInvoiceForInfo && (() => {
            const cfg = getSupplierConfig(selectedInvoiceForInfo);
            const primary = getPrimaryIdentifier(cfg);
            const idValid = validateSupplierId(selectedInvoiceForInfo);
            const vatValid = selectedInvoiceForInfo.supplierVatNumber
              ? validateSupplierVat(selectedInvoiceForInfo) : true;
            const retention = getRetentionYears(selectedInvoiceForInfo);
            const OHADA_COUNTRIES = ['SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];
            const isOhada = OHADA_COUNTRIES.includes(cfg.code);

            return (
              <div className="space-y-4">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{cfg.flag}</span>
                    <div>
                      <h3 className="font-bold text-emerald-900 dark:text-emerald-100">{cfg.name}</h3>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">{cfg.code} • {cfg.currency}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Identifiants fiscaux</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Identifiant principal</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{primary?.shortLabel || 'ID'}</p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">{primary?.label || 'Identifiant'}</p>
                      <p className={`text-[10px] mt-1 font-mono ${idValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {idValid ? '✓ Valide' : '✗ Invalide'}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Régime TVA</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{cfg.vat?.label || 'TVA'}</p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {cfg.vat?.enabled ? `${cfg.vat.standardRates.join('%, ')}%` : 'Non applicable'}
                      </p>
                      {selectedInvoiceForInfo.supplierVatNumber && (
                        <p className={`text-[10px] mt-1 font-mono ${vatValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {vatValid ? '✓ Valide' : '✗ Invalide'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Obligations légales</h4>
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">📅 Conservation légale</span>
                      <span className="font-bold text-slate-900 dark:text-white">{retention} ans</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">💰 Seuil facture simplifiée</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {cfg.simplifiedInvoiceThreshold > 0
                          ? `${cfg.simplifiedInvoiceThreshold.toLocaleString('fr-FR')} ${cfg.currency}`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">🌍 Zone OHADA</span>
                      <span className={`font-bold ${isOhada ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                        {isOhada ? 'Oui (RCCM requis)' : 'Non'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">🇪🇺 Membre UE</span>
                      <span className={`font-bold ${cfg.vat?.isEU ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                        {cfg.vat?.isEU ? 'Oui (VIES)' : 'Non'}
                      </span>
                    </div>
                  </div>
                </div>

                {cfg.identifiers && cfg.identifiers.length > 1 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Identifiants secondaires requis</h4>
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1">
                      {cfg.identifiers.slice(1).map(idf => (
                        <div key={idf.key} className="flex items-center gap-2 text-xs">
                          <span className="text-amber-600 dark:text-amber-400">▸</span>
                          <span className="text-slate-700 dark:text-slate-300">
                            <strong>{idf.shortLabel}</strong> — {idf.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedInvoiceForInfo(null)}
                  className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform"
                >
                  Fermer
                </button>
              </div>
            );
          })()}
        </Modal>

        <Modal
          open={showPaymentModal && !!invoiceToPay}
          onClose={() => { setShowPaymentModal(false); setInvoiceToPay(null); }}
          title="Enregistrer le paiement"
          icon={<CreditCard className="text-emerald-600" size={20} />}
          maxWidth="sm:max-w-md"
        >
          {invoiceToPay && (() => {
            const paid = getPaidAmount(invoiceToPay);
            const remaining = getRemainingAmount(invoiceToPay);

            return (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Facture</span>
                    <span className="font-mono font-semibold">{invoiceToPay.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Fournisseur</span>
                    <span className="font-semibold">{invoiceToPay.supplierName}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-600">
                    <span className="text-slate-600 dark:text-slate-400">Total TTC</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fm(invoiceToPay.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Déjà payé</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fm(paid)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-600">
                    <span className="text-slate-600 dark:text-slate-400 font-semibold">Reste à payer</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">{fm(remaining)}</span>
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
                    <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Ce paiement sera automatiquement enregistré comme <strong>décaissement</strong> dans la page Trésorerie.
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Montant du paiement ({fm(remaining)} restant)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remaining}
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Moyen *</label>
                    <select
                      value={paymentForm.method}
                      onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option>Virement bancaire</option>
                      <option>Chèque</option>
                      <option>Carte bancaire</option>
                      <option>Prélèvement SEPA</option>
                      <option>Espèces</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Référence</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="N° virement, chèque..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => { setShowPaymentModal(false); setInvoiceToPay(null); }}
                    className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleConfirmPayment}
                    className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-2 active:scale-95 transition-transform"
                  >
                    <CheckCircle2 size={14} /> Confirmer le paiement
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      </div>
    </Sidebar>
  );
}
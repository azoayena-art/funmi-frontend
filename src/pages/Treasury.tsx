// src/pages/Treasury.tsx — Trésorerie analytique (vue d'ensemble)
// 🌍 Multi-pays : référentiel adapté automatiquement (FR_PCG, SYSCOHADA, MA_PCM...)
// 📚 Relié au plan comptable (comptes personnalisés + standards)
// 🎯 Vue analytique uniquement — la saisie se fait dans CashOperations
// 🔐 Permissions centralisées + ActionMenu sur chaque mouvement
// 🏦 Nouvel onglet "Relevés bancaires" (import CSV + rapprochement automatique)

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import BankReconciliation from '../components/BankReconciliation';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useTreasury, CATEGORY_LABELS } from '../hooks/useTreasury';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID } from 'appwrite';
import { toast } from 'sonner';
import {
  Wallet, TrendingUp, CalendarClock, Receipt,
  ArrowDownLeft, ArrowUpRight, PiggyBank, AlertTriangle,
  BarChart3, Activity, CreditCard, Building2, Filter,
  RefreshCw, FileText, Archive, Percent, Eye, ArrowRight,
  BookOpen, Hash, Globe, ArrowLeft, Landmark,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  PageHeader, KPIGrid, StatCell, Modal, Badge, Pagination,
  SearchFilter, SelectFilter, ActionMenu, ActionMenuItem,
  ConfirmDialog, Card, Alert, TypeTabs, SkeletonCard, EmptyState,
} from '../components/ui/SharedUI';

import { getCountryConfig, type CountryConfig } from '../config/countries';
import { loadCustomAccountMapping, type CustomAccount } from '../services/accountMappingService';
import { getTeamPermissions } from '../utils/rowLevelPermissions';

// ============================================================
// 🎨 MAPPINGS STATIQUES (évite les classes Tailwind dynamiques)
// ============================================================
const METHOD_ICONS: Record<string, any> = {
  bank_transfer: Building2, check: Receipt, credit_card: CreditCard,
  sepa_direct_debit: Activity, cash: PiggyBank, paypal: CreditCard,
  stripe: CreditCard, other: FileText,
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Virement bancaire', check: 'Chèque', credit_card: 'Carte bancaire',
  sepa_direct_debit: 'Prélèvement SEPA', cash: 'Espèces', paypal: 'PayPal',
  stripe: 'Stripe', other: 'Autre',
};

// ============================================================
// 🌍 MAPPING PAYS → RÉFÉRENTIEL
// ============================================================
const COUNTRY_TO_STANDARD: Record<string, string> = {
  FR: 'FR_PCG', BE: 'BE_PCMN', CH: 'CH_PCS',
  SN: 'SYSCOHADA', CI: 'SYSCOHADA', ML: 'SYSCOHADA', BF: 'SYSCOHADA',
  NE: 'SYSCOHADA', BJ: 'SYSCOHADA', TG: 'SYSCOHADA', GW: 'SYSCOHADA',
  CM: 'SYSCOHADA', GA: 'SYSCOHADA', CG: 'SYSCOHADA', TD: 'SYSCOHADA',
  CF: 'SYSCOHADA', GQ: 'SYSCOHADA',
  MA: 'MA_PCM', TN: 'TN_PCT', DZ: 'DZ_SCF',
};

const STANDARD_LABELS: Record<string, string> = {
  FR_PCG: 'PCG France', SYSCOHADA: 'SYSCOHADA (OHADA)',
  MA_PCM: 'PCM Maroc', TN_PCT: 'PCT Tunisie', DZ_SCF: 'SCF Algérie',
  BE_PCMN: 'PCMN Belgique', CH_PCS: 'PCS Suisse', GENERIC: 'Générique',
};

// ============================================================
// 📋 LABELS THÉMATIQUES
// ============================================================
const THEME_LABELS: Record<string, string> = {
  ...(CATEGORY_LABELS || {}),
  client_payment: 'Encaissement client', client_advance: 'Acompte client reçu',
  client_refund: 'Remboursement client', supplier_payment: 'Décaissement fournisseur',
  supplier_advance: 'Acompte fournisseur versé', supplier_refund: 'Avoir fournisseur reçu',
  salary: 'Salaire', social_charges: 'Charges sociales',
  tax_payment: 'Impôts & taxes', subscription: 'Abonnement',
  rent: 'Loyer', bank_fee: 'Frais bancaires',
  insurance: 'Assurance', fuel: 'Carburant',
  travel: 'Déplacement', marketing: 'Marketing',
  equipment: 'Équipement', loan_repayment: 'Remboursement emprunt',
  loan_received: 'Prêt reçu', capital_injection: 'Apport capital',
  dividend: 'Dividendes', petty_cash: 'Petite caisse',
  other_in: 'Autre encaissement', other_out: 'Autre décaissement',
};

const DEDUCTIBLE_CATEGORIES = [
  'supplier_payment', 'supplier_advance', 'subscription', 'rent',
  'fuel', 'travel', 'marketing', 'equipment', 'insurance',
];

// ============================================================
// 📐 INTERFACES
// ============================================================
interface Payment {
  id: string; amount: number; date: string; method: string; reference?: string;
}

interface ReceivedInvoice {
  $id: string; teamId: string; invoiceNumber: string; supplierName: string;
  issueDate: string; dueDate?: string; total: number; status: string;
  payments?: string | Payment[]; isArchived?: boolean;
}

interface ClientInvoice {
  $id: string; teamId: string; invoiceNumber: string; clientName: string;
  issueDate: string; dueDate?: string; total: number; tax?: number; subtotal?: number;
  status: string; type?: string; originalInvoiceId?: string;
  payments?: string | Payment[]; isArchived?: boolean;
}

interface MovementDetail {
  id: string;
  source: string;
  type: 'in' | 'out';
  category: string;
  label: string;
  amount: number;
  date: string;
  method: string;
  counterparty?: string;
  reference?: string;
  accountNumber?: string;
  accountLabel?: string;
  vatRate?: number;
  vatAmount?: number;
}

const ITEMS_PER_PAGE = 15;

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function Treasury() {
  const { fm, currency, currencyConfig } = useCompanySettings();
  const { customTeamId, appwriteTeamId } = useTeam();
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { transactions, kpis, loading, refresh } = useTreasury();

  // 🌍 Pays de l'entreprise
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [customAccounts, setCustomAccounts] = useState<CustomAccount[]>([]);
  const [planLoading, setPlanLoading] = useState(true);

  // 📋 États UI
  const [activeTab, setActiveTab] = useState<'movements' | 'bank'>('movements'); // 🏦 NOUVEAU
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [detailTarget, setDetailTarget] = useState<MovementDetail | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; label: string; source: string } | null>(null);
  const [archiving, setArchiving] = useState(false);

  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedInvoice[]>([]);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([]);
  const [metadataCache, setMetadataCache] = useState<Record<string, any>>({});
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  // 🌍 Charger les paramètres entreprise
  useEffect(() => {
    if (!customTeamId) return;
    (async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', customTeamId), Query.limit(1),
        ]);
        if (res.documents.length > 0) setCompanySettings(res.documents[0]);
      } catch (e) {
        console.warn('⚠️ Paramètres entreprise non chargés:', e);
      }
    })();
  }, [customTeamId]);

  // 📚 Charger plan comptable
  useEffect(() => {
    if (!customTeamId) return;
    (async () => {
      setPlanLoading(true);
      try {
        const result = await loadCustomAccountMapping(customTeamId);
        setCustomAccounts(result.customAccounts || []);
      } catch (e) {
        console.warn('⚠️ Plan comptable non chargé:', e);
      } finally {
        setPlanLoading(false);
      }
    })();
  }, [customTeamId]);

  const companyCountry = companySettings?.country || 'FR';
  const companyConfig: CountryConfig = useMemo(
    () => getCountryConfig(companyCountry),
    [companyCountry]
  );
  const detectedStandard = useMemo(
    () => COUNTRY_TO_STANDARD[companyCountry] || 'GENERIC',
    [companyCountry]
  );
  const standardLabel = STANDARD_LABELS[detectedStandard] || detectedStandard;

  // 🔐 Permissions
  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  // ⌨️ Raccourci ⌘K
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

  // 📥 Chargement factures (pour prévisionnel)
  const loadInvoicesData = useCallback(async () => {
    if (!customTeamId) return;
    try {
      setLoadingInvoices(true);
      const [receivedRes, clientRes, metadataRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'received_invoices', [
          Query.equal('teamId', customTeamId), Query.limit(500),
        ]),
        databases.listDocuments(DATABASE_ID, 'invoices', [
          Query.equal('teamId', customTeamId), Query.limit(500),
        ]),
        databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
          Query.equal('teamId', customTeamId), Query.limit(500),
        ]),
      ]);

      setReceivedInvoices(receivedRes.documents as unknown as ReceivedInvoice[]);
      setClientInvoices(clientRes.documents as unknown as ClientInvoice[]);

      const metaMap: Record<string, any> = {};
      metadataRes.documents.forEach((doc: any) => {
        try {
          metaMap[doc.invoiceId] = JSON.parse(doc.archiveData || '{}');
          if (doc.creditData) {
            try { metaMap[doc.invoiceId].creditData = JSON.parse(doc.creditData); } catch {}
          }
        } catch { metaMap[doc.invoiceId] = {}; }
      });
      setMetadataCache(metaMap);
    } catch (e: any) {
      console.error('Erreur chargement factures:', e);
    } finally {
      setLoadingInvoices(false);
    }
  }, [customTeamId]);

  useEffect(() => { loadInvoicesData(); }, [loadInvoicesData]);

  // ============================================================
  // 🧮 HELPERS MONTANTS
  // ============================================================
  const getPaidAmount = (inv: ReceivedInvoice | ClientInvoice): number => {
    let payments: Payment[] = [];
    try {
      if (typeof inv.payments === 'string' && inv.payments.trim()) {
        payments = JSON.parse(inv.payments);
      } else if (Array.isArray(inv.payments)) {
        payments = inv.payments;
      }
    } catch (e) { payments = []; }
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const getRemainingAmount = (inv: ReceivedInvoice | ClientInvoice): number =>
    Math.max(0, (inv.total || 0) - getPaidAmount(inv));

  const getEffectivePaidAmount = (invoice: ClientInvoice): number => {
    if (!invoice) return 0;
    const directPayments = getPaidAmount(invoice);
    if ((invoice.type === 'standard' || invoice.type === 'balance') && invoice.originalInvoiceId) {
      const advanceInvoice = clientInvoices.find(
        i => i && i.$id === invoice.originalInvoiceId && i.type === 'advance'
      );
      if (advanceInvoice && advanceInvoice.status === 'paid') {
        return directPayments + (advanceInvoice.total || 0);
      }
    }
    return directPayments;
  };

  const isClientArchived = (inv: ClientInvoice) => {
    const isArchivedMeta = metadataCache[inv.$id]?.archived === true;
    return isArchivedMeta || inv.isArchived === true || inv.status === 'cancelled';
  };

  const getAllocatedCreditsForInvoice = (invoiceId: string): number =>
    clientInvoices
      .filter(inv => inv && inv.type === 'credit' && inv.originalInvoiceId === invoiceId && !isClientArchived(inv))
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

  const getNetRemaining = (invoice: ClientInvoice): number => {
    if (!invoice || invoice.type === 'credit') return 0;
    const paidAmount = getEffectivePaidAmount(invoice);
    const allocated = getAllocatedCreditsForInvoice(invoice.$id);
    return Math.max(0, (invoice.total || 0) - paidAmount - allocated);
  };

  // ============================================================
  // 📊 KPIs TRÉSORERIE
  // ============================================================
  const treasuryKpis = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const monthTx = transactions.filter(t => t.date.startsWith(currentMonth));
    const totalEncaissementsRealises = monthTx
      .filter(t => t.type === 'in').reduce((sum, t) => sum + t.amount, 0);
    const totalDecaissementsRealises = monthTx
      .filter(t => t.type === 'out').reduce((sum, t) => sum + t.amount, 0);
    const fluxNet = totalEncaissementsRealises - totalDecaissementsRealises;

    const activeClients = clientInvoices.filter(i =>
      !isClientArchived(i) &&
      (i.type === 'standard' || i.type === 'advance' || i.type === 'balance' || !i.type)
    );

    const advancesWithFinal = new Set(
      activeClients
        .filter(i => (i.type === 'standard' || i.type === 'balance') && i.originalInvoiceId)
        .filter(i => activeClients.some(a => a.$id === i.originalInvoiceId && a.type === 'advance'))
        .map(i => i.originalInvoiceId!)
    );

    const revenueClients = activeClients.filter(i =>
      !(i.type === 'advance' && advancesWithFinal.has(i.$id))
    );

    const aEncaisser = revenueClients
      .filter(i => {
        if (getNetRemaining(i) <= 0) return false;
        const dueDate = i.dueDate ? new Date(i.dueDate) : new Date(i.issueDate);
        return dueDate <= thirtyDaysFromNow;
      })
      .reduce((sum, i) => sum + getNetRemaining(i), 0);

    const aDecaisser = receivedInvoices
      .filter(i => {
        if (i.status === 'archived' || i.status === 'paid' || i.status === 'rejected' || i.isArchived === true) return false;
        if (getRemainingAmount(i) <= 0) return false;
        const dueDate = i.dueDate ? new Date(i.dueDate) : new Date(i.issueDate);
        return dueDate <= thirtyDaysFromNow;
      })
      .reduce((sum, i) => sum + getRemainingAmount(i), 0);

    const soldeProjete = (kpis?.balance || 0) + aEncaisser - aDecaisser;
    const creancesClients = revenueClients.reduce((sum, i) => sum + getNetRemaining(i), 0);

    const activeReceived = receivedInvoices.filter(
      i => i.status !== 'archived' && i.status !== 'rejected' && i.isArchived !== true
    );
    const dettesFournisseurs = activeReceived
      .filter(i => i.status === 'validated' || i.status === 'partial' || i.status === 'sent')
      .reduce((sum, i) => sum + getRemainingAmount(i), 0);

    // TVA collectée brute
    const tvaCollecteeBrute = revenueClients.reduce((sum, inv) => {
      const paid = getEffectivePaidAmount(inv);
      const total = inv.total || 0;
      const tax = inv.tax || 0;
      if (total <= 0 || tax <= 0) return sum;
      return sum + (tax * Math.min(1, paid / total));
    }, 0);

    // TVA régularisée (avoirs)
    const activeCredits = clientInvoices.filter(i => i && i.type === 'credit' && !isClientArchived(i));
    const tvaRegularisee = activeCredits.reduce((sum, credit) => {
      const total = credit.total || 0;
      const tax = credit.tax || 0;
      if (total <= 0 || tax <= 0) return sum;
      const meta = metadataCache[credit.$id];
      let creditData: any = {};
      try { creditData = meta?.creditData || {}; } catch {}
      const allocated = creditData.allocatedAmount || 0;
      let refunded = 0;
      try {
        const refundPayments = Array.isArray(creditData.refundPayments) ? creditData.refundPayments : [];
        refunded = refundPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      } catch {}
      const treatedAmount = allocated + refunded;
      if (treatedAmount <= 0) return sum;
      return sum + (tax * Math.min(1, treatedAmount / total));
    }, 0);

    const tvaCollectee = tvaCollecteeBrute - tvaRegularisee;

    // TVA déductible
    const monthOutTx = monthTx.filter(t => t.type === 'out');
    const tvaDeductible = monthOutTx
      .filter(t => DEDUCTIBLE_CATEGORIES.includes(t.category))
      .reduce((sum, t) => sum + (t.amount * 20 / 120), 0);

    const tvaAReverser = tvaCollectee - tvaDeductible;

    return {
      totalEncaissementsRealises, totalDecaissementsRealises, fluxNet,
      aEncaisser, aDecaisser, soldeProjete,
      balance: kpis?.balance || 0,
      creancesClients, dettesFournisseurs,
      tvaCollecteeBrute, tvaRegularisee, tvaCollectee, tvaDeductible, tvaAReverser,
      clientStats: {
        active: revenueClients.length,
        withRemaining: revenueClients.filter(i => getNetRemaining(i) > 0).length,
      },
      supplierStats: {
        active: activeReceived.filter(i => i.status !== 'paid').length,
      },
    };
  }, [receivedInvoices, clientInvoices, transactions, kpis, metadataCache]);

  // ============================================================
  // 🔍 FILTRES & PAGINATION
  // ============================================================
  const filtered = useMemo(() => transactions.filter(t => {
    if (t.isArchived) return false;
    const matchType = filterType === 'all' || t.type === filterType;
    const matchCategory = filterCategory === 'all' || t.category === filterCategory;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (t.label || '').toLowerCase().includes(q) ||
      (t.counterparty || '').toLowerCase().includes(q) ||
      ((t as any).accountNumber || '').toLowerCase().includes(q) ||
      ((t as any).reference || '').toLowerCase().includes(q);
    return matchType && matchCategory && matchSearch;
  }), [transactions, filterType, filterCategory, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [filterType, filterCategory, search]);

  const typeTabs = [
    { key: 'all', label: 'Tous', count: transactions.filter(t => !t.isArchived).length },
    { key: 'in', label: '💰 Encaissements', count: transactions.filter(t => t.type === 'in' && !t.isArchived).length },
    { key: 'out', label: '💸 Décaissements', count: transactions.filter(t => t.type === 'out' && !t.isArchived).length },
  ];

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    transactions.filter(t => !t.isArchived).forEach(t => {
      if (t.category) categories.add(t.category);
    });
    return Array.from(categories).map(c => ({ value: c, label: THEME_LABELS[c] || c }));
  }, [transactions]);

  // ============================================================
  // 📚 COMPTE COMPTABLE D'UN MOUVEMENT
  // ============================================================
  const getAccountInfo = (t: any): { number?: string; label?: string } => {
    if (t.accountNumber) {
      return { number: t.accountNumber, label: t.accountLabel };
    }
    // Chercher dans les comptes personnalisés
    const custom = customAccounts.find(acc =>
      acc.key.includes(t.category) || acc.label.toLowerCase().includes((t.label || '').toLowerCase())
    );
    if (custom) return { number: custom.number, label: custom.label };
    return {};
  };

  // ============================================================
  // 💾 HANDLERS
  // ============================================================
  const handleArchive = async () => {
    if (!archiveTarget || !user?.$id) return;
    setArchiving(true);
    try {
      const collection = archiveTarget.source === 'expense' ? 'expenses' : 'payments';
      await databases.updateDocument(
        DATABASE_ID, collection, archiveTarget.id,
        { isArchived: true },
        getTeamPermissions(appwriteTeamId!)
      );
      toast.success('Mouvement archivé');
      setArchiveTarget(null);
      await refresh();
      await loadInvoicesData();
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setArchiving(false);
    }
  };

  // ============================================================
  // ⏳ LOADING
  // ============================================================
  if (permLoading || loading || loadingInvoices || planLoading) {
    return (
      <Sidebar>
        <div className="p-8 space-y-6">
          <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Wallet}
          iconColor="purple"
          title="Trésorerie"
          description={
            <>
              <span className="inline-flex items-center gap-1.5 mr-2">
                {companyConfig.flag} <strong>{companyConfig.name}</strong>
              </span>
              • {currencyConfig?.symbol || '€'} {currency || 'EUR'}
              {' • '}
              <span className="inline-flex items-center gap-1">
                <BookOpen size={12} />
                <strong>{standardLabel}</strong>
              </span>
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/account-mapping')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 transition-all"
              >
                <BookOpen size={16} />
                <span className="hidden sm:inline">Plan comptable</span>
              </button>
              <button
                onClick={() => navigate('/cash-operations')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20"
              >
                <ArrowRight size={16} />
                <span className="hidden sm:inline">Nouvelle opération</span>
                <ArrowRight size={14} />
              </button>
            </div>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          {/* ========== 🌍 CONTEXTE PAYS ========== */}
          <Alert tone="info" icon={Globe} title={`Plan comptable ${standardLabel} actif`}>
            <div className="text-sm">
              Les mouvements sont rattachés automatiquement au référentiel <strong>{standardLabel}</strong> adapté à {companyConfig.flag} <strong>{companyConfig.name}</strong>.
              TVA : <strong>{companyConfig.vat?.label || 'TVA'} {companyConfig.vat?.standardRates[0] || 0}%</strong> •
              Conservation : <strong>{companyConfig.retentionYears} ans</strong>
              {companyConfig.vat?.isEU && ' • 🇪🇺 UE (VIES applicable)'}
              {['XOF', 'XAF'].includes(companyConfig.currency) && ' • 🌍 Zone CFA (OHADA)'}
            </div>
          </Alert>

          {/* ========== 🏦 ONGLETS : MOUVEMENTS / RELEVÉS BANCAIRES ========== */}
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('movements')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'movements'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <TrendingUp size={16} />
              💰 Mouvements
            </button>
            <button
              onClick={() => setActiveTab('bank')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'bank'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Landmark size={16} />
              🏦 Relevés bancaires
            </button>
          </div>

          {/* ============================================================ */}
          {/* 🏦 ONGLET : RELEVÉS BANCAIRES                                 */}
          {/* ============================================================ */}
          {activeTab === 'bank' && (
            <Card>
              <BankReconciliation />
            </Card>
          )}

          {/* ============================================================ */}
          {/* 💰 ONGLET : MOUVEMENTS (tout le contenu existant)             */}
          {/* ============================================================ */}
          {activeTab === 'movements' && (
            <>
              {/* ========== MOUVEMENTS RÉALISÉS ========== */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-600" />
                    Mouvements réalisés (ce mois)
                  </h2>
                  <button
                    onClick={async () => { await refresh(); await loadInvoicesData(); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <RefreshCw size={14} /> Actualiser
                  </button>
                </div>
                <KPIGrid columns={4}>
                  <StatCell
                    label="Encaissements réalisés"
                    value={fm(treasuryKpis.totalEncaissementsRealises)}
                    sublabel="Paiements clients + entrées"
                    trend={treasuryKpis.totalEncaissementsRealises > 0 ? 1 : 0}
                  />
                  <StatCell
                    label="Décaissements réalisés"
                    value={fm(treasuryKpis.totalDecaissementsRealises)}
                    sublabel="Fournisseurs + dépenses"
                    trend={treasuryKpis.totalDecaissementsRealises > 0 ? -1 : 0}
                  />
                  <StatCell
                    label="Flux net de la période"
                    value={`${treasuryKpis.fluxNet >= 0 ? '+' : ''}${fm(treasuryKpis.fluxNet)}`}
                    sublabel="Encaissements − Décaissements"
                    trend={Math.sign(treasuryKpis.fluxNet)}
                  />
                  <StatCell
                    label="Solde actuel"
                    value={fm(treasuryKpis.balance)}
                    sublabel="Trésorerie disponible"
                    trend={treasuryKpis.balance >= 0 ? 1 : -1}
                  />
                </KPIGrid>
              </div>

              {/* ========== TVA ========== */}
              {companyConfig.vat?.enabled && (
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Percent size={16} className="text-purple-600" />
                    {companyConfig.vat.label || 'TVA'} du mois
                  </h2>
                  <KPIGrid columns={5}>
                    <StatCell
                      label={`${companyConfig.vat.label} collectée (brute)`}
                      value={fm(treasuryKpis.tvaCollecteeBrute)}
                      sublabel="Sur factures clients encaissées"
                      trend={treasuryKpis.tvaCollecteeBrute > 0 ? -1 : 0}
                    />
                    <StatCell
                      label="Régularisation avoirs"
                      value={`- ${fm(treasuryKpis.tvaRegularisee)}`}
                      sublabel={`${companyConfig.vat.label} sur avoirs émis`}
                      trend={treasuryKpis.tvaRegularisee > 0 ? 1 : 0}
                    />
                    <StatCell
                      label={`${companyConfig.vat.label} déductible`}
                      value={fm(treasuryKpis.tvaDeductible)}
                      sublabel="Sur achats déductibles"
                      trend={treasuryKpis.tvaDeductible > 0 ? 1 : 0}
                    />
                    <StatCell
                      label={treasuryKpis.tvaAReverser >= 0 ? `${companyConfig.vat.label} à reverser` : `Crédit de ${companyConfig.vat.label}`}
                      value={fm(Math.abs(treasuryKpis.tvaAReverser))}
                      sublabel={treasuryKpis.tvaAReverser >= 0 ? "Net à payer" : "Crédit reportable"}
                      trend={treasuryKpis.tvaAReverser >= 0 ? -1 : 1}
                    />
                    <StatCell
                      label={`${companyConfig.vat.label} collectée nette`}
                      value={fm(treasuryKpis.tvaCollectee)}
                      sublabel="Brute − Régularisation"
                      trend={treasuryKpis.tvaCollectee > 0 ? -1 : 0}
                    />
                  </KPIGrid>
                  {treasuryKpis.tvaAReverser < 0 && (
                    <Alert tone="info" icon={TrendingUp} title={`💡 Crédit de ${companyConfig.vat.label} détecté`}>
                      Votre {companyConfig.vat.label.toLowerCase()} déductible dépasse votre collectée nette de <strong>{fm(Math.abs(treasuryKpis.tvaAReverser))}</strong>.
                      Ce crédit est reportable ou peut faire l'objet d'une demande de remboursement.
                    </Alert>
                  )}
                </div>
              )}

              {/* ========== PRÉVISIONNEL ========== */}
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CalendarClock size={16} className="text-blue-600" />
                  Prévisionnel (30 prochains jours)
                </h2>
                <KPIGrid columns={4}>
                  <StatCell
                    label="À encaisser"
                    value={fm(treasuryKpis.aEncaisser)}
                    sublabel={`${treasuryKpis.clientStats.withRemaining} facture(s) en attente`}
                    trend={treasuryKpis.aEncaisser > 0 ? 1 : 0}
                  />
                  <StatCell
                    label="À décaisser"
                    value={fm(treasuryKpis.aDecaisser)}
                    sublabel={`${treasuryKpis.supplierStats.active} facture(s) à régler`}
                    trend={treasuryKpis.aDecaisser > 0 ? -1 : 0}
                  />
                  <StatCell
                    label="Créances clients"
                    value={fm(treasuryKpis.creancesClients)}
                    sublabel="Total restant à encaisser"
                    trend={treasuryKpis.creancesClients > 0 ? 1 : 0}
                  />
                  <StatCell
                    label="Solde projeté (30j)"
                    value={fm(treasuryKpis.soldeProjete)}
                    sublabel={`Solde actuel + À encaisser − À décaisser`}
                    trend={treasuryKpis.soldeProjete >= 0 ? 1 : -1}
                  />
                </KPIGrid>
              </div>

              {treasuryKpis.soldeProjete < 0 && (
                <Alert tone="error" icon={AlertTriangle} title="⚠️ Tension de trésorerie prévue">
                  Votre solde projeté à 30 jours est négatif (<strong>{fm(treasuryKpis.soldeProjete)}</strong>).
                  Anticipez les encaissements clients ou réduisez les décaissements fournisseurs.
                </Alert>
              )}

              {/* ========== GRAPHIQUES ========== */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 size={16} className="text-purple-600 dark:text-purple-400" />
                      Encaissements vs Décaissements (12 mois)
                    </h3>
                    <Badge tone="slate">{currency}</Badge>
                  </div>
                  <div className="h-64">
                    {(!kpis?.monthlyEvolution || kpis.monthlyEvolution.length === 0) ? (
                      <EmptyState
                        icon={BarChart3}
                        title="Aucune donnée"
                        description="Pas encore de mouvements enregistrés."
                        tone="slate"
                      />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={kpis.monthlyEvolution} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:opacity-10" vertical={false} />
                          <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} />
                          <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(v: number, name: string) => [fm(v), name === 'inflows' ? 'Encaissements' : 'Décaissements']}
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', fontSize: '12px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="inflows" name="Encaissements" fill="#10b981" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="outflows" name="Décaissements" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 size={16} className="text-purple-600 dark:text-purple-400" />
                      Top catégories (12 mois)
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {(kpis?.byCategory || [])
                      .filter((c: any) => c.type && c.category)
                      .slice(0, 7)
                      .map((c: any, idx: number) => {
                        const max = (kpis?.byCategory || [])[0]?.amount || 1;
                        return (
                          <div key={`category-${idx}-${c.type}-${c.category}`}>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-slate-700 dark:text-slate-300 truncate font-medium">
                                {THEME_LABELS[c.category] || c.category}
                              </span>
                              <span className={`font-bold tabular-nums ${
                                c.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {c.type === 'in' ? '+' : '-'}{fm(c.amount)}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${c.type === 'in' ? 'bg-emerald-500' : 'bg-rose-400'}`}
                                style={{ width: `${(c.amount / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    {(!kpis?.byCategory || kpis.byCategory.length === 0) && (
                      <p className="text-xs text-slate-400 text-center py-8">Aucun mouvement</p>
                    )}
                  </div>
                </Card>
              </div>

              {/* ========== JOURNAL DES MOUVEMENTS ========== */}
              <Card padding={false}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Activity size={16} className="text-purple-600 dark:text-purple-400" />
                      Journal des mouvements
                      <span className="text-slate-400 font-normal">({filtered.length})</span>
                    </h3>
                    <div className="flex gap-2">
                      <Badge tone="indigo">{companyConfig.flag} {currency}</Badge>
                      <Badge tone="purple">
                        <BookOpen size={10} className="mr-1" />
                        {standardLabel}
                      </Badge>
                    </div>
                  </div>
                  <TypeTabs
                    tabs={typeTabs}
                    activeTab={filterType}
                    onTabChange={(key) => { setFilterType(key as any); setPage(1); }}
                    color="purple"
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <SearchFilter
                      value={search}
                      onChange={v => { setSearch(v); setPage(1); }}
                      placeholder="Rechercher (label, compte, référence)..."
                      shortcut="⌘K"
                      inputRef={searchInputRef}
                    />
                    <SelectFilter
                      value={filterCategory}
                      onChange={v => { setFilterCategory(v); setPage(1); }}
                      options={categoryOptions}
                      placeholder="Toutes catégories"
                      icon={Filter}
                    />
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="Aucun mouvement"
                    description="Les mouvements s'afficheront ici dès qu'un paiement ou une opération sera enregistré."
                    tone="purple"
                    action={
                      <button
                        onClick={() => navigate('/cash-operations')}
                        className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm mt-4 active:scale-95 transition-transform"
                      >
                        <ArrowRight size={16} />
                        <span>Saisir une opération</span>
                      </button>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mouvement</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Catégorie</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Compte</th>
                          <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Moyen</th>
                          <th className="text-right px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Montant</th>
                          <th className="px-2 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginated.map(t => {
                          const MethodIcon = METHOD_ICONS[t.method] || Receipt;
                          const accountInfo = getAccountInfo(t);
                          return (
                            <tr key={`${t.source}-${t.id}-${t.$id || Math.random()}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                              <td className="px-5 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {new Date(t.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    t.type === 'in'
                                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600'
                                      : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600'
                                  }`}>
                                    {t.type === 'in' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-slate-900 dark:text-white truncate">{t.label}</p>
                                    {t.counterparty && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{t.counterparty}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <Badge tone={t.type === 'in' ? 'emerald' : 'rose'}>
                                  {THEME_LABELS[t.category] || t.category}
                                </Badge>
                              </td>
                              <td className="px-5 py-3">
                                {accountInfo.number ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                      <Hash size={10} />
                                      {accountInfo.number}
                                    </span>
                                    {accountInfo.label && (
                                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[150px]">
                                        {accountInfo.label}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
                                  <MethodIcon size={14} />
                                  <span className="truncate">{METHOD_LABELS[t.method] || t.method}</span>
                                </div>
                              </td>
                              <td className={`px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap ${
                                t.type === 'in'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {t.type === 'in' ? '+' : '-'}{fm(t.amount)}
                              </td>
                              <td className="px-2 py-3">
                                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                  <ActionMenu>
                                    <ActionMenuItem
                                      onClick={() => setDetailTarget(t as any)}
                                      icon={Eye}
                                      label="Voir détails"
                                    />
                                    <ActionMenuItem
                                      onClick={() => setArchiveTarget({ id: t.id, label: t.label, source: t.source })}
                                      icon={Archive}
                                      label="Archiver"
                                      danger
                                    />
                                  </ActionMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {totalPages > 1 && (
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    startItem={(page - 1) * ITEMS_PER_PAGE + 1}
                    endItem={Math.min(page * ITEMS_PER_PAGE, filtered.length)}
                    totalItems={filtered.length}
                    itemName="mouvement"
                  />
                )}
              </Card>
            </>
          )}
        </main>

        {/* ========== MODAL DÉTAILS ========== */}
        <Modal
          open={!!detailTarget}
          onClose={() => setDetailTarget(null)}
          title="Détails du mouvement"
          icon={<Wallet className="text-purple-600" size={20} />}
          maxWidth="sm:max-w-lg"
        >
          {detailTarget && (() => {
            const MethodIcon = METHOD_ICONS[detailTarget.method] || Receipt;
            const accountInfo = getAccountInfo(detailTarget);
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <span className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    detailTarget.type === 'in'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                      : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600'
                  }`}>
                    {detailTarget.type === 'in' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{detailTarget.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(detailTarget.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <span className={`text-xl font-bold tabular-nums ${
                    detailTarget.type === 'in' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {detailTarget.type === 'in' ? '+' : '-'}{fm(detailTarget.amount)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Catégorie</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{THEME_LABELS[detailTarget.category] || detailTarget.category}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Moyen</p>
                    <div className="flex items-center gap-1.5">
                      <MethodIcon size={14} className="text-slate-500" />
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{METHOD_LABELS[detailTarget.method] || detailTarget.method}</p>
                    </div>
                  </div>
                </div>

                {detailTarget.counterparty && (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Tiers</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{detailTarget.counterparty}</p>
                  </div>
                )}

                {detailTarget.reference && (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Référence</p>
                    <p className="text-sm font-mono text-slate-900 dark:text-white">{detailTarget.reference}</p>
                  </div>
                )}

                {/* 📚 Compte comptable */}
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-1 flex items-center gap-1">
                    <BookOpen size={11} /> Imputation comptable
                  </p>
                  {accountInfo.number ? (
                    <div>
                      <p className="text-lg font-mono font-bold text-purple-900 dark:text-purple-200">{accountInfo.number}</p>
                      {accountInfo.label && (
                        <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">{accountInfo.label}</p>
                      )}
                      <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">
                        Plan : <strong>{standardLabel}</strong> ({companyConfig.flag} {companyConfig.name})
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-purple-700 dark:text-purple-300 italic">
                      Aucun compte associé. Configurez vos comptes dans la page <button onClick={() => navigate('/account-mapping')} className="underline font-semibold">Plan comptable</button>.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setDetailTarget(null)}
                  className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all"
                >
                  Fermer
                </button>
              </div>
            );
          })()}
        </Modal>

        {/* ========== MODAL ARCHIVAGE ========== */}
        <ConfirmDialog
          open={!!archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleArchive}
          title="Archiver ce mouvement ?"
          description={
            archiveTarget && (
              <>
                Le mouvement <strong>"{archiveTarget.label}"</strong> sera retiré de la liste active et n'apparaîtra plus dans les KPIs.
              </>
            )
          }
          confirmLabel="Archiver"
          cancelLabel="Annuler"
          tone="warning"
          loading={archiving}
        />
      </div>
    </Sidebar>
  );
}
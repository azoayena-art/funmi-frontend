// src/pages/CashOperations.tsx — Opérations + OCR + Justificatifs
// ✅ Calqué sur ReceivedInvoices.tsx (mêmes patterns, mêmes composants)
import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useTreasury, CATEGORY_LABELS } from '../hooks/useTreasury';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { createTreasuryMovement } from '../utils/treasuryGuard';
import { getTeamPermissions } from '../utils/rowLevelPermissions';
import { databases, DATABASE_ID } from '../appwrite';
import { toast } from 'sonner';
import { ID, Query } from 'appwrite';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, PiggyBank, Activity,
  CreditCard, Building2, Receipt, FileText, Archive, Eye,
  Search, Filter, BookOpen, Hash, ChevronRight, Sparkles,
  Upload, Camera, X, Loader2, Image as ImageIcon, FileCheck,
  Paperclip, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react';
import {
  PageHeader, Modal, Badge, Card, TypeTabs, EmptyState,
  ActionMenu, ActionMenuItem, ConfirmDialog, KPIGrid, StatCell,
  SearchFilter, SelectFilter, Pagination,
  Input, Select, Alert,
} from '../components/ui/SharedUI';

import {
  getCountryConfig, getDefaultVatRate,
  type CountryConfig,
} from '../config/countries';

import {
  loadCustomAccountMapping,
  type CustomAccount,
} from '../services/accountMappingService';

// 📸 OCR Service (extraction uniquement, pas de stockage)
import { extractFromJustificatif, type OCRResult } from '../services/ocrService';

// 📎 JustificationModal (partagé avec ReceivedInvoices)
import JustificationModal, { JustifiableExpense } from '../components/JustificationModal';

// ============================================================
// 📚 PLANS COMPTABLES
// ============================================================
const ACCOUNT_PLANS: Record<string, Record<string, { number: string; section: string }>> = {
  FR_PCG: {
    loan_received: { number: '164000', section: 'tresorerie' }, capital_injection: { number: '101000', section: 'tresorerie' },
    supplier_refund: { number: '409600', section: 'fournisseurs' }, other_in: { number: '758000', section: 'ventes' },
    salary: { number: '641000', section: 'achats' }, social_charges: { number: '645000', section: 'achats' },
    tax_payment: { number: '635000', section: 'achats' }, subscription: { number: '626000', section: 'achats' },
    rent: { number: '613000', section: 'achats' }, bank_fee: { number: '627000', section: 'achats' },
    insurance: { number: '616000', section: 'achats' }, fuel: { number: '606100', section: 'achats' },
    travel: { number: '625100', section: 'achats' }, marketing: { number: '623000', section: 'achats' },
    equipment: { number: '215400', section: 'achats' }, loan_repayment: { number: '164000', section: 'tresorerie' },
    petty_cash: { number: '530000', section: 'tresorerie' }, other_out: { number: '628000', section: 'achats' },
  },
  SYSCOHADA: {
    loan_received: { number: '1640000', section: 'tresorerie' }, capital_injection: { number: '1010000', section: 'tresorerie' },
    supplier_refund: { number: '4096000', section: 'fournisseurs' }, other_in: { number: '7580000', section: 'ventes' },
    salary: { number: '6610000', section: 'personnel' }, social_charges: { number: '6640000', section: 'personnel' },
    tax_payment: { number: '6410000', section: 'achats' }, subscription: { number: '6380000', section: 'achats' },
    rent: { number: '6310000', section: 'achats' }, bank_fee: { number: '6382000', section: 'achats' },
    insurance: { number: '6386000', section: 'achats' }, fuel: { number: '6061000', section: 'achats' },
    travel: { number: '6370000', section: 'achats' }, marketing: { number: '6340000', section: 'achats' },
    equipment: { number: '2415000', section: 'achats' }, loan_repayment: { number: '1640000', section: 'tresorerie' },
    petty_cash: { number: '5710000', section: 'tresorerie' }, other_out: { number: '6580000', section: 'achats' },
  },
  MA_PCM: {
    loan_received: { number: '148000', section: 'tresorerie' }, capital_injection: { number: '111000', section: 'tresorerie' },
    supplier_refund: { number: '345800', section: 'fournisseurs' }, other_in: { number: '718000', section: 'ventes' },
    salary: { number: '614500', section: 'achats' }, social_charges: { number: '614700', section: 'achats' },
    tax_payment: { number: '616100', section: 'achats' }, subscription: { number: '614400', section: 'achats' },
    rent: { number: '613100', section: 'achats' }, bank_fee: { number: '614710', section: 'achats' },
    insurance: { number: '614600', section: 'achats' }, fuel: { number: '612200', section: 'achats' },
    travel: { number: '614200', section: 'achats' }, marketing: { number: '613500', section: 'achats' },
    equipment: { number: '223000', section: 'achats' }, loan_repayment: { number: '148000', section: 'tresorerie' },
    petty_cash: { number: '516000', section: 'tresorerie' }, other_out: { number: '618000', section: 'achats' },
  },
  GENERIC: {
    loan_received: { number: '2600', section: 'tresorerie' }, capital_injection: { number: '2500', section: 'tresorerie' },
    supplier_refund: { number: '2100', section: 'fournisseurs' }, other_in: { number: '4800', section: 'ventes' },
    salary: { number: '6200', section: 'achats' }, social_charges: { number: '6210', section: 'achats' },
    tax_payment: { number: '6400', section: 'achats' }, subscription: { number: '6100', section: 'achats' },
    rent: { number: '6110', section: 'achats' }, bank_fee: { number: '6300', section: 'achats' },
    insurance: { number: '6120', section: 'achats' }, fuel: { number: '6010', section: 'achats' },
    travel: { number: '6020', section: 'achats' }, marketing: { number: '6030', section: 'achats' },
    equipment: { number: '1500', section: 'achats' }, loan_repayment: { number: '2600', section: 'tresorerie' },
    petty_cash: { number: '1100', section: 'tresorerie' }, other_out: { number: '6900', section: 'achats' },
  },
};

const COUNTRY_TO_STANDARD: Record<string, string> = {
  FR: 'FR_PCG', BE: 'FR_PCG', CH: 'GENERIC',
  SN: 'SYSCOHADA', CI: 'SYSCOHADA', ML: 'SYSCOHADA', BF: 'SYSCOHADA',
  NE: 'SYSCOHADA', BJ: 'SYSCOHADA', TG: 'SYSCOHADA', GW: 'SYSCOHADA',
  CM: 'SYSCOHADA', GA: 'SYSCOHADA', CG: 'SYSCOHADA', TD: 'SYSCOHADA',
  CF: 'SYSCOHADA', GQ: 'SYSCOHADA',
  MA: 'MA_PCM', TN: 'GENERIC', DZ: 'GENERIC',
};

const OTHER_INCOME_CATEGORIES = ['loan_received', 'capital_injection', 'supplier_refund', 'other_in'];
const OTHER_EXPENSE_CATEGORIES = [
  'salary', 'social_charges', 'tax_payment', 'subscription', 'rent',
  'bank_fee', 'insurance', 'fuel', 'travel', 'marketing', 'equipment',
  'loan_repayment', 'petty_cash', 'other_out',
];

const METHODS = ['bank_transfer', 'check', 'credit_card', 'sepa_direct_debit', 'cash', 'paypal', 'stripe', 'other'];
const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Virement bancaire', check: 'Chèque', credit_card: 'Carte bancaire',
  sepa_direct_debit: 'Prélèvement SEPA', cash: 'Espèces', paypal: 'PayPal',
  stripe: 'Stripe', other: 'Autre',
};
const METHOD_ICONS: Record<string, any> = {
  bank_transfer: Building2, check: Receipt, credit_card: CreditCard,
  sepa_direct_debit: Activity, cash: PiggyBank, paypal: CreditCard,
  stripe: CreditCard, other: FileText,
};

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

const ITEMS_PER_PAGE = 15;

// ✅ Statuts de validation (même pattern que ReceivedInvoices)
type JustificationStatus = 'validated' | 'rejected' | 'pending' | 'none';
interface JustificationSummary {
  count: number;
  validatedCount: number;
  rejectedCount: number;
  pendingCount: number;
  status: JustificationStatus;
}

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function CashOperations() {
  const { fm, currency, currencyConfig, companyName } = useCompanySettings();
  const { customTeamId, appwriteTeamId } = useTeam();
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { transactions, refresh, loading: txLoading } = useTreasury();
  const navigate = useNavigate();

  const [companySettings, setCompanySettings] = useState<any>(null);
  const [accountPlan, setAccountPlan] = useState<{ standard: string; customAccounts: CustomAccount[] }>({
    standard: 'FR_PCG', customAccounts: [],
  });
  const [planLoading, setPlanLoading] = useState(true);

  // 📎 Statuts de justification (même pattern que ReceivedInvoices)
  const [justificationStatuses, setJustificationStatuses] = useState<Record<string, JustificationSummary>>({});
  const [showJustifModal, setShowJustifModal] = useState(false);
  const [justifExpense, setJustifExpense] = useState<JustifiableExpense | null>(null);

  useEffect(() => {
    if (!customTeamId) return;
    (async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', customTeamId), Query.limit(1),
        ]);
        if (res.documents.length > 0) setCompanySettings(res.documents[0]);
      } catch (e) { console.warn('⚠️ Paramètres entreprise:', e); }
    })();
  }, [customTeamId]);

  // ✅ CORRECTION PERMISSIONS : Ajout de appwriteTeamId
  useEffect(() => {
    if (!customTeamId || !appwriteTeamId) return;
    (async () => {
      setPlanLoading(true);
      try {
        const result = await loadCustomAccountMapping(customTeamId);
        setAccountPlan({
          standard: result.mapping?.accountingStandard || 'FR_PCG',
          customAccounts: result.customAccounts || [],
        });
      } catch (e) { 
        console.warn('⚠️ Plan comptable:', e);
        setAccountPlan({ standard: 'FR_PCG', customAccounts: [] });
      }
      finally { setPlanLoading(false); }
    })();
  }, [customTeamId, appwriteTeamId]);

  const companyCountry = companySettings?.country || 'FR';
  const companyConfig: CountryConfig = useMemo(() => getCountryConfig(companyCountry), [companyCountry]);
  const detectedStandard = useMemo(() => COUNTRY_TO_STANDARD[companyCountry] || 'GENERIC', [companyCountry]);
  const activeStandard = accountPlan.standard || detectedStandard;
  const currentAccountPlan = ACCOUNT_PLANS[activeStandard] || ACCOUNT_PLANS.GENERIC;
  const defaultVatRate = useMemo(() => getDefaultVatRate(companyConfig), [companyConfig]);

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  // ============================================================
  // 📦 ÉTATS
  // ============================================================
  const [tab, setTab] = useState<'all' | 'in' | 'out'>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'in' | 'out'>('out');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [archiveTarget, setArchiveTarget] = useState<any>(null);

  // 📸 OCR (analyse uniquement, PAS de stockage)
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string>('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: 'salary', amount: '', vatRate: String(defaultVatRate),
    date: new Date().toISOString().split('T')[0], method: 'bank_transfer',
    description: '', counterpartyName: '', reference: '',
    accountNumber: '', accountLabel: '',
    isRecurring: false, recurringFrequency: 'monthly',
  });

  // Auto-suggestion compte
  useEffect(() => {
    if (!showModal) return;
    const defaultAccount = currentAccountPlan[form.category];
    const customAccount = accountPlan.customAccounts.find(
      acc => acc.key.includes(form.category) ||
             (defaultAccount && acc.number.startsWith(defaultAccount.number.substring(0, 3)))
    );
    if (customAccount) {
      setForm(prev => ({ ...prev, accountNumber: customAccount.number, accountLabel: customAccount.label }));
    } else if (defaultAccount) {
      setForm(prev => ({
        ...prev, accountNumber: defaultAccount.number,
        accountLabel: THEME_LABELS[form.category] || form.category,
      }));
    }
  }, [form.category, showModal, currentAccountPlan, accountPlan.customAccounts]);

  useEffect(() => {
    if (!showModal) setForm(prev => ({ ...prev, vatRate: String(defaultVatRate) }));
  }, [defaultVatRate, showModal]);

  // ============================================================
  // 📎 CHARGEMENT STATUTS JUSTIFICATIFS (même pattern que ReceivedInvoices)
  // ============================================================
  const loadJustificationStatuses = async (teamId: string, paymentIds: string[]) => {
    if (paymentIds.length === 0) { setJustificationStatuses({}); return; }
    const statuses: Record<string, JustificationSummary> = {};
    const CHUNK = 100;

    for (let i = 0; i < paymentIds.length; i += CHUNK) {
      const chunk = paymentIds.slice(i, i + CHUNK);
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'expense_justifications', [
          Query.equal('teamId', teamId),
          Query.equal('expenseId', chunk),
          Query.limit(500),
        ]);

        res.documents.forEach((j: any) => {
          const opId = j.expenseId;
          if (!statuses[opId]) {
            statuses[opId] = { count: 0, validatedCount: 0, rejectedCount: 0, pendingCount: 0, status: 'none' };
          }
          statuses[opId].count++;
          const vs = j.validationStatus || 'pending';
          if (vs === 'validated') statuses[opId].validatedCount++;
          else if (vs === 'rejected') statuses[opId].rejectedCount++;
          else statuses[opId].pendingCount++;
        });
      } catch (e) { console.warn(`⚠️ Justificatifs chunk ${i}:`, e); }
    }

    Object.keys(statuses).forEach(opId => {
      const s = statuses[opId];
      if (s.validatedCount > 0) s.status = 'validated';
      else if (s.rejectedCount > 0 && s.pendingCount === 0) s.status = 'rejected';
      else if (s.pendingCount > 0 || s.rejectedCount > 0) s.status = 'pending';
      else s.status = 'none';
    });

    setJustificationStatuses(statuses);
  };

  const evaluateJustificationStatus = (paymentId: string): JustificationSummary => {
    return justificationStatuses[paymentId] || {
      count: 0, validatedCount: 0, rejectedCount: 0, pendingCount: 0, status: 'none',
    };
  };

  // ============================================================
  // 🔄 FILTRAGE
  // ============================================================
  const manualOperations = useMemo(() => transactions.filter(t =>
    t.source === 'manual' &&
    !['client_payment', 'client_advance', 'supplier_payment', 'supplier_advance'].includes(t.category) &&
    !t.isArchived
  ), [transactions]);

  // Recharger statuts quand les opérations changent
  useEffect(() => {
    if (customTeamId && manualOperations.length > 0) {
      loadJustificationStatuses(customTeamId, manualOperations.map(t => (t as any).$id || t.id));
    } else {
      setJustificationStatuses({});
    }
  }, [manualOperations, customTeamId]);

  const filteredOps = useMemo(() => {
    return manualOperations.filter(t => {
      if (tab !== 'all' && t.type !== tab) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchLabel = (t.label || '').toLowerCase().includes(q);
        const matchCounterparty = ((t as any).counterpartyName || '').toLowerCase().includes(q);
        const matchCategory = (THEME_LABELS[t.category] || t.category || '').toLowerCase().includes(q);
        const matchAccount = ((t as any).accountNumber || '').toLowerCase().includes(q);
        if (!matchLabel && !matchCounterparty && !matchCategory && !matchAccount) return false;
      }
      return true;
    });
  }, [manualOperations, tab, filterCategory, search]);

  const totalPages = Math.max(1, Math.ceil(filteredOps.length / ITEMS_PER_PAGE));
  const paginatedOps = filteredOps.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [tab, filterCategory, search]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    manualOperations.forEach(t => { if (t.category) categories.add(t.category); });
    return Array.from(categories).map(c => ({ value: c, label: THEME_LABELS[c] || c }));
  }, [manualOperations]);

  const typeTabs = [
    { key: 'all', label: '📋 Tous', count: manualOperations.length },
    { key: 'in', label: '💰 Entrées', count: manualOperations.filter(t => t.type === 'in').length },
    { key: 'out', label: '💸 Sorties', count: manualOperations.filter(t => t.type === 'out').length },
  ];

  const availableAccounts = useMemo(() => {
    const sectionNeeded = modalType === 'in'
      ? ['ventes', 'tresorerie', 'fournisseurs', 'clients']
      : ['achats', 'tresorerie', 'fournisseurs', 'personnel'];
    const accounts: Array<{ value: string; label: string; isCustom: boolean }> = [];
    accountPlan.customAccounts.forEach(acc => {
      if (sectionNeeded.includes(acc.section)) {
        accounts.push({ value: `${acc.number}|${acc.label}`, label: `${acc.number} — ${acc.label} ✨`, isCustom: true });
      }
    });
    const categories = modalType === 'in' ? OTHER_INCOME_CATEGORIES : OTHER_EXPENSE_CATEGORIES;
    categories.forEach(cat => {
      const defaultAcc = currentAccountPlan[cat];
      if (defaultAcc && !accounts.some(a => a.value.startsWith(defaultAcc.number + '|'))) {
        accounts.push({ value: `${defaultAcc.number}|${THEME_LABELS[cat]}`, label: `${defaultAcc.number} — ${THEME_LABELS[cat]}`, isCustom: false });
      }
    });
    return accounts;
  }, [accountPlan.customAccounts, modalType, currentAccountPlan]);

  // ============================================================
  // 📊 KPIs CONFORMITÉ
  // ============================================================
  const complianceStats = useMemo(() => {
    const total = manualOperations.length;
    let withJustif = 0, validated = 0, pending = 0, rejected = 0, missing = 0;
    manualOperations.forEach(t => {
      const id = (t as any).$id || t.id;
      const s = justificationStatuses[id];
      if (s && s.count > 0) withJustif++;
      else missing++;
      if (s?.status === 'validated') validated++;
      else if (s?.status === 'pending') pending++;
      else if (s?.status === 'rejected') rejected++;
    });
    return { total, withJustif, validated, pending, rejected, missing };
  }, [manualOperations, justificationStatuses]);

  // ============================================================
  // 📸 HANDLERS OCR (analyse locale, pas de stockage)
  // ============================================================
  const handleFileSelect = async (file: File) => {
    if (!file) return;
    setOcrFile(file);
    setOcrPreview(URL.createObjectURL(file));
    setOcrResult(null);
    setOcrLoading(true);
    setOcrProgress(0);

    try {
      const result = await extractFromJustificatif(file, setOcrProgress);
      setOcrResult(result);

      if (result.success) {
        setForm(prev => ({
          ...prev,
          amount: result.extracted.amount ? String(result.extracted.amount) : prev.amount,
          date: result.extracted.date || prev.date,
          counterpartyName: result.extracted.counterpartyName || prev.counterpartyName,
          vatRate: result.extracted.vatRate !== undefined ? String(result.extracted.vatRate) : prev.vatRate,
          description: result.extracted.description || prev.description,
          reference: result.extracted.reference || prev.reference,
        }));
        toast.success(`✨ ${Object.keys(result.extracted).length} donnée(s) extraite(s)`, {
          description: `Confiance : ${result.confidence.toFixed(0)}% • Vérifiez avant d'enregistrer`,
        });
      } else {
        toast.error(`❌ Échec OCR`, { description: result.error });
      }
    } catch (error: any) {
      toast.error(`❌ Erreur : ${error.message}`);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearOCR = () => {
    if (ocrPreview) URL.revokeObjectURL(ocrPreview);
    setOcrFile(null);
    setOcrPreview('');
    setOcrResult(null);
    setOcrProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================
  // 💾 HANDLERS
  // ============================================================
  const openModal = (type: 'in' | 'out') => {
    if (!hasPermission('invoices.view')) {
      toast.error('Permissions insuffisantes');
      return;
    }
    setModalType(type);
    const defaultCategory = type === 'in' ? 'loan_received' : 'salary';
    const defaultAccount = currentAccountPlan[defaultCategory];
    setForm({
      category: defaultCategory,
      amount: '', vatRate: String(defaultVatRate),
      date: new Date().toISOString().split('T')[0], method: 'bank_transfer',
      description: '', counterpartyName: '', reference: '',
      accountNumber: defaultAccount?.number || '',
      accountLabel: THEME_LABELS[defaultCategory],
      isRecurring: false, recurringFrequency: 'monthly',
    });
    clearOCR();
    setShowModal(true);
  };

  const handleAccountSelect = (value: string) => {
    if (!value) { setForm(prev => ({ ...prev, accountNumber: '', accountLabel: '' })); return; }
    const [number, label] = value.split('|');
    setForm(prev => ({ ...prev, accountNumber: number, accountLabel: label }));
  };

  const buildDisplayLabel = () => {
    const categoryLabel = THEME_LABELS[form.category] || form.category;
    if (form.description.trim()) return form.description.trim();
    if (form.counterpartyName.trim()) return `${categoryLabel} - ${form.counterpartyName.trim()}`;
    return categoryLabel;
  };

  const handleSave = async () => {
    if (!customTeamId || !appwriteTeamId || !user?.$id) {
      toast.error('Équipe non chargée'); return;
    }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Montant invalide'); return; }
    if (!form.description.trim()) { toast.error('Description obligatoire'); return; }
    if (!form.accountNumber.trim()) { toast.error('Compte comptable obligatoire'); return; }

    const vatRate = parseFloat(form.vatRate) || 0;
    const amountHt = Math.round((amount / (1 + vatRate / 100)) * 100) / 100;
    const vatAmount = Math.round((amount - amountHt) * 100) / 100;
    const displayLabel = buildDisplayLabel();

    setSaving(true);
    try {
      const result = await createTreasuryMovement({
        teamId: customTeamId,
        appwriteTeamId,
        userId: user.$id,
        type: modalType,
        category: form.category,
        amount,
        date: form.date,
        method: form.method,
        description: form.description,
        label: displayLabel,
        counterpartyName: form.counterpartyName || null,
        reference: form.reference || null,
        vatAmount, vatRate,
        isRecurring: form.isRecurring,
        recurringFrequency: form.isRecurring ? form.recurringFrequency : null,
        source: 'manual',
        accountNumber: form.accountNumber,
        accountLabel: form.accountLabel,
      } as any);

      if (!result.success) { toast.error(`❌ ${result.error}`); return; }
      if (!result.created) { toast.warning('⚠️ Doublon ignoré'); return; }

      // Création dépense associée si sortie avec tiers
      if (modalType === 'out' && form.counterpartyName.trim()) {
        try {
          await databases.createDocument(DATABASE_ID, 'expenses', ID.unique(), {
            teamId: customTeamId, userId: user.$id,
            category: form.category, label: form.description.trim(),
            amount, vatRate, vatAmount, amountHt,
            currencyCode: currency || 'EUR',
            date: form.date, method: form.method,
            supplierName: form.counterpartyName.trim(),
            supplierCountry: companyCountry,
            accountNumber: form.accountNumber,
            accountLabel: form.accountLabel,
            accountingStandard: activeStandard,
            isDeductible: true,
            isRecurring: form.isRecurring,
            recurringFrequency: form.isRecurring ? form.recurringFrequency : null,
            isArchived: false,
          }, getTeamPermissions(appwriteTeamId));
        } catch (e: any) {
          console.warn('⚠️ Dépense non créée:', e.message);
        }
      }

      const hasOcrFile = !!ocrFile;
      toast.success(
        `${modalType === 'in' ? '💰 Entrée' : '💸 Sortie'} de ${fm(amount)} enregistrée`,
        {
          description: hasOcrFile
            ? `📎 Pensez à attacher le justificatif via l'icône trombone`
            : `${companyConfig.flag} ${companyConfig.name} • Compte ${form.accountNumber}`,
          duration: hasOcrFile ? 7000 : 5000,
        }
      );

      setShowModal(false);
      clearOCR();
      await refresh();
    } catch (error: any) {
      toast.error(`Erreur : ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget || !customTeamId || !appwriteTeamId) return;
    setSaving(true);
    try {
      await databases.updateDocument(
        DATABASE_ID, 'payments',
        archiveTarget.$id || archiveTarget.id,
        { isArchived: true },
        getTeamPermissions(appwriteTeamId)
      );
      toast.success('Opération archivée');
      setArchiveTarget(null);
      await refresh();
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 📎 Ouverture du JustificationModal (même pattern que ReceivedInvoices)
  const handleOpenJustifications = (op: any) => {
    setJustifExpense({
      type: 'cash_operation' as any,
      id: op.$id || op.id,
      number: op.reference || op.$id || op.id,
      label: op.label || THEME_LABELS[op.category] || op.category,
      amount: op.amount || 0,
      date: op.date,
    });
    setShowJustifModal(true);
  };

  if (permLoading || txLoading || planLoading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Wallet}
          iconColor="indigo"
          title="Entrées & Sorties"
          description={
            <>
              Opérations de trésorerie hors facturation •{' '}
              <span className="font-semibold">{companyConfig.flag} {companyConfig.name}</span>
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* 📊 KPIs Conformité */}
          <KPIGrid columns={4}>
            <StatCell
              label="Total opérations"
              value={complianceStats.total.toString()}
              sublabel={`${complianceStats.withJustif} avec justificatif`}
              trend={0}
            />
            <StatCell
              label="Justificatifs validés"
              value={complianceStats.validated.toString()}
              sublabel={`Sur ${complianceStats.withJustif} attachés`}
              trend={complianceStats.validated > 0 ? 1 : 0}
            />
            <StatCell
              label="À valider"
              value={complianceStats.pending.toString()}
              sublabel="En attente de validation"
              trend={complianceStats.pending > 0 ? -1 : 0}
            />
            <StatCell
              label="Sans justificatif"
              value={complianceStats.missing.toString()}
              sublabel="À attacher"
              trend={complianceStats.missing > 0 ? -1 : 0}
            />
          </KPIGrid>

          {/* ⚠️ Alerte conformité */}
          {(complianceStats.missing > 0 || complianceStats.rejected > 0 || complianceStats.pending > 0) && (
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex items-start gap-3">
              <AlertCircle size={16} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-800 dark:text-rose-200 space-y-1">
                {complianceStats.missing > 0 && (
                  <p><strong>{complianceStats.missing} opération(s) sans justificatif</strong> — attachez la pièce comptable.</p>
                )}
                {complianceStats.pending > 0 && (
                  <p><strong>{complianceStats.pending} justificatif(s) à valider</strong> — ouvrez et confirmez la conformité.</p>
                )}
                {complianceStats.rejected > 0 && (
                  <p><strong>{complianceStats.rejected} justificatif(s) rejeté(s)</strong> — corrigez ou remplacez.</p>
                )}
                <p className="text-[11px] text-rose-600 dark:text-rose-300">
                  📅 Conservation : {companyConfig.retentionYears} ans (selon pays de votre entreprise)
                </p>
              </div>
            </div>
          )}

          {/* Boutons Premium */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button
              onClick={() => openModal('in')}
              disabled={!hasPermission('invoices.view')}
              className="group relative overflow-hidden rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-white via-emerald-50/40 to-white dark:from-slate-800 dark:via-emerald-950/20 dark:to-slate-800 p-6 text-left shadow-sm hover:shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
            >
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-gradient-to-br from-emerald-400/20 to-teal-400/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/30 rounded-2xl blur-md" />
                    <div className="relative w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <ArrowDownLeft size={28} className="text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className="text-emerald-600" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Encaissement</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Nouvelle entrée</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1">Prêt, apport, remboursement...</p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center group-hover:bg-emerald-500 group-hover:scale-110 transition-all">
                  <ChevronRight size={20} className="text-emerald-600 group-hover:text-white transition-all" />
                </div>
              </div>
            </button>

            <button
              onClick={() => openModal('out')}
              disabled={!hasPermission('invoices.view')}
              className="group relative overflow-hidden rounded-2xl border border-rose-200/60 dark:border-rose-800/40 bg-gradient-to-br from-white via-rose-50/40 to-white dark:from-slate-800 dark:via-rose-950/20 dark:to-slate-800 p-6 text-left shadow-sm hover:shadow-2xl hover:shadow-rose-500/20 transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
            >
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-gradient-to-br from-rose-400/20 to-pink-400/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-rose-500/30 rounded-2xl blur-md" />
                    <div className="relative w-16 h-16 bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <ArrowUpRight size={28} className="text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className="text-rose-600" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Décaissement</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Nouvelle sortie</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1">Salaires, loyers, abonnements...</p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center group-hover:bg-rose-500 group-hover:scale-110 transition-all">
                  <ChevronRight size={20} className="text-rose-600 group-hover:text-white transition-all" />
                </div>
              </div>
            </button>
          </div>

          <TypeTabs tabs={typeTabs} activeTab={tab} onTabChange={(key) => setTab(key as any)} color="indigo" />

          <Card padding={false}>
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity size={16} className="text-indigo-600" />
                  Historique des opérations
                  <span className="text-slate-400 font-normal">({filteredOps.length})</span>
                </h3>
                <button onClick={async () => await refresh()} className="text-xs text-slate-500 hover:text-indigo-600">
                  Actualiser
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <SearchFilter value={search} onChange={setSearch} placeholder="Rechercher..." shortcut="⌘K" />
                <SelectFilter value={filterCategory} onChange={setFilterCategory} options={categoryOptions} placeholder="Toutes catégories" icon={Filter} />
              </div>
            </div>

            {filteredOps.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={tab === 'in' ? 'Aucune entrée' : tab === 'out' ? 'Aucune sortie' : 'Aucune opération'}
                description="Utilisez les boutons pour enregistrer une opération."
                tone="indigo"
              />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedOps.map(t => {
                  const MethodIcon = METHOD_ICONS[t.method] || Receipt;
                  const accountNumber = (t as any).accountNumber;
                  const accountLabel = (t as any).accountLabel;
                  const opId = (t as any).$id || t.id;
                  const justifSummary = evaluateJustificationStatus(opId);

                  return (
                    <div key={opId} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            t.type === 'in' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600'
                              : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600'
                          }`}>
                            {t.type === 'in' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">{t.label}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[11px] text-slate-500">{new Date(t.date).toLocaleDateString('fr-FR')}</span>
                              <Badge tone={t.type === 'in' ? 'emerald' : 'rose'}>{THEME_LABELS[t.category] || t.category}</Badge>
                              {accountNumber && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                  <Hash size={9} />{accountNumber}
                                </span>
                              )}
                              {/* 📎 Badge justificatif (mêmes couleurs que ReceivedInvoices) */}
                              {justifSummary.status === 'validated' && (
                                <button onClick={() => handleOpenJustifications(t)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                                  title={`${justifSummary.count} justificatif(s) validé(s)`}>
                                  <CheckCircle2 size={10} /><Paperclip size={10} />{justifSummary.count}
                                </button>
                              )}
                              {justifSummary.status === 'pending' && (
                                <button onClick={() => handleOpenJustifications(t)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
                                  title={`${justifSummary.pendingCount} justificatif(s) à valider`}>
                                  <Clock size={10} /><Paperclip size={10} />{justifSummary.count}
                                </button>
                              )}
                              {justifSummary.status === 'rejected' && (
                                <button onClick={() => handleOpenJustifications(t)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                                  title={`${justifSummary.rejectedCount} justificatif(s) rejeté(s)`}>
                                  <X size={10} /><Paperclip size={10} />{justifSummary.count}
                                </button>
                              )}
                              {justifSummary.status === 'none' && (
                                <button onClick={() => handleOpenJustifications(t)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                                  title="Aucun justificatif — cliquez pour ajouter">
                                  <Paperclip size={10} />0
                                </button>
                              )}
                              {(t as any).counterpartyName && (
                                <span className="text-[11px] text-slate-500 truncate">• {(t as any).counterpartyName}</span>
                              )}
                              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                <MethodIcon size={10} />{METHOD_LABELS[t.method] || t.method}
                              </div>
                            </div>
                            {accountLabel && <p className="text-[10px] text-slate-500 mt-0.5 truncate italic">{accountLabel}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-base font-bold tabular-nums ${
                            t.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {t.type === 'in' ? '+' : '-'}{fm(t.amount)}
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <ActionMenu>
                              <ActionMenuItem onClick={() => handleOpenJustifications(t)} icon={Paperclip}
                                label={justifSummary.count > 0 ? `Justificatifs (${justifSummary.count})` : '⚠️ Ajouter justificatif'} />
                              <ActionMenuItem onClick={() => setArchiveTarget(t)} icon={Archive} label="Archiver" danger />
                            </ActionMenu>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
                startItem={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                endItem={Math.min(currentPage * ITEMS_PER_PAGE, filteredOps.length)}
                totalItems={filteredOps.length} itemName="opération" />
            )}
          </Card>
        </main>

        {/* MODAL DE SAISIE */}
        <Modal
          open={showModal} onClose={() => { setShowModal(false); clearOCR(); }}
          title={modalType === 'in' ? '💰 Nouvelle entrée' : '💸 Nouvelle sortie'}
          icon={modalType === 'in' ? <ArrowDownLeft className="text-emerald-600" size={20} /> : <ArrowUpRight className="text-rose-600" size={20} />}
          maxWidth="sm:max-w-2xl"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <span className="text-2xl">{companyConfig.flag}</span>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-indigo-900 dark:text-indigo-200">{companyConfig.name}</p>
                <p className="text-indigo-700 dark:text-indigo-300">
                  Plan : <strong>{activeStandard}</strong> • Devise : <strong>{currency}</strong> • {companyConfig.vat?.label || 'TVA'} : <strong>{defaultVatRate}%</strong>
                </p>
              </div>
            </div>

            {/* 📸 ZONE OCR — Analyse locale uniquement */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Camera size={12} className="text-indigo-600" />
                Scanner un justificatif (optionnel)
                <span className="text-[10px] font-normal text-slate-500 ml-1">• Extraction automatique des données</span>
              </label>

              {!ocrFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all p-6 text-center ${
                    dragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 scale-[1.02]'
                      : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-800/50'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                      <Upload size={24} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Glissez un justificatif</p>
                      <p className="text-xs text-slate-500 mt-0.5">ou <span className="text-indigo-600 underline">parcourir</span></p>
                      <p className="text-[10px] text-slate-400 mt-1">JPG, PNG, PDF • Max 10 MB</p>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-2 font-medium">
                        💡 Vous pourrez attacher le fichier définitif après enregistrement
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800">
                    <div className="flex gap-3 p-3">
                      {ocrPreview && <img src={ocrPreview} alt="Justif." className="w-20 h-20 object-cover rounded-lg" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{ocrFile.name}</p>
                        <p className="text-[10px] text-slate-500">{(ocrFile.size / 1024).toFixed(1)} KB</p>
                        {ocrLoading && (
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] text-indigo-600 mb-1">
                              <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" />Analyse...</span>
                              <span className="font-bold">{ocrProgress}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all" style={{ width: `${ocrProgress}%` }} />
                            </div>
                          </div>
                        )}
                        {ocrResult?.success && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <FileCheck size={12} className="text-emerald-600" />
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                              {Object.keys(ocrResult.extracted).length} donnée(s) • {ocrResult.confidence.toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button onClick={clearOCR} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {ocrResult?.success && Object.keys(ocrResult.extracted).length > 0 && (
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
                      <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1">
                        <Sparkles size={10} />Données détectées et pré-remplies
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {ocrResult.extracted.amount && (
                          <div className="flex justify-between bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1">
                            <span className="text-slate-600">Montant :</span>
                            <span className="font-bold text-emerald-700">{ocrResult.extracted.amount.toFixed(2)} {currencyConfig?.symbol || '€'}</span>
                          </div>
                        )}
                        {ocrResult.extracted.date && (
                          <div className="flex justify-between bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1">
                            <span className="text-slate-600">Date :</span>
                            <span className="font-bold">{new Date(ocrResult.extracted.date).toLocaleDateString('fr-FR')}</span>
                          </div>
                        )}
                        {ocrResult.extracted.counterpartyName && (
                          <div className="flex justify-between bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1 col-span-2">
                            <span className="text-slate-600">Tiers :</span>
                            <span className="font-bold truncate ml-2">{ocrResult.extracted.counterpartyName}</span>
                          </div>
                        )}
                        {ocrResult.extracted.vatRate !== undefined && (
                          <div className="flex justify-between bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1">
                            <span className="text-slate-600">TVA :</span>
                            <span className="font-bold text-purple-700">{ocrResult.extracted.vatRate}%</span>
                          </div>
                        )}
                        {ocrResult.extracted.reference && (
                          <div className="flex justify-between bg-white/60 dark:bg-slate-800/60 rounded px-2 py-1">
                            <span className="text-slate-600">Réf :</span>
                            <span className="font-mono text-xs">{ocrResult.extracted.reference}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 italic">💡 Vérifiez les données avant d'enregistrer.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Catégorie */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Type d'opération *</label>
              <Select value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })}>
                {(modalType === 'in' ? OTHER_INCOME_CATEGORIES : OTHER_EXPENSE_CATEGORIES).map(c => (
                  <option key={c} value={c}>{THEME_LABELS[c]}</option>
                ))}
              </Select>
            </div>

            {/* Compte comptable */}
            <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1.5">
                <BookOpen size={12} />Imputation comptable *
              </label>
              <div className="space-y-2">
                <Select value={form.accountNumber ? `${form.accountNumber}|${form.accountLabel}` : ''} onChange={(e: any) => handleAccountSelect(e.target.value)}>
                  <option value="">— Choisir un compte —</option>
                  {availableAccounts.filter(a => a.isCustom).length > 0 && (
                    <optgroup label="Comptes personnalisés">
                      {availableAccounts.filter(a => a.isCustom).map(acc => <option key={acc.value} value={acc.value}>{acc.label}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Comptes standards">
                    {availableAccounts.filter(a => !a.isCustom).map(acc => <option key={acc.value} value={acc.value}>{acc.label}</option>)}
                  </optgroup>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">N° compte</label>
                    <Input type="text" value={form.accountNumber} onChange={(e: any) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })} maxLength={10} placeholder="641000" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Libellé</label>
                    <Input type="text" value={form.accountLabel} onChange={(e: any) => setForm({ ...form, accountLabel: e.target.value })} placeholder="Rémunérations" />
                  </div>
                </div>
              </div>
            </div>

            {/* Montant / TVA / Date */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Montant TTC *</label>
                <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{companyConfig.vat?.label || 'TVA'} %</label>
                <Select value={form.vatRate} onChange={(e: any) => setForm({ ...form, vatRate: e.target.value })}>
                  {(companyConfig.vat?.standardRates || [20, 10, 5.5, 2.1, 0]).map((r: number) => <option key={r} value={r}>{r}%</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                <Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Description *</label>
              <Input value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Loyer bureau janvier 2026" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Tiers</label>
                <Input value={form.counterpartyName} onChange={(e: any) => setForm({ ...form, counterpartyName: e.target.value })} placeholder="Nom du fournisseur..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Moyen</label>
                <Select value={form.method} onChange={(e: any) => setForm({ ...form, method: e.target.value })}>
                  {METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Référence</label>
              <Input value={form.reference} onChange={(e: any) => setForm({ ...form, reference: e.target.value })} placeholder="N° virement, facture..." />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded" />
                <span className="text-sm text-slate-700 dark:text-slate-300">Opération récurrente</span>
              </label>
              {form.isRecurring && (
                <Select value={form.recurringFrequency} onChange={(e: any) => setForm({ ...form, recurringFrequency: e.target.value })} className="max-w-[150px]">
                  <option value="weekly">Hebdomadaire</option>
                  <option value="monthly">Mensuelle</option>
                  <option value="quarterly">Trimestrielle</option>
                  <option value="yearly">Annuelle</option>
                </Select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => { setShowModal(false); clearOCR(); }} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 active:scale-95">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`px-4 py-2.5 text-sm font-bold text-white rounded-lg disabled:opacity-50 flex items-center gap-2 active:scale-95 ${
                  modalType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}>
                {saving ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                  : <>{modalType === 'in' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}Enregistrer</>}
              </button>
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!archiveTarget} onClose={() => setArchiveTarget(null)} onConfirm={handleArchive}
          title="Archiver cette opération ?"
          description={archiveTarget && <>L'opération <strong>"{archiveTarget.label}"</strong> sera retirée.</>}
          confirmLabel="Archiver" cancelLabel="Annuler" tone="warning" loading={saving}
        />

        {/* 📎 JustificationModal (partagé avec ReceivedInvoices) */}
        <JustificationModal
          open={showJustifModal && !!justifExpense}
          onClose={() => { setShowJustifModal(false); setJustifExpense(null); }}
          expense={justifExpense}
          onJustificationChanged={() => {
            if (customTeamId && manualOperations.length > 0) {
              loadJustificationStatuses(customTeamId, manualOperations.map(t => (t as any).$id || t.id));
            }
          }}
        />
      </div>
    </Sidebar>
  );
}
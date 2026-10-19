// src/pages/ExportComptable.tsx — Export Comptable Multi-Pays
// 🌍 Support multi-pays (devise, TVA, référentiel comptable)
// 📚 Détection automatique du plan (FR_PCG, SYSCOHADA, MA_PCM...)
// 💰 Intégration des opérations manuelles de trésorerie (Entrées & Sorties)
// 📥 FEC France + Livre Journal international

import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { toast } from 'sonner';
import {
  Card, SectionTitle, Badge, SkeletonCard, Alert,
} from '../components/ui/SharedUI';
import {
  FileText, Download, FileSpreadsheet, FileCheck, Settings2,
  AlertCircle, CheckCircle2, Calendar, BookOpen, Database,
  Loader2, ChevronRight, Sparkles, TrendingUp, Shield, Filter,
  Globe, Wallet, ArrowDownLeft, ArrowUpRight, Hash,
} from 'lucide-react';
import {
  generateAccountingEntries,
  exportAccountingFile,
  type JournalEntry,
  type AccountMapping,
  type ExportStats,
} from '../services/accountingExportService';
import { loadCustomAccountMapping } from '../services/accountMappingService';
import { getDefaultAccountMapping } from '../services/defaultAccountMapping';

// 🌍 Registre international
import { getCountryConfig, type CountryConfig } from '../config/countries';

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

// Libellé légal adapté au pays
const LEGAL_CONTEXT: Record<string, { title: string; description: string; obligationLabel: string }> = {
  FR: {
    title: 'Obligation légale (art. L47 A du LPF)',
    description: 'Toute entreprise soumise à un régime réel d\'imposition doit pouvoir présenter un FEC en cas de contrôle fiscal. L\'export est conforme aux spécifications de la DGFiP.',
    obligationLabel: 'FEC officiel',
  },
  SYSCOHADA: {
    title: 'Conformité SYSCOHADA (AUDCIF)',
    description: 'L\'Acte Uniforme relatif au Droit Comptable et à l\'Information Financière impose la tenue d\'un livre journal et d\'un grand livre. Export adapté aux 14 pays OHADA.',
    obligationLabel: 'Livre journal OHADA',
  },
  MA: {
    title: 'Conformité CGNC Maroc',
    description: 'Le Code Général de Normalisation Comptable impose la tenue d\'un livre journal et d\'un grand livre pour toute entreprise marocaine.',
    obligationLabel: 'Livre journal CGNC',
  },
  DEFAULT: {
    title: 'Export comptable conforme',
    description: 'Export adapté au référentiel comptable de votre pays. Conservez ces documents selon la législation locale.',
    obligationLabel: 'Export comptable',
  },
};

// ============================================================
// 📋 FORMATS D'EXPORT ADAPTÉS AU PAYS
// ============================================================
const getExportFormats = (countryCode: string) => {
  const isFrance = countryCode === 'FR';
  const isOHADA = COUNTRY_TO_STANDARD[countryCode] === 'SYSCOHADA';
  
  const baseFormats = [
    {
      value: 'csv',
      label: 'CSV Générique (Excel)',
      description: 'Compatible Excel, LibreOffice, Google Sheets',
      icon: FileSpreadsheet,
      color: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      badge: 'Universel',
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      available: true,
    },
    {
      value: 'sage',
      label: 'Sage Comptabilité',
      description: 'Format d\'import Sage 100 / Sage 50',
      icon: FileText,
      color: 'bg-gradient-to-br from-red-500 to-orange-600',
      badge: 'Sage',
      badgeColor: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      available: true,
    },
    {
      value: 'cegid',
      label: 'Cegid Quadra / Loop',
      description: 'Format d\'import Cegid',
      icon: FileText,
      color: 'bg-gradient-to-br from-blue-500 to-cyan-600',
      badge: 'Cegid',
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      available: true,
    },
    {
      value: 'ebp',
      label: 'EBP Compta',
      description: 'Format d\'import EBP',
      icon: FileText,
      color: 'bg-gradient-to-br from-amber-500 to-yellow-600',
      badge: 'EBP',
      badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
      available: true,
    },
    {
      value: 'quickbooks',
      label: 'QuickBooks',
      description: 'Format d\'import QuickBooks / Intuit',
      icon: FileText,
      color: 'bg-gradient-to-br from-green-500 to-lime-600',
      badge: 'QB',
      badgeColor: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
      available: true,
    },
  ];

  // Format officiel adapté au pays
  const officialFormat = {
    value: 'fec',
    label: isFrance ? 'FEC (Obligation légale)' : isOHADA ? 'Livre Journal OHADA' : 'Livre Journal',
    description: isFrance 
      ? 'Fichier des Écritures Comptables - Format DGFiP'
      : isOHADA 
        ? 'Livre journal conforme SYSCOHADA (AUDCIF)'
        : 'Livre journal adapté à votre référentiel',
    icon: FileCheck,
    color: 'bg-gradient-to-br from-purple-500 to-indigo-600',
    badge: isFrance ? 'Officiel' : isOHADA ? 'OHADA' : 'Légal',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
    available: true,
  };

  return [officialFormat, ...baseFormats];
};

const PERIOD_PRESETS = [
  {
    label: 'Mois en cours',
    getDates: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    }
  },
  {
    label: 'Mois dernier',
    getDates: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
    }
  },
  {
    label: 'Trimestre en cours',
    getDates: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      return { start: new Date(now.getFullYear(), quarter * 3, 1), end: new Date(now.getFullYear(), quarter * 3 + 3, 0) };
    }
  },
  {
    label: 'Année en cours',
    getDates: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
    }
  },
  {
    label: 'Année dernière',
    getDates: () => {
      const now = new Date();
      return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31) };
    }
  },
];

const ITEMS_PER_PAGE = 15;

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function ExportComptable() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, loading: settingsLoading, companyName, currency, currencyConfig } = useCompanySettings();
  const { customTeamId, appwriteTeamId } = useTeam();

  // ---- États principaux ----
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('fec');
  const [selectedPreset, setSelectedPreset] = useState(3);

  // ---- Dates ----
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
  });

  // ---- Prévisualisation ----
  const [previewMode, setPreviewMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // ---- PCG personnalisé ----
  const [accountMapping, setAccountMapping] = useState<AccountMapping>(getDefaultAccountMapping());
  const [pcgCustomized, setPcgCustomized] = useState(false);
  const [pcgCustomCount, setPcgCustomCount] = useState(0);
  const [activeStandard, setActiveStandard] = useState<string>('FR_PCG');

  // 🌍 Pays de l'entreprise
  const [companySettings, setCompanySettings] = useState<any>(null);

  // ✅ Statistiques de filtrage
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);

  // 🌍 Chargement paramètres entreprise
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

  const companyCountry = companySettings?.country || 'FR';
  const countryConfig: CountryConfig = useMemo(
    () => getCountryConfig(companyCountry),
    [companyCountry]
  );
  const detectedStandard = useMemo(
    () => COUNTRY_TO_STANDARD[companyCountry] || 'GENERIC',
    [companyCountry]
  );
  const standardLabel = STANDARD_LABELS[detectedStandard] || STANDARD_LABELS.GENERIC;
  const legalContext = LEGAL_CONTEXT[companyCountry] || 
                       (COUNTRY_TO_STANDARD[companyCountry] === 'SYSCOHADA' ? LEGAL_CONTEXT.SYSCOHADA : LEGAL_CONTEXT.DEFAULT);
  const availableFormats = useMemo(
    () => getExportFormats(companyCountry),
    [companyCountry]
  );

  // ============================================================
  // 🔒 VÉRIFICATION DE SÉCURITÉ INITIALE
  // ============================================================
  useEffect(() => {
    if (!permLoading && !hasPermission('reports.export')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  // ============================================================
  // ✅ CHARGEMENT DU PCG PERSONNALISÉ (avec référentiel actif)
  // ============================================================
  useEffect(() => {
    if (!customTeamId) return;
    
    loadCustomAccountMapping(customTeamId).then(({ mapping, customized, customAccounts }) => {
      setAccountMapping(mapping);
      setPcgCustomized(customized);
      setPcgCustomCount(customAccounts.length);
      // Utiliser le référentiel sauvegardé ou détecté
      if (mapping.accountingStandard) {
        setActiveStandard(mapping.accountingStandard);
      } else {
        setActiveStandard(detectedStandard);
      }
    }).catch(err => {
      console.error('Erreur chargement PCG:', err);
      setAccountMapping(getDefaultAccountMapping());
      setPcgCustomized(false);
      setPcgCustomCount(0);
      setActiveStandard(detectedStandard);
    });
  }, [customTeamId, detectedStandard]);

  // ============================================================
  // 🔒 HELPERS
  // ============================================================
  const isSecureContext = (): boolean => {
    if (!user) {
      toast.error('Session expirée', { description: 'Veuillez vous reconnecter.' });
      navigate('/login');
      return false;
    }
    if (!customTeamId || !appwriteTeamId) {
      toast.error('Erreur de sécurité', { description: 'Équipe non identifiée.' });
      navigate('/dashboard');
      return false;
    }
    return true;
  };

  const validateDates = (): { valid: boolean; error?: string } => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) return { valid: false, error: 'Date de début invalide' };
    if (isNaN(end.getTime())) return { valid: false, error: 'Date de fin invalide' };
    if (start > end) return { valid: false, error: 'La date de début doit être antérieure à la date de fin' };

    // Durée de conservation selon pays
    const retentionYears = countryConfig.retentionYears || 6;
    const limitDate = new Date();
    limitDate.setFullYear(limitDate.getFullYear() - retentionYears);
    if (start < limitDate) {
      return { 
        valid: false, 
        error: `La période ne peut pas excéder ${retentionYears} ans (durée légale ${countryConfig.name})` 
      };
    }

    return { valid: true };
  };

  // ============================================================
  // 🎯 ACTIONS
  // ============================================================
  const handlePresetChange = (idx: number) => {
    setSelectedPreset(idx);
    const { start, end } = PERIOD_PRESETS[idx].getDates();
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setPreviewMode(false);
    setExportStats(null);
  };

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') setStartDate(value);
    else setEndDate(value);
    setPreviewMode(false);
    setExportStats(null);
    setSelectedPreset(-1);
  };

  // ============================================================
  // 👁️ PRÉVISUALISATION (avec stats de filtrage)
  // ============================================================
  const handlePreview = async () => {
    if (!isSecureContext()) return;
    const dateValidation = validateDates();
    if (!dateValidation.valid) {
      toast.error('Période invalide', { description: dateValidation.error });
      return;
    }

    setLoading(true);
    setPreviewMode(false);
    try {
      const { entries: result, stats } = await generateAccountingEntries({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        teamId: customTeamId!,
        format: selectedFormat as any,
        accountingStandard: activeStandard,
      }, accountMapping);

      setExportStats(stats);

      if (result.length === 0) {
        toast.info('Aucune écriture', { 
          description: 'Aucune facture ou opération valide sur cette période.' 
        });
        setEntries([]);
        setPreviewMode(false);
        return;
      }

      setEntries(result);
      setPreviewMode(true);
      setCurrentPage(1);

      // Toast détaillé avec stats
      const excludedClients = stats.clientInvoices.excluded.draft + 
                             stats.clientInvoices.excluded.cancelled + 
                             stats.clientInvoices.excluded.rejected;
      const excludedSuppliers = stats.supplierInvoices.excluded.draft + 
                               stats.supplierInvoices.excluded.pending + 
                               stats.supplierInvoices.excluded.rejected + 
                               stats.supplierInvoices.excluded.cancelled;
      const treasuryOps = (stats as any).treasuryOperations?.total || 0;

      toast.success(`${result.length} écriture(s) générée(s)`, {
        description: `Clients : ${stats.clientInvoices.exported}/${stats.clientInvoices.total} • Fournisseurs : ${stats.supplierInvoices.exported}/${stats.supplierInvoices.total} • Trésorerie : ${treasuryOps}`,
        duration: 6000,
      });

      if (excludedClients > 0 || excludedSuppliers > 0) {
        setTimeout(() => {
          toast.info(`ℹ️ ${excludedClients + excludedSuppliers} facture(s) exclue(s)`, {
            description: 'Brouillons, annulées, rejetées et en attente ne sont pas comptabilisées',
            duration: 5000,
          });
        }, 500);
      }
    } catch (error: any) {
      toast.error('Erreur', { description: error.message || 'Veuillez réessayer' });
      setEntries([]);
      setPreviewMode(false);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 📥 EXPORT DÉFINITIF
  // ============================================================
  const handleExport = async () => {
    if (!isSecureContext()) return;
    const dateValidation = validateDates();
    if (!dateValidation.valid) {
      toast.error('Période invalide', { description: dateValidation.error });
      return;
    }

    setGenerating(true);
    try {
      const { blob, filename, entriesCount, stats } = await exportAccountingFile({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        teamId: customTeamId!,
        format: selectedFormat as any,
        accountingStandard: activeStandard,
        country: companyCountry,
        currency: currency || 'EUR',
      }, accountMapping, companyName || 'Mon Entreprise');

      if (!blob || blob.size === 0) throw new Error('Fichier vide généré');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success('Export généré avec succès !', {
        description: `${entriesCount} écriture(s) • ${filename} • ${countryConfig.flag} ${standardLabel}`,
        duration: 5000,
      });
    } catch (error: any) {
      toast.error('Erreur', { description: error.message || 'Veuillez réessayer' });
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // 📊 STATS & PAGINATION
  // ============================================================
  const periodStats = useMemo(() => {
    if (!previewMode || entries.length === 0) return null;
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    return {
      totalDebit,
      totalCredit,
      salesEntries: entries.filter(e => e.journalCode === 'VT').length,
      paymentEntries: entries.filter(e => e.journalCode === 'BQ').length,
      purchaseEntries: entries.filter(e => e.journalCode === 'AC').length,
      treasuryEntries: entries.filter(e => e.journalCode === 'OD' || e.journalCode === 'CA').length,
      uniqueAccounts: new Set(entries.map(e => e.accountNumber)).size,
      uniqueClients: new Set(entries.filter(e => e.auxAccountNumber).map(e => e.auxAccountNumber)).size,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }, [entries, previewMode]);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return entries.slice(start, start + ITEMS_PER_PAGE);
  }, [entries, currentPage]);

  const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50/50 dark:bg-slate-950">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </Sidebar>
    );
  }

  const currencySymbol = currencyConfig?.symbol || '€';
  const currencyCode = currency || 'EUR';

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50/50 dark:bg-slate-950">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg">
                {countryConfig.flag}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <BookOpen size={18} className="text-purple-600 dark:text-purple-400" />
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    Export Comptable
                  </h1>
                  <Badge tone="purple">{standardLabel}</Badge>
                  <Badge tone="slate">{currencySymbol} {currencyCode}</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {legalContext.obligationLabel} • {countryConfig.name} • Conservation {countryConfig.retentionYears} ans
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/account-mapping')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <Settings2 size={12} />
              <span className="hidden sm:inline">Paramétrer le PCG</span>
            </button>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-6">

          {/* 🌍 CARTE CONTEXTE PAYS */}
          <Card className="bg-gradient-to-br from-indigo-50 via-purple-50 to-cyan-50 dark:from-indigo-950/30 dark:via-purple-950/30 dark:to-cyan-950/30 border border-indigo-200/50 dark:border-indigo-900/50">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-3xl shadow-lg">
                {countryConfig.flag}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Export adapté à {countryConfig.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                  {legalContext.description}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Référentiel */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                      <BookOpen size={10} /> Plan comptable
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{standardLabel}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {pcgCustomized ? '✨ Personnalisé' : 'Par défaut'}
                    </p>
                  </div>

                  {/* Devise */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Devise
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {currencySymbol} {currencyCode}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {countryConfig.currencyName || countryConfig.currency}
                    </p>
                  </div>

                  {/* TVA */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {countryConfig.vat?.label || 'TVA'}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {countryConfig.vat?.enabled
                        ? `${countryConfig.vat.standardRates[0]}%`
                        : 'Non applicable'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {countryConfig.vat?.enabled
                        ? `Taux : ${countryConfig.vat.standardRates.join('%, ')}%`
                        : 'Pas de TVA'}
                    </p>
                  </div>

                  {/* Conservation */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Conservation
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {countryConfig.retentionYears} ans
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {countryConfig.vat?.isEU ? '🇪🇺 UE' : 
                       ['XOF', 'XAF'].includes(countryConfig.currency) ? '🌍 CFA' : 
                       '🌐 International'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ✅ Bandeau PCG personnalisé/défaut */}
          <div className={`rounded-xl p-3 flex items-center justify-between gap-3 ${
            pcgCustomized || pcgCustomCount > 0
              ? 'bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/50'
          }`}>
            <div className="flex items-center gap-2">
              {pcgCustomized || pcgCustomCount > 0 ? (
                <>
                  <Settings2 size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                  <p className="text-xs text-purple-900 dark:text-purple-200">
                    <strong>{standardLabel} personnalisé actif</strong> — {pcgCustomCount > 0 && `${pcgCustomCount} compte(s) custom • `}
                    Vos comptes seront utilisés pour l'export
                  </p>
                </>
              ) : (
                <>
                  <Shield size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-xs text-emerald-900 dark:text-emerald-200">
                    <strong>{standardLabel} par défaut</strong> — Cliquez sur "Paramétrer le PCG" pour personnaliser
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => navigate('/account-mapping')}
              className={`text-xs font-semibold hover:underline whitespace-nowrap ${
                pcgCustomized || pcgCustomCount > 0
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {pcgCustomized || pcgCustomCount > 0 ? 'Modifier' : 'Personnaliser'}
            </button>
          </div>

          {/* Sélection format + période */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">1. Choisissez le format d'export</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {legalContext.obligationLabel} ou format spécifique logiciel
                  </p>
                </div>
                <Download size={14} className="text-slate-400" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableFormats.map(format => {
                  const Icon = format.icon;
                  const isSelected = selectedFormat === format.value;
                  return (
                    <button
                      key={format.value}
                      onClick={() => setSelectedFormat(format.value)}
                      className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 shadow-lg shadow-purple-500/10'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                          <CheckCircle2 size={12} className="text-white" />
                        </div>
                      )}
                      <div className={`w-10 h-10 rounded-lg ${format.color} flex items-center justify-center mb-3 shadow-sm`}>
                        <Icon size={18} className="text-white" />
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${format.badgeColor}`}>
                          {format.badge}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-0.5">{format.label}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{format.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">2. Choisissez la période</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Du 1er jour au dernier jour inclus</p>
                </div>
                <Calendar size={14} className="text-slate-400" />
              </div>
              <div className="space-y-2 mb-4">
                {PERIOD_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePresetChange(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                      selectedPreset === idx
                        ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {selectedPreset === idx && <ChevronRight size={12} />}
                  </button>
                ))}
              </div>
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Date de début</label>
                  <input type="date" value={startDate} onChange={(e) => handleDateChange('start', e.target.value)} max={endDate}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Date de fin</label>
                  <input type="date" value={endDate} onChange={(e) => handleDateChange('end', e.target.value)} min={startDate}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* 💰 SOURCES DES ÉCRITURES */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database size={16} className="text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sources des écritures comptables</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Factures clients */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-lg p-4 border border-emerald-200/50 dark:border-emerald-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <ArrowDownLeft size={14} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Factures clients</span>
                </div>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  Journal des ventes (VT) • TVA collectée
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 size={10} /> Généré automatiquement
                </div>
              </div>

              {/* Factures fournisseurs */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-lg p-4 border border-amber-200/50 dark:border-amber-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <ArrowUpRight size={14} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">Factures fournisseurs</span>
                </div>
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  Journal des achats (AC) • TVA déductible
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                  <CheckCircle2 size={10} /> Uniquement validées
                </div>
              </div>

              {/* 💰 Entrées & Sorties (NOUVEAU) */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-lg p-4 border border-indigo-200/50 dark:border-indigo-900/50 ring-1 ring-indigo-100 dark:ring-indigo-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Wallet size={14} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      Entrées & Sorties
                    </span>
                    <Badge tone="indigo">✨ Nouveau</Badge>
                  </div>
                </div>
                <p className="text-[10px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                  Journal OD • Salaires, loyers, abonnements, frais bancaires...
                </p>
                <button
                  onClick={() => navigate('/cash-operations')}
                  className="mt-2 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                >
                  Gérer les opérations <ChevronRight size={10} />
                </button>
              </div>
            </div>

            <Alert tone="info" icon={Sparkles} className="mt-4">
              <p className="text-xs">
                <strong>Comptabilité complète :</strong> Toutes les opérations saisies dans{' '}
                <button onClick={() => navigate('/cash-operations')} className="underline font-semibold hover:no-underline">
                  Entrées & Sorties
                </button>{' '}
                seront automatiquement incluses dans l'export avec le numéro de compte personnalisé du plan <strong>{standardLabel}</strong>.
              </p>
            </Alert>
          </div>

          {/* Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">3. Générez votre export</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Prévisualisez les écritures avant de télécharger le fichier définitif en {currencyCode}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={handlePreview} disabled={loading || generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  Prévisualiser
                </button>
                <button onClick={handleExport} disabled={generating || loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50">
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Générer l'export
                </button>
              </div>
            </div>
          </div>

          {/* Prévisualisation */}
          {previewMode && periodStats && (
            <section className="space-y-4">
              {/* Stats principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center">
                      <TrendingUp size={14} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Écritures</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{entries.length}</div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{periodStats.uniqueAccounts} comptes • {periodStats.uniqueClients} tiers</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                      <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Équilibré</span>
                  </div>
                  <div className={`text-2xl font-bold tabular-nums ${periodStats.balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {periodStats.balanced ? 'Oui' : 'Non'}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                      <Database size={14} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total débit</span>
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{fm(periodStats.totalDebit)}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
                      <Database size={14} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total crédit</span>
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{fm(periodStats.totalCredit)}</div>
                </div>
              </div>

              {/* ✅ Bloc filtrage comptable appliqué */}
              {exportStats && (
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
                    <Filter size={14} />
                    Filtrage comptable appliqué ({standardLabel})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Factures clients */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ArrowDownLeft size={12} className="text-emerald-600" />
                          Factures clients
                        </span>
                        <Badge tone="purple">{exportStats.clientInvoices.exported}</Badge>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Total :</span>
                          <span className="font-semibold">{exportStats.clientInvoices.total}</span>
                        </div>
                        {exportStats.clientInvoices.excluded.draft > 0 && (
                          <div className="flex justify-between text-slate-500">
                            <span>❌ Brouillons :</span>
                            <span>{exportStats.clientInvoices.excluded.draft}</span>
                          </div>
                        )}
                        {exportStats.clientInvoices.excluded.rejected > 0 && (
                          <div className="flex justify-between text-red-600 dark:text-red-400">
                            <span>❌ Rejetées :</span>
                            <span>{exportStats.clientInvoices.excluded.rejected}</span>
                          </div>
                        )}
                        {exportStats.clientInvoices.excluded.cancelled > 0 && (
                          <div className="flex justify-between text-slate-500">
                            <span>❌ Annulées :</span>
                            <span>{exportStats.clientInvoices.excluded.cancelled}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Factures fournisseurs */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ArrowUpRight size={12} className="text-amber-600" />
                          Factures fournisseurs
                        </span>
                        <Badge tone="amber">{exportStats.supplierInvoices.exported}</Badge>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Total :</span>
                          <span className="font-semibold">{exportStats.supplierInvoices.total}</span>
                        </div>
                        {exportStats.supplierInvoices.excluded.pending > 0 && (
                          <div className="flex justify-between text-amber-600 dark:text-amber-400">
                            <span>⏳ En attente :</span>
                            <span>{exportStats.supplierInvoices.excluded.pending}</span>
                          </div>
                        )}
                        {exportStats.supplierInvoices.excluded.rejected > 0 && (
                          <div className="flex justify-between text-red-600 dark:text-red-400">
                            <span>❌ Rejetées :</span>
                            <span>{exportStats.supplierInvoices.excluded.rejected}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 💰 Opérations de trésorerie (NOUVEAU) */}
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-lg p-3 border border-indigo-200/50 dark:border-indigo-900/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                          <Wallet size={12} />
                          Entrées & Sorties
                        </span>
                        <Badge tone="indigo">
                          {(exportStats as any).treasuryOperations?.exported || 0}
                        </Badge>
                      </div>
                      <div className="text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
                        <div className="flex justify-between">
                          <span>Total opérations :</span>
                          <span className="font-semibold">{(exportStats as any).treasuryOperations?.total || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Entrées (💰) :</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {(exportStats as any).treasuryOperations?.inflows || 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sorties (💸) :</span>
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            {(exportStats as any).treasuryOperations?.outflows || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Alerte déséquilibre */}
              {!periodStats.balanced && (
                <Alert tone="error" icon={AlertCircle}>
                  <div>
                    <h4 className="text-sm font-semibold">Écritures déséquilibrées</h4>
                    <p className="text-xs mt-0.5">
                      Différence de {fm(Math.abs(periodStats.totalDebit - periodStats.totalCredit))}. Vérifiez vos factures et opérations.
                    </p>
                  </div>
                </Alert>
              )}

              {/* Répartition par journal (adaptée au référentiel) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
                <SectionTitle icon={BookOpen}>
                  Répartition par journal ({standardLabel})
                </SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Ventes (VT)</div>
                    <div className="text-xl font-bold text-purple-600 dark:text-purple-400 tabular-nums">{periodStats.salesEntries}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Banque (BQ)</div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{periodStats.paymentEntries}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Achats (AC)</div>
                    <div className="text-xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">{periodStats.purchaseEntries}</div>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-lg p-3 text-center ring-1 ring-indigo-100 dark:ring-indigo-900/30">
                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">OD Trésorerie</div>
                    <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{periodStats.treasuryEntries}</div>
                    <p className="text-[9px] text-indigo-500 dark:text-indigo-400 mt-0.5">Entrées & Sorties</p>
                  </div>
                </div>
              </div>

              {/* Tableau des écritures */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                  <SectionTitle icon={FileText}>
                    Prévisualisation des écritures
                    <Badge tone="purple">{entries.length} écriture(s)</Badge>
                  </SectionTitle>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Journal</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Compte</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Libellé</th>
                        <th className="text-right px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Débit</th>
                        <th className="text-right px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Crédit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedEntries.map((entry, idx) => {
                        const isTreasury = entry.journalCode === 'OD' || entry.journalCode === 'CA';
                        return (
                          <tr key={idx} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isTreasury ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                            <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                              {entry.entryDate.substring(6, 8)}/{entry.entryDate.substring(4, 6)}/{entry.entryDate.substring(0, 4)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={
                                entry.journalCode === 'VT' ? 'purple' : 
                                entry.journalCode === 'BQ' ? 'blue' : 
                                entry.journalCode === 'AC' ? 'orange' : 
                                'indigo'
                              }>
                                {entry.journalCode}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {isTreasury && <Hash size={10} className="text-indigo-500" />}
                                <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">{entry.accountNumber}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">{entry.entryLabel}</td>
                            <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">
                              {entry.debit > 0 ? fm(entry.debit) : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">
                              {entry.credit > 0 ? fm(entry.credit) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Page {currentPage} / {totalPages}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50">Précédent</button>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50">Suivant</button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Guide adapté au pays */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Guide d'import adapté à {countryConfig.name} ({standardLabel})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                  📋 {legalContext.obligationLabel}
                </h4>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Téléchargez le fichier ({selectedFormat.toUpperCase()})</li>
                  <li>Conservez-le pendant <strong>{countryConfig.retentionYears} ans</strong></li>
                  <li>Présentez-le en cas de contrôle fiscal</li>
                </ol>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2">🔌 Import dans votre logiciel</h4>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Choisissez le format de votre logiciel</li>
                  <li>Fichier → Importer → Écritures</li>
                  <li>Sélectionnez le fichier généré en {currencyCode}</li>
                </ol>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Sidebar>
  );
}
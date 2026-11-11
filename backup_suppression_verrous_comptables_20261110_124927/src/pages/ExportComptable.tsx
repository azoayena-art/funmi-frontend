// src/pages/ExportComptable.tsx — Export Comptable Multi-Pays (PREMIUM & SÉCURISÉ)
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useRateLimit } from '../hooks/useRateLimit';
import { databases, DATABASE_ID } from '../appwrite'; // ⚠️ PAS de ID ici
import { Query, ID } from 'appwrite'; // ✅ ID vient d'ici
import { toast } from 'sonner';
// ... (le reste du fichier reste inchangé)
import {
  Card, SectionTitle, Badge, SkeletonCard, Alert,
} from '../components/ui/SharedUI';
import {
  FileText, Download, FileSpreadsheet, FileCheck, Settings2,
  AlertCircle, CheckCircle2, Calendar, BookOpen, Database,
  Loader2, ChevronRight, Sparkles, TrendingUp, Shield, Filter,
  Globe, Wallet, ArrowDownLeft, ArrowUpRight, Hash, X, Clock,
  FileArchive, ArrowRight, Coins, Landmark,
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
    { value: 'csv', label: 'CSV (Excel)', description: 'Compatible Excel, LibreOffice, Sheets', icon: FileSpreadsheet, badge: 'Universel', available: true },
    { value: 'sage', label: 'Sage', description: 'Import Sage 100 / Sage 50', icon: FileText, badge: 'Sage', available: true },
    { value: 'cegid', label: 'Cegid', description: 'Import Cegid Quadra / Loop', icon: FileText, badge: 'Cegid', available: true },
    { value: 'ebp', label: 'EBP', description: 'Import EBP Compta', icon: FileText, badge: 'EBP', available: true },
    { value: 'quickbooks', label: 'QuickBooks', description: 'Import QuickBooks / Intuit', icon: FileText, badge: 'QB', available: true },
  ];

  const officialFormat = {
    value: 'fec',
    label: isFrance ? 'FEC officiel' : isOHADA ? 'Livre Journal OHADA' : 'Livre Journal',
    description: isFrance ? 'Fichier des Écritures Comptables — Format DGFiP' : isOHADA ? 'Livre journal conforme SYSCOHADA' : 'Livre journal adapté à votre référentiel',
    icon: FileCheck,
    badge: isFrance ? 'Officiel' : isOHADA ? 'OHADA' : 'Légal',
    available: true,
    isOfficial: true,
  };

  return [officialFormat, ...baseFormats];
};

const PERIOD_PRESETS = [
  { label: 'Mois en cours', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) }; } },
  { label: 'Mois dernier', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) }; } },
  { label: 'Trimestre en cours', getDates: () => { const now = new Date(); const q = Math.floor(now.getMonth() / 3); return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), q * 3 + 3, 0) }; } },
  { label: 'Année en cours', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) }; } },
  { label: 'Année dernière', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31) }; } },
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

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('fec');
  const [selectedPreset, setSelectedPreset] = useState(3);

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
  });

  const [previewMode, setPreviewMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [accountMapping, setAccountMapping] = useState<AccountMapping>(getDefaultAccountMapping());
  const [pcgCustomized, setPcgCustomized] = useState(false);
  const [pcgCustomCount, setPcgCustomCount] = useState(0);
  const [activeStandard, setActiveStandard] = useState<string>('FR_PCG');
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);

  // ✅ CORRECTIF 2 : Rate limiting sur les exports (Max 5 téléchargements par heure)
  const {
    tryConsume: tryConsumeExport,
    isBlocked: isBlockedForExport,
    remainingTimeFormatted: exportRemainingTime,
  } = useRateLimit({
    key: 'export_comptable_download',
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 heure
  });

  useEffect(() => {
    if (!customTeamId) return;
    (async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', customTeamId), Query.limit(1),
        ]);
        if (res.documents.length > 0) setCompanySettings(res.documents[0]);
      } catch (e) {
        console.warn('Paramètres entreprise non chargés:', e);
      }
    })();
  }, [customTeamId]);

  const companyCountry = companySettings?.country || 'FR';
  const countryConfig: CountryConfig = useMemo(() => getCountryConfig(companyCountry), [companyCountry]);
  const detectedStandard = useMemo(() => COUNTRY_TO_STANDARD[companyCountry] || 'GENERIC', [companyCountry]);
  const standardLabel = STANDARD_LABELS[detectedStandard] || STANDARD_LABELS.GENERIC;
  const legalContext = LEGAL_CONTEXT[companyCountry] || (COUNTRY_TO_STANDARD[companyCountry] === 'SYSCOHADA' ? LEGAL_CONTEXT.SYSCOHADA : LEGAL_CONTEXT.DEFAULT);
  const availableFormats = useMemo(() => getExportFormats(companyCountry), [companyCountry]);

  useEffect(() => {
  if (!permLoading && !hasPermission('accounting.advanced')) {
    navigate('/dashboard', { replace: true });
  }
}, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!customTeamId) return;
    loadCustomAccountMapping(customTeamId).then(({ mapping, customized, customAccounts }) => {
      setAccountMapping(mapping);
      setPcgCustomized(customized);
      setPcgCustomCount(customAccounts.length);
      setActiveStandard(mapping.accountingStandard || detectedStandard);
    }).catch(err => {
      console.error('Erreur chargement PCG:', err);
      setAccountMapping(getDefaultAccountMapping());
      setPcgCustomized(false);
      setPcgCustomCount(0);
      setActiveStandard(detectedStandard);
    });
  }, [customTeamId, detectedStandard]);

  const isSecureContext = (): boolean => {
    if (!user) { toast.error('Session expirée', { description: 'Veuillez vous reconnecter.' }); navigate('/login'); return false; }
    if (!customTeamId || !appwriteTeamId) { toast.error('Erreur de sécurité', { description: 'Équipe non identifiée.' }); navigate('/dashboard'); return false; }
    return true;
  };

  const validateDates = (): { valid: boolean; error?: string } => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime())) return { valid: false, error: 'Date de début invalide' };
    if (isNaN(end.getTime())) return { valid: false, error: 'Date de fin invalide' };
    if (start > end) return { valid: false, error: 'La date de début doit être antérieure à la date de fin' };
    const retentionYears = countryConfig.retentionYears || 6;
    const limitDate = new Date();
    limitDate.setFullYear(limitDate.getFullYear() - retentionYears);
    if (start < limitDate) return { valid: false, error: `La période ne peut pas excéder ${retentionYears} ans (durée légale ${countryConfig.name})` };
    return { valid: true };
  };

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

  const handlePreview = async () => {
    if (!isSecureContext()) return;
    const dateValidation = validateDates();
    if (!dateValidation.valid) { toast.error('Période invalide', { description: dateValidation.error }); return; }

    setLoading(true);
    setPreviewMode(false);
    try {
      const { entries: result, stats } = await generateAccountingEntries({
        startDate: new Date(startDate), endDate: new Date(endDate),
        teamId: customTeamId!, format: selectedFormat as any,
      }, accountMapping);

      setExportStats(stats);
      if (result.length === 0) {
        toast.info('Aucune écriture', { description: 'Aucune facture ou opération valide sur cette période.' });
        setEntries([]);
        setPreviewMode(false);
        return;
      }

      setEntries(result);
      setPreviewMode(true);
      setCurrentPage(1);

      const excludedClients = stats.clientInvoices.excluded.draft + stats.clientInvoices.excluded.cancelled + stats.clientInvoices.excluded.rejected;
      const excludedSuppliers = stats.supplierInvoices.excluded.draft + stats.supplierInvoices.excluded.pending + stats.supplierInvoices.excluded.rejected + stats.supplierInvoices.excluded.cancelled;
      const treasuryOps = (stats as any).treasuryOperations?.total || 0;

      toast.success(`${result.length} écriture(s) générée(s)`, {
        description: `Clients : ${stats.clientInvoices.exported}/${stats.clientInvoices.total} — Fournisseurs : ${stats.supplierInvoices.exported}/${stats.supplierInvoices.total} — Trésorerie : ${treasuryOps}`,
        duration: 6000,
      });

      if (excludedClients > 0 || excludedSuppliers > 0) {
        setTimeout(() => {
          toast.info(`${excludedClients + excludedSuppliers} facture(s) exclue(s)`, {
            description: 'Brouillons, annulées, rejetées et en attente ne sont pas comptabilisées',
            duration: 5000,
          });
        }, 500);
      }

      // ✅ CORRECTIF 1 : Log d'audit sur la prévisualisation (Consultation)
      try {
        await databases.createDocument(DATABASE_ID, 'audit_logs', ID.unique(), {
          teamId: customTeamId,
          userId: user!.$id,
          action: 'export_comptable_preview',
          resourceType: 'report',
          resourceId: '',
          severity: 'info',
          details: JSON.stringify({
            period: `${startDate} → ${endDate}`,
            format: selectedFormat,
            entriesCount: result.length,
            userAgent: navigator.userAgent.substring(0, 200),
          }),
          createdAt: new Date().toISOString(),
        });
      } catch (auditErr) {
        console.warn('Audit log non critique (Preview Export):', auditErr);
      }

    } catch (error: any) {
      toast.error('Erreur', { description: error.message || 'Veuillez réessayer' });
      setEntries([]);
      setPreviewMode(false);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!isSecureContext()) return;
    const dateValidation = validateDates();
    if (!dateValidation.valid) { toast.error('Période invalide', { description: dateValidation.error }); return; }

    // ✅ CORRECTIF 2 : Vérification du rate limit avant l'export
    const rateCheck = tryConsumeExport();
    if (!rateCheck.allowed) {
      toast.error('Trop d\'exports', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de télécharger un nouvel export.`,
      });
      return;
    }

    setGenerating(true);
    try {
      const { blob, filename, entriesCount } = await exportAccountingFile({
        startDate: new Date(startDate), endDate: new Date(endDate),
        teamId: customTeamId!, format: selectedFormat as any,
      }, accountMapping, companyName || 'Mon Entreprise', user?.$id);

      if (!blob || blob.size === 0) throw new Error('Fichier vide généré');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // ✅ CORRECTIF 1 : Log d'audit sur le téléchargement effectif (Action critique)
      try {
        await databases.createDocument(DATABASE_ID, 'audit_logs', ID.unique(), {
          teamId: customTeamId,
          userId: user!.$id,
          action: 'export_comptable_downloaded',
          resourceType: 'report',
          resourceId: '',
          severity: 'warning', // Sévérité plus élevée pour un téléchargement
          details: JSON.stringify({
            period: `${startDate} → ${endDate}`,
            format: selectedFormat,
            entriesCount,
            filename,
            userAgent: navigator.userAgent.substring(0, 200),
          }),
          createdAt: new Date().toISOString(),
        });
      } catch (auditErr) {
        console.warn('Audit log non critique (Download Export):', auditErr);
      }

      toast.success('Export généré avec succès', {
        description: `${entriesCount} écriture(s) — ${filename} — ${countryConfig.flag} ${standardLabel}`,
        duration: 5000,
      });
    } catch (error: any) {
      toast.error('Erreur', { description: error.message || 'Veuillez réessayer' });
    } finally {
      setGenerating(false);
    }
  };

  const periodStats = useMemo(() => {
    if (!previewMode || entries.length === 0) return null;
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    return {
      totalDebit, totalCredit,
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

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50/50 dark:bg-slate-950">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8 space-y-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
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
        {/* ========== TOP BAR ========== */}
        <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <FileArchive size={20} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Export Comptable
                  </h1>
                  <Badge tone="blue">{standardLabel}</Badge>
                  <Badge tone="slate">{currencySymbol} {currencyCode}</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {legalContext.obligationLabel} — {countryConfig.name} — Conservation {countryConfig.retentionYears} ans
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/account-mapping')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
            >
              <Settings2 size={12} />
              <span className="hidden sm:inline">Paramétrer le PCG</span>
            </button>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-5">

          {/* ========== 🌍 CARTE CONTEXTE PAYS (COMPACTE) ========== */}
          <Card className="!p-4 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-transparent dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-transparent border-blue-100 dark:border-blue-900/50">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-3xl">{countryConfig.flag}</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {countryConfig.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {legalContext.description.slice(0, 80)}...
                  </p>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 min-w-0">
                <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-2.5 border border-slate-200/50 dark:border-slate-800/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <BookOpen size={10} className="text-blue-500" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Plan</p>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{standardLabel}</p>
                </div>

                <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-2.5 border border-slate-200/50 dark:border-slate-800/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Coins size={10} className="text-emerald-500" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Devise</p>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{currencySymbol} {currencyCode}</p>
                </div>

                <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-2.5 border border-slate-200/50 dark:border-slate-800/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <TrendingUp size={10} className="text-purple-500" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">TVA</p>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {countryConfig.vat?.enabled ? `${countryConfig.vat.standardRates[0]}%` : 'N/A'}
                  </p>
                </div>

                <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm rounded-lg p-2.5 border border-slate-200/50 dark:border-slate-800/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Shield size={10} className="text-amber-500" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Conservation</p>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{countryConfig.retentionYears} ans</p>
                </div>
              </div>
            </div>
          </Card>

          {/* ========== BANDEAU PCG ========== */}
          <div className={`rounded-xl p-3 flex items-center justify-between gap-3 border ${
            pcgCustomized || pcgCustomCount > 0
              ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
              : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="flex items-center gap-2">
              {pcgCustomized || pcgCustomCount > 0 ? (
                <>
                  <Settings2 size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <p className="text-xs text-blue-900 dark:text-blue-200">
                    <strong>{standardLabel} personnalisé</strong>
                    {pcgCustomCount > 0 && ` — ${pcgCustomCount} compte(s) custom`}
                  </p>
                </>
              ) : (
                <>
                  <Shield size={14} className="text-slate-500 dark:text-slate-400 flex-shrink-0" />
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    <strong>{standardLabel} par défaut</strong> — Personnalisez vos comptes si nécessaire
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => navigate('/account-mapping')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap flex items-center gap-1"
            >
              {pcgCustomized || pcgCustomCount > 0 ? 'Modifier' : 'Personnaliser'}
              <ArrowRight size={10} />
            </button>
          </div>

          {/* ========== SÉLECTION FORMAT + PÉRIODE ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2 !p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">1</span>
                    Format d'export
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {legalContext.obligationLabel} ou format logiciel
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableFormats.map(format => {
                  const Icon = format.icon;
                  const isSelected = selectedFormat === format.value;
                  return (
                    <button
                      key={format.value}
                      onClick={() => setSelectedFormat(format.value)}
                      className={`relative p-3 rounded-lg border-2 transition-all text-left group ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 shadow-sm shadow-blue-500/10'
                          : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                          <CheckCircle2 size={10} className="text-white" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon size={14} className={isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'} />
                        <Badge tone={format.isOfficial ? 'blue' : 'slate'}>{format.badge}</Badge>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-0.5">{format.label}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight line-clamp-2">{format.description}</p>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card className="!p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">2</span>
                    Période
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Du 1er au dernier jour</p>
                </div>
              </div>
              <div className="space-y-1.5 mb-4">
                {PERIOD_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePresetChange(idx)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                      selectedPreset === idx
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {selectedPreset === idx && <ChevronRight size={12} />}
                  </button>
                ))}
              </div>
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Début</label>
                  <input type="date" value={startDate} onChange={(e) => handleDateChange('start', e.target.value)} max={endDate}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Fin</label>
                  <input type="date" value={endDate} onChange={(e) => handleDateChange('end', e.target.value)} min={startDate}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-slate-900 dark:text-white" />
                </div>
              </div>
            </Card>
          </div>

          {/* ========== SOURCES DES ÉCRITURES ========== */}
          <Card className="!p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database size={14} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Sources des écritures</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg p-3 border border-emerald-200/50 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <ArrowDownLeft size={14} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Factures clients</span>
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-400">Journal des ventes (VT) — TVA collectée</p>
              </div>

              <div className="rounded-lg p-3 border border-amber-200/50 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <ArrowUpRight size={14} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Factures fournisseurs</span>
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-400">Journal des achats (AC) — TVA déductible</p>
              </div>

              <div className="rounded-lg p-3 border border-indigo-200/50 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <Wallet size={14} className="text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Entrées & Sorties</span>
                  <Badge tone="indigo">Trésorerie</Badge>
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-400">Salaires, loyers, abonnements, opérations diverses...</p>
                <button onClick={() => navigate('/cash-operations')} className="mt-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-0.5">
                  Gérer les opérations <ChevronRight size={9} />
                </button>
              </div>
            </div>
          </Card>

          {/* ========== BOUTONS D'ACTION ========== */}
          <Card className="!p-5 bg-gradient-to-br from-blue-50/30 to-transparent dark:from-blue-950/10 dark:to-transparent border-blue-100 dark:border-blue-900/50">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">3</span>
                  Générez votre export
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Prévisualisez avant de télécharger en {currencyCode}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={handlePreview} disabled={loading || generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  Prévisualiser
                </button>
                <button 
                  onClick={handleExport} 
                  disabled={generating || loading || isBlockedForExport}
                  title={isBlockedForExport ? `Bloqué : réessayez dans ${exportRemainingTime}` : undefined}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {isBlockedForExport ? `Bloqué (${exportRemainingTime})` : 'Générer l\'export'}
                </button>
              </div>
            </div>
          </Card>

          {/* ========== PRÉVISUALISATION ========== */}
          {previewMode && periodStats && (
            <section className="space-y-4">
              {/* Stats principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Écritures</span>
                    <TrendingUp size={12} className="text-blue-500" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{entries.length}</div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{periodStats.uniqueAccounts} comptes — {periodStats.uniqueClients} tiers</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Équilibré</span>
                    <CheckCircle2 size={12} className={periodStats.balanced ? 'text-emerald-500' : 'text-red-500'} />
                  </div>
                  <div className={`text-xl font-bold tabular-nums ${periodStats.balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {periodStats.balanced ? 'Oui' : 'Non'}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Débit</span>
                    <Database size={12} className="text-emerald-500" />
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{fm(periodStats.totalDebit)}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Crédit</span>
                    <Database size={12} className="text-rose-500" />
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{fm(periodStats.totalCredit)}</div>
                </div>
              </div>

              {/* Filtrage appliqué */}
              {exportStats && (
                <Card className="!p-4 bg-blue-50/40 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/50">
                  <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
                    <Filter size={12} />
                    Filtrage appliqué ({standardLabel})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ArrowDownLeft size={11} className="text-emerald-600" />
                          Clients
                        </span>
                        <Badge tone="blue">{exportStats.clientInvoices.exported}</Badge>
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-400 space-y-0.5">
                        <div className="flex justify-between"><span>Total :</span><span className="font-semibold">{exportStats.clientInvoices.total}</span></div>
                        {exportStats.clientInvoices.excluded.draft > 0 && <div className="flex justify-between text-slate-500"><span className="flex items-center gap-0.5"><X size={8} /> Brouillons</span><span>{exportStats.clientInvoices.excluded.draft}</span></div>}
                        {exportStats.clientInvoices.excluded.rejected > 0 && <div className="flex justify-between text-red-500"><span className="flex items-center gap-0.5"><X size={8} /> Rejetées</span><span>{exportStats.clientInvoices.excluded.rejected}</span></div>}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ArrowUpRight size={11} className="text-amber-600" />
                          Fournisseurs
                        </span>
                        <Badge tone="blue">{exportStats.supplierInvoices.exported}</Badge>
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-400 space-y-0.5">
                        <div className="flex justify-between"><span>Total :</span><span className="font-semibold">{exportStats.supplierInvoices.total}</span></div>
                        {exportStats.supplierInvoices.excluded.pending > 0 && <div className="flex justify-between text-amber-500"><span className="flex items-center gap-0.5"><Clock size={8} /> En attente</span><span>{exportStats.supplierInvoices.excluded.pending}</span></div>}
                        {exportStats.supplierInvoices.excluded.rejected > 0 && <div className="flex justify-between text-red-500"><span className="flex items-center gap-0.5"><X size={8} /> Rejetées</span><span>{exportStats.supplierInvoices.excluded.rejected}</span></div>}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Wallet size={11} className="text-indigo-600" />
                          Trésorerie
                        </span>
                        <Badge tone="indigo">{(exportStats as any).treasuryOperations?.exported || 0}</Badge>
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-400 space-y-0.5">
                        <div className="flex justify-between"><span>Total :</span><span className="font-semibold">{(exportStats as any).treasuryOperations?.total || 0}</span></div>
                        <div className="flex justify-between text-emerald-600"><span>Entrées</span><span className="font-semibold">{(exportStats as any).treasuryOperations?.inflows || 0}</span></div>
                        <div className="flex justify-between text-rose-600"><span>Sorties</span><span className="font-semibold">{(exportStats as any).treasuryOperations?.outflows || 0}</span></div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Alerte déséquilibre */}
              {!periodStats.balanced && (
                <Alert tone="error" icon={AlertCircle}>
                  <div>
                    <h4 className="text-sm font-semibold">Écritures déséquilibrées</h4>
                    <p className="text-xs mt-0.5">Différence de {fm(Math.abs(periodStats.totalDebit - periodStats.totalCredit))}. Vérifiez vos factures et opérations.</p>
                  </div>
                </Alert>
              )}

              {/* Répartition par journal */}
              <Card className="!p-5">
                <SectionTitle icon={BookOpen}>Répartition par journal ({standardLabel})</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Ventes (VT)</div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{periodStats.salesEntries}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Banque (BQ)</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{periodStats.paymentEntries}</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5 text-center">
                    <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Achats (AC)</div>
                    <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">{periodStats.purchaseEntries}</div>
                  </div>
                  <div className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg p-2.5 text-center border border-indigo-100 dark:border-indigo-900/50">
                    <div className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-0.5">OD Trésorerie</div>
                    <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{periodStats.treasuryEntries}</div>
                  </div>
                </div>
              </Card>

              {/* Tableau des écritures */}
              <Card className="!p-0 overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                  <SectionTitle icon={FileText}>
                    Prévisualisation des écritures
                    <Badge tone="blue">{entries.length}</Badge>
                  </SectionTitle>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Journal</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Compte</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Libellé</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Débit</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Crédit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedEntries.map((entry, idx) => {
                        const isTreasury = entry.journalCode === 'OD' || entry.journalCode === 'CA';
                        
                        const safeAccountNumber = typeof entry.accountNumber === 'string' ? entry.accountNumber : '-';
                        const safeEntryLabel = typeof entry.entryLabel === 'string' ? entry.entryLabel : '-';
                        const safeJournalCode = typeof entry.journalCode === 'string' ? entry.journalCode : '-';
                        
                        return (
                          <tr key={idx} className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors ${isTreasury ? 'bg-indigo-50/20 dark:bg-indigo-950/5' : ''}`}>
                            <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                              {entry.entryDate.substring(6, 8)}/{entry.entryDate.substring(4, 6)}/{entry.entryDate.substring(0, 4)}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge tone={
                                safeJournalCode === 'VT' ? 'blue' :
                                safeJournalCode === 'BQ' ? 'emerald' :
                                safeJournalCode === 'AC' ? 'amber' : 'indigo'
                              }>{safeJournalCode}</Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                {isTreasury && <Hash size={9} className="text-indigo-500" />}
                                {safeAccountNumber}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">{safeEntryLabel}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">
                              {entry.debit > 0 ? fm(entry.debit) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">
                              {entry.credit > 0 ? fm(entry.credit) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Page {currentPage} / {totalPages}</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-50 transition-colors">Précédent</button>
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-50 transition-colors">Suivant</button>
                    </div>
                  </div>
                )}
              </Card>
            </section>
          )}

          {/* ========== GUIDE D'IMPORT ========== */}
          <Card className="!p-5 bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <Globe size={14} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Guide d'import ({standardLabel})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <FileCheck size={12} className="text-blue-500" />
                  {legalContext.obligationLabel}
                </h4>
                <ol className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Téléchargez le fichier ({selectedFormat.toUpperCase()})</li>
                  <li>Conservez-le <strong>{countryConfig.retentionYears} ans</strong></li>
                  <li>Présentez-le en cas de contrôle fiscal</li>
                </ol>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <Landmark size={12} className="text-blue-500" />
                  Import dans votre logiciel
                </h4>
                <ol className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Choisissez le format de votre logiciel</li>
                  <li>Fichier → Importer → Écritures</li>
                  <li>Sélectionnez le fichier généré en {currencyCode}</li>
                </ol>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </Sidebar>
  );
}
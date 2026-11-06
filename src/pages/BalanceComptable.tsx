// src/pages/BalanceComptable.tsx
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useRateLimit } from '../hooks/useRateLimit'; // ✅ CORRECTIF 2 : Hook de rate limiting
import { databases, DATABASE_ID } from '../appwrite'; 
import { Query, ID } from 'appwrite'; // ✅ CORRECTIF 1 : ID vient de 'appwrite', pas de '../appwrite'
import { toast } from 'sonner';
import { Card, Badge, Input } from '../components/ui/SharedUI';
import {
  FileText, Download, Settings2, AlertCircle, CheckCircle2,
  BookOpen, Database, Loader2, TrendingUp, TrendingDown, Scale, Search,
  ArrowLeft, Filter, Eye, EyeOff, BookOpenCheck, BookText, Printer,
  ChevronRight, Info, Landmark, X
} from 'lucide-react';
import {
  generateAccountingEntries,
  generateTrialBalance,
  generateBalanceCSV,
  type JournalEntry,
  type AccountMapping,
  type TrialBalanceAccount,
  DEFAULT_ACCOUNT_MAPPING,
} from '../services/accountingExportService';
import { loadCustomAccountMapping } from '../services/accountMappingService';

const PERIOD_PRESETS = [
  { label: 'Mois en cours', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) }; } },
  { label: 'Trimestre en cours', getDates: () => { const now = new Date(); const q = Math.floor(now.getMonth() / 3); return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), q * 3 + 3, 0) }; } },
  { label: 'Année en cours', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) }; } },
  { label: 'Année dernière', getDates: () => { const now = new Date(); return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31) }; } },
];

const ACCOUNT_CLASSES = [
  { value: '', label: 'Toutes les classes', color: 'slate' },
  { value: '1', label: 'Classe 1 - Capitaux', color: 'blue' },
  { value: '2', label: 'Classe 2 - Immobilisations', color: 'indigo' },
  { value: '3', label: 'Classe 3 - Stocks', color: 'purple' },
  { value: '4', label: 'Classe 4 - Tiers', color: 'pink' },
  { value: '5', label: 'Classe 5 - Financiers', color: 'rose' },
  { value: '6', label: 'Classe 6 - Charges', color: 'orange' },
  { value: '7', label: 'Classe 7 - Produits', color: 'emerald' },
];

export default function BalanceComptable() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, loading: settingsLoading, companyName, currency, currencyConfig } = useCompanySettings();
  const { customTeamId } = useTeam();

  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<TrialBalanceAccount[]>([]);
  const [selectedPreset, setSelectedPreset] = useState(2);
  const [searchTerm, setSearchTerm] = useState('');
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]);

  const [accountMapping, setAccountMapping] = useState<AccountMapping>(DEFAULT_ACCOUNT_MAPPING);

  // ✅ CORRECTIF 2 : Rate limiting sur les exports (Max 5 téléchargements par heure)
  const {
    tryConsume: tryConsumeExport,
    isBlocked: isBlockedForExport,
    remainingTimeFormatted: exportRemainingTime,
  } = useRateLimit({
    key: 'balance_export',
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 heure
  });

  useEffect(() => {
    if (!permLoading && !hasPermission('reports.export')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!customTeamId) return;
    loadCustomAccountMapping(customTeamId)
      .then(({ mapping }) => setAccountMapping(mapping))
      .catch(() => setAccountMapping(DEFAULT_ACCOUNT_MAPPING));
  }, [customTeamId]);

  const isSecureContext = useCallback((): boolean => {
    if (!user || !customTeamId) {
      toast.error('Session invalide');
      return false;
    }
    return true;
  }, [user, customTeamId]);

  const handleGenerate = useCallback(async () => {
    if (!isSecureContext()) return;
    setLoading(true);
    try {
      const { entries } = await generateAccountingEntries({
        startDate: new Date(`${startDate}T00:00:00`),
        endDate: new Date(`${endDate}T23:59:59`),
        teamId: customTeamId!,
        format: 'csv',
      }, accountMapping);

      const trialBalance = generateTrialBalance(entries);
      setBalance(trialBalance);

      if (trialBalance.length === 0) {
        toast.info('Aucune donnée', { description: 'Aucune écriture comptable sur cette période.' });
      } else {
        toast.success('Balance générée', { description: `${trialBalance.length} comptes analysés.` });
      }

      // ✅ CORRECTIF 1 : Log d'audit sur la consultation de la Balance (Traçabilité)
      try {
        const totalDebit = trialBalance.reduce((sum, a) => sum + a.debit, 0);
        const totalCredit = trialBalance.reduce((sum, a) => sum + a.credit, 0);
        
        await databases.createDocument(DATABASE_ID, 'audit_logs', ID.unique(), {
          teamId: customTeamId,
          userId: user!.$id,
          action: 'balance_consulted',
          resourceType: 'report',
          resourceId: '',
          severity: 'info',
          details: JSON.stringify({
            period: `${startDate} → ${endDate}`,
            accountsAnalyzed: trialBalance.length,
            totalDebit,
            totalCredit,
            userAgent: navigator.userAgent.substring(0, 200),
          }),
          createdAt: new Date().toISOString(),
        });
      } catch (auditErr) {
        console.warn('Audit log non critique (Balance):', auditErr);
      }

    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setLoading(false);
    }
  }, [isSecureContext, startDate, endDate, customTeamId, accountMapping, user]);

  const handleExportCSV = useCallback(() => {
    if (balance.length === 0) return;
    
    // ✅ CORRECTIF 2 : Vérification du rate limit avant l'export
    const rateCheck = tryConsumeExport();
    if (!rateCheck.allowed) {
      toast.error('Trop d\'exports', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de télécharger un nouvel export.`,
      });
      return;
    }

    const blob = generateBalanceCSV(balance);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Balance_Comptable_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  }, [balance, startDate, endDate, tryConsumeExport]);

  const handlePrint = useCallback(() => {
    if (balance.length === 0) return;
    window.print();
    toast.success('Préparation de l\'impression');
  }, [balance]);

  const handlePresetChange = useCallback((idx: number) => {
    setSelectedPreset(idx);
    const { start, end } = PERIOD_PRESETS[idx].getDates();
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setBalance([]);
  }, []);

  const handleDrillDown = useCallback((accountNumber: string) => {
    navigate(`/grand-livre?account=${accountNumber}&start=${startDate}&end=${endDate}`);
  }, [navigate, startDate, endDate]);

  // Statistiques globales + par classe
  const stats = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let totalDebitBalance = 0;
    let totalCreditBalance = 0;
    let activeAccounts = 0;

    const byClass: Record<string, { debit: number; credit: number; balance: number; count: number; label: string }> = {
      '1': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Capitaux' },
      '2': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Immobilisations' },
      '3': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Stocks' },
      '4': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Tiers' },
      '5': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Financiers' },
      '6': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Charges' },
      '7': { debit: 0, credit: 0, balance: 0, count: 0, label: 'Produits' },
    };

    balance.forEach(acc => {
      totalDebit += acc.debit;
      totalCredit += acc.credit;

      if (acc.debit > 0 || acc.credit > 0) activeAccounts++;

      if (acc.balance > 0) {
        totalDebitBalance += acc.balance;
      } else if (acc.balance < 0) {
        totalCreditBalance += Math.abs(acc.balance);
      }

      if (byClass[acc.accountClass]) {
        byClass[acc.accountClass].debit += acc.debit;
        byClass[acc.accountClass].credit += acc.credit;
        byClass[acc.accountClass].balance += acc.balance;
        byClass[acc.accountClass].count += 1;
      }
    });

    return {
      totalDebit,
      totalCredit,
      totalDebitBalance,
      totalCreditBalance,
      activeAccounts,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      byClass,
    };
  }, [balance]);

  // Filtrage du tableau
  const filteredBalance = useMemo(() => {
    return balance.filter(acc => {
      const matchesSearch = acc.accountNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            acc.accountLabel.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesZero = showZeroBalances || acc.balance !== 0 || acc.debit > 0 || acc.credit > 0;
      const matchesClass = !selectedClass || acc.accountClass === selectedClass;
      return matchesSearch && matchesZero && matchesClass;
    });
  }, [balance, searchTerm, showZeroBalances, selectedClass]);

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      </Sidebar>
    );
  }

  const currencySymbol = currencyConfig?.symbol || '€';

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950 print:bg-white">
        {/* ========== HEADER ========== */}
        <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 print:hidden">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label="Retour"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Scale size={18} className="text-blue-600 dark:text-blue-400" />
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Balance Comptable</h1>
                  <Badge tone="blue">PCG / SYSCOHADA</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Synthèse des mouvements par compte — {companyName} • {currency}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/journal')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all"
              >
                <BookText size={12} />
                <span className="hidden sm:inline">Journal</span>
              </button>
              <button
                onClick={() => navigate('/grand-livre')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 transition-all"
              >
                <BookOpenCheck size={12} />
                <span className="hidden sm:inline">Grand Livre</span>
              </button>
              <button
                onClick={() => navigate('/account-mapping')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all"
              >
                <Settings2 size={12} />
                <span className="hidden sm:inline">Plan Comptable</span>
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-5">

          {/* ========== CONTRÔLES ET PÉRIODE ========== */}
          <Card className="!p-5 print:hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">1</span>
                  Période d'analyse
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {PERIOD_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePresetChange(idx)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${selectedPreset === idx ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Début</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); setBalance([]); }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Fin</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); setBalance([]); }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-end gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  Générer la Balance
                </button>
                {balance.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportCSV}
                      disabled={isBlockedForExport}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isBlockedForExport ? `Bloqué : réessayez dans ${exportRemainingTime}` : 'Télécharger le CSV'}
                    >
                      <Download size={14} />
                      CSV
                    </button>
                    <button
                      onClick={handlePrint}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all"
                    >
                      <Printer size={14} />
                      Imprimer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* ========== STATS GLOBALES ========== */}
          {balance.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Débit</span>
                    <TrendingUp size={12} className="text-emerald-500" />
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{fm(stats.totalDebit)}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Crédit</span>
                    <TrendingDown size={12} className="text-rose-500" />
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{fm(stats.totalCredit)}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Comptes actifs</span>
                    <BookOpen size={12} className="text-blue-500" />
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{stats.activeAccounts}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Équilibre</span>
                    {stats.balanced ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertCircle size={12} className="text-red-500" />}
                  </div>
                  <div className={`text-lg font-bold tabular-nums ${stats.balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stats.balanced ? 'Équilibré' : 'Écart détecté'}
                  </div>
                </div>
              </div>

              {/* Bandeau d'équilibre comptable */}
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium ${stats.balanced ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'}`}>
                {stats.balanced ? (
                  <>
                    <Info size={14} />
                    <span>La balance est <strong>équilibrée</strong> : Total Débit = Total Crédit = {fm(stats.totalDebit)}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    <span>Écart détecté de <strong>{fm(Math.abs(stats.totalDebit - stats.totalCredit))}</strong> entre débits et crédits. Vérifiez vos écritures.</span>
                  </>
                )}
              </div>

              {/* Répartition par classe */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {Object.entries(stats.byClass).map(([cls, data]) => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(selectedClass === cls ? '' : cls)}
                    className={`p-2.5 rounded-lg border transition-all text-left ${selectedClass === cls ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Classe {cls}</span>
                      {data.count > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{data.count}</span>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate mb-1">{data.label}</p>
                    {data.count > 0 ? (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500 dark:text-slate-400">D</span>
                          <span className="font-bold tabular-nums text-slate-900 dark:text-white">{fm(data.debit)}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500 dark:text-slate-400">C</span>
                          <span className="font-bold tabular-nums text-slate-900 dark:text-white">{fm(data.credit)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">—</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ========== HEADER IMPRESSION ========== */}
          <div className="hidden print:block p-6 border-b-2 border-slate-900">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{companyName}</h2>
                <p className="text-sm text-slate-600 mt-1">Balance Comptable Générale</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-600">Période</p>
                <p className="text-sm font-bold">{startDate} au {endDate}</p>
                <p className="text-xs text-slate-600 mt-1">Devise : {currency}</p>
              </div>
            </div>
          </div>

          {/* ========== TABLEAU DE LA BALANCE ========== */}
          {balance.length > 0 && (
            <Card className="!p-0 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Détail par compte</h3>
                  <Badge tone="slate">{filteredBalance.length}</Badge>
                  {selectedClass && (
                    <button
                      onClick={() => setSelectedClass('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 transition-colors"
                    >
                      {ACCOUNT_CLASSES.find(c => c.value === selectedClass)?.label}
                      <X size={10} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Rechercher un compte..."
                      value={searchTerm}
                      onChange={(e: any) => setSearchTerm(e.target.value)}
                      className="pl-9 w-full sm:w-64"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-800 hover:border-blue-300"
                  >
                    <Filter size={12} />
                    <ChevronRight size={12} className={`transition-transform ${showFilters ? 'rotate-90' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShowZeroBalances(!showZeroBalances)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${showZeroBalances ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-800'}`}
                  >
                    {showZeroBalances ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span className="hidden sm:inline">{showZeroBalances ? 'Masquer les nuls' : 'Afficher les nuls'}</span>
                  </button>
                </div>
              </div>

              {/* Filtres avancés */}
              {showFilters && (
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:hidden">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Filtrer par classe de compte</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                    {ACCOUNT_CLASSES.map(cls => (
                      <button
                        key={cls.value}
                        onClick={() => setSelectedClass(cls.value)}
                        className={`px-2 py-1.5 text-[10px] font-medium rounded-lg transition-all ${selectedClass === cls.value ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                      >
                        {cls.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">N° Compte</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Intitulé</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mouvements Débit</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mouvements Crédit</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Solde Débiteur</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Solde Créditeur</th>
                      <th className="w-10 print:hidden"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBalance.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                          Aucun compte ne correspond aux filtres appliqués.
                        </td>
                      </tr>
                    )}
                    {filteredBalance.map((acc) => (
                      <tr
                        key={acc.accountNumber}
                        onClick={() => handleDrillDown(acc.accountNumber)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-mono font-semibold ${
                            acc.accountClass === '1' || acc.accountClass === '2' || acc.accountClass === '5' ? 'text-blue-600 dark:text-blue-400' :
                            acc.accountClass === '3' || acc.accountClass === '4' ? 'text-amber-600 dark:text-amber-400' :
                            acc.accountClass === '6' ? 'text-rose-600 dark:text-rose-400' :
                            'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {acc.accountNumber}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-medium truncate max-w-xs">{acc.accountLabel}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-900 dark:text-white font-semibold">
                          {acc.debit > 0 ? fm(acc.debit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-900 dark:text-white font-semibold">
                          {acc.credit > 0 ? fm(acc.credit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {acc.balance > 0 ? fm(acc.balance) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums font-bold text-rose-600 dark:text-rose-400">
                          {acc.balance < 0 ? fm(Math.abs(acc.balance)) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right print:hidden">
                          <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Totaux</td>
                      <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">{fm(stats.totalDebit)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">{fm(stats.totalCredit)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fm(stats.totalDebitBalance)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-rose-600 dark:text-rose-400">{fm(stats.totalCreditBalance)}</td>
                      <td className="print:hidden"></td>
                    </tr>
                    {!stats.balanced && (
                      <tr className="bg-rose-50 dark:bg-rose-950/20">
                        <td colSpan={4} className="px-4 py-2 text-xs font-bold text-rose-700 dark:text-rose-400">Écart</td>
                        <td colSpan={2} className="px-4 py-2 text-xs font-bold text-right tabular-nums text-rose-700 dark:text-rose-400">
                          {fm(Math.abs(stats.totalDebitBalance - stats.totalCreditBalance))}
                        </td>
                        <td className="print:hidden"></td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {/* Astuce drill-down */}
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-900/30 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 print:hidden">
                <Info size={14} />
                <span>Cliquez sur une ligne pour voir le <strong>détail des écritures</strong> dans le Grand Livre.</span>
              </div>
            </Card>
          )}

          {/* ========== ÉTAT VIDE ========== */}
          {balance.length === 0 && !loading && (
            <Card className="!p-10 text-center print:hidden">
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-4">
                <Scale size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Aucune balance générée</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                Sélectionnez une période et cliquez sur "Générer la Balance" pour visualiser la synthèse de vos écritures comptables par compte.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => navigate('/journal')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all"
                >
                  <BookText size={14} />
                  Voir le Journal
                </button>
                <button
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  <Database size={14} />
                  Générer maintenant
                </button>
              </div>
            </Card>
          )}
        </main>

        {/* Styles d'impression */}
        <style>{`
          @media print {
            @page {
              size: A4 landscape;
              margin: 1cm;
            }
            body * {
              visibility: hidden;
            }
            .print\\:block, .print\\:block * {
              visibility: visible;
            }
            .print\\:hidden {
              display: none !important;
            }
            table {
              font-size: 10px;
            }
            th, td {
              padding: 4px 8px !important;
            }
          }
        `}</style>
      </div>
    </Sidebar>
  );
}
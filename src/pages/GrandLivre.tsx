// src/pages/GrandLivre.tsx
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Card, Badge, Input } from '../components/ui/SharedUI';
import {
  BookOpenCheck, Download, Settings2, Loader2, Database, Search,
  ArrowLeft, FileText, Eye, EyeOff, Landmark, Printer, TrendingUp,
  TrendingDown, Filter, ChevronRight, Info, X
} from 'lucide-react';
import {
  generateAccountingEntries,
  generateGeneralLedger,
  generateGeneralLedgerCSV,
  formatDateFEC,
  type AccountMapping,
  type GeneralLedgerAccount,
} from '../services/accountingExportService';
import { loadCustomAccountMapping, getDefaultAccountMapping } from '../services/accountMappingService';

const PERIOD_PRESETS = [
  { label: 'Mois en cours', getDates: () => { const n = new Date(); return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 0) }; } },
  { label: 'Trimestre en cours', getDates: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3); return { start: new Date(n.getFullYear(), q * 3, 1), end: new Date(n.getFullYear(), q * 3 + 3, 0) }; } },
  { label: 'Année en cours', getDates: () => { const n = new Date(); return { start: new Date(n.getFullYear(), 0, 1), end: new Date(n.getFullYear(), 11, 31) }; } },
  { label: 'Année dernière', getDates: () => { const n = new Date(); return { start: new Date(n.getFullYear() - 1, 0, 1), end: new Date(n.getFullYear() - 1, 11, 31) }; } },
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

const fmtDate = (ymd: string) => (ymd?.length === 8 ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : ymd || '');

export default function GrandLivre() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, loading: settingsLoading, companyName, currency } = useCompanySettings();
  const { customTeamId } = useTeam();

  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<GeneralLedgerAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(2);
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]);
  const [accountMapping, setAccountMapping] = useState<AccountMapping>(getDefaultAccountMapping());

  // ✅ CORRECTIF 2 : Rate limiting sur les exports (Max 5 téléchargements par heure)
  const {
    tryConsume: tryConsumeExport,
    isBlocked: isBlockedForExport,
    remainingTimeFormatted: exportRemainingTime,
  } = useRateLimit({
    key: 'grand_livre_export',
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
      .catch(() => setAccountMapping(getDefaultAccountMapping()));
  }, [customTeamId]);

  const handleGenerate = useCallback(async () => {
    if (!user || !customTeamId) {
      toast.error('Session invalide');
      return;
    }
    setLoading(true);
    try {
      const { entries } = await generateAccountingEntries({
        startDate: new Date('2000-01-01T00:00:00'),
        endDate: new Date(`${endDate}T23:59:59`),
        teamId: customTeamId,
        format: 'csv',
      }, accountMapping);

      const result = generateGeneralLedger(entries, formatDateFEC(new Date(`${startDate}T00:00:00`)));
      setLedger(result);

      const first = result.find(a => a.lines.length > 0 || a.openingBalance !== 0);
      setSelectedAccount(first ? first.accountNumber : null);

      const moved = result.filter(a => a.lines.length > 0).length;
      if (moved === 0) {
        toast.info('Aucun mouvement', { description: 'Aucune écriture sur cette période.' });
      } else {
        toast.success('Grand livre généré', { description: `${moved} comptes mouvementés.` });
      }

      // ✅ CORRECTIF 1 : Log d'audit sur la consultation du Grand Livre (Traçabilité)
      try {
        const totalDebit = result.reduce((sum, a) => sum + a.totalDebit, 0);
        const totalCredit = result.reduce((sum, a) => sum + a.totalCredit, 0);
        
        await databases.createDocument(DATABASE_ID, 'audit_logs', ID.unique(), {
          teamId: customTeamId,
          userId: user.$id,
          action: 'grand_livre_consulted',
          resourceType: 'report',
          resourceId: '', // Chaîne vide si null n'est pas autorisé par le schéma Appwrite
          severity: 'info',
          details: JSON.stringify({
            period: `${startDate} → ${endDate}`,
            accountsMoved: moved,
            totalDebit,
            totalCredit,
            userAgent: navigator.userAgent.substring(0, 200),
          }),
          createdAt: new Date().toISOString(),
        });
      } catch (auditErr) {
        // Échec silencieux pour ne pas bloquer l'UX si le log échoue
        console.warn('Audit log non critique (Grand Livre):', auditErr);
      }

    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setLoading(false);
    }
  }, [user, customTeamId, startDate, endDate, accountMapping]);

  const handleExportCSV = useCallback(() => {
    if (ledger.length === 0) return;
    
    // ✅ CORRECTIF 2 : Vérification du rate limit avant l'export
    const rateCheck = tryConsumeExport();
    if (!rateCheck.allowed) {
      toast.error('Trop d\'exports', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de télécharger un nouvel export.`,
      });
      return;
    }

    const blob = generateGeneralLedgerCSV(ledger);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Grand_Livre_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  }, [ledger, startDate, endDate, tryConsumeExport]);

  const handlePrint = useCallback(() => {
    if (ledger.length === 0) return;
    window.print();
    toast.success('Préparation de l\'impression');
  }, [ledger]);

  const handlePresetChange = useCallback((idx: number) => {
    setSelectedPreset(idx);
    const { start, end } = PERIOD_PRESETS[idx].getDates();
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setLedger([]);
    setSelectedAccount(null);
  }, []);

  // Statistiques globales
  const stats = useMemo(() => {
    let totalDebit = 0, totalCredit = 0, accounts = 0, lines = 0;
    const byClass: Record<string, { debit: number; credit: number; count: number }> = {};
    
    ledger.forEach(a => {
      if (a.lines.length > 0) accounts++;
      totalDebit += a.totalDebit;
      totalCredit += a.totalCredit;
      lines += a.lines.length;
      
      if (!byClass[a.accountClass]) {
        byClass[a.accountClass] = { debit: 0, credit: 0, count: 0 };
      }
      byClass[a.accountClass].debit += a.totalDebit;
      byClass[a.accountClass].credit += a.totalCredit;
      byClass[a.accountClass].count += 1;
    });
    
    return { totalDebit, totalCredit, accounts, lines, balanced: Math.abs(totalDebit - totalCredit) < 0.01, byClass };
  }, [ledger]);

  // Liste des comptes (filtrée)
  const accountsList = useMemo(() => {
    return ledger.filter(a => {
      const hasActivity = a.lines.length > 0 || a.openingBalance !== 0;
      if (!showEmpty && !hasActivity) return false;
      
      if (selectedClass && a.accountClass !== selectedClass) return false;
      
      if (!search) return true;
      const s = search.toLowerCase();
      return a.accountNumber.includes(s) || a.accountLabel.toLowerCase().includes(s);
    });
  }, [ledger, search, showEmpty, selectedClass]);

  const selected = useMemo(
    () => ledger.find(a => a.accountNumber === selectedAccount) || null,
    [ledger, selectedAccount]
  );

  if (permLoading || settingsLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      </Sidebar>
    );
  }

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
                  <BookOpenCheck size={18} className="text-blue-600 dark:text-blue-400" />
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Grand Livre</h1>
                  <Badge tone="blue">PCG / SYSCOHADA</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Détail des écritures compte par compte — {companyName} • {currency}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => navigate('/balance-comptable')} 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all"
              >
                <FileText size={12} />
                <span className="hidden sm:inline">Balance</span>
              </button>
              <button 
                onClick={() => navigate('/account-mapping')} 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all"
              >
                <Settings2 size={12} />
                <span className="hidden sm:inline">Paramétrer le PCG</span>
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-5">
          {/* ========== PÉRIODE ========== */}
          <Card className="!p-5 print:hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">1</span>
                  Période consultée
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
                      onChange={(e) => { setStartDate(e.target.value); setLedger([]); setSelectedAccount(null); }} 
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white" 
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Fin</label>
                    <input 
                      type="date" 
                      value={endDate} 
                      onChange={(e) => { setEndDate(e.target.value); setLedger([]); setSelectedAccount(null); }} 
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
                  Générer le Grand Livre
                </button>
                {ledger.length > 0 && (
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

          {/* ========== STATS ========== */}
          {ledger.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Comptes mouvementés</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{stats.accounts}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Écritures</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{stats.lines}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Total Débit</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{fm(stats.totalDebit)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Total Crédit</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{fm(stats.totalCredit)}</p>
                </div>
              </div>

              {/* Équilibre comptable */}
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium ${stats.balanced ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'}`}>
                {stats.balanced ? (
                  <>
                    <Info size={14} />
                    <span>Le grand livre est <strong>équilibré</strong> : Total Débit = Total Crédit</span>
                  </>
                ) : (
                  <>
                    <Info size={14} />
                    <span>Écart détecté de <strong>{fm(Math.abs(stats.totalDebit - stats.totalCredit))}</strong> entre débits et crédits</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ========== GRAND LIVRE : LISTE + DÉTAIL ========== */}
          {ledger.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Colonne comptes */}
              <Card className="!p-0 overflow-hidden lg:col-span-1 print:hidden">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input 
                      type="text" 
                      placeholder="Rechercher un compte..." 
                      value={search} 
                      onChange={(e: any) => setSearch(e.target.value)} 
                      className="pl-9" 
                    />
                  </div>
                  
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-lg border transition-all bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-800 hover:border-blue-300"
                  >
                    <Filter size={11} />
                    Filtres avancés
                    <ChevronRight size={11} className={`transition-transform ${showFilters ? 'rotate-90' : ''}`} />
                  </button>

                  {showFilters && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Classe de compte</label>
                        <select 
                          value={selectedClass} 
                          onChange={(e) => setSelectedClass(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                        >
                          {ACCOUNT_CLASSES.map(cls => (
                            <option key={cls.value} value={cls.value}>{cls.label}</option>
                          ))}
                        </select>
                      </div>

                      <button 
                        onClick={() => setShowEmpty(!showEmpty)} 
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-lg border transition-all w-full justify-center ${showEmpty ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-800'}`}
                      >
                        {showEmpty ? <EyeOff size={11} /> : <Eye size={11} />}
                        {showEmpty ? 'Masquer les comptes vides' : 'Afficher les comptes vides'}
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {accountsList.length === 0 && (
                    <p className="p-6 text-center text-xs text-slate-400">Aucun compte trouvé</p>
                  )}
                  {accountsList.map(acc => (
                    <button
                      key={acc.accountNumber}
                      onClick={() => setSelectedAccount(acc.accountNumber)}
                      className={`w-full text-left px-4 py-3 transition-colors ${selectedAccount === acc.accountNumber ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-600' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50 border-l-2 border-transparent'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{acc.accountNumber}</span>
                        <Badge tone="slate">{acc.lines.length} écriture{acc.lines.length > 1 ? 's' : ''}</Badge>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">{acc.accountLabel}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className={`text-[11px] font-bold tabular-nums ${acc.closingBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : acc.closingBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                          Solde : {acc.closingBalance > 0 ? fm(acc.closingBalance) : acc.closingBalance < 0 ? `(${fm(Math.abs(acc.closingBalance))})` : '—'}
                        </p>
                        {acc.closingBalance > 0 && <TrendingUp size={10} className="text-emerald-600 dark:text-emerald-400" />}
                        {acc.closingBalance < 0 && <TrendingDown size={10} className="text-rose-600 dark:text-rose-400" />}
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Détail du compte */}
              <Card className="!p-0 overflow-hidden lg:col-span-2">
                {!selected ? (
                  <div className="p-12 text-center print:hidden">
                    <Landmark size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Sélectionnez un compte</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choisissez un compte dans la liste pour voir le détail de ses écritures.</p>
                  </div>
                ) : (
                  <>
                    {/* Header pour impression */}
                    <div className="hidden print:block p-6 border-b-2 border-slate-900">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-2xl font-bold">{companyName}</h2>
                          <p className="text-sm text-slate-600 mt-1">Grand Livre Comptable</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-600">Période</p>
                          <p className="text-sm font-bold">{fmtDate(formatDateFEC(new Date(`${startDate}T00:00:00`)))} au {fmtDate(formatDateFEC(new Date(`${endDate}T23:59:59`)))}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap print:border-b-2 print:border-slate-900">
                      <div>
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-blue-600" />
                          <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">{selected.accountNumber}</span>
                          <Badge tone="slate">Classe {selected.accountClass}</Badge>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{selected.accountLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Solde final</p>
                        <p className={`text-sm font-bold tabular-nums ${selected.closingBalance > 0 ? 'text-emerald-600 dark:text-emerald-400' : selected.closingBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                          {selected.closingBalance > 0 ? `${fm(selected.closingBalance)} (D)` : selected.closingBalance < 0 ? `${fm(Math.abs(selected.closingBalance))} (C)` : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Journal / Pièce</th>
                            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Libellé</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Débit</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Crédit</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Solde</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selected.openingBalance !== 0 && (
                            <tr className="bg-amber-50/50 dark:bg-amber-950/10">
                              <td className="px-4 py-2.5 text-xs text-slate-500" colSpan={5}>
                                <span className="font-bold text-amber-700 dark:text-amber-400">REPORT À NOUVEAU</span>
                                <span className="ml-2 text-[10px]">(solde au {fmtDate(formatDateFEC(new Date(`${startDate}T00:00:00`)))})</span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-right font-bold tabular-nums text-amber-700 dark:text-amber-400">
                                {selected.openingBalance > 0 ? fm(selected.openingBalance) : `(${fm(Math.abs(selected.openingBalance))})`}
                              </td>
                            </tr>
                          )}
                          {selected.lines.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                                Aucun mouvement sur la période sélectionnée.
                              </td>
                            </tr>
                          )}
                          {selected.lines.map((l, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                              <td className="px-4 py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtDate(l.entryDate)}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                                <span className="font-mono font-semibold">{l.journalCode}</span>
                                <span className="block text-[10px] text-slate-500 dark:text-slate-400">{l.pieceRef}</span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 max-w-[260px]">
                                <span className="block truncate">{l.entryLabel}</span>
                                {l.auxAccountNumber && (
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono">{l.auxAccountNumber} {l.auxAccountLabel ? `· ${l.auxAccountLabel}` : ''}</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-right tabular-nums font-semibold text-slate-900 dark:text-white">{l.debit > 0 ? fm(l.debit) : '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-right tabular-nums font-semibold text-slate-900 dark:text-white">{l.credit > 0 ? fm(l.credit) : '—'}</td>
                              <td className={`px-4 py-2.5 text-xs text-right tabular-nums font-bold ${l.cumulative > 0 ? 'text-emerald-600 dark:text-emerald-400' : l.cumulative < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                                {l.cumulative > 0 ? fm(l.cumulative) : l.cumulative < 0 ? `(${fm(Math.abs(l.cumulative))})` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-100 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600">
                          <tr>
                            <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider" colSpan={3}>
                              Totaux de la période
                            </td>
                            <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">{fm(selected.totalDebit)}</td>
                            <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">{fm(selected.totalCredit)}</td>
                            <td className={`px-4 py-3 text-xs font-bold text-right tabular-nums ${selected.closingBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {selected.closingBalance > 0 ? fm(selected.closingBalance) : selected.closingBalance < 0 ? `(${fm(Math.abs(selected.closingBalance))})` : '—'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </Card>
            </div>
          )}

          {/* ========== ÉTAT VIDE ========== */}
          {ledger.length === 0 && !loading && (
            <Card className="!p-10 text-center print:hidden">
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-4">
                <BookOpenCheck size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Aucun grand livre généré</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Sélectionnez une période puis cliquez sur "Générer le Grand Livre" pour consulter le détail des écritures de chaque compte, avec report à nouveau et soldes progressifs.
              </p>
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
          }
        `}</style>
      </div>
    </Sidebar>
  );
}
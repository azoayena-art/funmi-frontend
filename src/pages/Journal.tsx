// src/pages/Journal.tsx
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  BookText, Download, Settings2, Loader2, Database, Search,
  ArrowLeft, BookOpenCheck, Scale, Printer, Filter,
  ChevronRight, FileDown,
} from 'lucide-react';
import {
  generateAccountingEntries,
  type JournalEntry,
  type AccountMapping,
} from '../services/accountingExportService';
import { loadCustomAccountMapping, getDefaultAccountMapping } from '../services/accountMappingService';

const PERIOD_PRESETS = [
  { label: 'Mois en cours', getDates: () => { const n = new Date(); return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 0) }; } },
  { label: 'Trimestre en cours', getDates: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3); return { start: new Date(n.getFullYear(), q * 3, 1), end: new Date(n.getFullYear(), q * 3 + 3, 0) }; } },
  { label: 'Année en cours', getDates: () => { const n = new Date(); return { start: new Date(n.getFullYear(), 0, 1), end: new Date(n.getFullYear(), 11, 31) }; } },
  { label: 'Année dernière', getDates: () => { const n = new Date(); return { start: new Date(n.getFullYear() - 1, 0, 1), end: new Date(n.getFullYear() - 1, 11, 31) }; } },
];

const JOURNALS = [
  { code: '', label: 'Tous les journaux', color: 'slate' },
  { code: 'VT', label: 'Journal des Ventes', color: 'emerald' },
  { code: 'AC', label: 'Journal des Achats', color: 'amber' },
  { code: 'BQ', label: 'Journal de Banque', color: 'blue' },
  { code: 'JC', label: 'Journal de Caisse', color: 'purple' },
];

const fmtDate = (ymd: string) => (ymd?.length === 8 ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : ymd || '');

export default function Journal() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { fm, loading: settingsLoading, companyName, currency } = useCompanySettings();
  const { customTeamId } = useTeam();

  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedPreset, setSelectedPreset] = useState(2);
  const [search, setSearch] = useState('');
  const [selectedJournal, setSelectedJournal] = useState('');

  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]);
  const [accountMapping, setAccountMapping] = useState<AccountMapping>(getDefaultAccountMapping());

  useEffect(() => {
    if (!permLoading && !hasPermission('reports.export')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!customTeamId) return;
    loadCustomAccountMapping(customTeamId)
      .then(({ mapping }) => setAccountMapping(mapping))
      .catch(() => setAccountMapping(getDefaultAccountMapping()));
  }, [customTeamId]);

  // Pré-sélection depuis URL
  useEffect(() => {
    const journalParam = searchParams.get('journal');
    if (journalParam) setSelectedJournal(journalParam);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    if (startParam) setStartDate(startParam);
    if (endParam) setEndDate(endParam);
  }, [searchParams]);

  const handleGenerate = useCallback(async () => {
    if (!user || !customTeamId) {
      toast.error('Session invalide');
      return;
    }
    setLoading(true);
    try {
      const { entries: rawEntries } = await generateAccountingEntries({
        startDate: new Date(`${startDate}T00:00:00`),
        endDate: new Date(`${endDate}T23:59:59`),
        teamId: customTeamId,
        format: 'csv',
      }, accountMapping);

      setEntries(rawEntries);

      if (rawEntries.length === 0) {
        toast.info('Aucune écriture', { description: 'Aucune écriture sur cette période.' });
      } else {
        toast.success('Journal chargé', { description: `${rawEntries.length} écritures trouvées.` });
      }
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setLoading(false);
    }
  }, [user, customTeamId, startDate, endDate, accountMapping]);

  const handleExportCSV = useCallback(() => {
    if (entries.length === 0) return;
    const headers = ['Date', 'Journal', 'N° Écriture', 'N° Pièce', 'Compte', 'Libellé', 'Débit', 'Crédit'];
    const rows = entries.map(e => [
      fmtDate(e.entryDate),
      e.journalCode,
      e.entryNumber,
      e.pieceRef,
      e.accountNumber,
      `"${(e.entryLabel || '').replace(/"/g, '""')}"`,
      e.debit.toFixed(2),
      e.credit.toFixed(2),
    ].join(';'));
    const content = [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Journal_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  }, [entries, startDate, endDate]);

  const handlePresetChange = useCallback((idx: number) => {
    setSelectedPreset(idx);
    const { start, end } = PERIOD_PRESETS[idx].getDates();
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setEntries([]);
  }, []);

  // Stats
  const stats = useMemo(() => {
    let totalDebit = 0, totalCredit = 0;
    const byJournal: Record<string, number> = {};
    entries.forEach(e => {
      totalDebit += e.debit;
      totalCredit += e.credit;
      byJournal[e.journalCode] = (byJournal[e.journalCode] || 0) + 1;
    });
    return { totalDebit, totalCredit, count: entries.length, byJournal };
  }, [entries]);

  // Filtrage
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (selectedJournal && e.journalCode !== selectedJournal) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        e.accountNumber.toLowerCase().includes(s) ||
        e.accountLabel.toLowerCase().includes(s) ||
        e.entryLabel.toLowerCase().includes(s) ||
        e.pieceRef.toLowerCase().includes(s) ||
        e.entryNumber.toLowerCase().includes(s)
      );
    });
  }, [entries, selectedJournal, search]);

  // Totaux du journal
  const filteredTotals = useMemo(() => {
    let debit = 0, credit = 0;
    filteredEntries.forEach(e => { debit += e.debit; credit += e.credit; });
    return { debit, credit };
  }, [filteredEntries]);

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
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Retour">
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <BookText size={18} className="text-blue-600 dark:text-blue-400" />
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Journal Comptable</h1>
                  <Badge tone="blue">PCG / SYSCOHADA</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chronologie des écritures — {companyName} • {currency}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/grand-livre')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 transition-all">
                <BookOpenCheck size={12} />
                <span className="hidden sm:inline">Grand Livre</span>
              </button>
              <button onClick={() => navigate('/balance-comptable')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all">
                <Scale size={12} />
                <span className="hidden sm:inline">Balance</span>
              </button>
              <button onClick={() => navigate('/account-mapping')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all">
                <Settings2 size={12} />
                <span className="hidden sm:inline">Plan Comptable</span>
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-5">
          {/* Période */}
          <Card className="!p-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">1</span>
                  Période consultée
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {PERIOD_PRESETS.map((preset, idx) => (
                    <button key={idx} onClick={() => handlePresetChange(idx)} className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${selectedPreset === idx ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Début</label>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setEntries([]); }} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Fin</label>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setEntries([]); }} className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <button onClick={handleGenerate} disabled={loading} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  Charger le Journal
                </button>
                {entries.length > 0 && (
                  <button onClick={handleExportCSV} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-300 transition-all">
                    <FileDown size={14} />
                    Exporter CSV
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* Stats + Filtres journaux */}
          {entries.length > 0 && (
            <div className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Écritures</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{stats.count}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Journaux</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{Object.keys(stats.byJournal).length}</p>
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

              {/* Filtres par journal */}
              <div className="flex flex-wrap gap-2">
                {JOURNALS.map(j => (
                  <button
                    key={j.code}
                    onClick={() => setSelectedJournal(j.code)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      selectedJournal === j.code
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-300'
                    }`}
                  >
                    {j.label}
                    {j.code && stats.byJournal[j.code] && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        selectedJournal === j.code ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
                      }`}>
                        {stats.byJournal[j.code]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tableau Journal */}
          {entries.length > 0 && (
            <Card className="!p-0 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookText size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Écritures</h3>
                  <Badge tone="slate">{filteredEntries.length}</Badge>
                  {selectedJournal && (
                    <button onClick={() => setSelectedJournal('')} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 transition-colors">
                      {JOURNALS.find(j => j.code === selectedJournal)?.label}
                      <X size={10} />
                    </button>
                  )}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input type="text" placeholder="Rechercher compte, libellé, pièce..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-9" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Date</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">Journal</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20">N° Écriture</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">N° Pièce</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Compte</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Libellé</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Débit</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Crédit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEntries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">
                          Aucune écriture ne correspond aux filtres.
                        </td>
                      </tr>
                    )}
                    {filteredEntries.map((e, idx) => (
                      <tr key={`${e.entryNumber}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="px-4 py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold font-mono rounded ${
                            e.journalCode === 'VT' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' :
                            e.journalCode === 'AC' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' :
                            e.journalCode === 'BQ' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' :
                            'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400'
                          }`}>
                            {e.journalCode}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-600 dark:text-slate-400">{e.entryNumber}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{e.pieceRef}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">{e.accountNumber}</span>
                          {e.auxAccountNumber && (
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-mono">{e.auxAccountNumber}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 max-w-[250px] truncate">{e.entryLabel}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums font-semibold text-slate-900 dark:text-white">{e.debit > 0 ? fm(e.debit) : '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-right tabular-nums font-semibold text-slate-900 dark:text-white">{e.credit > 0 ? fm(e.credit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Totaux {selectedJournal ? `(${JOURNALS.find(j => j.code === selectedJournal)?.label})` : ''}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">{fm(filteredTotals.debit)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-right tabular-nums text-slate-900 dark:text-white">{fm(filteredTotals.credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* État vide */}
          {entries.length === 0 && !loading && (
            <Card className="!p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-4">
                <BookText size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Aucun journal chargé</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Sélectionnez une période et cliquez sur "Charger le Journal" pour visualiser la chronologie de vos écritures comptables.
              </p>
            </Card>
          )}
        </main>
      </div>
    </Sidebar>
  );
}

// Manquant dans les imports : ajouter X
import { X } from 'lucide-react';
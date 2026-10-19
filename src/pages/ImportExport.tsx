import Sidebar from '../components/Sidebar';
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom'; // ✅ AJOUTÉ : useEffect + useSearchParams
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTeam } from '../context/TeamContext';
import { toast } from 'sonner';
import { Card, Badge } from '../components/ui/SharedUI';
import {
  ArrowLeft, Upload, Download, FileSpreadsheet, FileText,
  CheckCircle2, AlertCircle, XCircle, Users, UserCheck,
  Loader2, ArrowRight, Sparkles, Info
} from 'lucide-react';
import {
  exportProspectsToCSV,
  exportClientsToCSV,
  exportProspectsToExcel,
  exportClientsToExcel,
  downloadProspectTemplate,
  downloadClientTemplate,
  parseImportFile,
  importProspects,
  importClients,
  type ParsedRow,
  type ImportResult,
} from '../services/csvService';

type DataType = 'prospects' | 'clients';
type Mode = 'choose' | 'export' | 'import' | 'preview' | 'result';

export default function ImportExport() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams(); // ✅ NOUVEAU : pour lire ?type=
  const { customTeamId, appwriteTeamId } = useTeam();

  // ✅ NOUVEAU : Détection du type depuis l'URL au chargement
  const initialType = searchParams.get('type') === 'clients' ? 'clients' : 'prospects';
  
  const [mode, setMode] = useState<Mode>('choose');
  const [dataType, setDataType] = useState<DataType>(initialType);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // 🔒 VÉRIFICATION DES PERMISSIONS ET SÉCURITÉ
  // ============================================================
  useEffect(() => {
    if (!permLoading) {
      // 1. Vérifier que l'utilisateur a le droit de voir AU MOINS l'un des deux types
      const canViewProspects = hasPermission('prospects.view');
      const canViewClients = hasPermission('clients.view');

      if (!canViewProspects && !canViewClients) {
        toast.error('Accès refusé', { 
          description: 'Vous n\'avez pas les permissions nécessaires pour accéder à l\'import/export.' 
        });
        navigate('/dashboard');
        return;
      }

      // 2. Si l'utilisateur n'a accès qu'à un seul type, forcer ce type
      if (dataType === 'prospects' && !canViewProspects && canViewClients) {
        setDataType('clients');
      } else if (dataType === 'clients' && !canViewClients && canViewProspects) {
        setDataType('prospects');
      }
    }
  }, [permLoading, hasPermission, navigate, dataType]);

  // 3. Redirection si pas de teamId
  useEffect(() => {
    if (!permLoading && user && !customTeamId) {
      toast.error('Équipe non identifiée', { 
        description: 'Veuillez vous reconnecter.' 
      });
      navigate('/dashboard');
    }
  }, [permLoading, user, customTeamId, navigate]);

  // ============================================================
  // 📤 EXPORT
  // ============================================================
  const handleExport = async (format: 'csv' | 'excel') => {
    if (!customTeamId) {
      toast.error('Équipe non identifiée');
      return;
    }

    // ✅ Vérification de permission avant export
    const requiredPermission = dataType === 'prospects' ? 'prospects.view' : 'clients.view';
    if (!hasPermission(requiredPermission)) {
      toast.error('Permission refusée', {
        description: `Vous n'avez pas le droit d'exporter les ${dataType}.`
      });
      return;
    }

    setExporting(true);
    try {
      let result;
      if (dataType === 'prospects') {
        result = format === 'csv' 
          ? await exportProspectsToCSV(customTeamId)
          : await exportProspectsToExcel(customTeamId);
      } else {
        result = format === 'csv'
          ? await exportClientsToCSV(customTeamId)
          : await exportClientsToExcel(customTeamId);
      }

      if (result.success) {
        toast.success(`Export réussi`, {
          description: `${result.count} ${dataType === 'prospects' ? 'prospect(s)' : 'client(s)'} exporté(s) en ${format.toUpperCase()}`
        });
      } else {
        toast.error('Aucune donnée à exporter');
      }
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setExporting(false);
    }
  };

  // ============================================================
  // 📥 IMPORT
  // ============================================================
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
      toast.error('Format invalide', {
        description: 'Utilisez un fichier CSV (.csv) ou Excel (.xlsx, .xls)'
      });
      return;
    }

    // Vérifier la taille (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Fichier trop volumineux', {
        description: 'Maximum 10 MB'
      });
      return;
    }

    setParsing(true);
    setFileName(file.name);

    try {
      const { rows } = await parseImportFile(file, dataType);
      
      if (rows.length === 0) {
        toast.error('Fichier vide', {
          description: 'Aucune ligne de données trouvée'
        });
        return;
      }

      setParsedRows(rows);
      setMode('preview');
      
      const validCount = rows.filter(r => r.isValid).length;
      toast.info(`${rows.length} ligne(s) détectée(s)`, {
        description: `${validCount} valide(s), ${rows.length - validCount} avec erreur(s)`
      });
    } catch (error: any) {
      toast.error('Erreur de lecture', { description: error.message });
    } finally {
      setParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImport = async () => {
    if (!customTeamId || !appwriteTeamId) {
      toast.error('Équipe non identifiée');
      return;
    }

    // ✅ Vérification de permission avant import
    const requiredPermission = dataType === 'prospects' ? 'prospects.create' : 'clients.create';
    if (!hasPermission(requiredPermission)) {
      toast.error('Permission refusée', {
        description: `Vous n'avez pas le droit de créer des ${dataType}.`
      });
      return;
    }

    setImporting(true);
    try {
      const result = dataType === 'prospects'
        ? await importProspects(parsedRows, customTeamId, appwriteTeamId, skipDuplicates)
        : await importClients(parsedRows, customTeamId, appwriteTeamId, skipDuplicates);

      setImportResult(result);
      setMode('result');

      if (result.success > 0) {
        toast.success(`Import terminé`, {
          description: `${result.success} ${dataType === 'prospects' ? 'prospect(s)' : 'client(s)'} importé(s) avec succès`
        });
      }

      if (result.duplicates > 0 && skipDuplicates) {
        toast.info(`${result.duplicates} doublon(s) ignoré(s)`);
      }

      if (result.errors > 0) {
        toast.warning(`${result.errors} erreur(s)`, {
          description: 'Consultez les détails dans le rapport'
        });
      }
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setMode('choose');
    setParsedRows([]);
    setImportResult(null);
    setFileName('');
  };

  // ✅ NOUVEAU : Gestion du changement de type avec vérification de permission
  const handleDataTypeChange = (newType: DataType) => {
    const requiredPermission = newType === 'prospects' ? 'prospects.view' : 'clients.view';
    if (!hasPermission(requiredPermission)) {
      toast.error('Permission refusée', {
        description: `Vous n'avez pas le droit d'accéder aux ${newType}.`
      });
      return;
    }
    setDataType(newType);
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  if (permLoading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50/50 dark:bg-slate-950 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-purple-600" />
        </div>
      </Sidebar>
    );
  }

  const validRows = parsedRows.filter(r => r.isValid);
  const errorRows = parsedRows.filter(r => !r.isValid);
  
  // Permissions pour UI
  const canViewProspects = hasPermission('prospects.view');
  const canViewClients = hasPermission('clients.view');
  const canCreateCurrent = dataType === 'prospects' 
    ? hasPermission('prospects.create') 
    : hasPermission('clients.create');

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50/50 dark:bg-slate-950">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(dataType === 'prospects' ? '/prospects' : '/clients')}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                title="Retour"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <FileSpreadsheet size={18} className="text-purple-600 dark:text-purple-400" />
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    Import / Export
                  </h1>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {dataType === 'prospects' ? 'Gestion des prospects' : 'Gestion des clients'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-[1200px] mx-auto px-6 lg:px-8 py-6 space-y-6">

          {/* Mode : Choix */}
          {mode === 'choose' && (
            <>
              {/* Sélection du type de données */}
              <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Type de données</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleDataTypeChange('prospects')}
                    disabled={!canViewProspects}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      dataType === 'prospects'
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Users size={24} className={dataType === 'prospects' ? 'text-purple-600' : 'text-slate-400'} />
                    <h4 className="text-sm font-semibold mt-2 text-slate-900 dark:text-white">Prospects</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {canViewProspects ? 'Contacts non convertis' : '🔒 Permission requise'}
                    </p>
                  </button>
                  <button
                    onClick={() => handleDataTypeChange('clients')}
                    disabled={!canViewClients}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      dataType === 'clients'
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <UserCheck size={24} className={dataType === 'clients' ? 'text-purple-600' : 'text-slate-400'} />
                    <h4 className="text-sm font-semibold mt-2 text-slate-900 dark:text-white">Clients</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {canViewClients ? 'Clients actifs' : '🔒 Permission requise'}
                    </p>
                  </button>
                </div>
              </Card>

              {/* Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export */}
                <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                      <Download size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Exporter</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Télécharger vos données</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleExport('csv')}
                      disabled={exporting}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-emerald-500 transition-all text-sm font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={16} />
                        Export CSV
                      </span>
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    </button>
                    <button
                      onClick={() => handleExport('excel')}
                      disabled={exporting}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-emerald-500 transition-all text-sm font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet size={16} />
                        Export Excel (.xlsx)
                      </span>
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    </button>
                  </div>
                </Card>

                {/* Import */}
                <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                      <Upload size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Importer</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Ajouter depuis un fichier</p>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    disabled={!canCreateCurrent}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsing || !canCreateCurrent}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm font-semibold disabled:opacity-50 mb-3"
                    title={!canCreateCurrent ? 'Permission de création requise' : ''}
                  >
                    {parsing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {canCreateCurrent ? 'Choisir un fichier (CSV ou Excel)' : '🔒 Permission requise'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => dataType === 'prospects' ? downloadProspectTemplate('csv') : downloadClientTemplate('csv')}
                      className="flex-1 text-xs text-slate-500 dark:text-slate-400 hover:text-purple-600 transition-colors"
                    >
                      📄 Template CSV
                    </button>
                    <button
                      onClick={() => dataType === 'prospects' ? downloadProspectTemplate('excel') : downloadClientTemplate('excel')}
                      className="flex-1 text-xs text-slate-500 dark:text-slate-400 hover:text-purple-600 transition-colors"
                    >
                      📊 Template Excel
                    </button>
                  </div>
                  {!canCreateCurrent && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center">
                      ⚠️ Vous pouvez exporter, mais pas importer (permission de création requise)
                    </p>
                  )}
                </Card>
              </div>

              {/* Info */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4 flex items-start gap-3">
                <Info size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                  <strong>💡 Conseils :</strong>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>Téléchargez d'abord le template pour connaître les colonnes attendues</li>
                    <li>Les champs marqués avec * sont obligatoires</li>
                    <li>Les doublons (email ou téléphone identique) sont détectés automatiquement</li>
                    <li>Maximum 5000 lignes par import</li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Mode : Prévisualisation */}
          {mode === 'preview' && (
            <>
              <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText size={16} />
                      Prévisualisation : {fileName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {parsedRows.length} ligne(s) • {validRows.length} valide(s) • {errorRows.length} erreur(s)
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={resetImport}
                      className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-all"
                    >
                      Annuler
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
                    <CheckCircle2 size={20} className="mx-auto text-emerald-600 mb-1" />
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{validRows.length}</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-500">Valides</div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-center">
                    <AlertCircle size={20} className="mx-auto text-amber-600 mb-1" />
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{errorRows.length}</div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-500">Erreurs</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-3 text-center">
                    <Sparkles size={20} className="mx-auto text-purple-600 mb-1" />
                    <div className="text-lg font-bold text-purple-700 dark:text-purple-400">{parsedRows.length}</div>
                    <div className="text-[10px] text-purple-600 dark:text-purple-500">Total</div>
                  </div>
                </div>

                {/* Options */}
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  Ignorer les doublons (email ou téléphone identique)
                </label>

                {/* Erreurs */}
                {errorRows.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4">
                    <h4 className="text-xs font-semibold text-red-900 dark:text-red-200 mb-2 flex items-center gap-1">
                      <XCircle size={12} />
                      Erreurs détectées
                    </h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {errorRows.slice(0, 10).map(row => (
                        <div key={row.row} className="text-[11px] text-red-700 dark:text-red-300">
                          Ligne {row.row} : {row.errors.join(', ')}
                        </div>
                      ))}
                      {errorRows.length > 10 && (
                        <div className="text-[11px] text-red-600 dark:text-red-400 italic">
                          ... et {errorRows.length - 10} autre(s) erreur(s)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Preview table */}
                <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Ligne</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Prénom</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Nom</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Entreprise</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Email</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Téléphone</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedRows.slice(0, 50).map(row => {
                        const data = row.data as any;
                        return (
                          <tr key={row.row} className={row.isValid ? '' : 'bg-red-50/50 dark:bg-red-950/20'}>
                            <td className="px-3 py-2 text-xs text-slate-500">{row.row}</td>
                            <td className="px-3 py-2 text-xs text-slate-900 dark:text-white">{data.firstName || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-900 dark:text-white">{data.lastName || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{data.companyName || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{data.email || '-'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{data.phone || '-'}</td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <Badge tone="green">✓ Valide</Badge>
                              ) : (
                                <Badge tone="red">✗ Erreur</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {parsedRows.length > 50 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                    Affichage des 50 premières lignes sur {parsedRows.length}
                  </p>
                )}

                {/* Boutons d'action */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={resetImport}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || validRows.length === 0 || !canCreateCurrent}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {canCreateCurrent 
                      ? `Importer ${skipDuplicates ? `${validRows.length} ligne(s) valide(s)` : 'toutes les lignes'}`
                      : '🔒 Permission de création requise'
                    }
                  </button>
                </div>
              </Card>
            </>
          )}

          {/* Mode : Résultat */}
          {mode === 'result' && importResult && (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-6">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${
                  importResult.errors === 0 
                    ? 'bg-emerald-100 dark:bg-emerald-950/40'
                    : importResult.success > 0
                    ? 'bg-amber-100 dark:bg-amber-950/40'
                    : 'bg-red-100 dark:bg-red-950/40'
                }`}>
                  {importResult.errors === 0 ? (
                    <CheckCircle2 size={32} className="text-emerald-600" />
                  ) : importResult.success > 0 ? (
                    <AlertCircle size={32} className="text-amber-600" />
                  ) : (
                    <XCircle size={32} className="text-red-600" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                  Import terminé
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {importResult.success} {dataType === 'prospects' ? 'prospect(s)' : 'client(s)'} importé(s)
                </p>
              </div>

              {/* Stats détaillées */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{importResult.total}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{importResult.success}</div>
                  <div className="text-[10px] text-emerald-600 uppercase tracking-wider">Succès</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">{importResult.duplicates}</div>
                  <div className="text-[10px] text-amber-600 uppercase tracking-wider">Doublons</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{importResult.errors}</div>
                  <div className="text-[10px] text-red-600 uppercase tracking-wider">Erreurs</div>
                </div>
              </div>

              {/* Détails des erreurs */}
              {importResult.errorDetails.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-2">
                    Détails des erreurs ({importResult.errorDetails.length})
                  </h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importResult.errorDetails.map((err, idx) => (
                      <div key={idx} className="text-xs text-red-700 dark:text-red-300">
                        Ligne {err.row} : {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Détails des doublons */}
              {importResult.duplicateDetails.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                    Doublons ignorés ({importResult.duplicateDetails.length})
                  </h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importResult.duplicateDetails.map((dup, idx) => (
                      <div key={idx} className="text-xs text-amber-700 dark:text-amber-300">
                        Ligne {dup.row} : {dup.name} (existe déjà)
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={resetImport}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-all"
                >
                  Nouvel import
                </button>
                <button
                  onClick={() => navigate(dataType === 'prospects' ? '/prospects' : '/clients')}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all"
                >
                  Voir la liste
                </button>
              </div>
            </Card>
          )}
        </main>
      </div>
    </Sidebar>
  );
}
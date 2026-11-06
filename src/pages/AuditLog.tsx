// src/pages/AuditLog.tsx
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTeam } from '../context/TeamContext';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import { toast } from 'sonner';
import { Card, Badge, Input, Select } from '../components/ui/SharedUI';
import {
  FileText, Search, Filter, Download, Eye, AlertCircle,
  CheckCircle2, Clock, Shield, User, Calendar, Loader2,
  ArrowLeft, RefreshCw, Info, ChevronLeft, ChevronRight,
  Database, Activity, AlertTriangle,
} from 'lucide-react';

// ============================================================
// 📋 TYPES & INTERFACES
// ============================================================

interface AuditLog {
  $id: string;
  $createdAt: string;
  teamId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  severity?: 'info' | 'warning' | 'critical';
  userName?: string;
  userEmail?: string;
}

interface audit_logstate {
  searchTerm: string;
  actionType: string;
  severity: string;
  dateFrom: string;
  dateTo: string;
  resourceType: string;
}

// ============================================================
// 🎯 CONSTANTES & CONFIGURATION
// ============================================================

const ACTION_LABELS: Record<string, string> = {
  'create_invoice': 'Création de facture',
  'update_invoice': 'Modification de facture',
  'delete_invoice': 'Suppression de facture',
  'send_invoice': 'Envoi de facture',
  'mark_paid': 'Marquer comme payée',
  'create_quote': 'Création de devis',
  'update_quote': 'Modification de devis',
  'accept_quote': 'Acceptation de devis',
  'refuse_quote': 'Refus de devis',
  'create_client': 'Création de client',
  'update_client': 'Modification de client',
  'delete_client': 'Suppression de client',
  'create_product': 'Création de produit',
  'update_product': 'Modification de produit',
  'delete_product': 'Suppression de produit',
  'update_account_mapping': 'Modification du plan comptable',
  'reset_account_mapping': 'Réinitialisation du plan comptable',
  'export_fec': 'Export FEC',
  'export_csv': 'Export CSV',
  'export_sage': 'Export Sage',
  'export_cegid': 'Export Cegid',
  'export_ebp': 'Export EBP',
  'export_quickbooks': 'Export QuickBooks',
  'login': 'Connexion',
  'logout': 'Déconnexion',
  'update_settings': 'Modification des paramètres',
  'update_team': 'Modification de l\'équipe',
  'create_payment': 'Création de paiement',
  'update_payment': 'Modification de paiement',
  'delete_payment': 'Suppression de paiement',
  'create_expense': 'Création de dépense',
  'update_expense': 'Modification de dépense',
  'delete_expense': 'Suppression de dépense',
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  'invoice': 'Facture',
  'quote': 'Devis',
  'client': 'Client',
  'product': 'Produit',
  'payment': 'Paiement',
  'expense': 'Dépense',
  'account_config': 'Plan comptable',
  'company_settings': 'Paramètres entreprise',
  'team': 'Équipe',
  'user': 'Utilisateur',
  'treasury': 'Trésorerie',
};

const SEVERITY_CONFIG = {
  info: { label: 'Information', tone: 'blue' as const, icon: Info },
  warning: { label: 'Attention', tone: 'amber' as const, icon: AlertTriangle },
  critical: { label: 'Critique', tone: 'red' as const, icon: AlertCircle },
};

const ITEMS_PER_PAGE = 20;

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================

export default function AuditLog() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { customTeamId } = useTeam();
  const navigate = useNavigate();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [audit_logs, setaudit_logs] = useState<audit_logstate>({
    searchTerm: '',
    actionType: '',
    severity: '',
    dateFrom: '',
    dateTo: '',
    resourceType: '',
  });

  // Vérification des permissions
  useEffect(() => {
    if (!permLoading && !hasPermission('settings.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  // Chargement des logs
  useEffect(() => {
    if (!customTeamId) return;
    loadAuditLogs();
  }, [customTeamId]);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      // Filtrage sécurisé par teamId (multi-tenant)
      const queries = [
        Query.equal('teamId', customTeamId),
        Query.orderDesc('$createdAt'),
        Query.limit(500), // Limite pour performance
      ];

      const response = await databases.listDocuments(
        DATABASE_ID,
        'audit_logs',
        queries
      );

      const auditLogs = response.documents as unknown as AuditLog[];
      setLogs(auditLogs);
    } catch (error: any) {
      console.error('Erreur chargement logs:', error);
      toast.error('Erreur de chargement', {
        description: 'Impossible de charger l\'historique des actions.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtrage côté client
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Recherche textuelle
      if (audit_logs.searchTerm) {
        const search = audit_logs.searchTerm.toLowerCase();
        const actionLabel = ACTION_LABELS[log.action] || log.action;
        const resourceLabel = RESOURCE_TYPE_LABELS[log.resourceType] || log.resourceType;
        if (
          !actionLabel.toLowerCase().includes(search) &&
          !resourceLabel.toLowerCase().includes(search) &&
          !log.resourceId?.toLowerCase().includes(search) &&
          !log.details?.toLowerCase().includes(search)
        ) {
          return false;
        }
      }

      // Filtre par type d'action
      if (audit_logs.actionType && log.action !== audit_logs.actionType) {
        return false;
      }

      // Filtre par sévérité
      if (audit_logs.severity && log.severity !== audit_logs.severity) {
        return false;
      }

      // Filtre par type de ressource
      if (audit_logs.resourceType && log.resourceType !== audit_logs.resourceType) {
        return false;
      }

      // Filtre par date
      if (audit_logs.dateFrom) {
        const logDate = new Date(log.$createdAt);
        const fromDate = new Date(audit_logs.dateFrom);
        if (logDate < fromDate) return false;
      }

      if (audit_logs.dateTo) {
        const logDate = new Date(log.$createdAt);
        const toDate = new Date(audit_logs.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (logDate > toDate) return false;
      }

      return true;
    });
  }, [logs, audit_logs]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  // Statistiques
  const stats = useMemo(() => {
    const total = logs.length;
    const critical = logs.filter((l) => l.severity === 'critical').length;
    const today = logs.filter((l) => {
      const logDate = new Date(l.$createdAt);
      const today = new Date();
      return logDate.toDateString() === today.toDateString();
    }).length;

    return { total, critical, today };
  }, [logs]);

  // Helpers
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getActionLabel = (action: string) => {
    return ACTION_LABELS[action] || action;
  };

  const getResourceLabel = (resourceType: string) => {
    return RESOURCE_TYPE_LABELS[resourceType] || resourceType;
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Utilisateur', 'Action', 'Type de ressource', 'ID Ressource', 'Sévérité', 'Détails'];
    const rows = filteredLogs.map((log) => [
      formatDate(log.$createdAt),
      log.userName || log.userId,
      getActionLabel(log.action),
      getResourceLabel(log.resourceType),
      log.resourceId || '',
      log.severity || 'info',
      log.details || '',
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(';')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Export CSV téléchargé');
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailsModal(true);
  };

  const resetaudit_logs = () => {
    setaudit_logs({
      searchTerm: '',
      actionType: '',
      severity: '',
      dateFrom: '',
      dateTo: '',
      resourceType: '',
    });
    setCurrentPage(1);
  };

  // Rendu
  if (permLoading || loading) {
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
              <button
                onClick={() => navigate(-1)}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Shield size={18} className="text-blue-600 dark:text-blue-400" />
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Historique & Audit
                  </h1>
                  <Badge tone="blue">Traçabilité</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Piste d'audit infalsifiable — Conformité PCG / SYSCOHADA
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadAuditLogs}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <RefreshCw size={12} />
                Actualiser
              </button>
              {filteredLogs.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  <Download size={12} />
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-5">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Actions
                </span>
                <Database size={12} className="text-blue-500" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {stats.total}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Aujourd'hui
                </span>
                <Calendar size={12} className="text-emerald-500" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {stats.today}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Critiques
                </span>
                <AlertCircle size={12} className="text-red-500" />
              </div>
              <div className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                {stats.critical}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Affichés
                </span>
                <Activity size={12} className="text-indigo-500" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {filteredLogs.length}
              </div>
            </div>
          </div>

          {/* Filtres */}
          <Card className="!p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter size={16} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Filtres avancés
              </h3>
              {(audit_logs.searchTerm || audit_logs.actionType || audit_logs.severity || audit_logs.dateFrom || audit_logs.dateTo || audit_logs.resourceType) && (
                <button
                  onClick={resetaudit_logs}
                  className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Réinitialiser
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Recherche textuelle */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Rechercher..."
                  value={audit_logs.searchTerm}
                  onChange={(e: any) => {
                    setaudit_logs({ ...audit_logs, searchTerm: e.target.value });
                    setCurrentPage(1);
                  }}
                  className="pl-9 w-full"
                />
              </div>

              {/* Type d'action */}
              <Select
                value={audit_logs.actionType}
                onChange={(e: any) => {
                  setaudit_logs({ ...audit_logs, actionType: e.target.value });
                  setCurrentPage(1);
                }}
              >
                <option value="">Toutes les actions</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>

              {/* Type de ressource */}
              <Select
                value={audit_logs.resourceType}
                onChange={(e: any) => {
                  setaudit_logs({ ...audit_logs, resourceType: e.target.value });
                  setCurrentPage(1);
                }}
              >
                <option value="">Toutes les ressources</option>
                {Object.entries(RESOURCE_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>

              {/* Sévérité */}
              <Select
                value={audit_logs.severity}
                onChange={(e: any) => {
                  setaudit_logs({ ...audit_logs, severity: e.target.value });
                  setCurrentPage(1);
                }}
              >
                <option value="">Toutes les sévérités</option>
                {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </Select>

              {/* Date de début */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Du
                </label>
                <input
                  type="date"
                  value={audit_logs.dateFrom}
                  onChange={(e) => {
                    setaudit_logs({ ...audit_logs, dateFrom: e.target.value });
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white"
                />
              </div>

              {/* Date de fin */}
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Au
                </label>
                <input
                  type="date"
                  value={audit_logs.dateTo}
                  onChange={(e) => {
                    setaudit_logs({ ...audit_logs, dateTo: e.target.value });
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </Card>

          {/* Tableau des logs */}
          <Card className="!p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Journal d'audit
                  </h3>
                  <Badge tone="slate">{filteredLogs.length}</Badge>
                </div>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-4">
                  <Activity size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  Aucune action trouvée
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {logs.length === 0
                    ? 'Aucune action n\'a été enregistrée pour cette équipe.'
                    : 'Aucune action ne correspond aux filtres sélectionnés.'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Date & Heure
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Ressource
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Utilisateur
                        </th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Sévérité
                        </th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedLogs.map((log) => {
                        const severityConfig = SEVERITY_CONFIG[log.severity || 'info'];
                        const SeverityIcon = severityConfig.icon;

                        return (
                          <tr
                            key={log.$id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <Clock size={12} />
                                <span className="tabular-nums">
                                  {formatDate(log.$createdAt)}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="text-xs font-medium text-slate-900 dark:text-white">
                                {getActionLabel(log.action)}
                              </div>
                              {log.resourceId && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                                  ID: {log.resourceId.substring(0, 12)}...
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <Badge tone="slate">
                                {getResourceLabel(log.resourceType)}
                              </Badge>
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <User size={12} className="text-slate-400" />
                                <div className="text-xs text-slate-700 dark:text-slate-300">
                                  {log.userName || 'Système'}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <SeverityIcon
                                  size={12}
                                  className={
                                    log.severity === 'critical'
                                      ? 'text-red-500'
                                      : log.severity === 'warning'
                                      ? 'text-amber-500'
                                      : 'text-blue-500'
                                  }
                                />
                                <Badge tone={severityConfig.tone}>
                                  {severityConfig.label}
                                </Badge>
                              </div>
                            </td>

                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleViewDetails(log)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors"
                              >
                                <Eye size={12} />
                                Détails
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Page {currentPage} / {totalPages}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-50 transition-colors"
                      >
                        <ChevronLeft size={12} />
                        Précédent
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 disabled:opacity-50 transition-colors"
                      >
                        Suivant
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Info Box */}
          <Card className="!p-4 bg-blue-50/40 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/50">
            <div className="flex items-start gap-3">
              <Info size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <p className="mb-2">
                  <strong>Sécurité & Conformité :</strong> Les logs d'audit sont infalsifiables (append-only) et isolés par équipe.
                  Aucune modification ou suppression n'est possible, garantissant la traçabilité requise par les normes comptables
                  (PCG Art. L. 123-22, SYSCOHADA AUDCIF).
                </p>
                <p>
                  Les actions critiques (exports comptables, modifications du plan comptable, validations de paiements)
                  sont marquées en rouge pour une identification rapide lors des contrôles fiscaux.
                </p>
              </div>
            </div>
          </Card>
        </main>

        {/* Modal de détails */}
        {showDetailsModal && selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Détails de l'action
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedLog(null);
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Informations principales */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Date & Heure
                    </label>
                    <div className="text-sm text-slate-900 dark:text-white font-medium">
                      {formatDate(selectedLog.$createdAt)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Sévérité
                    </label>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const config = SEVERITY_CONFIG[selectedLog.severity || 'info'];
                        const Icon = config.icon;
                        return (
                          <>
                            <Icon
                              size={14}
                              className={
                                selectedLog.severity === 'critical'
                                  ? 'text-red-500'
                                  : selectedLog.severity === 'warning'
                                  ? 'text-amber-500'
                                  : 'text-blue-500'
                              }
                            />
                            <Badge tone={config.tone}>{config.label}</Badge>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Action */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Action
                  </label>
                  <div className="text-sm text-slate-900 dark:text-white font-medium">
                    {getActionLabel(selectedLog.action)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {selectedLog.action}
                  </div>
                </div>

                {/* Ressource */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Type de ressource
                    </label>
                    <Badge tone="slate">
                      {getResourceLabel(selectedLog.resourceType)}
                    </Badge>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      ID Ressource
                    </label>
                    <div className="text-sm text-slate-900 dark:text-white font-mono">
                      {selectedLog.resourceId || '—'}
                    </div>
                  </div>
                </div>

                {/* Utilisateur */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Utilisateur
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {(selectedLog.userName || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm text-slate-900 dark:text-white font-medium">
                        {selectedLog.userName || 'Système'}
                      </div>
                      {selectedLog.userEmail && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedLog.userEmail}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* IP Address */}
                {selectedLog.ipAddress && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Adresse IP
                    </label>
                    <div className="text-sm text-slate-900 dark:text-white font-mono">
                      {selectedLog.ipAddress}
                    </div>
                  </div>
                )}

                {/* Détails JSON */}
                {selectedLog.details && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Détails de l'opération
                    </label>
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(selectedLog.details), null, 2);
                          } catch {
                            return selectedLog.details;
                          }
                        })()}
                      </pre>
                    </div>
                  </div>
                )}

                {/* ID Document */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    ID Document (Appwrite)
                  </label>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {selectedLog.$id}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800">
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedLog(null);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
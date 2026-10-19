/**
 * ============================================================
 * 📜 MODAL HISTORIQUE DES TRANSMISSIONS E-FACTURE
 * ============================================================
 * Timeline complète : création, transmission, réponse client.
 * ✅ FALLBACK : si un événement manque en base (einvoice_events),
 *    il est reconstruit depuis le statut de la facture.
 * ============================================================
 */

import { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import { getTransmissionHistory } from '../services/eInvoiceTransmissionService';
import {
  History, Send, CheckCircle2, X, FileText, AlertTriangle, Clock, RefreshCw, Zap
} from 'lucide-react';

// ============================================================
// 📐 TYPES
// ============================================================

interface TransmissionEvent {
  $id: string;
  invoiceId: string;
  invoiceNumber: string;
  eventType: string;
  platform?: string;
  transmissionReference?: string;
  status: string;
  errorMessage?: string;
  eventDate: string;
  createdBy: string;
}

interface TimelineItem {
  id: string;
  type: string;
  date: string;
  title: string;
  description?: string;
  reference?: string;
  platform?: string;
  rebuilt?: boolean;
}

interface TransmissionHistoryModalProps {
  open: boolean;
  onClose: () => void;
  invoice: any | null;
  teamId: string | null;
}

// ============================================================
// 🎨 CONFIGURATION DES ÉVÉNEMENTS
// ============================================================

const EVENT_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  created: {
    icon: FileText,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    label: 'E-Facture créée',
  },
  transmission: {
    icon: Send,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-100 dark:bg-sky-900/40',
    label: 'Transmise à la plateforme',
  },
  accepted: {
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    label: 'Acceptée par le client',
  },
  rejected: {
    icon: X,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-100 dark:bg-rose-900/40',
    label: 'Rejetée',
  },
  disputed: {
    icon: AlertTriangle,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    label: 'Contestée',
  },
  pending: {
    icon: Clock,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    label: 'En attente de réponse',
  },
};

// ============================================================
// 🔧 HELPERS
// ============================================================

const formatDateTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return (
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' à ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );
};

const PLATFORM_LABELS: Record<string, string> = {
  simulation: '🧪 Simulation',
  ppf: '🏛️ PPF (Chorus Pro)',
  pdp: '🏢 PDP Partenaire',
  od: '🔗 Opérateur Démat.',
};

/**
 * Construit la timeline : événements réels + reconstruction fallback
 */
const buildTimeline = (invoice: any, events: TransmissionEvent[]): TimelineItem[] => {
  const timeline: TimelineItem[] = [];
  const status = invoice?.transmissionStatus;

  const hasTransmissionEvent = events.some(
    (e) => e.eventType === 'transmission' || e.eventType === 'transmission_failed'
  );
  const hasResponseEvent = events.some((e) => e.eventType === 'recipient_response');

  // 1. Création de l'e-facture
  if (invoice) {
    timeline.push({
      id: 'created',
      type: 'created',
      date: invoice.$createdAt || invoice.issueDate || new Date().toISOString(),
      title: 'E-Facture créée',
      description: `Facture ${invoice.invoiceNumber} générée au format ${(invoice.einvoiceFormat || 'factur-x').toUpperCase()}`,
    });
  }

  // 2. Événements réels (einvoice_events)
  events.forEach((ev) => {
    const type = ev.eventType === 'transmission' || ev.eventType === 'transmission_failed'
      ? 'transmission'
      : ev.status;
    timeline.push({
      id: ev.$id,
      type,
      date: ev.eventDate || ev.createdAt || new Date().toISOString(),
      title: EVENT_CONFIG[type]?.label || ev.status,
      description: ev.errorMessage ? `❌ Motif : ${ev.errorMessage}` : undefined,
      reference: ev.transmissionReference,
      platform: ev.platform,
    });
  });

  // 3. ✅ FALLBACK : reconstruction depuis le statut de la facture
  if (invoice && status && status !== 'draft' && status !== 'ready') {
    // Transmission manquante mais statut au-delà de ready
    if (!hasTransmissionEvent && ['transmitted', 'accepted', 'rejected', 'disputed'].includes(status)) {
      timeline.push({
        id: 'rebuilt-transmission',
        type: 'transmission',
        date: invoice.$updatedAt || invoice.issueDate || new Date().toISOString(),
        title: 'Transmise à la plateforme',
        description: '⚠️ Événement reconstruit depuis le statut (trace détaillée absente en base)',
        reference: invoice.transmissionReference,
        platform: invoice.einvoicePlatform,
        rebuilt: true,
      });
    }
    // Réponse client manquante mais statut final connu
    if (!hasResponseEvent && ['accepted', 'rejected', 'disputed'].includes(status)) {
      timeline.push({
        id: 'rebuilt-response',
        type: status,
        date: invoice.$updatedAt || new Date().toISOString(),
        title: EVENT_CONFIG[status]?.label || status,
        description:
          status === 'rejected'
            ? `❌ Motif : ${invoice.rejectionReason || 'Non spécifié'}`
            : '⚠️ Événement reconstruit depuis le statut (trace détaillée absente en base)',
        reference: invoice.transmissionReference,
        rebuilt: true,
      });
    }
  }

  // 4. En attente de réponse (si transmise sans réponse)
  if (invoice && status === 'transmitted' && !hasResponseEvent) {
    timeline.push({
      id: 'pending',
      type: 'pending',
      date: new Date().toISOString(),
      title: 'En attente de réponse du client',
      description: 'La facture est transmise, en attente de traitement par le destinataire',
    });
  }

  // Tri chronologique
  return timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// ============================================================
// 🧩 COMPOSANT
// ============================================================

export default function TransmissionHistoryModal({
  open,
  onClose,
  invoice,
  teamId,
}: TransmissionHistoryModalProps) {
  const [events, setEvents] = useState<TransmissionEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && invoice && teamId) {
      loadHistory();
    }
    if (!open) {
      setEvents([]);
    }
  }, [open, invoice, teamId]);

  const loadHistory = async () => {
    if (!invoice || !teamId) return;
    setLoading(true);
    try {
      const history = await getTransmissionHistory(invoice.$id, teamId);
      setEvents(history as unknown as TransmissionEvent[]);
    } catch (e) {
      console.error('Erreur chargement historique:', e);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const timeline = invoice ? buildTimeline(invoice, events) : [];
  const hasRebuilt = timeline.some((t) => t.rebuilt);

  return (
    <Modal
      open={open && !!invoice}
      onClose={onClose}
      title={`📜 Historique - ${invoice?.invoiceNumber || ''}`}
      icon={<History className="text-purple-600" size={20} />}
      maxWidth="sm:max-w-2xl"
    >
      <div className="space-y-4">
        {/* En-tête récapitulatif */}
        {invoice && (
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {invoice.clientName || 'Client'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {PLATFORM_LABELS[invoice.einvoicePlatform || 'simulation']}
              </span>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loading}
                className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors disabled:opacity-50"
                title="Actualiser"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ Bannière historique partiel */}
        {hasRebuilt && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Historique partiel :</strong> certains événements n'ont pas été retrouvés dans
                la base (einvoice_events) et ont été reconstruits depuis le statut de la facture.
                Vérifiez la console navigateur lors de la simulation (⚠️ Événement non enregistré).
              </span>
            </p>
          </div>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-purple-600" />
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-12">
            <History size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Aucun événement enregistré</p>
          </div>
        ) : (
          <div className="relative">
            {/* Ligne verticale */}
            <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-slate-200 dark:bg-slate-700" />

            <div className="space-y-6">
              {timeline.map((item, idx) => {
                const config = EVENT_CONFIG[item.type] || EVENT_CONFIG.pending;
                const Icon = config.icon;
                const isLast = idx === timeline.length - 1;

                return (
                  <div key={item.id} className="relative flex gap-4">
                    {/* Point de la timeline */}
                    <div
                      className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg} ${
                        isLast ? 'ring-4 ring-purple-100 dark:ring-purple-900/30' : ''
                      } ${item.rebuilt ? 'opacity-70 border-2 border-dashed border-slate-300 dark:border-slate-600' : ''}`}
                    >
                      <Icon size={18} className={config.color} />
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDateTime(item.date)}
                        </span>
                      </div>

                      {item.description && (
                        <p
                          className={`text-xs mt-1 ${
                            item.type === 'rejected'
                              ? 'text-rose-600 dark:text-rose-400 font-medium'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.description}
                        </p>
                      )}

                      {item.reference && (
                        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">
                          Réf : {item.reference}
                        </p>
                      )}

                      {item.platform && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {PLATFORM_LABELS[item.platform] || item.platform}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          💡 Cet historique est conservé pour la traçabilité légale (obligation de conservation 6 ans).
        </p>
      </div>
    </Modal>
  );
}
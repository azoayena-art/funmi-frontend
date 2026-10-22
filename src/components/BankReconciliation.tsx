// src/components/BankReconciliation.tsx
// 🏦 Rapprochement bancaire — import CSV + matching automatique
// ✅ Statuts éligibles : invoiced (Facturé), sent, near_due, overdue, partial
// ✅ Filtrage côté client (Appwrite notEqual ne supporte pas les tableaux)
// ✅ Option A : synchronisation auto de la facture (paiement + statut paid/partial)
// ✅ Garde-fou sur-paiement avec dialogue de confirmation
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { Query, ID } from 'appwrite';
import { toast } from 'sonner';
import {
  Upload, FileText, CheckCircle2, XCircle, SkipForward,
  Loader2, AlertCircle, Landmark, RefreshCw, Sparkles,
} from 'lucide-react';
import { getTeamPermissions } from '../utils/rowLevelPermissions';
import { createTreasuryMovement } from '../utils/treasuryGuard';
import {
  parseBankStatement,
  readCsvFile,
  type BankTransactionRow,
} from '../services/bankImportService';
import {
  suggestMatches,
  confidenceLabel,
  type MatchCandidate,
  type MatchSuggestion,
} from '../services/bankReconciliationService';
import { Pagination, Badge } from './ui/SharedUI';

// ============================================================
// ⚙️ CONSTANTES
// ============================================================

// ✅ Statuts éligibles au rapprochement (inclut "invoiced" = Facturé)
const RECONCILABLE_STATUSES = ['invoiced', 'sent', 'near_due', 'overdue', 'partial'];

// ❌ Statuts JAMAIS rapprochables
const EXCLUDED_STATUSES = ['draft', 'cancelled'];

// ❌ Statuts fournisseurs exclus
const SUPPLIER_EXCLUDED_STATUSES = ['rejected', 'draft', 'pending'];

const ITEMS_PER_PAGE = 15;

// ============================================================
// 🧩 HELPERS
// ============================================================

/**
 * Parse le champ payments (JSON string ou tableau)
 * Utilisé pour calculer le reste dû des factures
 */
const parsePaymentsList = (raw: any): Array<{ amount?: number }> => {
  if (!raw) return [];
  try {
    if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw);
    if (Array.isArray(raw)) return raw;
  } catch {
    /* JSON invalide → liste vide */
  }
  return [];
};

// ============================================================
// 📐 TYPES
// ============================================================
type UiRow = BankTransactionRow & {
  status: 'unmatched' | 'matched' | 'ignored' | 'processing';
  suggestions: MatchSuggestion[];
  selectedSuggestion?: MatchSuggestion;
  matchedId?: string;
  matchedLabel?: string;
};

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function BankReconciliation() {
  const { customTeamId, appwriteTeamId } = useTeam();
  const { user } = useAuth();
  const { currency: companyCurrency, fm } = useCompanySettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<UiRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'matched' | 'ignored'>('all');
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // ============================================================
  // 📥 CHARGEMENT DES CANDIDATS (factures clients + fournisseurs)
  // ============================================================
  const loadCandidates = useCallback(async (): Promise<MatchCandidate[]> => {
    if (!customTeamId) {
      console.warn('⚠️ loadCandidates: customTeamId manquant');
      return [];
    }

    try {
      // ✅ Récupération SANS filtre de statut (Appwrite notEqual ne supporte pas les tableaux)
      const [invRes, supRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'invoices', [
          Query.equal('teamId', customTeamId),
          Query.limit(500),
        ]),
        databases.listDocuments(DATABASE_ID, 'received_invoices', [
          Query.equal('teamId', customTeamId),
          Query.limit(500),
        ]),
      ]);

      console.log(
        `🔎 [loadCandidates] ${invRes.documents.length} facture(s) client brute(s), ${supRes.documents.length} fournisseur`
      );

      // 🌍 Devise de repli = devise de l'entreprise (jamais EUR en dur)
      const defaultCur = companyCurrency || 'EUR';
      const list: MatchCandidate[] = [];

      // ---------- FACTURES CLIENTS (y compris statut "invoiced") ----------
      for (const inv of invRes.documents as any[]) {
        // Un avoir n'est pas un encaissement
        if (inv.type === 'credit') {
          console.log(`   ⏭️ ${inv.invoiceNumber} ignorée (avoir)`);
          continue;
        }

        // ✅ FILTRE STATUT côté client
        if (EXCLUDED_STATUSES.includes(inv.status)) {
          console.log(`   ❌ ${inv.invoiceNumber} ignorée (statut "${inv.status}" exclu)`);
          continue;
        }
        if (!RECONCILABLE_STATUSES.includes(inv.status)) {
          console.log(`   ⏭️ ${inv.invoiceNumber} ignorée (statut "${inv.status}" non rapprochable)`);
          continue;
        }

        // Calcul du reste dû fiable via payments
        const paid = parsePaymentsList(inv.payments).reduce(
          (s: number, p) => s + (Number(p.amount) || 0),
          0
        );
        const total = Number(inv.total) || 0;
        const remaining = Math.max(0, total - paid);
        if (remaining <= 0) {
          console.log(`   ⏭️ ${inv.invoiceNumber} ignorée (reste = 0)`);
          continue;
        }

        const candidate: MatchCandidate = {
          type: 'client_invoice',
          id: inv.$id,
          number: String(inv.invoiceNumber || ''),
          counterparty: String(inv.clientName || ''),
          amount: remaining,
          issueDate: inv.issueDate || undefined,
          dueDate: inv.dueDate || undefined,
          currency: String(inv.currencyCode || inv.currency || defaultCur),
        };
        console.log(
          `   ✅ Candidat : ${candidate.number} | reste=${candidate.amount} ${candidate.currency}`
        );
        list.push(candidate);
      }

      // ---------- FACTURES FOURNISSEURS ----------
      for (const inv of supRes.documents as any[]) {
        // ✅ Filtre statut côté client
        if (SUPPLIER_EXCLUDED_STATUSES.includes(inv.status)) continue;

        const paid = parsePaymentsList(inv.payments).reduce(
          (s: number, p) => s + (Number(p.amount) || 0),
          0
        );
        const total = Number(inv.total) || 0;
        const remaining = Math.max(0, total - paid);
        if (remaining <= 0) continue;

        list.push({
          type: 'supplier_invoice',
          id: inv.$id,
          number: String(inv.invoiceNumber || ''),
          counterparty: String(inv.supplierName || ''),
          amount: remaining,
          issueDate: inv.issueDate || undefined,
          dueDate: inv.dueDate || undefined,
          currency: String(inv.currencyCode || inv.currency || defaultCur),
        });
      }

      console.log(`🎯 [loadCandidates] TOTAL = ${list.length} candidat(s) retenus`);
      setCandidates(list);
      return list;
    } catch (e) {
      console.error('❌ Erreur chargement candidats:', e);
      toast.error('Impossible de charger les factures');
      return [];
    }
  }, [customTeamId, companyCurrency]);

  // Précharger les candidats au montage pour accélérer le matching
  useEffect(() => {
    if (customTeamId) {
      loadCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customTeamId]);

  // ============================================================
  // 📤 IMPORT CSV
  // ============================================================
  const handleFileSelect = async (file: File) => {
    if (!customTeamId || !appwriteTeamId || !user) {
      toast.error('Session requise');
      return;
    }
    setLoading(true);
    setRows([]);
    setFileName(file.name);
    try {
      const text = await readCsvFile(file);
      const result = await parseBankStatement(text, { fileName: file.name });

      if (result.errors.length > 0) {
        toast.error(`Structure invalide : ${result.errors[0].message}`);
        setLoading(false);
        return;
      }

      if (result.rows.length === 0) {
        toast.warning('Aucune ligne exploitable dans ce fichier');
        setLoading(false);
        return;
      }

      // Anti-doublons : vérifier rowHash en base
      const hashes = result.rows.map(r => r.rowHash);
      let existingHashes = new Set<string>();
      try {
        const existing = await databases.listDocuments(DATABASE_ID, 'bank_transactions', [
          Query.equal('teamId', customTeamId),
          Query.limit(1000),
        ]);
        existingHashes = new Set(
          existing.documents
            .filter((d: any) => hashes.includes(d.rowHash))
            .map((d: any) => d.rowHash)
        );
      } catch (e) {
        console.warn('⚠️ Vérification doublons ignorée:', e);
      }

      // Filtrage des doublons
      const newRows = result.rows.filter(r => !existingHashes.has(r.rowHash));
      if (newRows.length < result.rows.length) {
        toast.info(`${result.rows.length - newRows.length} ligne(s) déjà importée(s) ignorée(s)`);
      }
      if (newRows.length === 0) {
        toast.warning('Toutes les lignes existent déjà');
        setLoading(false);
        return;
      }

      // Charger les candidats et calculer les suggestions
      const cands = candidates.length > 0 ? candidates : await loadCandidates();
      const uiRows: UiRow[] = newRows.map(r => {
        const sugg = suggestMatches(r, cands);
        console.log(
          `🔗 Ligne "${r.label}" ${r.amount} ${r.currency} → ${sugg.length} suggestion(s)`,
          sugg.map(s => `${s.candidate.number} (score ${s.score})`)
        );
        return { ...r, status: 'unmatched', suggestions: sugg, selectedSuggestion: undefined };
      });

      setRows(uiRows);
      setCurrentPage(1);
      toast.success(`${uiRows.length} ligne(s) prête(s) à rapprocher`, {
        description: `${result.detectedBank || 'Banque inconnue'} • Devise ${result.rows[0].currency}`,
      });
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du traitement du fichier');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ============================================================
  // 🎯 ACTIONS PAR LIGNE
  // ============================================================
  const updateRow = (idx: number, patch: Partial<UiRow>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  // ============================================================
  // 🔄 SYNC FACTURE : ajout paiement + statut paid/partial (Option A)
  // ============================================================
  const syncInvoiceWithPayment = async (
    candidate: MatchCandidate,
    paymentAmount: number,
    paymentDate: string,
    paymentReference: string
  ): Promise<{ success: boolean; newStatus?: string; error?: string }> => {
    if (!appwriteTeamId || !customTeamId) return { success: false, error: 'Équipe non résolue' };

    // Choisir la bonne collection selon le type de candidat
    const collection = candidate.type === 'client_invoice' ? 'invoices' : 'received_invoices';

    try {
      // ✅ CORRECTION : Vérification d'accès avant update
      let invoiceDoc: any;
      try {
        invoiceDoc = await databases.getDocument(DATABASE_ID, collection, candidate.id);
      } catch (err: any) {
        if (err.code === 401 || err.code === 403 || err.code === 404) {
          return { 
            success: false, 
            error: 'Document ancien détecté : cette facture n\'a pas les bonnes permissions. Contactez un administrateur.' 
          };
        }
        throw err;
      }

      // ✅ CORRECTION : Vérification d'appartenance à l'équipe
      if (!invoiceDoc.teamId || invoiceDoc.teamId !== customTeamId) {
        return { 
          success: false, 
          error: 'Accès refusé : cette facture n\'appartient pas à votre équipe.' 
        };
      }

      // 2. Parser les paiements existants (JSON string ou tableau)
      let existingPayments: Array<{ amount?: number }> = [];
      try {
        if (typeof invoiceDoc.payments === 'string' && invoiceDoc.payments.trim()) {
          existingPayments = JSON.parse(invoiceDoc.payments);
        } else if (Array.isArray(invoiceDoc.payments)) {
          existingPayments = invoiceDoc.payments;
        }
      } catch {
        existingPayments = [];
      }

      // 3. Construire le nouveau paiement
      const newPayment = {
        id: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amount: paymentAmount,
        date: paymentDate,
        method: 'Virement bancaire',
        reference: paymentReference,
        notes: 'Rapprochement bancaire',
      };
      const updatedPayments = [...existingPayments, newPayment];

      // 4. Recalculer le total payé et le reste dû
      const totalPaid = updatedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const invoiceTotal = Number(invoiceDoc.total) || 0;
      const remaining = Math.max(0, invoiceTotal - totalPaid);

      // 5. Déterminer le nouveau statut
      const updatePayload: any = {
        payments: JSON.stringify(updatedPayments),
        balance: remaining,
      };
      let newStatus: string;

      if (remaining <= 0.01) {
        newStatus = 'paid';
        updatePayload.status = 'paid';
        updatePayload.paidAt = paymentDate;
        updatePayload.balance = 0;
      } else if (totalPaid > 0) {
        newStatus = 'partial';
        updatePayload.status = 'partial';
      } else {
        newStatus = invoiceDoc.status; // aucun changement
      }

      // 6. Mettre à jour la facture avec permissions sécurisées
      const permissions = getTeamPermissions(appwriteTeamId);
      
      await databases.updateDocument(
        DATABASE_ID,
        collection,
        candidate.id,
        updatePayload,
        permissions
      );

      console.log(
        `✅ Facture ${candidate.number} synchronisée → statut "${newStatus}" (reste ${remaining})`
      );
      return { success: true, newStatus };
    } catch (e: any) {
      console.error('❌ Erreur synchronisation facture:', e);
      return { success: false, error: e.message };
    }
  };

  // ============================================================
  // ✅ VALIDATION D'UN RAPPROCHEMENT
  // ============================================================
  const validateMatch = async (row: UiRow, suggestion: MatchSuggestion, realIdx: number) => {
    console.log('🚀 [validateMatch] démarrage', {
      rowAmount: row.amount,
      candidat: suggestion.candidate.number,
    });

    if (!customTeamId || !appwriteTeamId || !user) {
      console.error('❌ Session manquante', {
        customTeamId,
        appwriteTeamId,
        user: !!user,
      });
      toast.error('Session requise');
      return;
    }

    // ✅ CORRECTION : Vérification préalable de la facture
    const collection = suggestion.candidate.type === 'client_invoice' ? 'invoices' : 'received_invoices';
    try {
      const invoiceDoc = await databases.getDocument(DATABASE_ID, collection, suggestion.candidate.id);
      if (!invoiceDoc.teamId || invoiceDoc.teamId !== customTeamId) {
        toast.error('Accès refusé', { 
          description: `La facture ${suggestion.candidate.number} n'appartient pas à votre équipe.` 
        });
        return;
      }
    } catch (err: any) {
      if (err.code === 401 || err.code === 403 || err.code === 404) {
        toast.error('Document ancien détecté', {
          description: 'Cette facture n\'a pas les bonnes permissions. Contactez un administrateur.',
          duration: 6000
        });
        return;
      }
      toast.error('Erreur', { description: err.message });
      return;
    }

    const paymentAmount = Math.abs(row.amount);
    const candidateAmount = suggestion.candidate.amount; // reste dû actuel
    const diff = paymentAmount - candidateAmount;
    const tolerance = 0.01; // tolérance d'arrondi

    // ============================================================
    // 🛡️ GARDE-FOU : SUR-PAIEMENT (montant > reste dû)
    // ============================================================
    if (diff > tolerance) {
      const overAmount = Math.abs(diff);
      const confirmed = window.confirm(
        `⚠️ SUR-PAIEMENT DÉTECTÉ\n\n` +
        `Paiement reçu : ${fm(paymentAmount)} ${row.currency}\n` +
        `Reste dû facture : ${fm(candidateAmount)} ${row.currency}\n` +
        `Excédent : +${fm(overAmount)} ${row.currency}\n\n` +
        `Le montant du relevé dépasse le reste dû de ${suggestion.candidate.number}.\n` +
        `Cela peut indiquer :\n` +
        `• Une erreur de rapprochement (mauvaise facture ?)\n` +
        `• Un trop-perçu à rembourser au client\n` +
        `• Un paiement groupé (facture + autre chose)\n\n` +
        `Voulez-vous quand même rapprocher ? L'excédent sera ignoré et restera à rapprocher sur une autre facture.`
      );
      if (!confirmed) {
        toast.info('Rapprochement annulé', {
          description: `Vérifiez que ${suggestion.candidate.number} est la bonne facture`,
        });
        return;
      }
      // Si confirmé : on ne rapproche QUE le montant du reste dû
      // Le reste du paiement restera "unmatched" dans le relevé
      console.warn(`⚠️ Sur-paiement confirmé : ${fm(overAmount)} restera non rapproché`);
    }

    updateRow(realIdx, { status: 'processing' });

    try {
      // ─── ÉTAPE 1 : Créer le mouvement de trésorerie (montant TOTAL du relevé) ───
      const movementResult = await createTreasuryMovement({
        teamId: customTeamId,
        appwriteTeamId,
        userId: user.$id,
        type: row.amount > 0 ? 'in' : 'out',
        category: row.amount > 0 ? 'client_payment' : 'supplier_payment',
        amount: paymentAmount,
        date: row.date,
        method: 'bank_transfer',
        description: `Rapprochement bancaire : ${suggestion.candidate.number}`,
        label: `Rapprochement bancaire : ${suggestion.candidate.number}`,
        counterpartyName: suggestion.candidate.counterparty,
        reference: row.reference || suggestion.candidate.number,
        source: 'bank_import',
        linkedInvoiceId: suggestion.candidate.id,
      } as any);

      console.log('📊 [validateMatch] résultat mouvement:', movementResult);

      if (!movementResult.success) {
        updateRow(realIdx, { status: 'unmatched' });
        toast.error(`Échec : ${movementResult.error}`);
        return;
      }

      // ─── ÉTAPE 2 : Synchroniser la facture (Option A) ───
      // ⚠️ On impute uniquement le MIN(paiement, reste dû) sur la facture
      const amountToAllocate = Math.min(paymentAmount, candidateAmount);
      const syncResult = await syncInvoiceWithPayment(
        suggestion.candidate,
        amountToAllocate, // ✅ JAMAIS plus que le reste dû
        row.date,
        row.reference || suggestion.candidate.number
      );

      if (!syncResult.success) {
        // Le mouvement est créé mais la facture n'est pas synchronisée
        console.warn('⚠️ Mouvement créé mais facture non synchronisée:', syncResult.error);
        toast.warning("Mouvement enregistré, mais la facture n'a pas pu être mise à jour", {
          description: syncResult.error,
          duration: 8000
        });
      }

      // ─── ÉTAPE 3 : Enregistrer la transaction bancaire (anti-doublon) ───
      const permissions = getTeamPermissions(appwriteTeamId);
      
      await databases.createDocument(
        DATABASE_ID,
        'bank_transactions',
        ID.unique(),
        {
          teamId: customTeamId,
          date: row.date,
          valueDate: row.valueDate || '',
          label: row.label,
          amount: row.amount,
          currency: row.currency,
          reference: row.reference || '',
          bankLabel: fileName,
          status: 'matched',
          matchedType: suggestion.candidate.type,
          matchedId: suggestion.candidate.id,
          rowHash: row.rowHash,
          importedAt: new Date().toISOString(),
          importSource: 'csv',
        },
        permissions
      );

      // ─── ÉTAPE 4 : Mettre à jour l'UI ───
      updateRow(realIdx, {
        status: 'matched',
        selectedSuggestion: suggestion,
        matchedId: suggestion.candidate.id,
        matchedLabel: `${suggestion.candidate.number} — ${suggestion.candidate.counterparty}`,
      });

      // 🔄 Recharger les candidats (le reste dû a changé)
      await loadCandidates();

      // ─── ÉTAPE 5 : Toast adaptatif selon le cas ───
      let statusInfo: string;
      if (diff > tolerance) {
        // Sur-paiement : facture soldée mais excédent non rapproché
        statusInfo = `• Facture soldée ✅ • Excédent ${fm(Math.abs(diff))} à rapprocher ailleurs`;
      } else if (Math.abs(diff) <= tolerance) {
        // Match exact
        statusInfo = '• Facture soldée ✅';
      } else {
        // Paiement partiel (montant < reste dû)
        statusInfo = `• Paiement partiel • Reste ${fm(candidateAmount - paymentAmount)} à rapprocher`;
      }

      toast.success('Rapprochement validé', {
        description: `${suggestion.candidate.number} — ${suggestion.candidate.counterparty} ${statusInfo}`,
        duration: 6000,
      });

      // ─── ÉTAPE 6 : Alerter si sur-paiement (toast secondaire) ───
      if (diff > tolerance) {
        toast.warning(`💡 Excédent de ${fm(Math.abs(diff))} ${row.currency}`, {
          description: 'Cet excédent apparaîtra à nouveau dans le prochain import pour être rapproché à une autre facture ou marqué comme "Autre encaissement".',
          duration: 8000,
        });
      }
    } catch (e: any) {
      console.error('❌ [validateMatch] exception:', e);
      updateRow(realIdx, { status: 'unmatched' });
      toast.error('Échec du rapprochement', { description: e.message });
    }
  };

  // ============================================================
  // ⏭️ IGNORER UNE LIGNE
  // ============================================================
  const ignoreRow = async (row: UiRow, realIdx: number) => {
    if (!customTeamId || !appwriteTeamId) return;
    updateRow(realIdx, { status: 'processing' });
    try {
      const permissions = getTeamPermissions(appwriteTeamId);
      
      await databases.createDocument(
        DATABASE_ID,
        'bank_transactions',
        ID.unique(),
        {
          teamId: customTeamId,
          date: row.date,
          valueDate: row.valueDate || '',
          label: row.label,
          amount: row.amount,
          currency: row.currency,
          reference: row.reference || '',
          bankLabel: fileName,
          status: 'ignored',
          matchedType: '',
          matchedId: '',
          rowHash: row.rowHash,
          importedAt: new Date().toISOString(),
          importSource: 'csv',
        },
        permissions
      );
      updateRow(realIdx, { status: 'ignored' });
      toast.success('Ligne ignorée');
    } catch (e: any) {
      console.error('❌ [ignoreRow] exception:', e);
      updateRow(realIdx, { status: 'unmatched' });
      toast.error('Erreur', { description: e.message });
    }
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  const filteredRows = useMemo(
    () => (filter === 'all' ? rows : rows.filter(r => r.status === filter)),
    [rows, filter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      unmatched: rows.filter(r => r.status === 'unmatched').length,
      matched: rows.filter(r => r.status === 'matched').length,
      ignored: rows.filter(r => r.status === 'ignored').length,
    }),
    [rows]
  );

  // ---------- ÉTAT VIDE : zone d'import ----------
  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <div
          onDragOver={e => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`text-center py-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
            dragActive
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 scale-[1.01]'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-purple-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <Landmark className="mx-auto mb-4 text-slate-400" size={48} />
          <h3 className="text-lg font-semibold mb-2">Importer un relevé bancaire</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Formats supportés : CSV de votre banque (SGBS, BNP, SG, Qonto, Wave, etc.)
          </p>
          <button
            disabled={loading}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {loading ? 'Analyse en cours...' : 'Sélectionner un fichier CSV'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="font-semibold text-blue-900 dark:text-blue-200 mb-1">🔍 Détection auto</div>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Séparateur, colonnes et format des montants détectés automatiquement
            </p>
          </div>
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
              🎯 Suggestions IA
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Chaque ligne est matchée avec vos factures clients et fournisseurs
            </p>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
            <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">🔒 Anti-doublon</div>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Un même relevé peut être ré-importé sans créer de doublons
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------- ÉTAT AVEC DONNÉES : liste des lignes ----------
  return (
    <div className="space-y-4">
      {/* Header + Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-lg font-bold">📥 {fileName}</h3>
          <div className="flex gap-2 text-xs flex-wrap">
            <Badge tone="slate">{stats.total} lignes</Badge>
            <Badge tone="amber">{stats.unmatched} à rapprocher</Badge>
            <Badge tone="emerald">{stats.matched} validés</Badge>
            {stats.ignored > 0 && <Badge tone="rose">{stats.ignored} ignorés</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await loadCandidates();
              toast.info('Candidats rechargés');
            }}
            className="text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1"
          >
            <RefreshCw size={12} /> Recharger candidats
          </button>
          <button
            onClick={() => {
              setRows([]);
              setFileName('');
            }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            ← Nouvel import
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {[
          { key: 'all', label: 'Tout', count: stats.total },
          { key: 'unmatched', label: 'À rapprocher', count: stats.unmatched },
          { key: 'matched', label: 'Validés', count: stats.matched },
          { key: 'ignored', label: 'Ignorés', count: stats.ignored },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => {
              setFilter(t.key as any);
              setCurrentPage(1);
            }}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              filter === t.key
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Liste des lignes */}
      <div className="space-y-3">
        {visibleRows.map(row => {
          const realIdx = rows.indexOf(row);

          return (
            <div
              key={row.rowHash}
              className={`rounded-xl border p-4 transition-colors ${
                row.status === 'matched'
                  ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                  : row.status === 'ignored'
                  ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60'
                  : row.status === 'processing'
                  ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {row.date}
                    </span>
                    <Badge tone="slate">{row.currency}</Badge>
                    {row.status === 'matched' && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✓ {row.matchedLabel}
                      </span>
                    )}
                  </div>
                  <div className="font-medium text-sm truncate">{row.label}</div>
                  {row.reference && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      Réf : {row.reference}
                    </div>
                  )}
                </div>
                <div
                  className={`text-right font-bold tabular-nums whitespace-nowrap ${
                    row.amount > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {row.amount > 0 ? '+' : ''}
                  {fm(Math.abs(row.amount))} {row.currency}
                </div>
              </div>

              {/* Suggestions / Actions */}
              {row.status === 'unmatched' && (
                <div className="space-y-2">
                  {row.suggestions.length === 0 ? (
                    <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <AlertCircle size={14} />
                        Aucune facture correspondante
                      </div>
                      <button
                        onClick={() => ignoreRow(row, realIdx)}
                        className="text-xs px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-1"
                      >
                        <SkipForward size={12} />
                        Ignorer
                      </button>
                    </div>
                  ) : (
                    row.suggestions.map((s, sIdx) => (
                      <div
                        key={s.candidate.id}
                        className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${
                          s.confidence === 'high'
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                            : s.confidence === 'medium'
                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                            : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-semibold flex items-center gap-1">
                            {s.confidence === 'high' && <Sparkles size={12} className="text-emerald-500" />}
                            {s.candidate.type === 'client_invoice' ? '📤' : '📥'} {s.candidate.number}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate">
                            {s.candidate.counterparty} • {fm(s.candidate.amount)} {s.candidate.currency}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {confidenceLabel(s.confidence)} — {s.reasons.join(' • ')}
                          </div>
                        </div>
                        {sIdx === 0 && (
                          <button
                            onClick={() => validateMatch(row, s, realIdx)}
                            className={`px-3 py-1.5 rounded text-xs font-medium text-white transition-colors flex items-center gap-1 ${
                              s.confidence === 'high'
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : s.confidence === 'medium'
                                ? 'bg-amber-600 hover:bg-amber-700'
                                : 'bg-slate-600 hover:bg-slate-700'
                            }`}
                          >
                            <CheckCircle2 size={12} />
                            Valider
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {row.status === 'processing' && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                  <Loader2 size={14} className="animate-spin" /> Validation en cours...
                </div>
              )}

              {row.status === 'matched' && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={14} /> Trésorerie et facture mises à jour
                </div>
              )}

              {row.status === 'ignored' && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <XCircle size={14} /> Marqué comme ignoré (frais bancaire, virement interne...)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredRows.length === 0 && (
        <div className="text-center py-8 text-sm text-slate-500">
          Aucune ligne dans cette catégorie
        </div>
      )}

      {filteredRows.length > ITEMS_PER_PAGE && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          startItem={(currentPage - 1) * ITEMS_PER_PAGE + 1}
          endItem={Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)}
          totalItems={filteredRows.length}
          itemName="ligne"
        />
      )}
    </div>
  );
}
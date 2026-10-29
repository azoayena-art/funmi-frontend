// src/components/PaymentModal.tsx
import { useState, useEffect, useMemo } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import Modal from './ui/Modal';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, AlertCircle, Calendar, Receipt, AlertTriangle } from 'lucide-react';
import { ID } from 'appwrite';

interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface Invoice {
  $id: string;
  teamId: string;
  userId?: string;
  invoiceNumber: string;
  clientName?: string;
  supplierName?: string;
  total: number;
  subtotal?: number;
  tax?: number;
  deposit?: number;
  balance?: number;
  status: string;
  paidAt?: string;
  payments?: string | Payment[];
  currencyCode?: string;
}

export type PaymentModalType = 'client' | 'supplier';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  type: PaymentModalType;
  onSuccess: (invoice: Invoice, payment: Payment) => void;
}

interface PaymentForm {
  amount: string;
  date: string;
  method: string;
  reference: string;
  notes: string;
}

const PAYMENT_METHODS = [
  'Virement bancaire', 'Chèque', 'Carte bancaire',
  'Prélèvement SEPA', 'Espèces', 'PayPal', 'Stripe', 'Autre',
];

const METHOD_MAP: Record<string, string> = {
  'Virement bancaire': 'bank_transfer', 'Chèque': 'check',
  'Carte bancaire': 'credit_card', 'Prélèvement SEPA': 'sepa_direct_debit',
  'Espèces': 'cash', 'PayPal': 'paypal', 'Stripe': 'stripe', 'Autre': 'other',
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function PaymentModal({
  isOpen, onClose, invoice, type, onSuccess,
}: PaymentModalProps) {
  const { fm, currency } = useCompanySettings();
  const { customTeamId } = useTeam();
  const { user } = useAuth();

  const [form, setForm] = useState<PaymentForm>({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Virement bancaire',
    reference: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // ============================================================
  // ✅ CALCULS (avec acompte)
  // ============================================================

  const parsePayments = (raw: string | Payment[] | undefined): Payment[] => {
    if (!raw) return [];
    try {
      if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw);
      if (Array.isArray(raw)) return raw;
    } catch { /* ignore */ }
    return [];
  };

  const paymentsList = useMemo(() => parsePayments(invoice?.payments), [invoice]);
  const paidAmount = useMemo(
    () => paymentsList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [paymentsList]
  );
  const depositAmount = invoice?.deposit || 0;
  const totalReceived = round2(depositAmount + paidAmount);
  const invoiceTotal = invoice?.total || 0;
  const remainingAmount = round2(Math.max(0, invoiceTotal - totalReceived));

  // 🔎 DEBUG : log des valeurs calculées
  useEffect(() => {
    if (isOpen && invoice) {
      console.log('💰 [PaymentModal] Données facture:', {
        invoiceNumber: invoice.invoiceNumber,
        total: invoiceTotal,
        deposit: depositAmount,
        paidAmount,
        totalReceived,
        remainingAmount,
        paymentsRaw: invoice.payments,
      });
    }
  }, [isOpen, invoice, invoiceTotal, depositAmount, paidAmount, totalReceived, remainingAmount]);

  // ============================================================
  // 🔄 RESET DU FORMULAIRE À L'OUVERTURE
  // ============================================================

  useEffect(() => {
    if (isOpen && invoice) {
      setForm({
        amount: remainingAmount > 0 ? remainingAmount.toFixed(2) : '',
        date: new Date().toISOString().split('T')[0],
        method: 'Virement bancaire',
        reference: '',
        notes: '',
      });
    }
  }, [isOpen, invoice, remainingAmount]);

  // ============================================================
  // 🛡️ DÉTECTION SUR-PAIEMENT (temps réel)
  // ============================================================

  const enteredAmount = parseFloat(form.amount) || 0;
  const overpayment = round2(Math.max(0, enteredAmount - remainingAmount));
  const isOverpayment = overpayment > 0.01;

  // ============================================================
  // ✅ SOUMISSION AVEC GARDE-FOU
  // ============================================================

  const handleSubmit = async () => {
    if (!invoice || !customTeamId || !user) {
      toast.error('Session expirée ou équipe non identifiée');
      return;
    }

    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error('Montant invalide');
      return;
    }

    // 🛡️ GARDE-FOU STRICT : sur-paiement avec dialogue de confirmation
    if (isOverpayment) {
      const confirmed = window.confirm(
        `⚠️ SUR-PAIEMENT DÉTECTÉ\n\n` +
        `Montant saisi : ${fm(amount)} ${invoice.currencyCode || currency || ''}\n` +
        `Reste dû : ${fm(remainingAmount)} ${invoice.currencyCode || currency || ''}\n` +
        `Excédent : +${fm(overpayment)} ${invoice.currencyCode || currency || ''}\n\n` +
        `Le montant dépasse le reste dû de la facture ${invoice.invoiceNumber}.\n` +
        `Cela peut indiquer :\n` +
        `• Une erreur de saisie\n` +
        `• Un trop-perçu à rembourser au client\n` +
        `• Un paiement groupé (cette facture + autre chose)\n\n` +
        `Voulez-vous quand même enregistrer ?\n` +
        `Le montant sera plafonné au reste dû (${fm(remainingAmount)}).`
      );
      if (!confirmed) {
        toast.info('Paiement annulé', {
          description: `Vérifiez le montant et réessayez`,
        });
        return;
      }
      // 🔒 PLAFONNEMENT : on enregistre UNIQUEMENT le reste dû
      console.warn(`⚠️ Sur-paiement confirmé : montant plafonné de ${fm(amount)} à ${fm(remainingAmount)}`);
    }

    // ✅ Montant effectif à enregistrer (plafonné au reste dû)
    const effectiveAmount = Math.min(amount, remainingAmount);

    setSubmitting(true);

    try {
      const existingPayments = parsePayments(invoice.payments);

      const newPayment: Payment = {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amount: effectiveAmount,
        date: form.date,
        method: form.method,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      };
      const updatedPayments = [...existingPayments, newPayment];

      const newTotalReceived = round2(depositAmount + updatedPayments.reduce((s, p) => s + p.amount, 0));
      const newRemaining = round2(Math.max(0, invoiceTotal - newTotalReceived));
      const newStatus = newRemaining <= 0.01 ? 'paid' : 'partial';

      const isClient = type === 'client';
      const counterpartyName = isClient ? invoice.clientName : invoice.supplierName;

      // 1. Créer le mouvement de trésorerie
      await databases.createDocument(DATABASE_ID, 'payments', ID.unique(), {
        teamId: customTeamId,
        userId: user.$id,
        type: isClient ? 'in' : 'out',
        category: isClient ? 'client_payment' : 'supplier_payment',
        amount: effectiveAmount,
        currencyCode: invoice.currencyCode || currency || 'EUR',
        exchangeRate: 1,
        amountEur: effectiveAmount,
        date: form.date,
        method: METHOD_MAP[form.method] || 'other',
        description: `${isClient ? 'Encaissement' : 'Paiement'} facture ${invoice.invoiceNumber} - ${counterpartyName}`,
        counterpartyName: counterpartyName || null,
        linkedInvoiceId: isClient ? invoice.$id : null,
        linkedReceivedInvoiceId: !isClient ? invoice.$id : null,
        reference: form.reference || null,
        vatAmount: 0,
        vatRate: 0,
        isReconciled: false,
        isRecurring: false,
        isArchived: false,
      });

      // 2. Mettre à jour la facture
      const updateData: any = {
        status: newStatus,
        payments: JSON.stringify(updatedPayments),
        balance: newRemaining,
      };

      if (newRemaining <= 0.01) {
        updateData.paidAt = new Date().toISOString();
      }

      const collectionId = isClient ? 'invoices' : 'received_invoices';
      await databases.updateDocument(DATABASE_ID, collectionId, invoice.$id, updateData);

      // 3. Toast adaptatif
      const overpaymentNote = isOverpayment
        ? ` • Excédent de ${fm(overpayment)} non enregistré (plafonné)`
        : '';

      toast.success(
        isClient
          ? `Encaissement de ${fm(effectiveAmount)} enregistré`
          : `Paiement de ${fm(effectiveAmount)} enregistré`,
        {
          description: `Facture ${invoice.invoiceNumber} • Reste: ${fm(newRemaining)}${overpaymentNote}`,
          duration: 6000,
        }
      );

      if (isOverpayment) {
        toast.warning(`💡 Excédent de ${fm(overpayment)} non imputé`, {
          description: 'Créez un avoir ou utilisez la régularisation de trop-perçu si nécessaire.',
          duration: 8000,
        });
      }

      onClose();
      onSuccess(invoice, newPayment);
    } catch (e: any) {
      console.error('❌ Erreur enregistrement paiement:', e);
      toast.error(`Erreur: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (!invoice) return null;

  const isClient = type === 'client';
  const counterpartyName = isClient ? invoice.clientName : invoice.supplierName;
  const hasDeposit = depositAmount > 0;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isClient ? 'Enregistrer un encaissement' : 'Enregistrer un paiement'}
      icon={<CreditCard className={isClient ? 'text-emerald-600' : 'text-rose-600'} size={20} />}
      maxWidth="sm:max-w-md"
    >
      <div className="space-y-4">
        {/* ✅ Infos facture avec acompte détaillé */}
        <div className={`rounded-lg p-3 space-y-2 ${
          isClient
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800'
        }`}>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Facture</span>
            <span className="font-mono font-semibold">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">{isClient ? 'Client' : 'Fournisseur'}</span>
            <span className="font-semibold">{counterpartyName || 'N/A'}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-600">
            <span className="text-slate-600 dark:text-slate-400">Total TTC</span>
            <span className="font-bold">{fm(invoiceTotal)}</span>
          </div>

          {hasDeposit && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Acompte versé</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{fm(depositAmount)}</span>
            </div>
          )}

          {paidAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Paiements reçus ({paymentsList.length})</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fm(paidAmount)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm pt-2 border-t border-slate-200 dark:border-slate-600">
            <span className="text-slate-600 dark:text-slate-400 font-semibold">Reste à payer</span>
            <span className={`font-bold text-lg ${remainingAmount <= 0.01 ? 'text-emerald-600' : 'text-rose-600 dark:text-rose-400'}`}>
              {fm(remainingAmount)}
            </span>
          </div>
        </div>

        {/* ⚠️ Alerte si acompte présent */}
        {hasDeposit && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
            <Receipt size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Acompte de {fm(depositAmount)} déjà versé.</strong>
              {' '}Le montant ci-dessous correspond au solde restant.
            </p>
          </div>
        )}

        {/* ⚠️ Alerte sur-paiement (temps réel) */}
        {isOverpayment && enteredAmount > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-start gap-2 animate-pulse">
            <AlertTriangle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-orange-800 dark:text-orange-200">
              <p className="font-semibold mb-1">⚠️ Sur-paiement détecté : +{fm(overpayment)}</p>
              <p>Le montant sera <strong>plafonné à {fm(remainingAmount)}</strong> si vous confirmez. Un dialogue de confirmation apparaîtra.</p>
            </div>
          </div>
        )}

        {/* Formulaire */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Montant * <span className="text-slate-400 font-normal">(max: {fm(remainingAmount)})</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={remainingAmount > 0 ? remainingAmount * 2 : undefined} // permet de saisir plus (pour déclencher l'alerte)
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className={`w-full border rounded-lg p-2.5 text-sm focus:ring-2 outline-none transition-colors ${
              isOverpayment
                ? 'border-orange-400 dark:border-orange-600 dark:bg-slate-700 dark:text-white focus:ring-orange-500 bg-orange-50 dark:bg-orange-900/20'
                : 'border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-purple-500'
            }`}
            placeholder="0.00"
            autoFocus
          />
          {isOverpayment && (
            <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-1 font-semibold">
              ⚠️ Dépasse le reste dû de {fm(overpayment)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Moyen *
            </label>
            <select
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 focus:ring-2 focus:ring-purple-500 outline-none"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Référence <span className="text-slate-400 font-normal">(optionnel)</span>
          </label>
          <input
            type="text"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            placeholder="N° virement, chèque..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Notes <span className="text-slate-400 font-normal">(optionnel)</span>
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
            placeholder="Commentaire..."
          />
        </div>

        {/* Boutons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.amount || parseFloat(form.amount) <= 0 || remainingAmount <= 0.01}
            className={`px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${
              isOverpayment
                ? 'bg-orange-600 hover:bg-orange-700'
                : isClient
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {submitting ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Enregistrement...
              </>
            ) : (
              <>
                {isOverpayment ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                {isOverpayment
                  ? `Confirmer (${fm(remainingAmount)} plafonné)`
                  : isClient
                  ? 'Encaisser'
                  : 'Payer'}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
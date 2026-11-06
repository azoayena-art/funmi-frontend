import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID } from 'appwrite';
import { toast } from 'sonner';
import {
  CheckCircle, Printer, AlertCircle, FileText, Download, Clock,
  Loader2, ShieldAlert, Shield, Receipt, FileMinus
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  consumeRateLimit,
  RATE_LIMITS,
} from '../services/rateLimitService';
import { useRateLimit } from '../hooks/useRateLimit';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface InvoiceItem {
  id: string;
  reference: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  tvaRate: number;
  total: number;
  discount: number;
}

interface Invoice {
  $id: string;
  teamId?: string;
  invoiceNumber: string;
  type?: string;
  status: string;
  clientToken: string;
  companyName?: string;
  companyAddress?: string;
  companySiret?: string;
  companyTva?: string;
  clientName?: string;
  clientAddress?: string;
  clientEmail?: string;
  items?: string;
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vatAmount?: number;
  tax?: number;
  total?: number;
  deposit?: number;
  balance?: number;
  issueDate?: string;
  dueDate?: string;
  receivedAt?: string;
  paymentConditions?: string;
  clientTokenExpiresAt?: string;
}

const typeLabels: Record<string, { label: string; title: string; icon: any }> = {
  standard: { label: 'Facture', title: 'FACTURE', icon: FileText },
  advance: { label: "Facture d'acompte", title: "FACTURE D'ACOMPTE", icon: Receipt },
  balance: { label: 'Facture de solde', title: 'FACTURE DE SOLDE', icon: FileText },
  credit: { label: "Facture d'avoir", title: "FACTURE D'AVOIR", icon: FileMinus }
};

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function InvoicePublic() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [received, setReceived] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ✅ Rate limiters pour les différentes actions
  const {
    isBlocked: isBlockedForFailed,
    remainingTimeFormatted: failedRemainingTime,
  } = useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);

  const {
    tryConsume: tryConsumeAck,
    isBlocked: isBlockedForAck,
    remainingTimeFormatted: ackRemainingTime,
    remainingAttempts: ackRemainingAttempts,
  } = useRateLimit(RATE_LIMITS.CREATE_DOCUMENT);

  const {
    tryConsume: tryConsumePdf,
    isBlocked: isBlockedForPdf,
    remainingTimeFormatted: pdfRemainingTime,
    remainingAttempts: pdfRemainingAttempts,
  } = useRateLimit({ key: 'public_invoice_pdf', maxAttempts: 10, windowMs: 60 * 60 * 1000 });

  // ============================================================
  // ✅ HELPERS
  // ============================================================
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fm = (val: number) => `${round2(val || 0).toFixed(2)} €`;

  const isValidTokenFormat = (t: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(t) || /^[a-zA-Z0-9]{20,64}$/.test(t);
  };

  // ============================================================
  // 📥 CHARGEMENT DE LA FACTURE
  // ============================================================
  const loadInvoice = async () => {
    // ✅ Vérification rate limit des tokens invalides
    if (isBlockedForFailed) {
      setError(`Trop de tentatives. Réessayez dans ${failedRemainingTime}.`);
      setLoading(false);
      return;
    }

    // ✅ Validation du format du token
    if (!token || !isValidTokenFormat(token)) {
      const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
      if (!failedCheck.allowed) {
        setError(`Trop de tentatives avec des tokens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
      } else {
        setError('Lien invalide.');
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await databases.listDocuments(DATABASE_ID, 'invoices', [
        Query.equal('clientToken', token),
        Query.limit(1)
      ]);

      if (response.documents.length === 0) {
        // ✅ Incrémenter le compteur de tokens invalides
        const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
        if (!failedCheck.allowed) {
          setError(`Trop de tentatives avec des tokens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
        } else {
          setError('Facture introuvable ou lien expiré.');
        }
        return;
      }

      const doc = response.documents[0] as unknown as Invoice;

      // ✅ Vérification de sécurité : teamId valide
      if (!doc.teamId) {
        setError('Erreur de sécurité : document invalide.');
        return;
      }

      // ✅ Vérification d'expiration du token
      if (doc.clientTokenExpiresAt) {
        const expiryDate = new Date(doc.clientTokenExpiresAt);
        if (expiryDate < new Date()) {
          setError('Ce lien a expiré. Veuillez demander un nouveau lien à votre contact.');
          return;
        }
      }

      setInvoice(doc);
      setReceived(!!doc.receivedAt);

      try {
        const parsedItems = doc.items ? JSON.parse(doc.items) : [];
        setItems(parsedItems);
      } catch {
        setItems([]);
      }

      // ✅ Log d'audit de la vue (non bloquant)
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: doc.teamId,
          data: JSON.stringify({
            type: 'public_invoice_viewed',
            documentType: 'invoice',
            documentId: doc.$id,
            documentNumber: doc.invoiceNumber,
            eventDate: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 200),
            ipAddress: 'client'
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }
    } catch (err: any) {
      console.error('Erreur chargement facture:', err);
      setError('Erreur lors du chargement. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isBlockedForFailed, failedRemainingTime]);

  // ============================================================
  // ✅ CONFIRMATION DE RÉCEPTION
  // ============================================================
  const handleConfirmReceipt = async () => {
    if (!invoice || !invoice.teamId) return;

    // ✅ Rate limit
    const rateCheck = tryConsumeAck();
    if (!rateCheck.allowed) {
      toast.error('Trop de tentatives', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
      });
      return;
    }

    setConfirming(true);
    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        receivedAt: new Date().toISOString()
      });

      // ✅ Log d'audit
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: invoice.teamId,
          data: JSON.stringify({
            type: 'client_acknowledged_receipt',
            documentType: 'invoice',
            documentId: invoice.$id,
            documentNumber: invoice.invoiceNumber,
            eventDate: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 200),
            note: 'Réception confirmée via le lien public client'
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }

      setReceived(true);
      toast.success('Réception confirmée', {
        description: 'Votre prestataire a été informé de la bonne réception de la facture.',
      });
    } catch (err: any) {
      console.error('Erreur confirmation réception:', err);
      toast.error('Erreur de confirmation', { description: err.message || 'Veuillez réessayer.' });
    } finally {
      setConfirming(false);
    }
  };

  const handlePrint = () => window.print();

  // ============================================================
  // 📥 TÉLÉCHARGEMENT PDF
  // ============================================================
  const handleDownloadPdf = async () => {
    if (!invoice) return;

    // ✅ Rate limit PDF
    const rateCheck = tryConsumePdf();
    if (!rateCheck.allowed) {
      toast.error('Limite de téléchargements atteinte', {
        description: `Réessayez dans ${rateCheck.remainingTimeFormatted}.`,
      });
      return;
    }

    setDownloadingPdf(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, M = 20;
      const isCredit = invoice.type === 'credit';
      const invType = invoice.type || 'standard';
      const info = typeLabels[invType] || typeLabels.standard;

      let Y = M;
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(isCredit ? 220 : 147, isCredit ? 38 : 51, isCredit ? 38 : 234);
      doc.text(info.title, M, Y + 8);

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`N° ${invoice.invoiceNumber}`, M, Y + 14);

      doc.setFontSize(9);
      doc.text(`Date : ${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : '-'}`, W - M, Y + 5, { align: 'right' });
      if (invoice.dueDate && !isCredit) {
        doc.text(`Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}`, W - M, Y + 10, { align: 'right' });
      }

      Y += 24;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(invoice.companyName || '', M, Y);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      if (invoice.companyAddress) doc.text(invoice.companyAddress, M, Y + 5);
      if (invoice.companySiret) doc.text(`SIRET : ${invoice.companySiret}`, M, Y + 9);
      if (invoice.companyTva) doc.text(`TVA : ${invoice.companyTva}`, M, Y + 13);

      const clientBoxX = W - M - 60;
      doc.setDrawColor(150);
      doc.setLineWidth(0.3);
      doc.rect(clientBoxX, Y - 2, 60, 18);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('CLIENT', clientBoxX + 2, Y + 2);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.text(invoice.clientName || '', clientBoxX + 2, Y + 6);
      if (invoice.clientAddress) doc.text(invoice.clientAddress.substring(0, 50), clientBoxX + 2, Y + 10);
      if (invoice.clientEmail) doc.text(invoice.clientEmail, clientBoxX + 2, Y + 14);

      Y += 24;

      const tableData = items.map(i => {
        const baseTotal = i.quantity * i.unitPrice;
        const discountAmount = baseTotal * ((i.discount || 0) / 100);
        const finalHT = baseTotal - discountAmount;
        return [
          i.reference || '-',
          i.description,
          i.quantity.toFixed(2),
          i.unit,
          `${i.unitPrice.toFixed(2)} €`,
          `${(i.discount || 0).toFixed(0)}%`,
          `${finalHT.toFixed(2)} €`,
          `${i.tvaRate}%`
        ];
      });

      autoTable(doc, {
        startY: Y,
        head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
        body: tableData,
        theme: 'grid',
        margin: { left: M, right: M },
        headStyles: { fillColor: isCredit ? [220, 38, 38] : [147, 51, 234], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      let ty = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = W - M - 60;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(0, 0, 0);

      const line = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
        doc.setFont(undefined, bold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(label, totalsX, ty);
        doc.text(value, W - M, ty, { align: 'right' });
        ty += 5;
      };

      const isTvaApplicable = !(invoice.companyTva || '').toLowerCase().includes('non applicable');

      line('Total HT', fm(invoice.subtotal || 0));
      if ((invoice.discount || 0) > 0) {
        line(`Remise globale ${invoice.discount}%`, `- ${fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}`, false, [220, 38, 38]);
        line('Total HT après remise', fm((invoice.subtotal || 0) * (1 - (invoice.discount || 0) / 100)), true);
      }

      if (isTvaApplicable) {
        line(`TVA ${invoice.vatRate || 20}%`, fm(invoice.tax || invoice.vatAmount || 0));
      }

      line('Total TTC', fm(invoice.total || 0), true);

      if ((invoice.deposit || 0) > 0) {
        line('Acompte déjà versé', `- ${fm(invoice.deposit || 0)}`, false, [37, 99, 235]);
        ty += 2;
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.8);
        doc.line(totalsX, ty, W - M, ty);
        ty += 5;
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text('NET À PAYER', totalsX, ty);
        doc.text(fm(invoice.balance || 0), W - M, ty, { align: 'right' });
        ty += 6;
      }

      if (!isTvaApplicable && invoice.companyTva) {
        doc.setFontSize(7);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(invoice.companyTva, M, 285);
      }

      // ✅ Pied de page avec mentions légales
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text('Document généré le ' + new Date().toLocaleString('fr-FR'), M, 290);
      doc.text('Lien sécurisé - Document non modifiable', W - M, 290, { align: 'right' });

      doc.save(`${invoice.invoiceNumber}.pdf`);
      toast.success('PDF téléchargé', {
        description: `${invoice.invoiceNumber}.pdf`
      });
    } catch (e: any) {
      console.error('Erreur PDF:', e);
      toast.error('Erreur de génération', { description: 'Impossible de générer le PDF.' });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ============================================================
  // 📊 CALCULS D'AFFICHAGE
  // ============================================================
  const isTvaApplicable = useMemo(() => {
    return !(invoice?.companyTva || '').toLowerCase().includes('non applicable');
  }, [invoice]);

  const isCredit = invoice?.type === 'credit';

  const daysUntilExpiry = useMemo(() => {
    if (!invoice?.clientTokenExpiresAt) return null;
    const expiry = new Date(invoice.clientTokenExpiresAt);
    const now = new Date();
    const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [invoice]);

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-purple-600" />
          <div className="text-slate-500 dark:text-slate-400 text-sm">Chargement de la facture...</div>
        </div>
      </div>
    );
  }

  // ✅ Écran de blocage suite à abus
  if (isBlockedForFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center border border-red-200 dark:border-red-800">
          <ShieldAlert size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Accès temporairement bloqué
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Trop de tentatives avec des liens invalides ont été détectées.
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
            Réessayez dans {failedRemainingTime}
          </p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center border border-slate-200 dark:border-slate-700">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {error?.includes('expiré') ? 'Lien expiré' :
             error?.includes('Trop de tentatives') ? 'Accès bloqué' :
             'Facture introuvable'}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{error || "Le lien que vous avez utilisé n'est pas valide."}</p>
          {error?.includes('expiré') && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-4 italic">
              Pour des raisons de sécurité, les liens de consultation expirent après 30 jours.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4 print:bg-white print:py-0 print:px-0">
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none border border-slate-200 dark:border-slate-700 print:border-none">

        {/* ✅ Bannière d'expiration */}
        {daysUntilExpiry !== null && daysUntilExpiry <= 7 && (
          <div className={`border-b-2 p-3 text-center text-sm font-medium ${
            daysUntilExpiry <= 3
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
          }`}>
            <Clock size={14} className="inline mr-1" />
            Ce lien expire dans <strong>{daysUntilExpiry} jour{daysUntilExpiry > 1 ? 's' : ''}</strong>
          </div>
        )}

        {/* En-tête */}
        <div className={`bg-gradient-to-r ${isCredit ? 'from-red-600 to-red-700' : 'from-purple-600 to-indigo-600'} text-white p-8 print:bg-purple-600`}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={28} />
                <h1 className="text-3xl font-bold">
                  {isCredit ? 'AVOIR' : invoice.type === 'advance' ? 'ACOMPTE' : 'FACTURE'}
                </h1>
              </div>
              <p className="text-purple-100 text-lg font-mono">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <h2 className="text-xl font-bold">{invoice.companyName || 'Mon Entreprise'}</h2>
              <p className="text-purple-100 text-sm whitespace-pre-line mt-1">{invoice.companyAddress}</p>
              {invoice.companySiret && <p className="text-purple-100 text-xs mt-1">SIRET: {invoice.companySiret}</p>}
              {invoice.companyTva && !invoice.companyTva.toLowerCase().includes('non applicable') && (
                <p className="text-purple-100 text-xs">TVA: {invoice.companyTva}</p>
              )}
            </div>
          </div>
        </div>

        {/* Infos client et dates */}
        <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Facturé à</h3>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{invoice.clientName}</p>
            <p className="text-slate-600 dark:text-slate-400 text-sm whitespace-pre-line">{invoice.clientAddress}</p>
            {invoice.clientEmail && <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{invoice.clientEmail}</p>}
          </div>
          <div className="sm:text-right">
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date d'émission</h3>
              <p className="text-slate-900 dark:text-white font-medium">
                {invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : '-'}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date d'échéance</h3>
              <p className="text-slate-900 dark:text-white font-semibold">
                {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Tableau des lignes */}
        <div className="p-8 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Désignation</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Qté</th>
                <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Prix unit. HT</th>
                {isTvaApplicable && <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">TVA</th>}
                <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items.map((line: InvoiceItem, idx: number) => {
                const baseTotal = line.quantity * line.unitPrice;
                const discountAmount = baseTotal * ((line.discount || 0) / 100);
                const finalHT = baseTotal - discountAmount;

                return (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="py-4 text-slate-900 dark:text-white">
                      <div className="font-medium">{line.description}</div>
                      {line.reference && <div className="text-xs text-slate-500 dark:text-slate-400">Réf: {line.reference}</div>}
                    </td>
                    <td className="py-4 text-right text-slate-600 dark:text-slate-400">{line.quantity} {line.unit}</td>
                    <td className="py-4 text-right text-slate-600 dark:text-slate-400">{fm(line.unitPrice)}</td>
                    {isTvaApplicable && <td className="py-4 text-right text-slate-600 dark:text-slate-400">{line.tvaRate}%</td>}
                    <td className="py-4 text-right font-semibold text-slate-900 dark:text-white">
                      {fm(finalHT)}
                      {(line.discount || 0) > 0 && <div className="text-xs text-red-500 dark:text-red-400">(-{line.discount}%)</div>}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={isTvaApplicable ? 5 : 4} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    Aucune ligne de facturation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totaux */}
          <div className="mt-8 flex justify-end">
            <div className="w-full sm:w-80 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Total HT :</span>
                <span className="font-medium">{fm(invoice.subtotal || 0)}</span>
              </div>
              {(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Remise globale ({invoice.discount}%) :</span>
                  <span>- {fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}</span>
                </div>
              )}
              {isTvaApplicable && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>TVA ({invoice.vatRate || 20}%) :</span>
                  <span>{fm(invoice.tax || invoice.vatAmount || 0)}</span>
                </div>
              )}

              <div className="flex justify-between text-xl font-bold text-purple-700 dark:text-purple-400 border-t-2 border-purple-600 pt-3 mt-3">
                <span>Total TTC :</span>
                <span>{fm(invoice.total || 0)}</span>
              </div>

              {(invoice.deposit || 0) > 0 && (
                <>
                  <div className="flex justify-between text-blue-600 dark:text-blue-400 pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                    <span>Acompte déjà versé :</span>
                    <span>- {fm(invoice.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white">
                    <span>Net à payer :</span>
                    <span>{fm(invoice.balance || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pied de page */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-8 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              <p className="font-semibold mb-1 text-slate-700 dark:text-slate-300">Conditions de paiement</p>
              <p>{invoice.paymentConditions || 'Paiement à réception. Retard : pénalités de 3 fois le taux d\'intérêt légal.'}</p>
              {!isTvaApplicable && invoice.companyTva && (
                <p className="mt-2 italic text-xs text-slate-400 dark:text-slate-500">{invoice.companyTva}</p>
              )}
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || isBlockedForPdf}
                title={isBlockedForPdf ? `Limite atteinte (${pdfRemainingTime})` : `${pdfRemainingAttempts} téléchargement(s) restant(s)`}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingPdf ? (
                  <><Loader2 size={16} className="animate-spin" /> Génération...</>
                ) : (
                  <><Download size={16} /> Télécharger PDF</>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 shadow-sm transition-colors"
              >
                <Printer size={16} /> Imprimer
              </button>
            </div>
          </div>

          {/* Bouton accusé de réception */}
          {!received && invoice.status !== 'paid' && invoice.status !== 'cancelled' && !isCredit && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Vous avez reçu cette facture ? Confirmez la réception :</p>
              <button
                onClick={handleConfirmReceipt}
                disabled={confirming || isBlockedForAck}
                title={isBlockedForAck ? `Réessayez dans ${ackRemainingTime}` : `${ackRemainingAttempts} tentative(s) restante(s)`}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirming ? (
                  <><Loader2 size={16} className="animate-spin" /> Confirmation...</>
                ) : (
                  <><CheckCircle size={16} /> J'ai bien reçu cette facture</>
                )}
              </button>
              {isBlockedForAck && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  ⚠️ Trop de tentatives. Réessayez dans {ackRemainingTime}.
                </p>
              )}
            </div>
          )}
          {received && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3 text-green-700 dark:text-green-300">
                <CheckCircle size={20} className="flex-shrink-0" />
                <div>
                  <p className="font-medium">Accusé de réception enregistré</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    Reçue le {invoice.receivedAt ? new Date(invoice.receivedAt).toLocaleString('fr-FR') : '-'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ✅ Infos de sécurité et compteurs */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-400 dark:text-slate-500 px-8 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 print:hidden">
          <p className="italic">
            Document consulté le {new Date().toLocaleDateString('fr-FR')} — Lien sécurisé
          </p>
          <p className="text-center">
            <Shield size={12} className="inline mr-1" />
            {pdfRemainingAttempts} téléchargement(s) restant(s)
          </p>
        </div>
      </div>
    </div>
  );
}
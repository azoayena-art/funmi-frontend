import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID } from 'appwrite';
import { toast } from 'sonner';
import {
  CheckCircle, Download, Printer, AlertCircle, FileText, Receipt,
  FileMinus, TrendingDown, Calendar, Building2, Mail, Phone,
  MapPin, Hash, Euro, Shield, Clock, ShieldAlert, Loader2, Flag
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  consumeRateLimit,
  RATE_LIMITS,
} from '../services/rateLimitService';
import { useRateLimit } from '../hooks/useRateLimit';
import { useCompanySettings, getCurrencyConfig } from '../hooks/useCompanySettings';
import { getCountryConfig } from '../config/countries';

// ============================================================
// 📋 INTERFACES
// ============================================================
interface InvoiceItem {
  id?: string;
  reference?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  tvaRate: number;
  total: number;
  discount?: number;
}

interface Invoice {
  $id: string;
  teamId?: string;
  invoiceNumber: string;
  type?: string;
  status: string;
  originalInvoiceId?: string;
  originalQuoteId?: string;
  clientToken: string;
  companyName?: string;
  companyLegalForm?: string;
  companyAddress?: string;
  companySiret?: string;
  companyRcs?: string;
  companyTva?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoFileId?: string;
  clientName?: string;
  clientAddress?: string;
  clientBillingAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
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
  paidAt?: string;
  receivedAt?: string;
  $createdAt?: string;
  paymentMethods?: string;
  paymentConditions?: string;
  executionDelay?: string;
  specialConditions?: string;
  tradeType?: string;
  insuranceName?: string;
  insuranceAddress?: string;
  insurancePolicy?: string;
  notes?: string;
  clientTokenExpiresAt?: string;
  currency?: string;
}

const typeLabels: Record<string, { label: string; title: string; icon: any }> = {
  standard: { label: 'Facture', title: 'FACTURE', icon: FileText },
  advance: { label: "Facture d'acompte", title: "FACTURE D'ACOMPTE", icon: Receipt },
  balance: { label: 'Facture de solde', title: 'FACTURE DE SOLDE', icon: FileText },
  credit: { label: "Facture d'avoir", title: "FACTURE D'AVOIR", icon: FileMinus }
};

const DEFAULT_TOKEN_EXPIRY_DAYS = 30;

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function InvoicePublic() {
  const { token } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  
  // 🌍 Paramètres entreprise (chargés dynamiquement)
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // ✅ Rate limiters pour les différentes actions
  const {
    tryConsume: tryConsumeFailed,
    isBlocked: isBlockedForFailed,
    remainingTimeFormatted: failedRemainingTime
  } = useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);

  const {
    tryConsume: tryConsumeAck,
    isBlocked: isBlockedForAck,
    remainingTimeFormatted: ackRemainingTime,
    remainingAttempts: ackRemainingAttempts
  } = useRateLimit(RATE_LIMITS.CREATE_DOCUMENT);

  const {
    tryConsume: tryConsumePdf,
    isBlocked: isBlockedForPdf,
    remainingTimeFormatted: pdfRemainingTime,
    remainingAttempts: pdfRemainingAttempts
  } = useRateLimit({ key: 'pdf_download', maxAttempts: 10, windowMs: 60 * 60 * 1000 });

  // ============================================================
  // ✅ HELPERS
  // ============================================================
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  
  // 🌍 Fonction de formatage monétaire adaptée au pays
  const fm = (n: number) => {
    const currencyCode = invoice?.currency || companySettings?.currency || 'EUR';
    const currencyConfig = getCurrencyConfig(currencyCode);
    const symbol = currencyConfig?.symbol || '€';
    const formatted = round2(n || 0).toFixed(currencyConfig?.decimals ?? 2);
    return `${formatted} ${symbol}`;
  };

  const parseItems = (itemsStr: string | undefined): InvoiceItem[] => {
    if (!itemsStr) return [];
    try {
      const parsed = typeof itemsStr === 'string' ? JSON.parse(itemsStr) : itemsStr;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const checkSubjectToVAT = (inv: Invoice): boolean => {
    const tva = (inv.companyTva || '').toLowerCase();
    return !!tva && !tva.includes('non applicable');
  };

  const isTokenExpired = (inv: Invoice): boolean => {
    if (!inv.clientTokenExpiresAt) return false;
    return new Date(inv.clientTokenExpiresAt) < new Date();
  };

  const isValidTokenFormat = (t: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(t) || /^[a-zA-Z0-9]{20,64}$/.test(t);
  };

  // ============================================================
  // 🌍 CHARGEMENT DES PARAMÈTRES ENTREPRISE
  // ============================================================
  const loadCompanySettings = async (teamId: string) => {
    try {
      setSettingsLoading(true);
      const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
        Query.equal('teamId', teamId),
        Query.limit(1),
      ]);
      if (res.documents.length > 0) {
        setCompanySettings(res.documents[0]);
      }
    } catch (e) {
      console.warn('⚠️ Paramètres entreprise non chargés:', e);
    } finally {
      setSettingsLoading(false);
    }
  };

  // 🌍 Configuration pays
  const countryCode = companySettings?.country || 'FR';
  const countryConfig = useMemo(() => getCountryConfig(countryCode), [countryCode]);
  const currencyConfig = useMemo(
    () => getCurrencyConfig(invoice?.currency || companySettings?.currency || 'EUR'),
    [invoice, companySettings]
  );

  // ============================================================
  // 📥 CHARGEMENT DE LA FACTURE
  // ============================================================
  const loadInvoice = async () => {
    if (isBlockedForFailed) {
      setError(`Trop de tentatives. Réessayez dans ${failedRemainingTime}.`);
      setLoading(false);
      return;
    }

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
        const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
        if (!failedCheck.allowed) {
          setError(`Trop de tentatives avec des tokens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
        } else {
          setError('Facture introuvable ou lien expiré.');
        }
        return;
      }

      const inv = response.documents[0] as unknown as Invoice;

      if (!inv.teamId) {
        setError('Erreur de sécurité : document invalide.');
        return;
      }

      if (isTokenExpired(inv)) {
        setError('Ce lien a expiré. Veuillez demander un nouveau lien à votre contact.');
        return;
      }

      // 🌍 Charger les paramètres de l'entreprise
      await loadCompanySettings(inv.teamId);

      // Log d'audit
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: inv.teamId,
          data: JSON.stringify({
            type: 'public_invoice_viewed',
            documentId: inv.$id,
            documentNumber: inv.invoiceNumber,
            eventDate: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 200),
            ipAddress: 'client'
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }

      setInvoice(inv);
      setAcknowledged(!!inv.receivedAt);
    } catch (err: any) {
      console.error('Erreur chargement facture publique:', err);
      setError('Erreur lors du chargement. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ============================================================
  // ✅ CONFIRMATION DE RÉCEPTION
  // ============================================================
  const handleConfirmReceipt = async () => {
    if (!invoice) return;

    const rateCheck = tryConsumeAck();
    if (!rateCheck.allowed) {
      toast.error('Trop de tentatives', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
      });
      return;
    }

    if (!invoice.teamId) {
      toast.error('Erreur de sécurité', { description: 'Document invalide.' });
      return;
    }

    setAcknowledging(true);

    try {
      await databases.updateDocument(DATABASE_ID, 'invoices', invoice.$id, {
        receivedAt: new Date().toISOString()
      });

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

      setAcknowledged(true);
      toast.success('Réception confirmée', {
        description: 'Votre prestataire a été informé de la bonne réception de la facture.'
      });
    } catch (err: any) {
      console.error('Erreur confirmation réception:', err);
      toast.error('Erreur de confirmation', { description: err.message || 'Veuillez réessayer.' });
    } finally {
      setAcknowledging(false);
    }
  };

  // ============================================================
  // 🖨️ IMPRESSION
  // ============================================================
  const handlePrint = () => {
    window.print();
  };

  // ============================================================
  // 📥 TÉLÉCHARGEMENT PDF
  // ============================================================
  const handleDownloadPdf = async () => {
    if (!invoice) return;

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
      const items = parseItems(invoice.items);
      const invType = invoice.type || 'standard';
      const info = typeLabels[invType] || typeLabels.standard;
      const subjectToVAT = checkSubjectToVAT(invoice);
      const isCredit = invType === 'credit';
      const currencySymbol = currencyConfig?.symbol || '€';

      let Y = M;
      doc.setFontSize(18); doc.setFont(undefined, 'bold');
      doc.setTextColor(isCredit ? 220 : 147, isCredit ? 38 : 51, isCredit ? 38 : 234);
      doc.text(info.title, M, Y + 8);

      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`N° ${invoice.invoiceNumber}`, M, Y + 14);

      if (isCredit) {
        const refLine = invoice.notes?.split('\n').find(l => l.startsWith('Référence facture d\'origine : '));
        const ref = refLine ? refLine.replace('Référence facture d\'origine : ', '') : 'N/A';
        const motifLine = invoice.notes?.split('\n').find(l => l.startsWith('MOTIF AVOIR : '));
        const motif = motifLine ? motifLine.replace('MOTIF AVOIR : ', '') : 'Non spécifié';
        doc.text(`Réf. origine : ${ref}`, W - M, Y + 12, { align: 'right' });
        doc.text(`Motif : ${motif}`, W - M, Y + 16, { align: 'right' });
      }

      doc.setFontSize(9);
      doc.text(`Date : ${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : '-'}`, W - M, isCredit ? Y + 22 : Y + 5, { align: 'right' });
      if (invoice.dueDate && !isCredit) doc.text(`Échéance : ${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}`, W - M, isCredit ? Y + 26 : Y + 10, { align: 'right' });

      Y += 24;
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text(invoice.companyName || '', M, Y);
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      if (invoice.companyAddress) doc.text(invoice.companyAddress, M, Y + 5);
      
      // 🌍 Identifiants fiscaux adaptés au pays
      if (countryConfig.identifier.primary.key === 'siret' && invoice.companySiret) {
        doc.text(`SIRET : ${invoice.companySiret}`, M, Y + 9);
      } else if (invoice.companySiret) {
        doc.text(`${countryConfig.identifier.primary.label} : ${invoice.companySiret}`, M, Y + 9);
      }
      if (invoice.companyTva) doc.text(`${countryConfig.vat?.label || 'TVA'} : ${invoice.companyTva}`, M, Y + 13);

      const clientBoxX = W - M - 60;
      doc.setDrawColor(150); doc.setLineWidth(0.3);
      doc.rect(clientBoxX, Y - 2, 60, 18);
      doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('CLIENT', clientBoxX + 2, Y + 2);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9);
      doc.text(invoice.clientName || '', clientBoxX + 2, Y + 6);
      if (invoice.clientAddress) doc.text(invoice.clientAddress.substring(0, 50), clientBoxX + 2, Y + 10);
      if (invoice.clientEmail) doc.text(invoice.clientEmail, clientBoxX + 2, Y + 14);

      Y += 24;

      const tableData = items.map(i => [
        i.reference || '-',
        i.description,
        i.quantity.toFixed(2),
        i.unit,
        `${i.unitPrice.toFixed(2)} ${currencySymbol}`,
        `${(i.discount || 0).toFixed(0)}%`,
        `${(i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100)).toFixed(2)} ${currencySymbol}`,
        `${i.tvaRate}%`
      ]);

      autoTable(doc, {
        startY: Y,
        head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', countryConfig.vat?.label || 'TVA']],
        body: tableData,
        theme: 'grid',
        margin: { left: M, right: M },
        headStyles: { fillColor: isCredit ? [220, 38, 38] : [147, 51, 234], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      let ty = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = W - M - 60;
      doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);

      const line = (label: string, value: string, bold = false, color: number[] = [0, 0, 0]) => {
        doc.setFont(undefined, bold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(label, totalsX, ty);
        doc.text(value, W - M, ty, { align: 'right' });
        ty += 5;
      };

      line('Total HT', fm(invoice.subtotal || 0));
      if ((invoice.discount || 0) > 0) {
        line(`Remise globale ${invoice.discount}%`, `- ${fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}`, false, [220, 38, 38]);
        line('Total HT après remise', fm((invoice.subtotal || 0) * (1 - (invoice.discount || 0) / 100)), true);
      }

      if (subjectToVAT) {
        const map = new Map<number, { baseHT: number; taxAmount: number }>();
        items.forEach(i => {
          const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - (invoice.discount || 0) / 100);
          const cur = map.get(i.tvaRate) || { baseHT: 0, taxAmount: 0 };
          cur.baseHT += base;
          cur.taxAmount += base * (i.tvaRate || 0) / 100;
          map.set(i.tvaRate, cur);
        });
        Array.from(map.entries()).sort((a, b) => b[0] - a[0]).forEach(([rate, v]) => {
          line(`${countryConfig.vat?.label || 'TVA'} ${rate}% (base ${fm(v.baseHT)})`, fm(v.taxAmount));
        });
      }

      line('Total TTC', fm(invoice.total || 0), true);

      if ((invoice.deposit || 0) > 0) {
        line('Acompte déjà versé', `- ${fm(invoice.deposit || 0)}`, false, [37, 99, 235]);
        ty += 2; doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.8); doc.line(totalsX, ty, W - M, ty); ty += 5;
        doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(37, 99, 235);
        doc.text('NET À PAYER', totalsX, ty);
        doc.text(fm(invoice.balance || 0), W - M, ty, { align: 'right' });
        ty += 6;
      }

      if (!subjectToVAT && invoice.companyTva) {
        doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
        doc.text(invoice.companyTva, M, 285);
      }

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
  const items = useMemo(() => (invoice ? parseItems(invoice.items) : []), [invoice]);
  const subjectToVAT = useMemo(() => (invoice ? checkSubjectToVAT(invoice) : false), [invoice]);

  const taxBreakdown = useMemo(() => {
    if (!invoice || !subjectToVAT) return [];
    const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
    items.forEach(i => {
      const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - (invoice.discount || 0) / 100);
      const cur = map.get(i.tvaRate) || { rate: i.tvaRate, baseHT: 0, taxAmount: 0 };
      cur.baseHT = round2(cur.baseHT + base);
      cur.taxAmount = round2(cur.taxAmount + base * (i.tvaRate || 0) / 100);
      map.set(i.tvaRate, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
  }, [invoice, items, subjectToVAT]);

  const invType = invoice?.type || 'standard';
  const invInfo = typeLabels[invType] || typeLabels.standard;

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
  if (loading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-purple-600" />
          <div className="text-slate-500 dark:text-slate-400 text-sm">Chargement de la facture...</div>
        </div>
      </div>
    );
  }

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
          <p className="text-slate-600 dark:text-slate-400">{error || "Ce lien n'est plus valide."}</p>
          {error?.includes('expiré') && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-4 italic">
              Pour des raisons de sécurité, les liens de consultation expirent après {DEFAULT_TOKEN_EXPIRY_DAYS} jours.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-5xl mx-auto bg-white dark:bg-slate-800 shadow-2xl rounded-2xl overflow-hidden print:shadow-none border border-slate-200 dark:border-slate-700">

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

        <div className={`bg-gradient-to-r ${invType === 'credit' ? 'from-red-600 to-red-700' : 'from-purple-600 to-blue-600'} text-white p-6 sm:p-8 print:bg-purple-600`}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <invInfo.icon size={18} />
                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wide">{invInfo.label}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">{invInfo.title}</h1>
              <p className="text-purple-100 text-lg font-mono">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <h2 className="text-xl font-bold">{invoice.companyName || 'Mon Entreprise'}</h2>
              {invoice.companyLegalForm && <p className="text-purple-100 text-xs">{invoice.companyLegalForm}</p>}
              <p className="text-purple-100 text-sm whitespace-pre-line mt-1">{invoice.companyAddress}</p>
              {invoice.companySiret && (
                <p className="text-purple-100 text-xs">
                  {countryConfig.identifier.primary.label} : {invoice.companySiret}
                </p>
              )}
              {invoice.companyRcs && <p className="text-purple-100 text-xs">RCS : {invoice.companyRcs}</p>}
              {invoice.companyEmail && <p className="text-purple-100 text-xs">{invoice.companyEmail}</p>}
              {invoice.companyPhone && <p className="text-purple-100 text-xs">Tél : {invoice.companyPhone}</p>}
            </div>
          </div>
        </div>

        {invType === 'credit' && invoice.notes && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-4">
            <div className="flex items-start gap-3">
              <TrendingDown size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-900 dark:text-red-200 uppercase mb-1">Facture d'avoir</p>
                <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-line">
                  {invoice.notes.split('\n').filter(l => l.startsWith('MOTIF') || l.startsWith('Référence')).join('\n') || invoice.notes}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
              <Building2 size={12} /> Facturé à
            </h3>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{invoice.clientName}</p>
            {invoice.clientAddress && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-1 mt-1">
                <MapPin size={12} className="mt-0.5 flex-shrink-0" /> {invoice.clientAddress}
              </p>
            )}
            {invoice.clientBillingAddress && invoice.clientBillingAddress !== invoice.clientAddress && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1"><strong>Facturation :</strong> {invoice.clientBillingAddress}</p>
            )}
            {invoice.clientEmail && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-1"><Mail size={12} /> {invoice.clientEmail}</p>
            )}
            {invoice.clientPhone && (
              <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1"><Phone size={12} /> {invoice.clientPhone}</p>
            )}
          </div>
          <div className="text-left sm:text-right">
            <div className="mb-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 sm:justify-end">
                <Calendar size={12} /> Date d'émission
              </h3>
              <p className="text-slate-900 dark:text-white">
                {invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('fr-FR') : (invoice.$createdAt ? new Date(invoice.$createdAt).toLocaleDateString('fr-FR') : '-')}
              </p>
            </div>
            {invoice.dueDate && (
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Date d'échéance</h3>
                <p className="text-slate-900 dark:text-white font-semibold">{new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</p>
              </div>
            )}
            {invoice.paidAt && (
              <div className="inline-block bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-xs font-semibold">
                ✓ Payée le {new Date(invoice.paidAt).toLocaleDateString('fr-FR')}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Hash size={16} /> Détail des prestations
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-purple-600">
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Réf.</th>
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Description</th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Qté</th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Prix unit. HT</th>
                  {subjectToVAT && <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{countryConfig.vat?.label || 'TVA'}</th>}
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={subjectToVAT ? 6 : 5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Aucune ligne de détail disponible.
                    </td>
                  </tr>
                ) : items.map((line, idx) => {
                  const lineTotal = line.quantity * line.unitPrice * (1 - (line.discount || 0) / 100);
                  return (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="py-3 text-slate-600 dark:text-slate-400 text-xs font-mono">{line.reference || '-'}</td>
                      <td className="py-3 text-slate-900 dark:text-white">
                        <div>{line.description}</div>
                        {(line.discount || 0) > 0 && <div className="text-xs text-red-600 dark:text-red-400">Remise : {line.discount}%</div>}
                      </td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">{line.quantity.toFixed(2)} {line.unit}</td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">{line.unitPrice.toFixed(2)} {currencyConfig?.symbol || '€'}</td>
                      {subjectToVAT && <td className="py-3 text-right text-slate-600 dark:text-slate-400">{line.tvaRate}%</td>}
                      <td className="py-3 text-right font-semibold text-slate-900 dark:text-white">{lineTotal.toFixed(2)} {currencyConfig?.symbol || '€'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-end">
            <div className="w-full sm:w-80 space-y-2">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sous-total HT :</span>
                <span className="font-semibold">{fm(invoice.subtotal || 0)}</span>
              </div>
              {(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Remise globale ({invoice.discount}%) :</span>
                  <span className="font-semibold">- {fm((invoice.subtotal || 0) * (invoice.discount || 0) / 100)}</span>
                </div>
              )}
              {(invoice.discount || 0) > 0 && (
                <div className="flex justify-between text-slate-900 dark:text-white font-semibold border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                  <span>Total HT après remise :</span>
                  <span>{fm((invoice.subtotal || 0) * (1 - (invoice.discount || 0) / 100))}</span>
                </div>
              )}
              {subjectToVAT && taxBreakdown.map(b => (
                <div key={b.rate} className="flex justify-between text-slate-600 dark:text-slate-400 text-sm">
                  <span>{countryConfig.vat?.label || 'TVA'} {b.rate}% (base {fm(b.baseHT)}) :</span>
                  <span>{fm(b.taxAmount)}</span>
                </div>
              ))}
              {!subjectToVAT && (
                <div className="text-xs italic text-slate-500 dark:text-slate-400 py-1">
                  {invoice.companyTva || 'TVA non applicable'}
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-purple-600 dark:text-purple-400 border-t-2 border-purple-600 pt-2 mt-2">
                <span>Total TTC :</span>
                <span>{fm(invoice.total || 0)}</span>
              </div>
              {(invoice.deposit || 0) > 0 && (
                <>
                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                    <span>Acompte déjà versé :</span>
                    <span className="font-semibold">- {fm(invoice.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-600 pt-2">
                    <span>Net à payer :</span>
                    <span>{fm(invoice.balance || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 sm:p-8 border-t border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Euro size={12} /> Conditions de paiement
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300">{invoice.paymentConditions || 'Paiement à réception.'}</p>
              {invoice.paymentMethods && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1"><strong>Mode :</strong> {invoice.paymentMethods}</p>
              )}
              {invoice.executionDelay && (
                <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Délai :</strong> {invoice.executionDelay}</p>
              )}
              {/* 🌍 Mentions légales adaptées au pays */}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                {countryConfig.code === 'FR' ? (
                  <>
                    Pénalités de retard : 3× le taux d'intérêt légal (loi 2008-776).<br />
                    Indemnité forfaitaire pour frais de recouvrement : 40 € (art. D.441-5).
                  </>
                ) : (
                  <>
                    Pénalités de retard selon la législation en vigueur en {countryConfig.name}.<br />
                    Conservation des documents : {countryConfig.retentionYears} ans.
                  </>
                )}
              </p>
            </div>
            {(invoice.tradeType || invoice.insuranceName || invoice.insurancePolicy) && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                  <Shield size={12} /> Assurances & Garanties
                </h4>
                {invoice.tradeType && <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Type :</strong> {invoice.tradeType}</p>}
                {invoice.insuranceName && <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Assureur :</strong> {invoice.insuranceName}</p>}
                {invoice.insurancePolicy && <p className="text-sm text-slate-700 dark:text-slate-300"><strong>N° police :</strong> {invoice.insurancePolicy}</p>}
                {invoice.insuranceAddress && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{invoice.insuranceAddress}</p>}
              </div>
            )}
          </div>
          {invoice.specialConditions && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Conditions particulières</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{invoice.specialConditions}</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 border-t-2 border-purple-600 print:hidden">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || isBlockedForPdf}
                className="bg-purple-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-purple-700 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={isBlockedForPdf ? `Limite atteinte (${pdfRemainingTime})` : `${pdfRemainingAttempts} téléchargement(s) restant(s)`}
              >
                {downloadingPdf ? (
                  <><Loader2 size={16} className="animate-spin" /> Génération...</>
                ) : (
                  <><Download size={16} /> Télécharger PDF</>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2 active:scale-95 transition-all"
              >
                <Printer size={16} /> Imprimer
              </button>
            </div>

            {!acknowledged && invoice.status !== 'paid' && invoice.status !== 'cancelled' && invType !== 'credit' && (
              <button
                onClick={handleConfirmReceipt}
                disabled={acknowledging || isBlockedForAck}
                className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={isBlockedForAck ? `Réessayez dans ${ackRemainingTime}` : undefined}
              >
                {acknowledging ? (
                  <><Loader2 size={16} className="animate-spin" /> Confirmation...</>
                ) : (
                  <><CheckCircle size={16} /> J'ai bien reçu cette facture</>
                )}
              </button>
            )}
            {acknowledged && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-2.5 flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle size={18} />
                <span className="text-sm font-medium">
                  Réception confirmée {invoice.receivedAt ? `le ${new Date(invoice.receivedAt).toLocaleDateString('fr-FR')}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <p className="italic flex items-center gap-2">
              <Flag size={12} />
              {countryConfig.flag} {countryConfig.name} • {currencyConfig?.code || 'EUR'}
            </p>
            <p className="text-center">
              <Shield size={12} className="inline mr-1" />
              {pdfRemainingAttempts} téléchargement(s) restant(s)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
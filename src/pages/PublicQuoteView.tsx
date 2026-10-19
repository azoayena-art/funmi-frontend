import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Query, ID } from 'appwrite';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, AlertCircle, Send, PenTool, Download,
  Printer, Calendar, Euro, Shield, FileText, Clock, Loader2, ShieldAlert
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Alert,
  Card,
  EmptyState,
  FormField,
  Textarea,
} from '../components/ui/SharedUI';
import {
  consumeRateLimit,
  RATE_LIMITS,
} from '../services/rateLimitService';
import { useRateLimit } from '../hooks/useRateLimit';
// ============================================================
// 📋 INTERFACES
// ============================================================

interface QuoteItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface QuoteData {
  $id: string; quoteNumber: string; clientName: string; subject?: string; status: string;
  total: number; issueDate?: string; validityDate?: string; items?: string;
  subtotal?: number; discount?: number; tax?: number; deposit?: number; balance?: number;
  companyName?: string; companyLegalForm?: string; companyAddress?: string;
  companySiret?: string; companyRcs?: string; companyTva?: string;
  companyPhone?: string; companyEmail?: string; logoFileId?: string;
  clientAddress?: string; clientBillingAddress?: string; clientEmail?: string;
  clientPhone?: string; executionDelay?: string; paymentConditions?: string;
  paymentMethods?: string; specialConditions?: string; acceptanceMention?: string;
  bonPourAccord?: boolean; tradeType?: string; insuranceName?: string;
  insuranceAddress?: string; insurancePolicy?: string;
  clientComment?: string; clientSignature?: string;
  prospectId?: string;
  teamId?: string;
  userId?: string;
  notes?: string;
  clientToken?: string;
  clientTokenExpiresAt?: string;
}

// ============================================================
// 🎯 COMPOSANT PRINCIPAL — PAGE PUBLIQUE (non authentifiée)
// ============================================================

export default function PublicQuoteView() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'accept' | 'refuse' | null>(null);
  const [refuseComment, setRefuseComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newClientId, setNewClientId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [rgpdAccepted, setRgpdAccepted] = useState(false);
  const [symbol, setSymbol] = useState('€');

  // ✅ Rate limiters pour les différentes actions
  const {
    isBlocked: isBlockedForFailed,
    remainingTimeFormatted: failedRemainingTime,
  } = useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);

  const {
    tryConsume: tryConsumeAction,
    isBlocked: isBlockedForAction,
    remainingTimeFormatted: actionRemainingTime,
    remainingAttempts: actionRemainingAttempts,
  } = useRateLimit(RATE_LIMITS.CREATE_DOCUMENT);

  const {
    tryConsume: tryConsumePdf,
    isBlocked: isBlockedForPdf,
    remainingTimeFormatted: pdfRemainingTime,
    remainingAttempts: pdfRemainingAttempts,
  } = useRateLimit({ key: 'public_quote_pdf', maxAttempts: 10, windowMs: 60 * 60 * 1000 });

  const sigCanvas = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // ============================================================
  // ✅ HELPERS
  // ============================================================
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fm = (a: number) => `${round2(a || 0).toFixed(2)} ${symbol}`;

  const isTokenExpired = (q: QuoteData): boolean => {
    if (!q.clientTokenExpiresAt) return false;
    return new Date(q.clientTokenExpiresAt) < new Date();
  };

  // ✅ Validation du format du token
  const isValidTokenFormat = (t: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(t) || /^[a-zA-Z0-9]{20,64}$/.test(t);
  };

  // ============================================================
  // 📥 CHARGEMENT DU DEVIS
  // ============================================================
  useEffect(() => {
    const fetchQuote = async () => {
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

        const response = await databases.listDocuments(DATABASE_ID, 'quotes', [
          Query.equal('clientToken', token),
          Query.limit(1)
        ]);

        if (response.documents.length === 0) {
          // ✅ Incrémenter le compteur de tokens invalides
          const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
          if (!failedCheck.allowed) {
            setError(`Trop de tentatives avec des tokens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
          } else {
            setError('Devis introuvable ou lien expiré.');
          }
          return;
        }

        const doc = response.documents[0] as unknown as QuoteData;

        // ✅ Vérification de sécurité : teamId valide
        if (!doc.teamId) {
          setError('Erreur de sécurité : document invalide.');
          return;
        }

        // ✅ Vérification cohérence token
        if (doc.clientToken !== token) {
          setError('Token invalide.');
          return;
        }

        // ✅ Vérification d'expiration du token
        if (isTokenExpired(doc)) {
          setError('Ce lien a expiré. Veuillez demander un nouveau lien au professionnel.');
          return;
        }

        setQuote(doc);
        try {
          setItems(doc.items ? JSON.parse(doc.items) : []);
        } catch {
          setItems([]);
        }

        // ✅ Récupération de la devise
        if (doc.teamId) {
          try {
            const settingsRes = await databases.listDocuments(DATABASE_ID, 'company_settings', [
              Query.equal('teamId', doc.teamId),
              Query.limit(1)
            ]);
            if (settingsRes.documents.length > 0) {
              const s = settingsRes.documents[0] as any;
              if (s.currencySymbol) setSymbol(s.currencySymbol);
              else if (s.currencyConfig) {
                try {
                  const config = typeof s.currencyConfig === 'string' ? JSON.parse(s.currencyConfig) : s.currencyConfig;
                  if (config.symbol) setSymbol(config.symbol);
                } catch {}
              }
            }
          } catch (e) {
            console.warn('Impossible de récupérer les paramètres entreprise:', e);
          }
        }
        if ((doc as any).currencySymbol) setSymbol((doc as any).currencySymbol);

        if (doc.status === 'Accepté' || doc.status === 'Refusé') {
          setSuccess(true);
        }

        // ✅ Log d'audit de la vue (non bloquant)
        try {
          await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
            teamId: doc.teamId,
            data: JSON.stringify({
              type: 'public_quote_viewed',
              documentType: 'quote',
              documentId: doc.$id,
              documentNumber: doc.quoteNumber,
              eventDate: new Date().toISOString(),
              userAgent: navigator.userAgent.substring(0, 200),
              ipAddress: 'client'
            })
          });
        } catch (auditErr) {
          console.warn('Audit log non critique:', auditErr);
        }
      } catch (err: any) {
        console.error('Erreur fetchQuote:', err);
        setError(err.message || 'Une erreur est survenue.');
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [token, isBlockedForFailed, failedRemainingTime]);

  // ============================================================
  // ✅ CANVAS DE SIGNATURE
  // ============================================================
  useEffect(() => {
    if (!sigCanvas.current || action !== 'accept') return;
    const canvas = sigCanvas.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    let drawing = false;

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing = true;
      setIsDrawing(true);
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const draw = (e: MouseEvent | TouchEvent) => {
      if (!drawing) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const stop = () => {
      drawing = false;
      setIsDrawing(false);
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseleave', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stop);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stop);
      canvas.removeEventListener('mouseleave', stop);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stop);
    };
  }, [action]);

  const getSignatureData = (): string | null => {
    if (!sigCanvas.current) return null;
    const ctx = sigCanvas.current.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, sigCanvas.current.width, sigCanvas.current.height);
    let hasContent = false;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) { hasContent = true; break; }
    }

    return hasContent ? sigCanvas.current.toDataURL('image/png') : null;
  };

  const clearSignature = () => {
    if (!sigCanvas.current) return;
    const ctx = sigCanvas.current.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, sigCanvas.current.width, sigCanvas.current.height);
  };

  // ============================================================
  // ✅ CALCULS
  // ============================================================
  const isQuoteExpired = useMemo(() => {
    if (!quote?.validityDate) return false;
    return new Date(quote.validityDate) < new Date();
  }, [quote]);

  const daysUntilExpiry = useMemo(() => {
    if (!quote?.clientTokenExpiresAt) return null;
    const expiry = new Date(quote.clientTokenExpiresAt);
    const now = new Date();
    const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [quote]);

  // ============================================================
  // ✅ ACCEPTATION DU DEVIS
  // ============================================================
  const handleAccept = async () => {
    if (!quote || !quote.teamId) return;
    if (submitting) return;

    // ✅ Rate limit
    const rateCheck = tryConsumeAction();
    if (!rateCheck.allowed) {
      toast.error('Trop de tentatives', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
      });
      return;
    }

    if (quote.status === 'Accepté' || quote.status === 'Refusé') {
      toast.info('Ce devis a déjà été traité.');
      return;
    }

    if (isQuoteExpired) {
      toast.warning('Ce devis est expiré. Veuillez contacter le professionnel pour obtenir un nouveau devis.');
      return;
    }

    const signature = getSignatureData();
    if (!signature) {
      toast.error('Veuillez apposer votre signature avant de confirmer.');
      return;
    }

    if (!rgpdAccepted) {
      toast.error('Veuillez accepter les conditions avant de signer.');
      return;
    }

    setSubmitting(true);
    try {
      // ✅ Mise à jour du devis (permissions par défaut de la collection)
      await databases.updateDocument(DATABASE_ID, 'quotes', quote.$id, {
        status: 'Accepté',
        clientSignature: signature,
        acceptedAt: new Date().toISOString()
      });

      // ✅ Log d'audit
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: quote.teamId,
          data: JSON.stringify({
            type: 'quote_accepted_by_client',
            documentType: 'quote',
            documentId: quote.$id,
            documentNumber: quote.quoteNumber,
            amount: quote.total,
            eventDate: new Date().toISOString(),
            reference: quote.clientName,
            userAgent: navigator.userAgent.substring(0, 200),
            note: 'Devis accepté publiquement par le client (signature électronique)'
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }

      // ✅ Conversion automatique prospect → client
      if (quote.prospectId && quote.teamId) {
        try {
          const prospectDoc = await databases.getDocument(DATABASE_ID, 'prospects', quote.prospectId);

          // ✅ Vérification de sécurité multi-tenant
          if (prospectDoc.teamId !== quote.teamId) {
            console.warn('Sécurité : Prospect et devis dans des équipes différentes');
          } else if (prospectDoc.status !== 'won') {
            const currentYear = new Date().getFullYear();
            const prefix = `CLI-${currentYear}-`;
            let maxNum = 0;

            const existingClients = await databases.listDocuments(DATABASE_ID, 'clients', [
              Query.equal('teamId', quote.teamId),
              Query.limit(2000)
            ]);

            existingClients.documents.forEach((doc: any) => {
              if (doc.clientId && doc.clientId.startsWith(prefix)) {
                const num = parseInt(doc.clientId.replace(prefix, ''), 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
              }
            });

            const generatedClientId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

            await databases.createDocument(
              DATABASE_ID,
              'clients',
              ID.unique(),
              {
                teamId: quote.teamId,
                userId: quote.userId,
                clientId: generatedClientId,
                type: prospectDoc.companyName ? 'entreprise' : 'particulier',
                country: prospectDoc.country || 'FR',
                firstName: prospectDoc.firstName,
                lastName: prospectDoc.lastName,
                companyName: prospectDoc.companyName || '',
                email: prospectDoc.email || '',
                phone: prospectDoc.phone || '',
                address: prospectDoc.address || '',
                postalCode: prospectDoc.postalCode || '',
                city: prospectDoc.city || '',
                siren: prospectDoc.siren || '',
                siret: prospectDoc.siret || '',
                vatNumber: prospectDoc.vatNumber || '',
                notes: `Converti automatiquement après acceptation du devis ${quote.quoteNumber}.`,
                status: 'active',
                prospectId: quote.prospectId
              }
            );

            await databases.updateDocument(DATABASE_ID, 'prospects', quote.prospectId, {
              status: 'won',
              lastContactDate: new Date().toISOString().split('T')[0],
              notes: `${prospectDoc.notes || ''}\n\n✅ Devis ${quote.quoteNumber} accepté le ${new Date().toLocaleDateString('fr-FR')}\n🎉 Converti en client ${generatedClientId}`
            });

            setNewClientId(generatedClientId);
          }
        } catch (e) {
          console.error('Erreur conversion automatique:', e);
        }
      }

      setQuote({ ...quote, status: 'Accepté', clientSignature: signature });
      setSuccess(true);
      toast.success('Devis accepté avec succès !');
    } catch (e: any) {
      console.error('Erreur handleAccept:', e);
      toast.error('Erreur lors de l\'acceptation', { description: e.message || 'Veuillez réessayer.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // ✅ REFUS DU DEVIS
  // ============================================================
  const handleRefuse = async () => {
    if (!quote || !quote.teamId || !refuseComment.trim()) {
      toast.error('Veuillez indiquer la raison du refus.');
      return;
    }
    if (submitting) return;

    // ✅ Rate limit
    const rateCheck = tryConsumeAction();
    if (!rateCheck.allowed) {
      toast.error('Trop de tentatives', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
      });
      return;
    }

    if (quote.status === 'Accepté' || quote.status === 'Refusé') {
      toast.info('Ce devis a déjà été traité.');
      return;
    }

    setSubmitting(true);
    try {
      await databases.updateDocument(DATABASE_ID, 'quotes', quote.$id, {
        status: 'Refusé',
        clientComment: refuseComment,
        refusedAt: new Date().toISOString()
      });

      // ✅ Log d'audit
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', ID.unique(), {
          teamId: quote.teamId,
          data: JSON.stringify({
            type: 'quote_refused_by_client',
            documentType: 'quote',
            documentId: quote.$id,
            documentNumber: quote.quoteNumber,
            eventDate: new Date().toISOString(),
            reference: quote.clientName,
            userAgent: navigator.userAgent.substring(0, 200),
            note: `Refusé publiquement. Motif: ${refuseComment}`
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }

      // ✅ Mise à jour du prospect (avec vérification teamId)
      if (quote.prospectId && quote.teamId) {
        try {
          const prospectDoc = await databases.getDocument(DATABASE_ID, 'prospects', quote.prospectId);
          if (prospectDoc.teamId === quote.teamId) {
            await databases.updateDocument(DATABASE_ID, 'prospects', quote.prospectId, {
              status: 'contacted',
              lastContactDate: new Date().toISOString().split('T')[0],
              notes: `${prospectDoc.notes || ''}\n\n❌ Devis ${quote.quoteNumber} refusé le ${new Date().toLocaleDateString('fr-FR')}\nMotif : ${refuseComment}`
            });
          }
        } catch (e) {
          console.error('Erreur mise à jour prospect:', e);
        }
      }

      setQuote({ ...quote, status: 'Refusé', clientComment: refuseComment });
      setSuccess(true);
      toast.success('Votre refus a bien été enregistré.');
    } catch (err: any) {
      console.error('Erreur handleRefuse:', err);
      toast.error('Erreur lors du refus', { description: err.message || 'Veuillez réessayer.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // ✅ TÉLÉCHARGEMENT PDF
  // ============================================================
  const handleDownloadPdf = async () => {
    if (!quote) return;

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
      const subjectToVAT = !((quote.companyTva || '').toLowerCase().includes('non applicable'));

      let Y = M;
      doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(147, 51, 234);
      doc.text('DEVIS', M, Y + 10);
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(`N° ${quote.quoteNumber}`, M, Y + 16);
      doc.setFontSize(9);
      doc.text(`Date : ${quote.issueDate ? new Date(quote.issueDate).toLocaleDateString('fr-FR') : '-'}`, W - M, Y + 5, { align: 'right' });
      if (quote.validityDate) doc.text(`Valable jusqu'au : ${new Date(quote.validityDate).toLocaleDateString('fr-FR')}`, W - M, Y + 10, { align: 'right' });

      Y += 24;
      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0, 0, 0);
      doc.text(quote.companyName || '', M, Y);
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      if (quote.companyAddress) doc.text(quote.companyAddress, M, Y + 5);
      if (quote.companySiret) doc.text(`SIRET : ${quote.companySiret}`, M, Y + 9);
      if (quote.companyTva) doc.text(`TVA : ${quote.companyTva}`, M, Y + 13);

      const clientBoxX = W - M - 60;
      doc.setDrawColor(150); doc.setLineWidth(0.3);
      doc.rect(clientBoxX, Y - 2, 60, 18);
      doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('CLIENT', clientBoxX + 2, Y + 2);
      doc.setFont(undefined, 'normal'); doc.setFontSize(9);
      doc.text(quote.clientName || '', clientBoxX + 2, Y + 6);
      if (quote.clientAddress) doc.text(quote.clientAddress.substring(0, 50), clientBoxX + 2, Y + 10);
      if (quote.clientEmail) doc.text(quote.clientEmail, clientBoxX + 2, Y + 14);

      Y += 24;

      const tableData = items.map(i => {
        const lineTotal = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100);
        return [
          i.reference || '-',
          i.description,
          i.quantity.toFixed(2),
          i.unit,
          `${i.unitPrice.toFixed(2)} ${symbol}`,
          `${(i.discount || 0).toFixed(0)}%`,
          `${round2(lineTotal).toFixed(2)} ${symbol}`,
          `${i.tvaRate}%`
        ];
      });

      autoTable(doc, {
        startY: Y,
        head: [['Réf.', 'Désignation', 'Qté', 'Unité', 'Prix U HT', 'Remise', 'Total HT', 'TVA']],
        body: tableData,
        theme: 'grid',
        margin: { left: M, right: M },
        headStyles: { fillColor: [147, 51, 234], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      let ty = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = W - M - 60;
      doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(0, 0, 0);

      const line = (label: string, value: string, bold = false) => {
        doc.setFont(undefined, bold ? 'bold' : 'normal');
        doc.text(label, totalsX, ty);
        doc.text(value, W - M, ty, { align: 'right' });
        ty += 5;
      };

      line('Total HT', fm(quote.subtotal || 0));
      if ((quote.discount || 0) > 0) {
        line(`Remise ${quote.discount}%`, `- ${fm((quote.subtotal || 0) * (quote.discount || 0) / 100)}`);
      }
      if (subjectToVAT) {
        const map = new Map<number, { baseHT: number; taxAmount: number }>();
        items.forEach(i => {
          const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - (quote.discount || 0) / 100);
          const cur = map.get(i.tvaRate) || { baseHT: 0, taxAmount: 0 };
          cur.baseHT += base;
          cur.taxAmount += base * (i.tvaRate || 0) / 100;
          map.set(i.tvaRate, cur);
        });
        Array.from(map.entries()).sort((a, b) => b[0] - a[0]).forEach(([rate, v]) => {
          line(`TVA ${rate}%`, fm(round2(v.taxAmount)));
        });
      }
      line('Total TTC', fm(quote.total || 0), true);
      if ((quote.deposit || 0) > 0) {
        line('Acompte', `- ${fm(quote.deposit || 0)}`);
        line('NET À PAYER', fm(quote.balance || 0), true);
      }

      if (quote.clientSignature && quote.bonPourAccord) {
        ty += 8;
        doc.setFontSize(9); doc.setFont(undefined, 'bold');
        doc.text('Signature du client :', M, ty);
        try {
          doc.addImage(quote.clientSignature, 'PNG', M, ty + 2, 40, 20);
        } catch {}
      }

      if (!subjectToVAT && quote.companyTva) {
        doc.setFontSize(7); doc.setFont(undefined, 'italic'); doc.setTextColor(100, 100, 100);
        doc.text(quote.companyTva, M, 285);
      }

      // ✅ Pied de page avec mentions légales
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text('Document généré le ' + new Date().toLocaleString('fr-FR'), M, 290);
      doc.text('Lien sécurisé - Document non modifiable', W - M, 290, { align: 'right' });

      doc.save(`Devis_${quote.quoteNumber}.pdf`);
      toast.success('PDF téléchargé', {
        description: `Devis_${quote.quoteNumber}.pdf`
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
    return !((quote?.companyTva || '').toLowerCase().includes('non applicable'));
  }, [quote]);

  const taxBreakdown = useMemo(() => {
    if (!quote || !isTvaApplicable) return [];
    const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
    items.forEach(i => {
      const base = i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100) * (1 - (quote.discount || 0) / 100);
      const cur = map.get(i.tvaRate) || { rate: i.tvaRate, baseHT: 0, taxAmount: 0 };
      cur.baseHT = round2(cur.baseHT + base);
      cur.taxAmount = round2(cur.taxAmount + base * (i.tvaRate || 0) / 100);
      map.set(i.tvaRate, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
  }, [quote, items, isTvaApplicable]);

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-purple-600" />
          <div className="text-slate-500 dark:text-slate-400 text-sm">Chargement du devis...</div>
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

  if (error || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="w-full max-w-md">
          <EmptyState
            icon={XCircle}
            title={error?.includes('expiré') ? 'Lien expiré' :
                   error?.includes('Trop de tentatives') ? 'Accès bloqué' :
                   'Lien invalide'}
            description={error || "Ce devis n'est pas accessible."}
            tone="rose"
          />
          {error?.includes('expiré') && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-4 italic text-center">
              Pour des raisons de sécurité, les liens de consultation expirent après 30 jours.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (success) {
    const isAccepted = quote.status === 'Accepté';
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <Card className="max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAccepted ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
            {isAccepted ? <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" /> : <XCircle size={32} className="text-orange-600 dark:text-orange-400" />}
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {isAccepted ? 'Devis accepté !' : 'Devis refusé'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {isAccepted
              ? `Merci ! Votre accord a bien été enregistré. ${quote.companyName} va procéder à la suite des opérations.`
              : "Votre retour a bien été pris en compte. L'artisan va étudier vos remarques et vous recontacter."}
          </p>
          {isAccepted && newClientId && (
            <Alert tone="success" icon={CheckCircle2} title="Fiche client créée" className="text-left mb-4">
              <p className="text-sm">
                Votre fiche client a été créée automatiquement.<br/>
                N° Client : <span className="font-mono font-bold">{newClientId}</span>
              </p>
            </Alert>
          )}
          {isAccepted && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || isBlockedForPdf}
                className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 font-medium text-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={isBlockedForPdf ? `Limite atteinte (${pdfRemainingTime})` : undefined}
              >
                {downloadingPdf ? (
                  <><Loader2 size={16} className="animate-spin" /> Génération...</>
                ) : (
                  <><Download size={16} /> Télécharger le devis signé</>
                )}
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-4 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 font-medium text-sm active:scale-95 transition-all"
              >
                <Printer size={16} /> Imprimer
              </button>
            </div>
          )}
          <button onClick={() => window.close()} className="text-blue-600 dark:text-blue-400 font-medium hover:underline text-sm">
            Fermer la page
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8 px-4 print:bg-white">
      <div className="max-w-5xl mx-auto bg-white dark:bg-slate-800 shadow-2xl rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">

        {/* ✅ Bannière d'expiration du token */}
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
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} />
                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase">Devis</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">DEVIS</h1>
              <p className="text-purple-100 text-lg font-mono">{quote.quoteNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <h2 className="text-xl font-bold">{quote.companyName || 'Entreprise'}</h2>
              {quote.companyLegalForm && <p className="text-purple-100 text-xs">{quote.companyLegalForm}</p>}
              <p className="text-purple-100 text-sm whitespace-pre-line mt-1">{quote.companyAddress}</p>
              {quote.companySiret && <p className="text-purple-100 text-xs">SIRET : {quote.companySiret}</p>}
              {quote.companyEmail && <p className="text-purple-100 text-xs">{quote.companyEmail}</p>}
              {quote.companyPhone && <p className="text-purple-100 text-xs">Tél : {quote.companyPhone}</p>}
            </div>
          </div>
        </div>

        {/* Alerte devis expiré */}
        {isQuoteExpired && (
          <Alert tone="error" icon={AlertCircle} title="Ce devis est expiré" className="rounded-none border-x-0 border-t-0">
            <p className="text-sm">
              Il n'est plus possible de l'accepter. Veuillez contacter le professionnel pour obtenir un nouveau devis.
            </p>
          </Alert>
        )}

        {/* Infos client */}
        <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
              <Calendar size={12} /> Dates
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <strong>Date d'émission :</strong> {quote.issueDate ? new Date(quote.issueDate).toLocaleDateString('fr-FR') : '-'}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <strong>Valable jusqu'au :</strong> {quote.validityDate ? new Date(quote.validityDate).toLocaleDateString('fr-FR') : '-'}
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
              Facturé à
            </h3>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{quote.clientName}</p>
            {quote.clientAddress && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{quote.clientAddress}</p>}
            {quote.clientEmail && <p className="text-sm text-slate-600 dark:text-slate-400">{quote.clientEmail}</p>}
          </div>
        </div>

        {quote.subject && (
          <div className="p-6 sm:p-8 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Objet : {quote.subject}</h3>
          </div>
        )}

        {/* Tableau des lignes */}
        <div className="p-6 sm:p-8">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            Détail des prestations
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-purple-600">
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Réf.</th>
                  <th className="text-left py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Désignation</th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Qté</th>
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Prix U HT</th>
                  {isTvaApplicable && <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">TVA</th>}
                  <th className="text-right py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={isTvaApplicable ? 6 : 5} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      Aucune ligne disponible.
                    </td>
                  </tr>
                ) : items.map((item, idx) => {
                  const lineTotal = round2(item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100));
                  return (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="py-3 text-slate-600 dark:text-slate-400 text-xs font-mono">{item.reference || '-'}</td>
                      <td className="py-3 text-slate-900 dark:text-white">
                        <div>{item.description}</div>
                        {(item.discount || 0) > 0 && (
                          <div className="text-xs text-red-600 dark:text-red-400">Remise : {item.discount}%</div>
                        )}
                      </td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">{item.quantity.toFixed(2)} {item.unit}</td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">{item.unitPrice.toFixed(2)} {symbol}</td>
                      {isTvaApplicable && <td className="py-3 text-right text-slate-600 dark:text-slate-400">{item.tvaRate}%</td>}
                      <td className="py-3 text-right font-semibold text-slate-900 dark:text-white">{lineTotal.toFixed(2)} {symbol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="mt-8 flex justify-end">
            <div className="w-full sm:w-80 space-y-2">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Sous-total HT :</span>
                <span className="font-semibold">{fm(quote.subtotal || 0)}</span>
              </div>
              {(quote.discount || 0) > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Remise globale ({quote.discount}%) :</span>
                  <span className="font-semibold">- {fm((quote.subtotal || 0) * (quote.discount || 0) / 100)}</span>
                </div>
              )}
              {isTvaApplicable && taxBreakdown.map(b => (
                <div key={b.rate} className="flex justify-between text-slate-600 dark:text-slate-400 text-sm">
                  <span>TVA {b.rate}% (base {fm(b.baseHT)}) :</span>
                  <span>{fm(b.taxAmount)}</span>
                </div>
              ))}
              {!isTvaApplicable && (
                <div className="text-xs italic text-slate-500 dark:text-slate-400 py-1">
                  {quote.companyTva || 'TVA non applicable'}
                </div>
              )}
              <div className="flex justify-between text-xl font-bold text-purple-600 dark:text-purple-400 border-t-2 border-purple-600 pt-2 mt-2">
                <span>Total TTC :</span>
                <span>{fm(quote.total || 0)}</span>
              </div>
              {(quote.deposit || 0) > 0 && (
                <>
                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                    <span>Acompte demandé :</span>
                    <span className="font-semibold">{fm(quote.deposit || 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white border-t pt-2">
                    <span>Net à payer :</span>
                    <span>{fm(quote.balance || 0)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 sm:p-8 border-t border-slate-200 dark:border-slate-700">
          {(quote.paymentMethods || quote.paymentConditions || quote.executionDelay) && (
            <div className="mb-4">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Euro size={12} /> Conditions de règlement
              </h4>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                {quote.paymentMethods && <p><strong>Mode :</strong> {quote.paymentMethods}</p>}
                {quote.paymentConditions && <p><strong>Conditions :</strong> {quote.paymentConditions}</p>}
                {quote.executionDelay && <p><strong>Délai :</strong> {quote.executionDelay}</p>}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                Pénalités de retard : 3× le taux d'intérêt légal (loi 2008-776).<br />
                Indemnité forfaitaire pour frais de recouvrement : 40 € (art. D.441-5).
              </p>
            </div>
          )}

          {(quote.tradeType || quote.insuranceName) && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Shield size={12} /> Assurances & Garanties
              </h4>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                {quote.tradeType && <p><strong>Type :</strong> {quote.tradeType}</p>}
                {quote.insuranceName && <p><strong>Assureur :</strong> {quote.insuranceName}</p>}
                {quote.insurancePolicy && <p><strong>N° police :</strong> {quote.insurancePolicy}</p>}
              </div>
            </div>
          )}

          {quote.specialConditions && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Conditions particulières</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{quote.specialConditions}</p>
            </div>
          )}
        </div>

        {/* Zone d'actions client */}
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 border-t-2 border-purple-600">
          {!action ? (
            <div className="space-y-4 max-w-md mx-auto">
              <button
                onClick={() => setAction('accept')}
                disabled={isQuoteExpired || isBlockedForAction}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-4 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                title={isBlockedForAction ? `Réessayez dans ${actionRemainingTime}` : undefined}
              >
                <CheckCircle2 size={20} /> Accepter et signer électroniquement
              </button>
              <button
                onClick={() => setAction('refuse')}
                disabled={isQuoteExpired || isBlockedForAction}
                className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-700 border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold py-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                title={isBlockedForAction ? `Réessayez dans ${actionRemainingTime}` : undefined}
              >
                <XCircle size={20} /> Refuser ce devis
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf || isBlockedForPdf}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isBlockedForPdf ? `Limite atteinte (${pdfRemainingTime})` : `${pdfRemainingAttempts} téléchargement(s) restant(s)`}
                >
                  {downloadingPdf ? (
                    <><Loader2 size={14} className="animate-spin" /> ...</>
                  ) : (
                    <><Download size={14} /> Télécharger PDF</>
                  )}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 transition-all"
                >
                  <Printer size={14} /> Imprimer
                </button>
              </div>
              {isBlockedForAction && (
                <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                  ⚠️ Action temporairement bloquée. Réessayez dans {actionRemainingTime}.
                </p>
              )}
            </div>
          ) : action === 'refuse' ? (
            <div className="max-w-md mx-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
              <h3 className="font-semibold text-red-900 dark:text-red-200 mb-3 flex items-center gap-2">
                <AlertCircle size={18} /> Raison du refus
              </h3>
              <FormField label="Motif du refus" required>
                <Textarea
                  value={refuseComment}
                  onChange={(e) => setRefuseComment(e.target.value)}
                  rows={4}
                  placeholder="Veuillez indiquer pourquoi vous refusez ce devis..."
                />
              </FormField>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRefuse}
                  disabled={submitting || !refuseComment.trim() || isBlockedForAction}
                  className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Envoi...</>
                  ) : (
                    'Confirmer le refus'
                  )}
                </button>
                <button
                  onClick={() => { setAction(null); setRefuseComment(''); }}
                  disabled={submitting}
                  className="px-6 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
              <h3 className="font-semibold text-green-900 dark:text-green-200 mb-3 flex items-center gap-2">
                <PenTool size={18} /> Signature électronique
              </h3>
              <p className="text-sm text-green-800 dark:text-green-300 mb-4">
                En signant ci-dessous, vous acceptez les termes de ce devis et validez la commande.
              </p>
              <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg mb-4 overflow-hidden">
                <canvas
                  ref={sigCanvas}
                  width={400}
                  height={150}
                  className="block w-full touch-none cursor-crosshair bg-white"
                  style={{ height: '150px' }}
                />
              </div>
              <button
                onClick={clearSignature}
                disabled={submitting}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-3 underline disabled:opacity-50"
              >
                Effacer la signature
              </button>

              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rgpdAccepted}
                  onChange={(e) => setRgpdAccepted(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 rounded text-green-600 focus:ring-green-500"
                />
                <span>
                  J'accepte que ma signature et mes informations soient enregistrées conformément à la politique de confidentialité de {quote.companyName} (RGPD).
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={handleAccept}
                  disabled={submitting || !rgpdAccepted || isBlockedForAction}
                  className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  title={isBlockedForAction ? `Réessayez dans ${actionRemainingTime}` : `${actionRemainingAttempts} tentative(s) restante(s)`}
                >
                  {submitting ? (
                    <><Loader2 size={18} className="animate-spin" /> Validation...</>
                  ) : (
                    <><Send size={18} /> Confirmer l'acceptation</>
                  )}
                </button>
                <button
                  onClick={() => { setAction(null); clearSignature(); setRgpdAccepted(false); }}
                  disabled={submitting}
                  className="px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ✅ Infos de sécurité et compteurs */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-400 dark:text-slate-500 py-4 px-6 bg-slate-50 dark:bg-slate-900/50">
          <p className="italic">
            Document consulté le {new Date().toLocaleDateString('fr-FR')} — Lien sécurisé
          </p>
          <p className="text-center">
            <Shield size={12} className="inline mr-1" />
            {pdfRemainingAttempts} téléchargement(s) restant(s) • {actionRemainingAttempts} action(s) restante(s)
          </p>
        </div>
      </div>
    </div>
  );
}
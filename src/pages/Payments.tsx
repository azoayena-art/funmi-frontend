import Sidebar from '../components/Sidebar';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import {
  DollarSign, Calendar, Download,
  TrendingUp, CreditCard, Receipt, FileText, Eye, TrendingDown, FileMinus
} from 'lucide-react';
import { Query } from 'appwrite';
import {
  PageHeader,
  KPIGrid,
  StatCell,
  Card,
  SectionTitle,
  TypeTabs,
  SearchFilter,
  SelectFilter,
  DataTable,
  MobileCard,
  Badge,
  ActionMenu,
  ActionMenuItem,
  EmptyState,
} from '../components/ui/SharedUI';

interface Payment {
  id: string;
  amount: number | string;
  date: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface ParsedPayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  notes: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  invoiceType?: string;
  flowType: 'credit' | 'debit';
  reason?: string;
  originalInvoiceNumber?: string;
  refundStatus?: 'refunded' | 'partial_refund' | 'to_refund' | 'allocated' | 'emitted';
}

interface Invoice {
  $id: string;
  invoiceNumber: string;
  clientName: string;
  teamId: string;
  total: number;
  type?: string;
  status?: string;
  payments?: any;
  $createdAt?: string;
  paidAt?: string;
  notes?: string;
  originalInvoiceId?: string;
}

const methodLabels: Record<string, string> = {
  'Virement bancaire': '🏦 Virement',
  'Chèque': '📝 Chèque',
  'Espèces': '💵 Espèces',
  'Carte bancaire': '💳 Carte',
  'Prélèvement SEPA': '🔄 SEPA',
  'Avoir': '📉 Avoir',
  'Autre': '📦 Autre'
};

const methodBadgeTone: Record<string, 'blue' | 'purple' | 'green' | 'red' | 'amber' | 'slate'> = {
  'Virement bancaire': 'blue',
  'Chèque': 'purple',
  'Espèces': 'green',
  'Carte bancaire': 'purple',
  'Prélèvement SEPA': 'amber',
  'Avoir': 'red',
  'Autre': 'slate'
};

const refundStatusLabels: Record<string, { label: string; tone: 'slate' | 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' }> = {
  refunded: { label: 'Remboursé', tone: 'red' },
  partial_refund: { label: 'Remb. partiel', tone: 'orange' },
  to_refund: { label: 'À rembourser', tone: 'amber' },
  allocated: { label: 'Imputé', tone: 'green' },
  emitted: { label: 'Émis', tone: 'slate' },
};

export default function Payments() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  const { fm, currency, currencyConfig, loading: settingsLoading } = useCompanySettings();
  const { customTeamId } = useTeam();
  const SYM = currencyConfig?.symbol || '€';

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<ParsedPayment[]>([]);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [activeTab, setActiveTab] = useState<'credit' | 'debit'>('credit');

  useEffect(() => {
    if (!permLoading && !hasPermission('invoices.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!customTeamId) return;
    loadPayments();
  }, [user, customTeamId]);

  const readJson = (raw: unknown): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const loadPayments = async () => {
    try {
      setLoading(true);
      
      const teamId = customTeamId;
      if (!teamId) {
        console.warn('⚠️ Payments: customTeamId non résolu, attente...');
        setLoading(false);
        return;
      }

      console.log('💰 Payments: Chargement avec customTeamId:', teamId);

      const invoicesRes = await databases.listDocuments(
        DATABASE_ID, 'invoices',
        [Query.equal('teamId', teamId), Query.limit(2000)]
      );

      const allInvoices = invoicesRes.documents as unknown as Invoice[];

      let metadataMap = new Map<string, any>();
      try {
        const metaRes = await databases.listDocuments(DATABASE_ID, 'invoice_metadata', [
          Query.equal('teamId', teamId),
          Query.limit(2000)
        ]);
        metaRes.documents.forEach((doc: any) => {
          metadataMap.set(doc.invoiceId, {
            creditData: readJson(doc.creditData),
            archiveData: readJson(doc.archiveData),
            reconciliationData: readJson(doc.reconciliationData),
          });
        });
      } catch (e) {
        console.warn('invoice_metadata non disponible, fallback sur anciens avoirs');
      }

      let journalPayments: any[] = [];
      try {
        const journalRes = await databases.listDocuments(DATABASE_ID, 'invoice_payments', [
          Query.equal('teamId', teamId),
          Query.limit(2000)
        ]);
        journalPayments = journalRes.documents.map((d: any) => ({ ...readJson(d.data), $id: d.$id }));
      } catch (e) {
        console.warn('invoice_payments non disponible, fallback sur champ payments');
      }

      const allPayments: ParsedPayment[] = [];

      // CAS 1 : ENCAISSEMENTS
      if (journalPayments.length > 0) {
        journalPayments.forEach(jp => {
          if (jp.status !== 'confirmed') return;
          const inv = allInvoices.find(i => i.$id === jp.invoiceId);
          if (!inv) return;
          const amountNum = Number(jp.amount);
          if (!isNaN(amountNum) && amountNum > 0) {
            allPayments.push({
              id: `journal-${jp.$id || jp.invoiceId}-${jp.paymentDate}`,
              amount: amountNum,
              date: jp.paymentDate || jp.createdAt || new Date().toISOString(),
              method: jp.method || 'Autre',
              reference: jp.reference || '',
              notes: jp.notes || '',
              invoiceId: inv.$id,
              invoiceNumber: inv.invoiceNumber,
              clientName: inv.clientName || 'Client inconnu',
              teamId: inv.teamId,
              invoiceType: inv.type,
              flowType: 'credit'
            });
          }
        });
      } else {
        allInvoices.forEach(invoice => {
          if (invoice.type === 'credit') return;
          
          let parsedPayments: Payment[] = [];
          if (invoice.payments) {
            try {
              if (typeof invoice.payments === 'string') {
                const trimmed = invoice.payments.trim();
                if (trimmed && trimmed !== 'null' && trimmed !== '[]' && trimmed !== '""') {
                  parsedPayments = JSON.parse(trimmed);
                }
              } else if (Array.isArray(invoice.payments)) {
                parsedPayments = invoice.payments;
              } else if (typeof invoice.payments === 'object') {
                parsedPayments = [invoice.payments as unknown as Payment];
              }
            } catch (e) {
              console.warn(`⚠️ Erreur parsing JSON pour ${invoice.invoiceNumber}:`, e);
              parsedPayments = [];
            }
          }

          if (Array.isArray(parsedPayments)) {
            parsedPayments.forEach(payment => {
              const amountNum = Number(payment.amount);
              if (!isNaN(amountNum) && amountNum > 0) {
                allPayments.push({
                  id: payment.id || `gen-${Math.random().toString(36).substr(2, 9)}`,
                  amount: amountNum,
                  date: payment.date || invoice.$createdAt || new Date().toISOString(),
                  method: payment.method || 'Autre',
                  reference: payment.reference || '',
                  notes: payment.notes || '',
                  invoiceId: invoice.$id,
                  invoiceNumber: invoice.invoiceNumber,
                  clientName: invoice.clientName || 'Client inconnu',
                  teamId: invoice.teamId,
                  invoiceType: invoice.type,
                  flowType: 'credit'
                });
              }
            });
          }
        });
      }

      // CAS 2 : DÉCAISSEMENTS
      allInvoices.forEach(invoice => {
        if (invoice.type !== 'credit' || invoice.status === 'cancelled') return;

        const meta = metadataMap.get(invoice.$id) || { creditData: {} };
        const creditData = meta.creditData || {};
        const creditStatus = creditData.creditStatus;

        const originalInvoice = allInvoices.find(inv => inv.$id === invoice.originalInvoiceId);
        const originalInvoiceNumber = originalInvoice?.invoiceNumber || '';
        const reasonLine = (invoice.notes || '').split('\n').find(l => l.startsWith('MOTIF AVOIR : '));
        const reason = reasonLine ? reasonLine.replace('MOTIF AVOIR : ', '') : 'Avoir émis';

        if (creditStatus === undefined) {
          const amountNum = Number(invoice.total);
          if (!isNaN(amountNum) && amountNum > 0) {
            allPayments.push({
              id: `credit-legacy-${invoice.$id}`,
              amount: amountNum,
              date: invoice.paidAt || invoice.$createdAt || new Date().toISOString(),
              method: 'Avoir',
              reference: invoice.invoiceNumber,
              notes: reason,
              invoiceId: invoice.$id,
              invoiceNumber: invoice.invoiceNumber,
              clientName: invoice.clientName || 'Client inconnu',
              teamId: invoice.teamId,
              invoiceType: 'credit',
              flowType: 'debit',
              reason,
              originalInvoiceNumber,
              refundStatus: 'emitted'
            });
          }
          return;
        }

        if (creditStatus === 'allocated') {
          allPayments.push({
            id: `credit-allocated-${invoice.$id}`,
            amount: Number(invoice.total),
            date: invoice.$createdAt || new Date().toISOString(),
            method: 'Avoir',
            reference: invoice.invoiceNumber,
            notes: `${reason} (imputé sur facture)`,
            invoiceId: invoice.$id,
            invoiceNumber: invoice.invoiceNumber,
            clientName: invoice.clientName || 'Client inconnu',
            teamId: invoice.teamId,
            invoiceType: 'credit',
            flowType: 'debit',
            reason,
            originalInvoiceNumber,
            refundStatus: 'allocated'
          });
          return;
        }

        let refunds: any[] = [];
        try {
          if (Array.isArray(creditData.refundPayments)) refunds = creditData.refundPayments;
        } catch { refunds = []; }

        const refundedSum = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const totalAmount = Number(invoice.total) || 0;
        const refundableAmount = Math.max(0, totalAmount - refundedSum);

        if (refunds.length > 0) {
          refunds.forEach((refund: any, idx: number) => {
            const amountNum = Number(refund.amount);
            if (!isNaN(amountNum) && amountNum > 0) {
              allPayments.push({
                id: `refund-${invoice.$id}-${idx}`,
                amount: amountNum,
                date: refund.date || invoice.$createdAt || new Date().toISOString(),
                method: refund.method || 'Virement bancaire',
                reference: refund.reference || invoice.invoiceNumber,
                notes: `${reason} (remboursement)`,
                invoiceId: invoice.$id,
                invoiceNumber: invoice.invoiceNumber,
                clientName: invoice.clientName || 'Client inconnu',
                teamId: invoice.teamId,
                invoiceType: 'credit',
                flowType: 'debit',
                reason,
                originalInvoiceNumber,
                refundStatus: creditStatus
              });
            }
          });
        }
        
        if (refundableAmount > 0.01 && (creditStatus === 'to_refund' || creditStatus === 'partial_refund')) {
          allPayments.push({
            id: `credit-pending-${invoice.$id}`,
            amount: refundableAmount,
            date: invoice.$createdAt || new Date().toISOString(),
            method: 'Avoir',
            reference: invoice.invoiceNumber,
            notes: `${reason} ⏳ EN ATTENTE de remboursement`,
            invoiceId: invoice.$id,
            invoiceNumber: invoice.invoiceNumber,
            clientName: invoice.clientName || 'Client inconnu',
            teamId: invoice.teamId,
            invoiceType: 'credit',
            flowType: 'debit',
            reason,
            originalInvoiceNumber,
            refundStatus: creditStatus
          });
        }
      });

      allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPayments(allPayments);
      
    } catch (error) {
      console.error('❌ Erreur critique chargement paiements:', error);
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const creditPayments = payments.filter(p => p.flowType === 'credit');
  
  const debitPayments = payments.filter(p => 
    p.flowType === 'debit' && 
    (p.refundStatus === 'refunded' || p.refundStatus === 'partial_refund' || p.refundStatus === undefined)
  );
  
  const pendingCredits = payments.filter(p => 
    p.flowType === 'debit' && 
    (p.refundStatus === 'to_refund' || p.refundStatus === 'partial_refund')
  );

  const globalInflows = creditPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const globalOutflows = debitPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingAmount = pendingCredits.reduce((sum, p) => sum + Number(p.amount), 0);
  const globalNet = globalInflows - globalOutflows;

  const thisMonthInflows = creditPayments.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + Number(p.amount), 0);

  const thisMonthOutflows = debitPayments.filter(p => {
    const d = new Date(p.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + Number(p.amount), 0);

  const thisYearInflows = creditPayments.filter(p => {
    const d = new Date(p.date);
    return d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + Number(p.amount), 0);

  const thisYearOutflows = debitPayments.filter(p => {
    const d = new Date(p.date);
    return d.getFullYear() === currentYear;
  }).reduce((sum, p) => sum + Number(p.amount), 0);

  const activeList = activeTab === 'credit' ? creditPayments : payments.filter(p => p.flowType === 'debit');
  
  const filteredPayments = activeList.filter(p => {
    const searchStr = `${p.invoiceNumber} ${p.clientName} ${p.reference || ''} ${p.method} ${p.notes || ''} ${p.originalInvoiceNumber || ''}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchMethod = filterMethod === 'all' || p.method === filterMethod;
    
    let matchPeriod = true;
    if (filterPeriod !== 'all') {
      const d = new Date(p.date);
      if (filterPeriod === 'month') matchPeriod = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      else if (filterPeriod === 'quarter') {
        const cq = Math.floor(currentMonth / 3);
        matchPeriod = Math.floor(d.getMonth() / 3) === cq && d.getFullYear() === currentYear;
      }
      else if (filterPeriod === 'year') matchPeriod = d.getFullYear() === currentYear;
    }
    
    return matchSearch && matchMethod && matchPeriod;
  });

  const filteredInflowAmount = activeTab === 'credit' 
    ? filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0) 
    : 0;
    
  const filteredOutflowAmount = activeTab === 'debit' 
    ? filteredPayments.filter(p => p.refundStatus === 'refunded' || p.refundStatus === 'partial_refund' || p.refundStatus === undefined)
      .reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  const filteredPendingAmount = activeTab === 'debit'
    ? filteredPayments.filter(p => p.method === 'Avoir' && (p.refundStatus === 'to_refund' || p.refundStatus === 'partial_refund'))
      .reduce((sum, p) => sum + Number(p.amount), 0)
    : 0;

  const uniqueMethods = Array.from(new Set(activeList.map(p => p.method)));

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
  };

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) { alert('Aucune transaction à exporter'); return; }
    const headers = ['Date', 'Type', 'N° Document', 'Client', 'Montant', 'Moyen', 'Référence', 'Sur facture', 'Statut', 'Notes'];
    const rows = filteredPayments.map(p => {
      let docType = '';
      if (p.flowType === 'debit') docType = 'Avoir';
      else if (p.invoiceType === 'advance') docType = 'Acompte';
      else docType = 'Facture';
      
      const signedAmount = p.flowType === 'debit' ? `-${Number(p.amount).toFixed(2)}` : Number(p.amount).toFixed(2);
      const statusLabel = p.flowType === 'debit' ? (refundStatusLabels[p.refundStatus || 'emitted']?.label || '-') : 'Encaissé';
      
      return [
        formatDate(p.date), 
        docType,
        p.invoiceNumber, 
        p.clientName,
        signedAmount, 
        p.method, 
        p.reference || '', 
        p.originalInvoiceNumber || '',
        statusLabel,
        (p.notes || '').replace(/[\n\r]/g, ' ')
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTab === 'credit' ? 'Encaissements' : 'Decaissements'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setFilterMethod('all');
  }, [activeTab]);

  if (permLoading || settingsLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits et paramètres...</div></div></Sidebar>;

  const isCreditTab = activeTab === 'credit';

  // Onglets pour TypeTabs
  const typeTabs = [
    { 
      key: 'credit', 
      label: '💰 Encaissements', 
      count: creditPayments.length 
    },
    { 
      key: 'debit', 
      label: '💸 Décaissements', 
      count: payments.filter(p => p.flowType === 'debit').length 
    },
  ];

  // Options pour les filtres
  const periodOptions = [
    { value: 'all', label: 'Toutes périodes' },
    { value: 'month', label: 'Ce mois' },
    { value: 'quarter', label: 'Ce trimestre' },
    { value: 'year', label: 'Cette année' },
  ];

  const methodOptions = uniqueMethods.map(m => ({ 
    value: m, 
    label: methodLabels[m] || m 
  }));

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={DollarSign}
          iconColor="purple"
          title="Flux de trésorerie"
          description="Encaissements réels et remboursements effectifs"
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            <button 
              onClick={handleExportCSV} 
              className={`flex items-center justify-center gap-2 ${isCreditTab ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95`}
            >
              <Download size={16} /> Exporter {isCreditTab ? 'Encaissements' : 'Décaissements'}
            </button>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* KPIs GLOBAUX avec KPIGrid + StatCell */}
          <KPIGrid columns={4}>
            <StatCell
              value={`+ ${fm(globalInflows)}`}
              label="Encaissé"
              sublabel={`${creditPayments.length} paiement(s)`}
              trend={undefined}
            />
            <StatCell
              value={`- ${fm(globalOutflows)}`}
              label="Décaissé"
              sublabel="Remboursements effectifs"
              trend={undefined}
            />
            <StatCell
              value={fm(pendingAmount)}
              label="À rembourser"
              sublabel={`${pendingCredits.length} avoir(s) en attente`}
              trend={undefined}
            />
            <StatCell
              value={`${globalNet >= 0 ? '+' : ''}${fm(globalNet)}`}
              label="Trésorerie nette"
              sublabel="Encaissé − Décaissé"
              trend={undefined}
            />
          </KPIGrid>

          {/* KPIs FILTRÉS avec Card + SectionTitle */}
          <Card className="mb-6">
            <SectionTitle>Sur la liste affichée</SectionTitle>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Encaissé</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  + {fm(isCreditTab ? filteredInflowAmount : 0)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Décaissé</p>
                <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-1">
                  - {fm(isCreditTab ? 0 : filteredOutflowAmount)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">
                  {isCreditTab ? 'Transactions' : 'À rembourser'}
                </p>
                <p className={`text-sm font-bold ${isCreditTab ? 'text-slate-900 dark:text-white' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {isCreditTab ? filteredPayments.length : fm(filteredPendingAmount)}
                </p>
              </div>
            </div>
          </Card>

          {/* ONGLETS avec TypeTabs */}
          <TypeTabs
            tabs={typeTabs}
            activeTab={activeTab}
            onTabChange={(key) => setActiveTab(key as 'credit' | 'debit')}
            color={isCreditTab ? 'emerald' : 'rose'}
          />

          {/* KPIs DE L'ONGLET ACTIF avec KPIGrid */}
          <KPIGrid columns={3}>
            {isCreditTab ? (
              <>
                <StatCell
                  value={`+ ${fm(thisMonthInflows)}`}
                  label="Encaissé ce mois"
                  sublabel={`${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}
                  trend={undefined}
                />
                <StatCell
                  value={`+ ${fm(thisYearInflows)}`}
                  label="Encaissé cette année"
                  sublabel={`${currentYear}`}
                  trend={undefined}
                />
                <StatCell
                  value={activeList.length}
                  label="Nombre de paiements"
                  sublabel="Total encaissements"
                  trend={undefined}
                />
              </>
            ) : (
              <>
                <StatCell
                  value={`- ${fm(thisMonthOutflows)}`}
                  label="Décaissé ce mois"
                  sublabel={`${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`}
                  trend={undefined}
                />
                <StatCell
                  value={`- ${fm(thisYearOutflows)}`}
                  label="Décaissé cette année"
                  sublabel={`${currentYear}`}
                  trend={undefined}
                />
                <StatCell
                  value={activeList.length}
                  label="Nombre d'opérations"
                  sublabel="Total décaissements"
                  trend={undefined}
                />
              </>
            )}
          </KPIGrid>

          {/* FILTRES avec SearchFilter + SelectFilter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder={isCreditTab 
                ? 'Rechercher (facture, client, référence...)' 
                : 'Rechercher (avoir, client, motif...)'}
              shortcut="⌘K"
            />
            <SelectFilter
              value={filterPeriod}
              onChange={setFilterPeriod}
              options={periodOptions}
              placeholder="Période"
            />
            <SelectFilter
              value={filterMethod}
              onChange={setFilterMethod}
              options={methodOptions}
              placeholder="Tous moyens"
            />
          </div>

          {/* BANNIÈRE DE RÉSUMÉ avec Card */}
          {filteredPayments.length > 0 && (
            <Card className="mb-4" padding={false}>
              <div className={`${isCreditTab ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'} p-3 rounded-xl flex justify-between items-center`}>
                <span className={`text-sm font-medium ${isCreditTab ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
                  {filteredPayments.length} {isCreditTab ? 'paiement(s)' : 'opération(s)'} affiché(s)
                </span>
                <span className={`text-lg font-bold ${isCreditTab ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {isCreditTab ? '+ ' : '- '}{fm(isCreditTab ? filteredInflowAmount : filteredOutflowAmount)}
                </span>
              </div>
            </Card>
          )}

          {/* CONTENU */}
          {loading ? (
            <DataTable loading={true} headers={[
              { label: 'Date', align: 'left' },
              { label: isCreditTab ? 'Facture' : 'Avoir', align: 'left' },
              { label: 'Client', align: 'left' },
              { label: isCreditTab ? 'Moyen' : 'Statut', align: 'left' },
              { label: 'Référence', align: 'left' },
              { label: 'Montant', align: 'right' },
              { label: '', align: 'right', width: 'w-12' }
            ]} />
          ) : filteredPayments.length === 0 ? (
            <EmptyState
              icon={isCreditTab ? DollarSign : FileMinus}
              title={isCreditTab ? 'Aucun encaissement' : 'Aucun décaissement'}
              description={
                activeList.length === 0
                  ? (isCreditTab 
                      ? "Aucun paiement n'a encore été enregistré. Enregistrez un paiement depuis la page Factures." 
                      : "Aucun remboursement n'a encore été effectué. Enregistrez un remboursement depuis la page Factures sur un avoir.")
                  : "Aucune transaction ne correspond à vos filtres."
              }
              tone={isCreditTab ? 'emerald' : 'rose'}
            />
          ) : (
            <>
              {/* TABLEAU DESKTOP avec DataTable */}
              <DataTable headers={[
                { label: 'Date', align: 'left' },
                { label: isCreditTab ? 'Facture' : 'Avoir', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: isCreditTab ? 'Moyen' : 'Statut', align: 'left' },
                { label: 'Référence', align: 'left' },
                { label: 'Montant', align: 'right' },
                { label: '', align: 'right', width: 'w-12' }
              ]}>
                {filteredPayments.map((p, idx) => {
                  const statusInfo = p.flowType === 'debit' ? refundStatusLabels[p.refundStatus || 'emitted'] : null;
                  return (
                    <tr key={`${p.invoiceId}-${p.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDate(p.date)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <button onClick={() => navigate('/invoices')} className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline" title="Voir la facture">
                            {p.flowType === 'debit' ? <FileMinus size={14} /> : <Receipt size={14} />}
                            {p.invoiceNumber}
                          </button>
                          {p.flowType === 'credit' && p.invoiceType === 'advance' && (
                            <Badge tone="blue">Acompte</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{p.clientName}</td>
                      <td className="px-6 py-4">
                        {p.flowType === 'credit' ? (
                          <Badge tone={methodBadgeTone[p.method] || 'slate'}>
                            {methodLabels[p.method] || p.method}
                          </Badge>
                        ) : statusInfo ? (
                          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                        ) : (
                          <span className="text-sm text-slate-700 dark:text-slate-300">{p.method}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {p.flowType === 'debit' ? (
                          p.originalInvoiceNumber ? (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sur facture</span>
                              <button 
                                onClick={() => navigate('/invoices')} 
                                className="font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 hover:underline text-xs"
                                title="Voir la facture d'origine"
                              >
                                {p.originalInvoiceNumber}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )
                        ) : (
                          <span className="font-mono">{p.reference || '-'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-bold ${p.flowType === 'credit' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                          {p.flowType === 'credit' ? '+ ' : '- '}{fm(Number(p.amount))}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-right w-12">
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <ActionMenu>
                            <ActionMenuItem onClick={() => navigate('/invoices')} icon={Eye} label="Voir facture" />
                            <ActionMenuItem 
                              onClick={() => {
                                const prefix = p.flowType === 'debit' ? 'Remboursement' : 'Paiement';
                                const sign = p.flowType === 'debit' ? '-' : '';
                                const originalRef = p.flowType === 'debit' && p.originalInvoiceNumber ? ` - Sur facture ${p.originalInvoiceNumber}` : '';
                                const text = `${prefix} de ${sign}${fm(Number(p.amount))} - ${p.invoiceNumber} - ${p.clientName}${originalRef}${p.reference && p.flowType === 'credit' ? ` - Réf: ${p.reference}` : ''}${p.notes ? ` - ${p.notes}` : ''}`;
                                navigator.clipboard.writeText(text);
                                alert('✅ Détails copiés !');
                              }} 
                              icon={FileText} 
                              label="Copier détails" 
                            />
                          </ActionMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>

              {/* VERSION MOBILE avec MobileCard */}
              <div className="md:hidden space-y-4 mt-4">
                {filteredPayments.map((p, idx) => {
                  const statusInfo = p.flowType === 'debit' ? refundStatusLabels[p.refundStatus || 'emitted'] : null;
                  return (
                    <MobileCard key={`${p.invoiceId}-${p.id}-${idx}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-1 rounded ${
                              p.flowType === 'debit' 
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                : p.invoiceType === 'advance' 
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                                  : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                            }`}>
                              {p.flowType === 'debit' ? <FileMinus size={12} /> : <Receipt size={12} />}
                              {p.invoiceNumber}
                            </span>
                            {p.flowType === 'credit' ? (
                              <Badge tone={methodBadgeTone[p.method] || 'slate'}>
                                {methodLabels[p.method] || p.method}
                              </Badge>
                            ) : statusInfo ? (
                              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                            ) : null}
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{p.clientName}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar size={10} />
                            {formatDate(p.date)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className={`text-lg font-bold ${p.flowType === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {p.flowType === 'credit' ? '+ ' : '- '}{fm(Number(p.amount))}
                          </p>
                        </div>
                      </div>

                      {(p.reference || p.notes || p.originalInvoiceNumber) && (
                        <div className="grid grid-cols-1 gap-2 py-3 border-t border-b border-slate-100 dark:border-slate-700 mb-3 text-xs">
                          {p.flowType === 'debit' && (
                            <>
                              {p.notes && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Motif</span>
                                  <span className="text-slate-700 dark:text-slate-300 text-right truncate max-w-[60%]">{p.notes}</span>
                                </div>
                              )}
                              {p.originalInvoiceNumber && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">Sur facture</span>
                                  <button 
                                    onClick={() => navigate('/invoices')} 
                                    className="font-mono font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 text-right"
                                  >
                                    {p.originalInvoiceNumber}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                          {p.flowType === 'credit' && p.reference && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-slate-400">Référence</span>
                              <span className="font-mono font-medium text-slate-900 dark:text-white">{p.reference}</span>
                            </div>
                          )}
                          {p.flowType === 'credit' && p.notes && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-slate-400">Notes</span>
                              <span className="text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">{p.notes}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => navigate('/invoices')} 
                          className="flex items-center justify-center gap-2 p-2.5 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg active:scale-95 transition-transform"
                        >
                          <Eye size={16} />
                          <span className="text-xs font-medium">Voir facture</span>
                        </button>
                        <button 
                          onClick={() => {
                            const prefix = p.flowType === 'debit' ? 'Remboursement' : 'Paiement';
                            const sign = p.flowType === 'debit' ? '-' : '';
                            const originalRef = p.flowType === 'debit' && p.originalInvoiceNumber ? ` - Sur facture ${p.originalInvoiceNumber}` : '';
                            const text = `${prefix} de ${sign}${fm(Number(p.amount))} - ${p.invoiceNumber} - ${p.clientName}${originalRef}${p.reference && p.flowType === 'credit' ? ` - Réf: ${p.reference}` : ''}${p.notes ? ` - ${p.notes}` : ''}`;
                            navigator.clipboard.writeText(text);
                            alert('✅ Détails copiés !');
                          }}
                          className={`flex items-center justify-center gap-2 p-2.5 ${isCreditTab ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'} rounded-lg active:scale-95 transition-transform`}
                        >
                          <FileText size={16} />
                          <span className="text-xs font-medium">Copier</span>
                        </button>
                      </div>
                    </MobileCard>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </Sidebar>
  );
}
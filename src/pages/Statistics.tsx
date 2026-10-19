import Sidebar from '../components/Sidebar';
import { Badge } from '../components/ui/SharedUI';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { useTreasury } from '../hooks/useTreasury';
import { toast } from 'sonner';
import { Query } from 'appwrite';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import {
  BarChart3, TrendingUp, TrendingDown, Target, Clock, MapPin,
  Users, Award, ArrowUpRight, ArrowDownRight, Minus, Activity,
  Download, Wrench, HardHat, AlertTriangle, CheckCircle2, XCircle,
  Timer, Wallet, Briefcase, ArrowRight, Phone, Calendar, Sparkles,
  Banknote, Receipt, PiggyBank, TrendingDown as TrendDown,
  CircleDollarSign, ArrowDownLeft, ArrowUpRight as ArrowUpR,
} from 'lucide-react';

// ============================================================
// 📋 INTERFACES
// ============================================================
interface Invoice {
  $id: string; invoiceNumber: string; clientName: string; clientCity?: string;
  status: string; total: number; subtotal: number; tax?: number; type?: string;
  issueDate?: string; dueDate?: string; paidAt?: string; teamId?: string;
  tradeType?: string;
  companyTva?: string;
  originalInvoiceId?: string;
  payments?: any;
}
interface Quote {
  $id: string; quoteNumber: string; clientName: string;
  status: string; total: number; issueDate?: string; validityDate?: string;
  teamId?: string; tradeType?: string; clientCity?: string;
}

// ============================================================
// 🎨 SPARKLINE SVG
// ============================================================
const Sparkline = ({ data, color = '#8b5cf6', height = 32, width = 100 }: {
  data: number[]; color?: string; height?: number; width?: number;
}) => {
  if (data.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.05;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ✅ CORRIGÉ : support des métriques inversées (délais, charges...)
const DeltaBadge = ({ value, invert = false }: { value: number; invert?: boolean }) => {
  const safe = typeof value === 'number' && isFinite(value) ? value : 0;
  const isUp = safe > 0;
  const isZero = safe === 0;
  const Icon = isZero ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  // `invert` : pour les métriques où une baisse est une bonne nouvelle
  const isGood = invert ? !isUp : isUp;

  const color = isZero
    ? 'text-slate-500 bg-slate-100 dark:bg-slate-800'
    : isGood
      ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
      : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40';

  return (
    <span className={`inline-flex items-center font-semibold rounded-md tabular-nums text-xs px-1.5 py-0.5 gap-0.5 ${color}`}>
      <Icon size={12} strokeWidth={2.5} />
      {Math.abs(safe).toFixed(1)}%
    </span>
  );
};

// ✅ CORRIGÉ : support de invertDelta
const MetricCard = ({ label, value, delta, sparkline, sparkColor, sublabel, icon: Icon, hint, invertDelta = false }: {
  label: string; value: string; delta: number; sparkline: number[];
  sparkColor: string; sublabel?: string; icon?: any; hint?: string;
  invertDelta?: boolean;
}) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-all group relative">
    {hint && (
      <div className="absolute top-3 right-3 group-hover:opacity-100 opacity-0 transition-opacity">
        <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{hint}</span>
      </div>
    )}
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon size={14} className="text-slate-400" />}
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums tracking-tight">{value}</span>
          <DeltaBadge value={delta} invert={invertDelta} />
        </div>
        {sublabel && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sublabel}</p>}
      </div>
    </div>
    <Sparkline data={sparkline} color={sparkColor} height={36} width={200} />
  </div>
);

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function Statistics() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { fm, loading: settingsLoading, isSubjectToVAT, currency } = useCompanySettings();
  const { customTeamId } = useTeam();
  const { transactions } = useTreasury();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    if (!permLoading && !hasPermission('reports.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user || !customTeamId) return;
    (async () => {
      setLoading(true);
      try {
        const [invRes, quoRes] = await Promise.all([
          databases.listDocuments(DATABASE_ID, 'invoices', [Query.equal('teamId', customTeamId), Query.orderDesc('$createdAt'), Query.limit(200)]),
databases.listDocuments(DATABASE_ID, 'quotes', [Query.equal('teamId', customTeamId), Query.orderDesc('$createdAt'), Query.limit(200)]),
        ]);
        setInvoices(invRes.documents as Invoice[]);
        setQuotes(quoRes.documents as Quote[]);
      } catch (e) {
        toast.error('Erreur chargement statistiques');
      } finally { setLoading(false); }
    })();
  }, [user, customTeamId]);

  // ============================================================
  // ✅ LOGIQUE COMPTABLE
  // ============================================================
  const vatActive = useMemo(() => {
    if (isSubjectToVAT) return true;
    return invoices.some(inv => 
      inv.companyTva && inv.companyTva.trim() !== '' && 
      !inv.companyTva.toLowerCase().includes('non applicable')
    );
  }, [isSubjectToVAT, invoices]);

  const amountOf = useCallback((inv: Invoice): number => {
    return vatActive ? (inv.subtotal || 0) : (inv.total || 0);
  }, [vatActive]);

  const htRatio = useCallback((inv: Invoice): number => {
    if (!inv.total || inv.total <= 0) return 0;
    return amountOf(inv) / inv.total;
  }, [amountOf]);

  const doubleCountingSets = useMemo(() => {
    const advancesWithFinal = new Set(
      invoices
        .filter(i => (i.type === 'standard' || i.type === 'balance') && i.originalInvoiceId)
        .filter(i => invoices.some(a => a.$id === i.originalInvoiceId && a.type === 'advance'))
        .map(i => i.originalInvoiceId!)
    );
    const originalsWithAdvance = new Set(
      invoices.filter(i => i.type === 'advance' && i.originalInvoiceId).map(i => i.originalInvoiceId!)
    );
    return { advancesWithFinal, originalsWithAdvance };
  }, [invoices]);

  const isRevenueInvoice = useCallback((i: Invoice): boolean => {
    if (i.type === 'credit' || i.status === 'cancelled') return false;
    if (i.type === 'advance' && doubleCountingSets.advancesWithFinal.has(i.$id)) return false;
    if ((i.type === 'standard' || i.type === 'balance') && doubleCountingSets.originalsWithAdvance.has(i.$id)) return false;
    return true;
  }, [doubleCountingSets]);

  const getDirectPayments = useCallback((invoice: Invoice): number => {
    let payments: any[] = [];
    try {
      if (typeof invoice.payments === 'string' && invoice.payments.trim()) {
        payments = JSON.parse(invoice.payments);
      } else if (Array.isArray(invoice.payments)) {
        payments = invoice.payments;
      }
    } catch (e) { payments = []; }
    return payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  }, []);

  const getEffectivePaidAmount = useCallback((invoice: Invoice): number => {
    const directPayments = getDirectPayments(invoice);
    let totalPaid = directPayments;
    if ((invoice.type === 'standard' || invoice.type === 'balance') && invoice.originalInvoiceId) {
      const advanceInvoice = invoices.find(i => i.$id === invoice.originalInvoiceId && i.type === 'advance');
      if (advanceInvoice && advanceInvoice.status === 'paid') {
        totalPaid += (advanceInvoice.total || 0);
      }
    }
    if (totalPaid === 0 && invoice.paidAt && invoice.status === 'paid') {
      totalPaid = invoice.total || 0;
    }
    return Math.min(totalPaid, invoice.total || 0);
  }, [getDirectPayments, invoices]);

  const getEffectivePaidAmountHT = useCallback((invoice: Invoice): number => {
    const paidTTC = getEffectivePaidAmount(invoice);
    return paidTTC * htRatio(invoice);
  }, [getEffectivePaidAmount, htRatio]);

  const getNetRemaining = useCallback((invoice: Invoice): number => {
    if (invoice.type === 'credit') return 0;
    const paidAmount = getEffectivePaidAmount(invoice);
    const allocated = invoices
      .filter(inv => inv.type === 'credit' && inv.originalInvoiceId === invoice.$id && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    return Math.max(0, (invoice.total || 0) - paidAmount - allocated);
  }, [getEffectivePaidAmount, invoices]);

  const getNetRemainingHT = useCallback((invoice: Invoice): number => {
    return getNetRemaining(invoice) * htRatio(invoice);
  }, [getNetRemaining, htRatio]);

  const getAllocatedCreditsHT = useCallback((invoice: Invoice): number => {
    const allocatedTTC = invoices
      .filter(inv => inv.type === 'credit' && inv.originalInvoiceId === invoice.$id && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    return allocatedTTC * htRatio(invoice);
  }, [invoices, htRatio]);

  const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };

  // ============================================================
  // 💰 STATISTIQUES TRÉSORERIE GLOBALE
  // ============================================================
  const treasuryStats = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    const manualOps = transactions.filter(t => t.source === 'manual' && !t.isArchived);
    
    const monthlyInflows: number[] = [];
    const monthlyOutflows: number[] = [];
    const monthlyNet: number[] = [];
    
    for (let i = 11; i >= 0; i--) {
      const start = monthsAgo(i); start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
      
      let inflows = 0;
      
      invoices.forEach(inv => {
        if (!isRevenueInvoice(inv)) return;
        let payments: any[] = [];
        try {
          if (typeof inv.payments === 'string' && inv.payments.trim()) payments = JSON.parse(inv.payments);
          else if (Array.isArray(inv.payments)) payments = inv.payments;
        } catch (e) { payments = []; }
        
        payments.forEach((p: any) => {
          if (!p.date) return;
          const d = new Date(p.date);
          if (d >= start && d <= end) inflows += (p.amount || 0) * htRatio(inv);
        });
        
        if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
          const advanceInv = invoices.find(ix => ix.$id === inv.originalInvoiceId && ix.type === 'advance');
          if (advanceInv && advanceInv.status === 'paid' && advanceInv.paidAt) {
            const d = new Date(advanceInv.paidAt);
            if (d >= start && d <= end) inflows += (advanceInv.total || 0) * htRatio(advanceInv);
          }
        }
        
        if (payments.length === 0 && inv.paidAt && inv.status === 'paid') {
          const d = new Date(inv.paidAt);
          if (d >= start && d <= end) inflows += amountOf(inv);
        }
      });
      
      inflows += manualOps
        .filter(t => t.type === 'in')
        .filter(t => { const d = new Date(t.date); return d >= start && d <= end; })
        .reduce((sum, t) => sum + t.amount, 0);
      
      let outflows = manualOps
        .filter(t => t.type === 'out')
        .filter(t => { const d = new Date(t.date); return d >= start && d <= end; })
        .reduce((sum, t) => sum + t.amount, 0);
      
      invoices.forEach(inv => {
        if (inv.type !== 'credit' || inv.status === 'cancelled' || !inv.paidAt) return;
        const d = new Date(inv.paidAt);
        if (d >= start && d <= end) outflows += amountOf(inv);
      });
      
      monthlyInflows.push(inflows);
      monthlyOutflows.push(outflows);
      monthlyNet.push(inflows - outflows);
    }
    
    const totalInflows = monthlyInflows.reduce((s, v) => s + v, 0);
    const totalOutflows = monthlyOutflows.reduce((s, v) => s + v, 0);
    const netCashflow = totalInflows - totalOutflows;
    
    const currentMonthInflows = monthlyInflows[11];
    const currentMonthOutflows = monthlyOutflows[11];
    const currentMonthNet = monthlyNet[11];
    
    const prevMonthNet = monthlyNet[10];
    const netDelta = prevMonthNet !== 0 ? ((currentMonthNet - prevMonthNet) / Math.abs(prevMonthNet)) * 100 : 0;
    
    const expenseByCategory = new Map<string, number>();
    manualOps
      .filter(t => t.type === 'out')
      .forEach(t => {
        const key = t.category || 'other';
        expenseByCategory.set(key, (expenseByCategory.get(key) || 0) + t.amount);
      });
    
    const topExpenses = Array.from(expenseByCategory.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }));
    
    const last3Outflows = monthlyOutflows.slice(-3);
    const avgMonthlyBurn = last3Outflows.reduce((s, v) => s + v, 0) / 3;
    
    const runwayMonths = avgMonthlyBurn > 0 && netCashflow < 0 
      ? Math.abs(netCashflow) / avgMonthlyBurn 
      : 999;
    
    return {
      monthlyInflows,
      monthlyOutflows,
      monthlyNet,
      totalInflows,
      totalOutflows,
      netCashflow,
      currentMonthInflows,
      currentMonthOutflows,
      currentMonthNet,
      netDelta,
      topExpenses,
      avgMonthlyBurn,
      runwayMonths,
      manualOpsCount: manualOps.length,
    };
  }, [transactions, invoices, isRevenueInvoice, amountOf, htRatio]);

  // ============================================================
  // 📊 HERO METRICS (avec délai de paiement corrigé)
  // ============================================================
  const heroMetrics = useMemo(() => {
    const monthsEmitted: number[] = [];
    const monthsCollected: number[] = [];
    const monthsCredits: number[] = [];
    
    for (let i = 11; i >= 0; i--) {
      const start = monthsAgo(i); start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
      
      const emitted = invoices
        .filter(inv => isRevenueInvoice(inv) && inv.issueDate)
        .filter(inv => { const d = new Date(inv.issueDate!); return d >= start && d <= end; })
        .reduce((s, inv) => s + amountOf(inv), 0);
      
      const credits = invoices
        .filter(inv => inv.type === 'credit' && inv.status !== 'cancelled' && inv.issueDate)
        .filter(inv => { const d = new Date(inv.issueDate!); return d >= start && d <= end; })
        .reduce((s, inv) => s + amountOf(inv), 0);
      
      let collectedHT = 0;
      
      invoices.forEach(inv => {
        if (!isRevenueInvoice(inv)) return;
        
        let payments: any[] = [];
        try {
          if (typeof inv.payments === 'string' && inv.payments.trim()) payments = JSON.parse(inv.payments);
          else if (Array.isArray(inv.payments)) payments = inv.payments;
        } catch (e) { payments = []; }
        
        payments.forEach((p: any) => {
          if (!p.date) return;
          const d = new Date(p.date);
          if (d >= start && d <= end) collectedHT += (p.amount || 0) * htRatio(inv);
        });
        
        if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
          const advanceInv = invoices.find(i => i.$id === inv.originalInvoiceId && i.type === 'advance');
          if (advanceInv && advanceInv.status === 'paid' && advanceInv.paidAt) {
            const d = new Date(advanceInv.paidAt);
            if (d >= start && d <= end) collectedHT += (advanceInv.total || 0) * htRatio(advanceInv);
          }
        }
        
        if (payments.length === 0 && inv.paidAt && inv.status === 'paid') {
          const d = new Date(inv.paidAt);
          if (d >= start && d <= end) collectedHT += amountOf(inv);
        }
      });
      
      invoices.forEach(inv => {
        if (inv.type !== 'credit' || inv.status === 'cancelled') return;
        if (!inv.paidAt) return;
        const d = new Date(inv.paidAt);
        if (d >= start && d <= end) collectedHT -= amountOf(inv);
      });
      
      monthsEmitted.push(emitted);
      monthsCollected.push(Math.max(0, collectedHT));
      monthsCredits.push(credits);
    }
    
    const prevEmitted: number[] = [];
    const prevCollected: number[] = [];
    for (let i = 23; i >= 12; i--) {
      const start = monthsAgo(i); start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
      
      const emitted = invoices
        .filter(inv => isRevenueInvoice(inv) && inv.issueDate)
        .filter(inv => { const d = new Date(inv.issueDate!); return d >= start && d <= end; })
        .reduce((s, inv) => s + amountOf(inv), 0);
      
      let collectedHT = 0;
      invoices.forEach(inv => {
        if (!isRevenueInvoice(inv)) return;
        let payments: any[] = [];
        try {
          if (typeof inv.payments === 'string' && inv.payments.trim()) payments = JSON.parse(inv.payments);
          else if (Array.isArray(inv.payments)) payments = inv.payments;
        } catch (e) { payments = []; }
        payments.forEach((p: any) => {
          if (!p.date) return;
          const d = new Date(p.date);
          if (d >= start && d <= end) collectedHT += (p.amount || 0) * htRatio(inv);
        });
        if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
          const advanceInv = invoices.find(i => i.$id === inv.originalInvoiceId && i.type === 'advance');
          if (advanceInv && advanceInv.status === 'paid' && advanceInv.paidAt) {
            const d = new Date(advanceInv.paidAt);
            if (d >= start && d <= end) collectedHT += (advanceInv.total || 0) * htRatio(advanceInv);
          }
        }
        if (payments.length === 0 && inv.paidAt && inv.status === 'paid') {
          const d = new Date(inv.paidAt);
          if (d >= start && d <= end) collectedHT += amountOf(inv);
        }
      });
      invoices.forEach(inv => {
        if (inv.type !== 'credit' || inv.status === 'cancelled' || !inv.paidAt) return;
        const d = new Date(inv.paidAt);
        if (d >= start && d <= end) collectedHT -= amountOf(inv);
      });
      
      prevEmitted.push(emitted);
      prevCollected.push(Math.max(0, collectedHT));
    }

    const currentEmittedSum = monthsEmitted.reduce((s, v) => s + v, 0);
    const previousEmittedSum = prevEmitted.reduce((s, v) => s + v, 0);
    const caGrowth = previousEmittedSum > 0 ? ((currentEmittedSum - previousEmittedSum) / previousEmittedSum) * 100 : 0;

    const currentCollectedSum = monthsCollected.reduce((s, v) => s + v, 0);
    const previousCollectedSum = prevCollected.reduce((s, v) => s + v, 0);
    const collectedGrowth = previousCollectedSum > 0 ? ((currentCollectedSum - previousCollectedSum) / previousCollectedSum) * 100 : 0;

    const totalCredits = monthsCredits.reduce((s, v) => s + v, 0);

    const recentQuotes = quotes.filter(q => {
      const d = new Date(q.issueDate || ''); return d >= monthsAgo(12);
    });
    const sent = recentQuotes.filter(q => ['Envoyé', 'Accepté', 'Refusé', 'Facturé'].includes(q.status));
    const won = recentQuotes.filter(q => ['Accepté', 'Facturé'].includes(q.status));
    const lost = recentQuotes.filter(q => q.status === 'Refusé');
    const conversionRate = sent.length > 0 ? (won.length / sent.length) * 100 : 0;

    const prevQuotes = quotes.filter(q => {
      const d = new Date(q.issueDate || ''); return d >= monthsAgo(24) && d < monthsAgo(12);
    });
    const prevSent = prevQuotes.filter(q => ['Envoyé', 'Accepté', 'Refusé', 'Facturé'].includes(q.status));
    const prevWon = prevQuotes.filter(q => ['Accepté', 'Facturé'].includes(q.status));
    const prevConvRate = prevSent.length > 0 ? (prevWon.length / prevSent.length) * 100 : 0;
    const convDelta = prevConvRate > 0 ? ((conversionRate - prevConvRate) / prevConvRate) * 100 : 0;

    // ✅ CORRIGÉ : Délai de paiement robuste
    const toDelay = (inv: Invoice): { days: number; paidAt: number } | null => {
      const paid = new Date(inv.paidAt as string).getTime();
      const issued = new Date(inv.issueDate as string).getTime();
      if (!paid || !issued || isNaN(paid) || isNaN(issued)) return null;
      const days = Math.floor((paid - issued) / 86400000);
      if (days < 0 || days > 730) return null;
      return { days, paidAt: paid };
    };

    const paidWithDelay = invoices
      .filter(inv => isRevenueInvoice(inv) && inv.paidAt && inv.issueDate)
      .map(toDelay)
      .filter((x): x is { days: number; paidAt: number } => x !== null);

    const windowStart = monthsAgo(12).getTime();
    const delays12 = paidWithDelay.filter(d => d.paidAt >= windowStart).map(d => d.days);

    const avgDelay = delays12.length > 0
      ? Math.round(delays12.reduce((s, v) => s + v, 0) / delays12.length)
      : 0;

    const sortedDelays = [...delays12].sort((a, b) => a - b);
    const medianDelay = sortedDelays.length === 0
      ? 0
      : sortedDelays.length % 2 === 1
        ? sortedDelays[Math.floor(sortedDelays.length / 2)]
        : Math.round((sortedDelays[sortedDelays.length / 2 - 1] + sortedDelays[sortedDelays.length / 2]) / 2);

    const delaySpark: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = monthsAgo(i); start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
      const monthDays = paidWithDelay
        .filter(d => d.paidAt >= start.getTime() && d.paidAt <= end.getTime())
        .map(d => d.days);
      delaySpark.push(monthDays.length > 0
        ? Math.round(monthDays.reduce((s, v) => s + v, 0) / monthDays.length)
        : 0);
    }

    const prevStart = monthsAgo(24).getTime();
    const prevEnd = monthsAgo(12).getTime();
    const prevDelays = paidWithDelay
      .filter(d => d.paidAt >= prevStart && d.paidAt < prevEnd)
      .map(d => d.days);
    const prevAvgDelay = prevDelays.length > 0
      ? Math.round(prevDelays.reduce((s, v) => s + v, 0) / prevDelays.length)
      : 0;
    const avgDelayGrowth = (prevAvgDelay > 0 && avgDelay > 0)
      ? ((avgDelay - prevAvgDelay) / prevAvgDelay) * 100
      : 0;

    const delayBuckets = [
      { label: '≤ 15 j', min: 0, max: 15, count: 0, color: '#10b981' },
      { label: '16–30 j', min: 16, max: 30, count: 0, color: '#3b82f6' },
      { label: '31–60 j', min: 31, max: 60, count: 0, color: '#f59e0b' },
      { label: '> 60 j', min: 61, max: Infinity, count: 0, color: '#ef4444' },
    ];
    delays12.forEach(d => {
      const bucket = delayBuckets.find(b => d >= b.min && d <= b.max);
      if (bucket) bucket.count++;
    });

    const delayVerdict = delays12.length === 0
      ? 'Aucune donnée'
      : avgDelay <= 20
        ? 'Excellent'
        : avgDelay <= 30
          ? 'Conforme (30 j)'
          : avgDelay <= 45
            ? 'Acceptable'
            : avgDelay <= 60
              ? 'À surveiller'
              : 'Critique';

    const pipelineValue = quotes
      .filter(q => q.status === 'Accepté')
      .reduce((s, q) => {
        const amount = q.total || 0;
        return s + (vatActive ? amount / 1.2 : amount);
      }, 0);

    const unpaidTotal = invoices
      .filter(inv => isRevenueInvoice(inv) && inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < new Date())
      .reduce((s, inv) => s + getNetRemainingHT(inv), 0);

    const collectionRate = currentEmittedSum > 0 
      ? (currentCollectedSum / currentEmittedSum) * 100 
      : 0;

    return {
      revenueEmitted: { value: currentEmittedSum, growth: caGrowth, spark: monthsEmitted },
      revenueCollected: { value: currentCollectedSum, growth: collectedGrowth, spark: monthsCollected },
      credits: { value: totalCredits, spark: monthsCredits },
      collectionRate: { value: collectionRate },
      conversion: { value: conversionRate, growth: convDelta, won: won.length, sent: sent.length, lost: lost.length },
      avgDelay: {
        value: avgDelay,
        median: medianDelay,
        growth: avgDelayGrowth,
        spark: delaySpark,
        count: delays12.length,
        prevValue: prevAvgDelay,
        verdict: delayVerdict,
        buckets: delayBuckets,
      },
      pipeline: { value: pipelineValue },
      unpaid: { value: unpaidTotal },
    };
  }, [invoices, quotes, isRevenueInvoice, amountOf, htRatio, getNetRemainingHT, vatActive]);

  const pipeline = useMemo(() => {
    return [
      { stage: 'Devis envoyés', count: quotes.filter(q => q.status === 'Envoyé').length, value: quotes.filter(q => q.status === 'Envoyé').reduce((s, q) => s + (vatActive ? (q.total || 0) / 1.2 : (q.total || 0)), 0), color: '#6366f1', icon: Phone },
      { stage: 'Devis acceptés', count: quotes.filter(q => q.status === 'Accepté').length, value: quotes.filter(q => q.status === 'Accepté').reduce((s, q) => s + (vatActive ? (q.total || 0) / 1.2 : (q.total || 0)), 0), color: '#3b82f6', icon: CheckCircle2 },
      { stage: 'Factures émises', count: invoices.filter(inv => isRevenueInvoice(inv) && inv.status === 'sent').length, value: invoices.filter(inv => isRevenueInvoice(inv) && inv.status === 'sent').reduce((s, inv) => s + amountOf(inv), 0), color: '#0ea5e9', icon: Receipt },
      { stage: 'À encaisser', count: invoices.filter(inv => isRevenueInvoice(inv) && ['sent', 'partial'].includes(inv.status)).length, value: invoices.filter(inv => isRevenueInvoice(inv) && ['sent', 'partial'].includes(inv.status)).reduce((s, inv) => s + getNetRemainingHT(inv), 0), color: '#f59e0b', icon: Timer },
      { stage: 'Encaissés (12 mois)', count: invoices.filter(inv => isRevenueInvoice(inv) && inv.paidAt && new Date(inv.paidAt) >= monthsAgo(12)).length, value: invoices.filter(inv => isRevenueInvoice(inv) && inv.paidAt && new Date(inv.paidAt) >= monthsAgo(12)).reduce((s, inv) => s + getEffectivePaidAmountHT(inv), 0), color: '#10b981', icon: Banknote },
    ];
  }, [quotes, invoices, isRevenueInvoice, amountOf, getNetRemainingHT, getEffectivePaidAmountHT, vatActive]);

  const forecast = useMemo(() => {
    const now = new Date();
    const data = [];
    for (let i = 0; i < 3; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0, 23, 59, 59);
      const label = monthStart.toLocaleDateString('fr-FR', { month: 'long', year: '2-digit' });
      const fromQuotes = quotes.filter(q => q.status === 'Accepté' && q.validityDate).filter(q => { const d = new Date(q.validityDate!); return d >= monthStart && d <= monthEnd; }).reduce((s, q) => s + (vatActive ? (q.total || 0) / 1.2 : (q.total || 0)), 0);
      const fromInvoices = invoices.filter(inv => isRevenueInvoice(inv) && inv.status !== 'paid' && inv.dueDate).filter(inv => { const d = new Date(inv.dueDate!); return d >= monthStart && d <= monthEnd; }).reduce((s, inv) => s + getNetRemainingHT(inv), 0);
      data.push({ month: label.charAt(0).toUpperCase() + label.slice(1), 'À facturer': Math.round(fromQuotes), 'À encaisser': Math.round(fromInvoices) });
    }
    return data;
  }, [quotes, invoices, isRevenueInvoice, getNetRemainingHT, vatActive]);

  const revenueByTrade = useMemo(() => {
    const map: Record<string, { revenue: number; count: number }> = {};
    invoices.forEach(inv => {
      if (!isRevenueInvoice(inv)) return;
      const trade = inv.tradeType || 'Non spécifié';
      if (!map[trade]) map[trade] = { revenue: 0, count: 0 };
      const netRevenue = amountOf(inv) - getAllocatedCreditsHT(inv);
      map[trade].revenue += netRevenue;
      map[trade].count++;
    });
    return Object.entries(map).sort(([, a], [, b]) => b.revenue - a.revenue).slice(0, 6).map(([trade, data]) => ({ trade: trade.charAt(0).toUpperCase() + trade.slice(1), revenue: Math.round(data.revenue), count: data.count, avg: data.count > 0 ? Math.round(data.revenue / data.count) : 0 }));
  }, [invoices, isRevenueInvoice, amountOf, getAllocatedCreditsHT]);

  const topUnpaid = useMemo(() => {
    const now = new Date();
    return invoices.filter(inv => isRevenueInvoice(inv) && inv.status !== 'paid' && inv.dueDate).filter(inv => new Date(inv.dueDate!) < now).filter(inv => getNetRemaining(inv) > 0).map(inv => ({ client: inv.clientName || 'Client inconnu', invoiceNumber: inv.invoiceNumber, amount: getNetRemainingHT(inv), daysLate: Math.floor((now.getTime() - new Date(inv.dueDate!).getTime()) / 86400000), dueDate: inv.dueDate })).sort((a, b) => b.daysLate - a.daysLate).slice(0, 5);
  }, [invoices, isRevenueInvoice, getNetRemaining, getNetRemainingHT]);

  const geoTop = useMemo(() => {
    const map: Record<string, number> = {};
    invoices.forEach(inv => {
      if (!isRevenueInvoice(inv)) return;
      const city = inv.clientCity || 'Non renseigné';
      const netRevenue = amountOf(inv) - getAllocatedCreditsHT(inv);
      map[city] = (map[city] || 0) + netRevenue;
    });
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 6).map(([city, value]) => ({ city, value: Math.round(value) }));
  }, [invoices, isRevenueInvoice, amountOf, getAllocatedCreditsHT]);

  const clientRecurrence = useMemo(() => {
    const clientCount: Record<string, number> = {};
    invoices.forEach(inv => {
      if (!isRevenueInvoice(inv)) return;
      const c = inv.clientName || 'Inconnu';
      clientCount[c] = (clientCount[c] || 0) + 1;
    });
    const all = Object.values(clientCount);
    const oneShot = all.filter(c => c === 1).length;
    const recurrent = all.filter(c => c >= 2).length;
    const total = all.length;
    return { oneShot, recurrent, total, oneShotPct: total > 0 ? (oneShot / total) * 100 : 0, recurrentPct: total > 0 ? (recurrent / total) * 100 : 0, topRecurrents: Object.entries(clientCount).filter(([, count]) => count >= 2).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, count]) => ({ name, count })) };
  }, [invoices, isRevenueInvoice]);

  const seasonality = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear];
    const matrix: Record<number, number[]> = {};
    years.forEach(y => matrix[y] = new Array(12).fill(0));
    invoices.forEach(inv => {
      if (!isRevenueInvoice(inv) || !inv.issueDate) return;
      const d = new Date(inv.issueDate); const y = d.getFullYear(); const m = d.getMonth();
      if (matrix[y]) matrix[y][m] += amountOf(inv);
    });
    const max = Math.max(...years.flatMap(y => matrix[y]), 1);
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    return { years, matrix, max, monthNames };
  }, [invoices, isRevenueInvoice, amountOf]);

  const revenueTrend = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const data: Record<string, { month: string; emitted: number; collected: number; previous: number }> = {};
    for (let m = 0; m < 12; m++) {
      const d = new Date(currentYear, m, 1);
      data[m.toString()] = { month: d.toLocaleDateString('fr-FR', { month: 'short' }), emitted: 0, collected: 0, previous: 0 };
    }
    invoices.forEach(inv => {
      if (isRevenueInvoice(inv) && inv.issueDate) {
        const d = new Date(inv.issueDate);
        const amount = amountOf(inv);
        if (d.getFullYear() === currentYear) data[d.getMonth().toString()].emitted += amount;
        else if (d.getFullYear() === currentYear - 1) data[d.getMonth().toString()].previous += amount;
      }
      if (isRevenueInvoice(inv)) {
        let payments: any[] = [];
        try {
          if (typeof inv.payments === 'string' && inv.payments.trim()) payments = JSON.parse(inv.payments);
          else if (Array.isArray(inv.payments)) payments = inv.payments;
        } catch (e) { payments = []; }
        payments.forEach((p: any) => {
          if (!p.date) return;
          const d = new Date(p.date);
          if (d.getFullYear() === currentYear) data[d.getMonth().toString()].collected += (p.amount || 0) * htRatio(inv);
        });
        if ((inv.type === 'standard' || inv.type === 'balance') && inv.originalInvoiceId) {
          const advanceInv = invoices.find(i => i.$id === inv.originalInvoiceId && i.type === 'advance');
          if (advanceInv && advanceInv.status === 'paid' && advanceInv.paidAt) {
            const d = new Date(advanceInv.paidAt);
            if (d.getFullYear() === currentYear) data[d.getMonth().toString()].collected += (advanceInv.total || 0) * htRatio(advanceInv);
          }
        }
        if (payments.length === 0 && inv.paidAt && inv.status === 'paid') {
          const d = new Date(inv.paidAt);
          if (d.getFullYear() === currentYear) data[d.getMonth().toString()].collected += amountOf(inv);
        }
      }
      if (inv.type === 'credit' && inv.status !== 'cancelled' && inv.paidAt) {
        const d = new Date(inv.paidAt);
        if (d.getFullYear() === currentYear) data[d.getMonth().toString()].collected -= amountOf(inv);
      }
    });
    return Object.values(data);
  }, [invoices, isRevenueInvoice, amountOf, htRatio]);

  const conversionByTrade = useMemo(() => {
    const map: Record<string, { sent: number; won: number }> = {};
    quotes.forEach(q => {
      if (!['Envoyé', 'Accepté', 'Refusé', 'Facturé'].includes(q.status)) return;
      const trade = q.tradeType || 'Non spécifié';
      if (!map[trade]) map[trade] = { sent: 0, won: 0 };
      map[trade].sent++;
      if (['Accepté', 'Facturé'].includes(q.status)) map[trade].won++;
    });
    return Object.entries(map).map(([trade, d]) => ({ trade: trade.charAt(0).toUpperCase() + trade.slice(1), rate: d.sent > 0 ? (d.won / d.sent) * 100 : 0, sent: d.sent, won: d.won })).filter(d => d.sent >= 3).sort((a, b) => b.rate - a.rate);
  }, [quotes]);

  const treasuryChartData = useMemo(() => {
    const data = [];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    for (let i = 0; i < 12; i++) {
      const d = monthsAgo(11 - i);
      data.push({
        month: monthNames[d.getMonth()],
        entrees: Math.round(treasuryStats.monthlyInflows[i]),
        sorties: Math.round(treasuryStats.monthlyOutflows[i]),
        net: Math.round(treasuryStats.monthlyNet[i]),
      });
    }
    return data;
  }, [treasuryStats]);

  const insights = useMemo(() => {
    const list: Array<{ icon: any; color: string; title: string; description: string; accent: string; priority: 'high' | 'medium' | 'low' }> = [];

    if (treasuryStats.currentMonthNet < 0) {
      list.push({
        icon: TrendDown, color: 'bg-gradient-to-br from-red-500 to-rose-600',
        accent: 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20',
        title: `Trésorerie mensuelle négative`,
        description: `${fm(Math.abs(treasuryStats.currentMonthNet))} de déficit ce mois. Surveillez vos dépenses.`,
        priority: 'high',
      });
    }

    if (treasuryStats.topExpenses.length > 0) {
      const topCat = treasuryStats.topExpenses[0];
      const topPct = treasuryStats.totalOutflows > 0 
        ? (topCat.amount / treasuryStats.totalOutflows) * 100 
        : 0;
      if (topPct >= 40 && treasuryStats.totalOutflows > 0) {
        list.push({
          icon: AlertTriangle, color: 'bg-gradient-to-br from-amber-500 to-orange-500',
          accent: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20',
          title: `Poste de dépense concentré`,
          description: `${topPct.toFixed(0)}% de vos charges = "${topCat.category}". À optimiser ?`,
          priority: 'medium',
        });
      }
    }

    if (treasuryStats.avgMonthlyBurn > 0 && treasuryStats.netCashflow > 0) {
      const burnMultiple = treasuryStats.totalInflows / treasuryStats.avgMonthlyBurn;
      if (burnMultiple < 3) {
        list.push({
          icon: Timer, color: 'bg-gradient-to-br from-orange-500 to-red-500',
          accent: 'from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/20',
          title: `Runway trésorerie court`,
          description: `Vos entrées couvrent seulement ${burnMultiple.toFixed(1)}x vos charges mensuelles.`,
          priority: 'high',
        });
      }
    }

    const criticalUnpaid = topUnpaid.filter(u => u.daysLate >= 60);
    if (criticalUnpaid.length > 0) {
      const totalCritical = criticalUnpaid.reduce((s, u) => s + u.amount, 0);
      list.push({
        icon: AlertTriangle, color: 'bg-gradient-to-br from-red-500 to-orange-500',
        accent: 'from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20',
        title: `${criticalUnpaid.length} facture(s) en retard > 60j`,
        description: `${fm(totalCritical)} HT à recouvrer d'urgence.`,
        priority: 'high',
      });
    }

    const gap = heroMetrics.revenueEmitted.value - heroMetrics.revenueCollected.value;
    if (gap > 0 && heroMetrics.revenueEmitted.value > 0) {
      const gapPercent = (gap / heroMetrics.revenueEmitted.value) * 100;
      if (gapPercent >= 40) {
        list.push({
          icon: Wallet, color: 'bg-gradient-to-br from-orange-500 to-red-500',
          accent: 'from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/20',
          title: `Écart trésorerie important`,
          description: `${fm(gap)} HT facturés mais pas encore encaissés (${gapPercent.toFixed(0)}% du CA).`,
          priority: 'high',
        });
      } else if (gapPercent >= 20) {
        list.push({
          icon: Wallet, color: 'bg-gradient-to-br from-amber-500 to-orange-500',
          accent: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20',
          title: `Trésorerie à surveiller`,
          description: `${fm(gap)} HT en attente (${gapPercent.toFixed(0)}% du CA émis).`,
          priority: 'medium',
        });
      }
    }

    if (heroMetrics.conversion.sent >= 5) {
      const verdict = heroMetrics.conversion.value >= 50 ? 'Excellent' : heroMetrics.conversion.value >= 30 ? 'Bon' : heroMetrics.conversion.value >= 15 ? 'Moyen' : 'À améliorer';
      list.push({
        icon: Target, color: 'bg-gradient-to-br from-blue-500 to-indigo-500',
        accent: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20',
        title: `Taux de transformation ${verdict.toLowerCase()}`,
        description: `${heroMetrics.conversion.won}/${heroMetrics.conversion.sent} devis signés (${heroMetrics.conversion.value.toFixed(0)}%).`,
        priority: 'medium',
      });
    }

    if (heroMetrics.pipeline.value > 0) {
      list.push({
        icon: Briefcase, color: 'bg-gradient-to-br from-emerald-500 to-teal-500',
        accent: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20',
        title: `${fm(heroMetrics.pipeline.value)} HT de chantiers signés`,
        description: `Chantiers à démarrer prochainement.`,
        priority: 'low',
      });
    }

    if (geoTop.length >= 2) {
      const topCity = geoTop[0];
      list.push({
        icon: MapPin, color: 'bg-gradient-to-br from-purple-500 to-pink-500',
        accent: 'from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/20',
        title: `${topCity.city} = ville la plus rentable`,
        description: `${fm(topCity.value)} HT de CA.`,
        priority: 'low',
      });
    }

    if (clientRecurrence.total >= 5) {
      const verdict = clientRecurrence.recurrentPct >= 40 ? 'forte' : clientRecurrence.recurrentPct >= 20 ? 'correcte' : 'faible';
      list.push({
        icon: Users, color: 'bg-gradient-to-br from-amber-500 to-yellow-500',
        accent: 'from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20',
        title: `Fidélisation ${verdict}`,
        description: `${clientRecurrence.recurrent} clients reviennent (${clientRecurrence.recurrentPct.toFixed(0)}% de votre base).`,
        priority: 'medium',
      });
    }

    return list.slice(0, 4);
  }, [topUnpaid, heroMetrics, geoTop, clientRecurrence, fm, treasuryStats]);

  const exportCSV = useCallback(() => {
    const headers = ['N° Facture', 'Client', 'Ville', 'Métier', 'Montant HT', 'Montant TTC', 'Statut', 'Date émission', 'Date échéance', 'Date paiement', 'Jours paiement'];
    const rows = invoices.map(inv => {
      const issue = inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('fr-FR') : '';
      const due = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('fr-FR') : '';
      const paid = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('fr-FR') : '';
      const days = inv.paidAt && inv.issueDate ? Math.floor((new Date(inv.paidAt).getTime() - new Date(inv.issueDate).getTime()) / 86400000) : '';
      return [`"${inv.invoiceNumber}"`, `"${inv.clientName || ''}"`, `"${inv.clientCity || ''}"`, `"${inv.tradeType || ''}"`, amountOf(inv).toFixed(2), (inv.total || 0).toFixed(2), inv.status, issue, due, paid, days].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `statistiques-artisans-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  }, [invoices, amountOf]);

  const heatmapCellColor = (value: number, max: number) => {
    if (value === 0) return 'bg-slate-50 dark:bg-slate-900/50 text-slate-400';
    const intensity = value / max;
    if (intensity < 0.2) return 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300';
    if (intensity < 0.4) return 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200';
    if (intensity < 0.6) return 'bg-amber-400 dark:bg-amber-700 text-white';
    if (intensity < 0.8) return 'bg-amber-600 dark:bg-amber-600 text-white';
    return 'bg-amber-800 dark:bg-amber-500 text-white';
  };

  const unpaidSeverity = (days: number) => {
    if (days >= 90) return { color: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900', label: 'CRITIQUE' };
    if (days >= 60) return { color: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900', label: 'URGENT' };
    if (days >= 30) return { color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900', label: 'À RELANCER' };
    return { color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900', label: 'RÉCENT' };
  };

  const CATEGORY_LABELS_MAP: Record<string, string> = {
    salary: 'Salaires', social_charges: 'Charges sociales', tax_payment: 'Impôts',
    subscription: 'Abonnements', rent: 'Loyer', bank_fee: 'Frais bancaires',
    insurance: 'Assurance', fuel: 'Carburant', travel: 'Déplacements',
    marketing: 'Marketing', equipment: 'Équipement', loan_repayment: 'Remb. emprunt',
    loan_received: 'Prêt reçu', capital_injection: 'Apport capital',
    supplier_refund: 'Remb. fournisseur', petty_cash: 'Petite caisse',
    other_in: 'Autres entrées', other_out: 'Autres sorties',
  };

  if (permLoading || settingsLoading || loading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50/50 dark:bg-slate-950">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8 space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl animate-pulse" />)}
          </div>
        </div>
      </Sidebar>
    );
  }

  const unitLabel = vatActive ? 'HT' : 'TTC (franchise)';

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50/50 dark:bg-slate-950">
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <BarChart3 size={18} className="text-purple-600 dark:text-purple-400" />
                <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Pilotage de votre activité</h1>
                <Badge tone={vatActive ? 'blue' : 'amber'}>
                  {vatActive ? '📊 Montants HT' : '⚠️ Franchise TVA'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Vision globale : facturation + trésorerie réelle</p>
            </div>
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all">
              <Download size={12} />
              <span>Exporter</span>
            </button>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-6">
          
          {/* SECTION 1 : TRÉSORERIE GLOBALE */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CircleDollarSign size={16} className="text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Trésorerie globale
              </h2>
              <Badge tone="emerald">12 derniers mois</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <MetricCard
                label="Solde net" icon={Wallet}
                value={fm(treasuryStats.netCashflow)}
                delta={treasuryStats.netDelta}
                sparkline={treasuryStats.monthlyNet}
                sparkColor={treasuryStats.netCashflow >= 0 ? '#10b981' : '#ef4444'}
                sublabel="Entrées - Sorties"
                hint="12 mois"
              />
              <MetricCard
                label="Total entrées" icon={ArrowDownLeft}
                value={fm(treasuryStats.totalInflows)}
                delta={0}
                sparkline={treasuryStats.monthlyInflows}
                sparkColor="#10b981"
                sublabel={`Ce mois : ${fm(treasuryStats.currentMonthInflows)}`}
                hint="CA + autres"
              />
              <MetricCard
                label="Total sorties" icon={ArrowUpR}
                value={fm(treasuryStats.totalOutflows)}
                delta={0}
                sparkline={treasuryStats.monthlyOutflows}
                sparkColor="#ef4444"
                sublabel={`Ce mois : ${fm(treasuryStats.currentMonthOutflows)}`}
                hint="Charges"
              />
              <MetricCard
                label="Burn rate mensuel" icon={Activity}
                value={fm(treasuryStats.avgMonthlyBurn)}
                delta={0}
                sparkline={Array(12).fill(0).map((_, i) => treasuryStats.monthlyOutflows[i] || 0)}
                sparkColor="#f59e0b"
                sublabel="Moyenne sur 3 mois"
                hint="Charges moy."
              />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Flux de trésorerie mensuel</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Entrées vs sorties — vision consolidée</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-slate-600 dark:text-slate-400">Entrées</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /><span className="text-slate-600 dark:text-slate-400">Sorties</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /><span className="text-slate-600 dark:text-slate-400">Net</span></span>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={treasuryChartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:opacity-10" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', fontSize: '12px' }} formatter={(v: number) => fm(v)} />
                    <Area type="monotone" dataKey="entrees" stroke="#10b981" strokeWidth={2.5} fill="url(#inflowGrad)" name="Entrées" />
                    <Area type="monotone" dataKey="sorties" stroke="#ef4444" strokeWidth={2.5} fill="url(#outflowGrad)" name="Sorties" />
                    <Bar dataKey="net" fill="#6366f1" radius={[4, 4, 0, 0]} name="Solde net" opacity={0.85} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top postes de dépenses</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">12 derniers mois — opérations manuelles</p>
                  </div>
                  <PiggyBank size={14} className="text-slate-400" />
                </div>
                {treasuryStats.topExpenses.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Aucune sortie enregistrée</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {treasuryStats.topExpenses.map((exp, idx) => {
                      const max = treasuryStats.topExpenses[0].amount;
                      const pct = max > 0 ? (exp.amount / max) * 100 : 0;
                      const sharePct = treasuryStats.totalOutflows > 0 
                        ? (exp.amount / treasuryStats.totalOutflows) * 100 
                        : 0;
                      return (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-4 tabular-nums">{idx + 1}</span>
                              <span className="text-sm font-medium text-slate-900 dark:text-white">
                                {CATEGORY_LABELS_MAP[exp.category] || exp.category}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">{fm(exp.amount)}</div>
                              <div className="text-[9px] text-slate-500">{sharePct.toFixed(0)}% du total</div>
                            </div>
                          </div>
                          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-xl p-5 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-4">
                    <Wallet size={14} className="text-emerald-300" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Bilan trésorerie</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Mois en cours</div>
                      <div className={`text-2xl font-bold tabular-nums ${treasuryStats.currentMonthNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {treasuryStats.currentMonthNet >= 0 ? '+' : ''}{fm(treasuryStats.currentMonthNet)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {treasuryStats.currentMonthNet >= 0 ? 'Excédent' : 'Déficit'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Opérations</div>
                      <div className="text-2xl font-bold tabular-nums text-white">
                        {treasuryStats.manualOpsCount}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">enregistrées</div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Solde 12 mois</span>
                      <span className={`font-bold tabular-nums ${treasuryStats.netCashflow >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {treasuryStats.netCashflow >= 0 ? '+' : ''}{fm(treasuryStats.netCashflow)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Tendance</span>
                      <span className="font-bold tabular-nums">
                        {treasuryStats.netCashflow > 0 ? '📈 Positive' : treasuryStats.netCashflow < 0 ? '📉 Négative' : '➖ Stable'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Couverture charges</span>
                      <span className="font-bold tabular-nums text-amber-300">
                        {treasuryStats.avgMonthlyBurn > 0 
                          ? `${(treasuryStats.totalInflows / treasuryStats.avgMonthlyBurn).toFixed(1)}x` 
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2 : FACTURATION */}
          <section>
            <div className="flex items-center gap-2 mb-4 mt-8">
              <Receipt size={16} className="text-purple-600 dark:text-purple-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Facturation & clients
              </h2>
              <Badge tone="purple">{unitLabel}</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <MetricCard
                label={`CA émis ${unitLabel}`} icon={TrendingUp}
                value={fm(heroMetrics.revenueEmitted.value)}
                delta={heroMetrics.revenueEmitted.growth}
                sparkline={heroMetrics.revenueEmitted.spark}
                sparkColor="#8b5cf6"
                sublabel="12 derniers mois"
                hint="Comptable"
              />
              <MetricCard
                label={`CA encaissé ${unitLabel}`} icon={Banknote}
                value={fm(heroMetrics.revenueCollected.value)}
                delta={heroMetrics.revenueCollected.growth}
                sparkline={heroMetrics.revenueCollected.spark}
                sparkColor="#10b981"
                sublabel={`${heroMetrics.collectionRate.value.toFixed(0)}% du CA émis`}
                hint="Net (avoirs déduits)"
              />
              <MetricCard
                label="Taux de signature" icon={Target}
                value={`${heroMetrics.conversion.value.toFixed(0)}%`}
                delta={heroMetrics.conversion.growth}
                sparkline={Array(12).fill(0).map(() => heroMetrics.conversion.value + (Math.random() - 0.5) * 20)}
                sparkColor="#3b82f6"
                sublabel={`${heroMetrics.conversion.won} signés / ${heroMetrics.conversion.sent} envoyés`}
                hint="Devis"
              />
              <MetricCard
                label="Délai de paiement"
                icon={Timer}
                value={heroMetrics.avgDelay.count > 0 ? `${heroMetrics.avgDelay.value} j` : '—'}
                delta={heroMetrics.avgDelay.growth}
                invertDelta
                sparkline={heroMetrics.avgDelay.spark}
                sparkColor={
                  heroMetrics.avgDelay.count === 0 ? '#94a3b8'
                  : heroMetrics.avgDelay.value <= 30 ? '#10b981'
                  : heroMetrics.avgDelay.value <= 60 ? '#f59e0b'
                  : '#ef4444'
                }
                sublabel={
                  heroMetrics.avgDelay.count > 0
                    ? `Médiane ${heroMetrics.avgDelay.median} j • ${heroMetrics.avgDelay.count} encaissée(s)`
                    : 'Aucune facture encaissée sur 12 mois'
                }
                hint={heroMetrics.avgDelay.verdict}
              />
              <MetricCard
                label={`Pipeline ${unitLabel}`} icon={Briefcase}
                value={fm(heroMetrics.pipeline.value)}
                delta={0}
                sparkline={Array(12).fill(0).map(() => heroMetrics.pipeline.value * (0.7 + Math.random() * 0.6))}
                sparkColor="#0ea5e9"
                sublabel="Chantiers à venir"
                hint="À facturer"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {heroMetrics.revenueEmitted.value > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Wallet size={14} className="text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Écart facturation ({unitLabel}) : {fm(heroMetrics.revenueEmitted.value - heroMetrics.revenueCollected.value)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Taux d'encaissement : {heroMetrics.collectionRate.value.toFixed(0)}% • Avoirs : {fm(heroMetrics.credits.value)}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.min(heroMetrics.collectionRate.value, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <span>Émis : {fm(heroMetrics.revenueEmitted.value)}</span>
                    <span>Encaissé net : {fm(heroMetrics.revenueCollected.value)}</span>
                  </div>
                </div>
              )}

              {heroMetrics.avgDelay.count > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Timer size={14} className="text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Répartition des délais de paiement
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {heroMetrics.avgDelay.count} facture(s) • 12 mois
                    </span>
                  </div>

                  <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3">
                    {heroMetrics.avgDelay.buckets
                      .filter((b: any) => b.count > 0)
                      .map((b: any, i: number) => (
                        <div
                          key={i}
                          className="h-full transition-all"
                          style={{
                            width: `${(b.count / heroMetrics.avgDelay.count) * 100}%`,
                            backgroundColor: b.color,
                          }}
                          title={`${b.label} : ${b.count} facture(s)`}
                        />
                      ))}
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {heroMetrics.avgDelay.buckets.map((b: any, i: number) => {
                      const pct = (b.count / heroMetrics.avgDelay.count) * 100;
                      return (
                        <div key={i} className="text-center">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                            <span className="text-[9px] text-slate-500 dark:text-slate-400">{b.label}</span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{b.count}</div>
                          <div className="text-[9px] text-slate-400 tabular-nums">{pct.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {insights.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-purple-600 dark:text-purple-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recommandations personnalisées</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {insights.map((ins, i) => (
                  <div key={i} className={`relative bg-gradient-to-br ${ins.accent} rounded-xl p-4 overflow-hidden border border-slate-200/60 dark:border-slate-800`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ins.color}`}>
                        <ins.icon size={16} className="text-white" />
                      </div>
                      {ins.priority === 'high' && <span className="text-[9px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Action requise</span>}
                      {ins.priority === 'medium' && <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">À surveiller</span>}
                      {ins.priority === 'low' && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Bonne nouvelle</span>}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1 leading-tight">{ins.title}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{ins.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <HardHat size={16} className="text-amber-600 dark:text-amber-400" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Pipeline de vos chantiers</h3>
                  <Badge tone="slate">{unitLabel}</Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Suivez l'avancement de votre activité, du devis au paiement</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {pipeline.map((stage, idx) => {
                const Icon = stage.icon;
                return (
                  <div key={idx} className="relative">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200/60 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stage.color}20` }}>
                          <Icon size={16} style={{ color: stage.color }} />
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums">{idx + 1}/5</span>
                      </div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mb-0.5">{stage.count}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">{stage.stage}</div>
                      <div className="text-xs font-semibold tabular-nums" style={{ color: stage.color }}>{fm(stage.value)}</div>
                    </div>
                    {idx < pipeline.length - 1 && <ArrowRight size={16} className="absolute top-1/2 -right-2 -translate-y-1/2 text-slate-300 dark:text-slate-700 hidden md:block" />}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">CA émis vs encaissé ({new Date().getFullYear()})</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Comparaison en {unitLabel} — encaissé net des avoirs</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /><span className="text-slate-600 dark:text-slate-400">Émis</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /><span className="text-slate-600 dark:text-slate-400">Encaissé net</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" /><span className="text-slate-600 dark:text-slate-400">Émis N-1</span></span>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={revenueTrend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="emittedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:opacity-10" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: '11px' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', fontSize: '12px' }} formatter={(v: number) => fm(v)} />
                    <Bar dataKey="previous" fill="#cbd5e1" className="dark:fill-slate-700" radius={[2, 2, 0, 0]} name="Émis N-1" />
                    <Area type="monotone" dataKey="emitted" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#emittedGrad)" name="CA émis" />
                    <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2.5} fill="url(#collectedGrad)" name="Encaissé net" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Impayés {unitLabel}</h3>
                    {topUnpaid.length > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900">{fm(topUnpaid.reduce((s, u) => s + u.amount, 0))}</span>}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Net des avoirs</p>
                </div>
                <AlertTriangle size={14} className="text-slate-400" />
              </div>
              {topUnpaid.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Aucun impayé — bravo !</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topUnpaid.map((unpaid, idx) => {
                    const severity = unpaidSeverity(unpaid.daysLate);
                    return (
                      <div key={idx} className={`rounded-lg p-3 border ${severity.color}`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate">{unpaid.client}</div>
                            <div className="text-[10px] opacity-75 font-mono">{unpaid.invoiceNumber}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold tabular-nums">{fm(unpaid.amount)}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] font-bold uppercase tracking-wider">{severity.label}</span>
                          <span className="text-[10px] font-semibold tabular-nums">{unpaid.daysLate}j de retard</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">CA {unitLabel} par type de travaux</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Net des avoirs</p>
                </div>
                <Wrench size={14} className="text-slate-400" />
              </div>
              {revenueByTrade.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Renseignez le type de travaux sur vos factures</div>
              ) : (
                <div className="space-y-3">
                  {revenueByTrade.map((trade, idx) => {
                    const max = revenueByTrade[0].revenue;
                    const pct = max > 0 ? (trade.revenue / max) * 100 : 0;
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-4 tabular-nums">{idx + 1}</span>
                            <div>
                              <span className="text-sm font-medium text-slate-900 dark:text-white">{trade.trade}</span>
                              <span className="ml-2 text-[10px] text-slate-400">{trade.count} chantier(s)</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">{fm(trade.revenue)}</div>
                            <div className="text-[9px] text-slate-500">moy. {fm(trade.avg)}</div>
                          </div>
                        </div>
                        <div className="w-full h-6 bg-slate-50 dark:bg-slate-800/50 rounded overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded flex items-center justify-end pr-2" style={{ width: `${pct}%` }}>
                            <span className="text-[9px] font-bold text-white">
                              {revenueByTrade.reduce((s, t) => s + t.revenue, 0) > 0 ? ((trade.revenue / revenueByTrade.reduce((s, t) => s + t.revenue, 0)) * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Taux de signature par métier</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Sur quels devis êtes-vous le plus efficace ?</p>
                </div>
                <Target size={14} className="text-slate-400" />
              </div>
              {conversionByTrade.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Pas assez de devis pour analyser</div>
              ) : (
                <div className="space-y-2.5">
                  {conversionByTrade.map((trade, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{trade.trade}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 tabular-nums">{trade.won}/{trade.sent}</span>
                            <span className={`text-xs font-bold tabular-nums ${trade.rate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : trade.rate >= 30 ? 'text-blue-600 dark:text-blue-400' : trade.rate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{trade.rate.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${trade.rate >= 50 ? 'bg-emerald-500' : trade.rate >= 30 ? 'bg-blue-500' : trade.rate >= 15 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(trade.rate, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-xl p-5 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={14} className="text-amber-300" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">Fidélisation clients</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div>
                    <div className="text-3xl font-bold tabular-nums">{clientRecurrence.recurrentPct.toFixed(0)}<span className="text-lg font-normal text-slate-400">%</span></div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">Récurrents</div>
                    <div className="text-xs font-semibold mt-1">{clientRecurrence.recurrent} clients</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold tabular-nums text-slate-400">{clientRecurrence.oneShotPct.toFixed(0)}<span className="text-lg font-normal text-slate-500">%</span></div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">One-shot</div>
                    <div className="text-xs font-semibold mt-1">{clientRecurrence.oneShot} clients</div>
                  </div>
                </div>
                {clientRecurrence.topRecurrents.length > 0 && (
                  <div className="pt-4 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Top clients fidèles</div>
                    <div className="space-y-1.5">
                      {clientRecurrence.topRecurrents.slice(0, 3).map((c, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="truncate text-slate-300">{c.name}</span>
                          <span className="font-bold tabular-nums text-amber-300">{c.count} interventions</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Villes les plus rentables</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{unitLabel} net</p>
                </div>
                <MapPin size={14} className="text-slate-400" />
              </div>
              {geoTop.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Renseignez la ville de vos clients</div>
              ) : (
                <div className="space-y-2.5">
                  {geoTop.map((g, idx) => {
                    const max = geoTop[0].value || 1;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 w-4 tabular-nums">{idx + 1}</span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 w-24 truncate">{g.city}</span>
                        <div className="flex-1 h-5 bg-slate-50 dark:bg-slate-800/50 rounded overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded flex items-center justify-end pr-2" style={{ width: `${(g.value / max) * 100}%` }}>
                            <span className="text-[9px] font-bold text-white tabular-nums">{fm(g.value)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Prévisionnel 3 mois</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{unitLabel} net</p>
                </div>
                <Calendar size={14} className="text-slate-400" />
              </div>
              <div className="space-y-3">
                {forecast.map((f, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 capitalize mb-2">{f.month}</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">À facturer</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">{fm(f['À facturer'])}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">À encaisser</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fm(f['À encaisser'])}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-12 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Saisonnalité ({unitLabel}, CA émis)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Identifiez vos mois forts et creux (3 dernières années)</p>
                </div>
                <Calendar size={14} className="text-slate-400" />
              </div>
              <div className="space-y-1">
                {seasonality.years.map(year => (
                  <div key={year} className="grid grid-cols-[40px_repeat(12,1fr)] gap-0.5">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center">{year}</div>
                    {seasonality.matrix[year].map((v, m) => (
                      <div key={m} className={`aspect-square rounded-sm flex items-center justify-center text-[8px] font-medium transition-all hover:scale-110 hover:ring-2 hover:ring-amber-400 cursor-pointer ${heatmapCellColor(v, seasonality.max)}`} title={`${seasonality.monthNames[m]} ${year} : ${fm(v)}`}>
                        {v > 0 ? `${Math.round(v / 1000)}k` : ''}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="grid grid-cols-[40px_repeat(12,1fr)] gap-0.5 mt-1">
                  <div></div>
                  {seasonality.monthNames.map(m => (<div key={m} className="text-[9px] text-slate-500 dark:text-slate-400 text-center">{m.charAt(0)}</div>))}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  💡 <strong>Astuce :</strong> Anticipez vos mois creux en préparant des offres ou en diversifiant vos prestations.
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-400 mr-1">Faible</span>
                  <div className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800" />
                  <div className="w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-950/40" />
                  <div className="w-3 h-3 rounded-sm bg-amber-300 dark:bg-amber-800" />
                  <div className="w-3 h-3 rounded-sm bg-amber-500 dark:bg-amber-600" />
                  <div className="w-3 h-3 rounded-sm bg-amber-700 dark:bg-amber-500" />
                  <span className="text-[9px] text-slate-400 ml-1">Élevé</span>
                </div>
              </div>
            </div>

          </section>
        </main>
      </div>
    </Sidebar>
  );
}
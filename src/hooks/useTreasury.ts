// src/hooks/useTreasury.ts
import { useState, useEffect, useCallback } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useTeam } from '../context/TeamContext';
import { Query } from 'appwrite';

export interface TreasuryPayment {
  $id: string;
  teamId: string;
  type: 'in' | 'out';
  category: string;
  amount: number;
  amountEur: number;
  date: string;
  method: string;
  description?: string;
  label?: string;
  counterpartyName?: string; // ✅ Uniquement counterpartyName
  reference?: string;
  vatAmount?: number;
  vatRate?: number;
  isRecurring?: boolean;
  recurringFrequency?: string | null;
  source?: string;
  accountNumber?: string;
  accountLabel?: string;
  isArchived?: boolean;
  linkedInvoiceId?: string;
  linkedReceivedInvoiceId?: string;
}

export interface TreasuryKPIs {
  balance: number;
  monthlyEvolution: Array<{ month: string; inflows: number; outflows: number }>;
  byCategory: Array<{ type: 'in' | 'out'; category: string; amount: number }>;
}

export const CATEGORY_LABELS: Record<string, string> = {
  client_payment: 'Paiement client',
  client_advance: 'Acompte client',
  supplier_payment: 'Paiement fournisseur',
  supplier_advance: 'Acompte fournisseur',
  salary: 'Salaire',
  rent: 'Loyer',
};

export function useTreasury() {
  const { customTeamId } = useTeam();
  const [transactions, setTransactions] = useState<TreasuryPayment[]>([]);
  const [kpis, setKpis] = useState<TreasuryKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTreasuryData = useCallback(async () => {
    if (!customTeamId) return;
    
    try {
      setLoading(true);
      
      const res = await databases.listDocuments(DATABASE_ID, 'payments', [
        Query.equal('teamId', customTeamId),
        Query.orderDesc('date'),
        Query.limit(1000),
      ]);
      
      const payments = (res.documents as unknown as TreasuryPayment[])
        .filter(p => !p.isArchived);
      
      setTransactions(payments);
      
      const balance = payments.reduce((sum, p) => {
        return sum + (p.type === 'in' ? p.amount : -p.amount);
      }, 0);
      
      const monthlyEvolution: Array<{ month: string; inflows: number; outflows: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.toISOString().slice(0, 7);
        const inflows = payments
          .filter(p => p.type === 'in' && p.date.startsWith(month))
          .reduce((sum, p) => sum + p.amount, 0);
        const outflows = payments
          .filter(p => p.type === 'out' && p.date.startsWith(month))
          .reduce((sum, p) => sum + p.amount, 0);
        monthlyEvolution.push({ month, inflows, outflows });
      }
      
      const byCategoryMap = new Map<string, { type: 'in' | 'out'; category: string; amount: number }>();
      payments.forEach(p => {
        const key = `${p.type}-${p.category}`;
        const existing = byCategoryMap.get(key);
        if (existing) {
          existing.amount += p.amount;
        } else {
          byCategoryMap.set(key, { type: p.type, category: p.category, amount: p.amount });
        }
      });
      const byCategory = Array.from(byCategoryMap.values())
        .sort((a, b) => b.amount - a.amount);
      
      setKpis({ balance, monthlyEvolution, byCategory });
    } catch (e) {
      console.error('Erreur chargement trésorerie:', e);
    } finally {
      setLoading(false);
    }
  }, [customTeamId]);

  useEffect(() => {
    loadTreasuryData();
  }, [loadTreasuryData]);

  const refresh = useCallback(async () => {
    await loadTreasuryData();
  }, [loadTreasuryData]);

  return { transactions, kpis, loading, refresh };
}
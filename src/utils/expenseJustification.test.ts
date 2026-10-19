// src/utils/expenseJustification.test.ts
import { describe, it, expect } from 'vitest';
import {
  evaluateJustification,
  checkRetention,
  isVatDeductibleCategory,
  JUSTIFICATION_LEVEL_META,
  VAT_DEDUCTIBLE_CATEGORIES,
  NON_DEDUCTIBLE_CATEGORIES,
} from './expenseJustification';

describe('evaluateJustification', () => {
  it('retourne "missing" quand AUCUNE mention n\'est fournie', () => {
    // ✅ CORRIGÉ : on force amount à undefined pour vraiment tester "aucune mention"
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: undefined as unknown as number,
    });
    expect(check.level).toBe('missing');
    expect(check.score).toBe(0);
    expect(check.isDeductibleVAT).toBe(false);
    expect(check.missingMentions.length).toBeGreaterThan(0);
  });

  it('considère amount=0 comme une mention présente (insufficient)', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 0, // 0€ = montant renseigné (même si nul)
    });
    expect(check.level).toBe('insufficient');
    expect(check.score).toBeGreaterThan(0);
    expect(check.presentMentions).toContain('Montant TTC');
  });

  it('retourne "complete" avec TOUTES les mentions obligatoires (≥ 150 €)', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 200,
      justificationNumber: 'F-2026-001',
      justificationDate: '2026-01-15',
      supplierName: 'Fournisseur X',
      supplierSiret: '12345678901234',
      description: 'Prestation de service',
      category: 'supplier_payment',
    });
    expect(check.level).toBe('complete');
    expect(check.score).toBe(100);
    expect(check.isDeductibleVAT).toBe(true);
    expect(check.presentMentions.length).toBeGreaterThan(0);
    expect(check.missingMentions.length).toBe(0);
  });

  it('retourne "insufficient" avec un score faible', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 500,
      supplierName: 'Fournisseur X',
    });
    expect(check.level).toBe('insufficient');
    expect(check.score).toBeLessThan(70);
  });

  it('retourne "partial" avec un score moyen', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 500,
      justificationNumber: 'F-2026-001',
      justificationDate: '2026-01-15',
      supplierName: 'Fournisseur X',
      supplierSiret: '12345678901234',
      category: 'supplier_payment',
    });
    expect(['partial', 'complete']).toContain(check.level);
    expect(check.score).toBeGreaterThanOrEqual(50);
  });

  it('accepte une facture simplifiée < 150 € (mentions réduites)', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 50,
      justificationDate: '2026-01-15',
      supplierName: 'Boulangerie',
      category: 'supplier_payment',
    });
    expect(check.level).toBe('complete');
    expect(check.isDeductibleVAT).toBe(true);
    expect(check.warnings.some(w => w.includes('simplifiée'))).toBe(true);
  });

  it('avertit si un ticket dépasse 150 €', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 200,
      justificationDate: '2026-01-15',
      supplierName: 'Fournisseur',
      category: 'supplier_payment',
    });
    expect(check.warnings.some(w => w.includes('complète'))).toBe(true);
  });

  it('retire la déductibilité pour un remboursement d\'emprunt', () => {
    const check = evaluateJustification({
      expenseId: '1',
      expenseType: 'expense',
      amount: 1000,
      justificationNumber: 'F-2026-001',
      justificationDate: '2026-01-15',
      supplierName: 'Banque',
      supplierSiret: '12345678901234',
      description: 'Remboursement emprunt',
      category: 'loan_repayment',
    });
    expect(check.isDeductibleVAT).toBe(false);
    expect(check.isDeductibleResult).toBe(false);
  });
});

describe('checkRetention', () => {
  it('retourne ok: true pour une date récente', () => {
    const today = new Date();
    const retention = checkRetention(today.toISOString());
    expect(retention.ok).toBe(true);
    expect(retention.yearsLeft).toBeGreaterThan(5);
  });

  it('retourne ok: false pour une date > 6 ans', () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 7);
    const retention = checkRetention(old.toISOString());
    expect(retention.ok).toBe(false);
    expect(retention.yearsLeft).toBe(0);
  });
});

describe('isVatDeductibleCategory', () => {
  it('accepte les catégories déductibles', () => {
    VAT_DEDUCTIBLE_CATEGORIES.forEach(cat => {
      expect(isVatDeductibleCategory(cat)).toBe(true);
    });
  });

  it('rejette les catégories non déductibles', () => {
    NON_DEDUCTIBLE_CATEGORIES.forEach(cat => {
      expect(isVatDeductibleCategory(cat)).toBe(false);
    });
  });

  it('rejette les catégories inconnues', () => {
    expect(isVatDeductibleCategory('unknown_category')).toBe(false);
  });

  it('rejette undefined / vide', () => {
    expect(isVatDeductibleCategory(undefined)).toBe(false);
    expect(isVatDeductibleCategory('')).toBe(false);
  });
});

describe('JUSTIFICATION_LEVEL_META', () => {
  it('contient les 4 niveaux', () => {
    expect(Object.keys(JUSTIFICATION_LEVEL_META)).toEqual(
      expect.arrayContaining(['complete', 'partial', 'insufficient', 'missing'])
    );
  });

  it('chaque niveau a un label et un tone', () => {
    Object.values(JUSTIFICATION_LEVEL_META).forEach(meta => {
      expect(meta.label).toBeTruthy();
      expect(meta.tone).toBeTruthy();
    });
  });
});
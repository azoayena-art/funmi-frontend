// src/services/bankReconciliationService.test.ts
import { describe, it, expect } from 'vitest';
import {
  suggestMatches,
  normalize,
  confidenceLabel,
  type MatchCandidate,
} from './bankReconciliationService';

const clientInv: MatchCandidate = {
  type: 'client_invoice', id: 'c1', number: 'F2026-001',
  counterparty: 'Dupont SARL', amount: 1500,
  issueDate: '2026-09-01', dueDate: '2026-10-01',
};

const supplierInv: MatchCandidate = {
  type: 'supplier_invoice', id: 's1', number: 'FA-123',
  counterparty: 'EDF', amount: 250.8,
  issueDate: '2026-09-10', dueDate: '2026-10-10',
};

describe('suggestMatches — règle de direction', () => {
  it('encaissement → facture client uniquement', () => {
    const res = suggestMatches(
      { date: '2026-10-02', label: 'VIREMENT DUPONT', amount: 1500 },
      [clientInv, supplierInv]
    );
    expect(res.length).toBe(1);
    expect(res[0].candidate.type).toBe('client_invoice');
  });

  it('décaissement → facture fournisseur uniquement', () => {
    const res = suggestMatches(
      { date: '2026-10-05', label: 'PRLV EDF', amount: -250.8 },
      [clientInv, supplierInv]
    );
    expect(res.length).toBe(1);
    expect(res[0].candidate.type).toBe('supplier_invoice');
  });
});

describe('suggestMatches — scoring', () => {
  it('montant exact + nom + fenêtre de dates → confiance haute', () => {
    const res = suggestMatches(
      { date: '2026-10-02', label: 'VIREMENT RECU DUPONT', amount: 1500 },
      [clientInv]
    );
    expect(res[0].confidence).toBe('high');
    expect(res[0].score).toBeGreaterThanOrEqual(80);
    expect(res[0].reasons).toContain('Montant exact');
  });

  it('aucune suggestion si montant très différent', () => {
    const res = suggestMatches(
      { date: '2026-10-02', label: 'VIREMENT', amount: 999 },
      [clientInv]
    );
    expect(res.length).toBe(0);
  });

  it('référence facture dans le libellé → accepte un paiement partiel', () => {
    const res = suggestMatches(
      { date: '2026-10-02', label: 'REGLEMENT PARTIEL FACTURE F2026-001', amount: 700 },
      [clientInv]
    );
    expect(res.length).toBe(1);
    expect(res[0].reasons.some(r => r.includes('Référence'))).toBe(true);
  });

  it('trie par score décroissant et limite à 3 suggestions', () => {
    const c2 = { ...clientInv, id: 'c2', number: 'F2026-002' };
    const c3 = { ...clientInv, id: 'c3', number: 'F2026-003' };
    const c4 = { ...clientInv, id: 'c4', number: 'F2026-004' };
    const res = suggestMatches(
      { date: '2026-10-02', label: 'VIREMENT DUPONT F2026-002', amount: 1500 },
      [clientInv, c2, c3, c4]
    );
    expect(res.length).toBe(3);
    expect(res[0].candidate.id).toBe('c2'); // bonus référence
    expect(res[0].score).toBeGreaterThanOrEqual(res[1].score);
  });

  it('date hors fenêtre → score plus faible', () => {
    const inWindow = suggestMatches(
      { date: '2026-10-02', label: 'VIREMENT', amount: 1500 }, [clientInv]
    );
    const outWindow = suggestMatches(
      { date: '2027-05-02', label: 'VIREMENT', amount: 1500 }, [clientInv]
    );
    expect(outWindow[0].score).toBeLessThan(inWindow[0].score);
  });
});
describe('Multi-devises', () => {
  it('refuse un match entre devises différentes', () => {
    const res = suggestMatches(
      { date: '2026-03-05', label: 'VIREMENT CLIENT', amount: 150000, currency: 'XOF' },
      [{ ...clientInv, amount: 150000, currency: 'EUR' }]
    );
    expect(res.length).toBe(0);
  });
  it('accepte un match dans la même devise', () => {
    const res = suggestMatches(
      { date: '2026-03-05', label: 'VIREMENT CLIENT', amount: 150000, currency: 'XOF' },
      [{ ...clientInv, amount: 150000, currency: 'XOF' }]
    );
    expect(res.length).toBe(1);
  });
  it('reste compatible si devise non renseignée', () => {
    const res = suggestMatches(
      { date: '2026-10-02', label: 'VIREMENT', amount: 1500 },
      [clientInv]
    );
    expect(res.length).toBe(1);
  });
});
describe('normalize', () => {
  it('retire accents et ponctuation', () => {
    expect(normalize('VIREMENT RÉCU EDF!')).toBe('virement recu edf');
  });
});

describe('confidenceLabel', () => {
  it('fournit un libellé par niveau', () => {
    expect(confidenceLabel('high')).toContain('certaine');
    expect(confidenceLabel('medium')).toContain('probable');
    expect(confidenceLabel('low')).toContain('possible');
  });
});
// src/services/bankImportService.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseFrenchAmount,
  parseFrenchDate,
  detectDelimiter,
  detectBank,
  computeRowHash,
  parseBankStatement,
  getBankProfile,   // ← ajouté
} from './bankImportService';

describe('parseFrenchAmount', () => {
  it('parse le format français avec espaces', () => {
    expect(parseFrenchAmount('1 500,00')).toBe(1500);
    expect(parseFrenchAmount('1\u00A0234,56')).toBe(1234.56);
  });
  it('parse les négatifs', () => {
    expect(parseFrenchAmount('-12,50')).toBe(-12.5);
    expect(parseFrenchAmount('(45,00)')).toBe(-45);
    expect(parseFrenchAmount('45,00-')).toBe(-45);
  });
  it('gère milliers vs décimal', () => {
    expect(parseFrenchAmount('1.234,56')).toBe(1234.56);
    expect(parseFrenchAmount('1,234.56')).toBe(1234.56);
    expect(parseFrenchAmount('1.234')).toBe(1234);
    expect(parseFrenchAmount('1234.56')).toBe(1234.56);
  });
  it('retire la devise', () => {
    expect(parseFrenchAmount('12,50 €')).toBe(12.5);
    expect(parseFrenchAmount('100 EUR')).toBe(100);
  });
  it('retourne null pour les valeurs invalides', () => {
    expect(parseFrenchAmount('')).toBeNull();
    expect(parseFrenchAmount('abc')).toBeNull();
    expect(parseFrenchAmount('12,50,30')).toBeNull();
  });
  it('accepte les séparateurs de milliers valides (groupes de 3)', () => {
    expect(parseFrenchAmount('1,234,567')).toBe(1234567);
    expect(parseFrenchAmount('1.234.567')).toBe(1234567);
  });
  it('zéro valide', () => {
    expect(parseFrenchAmount('0,00')).toBe(0);
  });
});

describe('parseFrenchDate', () => {
  it('parse JJ/MM/AAAA', () => {
    expect(parseFrenchDate('15/01/2026')).toBe('2026-01-15');
    expect(parseFrenchDate('5/3/2026')).toBe('2026-03-05');
  });
  it('parse JJ/MM/AA', () => {
    expect(parseFrenchDate('01/02/26')).toBe('2026-02-01');
    expect(parseFrenchDate('01/02/99')).toBe('1999-02-01');
  });
  it('parse ISO et points', () => {
    expect(parseFrenchDate('2026-01-15')).toBe('2026-01-15');
    expect(parseFrenchDate('15.01.2026')).toBe('2026-01-15');
  });
  it('rejette les dates invalides', () => {
    expect(parseFrenchDate('99/99/9999')).toBeNull();
    expect(parseFrenchDate('abc')).toBeNull();
    expect(parseFrenchDate('')).toBeNull();
  });
});
describe('Formats internationaux', () => {
  it('montant suisse avec apostrophe', () => {
    expect(parseFrenchAmount("1'234.56")).toBe(1234.56);
  });
  it('montant CFA sans décimales', () => {
    expect(parseFrenchAmount('150000')).toBe(150000);
  });
  it('date non ambiguë : jour > 12 → DMY', () => {
    expect(parseFrenchDate('25/04/2026')).toBe('2026-04-25');
  });
  it('date non ambiguë : 2e terme > 12 → MDY (US)', () => {
    expect(parseFrenchDate('04/25/2026')).toBe('2026-04-25');
  });
  it('date ambiguë → convention DMY (FR/Afrique)', () => {
    expect(parseFrenchDate('03/04/2026')).toBe('2026-04-03');
  });
  it('ordre MDY forcé (banque US)', () => {
    expect(parseFrenchDate('03/04/2026', 'MDY')).toBe('2026-03-04');
  });
  it('détecte banques africaines et mobile money', () => {
    expect(detectBank('releve_sgbs_mars.csv')).toBe('SGBS');
    expect(detectBank('wave_export.csv')).toBe('Wave');
    expect(detectBank('mtn_momo_transactions.csv')).toBe('MTN MoMo');
  });
  it('profil banque → devise', () => {
    expect(getBankProfile('SGBS')?.currency).toBe('XOF');
    expect(getBankProfile('Wave')?.country).toBe('SN');
    expect(getBankProfile('BNP Paribas')?.currency).toBe('EUR');
  });
  it('parseBankStatement applique la devise de la banque', async () => {
    const res = await parseBankStatement('05/03/2026;VIREMENT CLIENT;150000', {
      fileName: 'releve_sgbs.csv',
    });
    expect(res.detectedBank).toBe('SGBS');
    expect(res.rows[0].currency).toBe('XOF');
    expect(res.rows[0].amount).toBe(150000);
  });
});
describe('detectDelimiter', () => {
  it('détecte le point-virgule (FR)', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });
  it('détecte la virgule (US/néobanques)', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });
});

describe('detectBank', () => {
  it('reconnaît les banques par nom de fichier', () => {
    expect(detectBank('Releve_BNP_octobre.csv')).toBe('BNP Paribas');
    expect(detectBank('export credit agricole.csv')).toBe('Crédit Agricole');
    expect(detectBank('qonto_transactions.csv')).toBe('Qonto');
  });
  it('retourne undefined si inconnu', () => {
    expect(detectBank('releve.csv')).toBeUndefined();
    expect(detectBank(undefined)).toBeUndefined();
  });
});

describe('computeRowHash', () => {
  it('est déterministe', async () => {
    const h1 = await computeRowHash('2026-01-15', 'VIREMENT', 100);
    const h2 = await computeRowHash('2026-01-15', 'VIREMENT', 100);
    expect(h1).toBe(h2);
  });
  it('diffère selon les données', async () => {
    const h1 = await computeRowHash('2026-01-15', 'VIREMENT', 100);
    const h2 = await computeRowHash('2026-01-16', 'VIREMENT', 100);
    expect(h1).not.toBe(h2);
  });
});

describe('parseBankStatement — format Crédit Agricole (en-tête + montant signé)', () => {
  const CA_SAMPLE = [
    'Date opération;Date valeur;Libellé;Référence;Montant;',
    '15/09/2026;16/09/2026;VIREMENT RECU CLIENT DUPONT;REF123;1 500,00;',
    '18/09/2026;18/09/2026;CARTE BOULANGERIE PAUL;REF124;-12,50;',
    'SOLDE AU 30/09/2026;;;;2 345,67;',
  ].join('\n');

  it('parse les lignes valides', async () => {
    const res = await parseBankStatement(CA_SAMPLE, { fileName: 'releve_credit agricole.csv' });
    expect(res.hasHeader).toBe(true);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0].date).toBe('2026-09-15');
    expect(res.rows[0].amount).toBe(1500);
    expect(res.rows[0].label).toBe('VIREMENT RECU CLIENT DUPONT');
    expect(res.rows[0].reference).toBe('REF123');
    expect(res.rows[1].amount).toBe(-12.5);
    expect(res.detectedBank).toBe('Crédit Agricole');
  });

  it('saute la ligne sans date (solde)', async () => {
    const res = await parseBankStatement(CA_SAMPLE);
    expect(res.skipped).toBe(1);
  });

  it('génère des hash uniques', async () => {
    const res = await parseBankStatement(CA_SAMPLE);
    expect(res.rows[0].rowHash).toBeTruthy();
    expect(res.rows[0].rowHash).not.toBe(res.rows[1].rowHash);
  });
});

describe('parseBankStatement — format Débit/Crédit (BNP)', () => {
  const DC_SAMPLE = [
    'Date;Libellé;Débit;Crédit',
    '01/10/2026;SALAIRE;;2 300,00',
    '02/10/2026;LOYER;750,00;',
  ].join('\n');

  it('calcule le montant signé (crédit − débit)', async () => {
    const res = await parseBankStatement(DC_SAMPLE);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0].amount).toBe(2300);
    expect(res.rows[1].amount).toBe(-750);
  });
});

describe('parseBankStatement — sans en-tête (détection statistique)', () => {
  const NO_HEADER = [
    '05/10/2026;ABONNEMENT INTERNET FREE;-29,99',
    '06/10/2026;VIREMENT EMIS LOYER;-750,00',
    '07/10/2026;REMBOURSEMENT CPAM;123,45',
  ].join('\n');

  it('détecte les colonnes automatiquement', async () => {
    const res = await parseBankStatement(NO_HEADER);
    expect(res.hasHeader).toBe(false);
    expect(res.rows.length).toBe(3);
    expect(res.rows[0].amount).toBe(-29.99);
    expect(res.rows[2].amount).toBe(123.45);
    expect(res.rows[1].label).toBe('VIREMENT EMIS LOYER');
  });
});

describe('parseBankStatement — erreurs de structure', () => {
  it('signale les colonnes introuvables', async () => {
    const res = await parseBankStatement('toto;titi\na;b\nc;d');
    expect(res.rows.length).toBe(0);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
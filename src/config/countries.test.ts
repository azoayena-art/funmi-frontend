// src/config/countries.test.ts
import { describe, it, expect } from 'vitest';
import {
  getCountryConfig,
  isKnownCountry,
  getPrimaryIdentifier,
  validateIdentifier,
  getDefaultVatRate,
  isCfaZone,
  FALLBACK_COUNTRY,
} from './countries';

describe('getCountryConfig', () => {
  it('retourne la config FR pour "FR"', () => {
    const cfg = getCountryConfig('FR');
    expect(cfg.currency).toBe('EUR');
  });

  it('retourne le fallback pour un code inconnu', () => {
    expect(getCountryConfig('ZZ')).toBe(FALLBACK_COUNTRY);
    expect(getCountryConfig(null)).toBe(FALLBACK_COUNTRY);
  });
});

describe('isKnownCountry', () => {
  it('reconnaît les pays supportés', () => {
    expect(isKnownCountry('FR')).toBe(true);
    expect(isKnownCountry('SN')).toBe(true);
  });

  it('rejette les codes inconnus', () => {
    expect(isKnownCountry('ZZ')).toBe(false);
  });
});

describe('Identifiants fiscaux', () => {
  it('FR → identifiant principal SIREN', () => {
    const primary = getPrimaryIdentifier(getCountryConfig('FR'));
    expect(primary.shortLabel).toBe('SIREN'); // ✅ Corrigé : SIREN est l'identifiant principal
  });

  it('valide un SIREN 9 chiffres', () => {
    const primary = getPrimaryIdentifier(getCountryConfig('FR'));
    // Un SIREN valide à 9 chiffres (ex: 732829320 = LVMH)
    expect(validateIdentifier(primary, '732829320')).toBe(true);
    expect(validateIdentifier(primary, '123')).toBe(false);
  });
});

describe('TVA & zones', () => {
  it('taux par défaut FR = 20', () => {
    expect(getDefaultVatRate(getCountryConfig('FR'))).toBe(20);
  });

  it('zone CFA : SN oui, FR non', () => {
    expect(isCfaZone('SN')).toBe(true);
    expect(isCfaZone('FR')).toBe(false);
  });
});
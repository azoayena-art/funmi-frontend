// src/hooks/useCountryConfig.ts
// ============================================================
// 🌍 HOOK PAYS — expose la config du pays de l'entreprise.
// Le pays est stocké dans company_settings et pilote le reste.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { databases, DATABASE_ID } from '../appwrite';
import { useTeam } from '../context/TeamContext';
import { Query } from 'appwrite';
import {
  getCountryConfig, getPrimaryIdentifier,
  type CountryConfig, type IdentifierConfig,
} from '../config/countries';

export interface CountryConfigState {
  country: CountryConfig;
  countryCode: string;
  isKnown: boolean;
  primaryIdentifier: IdentifierConfig;
  identifiers: IdentifierConfig[];
  vatEnabled: boolean;
  retentionYears: number;
  loading: boolean;
}

export const useCountryConfig = (): CountryConfigState => {
  const { customTeamId } = useTeam();
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customTeamId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'company_settings', [
          Query.equal('teamId', customTeamId),
          Query.limit(1),
        ]);
        const doc = res.documents[0] as any;
        setCountryCode(doc?.country || doc?.companyCountry || null);
      } catch (e) {
        console.warn('Impossible de charger le pays de l\'entreprise :', e);
        setCountryCode(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [customTeamId]);

  const country = useMemo(() => getCountryConfig(countryCode), [countryCode]);

  return {
    country,
    countryCode: country.code,
    isKnown: countryCode !== null && country.code !== 'XX',
    primaryIdentifier: getPrimaryIdentifier(country),
    identifiers: country.identifiers,
    vatEnabled: country.vat.enabled,
    retentionYears: country.retentionYears,
    loading,
  };
};
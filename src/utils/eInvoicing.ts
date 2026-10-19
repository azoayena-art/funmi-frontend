/**
 * 🌍 Helpers pour la gestion de l'e-facturation multi-pays
 * 
 * Règle légale (Réforme 2026) :
 * E-facturation obligatoire UNIQUEMENT si :
 *   - Entreprise émettrice française (FR)
 *   - ET Client professionnel français (FR)
 *   - ET Transaction B2B (entreprise)
 */

export interface EntityAddress {
  country?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
  companyName?: string;
  type?: 'entreprise' | 'particulier';
}

/**
 * Vérifie si l'e-facturation est obligatoire
 * @param companyCountry - Pays de l'entreprise émettrice (depuis company_settings)
 * @param entity - Entité cliente (prospect/client)
 */
export const isEInvoiceRequired = (
  companyCountry: string | undefined,
  entity: EntityAddress
): boolean => {
  // Entreprise non française → jamais obligatoire
  if (!companyCountry || companyCountry !== 'FR') return false;
  
  // Client non français (export) → jamais obligatoire
  if (!entity.country || entity.country !== 'FR') return false;
  
  // Client particulier (B2C) → jamais obligatoire
  if (entity.type === 'particulier' || !entity.companyName?.trim()) return false;
  
  // Tous les critères remplis → obligatoire
  return true;
};

/**
 * Valide les champs obligatoires pour l'e-facturation
 */
export const validateEInvoiceFields = (
  companyCountry: string | undefined,
  entity: EntityAddress
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!isEInvoiceRequired(companyCountry, entity)) {
    return { valid: true, errors: [] };
  }
  
  // SIREN obligatoire (9 chiffres)
  if (!entity.siren || !/^\d{9}$/.test(entity.siren)) {
    errors.push('SIREN obligatoire (9 chiffres) pour e-facturation B2B France');
  }
  
  // SIRET obligatoire (14 chiffres)
  if (!entity.siret || !/^\d{14}$/.test(entity.siret)) {
    errors.push('SIRET obligatoire (14 chiffres) pour e-facturation B2B France');
  }
  
  // TVA : format validé si présent (pas toujours obligatoire, ex: auto-entrepreneur)
  if (entity.vatNumber && !/^FR[0-9A-Z]{2}\d{9}$/.test(entity.vatNumber)) {
    errors.push('Format TVA invalide (FR + 2 caractères + 9 chiffres)');
  }
  
  return { valid: errors.length === 0, errors };
};

/**
 * Détermine quels champs afficher dans le formulaire
 */
export const getVisibleFields = (
  companyCountry: string | undefined,
  entityCountry: string | undefined,
  isCompany: boolean
) => {
  // SIREN/SIRET : seulement si entreprise FR + client FR + B2B
  const showSirenSiret = companyCountry === 'FR' && entityCountry === 'FR' && isCompany;
  
  // TVA : utile pour tout B2B (intra-communautaire inclus)
  const showVat = isCompany;
  
  // Banner e-facturation
  const showEInvoiceBanner = showSirenSiret;
  
  return {
    showSirenSiret,
    showVat,
    showEInvoiceBanner,
    required: showSirenSiret, // Les champs sont requis si affichés
  };
};

/**
 * Valide le format TVA européen (flexible selon pays)
 */
export const validateVatNumber = (vatNumber: string, country?: string): boolean => {
  if (!vatNumber) return true; // Optionnel
  
  const cleaned = vatNumber.toUpperCase().replace(/\s/g, '');
  
  // France : FR + 2 caractères + 9 chiffres
  if (country === 'FR' || cleaned.startsWith('FR')) {
    return /^FR[0-9A-Z]{2}\d{9}$/.test(cleaned);
  }
  
  // Belgique : BE + 10 chiffres
  if (country === 'BE' || cleaned.startsWith('BE')) {
    return /^BE[0-9]{10}$/.test(cleaned);
  }
  
  // Suisse : CHE + 9 chiffres + MWST/TVA/IVA optionnel
  if (country === 'CH' || cleaned.startsWith('CHE')) {
    return /^CHE-?[0-9]{3}\.[0-9]{3}\.[0-9]{3}/.test(cleaned);
  }
  
  // Allemagne : DE + 9 chiffres
  if (country === 'DE' || cleaned.startsWith('DE')) {
    return /^DE[0-9]{9}$/.test(cleaned);
  }
  
  // Luxembourg : LU + 8 chiffres
  if (country === 'LU' || cleaned.startsWith('LU')) {
    return /^LU[0-9]{8}$/.test(cleaned);
  }
  
  // Italie : IT + 11 chiffres
  if (country === 'IT' || cleaned.startsWith('IT')) {
    return /^IT[0-9]{11}$/.test(cleaned);
  }
  
  // Espagne : ES + 9 caractères alphanumériques
  if (country === 'ES' || cleaned.startsWith('ES')) {
    return /^ES[0-9A-Z][0-9]{7}[0-9A-Z]$/.test(cleaned);
  }
  
  // Par défaut : accepter tout format plausible (min 5 caractères)
  return cleaned.length >= 5;
};
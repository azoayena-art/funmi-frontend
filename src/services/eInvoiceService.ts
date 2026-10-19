/**
 * ============================================================
 * 🇫🇷 SERVICE E-FACTURATION - RÉFORME 2026
 * ============================================================
 * Génération de factures électroniques au format Factur-X
 * Conforme à la norme européenne EN 16931 (CII - Cross Industry Invoice)
 * 
 * Rôles :
 * - Validation des données (SIRET, SIREN, TVA intracommunautaire)
 * - Génération du XML Factur-X
 * - Calcul du hash SHA-256 pour archivage probant
 * - Conversion depuis une facture commerciale existante
 * ============================================================
 */

// ============================================================
// 📋 TYPES ET INTERFACES
// ============================================================

export type EInvoiceTransmissionStatus =
  | 'draft'
  | 'ready'
  | 'transmitted'
  | 'accepted'
  | 'rejected'
  | 'disputed'
  | 'cancelled';

export type EInvoiceDocumentType = 
  | '380'
  | '381'
  | '384'
  | '386';

export type EInvoicePlatform = 'ppf' | 'pdp' | 'od';
export type EInvoiceFormat = 'factur-x' | 'ubl' | 'cii';

export interface EInvoiceLine {
  id: string;
  reference?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discount: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
}

export interface EInvoiceParty {
  name: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string;
}

export interface EInvoiceVatBreakdown {
  rate: number;
  taxableAmount: number;
  vatAmount: number;
  category: string;
}

export interface EInvoiceData {
  invoiceNumber: string;
  documentType: EInvoiceDocumentType;
  issueDate: string;
  dueDate?: string;
  
  seller: EInvoiceParty;
  buyer: EInvoiceParty;
  
  lines: EInvoiceLine[];
  
  currency: string;
  subtotal: number;
  globalDiscount?: number;
  discountAmount?: number;
  vatBreakdown: EInvoiceVatBreakdown[];
  totalVat: number;
  totalTtc: number;
  depositAmount?: number;
  balanceDue: number;
  
  originalQuoteNumber?: string;
  originalInvoiceNumber?: string;
  paymentConditions?: string;
  
  id?: string;
  isElectronic: boolean;
  transmissionStatus: EInvoiceTransmissionStatus;
  transmissionReference?: string;
  pdfHash?: string;
}

export interface EInvoiceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================
// 🎯 CONSTANTES
// ============================================================

const UNIT_CODE_MAP: Record<string, string> = {
  'Forfait': 'C62',
  'Unité': 'C62',
  'Heure': 'HUR',
  'Jour': 'DAY',
  'm²': 'MTK',
  'ml': 'MTR',
  'm': 'MTR',
  'kg': 'KGM',
  'L': 'LTR',
  'Intervention': 'C62',
};

const VAT_CATEGORY_MAP: Record<string, string> = {
  'standard': 'S',
  'zero': 'Z',
  'exempt': 'E',
  'reverse': 'AE',
  'intra': 'K',
  'export': 'G',
};

const FRANCE_COUNTRY_CODE = 'FR';

// ============================================================
// ✅ VALIDATIONS
// ============================================================

export const validateSIRET = (value: string): boolean => {
  if (!value) return false;
  const clean = value.replace(/\s/g, '');
  if (!/^\d{14}$/.test(clean)) return false;
  
  let sum = 0;
  let isEven = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

export const validateSIREN = (value: string): boolean => {
  if (!value) return false;
  const clean = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(clean)) return false;
  
  let sum = 0;
  let isEven = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

export const validateFrenchVAT = (value: string): boolean => {
  if (!value) return false;
  const clean = value.replace(/\s/g, '').toUpperCase();
  
  if (/^FR\d{2}\d{9}$/.test(clean)) {
    const siren = clean.substring(4);
    const key = parseInt(clean.substring(2, 4), 10);
    const expectedKey = (12 + 3 * (parseInt(siren, 10) % 97)) % 97;
    return key === expectedKey;
  }
  
  return /^FR[0-9A-Z]{2}\d{9}$/.test(clean);
};

const validateParty = (party: EInvoiceParty, role: 'Vendeur' | 'Acheteur'): string[] => {
  const errors: string[] = [];
  
  if (!party.name || !party.name.trim()) {
    errors.push(`${role} : le nom est obligatoire.`);
  }
  
  if (!party.address || !party.address.trim()) {
    errors.push(`${role} : l'adresse est obligatoire.`);
  }
  
  if (!party.postalCode || !party.postalCode.trim()) {
    errors.push(`${role} : le code postal est obligatoire.`);
  }
  
  if (!party.city || !party.city.trim()) {
    errors.push(`${role} : la ville est obligatoire.`);
  }
  
  if (!party.country || party.country.length !== 2) {
    errors.push(`${role} : le code pays (2 lettres) est obligatoire.`);
  }
  
  if (party.country === FRANCE_COUNTRY_CODE) {
    if (role === 'Vendeur') {
      if (!party.siren && !party.siret) {
        errors.push(`${role} : le SIREN ou SIRET est obligatoire pour une entreprise française.`);
      }
      if (party.siret && !validateSIRET(party.siret)) {
        errors.push(`${role} : le SIRET est invalide (14 chiffres attendus).`);
      }
      if (party.siren && !validateSIREN(party.siren)) {
        errors.push(`${role} : le SIREN est invalide (9 chiffres attendus).`);
      }
    } else if (party.siret && !validateSIRET(party.siret)) {
      errors.push(`${role} : le SIRET est invalide (14 chiffres attendus).`);
    }
  }
  
  if (party.vatNumber && party.country === FRANCE_COUNTRY_CODE && !validateFrenchVAT(party.vatNumber)) {
    errors.push(`${role} : le numéro de TVA intracommunautaire est invalide.`);
  }
  
  return errors;
};

export const validateEInvoiceData = (data: EInvoiceData): EInvoiceValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!data.invoiceNumber || !data.invoiceNumber.trim()) {
    errors.push('Le numéro de facture est obligatoire.');
  }
  
  if (!data.issueDate) {
    errors.push("La date d'émission est obligatoire.");
  } else {
    const date = new Date(data.issueDate);
    if (isNaN(date.getTime())) {
      errors.push("La date d'émission est invalide.");
    }
  }
  
  errors.push(...validateParty(data.seller, 'Vendeur'));
  errors.push(...validateParty(data.buyer, 'Acheteur'));
  
  if (!data.lines || data.lines.length === 0) {
    errors.push('La facture doit contenir au moins une ligne.');
  } else {
    data.lines.forEach((line, index) => {
      if (!line.description || !line.description.trim()) {
        errors.push(`Ligne ${index + 1} : la description est obligatoire.`);
      }
      if (line.quantity <= 0) {
        errors.push(`Ligne ${index + 1} : la quantité doit être positive.`);
      }
      if (line.unitPrice < 0) {
        errors.push(`Ligne ${index + 1} : le prix unitaire ne peut pas être négatif.`);
      }
      if (line.vatRate < 0 || line.vatRate > 100) {
        errors.push(`Ligne ${index + 1} : le taux de TVA doit être entre 0 et 100.`);
      }
    });
  }
  
  if (data.totalTtc < 0) {
    errors.push('Le total TTC ne peut pas être négatif.');
  }
  
  if (data.depositAmount && data.depositAmount > data.totalTtc) {
    errors.push("L'acompte ne peut pas dépasser le total TTC.");
  }
  
  if (data.buyer.country === FRANCE_COUNTRY_CODE && !data.buyer.siret && !data.buyer.siren) {
    warnings.push("L'acheteur français n'a pas de SIRET/SIREN : la transmission électronique pourrait être refusée pour un client B2B.");
  }
  
  if (!data.dueDate) {
    warnings.push("Aucune date d'échéance définie (recommandé : 30 jours).");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

// ============================================================
// 🛠️ HELPERS
// ============================================================

const escapeXml = (str: string): string => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// ============================================================
// 🏠 PARSER RÉTROACTIF D'ADRESSE (CORRECTION PRINCIPALE)
// ============================================================
/**
 * Parse une adresse en extrayant CP/ville.
 * ✅ PRIORITÉ : utilise les champs distincts s'ils existent (nouveau format)
 * ✅ FALLBACK : parse l'adresse combinée (ancien format "123 rue X, 75000 Paris")
 */
export const parseAddressRetroactive = (
  address: string | undefined,
  existingPostalCode?: string,
  existingCity?: string,
  existingCountry?: string
): { address: string; postalCode: string; city: string; country: string } => {
  // ✅ Priorité : champs distincts déjà remplis
  if (existingPostalCode && existingCity) {
    return {
      address: address || '',
      postalCode: existingPostalCode,
      city: existingCity,
      country: existingCountry || 'FR',
    };
  }
  
  // Si seulement l'un des deux existe, on l'utilise
  if (existingPostalCode || existingCity) {
    // Essayer de parser l'adresse pour compléter le champ manquant
    if (!address || !address.trim()) {
      return {
        address: '',
        postalCode: existingPostalCode || '',
        city: existingCity || '',
        country: existingCountry || 'FR',
      };
    }
    
    const postalRegex = /\b(\d{5})\b/;
    const match = address.match(postalRegex);
    
    if (match) {
      const postalCode = existingPostalCode || match[1];
      const postalIndex = match.index!;
      const line1 = address.substring(0, postalIndex).replace(/,\s*$/, '').trim();
      const afterPostal = address.substring(postalIndex + 5).trim();
      const city = existingCity || afterPostal.replace(/^[,\s-]+/, '').replace(/[,\s-]+$/, '').trim();
      
      return {
        address: line1 || address,
        postalCode,
        city,
        country: existingCountry || 'FR',
      };
    }
    
    return {
      address,
      postalCode: existingPostalCode || '',
      city: existingCity || '',
      country: existingCountry || 'FR',
    };
  }
  
  // Fallback : parse l'adresse combinée (ancien format)
  if (!address || !address.trim()) {
    return { address: '', postalCode: '', city: '', country: existingCountry || 'FR' };
  }
  
  const postalRegex = /\b(\d{5})\b/;
  const match = address.match(postalRegex);
  
  if (!match) {
    return { address, postalCode: '', city: '', country: existingCountry || 'FR' };
  }
  
  const postalCode = match[1];
  const postalIndex = match.index!;
  const line1 = address.substring(0, postalIndex).replace(/,\s*$/, '').trim();
  const afterPostal = address.substring(postalIndex + 5).trim();
  const city = afterPostal.replace(/^[,\s-]+/, '').replace(/[,\s-]+$/, '').trim();
  
  return {
    address: line1 || address,
    postalCode,
    city: city || '',
    country: existingCountry || 'FR',
  };
};

/**
 * @deprecated Utiliser parseAddressRetroactive à la place
 * Parse une adresse française en composants (ancien format combiné)
 */
export const parseFrenchAddress = (address: string): {
  line1: string;
  postalCode: string;
  city: string;
} => {
  if (!address) return { line1: '', postalCode: '', city: '' };
  
  const match = address.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  if (match) {
    return {
      line1: match[1].trim().replace(/,\s*$/, ''),
      postalCode: match[2],
      city: match[3].trim(),
    };
  }
  
  return { line1: address.trim(), postalCode: '', city: '' };
};

const getUnitCode = (unit: string): string => {
  return UNIT_CODE_MAP[unit] || 'C62';
};

const getVatCategory = (vatRate: number, sellerCountry: string, buyerCountry: string): string => {
  if (vatRate === 0) return VAT_CATEGORY_MAP.zero;
  if (sellerCountry === buyerCountry) return VAT_CATEGORY_MAP.standard;
  if (sellerCountry === FRANCE_COUNTRY_CODE && buyerCountry !== FRANCE_COUNTRY_CODE) {
    return buyerCountry.length === 2 ? VAT_CATEGORY_MAP.intra : VAT_CATEGORY_MAP.export;
  }
  return VAT_CATEGORY_MAP.standard;
};

export const computeVatBreakdown = (
  lines: EInvoiceLine[],
  sellerCountry: string = 'FR',
  buyerCountry: string = 'FR'
): EInvoiceVatBreakdown[] => {
  const breakdownMap = new Map<number, { taxable: number; vat: number }>();
  
  lines.forEach(line => {
    const existing = breakdownMap.get(line.vatRate) || { taxable: 0, vat: 0 };
    breakdownMap.set(line.vatRate, {
      taxable: existing.taxable + line.totalHt,
      vat: existing.vat + line.totalVat,
    });
  });
  
  return Array.from(breakdownMap.entries()).map(([rate, amounts]) => ({
    rate,
    taxableAmount: round2(amounts.taxable),
    vatAmount: round2(amounts.vat),
    category: getVatCategory(rate, sellerCountry, buyerCountry),
  }));
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const formatFacturXDate = (isoDate: string): string => {
  if (!isoDate) return '';
  return isoDate.replace(/-/g, '').substring(0, 8);
};

// ============================================================
// 📄 GÉNÉRATION XML FACTUR-X (EN 16931 / CII)
// ============================================================

export const generateFacturXXml = (data: EInvoiceData): string => {
  const validation = validateEInvoiceData(data);
  if (!validation.valid) {
    throw new Error(`Données invalides pour la génération Factur-X :\n${validation.errors.join('\n')}`);
  }
  
  const linesXml = data.lines.map((line, index) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${index + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          ${line.reference ? `<ram:SellerAssignedID>${escapeXml(line.reference)}</ram:SellerAssignedID>` : ''}
          <ram:Name>${escapeXml(line.description)}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${line.unitPrice.toFixed(2)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="${getUnitCode(line.unit)}">${line.quantity}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${getVatCategory(line.vatRate, data.seller.country, data.buyer.country)}</ram:CategoryCode>
            <ram:RateApplicablePercent>${line.vatRate.toFixed(2)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          ${line.discount > 0 ? `
          <ram:SpecifiedTradeAllowanceCharge>
            <ram:ChargeIndicator>
              <udt:Indicator>false</udt:Indicator>
            </ram:ChargeIndicator>
            <ram:CalculationPercent>${line.discount.toFixed(2)}</ram:CalculationPercent>
            <ram:Reason>Remise</ram:Reason>
          </ram:SpecifiedTradeAllowanceCharge>` : ''}
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${line.totalHt.toFixed(2)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`).join('');
  
  const vatBreakdownXml = data.vatBreakdown.map(vat => `
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${vat.vatAmount.toFixed(2)}</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:BasisAmount>${vat.taxableAmount.toFixed(2)}</ram:BasisAmount>
          <ram:CategoryCode>${vat.category}</ram:CategoryCode>
          <ram:RateApplicablePercent>${vat.rate.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>`).join('');
  
  const globalDiscountXml = data.globalDiscount && data.globalDiscount > 0 ? `
        <ram:SpecifiedTradeAllowanceCharge>
          <ram:ChargeIndicator>
            <udt:Indicator>false</udt:Indicator>
          </ram:ChargeIndicator>
          <ram:CalculationPercent>${data.globalDiscount.toFixed(2)}</ram:CalculationPercent>
          <ram:Reason>Remise globale</ram:Reason>
        </ram:SpecifiedTradeAllowanceCharge>` : '';
  
  const sellerSiretXml = data.seller.siret ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(data.seller.siret.replace(/\s/g, ''))}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : '';
  
  const buyerSiretXml = data.buyer.siret ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(data.buyer.siret.replace(/\s/g, ''))}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : '';
  
  const sellerVatXml = data.seller.vatNumber ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(data.seller.vatNumber)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : '';
  
  const buyerVatXml = data.buyer.vatNumber ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(data.buyer.vatNumber)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : '';
  
  const contractReferenceXml = data.originalQuoteNumber ? `
      <ram:ContractReferencedDocument>
        <ram:IssuerAssignedID>${escapeXml(data.originalQuoteNumber)}</ram:IssuerAssignedID>
      </ram:ContractReferencedDocument>` : '';
  
  const originalInvoiceXml = data.originalInvoiceNumber ? `
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${escapeXml(data.originalInvoiceNumber)}</ram:IssuerAssignedID>
      </ram:InvoiceReferencedDocument>` : '';
  
  const paymentTermsXml = data.paymentConditions || data.dueDate ? `
      <ram:SpecifiedTradePaymentTerms>
        ${data.paymentConditions ? `<ram:Description>${escapeXml(data.paymentConditions)}</ram:Description>` : ''}
        ${data.dueDate ? `
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${formatFacturXDate(data.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>` : ''}
      </ram:SpecifiedTradePaymentTerms>` : '';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice 
    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(data.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${data.documentType}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${formatFacturXDate(data.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${linesXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(data.seller.name)}</ram:Name>${sellerSiretXml}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.seller.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.seller.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(data.seller.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(data.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.seller.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${escapeXml(data.seller.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${sellerVatXml}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(data.buyer.name)}</ram:Name>${buyerSiretXml}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.buyer.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.buyer.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(data.buyer.city)}</ram:CityName>
          <ram:CountryID>${escapeXml(data.buyer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${data.buyer.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${escapeXml(data.buyer.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${buyerVatXml}
      </ram:BuyerTradeParty>${contractReferenceXml}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery />
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(data.currency)}</ram:InvoiceCurrencyCode>${vatBreakdownXml}${globalDiscountXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${data.subtotal.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${data.subtotal.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(data.currency)}">${data.totalVat.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${data.totalTtc.toFixed(2)}</ram:GrandTotalAmount>
        ${data.depositAmount ? `<ram:TotalPrepaidAmount>${data.depositAmount.toFixed(2)}</ram:TotalPrepaidAmount>` : ''}
        <ram:DuePayableAmount>${data.balanceDue.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${originalInvoiceXml}${paymentTermsXml}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
};

// ============================================================
// 🔐 HASH SHA-256 (ARCHIVAGE PROBANT)
// ============================================================

export const computeHash = async (content: string): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Erreur calcul hash SHA-256:', error);
    throw new Error('Impossible de calculer le hash SHA-256');
  }
};

// ============================================================
// 🔄 CONVERSION DEPUIS UNE FACTURE EXISTANTE (CORRIGÉE)
// ============================================================

interface CommercialInvoice {
  $id: string;
  invoiceNumber: string;
  type?: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  tax: number;
  discount: number;
  total: number;
  deposit: number;
  balance: number;
  
  currencyCode?: string;
  
  // Entreprise
  companyName?: string;
  companyAddress?: string;
  companySiret?: string;
  companyTva?: string;
  companyEmail?: string;
  // ✅ NOUVEAUX CHAMPS DISTINCTS
  companyPostalCode?: string;
  companyCity?: string;
  companyCountry?: string;
  
  // Client
  clientName?: string;
  clientAddress?: string;
  clientBillingAddress?: string;
  clientEmail?: string;
  // ✅ NOUVEAUX CHAMPS DISTINCTS
  clientPostalCode?: string;
  clientCity?: string;
  clientCountry?: string;
  
  items?: string;
  
  paymentConditions?: string;
  paymentMethods?: string;
  
  quoteId?: string;
  originalInvoiceId?: string;
}

/**
 * Convertit une facture commerciale en données e-facture
 * ✅ CORRIGÉ : utilise les champs distincts (companyPostalCode, etc.) en priorité
 */
export const convertInvoiceToEInvoiceData = (
  invoice: CommercialInvoice,
  clientSiret?: string,
  clientSiren?: string,
  clientVatNumber?: string
): EInvoiceData => {
  // Parse les lignes
  let items: any[] = [];
  try {
    items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);
  } catch (e) {
    console.warn('Erreur parse items:', e);
    items = [];
  }
  
  // Convertit les lignes au format EInvoiceLine
  const lines: EInvoiceLine[] = items.map((item, index) => {
    const quantity = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const vatRate = Number(item.tvaRate) || 0;
    const discount = Number(item.discount) || 0;
    
    const totalHt = round2(quantity * unitPrice * (1 - discount / 100));
    const totalVat = round2(totalHt * (vatRate / 100));
    
    return {
      id: item.id || `line-${index}`,
      reference: item.reference || '',
      description: item.description || '',
      quantity,
      unit: item.unit || 'Forfait',
      unitPrice,
      vatRate,
      discount,
      totalHt,
      totalVat,
      totalTtc: round2(totalHt + totalVat),
    };
  });
  
  // ✅ CORRECTION PRINCIPALE : utilise parseAddressRetroactive avec champs distincts
  const sellerAddr = parseAddressRetroactive(
    invoice.companyAddress,
    invoice.companyPostalCode,
    invoice.companyCity,
    invoice.companyCountry
  );
  
  const buyerAddressRaw = invoice.clientBillingAddress || invoice.clientAddress || '';
  const buyerAddr = parseAddressRetroactive(
    buyerAddressRaw,
    invoice.clientPostalCode,
    invoice.clientCity,
    invoice.clientCountry
  );
  
  // Log de debug pour diagnostic
  console.log('🔍 [EInvoice] Adresses parsées:', {
    seller: {
      address: sellerAddr.address,
      postalCode: sellerAddr.postalCode,
      city: sellerAddr.city,
      country: sellerAddr.country,
    },
    buyer: {
      address: buyerAddr.address,
      postalCode: buyerAddr.postalCode,
      city: buyerAddr.city,
      country: buyerAddr.country,
    },
  });
  
  // Détermine le type de document
  let documentType: EInvoiceDocumentType = '380';
  if (invoice.type === 'credit') documentType = '381';
  else if (invoice.type === 'advance') documentType = '386';
  
  const sellerSiren = invoice.companySiret 
    ? invoice.companySiret.replace(/\s/g, '').substring(0, 9) 
    : undefined;
  
  const isVatApplicable = invoice.companyTva && !invoice.companyTva.includes('non applicable');
  const sellerVatNumber = isVatApplicable && invoice.companyTva?.startsWith('FR')
    ? invoice.companyTva
    : undefined;
  
  const vatBreakdown = computeVatBreakdown(lines, sellerAddr.country, buyerAddr.country);
  
  return {
    invoiceNumber: invoice.invoiceNumber,
    documentType,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    
    seller: {
      name: invoice.companyName || '',
      siren: sellerSiren,
      siret: invoice.companySiret ? invoice.companySiret.replace(/\s/g, '') : undefined,
      vatNumber: sellerVatNumber,
      address: sellerAddr.address,
      postalCode: sellerAddr.postalCode,
      city: sellerAddr.city,
      country: sellerAddr.country,
      email: invoice.companyEmail,
    },
    
    buyer: {
      name: invoice.clientName || '',
      siren: clientSiren,
      siret: clientSiret ? clientSiret.replace(/\s/g, '') : undefined,
      vatNumber: clientVatNumber,
      address: buyerAddr.address,
      postalCode: buyerAddr.postalCode,
      city: buyerAddr.city,
      country: buyerAddr.country,
      email: invoice.clientEmail,
    },
    
    lines,
    
    currency: invoice.currencyCode || 'EUR',
    subtotal: round2(invoice.subtotal || 0),
    globalDiscount: invoice.discount || 0,
    discountAmount: round2((invoice.subtotal || 0) * (invoice.discount || 0) / 100),
    vatBreakdown,
    totalVat: round2(invoice.tax || invoice.vatAmount || 0),
    totalTtc: round2(invoice.total || 0),
    depositAmount: invoice.deposit || 0,
    balanceDue: round2(invoice.balance || invoice.total || 0),
    
    paymentConditions: invoice.paymentConditions,
    
    id: invoice.$id,
    isElectronic: true,
    transmissionStatus: 'draft',
  };
};

// ============================================================
// 📥 TÉLÉCHARGEMENT
// ============================================================

export const downloadFacturXXml = (data: EInvoiceData, xmlContent?: string): void => {
  const xml = xmlContent || generateFacturXXml(data);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `factur-x_${data.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

// ============================================================
// 📊 UTILITAIRES D'AFFICHAGE
// ============================================================

export const E_INVOICE_STATUS_LABELS: Record<EInvoiceTransmissionStatus, string> = {
  draft: 'Brouillon',
  ready: 'À transmettre',
  transmitted: 'Transmise',
  accepted: 'Acceptée',
  rejected: 'Rejetée',
  disputed: 'Contestée',
  cancelled: 'Annulée',
};

export const E_INVOICE_STATUS_TONES: Record<EInvoiceTransmissionStatus, 'slate' | 'amber' | 'sky' | 'green' | 'red' | 'orange' | 'gray'> = {
  draft: 'slate',
  ready: 'amber',
  transmitted: 'sky',
  accepted: 'green',
  rejected: 'red',
  disputed: 'orange',
  cancelled: 'gray',
};

export const E_INVOICE_TYPE_LABELS: Record<EInvoiceDocumentType, string> = {
  '380': 'Facture',
  '381': 'Avoir',
  '384': 'Facture corrective',
  '386': 'Facture d\'acompte',
};
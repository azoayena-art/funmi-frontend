// src/services/facturxGenerator.ts
import type { Invoice } from '../pages/Invoices';

interface InvoiceItem {
  id: string;
  reference: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  tvaRate: number;
  total: number;
  discount: number;
}

/**
 * Génère le XML Factur-X (CII) conforme au standard EN16931
 * Basé sur le profil BASIC WL (sans données comptables détaillées)
 */
export const generateFacturXXml = (invoice: Invoice): string => {
  const items: InvoiceItem[] = JSON.parse(invoice.items || '[]');
  
  // Calcul des totaux par taux de TVA
  const vatBreakdown = new Map<number, {
    baseAmount: number;
    taxAmount: number;
    rate: number;
  }>();

  items.forEach(item => {
    const rate = item.tvaRate || 0;
    const lineTotal = item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100);
    const taxAmount = lineTotal * (rate / 100);
    
    const existing = vatBreakdown.get(rate) || { baseAmount: 0, taxAmount: 0, rate };
    existing.baseAmount += lineTotal;
    existing.taxAmount += taxAmount;
    vatBreakdown.set(rate, existing);
  });

  // Formatage des dates ISO
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return new Date().toISOString().split('T')[0].replace(/-/g, '');
    return dateStr.split('T')[0].replace(/-/g, '');
  };

  const formatAmount = (amount: number): string => amount.toFixed(2);

  // Extraction des données SIRET/SIREN
  const sellerSiret = (invoice as any).companySiret || '';
  const buyerSiret = (invoice as any).clientSiret || '';
  const sellerSiren = sellerSiret.substring(0, 9);
  const buyerSiren = buyerSiret.substring(0, 9);

  // Construction du XML CII (Cross Industry Invoice)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basicwl</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  
  <rsm:ExchangedDocument>
    <ram:ID>${invoice.invoiceNumber}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${formatDate(invoice.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:Name>FACTURE</ram:Name>
    <ram:TypeCode>380</ram:TypeCode>
  </rsm:ExchangedDocument>
  
  <rsm:SupplyChainTradeTransaction>
    ${items.map((item, idx) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${idx + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        ${item.reference ? `<ram:SellerAssignedID>${escapeXml(item.reference)}</ram:SellerAssignedID>` : ''}
        <ram:Name>${escapeXml(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${formatAmount(item.unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${item.unit || 'C62'}">${item.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${item.tvaRate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${formatAmount(item.total)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('')}
    
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(invoice.companyName || '')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${extractPostalCode(invoice.companyAddress || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(extractAddressLine(invoice.companyAddress || ''))}</ram:LineOne>
          <ram:CityName>${extractCity(invoice.companyAddress || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${sellerSiren ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${sellerSiren}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
        ${sellerSiret ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${(invoice as any).companyTva || ''}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(invoice.clientName || '')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${extractPostalCode(invoice.clientAddress || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(extractAddressLine(invoice.clientAddress || ''))}</ram:LineOne>
          <ram:CityName>${extractCity(invoice.clientAddress || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${buyerSiren ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${buyerSiren}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${formatDate(invoice.issueDate)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${Array.from(vatBreakdown.values()).map(vat => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${formatAmount(vat.taxAmount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${formatAmount(vat.baseAmount)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${vat.rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join('')}
      
      ${invoice.dueDate ? `
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${formatDate(invoice.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>` : ''}
      
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${formatAmount(invoice.subtotal || 0)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${formatAmount(invoice.subtotal || 0)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${formatAmount(invoice.tax || 0)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${formatAmount(invoice.total || 0)}</ram:GrandTotalAmount>
        <ram:TotalPrepaidAmount>${formatAmount(invoice.deposit || 0)}</ram:TotalPrepaidAmount>
        <ram:DuePayableAmount>${formatAmount(invoice.balance || invoice.total || 0)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return xml;
};

/**
 * Échappe les caractères XML spéciaux
 */
const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Extrait le code postal d'une adresse
 */
const extractPostalCode = (address: string): string => {
  const match = address.match(/\b\d{5}\b/);
  return match ? match[0] : '';
};

/**
 * Extrait la première ligne d'adresse (sans code postal ni ville)
 */
const extractAddressLine = (address: string): string => {
  const parts = address.split(',');
  if (parts.length > 0) {
    return parts[0].replace(/\d{5}.*$/, '').trim();
  }
  return address;
};

/**
 * Extrait la ville d'une adresse
 */
const extractCity = (address: string): string => {
  const match = address.match(/\d{5}\s+([A-Za-zÀ-ÿ\s-]+)/);
  return match ? match[1].trim() : '';
};

/**
 * Valide la structure du XML Factur-X généré
 */
export const validateFacturXXml = (xml: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!xml.includes('<rsm:CrossIndustryInvoice')) {
    errors.push('Racine CrossIndustryInvoice manquante');
  }
  if (!xml.includes('<ram:ID>') || !xml.includes('</ram:ID>')) {
    errors.push('Numéro de facture manquant');
  }
  if (!xml.includes('<ram:SellerTradeParty>')) {
    errors.push('Informations vendeur manquantes');
  }
  if (!xml.includes('<ram:BuyerTradeParty>')) {
    errors.push('Informations acheteur manquantes');
  }
  if (!xml.includes('<ram:GrandTotalAmount>')) {
    errors.push('Montant total manquant');
  }
  
  return { valid: errors.length === 0, errors };
};
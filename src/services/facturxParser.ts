import { extractFacturXFromPdf } from './facturxEmbedder';

export interface ParsedInvoice {
  invoiceNumber: string;
  supplierName: string;
  supplierSiret?: string;
  issueDate: string;
  dueDate?: string;
  subtotal: number;
  tax: number;
  total: number;
  currencyCode: string;
  xmlContent?: string;
  format: 'factur-x' | 'ubl' | 'cii' | 'unknown';
}

/**
 * Parse un fichier (PDF ou XML) et extrait les données de facture
 */
export async function parseReceivedInvoice(file: File): Promise<ParsedInvoice> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  let xmlContent: string | null = null;
  
  // Détection du type
  const fileName = file.name.toLowerCase();
  const isXml = file.type === 'application/xml' || 
                file.type === 'text/xml' || 
                fileName.endsWith('.xml');
  const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
  
  if (isXml) {
    xmlContent = new TextDecoder('utf-8').decode(bytes);
  } else if (isPdf) {
    // Extraction via pdfjs-dist
    xmlContent = await extractFacturXFromPdf(bytes);
    if (!xmlContent) {
      throw new Error(
        'Aucun XML Factur-X trouvé dans ce PDF. ' +
        'Assurez-vous que le PDF est au format Factur-X (avec XML embarqué).'
      );
    }
  } else {
    throw new Error('Format non supporté. Accepté : PDF (Factur-X) ou XML');
  }
  
  // Détection du format
  const format = detectFormat(xmlContent);
  
  // Extraction selon le format
  if (format === 'factur-x' || format === 'cii') {
    return parseCII(xmlContent);
  } else if (format === 'ubl') {
    return parseUBL(xmlContent);
  }
  
  throw new Error('Format XML non reconnu. Formats supportés : Factur-X (CII), UBL');
}

function detectFormat(xml: string): 'factur-x' | 'ubl' | 'cii' | 'unknown' {
  if (xml.includes('CrossIndustryInvoice')) return 'factur-x';
  if (xml.includes('Invoice xmlns') || xml.includes('urn:oasis:names')) return 'ubl';
  if (xml.includes('rsm:')) return 'cii';
  return 'unknown';
}

function parseCII(xml: string): ParsedInvoice {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  
  const getText = (selector: string): string => {
    // Essayer avec et sans namespace
    const selectors = [
      selector,
      selector.replace(/ /g, ' *|'),
    ];
    for (const s of selectors) {
      try {
        const el = doc.querySelector(s);
        if (el?.textContent) return el.textContent.trim();
      } catch {}
    }
    // Fallback : chercher par tagName
    const tag = selector.split(' ').pop()?.split(':').pop() || '';
    const els = doc.getElementsByTagName(tag);
    if (els.length > 0 && els[0].textContent) {
      return els[0].textContent.trim();
    }
    return '';
  };
  
  return {
    invoiceNumber: getText('ID') || 'N/A',
    supplierName: getText('Name') || 'Fournisseur inconnu',
    supplierSiret: '',
    issueDate: formatCIIdate(getText('DateTimeString')) || new Date().toISOString().split('T')[0],
    dueDate: '',
    subtotal: parseFloat(getText('TaxBasisTotalAmount')) || 0,
    tax: parseFloat(getText('TaxTotalAmount')) || 0,
    total: parseFloat(getText('GrandTotalAmount')) || 0,
    currencyCode: getText('InvoiceCurrencyCode') || 'EUR',
    xmlContent: xml,
    format: 'factur-x',
  };
}

function parseUBL(xml: string): ParsedInvoice {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  
  const getText = (selector: string): string => {
    const tag = selector.split(' ').pop() || '';
    const els = doc.getElementsByTagName(tag);
    if (els.length > 0 && els[0].textContent) {
      return els[0].textContent.trim();
    }
    return '';
  };
  
  return {
    invoiceNumber: getText('ID') || 'N/A',
    supplierName: getText('Name') || 'Fournisseur inconnu',
    supplierSiret: '',
    issueDate: getText('IssueDate') || new Date().toISOString().split('T')[0],
    dueDate: getText('PaymentDueDate') || getText('DueDate') || '',
    subtotal: parseFloat(getText('TaxExclusiveAmount')) || 0,
    tax: parseFloat(getText('TaxAmount')) || 0,
    total: parseFloat(getText('PayableAmount')) || 0,
    currencyCode: getText('DocumentCurrencyCode') || 'EUR',
    xmlContent: xml,
    format: 'ubl',
  };
}

function formatCIIdate(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.replace(/-/g, '').replace(/T.*/, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return dateStr;
}
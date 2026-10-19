// src/services/ocrService.ts
import Tesseract from 'tesseract.js';

export interface OCRResult {
  success: boolean;
  rawText: string;
  extracted: {
    amount?: number;
    date?: string;
    counterpartyName?: string;
    vatRate?: number;
    description?: string;
    reference?: string;
  };
  confidence: number;
  error?: string;
}

const PATTERNS = {
  amount: /(?:total|montant|net\s*à\s*payer|ttc|due|amount|price|sum)[\s:]*([€$£]?\s*[\d\s]+[.,]\d{2})\s*([€$£]|EUR|USD|XOF|XAF)?/i,
  amountFallback: /([€$£]?\s*[\d\s]+[.,]\d{2})\s*([€$£]|EUR|USD|XOF|XAF)?/,
  date: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
  dateISO: /(\d{4})-(\d{2})-(\d{2})/,
  vatRate: /(?:tva|vat|tax)[\s:]*(\d{1,2})[,.]?(\d?)\s*%?/i,
  reference: /(?:n[°ºo]|facture|invoice|reçu|receipt|ref)[\s.:#-]*([A-Z0-9\-\/]{3,20})/i,
};

const SUPPLIER_KEYWORDS = [
  'carrefour', 'leclerc', 'auchan', 'intermarché', 'lidl', 'monoprix',
  'total', 'shell', 'bp', 'elf', 'casino', 'fnac', 'boulanger', 'darty',
  'amazon', 'uber', 'sncf', 'ratp', 'airbnb', 'booking',
  'orange', 'sfr', 'free', 'bouygues', 'edf', 'engie', 'grdf',
  'decathlon', 'ikea', 'leroy', 'castorama',
];

function parseOCRText(text: string): OCRResult['extracted'] {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const result: OCRResult['extracted'] = {};

  const amountMatch = normalizedText.match(PATTERNS.amount) || normalizedText.match(PATTERNS.amountFallback);
  if (amountMatch) {
    const rawAmount = amountMatch[1].replace(/[€$£\s]/g, '').replace(',', '.');
    const parsed = parseFloat(rawAmount);
    if (!isNaN(parsed) && parsed > 0 && parsed < 1000000) result.amount = parsed;
  }

  const dateMatch = normalizedText.match(PATTERNS.dateISO) || normalizedText.match(PATTERNS.date);
  if (dateMatch) {
    try {
      let year: number, month: number, day: number;
      if (dateMatch[0].match(PATTERNS.dateISO)) {
        year = parseInt(dateMatch[1]); month = parseInt(dateMatch[2]); day = parseInt(dateMatch[3]);
      } else {
        day = parseInt(dateMatch[1]); month = parseInt(dateMatch[2]); year = parseInt(dateMatch[3]);
        if (year < 100) year += 2000;
      }
      if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        result.date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } catch {}
  }

  const vatMatch = normalizedText.match(PATTERNS.vatRate);
  if (vatMatch) {
    const rate = parseFloat(`${vatMatch[1]}${vatMatch[2] ? '.' + vatMatch[2] : ''}`);
    if ([0, 2.1, 5.5, 10, 18, 20].includes(rate)) result.vatRate = rate;
  }

  const refMatch = normalizedText.match(PATTERNS.reference);
  if (refMatch) result.reference = refMatch[1].trim();

  const lines = normalizedText.split(/[.\n]/).map(l => l.trim()).filter(Boolean);
  const foundSupplier = SUPPLIER_KEYWORDS.find(kw => normalizedText.toLowerCase().includes(kw));
  if (foundSupplier) {
    result.counterpartyName = foundSupplier.charAt(0).toUpperCase() + foundSupplier.slice(1);
  } else if (lines[0]?.length > 3 && lines[0].length < 50 && !lines[0].match(/^\d/)) {
    result.counterpartyName = lines[0];
  }

  const descLine = lines.find(l => l.length > 10 && l.length < 100 && !l.match(/^\d+[\s\/\-]/) && !l.toLowerCase().includes('total'));
  if (descLine) result.description = descLine;

  return result;
}

export async function extractFromJustificatif(file: File, onProgress?: (progress: number) => void): Promise<OCRResult> {
  try {
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, rawText: '', extracted: {}, confidence: 0, error: 'Fichier trop volumineux (max 10 MB)' };
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      return { success: false, rawText: '', extracted: {}, confidence: 0, error: 'Format non supporté (JPG, PNG, PDF)' };
    }

    const { data } = await Tesseract.recognize(file, 'fra+eng', {
      logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100)); },
    });

    return { success: true, rawText: data.text, extracted: parseOCRText(data.text), confidence: data.confidence };
  } catch (error: any) {
    return { success: false, rawText: '', extracted: {}, confidence: 0, error: error.message };
  }
}
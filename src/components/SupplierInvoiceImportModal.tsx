// src/components/SupplierInvoiceImportModal.tsx
// Modal d'acquisition des factures fournisseurs — version finale consolidée
// 📎 Upload justificatif AVANT OCR + détection de doublons par hash SHA-256
// 🌍 Internationalisation multi-pays (détection pays par préfixe TVA)
// 🔐 RLS centralisé via utils/rowLevelPermissions
// 💰 Remise globale en % ET en montant (synchronisés)
// ✅ VALIDATION HUMAINE : justificatif créé en statut "pending" (à valider)
// ✅ CORRIGÉ : Permissions storage compatibles avec le bucket (Role.any() pour read)

// 🔐 SÉCURITÉ MULTI-TENANT :
// - Tous les documents créés ont Role.team(appwriteTeamId) via getTeamPermissions()
// - Les fichiers storage ont Role.any() pour lecture (aperçus) mais Role.team() pour modif/suppression
// - La détection de doublons se fait par hash SHA-256 au niveau de l'équipe
// - Le chargement filtre par Query.equal('teamId', customTeamId)

import { useState, useMemo, useEffect } from 'react';
import { databases, storage, DATABASE_ID, BUCKET_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useCompanySettings } from '../hooks/useCompanySettings';
import Modal from './ui/Modal';
import { toast } from 'sonner';
import {
  Upload, Camera, Keyboard, Mail, FileCheck, FileX,
  CheckCircle2, AlertCircle, Sparkles, Eye, EyeOff,
  Building2, User, MapPin, Hash, Globe, Plus, Minus,
  FileText, DollarSign, Package, Landmark, Shield, Info, Clock,
} from 'lucide-react';
import { Query, ID, Permission, Role } from 'appwrite'; // ✅ Permission + Role ajoutés
import { parseReceivedInvoice, type ParsedInvoice } from '../services/facturxParser';
import Tesseract from 'tesseract.js';
import { getTeamPermissions } from '../utils/rowLevelPermissions';
import {
  getCountryConfig, getPrimaryIdentifier, FALLBACK_COUNTRY,
  type CountryConfig,
} from '../config/countries';

// ============================================================
// 📋 TYPES
// ============================================================
interface InvoiceItem {
  id: string; reference: string; description: string; quantity: number;
  unit: string; unitPrice: number; tvaRate: number; total: number; discount: number;
}

interface SupplierForm {
  supplierType: 'entreprise' | 'particulier';
  supplierName: string;
  supplierSiret: string;
  supplierSiren: string;
  supplierVatNumber: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierAddress: string;
  supplierPostalCode: string;
  supplierCity: string;
  supplierCountry: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: string;
  tax: string;
  total: string;
  discount: number;
  discountAmount: number;
  currencyCode: string;
  iban: string;
  paymentConditions: string;
  paymentMethods: string;
  notes: string;
}

const UNIT_OPTIONS = ['Forfait', 'Heure', 'Jour', 'm²', 'ml', 'Unité', 'kg', 'Intervention'];
const TVA_OPTIONS = ['20', '10', '5.5', '2.1', '0'];
const PAYMENT_METHODS = ['Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement SEPA', 'Autre'];

const emptyForm = (): SupplierForm => ({
  supplierType: 'entreprise',
  supplierName: '', supplierSiret: '', supplierSiren: '', supplierVatNumber: '',
  supplierEmail: '', supplierPhone: '',
  supplierAddress: '', supplierPostalCode: '', supplierCity: '', supplierCountry: 'FR',
  invoiceNumber: '',
  issueDate: new Date().toISOString().split('T')[0],
  dueDate: '',
  items: [{ id: '1', reference: '', description: '', quantity: 1, unit: 'Forfait', unitPrice: 0, tvaRate: 20, total: 0, discount: 0 }],
  subtotal: '', tax: '', total: '',
  discount: 0,
  discountAmount: 0,
  currencyCode: 'EUR',
  iban: '',
  paymentConditions: 'Paiement à 30 jours',
  paymentMethods: 'Virement bancaire',
  notes: '',
});

export interface ImportResult {
  invoiceId: string;
  invoiceNumber: string;
  fileId?: string;
  bucketId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileHash?: string;
  amount?: number;
  supplierName?: string;
  issueDate?: string;
  source?: string;
  supplierCountry?: string;
  supplierRegistrationId?: string;
  supplierVatNumber?: string;
  supplierSecondaryId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ImportResult) => void;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ============================================================
// ✅ HELPER : Permissions fichier compatibles avec le bucket
// Le bucket n'accepte que any/guests pour read, team pour write
// ============================================================
const getFileStoragePermissions = (appwriteTeamId: string | null | undefined): string[] => {
  if (!appwriteTeamId) {
    return [Permission.read(Role.any())];
  }
  return [
    Permission.read(Role.any()),                    // ✅ Lecture publique (acceptée par le bucket)
    Permission.update(Role.team(appwriteTeamId)),   // ✅ Modification réservée à l'équipe
    Permission.delete(Role.team(appwriteTeamId)),   // ✅ Suppression réservée à l'équipe
  ];
};

// ============================================================
// 🔒 HASH SHA-256
// ============================================================
const computeSHA256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// ============================================================
// 📎 CRÉATION AUTOMATIQUE DU JUSTIFICATIF
// ✅ VALIDATION HUMAINE : statut "pending" par défaut
// ============================================================
const createJustificationRecord = async (params: {
  invoiceId: string;
  invoiceNumber: string;
  fileId: string;
  bucketId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash?: string;
  amount: number;
  userId: string;
  teamId: string;
  appwriteTeamId: string;
}): Promise<void> => {
  try {
    const existing = await databases.listDocuments(
      DATABASE_ID,
      'expense_justifications',
      [
        Query.equal('teamId', params.teamId),
        Query.equal('expenseId', params.invoiceId),
        Query.equal('fileId', params.fileId),
        Query.limit(1),
      ]
    );

    if (existing.documents.length > 0) {
      console.log('ℹ️ Justificatif déjà lié, on ignore');
      return;
    }

    await databases.createDocument(
      DATABASE_ID,
      'expense_justifications',
      ID.unique(),
      {
        teamId: params.teamId,
        expenseType: 'supplier_invoice',
        expenseId: params.invoiceId,
        expenseNumber: params.invoiceNumber,
        fileId: params.fileId,
        bucketId: params.bucketId,
        fileName: params.fileName,
        fileType: params.fileType,
        fileSize: params.fileSize,
        fileHash: params.fileHash || '',
        amount: params.amount,
        uploadedBy: params.userId,
        uploadedAt: new Date().toISOString(),
        validationStatus: 'pending',
      },
      getTeamPermissions(params.appwriteTeamId)
    );

    console.log('✅ Justificatif automatiquement lié à la facture (à valider)', {
      fileId: params.fileId,
      bucketId: params.bucketId,
    });
  } catch (e: any) {
    console.warn('⚠️ Création justificatif échouée (non bloquant):', e.message);
  }
};

// ============================================================
// 🔤 VALIDATION
// ============================================================
const validateSIRET = (siret: string): boolean => {
  if (!siret) return true;
  const clean = siret.replace(/\s/g, '');
  if (!/^\d{14}$/.test(clean)) return false;
  let sum = 0; let isEven = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit; isEven = !isEven;
  }
  return sum % 10 === 0;
};

const validateSIREN = (siren: string): boolean => {
  if (!siren) return true;
  const clean = siren.replace(/\s/g, '');
  if (!/^\d{9}$/.test(clean)) return false;
  let sum = 0; let isEven = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit; isEven = !isEven;
  }
  return sum % 10 === 0;
};

const validateVatFR = (vat: string): boolean => {
  if (!vat) return true;
  const clean = vat.replace(/\s/g, '').toUpperCase();
  return /^FR[0-9A-Z]{2}\d{9}$/.test(clean);
};

const parseFrAmount = (s: string): number => {
  const clean = s.replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

const frDateToIso = (d: string): string => {
  const m = d.match(/(\d{2})[\/\.](\d{2})[\/\.](\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// ============================================================
// 🔍 EXTRACTEURS
// ============================================================
const normalizeText = (text: string): string => {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\t/g, '    ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

const extractEmails = (text: string): string[] => {
  const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  return Array.from(new Set(text.match(regex) || []));
};

const extractPhones = (text: string): string[] => {
  const phones: string[] = [];
  const labelRegex = /(?:t[ée]l(?:[ée]phone)?|t[éè]l|tel|phone|mobile|port(?:able)?|fax)\s*[:.]?\s*([+]?[\d\s.()\-]{8,20})/gi;
  let m;
  while ((m = labelRegex.exec(text)) !== null) phones.push(m[1].trim());
  const mobileFr = /0[67](?:[\s.-]?\d{2}){4}/g;
  while ((m = mobileFr.exec(text)) !== null) phones.push(m[0]);
  const fixeFr = /0[1-59](?:[\s.-]?\d{2}){4}/g;
  while ((m = fixeFr.exec(text)) !== null) phones.push(m[0]);
  const intl = /\+33\s?[1-9](?:[\s.-]?\d{2}){4}/g;
  while ((m = intl.exec(text)) !== null) phones.push(m[0]);
  const seen = new Set<string>();
  return phones
    .map(p => p.replace(/[\s.()-]/g, ''))
    .filter(p => {
      if (p.length < 10 || p.length > 15) return false;
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
};

const extractAddresses = (text: string): { full: string; street: string; postalCode: string; city: string }[] => {
  const results: { full: string; street: string; postalCode: string; city: string }[] = [];
  const pattern1 = /(\d{1,4}(?:\s*(?:bis|ter|quater)?\s*(?:rue|avenue|av|boulevard|bd|allée|impasse|chemin|ch|route|rte|place|pl|passage|sq|square|cours|quai|villa|résidence|za|zi|zac|parc)\s+[A-ZÀ-Ÿa-zà-ÿ'\-]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ'\-]+){0,5}))\s*[,.\n\r]+\s*(\d{5})\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿa-zà-ÿ'\-\s]{2,30})/gi;
  let m;
  while ((m = pattern1.exec(text)) !== null) {
    const street = m[1].replace(/\s+/g, ' ').trim();
    const postalCode = m[2];
    const city = m[3].trim();
    const full = `${street}, ${postalCode} ${city}`;
    if (!results.some(r => r.postalCode === postalCode && r.city === city)) {
      results.push({ full, street, postalCode, city });
    }
  }
  return results;
};

const extractIBANs = (text: string): string[] => {
  const regex = /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){2,8}\d{0,4}\b/gi;
  const matches = text.match(regex) || [];
  const seen = new Set<string>();
  return matches
    .map(m => m.replace(/\s/g, '').toUpperCase())
    .filter(m => {
      if (m.length < 14 || m.length > 34) return false;
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    });
};

// ============================================================
// 🧾 MONTANTS OCR + FILTRES DE LIGNES
// ============================================================
const normOcrAmount = (raw: string): number => {
  let s = raw.replace(/\s/g, '').replace(/€/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{4,}$/.test(s)) s = (parseInt(s, 10) / 100).toFixed(2);
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const LINE_BLACKLIST_START = /^(tel|tél|téléphone|fax|mobile|mail|e-?mail|n°|numéro|suite|échéance|conditions?|siret|siren|rcs|iban|bic|page|date|fait|signature|cachet|taux|pénalité|indemnité|escompte|paiement|règlement|client|fournisseur|facture|devis|bon\s+de|avoir|designation|désignation)\b/i;
const LINE_BLACKLIST_CONTAINS = /n°\s*client|suite\s+au\s+devis|net\s+à\s+payer|échéance\s+de\s+paiement|conditions?\s+de\s+règlement|taux\s+de\s+pénalité|tva\s+intracommunautaire|paiement\s+par\s+chèque|\d{5}\s+[a-zà-ÿ]{2,}/i;
const TOTALS_LINE_START = /^(total\s*(ht|ttc)?|sous-?total|tva|remise|acompte|net\s*a?\s*payer|reste\s*a?\s*payer|solde|a\s*payer|montant\s*(total|net)|ht|ttc)\b[\s:=]*\d/i;
const TOTALS_LINE_END = /\d\s*(€|eur)?\s*(total\s*(ht|ttc)?|sous-?total|net\s*à\s*payer|ttc|ht)\s*$/i;

const UNIT_NOISE: Record<string, string> = {
  'm²': 'm²', 'm2': 'm²', 'mz': 'm²', 'mm': 'm²', 'mx': 'm²',
  'ft': 'Forfait', 'forf': 'Forfait', 'lot': 'Forfait',
  'j': 'Jour', 'jr': 'Jour', 'h': 'Heure', 'hr': 'Heure',
  'u': 'Unité', 'un': 'Unité', 'pce': 'Unité', 'pcs': 'Unité',
  'kg': 'kg', 'ml': 'ml',
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanDescription = (desc: string): string => {
  return desc
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[|©{}!~µ°"]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b[a-zA-ZÀ-Ÿ]\b(?!')/g, ' ')
    .replace(/\b\d\b/g, ' ')
    .replace(/(\s[a-zA-ZÀ-Ÿ]{1,2})+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractInvoiceLines = (text: string): InvoiceItem[] => {
  const items: InvoiceItem[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const seen = new Set<string>();

  for (const line of lines) {
    const clean = line.replace(/^[^A-Za-zÀ-Ÿ]+/, '');
    if (LINE_BLACKLIST_START.test(clean) || LINE_BLACKLIST_CONTAINS.test(clean)) continue;
    if (TOTALS_LINE_START.test(clean) || TOTALS_LINE_END.test(clean)) continue;

    const amountMatches = [...clean.matchAll(/([\d][\d\s.,]*)\s?€/g)];
    if (amountMatches.length === 0) continue;
    const amounts = amountMatches.map(m => normOcrAmount(m[1])).filter(a => a > 0);
    if (amounts.length === 0) continue;

    let descPart = clean;
    for (const m of amountMatches) descPart = descPart.replace(m[0], ' ');

    let unit = 'Forfait';
    let quantity = 1;
    const unitKey = Object.keys(UNIT_NOISE).find(k =>
      new RegExp(`(^|[^a-zà-ÿ0-9])${escapeRegex(k)}([^a-zà-ÿ0-9]|$)`, 'i').test(descPart)
    );
    if (unitKey) {
      unit = UNIT_NOISE[unitKey];
      descPart = descPart.replace(new RegExp(`(^|[^a-zà-ÿ0-9])${escapeRegex(unitKey)}([^a-zà-ÿ0-9]|$)`, 'i'), ' ');
    }
    const qtyMatches = [...descPart.matchAll(/(?:^|\s)(\d{1,3})(?:\s|$)/g)];
    if (qtyMatches.length > 0) {
      const lastQty = qtyMatches[qtyMatches.length - 1];
      const q = parseInt(lastQty[1], 10);
      if (q >= 1 && q <= 999) {
        quantity = q;
        descPart = descPart.replace(lastQty[0], ' ');
      }
    }

    const description = cleanDescription(descPart);
    const letters = (description.match(/[a-zA-ZÀ-Ÿ]/g) || []).length;
    if (letters < 4) continue;
    const key = description.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let unitPrice: number;
    let total: number;
    if (amounts.length >= 2) {
      unitPrice = amounts[0];
      total = amounts[amounts.length - 1];
    } else if (quantity > 1) {
      unitPrice = amounts[0];
      total = round2(quantity * amounts[0]);
    } else {
      total = amounts[0];
      unitPrice = amounts[0];
    }

    const tvaMatch = clean.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s?%/);
    const tvaRate = tvaMatch ? parseFloat(tvaMatch[1].replace(',', '.')) : 20;

    items.push({
      id: `ocr-${items.length + 1}`, reference: '', description,
      quantity, unit, unitPrice, tvaRate, total, discount: 0,
    });
  }
  return items;
};

// ============================================================
// 🧠 PARSER OCR GLOBAL
// ============================================================
const extractFromOcr = (text: string): Partial<SupplierForm> & {
  detectedLines: InvoiceItem[];
  detectedPhones: string[];
  detectedAddresses: { full: string; street: string; postalCode: string; city: string }[];
  detectedEmails: string[];
  detectedIbans: string[];
  detectedCountry?: string;
} => {
  const out: Partial<SupplierForm> & {
    detectedLines: InvoiceItem[];
    detectedPhones: string[];
    detectedAddresses: { full: string; street: string; postalCode: string; city: string }[];
    detectedEmails: string[];
    detectedIbans: string[];
    detectedCountry?: string;
  } = {
    detectedLines: [], detectedPhones: [], detectedAddresses: [], detectedEmails: [], detectedIbans: [],
  };

  const normalized = normalizeText(text);
  const lines = normalized.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const numMatch = normalized.match(
    /(?:facture\s*(?:n°|no\.?|num[eé]ro)?|n°\s*de\s*facture|invoice\s*(?:no\.?|number))\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i
  );
  if (numMatch) out.invoiceNumber = numMatch[1].trim();

  const dateMatch = normalized.match(/(?:date(?:\s*d['']?\s*(?:émission|facture))?)\s*[:.]?\s*(\d{2}[\/\.]\d{2}[\/\.]\d{4})/i);
  if (dateMatch) out.issueDate = frDateToIso(dateMatch[1]);
  const dueMatch = normalized.match(/(?:échéance|date\s*d['']?\s*échéance|à\s*payer\s*(?:avant\s*)?le)\s*[:.]?\s*(\d{2}[\/\.]\d{2}[\/\.]\d{4})/i);
  if (dueMatch) out.dueDate = frDateToIso(dueMatch[1]);

  const siretMatch = normalized.match(/SIRET\s*[:.]?\s*(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})/i)
    || normalized.match(/\b(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/);
  if (siretMatch) out.supplierSiret = siretMatch[1].replace(/\s/g, '');

  const sirenMatch = normalized.match(/SIREN\s*[:.]?\s*(\d{3}\s?\d{3}\s?\d{3})/i);
  if (sirenMatch) out.supplierSiren = sirenMatch[1].replace(/\s/g, '');

  const vatMatch = normalized.match(/(?:TVA|N°\s*TVA|VAT|IVA|MwSt)\s*[:.]?\s*([A-Z]{2}[0-9A-Z]{2,15})/i);
  if (vatMatch) {
    out.supplierVatNumber = vatMatch[1].toUpperCase();
    const vatCountry = vatMatch[1].substring(0, 2).toUpperCase();
    const countryMap: Record<string, string> = {
      FR: 'FR', DE: 'DE', BE: 'BE', IT: 'IT', ES: 'ES', NL: 'NL',
      AT: 'AT', PT: 'PT', LU: 'LU', IE: 'IE', FI: 'FI', SE: 'SE',
      DK: 'DK', PL: 'PL', CZ: 'CZ', SK: 'SK', HU: 'HU', RO: 'RO',
      BG: 'BG', HR: 'HR', SI: 'SI', LT: 'LT', LV: 'LV', EE: 'EE',
      MT: 'MT', CY: 'CY', GB: 'GB', CH: 'CH',
    };
    if (countryMap[vatCountry]) {
      out.detectedCountry = countryMap[vatCountry];
      out.supplierCountry = countryMap[vatCountry];
    }
  }

  const findAmount = (kw: RegExp): number | null => {
    for (const line of lines) {
      if (kw.test(line)) {
        const m = line.match(/([\d][\d\s.,]*)\s*€/) || line.match(/([\d][\d\s.,]*\d)\s*$/);
        if (m) return parseFrAmount(m[1]);
      }
    }
    return null;
  };
  const ttc = findAmount(/total\s*(?:ttc|général)|montant\s*(?:total|à\s*payer|net)|ttc\s*$/i);
  const ht = findAmount(/total\s*ht|montant\s*ht|ht\s*$/i);
  const tva = findAmount(/(?:total\s*)?tva\b/i);
  if (ttc) out.total = ttc.toFixed(2);
  if (ht) out.subtotal = ht.toFixed(2);
  if (tva) out.tax = tva.toFixed(2);

  const skip = /facture|date|siret|siren|page|www|@|total|tva|ttc|ht|€|tel|tél|n°|numéro|avenue|rue|boulevard|chemin|code|postal|iban|bic/i;
  const candidate = lines.slice(0, 5).find(l => l.length > 2 && l.length < 60 && !skip.test(l) && !/^\d+$/.test(l));
  if (candidate) out.supplierName = candidate;

  out.detectedPhones = extractPhones(normalized);
  if (out.detectedPhones.length > 0) out.supplierPhone = out.detectedPhones[0];
  out.detectedEmails = extractEmails(normalized);
  if (out.detectedEmails.length > 0) out.supplierEmail = out.detectedEmails[0];
  out.detectedAddresses = extractAddresses(normalized);
  if (out.detectedAddresses.length > 0) {
    const addr = out.detectedAddresses[0];
    out.supplierAddress = addr.street;
    out.supplierPostalCode = addr.postalCode;
    out.supplierCity = addr.city;
  }
  out.detectedIbans = extractIBANs(normalized);
  if (out.detectedIbans.length > 0) out.iban = out.detectedIbans[0];

  out.detectedLines = extractInvoiceLines(normalized);
  if (out.detectedLines.length > 0) out.items = out.detectedLines;

  return out;
};

// ============================================================
// 🌍 HELPER : Exemple de code postal selon le pays
// ============================================================
const getPostalCodeExample = (countryCode: string): string => {
  const examples: Record<string, string> = {
    FR: '75000', BE: '1000', CH: '1000', LU: '1000', DE: '10115',
    ES: '28001', IT: '00100', GB: 'SW1A 1AA', PT: '1000-001', NL: '1000 AA',
    AT: '1010', IE: 'D01', CA: 'H2X 1Y4', US: '10001',
    BJ: 'Cotonou', SN: 'Dakar', CI: 'Abidjan', MA: '20000',
    TN: '1000', DZ: '16000', CM: 'Douala', GA: 'Libreville',
    CG: 'Brazzaville', MG: '101', ML: 'Bamako', BF: 'Ouagadougou',
    NE: 'Niamey', TG: 'Lomé', MU: '11328',
  };
  return examples[countryCode] || 'Code postal';
};

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function SupplierInvoiceImportModal({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const { customTeamId, appwriteTeamId } = useTeam();
  const { fm, currencyConfig } = useCompanySettings();
  const currencySymbol = currencyConfig?.symbol || '€';

  const [tab, setTab] = useState<'file' | 'photo' | 'manual' | 'email'>('file');
  const [uploading, setUploading] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedInvoice | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [showOcrText, setShowOcrText] = useState(false);
  const [detectedSummary, setDetectedSummary] = useState<{
    phones: string[];
    addresses: { full: string; street: string; postalCode: string; city: string }[];
    emails: string[];
    ibans: string[];
    lines: InvoiceItem[];
  } | null>(null);

  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [preUploadedFileId, setPreUploadedFileId] = useState<string | null>(null);
  const [preUploadedFileHash, setPreUploadedFileHash] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    issueDate: string;
  } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const computedItems = useMemo(() => {
    return form.items.map(i => ({
      ...i,
      total: round2(i.quantity * i.unitPrice * (1 - (i.discount || 0) / 100)),
    }));
  }, [form.items]);

  const computedSubtotal = useMemo(() => round2(computedItems.reduce((s, i) => s + i.total, 0)), [computedItems]);
  const computedDiscountAmount = useMemo(
    () => round2(computedSubtotal * (form.discount || 0) / 100),
    [computedSubtotal, form.discount]
  );

  const taxBreakdown = useMemo(() => {
    const map = new Map<number, { rate: number; baseHT: number; taxAmount: number }>();
    const discountFactor = 1 - (form.discount || 0) / 100;
    computedItems.forEach(i => {
      const cur = map.get(i.tvaRate) || { rate: i.tvaRate, baseHT: 0, taxAmount: 0 };
      const baseAfterDiscount = i.total * discountFactor;
      cur.baseHT = round2(cur.baseHT + baseAfterDiscount);
      cur.taxAmount = round2(cur.taxAmount + baseAfterDiscount * (i.tvaRate / 100));
      map.set(i.tvaRate, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
  }, [computedItems, form.discount]);

  const computedTax = useMemo(() => round2(taxBreakdown.reduce((s, b) => s + b.taxAmount, 0)), [taxBreakdown]);
  const computedTotal = useMemo(
    () => round2(computedSubtotal * (1 - (form.discount || 0) / 100) + computedTax),
    [computedSubtotal, computedTax, form.discount]
  );

  const selectedCountryConfig: CountryConfig = useMemo(
    () => getCountryConfig(form.supplierCountry) || FALLBACK_COUNTRY,
    [form.supplierCountry]
  );
  const selectedIdLabel = useMemo(
    () => getPrimaryIdentifier(selectedCountryConfig)?.shortLabel || 'ID',
    [selectedCountryConfig]
  );

  useEffect(() => {
    const currencyByCountry: Record<string, string> = {
      FR: 'EUR', BE: 'EUR', LU: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR',
      AT: 'EUR', PT: 'EUR', NL: 'EUR', IE: 'EUR', FI: 'EUR',
      CH: 'CHF', GB: 'GBP', US: 'USD', CA: 'CAD',
      BJ: 'XOF', SN: 'XOF', CI: 'XOF', ML: 'XOF', BF: 'XOF', NE: 'XOF', TG: 'XOF',
      CM: 'XAF', GA: 'XAF', CG: 'XAF',
      MA: 'MAD', TN: 'TND', DZ: 'DZD',
      MG: 'MGA', MU: 'MUR',
    };
    const newCurrency = currencyByCountry[form.supplierCountry];
    if (newCurrency && newCurrency !== form.currencyCode) {
      setForm(prev => ({ ...prev, currencyCode: newCurrency }));
    }
  }, [form.supplierCountry]);

  const handleDiscountPercentChange = (percent: number) => {
    const clampedPercent = Math.max(0, Math.min(100, percent || 0));
    const amount = round2(computedSubtotal * clampedPercent / 100);
    setForm(prev => ({ ...prev, discount: clampedPercent, discountAmount: amount }));
  };

  const handleDiscountAmountChange = (amount: number) => {
    const clampedAmount = Math.max(0, Math.min(computedSubtotal, amount || 0));
    const percent = computedSubtotal > 0 ? round2((clampedAmount / computedSubtotal) * 100) : 0;
    setForm(prev => ({ ...prev, discount: percent, discountAmount: clampedAmount }));
  };

  const resetAll = () => {
    setTab('file');
    setUploading(false);
    setParsedPreview(null);
    setSelectedFile(null);
    setPhotoFile(null);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setOcrState('idle');
    setOcrProgress(0);
    setOcrConfidence(0);
    setOcrText('');
    setShowOcrText(false);
    setDetectedSummary(null);
    setForm(emptyForm());
    setSaving(false);
    setPreUploadedFileId(null);
    setPreUploadedFileHash(null);
    setDuplicateWarning(null);
    setIsUploadingFile(false);
  };

  const handleClose = () => { resetAll(); onClose(); };

  const handleFileSelected = async (file: File) => {
    setSelectedFile(file);
    try {
      setUploading(true);
      const parsed = await parseReceivedInvoice(file);
      setParsedPreview(parsed);
      toast.success('Facture analysée avec succès');
    } catch (e: any) {
      toast.error('Impossible de lire la facture : ' + e.message);
      setSelectedFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleValidateFile = async () => {
    // ✅ CORRECTION : Vérification complète de l'équipe
    if (!parsedPreview || !selectedFile || !user?.$id || !customTeamId || !appwriteTeamId) {
      toast.error('Session expirée ou équipe non résolue');
      return;
    }
    
    setUploading(true);
    try {
      let pdfFileId = '';
      let fileHash = '';

      try {
        fileHash = await computeSHA256(selectedFile);
        const existingDocs = await databases.listDocuments(
          DATABASE_ID, 'received_invoices',
          [Query.equal('teamId', customTeamId), Query.equal('fileHash', fileHash), Query.limit(1)]
        );
        if (existingDocs.documents.length > 0) {
          const dup = existingDocs.documents[0] as any;
          toast.warning('⚠️ Doublon détecté', {
            description: `Cette facture existe déjà : ${dup.invoiceNumber} du ${new Date(dup.issueDate).toLocaleDateString('fr-FR')}`,
            duration: 8000,
          });
        }
        // ✅ CORRECTION : Permissions fichier compatibles avec le bucket
        const uploaded = await storage.createFile(
          BUCKET_ID,
          ID.unique(),
          selectedFile,
          getFileStoragePermissions(appwriteTeamId)
        );
        pdfFileId = uploaded.$id;
      } catch (e: any) {
        console.warn('⚠️ Stockage échoué (non bloquant):', e.message);
      }

      const typeCode = parsedPreview.xmlContent?.includes('<ram:TypeCode>381</ram:TypeCode>') ? '381' : '380';
      const isElectronic = ['factur-x', 'cii', 'ubl'].includes((parsedPreview.format || '').toLowerCase());

      const doc = await databases.createDocument(
        DATABASE_ID, 
        'received_invoices', 
        ID.unique(), 
        {
          teamId: customTeamId, 
          userId: user.$id,
          invoiceNumber: parsedPreview.invoiceNumber,
          supplierName: parsedPreview.supplierName,
          supplierSiret: parsedPreview.supplierSiret || '',
          issueDate: parsedPreview.issueDate,
          dueDate: parsedPreview.dueDate || '',
          subtotal: parsedPreview.subtotal,
          tax: parsedPreview.tax,
          total: parsedPreview.total,
          currencyCode: parsedPreview.currencyCode,
          status: 'validated',
          format: parsedPreview.format,
          xmlContent: parsedPreview.xmlContent || '',
          pdfFileId, 
          originalFileId: pdfFileId,
          fileHash,
          source: 'manual_upload',
          ocrConfidence: null,
          isElectronic,
          einvoiceStatus: isElectronic ? 'received' : null,
          extractedAt: new Date().toISOString(),
          validatedBy: user.$id,
          validatedAt: new Date().toISOString(),
          type: typeCode,
          paidAmount: 0,
          payments: JSON.stringify([]),
        }, 
        getTeamPermissions(appwriteTeamId)
      );

      if (pdfFileId && selectedFile) {
        await createJustificationRecord({
          invoiceId: doc.$id,
          invoiceNumber: parsedPreview.invoiceNumber,
          fileId: pdfFileId,
          bucketId: BUCKET_ID,
          fileName: selectedFile.name,
          fileType: selectedFile.type || 'application/pdf',
          fileSize: selectedFile.size,
          fileHash: fileHash,
          amount: parsedPreview.total,
          userId: user.$id,
          teamId: customTeamId,
          appwriteTeamId: appwriteTeamId,
        });
      }

      toast.success(`${typeCode === '381' ? '⚡ E-Avoir' : '📄 E-Facture'} ${parsedPreview.invoiceNumber} enregistrée`, {
        description: `${parsedPreview.supplierName} • ${fm(parsedPreview.total)} • Justificatif à valider`,
      });

      const importResult: ImportResult = {
        invoiceId: doc.$id,
        invoiceNumber: parsedPreview.invoiceNumber,
        fileId: pdfFileId || undefined,
        bucketId: BUCKET_ID,
        fileName: selectedFile.name,
        fileType: selectedFile.type || 'application/pdf',
        fileSize: selectedFile.size,
        fileHash,
        amount: parsedPreview.total,
        supplierName: parsedPreview.supplierName,
        issueDate: parsedPreview.issueDate,
        source: 'manual_upload',
      };

      resetAll();
      onSuccess(importResult);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoSelected = async (file: File) => {
    setPhotoFile(file);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setOcrState('idle');
    setForm(emptyForm());
    setDetectedSummary(null);
    setDuplicateWarning(null);
    setPreUploadedFileId(null);
    setPreUploadedFileHash(null);

    if (!user?.$id || !customTeamId) {
      toast.error('Session expirée');
      return;
    }

    setIsUploadingFile(true);
    try {
      const fileHash = await computeSHA256(file);
      const existingDocs = await databases.listDocuments(
        DATABASE_ID, 'received_invoices',
        [Query.equal('teamId', customTeamId), Query.equal('fileHash', fileHash), Query.limit(1)]
      );

      if (existingDocs.documents.length > 0) {
        const existing = existingDocs.documents[0] as any;
        setDuplicateWarning({
          invoiceId: existing.$id,
          invoiceNumber: existing.invoiceNumber,
          issueDate: existing.issueDate,
        });
        toast.warning('Doublon potentiel détecté', {
          description: `Facture ${existing.invoiceNumber} déjà enregistrée`,
          duration: 8000,
        });
      }

      // ✅ CORRECTION : Permissions fichier compatibles avec le bucket
      const uploaded = await storage.createFile(
        BUCKET_ID, ID.unique(), file,
        getFileStoragePermissions(appwriteTeamId)
      );

      setPreUploadedFileId(uploaded.$id);
      setPreUploadedFileHash(fileHash);
    } catch (e: any) {
      console.error('❌ Erreur upload immédiat:', e);
      toast.error('Erreur upload du fichier', { description: e.message, duration: 6000 });
    } finally {
      setIsUploadingFile(false);
    }
  };

  const runOcr = async () => {
    if (!photoFile) return;
    setOcrState('running');
    setOcrProgress(0);
    try {
      const { data } = await Tesseract.recognize(photoFile, 'fra', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') setOcrProgress(m.progress || 0);
        },
      });
      const conf = (data.confidence || 0) / 100;
      const extracted = extractFromOcr(data.text || '');

      setForm(prev => {
        const next: SupplierForm = {
          ...prev,
          supplierName: extracted.supplierName || prev.supplierName,
          supplierSiret: extracted.supplierSiret || prev.supplierSiret,
          supplierSiren: extracted.supplierSiren || prev.supplierSiren,
          supplierVatNumber: extracted.supplierVatNumber || prev.supplierVatNumber,
          supplierEmail: extracted.supplierEmail || prev.supplierEmail,
          supplierPhone: extracted.supplierPhone || prev.supplierPhone,
          supplierAddress: extracted.supplierAddress || prev.supplierAddress,
          supplierPostalCode: extracted.supplierPostalCode || prev.supplierPostalCode,
          supplierCity: extracted.supplierCity || prev.supplierCity,
          supplierCountry: extracted.supplierCountry || prev.supplierCountry,
          invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
          issueDate: extracted.issueDate || prev.issueDate,
          dueDate: extracted.dueDate || prev.dueDate,
          subtotal: extracted.subtotal || prev.subtotal,
          tax: extracted.tax || prev.tax,
          total: extracted.total || prev.total,
          iban: extracted.iban || prev.iban,
        };
        if (extracted.items && extracted.items.length > 0) next.items = extracted.items;
        return next;
      });

      setDetectedSummary({
        phones: extracted.detectedPhones || [],
        addresses: extracted.detectedAddresses || [],
        emails: extracted.detectedEmails || [],
        ibans: extracted.detectedIbans || [],
        lines: extracted.detectedLines || [],
      });

      setOcrConfidence(conf);
      setOcrText(data.text || '');
      setOcrState('done');

      const linesCount = (extracted.detectedLines || []).length;
      const phonesCount = (extracted.detectedPhones || []).length;
      const addrsCount = (extracted.detectedAddresses || []).length;
      const detectedCountry = extracted.detectedCountry;
      const countryDesc = detectedCountry
        ? `${getCountryConfig(detectedCountry)?.flag || ''} ${getCountryConfig(detectedCountry)?.name || detectedCountry}`
        : '';

      toast.success('📷 OCR terminé — champs pré-remplis', {
        description: `${linesCount} ligne(s) • ${phonesCount} tél. • ${addrsCount} adresse(s) • ${(conf * 100).toFixed(0)}% confiance${countryDesc ? ` • ${countryDesc}` : ''}`,
        duration: 6000,
      });
    } catch (e: any) {
      setOcrState('error');
      toast.error('OCR échoué', { description: `${e.message} — Saisissez manuellement`, duration: 6000 });
    }
  };

  const handleItemChange = (idx: number, field: keyof InvoiceItem, val: any) => {
    setForm(prev => {
      const n = [...prev.items];
      const updated = { ...n[idx], [field]: val };
      if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
        updated.total = round2(updated.quantity * updated.unitPrice * (1 - (updated.discount || 0) / 100));
      }
      n[idx] = updated;
      return { ...prev, items: n };
    });
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, {
        id: Date.now().toString(), reference: '', description: '', quantity: 1,
        unit: 'Forfait', unitPrice: 0, tvaRate: 20, total: 0, discount: 0,
      }],
    }));
  };

  const removeItem = (i: number) => {
    if (form.items.length === 1) {
      toast.warning('La facture doit contenir au moins une ligne');
      return;
    }
    setForm(prev => ({ ...prev, items: prev.items.filter((_, x) => x !== i) }));
  };

  const validate = (): string | null => {
    if (!form.supplierName.trim()) return 'Nom du fournisseur obligatoire';
    if (!form.invoiceNumber.trim()) return 'N° de facture obligatoire';
    if (!form.issueDate) return "Date d'émission obligatoire";
    const hasItems = form.items.some(i => i.description.trim());
    const hasManualTotal = parseFloat(form.total) > 0;
    if (!hasItems && !hasManualTotal) return 'Ajoutez au moins une ligne OU saisissez un montant TTC';
    if (form.items.some(i => i.quantity <= 0 || i.unitPrice < 0)) return 'Quantités et prix doivent être positifs';
    if (form.discount < 0 || form.discount > 100) return 'La remise globale doit être entre 0 et 100%';
    if (form.discountAmount < 0) return 'Le montant de remise ne peut pas être négatif';
    if (form.discountAmount > computedSubtotal) return `Le montant de remise ne peut pas dépasser le sous-total (${fm(computedSubtotal)})`;
    return null;
  };

  const handleSaveEntry = async (source: 'photo_ocr' | 'manual_entry') => {
    // ✅ CORRECTION : Vérification complète de l'équipe
    if (!user?.$id || !customTeamId || !appwriteTeamId) { 
      toast.error('Session expirée ou équipe non résolue'); 
      return; 
    }
    
    const err = validate();
    if (err) { toast.error(err); return; }

    const useLines = form.items.some(i => i.description.trim() && i.unitPrice > 0);
    const subtotal = useLines ? computedSubtotal : parseFloat(form.subtotal) || 0;
    const discountAmount = round2(subtotal * (form.discount || 0) / 100);
    const subtotalAfterDiscount = round2(subtotal - discountAmount);
    const tax = useLines ? computedTax : parseFloat(form.tax) || 0;
    const total = useLines ? computedTotal : parseFloat(form.total) || round2(subtotalAfterDiscount + tax);
    if (total <= 0) { toast.error('Total TTC obligatoire (> 0)'); return; }

    setSaving(true);
    try {
      let originalFileId = '';
      let fileHash = '';

      if (source === 'photo_ocr' && preUploadedFileId) {
        originalFileId = preUploadedFileId;
        fileHash = preUploadedFileHash || '';
      } else if (source === 'photo_ocr' && photoFile) {
        try {
          fileHash = await computeSHA256(photoFile);
          if (!preUploadedFileHash) {
            const existingDocs = await databases.listDocuments(
              DATABASE_ID, 'received_invoices',
              [Query.equal('teamId', customTeamId), Query.equal('fileHash', fileHash), Query.limit(1)]
            );
            if (existingDocs.documents.length > 0) {
              const dup = existingDocs.documents[0] as any;
              toast.warning('⚠️ Doublon détecté', {
                description: `Facture ${dup.invoiceNumber} déjà enregistrée`,
                duration: 8000,
              });
            }
          }
          // ✅ CORRECTION : Permissions fichier compatibles avec le bucket
          const uploaded = await storage.createFile(
            BUCKET_ID, ID.unique(), photoFile,
            getFileStoragePermissions(appwriteTeamId)
          );
          originalFileId = uploaded.$id;
        } catch (e: any) {
          console.warn('⚠️ Upload justificatif échoué (non bloquant):', e.message);
        }
      }

      const perms = getTeamPermissions(appwriteTeamId);

      const payload: any = {
        teamId: customTeamId, userId: user.$id,
        invoiceNumber: form.invoiceNumber.trim(),
        supplierName: form.supplierName.trim(),
        supplierSiret: form.supplierSiret.trim(),
        supplierEmail: form.supplierEmail.trim(),
        supplierType: form.supplierType,
        supplierSiren: form.supplierSiren.trim(),
        supplierVatNumber: form.supplierVatNumber.trim(),
        supplierPhone: form.supplierPhone.trim(),
        supplierAddress: form.supplierAddress.trim(),
        supplierPostalCode: form.supplierPostalCode.trim(),
        supplierCity: form.supplierCity.trim(),
        supplierCountry: form.supplierCountry,
        issueDate: form.issueDate,
        dueDate: form.dueDate || '',
        subtotal, tax, total,
        currencyCode: form.currencyCode || 'EUR',
        status: 'validated',
        format: source === 'photo_ocr' ? 'photo' : 'manual',
        source,
        ocrConfidence: source === 'photo_ocr' ? round2(ocrConfidence * 100) / 100 : null,
        originalFileId, pdfFileId: originalFileId,
        fileHash,
        isElectronic: false,
        einvoiceStatus: null,
        items: useLines ? JSON.stringify(computedItems) : '[]',
        paymentConditions: form.paymentConditions,
        paymentMethods: form.paymentMethods,
        extractedAt: new Date().toISOString(),
        validatedBy: user.$id,
        validatedAt: new Date().toISOString(),
        type: '380',
        paidAmount: 0,
        payments: JSON.stringify([]),
        notes: form.notes || '',
      };
      if (form.iban.trim()) payload.iban = form.iban.trim();

      const doc = await databases.createDocument(
        DATABASE_ID, 
        'received_invoices', 
        ID.unique(), 
        payload, 
        perms
      );

      if (originalFileId && photoFile) {
        await createJustificationRecord({
          invoiceId: doc.$id,
          invoiceNumber: form.invoiceNumber.trim(),
          fileId: originalFileId,
          bucketId: BUCKET_ID,
          fileName: photoFile.name,
          fileType: photoFile.type || 'image/jpeg',
          fileSize: photoFile.size,
          fileHash: fileHash,
          amount: total,
          userId: user.$id,
          teamId: customTeamId,
          appwriteTeamId: appwriteTeamId,
        });
      }

      toast.success(`Facture ${form.invoiceNumber} enregistrée`, {
        description: `${form.supplierName} • ${fm(total)} • ${source === 'photo_ocr' ? '📷 OCR • Justificatif à valider' : '⌨️ Manuel'}`,
      });

      const importResult: ImportResult = {
        invoiceId: doc.$id,
        invoiceNumber: form.invoiceNumber.trim(),
        fileId: originalFileId || undefined,
        bucketId: BUCKET_ID,
        fileName: photoFile?.name || `facture-${form.invoiceNumber.trim()}`,
        fileType: photoFile?.type || 'application/pdf',
        fileSize: photoFile?.size || 0,
        fileHash,
        amount: total,
        supplierName: form.supplierName.trim(),
        issueDate: form.issueDate,
        source,
        supplierCountry: form.supplierCountry,
        supplierRegistrationId: form.supplierSiret.trim(),
        supplierVatNumber: form.supplierVatNumber.trim(),
      };

      resetAll();
      onSuccess(importResult);
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { key: 'file' as const, icon: Upload, label: 'Fichier' },
    { key: 'photo' as const, icon: Camera, label: 'Photo OCR' },
    { key: 'manual' as const, icon: Keyboard, label: 'Manuel' },
    { key: 'email' as const, icon: Mail, label: 'Email' },
  ];

  const inputCls = 'w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none';
  const labelCls = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';
  const isEntreprise = form.supplierType === 'entreprise';
  const siretValid = !form.supplierSiret || (form.supplierCountry === 'FR' ? validateSIRET(form.supplierSiret) : true);
  const sirenValid = !form.supplierSiren || (form.supplierCountry === 'FR' ? validateSIREN(form.supplierSiren) : true);
  const vatValid = !form.supplierVatNumber || (form.supplierCountry === 'FR' ? validateVatFR(form.supplierVatNumber) : true);

  const secondaryIdentifier = selectedCountryConfig.identifiers?.[1];
  const hasSecondaryId = !!secondaryIdentifier;
  const vatLabel = selectedCountryConfig.vat?.label || 'TVA';
  const vatEnabled = selectedCountryConfig.vat?.enabled ?? true;
  const idExample = selectedCountryConfig.identifiers?.[0]?.example || '';
  const secondaryIdExample = secondaryIdentifier?.example || '';

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Importer une facture fournisseur"
      icon={<Upload className="text-emerald-600" size={20} />}
      maxWidth="sm:max-w-5xl"
    >
      <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2">
          <Info size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-0.5">📋 Workflow de validation :</p>
            <p>1. 📤 Importez la facture (contrôles techniques automatiques)</p>
            <p>2. 👁️ Le justificatif sera marqué <strong>"À valider"</strong></p>
            <p>3. ✅ Validez-le depuis la liste des factures après vérification humaine</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg sticky top-0 z-10">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                tab === t.key
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}>
              <t.icon size={14} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <div className="space-y-4">
            {!parsedPreview ? (
              <div
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-emerald-500 transition-colors cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelected(f); }}
              >
                <input type="file" accept=".pdf,.xml" className="hidden" id="file-upload"
                  onChange={e => e.target.files?.[0] && handleFileSelected(e.target.files[0])} />
                <label htmlFor="file-upload" className="cursor-pointer block">
                  <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {uploading ? 'Analyse en cours...' : 'Glissez ou cliquez pour importer'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF Factur-X ou XML (CII, UBL) — extraction native 100%</p>
                </label>
              </div>
            ) : (
              <>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 space-y-1 text-sm">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase mb-1 flex items-center gap-1">
                    <CheckCircle2 size={14} /> Extraction réussie
                  </p>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Type :</span><span className="font-semibold">{parsedPreview.xmlContent?.includes('<ram:TypeCode>381</ram:TypeCode>') ? '⚡ E-Avoir (381)' : '📄 E-Facture (380)'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">N° :</span><span className="font-mono font-bold">{parsedPreview.invoiceNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Fournisseur :</span><span className="font-semibold">{parsedPreview.supplierName}</span></div>
                  <div className="flex justify-between pt-2 border-t border-emerald-200 dark:border-emerald-800"><span className="font-semibold text-slate-600 dark:text-slate-400">Total TTC :</span><span className="font-bold text-emerald-700 dark:text-emerald-300">{fm(parsedPreview.total)}</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setParsedPreview(null); setSelectedFile(null); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40">
                    <FileX size={16} /> Rejeter
                  </button>
                  <button onClick={handleValidateFile} disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                    {uploading ? 'Enregistrement...' : <><FileCheck size={16} /> Valider et enregistrer</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'photo' && (
          <div className="space-y-4">
            {!photoFile ? (
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
                <input type="file" accept="image/*" capture="environment" className="hidden" id="photo-capture"
                  onChange={e => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])} />
                <input type="file" accept="image/*" className="hidden" id="photo-pick"
                  onChange={e => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])} />
                <Camera size={32} className="mx-auto text-slate-400 mb-3" />
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <label htmlFor="photo-capture" className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700">
                    <Camera size={16} /> Prendre une photo
                  </label>
                  <label htmlFor="photo-pick" className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600">
                    <Upload size={16} /> Choisir une image
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-3">💡 Photo nette, bien éclairée, facture à plat → meilleure reconnaissance</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <img src={photoUrl} alt="Aperçu" className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{photoFile.name}</p>
                    <p className="text-xs text-slate-500">{(photoFile.size / 1024).toFixed(0)} Ko</p>
                    {preUploadedFileId ? (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                        <CheckCircle2 size={10} /> Justificatif archivé (à valider)
                      </p>
                    ) : isUploadingFile ? (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                        <span className="animate-spin h-3 w-3 border border-blue-600 border-t-transparent rounded-full"></span>
                        Archivage en cours...
                      </p>
                    ) : null}
                  </div>
                  <button onClick={() => { setPhotoFile(null); if (photoUrl) URL.revokeObjectURL(photoUrl); setPhotoUrl(''); setOcrState('idle'); setDetectedSummary(null); setPreUploadedFileId(null); setPreUploadedFileHash(null); setDuplicateWarning(null); }}
                    className="text-xs text-slate-500 hover:text-rose-600">Changer</button>
                </div>

                {duplicateWarning && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">⚠️ Doublon potentiel détecté</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        Cette facture existe déjà : <strong>{duplicateWarning.invoiceNumber}</strong> du{' '}
                        {new Date(duplicateWarning.issueDate).toLocaleDateString('fr-FR')}. Vérifiez avant de continuer.
                      </p>
                    </div>
                  </div>
                )}

                {ocrState !== 'done' && (
                  <button onClick={runOcr} disabled={ocrState === 'running' || isUploadingFile}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                    {ocrState === 'running' ? (
                      <>⏳ Analyse OCR... {(ocrProgress * 100).toFixed(0)}%</>
                    ) : isUploadingFile ? (
                      <>⏳ Archivage du justificatif...</>
                    ) : (
                      <><Sparkles size={16} /> Lancer la reconnaissance (OCR)</>
                    )}
                  </button>
                )}
                {ocrState === 'running' && (
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${ocrProgress * 100}%` }} />
                  </div>
                )}

                {(ocrState === 'done' || ocrState === 'error') && (
                  <>
                    {ocrState === 'error' && (
                      <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                        <span>OCR impossible (connexion requise au 1er usage). Saisissez manuellement ci-dessous.</span>
                      </div>
                    )}

                    {ocrState === 'done' && detectedSummary && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-1">
                            <Sparkles size={14} /> Éléments détectés — confiance {(ocrConfidence * 100).toFixed(0)}%
                          </span>
                          <button onClick={() => setShowOcrText(!showOcrText)} className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            {showOcrText ? <EyeOff size={12} /> : <Eye size={12} />} Texte brut
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-[10px] text-slate-500 uppercase">Lignes</p>
                            <p className={`text-lg font-bold ${detectedSummary.lines.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{detectedSummary.lines.length}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-[10px] text-slate-500 uppercase">Téléphones</p>
                            <p className={`text-lg font-bold ${detectedSummary.phones.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{detectedSummary.phones.length}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-[10px] text-slate-500 uppercase">Adresses</p>
                            <p className={`text-lg font-bold ${detectedSummary.addresses.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{detectedSummary.addresses.length}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-[10px] text-slate-500 uppercase">Emails</p>
                            <p className={`text-lg font-bold ${detectedSummary.emails.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{detectedSummary.emails.length}</p>
                          </div>
                        </div>

                        {detectedSummary.phones.length > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">📞 Téléphones :</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {detectedSummary.phones.map((p, i) => (
                                <button key={i} onClick={() => setForm(f => ({ ...f, supplierPhone: p }))}
                                  className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-xs font-mono hover:bg-emerald-200 dark:hover:bg-emerald-900/60">
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {detectedSummary.addresses.length > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">📍 Adresses :</span>
                            <div className="space-y-1 mt-1">
                              {detectedSummary.addresses.map((a, i) => (
                                <button key={i}
                                  onClick={() => setForm(f => ({ ...f, supplierAddress: a.street, supplierPostalCode: a.postalCode, supplierCity: a.city }))}
                                  className="w-full text-left px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-xs hover:bg-emerald-200 dark:hover:bg-emerald-900/60">
                                  {a.full}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {detectedSummary.emails.length > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">✉️ Emails :</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {detectedSummary.emails.map((e, i) => (
                                <button key={i} onClick={() => setForm(f => ({ ...f, supplierEmail: e }))}
                                  className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-xs font-mono hover:bg-emerald-200 dark:hover:bg-emerald-900/60">
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {detectedSummary.ibans.length > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">🏦 IBAN :</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {detectedSummary.ibans.map((iban, i) => (
                                <button key={i} onClick={() => setForm(f => ({ ...f, iban }))}
                                  className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-xs font-mono hover:bg-emerald-200 dark:hover:bg-emerald-900/60">
                                  {iban}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {detectedSummary.lines.length > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">📦 Lignes détectées ({detectedSummary.lines.length}) :</span>
                            <div className="mt-1 max-h-24 overflow-y-auto border border-emerald-200 dark:border-emerald-800 rounded">
                              {detectedSummary.lines.map((l, i) => (
                                <div key={i} className="flex justify-between text-[11px] px-2 py-1 border-b border-emerald-100 dark:border-emerald-900 last:border-0">
                                  <span className="truncate flex-1">{l.quantity}× {l.description}</span>
                                  <span className="font-mono font-semibold ml-2">{fm(l.total)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {showOcrText && (
                      <pre className="text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-slate-600 dark:text-slate-300">{ocrText}</pre>
                    )}

                    <EnhancedForm
                      form={form} setForm={setForm}
                      inputCls={inputCls} labelCls={labelCls}
                      isEntreprise={isEntreprise}
                      siretValid={siretValid} sirenValid={sirenValid} vatValid={vatValid}
                      computedItems={computedItems} computedSubtotal={computedSubtotal}
                      computedTax={computedTax} computedTotal={computedTotal}
                      computedDiscountAmount={computedDiscountAmount}
                      taxBreakdown={taxBreakdown}
                      onItemChange={handleItemChange} onAddItem={addItem} onRemoveItem={removeItem}
                      fm={fm}
                      countryConfig={selectedCountryConfig}
                      idLabel={selectedIdLabel}
                      handleDiscountPercentChange={handleDiscountPercentChange}
                      handleDiscountAmountChange={handleDiscountAmountChange}
                      currencySymbol={currencySymbol}
                      vatLabel={vatLabel}
                      vatEnabled={vatEnabled}
                      hasSecondaryId={hasSecondaryId}
                      secondaryIdentifier={secondaryIdentifier}
                      idExample={idExample}
                      secondaryIdExample={secondaryIdExample}
                    />
                    <button onClick={() => handleSaveEntry('photo_ocr')} disabled={saving}
                      className="w-full px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                      {saving ? 'Enregistrement...' : '✅ Vérifier et enregistrer'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div className="space-y-4">
            <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3 text-xs text-sky-800 dark:text-sky-200">
              ⌨️ Saisie manuelle enrichie : informations complètes, lignes détaillées, identifiants au format libre (FR ou étranger).
            </div>
            <EnhancedForm
              form={form} setForm={setForm}
              inputCls={inputCls} labelCls={labelCls}
              isEntreprise={isEntreprise}
              siretValid={siretValid} sirenValid={sirenValid} vatValid={vatValid}
              computedItems={computedItems} computedSubtotal={computedSubtotal}
              computedTax={computedTax} computedTotal={computedTotal}
              computedDiscountAmount={computedDiscountAmount}
              taxBreakdown={taxBreakdown}
              onItemChange={handleItemChange} onAddItem={addItem} onRemoveItem={removeItem}
              fm={fm}
              countryConfig={selectedCountryConfig}
              idLabel={selectedIdLabel}
              handleDiscountPercentChange={handleDiscountPercentChange}
              handleDiscountAmountChange={handleDiscountAmountChange}
              currencySymbol={currencySymbol}
              vatLabel={vatLabel}
              vatEnabled={vatEnabled}
              hasSecondaryId={hasSecondaryId}
              secondaryIdentifier={secondaryIdentifier}
              idExample={idExample}
              secondaryIdExample={secondaryIdExample}
            />
            <button onClick={() => handleSaveEntry('manual_entry')} disabled={saving}
              className="w-full px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Enregistrement...' : '✅ Enregistrer la facture'}
            </button>
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
              <Mail size={28} className="mx-auto text-amber-600 mb-2" />
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Réception par email — Phase 2</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">Bientôt, chaque équipe aura une adresse dédiée :</p>
              <code className="inline-block mt-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200">
                factures-{(customTeamId || 'equipe').slice(-6)}@relancepro.fr
              </code>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              En attendant, utilisez 📤 Fichier (PDF Factur-X) ou 📷 Photo OCR.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================================================
// 📝 FORMULAIRE ENRICHI
// ============================================================
function EnhancedForm({
  form, setForm, inputCls, labelCls,
  isEntreprise, siretValid, sirenValid, vatValid,
  computedItems, computedSubtotal, computedTax, computedTotal, computedDiscountAmount,
  taxBreakdown,
  onItemChange, onAddItem, onRemoveItem, fm,
  countryConfig, idLabel,
  handleDiscountPercentChange, handleDiscountAmountChange, currencySymbol,
  vatLabel, vatEnabled, hasSecondaryId, secondaryIdentifier, idExample, secondaryIdExample,
}: {
  form: SupplierForm;
  setForm: React.Dispatch<React.SetStateAction<SupplierForm>>;
  inputCls: string; labelCls: string;
  isEntreprise: boolean;
  siretValid: boolean; sirenValid: boolean; vatValid: boolean;
  computedItems: InvoiceItem[];
  computedSubtotal: number; computedTax: number; computedTotal: number;
  computedDiscountAmount: number;
  taxBreakdown: { rate: number; baseHT: number; taxAmount: number }[];
  onItemChange: (idx: number, field: keyof InvoiceItem, val: any) => void;
  onAddItem: () => void; onRemoveItem: (i: number) => void;
  fm: (n: number) => string;
  countryConfig: CountryConfig;
  idLabel: string;
  handleDiscountPercentChange: (percent: number) => void;
  handleDiscountAmountChange: (amount: number) => void;
  currencySymbol: string;
  vatLabel: string;
  vatEnabled: boolean;
  hasSecondaryId: boolean;
  secondaryIdentifier: any;
  idExample: string;
  secondaryIdExample: string;
}) {
  const hasDetailedItems = form.items.some(i => i.description.trim() && i.unitPrice > 0);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Building2 size={14} className="text-emerald-600" /> Fournisseur
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Nom du fournisseur *</label>
            <input className={inputCls} value={form.supplierName} placeholder="Ex: EDF, Orange..."
              onChange={e => setForm({ ...form, supplierName: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>N° de facture *</label>
            <input className={inputCls} value={form.invoiceNumber} placeholder="F-2026-001"
              onChange={e => setForm({ ...form, invoiceNumber: e.target.value })} />
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <label className={labelCls}>Type de fournisseur</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm({ ...form, supplierType: 'entreprise', supplierSiret: '', supplierSiren: '' })}
              className={`p-2.5 border rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                form.supplierType === 'entreprise'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
              <Building2 size={16} /> Entreprise (B2B)
            </button>
            <button type="button" onClick={() => setForm({ ...form, supplierType: 'particulier' })}
              className={`p-2.5 border rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                form.supplierType === 'particulier'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
              <User size={16} /> Particulier (B2C)
            </button>
          </div>
        </div>

        {isEntreprise && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200 flex items-center gap-2">
              <Landmark size={12} className="text-blue-600 dark:text-blue-400" />
              Identification fiscale ({countryConfig.flag} {countryConfig.name})
              <span className="ml-auto text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-full font-bold">
                {form.supplierCountry === 'FR' ? 'FORMAT STRUCTURÉ' : 'FORMAT LIBRE'}
              </span>
            </h4>

            <div className="bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-lg p-2.5 flex items-start gap-2">
              <Shield size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800 dark:text-blue-200">
                {form.supplierCountry === 'FR' ? (
                  <>
                    <strong>Fournisseur français :</strong> SIRET et N° TVA facilitent le rapprochement e-facturation 2026.
                    <strong> Fournisseur étranger :</strong> saisissez son identifiant local dans le même champ.
                  </>
                ) : (
                  <>
                    <strong>Fournisseur {countryConfig.name} :</strong> saisissez l'identifiant fiscal local ({idLabel}).
                    {!vatEnabled && <> Ce pays n'applique pas de TVA.</>}
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{idLabel}</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={form.supplierSiret}
                  placeholder={form.supplierCountry === 'FR' ? 'FR : 14 chiffres' : (idExample || 'Identifiant fiscal')}
                  onChange={e => setForm({ ...form, supplierSiret: e.target.value })}
                />
                {form.supplierSiret && form.supplierCountry === 'FR' && siretValid && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">✓ Format français valide</p>
                )}
                {form.supplierSiret && form.supplierCountry === 'FR' && !siretValid && (
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">⚠️ Format SIRET invalide</p>
                )}
                {form.supplierSiret && form.supplierCountry !== 'FR' && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {countryConfig.name} — format libre accepté
                  </p>
                )}
              </div>

              {hasSecondaryId ? (
                <div>
                  <label className={labelCls}>{secondaryIdentifier.shortLabel}</label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={form.supplierSiren}
                    placeholder={form.supplierCountry === 'FR' ? 'FR : 9 chiffres' : (secondaryIdExample || 'Identifiant société')}
                    onChange={e => setForm({ ...form, supplierSiren: e.target.value })}
                  />
                  {form.supplierSiren && form.supplierCountry === 'FR' && sirenValid && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">✓ Format français valide</p>
                  )}
                  {form.supplierSiren && form.supplierCountry === 'FR' && !sirenValid && (
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">⚠️ Format SIREN invalide</p>
                  )}
                  {form.supplierSiren && form.supplierCountry !== 'FR' && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {countryConfig.name} — format libre accepté
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Identifiant société <span className="text-slate-400 text-[10px]">(optionnel)</span></label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={form.supplierSiren}
                    placeholder="Identifiant société local (optionnel)"
                    onChange={e => setForm({ ...form, supplierSiren: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {countryConfig.name} — non obligatoire
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>
                {vatLabel} / Identification fiscale
                {!vatEnabled && <span className="text-[10px] text-slate-400 ml-1">(non applicable)</span>}
              </label>
              <input
                className={`${inputCls} font-mono`}
                value={form.supplierVatNumber}
                placeholder={
                  countryConfig.vat?.prefix 
                    ? `Ex: ${countryConfig.vat.prefix}123456789` 
                    : (vatEnabled ? 'Numéro fiscal local' : 'Non applicable')
                }
                disabled={!vatEnabled}
                onChange={e => setForm({ ...form, supplierVatNumber: e.target.value })}
              />
              {form.supplierVatNumber && form.supplierCountry === 'FR' && vatValid && (
                <p className="text-[10px] text-emerald-600 mt-0.5">✓ Format français valide</p>
              )}
              {form.supplierVatNumber && form.supplierCountry === 'FR' && !vatValid && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">⚠️ Format TVA FR invalide</p>
              )}
              {form.supplierVatNumber && form.supplierCountry !== 'FR' && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {countryConfig.name} — format local accepté
                </p>
              )}
              {!vatEnabled && (
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                  ℹ️ {countryConfig.name} n'applique pas de {vatLabel}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <MapPin size={12} className="text-emerald-600 dark:text-emerald-400" />
            Contact & Adresse
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="email" className={inputCls} value={form.supplierEmail} placeholder="contact@fournisseur.fr"
              onChange={e => setForm({ ...form, supplierEmail: e.target.value })} />
            <input type="tel" className={inputCls} value={form.supplierPhone} placeholder="+33 1 23 45 67 89"
              onChange={e => setForm({ ...form, supplierPhone: e.target.value })} />
          </div>
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input className={`${inputCls} pl-9`} value={form.supplierAddress} placeholder="123 rue de la Paix"
              onChange={e => setForm({ ...form, supplierAddress: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input className={`${inputCls} pl-9 font-mono`} value={form.supplierPostalCode}
                placeholder={getPostalCodeExample(form.supplierCountry)}
                onChange={e => setForm({
                  ...form,
                  supplierPostalCode: form.supplierCountry === 'FR'
                    ? e.target.value.replace(/\D/g, '').slice(0, 5)
                    : e.target.value.slice(0, 15),
                })} />
            </div>
            <input className={inputCls} value={form.supplierCity} placeholder="Ville"
              onChange={e => setForm({ ...form, supplierCity: e.target.value })} />
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select className={`${inputCls} pl-9`} value={form.supplierCountry}
                onChange={e => setForm({ ...form, supplierCountry: e.target.value })}>
                <option value="FR">🇫🇷 France</option>
                <option value="BE">🇧🇪 Belgique</option>
                <option value="CH">🇨🇭 Suisse</option>
                <option value="LU">🇱🇺 Luxembourg</option>
                <option value="DE">🇩🇪 Allemagne</option>
                <option value="ES">🇪🇸 Espagne</option>
                <option value="IT">🇮🇹 Italie</option>
                <option value="GB">🇬🇧 Royaume-Uni</option>
                <option value="PT">🇵🇹 Portugal</option>
                <option value="NL">🇳🇱 Pays-Bas</option>
                <option value="AT">🇦🇹 Autriche</option>
                <option value="IE">🇮🇪 Irlande</option>
                <option value="CA">🇨🇦 Canada</option>
                <option value="US">🇺🇸 États-Unis</option>
                <optgroup label="Afrique">
                  <option value="BJ">🇧🇯 Bénin</option>
                  <option value="SN">🇸🇳 Sénégal</option>
                  <option value="CI">🇨🇮 Côte d'Ivoire</option>
                  <option value="MA">🇲🇦 Maroc</option>
                  <option value="TN">🇹🇳 Tunisie</option>
                  <option value="DZ">🇩🇿 Algérie</option>
                  <option value="CM">🇨🇲 Cameroun</option>
                  <option value="GA">🇬🇦 Gabon</option>
                  <option value="CG">🇨🇬 Congo</option>
                  <option value="MG">🇲🇬 Madagascar</option>
                  <option value="ML">🇲🇱 Mali</option>
                  <option value="BF">🇧🇫 Burkina Faso</option>
                  <option value="NE">🇳🇪 Niger</option>
                  <option value="TG">🇹🇬 Togo</option>
                  <option value="MU">🇲🇺 Île Maurice</option>
                </optgroup>
                <optgroup label="Autres">
                  <option value="OTHER">🌍 Autre</option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date d'émission *</label>
            <input type="date" className={inputCls} value={form.issueDate}
              onChange={e => setForm({ ...form, issueDate: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Échéance</label>
            <input type="date" className={inputCls} value={form.dueDate}
              onChange={e => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Package size={14} className="text-emerald-600" /> Lignes de facture ({form.items.length})
          </h3>
          <button type="button" onClick={onAddItem}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
            <Plus size={14} /> Ajouter
          </button>
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-20">Réf.</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400">Description</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-14">Qté</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-20">Unité</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-20">PU HT</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-14">Remise %</th>
                <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-16">TVA %</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-20">Total HT</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {computedItems.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-2 py-1">
                    <input type="text" value={item.reference} onChange={e => onItemChange(idx, 'reference', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 text-xs p-1 text-slate-900 dark:text-white" placeholder="REF" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="text" value={item.description} onChange={e => onItemChange(idx, 'description', e.target.value)}
                      className="w-full bg-transparent border-none focus:ring-0 text-xs p-1 font-medium text-slate-900 dark:text-white" placeholder="Description" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" step="0.01" value={item.quantity}
                      onChange={e => onItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded text-xs p-1" />
                  </td>
                  <td className="px-2 py-1">
                    <select value={item.unit} onChange={e => onItemChange(idx, 'unit', e.target.value)}
                      className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded text-xs p-1">
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" step="0.01" value={item.unitPrice}
                      onChange={e => onItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full text-right bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded text-xs p-1" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" max="100" step="0.01" value={item.discount || 0}
                      onChange={e => onItemChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                      className="w-full text-center border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-white rounded text-xs p-1 font-semibold" />
                  </td>
                  <td className="px-2 py-1">
                    <select value={item.tvaRate} onChange={e => onItemChange(idx, 'tvaRate', parseFloat(e.target.value))}
                      className="w-full text-center bg-transparent border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded text-xs p-1">
                      {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right font-semibold text-slate-900 dark:text-white text-xs">
                    {item.total.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button onClick={() => onRemoveItem(idx)}
                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded">
                      <Minus size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <label className="block text-xs font-semibold text-amber-800 dark:text-amber-200 mb-3">
            💰 Remise globale
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-amber-700 dark:text-amber-300 mb-1">En pourcentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.discount || 0}
                onChange={e => handleDiscountPercentChange(parseFloat(e.target.value) || 0)}
                className="w-full border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-[10px] text-amber-700 dark:text-amber-300 mb-1">En montant ({currencySymbol})</label>
              <input
                type="number"
                min="0"
                max={computedSubtotal}
                step="0.01"
                value={form.discountAmount || 0}
                onChange={e => handleDiscountAmountChange(parseFloat(e.target.value) || 0)}
                className="w-full border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-700 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-2">
            💡 Les deux champs sont liés : modifier l'un met automatiquement à jour l'autre.
            Remise appliquée sur le total HT avant calcul de la TVA.
          </p>

          {computedDiscountAmount > 0 && (
            <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800 flex justify-between text-xs">
              <span className="text-amber-800 dark:text-amber-200 font-semibold">Montant de la remise :</span>
              <span className="font-bold text-amber-900 dark:text-amber-100">- {fm(computedDiscountAmount)}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-start gap-2">
          <Info size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            <strong>Deux modes :</strong> remplissez les lignes détaillées <em>OU</em> saisissez uniquement les montants totaux ci-dessous (TTC obligatoire).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <DollarSign size={14} className="text-emerald-600" /> Totaux {hasDetailedItems && <span className="text-[10px] font-normal text-emerald-600">(auto)</span>}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Total HT</label>
              <input type="number" step="0.01" className={inputCls}
                value={hasDetailedItems ? computedSubtotal.toFixed(2) : form.subtotal}
                onChange={e => setForm({ ...form, subtotal: e.target.value })}
                disabled={hasDetailedItems} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>TVA</label>
              <input type="number" step="0.01" className={inputCls}
                value={hasDetailedItems ? computedTax.toFixed(2) : form.tax}
                onChange={e => setForm({ ...form, tax: e.target.value })}
                disabled={hasDetailedItems} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Total TTC *</label>
              <input type="number" step="0.01" className={`${inputCls} font-bold`}
                value={hasDetailedItems ? computedTotal.toFixed(2) : form.total}
                onChange={e => setForm({ ...form, total: e.target.value })}
                disabled={hasDetailedItems} placeholder="0.00" />
            </div>
          </div>

          {hasDetailedItems && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Sous-total HT</span>
                <span className="font-semibold">{fm(computedSubtotal)}</span>
              </div>
              {(form.discount || 0) > 0 && (
                <div className="flex justify-between text-xs text-amber-700 dark:text-amber-300">
                  <span>Remise globale ({form.discount.toFixed(2)}% = {fm(computedDiscountAmount)})</span>
                  <span className="font-semibold">- {fm(computedDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-600 pt-1">
                <span>Total HT après remise</span>
                <span className="font-semibold">{fm(round2(computedSubtotal - computedDiscountAmount))}</span>
              </div>
              {taxBreakdown.map(b => (
                <div key={b.rate} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span>TVA {b.rate}% (base {fm(b.baseHT)})</span>
                  <span className="font-semibold">{fm(b.taxAmount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-500 pt-1">
                <span>Total TTC</span>
                <span>{fm(computedTotal)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Devise</label>
              <select className={inputCls} value={form.currencyCode}
                onChange={e => setForm({ ...form, currencyCode: e.target.value })}>
                <option value="EUR">🇪🇺 EUR (€)</option>
                <option value="USD">🇺🇸 USD ($)</option>
                <option value="GBP">🇬🇧 GBP (£)</option>
                <option value="CHF">🇨🇭 CHF</option>
                <option value="XOF">🌍 XOF (CFA)</option>
                <option value="XAF">🌍 XAF (CFA)</option>
                <option value="MAD">🇲🇦 MAD</option>
                <option value="TND">🇹🇳 TND</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                IBAN {form.supplierCountry !== 'FR' && form.supplierCountry !== 'BE' && form.supplierCountry !== 'LU' && form.supplierCountry !== 'CH' && <span className="text-[10px] text-slate-400">(si applicable)</span>}
              </label>
              <input className={`${inputCls} font-mono text-xs`} value={form.iban} 
                placeholder={form.supplierCountry === 'FR' ? 'FR76 1234 5678...' : (form.supplierCountry === 'BJ' ? 'Non utilisé au Bénin' : 'IBAN local')}
                onChange={e => setForm({ ...form, iban: e.target.value.toUpperCase() })} />
              {form.supplierCountry === 'BJ' && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  ℹ️ Le Bénin utilise le RIB / compte bancaire local, pas l'IBAN
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <FileText size={14} className="text-emerald-600" /> Conditions
          </h3>
          <div>
            <label className={labelCls}>Modalités de paiement</label>
            <select className={inputCls} value={form.paymentMethods}
              onChange={e => setForm({ ...form, paymentMethods: e.target.value })}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Conditions de règlement</label>
            <input className={inputCls} value={form.paymentConditions}
              onChange={e => setForm({ ...form, paymentConditions: e.target.value })}
              placeholder="Ex: Paiement à 30 jours" />
          </div>
          <div>
            <label className={labelCls}>Notes internes</label>
            <textarea rows={2} className={inputCls} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Commentaire interne, référence commande..." />
          </div>
        </div>
      </div>
    </div>
  );
}